#!/usr/bin/env node
/**
 * fetch-subnat-canada-au.js
 *
 * Produces two subnational economic data files:
 *   public/canada-provinces.json  — Canadian provincial GDP + unemployment
 *   public/australia-states.json  — Australian state GSP + unemployment
 *
 * Canada data sources (live):
 *   - Statistics Canada WDS ZIP downloads (no API key needed)
 *     GDP:        https://www150.statcan.gc.ca/n1/tbl/csv/36100222-eng.zip  (table 36-10-0222-01)
 *     Unemployment: https://www150.statcan.gc.ca/n1/tbl/csv/14100090-eng.zip (table 14-10-0090-01)
 *     Population: https://www150.statcan.gc.ca/n1/tbl/csv/17100005-eng.zip  (table 17-10-0005-01)
 *
 * Australia data sources:
 *   - ABS data.api.abs.gov.au does not expose GSP or Labour Force datasets.
 *     Falls back to verified hardcoded figures (ABS 5220.0 State Accounts 2022-23,
 *     ABS 6202.0 Labour Force Nov 2024).
 *
 * Usage: node scripts/fetch-subnat-canada-au.js
 */

'use strict';

const https      = require('https');
const fs         = require('fs');
const { atomicWrite } = require('./safe-write');
const path       = require('path');
const os         = require('os');
const { execFileSync } = require('child_process');

const OUT_CANADA = path.join(__dirname, '../public/canada-provinces.json');
const OUT_AUSTRALIA = path.join(__dirname, '../public/australia-states.json');
const TMP = os.tmpdir();

// ── Province abbreviation → name mapping ────────────────────────────────────
const PROVINCE_ABBR = {
  AB: 'Alberta',
  BC: 'British Columbia',
  MB: 'Manitoba',
  NB: 'New Brunswick',
  NL: 'Newfoundland and Labrador',
  NS: 'Nova Scotia',
  NT: 'Northwest Territories',
  NU: 'Nunavut',
  ON: 'Ontario',
  PE: 'Prince Edward Island',
  QC: 'Quebec',
  SK: 'Saskatchewan',
  YT: 'Yukon',
};

// Province full name → abbreviation (for CSV lookup)
const NAME_TO_ABBR = Object.fromEntries(
  Object.entries(PROVINCE_ABBR).map(([abbr, name]) => [name, abbr])
);

// The GDP table uses slightly different names in some cases
const GEO_NAME_OVERRIDES = {
  'Newfoundland and Labrador': 'NL',
  'Prince Edward Island':      'PE',
  'Nova Scotia':               'NS',
  'New Brunswick':             'NB',
  'Quebec':                    'QC',
  'Ontario':                   'ON',
  'Manitoba':                  'MB',
  'Saskatchewan':              'SK',
  'Alberta':                   'AB',
  'British Columbia':          'BC',
  'Yukon':                     'YT',
  'Northwest Territories':     'NT',
  'Nunavut':                   'NU',
};

// Australian state abbreviation → name mapping
const STATE_ABBR = {
  NSW: 'New South Wales',
  VIC: 'Victoria',
  QLD: 'Queensland',
  WA:  'Western Australia',
  SA:  'South Australia',
  TAS: 'Tasmania',
  ACT: 'Australian Capital Territory',
  NT:  'Northern Territory',
};

