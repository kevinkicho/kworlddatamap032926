#!/usr/bin/env node
/**
 * scripts/fetch-oecd-social.js
 *
 * Extends public/oecd-country.json with 6 new fields:
 *
 *   avg_wage_usd         — Average annual wages, USD PPP (OECD AV_AN_WAGE)
 *   avg_wage_year
 *   labour_productivity  — GDP per hour worked, USD PPP (OECD PDB_LV)
 *   labour_prod_year
 *   gender_pay_gap       — Gender pay gap % (OECD GENDER_EMP / EARN)
 *   gender_pay_gap_year
 *   social_spend_gdp     — Social spending as % GDP (OECD SOCX_AGG)
 *   social_spend_year
 *   youth_unemployment   — Youth unemployment 15-24 % (World Bank SL.UEM.1524.ZS)
 *   youth_unemp_year
 *   poverty_rate_oecd    — Relative poverty: % below 50% median income (OECD IDD)
 *   poverty_rate_year
 *
 * Reads existing oecd-country.json, merges new fields, writes back.
 * Existing fields are NOT removed.
 *
 * Data sources (all free, no API key):
 *   - OECD SDMX-JSON API     https://stats.oecd.org/SDMX-JSON/
 *   - World Bank Open Data    https://api.worldbank.org/v2/
 *   - Hardcoded fallback tables (if API fails or returns sparse data)
 *
 * Usage:   node scripts/fetch-oecd-social.js
 * Runtime: ~2–3 minutes
 */
'use strict';
const fs   = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');

const OUT_FILE = path.join(__dirname, '..', 'public', 'oecd-country.json');
const DELAY_MS = 1200;

// ── ISO-3 → ISO-2 map ───────────────────────────────────────────────────────
let ISO3_TO_ISO2 = {};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function apiFetch(url, headers = {}) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'WorldDataMap-OECDFetcher/1.0 (educational; nodejs)',
      ...headers,
    },
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

async function buildIso3Map() {
  process.stdout.write('Building ISO-3 → ISO-2 map … ');
  const json = await apiFetch(
    'https://api.worldbank.org/v2/country?format=json&per_page=400'
  );
  const countries = (json[1] ?? []).filter(c => c.region?.id && c.iso2Code && c.id);
  for (const c of countries) ISO3_TO_ISO2[c.id.toUpperCase()] = c.iso2Code.toUpperCase();
  console.log(`${Object.keys(ISO3_TO_ISO2).length} countries`);
}

// ── World Bank indicator fetch ───────────────────────────────────────────────
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

// ── Generic OECD SDMX-JSON fetcher ──────────────────────────────────────────
// Fetches latest observation per country from a given dataset.
// filterFn(seriesDims, parts) → boolean: return true to keep the series.
async function fetchOecdDataset(dataset, label, filterFn) {
  process.stdout.write(`  OECD ${dataset.padEnd(24)} ${label} … `);
  const url = `https://stats.oecd.org/SDMX-JSON/data/${dataset}/all/OECD` +
              `?startTime=2015&endTime=2024&contentType=json`;
  const best = {};
  try {
    const json   = await apiFetch(url);
    const data   = json.data;
    const struct = data.structures?.[0];
    const seriesDims = struct?.dimensions?.series ?? [];
    const obsDims    = struct?.dimensions?.observation ?? [];
    const refAreaDim = seriesDims.find(d => d.id === 'REF_AREA');
    const timeDim    = obsDims.find(d => d.id === 'TIME_PERIOD');
    if (!refAreaDim || !timeDim) throw new Error('Unexpected structure');

    const ds     = data.dataSets?.[0];
    const series = ds?.series ?? {};

    for (const [key, s] of Object.entries(series)) {
      const parts = key.split(':');
      if (filterFn && !filterFn(seriesDims, parts)) continue;

      const iso3 = refAreaDim.values[Number(parts[seriesDims.indexOf(refAreaDim)])]?.id;
      const iso2 = ISO3_TO_ISO2[iso3] || (iso3?.length === 2 ? iso3 : null);
      if (!iso2) continue;

      const obs = s.observations ?? {};
      let bestVal = null, bestYear = 0;
      for (const [obsIdx, obsArr] of Object.entries(obs)) {
        const val = obsArr?.[0];
        if (val == null || isNaN(val)) continue;
        const yr = parseInt(timeDim.values[Number(obsIdx)]?.id ?? '0', 10);
        if (yr > bestYear) { bestYear = yr; bestVal = val; }
      }
      if (bestVal == null) continue;
      if (!best[iso2] || bestYear > best[iso2].year) {
        best[iso2] = { value: bestVal, year: bestYear };
      }
    }
  } catch (e) {
    console.log(`ERROR: ${e.message} — falling back`);
    return null;
  }
  const count = Object.keys(best).length;
  console.log(`${count} countries`);
  return count > 0 ? best : null;
}

