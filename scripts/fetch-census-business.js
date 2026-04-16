#!/usr/bin/env node
/**
 * fetch-census-business.js
 * Builds census-business.json with business structure + population trend data.
 *
 * Sources (all confirmed working via API tests):
 *   ACS 5-year  — population trend 2019/2021/2022 at place level (batch by state)
 *   ACS 2023    — self-employment (B24080) at place level
 *   CBP 2022    — county business patterns: total + 5 key sectors
 *   ABS 2021    — state-level employer firm count (Annual Business Survey)
 *   Decennial   — 2020 exact population count at place level
 *
 * Usage:
 *   node scripts/fetch-census-business.js          # skip already-done cities
 *   node scripts/fetch-census-business.js --fresh  # reprocess all
 */

const fs   = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');

const FIPS_PATH   = path.join(__dirname, '../public/census-fips.json');
const OUTPUT_PATH = path.join(__dirname, '../public/census-business.json');
const FRESH       = process.argv.includes('--fresh');
const DELAY_MS    = 280;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function apiFetch(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (!Array.isArray(json) || json.length < 2) throw new Error('Empty response');
  return json;
}

// ── ACS population trend (batch by state) ────────────────────────────────────
// Returns { placeFips → { pop2019, pop2021, pop2022 } }
const POP_VARS = 'B01003_001E';
const SELFEMPL_VARS = 'B24080_001E,B24080_006E,B24080_007E,B24080_011E,B24080_012E';

async function fetchACSPopState(stateFips, type, year) {
  const geoFor = type === 'place'
    ? `for=place:*&in=state:${stateFips}`
    : `for=county+subdivision:*&in=state:${stateFips}`;
  const url = `https://api.census.gov/data/${year}/acs/acs5?get=NAME,${POP_VARS}&${geoFor}`;
  const json = await apiFetch(url);
  const h = json[0];
  const placeCol = type === 'place' ? h.indexOf('place') : h.indexOf('county subdivision');
  const result = {};
  for (const row of json.slice(1)) {
    const pf = placeCol >= 0 ? row[placeCol] : null;
    if (!pf) continue;
    result[pf] = parseInt(row[h.indexOf(POP_VARS)]) || null;
  }
  return result;
}

async function fetchACSSelemplState(stateFips, type) {
  const geoFor = type === 'place'
    ? `for=place:*&in=state:${stateFips}`
    : `for=county+subdivision:*&in=state:${stateFips}`;
  const url = `https://api.census.gov/data/2023/acs/acs5?get=NAME,${SELFEMPL_VARS}&${geoFor}`;
  const json = await apiFetch(url);
  const h = json[0];
  const placeCol = type === 'place' ? h.indexOf('place') : h.indexOf('county subdivision');
  const result = {};
  for (const row of json.slice(1)) {
    const pf = placeCol >= 0 ? row[placeCol] : null;
    if (!pf) continue;
    const g = k => { const i = h.indexOf(k); return i >= 0 ? parseInt(row[i]) || 0 : 0; };
    const total = g('B24080_001E') || 1;
    const selfEmpl = g('B24080_006E') + g('B24080_007E') + g('B24080_011E') + g('B24080_012E');
    result[pf] = {
      selfEmplCount: selfEmpl,
      selfEmplPct: total > 0 ? +(selfEmpl / total * 100).toFixed(2) : null,
    };
  }
  return result;
}

async function fetchDec2020State(stateFips, type) {
  const geoFor = type === 'place'
    ? `for=place:*&in=state:${stateFips}`
    : `for=county+subdivision:*&in=state:${stateFips}`;
  const url = `https://api.census.gov/data/2020/dec/pl?get=NAME,P1_001N&${geoFor}`;
  try {
    const json = await apiFetch(url);
    const h = json[0];
    const placeCol = type === 'place' ? h.indexOf('place') : h.indexOf('county subdivision');
    const result = {};
    for (const row of json.slice(1)) {
      const pf = placeCol >= 0 ? row[placeCol] : null;
      if (pf) result[pf] = parseInt(row[h.indexOf('P1_001N')]) || null;
    }
    return result;
  } catch { return {}; }
}