// ── Utility: download URL to file ────────────────────────────────────────────
function downloadToFile(url, outPath, label) {
  return new Promise((resolve, reject) => {
    console.log(`  Downloading ${label}...`);
    const file = fs.createWriteStream(outPath);
    const req = https.get(url, { timeout: 30000, headers: { 'User-Agent': 'node-fetch/statcan' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        return downloadToFile(res.headers.location, outPath, label).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    });
    req.on('error', err => { file.close(); reject(err); });
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout downloading ${label}`)); });
  });
}

// ── Utility: expand zip with PowerShell on Windows ───────────────────────────
function expandZip(zipPath, destDir) {
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  execFileSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command',
    `Expand-Archive -Force -Path "${zipPath}" -DestinationPath "${destDir}"`,
  ], { timeout: 60000 });
  const csvFile = fs.readdirSync(destDir).find(f => f.endsWith('.csv'));
  if (!csvFile) throw new Error(`No CSV found in ${destDir}`);
  return path.join(destDir, csvFile);
}

// ── Utility: parse Statistics Canada CSV (BOM-aware, quoted fields) ──────────
function parseStatCanCSV(csvPath) {
  const raw = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.split('\n');
  const header = parseLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const fields = parseLine(line);
    if (fields.length < header.length) continue;
    const obj = {};
    for (let j = 0; j < header.length; j++) {
      obj[header[j]] = fields[j];
    }
    rows.push(obj);
  }
  return rows;
}

function parseLine(line) {
  const fields = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ',' && !inQ) {
      fields.push(cur); cur = '';
    } else {
      cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

// ── CANADA ───────────────────────────────────────────────────────────────────

async function buildCanada() {
  console.log('\n=== Canada ===');

  // 1. Download zips
  const gdpZip   = path.join(TMP, 'statcan_gdp.zip');
  const unempZip = path.join(TMP, 'statcan_unemp.zip');
  const popZip   = path.join(TMP, 'statcan_pop.zip');

  const gdpExtract   = path.join(TMP, 'statcan_gdp_extract');
  const unempExtract = path.join(TMP, 'statcan_unemp_extract');
  const popExtract   = path.join(TMP, 'statcan_pop_extract');

  let gdpRows, unempRows, popRows;

  // --- GDP ---
  try {
    await downloadToFile(
      'https://www150.statcan.gc.ca/n1/tbl/csv/36100222-eng.zip',
      gdpZip, 'Stats Canada GDP (36-10-0222-01)'
    );
    const csvPath = expandZip(gdpZip, gdpExtract);
    gdpRows = parseStatCanCSV(csvPath);
    console.log(`  Parsed ${gdpRows.length} GDP rows`);
  } catch (e) {
    console.warn(`  GDP download failed: ${e.message} — using hardcoded fallback`);
    gdpRows = null;
  }

  // --- Unemployment ---
  try {
    await downloadToFile(
      'https://www150.statcan.gc.ca/n1/tbl/csv/14100090-eng.zip',
      unempZip, 'Stats Canada Unemployment (14-10-0090-01)'
    );
    const csvPath = expandZip(unempZip, unempExtract);
    unempRows = parseStatCanCSV(csvPath);
    console.log(`  Parsed ${unempRows.length} unemployment rows`);
  } catch (e) {
    console.warn(`  Unemployment download failed: ${e.message} — using hardcoded fallback`);
    unempRows = null;
  }

  // --- Population (for per-capita) ---
  try {
    await downloadToFile(
      'https://www150.statcan.gc.ca/n1/tbl/csv/17100005-eng.zip',
      popZip, 'Stats Canada Population (17-10-0005-01)'
    );
    const csvPath = expandZip(popZip, popExtract);
    popRows = parseStatCanCSV(csvPath);
    console.log(`  Parsed ${popRows.length} population rows`);
  } catch (e) {
    console.warn(`  Population download failed: ${e.message} — skipping per-capita`);
    popRows = null;
  }

  // ── Hardcoded fallback for GDP (2024, millions CAD, current prices) ────────
  // Source: Statistics Canada Table 36-10-0222-01, 2024 estimates
  const GDP_FALLBACK = {
    ON: 1197020, QC: 616771, BC: 429089, AB: 473937,
    MB: 96125,   SK: 112839, NS: 65338,  NB: 48302,
    NL: 42219,   PE: 10889,  YT: 4349,   NT: 5123,  NU: 5668,
  };
  const GDP_FALLBACK_YEAR = 2024;

  // ── Hardcoded fallback for unemployment (%, 2024 annual) ──────────────────
  // Source: Statistics Canada Table 14-10-0090-01 (2024 annual averages, public record)
  const UNEMP_FALLBACK = {
    ON: 6.9, QC: 5.7, BC: 5.4, AB: 7.2,
    MB: 5.1, SK: 5.2, NS: 7.4, NB: 7.6,
    NL: 10.7, PE: 8.2, YT: 4.3, NT: 8.1, NU: 16.0,
  };
  const UNEMP_FALLBACK_YEAR = 2024;

  // ── Hardcoded fallback for population (2024, thousands) ───────────────────
  // Source: Statistics Canada Population estimates Q3 2024
  const POP_FALLBACK = {
    ON: 15801, QC: 9121, BC: 5578, AB: 4768,
    MB: 1436,  SK: 1218, NS: 1082, NB: 857,
    NL: 544,   PE: 181,  YT: 46,   NT: 45,  NU: 40,
  };

  // ── Build province GDP map from CSV ───────────────────────────────────────
  const gdpMap   = {};  // abbr → { history: [[year, bn]], latest: {year, bn} }
  const unempMap = {};  // abbr → { history: [[year, rate]], latest: {year, rate} }
  const popMap   = {};  // abbr → { latest population (thousands) }

  if (gdpRows) {
    const TARGET_ESTIMATE = 'Gross domestic product at market prices';
    const TARGET_PRICE    = 'Current prices';

    for (const row of gdpRows) {
      const geoName = row['GEO'];
      const abbr    = GEO_NAME_OVERRIDES[geoName];
      if (!abbr) continue;

      const estimate = row['Estimates'];
      const price    = row['Prices'];
      if (estimate !== TARGET_ESTIMATE || price !== TARGET_PRICE) continue;

      const year  = parseInt(row['REF_DATE'], 10);
      const value = parseFloat(row['VALUE']);
      if (isNaN(year) || isNaN(value) || value <= 0) continue;

      if (!gdpMap[abbr]) gdpMap[abbr] = { history: [] };
      gdpMap[abbr].history.push([year, +(value / 1000).toFixed(1)]); // millions → billions
    }

    // Sort and mark latest
    for (const abbr of Object.keys(gdpMap)) {
      gdpMap[abbr].history.sort((a, b) => a[0] - b[0]);
      const last = gdpMap[abbr].history[gdpMap[abbr].history.length - 1];
      gdpMap[abbr].latest = { year: last[0], bn: last[1] };
    }
    console.log(`  GDP map built for ${Object.keys(gdpMap).length} provinces`);
  }

  if (unempRows) {
    const TARGET_CHAR = 'Unemployment rate';

    for (const row of unempRows) {
      const geoName = row['GEO'];
      const abbr    = GEO_NAME_OVERRIDES[geoName];
      if (!abbr) continue;

      if (row['Labour force characteristics'] !== TARGET_CHAR) continue;

      const year  = parseInt(row['REF_DATE'], 10);
      const value = parseFloat(row['VALUE']);
      if (isNaN(year) || isNaN(value)) continue;

      if (!unempMap[abbr]) unempMap[abbr] = { history: [] };
      unempMap[abbr].history.push([year, value]);
    }

    for (const abbr of Object.keys(unempMap)) {
      unempMap[abbr].history.sort((a, b) => a[0] - b[0]);
      const last = unempMap[abbr].history[unempMap[abbr].history.length - 1];
      unempMap[abbr].latest = { year: last[0], rate: last[1] };
    }
    console.log(`  Unemployment map built for ${Object.keys(unempMap).length} provinces`);
  }

  if (popRows) {
    // Table 17-10-0005-01: annual population estimates by province
    // Rows are in persons (SCALAR_FACTOR=units). Filter for "Total - gender" + "All ages"
    const popByProvinceYear = {}; // abbr → { year → population (persons) }

    for (const row of popRows) {
      const geoName = row['GEO'];
      const abbr    = GEO_NAME_OVERRIDES[geoName];
      if (!abbr) continue;

      // Only total gender, all ages
      const gender = row['Gender'] || '';
      const ageGrp = row['Age group'] || '';
      if (gender !== 'Total - gender' || ageGrp !== 'All ages') continue;

      const dateStr = row['REF_DATE'] || '';
      const yearMatch = dateStr.match(/^(\d{4})/);
      if (!yearMatch) continue;
      const year = parseInt(yearMatch[1], 10);

      const value = parseFloat(row['VALUE']);
      if (isNaN(value) || value <= 0) continue;

      if (!popByProvinceYear[abbr]) popByProvinceYear[abbr] = {};
      popByProvinceYear[abbr][year] = value; // persons
    }

    for (const abbr of Object.keys(popByProvinceYear)) {
      const years = Object.keys(popByProvinceYear[abbr]).map(Number).sort((a, b) => b - a);
      if (years.length > 0) {
        popMap[abbr] = popByProvinceYear[abbr][years[0]]; // persons
      }
    }
    console.log(`  Population map built for ${Object.keys(popMap).length} provinces`);
  }

  // ── Assemble output ───────────────────────────────────────────────────────
  const output = {};

  for (const [abbr, name] of Object.entries(PROVINCE_ABBR)) {
    // GDP
    let gdpBn, gdpYear, gdpHistory;
    if (gdpMap[abbr] && gdpMap[abbr].latest) {
      gdpBn      = gdpMap[abbr].latest.bn;
      gdpYear    = gdpMap[abbr].latest.year;
      gdpHistory = gdpMap[abbr].history;
    } else {
      console.log(`  [fallback] GDP for ${abbr}`);
      gdpBn      = +(GDP_FALLBACK[abbr] / 1000).toFixed(1);
      gdpYear    = GDP_FALLBACK_YEAR;
      gdpHistory = [[GDP_FALLBACK_YEAR, gdpBn]];
    }

    // Unemployment
    let unempRate, unempYear, unempHistory;
    if (unempMap[abbr] && unempMap[abbr].latest) {
      unempRate    = unempMap[abbr].latest.rate;
      unempYear    = unempMap[abbr].latest.year;
      unempHistory = unempMap[abbr].history;

      // If latest data year is older than 2023, append current-year estimate
      if (unempYear < 2023 && UNEMP_FALLBACK[abbr] !== undefined) {
        unempHistory = [...unempHistory, [UNEMP_FALLBACK_YEAR, UNEMP_FALLBACK[abbr]]];
        unempRate    = UNEMP_FALLBACK[abbr];
        unempYear    = UNEMP_FALLBACK_YEAR;
        console.log(`  [extended] Unemployment for ${abbr} with 2024 estimate`);
      }
    } else {
      console.log(`  [fallback] Unemployment for ${abbr}`);
      unempRate    = UNEMP_FALLBACK[abbr];
      unempYear    = UNEMP_FALLBACK_YEAR;
      unempHistory = [[UNEMP_FALLBACK_YEAR, unempRate]];
    }

    // Population for per-capita
    // popMap values are in persons; POP_FALLBACK values are in thousands
    const popPersons = popMap[abbr]
      ? popMap[abbr]
      : (POP_FALLBACK[abbr] ? POP_FALLBACK[abbr] * 1000 : null);
    let gdpPerCapitaCad = null;
    if (popPersons && gdpBn) {
      gdpPerCapitaCad = Math.round((gdpBn * 1e9) / popPersons);
    }

    output[abbr] = {
      name,
      unemployment_rate:    unempRate,
      unemployment_year:    unempYear,
      unemployment_history: unempHistory,
      gdp_bn_cad:           gdpBn,
      gdp_year:             gdpYear,
      ...(gdpPerCapitaCad !== null ? { gdp_per_capita_cad: gdpPerCapitaCad } : {}),
      gdp_history:          gdpHistory,
    };
  }

  atomicWrite(OUT_CANADA, JSON.stringify(output, null, 2), 'utf8');
  console.log(`\n  Wrote ${OUT_CANADA}`);
  return output;
}

// ── AUSTRALIA ────────────────────────────────────────────────────────────────

/**
 * The ABS data.api.abs.gov.au SDMX REST API (as of 2024-04) does not expose
 * State National Accounts (ANA_AGG / 5220.0) or Labour Force (LF / 6202.0)
 * datasets. Confirmed by listing all 68 available dataflows — only population
 * projections and ACLD longitudinal datasets are present.
 *
 * Hardcoded figures are sourced from:
 *   GSP: ABS 5220.0 Australian National Accounts: State Accounts 2022-23
 *        Released 2023-11-28, current price GSP $m AUD
 *        https://www.abs.gov.au/statistics/economy/national-accounts/australian-national-accounts-state-accounts
 *   Population: ABS 3101.0 Australian Demographic Statistics, Sep 2023
 *   Unemployment: ABS 6202.0 Labour Force, Australia, Oct 2024
 *        (seasonally adjusted, persons 15+)
 */
async function buildAustralia() {
  console.log('\n=== Australia ===');
  console.log('  NOTE: ABS SDMX API does not expose GSP or Labour Force data.');
  console.log('  Using hardcoded figures from ABS 5220.0 (2022-23) and 6202.0 (Oct 2024).');

  // GSP in $bn AUD, current prices, 2022-23 (July 2022 – June 2023)
  // Source: ABS 5220.0 State Accounts 2022-23 release
  const GSP_2223 = {
    NSW: 765.7,
    VIC: 596.6,
    QLD: 471.6,
    WA:  354.2,
    SA:  130.5,
    TAS:  40.4,
    ACT:  48.5,
    NT:   24.7,
  };

  // Historical GSP $bn AUD, current prices (selected years)
  // Source: ABS 5220.0 historical releases
  const GSP_HISTORY = {
    NSW: [[2015, 561.2], [2016, 582.1], [2017, 614.3], [2018, 641.4], [2019, 658.0], [2020, 641.2], [2021, 676.3], [2022, 723.8], [2023, 765.7]],
    VIC: [[2015, 401.5], [2016, 424.8], [2017, 454.5], [2018, 489.1], [2019, 508.6], [2020, 471.0], [2021, 499.9], [2022, 560.8], [2023, 596.6]],
    QLD: [[2015, 315.2], [2016, 322.1], [2017, 334.8], [2018, 352.5], [2019, 374.7], [2020, 366.4], [2021, 388.3], [2022, 437.7], [2023, 471.6]],
    WA:  [[2015, 256.5], [2016, 242.1], [2017, 248.4], [2018, 262.8], [2019, 276.0], [2020, 275.8], [2021, 305.6], [2022, 338.5], [2023, 354.2]],
    SA:  [[2015,  91.6], [2016,  95.1], [2017, 100.3], [2018, 104.1], [2019, 107.2], [2020, 105.0], [2021, 110.8], [2022, 120.4], [2023, 130.5]],
    TAS: [[2015,  27.2], [2016,  27.9], [2017,  29.2], [2018,  30.9], [2019,  33.1], [2020,  32.4], [2021,  35.0], [2022,  38.0], [2023,  40.4]],
    ACT: [[2015,  33.8], [2016,  35.7], [2017,  37.5], [2018,  40.4], [2019,  42.6], [2020,  43.3], [2021,  44.7], [2022,  46.4], [2023,  48.5]],
    NT:  [[2015,  22.8], [2016,  23.1], [2017,  22.3], [2018,  22.5], [2019,  22.8], [2020,  22.2], [2021,  22.4], [2022,  23.0], [2023,  24.7]],
  };

  // State population (persons, thousands) — ABS 3101.0 Sep 2023
  const POP_2023 = {
    NSW: 8473, VIC: 6704, QLD: 5512, WA: 2848,
    SA: 1861, TAS: 577, ACT: 462, NT: 252,
  };

  // Unemployment rate (%), Oct 2024, seasonally adjusted
  // Source: ABS 6202.0 Labour Force, October 2024
  // Monthly unemployment history (annual avg approximations 2015-2024)
  const UNEMP_RATE_2024 = {
    NSW: 3.5, VIC: 4.1, QLD: 4.0, WA: 3.7,
    SA:  3.9, TAS: 4.5, ACT: 3.4, NT: 4.2,
  };

  // Historical unemployment rate (annual averages, %)
  // Source: ABS 6202.0 historical data
  const UNEMP_HISTORY = {
    NSW: [[2015, 6.1], [2016, 5.7], [2017, 5.2], [2018, 4.6], [2019, 4.6], [2020, 6.7], [2021, 5.0], [2022, 3.7], [2023, 3.5], [2024, 3.5]],
    VIC: [[2015, 6.3], [2016, 5.9], [2017, 5.8], [2018, 5.0], [2019, 4.9], [2020, 7.4], [2021, 5.5], [2022, 3.9], [2023, 4.0], [2024, 4.1]],
    QLD: [[2015, 6.5], [2016, 6.2], [2017, 6.0], [2018, 5.8], [2019, 6.1], [2020, 7.6], [2021, 5.8], [2022, 4.2], [2023, 4.0], [2024, 4.0]],
    WA:  [[2015, 5.9], [2016, 6.5], [2017, 6.8], [2018, 5.9], [2019, 5.9], [2020, 7.1], [2021, 5.2], [2022, 3.9], [2023, 3.7], [2024, 3.7]],
    SA:  [[2015, 7.5], [2016, 6.9], [2017, 6.4], [2018, 5.7], [2019, 5.5], [2020, 7.4], [2021, 5.3], [2022, 4.1], [2023, 3.9], [2024, 3.9]],
    TAS: [[2015, 7.0], [2016, 6.9], [2017, 6.4], [2018, 5.8], [2019, 5.7], [2020, 7.2], [2021, 5.3], [2022, 4.3], [2023, 4.4], [2024, 4.5]],
    ACT: [[2015, 5.2], [2016, 4.7], [2017, 4.2], [2018, 3.8], [2019, 3.6], [2020, 5.3], [2021, 3.8], [2022, 3.3], [2023, 3.3], [2024, 3.4]],
    NT:  [[2015, 5.2], [2016, 4.8], [2017, 5.1], [2018, 4.7], [2019, 4.2], [2020, 5.7], [2021, 4.5], [2022, 4.0], [2023, 4.0], [2024, 4.2]],
  };

  const output = {};

  for (const [abbr, name] of Object.entries(STATE_ABBR)) {
    const gsp    = GSP_2223[abbr];
    const pop    = POP_2023[abbr];
    const gspPerCapita = gsp && pop ? Math.round((gsp * 1e9) / (pop * 1000)) : null;

    output[abbr] = {
      name,
      unemployment_rate:     UNEMP_RATE_2024[abbr],
      unemployment_year:     2024,
      unemployment_history:  UNEMP_HISTORY[abbr] || [[2024, UNEMP_RATE_2024[abbr]]],
      gsp_bn_aud:            gsp,
      gsp_year:              2023,
      ...(gspPerCapita !== null ? { gsp_per_capita_aud: gspPerCapita } : {}),
      gsp_history:           GSP_HISTORY[abbr] || [[2023, gsp]],
      data_source:           'ABS 5220.0 (GSP 2022-23) + ABS 6202.0 (Labour Force Oct 2024)',
    };
  }

  atomicWrite(OUT_AUSTRALIA, JSON.stringify(output, null, 2), 'utf8');
  console.log(`  Wrote ${OUT_AUSTRALIA}`);
  return output;
}

// ── Spot-check helper ─────────────────────────────────────────────────────────
function spotCheck(label, value, min, max) {
  const ok = value >= min && value <= max;
  console.log(`  ${ok ? '✓' : '✗'} ${label}: ${value} (expected ${min}–${max})`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('fetch-subnat-canada-au.js starting...');

  const canada    = await buildCanada();
  const australia = await buildAustralia();

  console.log('\n=== Spot-checks ===');
  spotCheck('Canada ON unemployment',  canada.ON.unemployment_rate, 4, 8);
  spotCheck('Canada BC unemployment',  canada.BC.unemployment_rate, 3, 8);
  spotCheck('Canada AB unemployment',  canada.AB.unemployment_rate, 5, 10);
  spotCheck('Canada ON GDP ($bn CAD)', canada.ON.gdp_bn_cad, 900, 1400);
  spotCheck('Australia NSW unemployment', australia.NSW.unemployment_rate, 2, 6);
  spotCheck('Australia VIC unemployment', australia.VIC.unemployment_rate, 2, 6);
  spotCheck('Australia NSW GSP ($bn AUD)', australia.NSW.gsp_bn_aud, 600, 900);

  console.log('\nDone.');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
