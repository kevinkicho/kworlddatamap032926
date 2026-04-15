#!/usr/bin/env node
/**
 * fetch-census-fips.js
 * Resolves US city lat/lng → Census state + place FIPS codes via the
 * Census Geocoder API (no CORS restrictions in Node.js).
 *
 * Output: public/census-fips.json — map of Wikidata QID → { state, place, type, name }
 *
 * Usage:
 *   node scripts/fetch-census-fips.js          # fetch all, skip already cached
 *   node scripts/fetch-census-fips.js --fresh  # overwrite all
 */

const fs   = require('fs');
const path = require('path');

const CITIES_PATH  = path.join(__dirname, '../public/cities-full.json');
const OUTPUT_PATH  = path.join(__dirname, '../public/census-fips.json');
const DELAY_MS     = 150;   // be polite to the public API

const fresh = process.argv.includes('--fresh');

const cities = JSON.parse(fs.readFileSync(CITIES_PATH, 'utf8'));
const usCities = cities.filter(c => c.iso === 'US' && c.lat != null && c.lng != null);

// Load existing results (for resume)
let existing = {};
if (!fresh && fs.existsSync(OUTPUT_PATH)) {
  try { existing = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8')); } catch (_) {}
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function geocode(city) {
  const url = `https://geocoding.geo.census.gov/geocoder/geographies/coordinates` +
    `?x=${city.lng}&y=${city.lat}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const geos = json?.result?.geographies;

  // Try incorporated places first, then county subdivisions
  const place = geos?.['Incorporated Places']?.[0];
  const cousub = geos?.['County Subdivisions']?.[0];
  const county = geos?.['Counties']?.[0];
  const hit = place || cousub;
  if (!hit) return null;
  return {
    state:  hit.STATE,
    place:  place ? place.PLACE : cousub.COUSUB,
    type:   place ? 'place' : 'cousub',
    name:   hit.NAME || city.name,
    county: county?.COUNTY || null,   // 3-digit county FIPS (combine with state for full 5-digit)
    countyName: county?.NAME || null,
  };
}

async function main() {
  const todo = usCities.filter(c => fresh || !existing[c.qid]);
  console.log(`US cities total: ${usCities.length} | to fetch: ${todo.length}`);

  let done = 0, found = 0, notFound = 0;

  for (const city of todo) {
    try {
      const result = await geocode(city);
      if (result) {
        existing[city.qid] = result;
        found++;
      } else {
        existing[city.qid] = null;   // mark as tried-and-not-found
        notFound++;
      }
    } catch (e) {
      console.warn(`  WARN [${city.name}]: ${e.message}`);
    }

    done++;
    if (done % 50 === 0 || done === todo.length) {
      process.stdout.write(`\r  ${done}/${todo.length} | found: ${found} | not found: ${notFound}   `);
      fs.writeFileSync(OUTPUT_PATH, JSON.stringify(existing, null, 2));
    }

    await sleep(DELAY_MS);
  }

  console.log(`\nDone. Writing ${OUTPUT_PATH}`);
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(existing, null, 2));

  const total  = Object.values(existing).filter(Boolean).length;
  const nulls  = Object.values(existing).filter(v => v === null).length;
  console.log(`Results: ${total} FIPS found, ${nulls} not matched`);
}

main().catch(e => { console.error(e); process.exit(1); });
