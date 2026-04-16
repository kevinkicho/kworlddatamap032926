#!/usr/bin/env node
/**
 * scripts/fill-unemployment.js
 *
 * Fills unemployment_rate, unemployment_rate_year, and unemployment_rate_history
 * into public/kdb.json country-data section where missing or null.
 *
 * Source: World Bank API (SL.UEM.TOTL.ZS) — ILO modeled unemployment rate.
 * Fetches the most recent value per country (2019-2024 range) as well as
 * a 5-year history.
 *
 * Usage:
 *   node scripts/fill-unemployment.js
 *
 * Safe to re-run — only fills null fields, never overwrites existing values.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { atomicWrite } = require('./safe-write');

const OUT_FILE = path.join(__dirname, '..', 'public', 'kdb.json');
const WB_API = 'https://api.worldbank.org/v2/country/all/indicator/SL.UEM.TOTL.ZS';
const DELAY_MS = 500;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'kworlddatamap/1.0 (educational)' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' from ' + url);
  return res.json();
}

async function fetchAllPages(url) {
  let page = 1;
  let total = 0;
  let allObs = [];

  while (true) {
    const sep = url.includes('?') ? '&' : '?';
    const pageUrl = url + sep + 'format=json&per_page=2000&page=' + page;
    const json = await fetchJSON(pageUrl);

    if (!Array.isArray(json) || json.length < 2 || !json[1]) {
      break;
    }

    allObs = allObs.concat(json[1]);
    total = json[0].total || allObs.length;

    if (allObs.length >= total || !json[0].pages || page >= json[0].pages) {
      break;
    }
    page++;
    await sleep(DELAY_MS);
  }

  return allObs;
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║   World Bank Unemployment Rate Fetcher                ║');
  console.log('╚═══════════════════════════════════════════════════════╝');

  console.log('\nFetching unemployment data from World Bank API...');
  const obs = await fetchAllPages(WB_API + '?date=2019:2024');
  console.log('  Got ' + obs.length + ' observations total');

  const valid = obs.filter(o => o.value !== null && o.country && o.country.id);

  console.log('Loading ' + OUT_FILE + '...');
  const kdb = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
  const existing = kdb['country-data'];

  const iso2NameMap = {};
  for (const [iso, entry] of Object.entries(existing)) {
    if (entry.name) iso2NameMap[entry.name.toLowerCase()] = iso;
  }

  const extraMappings = {
    'united states': 'US',
    'united states of america': 'US',
    'russian federation': 'RU',
    'korea, rep.': 'KR',
    'korea, republic of': 'KR',
    'south korea': 'KR',
    "korea, dem. people's rep.": 'KP',
    'north korea': 'KP',
    'iran, islamic rep.': 'IR',
    'iran': 'IR',
    'viet nam': 'VN',
    'czechia': 'CZ',
    'cabo verde': 'CV',
    'congo, rep.': 'CG',
    'congo, dem. rep.': 'CD',
    "côte d'ivoire": 'CI',
    'ivory coast': 'CI',
    'turkiye': 'TR',
    'turkey': 'TR',
    'macedonia, fyrom': 'MK',
    'north macedonia': 'MK',
    'eswatini': 'SZ',
    'laos': 'LA',
    "lao people's democratic republic": 'LA',
    'bolivia, plurinational state of': 'BO',
    'bolivia': 'BO',
    'venezuela, bolivarian republic of': 'VE',
    'venezuela': 'VE',
    'tanzania, united republic of': 'TZ',
    'tanzania': 'TZ',
    'syrian arab republic': 'SY',
    'syria': 'SY',
    'moldova': 'MD',
    'republic of moldova': 'MD',
    'st. kitts and nevis': 'KN',
    'saint kitts and nevis': 'KN',
    'st. lucia': 'LC',
    'saint lucia': 'LC',
    'st. vincent and the grenadines': 'VC',
    'saint vincent and the grenadines': 'VC',
  };

  function resolveIso(wbId, wbName) {
    if (existing[wbId]) return wbId;
    const nameLower = (wbName || '').toLowerCase();
    return extraMappings[nameLower] || iso2NameMap[nameLower] || null;
  }

  const byCountry = {};
  for (const o of valid) {
    const iso = resolveIso(o.country.id, o.country.value);
    if (!iso) continue;
    if (!byCountry[iso]) byCountry[iso] = [];
    byCountry[iso].push({ year: parseInt(o.date), value: parseFloat(o.value.toFixed(2)) });
  }

  for (const iso of Object.keys(byCountry)) {
    byCountry[iso].sort((a, b) => a.year - b.year);
  }

  let added = 0;
  let skipped = 0;
  let historyAdded = 0;

  for (const [iso, entries] of Object.entries(byCountry)) {
    const entry = existing[iso];
    if (!entry) continue;

    if (entry.unemployment_rate == null && entries.length > 0) {
      const latest = entries[entries.length - 1];
      entry.unemployment_rate = latest.value;
      entry.unemployment_rate_year = latest.year;
      added++;
    } else if (entry.unemployment_rate != null) {
      skipped++;
    }

    if (entry.unemployment_rate_history == null && entries.length > 0) {
      entry.unemployment_rate_history = entries.map(e => [e.year, e.value]);
      historyAdded++;
    }
  }

  console.log('');
  console.log('=== Merging Results ===');
  console.log('Rates added (was null):      ' + added);
  console.log('Rates skipped (exists):      ' + skipped);
  console.log('Histories added (was null): ' + historyAdded);

  let rateCount = 0;
  let histCount = 0;
  const realCount = Object.keys(existing).filter(k => existing[k].name).length;
  for (const entry of Object.values(existing)) {
    if (entry.unemployment_rate != null) rateCount++;
    if (entry.unemployment_rate_history != null) histCount++;
  }

  console.log('');
  console.log('=== Final Coverage ===');
  console.log('unemployment_rate:         ' + rateCount + '/' + realCount + ' (' + Math.round(rateCount / realCount * 100) + '%)');
  console.log('unemployment_rate_history: ' + histCount + '/' + realCount + ' (' + Math.round(histCount / realCount * 100) + '%)');

  atomicWrite(OUT_FILE, JSON.stringify(kdb, null, 2));
  console.log('');
  console.log('Wrote ' + OUT_FILE);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});