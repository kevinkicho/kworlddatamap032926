#!/usr/bin/env node
/**
 * fetch-census-data.js
 * Downloads ACS 5-Year economic/housing data for all US cities that have
 * a Census FIPS code in census-fips.json. Batches by state (one API call
 * per state) so the whole run takes ~10 seconds instead of ~70.
 *
 * Output: public/census-cities.json — map of Wikidata QID → indicator object
 *
 * Usage:
 *   node scripts/fetch-census-data.js
 *   node scripts/fetch-census-data.js --fresh   # ignore existing output
 *   node scripts/fetch-census-data.js --year 2022
 */

const fs   = require('fs');
const path = require('path');

const FIPS_PATH    = path.join(__dirname, '../public/census-fips.json');
const OUTPUT_PATH  = path.join(__dirname, '../public/census-cities.json');
const YEAR         = process.argv.includes('--year')
  ? process.argv[process.argv.indexOf('--year') + 1]
  : '2023';
const FRESH        = process.argv.includes('--fresh');
const DELAY_MS     = 300;

const ACS_VARS = [
  'NAME',
  'B19013_001E',                              // median household income
  'B19001_001E',                              // total households
  'B19001_002E','B19001_003E',                // <10k, 10-15k
  'B19001_004E','B19001_005E',                // 15-20k, 20-25k
  'B19001_006E','B19001_007E','B19001_008E',  // 25-30k, 30-35k, 35-40k
  'B19001_009E','B19001_010E',                // 40-45k, 45-50k
  'B19001_011E','B19001_012E',                // 50-60k, 60-75k
  'B19001_013E',                              // 75-100k
  'B19001_014E','B19001_015E',                // 100-125k, 125-150k
  'B19001_016E',                              // 150-200k
  'B19001_017E',                              // 200k+
  'B17001_001E','B17001_002E',                // poverty universe, below poverty
  'B23025_002E','B23025_005E',                // labor force, unemployed
  'B25070_001E',                              // renter universe
  'B25070_007E','B25070_008E',                // rent 30-35%, 35-40%
  'B25070_009E','B25070_010E',                // rent 40-50%, 50%+
  'B25064_001E',                              // median gross rent
  'B25077_001E',                              // median home value
  'B19083_001E',                              // Gini index
  'B22003_001E','B22003_002E',                // SNAP universe, recipients
  'B15003_001E','B15003_022E',                // education universe, bachelor's+
  'B15003_023E','B15003_024E','B15003_025E',  // master's, professional, doctorate
  'B08301_001E','B08301_010E',                // commute universe, public transit
  'B08303_001E','B08303_013E',                // travel time universe, 60min+
  'B01002_001E',                              // median age
  'B11001_001E','B11001_002E',                // household universe, family households
  'B25002_001E','B25002_003E',                // housing unit universe, vacant
  'B25003_001E','B25003_002E',                // tenure universe, owner-occupied
].join(',');

const sleep = ms => new Promise(r => setTimeout(r, ms));

function parseRow(headers, vals) {
  const get = key => {
    const i = headers.indexOf(key);
    const v = i >= 0 ? parseFloat(vals[i]) : NaN;
    return isNaN(v) || v < 0 ? null : v;
  };

  const totalHH  = get('B19001_001E') || 1;
  const lf       = get('B23025_002E') || 1;
  const rentU    = get('B25070_001E') || 1;
  const snapU    = get('B22003_001E') || 1;
  const eduU     = get('B15003_001E') || 1;
  const commuteU = get('B08301_001E') || 1;
  const ttU      = get('B08303_001E') || 1;
  const housingU = get('B25002_001E') || 1;
  const tenureU  = get('B25003_001E') || 1;
  const familyU  = get('B11001_001E') || 1;

  // 8 consolidated income brackets (% of households)
  const bracketCounts = [
    (get('B19001_002E') || 0) + (get('B19001_003E') || 0),
    (get('B19001_004E') || 0) + (get('B19001_005E') || 0),
    (get('B19001_006E') || 0) + (get('B19001_007E') || 0) + (get('B19001_008E') || 0) +
      (get('B19001_009E') || 0) + (get('B19001_010E') || 0),
    (get('B19001_011E') || 0) + (get('B19001_012E') || 0),
    (get('B19001_013E') || 0),
    (get('B19001_014E') || 0) + (get('B19001_015E') || 0),
    (get('B19001_016E') || 0),
    (get('B19001_017E') || 0),
  ];
  const brackets = bracketCounts.map(v => +(v / totalHH * 100).toFixed(2));

  const bachelorPlus = (get('B15003_022E') || 0) + (get('B15003_023E') || 0) +
    (get('B15003_024E') || 0) + (get('B15003_025E') || 0);
  const burdenedRenters = (get('B25070_007E') || 0) + (get('B25070_008E') || 0) +
    (get('B25070_009E') || 0) + (get('B25070_010E') || 0);

  return {
    placeName:        vals[headers.indexOf('NAME')],
    medianIncome:     get('B19013_001E'),
    brackets,
    povertyPct:       get('B17001_002E') != null ? +(get('B17001_002E') / (get('B17001_001E') || 1) * 100).toFixed(2) : null,
    unemploymentPct:  get('B23025_005E') != null ? +(get('B23025_005E') / lf * 100).toFixed(2) : null,
    rentBurdenedPct:  +(burdenedRenters / rentU * 100).toFixed(2),
    medianRent:       get('B25064_001E'),
    medianHomeValue:  get('B25077_001E'),
    gini:             get('B19083_001E') != null ? +get('B19083_001E').toFixed(4) : null,
    snapPct:          get('B22003_002E') != null ? +(get('B22003_002E') / snapU * 100).toFixed(2) : null,
    bachelorPlusPct:  +(bachelorPlus / eduU * 100).toFixed(2),
    transitPct:       get('B08301_010E') != null ? +(get('B08301_010E') / commuteU * 100).toFixed(2) : null,
    longCommutePct:   get('B08303_013E') != null ? +(get('B08303_013E') / ttU * 100).toFixed(2) : null,
    medianAge:        get('B01002_001E'),
    vacancyPct:       get('B25002_003E') != null ? +(get('B25002_003E') / housingU * 100).toFixed(2) : null,
    ownerOccPct:      get('B25003_002E') != null ? +(get('B25003_002E') / tenureU * 100).toFixed(2) : null,
    familyHHPct:      get('B11001_002E') != null ? +(get('B11001_002E') / familyU * 100).toFixed(2) : null,
    year:             parseInt(YEAR),
  };
}

