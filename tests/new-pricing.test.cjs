'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { currentApp, calculate } = require('./helpers/current-app.cjs');
const master = require('../pricing/master-2026-09.json');
const plain = x => JSON.parse(JSON.stringify(x));

function newCalculation(example = { rows: [{}] }) {
  const { app } = currentApp();
  app.priceContext = { version: master.version, legacyBasisUnknown: false };
  return calculate(app, { ...example, settings: { multG: 1, multC: 1, ...example.settings },
    rows: example.rows.map(r => ({ sellMult: 1.5, workType: 'new', ...r })) }, master);
}

test('generated browser master matches the reviewed JSON', () => {
  execFileSync(process.execPath, ['scripts/build-price-context.cjs', '--check'], { cwd: path.join(__dirname, '..') });
});

test('new FL5 normal: 1.5 once, no 10% uplift or old customer glass/labor multipliers', () => {
  const r = newCalculation();
  assert.equal(r.calcs[0].materialCost, 1710);
  assert.equal(r.calcs[0].glassPrice, 2565);
  assert.equal(r.calcs[0].constructionBase, 2000);
  assert.equal(r.display[0].glassPrice, 2565);
  assert.equal(r.display[0].constructionBase, 2000);
  assert.equal(r.calcs[0].caulkMeters, 8);
  assert.equal(r.calcs[0].caulkingCost, 2800);
  assert.equal(r.display[0].caulkingCost, 4144); // unchanged 1.48 customer adjustment
  assert.equal(r.net, 14865);
  assert.equal(r.amount, 16209);
  assert.equal(r.lastCalc.netProfit, 13155);
});

test('repair: 10% on material sale, base cost and final labor remain unchanged', () => {
  const r = newCalculation({ rows: [{ workType: 'repair', rem: true }] });
  assert.equal(r.calcs[0].materialCost, 1710);
  assert.equal(r.calcs[0].glassPrice, 2822);
  assert.equal(r.calcs[0].constructionBase, 2000);
  assert.equal(r.calcs[0].removalCost, 2000);
  assert.equal(r.lastCalc.netProfit, r.net - 1710);
});

for (const [glass, rate] of Object.entries(master.CR)) {
  test('new customer and internal final labor: ' + glass, () => {
    const r = newCalculation({ rows: [{ g: glass, workType: 'repair', rem: true }] });
    assert.equal(r.calcs[0].constructionBase, rate);
    assert.equal(r.calcs[0].removalCost, rate);
    assert.equal(r.display[0].constructionBase, rate);
    assert.equal(r.display[0].removalCost, rate);
  });
}

for (const glass of ['Yカガミ3', 'Yカガミ5', 'Yカガミ6']) {
  for (const qty of [1, 2, 4]) {
    test('mirror 5000 per pane regardless of area/repair: ' + glass + ' x' + qty, () => {
      const r = newCalculation({ rows: [{ g: glass, w: 900, h: 1800, q: qty, workType: 'repair', rem: true }] });
      assert.equal(r.calcs[0].constructionBase, 5000 * qty);
      assert.equal(r.calcs[0].removalCost, 5000 * qty);
      assert.equal(r.display[0].constructionBase, 5000 * qty);
      assert.equal(r.calcs[0].glassPrice, Math.round(Math.round(master.GP[glass] * 1.62 * qty) * 1.5));
    });
  }
}

test('custom sqm/mat modes use new multiplier while direct sale remains explicit', () => {
  const r = newCalculation({ rows: [
    { g: '自由入力', priceMode: 'sqm', customSqm: 1000 },
    { g: '自由入力', priceMode: 'mat', customMat: 1000, q: 2, matScope: 'per_unit', workType: 'repair' },
    { g: '自由入力', priceMode: 'mat', customMat: 1000, q: 2, matScope: 'total' },
    { g: '自由入力', priceMode: 'sell', customMatC: 1000, customSell: 9999, workType: 'repair' },
  ] });
  assert.deepEqual(r.calcs.map(c => c.glassPrice), [1500, 3300, 1500, 9999]);
});

test('starting new does not overwrite or reuse the old master and old default multiplier', () => {
  const { app, stored, elements } = currentApp();
  stored.set('usglass_GP', '{"FL5":9999}');
  stored.set('usglass_CR', '{"FL5":123}');
  stored.set('usglass_default_sell_mult', '2.9');
  for (const id of ['default-sell-mult', 'm-glass', 'm-const']) elements.set(id, { value: 'old' });
  const before = [...stored];
  app.startNewEstimatePricing();
  assert.equal(app.GP.FL5, 1710);
  assert.equal(app.CR.FL5, 2000);
  assert.equal(app.OTHER.mirrorLabor, 5000);
  assert.equal(elements.get('default-sell-mult').value, 1.5);
  assert.equal(elements.get('m-glass').value, 1);
  assert.equal(elements.get('m-const').value, 1);
  assert.deepEqual([...stored], before);
  const s = app.readSettings();
  assert.equal(s.multG, 1);
  assert.equal(s.multC, 1);
});

