// ── Module state ──────────────────────────────────────────────────────────────
let map;
let wikiLayer = null;
let rawCities = [];      // validated data from server, never mutated
let allCities = [];      // rawCities with overrides applied
let countryData = {};      // World Bank data keyed by ISO-2 code
let filtered = [];
let visibleCount = 100;
const PAGE_SIZE = 100;
let sortCol = 'pop';
let sortDir = 'desc';
let editingKey = null;    // _key of the city currently open in the modal

// Companies data keyed by city QID
let companiesData = {};

// Map ISO-2 country code → Wikipedia language subdomain
// Used to prefer the local-language Wikipedia article over English
const ISO_TO_WIKI_LANG = {
  JP: 'ja', CN: 'zh', KR: 'ko', TW: 'zh', HK: 'zh',
  DE: 'de', AT: 'de', CH: 'de',
  FR: 'fr', BE: 'fr',
  ES: 'es', MX: 'es', AR: 'es', CO: 'es', CL: 'es', PE: 'es', VE: 'es',
  PT: 'pt', BR: 'pt',
  IT: 'it',
  RU: 'ru', BY: 'be', UA: 'uk',
  NL: 'nl',
  PL: 'pl', CZ: 'cs', SK: 'sk', HU: 'hu', RO: 'ro', BG: 'bg', HR: 'hr',
  SE: 'sv', NO: 'no', DK: 'da', FI: 'fi',
  TR: 'tr', GR: 'el', IL: 'he', SA: 'ar', AE: 'ar', EG: 'ar',
  IN: 'hi', ID: 'id', TH: 'th', VN: 'vi', MY: 'ms',
};

// Choropleth state
let choroplethLayer = null;
let worldGeo = null;    // GeoJSON FeatureCollection for country borders
let choroOn = false;   // choropleth is off by default
let activeChoroKey = 'gdp_per_capita';

// Economic centers layer state
let econLayer = null;
let econOn = false;

// Trade flow layer state
let tradeArrowLayer  = null;   // current trade arrows LayerGroup
const tradeCache     = {};     // iso2 → [{year, expGds, impGds}]
const countryCentroids = {};   // iso2 → [lat, lng]

// Approximate 2026 FX rates to USD (used only for relative dot sizing, not financial reporting)
const FX_TO_USD = {
  USD: 1, EUR: 1.08, GBP: 1.27, JPY: 0.0067, CNY: 0.138, KRW: 0.00075,
  INR: 0.012, BRL: 0.196, CAD: 0.737, AUD: 0.648, CHF: 1.13, SEK: 0.096,
  NOK: 0.092, DKK: 0.145, PLN: 0.249, HKD: 0.128, SGD: 0.740, TWD: 0.031,
  MXN: 0.052, ZAR: 0.055, TRY: 0.029, RUB: 0.011, IDR: 6.3e-5, MYR: 0.224,
  PHP: 0.0173, THB: 0.028, NGN: 0.00063, AED: 0.272, SAR: 0.267, EGP: 0.020,
  QAR: 0.274, KWD: 3.25, BHD: 2.65, OMR: 2.60, CZK: 0.044, HUF: 0.0028,
  RON: 0.218, BGN: 0.555, HRK: 0.145, RSD: 0.0093, UAH: 0.024, KZT: 0.0021,
  DZD: 0.0075, MAD: 0.10, TND: 0.32, GHS: 0.067, KES: 0.0077, ETB: 0.0083,
  COP: 0.00024, PEN: 0.27, CLP: 0.00107, ARS: 0.00098, ILS: 0.27, JOD: 1.41,
  PKR: 0.0036, BDT: 0.0091, LKR: 0.0034, VND: 0.000039, MNT: 0.00029,
  NZD: 0.613, OMR: 2.60,
  BTC: 65000, ETH: 3200,
};

// ISO-2 country → default/dominant currency (used when Wikidata currency unit is missing)
const ISO2_TO_CURRENCY = {
  US:'USD', GB:'GBP', DE:'EUR', FR:'EUR', IT:'EUR', ES:'EUR', NL:'EUR',
  BE:'EUR', AT:'EUR', PT:'EUR', FI:'EUR', IE:'EUR', GR:'EUR', LU:'EUR',
  JP:'JPY', CN:'CNY', KR:'KRW', IN:'INR', BR:'BRL', CA:'CAD', AU:'AUD',
  CH:'CHF', SE:'SEK', NO:'NOK', DK:'DKK', PL:'PLN', HK:'HKD', SG:'SGD',
  TW:'TWD', MX:'MXN', ZA:'ZAR', TR:'TRY', RU:'RUB', ID:'IDR', MY:'MYR',
  PH:'PHP', TH:'THB', NG:'NGN', AE:'AED', SA:'SAR', EG:'EGP', QA:'QAR',
  KW:'KWD', BH:'BHD', OM:'OMR', CZ:'CZK', HU:'HUF', RO:'RON', BG:'BGN',
  HR:'HRK', RS:'RSD', UA:'UAH', KZ:'KZT', DZ:'DZD', MA:'MAD', TN:'TND',
  GH:'GHS', KE:'KES', ET:'ETB', CO:'COP', PE:'PEN', CL:'CLP', AR:'ARS',
  IL:'ILS', JO:'JOD', PK:'PKR', BD:'BDT', LK:'LKR', VN:'VND', MN:'MNT',
  NZ:'NZD', HU:'HUF', SK:'EUR', SI:'EUR', EE:'EUR', LV:'EUR', LT:'EUR',
  CY:'EUR', MT:'EUR',
};

// Mutable FX rates — start from hardcoded table, overridden by sidebar / localStorage
let fxRates = { ...FX_TO_USD };

function toUSD(value, currency) {
  if (!value || !currency) return 0;
  const rate = fxRates[(currency + '').toUpperCase()];
  return rate ? value * rate : 0;
}

// ── FX Sidebar ────────────────────────────────────────────────────────────────

const LS_FX_KEY = 'fx_rates_v2';

// Currency labels shown in the sidebar list
const FX_LABELS = {
  USD:'US Dollar', EUR:'Euro', GBP:'British Pound', JPY:'Japanese Yen',
  CNY:'Chinese Yuan', KRW:'South Korean Won', INR:'Indian Rupee',
  BRL:'Brazilian Real', CAD:'Canadian Dollar', AUD:'Australian Dollar',
  CHF:'Swiss Franc', SEK:'Swedish Krona', NOK:'Norwegian Krone',
  DKK:'Danish Krone', PLN:'Polish Złoty', HKD:'Hong Kong Dollar',
  SGD:'Singapore Dollar', TWD:'New Taiwan Dollar', MXN:'Mexican Peso',
  ZAR:'South African Rand', TRY:'Turkish Lira', RUB:'Russian Ruble',
  IDR:'Indonesian Rupiah', MYR:'Malaysian Ringgit', PHP:'Philippine Peso',
  THB:'Thai Baht', NGN:'Nigerian Naira', AED:'UAE Dirham',
  SAR:'Saudi Riyal', EGP:'Egyptian Pound', QAR:'Qatari Riyal',
  KWD:'Kuwaiti Dinar', BHD:'Bahraini Dinar', OMR:'Omani Rial',
  CZK:'Czech Koruna', HUF:'Hungarian Forint', RON:'Romanian Leu',
  BGN:'Bulgarian Lev', HRK:'Croatian Kuna', RSD:'Serbian Dinar',
  UAH:'Ukrainian Hryvnia', KZT:'Kazakhstani Tenge', DZD:'Algerian Dinar',
  MAD:'Moroccan Dirham', TND:'Tunisian Dinar', GHS:'Ghanaian Cedi',
  KES:'Kenyan Shilling', ETB:'Ethiopian Birr', COP:'Colombian Peso',
  PEN:'Peruvian Sol', CLP:'Chilean Peso', ARS:'Argentine Peso',
  ILS:'Israeli Shekel', JOD:'Jordanian Dinar', PKR:'Pakistani Rupee',
  BDT:'Bangladeshi Taka', LKR:'Sri Lankan Rupee', VND:'Vietnamese Dong',
  MNT:'Mongolian Tögrög', NZD:'New Zealand Dollar',
  BTC:'Bitcoin', ETH:'Ethereum',
};

function toggleFxSidebar() {
  const el = document.getElementById('fx-sidebar');
  const opening = !el.classList.contains('open');
  el.classList.toggle('open', opening);
  if (opening) _fxRenderList();
}

function _fxSaveToLS() {
  try {
    const date = document.getElementById('fx-date')?.value || 'latest';
    localStorage.setItem(LS_FX_KEY, JSON.stringify({ date, rates: fxRates }));
  } catch (_) {}
}

function _fxLoadFromLS() {
  try {
    const raw = localStorage.getItem(LS_FX_KEY);
    if (!raw) return false;
    const { date, rates } = JSON.parse(raw);
    if (rates && typeof rates === 'object') {
      Object.assign(fxRates, rates);
      const dateEl = document.getElementById('fx-date');
      if (dateEl && date && date !== 'latest') dateEl.value = date;
      return true;
    }
  } catch (_) {}
  return false;
}

async function fxFetchRates() {
  const date = document.getElementById('fx-date')?.value || 'latest';
  const statusEl = document.getElementById('fx-status');
  const btn = document.getElementById('fx-fetch-btn');
  statusEl.textContent = '⏳ Fetching…';
  if (btn) btn.disabled = true;
  try {
    // Frankfurter returns how many of each currency = 1 USD (ECB reference rates)
    const apiDate = date || 'latest';
    const res = await fetch(`https://api.frankfurter.app/${apiDate}?from=USD`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json.rates) throw new Error('No rates in response');
    // Convert: Frankfurter "1 USD = X cur" → our format "1 cur = Y USD" (Y = 1/X)
    for (const [cur, val] of Object.entries(json.rates)) {
      if (val > 0) fxRates[cur.toUpperCase()] = 1 / val;
    }
    const returnedDate = json.date || apiDate;
    const dateEl = document.getElementById('fx-date');
    if (dateEl) dateEl.value = returnedDate;
    statusEl.textContent = `✓ ECB rates · ${returnedDate}`;
    statusEl.style.color = '#3fb950';
    _fxSaveToLS();
    _fxRenderList();
    _fxApplyRates();
  } catch (e) {
    statusEl.textContent = `✗ ${e.message}`;
    statusEl.style.color = '#f85149';
  } finally {
    if (btn) btn.disabled = false;
  }
}

function fxResetDefaults() {
  fxRates = { ...FX_TO_USD };
  localStorage.removeItem(LS_FX_KEY);
  const statusEl = document.getElementById('fx-status');
  if (statusEl) { statusEl.textContent = 'Reset to built-in rates'; statusEl.style.color = '#8b949e'; }
  const dateEl = document.getElementById('fx-date');
  if (dateEl) dateEl.value = '2025-01-02';
  _fxRenderList();
  _fxApplyRates();
}

function fxInputChanged(cur, val) {
  const n = parseFloat(val);
  if (!n || n <= 0) return;
  fxRates[cur] = n;
  _fxSaveToLS();
  _fxApplyRates();
}

