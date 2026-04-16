#!/usr/bin/env node
/**
 * scripts/fetch-oecd.js
 *
 * Fetches OECD and complementary country-level indicators and saves them to
 * public/oecd-country.json, keyed by ISO-2 country code.
 *
 * Fields populated:
 *   rd_spend_pct       — R&D expenditure as % of GDP  (World Bank GB.XPD.RSDV.GD.ZS)
 *   rd_spend_year
 *   tax_revenue_pct    — Total tax revenue as % of GDP (World Bank GC.TAX.TOTL.GD.ZS)
 *   tax_revenue_year
 *   hours_worked       — Average annual hours actually worked per worker
 *                        (OECD SDMX-JSON dataset ANHRS — EMP total workers)
 *   hours_worked_year
 *   tertiary_pct       — Population 25+ with tertiary education / bachelor+ (%)
 *                        World Bank SE.TER.CUAT.BA.ZS, overridden for EU by
 *                        Eurostat edat_lfse_03 (age 25–64, ISCED 5-8)
 *   tertiary_pct_year
 *
 * Coverage: ~45–75 countries per indicator depending on source.
 * Only countries with at least one value are written to the output file.
 *
 * Data sources (all free, no API key required):
 *   - World Bank Open Data API   https://api.worldbank.org/v2/
 *   - OECD SDMX-JSON API        https://stats.oecd.org/SDMX-JSON/
 *   - Eurostat JSON-stat API     https://ec.europa.eu/eurostat/api/dissemination/
 *
 * Usage:   node scripts/fetch-oecd.js
 * Runtime: ~60–90 seconds
 */
'use strict';
const fs   = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');

const OUT_FILE = path.join(__dirname, '..', 'public', 'oecd-country.json');
const DELAY_MS = 1000;

// ── ISO-3 → ISO-2 map (built from World Bank country list) ───────────────────
// Populated at runtime in buildIso3Map()
let ISO3_TO_ISO2 = {};

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

