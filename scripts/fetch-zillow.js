#!/usr/bin/env node
/**
 * fetch-zillow.js
 * Downloads Zillow Research ZHVI (home values) and ZORI (rent index) for US cities,
 * matches to our city QIDs, and outputs public/zillow-cities.json.
 *
 * Output per QID:
 *   zhvi          – latest Zillow Home Value Index (typical home value, USD)
 *   zhviYear      – year of latest ZHVI value
 *   zhviHistory   – [[year, value], ...] annual snapshots (Jan of each year)
 *   zori          – latest Zillow Observed Rent Index (typical rent, USD/mo)
 *   zoriYear      – year of latest ZORI value
 *   zoriHistory   – [[year, value], ...] annual snapshots
 *
 * Source: Zillow Research (zillow.com/research/data) — free, no API key
 * Usage:  node scripts/fetch-zillow.js
 */
'use strict';

const fs   = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');

const CITIES_PATH = path.join(__dirname, '../public/cities-full.json');
const OUTPUT_PATH = path.join(__dirname, '../public/zillow-cities.json');

// Zillow Research CSV endpoints (single-family + condo, middle tier, seasonally adjusted)
const ZHVI_URL = 'https://files.zillowstatic.com/research/public_csvs/zhvi/City_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv';
const ZORI_URL = 'https://files.zillowstatic.com/research/public_csvs/zori/City_zori_uc_sfrcondomfr_sm_month.csv';

// US state full names → 2-letter abbreviation
const STATE_ABBR = {
  'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA',
  'Colorado':'CO','Connecticut':'CT','Delaware':'DE','Florida':'FL','Georgia':'GA',
  'Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA',
  'Kansas':'KS','Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD',
  'Massachusetts':'MA','Michigan':'MI','Minnesota':'MN','Mississippi':'MS',
  'Missouri':'MO','Montana':'MT','Nebraska':'NE','Nevada':'NV','New Hampshire':'NH',
  'New Jersey':'NJ','New Mexico':'NM','New York':'NY','North Carolina':'NC',
  'North Dakota':'ND','Ohio':'OH','Oklahoma':'OK','Oregon':'OR','Pennsylvania':'PA',
  'Rhode Island':'RI','South Carolina':'SC','South Dakota':'SD','Tennessee':'TN',
  'Texas':'TX','Utah':'UT','Vermont':'VT','Virginia':'VA','Washington':'WA',
  'West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY','District of Columbia':'DC',
  'Puerto Rico':'PR',
};

