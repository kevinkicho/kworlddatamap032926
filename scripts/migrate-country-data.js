// scripts/migrate-country-data.js
// One-time migration: merge imf-fiscal.json + fred-yields.json into country-data.json.
// Run: node scripts/migrate-country-data.js
'use strict';
const fs   = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');

const PUB  = path.join(__dirname, '..', 'public');
const CD   = path.join(PUB, 'country-data.json');
const IMF  = path.join(PUB, 'imf-fiscal.json');
const FRED = path.join(PUB, 'fred-yields.json');

const cd   = JSON.parse(fs.readFileSync(CD,   'utf8'));
const imf  = JSON.parse(fs.readFileSync(IMF,  'utf8'));
const fred = JSON.parse(fs.readFileSync(FRED, 'utf8'));

let imfMerged = 0, fredMerged = 0;

// Merge IMF fiscal fields — field names match what _cpMerged() currently exposes
for (const [iso2, data] of Object.entries(imf)) {
  if (!cd[iso2]) cd[iso2] = {};
  Object.assign(cd[iso2], data);
  imfMerged++;
}

// Merge FRED yields — rename to match panel field names used via _cpMerged()
for (const [iso2, data] of Object.entries(fred)) {
  if (!cd[iso2]) cd[iso2] = {};
  cd[iso2].bond_yield_10y         = data.yield_10y;
  cd[iso2].bond_yield_10y_date    = data.yield_10y_date;
  cd[iso2].bond_yield_10y_history = data.yield_history;
  fredMerged++;
}

atomicWrite(CD, JSON.stringify(cd, null, 2), 'utf8');
console.log(`Merged ${imfMerged} IMF + ${fredMerged} FRED records into country-data.json`);
console.log(`Total countries in file: ${Object.keys(cd).length}`);
