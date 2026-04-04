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
    const censusCol = censusDotColor(city);
    const color = censusCol || wikiCityColor(city.pop);
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
    const opacity = censusCol ? 0.92 : wikiCityOpacity(city.pop);
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
  closeStatsPanel();
}

// ── Stats distribution panel ───────────────────────────────────────────────────
let _activeStatMetric = null;
let _statsScope   = 'world';  // 'world' | 'country'
let _statsCurrent = null;     // { metric, qid }
let _statsPoints  = [];       // full sorted array from last render
let _statsWinStart = 0;       // first index shown in list
let _statsWinEnd   = 0;       // last index shown in list
const STATS_WIN = 12;         // cities loaded per expand click

function closeStatsPanel() {
  const _sp = document.getElementById('stats-panel');
  if (_sp) { _sp.classList.remove('open'); _sp.style.right = ''; }
  document.querySelectorAll('.census-stat-clickable.stats-active, .info-chip-clickable.stats-active')
    .forEach(el => el.classList.remove('stats-active'));
  _activeStatMetric = null;
  _statsCurrent = null;
  _statsPoints  = [];
}

function setStatsScope(scope) {
  _statsScope = scope;
  if (_statsCurrent) _renderStatsPanel();
}

function openStatsPanel(metric, qid) {
  // Toggle off if clicking same stat again
  if (_activeStatMetric === metric + ':' + qid) { closeStatsPanel(); return; }
  _activeStatMetric = metric + ':' + qid;
  _statsCurrent = { metric, qid };
  _renderStatsPanel();
}

