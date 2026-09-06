'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const master = require('../pricing/master-2026-09.json');
const { currentApp, row, calculate } = require('./helpers/current-app.cjs');

// Independent transcription of the user's specification, never derive by
// multiplying the repository's defaults (many are zero or differ from the request).
const materials = {
  FL2:1560, FL3:1840, FL5:1710, FL6:2130, FL8:3500, FL10:4800, FL12:8800,
  F6:4560, Fw:5100, pw:8100, 'グリーンラル6':4300, 'グリーンラル8':6930,
  'スリガラス3':8200, 'スリガラス5':8200, 'スリガラス6':8200,
  'Yカガミ3':3530, 'Yカガミ5':4940, 'Yカガミ6':6000,
  '3+3透明':7100, '4+4透明':8900, '5+5透明':10600, '3+3乳半':10600, '4+4乳半':12300,
  'ラミブロック3+3透明':7800, 'ラミブロック4+4透明':11300,
  'ラミブロック3+3乳半':10400, 'ラミブロック4+4乳半':13000, '耐熱5':45000, '耐熱8':93000,
};
const labor = {
  FL5:2000, FL6:2200, FL8:2600, FL10:4200, FL12:6200,
  F6:2200, Fw:2400, pw:2400, 'グリーンラル6':2200, 'グリーンラル8':2600,
  'スリガラス3':2200, 'スリガラス5':2200, 'スリガラス6':2400,
  '3+3透明':2400, '4+4透明':2800, '5+5透明':3600, '3+3乳半':2400, '4+4乳半':2800,
  'ラミブロック3+3透明':2400, 'ラミブロック4+4透明':2800,
  'ラミブロック3+3乳半':2400, 'ラミブロック4+4乳半':2800, '耐熱5':3000, '耐熱8':4000,
};

test('all 29 material prices match the specification without adding unspecified items', () => {
  assert.deepEqual(master.GP, materials);
});
test('all 24 labor prices match the specification without inventing FL2/FL3 labor', () => {
  assert.deepEqual(master.CR, labor);
});
test('fixed prices and factors match the specification; mirror is 5000 per pane', () => {
  assert.deepEqual(master.OTHER, { ckNormal:350, ckFire:750, ckRemoval:300,
    disposal:1000, mirrorLabor:5000, doorPulley:2000 });
  assert.equal(master.materialSellMultiplier, 1.5);
  assert.equal(master.repairMaterialFactor, 1.1);
  assert.equal(master.laborMultiplier, 1);
  assert.equal(master.mirrorLaborBasis, 'per_pane');
});

for (const [glass, rate] of Object.entries(labor)) {
  test('candidate labor calculation uses final unit once: ' + glass, () => {
    const { app } = currentApp();
    app.CR = { ...master.CR };
    app.OTHER = { ...master.OTHER };
    // Uses current calcRow, not a second test implementation of labor calculation.
    const one = app.calcRow({ ...row, g: glass, rem: true });
    assert.equal(one.constructionBase, rate);
    assert.equal(one.removalCost, rate);
    const multiple = app.calcRow({ ...row, g: glass, w: 900, h: 1800, q: 2, rem: true });
    assert.equal(multiple.constructionBase, Math.round(1.62 * 2 * rate));
    assert.equal(multiple.removalCost, multiple.constructionBase);
  });
}

test('price difference evidence: old customer multiplier still changes new labor in current app', () => {
  const { app } = currentApp();
  const r = calculate(app, { rows: [{}] }, master);
  assert.equal(r.calcs[0].constructionBase, 2000);
  assert.equal(r.display[0].constructionBase, 3500);
  // This is an existing incompatibility, not approval of 3500 as the new price.
});

test('price difference evidence: changing only the sell multiplier leaves normal 10% uplift', () => {
  const { app } = currentApp();
  const r = calculate(app, { rows: [{ sellMult: 1.5 }] }, master);
  assert.equal(r.calcs[0].glassPrice, 2822);
  assert.notEqual(r.calcs[0].glassPrice, Math.round(1710 * 1.5));
});