async function fetchStateData(stateFips, type) {
  const geoFor = type === 'place'
    ? `for=place:*&in=state:${stateFips}`
    : `for=county+subdivision:*&in=state:${stateFips}`;
  const url = `https://api.census.gov/data/${YEAR}/acs/acs5?get=${ACS_VARS}&${geoFor}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`  WARN state ${stateFips} (${type}): HTTP ${res.status}`);
    return null;
  }
  const json = await res.json();
  if (!Array.isArray(json) || json.length < 2) return null;
  return json;
}

async function main() {
  if (!fs.existsSync(FIPS_PATH)) {
    console.error('census-fips.json not found — run fetch-census-fips.js first');
    process.exit(1);
  }
  const fipsMap = JSON.parse(fs.readFileSync(FIPS_PATH, 'utf8'));

  // Load existing output for resume
  let existing = {};
  if (!FRESH && fs.existsSync(OUTPUT_PATH)) {
    try { existing = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8')); } catch (_) {}
  }

  // Group cities by state + type, skip already fetched
  const stateGroups = {};  // `${state}:${type}` → Map<placeFips, qid[]>
  for (const [qid, fips] of Object.entries(fipsMap)) {
    if (!fips) continue;
    if (!FRESH && existing[qid]) continue;   // already have data
    const key = `${fips.state}:${fips.type}`;
    if (!stateGroups[key]) stateGroups[key] = new Map();
    const pf = fips.place;
    if (!stateGroups[key].has(pf)) stateGroups[key].set(pf, []);
    stateGroups[key].get(pf).push(qid);
  }

  const groups = Object.entries(stateGroups);
  console.log(`States/types to fetch: ${groups.length} | cities to process: ${Object.keys(fipsMap).filter(q => !existing[q] || FRESH).length}`);

  let statesDone = 0, citiesDone = 0;
  for (const [key, placeMap] of groups) {
    const [stateFips, type] = key.split(':');
    process.stdout.write(`\r  [${++statesDone}/${groups.length}] state ${stateFips} (${type})…`);

    const rows = await fetchStateData(stateFips, type);
    if (!rows) { await sleep(DELAY_MS); continue; }

    const headers = rows[0];
    const placeCol = type === 'place' ? headers.indexOf('place') : headers.indexOf('county subdivision');

    for (const vals of rows.slice(1)) {
      const placeFips = placeCol >= 0 ? vals[placeCol] : null;
      if (!placeFips) continue;
      const qids = placeMap.get(placeFips);
      if (!qids) continue;
      const parsed = parseRow(headers, vals);
      for (const qid of qids) { existing[qid] = parsed; citiesDone++; }
    }

    await sleep(DELAY_MS);
  }

  console.log(`\nParsed ${citiesDone} cities. Writing ${OUTPUT_PATH}…`);
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(existing));

  const withData = Object.values(existing).filter(v => v && v.medianIncome).length;
  const total    = Object.values(existing).filter(Boolean).length;
  console.log(`Done: ${withData}/${total} cities have median income data.`);
}

main().catch(e => { console.error(e); process.exit(1); });
