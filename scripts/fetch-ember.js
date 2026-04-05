#!/usr/bin/env node
/**
 * scripts/fetch-ember.js
 *
 * Downloads Ember Global Electricity Review (long-format CSV), extracts
 * % share of electricity generation per source per country, and merges into
 * public/country-data.json.
 *
 * Sources tried in order:
 *   1. Ember yearly_full_release_long_format.csv
 *   2. Our World in Data owid-energy-data.csv (fallback)
 *
 * Fields added per ISO2:
 *   energy_coal_pct, energy_gas_pct, energy_nuclear_pct,
 *   energy_hydro_pct, energy_wind_solar_pct, energy_year
 *   energy_coal_pct_history  [[year, pct], …]  (2000–latest)
 *
 * Usage: node scripts/fetch-ember.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const CD_PATH = path.join(__dirname, '..', 'public', 'country-data.json');

const EMBER_URL = 'https://ember-climate.org/app/uploads/2022/03/yearly_full_release_long_format.csv';
const OWID_URL  = 'https://raw.githubusercontent.com/owid/energy-data/master/owid-energy-data.csv';

const EMBER_KEYS = [
  'energy_coal_pct', 'energy_gas_pct', 'energy_nuclear_pct',
  'energy_hydro_pct', 'energy_wind_solar_pct', 'energy_year',
  'energy_coal_pct_history',
];

const SKIP_CODES = new Set([
  'ASEAN', 'CIS', 'EU', 'EU27', 'G20', 'G7', 'World',
  'Latin America', 'Middle East', 'North Africa', 'OECD',
  'Other Africa', 'Other Asia & Pacific', 'Other CIS',
  'Other Europe', 'South America', 'Southeast Asia',
]);

const ISO3_TO_ISO2 = {
  AFG:'AF',ALB:'AL',DZA:'DZ',AGO:'AO',ARG:'AR',ARM:'AM',AUS:'AU',AUT:'AT',
  AZE:'AZ',BHS:'BS',BHR:'BH',BGD:'BD',BLR:'BY',BEL:'BE',BEN:'BJ',BOL:'BO',
  BIH:'BA',BWA:'BW',BRA:'BR',BRN:'BN',BGR:'BG',BFA:'BF',BDI:'BI',CPV:'CV',
  KHM:'KH',CMR:'CM',CAN:'CA',CAF:'CF',TCD:'TD',CHL:'CL',CHN:'CN',COL:'CO',
  COD:'CD',COG:'CG',CRI:'CR',CIV:'CI',HRV:'HR',CUB:'CU',CYP:'CY',CZE:'CZ',
  DNK:'DK',DOM:'DO',ECU:'EC',EGY:'EG',SLV:'SV',ERI:'ER',EST:'EE',ETH:'ET',
  FJI:'FJ',FIN:'FI',FRA:'FR',GAB:'GA',GMB:'GM',GEO:'GE',DEU:'DE',GHA:'GH',
  GRC:'GR',GTM:'GT',GIN:'GN',GUY:'GY',HTI:'HT',HND:'HN',HKG:'HK',HUN:'HU',
  ISL:'IS',IND:'IN',IDN:'ID',IRN:'IR',IRQ:'IQ',IRL:'IE',ISR:'IL',ITA:'IT',
  JAM:'JM',JPN:'JP',JOR:'JO',KAZ:'KZ',KEN:'KE',PRK:'KP',KOR:'KR',KWT:'KW',
  KGZ:'KG',LAO:'LA',LVA:'LV',LBN:'LB',LBR:'LR',LBY:'LY',LTU:'LT',LUX:'LU',
  MDG:'MG',MWI:'MW',MYS:'MY',MLI:'ML',MLT:'MT',MRT:'MR',MUS:'MU',MEX:'MX',
  MDA:'MD',MNG:'MN',MNE:'ME',MAR:'MA',MOZ:'MZ',MMR:'MM',NAM:'NA',NPL:'NP',
  NLD:'NL',NZL:'NZ',NIC:'NI',NER:'NE',NGA:'NG',MKD:'MK',NOR:'NO',OMN:'OM',
  PAK:'PK',PAN:'PA',PNG:'PG',PRY:'PY',PER:'PE',PHL:'PH',POL:'PL',PRT:'PT',
  QAT:'QA',ROU:'RO',RUS:'RU',RWA:'RW',SAU:'SA',SEN:'SN',SRB:'RS',SLE:'SL',
  SGP:'SG',SVK:'SK',SVN:'SI',SOM:'SO',ZAF:'ZA',SSD:'SS',ESP:'ES',LKA:'LK',
  SDN:'SD',SUR:'SR',SWZ:'SZ',SWE:'SE',CHE:'CH',SYR:'SY',TWN:'TW',TJK:'TJ',
  TZA:'TZ',THA:'TH',TLS:'TL',TGO:'TG',TTO:'TT',TUN:'TN',TUR:'TR',TKM:'TM',
  UGA:'UG',UKR:'UA',ARE:'AE',GBR:'GB',USA:'US',URY:'UY',UZB:'UZ',VEN:'VE',
  VNM:'VN',YEM:'YE',ZMB:'ZM',ZWE:'ZW',XKX:'XK',PSE:'PS',
};

function parseCSV(text) {
  const lines = text.split('\n');
  if (!lines.length) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(',');
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (cols[j] || '').trim().replace(/^"|"$/g, '');
    }
    rows.push(row);
  }
  return rows;
}

function resolveIso2(raw) {
  if (!raw) return null;
  const s = raw.trim();
  if (SKIP_CODES.has(s)) return null;
  if (s.length === 2) return s.toUpperCase();
  if (s.length === 3) return ISO3_TO_ISO2[s.toUpperCase()] || null;
  return null;
}

function buildHistory(yearValueMap) {
  return Object.entries(yearValueMap)
    .map(([yr, v]) => [Number(yr), v])
    .filter(([yr, v]) => yr >= 2000 && v != null && Number.isFinite(Number(v)))
    .sort((a, b) => a[0] - b[0]);
}

const VARS = ['Coal', 'Gas', 'Nuclear', 'Hydro', 'Wind and Solar'];

const OWID_VAR_MAP = {
  coal_share_elec:        'Coal',
  gas_share_elec:         'Gas',
  nuclear_share_elec:     'Nuclear',
  hydro_share_elec:       'Hydro',
  wind_share_elec:        '_Wind',
  solar_share_elec:       '_Solar',
};

function processEmberRows(rows) {
  const byCountry = {};
  for (const row of rows) {
    const iso2 = resolveIso2(row['Country code'] || row['ISO'] || row['iso2']);
    if (!iso2) continue;
    const variable = (row['Variable'] || row['variable'] || '').trim();
    const year     = parseInt(row['Year'] || row['year']);
    const value    = parseFloat(row['Value'] || row['value']);
    if (!VARS.includes(variable) || isNaN(year) || isNaN(value) || year < 2000) continue;
    if (!byCountry[iso2]) byCountry[iso2] = {};
    if (!byCountry[iso2][variable]) byCountry[iso2][variable] = {};
    byCountry[iso2][variable][year] = +value.toFixed(2);
  }
  return byCountry;
}

function processOwid(rows) {
  const byCountry = {};
  for (const row of rows) {
    const iso2 = resolveIso2(row['iso_code'] || row['ISO code']);
    if (!iso2) continue;
    const year = parseInt(row['year'] || row['Year']);
    if (isNaN(year) || year < 2000) continue;
    for (const [col, variable] of Object.entries(OWID_VAR_MAP)) {
      const v = parseFloat(row[col]);
      if (isNaN(v)) continue;
      if (!byCountry[iso2]) byCountry[iso2] = {};
      if (!byCountry[iso2][variable]) byCountry[iso2][variable] = {};
      byCountry[iso2][variable][year] = +v.toFixed(2);
    }
    // Combine wind + solar into 'Wind and Solar'
    const wind  = parseFloat(row['wind_share_elec']);
    const solar = parseFloat(row['solar_share_elec']);
    if (!isNaN(wind) || !isNaN(solar)) {
      const combined = (isNaN(wind) ? 0 : wind) + (isNaN(solar) ? 0 : solar);
      if (!byCountry[iso2]) byCountry[iso2] = {};
      if (!byCountry[iso2]['Wind and Solar']) byCountry[iso2]['Wind and Solar'] = {};
      byCountry[iso2]['Wind and Solar'][year] = +combined.toFixed(2);
    }
  }
  return byCountry;
}

function latestValue(varMap) {
  if (!varMap) return null;
  const years = Object.keys(varMap).map(Number).sort((a, b) => b - a);
  for (const y of years) {
    const v = varMap[y];
    if (v != null && Number.isFinite(Number(v))) return varMap[y];
  }
  return null;
}

function buildResult(byCountry) {
  const result = {};
  for (const [iso2, variables] of Object.entries(byCountry)) {
    const coalYears = variables['Coal']
      ? Object.keys(variables['Coal']).map(Number).sort((a, b) => b - a)
      : [];
    if (!coalYears.length) continue;
    const latestYear = coalYears[0];

    result[iso2] = {
      energy_coal_pct:       latestValue(variables['Coal']),
      energy_gas_pct:        latestValue(variables['Gas']),
      energy_nuclear_pct:    latestValue(variables['Nuclear']),
      energy_hydro_pct:      latestValue(variables['Hydro']),
      energy_wind_solar_pct: latestValue(variables['Wind and Solar']),
      energy_year:           latestYear,
      energy_coal_pct_history: buildHistory(variables['Coal'] || {}),
    };
  }
  return result;
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'WorldDataMap/1.0 (educational; nodejs)' },
    signal:  AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.text();
}

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  Ember Energy Mix Fetcher                        ║');
  console.log('╚══════════════════════════════════════════════════╝');

  const cd = JSON.parse(fs.readFileSync(CD_PATH, 'utf8'));

  for (const iso of Object.keys(cd)) {
    for (const k of EMBER_KEYS) delete cd[iso][k];
  }

  let byCountry = {};
  let source = 'unknown';

  console.log('Attempting Ember CSV…');
  try {
    const text = await fetchText(EMBER_URL);
    const rows = parseCSV(text);
    console.log(`  Parsed ${rows.length} rows`);
    byCountry = processEmberRows(rows);
    if (Object.keys(byCountry).length > 50) {
      source = 'Ember Global Electricity Review';
    } else {
      throw new Error(`Too few countries (${Object.keys(byCountry).length})`);
    }
  } catch (e) {
    console.warn(`  Ember failed: ${e.message}`);
    byCountry = {};
  }

  if (Object.keys(byCountry).length < 50) {
    console.log('Attempting OWID energy data (fallback)…');
    try {
      const text = await fetchText(OWID_URL);
      const rows = parseCSV(text);
      console.log(`  Parsed ${rows.length} rows`);
      byCountry = processOwid(rows);
      source = 'Our World in Data energy dataset';
    } catch (e) {
      console.error(`  OWID failed: ${e.message}`);
      process.exit(1);
    }
  }

  const result = buildResult(byCountry);
  console.log(`  Built ${Object.keys(result).length} country records from ${source}`);

  let merged = 0;
  for (const [iso2, data] of Object.entries(result)) {
    if (!cd[iso2]) cd[iso2] = {};
    Object.assign(cd[iso2], data);
    merged++;
  }

  fs.writeFileSync(CD_PATH, JSON.stringify(cd, null, 2), 'utf8');
  console.log(`\nMerged ${merged} Ember energy records into country-data.json`);
  console.log(`Total countries in file: ${Object.keys(cd).length}`);
}

main().catch(err => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