// ── Hardcoded fallback tables ────────────────────────────────────────────────
// Source: OECD data portal, 2022–2023 values. Used when API calls fail.

function getAvgWageFallback() {
  return {
    LU: { value: 78015, year: 2023 }, US: { value: 77463, year: 2023 },
    IS: { value: 79473, year: 2023 }, CH: { value: 72993, year: 2023 },
    NL: { value: 63225, year: 2023 }, BE: { value: 60481, year: 2023 },
    DK: { value: 64127, year: 2023 }, NO: { value: 60555, year: 2023 },
    AT: { value: 58585, year: 2023 }, DE: { value: 58940, year: 2023 },
    AU: { value: 59408, year: 2023 }, CA: { value: 59050, year: 2023 },
    IE: { value: 55781, year: 2023 }, GB: { value: 53985, year: 2023 },
    FI: { value: 51572, year: 2023 }, SE: { value: 52477, year: 2023 },
    FR: { value: 52764, year: 2023 }, KR: { value: 48922, year: 2023 },
    NZ: { value: 49754, year: 2023 }, JP: { value: 44010, year: 2023 },
    IL: { value: 44156, year: 2023 }, IT: { value: 44893, year: 2023 },
    ES: { value: 42859, year: 2023 }, SI: { value: 39338, year: 2023 },
    LT: { value: 37020, year: 2023 }, CZ: { value: 34248, year: 2023 },
    PL: { value: 36216, year: 2023 }, EE: { value: 33691, year: 2023 },
    PT: { value: 33565, year: 2023 }, LV: { value: 31239, year: 2023 },
    HU: { value: 28879, year: 2023 }, SK: { value: 28382, year: 2023 },
    GR: { value: 28167, year: 2023 }, CL: { value: 27585, year: 2023 },
    TR: { value: 24356, year: 2023 }, MX: { value: 16685, year: 2023 },
    CO: { value: 14412, year: 2023 },
  };
}

function getProductivityFallback() {
  return {
    IE: { value: 132.0, year: 2023 }, NO: { value: 100.9, year: 2023 },
    LU: { value: 98.9, year: 2023 },  DK: { value: 88.2, year: 2023 },
    CH: { value: 85.7, year: 2023 },  US: { value: 85.0, year: 2023 },
    BE: { value: 83.5, year: 2023 },  SE: { value: 80.8, year: 2023 },
    AT: { value: 77.2, year: 2023 },  NL: { value: 77.1, year: 2023 },
    DE: { value: 76.0, year: 2023 },  FI: { value: 72.4, year: 2023 },
    FR: { value: 71.0, year: 2023 },  IS: { value: 69.5, year: 2023 },
    AU: { value: 66.2, year: 2023 },  GB: { value: 65.3, year: 2023 },
    IT: { value: 62.5, year: 2023 },  CA: { value: 60.2, year: 2023 },
    ES: { value: 57.6, year: 2023 },  IL: { value: 53.6, year: 2023 },
    SI: { value: 51.8, year: 2023 },  NZ: { value: 49.7, year: 2023 },
    JP: { value: 52.3, year: 2023 },  KR: { value: 47.4, year: 2023 },
    LT: { value: 46.9, year: 2023 },  CZ: { value: 46.7, year: 2023 },
    EE: { value: 43.3, year: 2023 },  PT: { value: 41.5, year: 2023 },
    PL: { value: 41.1, year: 2023 },  SK: { value: 40.3, year: 2023 },
    HU: { value: 39.8, year: 2023 },  LV: { value: 38.1, year: 2023 },
    GR: { value: 37.3, year: 2023 },  TR: { value: 36.7, year: 2023 },
    CL: { value: 33.1, year: 2023 },  MX: { value: 23.3, year: 2023 },
    CO: { value: 18.8, year: 2023 },
  };
}

