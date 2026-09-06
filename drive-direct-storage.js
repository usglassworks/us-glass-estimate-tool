'use strict';
(function(){
  if(typeof window === 'undefined') return;

  async function readDb(createIfMissing){
    var rootId = await _driveFindItem(DRIVE_FOLDER_NAME, 'application/vnd.google-apps.folder', null);
    if(!rootId && createIfMissing) rootId = await _driveFindOrCreateFolder(DRIVE_FOLDER_NAME, null);
    if(!rootId) return null;

    var dataId = await _driveFindItem(DRIVE_SUBFOLDER_NAME, 'application/vnd.google-apps.folder', rootId);
    if(!dataId && createIfMissing) dataId = await _driveFindOrCreateFolder(DRIVE_SUBFOLDER_NAME, rootId);
    if(!dataId) return null;

    var fileId = await _driveFindItem(DRIVE_FILE_NAME, null, dataId);
    if(!fileId) return {fileId:null,dataId:dataId,db:null};

    var raw = await _driveReadContent(fileId);
    var db = raw ? JSON.parse(raw) : {};
    if(!db || typeof db !== 'object') db = {};
    if(!Array.isArray(db.projects)) db.projects = [];
    return {fileId:fileId,dataId:dataId,db:db};
  }

  function oldLocalProjects(){
    try {
      var p = JSON.parse(localStorage.getItem('usglass_projects') || '[]');
      return Array.isArray(p) ? p : [];
    } catch(e){ return []; }
  }

  async function ensureDb(){
    var state = await readDb(true);
    if(!state.db){
      state.db = {
        version:2,
        storageMode:'drive-direct',
        lastSyncedAt:new Date().toISOString(),
        projects:oldLocalProjects()
      };
      await writeDb(state);
    }
    return state;
  }

  async function writeDb(state){
    state.db.version = 2;
    state.db.storageMode = 'drive-direct';
    state.db.lastSyncedAt = new Date().toISOString();
    var content = JSON.stringify(state.db, null, 2);
    if(state.fileId) await _driveUpdateContent(state.fileId, content);
    else state.fileId = await _driveUploadNew(DRIVE_FILE_NAME, state.dataId, content);
    try {
      localStorage.setItem('usglass_last_drive_sync', state.db.lastSyncedAt);
      if(typeof updateDriveSyncLabel === 'function') updateDriveSyncLabel();
    } catch(e){}
  }

  function currentData(){
    calc();
    var name = (gv('pname') || {value:''}).value.trim() || '無題案件';
    return {
      name:name,
      data:{
        pname:name,
        settings:collectSettingsData(),
        quote:collectQuoteData(),
        rows:collectRowsData()
      }
    };
  }

  function setDriveLabels(){
    var saveBtn = gv('saveProjectBtn');
    var newBtn = gv('saveAsNewBtn');
    if(saveBtn) saveBtn.textContent = currentProjectId ? '☁ Driveへ上書き保存' : '☁ Driveへ案件保存';
    if(newBtn) newBtn.textContent = '☁ 別案件としてDrive保存';

    document.querySelectorAll('[onclick*="syncToGoogleDrive"],[onclick*="syncFromGoogleDrive"]').forEach(function(btn){
      btn.disabled = true;
      btn.style.opacity = '.55';
      btn.style.cursor = 'default';
      btn.title = '案件データは保存ボタンからGoogle Driveへ直接保存されます';
      if(/syncToGoogleDrive/.test(btn.getAttribute('onclick') || '')) btn.textContent = '☁ 案件は自動Drive保存';
      else btn.textContent = '☁ 案件はDriveから直接読込';
    });

    var bar = document.querySelector('.drive-sync-bar');
    if(bar && !document.getElementById('drive-direct-note')){
      var note = document.createElement('div');
      note.id = 'drive-direct-note';
      note.style.cssText = 'font-size:12px;font-weight:700;color:#1a5f8c;margin-top:6px';
      note.textContent = '☁ 案件保存先：Google Drive';
      bar.appendChild(note);
    }
  }

  var originalUpdateSaveButtonLabel = window.updateSaveButtonLabel;
  window.updateSaveButtonLabel = function(){
    try {
      if(typeof originalUpdateSaveButtonLabel === 'function') originalUpdateSaveButtonLabel();
    } catch(e){}
    setDriveLabels();
  };

  async function saveToDrive(forceNew){
    if(isSaving) return;
    isSaving = true;
    var btn = forceNew ? gv('saveAsNewBtn') : gv('saveProjectBtn');
    if(btn){ btn.disabled = true; btn.textContent = 'Drive保存中...'; }
    try {
      var cur = currentData();
      var state = await ensureDb();
      var projects = state.db.projects;
      var savedAt = _makeSavedAt();
      var updated = false;

      if(!forceNew && currentProjectId){
        var idx = projects.findIndex(function(p){ return p.id === currentProjectId; });
        if(idx >= 0){
          projects[idx] = {id:currentProjectId,name:cur.name,savedAt:savedAt,data:cur.data};
          updated = true;
        }
      }

      if(!updated){
        currentProjectId = 'case_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
        projects.unshift({id:currentProjectId,name:cur.name,savedAt:savedAt,data:cur.data});
      }

      await writeDb(state);
      alert((updated ? 'Driveへ上書き保存しました：' : 'Driveへ新規保存しました：') + cur.name);
    } catch(e){
      console.error(e);
      alert('Google Driveへの案件保存でエラーが発生しました：\n' + (e.message || e));
    } finally {
      isSaving = false;
      if(btn) btn.disabled = false;
      setDriveLabels();
    }
  }

  window.saveProjectData = function(){ return saveToDrive(false); };
  window.saveAsNewProject = function(){
    if(!confirm('現在の内容をGoogle Driveへ別案件として新規保存しますか？')) return;
    return saveToDrive(true);
  };

  window.showSavedProjects = async function(){
    var modal = gv('projectModal');
    var list = gv('projectList');
    if(!modal || !list) return;
    modal.style.display = 'block';
    list.innerHTML = '<p style="color:#666;padding:12px">Google Driveから案件一覧を読み込み中...</p>';
    try {
      var state = await ensureDb();
      var projects = state.db.projects || [];
      if(!projects.length){
        list.innerHTML = '<p style="color:#888;padding:12px">Google Driveに保存済み案件はありません。</p>';
        return;
      }
      var h = '<div style="font-size:11px;color:#3949ab;margin-bottom:10px">☁ Google Drive保存</div>';
      projects.forEach(function(p){
        h += '<div class="project-item"><div><div class="project-item-title">' + escH(p.name || '無題案件') + '</div>';
        h += '<div class="project-item-date">' + escH(p.savedAt || '') + '</div></div><div class="project-actions">';
        h += '<button type="button" class="btn-load" onclick="loadProjectData(\'' + escH(p.id) + '\')">呼び出し</button>';
        h += '<button type="button" class="btn-del-p" onclick="deleteProjectData(\'' + escH(p.id) + '\')">削除</button></div></div>';
      });
      list.innerHTML = h;
    } catch(e){
      list.innerHTML = '<p style="color:#c62828;padding:12px">Driveから取得できませんでした：' + escH(e.message || String(e)) + '</p>';
    }
  };

  window.loadProjectData = async function(id){
    if(!confirm('Google Driveのこの案件を呼び出しますか？現在の入力内容は上書きされます。')) return;
    try {
      var state = await ensureDb();
      var project = state.db.projects.find(function(p){ return p.id === id; });
      if(!project){ alert('Google Drive上に案件が見つかりません。'); return; }
      applyProjectData(project.data);
      currentProjectId = id;
      hideSavedProjects();
      setDriveLabels();
      alert('Google Driveから案件を呼び出しました：' + (project.name || '無題案件'));
    } catch(e){
      alert('Google Driveから案件を呼び出せませんでした：\n' + (e.message || e));
    }
  };

  window.deleteProjectData = async function(id){
    if(!confirm('Google Drive上のこの保存済み案件を削除しますか？')) return;
    try {
      var state = await ensureDb();
      state.db.projects = state.db.projects.filter(function(p){ return p.id !== id; });
      if(currentProjectId === id) currentProjectId = null;
      await writeDb(state);
      setDriveLabels();
      await window.showSavedProjects();
    } catch(e){
      alert('Google Drive上の案件を削除できませんでした：\n' + (e.message || e));
    }
  };

  window.syncToGoogleDrive = function(){
    alert('案件データは「Driveへ案件保存」からGoogle Driveへ直接保存されます。\n旧「Driveへ同期保存」は使用しません。');
  };
  window.syncFromGoogleDrive = function(){
    alert('案件データは「保存案件を呼び出す」からGoogle Driveを直接読み込みます。\n旧「Driveから復元」は使用しません。');
  };

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setDriveLabels);
  else setDriveLabels();
  setTimeout(setDriveLabels, 500);

  console.info('US GLASS: Drive direct project storage loaded');
})();
