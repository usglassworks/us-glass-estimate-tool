'use strict';

// Adapter for the existing form. Calculation remains in index.html.
function isNewPricing() { return priceContext.version === USGlassPriceContext.version; }
function baseSellMult() { return isNewPricing() ? 1.5 : 2.0; }
function defaultCustomerGlassMult() { return isNewPricing() ? 1 : 1.25; }
function defaultCustomerLaborMult() { return isNewPricing() ? 1 : 1.75; }
function currentMaster() { return USGlassPriceContext.copy({ GP: GP, CR: CR, OTHER: OTHER }); }
function applyMaster(master) {
  var copy = USGlassPriceContext.validateMaster(master);
  GP = copy.GP; CR = copy.CR; OTHER = copy.OTHER;
}
function collectPricingContext() {
  return { version: priceContext.version, master: currentMaster(),
    legacyBasisUnknown: !!priceContext.legacyBasisUnknown };
}

function readLegacyMaster() {
  var master = { GP: Object.assign({}, DEFAULT_GP), CR: Object.assign({}, DEFAULT_CR),
    OTHER: Object.assign({}, DEFAULT_OTHER) };
  ['GP', 'CR', 'OTHER'].forEach(function(group) {
    var raw = localStorage.getItem('usglass_' + group);
    if(raw) {
      var saved = JSON.parse(raw);
      var check = { GP: {}, CR: {}, OTHER: {} };
      check[group] = saved;
      USGlassPriceContext.validateMaster(check);
      master[group] = Object.assign({}, master[group], saved);
    }
  });
  // Reproduce the legacy migration in memory, without modifying legacy storage.
  if(parseInt(localStorage.getItem('usglass_CR_schema') || '1') < 2 && master.CR.FL10 === 0) {
    master.CR.FL10 = DEFAULT_CR.FL10;
  }
  return master;
}

function restorePricingContext(saved) {
  var next = USGlassPriceContext.resolve(saved, saved === undefined ? readLegacyMaster() : null);
  applyMaster(next.master);
  priceContext = { version: next.version, legacyBasisUnknown: next.legacyBasisUnknown };
  renderMasterPanel();
  updateMasterWarning();
  updatePricingStatus();
}

function startNewEstimatePricing() {
  var raw = localStorage.getItem(NEW_MASTER_KEY);
  var master = raw ? JSON.parse(raw) : USGlassApprovedMaster;
  var next = USGlassPriceContext.resolve({ version: USGlassPriceContext.version, master: master }, null);
  var savedMult = localStorage.getItem('usglass_default_sell_mult_2026_09');
  applyMaster(next.master);
  priceContext = { version: next.version, legacyBasisUnknown: false };
  var values = { 'default-sell-mult': Number(savedMult) > 0 ? Number(savedMult) : 1.5,
    'm-glass': 1, 'm-const': 1, 'm-caulk': 1.48, 'm-remov': 1.48, 'm-disp': 1 };
  Object.keys(values).forEach(function(id) { if(gv(id)) gv(id).value = values[id]; });
  renderMasterPanel();
  updateMasterWarning();
  updatePricingStatus();
}

function updatePricingStatus() {
  var el = gv('pricing-status');
  if(el) {
    el.textContent = isNewPricing()
      ? '新価格：材料の基本倍率1.5／施工は登録単価／ミラー施工は1枚5,000円（個別設定は単価欄で確認）'
      : priceContext.legacyBasisUnknown
        ? '旧価格：保存時の単価情報がないため、この端末の旧単価で再計算しています。元の見積書と照合してください。'
        : '旧価格：この見積の単価・倍率で計算しています。新単価は自動適用しません。';
  }
  var label = gv('material-rule-label');
  if(label) label.textContent = isNewPricing()
    ? '材料原価 GP（円/m²）。修理材料のみ売価計算に1.10、ミラーは対象外'
    : '旧材料単価 GP（円/m² × 1.10 × 面積）';
}

function persistActiveMaster() {
  var master = USGlassPriceContext.validateMaster(currentMaster());
  if(isNewPricing()) {
    // A new key keeps the original browser prices available for old estimates.
    localStorage.setItem(NEW_MASTER_KEY, JSON.stringify(master));
  } else {
    localStorage.setItem('usglass_GP', JSON.stringify(master.GP));
    localStorage.setItem('usglass_CR', JSON.stringify(master.CR));
    localStorage.setItem('usglass_OTHER', JSON.stringify(master.OTHER));
  }
}

function resetNewMaster() {
  if(!confirm('新価格の単価を正式初期値へ戻し、現在の見積を再計算しますか？旧価格の保存データは変更しません。')) return;
  var before = currentMaster();
  try {
    applyMaster(USGlassApprovedMaster);
    persistActiveMaster();
  } catch(e) {
    applyMaster(before);
    alert('単価を保存できませんでした。変更前の単価を維持します。\n' + e.message);
    return;
  }
  renderMasterPanel();
  updateMasterWarning();
  calc();
}
