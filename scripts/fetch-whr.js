#!/usr/bin/env node
/**
 * scripts/fetch-whr.js
 *
 * Downloads World Happiness Report 2024 Excel, extracts Ladder score + 6 factor
 * contributions, and merges them into public/country-data.json.
 *
 * Source: https://files.worldhappiness.report/WHR24_Data_Figure_2.1.xls
 * Coverage: ~143 countries
 *
 * Fields added per ISO2:
 *   whr_score, whr_rank, whr_year (2024)
 *   whr_gdp, whr_social, whr_health, whr_freedom, whr_generosity, whr_corruption
 *
 * Usage: node scripts/fetch-whr.js
 */
'use strict';

const fs   = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');
const xlsx = require('xlsx');

const CD_PATH = path.join(__dirname, '..', 'public', 'country-data.json');
const URL     = 'https://files.worldhappiness.report/WHR24_Data_Figure_2.1.xls';

const WHR_KEYS = [
  'whr_score', 'whr_rank', 'whr_year',
  'whr_gdp', 'whr_social', 'whr_health',
  'whr_freedom', 'whr_generosity', 'whr_corruption',
];

const NAME_OVERRIDES = {
  'united states':                'US',
  'united kingdom':               'GB',
  'south korea':                  'KR',
  'taiwan province of china':     'TW',
  'hong kong s.a.r. of china':    'HK',
  "congo (brazzaville)":          'CG',
  "congo (kinshasa)":             'CD',
  "cote d'ivoire":                'CI',
  'ivory coast':                  'CI',
  'north macedonia':              'MK',
  'laos':                         'LA',
  'iran':                         'IR',
  'russia':                       'RU',
  'syria':                        'SY',
  'vietnam':                      'VN',
  'moldova':                      'MD',
  'kosovo':                       'XK',
  'tanzania':                     'TZ',
  'bolivia':                      'BO',
  'venezuela':                    'VE',
  'somaliland region':            null,
  'slovakia':                     'SK',
  'kyrgyzstan':                   'KG',
  'state of palestine':           'PS',
  'gambia':                       'GM',
  'egypt':                        'EG',
  'yemen':                        'YE',
};

function buildNameLookup(cd) {
  const map = {};
  for (const [iso2, d] of Object.entries(cd)) {
    if (d.name) map[d.name.toLowerCase()] = iso2;
  }
  for (const [name, iso2] of Object.entries(NAME_OVERRIDES)) {
    if (iso2) map[name.toLowerCase()] = iso2;
    else      map[name.toLowerCase()] = null;
  }
  return map;
}

function num(v) {
  const n = parseFloat(v);
  return isNaN(n) ? null : +n.toFixed(3);
}

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  WHR 2024 Fetcher                                ║');
  console.log('╚══════════════════════════════════════════════════╝');

  const cd = JSON.parse(fs.readFileSync(CD_PATH, 'utf8'));

  for (const iso of Object.keys(cd)) {
    for (const k of WHR_KEYS) delete cd[iso][k];
  }

  const lookup = buildNameLookup(cd);

  console.log('Downloading WHR 2024 Excel…');
  const res = await fetch(URL, {
    headers: { 'User-Agent': 'WorldDataMap/1.0 (educational; nodejs)' },
    signal:  AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${URL}`);

  const buf = Buffer.from(await res.arrayBuffer());
  const wb  = xlsx.read(buf, { type: 'buffer' });
  const ws  = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws, { defval: null });
  console.log(`  Parsed ${rows.length} rows from sheet "${wb.SheetNames[0]}"`);

  let merged = 0;
  const unmatched = [];
  let rank = 0;

  for (const row of rows) {
    const name = row['Country name'] || row['country name'] || row['COUNTRY'];
    if (!name || typeof name !== 'string') continue;

    const iso2 = lookup[name.trim().toLowerCase()];
    if (iso2 === null) continue;
    if (!iso2) { unmatched.push(name); continue; }
    rank++;

    if (!cd[iso2]) cd[iso2] = {};
    cd[iso2].whr_score      = num(row['Ladder score']                                 ?? row['Life Ladder']);
    cd[iso2].whr_rank       = rank;
    cd[iso2].whr_year       = 2024;
    cd[iso2].whr_gdp        = num(row['Explained by: Log GDP per capita']);
    cd[iso2].whr_social     = num(row['Explained by: Social support']);
    cd[iso2].whr_health     = num(row['Explained by: Healthy life expectancy']);
    cd[iso2].whr_freedom    = num(row['Explained by: Freedom to make life choices']);
    cd[iso2].whr_generosity = num(row['Explained by: Generosity']);
    cd[iso2].whr_corruption = num(row['Explained by: Perceptions of corruption']);
    merged++;
  }

  if (unmatched.length) {
    console.warn(`\nUnmatched names (${unmatched.length}) — add to NAME_OVERRIDES if needed:`);
    unmatched.forEach(n => console.warn(`  "${n}"`));
  }

  atomicWrite(CD_PATH, JSON.stringify(cd, null, 2), 'utf8');
  console.log(`\nMerged ${merged} WHR countries into country-data.json`);
  console.log(`Total countries in file: ${Object.keys(cd).length}`);
}

main().catch(err => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
