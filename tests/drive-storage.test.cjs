'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const clone = value => JSON.parse(JSON.stringify(value));
const existing = { id: 'original', name: '仮案件A', savedAt: '2026-09-01',
  data: { pname: '仮案件A', settings: {}, quote: {}, rows: [{ g: 'FL5', w: '900', h: '1800', q: '2' }] } };
const savedRow = { fixtureNo: 'AW-1', g: 'FL6', w: '900', h: '1800', q: '2',
  sellMult: '2.0', caulkSide: 'single', rem: '1', orderW: '884', orderH: '1784',
  orderMemo: 'テスト専用', orderConfirmed: true, itemCategory: 'ガラス', itemNote: '加工メモ' };

function driveHarness(options = {}) {
  let db = options.missing ? null : clone(options.db || { version: 2, projects: [existing],
    masterPrices: { GP: { FL5: 1710 } }, unrelatedMetadata: 'preserve' });
  let writes = 0;
  let loaded;
  const stored = new Map([['usglass_projects', JSON.stringify(options.local || [existing])]]);
  const alerts = [];
  const nodes = new Map(['saveProjectBtn', 'saveAsNewBtn', 'projectModal', 'projectList'].map(id => [id,
    { style: {}, textContent: '', disabled: false, innerHTML: '' }]));
  nodes.set('pname', { value: '仮案件B' });
  const context = {
    console: { info() {}, error() {} }, setTimeout() {},
    document: { readyState: 'complete', querySelectorAll: () => [], querySelector: () => null },
    gv: id => nodes.get(id) || null,
    localStorage: { getItem: k => stored.has(k) ? stored.get(k) : null,
      setItem: (k, v) => stored.set(k, String(v)) },
    alert: text => alerts.push(text), confirm: () => true,
    currentProjectId: options.currentProjectId || null, isSaving: false,
    calc() {}, collectSettingsData: () => ({ mGlass: '1.25', mConst: '1.75' }),
    collectQuoteData: () => ({ qAddr: 'テスト宛先', qNum: 'TEST-001' }),
    collectRowsData: () => [clone(savedRow)],
    _makeSavedAt: () => '2026-09-06 10:00',
    updateSaveButtonLabel() {}, updateDriveSyncLabel() {}, hideSavedProjects() {},
    applyProjectData: data => { loaded = clone(data); },
    escH: s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
    DRIVE_FOLDER_NAME: 'root', DRIVE_SUBFOLDER_NAME: 'data', DRIVE_FILE_NAME: 'estimates.json',
    _driveFindItem: async name => name === 'estimates.json' ? (db ? 'file-id' : null) : 'folder-id',
    _driveFindOrCreateFolder: async () => 'folder-id',
    _driveReadContent: async () => {
      if (options.readFailure) throw new Error('offline');
      return options.raw === undefined ? JSON.stringify(db) : options.raw;
    },
    _driveUpdateContent: async (id, content) => {
      if (options.writeFailure) throw new Error('offline');
      writes++; db = JSON.parse(content);
    },
    _driveUploadNew: async (name, folderId, content) => {
      if (options.writeFailure) throw new Error('offline');
      writes++; db = JSON.parse(content); return 'file-id';
    },
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'drive-direct-storage.js'), 'utf8'), context);
  return { app: context, stored, alerts, nodes, get db() { return db; },
    get writes() { return writes; }, get loaded() { return loaded; } };
}

test('Drive new save preserves existing projects, metadata and order dimensions', async () => {
  const h = driveHarness();
  await h.app.saveProjectData();
  assert.equal(h.db.projects.length, 2);
  assert.deepEqual(h.db.projects[1], existing);
  assert.deepEqual(h.db.projects[0].data.rows, [savedRow]);
  assert.deepEqual(h.db.masterPrices, { GP: { FL5: 1710 } });
  assert.equal(h.db.unrelatedMetadata, 'preserve');
  assert.equal(h.writes, 1);
});

test('Drive overwrite updates only selected project', async () => {
  const h = driveHarness({ currentProjectId: 'original' });
  await h.app.saveProjectData();
  assert.equal(h.db.projects.length, 1);
  assert.equal(h.db.projects[0].id, 'original');
  assert.deepEqual(h.db.projects[0].data.rows, [savedRow]);
});

test('Drive duplicate uses a different id and leaves original untouched', async () => {
  const h = driveHarness({ currentProjectId: 'original' });
  await h.app.saveAsNewProject();
  assert.equal(h.db.projects.length, 2);
  assert.notEqual(h.db.projects[0].id, 'original');
  assert.deepEqual(h.db.projects[1], existing);
});

test('first Drive migration copies local projects without deleting local source', async () => {
  const h = driveHarness({ missing: true });
  const before = h.stored.get('usglass_projects');
  await h.app.saveProjectData();
  assert.deepEqual(h.db.projects[1], existing);
  assert.equal(h.stored.get('usglass_projects'), before);
});

test('Drive read failure leaves backend and local projects unchanged', async () => {
  const h = driveHarness({ readFailure: true });
  const before = clone(h.db);
  const local = h.stored.get('usglass_projects');
  await h.app.saveProjectData();
  assert.deepEqual(h.db, before);
  assert.equal(h.stored.get('usglass_projects'), local);
  assert.equal(h.writes, 0);
  assert.match(h.alerts.at(-1), /エラー/);
  assert.equal(h.app.isSaving, false);
});

test('Drive write failure does not report success or keep save button disabled', async () => {
  const h = driveHarness({ writeFailure: true });
  const before = clone(h.db);
  await h.app.saveProjectData();
  assert.deepEqual(h.db, before);
  assert.match(h.alerts.at(-1), /エラー/);
  assert.equal(h.app.isSaving, false);
  assert.equal(h.nodes.get('saveProjectBtn').disabled, false);
});

test('invalid Drive JSON is not overwritten', async () => {
  const h = driveHarness({ raw: '{invalid json' });
  await h.app.saveProjectData();
  assert.equal(h.writes, 0);
  assert.match(h.alerts.at(-1), /エラー/);
});

test('Drive load hands saved data to the existing form-restoration function', async () => {
  const h = driveHarness();
  await h.app.loadProjectData('original');
  assert.deepEqual(h.loaded, existing.data);
  assert.equal(h.app.currentProjectId, 'original');
  assert.equal(h.writes, 0);
});
