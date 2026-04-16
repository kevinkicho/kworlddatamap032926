#!/usr/bin/env node
/**
 * scripts/fetch-oecd-extended.js
 *
 * Extends public/oecd-country.json with 2 new fields:
 *
 *   pisa_reading       — PISA reading score for 15-year-olds (latest available)
 *   pisa_reading_year
 *   min_wage_usd_ppp   — Real minimum wage in USD PPP per hour (latest available)
 *   min_wage_year
 *
 * Reads the existing file, merges new fields in, and writes back.
 * Existing fields are NOT removed.
 *
 * Data sources (all free, no API key required):
 *   - World Bank Open Data API   https://api.worldbank.org/v2/
 *     Indicator LO.PISA.REA — PISA reading score proxy
 *   - OECD SDMX-JSON API        https://stats.oecd.org/SDMX-JSON/
 *     Dataset RMW — real minimum wages (USD PPP per hour)
 *   - Hardcoded fallback tables  for both fields from 2022 PISA report /
 *     OECD 2023 minimum wage data (used if API calls fail)
 *
 * Usage:   node scripts/fetch-oecd-extended.js
 * Runtime: ~30–60 seconds
 */
'use strict';
const fs   = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');

const OUT_FILE = path.join(__dirname, '..', 'public', 'oecd-country.json');
const DELAY_MS = 1000;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function apiFetch(url, headers = {}) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'WorldDataMap-OECDFetcher/1.0 (educational; nodejs)',
      ...headers,
    },
    signal: AbortSignal.timeout(40_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

// ── World Bank indicator fetch ────────────────────────────────────────────────
// Returns { [iso2]: { value, year } } for the most recent available year.
async function fetchWorldBank(indicatorId, label) {
  process.stdout.write(`  WB ${indicatorId.padEnd(26)} ${label} … `);
  const BASE = `https://api.worldbank.org/v2/country/all/indicator/${indicatorId}` +
               `?format=json&mrv=8&per_page=1000`;
  const best = {};
  let page = 1, totalPages = 1;
  try {
    do {
      const url  = BASE + (page > 1 ? `&page=${page}` : '');
      const json = await apiFetch(url);
      totalPages = json[0]?.pages ?? 1;
      for (const row of json[1] ?? []) {
        const iso2 = row.country?.id?.toUpperCase();
        if (!iso2 || row.value == null) continue;
        if (!best[iso2] || row.date > best[iso2].year) {
          best[iso2] = { value: row.value, year: parseInt(row.date, 10) };
        }
      }
      page++;
      if (page <= totalPages) await sleep(400);
    } while (page <= totalPages);
  } catch (e) {
    console.log(`ERROR: ${e.message} — skipping`);
    return {};
  }
  console.log(`${Object.keys(best).length} countries`);
  return best;
}

// ── OECD RMW: real minimum wages (USD PPP per hour) ──────────────────────────
// SDMX-JSON v2.0 from stats.oecd.org
// Dataset: RMW  — Real Minimum Wages
// We want: SERIES=CPINDEX (constant prices, base year = current), UNIT=HOURLY
async function fetchOecdMinWage() {
  process.stdout.write('  OECD RMW                     Real minimum wage USD PPP/hr … ');
  // Ask for all countries, all series, filter to hourly + USD PPP in code
  const url = 'https://stats.oecd.org/SDMX-JSON/data/RMW/all/OECD' +
              '?startTime=2018&endTime=2024&contentType=json';
  const best = {};
  try {
    const json   = await apiFetch(url);
    const data   = json.data;
    const struct = data.structures?.[0];
    const seriesDims = struct?.dimensions?.series ?? [];
    const obsDims    = struct?.dimensions?.observation ?? [];

    const refAreaDim  = seriesDims.find(d => d.id === 'REF_AREA');
    const unitDim     = seriesDims.find(d => d.id === 'UNIT');
    const payDim      = seriesDims.find(d => d.id === 'PAY_PERIOD');
    const timeDim     = obsDims.find(d => d.id === 'TIME_PERIOD');

    if (!refAreaDim || !timeDim) throw new Error('Unexpected RMW structure');

    // We want UNIT containing USD PPP (e.g. "CPINDEX" series in USD PPP terms)
    // and PAY_PERIOD = HOURLY where available.
    // Log dimension values to help debug on first run.
    const unitVals    = unitDim?.values?.map(v => v.id) ?? [];
    const payVals     = payDim?.values?.map(v => v.id) ?? [];

    // Prefer USD_PPP hourly. Accept any USD-PPP series as fallback.
    const hourlyIdx   = payDim?.values?.findIndex(v =>
      v.id === 'HOURLY' || v.id === 'H' || v.id === 'HR'
    ) ?? -1;
    const usdPppIdx   = unitDim?.values?.findIndex(v =>
      v.id === 'CPINDEX' || v.id === 'USD_PPP' || v.id?.includes('USD') || v.id?.includes('PPP')
    ) ?? -1;

    const ds     = data.dataSets?.[0];
    const series = ds?.series ?? {};

    for (const [key, s] of Object.entries(series)) {
      const parts = key.split(':');

      // Filter to hourly pay period if dimension exists
      if (hourlyIdx >= 0 && payDim) {
        const payPos = seriesDims.indexOf(payDim);
        if (payPos >= 0 && Number(parts[payPos]) !== hourlyIdx) continue;
      }
      // Filter to USD PPP unit if dimension exists
      if (usdPppIdx >= 0 && unitDim) {
        const unitPos = seriesDims.indexOf(unitDim);
        if (unitPos >= 0 && Number(parts[unitPos]) !== usdPppIdx) continue;
      }

      const iso2 = refAreaDim.values[Number(parts[0])]?.id?.toUpperCase();
      if (!iso2 || iso2.length !== 2) continue;  // skip aggregates

      const obs = s.observations ?? {};
      let bestVal = null, bestYear = 0;
      for (const [obsIdx, obsArr] of Object.entries(obs)) {
        const val = obsArr?.[0];
        if (val == null) continue;
        const yr = parseInt(timeDim.values[Number(obsIdx)]?.id ?? '0', 10);
        if (yr > bestYear) { bestYear = yr; bestVal = val; }
      }
      if (bestVal == null) continue;

      if (!best[iso2] || bestYear > best[iso2].year) {
        best[iso2] = { value: parseFloat(bestVal.toFixed(2)), year: bestYear };
      }
    }
  } catch (e) {
    console.log(`ERROR: ${e.message} — falling back to hardcoded table`);
    return null;  // null signals caller to use fallback
  }
  const count = Object.keys(best).length;
  console.log(`${count} countries`);
  return count > 0 ? best : null;
}

// ── Hardcoded PISA reading fallback (2022 PISA report, reading domain) ───────
// Scores are the mean reading performance for 15-year-olds.
// Source: OECD PISA 2022 Results Volume I, Table I.B1.2
// Note: 2022 PISA showed broad drops post-COVID vs 2018; 2018 data also included
// where 2022 is not available.
function getPisaFallback() {
  // { iso2: { value, year } }  — 2022 unless noted
  return {
    SG: { value: 543, year: 2022 },  // Singapore
    IE: { value: 516, year: 2022 },  // Ireland
    JP: { value: 516, year: 2022 },  // Japan
    KR: { value: 515, year: 2022 },  // Korea
    TW: { value: 515, year: 2022 },  // Chinese Taipei
    EE: { value: 511, year: 2022 },  // Estonia
    CA: { value: 507, year: 2022 },  // Canada
    FI: { value: 490, year: 2022 },  // Finland (drop from ~520 in 2018)
    HK: { value: 524, year: 2022 },  // Hong Kong
    AU: { value: 498, year: 2022 },  // Australia
    NZ: { value: 501, year: 2022 },  // New Zealand
    GB: { value: 494, year: 2022 },  // UK
    US: { value: 505, year: 2022 },  // United States
    DE: { value: 480, year: 2022 },  // Germany
    AT: { value: 480, year: 2022 },  // Austria
    BE: { value: 489, year: 2022 },  // Belgium (avg Flemish+French)
    CZ: { value: 489, year: 2022 },  // Czech Republic
    DK: { value: 489, year: 2022 },  // Denmark
    NL: { value: 459, year: 2022 },  // Netherlands
    NO: { value: 477, year: 2022 },  // Norway
    SE: { value: 487, year: 2022 },  // Sweden
    CH: { value: 483, year: 2022 },  // Switzerland
    FR: { value: 474, year: 2022 },  // France
    PT: { value: 477, year: 2022 },  // Portugal
    ES: { value: 474, year: 2022 },  // Spain
    IT: { value: 482, year: 2022 },  // Italy
    PL: { value: 489, year: 2022 },  // Poland
    LV: { value: 475, year: 2022 },  // Latvia
    LT: { value: 476, year: 2022 },  // Lithuania
    HU: { value: 473, year: 2022 },  // Hungary
    SK: { value: 451, year: 2022 },  // Slovakia
    SI: { value: 479, year: 2022 },  // Slovenia
    HR: { value: 479, year: 2022 },  // Croatia
    GR: { value: 441, year: 2022 },  // Greece
    RO: { value: 428, year: 2022 },  // Romania
    BG: { value: 415, year: 2022 },  // Bulgaria
    MT: { value: 448, year: 2022 },  // Malta
    LU: { value: 480, year: 2022 },  // Luxembourg
    IS: { value: 458, year: 2022 },  // Iceland
    IL: { value: 474, year: 2022 },  // Israel
    TR: { value: 476, year: 2022 },  // Turkey
    MX: { value: 415, year: 2022 },  // Mexico
    CL: { value: 448, year: 2022 },  // Chile
    CO: { value: 409, year: 2022 },  // Colombia
    BR: { value: 410, year: 2022 },  // Brazil
    AR: { value: 401, year: 2022 },  // Argentina
    PE: { value: 408, year: 2022 },  // Peru
    UY: { value: 428, year: 2022 },  // Uruguay
    CR: { value: 415, year: 2022 },  // Costa Rica
    PH: { value: 347, year: 2022 },  // Philippines
    MY: { value: 388, year: 2022 },  // Malaysia
    TH: { value: 379, year: 2022 },  // Thailand
    VN: { value: 462, year: 2018 },  // Vietnam (not in 2022)
    ID: { value: 359, year: 2022 },  // Indonesia
    KZ: { value: 386, year: 2022 },  // Kazakhstan
    GE: { value: 384, year: 2022 },  // Georgia
    RS: { value: 440, year: 2022 },  // Serbia
    MK: { value: 380, year: 2022 },  // North Macedonia
    AL: { value: 358, year: 2022 },  // Albania
    MN: { value: 415, year: 2022 },  // Mongolia
    SA: { value: 399, year: 2022 },  // Saudi Arabia
    JO: { value: 360, year: 2022 },  // Jordan
    MA: { value: 359, year: 2022 },  // Morocco
    EG: { value: 389, year: 2022 },  // Egypt
    UA: { value: 440, year: 2022 },  // Ukraine
    AZ: { value: 374, year: 2022 },  // Azerbaijan
    QA: { value: 389, year: 2022 },  // Qatar
    BH: { value: 387, year: 2022 },  // Bahrain
    KW: { value: 348, year: 2022 },  // Kuwait
    // Additional 2018 participants not in 2022
    CN: { value: 555, year: 2018 },  // China (selected provinces)
    RU: { value: 479, year: 2018 },  // Russia
  };
}

// ── Hardcoded minimum wage fallback (OECD 2023 data, USD PPP per hour) ────────
// Source: OECD Real Minimum Wages dataset (RM W), 2022–2023 values
// Converted to USD PPP per hour at 2023 purchasing power parities.
function getMinWageFallback() {
  return {
    AU: { value: 16.15, year: 2023 },   // Australia
    BE: { value: 14.80, year: 2023 },   // Belgium
    CA: { value: 13.22, year: 2023 },   // Canada
    CL: { value:  3.96, year: 2023 },   // Chile
    CO: { value:  3.34, year: 2023 },   // Colombia
    CR: { value:  4.44, year: 2022 },   // Costa Rica
    CZ: { value:  8.41, year: 2023 },   // Czech Republic
    DE: { value: 14.03, year: 2023 },   // Germany
    EE: { value: 10.19, year: 2023 },   // Estonia
    ES: { value: 11.39, year: 2023 },   // Spain
    FR: { value: 13.77, year: 2023 },   // France
    GB: { value: 14.41, year: 2023 },   // UK
    GR: { value:  7.72, year: 2023 },   // Greece
    HU: { value:  7.81, year: 2023 },   // Hungary
    IE: { value: 14.63, year: 2023 },   // Ireland
    IL: { value: 10.23, year: 2023 },   // Israel
    IS: { value: 16.44, year: 2022 },   // Iceland
    JP: { value:  9.29, year: 2023 },   // Japan
    KR: { value:  9.41, year: 2023 },   // Korea
    LT: { value:  9.49, year: 2023 },   // Lithuania
    LU: { value: 19.10, year: 2023 },   // Luxembourg
    LV: { value:  9.61, year: 2023 },   // Latvia
    MX: { value:  4.52, year: 2023 },   // Mexico
    NL: { value: 14.58, year: 2023 },   // Netherlands
    NZ: { value: 15.11, year: 2023 },   // New Zealand
    PL: { value: 10.46, year: 2023 },   // Poland
    PT: { value: 10.38, year: 2023 },   // Portugal
    RO: { value:  6.94, year: 2023 },   // Romania
    SI: { value: 11.01, year: 2023 },   // Slovenia
    SK: { value:  9.35, year: 2023 },   // Slovakia
    TR: { value:  4.61, year: 2023 },   // Turkey
    US: { value: 10.42, year: 2023 },   // United States (federal)
    BR: { value:  5.02, year: 2023 },   // Brazil
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  OECD-country extended indicator fetcher                         ║');
  console.log('║  Fields: pisa_reading · min_wage_usd_ppp                         ║');
  console.log('║  Sources: World Bank · OECD SDMX-JSON · hardcoded fallback       ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  // ── Read existing file ───────────────────────────────────────────────────────
  process.stdout.write('Reading existing oecd-country.json … ');
  const existing = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
  console.log(`${Object.keys(existing).length} entries`);

  // ── Fetch PISA reading via World Bank proxy ──────────────────────────────────
  console.log('\n── Fetching indicators ─────────────────────────────────────────────');

  let pisaData = await fetchWorldBank('LO.PISA.REA', 'PISA reading score');
  await sleep(DELAY_MS);

  // If World Bank returned very few countries, supplement with fallback
  const pisaFallback = getPisaFallback();
  const pisaFromFallback = (Object.keys(pisaData).length < 20);
  if (pisaFromFallback) {
    console.log(`  WB PISA returned only ${Object.keys(pisaData).length} entries — using hardcoded fallback`);
    pisaData = pisaFallback;
  } else {
    // Merge fallback for countries missing from WB result
    let added = 0;
    for (const [iso2, rec] of Object.entries(pisaFallback)) {
      if (!pisaData[iso2]) { pisaData[iso2] = rec; added++; }
    }
    if (added) console.log(`  Supplemented WB PISA with ${added} hardcoded entries`);
  }

  // ── Fetch min wage via OECD SDMX ────────────────────────────────────────────
  let minWageData = await fetchOecdMinWage();
  await sleep(DELAY_MS);

  if (!minWageData) {
    console.log('  Using hardcoded minimum wage fallback table');
    minWageData = getMinWageFallback();
  } else {
    // Supplement OECD data with fallback for countries not in API response
    const mwFallback = getMinWageFallback();
    let added = 0;
    for (const [iso2, rec] of Object.entries(mwFallback)) {
      if (!minWageData[iso2]) { minWageData[iso2] = rec; added++; }
    }
    if (added) console.log(`  Supplemented OECD min wage with ${added} hardcoded entries`);
  }

  // ── Merge into existing data ─────────────────────────────────────────────────
  console.log('\n── Merging data ─────────────────────────────────────────────────────');

  const out = JSON.parse(JSON.stringify(existing));  // deep copy
  let counters = { pisa: 0, minWage: 0, newEntries: 0 };

  // Collect all ISO-2 codes from new data
  const allNew = new Set([...Object.keys(pisaData), ...Object.keys(minWageData)]);

  for (const iso2 of allNew) {
    if (!out[iso2]) { out[iso2] = {}; counters.newEntries++; }

    if (pisaData[iso2]) {
      out[iso2].pisa_reading      = Math.round(pisaData[iso2].value);
      out[iso2].pisa_reading_year = pisaData[iso2].year;
      counters.pisa++;
    }
    if (minWageData[iso2]) {
      out[iso2].min_wage_usd_ppp  = parseFloat(minWageData[iso2].value.toFixed(2));
      out[iso2].min_wage_year     = minWageData[iso2].year;
      counters.minWage++;
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log(`  pisa_reading    → ${counters.pisa} countries`);
  console.log(`  min_wage_usd_ppp → ${counters.minWage} countries`);
  if (counters.newEntries) {
    console.log(`  new entries     → ${counters.newEntries} countries (no prior data)`);
  }
  console.log(`  total entries   → ${Object.keys(out).length} countries`);

  // ── Write output ─────────────────────────────────────────────────────────────
  // Sort keys to keep file deterministic (same order as original: alphabetical)
  const sorted = {};
  for (const k of Object.keys(out).sort()) sorted[k] = out[k];

  atomicWrite(OUT_FILE, JSON.stringify(sorted, null, 2), 'utf8');
  console.log(`\n✓ Written to ${OUT_FILE}`);

  // ── Spot-check ───────────────────────────────────────────────────────────────
  console.log('\n── Spot-check ───────────────────────────────────────────────────────');
  console.log('  PISA reading  (expect: FI~490, SG~543, US~505):');
  for (const code of ['FI', 'SG', 'US']) {
    const e = sorted[code];
    console.log(`    ${code}: pisa_reading=${e?.pisa_reading ?? 'n/a'}  (${e?.pisa_reading_year ?? '-'})`);
  }
  console.log('  Min wage USD PPP/hr  (expect: AU ~$15-18, US ~$10-12, LU ~$18-20):');
  for (const code of ['AU', 'US', 'LU']) {
    const e = sorted[code];
    console.log(`    ${code}: min_wage_usd_ppp=${e?.min_wage_usd_ppp ?? 'n/a'}  (${e?.min_wage_year ?? '-'})`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