// ── Build ISO-3 → ISO-2 lookup from World Bank country list ──────────────────
async function buildIso3Map() {
  process.stdout.write('Building ISO-3 → ISO-2 map from World Bank … ');
  const json = await apiFetch(
    'https://api.worldbank.org/v2/country?format=json&per_page=400'
  );
  const countries = (json[1] ?? []).filter(c => c.region?.id && c.iso2Code && c.id);
  for (const c of countries) {
    ISO3_TO_ISO2[c.id.toUpperCase()] = c.iso2Code.toUpperCase();
  }
  console.log(`${Object.keys(ISO3_TO_ISO2).length} countries`);
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

// ── OECD ANHRS: average annual hours worked ───────────────────────────────────
// SDMX-JSON v2.0 format from stats.oecd.org
// Series key positions:
//   0: REF_AREA  1: MEASURE  2: UNIT_MEASURE  3: SEX  4: AGE
//   5: LABOUR_FORCE_STATUS  6: WORK_PERIOD  7: HOURS_TYPE
//   8: WORKER_STATUS  9: WORK_TIME_ARNGMNT  10: AGGREGATION_OPERATION
//   11: HOUR_BANDS  12: JOB_COVERAGE
// We want: LABOUR_FORCE_STATUS=EMP (index 0), WORKER_STATUS=_T (all workers, index 1)
// Only accept hours_worked if the most recent year meets this floor.
// OECD ANHRS includes very old data (e.g. DEU=1973, FRA=1989) for some countries.
// We suppress those to avoid misleading consumers of the data.
const HOURS_MIN_YEAR = 2010;

async function fetchOecdAnhrs() {
  process.stdout.write('  OECD ANHRS                   Average annual hours worked … ');
  // Use a broader time window so the dimension list includes all relevant years,
  // but we still filter by HOURS_MIN_YEAR before writing to output.
  const url = 'https://stats.oecd.org/SDMX-JSON/data/ANHRS/all/OECD' +
              '?startTime=2015&endTime=2024&contentType=json';
  const best = {};
  try {
    const json  = await apiFetch(url);
    const data  = json.data;
    const struct = data.structures?.[0];
    const seriesDims = struct?.dimensions?.series ?? [];
    const obsDims    = struct?.dimensions?.observation ?? [];

    const refAreaDim = seriesDims.find(d => d.id === 'REF_AREA');
    const lfsDim     = seriesDims.find(d => d.id === 'LABOUR_FORCE_STATUS');
    const wsDim      = seriesDims.find(d => d.id === 'WORKER_STATUS');
    const timeDim    = obsDims.find(d => d.id === 'TIME_PERIOD');

    if (!refAreaDim || !timeDim) throw new Error('Unexpected ANHRS structure');

    // We want LABOUR_FORCE_STATUS = EMP (position 5) and WORKER_STATUS = _T (position 8)
    const empIdx = lfsDim?.values?.findIndex(v => v.id === 'EMP') ?? 0;
    const totIdx = wsDim?.values?.findIndex(v => v.id === '_T') ?? -1;

    const ds     = data.dataSets?.[0];
    const series = ds?.series ?? {};

    for (const [key, s] of Object.entries(series)) {
      const parts = key.split(':');
      // Filter: LFS must be EMP, WORKER_STATUS must be _T (total)
      if (Number(parts[5]) !== empIdx) continue;
      if (totIdx >= 0 && Number(parts[8]) !== totIdx) continue;

      const iso3  = refAreaDim.values[Number(parts[0])]?.id;
      const iso2  = ISO3_TO_ISO2[iso3];
      if (!iso2) continue;  // skip aggregates like OECD, WXOECD

      // Find most recent observation
      const obs = s.observations ?? {};
      let bestVal = null, bestYear = 0;
      for (const [obsIdx, obsArr] of Object.entries(obs)) {
        const val = obsArr?.[0];
        if (val == null) continue;
        const yr = parseInt(timeDim.values[Number(obsIdx)]?.id ?? '0', 10);
        if (yr > bestYear) { bestYear = yr; bestVal = val; }
      }
      if (bestVal == null || bestYear < HOURS_MIN_YEAR) continue;

      // Keep the best year across multiple series for the same country
      if (!best[iso2] || bestYear > best[iso2].year) {
        best[iso2] = { value: Math.round(bestVal), year: bestYear };
      }
    }
  } catch (e) {
    console.log(`ERROR: ${e.message} — skipping`);
    return {};
  }
  console.log(`${Object.keys(best).length} countries`);
  return best;
}

// ── Eurostat JSON-stat: tertiary education attainment for EU/EEA ──────────────
// Dataset: edat_lfse_03 — population 25–64 with ISCED 5–8 (tertiary), % of total
// Geo codes are ISO-2 (EU/EEA), no conversion needed.
async function fetchEurostatTertiary() {
  process.stdout.write('  Eurostat edat_lfse_03        Tertiary attainment 25–64 (EU) … ');
  const url = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/' +
              'edat_lfse_03?format=JSON&lang=en&age=Y25-64&isced11=ED5-8&sex=T' +
              '&sinceTimePeriod=2018';
  const best = {};
  try {
    const json = await apiFetch(url);

    // JSON-stat dimension layout: freq × sex × age × unit × isced11 × geo × time
    const dimIds  = json.id ?? [];
    const sizes   = json.size ?? [];
    const geoDim  = json.dimension?.geo;
    const timeDim = json.dimension?.time;
    if (!geoDim || !timeDim) throw new Error('Unexpected Eurostat structure');

    const geoIndex  = geoDim.category?.index ?? {};
    const timeIndex = timeDim.category?.index ?? {};

    const geoIds  = Object.keys(geoIndex).sort((a, b) => geoIndex[a] - geoIndex[b]);
    const timeIds = Object.keys(timeIndex).sort((a, b) => timeIndex[a] - timeIndex[b]);

    // Flat index: last two dims are geo × time
    const timeCount = timeIds.length;

    for (const geo of geoIds) {
      // Skip aggregates
      if (geo.length !== 2 || geo === 'EA' || geo.startsWith('EU') || geo.startsWith('EA')) continue;
      const geoPos = geoIndex[geo];
      if (geoPos === undefined) continue;

      // Iterate time from most-recent backwards
      for (const yr of timeIds.slice().reverse()) {
        const tPos  = timeIndex[yr];
        const flatIdx = geoPos * timeCount + tPos;
        const val   = json.value?.[flatIdx];
        if (val == null) continue;
        best[geo] = { value: parseFloat(val.toFixed(2)), year: parseInt(yr, 10) };
        break;
      }
    }
  } catch (e) {
    console.log(`ERROR: ${e.message} — skipping`);
    return {};
  }
  console.log(`${Object.keys(best).length} countries`);
  return best;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  OECD-country indicator fetcher                                  ║');
  console.log('║  Sources: OECD SDMX-JSON · World Bank · Eurostat JSON-stat       ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  // ── Build ISO-3 map ──────────────────────────────────────────────────────────
  await buildIso3Map();
  await sleep(DELAY_MS);

  // ── Fetch each indicator ─────────────────────────────────────────────────────
  console.log('\n── Fetching indicators ─────────────────────────────────────────────');

  const rdData       = await fetchWorldBank('GB.XPD.RSDV.GD.ZS', 'R&D spend % GDP');
  await sleep(DELAY_MS);

  const taxData      = await fetchWorldBank('GC.TAX.TOTL.GD.ZS', 'Tax revenue % GDP');
  await sleep(DELAY_MS);

  const hoursData    = await fetchOecdAnhrs();
  await sleep(DELAY_MS);

  // WB tertiary attainment (25+, bachelor+) — broad coverage baseline
  const tertiaryWb   = await fetchWorldBank('SE.TER.CUAT.BA.ZS', 'Tertiary attainment 25+ (WB)');
  await sleep(DELAY_MS);

  // Eurostat tertiary for EU/EEA — more precise age bracket (25–64), overrides WB
  const tertiaryEu   = await fetchEurostatTertiary();

  // ── Merge into output object ─────────────────────────────────────────────────
  console.log('\n── Merging data ─────────────────────────────────────────────────────');

  const out = {};
  const allCodes = new Set([
    ...Object.keys(rdData),
    ...Object.keys(taxData),
    ...Object.keys(hoursData),
    ...Object.keys(tertiaryWb),
    ...Object.keys(tertiaryEu),
  ]);

  let counters = { rd: 0, tax: 0, hours: 0, tertiary: 0 };

  for (const iso2 of [...allCodes].sort()) {
    const entry = {};

    if (rdData[iso2]) {
      entry.rd_spend_pct  = parseFloat(rdData[iso2].value.toFixed(3));
      entry.rd_spend_year = rdData[iso2].year;
      counters.rd++;
    }
    if (taxData[iso2]) {
      entry.tax_revenue_pct  = parseFloat(taxData[iso2].value.toFixed(3));
      entry.tax_revenue_year = taxData[iso2].year;
      counters.tax++;
    }
    if (hoursData[iso2]) {
      entry.hours_worked      = hoursData[iso2].value;
      entry.hours_worked_year = hoursData[iso2].year;
      counters.hours++;
    }

    // Tertiary: prefer Eurostat (EU) over WB for affected countries
    const tert = tertiaryEu[iso2] ?? tertiaryWb[iso2];
    if (tert) {
      entry.tertiary_pct      = parseFloat(tert.value.toFixed(2));
      entry.tertiary_pct_year = tert.year;
      counters.tertiary++;
    }

    if (Object.keys(entry).length > 0) out[iso2] = entry;
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log(`  rd_spend_pct    → ${counters.rd} countries`);
  console.log(`  tax_revenue_pct → ${counters.tax} countries`);
  console.log(`  hours_worked    → ${counters.hours} countries`);
  console.log(`  tertiary_pct    → ${counters.tertiary} countries`);
  console.log(`  total entries   → ${Object.keys(out).length} countries`);

  // ── Write output ─────────────────────────────────────────────────────────────
  atomicWrite(OUT_FILE, JSON.stringify(out, null, 2), 'utf8');
  console.log(`\n✓ Written to ${OUT_FILE}`);

  // ── Spot-check ───────────────────────────────────────────────────────────────
  console.log('\n── Spot-check ───────────────────────────────────────────────────────');
  for (const code of ['US', 'DE', 'JP', 'GB']) {
    console.log(`  ${code}:`, JSON.stringify(out[code] ?? null, null, 2));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