function _fxRenderList() {
  const list = document.getElementById('fx-list');
  if (!list) return;
  const curs = Object.keys(FX_TO_USD).filter(c => c !== 'USD').sort();
  list.innerHTML = curs.map(cur => {
    const rate = fxRates[cur] ?? FX_TO_USD[cur];
    const def  = FX_TO_USD[cur];
    const diff = Math.abs(rate - def) / def;
    const modified = diff > 0.001;
    // Show: how many units of this currency = 1 USD (inverse, easier to read)
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
  if (econOn) buildEconLayer();
  if (corpCityQid) renderCorpList();
  // Refresh global corp list if visible
  const gPanel = document.getElementById('global-corp-panel');
  if (gPanel && gPanel.style.display !== 'none') renderGlobalCorpList();
}

// Build a World Bank data portal URL slug from a country name.
// Confirmed format: https://data.worldbank.org/country/[lowercase-hyphenated-name]
// e.g. "China" → china, "United States" → united-states
const WB_SLUG_OVERRIDES = {
  // WB API names that don't convert cleanly to the portal slug
  'Bahamas, The': 'bahamas',
  'Gambia, The': 'gambia',
  "Cote d'Ivoire": 'cote-divoire',
  'Congo, Dem. Rep.': 'congo-democratic-republic',
  'Congo, Rep.': 'congo-republic',
  'Egypt, Arab Rep.': 'egypt-arab-republic',
  'Iran, Islamic Rep.': 'iran-islamic-republic',
  'Korea, Rep.': 'korea-republic',
  "Korea, Dem. People's Rep.": 'korea-democratic-peoples-republic',
  'Lao PDR': 'lao-pdr',
  'Micronesia, Fed. Sts.': 'micronesia',
  'Syrian Arab Republic': 'syrian-arab-republic',
  'Venezuela, RB': 'venezuela',
  'Yemen, Rep.': 'yemen-republic',
  'Hong Kong SAR, China': 'hong-kong-sar-china',
  'Macao SAR, China': 'macao-sar-china',
  'St. Kitts and Nevis': 'st-kitts-and-nevis',
  'St. Lucia': 'st-lucia',
  'St. Vincent and the Grenadines': 'st-vincent-and-the-grenadines',
  'Puerto Rico (US)': 'puerto-rico',
  'Somalia, Fed. Rep.': 'somalia',
};

function wbCountryUrl(iso2) {
  const c = countryData[iso2];
  if (!c || !c.name) return null;
  // Skip World Bank aggregate/regional entries — not real countries
  if (c.region === 'Aggregates' || c.income_level === 'Aggregates') return null;
  const slug = WB_SLUG_OVERRIDES[c.name] ||
    c.name.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents é→e
      .replace(/[',\.]/g, '')                           // remove punctuation
      .replace(/\s+/g, '-')                             // spaces → hyphens
      .replace(/-+/g, '-').replace(/^-|-$/g, '');       // clean up
  return `https://data.worldbank.org/country/${slug}`;
}

// ── Choropleth indicator definitions ────────────────────────────────────────
const CHORO_INDICATORS = [
  {
    key: 'gdp_per_capita', label: 'GDP per capita (USD)', fmt: v => '$' + Math.round(v).toLocaleString(),
    c0: [40, 30, 100], c1: [60, 210, 100]
  },
  {
    key: 'life_expectancy', label: 'Life expectancy (years)', fmt: v => v.toFixed(1) + ' yrs',
    c0: [210, 50, 50], c1: [50, 185, 110]
  },
  {
    key: 'internet_pct', label: 'Internet users (%)', fmt: v => v.toFixed(1) + '%',
    c0: [35, 35, 80], c1: [20, 200, 240]
  },
  {
    key: 'urban_pct', label: 'Urban population (%)', fmt: v => v.toFixed(1) + '%',
    c0: [150, 130, 70], c1: [30, 120, 210]
  },
  {
    key: 'literacy_rate', label: 'Literacy rate (%)', fmt: v => v.toFixed(1) + '%',
    c0: [200, 80, 40], c1: [50, 100, 220]
  },
  {
    key: 'electricity_pct', label: 'Electricity access (%)', fmt: v => v.toFixed(1) + '%',
    c0: [60, 40, 20], c1: [240, 200, 50]
  },
  {
    key: 'gini', label: 'Income inequality (Gini)', fmt: v => v.toFixed(1) + ' / 100',
    c0: [50, 180, 100], c1: [220, 50, 50]
  },   // low Gini = more equal = good (green)
  {
    key: 'child_mortality', label: 'Child mortality (/ 1k births)', fmt: v => v.toFixed(1) + ' / 1k',
    c0: [50, 180, 100], c1: [220, 50, 50]
  },   // low mortality = good (green)
];

// ── localStorage persistence ──────────────────────────────────────────────────
const LS_EDITS = 'wcm_edits';
const LS_DELETED = 'wcm_deleted';

function loadEdits() { try { return JSON.parse(localStorage.getItem(LS_EDITS) || '{}'); } catch { return {}; } }
function loadDeleted() { try { return new Set(JSON.parse(localStorage.getItem(LS_DELETED) || '[]')); } catch { return new Set(); } }

function saveEditsStore(edits) { localStorage.setItem(LS_EDITS, JSON.stringify(edits)); }
function saveDeletedStore(del) { localStorage.setItem(LS_DELETED, JSON.stringify([...del])); }

// ── Schema validation ─────────────────────────────────────────────────────────
// Ensures cities-full.json is well-formed before touching the DOM.
// Logs warnings for bad records but never crashes — just skips them.
function validateCities(data) {
  if (!Array.isArray(data)) throw new Error('cities-full.json is not an array — file may be corrupt');
  const valid = [], bad = [];
  for (const c of data) {
    if (typeof c.name === 'string' && c.name &&
      typeof c.lat === 'number' && typeof c.lng === 'number') {
      valid.push(c);
    } else {
      bad.push(c);
    }
  }
  if (bad.length) console.warn(`[init] Skipped ${bad.length} malformed city records (missing name/lat/lng)`);
  if (valid.length === 0) throw new Error('cities-full.json contains no valid city records');
  return valid;
}

// ── Stable city key: QID preferred, lat,lng fallback ─────────────────────────
// QID is stable across fetch runs even if coordinates get corrected in Wikidata.
// lat,lng fallback ensures cities without QID (manual additions) still work.
function cityKey(c) {
  return c.qid || (c.lat + ',' + c.lng);
}

// ── One-time migration: lat,lng edit keys → QID keys ─────────────────────────
// Runs silently on first startup after this update. Safe to run repeatedly
// (subsequent runs are no-ops since keys are already QIDs).
function migrateEditKeys(cities) {
  const coordToQid = new Map();
  for (const c of cities) {
    if (c.qid) coordToQid.set(c.lat + ',' + c.lng, c.qid);
  }

  // Edits
  const edits = loadEdits();
  const editKeys = Object.keys(edits);
  const oldEditKeys = editKeys.filter(k => /^-?\d/.test(k) && k.includes(','));
  if (oldEditKeys.length > 0) {
    const migrated = {};
    let count = 0;
    for (const [k, v] of Object.entries(edits)) {
      const newKey = /^-?\d/.test(k) && k.includes(',') ? (coordToQid.get(k) ?? null) : k;
      if (newKey) { migrated[newKey] = v; count++; }
    }
    saveEditsStore(migrated);
    console.log(`[init] Migrated ${count} city edits to QID keys`);
  }

  // Deletions
  const deleted = loadDeleted();
  const oldDelKeys = [...deleted].filter(k => /^-?\d/.test(k) && k.includes(','));
  if (oldDelKeys.length > 0) {
    const migrated = new Set();
    for (const k of deleted) {
      const newKey = /^-?\d/.test(k) && k.includes(',') ? (coordToQid.get(k) ?? null) : k;
      if (newKey) migrated.add(newKey);
    }
    saveDeletedStore(migrated);
    console.log(`[init] Migrated ${oldDelKeys.length} deleted-city entries to QID keys`);
  }
}

// ── Apply stored edits/deletions on top of rawCities ─────────────────────────
function applyOverrides() {
  const edits = loadEdits();
  const deleted = loadDeleted();
  allCities = rawCities
    .filter(c => !deleted.has(c._key))
    .map(c => {
      const ov = edits[c._key];
      return ov ? { ...c, ...ov } : c;
    });
  // show "Reset all" link only if there are any local changes
  const hasChanges = Object.keys(edits).length > 0 || deleted.size > 0;
  document.getElementById('reset-all-btn').style.display = hasChanges ? '' : 'none';
}

// ── Color scale: log-population → continuous color + opacity ────────────────
// Population is mapped logarithmically to a 0–1 intensity value,
// then interpolated through a 6-stop color ramp (cool dim → hot bright).
const COLOR_STOPS = [
  [0.00, [80, 50, 200]],   // dim indigo   — ~10k
  [0.28, [40, 120, 255]],   // blue          — ~100k
  [0.50, [20, 200, 210]],   // cyan/teal     — ~600k
  [0.68, [80, 220, 80]],   // green         — ~2M
  [0.82, [250, 210, 30]],   // amber         — ~7M
  [0.92, [250, 120, 20]],   // orange        — ~18M
  [1.00, [240, 30, 30]],   // red           — 40M+
];

function popToT(pop) {
  if (!pop || pop <= 0) return 0;
  const lo = Math.log10(10_000);
  const hi = Math.log10(40_000_000);
  return Math.min(1, Math.max(0, (Math.log10(pop) - lo) / (hi - lo)));
}

function lerpRGB(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function wikiCityColor(pop) {
  const t = popToT(pop);
  for (let i = 1; i < COLOR_STOPS.length; i++) {
    const [t0, c0] = COLOR_STOPS[i - 1];
    const [t1, c1] = COLOR_STOPS[i];
    if (t <= t1) {
      const [r, g, b] = lerpRGB(c0, c1, (t - t0) / (t1 - t0));
      return `rgb(${r},${g},${b})`;
    }
  }
  return 'rgb(240,30,30)';
}

// Opacity also scales with intensity: dim for tiny cities, bright for large
function wikiCityOpacity(pop) { return 0.35 + popToT(pop) * 0.60; }

// Radius also scales with population (sqrt scale, 2–12px)
function wikiCityRadius(pop) { return Math.max(2, Math.min(12, Math.sqrt(pop / 1e6) * 3)); }

function fmtPop(pop) {
  if (pop == null) return '—';
  if (pop >= 1e6) return (pop / 1e6).toFixed(1) + 'M';
  if (pop >= 1e3) return (pop / 1e3).toFixed(0) + 'k';
  return String(pop);
}
function fmtNum(n) { return n == null ? '—' : n.toLocaleString(); }

// ── Build / rebuild map marker layer ─────────────────────────────────────────
function rebuildMapLayer() {
  if (wikiLayer) map.removeLayer(wikiLayer);
  wikiLayer = L.layerGroup();
  allCities.forEach(function (city) {
    const color = wikiCityColor(city.pop);
    const radius = wikiCityRadius(city.pop);
    const location = [city.admin, city.country].filter(Boolean).join(', ');
    let tip = `<strong>${escHtml(city.name)}</strong>`;
    if (location) tip += `<br/><span style="color:#8b949e;font-size:0.8em">${escHtml(location)}</span>`;
    if (city.desc) tip += `<br/><span style="color:#c9d1d9;font-size:0.8em;font-style:italic">${escHtml(city.desc)}</span>`;
    tip += `<br/>Population: <strong>${fmtPop(city.pop)}</strong>`;
    if (city.qid) {
      const coCount = companiesData[city.qid]?.length || 0;
      tip += `<br/><span style="display:flex;gap:10px;margin-top:3px">`;
      tip += `<a href="#" onclick="event.preventDefault();openWikiSidebar('${city.qid}','${escAttr(city.name)}')" style="color:#58a6ff;font-size:0.8em">Wikipedia ↗</a>`;
      if (coCount > 0)
        tip += `<a href="#" onclick="event.preventDefault();openCorpPanel('${city.qid}','${escAttr(city.name)}')" style="color:#a371f7;font-size:0.8em">Corporations (${coCount}) ↗</a>`;
      tip += `</span>`;
    }
    const opacity = wikiCityOpacity(city.pop);
    L.circleMarker([city.lat, city.lng], {
      radius, fillColor: color, fillOpacity: opacity,
      color, opacity: opacity, weight: 0.5,
      pane: 'cityPane',
    }).bindPopup(tip, { maxWidth: 260, minWidth: 160 }).addTo(wikiLayer);
  });
  wikiLayer.addTo(map);
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function updateStats() {
  const cities = allCities;
  const total = cities.reduce((s, c) => s + (c.pop || 0), 0);
  document.getElementById('stat-count').textContent = cities.length.toLocaleString();
  document.getElementById('stat-largest').textContent =
    cities[0] ? cities[0].name + ' (' + (cities[0].pop / 1e6).toFixed(1) + 'M)' : '—';
  document.getElementById('stat-total').textContent = (total / 1e9).toFixed(2) + 'B';
  document.getElementById('wiki-legend-title').textContent =
    cities.length.toLocaleString() + ' cities on map · circle size and color = population';
}

// ── Filter + sort ─────────────────────────────────────────────────────────────
function applyFilters() {
  const search = document.getElementById('f-search').value.trim().toLowerCase();
  const country = document.getElementById('f-country').value;
  const minPop = parseInt(document.getElementById('f-minpop').value) || 0;
  const [col, dir] = document.getElementById('f-sort').value.split('-');
  sortCol = col; sortDir = dir;
  updateSortHeaders();

  filtered = allCities.filter(c => {
    if (search && !(c.name || '').toLowerCase().includes(search)) return false;
    if (country && c.country !== country) return false;
    if (minPop && (c.pop || 0) < minPop) return false;
    return true;
  });
  sortFiltered();
  visibleCount = PAGE_SIZE;
  renderRows();
}

function sortFiltered() {
  const edits = loadEdits();
  filtered.sort((a, b) => {
    let av, bv;
    if (sortCol === 'pop') { av = a.pop ?? -Infinity; bv = b.pop ?? -Infinity; }
    else if (sortCol === 'name') { av = a.name ?? ''; bv = b.name ?? ''; }
    else if (sortCol === 'country') { av = a.country ?? ''; bv = b.country ?? ''; }
    else if (sortCol === 'founded') {
      av = a.founded ?? (sortDir === 'asc' ? Infinity : -Infinity);
      bv = b.founded ?? (sortDir === 'asc' ? Infinity : -Infinity);
    }
    else return 0;
    if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortDir === 'asc' ? av - bv : bv - av;
  });
}

function updateSortHeaders() {
  document.querySelectorAll('thead th[data-col]').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.col === sortCol) th.classList.add('sort-' + sortDir);
  });
}

// ── Render list rows ──────────────────────────────────────────────────────────
function renderRows() {
  const edits = loadEdits();
  const tbody = document.getElementById('list-body');
  const slice = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;

  tbody.innerHTML = slice.map(city => {
    const color = wikiCityColor(city.pop);
    const isEdited = !!edits[city._key];
    const rowClass = isEdited ? 'edited-row' : '';
    const key = escAttr(city._key);
    return `<tr class="${rowClass}" onclick="flyTo(${city.lat},${city.lng})">
      <td class="city-dot"><span class="dot" style="background:${color}"></span></td>
      <td class="city-edit" onclick="event.stopPropagation()">
        <button class="edit-btn" onclick="openModal('${key}')">✎</button>
      </td>
      <td class="city-name">${escHtml(city.name)}${isEdited ? ' <span style="color:#f97316;font-size:0.75em" title="Locally edited">✎</span>' : ''}</td>
      <td>${escHtml(city.country || '—')}</td>
      <td>${escHtml(city.admin || '—')}</td>
      <td class="city-pop">${fmtPop(city.pop)}</td>
      <td>${fmtNum(city.area_km2)}</td>
      <td>${city.founded != null ? city.founded : '—'}</td>
      <td>${escHtml(city.timezone || '—')}</td>
      <td>${city.qid ? `<a href="https://www.wikidata.org/wiki/Special:GoToLinkedPage/enwiki/${city.qid}" target="_blank" style="color:#58a6ff;font-size:0.8em;text-decoration:none" title="Open Wikipedia article">↗ Wiki</a>` : '—'}</td>
    </tr>`;
  }).join('');

  document.getElementById('list-meta-text').textContent =
    `Showing ${Math.min(visibleCount, filtered.length).toLocaleString()} of ${filtered.length.toLocaleString()} cities`;

  const moreRow = document.getElementById('load-more-row');
  moreRow.style.display = hasMore ? '' : 'none';
  if (hasMore) {
    document.getElementById('load-more-btn').textContent =
      `Show more (${(filtered.length - visibleCount).toLocaleString()} remaining)`;
  }
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escAttr(str) {
  return String(str ?? '').replace(/'/g, '&#39;');
}

// ── Fly to city ───────────────────────────────────────────────────────────────
function flyTo(lat, lng) {
  map.flyTo([lat, lng], 10, { duration: 1.2 });
  document.getElementById('map-wrapper').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Edit modal ────────────────────────────────────────────────────────────────
function openModal(key) {
  const city = allCities.find(c => c._key === key);
  if (!city) return;
  editingKey = key;

  document.getElementById('modal-title').textContent = `Edit — ${city.name}`;
  document.getElementById('e-name').value = city.name ?? '';
  document.getElementById('e-pop').value = city.pop ?? '';
  document.getElementById('e-country').value = city.country ?? '';
  document.getElementById('e-admin').value = city.admin ?? '';
  document.getElementById('e-desc').value = city.desc ?? '';
  document.getElementById('e-area').value = city.area_km2 ?? '';
  document.getElementById('e-founded').value = city.founded ?? '';
  document.getElementById('e-lat').value = city.lat;
  document.getElementById('e-lng').value = city.lng;
  document.getElementById('e-timezone').value = city.timezone ?? '';

  document.getElementById('edit-modal').classList.add('open');
}

function closeModal() {
  document.getElementById('edit-modal').classList.remove('open');
  editingKey = null;
}

function saveEdit() {
  if (!editingKey) return;
  const edits = loadEdits();
  const numOrNull = v => v === '' ? null : Number(v);

  edits[editingKey] = {
    name: document.getElementById('e-name').value.trim() || undefined,
    pop: numOrNull(document.getElementById('e-pop').value),
    country: document.getElementById('e-country').value.trim() || null,
    admin: document.getElementById('e-admin').value.trim() || null,
    desc: document.getElementById('e-desc').value.trim() || null,
    area_km2: numOrNull(document.getElementById('e-area').value),
    founded: numOrNull(document.getElementById('e-founded').value),
    lat: Number(document.getElementById('e-lat').value),
    lng: Number(document.getElementById('e-lng').value),
    timezone: document.getElementById('e-timezone').value.trim() || null,
  };
  // strip undefined keys
  Object.keys(edits[editingKey]).forEach(k => {
    if (edits[editingKey][k] === undefined) delete edits[editingKey][k];
  });

  saveEditsStore(edits);
  closeModal();
  refresh();
}

function deleteCity() {
  if (!editingKey) return;
  if (!confirm('Remove this city from the map and list? (You can reset all edits later.)')) return;
  const deleted = loadDeleted();
  deleted.add(editingKey);
  saveDeletedStore(deleted);

  // also remove any pending edit for it
  const edits = loadEdits();
  delete edits[editingKey];
  saveEditsStore(edits);

  closeModal();
  refresh();
}

function resetAll() {
  if (!confirm('Reset all your edits and deletions? The original dataset will be restored.')) return;
  localStorage.removeItem(LS_EDITS);
  localStorage.removeItem(LS_DELETED);
  refresh();
}

// ── Full refresh after any edit ───────────────────────────────────────────────
function refresh() {
  applyOverrides();
  rebuildMapLayer();
  updateStats();
  populateCountryFilter();
  applyFilters();
}

// ── Header-click sort ─────────────────────────────────────────────────────────
function initHeaderSort() {
  document.querySelectorAll('thead th[data-col]').forEach(th => {
    th.addEventListener('click', function () {
      const col = this.dataset.col;
      if (sortCol === col) { sortDir = sortDir === 'asc' ? 'desc' : 'asc'; }
      else { sortCol = col; sortDir = (col === 'name' || col === 'country') ? 'asc' : 'desc'; }
      const selectVal = `${sortCol}-${sortDir}`;
      const sel = document.getElementById('f-sort');
      for (const opt of sel.options) { if (opt.value === selectVal) { sel.value = selectVal; break; } }
      updateSortHeaders();
      sortFiltered();
      visibleCount = PAGE_SIZE;
      renderRows();
    });
  });
}

// ── Country dropdown ──────────────────────────────────────────────────────────
function populateCountryFilter() {
  const sel = document.getElementById('f-country');
  const current = sel.value;
  const countries = [...new Set(allCities.map(c => c.country).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">All countries</option>';
  countries.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    if (c === current) opt.selected = true;
    sel.appendChild(opt);
  });
}

// ── Close modal on backdrop click ─────────────────────────────────────────────
document.getElementById('edit-modal').addEventListener('click', function (e) {
  if (e.target === this) closeModal();
});

// ── Lightbox ──────────────────────────────────────────────────────────────────
let lightboxImages = [];
let lightboxIdx = 0;

function openLightbox(images, idx) {
  lightboxImages = images;
  lightboxIdx = idx;
  document.getElementById('wiki-lightbox').classList.add('open');
  renderLightboxFrame();
}
function closeLightbox() {
  document.getElementById('wiki-lightbox').classList.remove('open');
}
function lightboxNav(dir) {
  lightboxIdx = (lightboxIdx + dir + lightboxImages.length) % lightboxImages.length;
  renderLightboxFrame();
}
function renderLightboxFrame() {
  document.getElementById('lightbox-img').src = lightboxImages[lightboxIdx];
  document.getElementById('lightbox-counter').textContent =
    lightboxImages.length > 1 ? `${lightboxIdx + 1} / ${lightboxImages.length}` : '';
  document.getElementById('lightbox-prev').style.display = lightboxImages.length > 1 ? '' : 'none';
  document.getElementById('lightbox-next').style.display = lightboxImages.length > 1 ? '' : 'none';
}
document.getElementById('wiki-lightbox').addEventListener('click', function (e) {
  if (e.target === this) closeLightbox();
});
document.addEventListener('keydown', function (e) {
  const lb = document.getElementById('wiki-lightbox');
  if (!lb.classList.contains('open')) return;
  if (e.key === 'ArrowLeft') lightboxNav(-1);
  if (e.key === 'ArrowRight') lightboxNav(1);
  if (e.key === 'Escape') closeLightbox();
});

// ── Wikipedia image fetching ──────────────────────────────────────────────────

// Filename patterns that indicate non-photo images (icons, flags, maps, etc.)
const IMG_EXCLUDE = /flag|coat|coa_|locator|location_map|location map|icon|emblem|seal|logo|banner|signature|blank|symbol|layout|streets|district|wikisource|wikidata|commons-logo|silhouette|\.svg$/i;

// ── Carousel state ────────────────────────────────────────────────────────────
let carImages = [];
let carIdx = 0;
let carTimer = null;

function carStart(images) {
  carImages = images;
  carIdx = 0;
  clearInterval(carTimer);
  if (images.length > 1) carTimer = setInterval(() => carGo(1), 4500);
}
function carStop() { clearInterval(carTimer); carTimer = null; }
function carGo(dir) {
  carIdx = (carIdx + dir + carImages.length) % carImages.length;
  carRender();
}
function carJump(i) {
  carIdx = i; carRender();
  carStop();
  if (carImages.length > 1) carTimer = setInterval(() => carGo(1), 4500);
}
function carRender() {
  const img = document.getElementById('wiki-car-img');
  const counter = document.getElementById('wiki-car-counter');
  if (!img) return;
  img.classList.add('fade');
  setTimeout(() => {
    img.src = carImages[carIdx];
    img.classList.remove('fade');
  }, 180);
  if (counter) counter.textContent = `${carIdx + 1} / ${carImages.length}`;
  document.querySelectorAll('.wiki-car-dot').forEach((d, i) =>
    d.classList.toggle('active', i === carIdx));
}

// ── Wikipedia sidebar ─────────────────────────────────────────────────────────

function closeWikiSidebar() {
  carStop();
  document.getElementById('wiki-sidebar').classList.remove('open');
}

// Render the infobox using city Wikidata fields + optional Wikipedia API data
function renderInfobox(city, images, wpExtra, wpUrl, fromCache) {
  const body = document.getElementById('wiki-sidebar-body');
  const footer = document.getElementById('wiki-sidebar-footer');

  // ── Carousel ──
  let carouselHtml = '';
  if (images && images.length > 0) {
    window._lbImgs = images;
    const dots = images.map((_, i) =>
      `<button class="wiki-car-dot${i === 0 ? ' active' : ''}" onclick="carJump(${i})"></button>`
    ).join('');
    carouselHtml = `
      <div class="wiki-carousel"
           onmouseenter="carStop()"
           onmouseleave="if(carImages.length>1) carTimer=setInterval(()=>carGo(1),4500)">
        <img id="wiki-car-img" class="wiki-carousel-img"
             src="${escHtml(images[0])}"
             onclick="openLightbox(window._lbImgs, carIdx)" alt="" />
        ${images.length > 1 ? `
          <div class="wiki-car-overlay">
            <button class="wiki-car-btn" onclick="carGo(-1)">&#8249;</button>
            <div class="wiki-car-dots">${dots}</div>
            <button class="wiki-car-btn" onclick="carGo(1)">&#8250;</button>
          </div>
          <div class="wiki-car-counter" id="wiki-car-counter">1 / ${images.length}</div>
        ` : ''}
      </div>`;
  }

  // ── Data row helper ──
  function row(label, val, isHtml) {
    if (val == null || val === '') return '';
    const cellVal = isHtml ? val : escHtml(String(val));
    return `<tr>
      <td class="wiki-info-label">${escHtml(label)}</td>
      <td class="wiki-info-val">${cellVal}</td>
    </tr>`;
  }

  // ── Computed fields ──
  const density = (city.pop && city.area_km2)
    ? Math.round(city.pop / city.area_km2).toLocaleString() + ' /km\u00b2'
    : null;
  const foundedFmt = city.founded != null
    ? (city.founded < 0 ? Math.abs(city.founded) + ' BC' : city.founded.toString())
    : null;
  const websiteHtml = city.website
    ? `<a href="${escHtml(city.website)}" target="_blank" rel="noopener">${escHtml(city.website.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a>`
    : null;
  const sistersHtml = city.sister_cities && city.sister_cities.length
    ? escHtml(city.sister_cities.slice(0, 8).join(', '))
    + (city.sister_cities.length > 8 ? ` <span style="color:#6e7681">+${city.sister_cities.length - 8} more</span>` : '')
    : null;
  const coordsFmt = city.lat != null
    ? `${Math.abs(city.lat).toFixed(4)}\u00b0${city.lat >= 0 ? 'N' : 'S'}, ${Math.abs(city.lng).toFixed(4)}\u00b0${city.lng >= 0 ? 'E' : 'W'}`
    : null;
  const gdpHtml = wpExtra && wpExtra.gdp
    ? `${wpExtra.gdp} <span style="color:#6e7681;font-size:0.75em">(local currency)</span>`
    : null;
  const hdi = wpExtra && wpExtra.hdi ? wpExtra.hdi.toFixed(3) : null;
  // Nicknames: prefer array from infobox supplement, fall back to Wikidata P1449
  const nicknamesArr = city.nicknames && city.nicknames.length ? city.nicknames
    : (wpExtra && wpExtra.nickname ? [wpExtra.nickname] : null);
  const nicknamesHtml = nicknamesArr
    ? nicknamesArr.map(n => escHtml(n)).join('<br>')
    : null;

  // Leaders from infobox supplement
  const leadersHtml = city.leaders && city.leaders.length
    ? city.leaders.map(l =>
      `<tr><td class="wiki-info-label">${escHtml(l.title)}</td><td class="wiki-info-val">${escHtml(l.name)}</td></tr>`
    ).join('')
    : '';

  // Population notes
  const popMetroFmt = city.pop_metro != null ? fmtNum(city.pop_metro) : null;
  const popUrbanFmt = city.pop_urban != null ? fmtNum(city.pop_urban) : null;
  const popAsOf = city.pop_as_of ? ` <span style="color:#484f58;font-size:0.72em">${city.pop_as_of}</span>` : '';

  // ── Section builder ──
  function section(title, rowArr) {
    const content = rowArr.join('');
    if (!content.trim()) return '';
    return `<tr><td colspan="2" class="wiki-info-section-head">${title}</td></tr>${content}`;
  }

  const geonamesHtml = city.geonames_id
    ? `<a href="https://www.geonames.org/${escHtml(String(city.geonames_id))}" target="_blank" rel="noopener">${escHtml(String(city.geonames_id))}</a>`
    : null;

  const tzFmt = city.timezone
    ? (city.utc_offset ? `${escHtml(city.timezone)} (${escHtml(city.utc_offset)})` : escHtml(city.timezone))
    : (city.utc_offset ? escHtml(city.utc_offset) : null);

  const locationSec = section('Location', [
    row('Country', city.country || ''),
    row('Region', city.admin || ''),
    city.settlement_type ? row('Type', city.settlement_type) : '',
    row('ISO code', city.iso || ''),
    tzFmt ? `<tr><td class="wiki-info-label">Timezone</td><td class="wiki-info-val">${tzFmt}</td></tr>` : '',
    row('Coordinates', coordsFmt),
    row('Elevation', city.elev_m != null ? fmtNum(city.elev_m) + ' m' : null),
  ]);
  const govSec = leadersHtml
    ? `<tr><td colspan="2" class="wiki-info-section-head">Government</td></tr>${leadersHtml}`
    : '';
  const demoSec = section('Demographics', [
    city.pop != null
      ? `<tr><td class="wiki-info-label">Population</td><td class="wiki-info-val">${escHtml(fmtNum(city.pop))}${popAsOf}</td></tr>`
      : '',
    popMetroFmt ? row('Metro area', popMetroFmt) : '',
    popUrbanFmt ? row('Urban area', popUrbanFmt) : '',
    row('Density', density),
    row('Area', city.area_km2 != null ? fmtNum(city.area_km2) + ' km\u00b2' : null),
  ]);
  const historySec = section('History', [
    row('Founded', foundedFmt),
    nicknamesHtml ? `<tr><td class="wiki-info-label">Known as</td><td class="wiki-info-val">${nicknamesHtml}</td></tr>` : '',
  ]);
  const economySec = section('Economy', [
    row('GDP', gdpHtml, !!gdpHtml),
    row('HDI', hdi),
  ]);
  const linksSec = section('Links', [
    row('Website', websiteHtml, !!websiteHtml),
    row('Sister cities', sistersHtml, !!sistersHtml),
    row('GeoNames', geonamesHtml, !!geonamesHtml),
  ]);

  // ── World Bank country context (bound via city.iso) ──
  const wb = city.iso ? countryData[city.iso] : null;
  function wbRow(label, key, fmt) {
    if (!wb || wb[key] == null) return '';
    const year = wb[key + '_year'] ? ` <span style="color:#484f58;font-size:0.72em">${wb[key + '_year']}</span>` : '';
    return row(label, escHtml(fmt(wb[key])) + year, true);
  }
  const wbSec = wb ? section('Country context · ' + escHtml(wb.name || city.country || city.iso) + ' <span style="color:#484f58;font-size:0.75em">(World Bank)</span>', [
    wbRow('GDP / capita', 'gdp_per_capita', v => '$' + Math.round(v).toLocaleString()),
    wbRow('Life expectancy', 'life_expectancy', v => v.toFixed(1) + ' yrs'),
    wbRow('Urban pop.', 'urban_pct', v => v.toFixed(1) + '%'),
    wbRow('Internet users', 'internet_pct', v => v.toFixed(1) + '%'),
    wbRow('Gini index', 'gini', v => v.toFixed(1) + ' / 100'),
    wbRow('Literacy rate', 'literacy_rate', v => v.toFixed(1) + '%'),
    wbRow('Child mortality', 'child_mortality', v => v.toFixed(1) + ' / 1k'),
    wbRow('Electricity access', 'electricity_pct', v => v.toFixed(1) + '%'),
    wbRow('Income level', 'income_level', v => v),
  ]) : '';

  // ── Climate chart ──
  const climateHtml = (() => {
    const cl = city.climate;
    if (!cl || !cl.months || !cl.months.length) return '';

    const mons = cl.months;  // array of 12 month objects
    // Determine what data is available
    const hasTemp = mons.some(m => m.high_c != null || m.low_c != null);
    const hasPrec = mons.some(m => m.precipitation_mm != null);
    const hasSun = mons.some(m => m.sun != null);
    if (!hasTemp && !hasPrec) return '';

    const MON_LABELS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

    // Temperature range sparkline (SVG bar chart, high=top, low=bottom)
    const CHART_W = 220, CHART_H = 70;
    const barW = Math.floor(CHART_W / 12) - 1;

    // Find temp range for scaling
    const allTemps = mons.flatMap(m => [m.high_c, m.low_c, m.mean_c].filter(v => v != null));
    const allPrec = mons.map(m => m.precipitation_mm || 0);
    const tMin = allTemps.length ? Math.min(...allTemps) : 0;
    const tMax = allTemps.length ? Math.max(...allTemps) : 30;
    const tRange = tMax - tMin || 1;
    const pMax = Math.max(...allPrec, 1);

    const tY = v => v == null ? null : Math.round(CHART_H - ((v - tMin) / tRange) * (CHART_H - 4) - 2);

    // Build SVG bars + temp line
    let svgBars = '', svgLine = '', svgPoints = '', svgPrecBars = '';
    mons.forEach((m, i) => {
      const x = i * (barW + 1);
      // Precipitation bars (blue, background)
      if (hasPrec && m.precipitation_mm != null) {
        const bh = Math.round((m.precipitation_mm / pMax) * (CHART_H - 4));
        svgPrecBars += `<rect x="${x}" y="${CHART_H - bh}" width="${barW}" height="${bh}" fill="#1f6feb" opacity="0.35" rx="1"/>`;
      }
      // Temp range bar (high to low)
      if (m.high_c != null && m.low_c != null) {
        const y1 = tY(m.high_c), y2 = tY(m.low_c);
        svgBars += `<rect x="${x + 1}" y="${y1}" width="${barW - 2}" height="${Math.max(y2 - y1, 1)}" fill="#f78166" rx="1"/>`;
      }
      // Mean temp line
      if (m.mean_c != null) {
        const y = tY(m.mean_c);
        const cx2 = x + Math.floor(barW / 2);
        svgPoints += `${i === 0 ? 'M' : 'L'}${cx2},${y} `;
      }
    });
    if (svgPoints) svgLine = `<path d="${svgPoints.trim()}" fill="none" stroke="#ffa657" stroke-width="1.5" stroke-linejoin="round"/>`;

    // Month labels row
    const labelCells = MON_LABELS.map((l, i) => {
      const m = mons[i] || {};
      const t = m.high_c != null ? `${m.high_c > 0 ? '+' : ''}${m.high_c}° / ${m.low_c != null ? m.low_c + '°' : '—'}` : '';
      const p = m.precipitation_mm != null ? `${m.precipitation_mm}mm` : '';
      return `<td title="${escHtml(t + (t && p ? '  ' : '') + p)}" style="text-align:center;font-size:0.6rem;color:#8b949e;padding:0 1px;cursor:default">${l}</td>`;
    }).join('');

    // Source label
    const sourceLabel = cl.location
      ? `<div style="font-size:0.65rem;color:#484f58;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(cl.location)}</div>`
      : '';

    // Legend
    const legend = [
      hasTemp ? `<span style="display:inline-flex;align-items:center;gap:3px"><span style="display:inline-block;width:10px;height:8px;background:#f78166;border-radius:1px"></span> High/low</span>` : '',
      mons.some(m => m.mean_c != null) ? `<span style="display:inline-flex;align-items:center;gap:3px"><span style="display:inline-block;width:10px;height:2px;background:#ffa657;"></span> Mean</span>` : '',
      hasPrec ? `<span style="display:inline-flex;align-items:center;gap:3px"><span style="display:inline-block;width:10px;height:8px;background:#1f6feb;opacity:0.6;border-radius:1px"></span> Precip.</span>` : '',
    ].filter(Boolean).join(' ');

    return `
      <div class="wiki-climate-wrap">
        <div class="wiki-climate-head">Climate</div>
        <svg viewBox="0 0 ${CHART_W} ${CHART_H}" width="100%" height="${CHART_H}" style="display:block;overflow:visible">
          ${svgPrecBars}${svgBars}${svgLine}
        </svg>
        <table style="width:100%;border-collapse:collapse"><tr>${labelCells}</tr></table>
        <div style="font-size:0.65rem;color:#8b949e;margin-top:4px;display:flex;gap:8px;flex-wrap:wrap">${legend}</div>
        ${sourceLabel}
      </div>`;
  })();

  // ── Extract (Wikipedia article intro) ──
  const wpExtract = wpExtra && wpExtra.extract ? wpExtra.extract : null;
  const extractHtml = wpExtract ? `
    <div class="wiki-extract-wrap">
      <div class="wiki-extract-head">Overview</div>
      <div class="wiki-extract collapsed" id="wiki-extract-text">${escHtml(wpExtract)}</div>
      <button class="wiki-expand-btn" id="wiki-expand-btn" onclick="toggleExtract()">Show more</button>
    </div>` : '';

  body.innerHTML = `
    ${carouselHtml}
    <div class="wiki-city-header">
      <div class="wiki-city-name">${escHtml(city.name)}</div>
      ${city.desc ? `<div class="wiki-city-desc">${escHtml(city.desc)}</div>` : ''}
    </div>
    <table class="wiki-info-table">
      ${locationSec}
      ${govSec}
      ${demoSec}
      ${historySec}
      ${economySec}
      ${linksSec}
      ${wbSec}
    </table>
    ${climateHtml}
    ${extractHtml}
  `;

  if (images && images.length > 0) carStart(images);

  // ── Footer links ──
  const wikiLink = wpUrl
    ? `<a class="wiki-footer-link" href="${escHtml(wpUrl)}" target="_blank" rel="noopener">
         <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#58a6ff" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
         Read full article on Wikipedia
       </a>`
    : '';
  const siteLink = city.website
    ? `<a class="wiki-footer-link" href="${escHtml(city.website)}" target="_blank" rel="noopener">
         <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#58a6ff" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1-4-10z"/></svg>
         Official website
       </a>`
    : '';

  footer.innerHTML = (wikiLink || siteLink)
    ? wikiLink + siteLink + `<span class="wiki-cache-note">${fromCache ? 'Cached \u00b7 ' : ''}Data from Wikipedia &amp; Wikidata</span>`
    : '';
}

function toggleExtract() {
  const el = document.getElementById('wiki-extract-text');
  const btn = document.getElementById('wiki-expand-btn');
  if (!el) return;
  const collapsed = el.classList.toggle('collapsed');
  btn.textContent = collapsed ? 'Show more' : 'Show less';
}

async function openWikiSidebar(qid, cityName) {
  const sidebar = document.getElementById('wiki-sidebar');
  const body = document.getElementById('wiki-sidebar-body');
  const footer = document.getElementById('wiki-sidebar-footer');
  const titleEl = document.getElementById('wiki-sidebar-title');

  titleEl.textContent = cityName;
  footer.innerHTML = '';
  sidebar.dataset.qid = qid;
  sidebar.classList.add('open');

  // Find full city object
  const city = allCities.find(c => c.qid === qid);

  // If we already stored Wikipedia data in the city object (from a previous click),
  // render immediately — no API call needed
  if (city?.wiki_images?.length || city?.wiki_thumb || city?.wiki_extract) {
    // Prefer stored Wikipedia title (added by fetch-city-infoboxes); fall back to
    // Special:GoToLinkedPage/wikidata/{qid} which redirects via the Wikidata sitelink.
    const wpUrl = city.wikipedia
      ? `https://en.wikipedia.org/wiki/${encodeURIComponent(city.wikipedia).replace(/%20/g, '_')}`
      : city.qid
        ? `https://en.wikipedia.org/wiki/Special:GoToLinkedPage/wikidata/${city.qid}`
        : null;
    const cachedImages = city.wiki_images?.length
      ? city.wiki_images
      : (city.wiki_thumb ? [city.wiki_thumb] : []);
    renderInfobox(city, cachedImages, { extract: city.wiki_extract ?? null }, wpUrl, true);
    return;
  }

  // Show loading state with Wikidata fields while fetching Wikipedia
  if (city) {
    body.innerHTML = `<div class="wiki-loading"><div class="spinner"></div><span>Loading Wikipedia article…</span></div>`;
    // Render Wikidata fields immediately below spinner
  } else {
    body.innerHTML = `<div class="wiki-loading"><div class="spinner"></div><span>Loading…</span></div>`;
  }

  try {
    // Step 1: resolve QID → Wikipedia article title
    const wdRes = await fetch(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(qid)}&props=sitelinks&sitefilter=enwiki&format=json&origin=*`
    );
    if (!wdRes.ok) throw new Error(`Wikidata API returned ${wdRes.status}`);
    const wdJson = await wdRes.json();
    const sitelink = wdJson.entities?.[qid]?.sitelinks?.enwiki?.title;
    if (!sitelink) throw new Error('No English Wikipedia article found for this city.');

    // Step 2: fetch summary + image list + Wikidata claims in parallel
    const [wpRes, imgListRes, wdClaimsRes] = await Promise.all([
      fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(sitelink)}`),
      fetch('https://en.wikipedia.org/w/api.php?' + new URLSearchParams({
        action: 'query', prop: 'images', titles: sitelink,
        imlimit: '30', format: 'json', origin: '*',
      })),
      fetch(`https://www.wikidata.org/w/api.php?` + new URLSearchParams({
        action: 'wbgetentities', ids: qid, props: 'claims',
        format: 'json', origin: '*',
      })),
    ]);
    if (!wpRes.ok) throw new Error(`Wikipedia summary API returned ${wpRes.status}`);
    const wpJson = await wpRes.json();

    const fallbackThumb = wpJson.originalimage?.source ?? wpJson.thumbnail?.source ?? null;
    const wpExtract = wpJson.extract ?? null;
    const wpUrl = wpJson.content_urls?.desktop?.page
      ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(sitelink)}`;

    // Parse extra Wikidata claims
    let wpExtra = { extract: wpExtract };
    try {
      const wdClaims = await wdClaimsRes.json();
      const claims = wdClaims.entities?.[qid]?.claims ?? {};
      // GDP (P2131)
      const gdpVal = claims.P2131?.[0]?.mainsnak?.datavalue?.value?.amount;
      if (gdpVal) {
        const n = Math.abs(parseFloat(gdpVal));
        wpExtra.gdp = n >= 1e12 ? (n / 1e12).toFixed(2) + ' trillion'
          : n >= 1e9 ? (n / 1e9).toFixed(1) + ' billion'
            : n >= 1e6 ? (n / 1e6).toFixed(1) + ' million'
              : fmtNum(Math.round(n));
      }
      // HDI (P1081)
      const hdiVal = claims.P1081?.[0]?.mainsnak?.datavalue?.value?.amount;
      if (hdiVal) wpExtra.hdi = parseFloat(hdiVal);
      // Nickname (P1449) - English only
      const nickClaims = claims.P1449 ?? [];
      const nickEn = nickClaims.find(c => c.mainsnak?.datavalue?.value?.language === 'en');
      if (nickEn) wpExtra.nickname = nickEn.mainsnak.datavalue.value.text;
    } catch { /* claims fetch is non-critical */ }

    // Step 3: resolve image URLs (filter icons/flags/maps, keep real photos)
    let images = [];
    try {
      const imgListJson = await imgListRes.json();
      const pageKey = Object.keys(imgListJson.query?.pages ?? {})[0];
      const rawImgs = imgListJson.query?.pages?.[pageKey]?.images ?? [];

      const candidates = rawImgs
        .filter(img => /\.(jpe?g|png|webp)$/i.test(img.title))
        .filter(img => !IMG_EXCLUDE.test(img.title))
        .slice(0, 12);

      if (candidates.length > 0) {
        const infoRes = await fetch(
          'https://en.wikipedia.org/w/api.php?' + new URLSearchParams({
            action: 'query', prop: 'imageinfo',
            iiprop: 'url|size', titles: candidates.map(t => t.title).join('|'),
            iiurlwidth: '900', format: 'json', origin: '*',
          })
        );
        const infoJson = await infoRes.json();
        images = Object.values(infoJson.query?.pages ?? {})
          .filter(p => { const i = p.imageinfo?.[0]; return i && i.width >= 300 && i.height >= 200; })
          .map(p => p.imageinfo[0].thumburl ?? p.imageinfo[0].url)
          .filter(Boolean)
          .slice(0, 8);
      }
    } catch { /* image fetching is non-critical */ }

    // Ensure the main Wikipedia thumbnail leads the gallery
    if (fallbackThumb && !images.includes(fallbackThumb)) images.unshift(fallbackThumb);

    // Render the full infobox
    if (city) {
      renderInfobox(city, images, wpExtra, wpUrl, false);
    } else {
      body.innerHTML = `
        <div>
          ${images[0] ? `<img class="wiki-img" src="${escHtml(images[0])}" alt="" style="width:100%;max-height:220px;object-fit:cover;display:block" />` : ''}
          <div style="padding:16px;font-size:0.85rem;line-height:1.65;color:#c9d1d9">${escHtml(wpExtra?.extract ?? '')}</div>
        </div>`;
      footer.innerHTML = `<a class="wiki-footer-link" href="${escHtml(wpUrl)}" target="_blank" rel="noopener">Read full article on Wikipedia ↗</a>`;
    }

    // Step 4: persist to server (fire-and-forget) — future opens load instantly
    if (images.length || wpExtract) {
      fetch('/api/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qid, wiki_thumb: images[0] ?? null, wiki_extract: wpExtract, wiki_images: images }),
      }).then(r => r.json()).then(json => {
        if (json.changed && city) {
          if (images.length) city.wiki_images = images;
          if (images[0]) city.wiki_thumb = images[0];
          if (wpExtract) city.wiki_extract = wpExtract;
        }
      }).catch(() => { /* non-critical */ });
    }

  } catch (err) {
    // Fallback: always show Wikidata-only card — never a blank sidebar
    if (city) {
      renderInfobox(city, [], {}, null, false);
      const errNote = document.createElement('div');
      errNote.className = 'wiki-error';
      errNote.innerHTML = `<em>Could not load Wikipedia article: ${escHtml(err.message)}</em><br/>
        <a href="https://www.wikidata.org/wiki/Special:GoToLinkedPage/enwiki/${qid}" target="_blank" rel="noopener">Try opening Wikipedia directly ↗</a>`;
      document.getElementById('wiki-sidebar-body').appendChild(errNote);
    } else {
      body.innerHTML = `<div class="wiki-error">${escHtml(err.message)}<br/>
        <a href="https://www.wikidata.org/wiki/Special:GoToLinkedPage/enwiki/${qid}" target="_blank" rel="noopener">Try opening Wikipedia directly ↗</a></div>`;
    }
  }
}

// Close sidebar on Escape (not lightbox — lightbox has its own handler)
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && !document.getElementById('wiki-lightbox').classList.contains('open'))
    closeWikiSidebar();
});

// ── Boot ──────────────────────────────────────────────────────────────────────
async function init() {
  showLoading(true, 'Loading world map…');

  map = L.map('map-container', {
    center: [20, 0], zoom: 2, minZoom: 2, maxZoom: 18,
    zoomControl: true, attributionControl: true,
    maxBounds: [[-88, -185], [88, 185]],   // hard stop just past antimeridian
    maxBoundsViscosity: 1.0,               // no elasticity — tiles always fill the view
    worldCopyJump: false,
  });

  // ── Leaflet pane z-index registry ────────────────────────────────────────────
  // Leaflet built-ins for reference: tilePane=200, overlayPane=400, shadowPane=500,
  // markerPane=600, tooltipPane=650, popupPane=700.
  //
  // Custom pane stack (lowest → highest):
  //   choroplethPane  350  — country fill polygons; always below everything interactive
  //   tradePane       390  — BEA trade-flow arc lines; non-interactive, above choropleth
  //   cityPane        400  — city dot markers (CircleMarkers); same level as overlayPane
  //   econPane        420  — economic center dots; highest custom pane so econ clicks win
  //
  // Rules for future layers:
  //   • New non-interactive overlays  → use tradePane (390) or add a new pane < 400
  //   • New interactive dot layers    → add a pane between cityPane and econPane (401–419)
  //     unless they must beat econ dots for mouse events (then > 420, but beware of
  //     blocking econ clicks everywhere else)
  //   • Never assign the same z-index to two panes that compete for mouse events
  // ─────────────────────────────────────────────────────────────────────────────
  map.createPane('choroplethPane');
  map.getPane('choroplethPane').style.zIndex = 350;
  map.createPane('tradePane');
  map.getPane('tradePane').style.zIndex = 390;
  map.createPane('cityPane');
  map.getPane('cityPane').style.zIndex = 400;
  map.createPane('econPane');
  map.getPane('econPane').style.zIndex = 420;

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> ' +
      'contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd', maxZoom: 20,
  }).addTo(map);

  // Rebuild economic layer clusters whenever zoom changes
  map.on('zoomend', () => { if (econOn) buildEconLayer(); });

  // Close trade panel when clicking bare map; in draw mode, add vertex instead.
  // Use a 220ms debounce so the two click events that fire before dblclick are
  // suppressed — without this, double-clicking to close adds 2 stray vertices.
  let _drawClickTimer = null;
  map.on('click', e => {
    if (_drawActive) {
      _drawClickTimer = setTimeout(() => { _drawClickTimer = null; _drawAddVertex(e.latlng); }, 220);
      return;
    }
    closeTradePanelFn();
  });
  map.on('dblclick', e => {
    if (_drawActive) {
      if (_drawClickTimer) { clearTimeout(_drawClickTimer); _drawClickTimer = null; }
      L.DomEvent.preventDefault(e);
      _drawFinish();
    }
  });
  // Escape key cancels draw mode
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && (_drawActive || _drawPolygon)) _drawClear();
  });

  const terminator = L.terminator({
    fillColor: '#0a0f1a', fillOpacity: 0.45,
    color: '#334155', weight: 1, opacity: 0.6, interactive: false,
  }).addTo(map);
  setInterval(() => terminator.setTime(new Date()), 60_000);

  // ── Phase 2: load city data (required) + country/geo data (optional) in parallel ──
  showLoading(true, 'Loading city dataset…');
  try {
    const [citiesRes, countryRes, geoRes, companiesRes] = await Promise.all([
      fetch('/cities-full.json'),
      fetch('/country-data.json').catch(() => null),
      fetch('/world-countries.json').catch(() => null),
      fetch('/companies.json').catch(() => null),   // graceful — run npm run fetch-companies
    ]);

    if (!citiesRes.ok) throw new Error(`Could not load cities-full.json (HTTP ${citiesRes.status})`);
    const raw = await citiesRes.json();

    // ── Phase 3: validate + assign stable keys ──
    rawCities = validateCities(raw);
    rawCities.forEach(c => { c._key = cityKey(c); });

    // ── Phase 4: migrate any legacy lat,lng edit keys → QID ──
    migrateEditKeys(rawCities);

    // ── Phase 5: load World Bank country data (optional) ──
    if (countryRes && countryRes.ok) {
      try {
        countryData = await countryRes.json();
        console.log(`[init] Country data loaded (${Object.keys(countryData).length} countries)`);
      } catch {
        console.warn('[init] country-data.json is malformed — World Bank data will be unavailable');
      }
    } else {
      console.info('[init] country-data.json not found — run "npm run fetch-country" to enable World Bank indicators');
    }

    // ── Phase 5b: load companies data (optional) ──
    if (companiesRes && companiesRes.ok) {
      try {
        companiesData = await companiesRes.json();
        const n = Object.keys(companiesData).length;
        console.log(`[init] Companies data loaded (${n} cities with HQ data)`);
      } catch {
        console.warn('[init] companies.json is malformed');
      }
    } else {
      console.info('[init] companies.json not found — run "npm run fetch-companies"');
    }

    // ── Phase 5c: load world country borders GeoJSON (optional, for choropleth) ──
    if (geoRes && geoRes.ok) {
      try {
        worldGeo = await geoRes.json();
        console.log(`[init] World GeoJSON loaded (${worldGeo.features.length} features)`);
        _computeCountryCentroids();
      } catch {
        console.warn('[init] world-countries.json is malformed — choropleth unavailable');
      }
    } else {
      console.info('[init] world-countries.json not found — run "npm run fetch-world-geo" to enable choropleth');
    }

    // ── Phase 6: apply overrides + build UI ──
    applyOverrides();
    rebuildMapLayer();
    if (worldGeo && Object.keys(countryData).length) {
      buildChoropleth();
      initChoroControls();
    }
    updateStats();
    showLoading(false);

    // Trade year slider + country dropdown
    document.getElementById('trade-year-slider').addEventListener('input', function () {
      const iso2 = this.dataset.iso2;
      const data = tradeCache[iso2];
      if (!data) return;
      const yr = parseInt(this.value, 10);
      _updateTradePanelNumbers(iso2, data, yr);
      drawTradeArrows(iso2, data, yr);
    });
    _populateTradeCountryDropdown();

    // ── FX rates: load from localStorage or auto-fetch latest ECB rates ──
    if (!_fxLoadFromLS()) {
      // First visit — silently fetch latest rates in background (no UI shown yet)
      fxFetchRates().catch(() => {});
    }

    populateCountryFilter();
    document.getElementById('f-search').addEventListener('input', applyFilters);
    document.getElementById('f-country').addEventListener('change', applyFilters);
    document.getElementById('f-minpop').addEventListener('change', applyFilters);
    document.getElementById('f-sort').addEventListener('change', applyFilters);
    document.getElementById('load-more-btn').addEventListener('click', function () {
      visibleCount += PAGE_SIZE;
      renderRows();
    });
    initHeaderSort();

    filtered = [...allCities];
    renderRows();
    document.getElementById('list-panel').style.display = '';

    // ── Economic centers + global corp list (requires companies data) ──
    if (Object.keys(companiesData).length) {
      document.getElementById('econ-bar').style.display = '';
      buildGlobalCorpList();
    }
  } catch (err) {
    showLoadingError(err.message);
  }
}

// ── Choropleth helpers ────────────────────────────────────────────────────────

function choroLerpRGB(c0, c1, t) {
  return [
    Math.round(c0[0] + (c1[0] - c0[0]) * t),
    Math.round(c0[1] + (c1[1] - c0[1]) * t),
    Math.round(c0[2] + (c1[2] - c0[2]) * t),
  ];
}

// Returns { min, max } across all countries that have the indicator value
function choroRange(indicatorKey) {
  let min = Infinity, max = -Infinity;
  for (const iso of Object.keys(countryData)) {
    const v = countryData[iso][indicatorKey];
    if (v != null && isFinite(v)) { if (v < min) min = v; if (v > max) max = v; }
  }
  return (min <= max) ? { min, max } : null;
}

// Returns CSS color string for a country ISO-2 code + indicator config
function choroColor(iso2, ind, range) {
  const c = countryData[iso2];
  if (!c) return '#1c2128';
  const v = c[ind.key];
  if (v == null || !isFinite(v)) return '#1c2128';
  const t = range ? Math.max(0, Math.min(1, (v - range.min) / (range.max - range.min))) : 0.5;
  const [r, g, b] = choroLerpRGB(ind.c0, ind.c1, t);
  return `rgb(${r},${g},${b})`;
}

function buildChoropleth() {
  if (!worldGeo || !choroOn) return;
  if (choroplethLayer) { map.removeLayer(choroplethLayer); choroplethLayer = null; }

  const ind = CHORO_INDICATORS.find(i => i.key === activeChoroKey) || CHORO_INDICATORS[0];
  const range = choroRange(ind.key);
  let covered = 0;

  choroplethLayer = L.geoJSON(worldGeo, {
    pane: 'choroplethPane',
    style: function (feature) {
      const iso2 = feature.properties && feature.properties.iso2;
      const hasData = iso2 && countryData[iso2] && countryData[iso2][ind.key] != null;
      if (hasData) covered++;
      return {
        fillColor: choroColor(iso2, ind, range),
        fillOpacity: hasData ? 0.70 : 0.12,
        color: '#30363d',
        weight: 0.6,
        opacity: 0.8,
      };
    },
    onEachFeature: function (feature, layer) {
      const iso2 = feature.properties && feature.properties.iso2;
      layer.on({
        mouseover: function (e) {
          e.target.setStyle({ weight: 1.5, color: '#58a6ff', fillOpacity: e.target.options.fillOpacity + 0.15 });
          e.target.bringToFront();
        },
        mouseout: function (e) { choroplethLayer.resetStyle(e.target); },
        click: function (e) { L.DomEvent.stopPropagation(e); showCountryPopup(iso2, e.latlng); },
      });
    },
  }).addTo(map);

  // Bring city markers on top of choropleth by re-adding the layer
  if (wikiLayer) { map.removeLayer(wikiLayer); wikiLayer.addTo(map); }

  // Update legend
  updateChoroLegend(ind, range, covered);
}

function updateChoroLegend(ind, range, covered) {
  const lo = document.getElementById('choro-lo-label');
  const hi = document.getElementById('choro-hi-label');
  const cv = document.getElementById('choro-coverage');
  const canvas = document.getElementById('choro-ramp');
  const ctx = canvas.getContext('2d');

  if (range) {
    lo.textContent = ind.fmt(range.min);
    hi.textContent = ind.fmt(range.max);
  } else {
    lo.textContent = '—'; hi.textContent = '—';
  }
  cv.textContent = covered ? `(${covered} countries)` : '';

  // Draw gradient
  const grad = ctx.createLinearGradient(0, 0, 120, 0);
  for (let s = 0; s <= 10; s++) {
    const t = s / 10;
    const [r, g, b] = choroLerpRGB(ind.c0, ind.c1, t);
    grad.addColorStop(t, `rgb(${r},${g},${b})`);
  }
  ctx.clearRect(0, 0, 120, 8);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 120, 8);
}

function showCountryPopup(iso2, latlng) {
  if (!iso2) return;
  const c = countryData[iso2];
  if (!c) return;

  const ind = CHORO_INDICATORS.find(i => i.key === activeChoroKey);
  const rows = [
    ['GDP per capita', c.gdp_per_capita != null ? '$' + Math.round(c.gdp_per_capita).toLocaleString() + (c.gdp_per_capita_year ? ` <small style="color:#484f58">${c.gdp_per_capita_year}</small>` : '') : null],
    ['Life expectancy', c.life_expectancy != null ? c.life_expectancy.toFixed(1) + ' yrs' : null],
    ['Internet users', c.internet_pct != null ? c.internet_pct.toFixed(1) + '%' : null],
    ['Urban population', c.urban_pct != null ? c.urban_pct.toFixed(1) + '%' : null],
    ['Literacy rate', c.literacy_rate != null ? c.literacy_rate.toFixed(1) + '%' : null],
    ['Electricity access', c.electricity_pct != null ? c.electricity_pct.toFixed(1) + '%' : null],
    ['Income inequality (Gini)', c.gini != null ? c.gini.toFixed(1) + ' / 100' : null],
    ['Child mortality', c.child_mortality != null ? c.child_mortality.toFixed(1) + ' / 1k' : null],
    ['Income level', c.income_level || null],
  ].filter(([, v]) => v != null);

  const tableRows = rows.map(([label, val]) => {
    const isActive = ind && CHORO_INDICATORS.find(i => i.key === activeChoroKey) &&
      label.toLowerCase().includes(activeChoroKey.replace(/_/g, ' ').slice(0, 6));
    return `<tr><td>${escHtml(label)}</td><td class="${isActive ? 'choro-popup-highlight' : ''}">${val}</td></tr>`;
  }).join('');

  const wbUrl = wbCountryUrl(iso2);
  const html = `
    <div class="choro-popup-name">${escHtml(c.name || iso2)}</div>
    <div class="choro-popup-region">${escHtml(c.region || '')} · World Bank data</div>
    <table class="choro-popup-table">${tableRows}</table>
    ${wbUrl ? `<a href="${wbUrl}" target="_blank" rel="noopener"
       style="display:inline-flex;align-items:center;gap:5px;margin-top:10px;color:#58a6ff;font-size:0.78rem;text-decoration:none;">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
        <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
      </svg>
      View on World Bank
    </a>` : ''}`;

  // Smart offset: keep popup within map bounds (no top-cutoff, no right-cutoff)
  const containerPt = map.latLngToContainerPoint(latlng);
  const mapH = map.getContainer().clientHeight;
  const mapW = map.getContainer().clientWidth;
  const POPUP_H = 280;
  let oy = 0, ox = 0;
  if (containerPt.y - POPUP_H < 10) oy = POPUP_H - containerPt.y + 20;
  if (containerPt.x > mapW - 160) ox = -(containerPt.x - (mapW - 170));

  L.popup({ maxWidth: 280, className: '', autoPan: false, offset: L.point(ox, oy) })
    .setLatLng(latlng)
    .setContent(html)
    .openOn(map);

  // Trigger trade flow arrows (async, non-blocking)
  _loadAndShowTrade(iso2, c.name || iso2);
}

// ── Trade flow arrows (BEA API) ──────────────────────────────────────────────

// ISO-2 → BEA country name (BEA uses display names, not ISO codes)
const ISO2_TO_BEA = {
  AU:'Australia', AT:'Austria', BE:'Belgium', BR:'Brazil', CA:'Canada',
  CL:'Chile', CN:'China', CO:'Colombia', CZ:'Czech Republic', DK:'Denmark',
  EG:'Egypt', FI:'Finland', FR:'France', DE:'Germany', GR:'Greece',
  HK:'Hong Kong', HU:'Hungary', IN:'India', ID:'Indonesia', IE:'Ireland',
  IL:'Israel', IT:'Italy', JP:'Japan', JO:'Jordan', KE:'Kenya', KW:'Kuwait',
  MY:'Malaysia', MX:'Mexico', MA:'Morocco', NL:'Netherlands', NZ:'New Zealand',
  NG:'Nigeria', NO:'Norway', OM:'Oman', PK:'Pakistan', PE:'Peru',
  PH:'Philippines', PL:'Poland', PT:'Portugal', QA:'Qatar', RU:'Russia',
  SA:'Saudi Arabia', ZA:'South Africa', KR:'South Korea', ES:'Spain',
  SE:'Sweden', CH:'Switzerland', TW:'Taiwan', TH:'Thailand', TR:'Turkey',
  AE:'United Arab Emirates', GB:'United Kingdom', VN:'Vietnam',
  BD:'Bangladesh', AR:'Argentina', UA:'Ukraine', RO:'Romania', SK:'Slovak Republic',
  DZ:'Algeria', GT:'Guatemala', HN:'Honduras', CR:'Costa Rica', PA:'Panama',
  DO:'Dominican Republic', CU:'Cuba', TT:'Trinidad and Tobago',
  KZ:'Kazakhstan', UZ:'Uzbekistan', AZ:'Azerbaijan', GE:'Georgia',
  AM:'Armenia', LB:'Lebanon', IQ:'Iraq', LK:'Sri Lanka', MM:'Burma',
  KH:'Cambodia', MN:'Mongolia', ET:'Ethiopia', GH:'Ghana', TZ:'Tanzania',
  AO:'Angola', ZM:'Zambia', MZ:'Mozambique', BW:'Botswana', MU:'Mauritius',
  EC:'Ecuador', VE:'Venezuela', UY:'Uruguay', BO:'Bolivia', PY:'Paraguay',
  SV:'El Salvador', NI:'Nicaragua', BZ:'Belize', JM:'Jamaica',
  AF:'Afghanistan', NP:'Nepal', FJ:'Fiji', PG:'Papua New Guinea',
  BG:'Bulgaria', HR:'Croatia', RS:'Serbia', SI:'Slovenia', LU:'Luxembourg',
  CY:'Cyprus', MT:'Malta', LT:'Lithuania', LV:'Latvia', EE:'Estonia',
  MD:'Moldova', BA:'Bosnia and Herzegovina', AL:'Albania', MK:'North Macedonia',
  LY:'Libya', SD:'Sudan', YE:'Yemen', SY:'Syria', TN:'Tunisia',
  CM:'Cameroon', SN:'Senegal', CD:'Democratic Republic of the Congo',
  CI:"Cote d'Ivoire", MG:'Madagascar', RW:'Rwanda', UG:'Uganda',
};

function _computeCountryCentroids() {
  if (!worldGeo) return;
  for (const feat of worldGeo.features) {
    const iso2 = feat.properties?.iso2;
    if (!iso2) continue;
    const pts = [];
    const collect = ring => ring.forEach(([lng, lat]) => pts.push([lat, lng]));
    const g = feat.geometry;
    if (g.type === 'Polygon') g.coordinates.forEach(collect);
    else if (g.type === 'MultiPolygon') g.coordinates.forEach(p => p.forEach(collect));
    if (pts.length) {
      countryCentroids[iso2] = [
        pts.reduce((s, c) => s + c[0], 0) / pts.length,
        pts.reduce((s, c) => s + c[1], 0) / pts.length,
      ];
    }
  }
}

async function fetchBeaTrade(beaCountryName) {
  // Fetch goods AND services in one call
  const url = 'https://apps.bea.gov/api/data/?UserID=YOUR_BEA_API_KEY_HERE' +
    '&method=GetData&DataSetName=ITA&Indicator=ExpGds,ImpGds,ExpSvcs,ImpSvcs' +
    `&AreaOrCountry=${encodeURIComponent(beaCountryName)}&Frequency=A&Year=ALL&ResultFormat=JSON`;
  const res = await fetch(url);
  const json = await res.json();
  const rows = json?.BEAAPI?.Results?.Data;
  if (!rows) return null;
  const byYear = {};
  for (const r of rows) {
    const yr = parseInt(r.TimePeriod, 10);
    if (isNaN(yr)) continue;
    const raw = parseFloat((r.DataValue || '').replace(/,/g, ''));
    if (isNaN(raw)) continue;
    const val = raw * 1e6;  // millions → dollars
    if (!byYear[yr]) byYear[yr] = { year: yr };
    if (r.Indicator === 'ExpGds')  byYear[yr].expGds  = val;
    if (r.Indicator === 'ImpGds')  byYear[yr].impGds  = val;
    if (r.Indicator === 'ExpSvcs') byYear[yr].expSvcs = val;
    if (r.Indicator === 'ImpSvcs') byYear[yr].impSvcs = val;
  }
  return Object.values(byYear).sort((a, b) => a.year - b.year);
}

// localStorage helpers (7-day TTL keeps panel fast on repeat visits)
const LS_TRADE_PREFIX = 'bea_trade_v1_';
const LS_TRADE_TTL    = 7 * 24 * 60 * 60 * 1000;

function _saveTradeToLS(iso2, data) {
  try { localStorage.setItem(LS_TRADE_PREFIX + iso2, JSON.stringify({ ts: Date.now(), data })); } catch (_) {}
}
function _loadTradeFromLS(iso2) {
  try {
    const raw = localStorage.getItem(LS_TRADE_PREFIX + iso2);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > LS_TRADE_TTL) { localStorage.removeItem(LS_TRADE_PREFIX + iso2); return null; }
    return data;
  } catch (_) { return null; }
}

// ISO-2 → flag emoji via Unicode regional indicators
function isoToFlag(iso2) {
  if (!iso2 || iso2.length !== 2) return '🌐';
  return [...iso2.toUpperCase()].map(c =>
    String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)
  ).join('');
}

// Capital city coordinates — used as arrow endpoints instead of polygon centroids
const CAPITAL_COORDS = {
  US:[38.91,-77.04],  AU:[-35.28,149.13], AT:[48.21,16.37],  BE:[50.85,4.35],
  BR:[-15.78,-47.93], CA:[45.42,-75.69],  CL:[-33.46,-70.65],CN:[39.91,116.39],
  CO:[4.71,-74.07],   CZ:[50.08,14.44],   DK:[55.68,12.57],  EG:[30.06,31.25],
  FI:[60.17,24.94],   FR:[48.86,2.35],    DE:[52.52,13.41],  GR:[37.98,23.73],
  HK:[22.32,114.17],  HU:[47.50,19.04],   IN:[28.61,77.21],  ID:[-6.21,106.85],
  IE:[53.33,-6.25],   IL:[31.78,35.22],   IT:[41.90,12.50],  JP:[35.69,139.69],
  JO:[31.96,35.95],   KE:[-1.29,36.82],   KW:[29.37,47.98],  MY:[3.14,101.69],
  MX:[19.43,-99.13],  MA:[34.02,-6.85],   NL:[52.37,4.89],   NZ:[-41.29,174.78],
  NG:[9.07,7.40],     NO:[59.91,10.75],   OM:[23.61,58.59],  PK:[33.72,73.04],
  PE:[-12.04,-77.03], PH:[14.60,120.98],  PL:[52.23,21.01],  PT:[38.72,-9.14],
  QA:[25.29,51.53],   RU:[55.75,37.62],   SA:[24.69,46.72],  ZA:[-25.74,28.19],
  KR:[37.57,126.98],  ES:[40.42,-3.70],   SE:[59.33,18.07],  CH:[46.95,7.45],
  TW:[25.04,121.56],  TH:[13.75,100.52],  TR:[39.92,32.85],  AE:[24.47,54.37],
  GB:[51.51,-0.13],   VN:[21.03,105.83],  BD:[23.72,90.41],  AR:[-34.61,-58.38],
  UA:[50.45,30.52],   RO:[44.44,26.10],   SK:[48.15,17.11],  DZ:[36.74,3.06],
  GT:[14.64,-90.51],  HN:[14.10,-87.21],  CR:[9.93,-84.08],  PA:[8.99,-79.52],
  DO:[18.48,-69.90],  CU:[23.13,-82.38],  TT:[10.65,-61.52], KZ:[51.18,71.45],
  UZ:[41.30,69.24],   AZ:[40.41,49.87],   GE:[41.69,44.83],  AM:[40.18,44.51],
  LB:[33.89,35.50],   IQ:[33.34,44.40],   LK:[6.93,79.85],   MM:[16.87,96.19],
  KH:[11.55,104.92],  MN:[47.91,106.89],  ET:[9.03,38.74],   GH:[5.56,-0.20],
  TZ:[-6.80,39.27],   AO:[-8.84,13.23],   ZM:[-15.42,28.28], MZ:[-25.97,32.57],
  BW:[-24.65,25.91],  MU:[-20.16,57.50],  EC:[-0.22,-78.51], VE:[10.50,-66.92],
  UY:[-34.90,-56.19], BO:[-16.50,-68.15], PY:[-25.28,-57.64],SV:[13.69,-89.19],
  NI:[12.14,-86.28],  BZ:[17.25,-88.77],  JM:[17.99,-76.79], AF:[34.53,69.17],
  NP:[27.70,85.32],   FJ:[-18.14,178.44], PG:[-9.44,147.18], BG:[42.70,23.32],
  HR:[45.81,15.97],   RS:[44.82,20.46],   SI:[46.05,14.51],  LU:[49.61,6.13],
  CY:[35.17,33.36],   MT:[35.90,14.51],   LT:[54.69,25.28],  LV:[56.95,24.11],
  EE:[59.44,24.75],   MD:[47.00,28.86],   BA:[43.85,18.40],  AL:[41.33,19.82],
  MK:[41.99,21.43],   LY:[32.90,13.18],   SD:[15.55,32.53],  TN:[36.82,10.17],
  CM:[3.87,11.52],    SN:[14.69,-17.44],  CD:[-4.32,15.32],  MG:[-18.91,47.54],
  RW:[-1.94,30.06],   UG:[0.32,32.58],    CI:[5.36,-4.01],
};

// Great-circle arc between two [lat,lng] points with a perpendicular offset
// offsetDir +1 / -1 separates export and import arrows visually
function _tradeArc(lat1, lon1, lat2, lon2, offsetDir) {
  // Normalise longitude to use the shorter path (avoid wrapping the long way)
  let lon2a = lon2;
  if (lon2a - lon1 > 180)  lon2a -= 360;
  if (lon2a - lon1 < -180) lon2a += 360;

  const dl = lat2 - lat1, dn = lon2a - lon1;
  const len = Math.sqrt(dl * dl + dn * dn) || 1;

  // Midpoint of the chord
  const midLat = (lat1 + lat2) / 2;
  const midLon = (lon1 + lon2a) / 2;

  // Perpendicular unit vector × 5° offset — keeps curve reasonable at any distance
  const ctrl = [
    midLat + (-dn / len) * 5 * offsetDir,
    midLon + ( dl / len) * 5 * offsetDir,
  ];

  // 40-point quadratic Bezier
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40, u = 1 - t;
    pts.push([
      u * u * lat1 + 2 * u * t * ctrl[0] + t * t * lat2,
      u * u * lon1 + 2 * u * t * ctrl[1] + t * t * lon2a,
    ]);
  }
  return pts;
}

function _tradeArrowWeight(usd) {
  const log = Math.log10(Math.max(usd, 1e9));
  return Math.max(2, Math.min(14, 2 + 12 * (log - 9) / (12 - 9)));
}

function drawTradeArrows(iso2, data, year) {
  clearTradeArrows();
  // Use capital city as anchor; fall back to polygon centroid
  const targetPt = CAPITAL_COORDS[iso2] || countryCentroids[iso2];
  const usPt     = CAPITAL_COORDS['US'];
  if (!targetPt) return;

  const row = data.find(d => d.year === year) || data[data.length - 1];
  if (!row) return;

  const markers = [];
  const expTotal = (row.expGds || 0) + (row.expSvcs || 0);
  const impTotal = (row.impGds || 0) + (row.impSvcs || 0);

  // Export: US → country (blue, offset +1 so arc curves one way)
  if (expTotal > 0) {
    const pts = _tradeArc(usPt[0], usPt[1], targetPt[0], targetPt[1], 1);
    markers.push(L.polyline(pts, {
      color: '#58a6ff', weight: _tradeArrowWeight(expTotal),
      opacity: 0.85, className: 'trade-arrow-export',
      pane: 'tradePane', interactive: false,
    }));
    // Arrowhead dot at destination
    markers.push(L.circleMarker(targetPt, {
      radius: Math.max(4, _tradeArrowWeight(expTotal) * 0.65),
      color: '#58a6ff', fillColor: '#58a6ff', fillOpacity: 0.9, weight: 0,
      pane: 'tradePane', interactive: false,
    }));
  }

  // Import: country → US (gold, offset −1 so arc curves the other way)
  if (impTotal > 0) {
    const pts = _tradeArc(targetPt[0], targetPt[1], usPt[0], usPt[1], -1);
    markers.push(L.polyline(pts, {
      color: '#f0a500', weight: _tradeArrowWeight(impTotal),
      opacity: 0.85, className: 'trade-arrow-import',
      pane: 'tradePane', interactive: false,
    }));
    markers.push(L.circleMarker(usPt, {
      radius: Math.max(4, _tradeArrowWeight(impTotal) * 0.65),
      color: '#f0a500', fillColor: '#f0a500', fillOpacity: 0.9, weight: 0,
      pane: 'tradePane', interactive: false,
    }));
  }

  tradeArrowLayer = L.layerGroup(markers).addTo(map);
}

function clearTradeArrows() {
  if (tradeArrowLayer) { map.removeLayer(tradeArrowLayer); tradeArrowLayer = null; }
}

// Render a trade-balance sparkline as inline SVG (goods balance, last 16 years)
function _renderTradeSparkline(data) {
  if (!data || data.length < 2) return '';
  const recent   = data.slice(-16);
  const balances = recent.map(d => (d.expGds || 0) - (d.impGds || 0));
  const maxAbs   = Math.max(...balances.map(Math.abs), 1);
  const W = 258, H = 34, gap = 2;
  const barW = Math.max(1, Math.floor((W - gap * (recent.length - 1)) / recent.length));
  const bars = recent.map((d, i) => {
    const bal  = (d.expGds || 0) - (d.impGds || 0);
    const norm = bal / maxAbs;
    const barH = Math.max(2, Math.abs(norm) * (H / 2 - 2));
    const y    = norm >= 0 ? H / 2 - barH : H / 2;
    const fill = norm >= 0 ? '#3fb950' : '#f85149';
    return `<rect x="${i * (barW + gap)}" y="${y.toFixed(1)}" width="${barW}" height="${barH.toFixed(1)}" fill="${fill}" rx="1" opacity="0.8"/>`;
  }).join('');
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block">
    <line x1="0" y1="${H/2}" x2="${W}" y2="${H/2}" stroke="#30363d" stroke-width="1"/>
    ${bars}
  </svg>
  <div class="trade-spark-labels">
    <span>${recent[0].year}</span><span>${recent[recent.length - 1].year}</span>
  </div>`;
}

// Pull top companies for a country from our existing companiesData
function _getTopCompaniesByIso(iso2, limit = 6) {
  const cos = [];
  for (const city of allCities) {
    if (city.iso !== iso2) continue;
    for (const co of (companiesData[city.qid] || [])) {
      if (co.name) cos.push(co);
    }
  }
  const fallbackCur = ISO2_TO_CURRENCY[iso2] || null;
  cos.sort((a, b) => toUSD(b.revenue || 0, b.revenue_currency || fallbackCur) - toUSD(a.revenue || 0, a.revenue_currency || fallbackCur));
  return cos.slice(0, limit);
}

// Populate country dropdown once — called after init
function _populateTradeCountryDropdown() {
  const sel = document.getElementById('trade-country-select');
  if (!sel) return;
  const entries = Object.entries(ISO2_TO_BEA).sort((a, b) => a[1].localeCompare(b[1]));
  sel.innerHTML = '<option value="">— pick a country —</option>' +
    entries.map(([iso2, name]) =>
      `<option value="${iso2}">${isoToFlag(iso2)} ${escHtml(name)}</option>`
    ).join('');
  sel.addEventListener('change', function () {
    const iso2 = this.value;
    if (iso2) _loadAndShowTrade(iso2, ISO2_TO_BEA[iso2]);
  });
}

function openTradePanel(iso2, countryName, data) {
  const latestYear = data[data.length - 1]?.year || 2024;

  // Header
  document.getElementById('trade-panel-flag').textContent  = isoToFlag(iso2);
  document.getElementById('trade-panel-title').textContent = `${countryName} ↔ US`;

  // Sync dropdown
  const sel = document.getElementById('trade-country-select');
  if (sel) sel.value = iso2;

  // Year slider
  const slider = document.getElementById('trade-year-slider');
  slider.min   = data[0]?.year || 1999;
  slider.max   = latestYear;
  slider.value = latestYear;
  slider.dataset.iso2 = iso2;

  // Sparkline (static — same regardless of selected year)
  document.getElementById('trade-spark').innerHTML = _renderTradeSparkline(data);

  // Top companies from our existing data
  const topCos = _getTopCompaniesByIso(iso2, 6);
  document.getElementById('trade-companies-list').innerHTML = topCos.length
    ? topCos.map(co => {
        const rev = co.revenue ? `<span class="tco-rev">$${fmtRevenue(toUSD(co.revenue, co.revenue_currency))}</span>` : '';
        const ind = co.industry ? `<span class="tco-ind">${escHtml(co.industry)}</span>` : '';
        return `<div class="tco-row"><span class="tco-name">${escHtml(co.name)}</span>${ind}${rev}</div>`;
      }).join('')
    : '<div class="tco-empty">No company data available</div>';

  _updateTradePanelNumbers(iso2, data, latestYear);
  drawTradeArrows(iso2, data, latestYear);
  document.getElementById('trade-panel').classList.add('open');
}

function _updateTradePanelNumbers(iso2, data, year) {
  const row = data.find(d => d.year === year) || data[data.length - 1];
  if (!row) return;
  document.getElementById('trade-year-label').textContent = year;

  const fmt = v => v ? '$' + fmtRevenue(v) : '—';
  document.getElementById('tg-exp-gds').textContent  = fmt(row.expGds);
  document.getElementById('tg-imp-gds').textContent  = fmt(row.impGds);
  document.getElementById('tg-exp-svcs').textContent = fmt(row.expSvcs);
  document.getElementById('tg-imp-svcs').textContent = fmt(row.impSvcs);

  const totalExp = (row.expGds || 0) + (row.expSvcs || 0);
  const totalImp = (row.impGds || 0) + (row.impSvcs || 0);
  const balance  = totalExp - totalImp;
  const balEl    = document.getElementById('trade-balance-val');
  balEl.textContent  = (balance >= 0 ? '+' : '\u2212') + '$' + fmtRevenue(Math.abs(balance));
  balEl.style.color  = balance >= 0 ? '#3fb950' : '#f85149';
  document.getElementById('trade-balance-label').textContent = balance >= 0 ? 'US surplus' : 'US deficit';
}

function closeTradePanelFn() {
  document.getElementById('trade-panel').classList.remove('open');
  clearTradeArrows();
}

async function _loadAndShowTrade(iso2, countryName) {
  if (iso2 === 'US') return;
  const beaName = ISO2_TO_BEA[iso2];
  if (!beaName) return;

  if (!tradeCache[iso2]) {
    // Check localStorage before hitting the API
    const cached = _loadTradeFromLS(iso2);
    if (cached) {
      tradeCache[iso2] = cached;
    } else {
      document.getElementById('trade-panel-flag').textContent  = '⏳';
      document.getElementById('trade-panel-title').textContent = 'Loading…';
      document.getElementById('trade-panel').classList.add('open');
      try {
        const data = await fetchBeaTrade(beaName);
        if (!data || !data.length) {
          document.getElementById('trade-panel-title').textContent = `No BEA data for ${countryName}`;
          return;
        }
        tradeCache[iso2] = data;
        _saveTradeToLS(iso2, data);
      } catch (_) {
        document.getElementById('trade-panel-title').textContent = 'Trade data unavailable';
        return;
      }
    }
  }
  openTradePanel(iso2, countryName, tradeCache[iso2]);
}

function toggleChoropleth() {
  choroOn = !choroOn;
  const btn = document.getElementById('choro-toggle-btn');
  if (choroOn) {
    btn.textContent = 'On';
    btn.classList.add('on');
    buildChoropleth();
  } else {
    btn.textContent = 'Off';
    btn.classList.remove('on');
    if (choroplethLayer) { map.removeLayer(choroplethLayer); choroplethLayer = null; }
  }
}

function initChoroControls() {
  const sel = document.getElementById('choro-select');
  CHORO_INDICATORS.forEach(ind => {
    const opt = document.createElement('option');
    opt.value = ind.key;
    opt.textContent = ind.label;
    if (ind.key === activeChoroKey) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', function () {
    activeChoroKey = this.value;
    buildChoropleth();
  });
  document.getElementById('choropleth-bar').style.display = '';
}

// ── City dot visibility ───────────────────────────────────────────────────────
function setCityDotMode(mode) {
  const pane = map && map.getPane('cityPane');
  if (!pane) return;
  pane.style.opacity = mode === 'hide' ? '0' : mode === 'dim' ? '0.2' : '1';
  pane.style.pointerEvents = mode === 'hide' ? 'none' : '';
  document.querySelectorAll('.city-vis-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
}

// ── Economic centers layer ───────────────────────────────────────────────────
function _drawEconColorRamp() {
  const canvas = document.getElementById('econ-color-ramp');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  for (let x = 0; x < w; x++) {
    ctx.fillStyle = econDotColor(Math.pow(10, Math.log10(5e8) + (x / w) * (Math.log10(5e12) - Math.log10(5e8))));
    ctx.fillRect(x, 0, 1, h);
  }
}

function toggleEconLayer() {
  econOn = !econOn;
  const btn = document.getElementById('econ-toggle-btn');
  if (econOn) {
    btn.textContent = 'On';
    btn.classList.add('on');
    _drawEconColorRamp();
    buildEconLayer();
  } else {
    btn.textContent = 'Off';
    btn.classList.remove('on');
    if (econLayer) { map.removeLayer(econLayer); econLayer = null; }
    collapseEconCluster();
    _econTipHide();
  }
}

// ── Econ cluster expansion ────────────────────────────────────────────────────
let _expandedLayers  = null;
let _collapseOnClick = null;   // reference kept so we can remove the map listener cleanly
let _pinnedExpansion = null;   // {group, clusterUSD, cLat, cLng} — survives zoom rebuilds

// Remove drawn expansion layers without touching the pin (used by buildEconLayer)
function _clearExpandedLayers() {
  if (_collapseOnClick) { map.off('click', _collapseOnClick); _collapseOnClick = null; }
  if (_expandedLayers) {
    _expandedLayers.forEach(l => { try { map.removeLayer(l); } catch (_) {} });
    _expandedLayers = null;
  }
}

// Full collapse: remove layers AND clear the pin so zoom no longer re-expands
function collapseEconCluster() {
  _clearExpandedLayers();
  _pinnedExpansion = null;
}

// Convex hull via Jarvis march on [[lat,lng]…] points
function _convexHull(pts) {
  const n = pts.length;
  if (n < 3) return [...pts];
  const d2 = (a, b) => (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
  let l = 0;
  for (let i = 1; i < n; i++) if (pts[i][1] < pts[l][1]) l = i;
  const hull = []; let p = l, q;
  do {
    hull.push(pts[p]); q = 0;
    for (let i = 1; i < n; i++) {
      if (q === p) { q = i; continue; }
      const cross = (pts[q][1] - pts[p][1]) * (pts[i][0] - pts[p][0])
        - (pts[q][0] - pts[p][0]) * (pts[i][1] - pts[p][1]);
      if (cross < 0 || (cross === 0 && d2(pts[p], pts[i]) > d2(pts[p], pts[q]))) q = i;
    }
    p = q;
  } while (p !== l && hull.length <= n);
  return hull;
}

// Quadratic Bezier arc as polyline (curvature scales with perpendicular offset)
function _arcLine(p1, p2, curve = 0.22) {
  const mid = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
  const dl = p2[0] - p1[0], dn = p2[1] - p1[1];
  const ctrl = [mid[0] - dn * curve, mid[1] + dl * curve];
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24, u = 1 - t;
    pts.push([u * u * p1[0] + 2 * u * t * ctrl[0] + t * t * p2[0],
    u * u * p1[1] + 2 * u * t * ctrl[1] + t * t * p2[1]]);
  }
  return pts;
}

function expandEconCluster(group, clusterUSD, cLat, cLng) {
  _clearExpandedLayers();                              // remove old visuals, keep any existing pin
  _pinnedExpansion = { group, clusterUSD, cLat, cLng }; // pin so zoom rebuilds re-expand
  const layers = [];
  const col = econDotColor(clusterUSD);
  const MAX_USD = 2e12;
  const positions = group.map(p => [p.city.lat, p.city.lng]);

  // 1. Cloud boundary — convex hull padded outward from centroid, dashed stroke
  if (positions.length >= 3) {
    const hull = _convexHull(positions);
    const padded = hull.map(([lat, lng]) => {
      const dlat = lat - cLat, dlng = lng - cLng;
      const len = Math.sqrt(dlat * dlat + dlng * dlng) || 0.001;
      const pad = Math.max(1.8, len * 0.22);
      return [lat + dlat / len * pad, lng + dlng / len * pad];
    });
    layers.push(L.polygon(padded, {
      fillColor: col, fillOpacity: 0.07,
      color: col, weight: 1.5, opacity: 0.35,
      dashArray: '7 5', pane: 'econPane', interactive: false,
    }).addTo(map));
  } else if (positions.length === 2) {
    layers.push(L.polyline(positions, {
      color: col, weight: 2, opacity: 0.3,
      dashArray: '7 5', pane: 'econPane', interactive: false,
    }).addTo(map));
  }

  // 2. Curved arcs from cluster centroid to each city
  for (const p of group) {
    layers.push(L.polyline(
      _arcLine([cLat, cLng], [p.city.lat, p.city.lng]),
      { color: col, weight: 1, opacity: 0.2, pane: 'econPane', interactive: false }
    ).addTo(map));
  }

  // 3. Individual city circles, colored + sized by their own USD value
  for (const p of group) {
    const cityCol = econDotColor(p.totalUSD);
    const logVal = Math.log10(Math.max(p.totalUSD, 1e8));
    const r = Math.max(6, Math.min(22, 5 + 17 * (logVal - 8) / (13 - 8)));
    const topCos = (p.validCos || []).slice().sort((a, b) => b.usd - a.usd).slice(0, 3);
    const tipHtml =
      `<div style="font-weight:600;color:${cityCol};margin-bottom:2px">${escHtml(p.city.name)}</div>` +
      `<div style="color:#8b949e;font-size:0.78rem;margin-bottom:4px">≈ <span style="color:${cityCol};font-weight:600">$${fmtRevenue(p.totalUSD)}</span> USD</div>` +
      topCos.map(({ co, usd }) =>
        `<div style="color:#c9d1d9;font-size:0.79rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(co.name)} <span style="color:${cityCol}">$${fmtRevenue(usd)}</span></div>`
      ).join('');

    const dot = L.circleMarker([p.city.lat, p.city.lng], {
      radius: r, color: cityCol, fillColor: cityCol,
      fillOpacity: 0.22, weight: 2, opacity: 0.9,
      pane: 'econPane', bubblingMouseEvents: false,
    });
    dot.on('mouseover', e => _econTipShow(tipHtml, e.originalEvent.clientX, e.originalEvent.clientY));
    dot.on('mousemove', e => _econTipMove(e.originalEvent.clientX, e.originalEvent.clientY));
    dot.on('mouseout', () => _econTipHide());
    dot.on('click', () => { _econTipHide(); collapseEconCluster(); openCorpPanel(p.qid, p.city.name); });
    dot.addTo(map);
    layers.push(dot);
  }

  _expandedLayers = layers;

  // Collapse when user clicks the map background (delay so this click doesn't self-trigger)
  setTimeout(() => {
    _collapseOnClick = collapseEconCluster;
    map.on('click', _collapseOnClick);
  }, 120);
}

// ── Custom econ tooltip (bypasses Leaflet tooltip to prevent flickering) ──────
// A single shared div with pointer-events:none — can never steal mouse events.
let _econTipEl = null;
function _econTipDOM() {
  if (!_econTipEl) {
    _econTipEl = document.createElement('div');
    _econTipEl.id = 'econ-custom-tip';
    document.body.appendChild(_econTipEl);
  }
  return _econTipEl;
}
function _econTipShow(html, clientX, clientY) {
  const el = _econTipDOM();
  el.innerHTML = html;
  el.style.display = 'block';
  _econTipMove(clientX, clientY);
}
function _econTipMove(clientX, clientY) {
  const el = _econTipEl;
  if (!el || el.style.display === 'none') return;
  const tw = el.offsetWidth, th = el.offsetHeight;
  const vw = window.innerWidth, vh = window.innerHeight;
  const pad = 12;
  // Default: above-right of cursor
  let x = clientX + pad;
  let y = clientY - th - pad;
  // Flip left if overflows right edge
  if (x + tw > vw - 8) x = clientX - tw - pad;
  // Flip below if overflows top edge
  if (y < 8) y = clientY + pad;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
}
function _econTipHide() {
  if (_econTipEl) _econTipEl.style.display = 'none';
}

// Color ramp for economic dots: warm gold (small) → lime green (mid) → electric cyan-teal (large).
// The hue arc 45°→188° travels through greens into teal — reads as growth/prosperity.
// Range: $500M → $5T USD
function econDotColor(totalUSD) {
  const logMin = Math.log10(5e8);   // $500M
  const logMax = Math.log10(5e12);  // $5T
  const t = Math.max(0, Math.min(1, (Math.log10(Math.max(totalUSD, 5e8)) - logMin) / (logMax - logMin)));
  const hue = Math.round(45 + t * 143);  // 45° gold → 188° cyan-teal
  const sat = Math.round(85 + t * 15);   // 85% → 100% (gets more vivid)
  const lit = Math.round(62 - t * 10);   // 62% → 52% (deepens slightly for impact)
  return `hsl(${hue},${sat}%,${lit}%)`;
}

// Grid cell size (degrees) by zoom level — controls how aggressively cities merge.
// At zoom 2 a 20° cell covers ~2000 km; by zoom 8 cells are tiny enough to be per-city.
function _econCellDeg(zoom) {
  if (zoom <= 3) return 20;
  if (zoom <= 4) return 12;
  if (zoom <= 5) return 6;
  if (zoom <= 6) return 3;
  if (zoom <= 7) return 1.5;
  return 0;  // zoom 8+ → no merging, individual city dots
}

function buildEconLayer() {
  if (!econOn) return;
  const _savedPin = _pinnedExpansion;  // preserve across rebuild so zoom keeps expansion
  _clearExpandedLayers();              // remove old expansion visuals (don't clear pin yet)
  _pinnedExpansion = null;             // reset so re-expand below is clean
  if (econLayer) { map.removeLayer(econLayer); econLayer = null; }
  if (!Object.keys(companiesData).length) return;

  const MAX_PLAUSIBLE_USD = 2e12;
  const metric = (document.getElementById('econ-metric')?.value) || 'market_cap';
  const cityByQid = {};
  for (const c of allCities) cityByQid[c.qid] = c;

  // Collect one data point per city using the selected metric (market_cap or revenue).
  // For each company: prefer the selected metric; fall back to the other if missing.
  const cityPoints = [];
  for (const [qid, companies] of Object.entries(companiesData)) {
    const city = cityByQid[qid];
    if (!city || city.lat == null || city.lng == null) continue;
    let totalUSD = 0;
    const validCos = [];
    for (const co of companies) {
      // Primary: selected metric; fallback: the other metric.
      // Currency may be null in Wikidata data — fall back to country default.
      const countryDefaultCur = ISO2_TO_CURRENCY[city.iso] || null;
      const hasPrimary = !!(co[metric] && (co[metric + '_currency'] || countryDefaultCur));
      const val = hasPrimary ? co[metric] : (co.revenue || co.market_cap);
      const rawCur = hasPrimary ? co[metric + '_currency'] : (co.revenue_currency || co.market_cap_currency);
      const cur = rawCur || countryDefaultCur;
      if (!val || !cur) continue;
      const usd = toUSD(val, cur);
      if (usd > 0 && usd <= MAX_PLAUSIBLE_USD) {
        totalUSD += usd;
        const usedMetric = hasPrimary ? metric : (co.revenue ? 'revenue' : 'market_cap');
        validCos.push({ co, usd, usedMetric });
      }
    }
    if (totalUSD <= 0) continue;
    cityPoints.push({ qid, city, totalUSD, validCos });
  }

  // ── Overlap-based clustering (zoom-adaptive) ──────────────────────────────────
  // Start with one cluster per city. Iteratively merge any two clusters whose
  // screen circles overlap (pixel distance < r1 + r2 + padding). Repeat until
  // stable. Because cities within the same country are geographically close,
  // they naturally merge into national/regional blobs at low zoom and separate
  // back into individual city dots as the user zooms in — no hard country-grouping
  // needed; geography does the work.

  let clusters = cityPoints.map(p => [p]);  // one cluster per city to start

  // Helper: compute cluster USD total and revenue-weighted lat/lng centroid
  function _clusterMeta(group) {
    const totalUSD = group.reduce((s, p) => s + p.totalUSD, 0);
    const lat = group.reduce((s, p) => s + p.city.lat * p.totalUSD, 0) / totalUSD;
    const lng = group.reduce((s, p) => s + p.city.lng * p.totalUSD, 0) / totalUSD;
    const logVal = Math.log10(Math.max(totalUSD, 1e8));
    const r = Math.max(6, Math.min(32, 4 + 28 * (logVal - 8) / (13 - 8)));
    const px = map.latLngToContainerPoint([lat, lng]);
    return { lat, lng, r, px, totalUSD };
  }

  // Phase 2: iteratively merge overlapping clusters until stable
  const OVERLAP_PAD = 4; // px — small buffer so touching circles don't flicker
  let changed = true;
  while (changed) {
    changed = false;
    const meta = clusters.map(_clusterMeta);
    outer: for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const a = meta[i], b = meta[j];
        const dx = a.px.x - b.px.x, dy = a.px.y - b.px.y;
        if (Math.sqrt(dx * dx + dy * dy) < a.r + b.r + OVERLAP_PAD) {
          clusters[i] = clusters[i].concat(clusters[j]);
          clusters.splice(j, 1);
          changed = true;
          break outer;
        }
      }
    }
  }

  // Build one marker per cluster
  const markers = [];
  for (const group of clusters) {
    const clusterUSD = group.reduce((s, p) => s + p.totalUSD, 0);
    // Revenue-weighted centroid — matches the centroid used for overlap detection
    const lat = group.reduce((s, p) => s + p.city.lat * p.totalUSD, 0) / clusterUSD;
    const lng = group.reduce((s, p) => s + p.city.lng * p.totalUSD, 0) / clusterUSD;

    // Log-scale radius: $100M → 4px, $10T → 32px
    const logVal = Math.log10(Math.max(clusterUSD, 1e8));
    const radius = Math.max(4, Math.min(32, 4 + 28 * (logVal - 8) / (13 - 8)));

    // Tooltip header
    const isMerged = group.length > 1;
    const headerLabel = isMerged
      ? `${group.length} cities`
      : escHtml(group[0].city.name);
    const subLabel = isMerged
      ? group.slice(0, 3).map(p => escHtml(p.city.name)).join(', ') + (group.length > 3 ? ` +${group.length - 3} more` : '')
      : null;

    // Top companies across the whole cluster
    const allCos = group.flatMap(p => p.validCos);
    const topCos = allCos.sort((a, b) => b.usd - a.usd).slice(0, 4);
    const metricLabel = metric === 'market_cap' ? 'Market cap' : 'Revenue';
    const topHtml = topCos.map(({ co, usd, usedMetric }) => {
      const tag = (metric === 'market_cap' && usedMetric !== 'market_cap')
        ? `<span style="color:#484f58;font-size:0.68rem"> rev</span>` : '';
      return `<div style="color:#c9d1d9;font-size:0.79rem;padding:1px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">` +
        `${escHtml(co.name)}${tag} <span style="color:#f0a500">$${fmtRevenue(usd)}</span></div>`;
    }).join('');

    const totalCorps = group.reduce((s, p) => s + p.validCos.length, 0);
    const tip =
      `<div style="font-weight:600;color:#f0a500;margin-bottom:2px">${headerLabel}</div>` +
      (subLabel ? `<div style="color:#8b949e;font-size:0.75rem;margin-bottom:3px">${subLabel}</div>` : '') +
      `<div style="color:#8b949e;font-size:0.78rem;margin-bottom:5px">${metricLabel} ≈ ` +
      `<span style="color:#f0a500;font-weight:600">$${fmtRevenue(clusterUSD)}</span> USD</div>` +
      `<div style="color:#6e7681;font-size:0.74rem;margin-bottom:4px">${totalCorps} listed corp${totalCorps !== 1 ? 's' : ''}</div>` +
      topHtml;

    const dotColor = econDotColor(clusterUSD);
    const m = L.circleMarker([lat, lng], {
      radius: Math.max(radius, 6),
      color: dotColor,
      fillColor: dotColor,
      fillOpacity: isMerged ? 0.28 : 0.18,
      weight: isMerged ? 2 : 1.5,
      opacity: 0.9,
      pane: 'econPane',
      bubblingMouseEvents: false,    // prevent click from bubbling to map collapse handler
    });
    m.on('mouseover', e => _econTipShow(tip, e.originalEvent.clientX, e.originalEvent.clientY));
    m.on('mousemove', e => _econTipMove(e.originalEvent.clientX, e.originalEvent.clientY));
    m.on('mouseout', () => _econTipHide());
    // Click: open corp panel (single city or merged cluster)
    if (!isMerged) {
      m.on('click', () => { _econTipHide(); openCorpPanel(group[0].qid, group[0].city.name); });
    } else {
      const clusterTitle = `${group.length} cities`;
      m.on('click', () => {
        _econTipHide();
        expandEconCluster(group, clusterUSD, lat, lng);
        openCorpPanelCluster(group, clusterTitle);
      });
    }
    markers.push(m);
  }

  econLayer = L.layerGroup(markers).addTo(map);
  const metricLabel = metric === 'market_cap' ? 'Market cap' : 'Revenue';
  const primaryCount = cityPoints.flatMap(p => p.validCos).filter(c => c.usedMetric === metric).length;
  const fallbackNote = metric === 'market_cap' && primaryCount < cityPoints.flatMap(p => p.validCos).length
    ? ` · ${primaryCount} mkt cap, rest revenue` : '';
  document.getElementById('econ-info').textContent =
    `${cityPoints.length} cities${clusters.length < cityPoints.length ? ` → ${clusters.length} clusters` : ''} · ${metricLabel}${fallbackNote} · click to explore`;

  // Re-expand pinned cluster after zoom rebuild so the selection survives zoom changes
  if (_savedPin) {
    expandEconCluster(_savedPin.group, _savedPin.clusterUSD, _savedPin.cLat, _savedPin.cLng);
  }
}

// ── Corporations panel ───────────────────────────────────────────────────────
let corpCityQid = null;
let corpCityName = null;
let corpOverrideList = null;  // non-null when the panel shows a merged multi-city cluster

function fmtEmployees(n) {
  if (!n) return null;
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1000) return Math.round(n / 1000) + 'k';
  return n.toLocaleString();
}
// Revenue values from Wikidata are in the company's reported currency (not USD-normalized).
// We show magnitudes only (no $ sign) to avoid implying USD.
function fmtRevenue(n) {
  if (!n) return null;
  if (Math.abs(n) >= 1e12) return (n / 1e12).toFixed(1) + 'T';
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(0) + 'M';
  return n.toLocaleString();
}

function openCorpPanel(qid, cityName) {
  corpCityQid = qid;
  corpCityName = cityName;
  corpOverrideList = null;
  document.getElementById('corp-panel-title').textContent = cityName + ' · Corporations';
  document.getElementById('corp-search').value = '';
  document.getElementById('corp-sort').value = 'revenue';
  renderCorpList();
  document.getElementById('corp-panel').classList.add('open');
  document.getElementById('wiki-sidebar').classList.add('corp-open');
}

function openCorpPanelCluster(cityPoints, title) {
  // cityPoints: [{qid, city, totalUSD, validCos}, ...]  — same structure from buildEconLayer
  // Use the dominant city (highest revenue) for language/locale detection
  const dominant = cityPoints.reduce((best, p) => p.totalUSD > best.totalUSD ? p : best, cityPoints[0]);
  corpCityQid = dominant.qid;
  corpCityName = title;
  corpOverrideList = cityPoints.flatMap(p => companiesData[p.qid] || []);
  document.getElementById('corp-panel-title').textContent = title + ' · Corporations';
  document.getElementById('corp-search').value = '';
  document.getElementById('corp-sort').value = 'revenue';
  renderCorpList();
  document.getElementById('corp-panel').classList.add('open');
  document.getElementById('wiki-sidebar').classList.add('corp-open');
}

function closeCorpPanel() {
  corpOverrideList = null;
  document.getElementById('corp-panel').classList.remove('open');
  document.getElementById('wiki-sidebar').classList.remove('corp-open');
}

// ── Draw boundary feature ─────────────────────────────────────────────────────
let _drawActive   = false;   // currently adding vertices
let _drawVertices = [];      // [[lat,lng], ...]
let _drawPolyline = null;    // live dashed outline while drawing
let _drawPolygon  = null;    // closed polygon layer
let _drawDots     = [];      // vertex circle markers

function toggleDrawMode() {
  if (_drawPolygon) { _drawClear(); return; }   // polygon exists → clear it
  if (_drawActive)  { _drawFinish(); return; }  // drawing → finish
  // Start drawing
  _drawActive = true;
  _drawVertices = [];
  map.doubleClickZoom.disable();                // prevent map zoom on double-click
  const btn = document.getElementById('draw-fab');
  if (btn) { btn.textContent = '✓ Done'; btn.title = 'Click to add points · Double-click or Done to close · Esc to cancel'; btn.classList.add('active'); }
  map.getContainer().style.cursor = 'crosshair';
}

function _drawClear() {
  _drawActive = false;
  _drawVertices = [];
  [_drawPolyline, _drawPolygon, ..._drawDots].forEach(l => { try { if(l) map.removeLayer(l); } catch(_){} });
  _drawPolyline = _drawPolygon = null;
  _drawDots = [];
  map.doubleClickZoom.enable();
  const btn = document.getElementById('draw-fab');
  if (btn) { btn.textContent = '⬡ Draw'; btn.title = 'Draw a region to explore'; btn.classList.remove('active'); }
  map.getContainer().style.cursor = '';
}

function _drawAddVertex(latlng) {
  _drawVertices.push([latlng.lat, latlng.lng]);
  const dot = L.circleMarker([latlng.lat, latlng.lng], {
    radius: 5, color: '#f0a500', fillColor: '#f0a500',
    fillOpacity: 1, weight: 2, pane: 'econPane', interactive: false,
  }).addTo(map);
  _drawDots.push(dot);
  if (_drawPolyline) map.removeLayer(_drawPolyline);
  if (_drawVertices.length >= 2) {
    _drawPolyline = L.polyline(_drawVertices, {
      color: '#f0a500', weight: 2, opacity: 0.85,
      dashArray: '6 4', pane: 'econPane', interactive: false,
    }).addTo(map);
  }
  // Update button hint after first point
  const btn = document.getElementById('draw-fab');
  if (btn && _drawVertices.length === 1) btn.title = 'Keep clicking to add points · Double-click or click Done to close';
}

function _drawFinish() {
  if (_drawVertices.length < 3) { _drawClear(); return; }
  // Close the polygon visually
  if (_drawPolyline) { map.removeLayer(_drawPolyline); _drawPolyline = null; }
  _drawPolygon = L.polygon(_drawVertices, {
    color: '#f0a500', weight: 2, opacity: 0.85,
    fillColor: '#f0a500', fillOpacity: 0.06,
    dashArray: '6 4', pane: 'econPane', interactive: false,
  }).addTo(map);
  _drawActive = false;
  map.doubleClickZoom.enable();
  map.getContainer().style.cursor = '';
  const btn = document.getElementById('draw-fab');
  if (btn) { btn.textContent = '✕ Clear'; btn.title = 'Clear drawn region'; btn.classList.add('active'); }
  _drawProcessResults();
}

// Ray-casting point-in-polygon [[lat,lng]…]
function _pointInPolygon(lat, lng, poly) {
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [ai, bi] = poly[i], [aj, bj] = poly[j];
    if ((bi > lng) !== (bj > lng) &&
        lat < (aj - ai) * (lng - bi) / (bj - bi) + ai) inside = !inside;
  }
  return inside;
}

