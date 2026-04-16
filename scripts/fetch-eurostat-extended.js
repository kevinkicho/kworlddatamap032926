#!/usr/bin/env node
/**
 * fetch-eurostat-extended.js
 * Extends public/eurostat-cities.json with additional Eurostat Urban Audit
 * indicators from three new datasets:
 *
 *   urb_cenv    – Environment: PM10, NO2, temperature, rainfall, sunshine,
 *                 green space %, road noise exposure
 *   urb_ctour   – Culture & Tourism: tourist overnight stays, museum visitors,
 *                 public libraries, cinema seats/1000
 *   urb_cpopstr – Demographics: median age, population change %, dependency ratio
 *
 * Merges into the EXISTING eurostat-cities.json (does not overwrite core labour
 * market / living conditions data — only adds new keys).
 *
 * Usage:
 *   node scripts/fetch-eurostat-extended.js
 *   node scripts/fetch-eurostat-extended.js --fresh   (rebuild from scratch)
 */

'use strict';

const fs   = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');

const CITIES_PATH = path.join(__dirname, '../public/cities-full.json');
const OUTPUT_PATH = path.join(__dirname, '../public/eurostat-cities.json');
const FRESH       = process.argv.includes('--fresh');

const BASE = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data';

// ── New indicators to pull ────────────────────────────────────────────────────
const INDICATORS = {
  // urb_cenv — Environment / Climate
  pm10:            { ds: 'urb_cenv', code: 'EN2027V', dp: 1 },  // PM10 μg/m³ annual mean
  no2:             { ds: 'urb_cenv', code: 'EN2026V', dp: 1 },  // NO2 μg/m³ annual mean
  sunshineHours:   { ds: 'urb_cenv', code: 'EN1002V', dp: 1 },  // sunshine hours/day
  tempWarmest:     { ds: 'urb_cenv', code: 'EN1003V', dp: 1 },  // avg temp warmest month °C
  tempColdest:     { ds: 'urb_cenv', code: 'EN1004V', dp: 1 },  // avg temp coldest month °C
  rainfallMm:      { ds: 'urb_cenv', code: 'EN1005V', dp: 0 },  // rainfall litre/m² (=mm)
  greenSpacePct:   { ds: 'urb_cenv', code: 'EN5205V', dp: 1 },  // % land: green urban areas
  roadNoisePct:    { ds: 'urb_cenv', code: 'EN2033I', dp: 1 },  // % exposed to road noise >65dB
  // urb_ctour — Culture & Tourism
  touristNights:   { ds: 'urb_ctour', code: 'CR2001V', dp: 0 }, // total tourist overnight stays
  museumVisitors:  { ds: 'urb_ctour', code: 'CR1007V', dp: 0 }, // museum visitors/year
  libraries:       { ds: 'urb_ctour', code: 'CR1010V', dp: 0 }, // public libraries
  cinemaSeatsPer1k:{ ds: 'urb_ctour', code: 'CR1003I', dp: 1 }, // cinema seats per 1000 residents
  // urb_cpopstr — Demographics
  medianAge:       { ds: 'urb_cpopstr', code: 'DE1073V', dp: 1 },// median population age
  popChangePct:    { ds: 'urb_cpopstr', code: 'DE1061I', dp: 2 },// population change over 1 year %
  ageDependency:   { ds: 'urb_cpopstr', code: 'DE1058I', dp: 1 },// age dependency ratio
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalize(s) {
  if (!s) return '';
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

async function fetchDataset(dataset) {
  const url = `${BASE}/${dataset}?format=JSON&lang=EN`;
  console.log(`  Fetching ${dataset}…`);
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${dataset}`);
  return res.json();
}

function extractAll(json, indicatorCode) {
  const dims   = json.id;
  const sizes  = json.size;
  const values = json.value;

  const indicIdx = dims.indexOf('indic_ur');
  const cityIdx  = dims.indexOf('cities');
  const timeIdx  = dims.indexOf('time');

  const indicCats = Object.keys(json.dimension.indic_ur.category.index);
  const cityCats  = Object.keys(json.dimension.cities.category.index);
  const timeCats  = Object.keys(json.dimension.time.category.index);

  const nCity = sizes[cityIdx];
  const nTime = sizes[timeIdx];

  const iI = indicCats.indexOf(indicatorCode);
  if (iI === -1) { console.warn(`    ⚠ Indicator ${indicatorCode} not found`); return new Map(); }

  const result = new Map();
  for (let iC = 0; iC < nCity; iC++) {
    const cityCode = cityCats[iC];
    if (!cityCode.endsWith('C')) continue;
    const history = [];
    let latest = null;
    for (let iT = 0; iT < nTime; iT++) {
      const flatIdx = iI * nCity * nTime + iC * nTime + iT;
      const raw = values[flatIdx];
      if (raw == null) continue;
      const year = parseInt(timeCats[iT], 10);
      if (isNaN(year)) continue;
      const val = parseFloat(raw);
      history.push([year, val]);
      if (!latest || year > latest.year) latest = { val, year };
    }
    if (latest) {
      history.sort((a, b) => a[0] - b[0]);
      result.set(cityCode, { latest, history });
    }
  }
  return result;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  // Load existing eurostat-cities.json
  if (!fs.existsSync(OUTPUT_PATH)) {
    console.error('eurostat-cities.json not found — run fetch-eurostat.js first');
    process.exit(1);
  }
  const existing = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
  console.log(`Loaded ${Object.keys(existing).length} cities from eurostat-cities.json`);

  // Build reverse map: eurostatCode → qid (from existing data)
  const codeToQid = {};
  for (const [qid, rec] of Object.entries(existing)) {
    if (rec.eurostatCode) codeToQid[rec.eurostatCode] = qid;
  }
  console.log(`Code→QID map: ${Object.keys(codeToQid).length} entries`);

  // Fetch the three datasets (deduplicated)
  const datasets = {};
  const neededDatasets = [...new Set(Object.values(INDICATORS).map(i => i.ds))];
  for (const ds of neededDatasets) {
    datasets[ds] = await fetchDataset(ds);
  }

  // Extract each indicator and merge into existing records
  console.log('\nExtracting and merging indicators…');
  const stats = {};

  for (const [fieldName, { ds, code, dp }] of Object.entries(INDICATORS)) {
    const map = extractAll(datasets[ds], code);
    const histKey = fieldName + 'History';
    let hits = 0;

    for (const [euroCode, { latest, history }] of map.entries()) {
      const qid = codeToQid[euroCode];
      if (!qid || !existing[qid]) continue;

      const rec = existing[qid];
      rec[fieldName] = dp === 0 ? Math.round(latest.val) : +latest.val.toFixed(dp);
      const hist = history.length > 1
        ? history.map(([y, v]) => [y, dp === 0 ? Math.round(v) : +v.toFixed(dp)])
        : null;
      rec[histKey] = hist;
      hits++;
    }
    stats[fieldName] = hits;
    console.log(`  ${fieldName.padEnd(18)} (${code}): ${hits} cities`);
  }

  atomicWrite(OUTPUT_PATH, JSON.stringify(existing));
  console.log(`\nWrote ${Object.keys(existing).length} cities to ${OUTPUT_PATH}`);

  // Summary
  console.log('\nCoverage summary:');
  for (const [k, v] of Object.entries(stats)) {
    console.log(`  ${k.padEnd(18)}: ${v} / ${Object.keys(existing).length} cities`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
