#!/usr/bin/env node
/**
 * fetch-ecb-rates-history.js
 * Fetches ECB deposit facility rate (DFR) and MRO fixed rate (MRR_FR) history
 * from the ECB Data Portal SDMX-JSON API and merges them into public/ecb-data.json.
 *
 * Usage: node scripts/fetch-ecb-rates-history.js
 */

'use strict';

const { readFileSync, writeFileSync } = require('fs');
const path = require('path');

const OUT_PATH = path.join(__dirname, '../public/ecb-data.json');

const SERIES = [
  { field: 'ecb_deposit_rate_history', flowRef: 'FM/B.U2.EUR.4F.KR.DFR.LEV' },
  { field: 'ecb_mro_rate_history',     flowRef: 'FM/B.U2.EUR.4F.KR.MRR_FR.LEV' },
];

const BASE   = 'https://data-api.ecb.europa.eu/service/data';
const PARAMS = 'format=jsondata&detail=dataonly';
// ECB rate series is event-based (date of decision), not monthly.
// Date values come back as YYYY-MM-DD strings.
const START_DATE = '2014-01-01';

async function fetchSeries(flowRef) {
  const url = `${BASE}/${flowRef}?${PARAMS}`;
  console.log(`  GET ${url}`);
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

function parseSDMX(data) {
  const ds = data.dataSets?.[0];
  if (!ds) throw new Error('No dataSets in response');

  // Find the first series key dynamically (usually "0:0:0:0:0:0:0")
  const seriesKey = Object.keys(ds.series)[0];
  if (!seriesKey) throw new Error('No series found in dataSet');

  const observations = ds.series[seriesKey].observations;
  const dateValues = data.structure?.dimensions?.observation?.[0]?.values;
  if (!dateValues) throw new Error('No observation dimension values in structure');

  const result = [];
  for (const [idxStr, obsArr] of Object.entries(observations)) {
    const idx   = parseInt(idxStr, 10);
    const date  = dateValues[idx]?.id;   // e.g. "2014-09"
    const value = obsArr[0];             // first element is the numeric value
    if (!date || value === null || value === undefined) continue;
    if (date < START_DATE) continue;
    result.push([date, value]);
  }

  // Sort ascending by date string (YYYY-MM lexicographic sort works)
  result.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return result;
}

async function main() {
  console.log('Reading existing ecb-data.json …');
  const existing = JSON.parse(readFileSync(OUT_PATH, 'utf8'));

  for (const { field, flowRef } of SERIES) {
    console.log(`\nFetching ${field} …`);
    try {
      const data    = await fetchSeries(flowRef);
      const history = parseSDMX(data);
      existing[field] = history;
      console.log(`  -> ${history.length} observations`);
      if (history.length > 0) {
        console.log(`     First: ${JSON.stringify(history[0])}`);
        console.log(`     Last:  ${JSON.stringify(history[history.length - 1])}`);

        // Quick sanity check: DFR should go negative between 2014-2022
        // (event-based series, so ~10 negative-rate decision points)
        if (field === 'ecb_deposit_rate_history') {
          const negCount = history.filter(([, v]) => v < 0).length;
          console.log(`     Negative-rate decision points: ${negCount} (DFR was negative 2014-2022)`);
        }
      }
    } catch (err) {
      console.error(`  ERROR fetching ${field}: ${err.message}`);
      process.exitCode = 1;
    }
  }

  console.log('\nWriting updated ecb-data.json …');
  writeFileSync(OUT_PATH, JSON.stringify(existing, null, 2));
  console.log('Done.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
