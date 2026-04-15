#!/usr/bin/env node
/**
 * scripts/fetch-imf.js
 *
 * Fetches fiscal data for 190+ countries from the IMF DataMapper API
 * (free, no API key required).
 *
 * Indicators fetched:
 *   GGXWDG_NGDP  — General government gross debt (% of GDP)
 *   GGXCNL_NGDP  — Fiscal balance: net lending/borrowing (% of GDP)
 *                   positive = surplus, negative = deficit
 *   GGR_NGDP     — General government revenue (% of GDP)
 *   GGX_NGDP     — General government total expenditure (% of GDP)
 *
 * Output: public/imf-fiscal.json
 *   {
 *     "US": {
 *       "govt_debt_gdp": 122.1,    "govt_debt_gdp_year": 2024,
 *       "fiscal_balance_gdp": -6.3, "fiscal_balance_gdp_year": 2024,
 *       "govt_revenue_gdp": 33.2,  "govt_revenue_gdp_year": 2024,
 *       "govt_expenditure_gdp": 39.5, "govt_expenditure_gdp_year": 2024
 *     }, ...
 *   }
 *
 * Usage:
 *   npm run fetch-imf
 *
 * Typical runtime: ~15 seconds (4 API calls, no pagination).
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const OUT_FILE      = path.join(__dirname, '..', 'public', 'country-data.json');
const IMF_KEYS = ['govt_debt_gdp','govt_debt_gdp_year','govt_debt_gdp_history',
                  'fiscal_balance_gdp','fiscal_balance_gdp_year','fiscal_balance_gdp_history',
                  'govt_revenue_gdp','govt_revenue_gdp_year','govt_revenue_gdp_history',
                  'govt_expenditure_gdp','govt_expenditure_gdp_year','govt_expenditure_gdp_history'];
const DELAY_MS = 1000;

// ── IMF DataMapper indicator code → output field name ─────────────────────────
// Only codes confirmed to exist in the DataMapper API are included.
// Revenue/expenditure (GGR_NGDP, GGX_NGDP) are WEO-only and not exposed here.
const INDICATORS = [
  { code: 'GGXWDG_NGDP', key: 'govt_debt_gdp',      label: 'Government gross debt (% GDP)' },
  { code: 'GGXCNL_NGDP', key: 'fiscal_balance_gdp', label: 'Fiscal balance (% GDP, + = surplus)' },
  { code: 'PCPIPCH',      key: 'cpi_inflation',      label: 'CPI Inflation rate (% change)' },
  { code: 'LUR',          key: 'unemployment_rate',  label: 'Unemployment rate (%)' },
];

// ── IMF 3-letter country code → ISO 3166-1 alpha-2 ───────────────────────────
// IMF uses mostly ISO3 alpha-3, but with some deviations for territories.
// This covers ~190 sovereign states; aggregates (WLD, G20, etc.) are excluded.
const IMF_TO_ISO2 = {
  AFG:'AF', ALB:'AL', DZA:'DZ', AND:'AD', AGO:'AO', ATG:'AG', ARG:'AR',
  ARM:'AM', ABW:'AW', AUS:'AU', AUT:'AT', AZE:'AZ', BHS:'BS', BHR:'BH',
  BGD:'BD', BRB:'BB', BLR:'BY', BEL:'BE', BLZ:'BZ', BEN:'BJ', BTN:'BT',
  BOL:'BO', BIH:'BA', BWA:'BW', BRA:'BR', BRN:'BN', BGR:'BG', BFA:'BF',
  BDI:'BI', CPV:'CV', KHM:'KH', CMR:'CM', CAN:'CA', CAF:'CF', TCD:'TD',
  CHL:'CL', CHN:'CN', COL:'CO', COM:'KM', COD:'CD', COG:'CG', CRI:'CR',
  CIV:'CI', HRV:'HR', CUB:'CU', CYP:'CY', CZE:'CZ', DNK:'DK', DJI:'DJ',
  DMA:'DM', DOM:'DO', ECU:'EC', EGY:'EG', SLV:'SV', GNQ:'GQ', ERI:'ER',
  EST:'EE', SWZ:'SZ', ETH:'ET', FJI:'FJ', FIN:'FI', FRA:'FR', GAB:'GA',
  GMB:'GM', GEO:'GE', DEU:'DE', GHA:'GH', GRC:'GR', GRD:'GD', GTM:'GT',
  GIN:'GN', GNB:'GW', GUY:'GY', HTI:'HT', HND:'HN', HKG:'HK', HUN:'HU',
  ISL:'IS', IND:'IN', IDN:'ID', IRN:'IR', IRQ:'IQ', IRL:'IE', ISR:'IL',
  ITA:'IT', JAM:'JM', JPN:'JP', JOR:'JO', KAZ:'KZ', KEN:'KE', KIR:'KI',
  PRK:'KP', KOR:'KR', XKX:'XK', KWT:'KW', KGZ:'KG', LAO:'LA', LVA:'LV',
  LBN:'LB', LSO:'LS', LBR:'LR', LBY:'LY', LIE:'LI', LTU:'LT', LUX:'LU',
  MDG:'MG', MWI:'MW', MYS:'MY', MDV:'MV', MLI:'ML', MLT:'MT', MHL:'MH',
  MRT:'MR', MUS:'MU', MEX:'MX', FSM:'FM', MDA:'MD', MCO:'MC', MNG:'MN',
  MNE:'ME', MAR:'MA', MOZ:'MZ', MMR:'MM', NAM:'NA', NRU:'NR', NPL:'NP',
  NLD:'NL', NZL:'NZ', NIC:'NI', NER:'NE', NGA:'NG', MKD:'MK', NOR:'NO',
  OMN:'OM', PAK:'PK', PLW:'PW', PAN:'PA', PNG:'PG', PRY:'PY', PER:'PE',
  PHL:'PH', POL:'PL', PRT:'PT', QAT:'QA', ROU:'RO', RUS:'RU', RWA:'RW',
  KNA:'KN', LCA:'LC', VCT:'VC', WSM:'WS', SMR:'SM', STP:'ST', SAU:'SA',
  SEN:'SN', SRB:'RS', SYC:'SC', SLE:'SL', SGP:'SG', SVK:'SK', SVN:'SI',
  SLB:'SB', SOM:'SO', ZAF:'ZA', SSD:'SS', ESP:'ES', LKA:'LK', SDN:'SD',
  SUR:'SR', SWE:'SE', CHE:'CH', SYR:'SY', TWN:'TW', TJK:'TJ', TZA:'TZ',
  THA:'TH', TLS:'TL', TGO:'TG', TON:'TO', TTO:'TT', TUN:'TN', TUR:'TR',
  TKM:'TM', TUV:'TV', UGA:'UG', UKR:'UA', ARE:'AE', GBR:'GB', USA:'US',
  URY:'UY', UZB:'UZ', VUT:'VU', VEN:'VE', VNM:'VN', YEM:'YE', ZMB:'ZM',
  ZWE:'ZW',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function imfFetch(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'WorldDataMap/1.0 (educational; nodejs)' },
    signal:  AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Pick the most recent non-null value at or before the current year.
// The IMF WEO includes projections (e.g. 2025–2030) — we prefer actuals.
const CURRENT_YEAR = new Date().getFullYear();
function pickBest(yearMap) {
  if (!yearMap || typeof yearMap !== 'object') return null;
  // First try: most recent actual year (≤ current year)
  const actualYears = Object.keys(yearMap)
    .map(Number).filter(y => y <= CURRENT_YEAR).sort().reverse();
  for (const yr of actualYears) {
    const v = yearMap[String(yr)];
    if (v != null && isFinite(v)) return { value: parseFloat(v.toFixed(3)), year: yr };
  }
  // Fallback: nearest future projection if no actuals found
  const futureYears = Object.keys(yearMap)
    .map(Number).filter(y => y > CURRENT_YEAR).sort();
  for (const yr of futureYears) {
    const v = yearMap[String(yr)];
    if (v != null && isFinite(v)) return { value: parseFloat(v.toFixed(3)), year: yr };
  }
  return null;
}

function extractHistory(yearMap) {
  if (!yearMap || typeof yearMap !== 'object') return [];
  return Object.entries(yearMap)
    .map(([yr, v]) => [Number(yr), v])
    .filter(([yr, v]) => yr <= CURRENT_YEAR && v != null && isFinite(Number(v)))
    .sort((a, b) => a[0] - b[0])
    .map(([yr, v]) => [yr, parseFloat(Number(v).toFixed(3))]);
}

// ── Fetch one IMF indicator for all countries ─────────────────────────────────
async function fetchIndicator(code) {
  // The DataMapper API returns all countries and all years in one response
  const url = `https://www.imf.org/external/datamapper/api/v1/${code}`;
  process.stdout.write(`  ${code.padEnd(16)} … `);
  try {
    const json = await imfFetch(url);
    // Response structure: { values: { [code]: { [imf3]: { [year]: value } } } }
    const data = json?.values?.[code];
    if (!data) { console.log('no data in response'); return {}; }
    console.log(`${Object.keys(data).length} country entries`);
    return data;
  } catch (e) {
    console.log(`ERROR: ${e.message}`);
    return {};
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║   IMF Fiscal Data Fetcher                             ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log(`Indicators : ${INDICATORS.length}`);
  console.log(`Output     : ${OUT_FILE}\n`);

  // Load existing country-data.json so we only update IMF keys
  let base = {};
  try { base = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8')); } catch { /* start fresh */ }
  const out = base;
  // Clear previous IMF keys to avoid stale data
  for (const iso of Object.keys(out)) {
    for (const k of IMF_KEYS) delete out[iso][k];
  }

  console.log('Fetching indicators:\n');
  for (const { code, key, label } of INDICATORS) {
    const data = await fetchIndicator(code);

    for (const [imf3, yearMap] of Object.entries(data)) {
      const iso2 = IMF_TO_ISO2[imf3];
      if (!iso2) continue;  // skip aggregates / unknown codes

      const best = pickBest(yearMap);
      if (!best) continue;

      if (!out[iso2]) out[iso2] = {};
      out[iso2][key]               = best.value;
      out[iso2][key + '_year']     = best.year;
      out[iso2][key + '_history']  = extractHistory(yearMap);
    }

    await sleep(DELAY_MS);
  }

  // ── Summary ──
  const countries = Object.keys(out).sort();
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), 'utf8');
  const sizeKB = (fs.statSync(OUT_FILE).size / 1024).toFixed(1);

  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║   Complete                                            ║');
  console.log('╠═══════════════════════════════════════════════════════╣');
  console.log(`  Countries saved : ${countries.length}`);
  console.log(`  File size       : ${sizeKB} KB`);
  console.log('  ── coverage ──────────────────────────────────────────');
  for (const { key, label } of INDICATORS) {
    const n   = countries.filter(iso => out[iso][key] != null).length;
    const pct = ((n / countries.length) * 100).toFixed(0);
    console.log(`  ${key.padEnd(22)} : ${String(n).padStart(4)} countries  (${pct}%)  — ${label}`);
  }
  console.log('╚═══════════════════════════════════════════════════════╝');
}

main().catch(err => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
