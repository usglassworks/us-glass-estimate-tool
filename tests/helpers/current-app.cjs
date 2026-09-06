'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Execute the actual application functions, with no browser, network or user data.
// Only the startup calls are removed; calculation implementations are not copied.
function currentApp() {
  const html = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
  const match = html.match(/<script>\s*('use strict';[\s\S]*?)<\/script>/);
  if (!match) throw new Error('Application script not found');
  const startup = /\/\* APP_STARTUP_BEGIN \*\/[\s\S]*?\/\* APP_STARTUP_END \*\//;
  if (!startup.test(match[1])) throw new Error('Startup changed: review test isolation');
  const stored = new Map();
  const elements = new Map();
  const context = {
    console,
    setTimeout: () => 0,
    window: { addEventListener() {} },
    document: { addEventListener() {}, querySelectorAll: () => [], querySelector: () => null,
      getElementById: id => elements.get(id) || null },
    localStorage: { getItem: k => stored.has(k) ? stored.get(k) : null,
      setItem: (k, v) => stored.set(k, String(v)), removeItem: k => stored.delete(k) },
    alert() {}, confirm: () => true,
  };
  vm.createContext(context);
  for (const file of ['approved-master.js', 'price-context.js', 'app-pricing.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../pricing', file), 'utf8'), context, { filename: file });
  }
  vm.runInContext(match[1].replace(startup, ''), context, { filename: 'index.html' });
  return { app: context, stored, elements };
}

const settings = {
  miscMode: 'auto', miscManual: 0, discName: '', discAmt: 0,
  multG: 1.25, multC: 1.75, multK: 1.48, multKR: 1.48, multD: 1,
  ckUnitPrice: 0, ckCoverage: 3,
};
const quote = {
  netMode: 'auto', netManual: 0, netTax: 'excl', qaMode: 'detail',
  netMult: 1.25, qaManual: 0, qaTax: 'excl',
};
const row = {
  w: 1000, h: 1000, q: 1, g: 'FL5', sellMult: 2, constRate: 0,
  fix: 'caulking', caulkSide: 'double', rem: false, fire: false,
  ckRemoval: false, disposal: false, addAmt: 0,
  priceMode: 'sqm', itemCategory: 'ガラス',
};

function calculate(app, example, master) {
  app.GP = { ...master.GP };
  app.CR = { ...master.CR };
  app.OTHER = { ...master.OTHER };
  const s = { ...settings, ...example.settings };
  const q = { ...quote, ...example.quote };
  const rows = example.rows.map(r => ({ ...row, ...r }));
  app.document.querySelectorAll = selector => selector === '.row-card' ? rows : [];
  app.getRowData = r => ({ ...r });
  app.readSettings = () => s;
  app.readQuote = () => q;
  app.gv = id => id === 'misc-manual' ? { value: s.miscManual } : null;
  let result;
  app.renderTable = (datas, calcs, display, settings, totals, net, amount, quote) => {
    result = { calcs, display, totals, net, amount, quote };
  };
  app.renderSummary = () => {};
  app.renderPrintSummary = () => {};
  app.calc();
  result.lastCalc = app._lastCalc;
  return JSON.parse(JSON.stringify(result));
}

module.exports = { currentApp, calculate, row, settings, quote };
