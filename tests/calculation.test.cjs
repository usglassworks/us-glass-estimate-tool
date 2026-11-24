'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { currentApp, calculate, row } = require('./helpers/current-app.cjs');
const fixtures = require('./fixtures/representative-inputs.json');
const baseline = require('./fixtures/legacy-results.json');

for (const example of fixtures.cases) {
  test('legacy regression: ' + example.name, () => {
    const { app } = currentApp();
    assert.deepEqual(calculate(app, example, fixtures.master), baseline[example.name]);
  });
}

test('independent arithmetic: 1m2 FL5 includes existing 10% and distinct customer multipliers', () => {
  const { app } = currentApp();
  const r = calculate(app, { rows: [{}] }, fixtures.master);
  assert.equal(r.calcs[0].area, 1);
  assert.equal(r.calcs[0].materialCost, 1881);
  assert.equal(r.calcs[0].glassPrice, 3762);
  assert.equal(r.calcs[0].constructionBase, 1000);
  assert.equal(r.calcs[0].caulkMeters, 8);
  assert.equal(r.calcs[0].caulkingCost, 2800);
  assert.equal(r.net, 15062);
  assert.equal(r.amount, 18097);
  assert.equal(r.lastCalc.netProfit, 13181);
});

test('no existing repair-specific labor multiplier; removal adds equal labor', () => {
  const { app } = currentApp();
  Object.assign(app.CR, { FL5: 2000 });
  const r = app.calcRow({ ...row, rem: true });
  assert.equal(r.constructionBase, 2000);
  assert.equal(r.removalCost, 2000);
});

test('existing mirror fixed unit is multiplied by quantity: preserve pending business clarification', () => {
  const { app } = currentApp();
  app.OTHER.mirrorLabor = 5000;
  const r = app.calcRow({ ...row, g: 'Yカガミ5', q: 3, rem: true });
  assert.equal(r.constructionBase, 15000);
  assert.equal(r.removalCost, 15000);
});

test('order dimensions never participate in estimate arithmetic', () => {
  const { app } = currentApp();
  const a = calculate(app, { rows: [{}] }, fixtures.master);
  const b = calculate(app, { rows: [{ orderW: 8888, orderH: 9999, orderConfirmed: true }] }, fixtures.master);
  assert.deepEqual(b, a);
});

test('known difference: NET profit excludes additional-cost flag while internal profit includes it', () => {
  const { app } = currentApp();
  const r = calculate(app, { rows: [{ addAmt: 6000, addInCost: true, addInSales: true }] }, fixtures.master);
  assert.equal(r.lastCalc.netProfit - r.lastCalc.iProfit, 6000);
});
