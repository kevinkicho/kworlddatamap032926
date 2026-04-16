import { S } from './state.js';
import { FX_TO_USD, FX_LABELS } from './constants.js';

let _onRatesChanged = null;
let _mobileBackdropOn = () => {};
let _mobileBackdropOff = () => {};

export function initFxCallbacks(callbacks) {
  _onRatesChanged = callbacks.onRatesChanged || null;
  _mobileBackdropOn = callbacks.mobileBackdropOn || _mobileBackdropOn;
  _mobileBackdropOff = callbacks.mobileBackdropOff || _mobileBackdropOff;
}

export function toUSD(value, currency) {
  if (!value || !currency) return 0;
  const rate = S.fxRates[(currency + '').toUpperCase()];
  return rate ? value * rate : 0;
}

const LS_FX_KEY = 'fx_rates_v2';

export function toggleFxSidebar() {
  const el = document.getElementById('fx-sidebar');
  const opening = !el.classList.contains('open');
  el.classList.toggle('open', opening);
  if (opening) { _fxRenderList(); _mobileBackdropOn(); }
  else { _mobileBackdropOff(); }
}

function _fxSaveToLS() {
  try {
    const date = document.getElementById('fx-date')?.value || 'latest';
    localStorage.setItem(LS_FX_KEY, JSON.stringify({ date, rates: S.fxRates }));
  } catch (_) {}
}

function _fxLoadFromLS() {
  try {
    const raw = localStorage.getItem(LS_FX_KEY);
    if (!raw) return false;
    const { date, rates } = JSON.parse(raw);
    if (rates && typeof rates === 'object') {
      Object.assign(S.fxRates, rates);
      const dateEl = document.getElementById('fx-date');
      if (dateEl && date && date !== 'latest') dateEl.value = date;
      return true;
    }
  } catch (_) {}
  return false;
}

export { _fxLoadFromLS };

export async function fxFetchRates() {
  const date = document.getElementById('fx-date')?.value || 'latest';
  const statusEl = document.getElementById('fx-status');
  const btn = document.getElementById('fx-fetch-btn');
  statusEl.textContent = '\u23f3 Fetching\u2026';
  if (btn) btn.disabled = true;
  try {
    const apiDate = date || 'latest';
    const res = await fetch(`/api/fx?date=${encodeURIComponent(apiDate)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json.rates) throw new Error('No rates in response');
    for (const [cur, val] of Object.entries(json.rates)) {
      if (val > 0) S.fxRates[cur.toUpperCase()] = 1 / val;
    }
    const returnedDate = json.date || apiDate;
    const dateEl = document.getElementById('fx-date');
    if (dateEl) dateEl.value = returnedDate;
    statusEl.textContent = `\u2713 ECB rates \u00b7 ${returnedDate}`;
    statusEl.style.color = '#3fb950';
    _fxSaveToLS();
    _fxRenderList();
    _fxApplyRates();
  } catch (e) {
    statusEl.textContent = `\u2717 ${e.message}`;
    statusEl.style.color = '#f85149';
  } finally {
    if (btn) btn.disabled = false;
  }
}

export function fxResetDefaults() {
  S.fxRates = { ...FX_TO_USD };
  localStorage.removeItem(LS_FX_KEY);
  const statusEl = document.getElementById('fx-status');
  if (statusEl) { statusEl.textContent = 'Reset to built-in rates'; statusEl.style.color = '#8b949e'; }
  const dateEl = document.getElementById('fx-date');
  if (dateEl) dateEl.value = '2025-01-02';
  _fxRenderList();
  _fxApplyRates();
}

export function fxInputChanged(cur, val) {
  const n = parseFloat(val);
  if (!n || n <= 0) return;
  S.fxRates[cur] = n;
  _fxSaveToLS();
  _fxApplyRates();
}

function _fxRenderList() {
  const list = document.getElementById('fx-list');
  if (!list) return;
  const curs = Object.keys(FX_TO_USD).filter(c => c !== 'USD').sort();
  list.innerHTML = curs.map(cur => {
    const rate = S.fxRates[cur] ?? FX_TO_USD[cur];
    const def  = FX_TO_USD[cur];
    const diff = Math.abs(rate - def) / def;
    const modified = diff > 0.001;
    const perUSD = rate > 0 ? (1 / rate) : 0;
    const dispPerUSD = perUSD >= 1000 ? perUSD.toFixed(0)
                     : perUSD >= 10   ? perUSD.toFixed(2)
                     : perUSD >= 1    ? perUSD.toFixed(3)
                     :                  perUSD.toPrecision(3);
    return `<div class="fx-row${modified ? ' fx-modified' : ''}">
      <span class="fx-cur">${cur}</span>
      <span class="fx-label">${FX_LABELS[cur] || ''}</span>
      <input class="fx-input" type="number" step="any" min="0"
        value="${rate.toPrecision(4)}"
        title="1 ${cur} = X USD"
        onchange="fxInputChanged('${cur}', this.value)" />
      <span class="fx-per-usd">${dispPerUSD}<span class="fx-per-usd-unit">/USD</span></span>
    </div>`;
  }).join('');
}

function _fxApplyRates() {
  if (_onRatesChanged) _onRatesChanged();
}