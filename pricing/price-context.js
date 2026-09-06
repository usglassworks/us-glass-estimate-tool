'use strict';

// The JSON master is embedded by scripts/build-price-context.cjs. That command
// only generates the data file; application execution never contacts an AI/API.
// Context operations do not write localStorage or change the active estimate.
(function(root) {
  var VERSION = '2026-09-06';
  function copy(value) { return JSON.parse(JSON.stringify(value)); }

  function validateMaster(master) {
    if(!master || typeof master !== 'object') throw new Error('単価データがありません。');
    ['GP', 'CR', 'OTHER'].forEach(function(group) {
      var values = master[group];
      if(!values || typeof values !== 'object' || Array.isArray(values)) {
        throw new Error('単価データの形式が不正です：' + group);
      }
      Object.keys(values).forEach(function(key) {
        if(key === '__proto__' || key === 'constructor' || key === 'prototype' ||
           typeof values[key] !== 'number' || !Number.isFinite(values[key]) || values[key] < 0) {
          throw new Error('単価が不正です：' + group + ' / ' + key);
        }
      });
    });
    return copy(master);
  }

  function resolve(saved, legacyMaster) {
    if(saved === undefined) {
      return { version: 'legacy', master: validateMaster(legacyMaster), legacyBasisUnknown: true };
    }
    if(!saved || (saved.version !== VERSION && saved.version !== 'legacy')) {
      throw new Error('この見積の計算ルールに対応していません。更新せずに保管してください。');
    }
    var master = validateMaster(saved.master);
    if(saved.version === VERSION) {
      ['GP', 'CR', 'OTHER'].forEach(function(group) {
        Object.keys(root.USGlassApprovedMaster[group]).forEach(function(key) {
          if(!Object.prototype.hasOwnProperty.call(master[group], key)) {
            throw new Error('保存単価が不足しています：' + key);
          }
        });
      });
    }
    return { version: saved.version, master: master,
      legacyBasisUnknown: saved.version === 'legacy' && saved.legacyBasisUnknown !== false };
  }

  root.USGlassPriceContext = { version: VERSION, copy: copy, validateMaster: validateMaster, resolve: resolve };
})(typeof globalThis !== 'undefined' ? globalThis : this);