function norm(s) {
  if (!s) return '';
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[''`]/g, '').replace(/\s+/g, ' ').trim();
}

async function fetchCsv(url) {
  console.log(`  GET ${url}`);
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** Parse a Zillow CSV; returns { headers, rows } where each row is an array of strings. */
function parseCsv(text) {
  const lines = text.split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // Fields are not quoted in Zillow CSVs (just comma-separated)
    rows.push(line.split(','));
  }
  return { headers, rows };
}

/**
 * Extract annual time series (January value each year) from a Zillow CSV row.
 * Returns { latest: {value, year}, history: [[year, value], ...] }
 */
function extractAnnual(headers, row) {
  // Date columns start after the 9 metadata columns; format: YYYY-MM-DD
  const dateStart = headers.findIndex(h => /^\d{4}-\d{2}-\d{2}$/.test(h));
  if (dateStart === -1) return null;

  const byYear = {};
  for (let i = dateStart; i < headers.length; i++) {
    const dateParts = headers[i].split('-');
    const year  = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10);
    const val   = parseFloat(row[i]);
    if (isNaN(val)) continue;

    // Take January value; if not available for a year, take the closest available
    if (!byYear[year] || month === 1 || Math.abs(month - 1) < Math.abs(byYear[year].month - 1)) {
      byYear[year] = { val, month };
    }
  }

  const years = Object.keys(byYear).map(Number).sort((a, b) => a - b);
  if (!years.length) return null;

  const history = years.map(y => [y, Math.round(byYear[y].val)]);
  const latestYear = years[years.length - 1];
  return { latest: { value: Math.round(byYear[latestYear].val), year: latestYear }, history };
}

async function main() {
  // ── Build city lookup: "normName|stateAbbr" → city ─────────────────────────
  // Use census-cities.json to extract state abbreviations per QID, since
  // cities-full.json admin field contains county names, not state names.
  const citiesArr  = JSON.parse(fs.readFileSync(CITIES_PATH, 'utf8'));
  const CENSUS_PATH = path.join(__dirname, '../public/census-cities.json');
  const censusCities = fs.existsSync(CENSUS_PATH)
    ? JSON.parse(fs.readFileSync(CENSUS_PATH, 'utf8')) : {};

  // QID → 2-letter state abbreviation (from placeName last segment)
  const qidToState = {};
  for (const [qid, rec] of Object.entries(censusCities)) {
    const parts = rec.placeName?.split(',').map(s => s.trim());
    if (!parts?.length) continue;
    const abbr = STATE_ABBR[parts[parts.length - 1]];
    if (abbr) qidToState[qid] = abbr;
  }

  const cityLookup = new Map(); // "normName|ST" → city
  for (const city of citiesArr) {
    if (city.iso !== 'US' || !city.qid) continue;
    const stAbbr = qidToState[city.qid];
    if (!stAbbr) continue;

    // Primary key: exact normalized city name
    const key = norm(city.name) + '|' + stAbbr;
    const existing = cityLookup.get(key);
    if (!existing || (city.pop || 0) > (existing.pop || 0)) {
      cityLookup.set(key, city);
    }
    // Stripped variant: "New York City" → "New York", "Township of X" → "X"
    const stripped = norm(city.name)
      .replace(/ city$/, '').replace(/ township$/, '').replace(/ town$/, '')
      .replace(/ village$/, '').replace(/ borough$/, '').trim();
    if (stripped && stripped !== norm(city.name) && !cityLookup.has(stripped + '|' + stAbbr)) {
      cityLookup.set(stripped + '|' + stAbbr, city);
    }
  }
  console.log(`US city lookup: ${cityLookup.size} entries (${Object.keys(qidToState).length} with state info)`);

  function lookupCity(regionName, stateAbbr) {
    const n = norm(regionName);
    return cityLookup.get(n + '|' + stateAbbr)
        || cityLookup.get(n.replace(/ city$/, '') + '|' + stateAbbr)
        || cityLookup.get(n + ' city|' + stateAbbr)
        || null;
  }

  const output = {};

  // ── Fetch and process ZHVI ─────────────────────────────────────────────────
  console.log('\nFetching ZHVI (home values)…');
  try {
    const { headers, rows } = parseCsv(await fetchCsv(ZHVI_URL));
    // Find column indices for metadata
    const iRegion = headers.findIndex(h => h === 'RegionName');
    const iState  = headers.findIndex(h => h === 'State');
    if (iRegion === -1 || iState === -1) throw new Error('Unexpected ZHVI header format');

    let matched = 0;
    for (const row of rows) {
      const regionName = row[iRegion]?.trim();
      const stateAbbr  = row[iState]?.trim();
      if (!regionName || !stateAbbr) continue;

      const city = lookupCity(regionName, stateAbbr);
      if (!city) continue;

      const series = extractAnnual(headers, row);
      if (!series) continue;

      if (!output[city.qid]) output[city.qid] = {};
      output[city.qid].zhvi        = series.latest.value;
      output[city.qid].zhviYear    = series.latest.year;
      output[city.qid].zhviHistory = series.history;
      matched++;
    }
    console.log(`  Matched ${matched} cities`);
  } catch (e) {
    console.warn(`  ZHVI fetch failed: ${e.message}`);
  }

  // ── Fetch and process ZORI ─────────────────────────────────────────────────
  console.log('\nFetching ZORI (rent index)…');
  try {
    const { headers, rows } = parseCsv(await fetchCsv(ZORI_URL));
    const iRegion = headers.findIndex(h => h === 'RegionName');
    const iState  = headers.findIndex(h => h === 'State');
    if (iRegion === -1 || iState === -1) throw new Error('Unexpected ZORI header format');

    let matched = 0;
    for (const row of rows) {
      const regionName = row[iRegion]?.trim();
      const stateAbbr  = row[iState]?.trim();
      if (!regionName || !stateAbbr) continue;

      const city = lookupCity(regionName, stateAbbr);
      if (!city) continue;

      const series = extractAnnual(headers, row);
      if (!series) continue;

      if (!output[city.qid]) output[city.qid] = {};
      output[city.qid].zori        = series.latest.value;
      output[city.qid].zoriYear    = series.latest.year;
      output[city.qid].zoriHistory = series.history;
      matched++;
    }
    console.log(`  Matched ${matched} cities`);
  } catch (e) {
    console.warn(`  ZORI fetch failed: ${e.message}`);
  }

  atomicWrite(OUTPUT_PATH, JSON.stringify(output));
  console.log(`\nWrote ${Object.keys(output).length} cities to ${OUTPUT_PATH}`);

  // Top 10 most expensive cities by ZHVI
  const top10 = Object.entries(output)
    .filter(([, v]) => v.zhvi)
    .sort((a, b) => b[1].zhvi - a[1].zhvi)
    .slice(0, 10);
  console.log('\nTop 10 highest home values (ZHVI):');
  for (const [qid, rec] of top10) {
    const city = citiesArr.find(c => c.qid === qid);
    console.log(`  ${(city?.name || qid).padEnd(24)} $${rec.zhvi.toLocaleString()}  (${rec.zhviYear})`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
