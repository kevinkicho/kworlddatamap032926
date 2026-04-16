#!/usr/bin/env node
/**
 * scripts/fill-population-area.js
 *
 * Fetches country population and area from https://restcountries.com/v3.1/all
 * and merges into public/country-data.json (adding population, population_year,
 * area_km2 fields where missing or null).
 *
 * Usage:
 *   node scripts/fill-population-area.js
 *
 * Safe to re-run — only fills null fields, never overwrites existing values.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const { atomicWrite } = require('./safe-write');

const OUT_FILE = path.join(__dirname, '..', 'public', 'country-data.json');

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'kworlddatamap/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJSON(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode + ' from ' + url));
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log('Fetching country data from restcountries.com...');
  const countries = await fetchJSON('https://restcountries.com/v3.1/all?fields=cca2,name,population,area');
  console.log('Received ' + countries.length + ' countries from API');

  console.log('Loading ' + OUT_FILE + '...');
  const existing = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));

  let added = 0;
  let updated = 0;
  let skipped = 0;
  let unmatched = 0;

  const cca2Map = new Map();
  for (const c of countries) {
    if (c.cca2) cca2Map.set(c.cca2, c);
  }

  const nameToIso = {};
  for (const [iso, entry] of Object.entries(existing)) {
    if (entry.name) nameToIso[entry.name.toLowerCase()] = iso;
  }

  const extraMappings = {
    'united states of america': 'US',
    'united states': 'US',
    'united kingdom': 'GB',
    'russian federation': 'RU',
    'korea, republic of': 'KR',
    'south korea': 'KR',
    "korea, democratic people's republic of": 'KP',
    'north korea': 'KP',
    'china': 'CN',
    'viet nam': 'VN',
    'czechia': 'CZ',
    'brunei': 'BN',
    'cabo verde': 'CV',
    'congo': 'CG',
    'democratic republic of the congo': 'CD',
    'congo, democratic republic of the': 'CD',
    'iran, islamic republic of': 'IR',
    'iran': 'IR',
    'macedonia, the former yugoslav republic of': 'MK',
    'north macedonia': 'MK',
    'taiwan, province of china': 'TW',
    'taiwan': 'TW',
    'republic of moldova': 'MD',
    'moldova': 'MD',
    'syrian arab republic': 'SY',
    'syria': 'SY',
    "lao people's democratic republic": 'LA',
    'laos': 'LA',
    'bolivia, plurinational state of': 'BO',
    'bolivia': 'BO',
    'venezuela, bolivarian republic of': 'VE',
    'venezuela': 'VE',
    'tanzania, united republic of': 'TZ',
    'tanzania': 'TZ',
    'eswatini': 'SZ',
    'micronesia, federated states of': 'FM',
    'palestine, state of': 'PS',
    'kosovo': 'XK',
    'netherlands': 'NL',
    'saint helena, ascension and tristan da cunha': 'SH',
    'turkiye': 'TR',
    'ivory coast': 'CI',
    "côte d'ivoire": 'CI',
    'sao tome and principe': 'ST',
    'holy see': 'VA',
    'svalbard and jan mayen': 'SJ',
    'aland islands': 'AX',
    'guernsey': 'GG',
    'jersey': 'JE',
    'isle of man': 'IM',
    'gibraltar': 'GI',
    'san marino': 'SM',
    'monaco': 'MC',
    'liechtenstein': 'LI',
    'andorra': 'AD',
    'dominica': 'DM',
    'marshall islands': 'MH',
    'palau': 'PW',
    'nauru': 'NR',
    'tuvalu': 'TV',
    'kiribati': 'KI',
    'singapore': 'SG',
    'bahamas': 'BS',
    'antigua and barbuda': 'AG',
    'saint kitts and nevis': 'KN',
    'saint lucia': 'LC',
    'saint vincent and the grenadines': 'VC',
    'grenada': 'GD',
    'seychelles': 'SC',
    'maldives': 'MV',
    'barbados': 'BB',
    'samoa': 'WS',
    'vanuatu': 'VU',
    'bhutan': 'BT',
    'brunei darussalam': 'BN',
    'cambodia': 'KH',
    'timor-leste': 'TL',
    'eritrea': 'ER',
    'qatar': 'QA',
    'kuwait': 'KW',
    'bahrain': 'BH',
    'iceland': 'IS',
    'luxembourg': 'LU',
    'montenegro': 'ME',
    'serbia': 'RS',
    'oman': 'OM',
    'malta': 'MT',
    'curacao': 'CW',
    'aruba': 'AW',
  };

  for (const c of countries) {
    const iso = c.cca2;
    if (!iso) continue;

    let entry = existing[iso];

    if (!entry) {
      const nameLower = (c.name && c.name.common) ? c.name.common.toLowerCase() : '';
      const mappedIso = extraMappings[nameLower] || nameToIso[nameLower];
      if (mappedIso && existing[mappedIso]) {
        entry = existing[mappedIso];
      }
    }

    if (!entry) {
      if (c.population > 0 || (c.area && c.area > 0)) {
        unmatched++;
        const name = (c.name && c.name.common) || iso;
        if (unmatched <= 20) console.log('  Unmatched: ' + iso + ' (' + name + ')');
      }
      continue;
    }

    let changed = false;

    if (c.population != null && c.population > 0 && entry.population == null) {
      entry.population = c.population;
      entry.population_year = '2024';
      added++;
      changed = true;
    } else if (c.population != null && c.population > 0 && entry.population != null) {
      updated++;
    } else {
      skipped++;
    }

    if (c.area != null && c.area > 0 && entry.area_km2 == null) {
      entry.area_km2 = Math.round(c.area * 10) / 10;
      changed = true;
    }
  }

  console.log('');
  console.log('=== Merging Results ===');
  console.log('Fields added (was null):   ' + added);
  console.log('Fields updated (existing):  ' + updated);
  console.log('Fields skipped (no data):   ' + skipped);
  console.log('Unmatched API countries:    ' + unmatched);

  let popCount = 0;
  let areaCount = 0;
  const realCount = Object.keys(existing).filter(k => existing[k].name).length;
  for (const [iso, entry] of Object.entries(existing)) {
    if (entry.population != null) popCount++;
    if (entry.area_km2 != null) areaCount++;
  }
  console.log('');
  console.log('=== Final Coverage ===');
  console.log('population:    ' + popCount + '/' + realCount + ' (' + Math.round(popCount / realCount * 100) + '%)');
  console.log('area_km2:      ' + areaCount + '/' + realCount + ' (' + Math.round(areaCount / realCount * 100) + '%)');

  atomicWrite(OUT_FILE, JSON.stringify(existing, null, 2));
  console.log('');
  console.log('Wrote ' + OUT_FILE);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});