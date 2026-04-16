#!/usr/bin/env node
/**
 * scripts/fetch-fred.js
 *
 * Fetches 10-year government bond yields for ~33 countries from the
 * St. Louis Fed FRED API (free, requires API key).
 *
 * Source: OECD long-term interest rates series (IRLTLT01{ISO3}M156N)
 * Frequency: monthly, % per annum
 * History: 5 years of monthly observations per country
 *
 * Output: public/fred-yields.json
 *   { "US": { yield_10y, yield_10y_date, yield_history: [["YYYY-MM", val], ...] } }
 *
 * Usage:
 *   npm run fetch-fred
 *
 * Requires FRED_API_KEY in .env  (get one free at fred.stlouisfed.org)
 */

'use strict';

require('dotenv').config();
const fs   = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');

const API_KEY = process.env.FRED_API_KEY;
if (!API_KEY) {
  console.error('ERROR: FRED_API_KEY is not set in .env');
  console.error('Get a free key at: https://fred.stlouisfed.org/docs/api/api_key.html');
  process.exit(1);
}

const OUT_FILE   = path.join(__dirname, '..', 'public', 'country-data.json');
const FRED_KEYS  = ['bond_yield_10y','bond_yield_10y_date','bond_yield_10y_history'];
const DELAY_MS   = 350;   // stay well under FRED's 120 req/min rate limit