function getGenderPayGapFallback() {
  return {
    KR: { value: 31.2, year: 2022 }, IL: { value: 25.4, year: 2022 },
    JP: { value: 21.3, year: 2022 }, LV: { value: 20.1, year: 2022 },
    US: { value: 17.0, year: 2022 }, CA: { value: 16.7, year: 2022 },
    EE: { value: 17.7, year: 2022 }, FI: { value: 16.2, year: 2022 },
    GB: { value: 14.5, year: 2022 }, DE: { value: 13.5, year: 2022 },
    AT: { value: 12.8, year: 2022 }, FR: { value: 11.6, year: 2022 },
    AU: { value: 12.2, year: 2022 }, CZ: { value: 12.7, year: 2022 },
    CH: { value: 14.0, year: 2022 }, HU: { value: 10.3, year: 2022 },
    PT: { value: 10.6, year: 2022 }, NL: { value: 12.1, year: 2022 },
    SK: { value: 10.5, year: 2022 }, IE: { value: 9.6, year: 2022 },
    IT: { value: 5.6, year: 2022 },  ES: { value: 8.5, year: 2022 },
    SE: { value: 7.1, year: 2022 },  DK: { value: 5.0, year: 2022 },
    NZ: { value: 8.6, year: 2022 },  PL: { value: 7.8, year: 2022 },
    NO: { value: 4.6, year: 2022 },  BE: { value: 3.8, year: 2022 },
    GR: { value: 7.0, year: 2022 },  SI: { value: 3.1, year: 2022 },
    LT: { value: 9.5, year: 2022 },  LU: { value: 0.7, year: 2022 },
    CO: { value: 3.9, year: 2022 },  CL: { value: 10.4, year: 2022 },
    TR: { value: 11.6, year: 2022 }, MX: { value: 12.5, year: 2022 },
  };
}

function getSocialSpendFallback() {
  return {
    FR: { value: 31.6, year: 2022 }, FI: { value: 29.0, year: 2022 },
    BE: { value: 28.9, year: 2022 }, DK: { value: 28.0, year: 2022 },
    IT: { value: 28.2, year: 2022 }, AT: { value: 26.7, year: 2022 },
    DE: { value: 26.7, year: 2022 }, SE: { value: 25.5, year: 2022 },
    NO: { value: 25.3, year: 2022 }, ES: { value: 24.7, year: 2022 },
    PT: { value: 23.3, year: 2022 }, GR: { value: 23.5, year: 2022 },
    LU: { value: 22.4, year: 2022 }, JP: { value: 24.9, year: 2022 },
    GB: { value: 21.2, year: 2022 }, PL: { value: 22.2, year: 2022 },
    SI: { value: 21.5, year: 2022 }, HU: { value: 19.4, year: 2022 },
    NL: { value: 18.8, year: 2022 }, CZ: { value: 19.4, year: 2022 },
    EE: { value: 17.9, year: 2022 }, US: { value: 22.7, year: 2022 },
    AU: { value: 17.3, year: 2022 }, NZ: { value: 18.9, year: 2022 },
    LV: { value: 16.5, year: 2022 }, LT: { value: 16.4, year: 2022 },
    CA: { value: 17.3, year: 2022 }, SK: { value: 18.4, year: 2022 },
    IS: { value: 17.0, year: 2022 }, CH: { value: 16.2, year: 2022 },
    IE: { value: 14.4, year: 2022 }, IL: { value: 16.3, year: 2022 },
    KR: { value: 14.8, year: 2022 }, TR: { value: 12.4, year: 2022 },
    CL: { value: 14.0, year: 2022 }, MX: { value: 7.8, year: 2022 },
    CO: { value: 13.3, year: 2022 }, CR: { value: 12.0, year: 2022 },
  };
}

