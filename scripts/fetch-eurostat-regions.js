#!/usr/bin/env node
/**
 * fetch-eurostat-regions.js
 * Fetches economic data for European NUTS-2 regions from Eurostat REST API.
 *
 * Datasets:
 *   lfst_r_lfu3rt  – Regional unemployment rate (annual, NUTS-2)
 *   nama_10r_2gdp  – Regional GDP per inhabitant (PPS index, EU=100)
 *
 * Output: public/eurostat-regions.json
 *   Keyed by NUTS-2 code (e.g. "DE21", "FR10", "ITI4")
 *
 * Usage:
 *   node scripts/fetch-eurostat-regions.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const OUTPUT_PATH = path.join(__dirname, '../public/eurostat-regions.json');
const BASE        = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data';
const HISTORY_YEARS = 15;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns true if the given geo code is a NUTS-2 region.
 * NUTS-2 codes are exactly 4 characters: 2 letter country + 2 alphanumeric.
 * NUTS-0 = 2 chars (country), NUTS-1 = 3 chars, NUTS-2 = 4 chars, NUTS-3 = 5 chars.
 */
function isNuts2(code) {
  return typeof code === 'string' && /^[A-Z]{2}[A-Z0-9]{2}$/.test(code);
}

async function fetchDataset(dataset, params) {
  const query = new URLSearchParams({ format: 'JSON', lang: 'EN', ...params });
  const url   = `${BASE}/${dataset}?${query}`;
  console.log(`Fetching ${dataset} …`);
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${dataset}: ${url}`);
  const text = await res.text();
  console.log(`  Response size: ${(text.length / 1024 / 1024).toFixed(2)} MB`);
  return JSON.parse(text);
}

/**
 * Extract per-NUTS-2 time series from a Eurostat SDMX-JSON response.
 *
 * Returns a Map: nutsCode → { latest: { val, year }, history: [[year, val], ...] }
 *
 * The value flat index is computed from the dimension order in json.id:
 *   flat_index = sum_i( dim_i_ordinal * stride_i )
 * where stride_i = product of sizes of all dimensions after i.
 *
 * @param {object} json          - Parsed Eurostat JSON response
 * @param {string} geoField      - Name of the geo dimension (e.g. "geo")
 * @param {object} filterDims    - Optional extra dimension filters { dimName: categoryCode }
 *                                 Only rows matching ALL filters are included.
 */
function extractNuts2Series(json, geoField, filterDims = {}) {
  const dims   = json.id;      // e.g. ["freq", "sex", "age", "unit", "geo", "time"]
  const sizes  = json.size;    // parallel array of sizes per dimension
  const values = json.value;   // flat object { "0": v, "5": v, ... }

  // Build stride array (rightmost = 1)
  const strides = new Array(dims.length).fill(1);
  for (let i = dims.length - 2; i >= 0; i--) {
    strides[i] = strides[i + 1] * sizes[i + 1];
  }

  // Resolve dimension category lists in order
  const cats = dims.map(d => {
    const catIndex = json.dimension[d].category.index;
    // Sort by their numeric index values
    return Object.entries(catIndex)
      .sort((a, b) => a[1] - b[1])
      .map(e => e[0]);
  });

  const geoIdx  = dims.indexOf(geoField);
  const timeIdx = dims.indexOf('time');
  if (geoIdx  === -1) throw new Error(`Dimension '${geoField}' not found. Available: ${dims.join(', ')}`);
  if (timeIdx === -1) throw new Error(`Dimension 'time' not found. Available: ${dims.join(', ')}`);

  // Pre-resolve filter dimension indices
  const filterEntries = Object.entries(filterDims).map(([dim, code]) => {
    const dIdx = dims.indexOf(dim);
    if (dIdx === -1) throw new Error(`Filter dimension '${dim}' not found`);
    const cIdx = cats[dIdx].indexOf(code);
    if (cIdx === -1) throw new Error(`Filter code '${code}' not found in dimension '${dim}'`);
    return { dIdx, cIdx };
  });

  const geoCats  = cats[geoIdx];
  const timeCats = cats[timeIdx];
  const nGeo     = geoCats.length;
  const nTime    = timeCats.length;

  console.log(`  Dimensions: ${dims.join(', ')}`);
  console.log(`  Geo codes: ${nGeo}, Time periods: ${nTime}`);

  // Compute the base flat offset that satisfies all filter constraints (non-geo, non-time dims)
  // We iterate over all dimension combinations, fixing the filter dims.
  // For performance, compute a "base offset" for fixed dims excluding geo & time.
  let baseOffset = 0;
  for (const { dIdx, cIdx } of filterEntries) {
    baseOffset += cIdx * strides[dIdx];
  }

  // Fixed set of dimension indices that are NOT geo, NOT time, NOT in filterDims
  const fixedFilterIdxs = new Set(filterEntries.map(e => e.dIdx));
  const otherDims = dims
    .map((d, i) => i)
    .filter(i => i !== geoIdx && i !== timeIdx && !fixedFilterIdxs.has(i));

  // For the non-geo/non-time/non-filter dims, we only proceed if there's exactly one
  // category to iterate or all of them resolve to index 0 (i.e., the dataset has no
  // extra dimensions beyond what we've filtered). In practice these bulk fetches use
  // exactly the right parameters, so otherDims should be empty or size=1.
  // We'll sum over them if needed (shouldn't be for our datasets).
  const otherDimSizes = otherDims.map(i => sizes[i]);
  const hasOtherDims  = otherDims.length > 0 && otherDimSizes.some(s => s > 1);
  if (hasOtherDims) {
    console.warn(`  WARNING: unfiltered dimensions with size>1: ${otherDims.map(i => dims[i]).join(', ')} — using index 0 for each`);
  }
  // Use index 0 for any remaining unfiltered dimensions
  let otherOffset = 0;
  for (const dIdx of otherDims) {
    otherOffset += 0 * strides[dIdx]; // always index 0
  }

  const totalBase = baseOffset + otherOffset;

  const result = new Map();
  const cutoff  = new Date().getFullYear() - HISTORY_YEARS;

  for (let iG = 0; iG < nGeo; iG++) {
    const code = geoCats[iG];
    if (!isNuts2(code)) continue;

    const history = [];
    let latest = null;

    for (let iT = 0; iT < nTime; iT++) {
      const year = parseInt(timeCats[iT], 10);
      if (isNaN(year) || year < cutoff) continue;

      const flatIdx = totalBase + iG * strides[geoIdx] + iT * strides[timeIdx];
      const raw     = values[String(flatIdx)];
      if (raw == null) continue;

      const val = parseFloat(raw);
      if (isNaN(val)) continue;

      history.push([year, val]);
      if (!latest || year > latest.year) latest = { val, year };
    }

    if (latest && history.length > 0) {
      history.sort((a, b) => a[0] - b[0]);
      result.set(code, { latest, history });
    }
  }

  console.log(`  Extracted ${result.size} NUTS-2 regions`);
  return result;
}

/**
 * Build filter map only for dimensions that are actually present in the JSON
 * AND have more than one category. The Eurostat API collapses single-value
 * dimensions into the response but we can't filter on them.
 */
function buildFilters(json, wanted) {
  const result = {};
  for (const [dim, code] of Object.entries(wanted)) {
    if (!json.id.includes(dim)) continue;
    const cats = json.dimension[dim]?.category?.index;
    if (!cats) continue;
    const keys = Object.keys(cats);
    if (keys.length <= 1) continue; // already collapsed — no need to filter
    if (keys.includes(code)) {
      result[dim] = code;
    } else {
      console.warn(`  WARNING: Filter code '${code}' not found in dim '${dim}' (available: ${keys.slice(0,5).join(',')})`);
    }
  }
  return result;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const regions = {};

  // ── 1. Unemployment rate ──────────────────────────────────────────────────
  console.log('\n--- Dataset 1: Regional unemployment rate (lfst_r_lfu3rt) ---');
  // unit=PC_ACT does not exist in this dataset; correct code is PC.
  // isced11=TOTAL is required to avoid getting a multi-education breakdown.
  const unempJson = await fetchDataset('lfst_r_lfu3rt', {
    sex: 'T', age: 'Y15-74', isced11: 'TOTAL'
  });

  // Only pass filter constraints for dimensions that are present AND have >1 category
  // (the API collapses single-value dims but still lists them in json.id)
  const unempFilters = buildFilters(unempJson, {
    sex: 'T', age: 'Y15-74', isced11: 'TOTAL', unit: 'PC'
  });

  const unempMap = extractNuts2Series(unempJson, 'geo', unempFilters);

  for (const [code, { latest, history }] of unempMap.entries()) {
    if (!regions[code]) regions[code] = {};
    regions[code].unemployment_rate    = +latest.val.toFixed(1);
    regions[code].unemployment_year    = latest.year;
    regions[code].unemployment_history = history.map(([y, v]) => [y, +v.toFixed(1)]);
  }
  console.log(`  → ${unempMap.size} regions with unemployment data`);

  // ── 2. GDP per inhabitant (PPS, EU=100) ───────────────────────────────────
  console.log('\n--- Dataset 2: Regional GDP PPS (nama_10r_2gdp) ---');
  const gdpJson = await fetchDataset('nama_10r_2gdp', {
    unit: 'PPS_HAB_EU27_2020'
  });

  const gdpFilters = buildFilters(gdpJson, { unit: 'PPS_HAB_EU27_2020' });

  const gdpMap = extractNuts2Series(gdpJson, 'geo', gdpFilters);

  for (const [code, { latest, history }] of gdpMap.entries()) {
    if (!regions[code]) regions[code] = {};
    regions[code].gdp_pps_eu100   = Math.round(latest.val);
    regions[code].gdp_pps_year    = latest.year;
    regions[code].gdp_pps_history = history.map(([y, v]) => [y, Math.round(v)]);
  }
  console.log(`  → ${gdpMap.size} regions with GDP data`);

  // ── 3. Add names and country_iso2 ─────────────────────────────────────────
  console.log('\nAdding names and country codes…');

  // Pull names from the unemployment dataset (larger geo coverage)
  const geoLabels   = unempJson.dimension.geo?.category?.label || {};
  const geoLabels2  = gdpJson.dimension.geo?.category?.label   || {};
  const allLabels   = { ...geoLabels2, ...geoLabels }; // unemp wins on conflict

  let namedCount = 0;
  for (const [code, rec] of Object.entries(regions)) {
    rec.country_iso2 = code.slice(0, 2);
    const label = allLabels[code];
    if (label) {
      rec.name = label;
      namedCount++;
    } else {
      rec.name = code; // fallback to code
    }
  }
  console.log(`  ${namedCount} / ${Object.keys(regions).length} regions have names`);

  // ── 4. Sort keys and write output ─────────────────────────────────────────
  const sorted = {};
  for (const code of Object.keys(regions).sort()) {
    const r   = regions[code];
    // Canonical field order
    sorted[code] = {
      name:                   r.name,
      country_iso2:           r.country_iso2,
      unemployment_rate:      r.unemployment_rate,
      unemployment_year:      r.unemployment_year,
      unemployment_history:   r.unemployment_history,
      gdp_pps_eu100:          r.gdp_pps_eu100,
      gdp_pps_year:           r.gdp_pps_year,
      gdp_pps_history:        r.gdp_pps_history,
    };
    // Remove undefined keys
    for (const k of Object.keys(sorted[code])) {
      if (sorted[code][k] === undefined) delete sorted[code][k];
    }
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(sorted, null, 2));

  const fileSizeKB = (fs.statSync(OUTPUT_PATH).size / 1024).toFixed(0);
  console.log(`\nWrote ${Object.keys(sorted).length} NUTS-2 regions to ${OUTPUT_PATH} (${fileSizeKB} KB)`);

  // ── 5. Spot checks ────────────────────────────────────────────────────────
  console.log('\n--- Spot checks ---');
  for (const code of ['DE21', 'ITF4', 'FR10']) {
    const r = sorted[code];
    if (!r) { console.log(`  ${code}: NOT FOUND`); continue; }
    console.log(`  ${code} (${r.name}):`);
    console.log(`    gdp_pps_eu100 = ${r.gdp_pps_eu100} (year ${r.gdp_pps_year})`);
    console.log(`    unemployment_rate = ${r.unemployment_rate}% (year ${r.unemployment_year})`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