function _drawProcessResults() {
  const enclosed = allCities.filter(c =>
    c.lat != null && c.lng != null && _pointInPolygon(c.lat, c.lng, _drawVertices)
  );
  if (!enclosed.length) {
    alert('No cities found inside the drawn region.');
    _drawClear();
    return;
  }

  // Build cityPoints group (same format as econ clustering)
  const MAX_USD = 2e12;
  const metric  = document.getElementById('econ-metric')?.value || 'revenue';
  const group   = enclosed.map(city => {
    const companies = companiesData[city.qid] || [];
    let totalUSD = 0;
    const validCos = [];
    const fallbackCur = ISO2_TO_CURRENCY[city.iso] || null;
    for (const co of companies) {
      const val = co[metric] || co.revenue || co.market_cap;
      const cur = co[metric+'_currency'] || co.revenue_currency || co.market_cap_currency || fallbackCur;
      if (!val || !cur) continue;
      const usd = toUSD(val, cur);
      if (usd > 0 && usd <= MAX_USD) { totalUSD += usd; validCos.push({ co, usd, usedMetric: metric }); }
    }
    return { qid: city.qid, city, totalUSD, validCos };
  });

  const totalUSD = group.reduce((s, p) => s + p.totalUSD, 0);
  const cLat = enclosed.reduce((s, c) => s + c.lat, 0) / enclosed.length;
  const cLng = enclosed.reduce((s, c) => s + c.lng, 0) / enclosed.length;
  const title = `Drawn region · ${enclosed.length} cit${enclosed.length===1?'y':'ies'}`;

  // Corp panel — show all companies in region
  openCorpPanelCluster(group, title);

  // City list — filter to enclosed cities
  filtered = enclosed.slice();
  visibleCount = PAGE_SIZE;
  renderRows();
  document.getElementById('list-meta-text').textContent =
    `${enclosed.length} cities in drawn region`;
  document.getElementById('list-panel').style.display = '';

  // Economic visualization (only if we have data)
  if (totalUSD > 0) {
    collapseEconCluster();
    expandEconCluster(group.filter(p => p.totalUSD > 0), totalUSD, cLat, cLng);
  }
}