// ── County Business Patterns (CBP) ───────────────────────────────────────────
// 5 key NAICS sectors + total, cached by state
const CBP_SECTORS = {
  '00':    'total',
  '31-33': 'manufacturing',
  '51':    'information',
  '52':    'finance',
  '54':    'professional',
  '72':    'hospitality',
};

const _cbpCache = {};   // stateFips → { countyFips → { sectorKey: { estab, payann } } }
async function fetchCBPForState(stateFips) {
  if (_cbpCache[stateFips]) return _cbpCache[stateFips];
  const map = {};
  for (const [naics, key] of Object.entries(CBP_SECTORS)) {
    try {
      const url = `https://api.census.gov/data/2022/cbp?get=NAME,ESTAB,PAYANN&for=county:*&in=state:${stateFips}&NAICS2017=${naics}`;
      const json = await apiFetch(url);
      const h = json[0];
      for (const row of json.slice(1)) {
        const cf = row[h.indexOf('county')];
        if (!cf) continue;
        if (!map[cf]) map[cf] = {};
        map[cf][key] = {
          estab:  parseInt(row[h.indexOf('ESTAB')])  || 0,
          payann: parseInt(row[h.indexOf('PAYANN')]) || 0,  // $1,000s
        };
      }
    } catch (e) { /* suppressed sector — skip */ }
    await sleep(120);
  }
  _cbpCache[stateFips] = map;
  return map;
}