function _renderStatsPanel() {
  const { metric, qid } = _statsCurrent;
  const censusDef    = STAT_DEFS[metric];
  const cityDef      = CITY_STAT_DEFS[metric];
  const wbDef        = WB_STAT_DEFS[metric];
  const eurostatDef  = EUROSTAT_STAT_DEFS[metric];
  const japanDef     = JAPAN_PREF_STAT_DEFS[metric];
  const corpDef      = CORP_STAT_DEFS[metric];
  const def = censusDef || cityDef || wbDef || eurostatDef || japanDef || corpDef;
  if (!def) return;

  const isCityStat     = !!cityDef;
  const isWbStat       = !!wbDef;
  const isEurostatStat = !!eurostatDef;
  const isJapanPrefStat = !!japanDef;
  const isCorpStat     = !!corpDef;

  // Highlight the clicked cell
  document.querySelectorAll('.census-stat-clickable.stats-active, .info-chip-clickable.stats-active, .wb-chip-clickable.stats-active')
    .forEach(el => el.classList.remove('stats-active'));
  document.querySelectorAll(`[onclick*="openStatsPanel('${metric}'"]`)
    .forEach(el => el.classList.add('stats-active'));

  // Find the clicked city / country
  const selfCity    = (isWbStat) ? null : allCities.find(c => c.qid === qid);
  const selfIso     = isWbStat ? qid : (selfCity?.iso || '');
  const selfState   = selfCity?.admin || '';
  const selfCountry = isWbStat ? (countryData[qid]?.name || qid)
                                : (selfCity?.country || selfIso);

  // ── Collect points ──
  const points = [];
  if (isWbStat) {
    // Country-level — one point per real country (skip WB regional/income aggregates)
    for (const [iso2, cdata] of Object.entries(countryData)) {
      if (!cdata || !cdata.region || cdata.region === 'Aggregates') continue;
      const val = cdata[wbDef.key];
      if (val == null || isNaN(val)) continue;
      points.push({ qid: iso2, val, name: cdata.name || iso2, region: cdata.region || '', iso: iso2 });
    }
  } else if (isCityStat) {
    const pool = (_statsScope === 'country' && selfIso)
      ? allCities.filter(c => c.iso === selfIso)
      : allCities;
    for (const c of pool) {
      const val = def.key(c);
      if (val == null || isNaN(val)) continue;
      points.push({ qid: c.qid, val, name: c.name, state: c.admin || '', iso: c.iso || '', country: c.country || '' });
    }
  } else if (isJapanPrefStat) {
    // Japan Cabinet Office — 47 prefectures, each mapped to highest-pop JP city
    const jpCities = allCities.filter(c => c.iso === 'JP');
    // Build prefecture → best representative city
    const prefRepCity = {};
    for (const c of jpCities) {
      const match = _lookupJapanPref(c);
      if (!match) continue;
      const existing = prefRepCity[match.name];
      if (!existing || (c.pop || 0) > (existing.pop || 0)) prefRepCity[match.name] = c;
    }
    for (const [prefName, data] of Object.entries(japanPrefData)) {
      const val = data[japanDef.key];
      if (val == null || isNaN(val)) continue;
      const repCity = prefRepCity[prefName];
      if (!repCity) continue;
      points.push({ qid: repCity.qid, val, name: prefName, state: 'Japan', iso: 'JP', country: 'Japan', prefName });
    }
  } else if (isEurostatStat) {
    // Eurostat Urban Audit — European cities
    for (const [cqid, data] of Object.entries(eurostatCities)) {
      if (!data) continue;
      const val = data[eurostatDef.key];
      if (val == null || isNaN(val)) continue;
      const city = allCities.find(c => c.qid === cqid);
      if (!city) continue;
      points.push({ qid: cqid, val, name: city.name, state: data.country || city.iso || '', iso: city.iso || '', country: city.country || city.iso || '' });
    }
  } else if (isCorpStat) {
    // Company-level — all companies across all cities
    for (const arr of Object.values(companiesData)) {
      for (const co of arr) {
        if (!co.qid) continue;
        const val = corpDef.key(co);
        if (val == null || isNaN(val) || val <= 0) continue;
        points.push({ qid: co.qid, val, name: co.name, state: co.industry || '', iso: '', country: co.exchange || '' });
      }
    }
  } else {
    // Census ACS/BIZ — US cities only
    const src = def.src === 'acs' ? censusCities : censusBusiness;
    for (const [cqid, data] of Object.entries(src)) {
      if (!data) continue;
      const val = typeof def.key === 'function' ? def.key(data) : data[def.key];
      if (val == null || isNaN(val)) continue;
      const city = allCities.find(c => c.qid === cqid);
      if (!city) continue;
      points.push({ qid: cqid, val, name: city.name, state: city.admin || '', iso: 'US', country: 'United States' });
    }
  }
  if (!points.length) return;

  // ── Sort & rank ──
  const ascending = def.higherBetter === false;
  points.sort((a, b) => ascending ? a.val - b.val : b.val - a.val);
  points.forEach((p, i) => { p.rank = i + 1; });

  // For Japan pref stats, self-identify by prefecture name
  const selfJapanPref = isJapanPrefStat ? _lookupJapanPref(selfCity)?.name : null;
  const entityIdx = isWbStat
    ? points.findIndex(p => p.qid === selfIso)
    : isJapanPrefStat
    ? points.findIndex(p => p.prefName === selfJapanPref)
    : points.findIndex(p => p.qid === qid);  // works for census, city, eurostat
  if (entityIdx < 0) { closeStatsPanel(); return; }
  const cp = points[entityIdx];

  // Store full list + set initial window around current entity
  _statsPoints   = points;
  _statsWinStart = Math.max(0, entityIdx - 5);
  _statsWinEnd   = Math.min(points.length - 1, entityIdx + 5);

  // Sub-rank
  let subRank = 0, subTotal = 0, subLabel = '';
  if (isWbStat && cp.region) {
    const regionPts = points.filter(p => p.region === cp.region);
    subRank  = regionPts.findIndex(p => p.qid === cp.qid) + 1;
    subTotal = regionPts.length;
    subLabel = cp.region;
  } else if (isEurostatStat && selfIso) {
    // Sub-rank by country among all Eurostat cities in same country
    const countryPts = points.filter(p => p.iso === selfIso);
    subRank  = countryPts.findIndex(p => p.qid === qid) + 1;
    subTotal = countryPts.length;
    subLabel = selfCountry || selfIso;
  } else if (isCityStat && _statsScope === 'world' && selfIso) {
    const countryPts = points.filter(p => p.iso === selfIso);
    subRank  = countryPts.findIndex(p => p.qid === qid) + 1;
    subTotal = countryPts.length;
    subLabel = selfCountry;
  } else if (!isCityStat && !isWbStat && !isEurostatStat && selfState) {
    const statePts = points.filter(p => p.state === selfState);
    subRank  = statePts.findIndex(p => p.qid === qid) + 1;
    subTotal = statePts.length;
    subLabel = selfState;
  }

  // ── Histogram ──
  const vals = points.map(p => p.val);
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const BUCKETS = 14;
  const bSize = (maxV - minV) / BUCKETS || 1;
  const counts = Array(BUCKETS).fill(0);
  const entityBkt = Math.min(BUCKETS-1, Math.floor((cp.val - minV) / bSize));
  for (const {val} of points) counts[Math.min(BUCKETS-1, Math.floor((val - minV) / bSize))]++;
  const maxCnt = Math.max(...counts, 1);
  const HW = 262, HH = 56, HPAD = 2;
  const bw = (HW - HPAD*2) / BUCKETS;
  const histBars = counts.map((cnt, i) => {
    const bh = Math.max(2, (cnt/maxCnt)*(HH-HPAD*2));
    const x = HPAD + i*bw, y = HH - HPAD - bh;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw-1).toFixed(1)}" height="${bh.toFixed(1)}" rx="1.5"
      fill="${i===entityBkt?'#f0a500':'#2a8ee8'}" opacity="${i===entityBkt?1:0.45}"/>`;
  }).join('');
  const markerX = HPAD + (entityBkt+0.5)*bw;
  const histSvg = `<svg viewBox="0 0 ${HW} ${HH+14}" width="${HW}" height="${HH+14}" style="display:block">
    ${histBars}
    <line x1="${markerX.toFixed(1)}" y1="0" x2="${markerX.toFixed(1)}" y2="${HH}" stroke="#f0a500" stroke-width="1.5" stroke-dasharray="3 2"/>
    <text x="${HPAD}" y="${HH+11}" font-size="7" fill="#6e7681" text-anchor="start">${def.fmt(minV)}</text>
    <text x="${HW/2}" y="${HH+11}" font-size="7" fill="#6e7681" text-anchor="middle">${def.fmt((minV+maxV)/2)}</text>
    <text x="${HW-HPAD}" y="${HH+11}" font-size="7" fill="#6e7681" text-anchor="end">${def.fmt(maxV)}</text>
  </svg>`;

  const note = def.higherBetter === true  ? '↑ higher ranked = higher value'
             : def.higherBetter === false ? '↑ higher ranked = lower value' : '';

  // ── Scope toggle (city stats only) ──
  const primaryLabel = isWbStat ? 'countries worldwide'
    : isJapanPrefStat ? 'Japanese prefectures'
    : isEurostatStat ? 'European cities (Eurostat)'
    : isCityStat ? (_statsScope === 'world' ? 'worldwide' : escHtml(selfCountry))
    : isCorpStat ? 'companies worldwide'
    : 'US cities with Census data';
  const scopeToggle = isCityStat ? `
    <div id="stats-scope-row">
      <button class="stats-scope-btn${_statsScope==='world'?' active':''}" onclick="setStatsScope('world')">🌍 World</button>
      <button class="stats-scope-btn${_statsScope==='country'?' active':''}" onclick="setStatsScope('country')"
        >📍 ${escHtml(selfCountry)}</button>
    </div>` : '';

  // ── Japan prefecture time-series chart ──────────────────────────────────
  // ── Eurostat time-series chart for clicked city ──────────────────────────
  let trendChartHtml = '';
  if (isJapanPrefStat && selfCity) {
    const jpMatch = _lookupJapanPref(selfCity);
    const histKey = metric === 'japan_perCapitaIncome' ? 'perCapitaIncomeHistory' : 'gdpHistory';
    const history = jpMatch?.data?.[histKey];
    if (history && history.length >= 2) {
      const TW = 262, TH = 54, TPAD = 4;
      const xs = history.map(([y]) => y);
      const vs = history.map(([, v]) => v);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minVt = Math.min(...vs), maxVt = Math.max(...vs);
      const rangeV = maxVt - minVt || 1;
      const toX = x => TPAD + (x - minX) / (maxX - minX || 1) * (TW - TPAD * 2);
      const toY = v => TH - TPAD - (v - minVt) / rangeV * (TH - TPAD * 2);
      const pts = history.map(([x, v]) => `${toX(x).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');
      const dots = history.map(([x, v]) =>
        `<circle cx="${toX(x).toFixed(1)}" cy="${toY(v).toFixed(1)}" r="1.8" fill="#f0a500" opacity="0.7"/>`).join('');
      const firstLbl = `${xs[0]}: ${def.fmt(vs[0])}`;
      const lastLbl  = `${xs[xs.length-1]}: ${def.fmt(vs[vs.length-1])}`;
      trendChartHtml = `<div class="stats-trend-wrap">
        <svg viewBox="0 0 ${TW} ${TH+16}" width="${TW}" height="${TH+16}" style="display:block">
          <polyline points="${pts}" fill="none" stroke="#58a6ff" stroke-width="1.8" stroke-linejoin="round" opacity="0.85"/>
          ${dots}
          <text x="${TPAD}" y="${TH+13}" font-size="7" fill="#6e7681">${escHtml(firstLbl)}</text>
          <text x="${TW-TPAD}" y="${TH+13}" font-size="7" fill="#f0a500" text-anchor="end">${escHtml(lastLbl)}</text>
        </svg>
      </div>`;
    }
  } else if (isEurostatStat && eurostatDef.histKey) {
    const esRecord = eurostatCities[qid];
    const history  = esRecord?.[eurostatDef.histKey];
    if (history && history.length >= 2) {
      const TW = 262, TH = 54, TPAD = 4;
      const xs = history.map(([y]) => y);
      const vs = history.map(([, v]) => v);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minV = Math.min(...vs), maxV = Math.max(...vs);
      const rangeV = maxV - minV || 1;
      const toX = x => TPAD + (x - minX) / (maxX - minX || 1) * (TW - TPAD * 2);
      const toY = v => TH - TPAD - (v - minV) / rangeV * (TH - TPAD * 2);
      const pts = history.map(([x, v]) => `${toX(x).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');
      // Dots for every data point
      const dots = history.map(([x, v]) =>
        `<circle cx="${toX(x).toFixed(1)}" cy="${toY(v).toFixed(1)}" r="1.8" fill="#f0a500" opacity="0.7"/>`).join('');
      // Labels
      const firstLbl = `${xs[0]}: ${def.fmt(vs[0])}`;
      const lastLbl  = `${xs[xs.length-1]}: ${def.fmt(vs[vs.length-1])}`;
      trendChartHtml = `<div class="stats-trend-wrap">
        <svg viewBox="0 0 ${TW} ${TH+16}" width="${TW}" height="${TH+16}" style="display:block">
          <polyline points="${pts}" fill="none" stroke="#58a6ff" stroke-width="1.8" stroke-linejoin="round" opacity="0.85"/>
          ${dots}
          <text x="${TPAD}" y="${TH+13}" font-size="7" fill="#6e7681">${escHtml(firstLbl)}</text>
          <text x="${TW-TPAD}" y="${TH+13}" font-size="7" fill="#f0a500" text-anchor="end">${escHtml(lastLbl)}</text>
        </svg>
      </div>`;
    }
  }

  // ── Render ──
  document.getElementById('stats-panel-title').textContent = def.label;
  document.getElementById('stats-panel-city').textContent  = cp.name + (selfState || (!isWbStat && selfCountry) ? ' · '+(selfState||selfCountry) : '');
  document.getElementById('stats-panel-body').innerHTML = `
    ${scopeToggle}
    ${trendChartHtml}
    <div class="stats-hist-wrap">${histSvg}</div>
    <div class="stats-ranks">
      <div class="stats-rank-badge">
        <span class="stats-rank-n">#${cp.rank} / ${points.length}</span>
        <span class="stats-rank-lbl">${primaryLabel}</span>
      </div>
      ${subRank > 0 ? `<div class="stats-rank-badge">
        <span class="stats-rank-n">#${subRank} / ${subTotal}</span>
        <span class="stats-rank-lbl">${escHtml(subLabel)}</span>
      </div>` : ''}
    </div>
    ${note ? `<div class="stats-note">${note}</div>` : ''}
    <div id="stats-rank-list-wrap" class="stats-rank-list"></div>
    <div class="stats-source">${points.length} ${primaryLabel} · click to navigate · click another stat to compare</div>
  `;
  const _sp = document.getElementById('stats-panel');
  const _wikiOpen = document.getElementById('wiki-sidebar')?.classList.contains('open');
  const _corpOpen = document.getElementById('corp-panel')?.classList.contains('open');
  const _cpOpen   = document.getElementById('country-panel')?.classList.contains('open');
  const _baseRight = _cpOpen ? 600 : (_wikiOpen && _corpOpen) ? 880 : _corpOpen ? 460 : 420;
  _sp.style.right = _baseRight + 'px';
  _sp.classList.add('open');
  _updateStatsListHtml();
}

function _updateStatsListHtml() {
  const metric = _statsCurrent?.metric;
  const def = STAT_DEFS[metric] || CITY_STAT_DEFS[metric] || WB_STAT_DEFS[metric] || EUROSTAT_STAT_DEFS[metric] || JAPAN_PREF_STAT_DEFS[metric];
  const listEl = document.getElementById('stats-rank-list-wrap');
  if (!listEl || !def || !_statsPoints.length) return;
  const { qid } = _statsCurrent;
  const isWbStat = !!WB_STAT_DEFS[metric];
  const isJapanPrefStat = !!JAPAN_PREF_STAT_DEFS[metric];
  const curId = isWbStat ? (_statsCurrent.qid) : qid;
  const aboveCount = _statsWinStart;
  const belowCount = _statsPoints.length - 1 - _statsWinEnd;
  // For Japan pref stats, current row matches by prefName
  const jpSelfCity = isJapanPrefStat ? allCities.find(c => c.qid === qid) : null;
  const jpSelfPref = isJapanPrefStat ? _lookupJapanPref(jpSelfCity)?.name : null;
  const rows = _statsPoints.slice(_statsWinStart, _statsWinEnd + 1).map(p => {
    const isCur = isJapanPrefStat ? (p.prefName === jpSelfPref) : (p.qid === curId);
    const navFn = isWbStat ? `statsGoToCountry('${p.qid}')` : `statsGoToCity('${p.qid}')`;
    const sub = isWbStat ? '' : (p.state ? ` · ${escHtml(p.state)}` : '');
    return `<div class="stats-rank-row${isCur?' stats-rank-current':''}" onclick="${navFn}">
      <span class="stats-rank-num">#${p.rank}</span>
      <span class="stats-rank-name">${escHtml(p.name)}<span class="stats-rank-sub">${sub}</span></span>
      <span class="stats-rank-val">${def.fmt(p.val)}</span>
    </div>`;
  }).join('');
  listEl.innerHTML = `
    ${aboveCount > 0 ? `<button class="stats-rank-more" onclick="statsExpandUp()">▲ ${aboveCount.toLocaleString()} more above</button>` : ''}
    ${rows}
    ${belowCount > 0 ? `<button class="stats-rank-more" onclick="statsExpandDown()">▼ ${belowCount.toLocaleString()} more below</button>` : ''}
  `;
  // Scroll current row into view
  listEl.querySelector('.stats-rank-current')?.scrollIntoView({ block: 'nearest' });
}

function statsExpandUp() {
  _statsWinStart = Math.max(0, _statsWinStart - STATS_WIN);
  _updateStatsListHtml();
  document.getElementById('stats-rank-list-wrap')?.scrollTo({ top: 0 });
}

function statsExpandDown() {
  _statsWinEnd = Math.min(_statsPoints.length - 1, _statsWinEnd + STATS_WIN);
  _updateStatsListHtml();
}

function statsGoToCity(qid) {
  const city = allCities.find(c => c.qid === qid);
  if (!city || city.lat == null) return;
  map.flyTo([city.lat, city.lng], Math.max(map.getZoom(), 5), { duration: 1 });
  openWikiSidebar(qid, city.name);
  // Update stats panel to highlight the new city (skip if same city — would toggle off)
  if (_statsCurrent && _statsCurrent.qid !== qid) openStatsPanel(_statsCurrent.metric, qid);
}

function statsGoToCountry(iso2) {
  const pt = CAPITAL_COORDS[iso2] || countryCentroids[iso2];
  if (pt) map.flyTo(pt, Math.max(map.getZoom(), 4), { duration: 1 });
  // Re-render stats panel highlighting the new country (skip if same — would toggle off)
  if (_statsCurrent && _statsCurrent.qid !== iso2) openStatsPanel(_statsCurrent.metric, iso2);
}

// ── Sidebar tab state ─────────────────────────────────────────────────────────
let _sidebarTab = 'info';   // persists across city clicks

const VALID_SIDEBAR_TABS = new Set(['info','economy','finance','overview']);

function switchWikiTab(tab) {
  // Guard: if tab name is invalid (e.g. stale 'census'/'business' from old session), fall back to info
  if (!VALID_SIDEBAR_TABS.has(tab)) tab = 'info';
  _sidebarTab = tab;
  ['info','economy','finance','overview'].forEach(t => {
    const el = document.getElementById(`wiki-tab-${t}`);
    if (el) el.style.display = t === tab ? '' : 'none';
  });
  document.querySelectorAll('.wiki-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  const body = document.getElementById('wiki-sidebar-body');
  if (body) body.scrollTop = 0;
  // Redraw Finance tab IYCharts — mounted while display:none, need a forced redraw
  if (tab === 'finance') {
    const finEl = document.getElementById('wiki-tab-finance');
    if (finEl?._iycRedraw) requestAnimationFrame(finEl._iycRedraw);
  }
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

  // ── Compact info chip grid (replaces Location/Demo/History/Economy table sections) ──
  function infoChip(label, val, isHtml = false, span2 = false, cityMetric = '') {
    if (!val && val !== 0) return '';
    const v = isHtml ? val : escHtml(String(val));
    const extraCls  = cityMetric ? ' info-chip-clickable' : '';
    const extraAttr = cityMetric ? ` onclick="openStatsPanel('${cityMetric}','${escHtml(city.qid)}')" title="Click to see world ranking"` : '';
    return `<div class="info-chip${span2?' info-chip-wide':''}${extraCls}"${extraAttr}><div class="info-chip-lbl">${label}</div><div class="info-chip-val">${v}</div></div>`;
  }
  const infoChips = `<div class="info-chips">
    ${city.pop != null ? infoChip('Population', fmtNum(city.pop) + (popAsOf ? ' <span class="info-chip-dim">' + popAsOf.replace(/<[^>]+>/g,'').trim() + '</span>' : ''), true, false, 'pop') : ''}
    ${city.country ? infoChip('Country', city.country) : ''}
    ${city.admin   ? infoChip('Region', city.admin)    : ''}
    ${city.settlement_type ? infoChip('Type', city.settlement_type) : ''}
    ${city.iso     ? infoChip('ISO', city.iso)         : ''}
    ${tzFmt        ? infoChip('Timezone', tzFmt, true)  : ''}
    ${coordsFmt    ? infoChip('Coords', coordsFmt)      : ''}
    ${city.elev_m != null ? infoChip('Elevation', fmtNum(city.elev_m) + ' m', false, false, 'elev_m') : ''}
    ${popMetroFmt  ? infoChip('Metro pop', popMetroFmt, false, false, 'pop_metro') : ''}
    ${popUrbanFmt  ? infoChip('Urban pop', popUrbanFmt) : ''}
    ${density      ? infoChip('Density', density, false, false, 'density') : ''}
    ${city.area_km2 != null ? infoChip('Area', fmtNum(city.area_km2) + ' km²', false, false, 'area_km2') : ''}
    ${foundedFmt   ? infoChip('Founded', foundedFmt, false, false, 'founded') : ''}
    ${nicknamesHtml ? infoChip('Known as', nicknamesHtml, true, true) : ''}
    ${gdpHtml      ? infoChip('City GDP', gdpHtml, true): ''}
    ${hdi          ? infoChip('HDI', hdi)               : ''}
    ${(() => { const g = gawcCities[city.qid]; if (!g) return ''; const col = GAWC_TIER_COLOR[g.tier] || '#8b949e'; return infoChip('World City', `<span class="gawc-tier-chip" style="background:${col}22;color:${col};border:1px solid ${col}55">${escHtml(g.tier)}</span>`, true, false, 'gawc_score'); })()}
    ${(() => { const a = airportData[city.qid]; if (!a) return ''; return infoChip('Airport', `<span style="color:#58a6ff;font-weight:600">✈ ${fmtNum(a.directDestinations)}</span> <span style="color:#8b949e;font-size:0.78em">direct routes · ${escHtml(a.iata)}</span>`, true, false, 'directDestinations'); })()}
    ${(() => {
      const ca = climateAnnual(getCityClimate(city));
      if (!ca) return '';
      const tempCol = ca.avgTemp > 25 ? '#ffa657' : ca.avgTemp > 15 ? '#3fb950' : ca.avgTemp > 5 ? '#58a6ff' : '#a5d6ff';
      const hotCl  = ca.hottestTemp > 30 ? '#f85149' : ca.hottestTemp > 22 ? '#ffa657' : '#f0a500';
      const coldCl = ca.coldestTemp < 0 ? '#a5d6ff' : ca.coldestTemp < 8 ? '#79c0ff' : '#58a6ff';
      let out = '';
      out += infoChip('Avg Temp',   `<span style="color:${tempCol};font-weight:600">${ca.avgTemp.toFixed(1)}°C</span>`, true, false, 'annualAvgTemp');
      out += infoChip('Hot/Cold',   `<span style="color:${hotCl};font-weight:600">${ca.hottestTemp.toFixed(1)}°C</span> <span style="color:#6e7681">/</span> <span style="color:${coldCl};font-weight:600">${ca.coldestTemp.toFixed(1)}°C</span>`, true, false, 'hottestMonthTemp');
      out += infoChip('Rainfall',   `<span style="color:#79c0ff;font-weight:600">${fmtNum(Math.round(ca.precipMm))}</span><span style="color:#8b949e;font-size:0.78em"> mm/yr</span>`, true, false, 'annualPrecipMm');
      if (ca.sunHours != null) out += infoChip('Sunshine', `<span style="color:#f0a500;font-weight:600">${fmtNum(Math.round(ca.sunHours))}</span><span style="color:#8b949e;font-size:0.78em"> hrs/yr</span>`, true, false, 'annualSunHours');
      return out;
    })()}
  </div>`;

  const govSec = leadersHtml
    ? `<tr><td colspan="2" class="wiki-info-section-head">Government</td></tr>${leadersHtml}`
    : '';
  const linksSec = section('Links', [
    row('Website', websiteHtml, !!websiteHtml),
    row('Sister cities', sistersHtml, !!sistersHtml),
    row('GeoNames', geonamesHtml, !!geonamesHtml),
  ]);

  // ── World Bank country context (bound via city.iso) — compact chip grid ──
  const wb = city.iso ? countryData[city.iso] : null;
  function wbChip(label, key, fmt, wbMetric) {
    if (!wb || wb[key] == null) return '';
    const yr = wb[key + '_year'] ? ` <span class="wb-chip-yr">${wb[key + '_year']}</span>` : '';
    const extra = wbMetric && city.iso
      ? ` wb-chip-clickable" onclick="openStatsPanel('${wbMetric}','${escHtml(city.iso)}')" title="Click to see country rankings"`
      : `"`;
    return `<div class="wb-chip${extra}><div class="wb-chip-lbl">${label}</div><div class="wb-chip-val">${escHtml(fmt(wb[key]))}${yr}</div></div>`;
  }
  const wbSec = wb ? `<tr><td colspan="2" class="wiki-info-section-head">Country · ${escHtml(wb.name || city.country || city.iso)} <span style="color:#484f58;font-size:0.75em">(World Bank)</span></td></tr>
    <tr><td colspan="2" class="wb-chips-row">
      <div class="wb-chips">
        ${wbChip('GDP/cap',    'gdp_per_capita',  v => '$'+Math.round(v).toLocaleString(), 'wb_gdp_per_capita')}
        ${wbChip('Life exp.',  'life_expectancy', v => v.toFixed(1)+' yr',                'wb_life_expectancy')}
        ${wbChip('Urban',      'urban_pct',       v => v.toFixed(1)+'%',                  'wb_urban_pct')}
        ${wbChip('Internet',   'internet_pct',    v => v.toFixed(1)+'%',                  'wb_internet_pct')}
        ${wbChip('Gini',       'gini',            v => v.toFixed(1),                      'wb_gini')}
        ${wbChip('Literacy',   'literacy_rate',   v => v.toFixed(1)+'%',                  'wb_literacy_rate')}
        ${wbChip('Child mort.','child_mortality', v => v.toFixed(1)+'/1k',               'wb_child_mortality')}
        ${wbChip('Electric.',  'electricity_pct', v => v.toFixed(1)+'%',                  'wb_electricity_pct')}
        ${wbChip('PM2.5',      'pm25',            v => v.toFixed(1)+' μg/m³',             'wb_pm25')}
        ${wbChip('Forest',     'forest_pct',      v => v.toFixed(1)+'%',                  'wb_forest_pct')}
        ${wbChip('Air deaths', 'air_death_rate',  v => v.toFixed(1)+'/100k',             'wb_air_death_rate')}
        ${wbChip('Road deaths','road_death_rate', v => v.toFixed(1)+'/100k',             'wb_road_death_rate')}
        ${wb.income_level ? `<div class="wb-chip wb-chip-full"><div class="wb-chip-lbl">Income level</div><div class="wb-chip-val">${escHtml(wb.income_level)}</div></div>` : ''}
      </div>
    </td></tr>` : '';

  // ── Climate chart ──
  const climateHtml = (() => {
    const cl = getCityClimate(city);
    if (!cl || !cl.months || !cl.months.length) return '';
    const mons = cl.months;
    const hasTemp = mons.some(m => m.high_c != null || m.low_c != null);
    const hasPrec = mons.some(m => m.precipitation_mm != null);
    const hasMean = mons.some(m => m.mean_c != null);
    if (!hasTemp && !hasPrec) return '';

    const MON_ABB  = ['J','F','M','A','M','J','J','A','S','O','N','D'];
    const MON_MED  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const MON_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    // ── Layout ──────────────────────────────────────────────────────────────
    const LP = 30, RP = hasPrec ? 26 : 4, TP = 16, BP = 18;
    const CW = 204, CH = 94;
    const TW = LP + CW + RP, TH = TP + CH + BP;
    const barW = Math.floor(CW / 12) - 1;  // ~16 px per column

    // ── Temperature scale ───────────────────────────────────────────────────
    const allTemps = mons.flatMap(m => [m.high_c, m.low_c, m.mean_c].filter(v => v != null));
    const tMinRaw = allTemps.length ? Math.min(...allTemps) : 0;
    const tMaxRaw = allTemps.length ? Math.max(...allTemps) : 30;
    const tPad  = Math.max((tMaxRaw - tMinRaw) * 0.12, 2);
    const tMin  = Math.floor((tMinRaw - tPad) / 5) * 5;
    const tMax  = Math.ceil((tMaxRaw  + tPad) / 5) * 5;
    const tRange = tMax - tMin || 1;
    const tY = v => v == null ? null : TP + CH - Math.round(((v - tMin) / tRange) * CH);

    // ── Precipitation scale ─────────────────────────────────────────────────
    const allPrec  = mons.map(m => m.precipitation_mm || 0);
    const pMaxRaw  = Math.max(...allPrec, 1);
    const pAxisMax = Math.ceil(pMaxRaw / 50) * 50;
    const pBarH    = v => Math.round((v / pAxisMax) * CH);

    // ── Y-axis ticks ────────────────────────────────────────────────────────
    const tStep = (tMax - tMin) <= 20 ? 5 : (tMax - tMin) <= 45 ? 10 : 20;
    const tTicks = [];
    for (let t = Math.ceil(tMin / tStep) * tStep; t <= tMax; t += tStep) tTicks.push(t);
    const pStep = pAxisMax <= 100 ? 50 : pAxisMax <= 400 ? 100 : 200;
    const pTicks = [];
    for (let p = pStep; p < pAxisMax; p += pStep) pTicks.push(p);

    // ── Grid lines ──────────────────────────────────────────────────────────
    const svgGrid = tTicks.map(t => {
      const y = tY(t), zero = t === 0;
      return `<line x1="${LP}" y1="${y}" x2="${LP+CW}" y2="${y}"
        stroke="${zero ? '#388bfd' : '#21262d'}" stroke-width="${zero ? 1.2 : 0.7}"
        stroke-dasharray="${zero ? '3 2' : '4 3'}"/>`;
    }).join('');

    // ── Axes ────────────────────────────────────────────────────────────────
    const svgAxes = `
      <line x1="${LP}" y1="${TP}" x2="${LP}" y2="${TP+CH}" stroke="#30363d" stroke-width="1.2"/>
      <line x1="${LP}" y1="${TP+CH}" x2="${LP+CW}" y2="${TP+CH}" stroke="#30363d" stroke-width="1.2"/>
      ${hasPrec ? `<line x1="${LP+CW}" y1="${TP}" x2="${LP+CW}" y2="${TP+CH}" stroke="#1e3a5f" stroke-width="0.9"/>` : ''}`;

    // ── Y-axis labels ───────────────────────────────────────────────────────
    const svgTLabels = tTicks.map(t => {
      const y = tY(t), zero = t === 0;
      return `<text x="${LP-4}" y="${y+3}" text-anchor="end" font-size="7.5"
        fill="${zero ? '#58a6ff' : '#6e7681'}">${t > 0 ? '+' : ''}${t}°</text>`;
    }).join('');
    const svgPLabels = hasPrec ? pTicks.map(p => {
      const y = TP + CH - pBarH(p);
      if (y < TP + 6 || y > TP + CH - 6) return '';
      return `<text x="${LP+CW+4}" y="${y+3}" text-anchor="start" font-size="7" fill="#3b82f6aa">${p}</text>`;
    }).join('') : '';
    const svgUnits = `
      <text x="${LP-4}" y="${TP-4}" text-anchor="end" font-size="7" fill="#484f58">°C</text>
      ${hasPrec ? `<text x="${LP+CW+4}" y="${TP-4}" text-anchor="start" font-size="7" fill="#1f4d8e">mm</text>` : ''}`;

    // ── Column groups (bars + hover + labels) ───────────────────────────────
    const svgCols = mons.map((m, i) => {
      const x  = LP + i * (barW + 1);
      const cx = x + Math.floor(barW / 2);
      let bars = '';

      // Precipitation bar
      if (hasPrec && m.precipitation_mm != null) {
        const bh = pBarH(m.precipitation_mm);
        const by = TP + CH - bh;
        bars += `<rect x="${x}" y="${by}" width="${barW}" height="${bh}" fill="#1f6feb" opacity="0.28" rx="1"/>`;
        const pv = Math.round(m.precipitation_mm);
        if (bh >= 16) {
          bars += `<text x="${cx}" y="${by+bh-3}" text-anchor="middle" font-size="6.5" fill="#58a6ff" opacity="0.95">${pv}</text>`;
        } else if (bh >= 3) {
          bars += `<text x="${cx}" y="${by-2}" text-anchor="middle" font-size="6" fill="#3b82f6" opacity="0.8">${pv}</text>`;
        }
      }

      // Temperature range bar
      if (m.high_c != null) {
        const y1 = tY(m.high_c);
        const y2 = m.low_c != null ? tY(m.low_c) : y1 + 4;
        bars += `<rect x="${x+1}" y="${y1}" width="${barW-2}" height="${Math.max(y2-y1,2)}" fill="#f78166" opacity="0.82" rx="1"/>`;
        // Mean temp value above bar (fall back to high_c if mean unavailable)
        const labelVal = m.mean_c ?? m.high_c;
        const lSign = labelVal > 0 ? '+' : '';
        bars += `<text x="${cx}" y="${y1-3}" text-anchor="middle" font-size="7" fill="#ffa07a" font-weight="600">${lSign}${labelVal}°</text>`;
      }

      // Tooltip
      const tip = [MON_FULL[i],
        m.high_c  != null ? `↑ ${m.high_c > 0?'+':''}${m.high_c}°C`  : null,
        m.low_c   != null ? `↓ ${m.low_c  > 0?'+':''}${m.low_c}°C`   : null,
        m.mean_c  != null ? `≈ ${m.mean_c > 0?'+':''}${m.mean_c}°C`  : null,
        m.precipitation_mm != null ? `💧 ${m.precipitation_mm} mm`    : null,
        m.sun     != null ? `☀ ${m.sun} hrs`                          : null,
      ].filter(Boolean).join('\n');

      return `<g class="climate-col">
        <title>${escHtml(tip)}</title>
        <rect class="climate-col-bg" x="${x}" y="${TP}" width="${barW}" height="${CH}" rx="1"/>
        ${bars}
        <text class="climate-mon-abbr" x="${cx}" y="${TP+CH+13}" text-anchor="middle" font-size="8" fill="#8b949e">${MON_ABB[i]}</text>
        <text class="climate-mon-full" x="${cx}" y="${TP+CH+13}" text-anchor="middle" font-size="7" fill="#c9d1d9" font-weight="600">${MON_MED[i]}</text>
      </g>`;
    }).join('');

    // ── Mean temperature line (drawn on top of bars) ─────────────────────────
    let meanSvg = '';
    if (hasMean) {
      const pts = mons.map((m, i) => {
        if (m.mean_c == null) return null;
        return `${LP + i*(barW+1) + Math.floor(barW/2)},${tY(m.mean_c)}`;
      }).filter(Boolean);
      if (pts.length > 1) {
        meanSvg  = `<path d="M${pts.join('L')}" fill="none" stroke="#ffa657" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" opacity="0.9" pointer-events="none"/>`;
        meanSvg += pts.map(p => `<circle cx="${p.split(',')[0]}" cy="${p.split(',')[1]}" r="2" fill="#ffa657" opacity="0.9" pointer-events="none"/>`).join('');
      }
    }

    // ── Legend + source ─────────────────────────────────────────────────────
    const legend = [
      hasTemp ? `<span><span class="clim-swatch" style="background:#f78166;opacity:0.85"></span>Hi/Lo °C</span>` : '',
      hasMean ? `<span><span class="clim-line-swatch"></span>Mean</span>` : '',
      hasPrec ? `<span><span class="clim-swatch" style="background:#1f6feb;opacity:0.45"></span>Precip mm</span>` : '',
    ].filter(Boolean).join('');
    const sourceLabel = cl.location
      ? `<div style="font-size:0.63rem;color:#484f58;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(cl.location)}</div>`
      : '';

    return `
      <div class="wiki-climate-wrap">
        <div class="wiki-climate-head">Climate <span style="font-size:0.65rem;color:#484f58;font-weight:400">· hover for details</span></div>
        <svg viewBox="0 0 ${TW} ${TH}" width="100%" style="display:block;overflow:visible">
          ${svgGrid}${svgAxes}${svgTLabels}${svgPLabels}${svgUnits}
          ${svgCols}
          ${meanSvg}
        </svg>
        <div class="clim-legend">${legend}</div>
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

  // ── Tab data availability ──
  const censusData    = city.iso === 'US' ? getCensusData(city) : null;
  const businessData  = city.iso === 'US' ? (censusBusiness[city.qid] || null) : null;
  const eurostatData  = eurostatCities[city.qid] || null;
  // Japan prefecture lookup: match city.admin to a prefecture name
  const japanPref     = city.iso === 'JP' ? _lookupJapanPref(city) : null;
  const hasCensus     = !!(censusData || businessData);
  const hasEurostat   = !!eurostatData;
  const hasJapan      = !!japanPref;
  const hasEconomy    = hasCensus || hasEurostat || hasJapan;

  const econBtnEl = document.getElementById('wiki-tab-economy-btn');
  if (econBtnEl) {
    econBtnEl.style.display = hasEconomy ? '' : 'none';
    econBtnEl.textContent   = hasCensus ? 'Census' : hasEurostat ? 'Eurostat' : 'Prefecture';
  }

  // Fall back to Info if active tab is invalid or has no data for this city
  if (!VALID_SIDEBAR_TABS.has(_sidebarTab) || (_sidebarTab === 'economy' && !hasEconomy)) _sidebarTab = 'info';

  // ── Populate tab content divs ──
  const infoEl     = document.getElementById('wiki-tab-info');
  const economyEl  = document.getElementById('wiki-tab-economy');
  const overviewEl = document.getElementById('wiki-tab-overview');

  if (infoEl) infoEl.innerHTML = `
    ${carouselHtml}
    <div class="wiki-city-header">
      <div class="wiki-city-name">${escHtml(city.name)}</div>
      ${city.desc ? `<div class="wiki-city-desc">${escHtml(city.desc)}</div>` : ''}
    </div>
    ${infoChips}
    ${(govSec || linksSec || wbSec) ? `<table class="wiki-info-table">${govSec}${linksSec}${wbSec}</table>` : ''}
  `;
  if (economyEl)  economyEl.innerHTML  = hasCensus   ? buildEconomyHtml(censusData, businessData, city.qid)
                                       : hasEurostat ? buildEurostatHtml(eurostatData, city.qid)
                                       : hasJapan    ? buildJapanPrefHtml(japanPref.data, japanPref.name, city.qid)
                                       : '';
  if (overviewEl) overviewEl.innerHTML = `${climateHtml}${extractHtml}`;

  switchWikiTab(_sidebarTab);

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

// ── US Census ACS Data ────────────────────────────────────────────────────────
// Pre-built dataset (generated by scripts/fetch-census-data.js).
// Loaded once at startup alongside other JSON files.

let censusCities   = {};   // QID → ACS indicators (from census-cities.json)
let censusBusiness = {};   // QID → business/pop data (from census-business.json)
let beaTradeData   = {};   // ISO2 → [{year,expGds,impGds,expSvc,impSvc}] (from bea-trade.json)
let eurostatCities = {};   // QID → Eurostat Urban Audit indicators (from eurostat-cities.json)
let gawcCities     = {};   // QID → {tier, score} (GaWC 2024 world city network)
let japanPrefData  = {};   // prefecture English name → {perCapitaIncomeJpy, gdpJpy, ...}
let airportData    = {};   // QID → {iata, airportName, directDestinations, airportCount, airports[]}
let zillowData     = {};   // QID → {zhvi, zhviHistory, zori, zoriHistory}
let climateExtra   = {};   // QID → climate record for cities missing climate in cities-full.json
let _cpCurrentIso2 = null;
let _cpEscListener = null;
function _cpMapClickHandler() { if (_cpCurrentIso2) closeCountryPanel(); }

const ISO2_TO_ISO3 = { US:"USA", GB:"GBR", DE:"DEU", FR:"FRA", JP:"JPN",
  CN:"CHN", IN:"IND", BR:"BRA", CA:"CAN", AU:"AUS", KR:"KOR", MX:"MEX",
  ID:"IDN", TR:"TUR", SA:"SAU", RU:"RUS", ZA:"ZAF", AR:"ARG", NG:"NGA",
  IT:"ITA", ES:"ESP", PL:"POL", NL:"NLD", CH:"CHE", SE:"SWE", NO:"NOR",
  DK:"DNK", FI:"FIN", BE:"BEL", AT:"AUT", PT:"PRT", GR:"GRC", CZ:"CZE",
  HU:"HUN", RO:"ROU", UA:"UKR", IL:"ISR", AE:"ARE", SG:"SGP",
  MY:"MYS", TH:"THA", VN:"VNM", PH:"PHL", PK:"PAK", BD:"BGD" };

let censusColorMetric = null;  // null = off, or key like 'medianIncome'

// GaWC tier → numeric score (Alpha++=12 … Sufficiency=1)
const GAWC_TIER_SCORE = {
  'Alpha++': 12, 'Alpha+': 11, 'Alpha': 10, 'Alpha-': 9,
  'Beta+': 8, 'Beta': 7, 'Beta-': 6,
  'Gamma+': 5, 'Gamma': 4, 'Gamma-': 3,
  'High sufficiency': 2, 'Sufficiency': 1,
};
const GAWC_TIER_COLOR = {
  'Alpha++': '#f0a500', 'Alpha+': '#f0a500', 'Alpha': '#58a6ff', 'Alpha-': '#58a6ff',
  'Beta+': '#3fb950', 'Beta': '#3fb950', 'Beta-': '#3fb950',
  'Gamma+': '#8b949e', 'Gamma': '#8b949e', 'Gamma-': '#8b949e',
  'High sufficiency': '#484f58', 'Sufficiency': '#484f58',
};


// Color scale config per metric: { lo, hi, stops: [[r,g,b],…] }
const CENSUS_METRICS = {
  medianIncome:    { label: 'Median Income',    lo: '$30k', hi: '$150k+', min: 30000,  max: 150000, stops: [[31,102,235],[63,185,80],[240,165,0]] },
  povertyPct:      { label: 'Poverty Rate',     lo: '0%',   hi: '40%+',  min: 0,      max: 40,     stops: [[63,185,80],[255,166,87],[248,81,73]] },
  unemploymentPct: { label: 'Unemployment',     lo: '0%',   hi: '15%+',  min: 0,      max: 15,     stops: [[63,185,80],[255,166,87],[248,81,73]] },
  rentBurdenedPct: { label: 'Rent-Burdened',    lo: '10%',  hi: '60%+',  min: 10,     max: 60,     stops: [[63,185,80],[255,166,87],[248,81,73]] },
  gini:            { label: 'Gini Index',       lo: '0.30', hi: '0.60+', min: 0.30,   max: 0.60,   stops: [[63,185,80],[255,166,87],[248,81,73]] },
  bachelorPlusPct: { label: 'College-Educated', lo: '10%',  hi: '70%+',  min: 10,     max: 70,     stops: [[31,102,235],[88,166,255],[224,240,255]] },
  snapPct:         { label: 'SNAP Receipt',     lo: '0%',   hi: '30%+',  min: 0,      max: 30,     stops: [[63,185,80],[255,166,87],[248,81,73]] },
  transitPct:      { label: 'Transit Use',      lo: '0%',   hi: '40%+',  min: 0,      max: 40,     stops: [[224,240,255],[88,166,255],[31,102,235]] },
  medianAge:       { label: 'Median Age',       lo: '25',   hi: '45+',   min: 25,     max: 45,     stops: [[88,166,255],[31,102,235],[111,66,193]] },
  ownerOccPct:     { label: 'Homeownership',    lo: '20%',  hi: '80%+',  min: 20,     max: 80,     stops: [[224,240,255],[63,185,80],[31,102,235]] },
};

function _censusColorInterp(t, stops) {
  // t in [0,1]; stops is array of [r,g,b]
  t = Math.max(0, Math.min(1, t));
  const seg = (stops.length - 1) * t;
  const i = Math.min(Math.floor(seg), stops.length - 2);
  const f = seg - i;
  const a = stops[i], b = stops[i + 1];
  return `rgb(${Math.round(a[0]+(b[0]-a[0])*f)},${Math.round(a[1]+(b[1]-a[1])*f)},${Math.round(a[2]+(b[2]-a[2])*f)})`;
}

function censusDotColor(city) {
  if (!censusColorMetric || city.iso !== 'US') return null;
  const d = censusCities[city.qid];
  if (!d) return '#484f58';   // US city but no census data → dim gray
  const cfg = CENSUS_METRICS[censusColorMetric];
  if (!cfg) return null;
  const val = d[censusColorMetric];
  if (val == null) return '#484f58';
  const t = (val - cfg.min) / (cfg.max - cfg.min);
  return _censusColorInterp(t, cfg.stops);
}

function setCensusColorMetric(val) {
  censusColorMetric = val || null;
  const bar = document.getElementById('census-color-bar');
  if (bar) {
    const inner = document.getElementById('census-color-legend-inner');
    if (censusColorMetric && CENSUS_METRICS[censusColorMetric]) {
      const cfg = CENSUS_METRICS[censusColorMetric];
      document.getElementById('census-leg-lo').textContent = cfg.lo;
      document.getElementById('census-leg-hi').textContent = cfg.hi;
      // Draw gradient canvas
      const canvas = document.getElementById('census-color-ramp');
      if (canvas) {
        const ctx = canvas.getContext('2d');
        const grd = ctx.createLinearGradient(0, 0, canvas.width, 0);
        cfg.stops.forEach((s, i) => {
          grd.addColorStop(i / (cfg.stops.length - 1), `rgb(${s[0]},${s[1]},${s[2]})`);
        });
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      if (inner) inner.style.display = '';
    } else {
      if (inner) inner.style.display = 'none';
    }
  }
  rebuildMapLayer();
}

function getCensusData(city) {
  return censusCities[city.qid] || null;
}

const CENSUS_BRACKET_LABELS = ['< $15k','$15–25k','$25–50k','$50–75k','$75–100k','$100–150k','$150–200k','$200k+'];
const CENSUS_BRACKET_COLORS = ['#8b949e','#58a6ff','#2a8ee8','#3fb950','#56d364','#ffa657','#f0a500','#e05c2e'];

// Stat definitions for the distribution ranking panel
// higherBetter: true = rank 1 is highest value, false = rank 1 is lowest, null = no judgment
const STAT_DEFS = {
  medianIncome:    { label:'Median Income',       src:'acs', key:'medianIncome',       fmt: v=>'$'+fmtNum(Math.round(v)),        higherBetter:true },
  povertyPct:      { label:'Poverty Rate',         src:'acs', key:'povertyPct',         fmt: v=>v.toFixed(1)+'%',                 higherBetter:false },
  unemploymentPct: { label:'Unemployment Rate',    src:'acs', key:'unemploymentPct',    fmt: v=>v.toFixed(1)+'%',                 higherBetter:false },
  rentBurdenedPct: { label:'Rent-Burdened',        src:'acs', key:'rentBurdenedPct',    fmt: v=>v.toFixed(1)+'%',                 higherBetter:false },
  medianRent:      { label:'Median Rent',          src:'acs', key:'medianRent',         fmt: v=>'$'+fmtNum(Math.round(v))+'/mo',  higherBetter:null },
  medianHomeValue: { label:'Median Home Value',    src:'acs', key:'medianHomeValue',    fmt: v=>'$'+fmtNum(Math.round(v)),        higherBetter:null },
  gini:            { label:'Gini Index',           src:'acs', key:'gini',               fmt: v=>v.toFixed(3),                     higherBetter:false },
  snapPct:         { label:'SNAP Receipt',         src:'acs', key:'snapPct',            fmt: v=>v.toFixed(1)+'%',                 higherBetter:false },
  bachelorPlusPct: { label:'College-Educated',     src:'acs', key:'bachelorPlusPct',    fmt: v=>v.toFixed(1)+'%',                 higherBetter:true },
  transitPct:      { label:'Transit Use',          src:'acs', key:'transitPct',         fmt: v=>v.toFixed(1)+'%',                 higherBetter:null },
  medianAge:       { label:'Median Age',           src:'acs', key:'medianAge',          fmt: v=>v.toFixed(0)+' yr',               higherBetter:null },
  ownerOccPct:     { label:'Homeownership Rate',   src:'acs', key:'ownerOccPct',        fmt: v=>v.toFixed(1)+'%',                 higherBetter:null },
  totalEstab:      { label:'Total Establishments', src:'biz', key: d=>d.cbp?.total?.estab,                                       fmt: v=>fmtNum(v),            higherBetter:null },
  totalPayroll:    { label:'Total Payroll/yr',     src:'biz', key: d=>d.cbp?.total?.payann,                                      fmt: v=>'$'+fmtRevenue(v*1000), higherBetter:null },
  mfgShare:        { label:'Manufacturing Share',  src:'biz', key: d=>{const t=d.cbp?.total?.estab,m=d.cbp?.manufacturing?.estab;return t&&m?m/t*100:null;}, fmt:v=>v.toFixed(1)+'%', higherBetter:null },
  popGrowthPct:    { label:'Population Growth',    src:'biz', key: d=>d.popTrend?.growthPct,                                     fmt: v=>(v>=0?'+':'')+v.toFixed(1)+'%', higherBetter:true },
  selfEmplPct:     { label:'Self-Employment Rate', src:'biz', key: d=>{const p=d.selfEmpl?.selfEmplPct;return p!=null&&p<35?p:null;}, fmt:v=>v.toFixed(1)+'%', higherBetter:null },
};

/** Return the best available climate record for a city (Wikipedia months or Open-Meteo extra). */
function getCityClimate(city) {
  if (city.climate?.months?.length === 12) return city.climate;
  const ex = climateExtra[city.qid];
  if (ex?.months?.length === 12) return ex;
  return null;
}

/** Compute annual summary from a climate record with months[]. Returns null if insufficient data. */
function climateAnnual(clim) {
  if (!clim?.months?.length) return null;
  const m = clim.months;
  // Use stored annualAvgTemp/etc if present (from climate-extra); otherwise compute from months
  const avgTemp    = clim.annualAvgTemp      ?? +(m.reduce((s, mo) => s + (mo.mean_c ?? (mo.high_c + mo.low_c) / 2), 0) / m.length).toFixed(1);
  const precipMm   = clim.annualPrecipMm     ?? +m.reduce((s, mo) => s + (mo.precipitation_mm ?? 0), 0).toFixed(0);
  const sunHours   = clim.annualSunHours     ?? (m.some(mo => mo.sun != null) ? +m.reduce((s, mo) => s + (mo.sun ?? 0), 0).toFixed(0) : null);
  const hottest    = m.reduce((a, b) => (b.mean_c ?? (b.high_c + b.low_c)/2) > (a.mean_c ?? (a.high_c + a.low_c)/2) ? b : a);
  const coldest    = m.reduce((a, b) => (b.mean_c ?? (b.high_c + b.low_c)/2) < (a.mean_c ?? (a.high_c + a.low_c)/2) ? b : a);
  return {
    avgTemp,
    precipMm,
    sunHours,
    hottestTemp: hottest.mean_c ?? (hottest.high_c + hottest.low_c) / 2,
    coldestTemp: coldest.mean_c ?? (coldest.high_c + coldest.low_c) / 2,
  };
}

// City-level stats from allCities — support world/national scope toggle
const CITY_STAT_DEFS = {
  pop:        { label:'City Population',    key: c=>c.pop,                                                         fmt: v=>fmtNum(v),                     higherBetter:null },
  pop_metro:  { label:'Metro Population',   key: c=>c.pop_metro,                                                   fmt: v=>fmtNum(v),                     higherBetter:null },
  area_km2:   { label:'City Area',          key: c=>c.area_km2,                                                    fmt: v=>fmtNum(Math.round(v))+' km²',  higherBetter:null },
  density:    { label:'Pop. Density',       key: c=>c.pop&&c.area_km2?Math.round(c.pop/c.area_km2):null,           fmt: v=>fmtNum(v)+'/km²',             higherBetter:null },
  elev_m:     { label:'Elevation',          key: c=>c.elev_m,                                                      fmt: v=>fmtNum(Math.round(v))+' m',   higherBetter:null },
  founded:    { label:'Year Founded',       key: c=>c.founded,                                                     fmt: v=>v<0?Math.abs(v)+' BC':String(v), higherBetter:false },
  gawc_score: { label:'GaWC World City Rank', key: c=>gawcCities[c.qid]?.score ?? null,
                fmt: v => { const tier = Object.entries(GAWC_TIER_SCORE).find(([,s])=>s===v)?.[0]||''; return tier; },
                higherBetter:true },
  directDestinations: { label:'Direct Air Destinations', key: c=>airportData[c.qid]?.directDestinations ?? null,
                fmt: v => fmtNum(v) + ' airports', higherBetter:true },
  zhvi: { label:'Home Value (Zillow ZHVI)',  key: c=>zillowData[c.qid]?.zhvi  ?? null,
          fmt: v => '$' + fmtNum(Math.round(v)), higherBetter:null },
  zori: { label:'Rent Index (Zillow ZORI)',  key: c=>zillowData[c.qid]?.zori  ?? null,
          fmt: v => '$' + fmtNum(Math.round(v)) + '/mo', higherBetter:null },
  annualAvgTemp:  { label:'Annual Avg Temperature', key: c => { const a = climateAnnual(getCityClimate(c)); return a ? a.avgTemp : null; },
                    fmt: v => v.toFixed(1) + '°C', higherBetter:null },
  annualPrecipMm: { label:'Annual Precipitation',   key: c => { const a = climateAnnual(getCityClimate(c)); return a ? a.precipMm : null; },
                    fmt: v => fmtNum(Math.round(v)) + ' mm', higherBetter:null },
  annualSunHours: { label:'Annual Sunshine Hours',  key: c => { const a = climateAnnual(getCityClimate(c)); return a?.sunHours ?? null; },
                    fmt: v => fmtNum(Math.round(v)) + ' hrs', higherBetter:null },
  hottestMonthTemp: { label:'Hottest Month Avg °C', key: c => { const a = climateAnnual(getCityClimate(c)); return a ? a.hottestTemp : null; },
                      fmt: v => v.toFixed(1) + '°C', higherBetter:null },
  coldestMonthTemp: { label:'Coldest Month Avg °C', key: c => { const a = climateAnnual(getCityClimate(c)); return a ? a.coldestTemp : null; },
                      fmt: v => v.toFixed(1) + '°C', higherBetter:null },
};

// Country-level World Bank stats — iso2 used as identifier (not city qid)
const WB_STAT_DEFS = {
  wb_gdp_per_capita:  { label:'GDP per Capita',              key:'gdp_per_capita',  fmt: v=>'$'+Math.round(v).toLocaleString(), higherBetter:true  },
  wb_life_expectancy: { label:'Life Expectancy',             key:'life_expectancy', fmt: v=>v.toFixed(1)+' yrs',                higherBetter:true  },
  wb_urban_pct:       { label:'Urban Population',            key:'urban_pct',       fmt: v=>v.toFixed(1)+'%',                   higherBetter:null  },
  wb_internet_pct:    { label:'Internet Access',             key:'internet_pct',    fmt: v=>v.toFixed(1)+'%',                   higherBetter:true  },
  wb_gini:            { label:'Gini Coefficient',            key:'gini',            fmt: v=>v.toFixed(1),                       higherBetter:false },
  wb_literacy_rate:   { label:'Literacy Rate',               key:'literacy_rate',   fmt: v=>v.toFixed(1)+'%',                   higherBetter:true  },
  wb_child_mortality: { label:'Child Mortality',             key:'child_mortality', fmt: v=>v.toFixed(1)+'/1k',                 higherBetter:false },
  wb_electricity_pct: { label:'Electricity Access',          key:'electricity_pct', fmt: v=>v.toFixed(1)+'%',                   higherBetter:true  },
  wb_pm25:            { label:'PM2.5 Air Pollution',         key:'pm25',            fmt: v=>v.toFixed(1)+' μg/m³',              higherBetter:false },
  wb_forest_pct:      { label:'Forest Cover',                key:'forest_pct',      fmt: v=>v.toFixed(1)+'%',                   higherBetter:null  },
  wb_air_death_rate:      { label:'Air Pollution Mortality',  key:'air_death_rate',      fmt: v=>v.toFixed(1)+'/100k',   higherBetter:false },
  wb_road_death_rate:     { label:'Road Traffic Mortality',  key:'road_death_rate',     fmt: v=>v.toFixed(1)+'/100k',   higherBetter:false },
  wb_govt_debt_gdp:       { label:'Govt Debt (% GDP)',       key:'govt_debt_gdp',       fmt: v=>v.toFixed(1)+'%',       higherBetter:false },
  wb_fiscal_balance_gdp:  { label:'Fiscal Balance (% GDP)',  key:'fiscal_balance_gdp',  fmt: v=>v.toFixed(1)+'%',       higherBetter:true  },
  wb_cpi_inflation:       { label:'CPI Inflation',           key:'cpi_inflation',       fmt: v=>v.toFixed(1)+'%',       higherBetter:false },
  wb_unemployment_rate:   { label:'Unemployment Rate',       key:'unemployment_rate',   fmt: v=>v.toFixed(1)+'%',       higherBetter:false },
  wb_bond_yield_10y:      { label:'10-Year Bond Yield',      key:'bond_yield_10y',      fmt: v=>v.toFixed(2)+'%',       higherBetter:null  },
  // Human Development
  wb_hdi:                 { label:'Human Development Index', key:'hdi',                 fmt: v=>v.toFixed(3),           higherBetter:true  },
  wb_renewable_energy_pct:{ label:'Renewable Energy (%)',    key:'renewable_energy_pct',fmt: v=>v.toFixed(1)+'%',       higherBetter:true  },
  wb_health_spend_gdp:    { label:'Healthcare Spending (% GDP)', key:'health_spend_gdp',fmt: v=>v.toFixed(1)+'%',       higherBetter:null  },
  wb_education_spend_gdp: { label:'Education Spending (% GDP)', key:'education_spend_gdp',fmt: v=>v.toFixed(1)+'%',    higherBetter:null  },
  // Governance & Transparency (WGI: raw -2.5 to +2.5, stored as-is)
  wb_wgi_rule_of_law:     { label:'Rule of Law',             key:'wgi_rule_of_law',     fmt: v=>v.toFixed(2),           higherBetter:true  },
  wb_wgi_corruption:      { label:'Control of Corruption',   key:'wgi_corruption',      fmt: v=>v.toFixed(2),           higherBetter:true  },
  wb_wgi_govt_effectiveness:{ label:'Govt Effectiveness',    key:'wgi_govt_effectiveness',fmt: v=>v.toFixed(2),         higherBetter:true  },
  wb_wgi_voice_accountability:{ label:'Voice & Accountability',key:'wgi_voice_accountability',fmt: v=>v.toFixed(2),     higherBetter:true  },
  wb_wgi_political_stability:{ label:'Political Stability',  key:'wgi_political_stability',fmt: v=>v.toFixed(2),        higherBetter:true  },
  wb_wgi_regulatory_quality:{ label:'Regulatory Quality',    key:'wgi_regulatory_quality',fmt: v=>v.toFixed(2),         higherBetter:true  },
  // Transparency & Freedom (TI CPI / Freedom House)
  wb_ti_cpi:              { label:'Corruption Index (TI CPI)',key:'ti_cpi_score',        fmt: v=>v.toFixed(0)+'/100',    higherBetter:true  },
  wb_fh_score:            { label:'Freedom Score (FH)',       key:'fh_score',            fmt: v=>v.toFixed(0)+'/100',    higherBetter:true  },
};

// Company-level stats — company QID used as identifier; values converted to USD for fair ranking
const CORP_STAT_DEFS = {
  corp_revenue:    { label:'Revenue (USD equiv.)',    fmt: v => '$' + fmtRevenue(v), higherBetter:true,
    key: co => { const v = toUSD(co.revenue,    co.revenue_currency);    return v > 0 ? v : null; } },
  corp_market_cap: { label:'Market Cap (USD equiv.)', fmt: v => '$' + fmtRevenue(v), higherBetter:true,
    key: co => { const v = toUSD(co.market_cap, co.market_cap_currency); return v > 0 ? v : null; } },
  corp_net_income: { label:'Net Income (USD equiv.)', fmt: v => '$' + fmtRevenue(v), higherBetter:true,
    key: co => { const v = toUSD(co.net_income, co.net_income_currency); return v > 0 ? v : null; } },
  corp_employees:  { label:'Employees',               fmt: v => fmtEmployees(v),     higherBetter:true,
    key: co => (co.employees > 0 ? co.employees : null) },
};

// Eurostat Urban Audit city-level stats — qid used as identifier
const EUROSTAT_STAT_DEFS = {
  // Labour market & living conditions (original 7)
  eurostat_unemploymentPct:  { label:'Unemployment Rate',      key:'unemploymentPct',  histKey:'unemploymentHistory',  fmt: v=>v.toFixed(1)+'%',                  higherBetter:false },
  eurostat_activityRate:     { label:'Activity Rate',          key:'activityRate',     histKey:'activityHistory',      fmt: v=>v.toFixed(1)+'%',                  higherBetter:true  },
  eurostat_medianIncome:     { label:'Median Income (€)',      key:'medianIncome',     histKey:'medianIncomeHistory',  fmt: v=>'€'+Math.round(v).toLocaleString(), higherBetter:true  },
  eurostat_povertyPct:       { label:'At-Risk Poverty',        key:'povertyPct',       histKey:'povertyHistory',       fmt: v=>v.toFixed(1)+'%',                  higherBetter:false },
  eurostat_homeownershipPct: { label:'Homeownership Rate',     key:'homeownershipPct', histKey:'homeownershipHistory', fmt: v=>v.toFixed(1)+'%',                  higherBetter:null  },
  eurostat_rentPerSqm:       { label:'Avg Rent / m²',          key:'rentPerSqm',       histKey:'rentHistory',          fmt: v=>'€'+v.toFixed(1),                  higherBetter:null  },
  eurostat_totalCompanies:   { label:'Total Companies',        key:'totalCompanies',   histKey:'companiesHistory',     fmt: v=>fmtNum(Math.round(v)),             higherBetter:null  },
  // Air quality & environment (new from urb_cenv)
  eurostat_pm10:             { label:'PM10 Air Pollution',     key:'pm10',             histKey:'pm10History',          fmt: v=>v.toFixed(1)+' μg/m³',             higherBetter:false },
  eurostat_no2:              { label:'NO₂ Concentration',      key:'no2',              histKey:'no2History',           fmt: v=>v.toFixed(1)+' μg/m³',             higherBetter:false },
  eurostat_greenSpacePct:    { label:'Green Space %',          key:'greenSpacePct',    histKey:'greenSpacePctHistory', fmt: v=>v.toFixed(1)+'%',                  higherBetter:true  },
  eurostat_roadNoisePct:     { label:'Road Noise >65dB',       key:'roadNoisePct',     histKey:'roadNoisePctHistory',  fmt: v=>v.toFixed(1)+'%',                  higherBetter:false },
  // Climate (new from urb_cenv)
  eurostat_tempWarmest:      { label:'Warmest Month Avg °C',   key:'tempWarmest',      histKey:'tempWarmestHistory',   fmt: v=>v.toFixed(1)+'°C',                 higherBetter:null  },
  eurostat_tempColdest:      { label:'Coldest Month Avg °C',   key:'tempColdest',      histKey:'tempColdestHistory',   fmt: v=>v.toFixed(1)+'°C',                 higherBetter:null  },
  eurostat_rainfallMm:       { label:'Annual Rainfall (mm)',   key:'rainfallMm',       histKey:'rainfallMmHistory',    fmt: v=>fmtNum(Math.round(v))+' mm',       higherBetter:null  },
  eurostat_sunshineHours:    { label:'Sunshine (hrs/day)',     key:'sunshineHours',    histKey:'sunshineHoursHistory', fmt: v=>v.toFixed(1)+' hr/day',            higherBetter:null  },
  // Tourism & culture (new from urb_ctour)
  eurostat_touristNights:    { label:'Tourist Overnight Stays',key:'touristNights',    histKey:'touristNightsHistory', fmt: v=>fmtNum(Math.round(v)),             higherBetter:null  },
  eurostat_museumVisitors:   { label:'Museum Visitors/yr',     key:'museumVisitors',   histKey:'museumVisitorsHistory',fmt: v=>fmtNum(Math.round(v)),             higherBetter:null  },
  eurostat_libraries:        { label:'Public Libraries',       key:'libraries',        histKey:'librariesHistory',     fmt: v=>fmtNum(Math.round(v)),             higherBetter:null  },
  // Demographics (new from urb_cpopstr)
  eurostat_medianAge:        { label:'Median Age',             key:'medianAge',        histKey:'medianAgeHistory',     fmt: v=>v.toFixed(1)+' yrs',               higherBetter:null  },
  eurostat_popChangePct:     { label:'Population Change/yr',   key:'popChangePct',     histKey:'popChangePctHistory',  fmt: v=>(v>=0?'+':'')+v.toFixed(2)+'%',    higherBetter:null  },
  eurostat_ageDependency:    { label:'Age Dependency Ratio',   key:'ageDependency',    histKey:'ageDependencyHistory', fmt: v=>v.toFixed(1)+'%',                  higherBetter:null  },
};

// Japan Cabinet Office prefecture-level stats (47 prefectures)
const JAPAN_PREF_STAT_DEFS = {
  japan_perCapitaIncome: {
    label: 'Per-Capita Prefecture Income',
    key:   'perCapitaIncomeJpy',
    fmt:   v => '¥' + fmtNum(Math.round(v)),
    higherBetter: true,
  },
  japan_gdp: {
    label: 'Prefectural GDP',
    key:   'gdpJpy',
    fmt:   v => '¥' + fmtRevenue(v),
    higherBetter: true,
  },
};

// Combined Census ACS + Business tab
function buildEconomyHtml(acs, biz, qid) {
  const fmt$ = v => v != null && v > 0 ? '$' + fmtNum(Math.round(v)) : '—';
  const fmtPct = v => v != null && v >= 0 ? v.toFixed(1) + '%' : '—';
  const fmtN   = v => v != null ? fmtNum(v) : '—';
  const fmt$M  = v => v != null && v > 0 ? '$' + fmtRevenue(v * 1000) : '—';

  function statCell(label, val, cls = '', metric = '') {
    const extra = metric && qid
      ? ` census-stat-clickable" onclick="openStatsPanel('${metric}','${escHtml(qid)}')" title="Click to see ranking"`
      : `"`;
    return `<div class="census-stat${extra}><div class="census-stat-label">${label}</div><div class="census-stat-value${cls?' '+cls:''}">${val}</div></div>`;
  }

  let html = '<div class="census-wrap">';

  // ── ACS block ─────────────────────────────────────────────────────────────
  if (acs) {
    // Income distribution bars (compact: narrower)
    const brackets = acs.brackets || [];
    const maxPct = Math.max(...brackets, 0.1);
    const BAR_W = 128, BAR_H = 8, GAP = 4, LBL_W = 60, PCT_W = 30;
    const svgW = LBL_W + BAR_W + PCT_W;
    const svgH = brackets.length * (BAR_H + GAP) + 2;
    const incomeBars = brackets.map((pct, i) => {
      const y = i * (BAR_H + GAP) + 1;
      const bw = Math.max(2, (pct / maxPct) * BAR_W);
      const pctTxt = pct >= 0.5 ? pct.toFixed(1) + '%' : '';
      return `<text x="${LBL_W-3}" y="${y+BAR_H-1}" text-anchor="end" font-size="7" fill="#8b949e">${CENSUS_BRACKET_LABELS[i]||''}</text>
        <rect x="${LBL_W}" y="${y}" width="${bw.toFixed(1)}" height="${BAR_H}" rx="1.5" fill="${CENSUS_BRACKET_COLORS[i]}" opacity="0.85"/>
        <text x="${LBL_W+bw+2}" y="${y+BAR_H-1}" font-size="7" fill="#8b949e">${pctTxt}</text>`;
    }).join('');
    const incomeSvg = `<svg viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" style="display:block;overflow:visible">${incomeBars}</svg>`;

    const medIncomeFmt = acs.medianIncome > 0 ? '$' + fmtNum(Math.round(acs.medianIncome)) : '—';
    const povCls   = acs.povertyPct   > 20 ? 'census-red' : acs.povertyPct   > 10 ? 'census-amber' : '';
    const unempCls = acs.unemploymentPct > 8 ? 'census-red' : acs.unemploymentPct > 5 ? 'census-amber' : '';
    const burdCls  = acs.rentBurdenedPct > 40 ? 'census-red' : acs.rentBurdenedPct > 25 ? 'census-amber' : '';
    const snapCls  = acs.snapPct > 20 ? 'census-red' : acs.snapPct > 10 ? 'census-amber' : '';
    const giniCls  = acs.gini > 0.50 ? 'census-red' : acs.gini > 0.43 ? 'census-amber' : '';

    html += `
      <div class="census-head">Household Economy · ACS ${acs.year || 2023}</div>
      <div class="econ-two-col">
        <div class="econ-col-left">
          <div class="census-subtitle" style="margin-bottom:4px">Income Distribution</div>
          ${incomeSvg}
        </div>
        <div class="econ-col-right">
          <div class="census-stats-grid econ-right-grid">
            ${statCell('Median Income', medIncomeFmt, 'census-gold', 'medianIncome')}
            ${statCell('Poverty', fmtPct(acs.povertyPct), povCls, 'povertyPct')}
            ${statCell('Unemployed', fmtPct(acs.unemploymentPct), unempCls, 'unemploymentPct')}
            ${statCell('Rent-Burdened', fmtPct(acs.rentBurdenedPct), burdCls, 'rentBurdenedPct')}
            ${statCell('Median Rent', fmt$(acs.medianRent)+(acs.medianRent>0?'/mo':''), '', 'medianRent')}
            ${statCell('Home Value', fmt$(acs.medianHomeValue), '', 'medianHomeValue')}
            ${statCell('Gini', acs.gini!=null?acs.gini.toFixed(3):'—', giniCls, 'gini')}
            ${statCell('SNAP', fmtPct(acs.snapPct), snapCls, 'snapPct')}
          </div>
        </div>
      </div>
      <div class="census-stats-grid" style="margin-top:6px;grid-template-columns:repeat(4,1fr)">
        ${statCell('College+', fmtPct(acs.bachelorPlusPct), '', 'bachelorPlusPct')}
        ${statCell('Transit', fmtPct(acs.transitPct), '', 'transitPct')}
        ${statCell('Med. Age', acs.medianAge!=null?acs.medianAge+' yr':'—', '', 'medianAge')}
        ${statCell('Homeown.', fmtPct(acs.ownerOccPct), '', 'ownerOccPct')}
      </div>`;
  }

  // ── Business block ─────────────────────────────────────────────────────────
  if (biz) {
    const pt = biz.popTrend || {};
    const popYears = [2019,2020,2021,2022].filter(y => pt[`pop${y}`] != null);
    const popVals  = popYears.map(y => pt[`pop${y}`]);

    // Pop sparkline (compact)
    let sparkSvg = '';
    if (popVals.length >= 2) {
      const W = 108, H = 30, PAD = 3;
      const minV = Math.min(...popVals), maxV = Math.max(...popVals);
      const range = maxV - minV || 1;
      const xs = popVals.map((_, i) => PAD + i * (W - PAD*2) / (popVals.length - 1));
      const ys = popVals.map(v => H - PAD - (v - minV) / range * (H - PAD*2));
      const pts = xs.map((x,i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
      const gc  = (pt.growthPct||0) >= 0 ? '#3fb950' : '#f85149';
      const dots = xs.map((x,i) =>
        `<circle cx="${x.toFixed(1)}" cy="${ys[i].toFixed(1)}" r="2" fill="${gc}"/>
         <text x="${x.toFixed(1)}" y="${H+6}" text-anchor="middle" font-size="6.5" fill="#6e7681">${String(popYears[i]).slice(2)}</text>`
      ).join('');
      sparkSvg = `<svg viewBox="0 0 ${W} ${H+10}" width="${W}" height="${H+10}" style="display:block;overflow:visible">
        <polyline points="${pts}" fill="none" stroke="${gc}" stroke-width="1.6" opacity="0.85"/>
        ${dots}
      </svg>`;
    }

    const growthCls = (pt.growthPct||0) >= 0 ? 'census-gold' : 'census-red';
    const growthStr = popVals.length >= 2
      ? `<span class="census-stat-value ${growthCls} census-stat-clickable" style="font-size:0.78rem" onclick="openStatsPanel('popGrowthPct','${qid}')" title="Click to see ranking">${(pt.growthPct||0)>=0?'+':''}${(pt.growthPct||0).toFixed(1)}%</span> <span class="census-stat-label">pop 19→22</span>`
      : '';

    // Sector bars (compact)
    const cbp = biz.cbp || {};
    const SECTORS = [
      { key:'manufacturing', label:'Mfg',           color:'#f0a500' },
      { key:'professional',  label:'Prof/Tech',      color:'#58a6ff' },
      { key:'information',   label:'Info/Tech',      color:'#a371f7' },
      { key:'finance',       label:'Finance',        color:'#3fb950' },
      { key:'hospitality',   label:'Hospitality',    color:'#ffa657' },
    ];
    const totalEstab = cbp.total?.estab || 1;
    const maxEstab = Math.max(...SECTORS.map(s => cbp[s.key]?.estab||0), 1);
    const SBW=100, SBH=8, SGAP=4, SLBW=52, SPCTW=28;
    const sSvgW = SLBW+SBW+SPCTW, sSvgH = SECTORS.length*(SBH+SGAP)+2;
    const sectorBars = SECTORS.map((s,i) => {
      const estab = cbp[s.key]?.estab||0;
      const y = i*(SBH+SGAP)+1;
      const bw = Math.max(2, (estab/maxEstab)*SBW);
      return `<text x="${SLBW-3}" y="${y+SBH-1}" text-anchor="end" font-size="7" fill="#8b949e">${s.label}</text>
        <rect x="${SLBW}" y="${y}" width="${bw.toFixed(1)}" height="${SBH}" rx="1.5" fill="${s.color}" opacity="0.85"/>
        <text x="${SLBW+bw+2}" y="${y+SBH-1}" font-size="7" fill="#8b949e">${estab>0?fmtN(estab):''}</text>`;
    }).join('');
    const sectorSvg = `<svg viewBox="0 0 ${sSvgW} ${sSvgH}" width="${sSvgW}" height="${sSvgH}" style="display:block;overflow:visible">${sectorBars}</svg>`;

    const mfgShare = cbp.manufacturing?.estab && cbp.total?.estab
      ? (cbp.manufacturing.estab/cbp.total.estab*100).toFixed(1)+'%' : '—';
    const selfEmplPct = biz.selfEmpl?.selfEmplPct;
    const selfEmplDisplay = selfEmplPct!=null && selfEmplPct<35 ? fmtPct(selfEmplPct) : '—';

    html += `
      <div class="census-section-title" style="margin-top:${acs?'10':'0'}px">Business Structure · CBP 2022</div>
      ${biz.countyName ? `<div class="census-source" style="margin-top:0;margin-bottom:4px">County: ${escHtml(biz.countyName)}</div>` : ''}
      <div class="econ-two-col">
        <div class="econ-col-left">
          <div class="census-subtitle" style="margin-bottom:3px">Population ${growthStr ? '' : 'Trend'}</div>
          ${growthStr ? `<div style="margin-bottom:4px">${growthStr}</div>` : ''}
          ${sparkSvg ? sparkSvg : '<div class="census-source">N/A</div>'}
        </div>
        <div class="econ-col-right">
          <div class="census-subtitle" style="margin-bottom:3px">Sector Mix</div>
          ${sectorSvg}
        </div>
      </div>
      <div class="census-stats-grid" style="margin-top:6px;grid-template-columns:repeat(4,1fr)">
        ${statCell('Estab.', fmtN(cbp.total?.estab), '', 'totalEstab')}
        ${statCell('Payroll', fmt$M(cbp.total?.payann), '', 'totalPayroll')}
        ${statCell('Mfg Share', mfgShare, cbp.manufacturing?.estab/totalEstab>0.08?'census-gold':'', 'mfgShare')}
        ${statCell('Self-Empl.', selfEmplDisplay, '', 'selfEmplPct')}
      </div>`;
  }

  // ── Zillow housing trends block ───────────────────────────────────────────
  const zw = zillowData[qid];
  if (zw) {
    const fmtDollar = v => '$' + fmtNum(Math.round(v));
    html += `<div class="census-section-title" style="margin-top:10px">Housing Market · Zillow</div>
    <div class="es-trends">`;
    if (zw.zhviHistory?.length >= 2) {
      const { svg, range } = _eurostatSparkline(zw.zhviHistory, '#58a6ff', 110, 28);
      html += `<div class="es-trend-row census-stat-clickable" onclick="openStatsPanel('zhvi','${escHtml(qid)}')" title="Click to see ranking">
        <span class="es-trend-label">Home Value</span>
        <span class="es-trend-spark">${svg}</span>
        <span class="es-trend-val" style="color:#58a6ff">${zw.zhvi ? fmtDollar(zw.zhvi) : '—'}</span>
        <span class="es-trend-range">${range}</span>
      </div>`;
    }
    if (zw.zoriHistory?.length >= 2) {
      const { svg, range } = _eurostatSparkline(zw.zoriHistory, '#f0a500', 110, 28);
      html += `<div class="es-trend-row census-stat-clickable" onclick="openStatsPanel('zori','${escHtml(qid)}')" title="Click to see ranking">
        <span class="es-trend-label">Rent Index</span>
        <span class="es-trend-spark">${svg}</span>
        <span class="es-trend-val" style="color:#f0a500">${zw.zori ? fmtDollar(zw.zori) + '/mo' : '—'}</span>
        <span class="es-trend-range">${range}</span>
      </div>`;
    }
    html += `</div>`;
  }

  html += `<div class="census-source" style="margin-top:8px">US Census Bureau · ACS 2023 · CBP 2022 · Decennial 2020${zw ? ' · Zillow Research' : ''}</div></div>`;
  return html;
}

// ── Eurostat Urban Audit tab ──────────────────────────────────────────────────

// Build a compact SVG sparkline from a [[year, val], ...] history array.
// Returns an SVG string and year-range label.
function _eurostatSparkline(history, color, W, H) {
  if (!history || history.length < 2) return { svg: '', range: '' };
  const xs = history.map(([y]) => y);
  const vs = history.map(([, v]) => v);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minV = Math.min(...vs), maxV = Math.max(...vs);
  const rangeV = maxV - minV || 1;
  const PAD = 2;
  const toX = x => PAD + (x - minX) / (maxX - minX || 1) * (W - PAD * 2);
  const toY = v => H - PAD - (v - minV) / rangeV * (H - PAD * 2);
  const pts = history.map(([x, v]) => `${toX(x).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');
  const svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="display:block;overflow:visible">
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" opacity="0.9"/>
    <circle cx="${toX(xs[xs.length-1]).toFixed(1)}" cy="${toY(vs[vs.length-1]).toFixed(1)}" r="2.2" fill="${color}"/>
  </svg>`;
  const range = `${minX}–${maxX}`;
  return { svg, range };
}

// ── Japan Prefecture data helpers ─────────────────────────────────────────────

// Match a Japanese city's admin field to a prefecture in japanPrefData
function _lookupJapanPref(city) {
  if (!city || !Object.keys(japanPrefData).length) return null;
  const stripDiac = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const clean = s => stripDiac(s || '')
    .replace(/\s*(Prefecture|Metropolis|Metro|Subprefecture|府|県|都|道)\s*/gi, '')
    .trim().toLowerCase();

  // Special cases by city name
  const cityName = city.name || '';
  if (/^Tokyo/i.test(cityName) && japanPrefData['Tokyo'])
    return { name: 'Tokyo', data: japanPrefData['Tokyo'] };
  if (/^Osaka/i.test(cityName) && japanPrefData['Osaka'])
    return { name: 'Osaka', data: japanPrefData['Osaka'] };
  if (/^Sapporo/i.test(cityName) && japanPrefData['Hokkaido'])
    return { name: 'Hokkaido', data: japanPrefData['Hokkaido'] };
  if (/^Naha/i.test(cityName) && japanPrefData['Okinawa'])
    return { name: 'Okinawa', data: japanPrefData['Okinawa'] };

  const adminClean = clean(city.admin || '');
  if (!adminClean || adminClean === 'japan') return null;

  // Direct match against normalized pref names
  for (const [pref, data] of Object.entries(japanPrefData)) {
    const prefClean = clean(pref);
    if (adminClean === prefClean || adminClean.includes(prefClean) || prefClean.includes(adminClean)) {
      return { name: pref, data };
    }
  }
  return null;
}

function buildJapanPrefHtml(pref, prefName, qid) {
  if (!pref) return '';

  const fmtJpy  = v => v == null ? '—' : '¥' + fmtNum(Math.round(v));
  const fmtBill = v => v == null ? '—' : '¥' + fmtRevenue(v);

  // Sparkline helper (reuse from Eurostat approach)
  function jpSparkline(history, color) {
    if (!history || history.length < 2) return '';
    const W = 110, H = 28;
    const xs = history.map(h=>h[0]), ys = history.map(h=>h[1]);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const rangeY = maxY - minY || 1;
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const rangeX = maxX - minX || 1;
    const pts = history.map(([x,y]) =>
      `${(((x-minX)/rangeX)*(W-4)+2).toFixed(1)},${(H-2-(((y-minY)/rangeY)*(H-4))).toFixed(1)}`
    ).join(' ');
    return `<svg width="${W}" height="${H}" style="display:block;overflow:visible">
      <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" opacity="0.85"/>
      <circle cx="${pts.split(' ').at(-1).split(',')[0]}" cy="${pts.split(' ').at(-1).split(',')[1]}" r="2.5" fill="${color}"/>
    </svg>`;
  }

  const incomeHistory = pref.perCapitaIncomeHistory;
  const gdpHistory    = pref.gdpHistory;
  const incYear       = pref.perCapitaIncomeYear || '';
  const gdpYear       = pref.gdpYear || '';

  const incomeRange = incomeHistory && incomeHistory.length >= 2
    ? `${incomeHistory[0][0]}–${incomeHistory[incomeHistory.length-1][0]}` : '';
  const gdpRange = gdpHistory && gdpHistory.length >= 2
    ? `${gdpHistory[0][0]}–${gdpHistory[gdpHistory.length-1][0]}` : '';

  const click = (metric) => `census-stat-clickable" onclick="openStatsPanel('${metric}','${escHtml(qid)}')" title="Click to see Japan prefecture ranking"`;

  return `<div class="census-wrap">
    <div class="census-head">Prefecture · Cabinet Office${incYear ? ' · ' + incYear : ''}</div>
    <div style="margin-bottom:6px;font-size:0.7rem;color:#8b949e">${escHtml(prefName)} Prefecture</div>

    <div class="census-stats-grid" style="grid-template-columns:repeat(2,1fr);margin-bottom:12px">
      <div class="census-stat ${click('japan_perCapitaIncome')}>
        <div class="census-stat-label">Per-Capita Income</div>
        <div class="census-stat-value">${fmtJpy(pref.perCapitaIncomeJpy)}</div>
      </div>
      <div class="census-stat ${click('japan_gdp')}>
        <div class="census-stat-label">Prefectural GDP</div>
        <div class="census-stat-value">${fmtBill(pref.gdpJpy)}</div>
      </div>
    </div>

    ${(incomeHistory && incomeHistory.length >= 2) ? `
    <div class="es-trends">
      <div class="es-trend-row" onclick="openStatsPanel('japan_perCapitaIncome','${escHtml(qid)}')" title="Click to see prefecture ranking">
        <span class="es-trend-label">Per-Capita Income</span>
        <span>${jpSparkline(incomeHistory, '#f0a500')}</span>
        <span class="es-trend-val" style="color:#f0a500">${fmtJpy(pref.perCapitaIncomeJpy)}</span>
        <span class="es-trend-range">${incomeRange}</span>
      </div>
    </div>` : ''}

    ${(gdpHistory && gdpHistory.length >= 2) ? `
    <div class="es-trends" style="margin-top:6px">
      <div class="es-trend-row" onclick="openStatsPanel('japan_gdp','${escHtml(qid)}')" title="Click to see prefecture ranking">
        <span class="es-trend-label">Prefectural GDP</span>
        <span>${jpSparkline(gdpHistory, '#3fb950')}</span>
        <span class="es-trend-val" style="color:#3fb950">${fmtBill(pref.gdpJpy)}</span>
        <span class="es-trend-range">${gdpRange}</span>
      </div>
    </div>` : ''}

    <div id="trade-source" style="margin-top:10px">Source: Japan Cabinet Office · Prefectural Accounts</div>
  </div>`;
}

function buildEurostatHtml(es, qid) {
  const fmtPct = v => v != null ? v.toFixed(1) + '%' : '—';
  const fmtEur = v => v != null ? '€' + fmtNum(Math.round(v)) : '—';
  const fmtN   = v => v != null ? fmtNum(Math.round(v)) : '—';

  function statCell(label, val, cls, metric) {
    const extra = metric
      ? ` census-stat-clickable" onclick="openStatsPanel('${metric}','${escHtml(qid)}')" title="Click to see European ranking"`
      : `"`;
    return `<div class="census-stat${extra}><div class="census-stat-label">${label}</div><div class="census-stat-value${cls?' '+cls:''}">${val}</div></div>`;
  }

  const yr = es.year ? ` · ${es.year}` : '';
  const unempCls = es.unemploymentPct > 12 ? 'census-red' : es.unemploymentPct > 7 ? 'census-amber' : '';
  const povCls   = es.povertyPct > 25 ? 'census-red' : es.povertyPct > 15 ? 'census-amber' : '';
  const pm10Cls  = es.pm10 != null ? (es.pm10 > 45 ? 'census-red' : es.pm10 > 25 ? 'census-amber' : 'census-green') : '';
  const no2Cls   = es.no2  != null ? (es.no2  > 40 ? 'census-red' : es.no2  > 25 ? 'census-amber' : 'census-green') : '';

  let html = `<div class="census-wrap">
    <div class="census-head">Urban Audit · Eurostat${yr}</div>
    <div class="census-stats-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:6px">
      ${statCell('Unemployment', fmtPct(es.unemploymentPct), unempCls, 'eurostat_unemploymentPct')}
      ${statCell('Activity Rate', fmtPct(es.activityRate), '', 'eurostat_activityRate')}
      ${statCell('Companies', fmtN(es.totalCompanies), '', 'eurostat_totalCompanies')}
    </div>`;

  if (es.medianIncome != null || es.povertyPct != null || es.homeownershipPct != null || es.rentPerSqm != null) {
    html += `<div class="census-section-title" style="margin-top:6px">Living Conditions</div>
    <div class="census-stats-grid" style="grid-template-columns:repeat(2,1fr);margin-top:4px">
      ${statCell('Median Income', fmtEur(es.medianIncome), 'census-gold', 'eurostat_medianIncome')}
      ${statCell('At-Risk Poverty', fmtPct(es.povertyPct), povCls, 'eurostat_povertyPct')}
      ${statCell('Homeownership', fmtPct(es.homeownershipPct), '', 'eurostat_homeownershipPct')}
      ${statCell('Rent / m²', es.rentPerSqm != null ? '€' + es.rentPerSqm.toFixed(1) : '—', '', 'eurostat_rentPerSqm')}
    </div>`;
  }

  // ── Environment & Air Quality ──────────────────────────────────────────────
  if (es.pm10 != null || es.no2 != null || es.greenSpacePct != null || es.roadNoisePct != null) {
    html += `<div class="census-section-title" style="margin-top:6px">Environment & Air Quality</div>
    <div class="census-stats-grid" style="grid-template-columns:repeat(2,1fr);margin-top:4px">
      ${es.pm10 != null          ? statCell('PM10', es.pm10.toFixed(1) + ' μg/m³', pm10Cls, 'eurostat_pm10') : ''}
      ${es.no2  != null          ? statCell('NO₂',  es.no2.toFixed(1)  + ' μg/m³', no2Cls,  'eurostat_no2')  : ''}
      ${es.greenSpacePct != null ? statCell('Green Space', es.greenSpacePct.toFixed(1) + '%', '', 'eurostat_greenSpacePct') : ''}
      ${es.roadNoisePct  != null ? statCell('Road Noise >65dB', es.roadNoisePct.toFixed(1) + '%', '', 'eurostat_roadNoisePct') : ''}
    </div>`;
  }

  // ── Climate ───────────────────────────────────────────────────────────────
  if (es.tempWarmest != null || es.tempColdest != null || es.rainfallMm != null || es.sunshineHours != null) {
    html += `<div class="census-section-title" style="margin-top:6px">Climate</div>
    <div class="census-stats-grid" style="grid-template-columns:repeat(2,1fr);margin-top:4px">
      ${es.tempWarmest   != null ? statCell('Warmest Month', es.tempWarmest.toFixed(1) + '°C', '', 'eurostat_tempWarmest') : ''}
      ${es.tempColdest   != null ? statCell('Coldest Month', es.tempColdest.toFixed(1) + '°C', '', 'eurostat_tempColdest') : ''}
      ${es.rainfallMm    != null ? statCell('Rainfall/yr', fmtNum(Math.round(es.rainfallMm)) + ' mm', '', 'eurostat_rainfallMm') : ''}
      ${es.sunshineHours != null ? statCell('Sunshine', es.sunshineHours.toFixed(1) + ' hr/day', '', 'eurostat_sunshineHours') : ''}
    </div>`;
  }

  // ── Tourism & Culture ─────────────────────────────────────────────────────
  if (es.touristNights != null || es.museumVisitors != null || es.libraries != null || es.cinemaSeatsPer1k != null) {
    html += `<div class="census-section-title" style="margin-top:6px">Tourism & Culture</div>
    <div class="census-stats-grid" style="grid-template-columns:repeat(2,1fr);margin-top:4px">
      ${es.touristNights    != null ? statCell('Tourist Nights', fmtN(es.touristNights), '', 'eurostat_touristNights') : ''}
      ${es.museumVisitors   != null ? statCell('Museum Visitors', fmtN(es.museumVisitors), '', 'eurostat_museumVisitors') : ''}
      ${es.libraries        != null ? statCell('Public Libraries', fmtN(es.libraries), '', 'eurostat_libraries') : ''}
      ${es.cinemaSeatsPer1k != null ? statCell('Cinema Seats/1k', es.cinemaSeatsPer1k.toFixed(1), '', '') : ''}
    </div>`;
  }

  // ── Demographics ──────────────────────────────────────────────────────────
  if (es.medianAge != null || es.popChangePct != null || es.ageDependency != null) {
    const popChangeFmt = v => v != null ? (v >= 0 ? '+' : '') + v.toFixed(2) + '%' : '—';
    const popChangeCls = es.popChangePct != null ? (es.popChangePct > 0 ? 'census-green' : 'census-red') : '';
    html += `<div class="census-section-title" style="margin-top:6px">Demographics</div>
    <div class="census-stats-grid" style="grid-template-columns:repeat(3,1fr);margin-top:4px">
      ${es.medianAge     != null ? statCell('Median Age', es.medianAge.toFixed(1) + ' yrs', '', 'eurostat_medianAge') : ''}
      ${es.popChangePct  != null ? statCell('Pop Change/yr', popChangeFmt(es.popChangePct), popChangeCls, 'eurostat_popChangePct') : ''}
      ${es.ageDependency != null ? statCell('Age Dependency', es.ageDependency.toFixed(1) + '%', '', 'eurostat_ageDependency') : ''}
    </div>`;
  }

  // ── Trend sparklines ───────────────────────────────────────────────────────
  const TREND_ROWS = [
    { key:'unemploymentHistory',   label:'Unemployment',      valKey:'unemploymentPct',  fmt:fmtPct, color:'#f85149', metric:'eurostat_unemploymentPct'  },
    { key:'medianIncomeHistory',   label:'Median Income',     valKey:'medianIncome',     fmt:fmtEur, color:'#f0a500', metric:'eurostat_medianIncome'     },
    { key:'povertyHistory',        label:'At-Risk Poverty',   valKey:'povertyPct',       fmt:fmtPct, color:'#ffa657', metric:'eurostat_povertyPct'       },
    { key:'activityHistory',       label:'Activity Rate',     valKey:'activityRate',     fmt:fmtPct, color:'#3fb950', metric:'eurostat_activityRate'     },
    { key:'homeownershipHistory',  label:'Homeownership',     valKey:'homeownershipPct', fmt:fmtPct, color:'#58a6ff', metric:'eurostat_homeownershipPct' },
    { key:'rentHistory',           label:'Rent / m²',         valKey:'rentPerSqm',       fmt:v=>'€'+v.toFixed(1), color:'#a371f7', metric:'eurostat_rentPerSqm' },
    { key:'companiesHistory',      label:'Companies',         valKey:'totalCompanies',   fmt:fmtN,   color:'#79c0ff', metric:'eurostat_totalCompanies'   },
    { key:'pm10History',           label:'PM10',              valKey:'pm10',             fmt:v=>v.toFixed(1)+' μg/m³', color:'#ff7b72', metric:'eurostat_pm10'          },
    { key:'no2History',            label:'NO₂',               valKey:'no2',              fmt:v=>v.toFixed(1)+' μg/m³', color:'#ffa657', metric:'eurostat_no2'           },
    { key:'greenSpacePctHistory',  label:'Green Space %',     valKey:'greenSpacePct',    fmt:v=>v.toFixed(1)+'%',  color:'#3fb950', metric:'eurostat_greenSpacePct'  },
    { key:'touristNightsHistory',  label:'Tourist Nights',    valKey:'touristNights',    fmt:fmtN,   color:'#e3b341', metric:'eurostat_touristNights'    },
    { key:'museumVisitorsHistory', label:'Museum Visitors',   valKey:'museumVisitors',   fmt:fmtN,   color:'#d2a8ff', metric:'eurostat_museumVisitors'   },
    { key:'medianAgeHistory',      label:'Median Age',        valKey:'medianAge',        fmt:v=>v.toFixed(1)+' yrs', color:'#79c0ff', metric:'eurostat_medianAge'      },
    { key:'popChangePctHistory',   label:'Pop Change/yr',     valKey:'popChangePct',     fmt:v=>(v>=0?'+':'')+v.toFixed(2)+'%', color:'#56d364', metric:'eurostat_popChangePct'   },
  ].filter(r => es[r.key] && es[r.key].length >= 2);

  if (TREND_ROWS.length > 0) {
    html += `<div class="census-section-title" style="margin-top:10px">Trends</div>
    <div class="es-trends">`;
    for (const r of TREND_ROWS) {
      const { svg, range } = _eurostatSparkline(es[r.key], r.color, 110, 28);
      const latestVal = es[r.valKey] != null ? r.fmt(es[r.valKey]) : '—';
      html += `<div class="es-trend-row census-stat-clickable" onclick="openStatsPanel('${r.metric}','${escHtml(qid)}')" title="Click to see European ranking">
        <span class="es-trend-label">${r.label}</span>
        <span class="es-trend-spark">${svg}</span>
        <span class="es-trend-val" style="color:${r.color}">${latestVal}</span>
        <span class="es-trend-range">${range}</span>
      </div>`;
    }
    html += `</div>`;
  }

  html += `<div class="census-source" style="margin-top:8px">Eurostat Urban Audit · urb_clma · urb_clivcon · urb_cecfi · urb_cenv · urb_ctour · urb_cpopstr</div></div>`;
  return html;
}

async function openWikiSidebar(qid, cityName) {
  closeCountryPanel();
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

  // If we already stored Wikipedia data (from a previous click or pre-fetch script),
  // render immediately — no API call needed.
  // Exception: if the cache pre-dates Wikidata P18 support (no Special:FilePath URL),
  // fall through once to upgrade the photo, then cache the P18 result.
  const hasP18 = city?.wiki_images?.some(u => u.includes('Special:FilePath'));
  if (hasP18 && (city?.wiki_images?.length || city?.wiki_extract)) {
    const wpUrl = city.wikipedia
      ? `https://en.wikipedia.org/wiki/${encodeURIComponent(city.wikipedia).replace(/%20/g, '_')}`
      : city.qid
        ? `https://en.wikipedia.org/wiki/Special:GoToLinkedPage/wikidata/${city.qid}`
        : null;
    renderInfobox(city, city.wiki_images, { extract: city.wiki_extract ?? null }, wpUrl, true);
    return;
  }

  // Show loading spinner inside the Info tab (preserves tab div structure)
  const _infoEl = document.getElementById('wiki-tab-info');
  const _economyEl = document.getElementById('wiki-tab-economy');
  const _overviewEl = document.getElementById('wiki-tab-overview');
  if (_infoEl) _infoEl.innerHTML = `<div class="wiki-loading"><div class="spinner"></div><span>Loading Wikipedia article…</span></div>`;
  if (_economyEl) _economyEl.innerHTML = '';
  if (_overviewEl) _overviewEl.innerHTML = '';
  // Hide economy + finance tabs while loading city (finance is company-only)
  const _econBtnEl = document.getElementById('wiki-tab-economy-btn');
  const _finBtnEl  = document.getElementById('wiki-tab-finance-btn');
  if (_econBtnEl) _econBtnEl.style.display = 'none';
  if (_finBtnEl)  _finBtnEl.style.display  = 'none';
  // Guard against stale tab names
  const _safeTab = (!VALID_SIDEBAR_TABS.has(_sidebarTab) || _sidebarTab === 'economy' || _sidebarTab === 'finance') ? 'info' : _sidebarTab;
  switchWikiTab(_safeTab);

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
      // P18 — main image (curated representative photo, usually a cityscape/panorama)
      const p18file = claims.P18?.[0]?.mainsnak?.datavalue?.value;
      if (p18file) {
        const fname = p18file.replace(/ /g, '_');
        wpExtra.p18Image = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fname)}?width=900`;
      }
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

    // Wikidata P18 = deliberately chosen representative city photo (cityscape, skyline, etc.)
    // Prioritise it above all Wikipedia article images; fall back to Wikipedia thumbnail
    if (wpExtra.p18Image) {
      images = images.filter(u => u !== wpExtra.p18Image && u !== fallbackThumb);
      images.unshift(wpExtra.p18Image);
    } else if (fallbackThumb && !images.includes(fallbackThumb)) {
      images.unshift(fallbackThumb);
    }

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

  // Normal map click → close trade panel + country popup
  map.on('click', () => { if (!_drawActive) { closeTradePanelFn(); closeCountryPopup(); } });

  // Escape key cancels draw mode / closes country popup
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (_drawActive || _drawPolygon) _drawClear();
      closeCountryPopup();
    }
  });

  const terminator = L.terminator({
    fillColor: '#0a0f1a', fillOpacity: 0.45,
    color: '#334155', weight: 1, opacity: 0.6, interactive: false,
  }).addTo(map);
  setInterval(() => terminator.setTime(new Date()), 60_000);

  // ── Phase 2: load city data (required) + country/geo data (optional) in parallel ──
  showLoading(true, 'Loading city dataset…');
  try {
    const [citiesRes, countryRes, geoRes, companiesRes, censusRes, censusBusinessRes, beaTradeRes, eurostatRes, gawcRes, japanRes, airportRes, zillowRes, climateExtraRes] = await Promise.all([
      fetch('/cities-full.json'),
      fetch('/country-data.json').catch(() => null),
      fetch('/world-countries.json').catch(() => null),
      fetch('/companies.json').catch(() => null),   // graceful — run npm run fetch-companies
      fetch('/census-cities.json').catch(() => null),
      fetch('/census-business.json').catch(() => null),
      fetch('/bea-trade.json').catch(() => null),
      fetch('/eurostat-cities.json').catch(() => null),
      fetch('/gawc-cities.json').catch(() => null),
      fetch('/japan-prefectures.json').catch(() => null),
      fetch('/airport-connectivity.json').catch(() => null),
      fetch('/zillow-cities.json').catch(() => null),
      fetch('/climate-extra.json').catch(() => null),
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

    // ── Phase 5b2: load Census ACS data (optional, for US city economic panel + color layer) ──
    if (censusRes && censusRes.ok) {
      try {
        censusCities = await censusRes.json();
        console.log(`[init] Census ACS data loaded (${Object.keys(censusCities).length} US cities)`);
        document.getElementById('census-color-bar').style.display = '';
      } catch {
        console.warn('[init] census-cities.json is malformed');
      }
    }
    if (censusBusinessRes && censusBusinessRes.ok) {
      try {
        censusBusiness = await censusBusinessRes.json();
        console.log(`[init] Census business data loaded (${Object.keys(censusBusiness).length} US cities)`);
      } catch {
        console.warn('[init] census-cities.json is malformed');
      }
    }

    // ── Phase 5b3: load BEA trade data (optional, eliminates runtime BEA API calls) ──
    if (beaTradeRes && beaTradeRes.ok) {
      try {
        beaTradeData = await beaTradeRes.json();
        console.log(`[init] BEA trade data loaded (${Object.keys(beaTradeData).length} countries)`);
      } catch {
        console.warn('[init] bea-trade.json is malformed');
      }
    }

    if (eurostatRes && eurostatRes.ok) {
      try {
        eurostatCities = await eurostatRes.json();
        console.log(`[init] Eurostat Urban Audit data loaded (${Object.keys(eurostatCities).length} cities)`);
      } catch {
        console.warn('[init] eurostat-cities.json is malformed');
      }
    }

    if (gawcRes && gawcRes.ok) {
      try {
        gawcCities = await gawcRes.json();
        console.log(`[init] GaWC world city network loaded (${Object.keys(gawcCities).length} cities)`);
      } catch { console.warn('[init] gawc-cities.json is malformed'); }
    }
    if (japanRes && japanRes.ok) {
      try {
        japanPrefData = await japanRes.json();
        console.log(`[init] Japan prefecture data loaded (${Object.keys(japanPrefData).length} prefectures)`);
      } catch { console.warn('[init] japan-prefectures.json is malformed'); }
    }
    if (airportRes && airportRes.ok) {
      try {
        airportData = await airportRes.json();
        console.log(`[init] Airport connectivity loaded (${Object.keys(airportData).length} cities)`);
      } catch { console.warn('[init] airport-connectivity.json is malformed'); }
    }
    if (zillowRes && zillowRes.ok) {
      try {
        zillowData = await zillowRes.json();
        console.log(`[init] Zillow housing data loaded (${Object.keys(zillowData).length} cities)`);
      } catch { console.warn('[init] zillow-cities.json is malformed'); }
    }
    if (climateExtraRes && climateExtraRes.ok) {
      try {
        climateExtra = await climateExtraRes.json();
        console.log(`[init] Climate extra data loaded (${Object.keys(climateExtra).length} cities)`);
      } catch { console.warn('[init] climate-extra.json is malformed'); }
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
      map.off("click", _cpMapClickHandler);
      map.on("click", _cpMapClickHandler);
      initChoroControls();
    }
    updateStats();
    showLoading(false);

    // Trade year slider
    document.getElementById('trade-year-slider').addEventListener('input', function () {
      const iso2 = this.dataset.iso2;
      const data = tradeCache[iso2];
      if (!data) return;
      const yr = parseInt(this.value, 10);
      _updateTradePanelNumbers(iso2, data, yr);
      drawTradeArrows(iso2, data, yr);
    });

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
        mouseout: function (e) {
          var liso = e.target.feature && e.target.feature.properties && e.target.feature.properties.iso2;
          if (liso !== _cpCurrentIso2) {
            choroplethLayer.resetStyle(e.target);
          }
        },
        click: function(e) {
          L.DomEvent.stopPropagation(e);
          openCountryPanel(iso2);
        },
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

// ── shim (keep callers working) ───────────────────────────────────────
function showCountryPopup(iso2) { openCountryPanel(iso2); }

// ── country panel lifecycle ───────────────────────────────────────────
function openCountryPanel(iso2) {
  if (!iso2) return;
  const c = countryData[iso2];
  if (!c) return;

  // close any previously open panel first (no slide-out animation)
  if (_cpCurrentIso2) {
    document.getElementById("country-panel").classList.remove("open");
  }

  _cpCurrentIso2 = iso2;

  // render content (will be implemented in Task 7)
  if (typeof _renderCountryPanel === "function") _renderCountryPanel(iso2);

  // slide panel in
  document.getElementById("country-panel").classList.add("open");

  // if stats panel is already open, push it left to clear the country panel
  const _spEl = document.getElementById('stats-panel');
  if (_spEl && _spEl.classList.contains('open')) _spEl.style.right = '600px';

  // highlight selected country border on choropleth
  if (choroplethLayer) {
    choroplethLayer.eachLayer(function(layer) {
      const liso = layer.feature && layer.feature.properties && layer.feature.properties.iso2;
      if (liso === iso2) {
        layer.setStyle({ weight: 2.5, color: "#58a6ff" });
      } else {
        choroplethLayer.resetStyle(layer);
      }
    });
  }

  // ESC listener (bound per panel open, unbound on close)
  if (_cpEscListener) document.removeEventListener("keydown", _cpEscListener);
  _cpEscListener = function(e) { if (e.key === "Escape") closeCountryPanel(); };
  document.addEventListener("keydown", _cpEscListener);

  // trigger trade arcs (existing behaviour)
  if (typeof _loadAndShowTrade === "function") _loadAndShowTrade(iso2, c.name || iso2);
}

function closeCountryPanel() {
  if (!_cpCurrentIso2) return;
  _cpCurrentIso2 = null;
  document.getElementById("country-panel").classList.remove("open");
  if (_cpEscListener) {
    document.removeEventListener("keydown", _cpEscListener);
    _cpEscListener = null;
  }
  if (choroplethLayer) {
    choroplethLayer.eachLayer(function(l) { choroplethLayer.resetStyle(l); });
  }
  // restore stats panel to default position (next to wiki-sidebar)
  const _spEl2 = document.getElementById('stats-panel');
  if (_spEl2 && _spEl2.classList.contains('open')) {
    const _wikiOpen2 = document.getElementById('wiki-sidebar')?.classList.contains('open');
    const _corpOpen2 = document.getElementById('corp-panel')?.classList.contains('open');
    _spEl2.style.right = ((_wikiOpen2 && _corpOpen2) ? 880 : _corpOpen2 ? 460 : 420) + 'px';
  }
}

// ── country panel helpers ─────────────────────────────────────────────
function _cpFmt(val, decimals) {
  if (!Number.isFinite(val)) return "--";
  decimals = (decimals == null) ? 1 : decimals;
  if (Math.abs(val) >= 1e9)  return (val/1e9).toFixed(decimals)  + "B";
  if (Math.abs(val) >= 1e6)  return (val/1e6).toFixed(decimals)  + "M";
  if (Math.abs(val) >= 1e3)  return (val/1e3).toFixed(decimals)  + "K";
  return val.toFixed(decimals);
}

function _cpWorldMax(key) {
  var max = 0, v;
  for (var k in countryData) {
    v = countryData[k][key];
    if (Number.isFinite(v) && v > max) max = v;
  }
  return max || 1;
}

function _cpFlagEmoji(iso2) {
  if (!iso2 || iso2.length !== 2) return "";
  var base = 0x1F1E6 - 65;
  return String.fromCodePoint(base + iso2.toUpperCase().charCodeAt(0)) +
         String.fromCodePoint(base + iso2.toUpperCase().charCodeAt(1));
}

// WGI rows: raw -2.5 to +2.5; bar fill normalised to 0-5 range so negatives show correctly
function _cpWgiRow(label, val) {
  if (!Number.isFinite(val)) {
    return "<div class=\"cp-gauge-row\"><span class=\"cp-gauge-lbl\">" + escHtml(label) +
           "</span><span class=\"cp-gauge-nil\">--</span></div>";
  }
  var pct = Math.min(100, ((val + 2.5) / 5) * 100).toFixed(1);
  var cls = val >= 1.0 ? "cp-green" : val >= 0 ? "" : val >= -1.0 ? "cp-amber" : "cp-red";
  var sign = val >= 0 ? "+" : "";
  return "<div class=\"cp-gauge-row " + cls + "\">" +
    "<span class=\"cp-gauge-lbl\">" + escHtml(label) + "</span>" +
    "<div class=\"cp-gauge-bar\"><div class=\"cp-gauge-fill\" style=\"width:" + pct + "%\"></div></div>" +
    "<span class=\"cp-gauge-val\">" + sign + val.toFixed(2) + "</span></div>";
}

function _cpGaugeRow(label, val, max, suffix, cls) {
  suffix = suffix || "";
  cls    = cls    || "";
  if (!Number.isFinite(val)) {
    return "<div class=\"cp-gauge-row\"><span class=\"cp-gauge-lbl\">" + escHtml(label) +
           "</span><span class=\"cp-gauge-nil\">--</span></div>";
  }
  var pct = Math.min(100, (Math.abs(val) / max) * 100).toFixed(1);
  return "<div class=\"cp-gauge-row " + cls + "\">" +
    "<span class=\"cp-gauge-lbl\">" + escHtml(label) + "</span>" +
    "<div class=\"cp-gauge-bar\"><div class=\"cp-gauge-fill\" style=\"width:" + pct + "%\"></div></div>" +
    "<span class=\"cp-gauge-val\">" + val.toFixed(1) + suffix + "</span></div>";
}

// ── _renderCountryPanel ───────────────────────────────────────────────
function _renderCountryPanel(iso2) {
  if (!countryData[iso2]) return;
  var cd = countryData[iso2] || {};

  // ── header ────────────────────────────────────────────────────────
  var metaParts = [];
  if (cd.region)       metaParts.push(escHtml(cd.region));
  if (cd.income_level) metaParts.push(escHtml(cd.income_level));
  metaParts.push(escHtml(iso2));
  document.getElementById("cp-header").innerHTML =
    "<span class=\"cp-flag\">" + _cpFlagEmoji(iso2) + "</span>" +
    "<div style=\"flex:1;min-width:0\">" +
      "<div class=\"cp-country-name\">" + escHtml(cd.name || iso2) + "</div>" +
      "<div class=\"cp-country-meta\">" + metaParts.join(" \u00b7 ") + "</div>" +
    "</div>" +
    "<button class=\"cp-close\" onclick=\"closeCountryPanel()\">\u00d7</button>";

  // ── 4 stat cards ──────────────────────────────────────────────────
  var gdp  = cd.gdp_per_capita,    inf  = cd.cpi_inflation;
  var debt = cd.govt_debt_gdp,     fisc = cd.fiscal_balance_gdp;
  var infCls  = !Number.isFinite(inf)  ? "" : inf  > 5  ? "cp-red"   : inf  > 3 ? "cp-amber" : "cp-green";
  var debtCls = !Number.isFinite(debt) ? "" : debt > 90 ? "cp-red"   : debt > 60 ? "cp-amber" : "";
  var fiscCls = !Number.isFinite(fisc) ? "" : fisc >= 0 ? "cp-green" : "cp-red";

  function statCard(cls, val, fmt, suffix, label) {
    var display = Number.isFinite(val) ? fmt(val) + suffix : "--";
    return "<div class=\"cp-stat-card " + cls + "\"><div class=\"cp-stat-val\">" + display +
           "</div><div class=\"cp-stat-lbl\">" + label + "</div></div>";
  }
  document.getElementById("cp-stats-row").innerHTML =
    statCard("cp-blue",   gdp,  function(v){ return "$" + _cpFmt(v, 0); }, "", "GDP/cap") +
    statCard(infCls,      inf,  function(v){ return v.toFixed(1); },       "%", "Inflation") +
    statCard(debtCls,     debt, function(v){ return v.toFixed(0); },       "%", "Debt/GDP") +
    statCard(fiscCls,     fisc, function(v){ return (v >= 0 ? "+" : "") + v.toFixed(1); }, "%", "Fiscal Bal");

  // ── bar gauges (left column) ──────────────────────────────────────
  var maxGdp   = _cpWorldMax("gdp_per_capita"),  maxLife  = _cpWorldMax("life_expectancy");
  var maxDebt  = _cpWorldMax("govt_debt_gdp"),   maxInf   = _cpWorldMax("cpi_inflation");
  var maxUnemp = _cpWorldMax("unemployment_rate"), maxYld = _cpWorldMax("bond_yield_10y");

  var gaugeHtml =
    "<div class=\"cp-gauge-section-hdr\">World Bank</div>" +
    _cpGaugeRow("GDP/cap",      gdp,                   maxGdp,   "",    "cp-blue") +
    _cpGaugeRow("Life exp",     cd.life_expectancy,    maxLife,  " yrs") +
    (Number.isFinite(cd.population)
      ? "<div class=\"cp-gauge-row\"><span class=\"cp-gauge-lbl\">Population</span><span class=\"cp-gauge-info\">" + _cpFmt(cd.population, 1) + "</span></div>"
      : "") +
    "<div class=\"cp-gauge-section-hdr\">IMF</div>" +
    _cpGaugeRow("Debt/GDP",     debt,                              maxDebt,  "%") +
    _cpGaugeRow("Fiscal bal",    fisc, 20,     "%", fiscCls) +
    _cpGaugeRow("CPI Inflation", inf,  maxInf, "%", infCls) +
    _cpGaugeRow("Unemployment", cd.unemployment_rate,              maxUnemp, "%") +
    "<div class=\"cp-gauge-section-hdr\">FRED</div>" +
    _cpGaugeRow("Bond yield",   cd.bond_yield_10y,                 maxYld,   "%") +
    (Number.isFinite(cd.cb_rate)
      ? "<div class=\"cp-gauge-section-hdr\">" + escHtml(cd.cb_bank || "Central Bank") + "</div>" +
        "<div class=\"cp-gauge-row\"><span class=\"cp-gauge-lbl\">" + escHtml(cd.cb_rate_label || "Policy Rate") + "</span>" +
        "<span class=\"cp-gauge-info\">" + cd.cb_rate.toFixed(2) + "%</span></div>"
      : "") +
    (cd.credit_sp || cd.credit_moodys || cd.credit_fitch
      ? "<div class=\"cp-gauge-section-hdr\">Credit Ratings</div>" +
        (cd.credit_sp     ? "<div class=\"cp-gauge-row\"><span class=\"cp-gauge-lbl\">S&amp;P</span><span class=\"cp-gauge-info\">" + escHtml(cd.credit_sp)     + "</span></div>" : "") +
        (cd.credit_moodys ? "<div class=\"cp-gauge-row\"><span class=\"cp-gauge-lbl\">Moody's</span><span class=\"cp-gauge-info\">" + escHtml(cd.credit_moodys) + "</span></div>" : "") +
        (cd.credit_fitch  ? "<div class=\"cp-gauge-row\"><span class=\"cp-gauge-lbl\">Fitch</span><span class=\"cp-gauge-info\">" + escHtml(cd.credit_fitch)  + "</span></div>" : "")
      : "") +
    // ── Governance (WGI) ─────────────────────────────────────────────
    (Number.isFinite(cd.wgi_rule_of_law)
      ? "<div class=\"cp-gauge-section-hdr\">Governance (WGI)</div>" +
        _cpWgiRow("Rule of Law",     cd.wgi_rule_of_law) +
        _cpWgiRow("Anti-Corruption", cd.wgi_corruption) +
        _cpWgiRow("Govt Effective.", cd.wgi_govt_effectiveness) +
        _cpWgiRow("Voice & Acct",   cd.wgi_voice_accountability) +
        _cpWgiRow("Pol. Stability",  cd.wgi_political_stability) +
        _cpWgiRow("Regulatory",      cd.wgi_regulatory_quality)
      : "") +
    // ── Human Development ─────────────────────────────────────────────
    (Number.isFinite(cd.hdi)
      ? "<div class=\"cp-gauge-section-hdr\">Human Development (UNDP)</div>" +
        _cpGaugeRow("HDI",             cd.hdi,                  1.0,  "", "cp-blue") +
        (Number.isFinite(cd.hdi_rank) ? "<div class=\"cp-gauge-row\"><span class=\"cp-gauge-lbl\">HDI Rank</span><span class=\"cp-gauge-info\">#" + cd.hdi_rank + " of 193</span></div>" : "") +
        _cpGaugeRow("Renewable energy",cd.renewable_energy_pct, 100,  "%") +
        _cpGaugeRow("Health spending", cd.health_spend_gdp,     20,   "% GDP") +
        _cpGaugeRow("Edu spending",    cd.education_spend_gdp,  15,   "% GDP")
      : "") +
    // ── Transparency & Freedom ────────────────────────────────────────
    (Number.isFinite(cd.ti_cpi_score) || Number.isFinite(cd.fh_score)
      ? "<div class=\"cp-gauge-section-hdr\">Transparency &amp; Freedom</div>" +
        (Number.isFinite(cd.ti_cpi_score)
          ? _cpGaugeRow("Corruption (TI)", cd.ti_cpi_score, 100, "/100",
              cd.ti_cpi_score >= 70 ? "cp-green" : cd.ti_cpi_score >= 45 ? "" : "cp-red") +
            (cd.ti_cpi_rank ? "<div class=\"cp-gauge-row\"><span class=\"cp-gauge-lbl\">TI Rank</span><span class=\"cp-gauge-info\">#" + cd.ti_cpi_rank + "</span></div>" : "")
          : "") +
        (Number.isFinite(cd.fh_score)
          ? _cpGaugeRow("Freedom (FH)", cd.fh_score, 100, "/100",
              cd.fh_score >= 70 ? "cp-green" : cd.fh_score >= 36 ? "" : "cp-red") +
            (cd.fh_status ? "<div class=\"cp-gauge-row\"><span class=\"cp-gauge-lbl\">Status</span><span class=\"cp-gauge-info cp-gauge-badge " +
              (cd.fh_status === 'Free' ? 'cp-badge-green' : cd.fh_status === 'Partly Free' ? 'cp-badge-amber' : 'cp-badge-red') + "\">" +
              escHtml(cd.fh_status) + "</span></div>" : "")
          : "")
      : "");

  // ── body: two-column ──────────────────────────────────────────────
  document.getElementById("cp-body").innerHTML =
    "<div class=\"cp-left-col\">" + gaugeHtml + "</div>" +
    "<div class=\"cp-right-col\">" +
      (typeof _buildRadar     === "function" ? _buildRadar(iso2)     : "") +
      (typeof _buildRankChips === "function" ? _buildRankChips(iso2) : "") +
    "</div>";

  document.getElementById("cp-trend").textContent = "";
}

// ── _buildRadar ───────────────────────────────────────────────────────
function _buildRadar(iso2) {
  if (!countryData[iso2]) return "";
  var cd = countryData[iso2] || {};

  // 6 axes: key, label, whether lower-is-better (inverted)
  var axes = [
    { key: "gdp_per_capita",     label: "GDP/cap",   inv: false },
    { key: "life_expectancy",    label: "Life exp",  inv: false },
    { key: "govt_debt_gdp",      label: "Debt",      inv: true  },
    { key: "fiscal_balance_gdp", label: "Fiscal",    inv: true  },
    { key: "cpi_inflation",      label: "Inflation", inv: true  },
    { key: "unemployment_rate",  label: "Unemploy",  inv: true  }
  ];

  var n = axes.length;
  var cx = 90, cy = 92, R = 65;

  // world max per axis (reuse _cpWorldMax already defined above)
  var maxVals = {};
  axes.forEach(function(a) { maxVals[a.key] = _cpWorldMax(a.key); });

  // normalise to 0..1, where 1 = best
  function score(key, inv, val) {
    if (!Number.isFinite(val)) return 0;
    var max = maxVals[key];
    if (!max) return 0;
    // fiscal_balance_gdp: range -15..+15 → 0..1
    if (key === "fiscal_balance_gdp") {
      return Math.min(1, Math.max(0, (val + 15) / 30));
    }
    var raw = Math.min(1, Math.max(0, val / max));
    return inv ? 1 - raw : raw;
  }

  // compute world average score per axis
  function avgScore(axis) {
    var sum = 0, count = 0;
    for (var k in countryData) {
      var merged = countryData[k] || {};
      var v = merged[axis.key];
      if (Number.isFinite(v)) { sum += score(axis.key, axis.inv, v); count++; }
    }
    return count ? sum / count : 0;
  }

  // polar to cartesian (angle 0 = top, clockwise)
  function pt(angle, r) {
    var a = angle - Math.PI / 2;
    return { x: (cx + r * Math.cos(a)).toFixed(1), y: (cy + r * Math.sin(a)).toFixed(1) };
  }

  // build SVG polygon points string from an array of 0..1 scores
  function polyPts(scores) {
    return scores.map(function(s, i) {
      var p = pt(2 * Math.PI * i / n, s * R);
      return p.x + "," + p.y;
    }).join(" ");
  }

  // country and world-avg scores
  var countryScores = axes.map(function(a) { return score(a.key, a.inv, cd[a.key]); });
  var avgScores     = axes.map(function(a) { return avgScore(a); });

  // grid rings
  var rings = [0.25, 0.5, 0.75, 1.0].map(function(frac) {
    var pts = axes.map(function(_, i) {
      var p = pt(2 * Math.PI * i / n, frac * R);
      return p.x + "," + p.y;
    }).join(" ");
    return "<polygon points=\"" + pts + "\" fill=\"none\" stroke=\"#30363d\" stroke-width=\"0.5\"/>";
  }).join("");

  // axis lines + labels
  var axisLines = "", axisLabels = "";
  axes.forEach(function(a, i) {
    var tip = pt(2 * Math.PI * i / n, R);
    axisLines += "<line x1=\"" + cx + "\" y1=\"" + cy + "\" x2=\"" + tip.x + "\" y2=\"" + tip.y +
                 "\" stroke=\"#30363d\" stroke-width=\"0.5\"/>";
    var lp = pt(2 * Math.PI * i / n, R + 15);
    axisLabels += "<text x=\"" + lp.x + "\" y=\"" + lp.y +
                  "\" text-anchor=\"middle\" dominant-baseline=\"middle\" font-size=\"7\" fill=\"#8b949e\">" +
                  escHtml(a.label) + "</text>";
  });

  var svgW = 180, svgH = 200;
  return "<div class=\"cp-radar-wrap\">" +
    "<svg width=\"" + svgW + "\" height=\"" + svgH + "\" viewBox=\"0 0 " + svgW + " " + svgH + "\"" +
         " xmlns=\"http://www.w3.org/2000/svg\">" +
      rings + axisLines + axisLabels +
      "<polygon points=\"" + polyPts(avgScores) + "\"" +
           " fill=\"none\" stroke=\"#8b949e\" stroke-width=\"1\" stroke-dasharray=\"3,2\" opacity=\"0.5\"/>" +
      "<polygon points=\"" + polyPts(countryScores) + "\"" +
           " fill=\"#388bfd\" fill-opacity=\"0.2\" stroke=\"#388bfd\" stroke-width=\"1.5\"/>" +
    "</svg>" +
  "</div>";
}

// ── _buildRankChips ───────────────────────────────────────────────────
function _buildRankChips(iso2) {
  var wbData = countryData[iso2];
  if (!wbData || !wbData.region) return "";

  var region = wbData.region;
  var cd = countryData[iso2] || {};

  // rank iso2 among peers in the same region for a given indicator
  function rankIn(key, lowerIsBetter) {
    var peers = [];
    for (var k in countryData) {
      if (countryData[k].region !== region) continue;
      var merged = countryData[k] || {};
      var v = merged[key];
      if (Number.isFinite(v)) peers.push({ iso: k, val: v });
    }
    if (peers.length < 2) return null;
    peers.sort(function(a, b) {
      return lowerIsBetter ? a.val - b.val : b.val - a.val;
    });
    var pos = peers.findIndex(function(p) { return p.iso === iso2; });
    return pos === -1 ? null : { rank: pos + 1, total: peers.length };
  }

  var indicators = [
    { key: "gdp_per_capita",        label: "GDP/cap",       inv: false, wbKey: "wb_gdp_per_capita"            },
    { key: "life_expectancy",       label: "Life exp",      inv: false, wbKey: "wb_life_expectancy"           },
    { key: "govt_debt_gdp",         label: "Debt/GDP",      inv: true,  wbKey: "wb_govt_debt_gdp"             },
    { key: "cpi_inflation",         label: "Inflation",     inv: true,  wbKey: "wb_cpi_inflation"             },
    { key: "unemployment_rate",     label: "Unemployment",  inv: true,  wbKey: "wb_unemployment_rate"         },
    { key: "hdi",                   label: "HDI",           inv: false, wbKey: "wb_hdi"                       },
    { key: "ti_cpi_score",          label: "Transparency",  inv: false, wbKey: "wb_ti_cpi"                    },
    { key: "wgi_rule_of_law",       label: "Rule of Law",   inv: false, wbKey: "wb_wgi_rule_of_law"           },
    { key: "wgi_corruption",        label: "Anti-Corrupt.", inv: false, wbKey: "wb_wgi_corruption"            },
    { key: "renewable_energy_pct",  label: "Renewables",    inv: false, wbKey: "wb_renewable_energy_pct"      }
  ];

  var chips = indicators.map(function(ind) {
    var r = rankIn(ind.key, ind.inv);
    if (!r) return "";
    var rankLabel = "#" + r.rank;
    var onclick = "openStatsPanel(" + JSON.stringify(ind.wbKey) + "," + JSON.stringify(iso2) + ")";
    return "<button class=\"cp-rank-chip\" onclick=\"" + escHtml(onclick) + "\" title=\"Click to see global ranking\">" +
      "<div class=\"cp-chip-top\">" +
        "<span class=\"cp-chip-lbl\">" + escHtml(ind.label) + "</span>" +
        "<span class=\"cp-chip-rank\">" + rankLabel + "</span>" +
      "</div>" +
      "<div class=\"cp-chip-sub\">of " + r.total + " · " + escHtml(region) + "</div>" +
    "</button>";
  }).filter(function(s) { return s !== ""; }).join("");

  if (!chips) return "";

  return "<div class=\"cp-rank-chips\">" +
    "<div class=\"cp-rank-hdr\">Regional rank</div>" +
    chips +
  "</div>";
}

// ── _switchTrendTab ───────────────────────────────────────────────────
function _switchTrendTab(iso2, key) {
  if (!countryData[iso2]) return;
  var cd = countryData[iso2] || {};

  // update active tab UI
  document.querySelectorAll("#cp-trend .cp-tab").forEach(function(btn) {
    var onc = btn.getAttribute("onclick") || "";
    btn.classList.toggle("active", onc.indexOf(JSON.stringify(key)) !== -1);
  });

  var chartArea = document.getElementById("cp-chart-area");
  if (!chartArea) return;

  var isFred  = key === "bond_yield_10y";
  var histKey = key + "_history";
  var raw     = cd[histKey];

  if (!raw || !raw.length) {
    chartArea.innerHTML = "<div class=\"cp-no-data\">No historical data available</div>";
    return;
  }

  var points;
  if (isFred) {
    // FRED format: [["YYYY-MM", value], ...]
    points = raw
      .map(function(row) { return { t: new Date(row[0] + "-01").getTime(), v: row[1] }; })
      .filter(function(p) { return Number.isFinite(p.v); });
  } else {
    // World Bank / IMF format: [[year, value], ...]
    points = raw
      .map(function(row) { return { t: row[0], v: row[1] }; })
      .filter(function(p) { return Number.isFinite(p.v); });
  }

  if (!points.length) {
    chartArea.innerHTML = "<div class=\"cp-no-data\">No historical data available</div>";
    return;
  }

  var chartLabels = {
    gdp_per_capita:    "GDP per capita (USD)",
    govt_debt_gdp:     "Govt debt (% of GDP)",
    cpi_inflation:     "CPI inflation (%)",
    life_expectancy:   "Life expectancy (yrs)",
    unemployment_rate: "Unemployment (%)",
    bond_yield_10y:    "10-yr bond yield (%)"
  };

  // inject canvas and render after layout pass (display:block forces correct sizing)
  chartArea.innerHTML = "<canvas id=\"cp-iy-canvas\" style=\"width:100%;height:144px;display:block;\"></canvas>";
  var canvas = document.getElementById("cp-iy-canvas");
  requestAnimationFrame(function() {
    _IYChart(canvas, points, {
      isTimestamp:  isFred,
      label:        chartLabels[key] || key,
      color:        "#388bfd",
      fillOpacity:  0.15
    });
  });
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
  // Small countries / microstates missing from world GeoJSON centroids
  MC:[43.74,7.43],   SM:[43.94,12.46],   LI:[47.14,9.52],   AD:[42.51,1.52],
  VA:[41.90,12.45],  SG:[1.35,103.82],   IS:[64.14,-21.90], BH:[26.21,50.59],
  MV:[4.18,73.51],   MT:[35.90,14.51],   BN:[4.94,114.95],  KW:[29.37,47.98],
  QA:[25.29,51.53],  SC:[-4.62,55.45],   MO:[22.20,113.54], XK:[42.67,21.17],
  PS:[31.95,35.23],  KP:[39.02,125.76],  KI:[1.33,172.98],  TV:[-8.52,179.20],
  NR:[-0.53,166.92], PW:[7.50,134.62],   MH:[7.11,171.18],  FM:[6.92,158.16],
  WS:[-13.82,-172.14],TO:[-21.14,-175.20],VU:[-17.73,168.32],SB:[-9.43,160.04],
  FO:[62.01,-6.77],  GL:[64.18,-51.74],  NC:[-22.27,166.46],PF:[-17.53,-149.57],
  KG:[42.87,74.59],  TJ:[38.56,68.77],   TM:[37.95,58.38],  TL:[-8.56,125.57],
  LA:[17.97,102.60], KH:[11.55,104.92],  GY:[6.80,-58.16],  SR:[5.85,-55.20],
  GN:[9.54,-13.68],  GM:[13.45,-16.58],  GW:[11.86,-15.60], SL:[8.49,-13.23],
  LR:[6.30,-10.80],  ML:[12.65,-8.00],   BF:[12.37,-1.52],  NE:[13.51,2.12],
  TD:[12.11,15.04],  CF:[4.36,18.55],    CG:[-4.27,15.29],  GQ:[3.75,8.78],
  GA:[0.39,9.45],    DJ:[11.59,43.15],   ER:[15.34,38.93],  SO:[2.05,45.34],
  SS:[4.86,31.57],   LS:[-29.32,27.48],  SZ:[-26.32,31.14], MW:[-13.97,33.79],
  MR:[18.08,-15.97], ST:[0.34,6.73],     CV:[14.93,-23.51], KM:[-11.70,43.26],
  GD:[12.06,-61.74], DM:[15.30,-61.39],  LC:[13.91,-60.98], KN:[17.30,-62.72],
  VC:[13.16,-61.23], AG:[17.12,-61.85],  BB:[13.10,-59.62], TT:[10.65,-61.52],
  BS:[25.08,-77.35], HT:[18.54,-72.34],  BZ:[17.25,-88.77], SR:[5.85,-55.20],
  GI:[36.14,-5.35],  IM:[54.15,-4.49],   FJ:[-18.14,178.44],
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

function openTradePanel(iso2, countryName, data) {
  const latestYear = data[data.length - 1]?.year || 2024;

  document.getElementById('trade-panel-flag').textContent  = isoToFlag(iso2);
  document.getElementById('trade-panel-title').textContent = `${countryName} ↔ United States`;

  const slider = document.getElementById('trade-year-slider');
  slider.min   = data[0]?.year || 1999;
  slider.max   = latestYear;
  slider.value = latestYear;
  slider.dataset.iso2 = iso2;

  // Balance history chart via IYChart
  const chartEl = document.getElementById('trade-chart');
  chartEl.innerHTML = '';
  if (window._tradChartDestroy) { window._tradChartDestroy(); window._tradChartDestroy = null; }
  const balPts = data
    .filter(d => d.expGds != null || d.expSvcs != null)
    .map(d => ({
      t: d.year,
      v: ((d.expGds || 0) + (d.expSvcs || 0)) - ((d.impGds || 0) + (d.impSvcs || 0)),
    }));
  if (balPts.length >= 2) {
    const { draw, destroy } = _IYChart(chartEl, balPts, { fmt: 'rev', autoColor: true });
    window._tradChartDestroy = destroy;
    requestAnimationFrame(draw);
  }

  // Top companies
  const topCos = _getTopCompaniesByIso(iso2, 6);
  document.getElementById('trade-companies-list').innerHTML = topCos.length
    ? topCos.map(co => {
        const rev = co.revenue ? `<span class="tco-rev">$${fmtRevenue(toUSD(co.revenue, co.revenue_currency))}</span>` : '';
        const ind = co.industry ? `<span class="tco-ind">${escHtml(co.industry)}</span>` : '';
        return `<div class="tco-row"><span class="tco-name">${escHtml(co.name)}</span>${ind}${rev}</div>`;
      }).join('')
    : '<div class="tco-empty">No company data for this country</div>';

  _updateTradePanelNumbers(iso2, data, latestYear);
  drawTradeArrows(iso2, data, latestYear);
  document.getElementById('trade-panel').classList.add('open');
}

function _updateTradePanelNumbers(iso2, data, year) {
  const row = data.find(d => d.year === year) || data[data.length - 1];
  if (!row) return;
  document.getElementById('trade-year-label').textContent = year;

  const fmt = v => v ? '$' + fmtRevenue(v) : null;
  const expGds = row.expGds || 0, expSvc = row.expSvcs || 0;
  const impGds = row.impGds || 0, impSvc = row.impSvcs || 0;
  const expTotal = expGds + expSvc, impTotal = impGds + impSvc;

  document.getElementById('tf-exp-total').textContent = fmt(expTotal) || '—';
  document.getElementById('tf-imp-total').textContent = fmt(impTotal) || '—';

  const expParts = [expGds && `Goods ${fmt(expGds)}`, expSvc && `Svc ${fmt(expSvc)}`].filter(Boolean);
  const impParts = [impGds && `Goods ${fmt(impGds)}`, impSvc && `Svc ${fmt(impSvc)}`].filter(Boolean);
  document.getElementById('tf-exp-detail').textContent = expParts.join(' · ');
  document.getElementById('tf-imp-detail').textContent = impParts.join(' · ');

  const maxFlow = Math.max(expTotal, impTotal, 1);
  document.getElementById('tf-exp-bar').style.width = `${(expTotal / maxFlow * 100).toFixed(1)}%`;
  document.getElementById('tf-imp-bar').style.width = `${(impTotal / maxFlow * 100).toFixed(1)}%`;

  const balance = expTotal - impTotal;
  const balEl = document.getElementById('trade-balance-val');
  balEl.textContent = (balance >= 0 ? '+' : '−') + '$' + fmtRevenue(Math.abs(balance));
  balEl.style.color = balance >= 0 ? '#3fb950' : '#f85149';
  document.getElementById('trade-balance-label').textContent = balance >= 0 ? 'US Surplus' : 'US Deficit';
}

function closeCountryPopup() { closeCountryPanel(); }

function closeTradePanelFn() {
  document.getElementById('trade-panel').classList.remove('open');
  clearTradeArrows();
  if (window._tradChartDestroy) { window._tradChartDestroy(); window._tradChartDestroy = null; }
}

async function _loadAndShowTrade(iso2, countryName) {
  if (iso2 === 'US') return;
  const beaName = ISO2_TO_BEA[iso2];
  if (!beaName) return;

  if (!tradeCache[iso2]) {
    // 1) Check pre-built local file first (fastest, no API call)
    if (beaTradeData[iso2]) {
      tradeCache[iso2] = beaTradeData[iso2];
    } else {
      // 2) Check localStorage cache
      const cached = _loadTradeFromLS(iso2);
      if (cached) {
        tradeCache[iso2] = cached;
      } else {
        // 3) Fall back to live BEA API
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
let _drawActive      = false;  // currently adding vertices
let _drawVertices    = [];     // [[lat,lng], ...]
let _drawPolyline    = null;   // live dashed outline while drawing
let _drawPolygon     = null;   // closed polygon layer
let _drawDots        = [];     // vertex circle markers
let _drawClickTimer  = null;   // debounce: suppress the 2 clicks that precede dblclick

// Capture-phase handlers — attached to the map container so they fire BEFORE
// any Leaflet layer handlers (city dots, country polygons) can stopPropagation.
function _onDrawContainerClick(e) {
  if (!_drawActive) return;
  e.stopPropagation();   // block country popups, city panels etc while drawing
  if (_drawClickTimer) { clearTimeout(_drawClickTimer); _drawClickTimer = null; }
  const latlng = map.containerPointToLatLng(map.mouseEventToContainerPoint(e));
  _drawClickTimer = setTimeout(() => { _drawClickTimer = null; _drawAddVertex(latlng); }, 220);
}
function _onDrawContainerDblClick(e) {
  if (!_drawActive) return;
  e.stopPropagation();
  e.preventDefault();
  if (_drawClickTimer) { clearTimeout(_drawClickTimer); _drawClickTimer = null; }
  _drawFinish();
}

function toggleDrawMode() {
  if (_drawPolygon) { _drawClear(); return; }   // polygon exists → clear it
  if (_drawActive)  { _drawFinish(); return; }  // drawing in progress → finish
  // Start drawing
  _drawActive = true;
  _drawVertices = [];
  map.dragging.disable();        // prevent accidental panning while placing vertices
  map.doubleClickZoom.disable(); // prevent zoom on double-click finish
  // Capture phase: fires before any layer click/stopPropagation
  map.getContainer().addEventListener('click',    _onDrawContainerClick,    true);
  map.getContainer().addEventListener('dblclick', _onDrawContainerDblClick, true);
  const btn = document.getElementById('draw-fab');
  if (btn) { btn.textContent = '✓ Done'; btn.title = 'Click to add points · Double-click or Done to close · Esc to cancel'; btn.classList.add('active'); }
  map.getContainer().style.cursor = 'crosshair';
}

function _drawClear() {
  if (_drawClickTimer) { clearTimeout(_drawClickTimer); _drawClickTimer = null; }
  _drawActive = false;
  _drawVertices = [];
  [_drawPolyline, _drawPolygon, ..._drawDots].forEach(l => { try { if(l) map.removeLayer(l); } catch(_){} });
  _drawPolyline = _drawPolygon = null;
  _drawDots = [];
  map.dragging.enable();
  map.doubleClickZoom.enable();
  map.getContainer().removeEventListener('click',    _onDrawContainerClick,    true);
  map.getContainer().removeEventListener('dblclick', _onDrawContainerDblClick, true);
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
  map.dragging.enable();
  map.doubleClickZoom.enable();
  map.getContainer().removeEventListener('click',    _onDrawContainerClick,    true);
  map.getContainer().removeEventListener('dblclick', _onDrawContainerDblClick, true);
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

  // Deduplicate by company QID — same company can appear under multiple nearby cities in Wikidata
  const _seenQids = new Set();
  companies = companies.filter(co => {
    if (!co.qid || !_seenQids.has(co.qid)) { if (co.qid) _seenQids.add(co.qid); return true; }
    return false;
  });

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
      qid: co.qid || null,
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
      market_cap: co.market_cap || null, market_cap_year: co.market_cap_year || null, market_cap_currency: co.market_cap_currency || null,
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
  const _globalSeenQids = new Set();
  for (const [qid, companies] of Object.entries(companiesData)) {
    const city = cityByQid[qid];
    const cityName = city ? city.name : '—';
    const country = city ? (city.country || '') : '';
    for (const co of companies) {
      // Deduplicate by company QID — same company can appear under multiple nearby cities
      if (co.qid && _globalSeenQids.has(co.qid)) continue;
      if (co.qid) _globalSeenQids.add(co.qid);
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
    qid: co.qid || null,
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
    market_cap: co.market_cap || null, market_cap_year: co.market_cap_year || null, market_cap_currency: co.market_cap_currency || null,
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

// ── Reusable interactive canvas chart (_IYChart) ─────────────────────────────
// points : [{t, v}]  where t = unix timestamp (isTimestamp=true) or year integer
// opts   : { color, height, isTimestamp, autoColor, yFmt, xFmt,
//            showXLabels, showYLabels, ranges:[{label,days}], defaultDays }
// Returns { draw, destroy } — call destroy() to release the ResizeObserver.
function _IYChart(containerEl, points, opts = {}) {
  const {
    color       = '#58a6ff',
    height      = 80,
    isTimestamp = true,
    autoColor   = true,
    yFmt        = v => v.toLocaleString(),
    xFmt        = isTimestamp
      ? t => new Date(t * 1000).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
      : t => String(t),
    showXLabels = false,
    showYLabels = false,
    ranges      = null,
    defaultDays = 0,
  } = opts;

  containerEl.innerHTML = '';
  containerEl.style.userSelect = 'none';
  let activeDays = defaultDays;
  let btnRow = null;

  // ── Range buttons ──
  if (ranges?.length) {
    btnRow = document.createElement('div');
    btnRow.className = 'iyc-range-row';
    ranges.forEach(r => {
      const btn = document.createElement('button');
      btn.className = 'iyc-range' + (r.days === activeDays ? ' active' : '');
      btn.textContent = r.label;
      btn.dataset.days = r.days;
      btn.onclick = () => {
        activeDays = r.days;
        btnRow.querySelectorAll('.iyc-range').forEach(b =>
          b.classList.toggle('active', +b.dataset.days === activeDays)
        );
        draw();
      };
      btnRow.appendChild(btn);
    });
    containerEl.appendChild(btnRow);
  }

  // ── Canvas wrapper + tooltip ──
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative;overflow:hidden';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = `width:100%;height:${height}px;display:block;cursor:crosshair`;
  const tt = document.createElement('div');
  tt.className = 'iyc-tooltip';
  tt.style.display = 'none';
  wrap.appendChild(canvas);
  wrap.appendChild(tt);
  containerEl.appendChild(wrap);

  const DPR = window.devicePixelRatio || 1;
  let _L = null; // cached layout

  function getVisible() {
    if (!activeDays) return points;
    if (isTimestamp) {
      const last = points[points.length - 1]?.t || 0;
      return points.filter(p => p.t >= last - activeDays * 86400);
    }
    return points.slice(-Math.max(2, Math.round(activeDays / 365)));
  }

  function draw() {
    const W = wrap.offsetWidth || containerEl.offsetWidth || 280;
    const H = height;
    canvas.width  = W * DPR;
    canvas.height = H * DPR;

    const vis = getVisible();
    if (vis.length < 2) { _L = null; return; }

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const PT = 6 * DPR, PB = (showXLabels ? 16 : 4) * DPR;
    const PL = 2 * DPR, PR = (showYLabels ? 48 : 2) * DPR;
    const pW = canvas.width - PL - PR, pH = canvas.height - PT - PB;

    const tMin = vis[0].t, tMax = vis[vis.length - 1].t;
    const vals  = vis.map(p => p.v);
    const vMin  = Math.min(...vals), vMax = Math.max(...vals);
    const vPad  = (vMax - vMin) * 0.1 || Math.abs(vMax) * 0.05 || 1;
    const vLo   = vMin - vPad, vHi = vMax + vPad;

    const xOf = t => PL + (tMax === tMin ? pW / 2 : (t - tMin) / (tMax - tMin) * pW);
    const yOf = v => PT + pH - (vHi === vLo ? pH / 2 : (v - vLo) / (vHi - vLo) * pH);
    const lineClr = autoColor
      ? (vis[vis.length - 1].v >= vis[0].v ? '#3fb950' : '#f85149')
      : color;

    // Horizontal grid lines
    ctx.strokeStyle = 'rgba(48,54,61,0.5)';
    ctx.lineWidth = DPR * 0.5;
    for (let i = 1; i <= 3; i++) {
      const y = PT + pH * i / 4;
      ctx.beginPath(); ctx.moveTo(PL, y); ctx.lineTo(PL + pW, y); ctx.stroke();
    }

    // Y-axis labels (right)
    if (showYLabels) {
      ctx.fillStyle = '#484f58';
      ctx.font = `${9 * DPR}px system-ui,sans-serif`;
      ctx.textAlign = 'right';
      [0, 0.5, 1].forEach(f => {
        const v = vLo + (vHi - vLo) * f;
        ctx.fillText(yFmt(v), canvas.width - DPR, PT + pH * (1 - f) + 3 * DPR);
      });
    }

    // Area gradient
    const grad = ctx.createLinearGradient(0, PT, 0, canvas.height - PB);
    grad.addColorStop(0, lineClr + '33'); grad.addColorStop(1, lineClr + '00');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(xOf(tMin), canvas.height - PB);
    vis.forEach(p => ctx.lineTo(xOf(p.t), yOf(p.v)));
    ctx.lineTo(xOf(tMax), canvas.height - PB);
    ctx.closePath(); ctx.fill();

    // Line
    ctx.strokeStyle = lineClr; ctx.lineWidth = 1.5 * DPR;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.setLineDash([]);
    ctx.beginPath();
    vis.forEach((p, i) => i === 0 ? ctx.moveTo(xOf(p.t), yOf(p.v)) : ctx.lineTo(xOf(p.t), yOf(p.v)));
    ctx.stroke();

    // X-axis labels
    if (showXLabels) {
      ctx.fillStyle = '#484f58'; ctx.textAlign = 'center';
      ctx.font = `${8 * DPR}px system-ui,sans-serif`;
      const n = Math.min(vis.length - 1, Math.max(2, Math.floor(W / 80)));
      for (let i = 0; i <= n; i++) {
        const idx = Math.round(i / n * (vis.length - 1));
        ctx.fillText(xFmt(vis[idx].t), xOf(vis[idx].t), canvas.height - 2 * DPR);
      }
    }

    _L = { vis, xOf, yOf, tMin, tMax, pW, pH, PT, PB, PL, PR, lineClr, DPR, cW: canvas.width, cH: canvas.height, W };
  }

  // Crosshair
  function _crosshair(pt) {
    if (!_L) return;
    const { xOf, yOf, PT, PB, PL, PR, lineClr, DPR, cW, cH } = _L;
    const ctx = canvas.getContext('2d');
    const cx = xOf(pt.t), cy = yOf(pt.v);
    ctx.setLineDash([3 * DPR, 3 * DPR]);
    ctx.strokeStyle = 'rgba(180,180,180,0.22)'; ctx.lineWidth = DPR;
    ctx.beginPath(); ctx.moveTo(cx, PT); ctx.lineTo(cx, cH - PB); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(PL, cy); ctx.lineTo(cW - PR, cy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = lineClr; ctx.strokeStyle = '#0d1117'; ctx.lineWidth = 2 * DPR;
    ctx.beginPath(); ctx.arc(cx, cy, 3.5 * DPR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  function _nearest(mx) {
    if (!_L) return null;
    const { vis, tMin, tMax, pW, PL, DPR } = _L;
    const tAt = tMin + (mx * DPR - PL) / pW * (tMax - tMin);
    let best = null, bestD = Infinity;
    vis.forEach(p => { const d = Math.abs(p.t - tAt); if (d < bestD) { bestD = d; best = p; } });
    return best;
  }

  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const pt = _nearest(mx);
    if (!pt || !_L) return;
    draw(); _crosshair(pt);
    // Tooltip
    const vis = _L.vis;
    const pct = vis.length > 1 ? ((pt.v - vis[0].v) / vis[0].v * 100).toFixed(1) : null;
    const pctHtml = pct != null
      ? ` <span class="iyc-tt-p" style="color:${parseFloat(pct)>=0?'#3fb950':'#f85149'}">${parseFloat(pct)>=0?'+':''}${pct}%</span>`
      : '';
    tt.innerHTML = `<span class="iyc-tt-x">${xFmt(pt.t)}</span> <span class="iyc-tt-v">${yFmt(pt.v)}</span>${pctHtml}`;
    tt.style.display = 'block';
    const tw = tt.offsetWidth, th = tt.offsetHeight;
    let tx = mx - tw / 2; if (tx < 0) tx = 0; if (tx + tw > rect.width) tx = rect.width - tw;
    tt.style.left = tx + 'px';
    tt.style.top  = (my < rect.height / 2 ? my + 12 : my - th - 6) + 'px';
  });

  canvas.addEventListener('mouseleave', () => { tt.style.display = 'none'; draw(); });

  // Scroll wheel → cycle range buttons
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    if (!ranges?.length || !btnRow) return;
    const btns = [...btnRow.querySelectorAll('.iyc-range')];
    const cur  = btns.findIndex(b => +b.dataset.days === activeDays);
    const next = Math.max(0, Math.min(btns.length - 1, cur + (e.deltaY > 0 ? 1 : -1)));
    if (next !== cur) btns[next].click();
  }, { passive: false });

  const ro = new ResizeObserver(() => draw());
  ro.observe(containerEl);
  draw();

  return { draw, destroy: () => ro.disconnect() };
}

// ── Wikipedia image gallery ───────────────────────────────────────────────────
// Fetches all images from a Wikipedia article via the REST media-list endpoint.
// Filters out SVGs, flags, icons, maps — returns up to 20 photo URLs.
async function _fetchWikiImages(articleTitle) {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/media-list/${encodeURIComponent(articleTitle)}`
    );
    if (!res.ok) return [];
    const j = await res.json();
    return (j.items || [])
      .filter(item => {
        if (item.type !== 'image') return false;
        const t = (item.title || '').toLowerCase();
        if (t.endsWith('.svg')) return false;
        if (/\b(flag|seal|coat_of_arms|icon|blank|map|chart|graph|signature|commons-logo|edit-clear|question_book)\b/.test(t)) return false;
        return (item.srcset?.length || 0) > 0;
      })
      .map(item => {
        // Use the largest available srcset size; prefix with https: if protocol-relative
        const raw = item.srcset[item.srcset.length - 1]?.src || item.srcset[0]?.src || '';
        return raw.startsWith('//') ? 'https:' + raw : raw;
      })
      .filter(Boolean)
      .slice(0, 20);
  } catch { return []; }
}

// ── Company stock price section ───────────────────────────────────────────────
// Fetches /prices/{ticker}.json and renders a 5-year price chart + stats
// into the placeholder div already inserted in the info tab.
async function _renderCompanyPriceSection(ticker, containerEl) {
  if (!ticker || !containerEl) return;
  const phId = 'co-price-' + ticker.replace(/[^a-z0-9]/gi, '_');
  const ph   = containerEl.querySelector('#' + phId);
  if (!ph) return;

  try {
    const res = await fetch('/prices/' + encodeURIComponent(ticker) + '.json');
    if (!res.ok) { ph.remove(); return; }
    const data = await res.json();

    const rawPrices = (data.a || data.c || []);
    const points    = (data.t || []).map((ts, i) => ({ t: ts, v: rawPrices[i] })).filter(p => p.v != null);
    if (points.length < 10) { ph.remove(); return; }

    const latest  = points[points.length - 1];
    const now     = latest.v;
    const fmtPx   = v => v >= 100 ? v.toFixed(2) : v >= 1 ? v.toFixed(2) : v.toFixed(4);
    const currSym = { USD:'$', EUR:'€', GBP:'£', JPY:'¥' }[data.currency] || '';

    // Performance stats (computed once; shown above chart)
    const priceAgo = days => {
      const target = latest.t - days * 86400;
      const idx    = points.findIndex(p => p.t >= target);
      return idx > 0 ? points[idx].v : null;
    };
    const pct    = (o, n) => o ? +((n - o) / o * 100).toFixed(1) : null;
    const fmtPct = v => v == null ? '' : (v >= 0 ? '+' : '') + v + '%';
    const pClr   = v => v == null ? '#8b949e' : v >= 0 ? '#3fb950' : '#f85149';

    const chg1m = pct(priceAgo(30), now);
    const chg1y = pct(priceAgo(365), now);
    const chg5y = pct(points[0].v, now);

    // 52-week range bar
    const yr1Ts = latest.t - 365 * 86400;
    const yrPts = points.filter(p => p.t >= yr1Ts);
    const w52lo = Math.min(...yrPts.map(p => p.v));
    const w52hi = Math.max(...yrPts.map(p => p.v));
    const w52p  = w52hi > w52lo ? ((now - w52lo) / (w52hi - w52lo) * 100).toFixed(0) : 50;

    // Dividends (past 12 months)
    const recentDivs = (data.dividends || []).filter(d => d.t >= yr1Ts);
    const divHtml    = recentDivs.length
      ? `<div style="font-size:0.67rem;color:#8b949e;padding:0 14px;margin-bottom:4px">Div (12mo): ${recentDivs.map(d => currSym + d.amount).join(' · ')}</div>`
      : '';

    const perfSpans = [
      chg1m != null ? `<span style="color:${pClr(chg1m)};font-size:0.7rem">${fmtPct(chg1m)} 1M</span>` : '',
      chg1y != null ? `<span style="color:${pClr(chg1y)};font-size:0.7rem">${fmtPct(chg1y)} 1Y</span>` : '',
      chg5y != null ? `<span style="color:${pClr(chg5y)};font-size:0.7rem">${fmtPct(chg5y)} 5Y</span>` : '',
    ].filter(Boolean).join('<span style="color:#30363d;margin:0 3px">·</span>');

    // Build the Finance tab layout
    ph.innerHTML = `
      <div style="padding:8px 14px 4px;display:flex;align-items:baseline;justify-content:space-between">
        <span style="font-size:0.95rem;font-weight:700;color:#e6edf3">${currSym}${fmtPx(now)}<span style="font-size:0.68rem;font-weight:400;color:#6e7681"> ${data.currency||''}</span></span>
        <span>${perfSpans}</span>
      </div>
      <div id="${phId}-chart" style="padding:0 14px"></div>
      <div style="display:flex;align-items:center;gap:5px;padding:4px 14px">
        <span style="font-size:0.64rem;color:#6e7681;flex-shrink:0">52W</span>
        <span style="font-size:0.64rem;color:#8b949e;flex-shrink:0">${fmtPx(w52lo)}</span>
        <div style="flex:1;height:3px;background:#21262d;border-radius:2px;overflow:hidden">
          <div style="width:${w52p}%;height:100%;background:#58a6ff;border-radius:2px"></div>
        </div>
        <span style="font-size:0.64rem;color:#8b949e;flex-shrink:0">${fmtPx(w52hi)}</span>
      </div>
      ${divHtml}
      <div style="font-size:0.6rem;color:#484f58;padding:0 14px 8px">${ticker} · ${data.exchange||''} · 5Y daily · ${data.updated||''}</div>
    `;

    // Mount interactive chart
    const chartEl = ph.querySelector(`#${phId}-chart`);
    if (chartEl) {
      _IYChart(chartEl, points, {
        height: 140, isTimestamp: true, autoColor: true,
        showXLabels: true, showYLabels: true,
        yFmt: v => currSym + fmtPx(v),
        xFmt: t => new Date(t * 1000).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        ranges: [
          { label: '1M', days: 30  },
          { label: '3M', days: 90  },
          { label: '6M', days: 180 },
          { label: '1Y', days: 365 },
          { label: '3Y', days: 1095 },
          { label: '5Y', days: 1825 },
          { label: 'Max', days: 0  },
        ],
        defaultDays: 365,
      });
    }
  } catch (_) {
    if (ph) ph.remove();
  }
}

// ── Full Finance tab renderer ─────────────────────────────────────────────────
// Builds the complete Finance tab for a company: price chart + key stats +
// margins + financial health + historical charts + ownership.
// co = the company object from companies.json (finData).
function _renderFinanceTab(co, containerEl) {
  if (!co || !containerEl) return;

  const ticker = co.ticker || '';
  const cur = co.revenue_currency || co.net_income_currency || '';
  const curSym = { USD:'$', EUR:'€', GBP:'£', JPY:'¥', CNY:'¥', KRW:'₩', INR:'₹' }[cur] || '';

  // ── Helpers ────────────────────────────────────────────────────────────────
  const pct   = v => v == null ? null : (v * 100).toFixed(1) + '%';
  const fmtV  = v => v == null ? null : fmtRevenue(v);           // currency magnitudes
  const fmtP  = v => v == null ? null : (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%';
  const fmtX  = v => v == null ? null : v.toFixed(2) + '×';
  const fmtR  = v => v == null ? null : v.toFixed(2);
  const clr   = v => v == null ? '#8b949e' : v >= 0 ? '#3fb950' : '#f85149';

  // Section header helper
  const sec = label =>
    `<div style="padding:8px 14px 4px;font-size:0.65rem;font-weight:600;color:#6e7681;text-transform:uppercase;letter-spacing:0.06em;border-top:1px solid #21262d">${label}</div>`;

  // Stat chip: label + value in a card
  const chip = (label, val, color = '#c9d1d9') => {
    if (val == null || val === '') return '';
    return `<div style="background:#21262d;border-radius:6px;padding:5px 9px;min-width:0">
      <div style="font-size:0.6rem;color:#6e7681;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(label)}</div>
      <div style="font-size:0.78rem;color:${color};font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(String(val))}</div>
    </div>`;
  };
  const grid = (...chips) => {
    const cells = chips.filter(Boolean).join('');
    return cells ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;padding:6px 14px">${cells}</div>` : '';
  };

  // Margin bar row
  const bar = (label, val, color = '#58a6ff') => {
    if (val == null) return '';
    const w = Math.min(100, Math.abs(val * 100)).toFixed(1);
    const c = val >= 0 ? color : '#f85149';
    return `<div style="padding:3px 14px">
      <div style="display:flex;justify-content:space-between;margin-bottom:2px">
        <span style="font-size:0.68rem;color:#8b949e">${escHtml(label)}</span>
        <span style="font-size:0.68rem;font-weight:600;color:${c}">${(val*100).toFixed(1)}%</span>
      </div>
      <div style="height:4px;background:#21262d;border-radius:2px">
        <div style="width:${w}%;height:100%;background:${c};border-radius:2px"></div>
      </div>
    </div>`;
  };

  // IYChart placeholder
  let _fn = 0;
  const chartPh = (pts, color, fmt, height = 80) => {
    if (!pts || pts.length < 2) return '';
    const id = `fin-iyc-${++_fn}`;
    return `<div id="${id}" data-fin-pts="${escHtml(JSON.stringify(pts))}" data-fin-color="${escHtml(color)}" data-fin-fmt="${fmt}" style="padding:0 8px 4px;height:${height}px"></div>`;
  };

  // ── Collect data ───────────────────────────────────────────────────────────
  const mcap     = co.market_cap;
  const ev       = co.enterprise_value;
  const shares   = co.shares_outstanding;
  const eps      = co.eps ?? co.eps_trailing;
  const pe       = co.pe_trailing;
  const peFwd    = co.pe_forward;
  const pb       = co.price_to_book;
  const beta     = co.beta;
  const w52chg   = co.week52_change;
  const divYield = co.dividend_yield;
  const divRate  = co.dividend_rate;
  const sector   = co.sector;
  const industry = co.industry;

  const analystRating = co.analyst_rating || null;
  const analystTarget = co.analyst_target_price || null;
  const analystCount  = co.analyst_count  || null;
  const lastPrice     = co.last_price_yahoo || null;

  const opMargin  = co.operating_margin;
  const prMargin  = co.profit_margin;
  const grMargin  = co.gross_margin;
  const ebMargin  = co.ebitda_margin;
  const roe       = co.return_on_equity;
  const roa       = co.return_on_assets;
  const revGrowth = co.revenue_growth_yoy;
  const earnGrowth= co.earnings_growth_yoy;

  const totalCash = co.total_cash;
  const totalDebt = co.total_debt;
  const ebitda    = co.ebitda;
  const fcf       = co.free_cashflow;
  const ocf       = co.operating_cashflow;
  const de        = co.debt_to_equity;
  const cr        = co.current_ratio;
  const qr        = co.quick_ratio;

  const pctInsider = co.pct_insider;
  const pctInst    = co.pct_institutional;

  // ── Historical chart data ──────────────────────────────────────────────────
  // Prefer Yahoo's richer history, fall back to Wikidata history
  const revHistory = (() => {
    const yh = (co.revenue_history_yahoo || []).filter(r => r.revenue > 0).map(r => ({ t: r.year, v: r.revenue }));
    if (yh.length >= 2) return yh;
    return (co.revenue_history || []).filter(r => r[1] > 0).map(r => ({ t: r[0], v: r[1] }));
  })();
  const niHistory = (() => {
    const yh = (co.revenue_history_yahoo || []).filter(r => r.net_income != null).map(r => ({ t: r.year, v: r.net_income }));
    if (yh.length >= 2) return yh;
    return (co.net_income_history || []).filter(r => r[1] != null).map(r => ({ t: r[0], v: r[1] }));
  })();
  const cfHistory = (co.cashflow_history_yahoo || [])
    .filter(r => r.free_cash_flow != null)
    .map(r => ({ t: r.year, v: r.free_cash_flow }));
  const assetHistory = (co.total_assets_history || []).filter(r => r[1] > 0).map(r => ({ t: r[0], v: r[1] }));
  const equityHistory = (co.total_equity_history || []).filter(r => r[1] != null && r[1] !== 0).map(r => ({ t: r[0], v: r[1] }));

  // ── Build HTML ─────────────────────────────────────────────────────────────
  const phId = 'co-price-' + ticker.replace(/[^a-z0-9]/gi, '_');

  let html = `<div id="${phId}"><div style="padding:14px;font-size:0.72rem;color:#484f58"><div class="spinner" style="display:inline-block;margin-right:6px"></div>Loading price data…</div></div>`;

  // Key Stats
  const hasKeyStats = mcap || ev || eps != null || pe != null || pb != null || beta != null || divYield != null;
  if (hasKeyStats) {
    html += sec('Key Statistics');
    html += grid(
      chip('Market Cap', mcap ? fmtV(mcap) : null),
      chip('Enterprise Val', ev  ? fmtV(ev)  : null),
      chip('Shares Out.', shares ? fmtV(shares) : null),
      chip('EPS (TTM)', eps != null ? (curSym || '$') + eps.toFixed(2) : null),
      chip('P/E (TTM)', pe != null ? fmtX(pe) : null),
      chip('P/E (Fwd)', peFwd != null ? fmtX(peFwd) : null),
      chip('Price/Book', pb != null ? fmtX(pb) : null),
      chip('Beta', beta != null ? fmtR(beta) : null, beta != null ? (beta > 1.2 ? '#f0a500' : beta < 0.8 ? '#58a6ff' : '#c9d1d9') : '#c9d1d9'),
      chip('52W Change', w52chg != null ? fmtP(w52chg) : null, clr(w52chg)),
      chip('Div Yield', divYield != null ? pct(divYield) : null, '#3fb950'),
      chip('Div Rate', divRate != null ? (curSym || '$') + divRate.toFixed(2) : null),
    );
  }

  // Profitability & Growth
  const hasMargins = opMargin != null || prMargin != null || grMargin != null || ebMargin != null || roe != null || roa != null;
  if (hasMargins) {
    html += sec('Profitability');
    if (grMargin != null) html += bar('Gross Margin', grMargin, '#58a6ff');
    if (opMargin != null) html += bar('Operating Margin', opMargin, '#3fb950');
    if (ebMargin != null) html += bar('EBITDA Margin', ebMargin, '#f0a500');
    if (prMargin != null) html += bar('Net Profit Margin', prMargin, '#bc8cff');
    html += grid(
      chip('Return on Equity', roe != null ? pct(roe) : null, clr(roe)),
      chip('Return on Assets', roa != null ? pct(roa) : null, clr(roa)),
      chip('Revenue Growth', revGrowth != null ? fmtP(revGrowth) : null, clr(revGrowth)),
      chip('Earnings Growth', earnGrowth != null ? fmtP(earnGrowth) : null, clr(earnGrowth)),
    );
  }

  // Financial Health
  const hasHealth = totalCash != null || totalDebt != null || de != null || cr != null;
  if (hasHealth) {
    html += sec('Financial Health');
    html += grid(
      chip('Cash & Equiv', totalCash ? fmtV(totalCash) : null, '#3fb950'),
      chip('Total Debt',   totalDebt ? fmtV(totalDebt) : null, '#f85149'),
      chip('EBITDA',       ebitda    ? fmtV(ebitda)    : null),
      chip('Free Cash Flow', fcf     ? fmtV(fcf)       : null, clr(fcf)),
      chip('Oper. Cash Flow', ocf    ? fmtV(ocf)       : null, clr(ocf)),
      chip('D/E Ratio',   de != null ? fmtR(de)        : null, de != null ? (de > 2 ? '#f85149' : de > 1 ? '#f0a500' : '#3fb950') : '#c9d1d9'),
      chip('Current Ratio', cr != null ? fmtR(cr)      : null, cr != null ? (cr >= 1.5 ? '#3fb950' : cr >= 1 ? '#f0a500' : '#f85149') : '#c9d1d9'),
      chip('Quick Ratio',  qr != null ? fmtR(qr)       : null),
    );
  }

  // Ownership
  if (pctInsider != null || pctInst != null) {
    html += sec('Ownership');
    html += grid(
      chip('Insider Held', pctInsider != null ? pct(pctInsider) : null),
      chip('Institutional', pctInst != null ? pct(pctInst) : null),
    );
  }

  // Analyst Consensus
  if (analystRating || analystTarget != null) {
    const RATING_LABELS = {
      strongBuy: 'Strong Buy', buy: 'Buy', hold: 'Hold',
      underperform: 'Underperform', sell: 'Sell',
    };
    const RATING_COLORS = {
      strongBuy: '#3fb950', buy: '#58a6ff', hold: '#f0a500',
      underperform: '#f85149', sell: '#f85149',
    };
    const ratingLabel = RATING_LABELS[analystRating] || analystRating;
    const ratingColor = RATING_COLORS[analystRating] || '#8b949e';
    let uptside = null;
    if (analystTarget != null && lastPrice != null && lastPrice > 0) {
      uptside = (analystTarget - lastPrice) / lastPrice;
    }
    html += sec('Analyst Consensus' + (analystCount ? ' · ' + analystCount + ' analysts' : ''));
    html += grid(
      analystRating ? chip('Rating', ratingLabel, ratingColor) : '',
      analystTarget != null ? chip('Price Target', (curSym || '$') + analystTarget.toFixed(2)) : '',
      uptside != null ? chip('Upside', fmtP(uptside), clr(uptside)) : '',
    );
  }

  // Sector / Industry tags
  if (sector || industry) {
    html += `<div style="padding:6px 14px 4px;display:flex;gap:6px;flex-wrap:wrap">
      ${sector   ? `<span style="background:#21262d;border-radius:12px;padding:2px 10px;font-size:0.68rem;color:#58a6ff">${escHtml(sector)}</span>` : ''}
      ${industry ? `<span style="background:#21262d;border-radius:12px;padding:2px 10px;font-size:0.68rem;color:#8b949e">${escHtml(industry)}</span>` : ''}
    </div>`;
  }

  // Historical charts
  const hasCharts = revHistory.length >= 2 || niHistory.length >= 2 || cfHistory.length >= 2 || assetHistory.length >= 2;
  if (hasCharts) {
    html += sec('Historical Trends');
    if (revHistory.length >= 2) {
      html += `<div style="padding:0 14px 2px;font-size:0.67rem;color:#8b949e">Revenue${cur ? ' (' + cur + ')' : ''}</div>`;
      html += chartPh(revHistory, '#58a6ff', 'rev', 80);
    }
    if (niHistory.length >= 2) {
      html += `<div style="padding:4px 14px 2px;font-size:0.67rem;color:#8b949e">Net Income${cur ? ' (' + cur + ')' : ''}</div>`;
      html += chartPh(niHistory, '#3fb950', 'rev', 70);
    }
    if (cfHistory.length >= 2) {
      html += `<div style="padding:4px 14px 2px;font-size:0.67rem;color:#8b949e">Free Cash Flow${cur ? ' (' + cur + ')' : ''}</div>`;
      html += chartPh(cfHistory, '#bc8cff', 'rev', 70);
    }
    if (assetHistory.length >= 2) {
      html += `<div style="padding:4px 14px 2px;font-size:0.67rem;color:#8b949e">Total Assets${cur ? ' (' + cur + ')' : ''}</div>`;
      html += chartPh(assetHistory, '#f0a500', 'rev', 70);
    }
    if (equityHistory.length >= 2) {
      html += `<div style="padding:4px 14px 2px;font-size:0.67rem;color:#8b949e">Total Equity${cur ? ' (' + cur + ')' : ''}</div>`;
      html += chartPh(equityHistory, '#e07b54', 'rev', 70);
    }
  }

  html += `<div style="height:16px"></div>`;

  containerEl.innerHTML = html;

  // Mount IYChart on all chart placeholders.
  // Store draw fns so switchWikiTab can force a redraw when the Finance tab
  // becomes visible (ResizeObserver won't fire on display:none → visible).
  const _finDrawFns = [];
  containerEl.querySelectorAll('[data-fin-pts]').forEach(el => {
    try {
      const pts = JSON.parse(el.dataset.finPts);
      const color = el.dataset.finColor;
      const inst = _IYChart(el, pts, {
        color, height: parseInt(el.style.height), isTimestamp: false,
        autoColor: false, yFmt: fmtRevenue, xFmt: t => String(t),
      });
      if (inst?.draw) _finDrawFns.push(inst.draw);
    } catch (_) {}
  });
  // Store so switchWikiTab can redraw after tab becomes visible
  containerEl._iycRedraw = () => _finDrawFns.forEach(fn => { try { fn(); } catch (_) {} });

  // Kick off price chart async (replaces the loading spinner)
  if (ticker) _renderCompanyPriceSection(ticker, containerEl);
}

async function openCompanyWikiPanel(articleTitle, name, wikiUrl, finData = {}) {
  const sidebar = document.getElementById('wiki-sidebar');
  const body = document.getElementById('wiki-sidebar-body');
  const footer = document.getElementById('wiki-sidebar-footer');
  const titleEl = document.getElementById('wiki-sidebar-title');

  titleEl.textContent = name;
  footer.innerHTML = '';
  // Use tab structure (same as cities): loading spinner in Info tab, Overview cleared
  const _coInfoEl = document.getElementById('wiki-tab-info');
  const _coOverEl  = document.getElementById('wiki-tab-overview');
  const _coEconEl  = document.getElementById('wiki-tab-economy');
  const _coFinEl   = document.getElementById('wiki-tab-finance');
  const _coEconBtn = document.getElementById('wiki-tab-economy-btn');
  const _coFinBtn  = document.getElementById('wiki-tab-finance-btn');
  if (_coInfoEl) _coInfoEl.innerHTML = '<div class="wiki-loading"><div class="spinner"></div><span>Loading…</span></div>';
  if (_coOverEl) _coOverEl.innerHTML = '';
  if (_coEconEl) _coEconEl.innerHTML = '';
  if (_coFinEl)  _coFinEl.innerHTML  = '';
  if (_coEconBtn) _coEconBtn.style.display = 'none';
  if (_coFinBtn)  _coFinBtn.style.display  = 'none';
  switchWikiTab('info');
  sidebar.classList.add('open');

  // Determine local language from the city whose corp panel is open
  const corpCity = allCities.find(c => c.qid === corpCityQid);
  const localLang = corpCity ? (ISO_TO_WIKI_LANG[corpCity.iso] || null) : null;
  const tryLocal = localLang && localLang !== 'en';

  try {
    // Always fetch English first (guaranteed to exist, gives us wikibase_item)
    // Fire media-list in parallel so it arrives with no extra wait.
    const enApiUrl    = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(articleTitle)}`;
    const mediaPromise = _fetchWikiImages(articleTitle);
    const enRaw = await fetch(enApiUrl);
    if (!enRaw.ok) throw new Error('HTTP ' + enRaw.status);
    const enData = await enRaw.json();
    const extraImages = await mediaPromise;

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

    // Build photo carousel — same UI as city panel
    const _thumb = displayData.thumbnail?.source || null;
    const _allImgs = [_thumb, ...extraImages]
      .filter(Boolean)
      .filter((src, i, arr) => arr.indexOf(src) === i);  // dedupe

    let imgHtml = '';
    if (_allImgs.length > 0) {
      window._lbImgs = _allImgs;
      carImages = _allImgs;
      carIdx = 0;
      carStop();
      const dots = _allImgs.map((_, i) =>
        `<button class="wiki-car-dot${i === 0 ? ' active' : ''}" onclick="carJump(${i})"></button>`
      ).join('');
      imgHtml = `
        <div class="wiki-carousel"
             onmouseenter="carStop()"
             onmouseleave="if(carImages.length>1) carTimer=setInterval(()=>carGo(1),4500)">
          <img id="wiki-car-img" class="wiki-carousel-img"
               src="${escAttr(_allImgs[0])}"
               onclick="openLightbox(window._lbImgs, carIdx)" alt="${escAttr(name)}" />
          ${_allImgs.length > 1 ? `
            <div class="wiki-car-overlay">
              <button class="wiki-car-btn" onclick="carGo(-1)">&#8249;</button>
              <div class="wiki-car-dots">${dots}</div>
              <button class="wiki-car-btn" onclick="carGo(1)">&#8250;</button>
            </div>
            <div class="wiki-car-counter" id="wiki-car-counter">1 / ${_allImgs.length}</div>
          ` : ''}
        </div>`;
      if (_allImgs.length > 1) {
        carTimer = setInterval(() => carGo(1), 4500);
      }
    }
    const extract = displayData.extract || '';

    // ── Chip helper (label + value box) ───────────────────────────────────────
    const _chip = (label, val, color = '#c9d1d9', isHtml = false, span2 = false) => {
      if (val == null || val === '') return '';
      const v = isHtml ? val : escHtml(String(val));
      return `<div style="background:#21262d;border-radius:6px;padding:5px 9px;min-width:0;overflow:hidden;${span2 ? 'grid-column:span 2;' : ''}">
        <div style="font-size:0.62rem;color:#6e7681;margin-bottom:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(label)}</div>
        <div style="font-size:0.79rem;color:${color};font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${v}</div>
      </div>`;
    };

    // ── Sparkline row helper → IYChart placeholder ────────────────────────────
    // Returns a placeholder div; IYChart is mounted after innerHTML is inserted.
    let _iycN = 0;
    const _sparkline = (hist, label, color, fmtFn) => {
      const rows = (hist || []).filter(h => h[0] && h[1] > 0);
      if (rows.length < 2) return '';
      const minV = Math.min(...rows.map(h => h[1]));
      const maxV = Math.max(...rows.map(h => h[1]));
      const pts  = JSON.stringify(rows);
      const fmt  = fmtFn === fmtEmployees ? 'emp' : 'rev';
      const id   = `iyc-${++_iycN}`;
      return `<div style="border-top:1px solid #21262d">
        <div style="display:flex;justify-content:space-between;padding:4px 14px 0">
          <span style="font-size:0.7rem;color:#8b949e">${escHtml(label)}</span>
          <span style="font-size:0.62rem;color:#484f58">${fmtFn(minV)} – ${fmtFn(maxV)}</span>
        </div>
        <div id="${id}" data-iyc-pts="${escHtml(pts)}" data-iyc-color="${escHtml(color)}" data-iyc-fmt="${fmt}" style="height:52px;padding:0 8px 4px"></div>
      </div>`;
    };

    // ── Currency suffix ────────────────────────────────────────────────────────
    const _cur = c => (c && c !== 'USD') ? ` ${c}` : '';
    const _yr2 = yr => yr ? `'${String(yr).slice(-2)}` : '';

    // ── Clickable chip helper (adds rank onclick when corpQid available) ──────
    const coQid = finData.qid || '';
    const _rankChip = (label, val, color, metric) => {
      if (!val && val !== 0) return '';
      const v = escHtml(String(val));
      const hasClick = !!(coQid && metric);
      const onclick = hasClick ? `onclick="openStatsPanel('${metric}','${escHtml(coQid)}')"` : '';
      const title   = hasClick ? `title="Click to see global ranking"` : '';
      const cursor  = hasClick ? 'cursor:pointer;' : '';
      return `<div ${onclick} ${title} style="${cursor}background:#21262d;border-radius:6px;padding:5px 9px;min-width:0;overflow:hidden;">
        <div style="font-size:0.62rem;color:#6e7681;margin-bottom:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(label)}</div>
        <div style="font-size:0.79rem;color:${color};font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${v}</div>
      </div>`;
    };

    // ── Key numbers chip grid (top) ────────────────────────────────────────────
    const keyChips = [
      finData.revenue   ? _rankChip('Revenue',    fmtRevenue(finData.revenue)    + _cur(finData.revenue_currency)    + ' ' + _yr2(finData.revenue_year),   '#58a6ff', 'corp_revenue')    : '',
      finData.market_cap? _rankChip('Market Cap', fmtRevenue(finData.market_cap) + _cur(finData.market_cap_currency) + ' ' + _yr2(finData.market_cap_year), '#f0a500', 'corp_market_cap') : '',
      finData.net_income? _rankChip('Net Income', fmtRevenue(finData.net_income) + _cur(finData.net_income_currency),                                        '#3fb950', 'corp_net_income') : '',
      finData.employees ? _rankChip('Employees',  fmtEmployees(finData.employees),                                                                           '#79c0ff', 'corp_employees')  : '',
    ].filter(Boolean).join('');

    // ── Profile chip grid ──────────────────────────────────────────────────────
    const ceoDisplay = (() => {
      if (finData.key_people?.length) return finData.key_people.map(p => p.name + (p.role ? ` (${p.role})` : '')).join(' · ');
      return finData.ceo || null;
    })();
    const exchangeVal = (() => {
      const ex = finData.exchange || finData.traded_as || '';
      return ex + (finData.ticker ? ` · ${finData.ticker}` : '');
    })();

    const profileChips = [
      finData.founded      ? _chip('Founded',   finData.founded)              : '',
      finData.company_type ? _chip('Type',      finData.company_type)         : '',
      finData.industry     ? _chip('Industry',  finData.industry,  '#c9d1d9', false, true) : '',
      exchangeVal          ? _chip('Exchange',  exchangeVal,       '#c9d1d9', false, true) : '',
      ceoDisplay           ? _chip('CEO',       ceoDisplay,        '#c9d1d9', false, ceoDisplay.length > 22) : '',
      finData.parent_org   ? _chip('Parent',    finData.parent_org,'#c9d1d9', false, true) : '',
      finData.founders?.length ? _chip('Founders', finData.founders.join(', '), '#c9d1d9', false, true) : '',
      finData.website      ? _chip('Website',
        `<a href="${escAttr(finData.website)}" target="_blank" rel="noopener" style="color:#58a6ff;text-decoration:none" onclick="event.stopPropagation()">${escHtml(finData.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</a>`,
        '#58a6ff', true, true) : '',
      finData.products?.length  ? _chip('Products',    finData.products.slice(0,6).join(', '),          '#c9d1d9', false, true) : '',
      finData.subsidiaries?.length ? _chip('Subsidiaries', finData.subsidiaries.slice(0,5).join(', ') + (finData.subsidiaries.length > 5 ? '…' : ''), '#c9d1d9', false, true) : '',
    ].filter(Boolean).join('');

    // ── Trend sparklines ───────────────────────────────────────────────────────
    const trendRows = [
      _sparkline(finData.revenue_history,          'Revenue',       '#58a6ff', fmtRevenue),
      _sparkline(finData.operating_income_history, 'Operating Inc.','#3fb950', fmtRevenue),
      _sparkline(finData.net_income_history,       'Net Income',    '#3fb950', fmtRevenue),
      _sparkline(finData.total_assets_history,     'Total Assets',  '#bc8cff', fmtRevenue),
      _sparkline(finData.total_equity_history,     'Total Equity',  '#f0a500', fmtRevenue),
      _sparkline(finData.employees_history,        'Employees',     '#79c0ff', fmtEmployees),
    ].filter(Boolean).join('');

    // ── Assemble ───────────────────────────────────────────────────────────────
    const _chipGrid = chips => chips
      ? `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:5px;padding:10px 14px 8px;border-bottom:1px solid #21262d">${chips}</div>`
      : '';
    const finHtml =
      _chipGrid(keyChips) +
      _chipGrid(profileChips) +
      (trendRows ? `<div style="padding-bottom:6px;border-bottom:1px solid #21262d">${trendRows}</div>` : '');

    // Language badge shown when displaying non-English content
    const langBadge = displayLang !== 'en'
      ? `<span style="font-size:0.68rem;background:#21262d;color:#8b949e;border-radius:4px;padding:2px 6px;margin-left:8px;vertical-align:middle">${displayLang}</span>`
      : '';

    // ── Populate Info tab: image + header + chips + sparklines ────────────────
    const infoTabEl = document.getElementById('wiki-tab-info');
    if (infoTabEl) {
      infoTabEl.innerHTML = `
        ${imgHtml}
        <div class="wiki-city-header">
          <div class="wiki-city-name">${escHtml(displayData.title || name)}${langBadge}</div>
          ${(displayData.description || finData.description)
          ? `<div class="wiki-city-desc">${escHtml(displayData.description || finData.description)}</div>`
          : ''}
        </div>
        ${finHtml}
      `;
      // Mount interactive financial trend charts into their placeholders
      infoTabEl.querySelectorAll('[data-iyc-pts]').forEach(el => {
        try {
          const pts   = JSON.parse(el.dataset.iycPts).map(([t, v]) => ({ t, v }));
          const color = el.dataset.iycColor || '#58a6ff';
          const fmt   = el.dataset.iycFmt === 'emp' ? fmtEmployees : fmtRevenue;
          _IYChart(el, pts, {
            color, height: 52, isTimestamp: false, autoColor: false,
            yFmt: fmt, xFmt: t => String(t),
          });
        } catch (_) {}
      });
    }

    // ── Finance tab: full Yahoo Finance data ──────────────────────────────────
    const _finTabEl  = document.getElementById('wiki-tab-finance');
    const _finBtnEl2 = document.getElementById('wiki-tab-finance-btn');
    if (finData.ticker && _finTabEl && _finBtnEl2) {
      _finBtnEl2.style.display = '';
      _renderFinanceTab(finData, _finTabEl);
    }

    // ── Populate Overview tab: Wikipedia extract ───────────────────────────────
    const overTabEl = document.getElementById('wiki-tab-overview');
    if (overTabEl) overTabEl.innerHTML = extract ? `
      <div class="wiki-extract-wrap">
        <div class="wiki-extract-head">Overview</div>
        <div class="wiki-extract collapsed" id="wiki-extract-text">${escHtml(extract)}</div>
        <button class="wiki-expand-btn" id="wiki-expand-btn" onclick="toggleExtract()">Show more</button>
      </div>` : '<div style="padding:16px;color:#6e7681;font-size:0.82rem">No Wikipedia overview available.</div>';

    // Footer: show local link first if used, then English
    const svgIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#58a6ff" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
    const enLink  = `<a class="wiki-footer-link" href="${escAttr(wikiUrl)}" target="_blank" rel="noopener">${svgIcon} Wikipedia (EN)</a>`;
    const locLink = localWikiUrl && displayLang !== 'en'
      ? `<a class="wiki-footer-link" href="${escAttr(localWikiUrl)}" target="_blank" rel="noopener">${svgIcon} Wikipedia (${displayLang.toUpperCase()})</a>`
      : '';
    const yfLink  = finData.ticker
      ? `<a class="wiki-footer-link" href="https://finance.yahoo.com/quote/${encodeURIComponent(finData.ticker)}" target="_blank" rel="noopener">${svgIcon} Yahoo Finance (${escHtml(finData.ticker)})</a>`
      : '';
    footer.innerHTML = `<div style="display:flex;gap:4px;flex-wrap:wrap">${locLink}${enLink}${yfLink}</div>`;

  } catch (e) {
    const _errEl = document.getElementById('wiki-tab-info');
    if (_errEl) _errEl.innerHTML = `<div class="wiki-error">Could not load Wikipedia article.<br/><a href="${escAttr(wikiUrl)}" target="_blank" rel="noopener">Open Wikipedia directly ↗</a></div>`;
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