test('saved price snapshot survives changing master and restores without updating stored defaults', () => {
  const { app, stored } = currentApp();
  app.startNewEstimatePricing();
  const saved = plain(app.collectSettingsData());
  assert.equal(saved.pricing.master.OTHER.mirrorLabor, 5000);
  app.GP.FL5 = 8000;
  app.CR.FL5 = 9000;
  app.persistActiveMaster();
  const before = [...stored];
  app.restorePricingContext(saved.pricing);
  assert.equal(app.GP.FL5, 1710);
  assert.equal(app.CR.FL5, 2000);
  assert.deepEqual([...stored], before);
  assert.equal(saved.pricing.master.GP.FL5, 1710);
});

test('old estimate with no snapshot uses only legacy prices and carries unresolved provenance', () => {
  const { app, stored, elements } = currentApp();
  stored.set('usglass_GP', '{"FL5":1710}');
  stored.set('usglass_CR', '{"FL5":1000}');
  stored.set('usglass_OTHER', '{"mirrorLabor":5000}');
  elements.set('pricing-status', { textContent: '' });
  app.startNewEstimatePricing();
  app.restorePricingContext(undefined);
  assert.equal(app.isNewPricing(), false);
  assert.equal(app.CR.FL5, 1000);
  assert.equal(app.baseSellMult(), 2);
  assert.match(elements.get('pricing-status').textContent, /保存時の単価情報がない/);
  const snapshot = plain(app.collectPricingContext());
  app.restorePricingContext(snapshot);
  assert.equal(app.priceContext.legacyBasisUnknown, true);
});

test('new master save keeps all legacy localStorage bytes intact', () => {
  const { app, stored } = currentApp();
  stored.set('usglass_GP', '{"FL5":1111}');
  stored.set('usglass_CR', '{"FL5":1234}');
  stored.set('usglass_OTHER', '{"mirrorLabor":5000}');
  stored.set('usglass_projects', '[{"id":"legacy"}]');
  const before = [...stored];
  app.startNewEstimatePricing();
  app.persistActiveMaster();
  for(const [key, value] of before) assert.equal(stored.get(key), value);
  assert.equal(JSON.parse(stored.get(app.NEW_MASTER_KEY)).CR.FL5, 2000);
});

for(const bad of [null, { version: 'future', master }, { version: master.version, master: {} },
  { version: master.version, master: { GP: {}, CR: {}, OTHER: {} } },
  { version: master.version, master: { ...master, GP: { ...master.GP, FL5: -1 } } }]) {
  test('malformed/unknown price snapshot cannot replace current prices: ' + JSON.stringify(bad).slice(0, 70), () => {
    const { app } = currentApp();
    app.startNewEstimatePricing();
    const before = plain(app.collectPricingContext());
    assert.throws(() => app.restorePricingContext(bad));
    assert.deepEqual(plain(app.collectPricingContext()), before);
  });
}

test('source preserves both PDF rendering functions and saves/restores repair field', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.match(html, /function renderPrintSummary\(/);
  assert.match(html, /function printPDF\(/);
  const { app } = currentApp();
  const card = { dataset: { rid: '1' }, querySelector: selector => {
    if(selector === '.work-type') return { value: 'repair' };
    return null;
  } };
  app.document.querySelectorAll = () => [card];
  app.radio = () => '';
  assert.equal(app.collectRowsData()[0].workType, 'repair');
  let field = { value: '' };
  app.setRadio = () => {};
  app.updateOrderDimWarning = () => {};
  app.updateRow = () => {};
  card.querySelector = selector => selector === '.work-type' ? field : null;
  app.applyRowData(card, { workType: 'repair' });
  assert.equal(field.value, 'repair');
});

for(const mode of ['internal', 'customer']) {
  test('actual print renderer keeps costs private in customer view: ' + mode, () => {
    const { app } = currentApp();
    const renderPrintSummary = app.renderPrintSummary;
    app.priceContext = { version: master.version, legacyBasisUnknown: false };
    const r = calculate(app, { rows: [{ sellMult: 1.5 }],
      settings: { multG: 1, multC: 1 }, quote: { showNET: true, showQA: true } }, master);
    const nodes = new Map();
    app.gv = id => {
      if(!nodes.has(id)) nodes.set(id, { innerHTML:'', textContent:'', style:{} });
      return nodes.get(id);
    };
    app.viewMode = mode;
    renderPrintSummary(r.totals, r.net, r.amount, app.readSettings(), r.quote,
      r.lastCalc.netProfit, r.lastCalc.netProfitRate);
    const printed = nodes.get('print-summary').innerHTML;
    assert.match(printed, /NET/);
    if(mode === 'customer') {
      assert.doesNotMatch(printed, /原価|粗利/);
      assert.match(printed, /16,209/);
    } else {
      assert.match(printed, /原価/);
      assert.match(printed, /粗利/);
      assert.match(printed, /13,155/);
    }
  });
}