// ── Annual Business Survey (ABS) ─────────────────────────────────────────────
// State-level: total employer firms, total receipts
const _absCache = {};
async function fetchABSForState(stateFips) {
  if (_absCache[stateFips] !== undefined) return _absCache[stateFips];
  try {
    const url = `https://api.census.gov/data/2021/abscs?get=NAME,FIRMPDEMP,RCPPDEMP,PAYANN` +
      `&for=state:${stateFips}&NAICS2017=00&SEX=001&ETH_GROUP=001&RACE_GROUP=00&VET_GROUP=001&EMPSZFI=001`;
    const json = await apiFetch(url);
    const h = json[0], v = json[1];
    const g = k => { const i = h.indexOf(k); return i >= 0 ? parseInt(v[i]) || null : null; };
    const result = { firmCount: g('FIRMPDEMP'), totalPayroll: g('PAYANN') };
    _absCache[stateFips] = result;
    return result;
  } catch { _absCache[stateFips] = null; return null; }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const fipsMap = JSON.parse(fs.readFileSync(FIPS_PATH, 'utf8'));
  let output = {};
  if (!FRESH && fs.existsSync(OUTPUT_PATH)) {
    try { output = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8')); } catch (_) {}
  }

  const entries = Object.entries(fipsMap).filter(([, v]) => v);
  const todo = entries.filter(([qid]) => FRESH || !output[qid]);

  // Group by state+type for batched ACS calls
  const stateGroups = {};
  for (const [qid, fips] of entries) {
    const key = `${fips.state}:${fips.type}`;
    if (!stateGroups[key]) stateGroups[key] = [];
    stateGroups[key].push([qid, fips]);
  }

  console.log(`Cities: ${entries.length} | to process: ${todo.length}`);
  console.log(`State groups: ${Object.keys(stateGroups).length}`);

  // ── Pass 1: ACS population trend + self-employment (by state batch) ──
  console.log('\nPass 1: ACS population trend + self-employment…');
  const popData   = {};  // qid → { pop2019, pop2020, pop2021, pop2022 }
  const selemplData = {}; // qid → { selfEmplCount, selfEmplPct }
  let sg = 0;
  for (const [key, cityList] of Object.entries(stateGroups)) {
    const [stateFips, type] = key.split(':');
    process.stdout.write(`\r  [${++sg}/${Object.keys(stateGroups).length}] state ${stateFips}…    `);

    const [p19, p21, p22, p20dec, seData] = await Promise.all([
      fetchACSPopState(stateFips, type, '2019').catch(() => ({})),
      fetchACSPopState(stateFips, type, '2021').catch(() => ({})),
      fetchACSPopState(stateFips, type, '2022').catch(() => ({})),
      fetchDec2020State(stateFips, type).catch(() => ({})),
      fetchACSSelemplState(stateFips, type).catch(() => ({})),
    ]);
    await sleep(DELAY_MS);

    for (const [qid, fips] of cityList) {
      const pf = fips.place;
      popData[qid]    = { pop2019: p19[pf]||null, pop2020: p20dec[pf]||null, pop2021: p21[pf]||null, pop2022: p22[pf]||null };
      selemplData[qid] = seData[pf] || null;
    }
  }

  // ── Pass 2: CBP by county (batch by state) ──
  console.log('\n\nPass 2: County Business Patterns…');
  const cbpData = {};  // qid → cbp object
  const statesDone = new Set();
  let cbpSg = 0;
  for (const [key, cityList] of Object.entries(stateGroups)) {
    const [stateFips] = key.split(':');
    if (statesDone.has(stateFips)) {
      // Re-use cached CBP data for this state
      for (const [qid, fips] of cityList) {
        if (fips.county && _cbpCache[stateFips]) {
          cbpData[qid] = _cbpCache[stateFips][fips.county] || null;
        }
      }
      continue;
    }
    statesDone.add(stateFips);
    process.stdout.write(`\r  [${++cbpSg}] state ${stateFips}…    `);
    const countyMap = await fetchCBPForState(stateFips);
    for (const [qid, fips] of cityList) {
      cbpData[qid] = fips.county ? (countyMap[fips.county] || null) : null;
    }
    await sleep(DELAY_MS);
  }

  // ── Pass 3: ABS by state ──
  console.log('\n\nPass 3: Annual Business Survey (state level)…');
  const absData = {};  // qid → abs object
  for (const [, cityList] of Object.entries(stateGroups)) {
    const [stateFips] = cityList[0][1].state.split ? [cityList[0][1].state] : [cityList[0][1].state];
    const abs = await fetchABSForState(stateFips);
    for (const [qid] of cityList) absData[qid] = abs;
  }

  // ── Combine and write ──
  console.log('\n\nCombining…');
  for (const [qid, fips] of entries) {
    if (!FRESH && output[qid] && !todo.find(([q]) => q === qid)) continue;
    const pop = popData[qid] || {};
    const selfempl = selemplData[qid] || null;
    const cbp = cbpData[qid] || null;
    const abs = absData[qid] || null;
    const countyName = fips.countyName || null;

    // Compute growth pct from earliest to latest available pop
    const pops = [pop.pop2019, pop.pop2020, pop.pop2021, pop.pop2022].filter(Boolean);
    const earliest = pops[0], latest = pops[pops.length - 1];
    const popGrowthPct = earliest && latest && earliest !== latest
      ? +((latest - earliest) / earliest * 100).toFixed(2) : null;

    output[qid] = {
      popTrend: { ...pop, growthPct: popGrowthPct },
      selfEmpl: selfempl,
      cbp,
      abs,
      countyName,
    };
  }

  atomicWrite(OUTPUT_PATH, JSON.stringify(output));
  const withCbp = Object.values(output).filter(v => v?.cbp?.total).length;
  const withPop = Object.values(output).filter(v => v?.popTrend?.pop2019).length;
  console.log(`\nDone: ${withPop} cities with pop trend, ${withCbp} with CBP data.`);
  console.log(`File: ${OUTPUT_PATH}`);
}

main().catch(e => { console.error(e); process.exit(1); });