function getPovertyFallback() {
  return {
    US: { value: 17.8, year: 2021 }, KR: { value: 15.3, year: 2021 },
    JP: { value: 15.7, year: 2018 }, IL: { value: 16.9, year: 2021 },
    ES: { value: 14.0, year: 2021 }, IT: { value: 13.4, year: 2021 },
    LT: { value: 12.8, year: 2021 }, GB: { value: 11.7, year: 2021 },
    AU: { value: 12.4, year: 2020 }, CA: { value: 10.0, year: 2021 },
    GR: { value: 12.1, year: 2021 }, LV: { value: 12.2, year: 2021 },
    EE: { value: 11.6, year: 2021 }, DE: { value: 10.9, year: 2021 },
    CH: { value: 9.2, year: 2020 },  NZ: { value: 10.9, year: 2021 },
    PT: { value: 10.7, year: 2021 }, AT: { value: 9.1, year: 2021 },
    SE: { value: 8.9, year: 2021 },  HU: { value: 8.4, year: 2021 },
    FR: { value: 8.4, year: 2021 },  NL: { value: 8.3, year: 2021 },
    PL: { value: 8.4, year: 2021 },  NO: { value: 8.4, year: 2021 },
    IE: { value: 7.7, year: 2021 },  SI: { value: 7.6, year: 2021 },
    SK: { value: 7.6, year: 2021 },  BE: { value: 7.5, year: 2021 },
    FI: { value: 6.5, year: 2021 },  DK: { value: 6.1, year: 2021 },
    CZ: { value: 5.7, year: 2021 },  IS: { value: 5.2, year: 2021 },
    TR: { value: 15.9, year: 2021 }, MX: { value: 16.6, year: 2020 },
    CL: { value: 16.5, year: 2020 }, CO: { value: 18.5, year: 2021 },
    CR: { value: 17.0, year: 2021 },
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  OECD-country social/labour indicator fetcher                    ║');
  console.log('║  Fields: avg_wage · labour_productivity · gender_pay_gap         ║');
  console.log('║          social_spend_gdp · youth_unemployment · poverty_rate    ║');
  console.log('║  Sources: OECD SDMX-JSON · World Bank · hardcoded fallback       ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  // ── Read existing file ─────────────────────────────────────────────────────
  process.stdout.write('Reading existing oecd-country.json … ');
  const existing = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
  console.log(`${Object.keys(existing).length} entries`);

  // ── Build ISO map ──────────────────────────────────────────────────────────
  await buildIso3Map();
  await sleep(DELAY_MS);

  console.log('\n── Fetching indicators ─────────────────────────────────────────────');

  // 1. Average annual wages (OECD AV_AN_WAGE)
  let wageData = await fetchOecdDataset('AV_AN_WAGE', 'Average wages USD PPP', (dims, parts) => {
    // Keep only TOTAL series (all workers)
    const subjDim = dims.find(d => d.id === 'SUBJECT');
    if (subjDim) {
      const totIdx = subjDim.values.findIndex(v => v.id === 'TOT' || v.id === 'TOTAL');
      if (totIdx >= 0 && Number(parts[dims.indexOf(subjDim)]) !== totIdx) return false;
    }
    return true;
  });
  if (!wageData) {
    console.log('  Using hardcoded average wage fallback');
    wageData = getAvgWageFallback();
  } else {
    const fb = getAvgWageFallback();
    let added = 0;
    for (const [iso, rec] of Object.entries(fb)) { if (!wageData[iso]) { wageData[iso] = rec; added++; } }
    if (added) console.log(`  Supplemented with ${added} fallback entries`);
  }
  await sleep(DELAY_MS);

  // 2. Labour productivity — GDP per hour worked (OECD PDB_LV)
  let prodData = await fetchOecdDataset('PDB_LV', 'Labour productivity (GDP/hr)', (dims, parts) => {
    // Keep SUBJECT=T_GDPHRS (GDP per hour worked), MEASURE=CPC (constant prices, USD)
    const subjDim = dims.find(d => d.id === 'SUBJECT');
    const measDim = dims.find(d => d.id === 'MEASURE');
    if (subjDim) {
      const idx = subjDim.values.findIndex(v => v.id === 'T_GDPHRS');
      if (idx >= 0 && Number(parts[dims.indexOf(subjDim)]) !== idx) return false;
    }
    if (measDim) {
      const idx = measDim.values.findIndex(v => v.id === 'CPC' || v.id === 'USD');
      if (idx >= 0 && Number(parts[dims.indexOf(measDim)]) !== idx) return false;
    }
    return true;
  });
  if (!prodData) {
    console.log('  Using hardcoded productivity fallback');
    prodData = getProductivityFallback();
  } else {
    const fb = getProductivityFallback();
    let added = 0;
    for (const [iso, rec] of Object.entries(fb)) { if (!prodData[iso]) { prodData[iso] = rec; added++; } }
    if (added) console.log(`  Supplemented with ${added} fallback entries`);
  }
  await sleep(DELAY_MS);

  // 3. Gender pay gap (OECD GENDER_EMP — EARN indicator)
  let gapData = await fetchOecdDataset('GENDER_EMP', 'Gender pay gap', (dims, parts) => {
    // INDICATOR = EARN (gender pay gap in earnings)
    const indDim = dims.find(d => d.id === 'IND' || d.id === 'INDICATOR');
    if (indDim) {
      const idx = indDim.values.findIndex(v => v.id === 'EARN' || v.id === 'GENDER_WAGE_GAP');
      if (idx >= 0 && Number(parts[dims.indexOf(indDim)]) !== idx) return false;
    }
    return true;
  });
  if (!gapData) {
    console.log('  Using hardcoded gender pay gap fallback');
    gapData = getGenderPayGapFallback();
  } else {
    const fb = getGenderPayGapFallback();
    let added = 0;
    for (const [iso, rec] of Object.entries(fb)) { if (!gapData[iso]) { gapData[iso] = rec; added++; } }
    if (added) console.log(`  Supplemented with ${added} fallback entries`);
  }
  await sleep(DELAY_MS);

  // 4. Social spending % GDP (OECD SOCX_AGG)
  let socialData = await fetchOecdDataset('SOCX_AGG', 'Social spending % GDP', (dims, parts) => {
    // MEASURE = PC_GDP (% of GDP), SOURCE = TOT (public + mandatory private)
    const measDim = dims.find(d => d.id === 'MEASURE');
    const srcDim  = dims.find(d => d.id === 'SOURCE');
    if (measDim) {
      const idx = measDim.values.findIndex(v => v.id === 'PC_GDP');
      if (idx >= 0 && Number(parts[dims.indexOf(measDim)]) !== idx) return false;
    }
    if (srcDim) {
      const idx = srcDim.values.findIndex(v => v.id === 'TOT' || v.id === 'PUB');
      if (idx >= 0 && Number(parts[dims.indexOf(srcDim)]) !== idx) return false;
    }
    return true;
  });
  {
    // Fallback overrides live data for SOCX_AGG (SDMX filtering is unreliable)
    const fb = getSocialSpendFallback();
    if (!socialData) {
      console.log('  Using hardcoded social spending fallback');
      socialData = fb;
    } else {
      let overridden = 0, added = 0;
      for (const [iso, rec] of Object.entries(fb)) {
        if (socialData[iso]) overridden++; else added++;
        socialData[iso] = rec;
      }
      console.log(`  Curated fallback: ${overridden} overridden, ${added} added`);
    }
  }
  await sleep(DELAY_MS);

  // 5. Youth unemployment 15-24 (World Bank — broadest coverage)
  const youthData = await fetchWorldBank('SL.UEM.1524.ZS', 'Youth unemployment 15-24');
  await sleep(DELAY_MS);

  // 6. Poverty rate (OECD IDD)
  let povertyData = await fetchOecdDataset('IDD', 'Poverty rate (50% median)', (dims, parts) => {
    // MEASURE = POVERTY (or POVGAP), DEFINITION = CURRENT, AGE = TOT, METHODO = DISPY
    const measDim = dims.find(d => d.id === 'MEASURE');
    const ageDim  = dims.find(d => d.id === 'AGE');
    if (measDim) {
      const idx = measDim.values.findIndex(v =>
        v.id === 'POVERTY' || v.id === 'POVRATE' || v.id === 'DPPOVERTY'
      );
      if (idx >= 0 && Number(parts[dims.indexOf(measDim)]) !== idx) return false;
    }
    if (ageDim) {
      const idx = ageDim.values.findIndex(v => v.id === 'TOT' || v.id === 'TOTAL');
      if (idx >= 0 && Number(parts[dims.indexOf(ageDim)]) !== idx) return false;
    }
    return true;
  });
  {
    // Fallback overrides live data for IDD (SDMX returns wrong measures)
    const fb = getPovertyFallback();
    if (!povertyData) {
      console.log('  Using hardcoded poverty rate fallback');
      povertyData = fb;
    } else {
      let overridden = 0, added = 0;
      for (const [iso, rec] of Object.entries(fb)) {
        if (povertyData[iso]) overridden++; else added++;
        povertyData[iso] = rec;
      }
      console.log(`  Curated fallback: ${overridden} overridden, ${added} added`);
    }
  }

  // ── Merge ──────────────────────────────────────────────────────────────────
  console.log('\n── Merging data ─────────────────────────────────────────────────────');
  const out = JSON.parse(JSON.stringify(existing));
  const counters = { wage: 0, prod: 0, gap: 0, social: 0, youth: 0, poverty: 0, newEntries: 0 };

  const allCodes = new Set([
    ...Object.keys(wageData), ...Object.keys(prodData), ...Object.keys(gapData),
    ...Object.keys(socialData), ...Object.keys(youthData), ...Object.keys(povertyData),
  ]);

  for (const iso2 of allCodes) {
    if (!out[iso2]) { out[iso2] = {}; counters.newEntries++; }

    if (wageData[iso2]) {
      out[iso2].avg_wage_usd  = Math.round(wageData[iso2].value);
      out[iso2].avg_wage_year = wageData[iso2].year;
      counters.wage++;
    }
    if (prodData[iso2]) {
      out[iso2].labour_productivity = parseFloat(prodData[iso2].value.toFixed(1));
      out[iso2].labour_prod_year    = prodData[iso2].year;
      counters.prod++;
    }
    if (gapData[iso2]) {
      out[iso2].gender_pay_gap      = parseFloat(gapData[iso2].value.toFixed(1));
      out[iso2].gender_pay_gap_year = gapData[iso2].year;
      counters.gap++;
    }
    if (socialData[iso2]) {
      out[iso2].social_spend_gdp  = parseFloat(socialData[iso2].value.toFixed(1));
      out[iso2].social_spend_year = socialData[iso2].year;
      counters.social++;
    }
    if (youthData[iso2]) {
      out[iso2].youth_unemployment = parseFloat(youthData[iso2].value.toFixed(1));
      out[iso2].youth_unemp_year   = youthData[iso2].year;
      counters.youth++;
    }
    if (povertyData[iso2]) {
      // Poverty rate values from OECD are 0-1 (proportion); convert to %
      const val = povertyData[iso2].value;
      out[iso2].poverty_rate_oecd = parseFloat((val > 1 ? val : val * 100).toFixed(1));
      out[iso2].poverty_rate_year = povertyData[iso2].year;
      counters.poverty++;
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`  avg_wage_usd        → ${counters.wage} countries`);
  console.log(`  labour_productivity → ${counters.prod} countries`);
  console.log(`  gender_pay_gap      → ${counters.gap} countries`);
  console.log(`  social_spend_gdp    → ${counters.social} countries`);
  console.log(`  youth_unemployment  → ${counters.youth} countries`);
  console.log(`  poverty_rate_oecd   → ${counters.poverty} countries`);
  if (counters.newEntries) console.log(`  new entries         → ${counters.newEntries}`);
  console.log(`  total entries       → ${Object.keys(out).length} countries`);

  // ── Write ──────────────────────────────────────────────────────────────────
  const sorted = {};
  for (const k of Object.keys(out).sort()) sorted[k] = out[k];
  atomicWrite(OUT_FILE, JSON.stringify(sorted, null, 2), 'utf8');
  console.log(`\n✓ Written to ${OUT_FILE}`);

  // ── Spot-check ─────────────────────────────────────────────────────────────
  console.log('\n── Spot-check ───────────────────────────────────────────────────────');
  for (const code of ['US', 'DE', 'JP', 'FR', 'KR']) {
    const e = sorted[code];
    if (!e) continue;
    console.log(`  ${code}: wage=$${e.avg_wage_usd ?? 'n/a'}  prod=${e.labour_productivity ?? 'n/a'}$/hr  gap=${e.gender_pay_gap ?? 'n/a'}%  social=${e.social_spend_gdp ?? 'n/a'}%GDP  youth_unemp=${e.youth_unemployment ?? 'n/a'}%  poverty=${e.poverty_rate_oecd ?? 'n/a'}%`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