function renderCorpList() {
  const tbody = document.getElementById('corp-tbody');
  const countEl = document.getElementById('corp-count');
  if ((!corpCityQid && !corpOverrideList) || !tbody) return;

  const query = document.getElementById('corp-search').value.toLowerCase().trim();
  const sortBy = document.getElementById('corp-sort').value;
  const displayCur = document.getElementById('corp-display-currency')?.value || '';
  let companies = (corpOverrideList || companiesData[corpCityQid] || []).slice();

  // Populate currency options dynamically from what's in this list
  const curSel = document.getElementById('corp-display-currency');
  if (curSel) {
    const usedCurs = [...new Set(companies.flatMap(co => [
      co.revenue_currency, co.net_income_currency
    ].filter(Boolean)))].sort();
    const extras = ['USD','EUR','JPY','CNY','BTC','ETH'];
    const allOpts = [...new Set([...extras, ...usedCurs])];
    const prev = curSel.value;
    curSel.innerHTML = '<option value="">As reported</option>' +
      allOpts.map(c => `<option value="${c}"${c===prev?' selected':''}>${c}${FX_LABELS[c]?' · '+FX_LABELS[c]:''}</option>`).join('');
  }

  // Helper: convert a financial value to the display currency
  function _toDisp(val, cur) {
    if (!val) return null;
    if (!displayCur || displayCur === (cur || '')) return val;
    const usd = toUSD(val, cur || ISO2_TO_CURRENCY[allCities.find(c=>c.qid===corpCityQid)?.iso] || 'USD');
    if (!usd) return null;
    const rate = fxRates[displayCur];
    return rate ? usd / rate : null;
  }
  function _fmtDisp(val, cur) {
    const v = _toDisp(val, cur);
    if (v == null) return '—';
    const sym = displayCur === 'BTC' ? '₿' : displayCur === 'ETH' ? 'Ξ' : displayCur ? displayCur+' ' : '';
    const decimals = displayCur === 'BTC' ? (v < 1 ? v.toFixed(4) : v.toFixed(2))
                   : displayCur === 'ETH' ? (v < 1 ? v.toFixed(3) : v.toFixed(1))
                   : fmtRevenue(v);
    return sym + decimals;
  }

  if (query) {
    companies = companies.filter(co =>
      co.name.toLowerCase().includes(query) ||
      (co.industry || '').toLowerCase().includes(query)
    );
  }

  companies.sort((a, b) => {
    if (sortBy === 'revenue') {
      const av = displayCur ? (_toDisp(a.revenue, a.revenue_currency) || 0) : (a.revenue || 0);
      const bv = displayCur ? (_toDisp(b.revenue, b.revenue_currency) || 0) : (b.revenue || 0);
      return bv - av;
    }
    if (sortBy === 'net_income') {
      const av = displayCur ? (_toDisp(a.net_income, a.net_income_currency) || 0) : (a.net_income || 0);
      const bv = displayCur ? (_toDisp(b.net_income, b.net_income_currency) || 0) : (b.net_income || 0);
      return bv - av;
    }
    if (sortBy === 'founded') return (a.founded || 9999) - (b.founded || 9999);
    return a.name.localeCompare(b.name);
  });

  countEl.textContent = companies.length + ' result' + (companies.length !== 1 ? 's' : '');

  if (companies.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="color:#6e7681;padding:20px 10px;font-size:0.8rem">No corporations match your search.</td></tr>`;
    return;
  }

  tbody.innerHTML = companies.map(co => {
    const wikiAttr = co.wikipedia
      ? ` data-wiki="${escAttr(co.wikipedia)}" data-name="${escAttr(co.name)}"`
      : '';
    const finJson = escHtml(JSON.stringify({
      description: co.description || null,
      industry: co.industry || null, exchange: co.exchange || null,
      ticker: co.ticker || null, traded_as: co.traded_as || null,
      founded: co.founded || null, company_type: co.company_type || null,
      website: co.website || null,
      ceo: co.ceo || null, key_people: co.key_people || null,
      founders: co.founders || null, parent_org: co.parent_org || null,
      products: co.products || null, subsidiaries: co.subsidiaries || null,
      employees: co.employees || null, employees_history: co.employees_history || [],
      revenue: co.revenue || null, revenue_year: co.revenue_year || null,
      revenue_currency: co.revenue_currency || null, revenue_history: co.revenue_history || [],
      net_income: co.net_income || null, net_income_currency: co.net_income_currency || null, net_income_history: co.net_income_history || [],
      operating_income: co.operating_income || null, operating_income_currency: co.operating_income_currency || null, operating_income_history: co.operating_income_history || [],
      total_assets: co.total_assets || null, total_assets_currency: co.total_assets_currency || null, total_assets_history: co.total_assets_history || [],
      total_equity: co.total_equity || null, total_equity_currency: co.total_equity_currency || null, total_equity_history: co.total_equity_history || [],
    }));
    const wdUrl = `https://www.wikidata.org/wiki/${escHtml(co.qid)}`;
    const linkHtml = co.wikipedia
      ? `<a href="${escAttr(co.wikipedia)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="Wikipedia">W↗</a>`
      : `<a href="${escHtml(wdUrl)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="Wikidata">D↗</a>`;
    const histLen = (co.revenue_history || []).length;
    const revYearHtml = co.revenue_year
      ? ` <span style="color:#484f58;font-size:0.7rem">${co.revenue_year}${histLen > 1 ? ` <span title="${histLen} years of data">·${histLen}yr</span>` : ''}</span>` : '';

    return `<tr${wikiAttr} data-fin="${finJson}" onclick="corpRowClick(this)" title="${escAttr(co.name)}">
      <td class="co-name-cell">${escHtml(co.name)}</td>
      <td class="co-industry-cell">${co.industry ? escHtml(co.industry) : '—'}</td>
      <td class="co-num" title="${displayCur ? '≈ '+displayCur : (co.revenue_currency||'')}">
        ${_fmtDisp(co.revenue, co.revenue_currency) !== '—' ? _fmtDisp(co.revenue, co.revenue_currency) + (displayCur ? '' : revYearHtml) : '—'}
      </td>
      <td class="co-num" title="${displayCur ? '≈ '+displayCur : (co.net_income_currency||'')}">
        ${_fmtDisp(co.net_income, co.net_income_currency)}
      </td>
      <td class="co-neutral">${co.founded || '—'}</td>
      <td class="co-link">${linkHtml}</td>
    </tr>`;
  }).join('');
}

