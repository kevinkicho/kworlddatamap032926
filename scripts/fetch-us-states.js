#!/usr/bin/env node
// fetch-us-states.js
// Fetches FRED unemployment rate and per capita personal income for all 50 US states + DC
// Output: public/us-states.json

const { writeFileSync } = require('fs');
const { atomicWrite } = require('./safe-write');
const { join } = require('path');
require('dotenv').config({ path: join(__dirname, '..', '.env') });

const FRED_API_KEY = process.env.FRED_API_KEY;
if (!FRED_API_KEY) {
  console.error('ERROR: FRED_API_KEY is not set in .env');
  process.exit(1);
}
const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';
const OUT_PATH = join(__dirname, '..', 'public', 'us-states.json');

const STATE_META = {
  AL: { name: 'Alabama',              fips: '01' },
  AK: { name: 'Alaska',               fips: '02' },
  AZ: { name: 'Arizona',              fips: '04' },
  AR: { name: 'Arkansas',             fips: '05' },
  CA: { name: 'California',           fips: '06' },
  CO: { name: 'Colorado',             fips: '08' },
  CT: { name: 'Connecticut',          fips: '09' },
  DE: { name: 'Delaware',             fips: '10' },
  DC: { name: 'District of Columbia', fips: '11' },
  FL: { name: 'Florida',              fips: '12' },
  GA: { name: 'Georgia',              fips: '13' },
  HI: { name: 'Hawaii',               fips: '15' },
  ID: { name: 'Idaho',                fips: '16' },
  IL: { name: 'Illinois',             fips: '17' },
  IN: { name: 'Indiana',              fips: '18' },
  IA: { name: 'Iowa',                 fips: '19' },
  KS: { name: 'Kansas',               fips: '20' },
  KY: { name: 'Kentucky',             fips: '21' },
  LA: { name: 'Louisiana',            fips: '22' },
  ME: { name: 'Maine',                fips: '23' },
  MD: { name: 'Maryland',             fips: '24' },
  MA: { name: 'Massachusetts',        fips: '25' },
  MI: { name: 'Michigan',             fips: '26' },
  MN: { name: 'Minnesota',            fips: '27' },
  MS: { name: 'Mississippi',          fips: '28' },
  MO: { name: 'Missouri',             fips: '29' },
  MT: { name: 'Montana',              fips: '30' },
  NE: { name: 'Nebraska',             fips: '31' },
  NV: { name: 'Nevada',               fips: '32' },
  NH: { name: 'New Hampshire',        fips: '33' },
  NJ: { name: 'New Jersey',           fips: '34' },
  NM: { name: 'New Mexico',           fips: '35' },
  NY: { name: 'New York',             fips: '36' },
  NC: { name: 'North Carolina',       fips: '37' },
  ND: { name: 'North Dakota',         fips: '38' },
  OH: { name: 'Ohio',                 fips: '39' },
  OK: { name: 'Oklahoma',             fips: '40' },
  OR: { name: 'Oregon',               fips: '41' },
  PA: { name: 'Pennsylvania',         fips: '42' },
  RI: { name: 'Rhode Island',         fips: '44' },
  SC: { name: 'South Carolina',       fips: '45' },
  SD: { name: 'South Dakota',         fips: '46' },
  TN: { name: 'Tennessee',            fips: '47' },
  TX: { name: 'Texas',                fips: '48' },
  UT: { name: 'Utah',                 fips: '49' },
  VT: { name: 'Vermont',              fips: '50' },
  VA: { name: 'Virginia',             fips: '51' },
  WA: { name: 'Washington',           fips: '53' },
  WV: { name: 'West Virginia',        fips: '54' },
  WI: { name: 'Wisconsin',            fips: '55' },
  WY: { name: 'Wyoming',              fips: '56' },
};

const STATES = Object.keys(STATE_META);

async function fetchSeries(seriesId) {
  const url = `${FRED_BASE}?series_id=${seriesId}&api_key=${FRED_API_KEY}&file_type=json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`FRED ${seriesId}: HTTP ${res.status}`);
  }
  const data = await res.json();
  if (data.error_message) {
    throw new Error(`FRED ${seriesId}: ${data.error_message}`);
  }
  return data.observations || [];
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function processState(abbr) {
  const urSeries = `${abbr}UR`;
  const pcpiSeries = `${abbr}PCPI`;

  const [urObs, pcpiObs] = await Promise.all([
    fetchSeries(urSeries),
    fetchSeries(pcpiSeries),
  ]);

  // --- Unemployment rate ---
  // Filter out missing values, sort ascending
  const urClean = urObs
    .filter(o => o.value !== '.' && o.value != null)
    .map(o => ({ date: o.date.slice(0, 7), val: parseFloat(o.value) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const urLatest = urClean.length > 0 ? urClean[urClean.length - 1] : null;
  const urHistory = urClean.slice(-60).map(o => [o.date, o.val]);

  // --- Per capita personal income ---
  // Annual series — date format YYYY-01-01, keep the year part
  const pcpiClean = pcpiObs
    .filter(o => o.value !== '.' && o.value != null)
    .map(o => ({ year: parseInt(o.date.slice(0, 4)), val: Math.round(parseFloat(o.value)) }))
    .sort((a, b) => a.year - b.year);

  const pcpiLatest = pcpiClean.length > 0 ? pcpiClean[pcpiClean.length - 1] : null;
  const pcpiHistory = pcpiClean.slice(-20).map(o => [o.year, o.val]);

  const result = {
    name: STATE_META[abbr].name,
    fips: STATE_META[abbr].fips,
    unemployment_rate: urLatest ? urLatest.val : null,
    unemployment_rate_date: urLatest ? urLatest.date : null,
    unemployment_history: urHistory,
    pcpi: pcpiLatest ? pcpiLatest.val : null,
    pcpi_year: pcpiLatest ? pcpiLatest.year : null,
    pcpi_history: pcpiHistory,
  };

  console.log(
    `${abbr}  UR=${result.unemployment_rate ?? 'N/A'}% (${result.unemployment_rate_date ?? '-'})` +
    `  PCPI=$${result.pcpi?.toLocaleString() ?? 'N/A'} (${result.pcpi_year ?? '-'})`
  );

  return result;
}

async function main() {
  console.log(`Fetching FRED data for ${STATES.length} states + DC...\n`);
  const output = {};

  for (let i = 0; i < STATES.length; i++) {
    const abbr = STATES[i];
    try {
      output[abbr] = await processState(abbr);
    } catch (err) {
      console.error(`  ERROR for ${abbr}: ${err.message}`);
      output[abbr] = {
        name: STATE_META[abbr].name,
        fips: STATE_META[abbr].fips,
        unemployment_rate: null,
        unemployment_rate_date: null,
        unemployment_history: [],
        pcpi: null,
        pcpi_year: null,
        pcpi_history: [],
      };
    }

    // Rate limit: pause 500ms every 10 states (each state = 2 requests via Promise.all)
    if ((i + 1) % 10 === 0 && i < STATES.length - 1) {
      console.log(`  [Rate limit pause 500ms after ${i + 1} states...]`);
      await sleep(500);
    }
  }

  atomicWrite(OUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\nWrote ${Object.keys(output).length} states to ${OUT_PATH}`);

  // Spot checks
  console.log('\n--- Spot checks ---');
  for (const abbr of ['CA', 'TX', 'NY', 'FL', 'WA']) {
    const s = output[abbr];
    if (s) {
      console.log(`${abbr} (${s.name}): UR=${s.unemployment_rate}%, PCPI=$${s.pcpi?.toLocaleString()}`);
    }
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