// ── FRED series → ISO-2 mapping ───────────────────────────────────────────────
// All use OECD long-term interest rate series: IRLTLT01{3LETTER}M156N
// "156N" = percent per annum, monthly, not seasonally adjusted
const SERIES = [
  { id: 'IRLTLT01USM156N', iso2: 'US', name: 'United States' },
  { id: 'IRLTLT01GBM156N', iso2: 'GB', name: 'United Kingdom' },
  { id: 'IRLTLT01DEM156N', iso2: 'DE', name: 'Germany' },
  { id: 'IRLTLT01FRM156N', iso2: 'FR', name: 'France' },
  { id: 'IRLTLT01ITM156N', iso2: 'IT', name: 'Italy' },
  { id: 'IRLTLT01ESM156N', iso2: 'ES', name: 'Spain' },
  { id: 'IRLTLT01PTM156N', iso2: 'PT', name: 'Portugal' },
  { id: 'IRLTLT01GRM156N', iso2: 'GR', name: 'Greece' },
  { id: 'IRLTLT01NLM156N', iso2: 'NL', name: 'Netherlands' },
  { id: 'IRLTLT01BEM156N', iso2: 'BE', name: 'Belgium' },
  { id: 'IRLTLT01ATM156N', iso2: 'AT', name: 'Austria' },
  { id: 'IRLTLT01IEM156N', iso2: 'IE', name: 'Ireland' },
  { id: 'IRLTLT01FIM156N', iso2: 'FI', name: 'Finland' },
  { id: 'IRLTLT01SEM156N', iso2: 'SE', name: 'Sweden' },
  { id: 'IRLTLT01DKM156N', iso2: 'DK', name: 'Denmark' },
  { id: 'IRLTLT01NOM156N', iso2: 'NO', name: 'Norway' },
  { id: 'IRLTLT01CHM156N', iso2: 'CH', name: 'Switzerland' },
  { id: 'IRLTLT01PLM156N', iso2: 'PL', name: 'Poland' },
  { id: 'IRLTLT01CZM156N', iso2: 'CZ', name: 'Czech Republic' },
  { id: 'IRLTLT01HUM156N', iso2: 'HU', name: 'Hungary' },
  { id: 'IRLTLT01JPM156N', iso2: 'JP', name: 'Japan' },
  { id: 'IRLTLT01KRM156N', iso2: 'KR', name: 'South Korea' },
  { id: 'IRLTLT01AUM156N', iso2: 'AU', name: 'Australia' },
  { id: 'IRLTLT01NZM156N', iso2: 'NZ', name: 'New Zealand' },
  { id: 'IRLTLT01CAM156N', iso2: 'CA', name: 'Canada' },
  { id: 'IRLTLT01MXM156N', iso2: 'MX', name: 'Mexico' },
  { id: 'IRLTLT01BRM156N', iso2: 'BR', name: 'Brazil' },
  { id: 'IRLTLT01INM156N', iso2: 'IN', name: 'India' },
  { id: 'IRLTLT01IDM156N', iso2: 'ID', name: 'Indonesia' },
  { id: 'IRLTLT01ZAM156N', iso2: 'ZA', name: 'South Africa' },
  { id: 'IRLTLT01TRM156N', iso2: 'TR', name: 'Turkey' },
  { id: 'IRLTLT01CNM156N', iso2: 'CN', name: 'China' },
  { id: 'IRLTLT01RUM156N', iso2: 'RU', name: 'Russia' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fredFetch(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'WorldDataMap/1.0 (educational; nodejs)' },
    signal:  AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Return 5 years of monthly observations for a FRED series
async function fetchObservations(seriesId) {
  const fiveYearsAgo = new Date();
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
  const obsStart = fiveYearsAgo.toISOString().slice(0, 10);

  const url = 'https://api.stlouisfed.org/fred/series/observations' +
    `?series_id=${encodeURIComponent(seriesId)}` +
    `&api_key=${API_KEY}` +
    `&file_type=json` +
    `&observation_start=${obsStart}` +
    `&frequency=m` +
    `&sort_order=asc`;

  const json = await fredFetch(url);
  return json.observations || [];
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║   FRED 10-Year Bond Yield Fetcher                     ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log(`Series  : ${SERIES.length} countries`);
  console.log(`Output  : ${OUT_FILE}\n`);

  // Load existing file so we can merge (keeps countries we don't re-fetch)
  let out = {};
  try { out = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8')); } catch { /* start fresh */ }

  let fetched = 0, skipped = 0, errored = 0;
  const updatedCountries = new Set();

  for (const { id, iso2, name } of SERIES) {
    process.stdout.write(`  ${iso2.padEnd(3)} ${name.padEnd(22)} ${id} … `);
    try {
      const obs = await fetchObservations(id);
      // FRED uses '.' for missing values
      const valid = obs.filter(o => o.value !== '.' && o.value.trim() !== '');

      if (!valid.length) {
        console.log('no data available');
        skipped++;
        await sleep(DELAY_MS);
        continue;
      }

      const latest = valid[valid.length - 1];
      const latestVal = parseFloat(parseFloat(latest.value).toFixed(3));
      const history   = valid.map(o => [
        o.date.slice(0, 7),
        parseFloat(parseFloat(o.value).toFixed(3)),
      ]);

      if (!out[iso2]) out[iso2] = {};
      out[iso2].bond_yield_10y         = latestVal;
      out[iso2].bond_yield_10y_date    = latest.date.slice(0, 7);
      out[iso2].bond_yield_10y_history = history;
      updatedCountries.add(iso2);

      console.log(`${latestVal.toFixed(2)}%  (${latest.date.slice(0, 7)}, ${valid.length} obs)`);
      fetched++;
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
      errored++;
    }

    await sleep(DELAY_MS);
  }

  // Only clear stale FRED keys from countries in SERIES that failed to refresh
  const seriesIsos = new Set(SERIES.map(s => s.iso2));
  for (const iso of Object.keys(out)) {
    if (!seriesIsos.has(iso)) continue;
    if (updatedCountries.has(iso)) continue;
    for (const k of FRED_KEYS) delete out[iso]?.[k];
  }

  atomicWrite(OUT_FILE, JSON.stringify(out, null, 2), 'utf8');
  const sizeKB = (fs.statSync(OUT_FILE).size / 1024).toFixed(1);

  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║   Complete                                            ║');
  console.log('╠═══════════════════════════════════════════════════════╣');
  console.log(`  Fetched  : ${fetched} countries`);
  console.log(`  No data  : ${skipped} countries`);
  console.log(`  Errors   : ${errored}`);
  console.log(`  File     : ${sizeKB} KB → ${OUT_FILE}`);
  console.log('╚═══════════════════════════════════════════════════════╝');
}

main().catch(err => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