function corpRowClick(row) {
  const wikiUrl = row.dataset.wiki;
  const name = row.dataset.name;
  if (!wikiUrl) return;
  const finData = row.dataset.fin ? JSON.parse(row.dataset.fin) : {};
  const titleMatch = wikiUrl.match(/\/wiki\/([^#?]+)/);
  if (!titleMatch) return;
  openCompanyWikiPanel(decodeURIComponent(titleMatch[1]), name, wikiUrl, finData);
}

// ── Global corporations list ──────────────────────────────────────────────────
let globalCorpList = [];
let globalCorpVis = 100;
const GCORP_PAGE = 100;
let gcorpQuery = '';
let gcorpCountry = '';
let gcorpIndustry = '';
let gcorpSort = 'revenue_usd';

function buildGlobalCorpList() {
  const cityByQid = {};
  for (const c of allCities) cityByQid[c.qid] = c;

  globalCorpList = [];
  for (const [qid, companies] of Object.entries(companiesData)) {
    const city = cityByQid[qid];
    const cityName = city ? city.name : '—';
    const country = city ? (city.country || '') : '';
    for (const co of companies) {
      const fallbackCur = city ? (ISO2_TO_CURRENCY[city.iso] || null) : null;
      const revenueUSD = co.revenue ? toUSD(co.revenue, co.revenue_currency || fallbackCur) : 0;
      globalCorpList.push({ co, cityName, country, cityQid: qid, revenueUSD });
    }
  }

  // Populate country dropdown
  const countries = [...new Set(globalCorpList.map(e => e.country).filter(Boolean))].sort();
  const cSel = document.getElementById('gcorp-country');
  countries.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c; cSel.appendChild(opt);
  });

  // Populate industry dropdown
  const industries = [...new Set(globalCorpList.map(e => e.co.industry).filter(Boolean))].sort();
  const iSel = document.getElementById('gcorp-industry');
  industries.forEach(i => {
    const opt = document.createElement('option');
    opt.value = i; opt.textContent = i; iSel.appendChild(opt);
  });

  renderGlobalCorpList();
  document.getElementById('global-corp-panel').style.display = '';
}

function _gcorpFinJson(co) {
  return escHtml(JSON.stringify({
    description: co.description || null,
    industry: co.industry || null, exchange: co.exchange || null,
    ticker: co.ticker || null, traded_as: co.traded_as || null,
    founded: co.founded || null, company_type: co.company_type || null,
    website: co.website || null,
    ceo: co.ceo || null, key_people: co.key_people || null,
    founders: co.founders || null, parent_org: co.parent_org || null,
    products: co.products || null, subsidiaries: co.subsidiaries || null,
    employees: co.employees || null, employees_history: co.employees_history || [],
    revenue: co.revenue || null, revenue_year: co.revenue_year || null,
    revenue_currency: co.revenue_currency || null, revenue_history: co.revenue_history || [],
    net_income: co.net_income || null, net_income_currency: co.net_income_currency || null, net_income_history: co.net_income_history || [],
    operating_income: co.operating_income || null, operating_income_currency: co.operating_income_currency || null, operating_income_history: co.operating_income_history || [],
    total_assets: co.total_assets || null, total_assets_currency: co.total_assets_currency || null, total_assets_history: co.total_assets_history || [],
    total_equity: co.total_equity || null, total_equity_currency: co.total_equity_currency || null, total_equity_history: co.total_equity_history || [],
  }));
}

function renderGlobalCorpList() {
  const q = gcorpQuery.toLowerCase();
  let list = globalCorpList.filter(e => {
    if (q && !e.co.name.toLowerCase().includes(q) && !e.cityName.toLowerCase().includes(q) && !e.country.toLowerCase().includes(q)) return false;
    if (gcorpCountry && e.country !== gcorpCountry) return false;
    if (gcorpIndustry && e.co.industry !== gcorpIndustry) return false;
    return true;
  });

  list.sort((a, b) => {
    if (gcorpSort === 'revenue_usd') return (b.revenueUSD || 0) - (a.revenueUSD || 0);
    if (gcorpSort === 'employees') return (b.co.employees || 0) - (a.co.employees || 0);
    if (gcorpSort === 'country') return (a.country || '').localeCompare(b.country || '');
    return a.co.name.localeCompare(b.co.name);
  });

  const total = list.length;
  const visible = list.slice(0, globalCorpVis);

  document.getElementById('gcorp-count').textContent =
    total.toLocaleString() + ' corporation' + (total !== 1 ? 's' : '');

  const tbody = document.getElementById('gcorp-tbody');
  tbody.innerHTML = visible.map(({ co, cityName, country, cityQid, revenueUSD }) => {
    const wikiAttrs = co.wikipedia
      ? ` data-wiki="${escAttr(co.wikipedia)}" data-name="${escAttr(co.name)}"`
      : ` data-name="${escAttr(co.name)}"`;
    const revDisp = revenueUSD > 0
      ? `$${fmtRevenue(revenueUSD)}`
      : (co.revenue
        ? fmtRevenue(co.revenue) + (co.revenue_currency && co.revenue_currency !== 'USD'
          ? ` <span style="color:#484f58;font-size:0.7rem">${escHtml(co.revenue_currency)}</span>` : '')
        : '—');
    return `<tr${wikiAttrs} data-fin="${_gcorpFinJson(co)}" data-qid="${escAttr(cityQid)}" data-city="${escAttr(cityName)}" onclick="gcorpRowClick(this)" title="${escAttr(co.name)}">
      <td class="gcorp-name-cell">${escHtml(co.name)}</td>
      <td class="gcorp-city-cell">${escHtml(cityName)}</td>
      <td class="gcorp-country-cell">${escHtml(country || '—')}</td>
      <td class="gcorp-industry-cell">${co.industry ? escHtml(co.industry) : '—'}</td>
      <td class="gcorp-num">${revDisp}</td>
      <td class="gcorp-neutral">${fmtEmployees(co.employees) || '—'}</td>
    </tr>`;
  }).join('');

  const moreRow = document.getElementById('gcorp-more-row');
  if (total > globalCorpVis) {
    moreRow.style.display = '';
    document.getElementById('gcorp-more-btn').textContent =
      `Show ${Math.min(GCORP_PAGE, total - globalCorpVis)} more (${(total - globalCorpVis).toLocaleString()} remaining)`;
  } else {
    moreRow.style.display = 'none';
  }
}

function gcorpShowMore() {
  globalCorpVis += GCORP_PAGE;
  renderGlobalCorpList();
}

function gcorpQueryChanged(v) { gcorpQuery = v; globalCorpVis = GCORP_PAGE; renderGlobalCorpList(); }
function gcorpCountryChanged(v) { gcorpCountry = v; globalCorpVis = GCORP_PAGE; renderGlobalCorpList(); }
function gcorpIndustryChanged(v) { gcorpIndustry = v; globalCorpVis = GCORP_PAGE; renderGlobalCorpList(); }
function gcorpSortChanged(v) { gcorpSort = v; globalCorpVis = GCORP_PAGE; renderGlobalCorpList(); }

function gcorpRowClick(row) {
  const wikiUrl = row.dataset.wiki;
  const name = row.dataset.name;
  const qid = row.dataset.qid;
  const city = row.dataset.city;
  if (qid && city) { corpCityQid = qid; corpCityName = city; }
  if (!wikiUrl || !name) return;
  const finData = row.dataset.fin ? JSON.parse(row.dataset.fin) : {};
  const titleMatch = wikiUrl.match(/\/wiki\/([^#?]+)/);
  if (!titleMatch) return;
  openCompanyWikiPanel(decodeURIComponent(titleMatch[1]), name, wikiUrl, finData);
}

async function openCompanyWikiPanel(articleTitle, name, wikiUrl, finData = {}) {
  const sidebar = document.getElementById('wiki-sidebar');
  const body = document.getElementById('wiki-sidebar-body');
  const footer = document.getElementById('wiki-sidebar-footer');
  const titleEl = document.getElementById('wiki-sidebar-title');

  titleEl.textContent = name;
  footer.innerHTML = '';
  body.innerHTML = '<div class="wiki-loading"><div class="spinner"></div><span>Loading…</span></div>';
  sidebar.classList.add('open');

  // Determine local language from the city whose corp panel is open
  const corpCity = allCities.find(c => c.qid === corpCityQid);
  const localLang = corpCity ? (ISO_TO_WIKI_LANG[corpCity.iso] || null) : null;
  const tryLocal = localLang && localLang !== 'en';

  try {
    // Always fetch English first (guaranteed to exist, gives us wikibase_item)
    const enApiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(articleTitle)}`;
    const enRaw = await fetch(enApiUrl);
    if (!enRaw.ok) throw new Error('HTTP ' + enRaw.status);
    const enData = await enRaw.json();

    // Try local-language article via Wikidata sitelink lookup
    let displayData = enData;
    let displayLang = 'en';
    let localWikiUrl = null;

    if (tryLocal && enData.wikibase_item) {
      try {
        const wdUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(enData.wikibase_item)}&props=sitelinks&sitefilter=${localLang}wiki&format=json&origin=*`;
        const wdRaw = await fetch(wdUrl);
        const wdJson = await wdRaw.json();
        const localTitle = wdJson.entities?.[enData.wikibase_item]?.sitelinks?.[`${localLang}wiki`]?.title;

        if (localTitle) {
          const localApiUrl = `https://${localLang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(localTitle)}`;
          localWikiUrl = `https://${localLang}.wikipedia.org/wiki/${encodeURIComponent(localTitle)}`;
          const localRaw = await fetch(localApiUrl);
          if (localRaw.ok) {
            const localJson = await localRaw.json();
            if (localJson.extract) { displayData = localJson; displayLang = localLang; }
          }
        }
      } catch (_) { /* local fetch failed — stay with English */ }
    }

    const imgHtml = displayData.thumbnail?.source
      ? `<img class="wiki-img" src="${escAttr(displayData.thumbnail.source)}" alt="${escAttr(name)}" />`
      : '';
    const extract = displayData.extract || '';

    // Build company data section from companies.json fields
    const _td = (label, val, isGreen) =>
      `<tr><td style="color:#8b949e;padding:4px 8px 4px 0;white-space:nowrap;font-size:0.8rem">${label}</td>` +
      `<td style="${isGreen ? 'color:#3fb950;' : 'color:#c9d1d9;'}font-variant-numeric:tabular-nums;text-align:right;font-size:0.8rem">${val}</td></tr>`;

    // History pills row — shows year-labelled mini badges for a financial time-series
    const _pills = (hist, latestYear, fmtFn) => {
      const rows = (hist || []).filter(h => h.year && h.value);
      if (rows.length < 2) return '';
      return `<tr><td colspan="2" style="padding:2px 0 6px">` +
        `<div style="display:flex;gap:4px;flex-wrap:wrap">` +
        rows.map(h =>
          `<span style="font-size:0.7rem;background:#21262d;border-radius:3px;padding:1px 5px;` +
          `color:${h.year === latestYear ? '#3fb950' : '#8b949e'}">${h.year}: ${fmtFn(h.value)}</span>`
        ).join('') + `</div></td></tr>`;
    };

    // Year badge next to a scalar value
    const _yr = yr => yr ? ` <span style="color:#484f58;font-size:0.78em">${yr}</span>` : '';

    // Key people: use key_people array (from infobox) if available, fall back to ceo string
    const keyPeopleHtml = (() => {
      if (finData.key_people?.length) {
        const rows = finData.key_people.map(p =>
          `<div style="display:flex;justify-content:space-between;gap:8px;padding:1px 0;min-width:0">` +
          `<span style="color:#c9d1d9;font-size:0.78rem;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(p.name)}</span>` +
          (p.role ? `<span style="color:#8b949e;font-size:0.73rem;text-align:right;min-width:0;flex-shrink:0;max-width:55%">${escHtml(p.role)}</span>` : '') +
          `</div>`
        ).join('');
        return `<tr><td style="color:#8b949e;padding:4px 8px 4px 0;white-space:nowrap;font-size:0.8rem;vertical-align:top">People</td>` +
          `<td style="font-size:0.78rem;text-align:right">${rows}</td></tr>`;
      }
      if (finData.ceo) return _td('CEO', escHtml(finData.ceo), false);
      return '';
    })();

    const profileRows = [
      finData.company_type ? _td('Type', escHtml(finData.company_type), false) : '',
      finData.industry ? _td('Industry', escHtml(finData.industry), false) : '',
      (finData.exchange || finData.traded_as) ? _td('Exchange',
        escHtml(finData.exchange || finData.traded_as) +
        (finData.ticker ? ` <span style="color:#58a6ff;font-size:0.78em">${escHtml(finData.ticker)}</span>` : ''), false) : '',
      finData.founded ? _td('Founded', finData.founded, false) : '',
      keyPeopleHtml,
      finData.founders?.length ? _td('Founders', finData.founders.map(escHtml).join(', '), false) : '',
      finData.parent_org ? _td('Parent', escHtml(finData.parent_org), false) : '',
      finData.products?.length ? `<tr><td style="color:#8b949e;padding:4px 8px 4px 0;white-space:nowrap;font-size:0.8rem;vertical-align:top">Products</td>` +
        `<td style="color:#c9d1d9;font-size:0.75rem;text-align:right">${finData.products.map(escHtml).join('<br>')}</td></tr>` : '',
      finData.subsidiaries?.length ? `<tr><td style="color:#8b949e;padding:4px 8px 4px 0;white-space:nowrap;font-size:0.8rem;vertical-align:top">Subsidiaries</td>` +
        `<td style="color:#c9d1d9;font-size:0.75rem;text-align:right">${finData.subsidiaries.slice(0, 8).map(escHtml).join('<br>')}${finData.subsidiaries.length > 8 ? '<br><span style="color:#6e7681">…</span>' : ''}</td></tr>` : '',
      finData.website ? `<tr><td style="color:#8b949e;padding:4px 8px 4px 0;white-space:nowrap;font-size:0.8rem">Website</td>` +
        `<td style="text-align:right;font-size:0.8rem"><a href="${escAttr(finData.website)}" target="_blank" rel="noopener" style="color:#58a6ff;text-decoration:none" onclick="event.stopPropagation()">${escHtml(finData.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</a></td></tr>` : '',
      finData.employees ? _td('Employees', fmtEmployees(finData.employees) + _yr((finData.employees_history || []).filter(h => h.year).slice(-1)[0]?.year), false) : '',
      _pills(finData.employees_history, (finData.employees_history || []).filter(h => h.year).slice(-1)[0]?.year, fmtEmployees),
    ].filter(r => r).join('');

    // Currency badge shown when a known non-USD currency is on file
    const _cur = c => c && c !== 'USD'
      ? ` <span style="color:#484f58;font-size:0.7rem">${escHtml(c)}</span>` : '';

    const financialRows = [
      finData.revenue ? _td('Revenue', fmtRevenue(finData.revenue) + _yr(finData.revenue_year) + _cur(finData.revenue_currency), true) : '',
      _pills(finData.revenue_history, finData.revenue_year, fmtRevenue),
      finData.operating_income ? _td('Operating Inc.', fmtRevenue(finData.operating_income) + _yr((finData.operating_income_history || []).filter(h => h.year).slice(-1)[0]?.year) + _cur(finData.operating_income_currency), true) : '',
      _pills(finData.operating_income_history, (finData.operating_income_history || []).filter(h => h.year).slice(-1)[0]?.year, fmtRevenue),
      finData.net_income ? _td('Net Income', fmtRevenue(finData.net_income) + _yr((finData.net_income_history || []).filter(h => h.year).slice(-1)[0]?.year) + _cur(finData.net_income_currency), true) : '',
      _pills(finData.net_income_history, (finData.net_income_history || []).filter(h => h.year).slice(-1)[0]?.year, fmtRevenue),
      finData.total_assets ? _td('Total Assets', fmtRevenue(finData.total_assets) + _yr((finData.total_assets_history || []).filter(h => h.year).slice(-1)[0]?.year) + _cur(finData.total_assets_currency), true) : '',
      _pills(finData.total_assets_history, (finData.total_assets_history || []).filter(h => h.year).slice(-1)[0]?.year, fmtRevenue),
      finData.total_equity ? _td('Total Equity', fmtRevenue(finData.total_equity) + _yr((finData.total_equity_history || []).filter(h => h.year).slice(-1)[0]?.year) + _cur(finData.total_equity_currency), true) : '',
      _pills(finData.total_equity_history, (finData.total_equity_history || []).filter(h => h.year).slice(-1)[0]?.year, fmtRevenue),
    ].filter(r => r).join('');

    const _section = (heading, rows) => rows
      ? `<div style="padding:10px 16px 4px;border-bottom:1px solid #21262d">` +
      `<div style="font-size:0.7rem;font-weight:600;color:#6e7681;letter-spacing:0.04em;text-transform:uppercase;margin-bottom:6px">${heading}</div>` +
      `<table style="width:100%;border-collapse:collapse">${rows}</table></div>`
      : '';
    const finHtml = _section('Profile', profileRows) + _section('Financials', financialRows);

    // Language badge shown when displaying non-English content
    const langBadge = displayLang !== 'en'
      ? `<span style="font-size:0.68rem;background:#21262d;color:#8b949e;border-radius:4px;padding:2px 6px;margin-left:8px;vertical-align:middle">${displayLang}</span>`
      : '';

    body.innerHTML = `
      ${imgHtml}
      <div class="wiki-city-header">
        <div class="wiki-city-name">${escHtml(displayData.title || name)}${langBadge}</div>
        ${(displayData.description || finData.description)
        ? `<div class="wiki-city-desc">${escHtml(displayData.description || finData.description)}</div>`
        : ''}
      </div>
      ${finHtml}
      ${extract ? `
        <div class="wiki-extract-wrap">
          <div class="wiki-extract-head">Overview</div>
          <div class="wiki-extract collapsed" id="wiki-extract-text">${escHtml(extract)}</div>
          <button class="wiki-expand-btn" id="wiki-expand-btn" onclick="toggleExtract()">Show more</button>
        </div>` : ''}
    `;

    // Footer: show local link first if used, then English
    const svgIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#58a6ff" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
    const enLink = `<a class="wiki-footer-link" href="${escAttr(wikiUrl)}" target="_blank" rel="noopener">${svgIcon} Wikipedia (EN)</a>`;
    const locLink = localWikiUrl && displayLang !== 'en'
      ? `<a class="wiki-footer-link" href="${escAttr(localWikiUrl)}" target="_blank" rel="noopener" style="margin-right:12px">${svgIcon} Wikipedia (${displayLang.toUpperCase()})</a>`
      : '';
    footer.innerHTML = locLink
      ? `<div style="display:flex;gap:4px;flex-wrap:wrap">${locLink}${enLink}</div>`
      : enLink;

  } catch (e) {
    body.innerHTML = `<div class="wiki-error">Could not load Wikipedia article.<br/><a href="${escAttr(wikiUrl)}" target="_blank" rel="noopener">Open Wikipedia directly ↗</a></div>`;
  }
}

function showLoading(visible, msg) {
  const overlay = document.getElementById('loading-overlay');
  const text = document.getElementById('loading-text');
  overlay.classList.toggle('visible', visible);
  if (visible && msg) text.textContent = msg;
  document.getElementById('loading-error').style.display = 'none';
  text.style.display = 'block';
}

function showLoadingError(msg) {
  document.getElementById('loading-error').textContent = 'Error: ' + msg;
  document.getElementById('loading-error').style.display = 'block';
  document.getElementById('loading-text').style.display = 'none';
}

init();