// scripts/write-manifest.js
// Generates public/data-manifest.json — a registry of every data file.
// Re-run after any file is added or updated to keep coverage counts current.
// Run: node scripts/write-manifest.js
'use strict';
const fs   = require('fs');
const path = require('path');

const PUB = path.join(__dirname, '..', 'public');

function readJson(name) {
  try { return JSON.parse(fs.readFileSync(path.join(PUB, name), 'utf8')); }
  catch { return null; }
}

const countryData  = readJson('country-data.json');
const cities       = readJson('cities-full.json');
const companies    = readJson('companies.json');
const eurostat     = readJson('eurostat-cities.json');
const zillow       = readJson('zillow-cities.json');
const census       = readJson('census-cities.json');
const climate      = readJson('climate-extra.json');
const gawc         = readJson('gawc-cities.json');
const airport      = readJson('airport-connectivity.json');
const bea          = readJson('bea-trade.json');

// Helper: first available field names from a sample entry
const sampleFields = obj => obj ? Object.keys(Object.values(obj)[0] || {}) : [];
const sampleArrFields = arr => arr ? Object.keys(arr[0] || {}) : [];

const today = new Date().toISOString().slice(0, 7); // YYYY-MM

const manifest = {
  'country-data':         { key: 'iso2',  coverage: countryData ? Object.keys(countryData).length : 0,  fields: sampleFields(countryData),  updated: today },
  'cities-full':          { key: 'array', coverage: cities ? cities.length : 0,                          fields: sampleArrFields(cities),     updated: today },
  'companies':            { key: 'qid',   coverage: companies ? Object.keys(companies).length : 0,       fields: companies ? Object.keys((Object.values(companies)[0]||[])[0]||{}) : [], updated: today },
  'eurostat-cities':      { key: 'qid',   coverage: eurostat ? Object.keys(eurostat).length : 0,  region: 'EU', fields: sampleFields(eurostat),  updated: today },
  'zillow-cities':        { key: 'qid',   coverage: zillow   ? Object.keys(zillow).length   : 0,  region: 'US', fields: sampleFields(zillow),    updated: today },
  'census-cities':        { key: 'qid',   coverage: census   ? Object.keys(census).length   : 0,  region: 'US', fields: sampleFields(census),    updated: today },
  'climate-extra':        { key: 'qid',   coverage: climate  ? Object.keys(climate).length  : 0,         fields: ['months'],                   updated: today },
  'gawc-cities':          { key: 'qid',   coverage: gawc     ? Object.keys(gawc).length     : 0,         fields: sampleFields(gawc),           updated: today },
  'airport-connectivity': { key: 'qid',   coverage: airport  ? Object.keys(airport).length  : 0,         fields: sampleFields(airport),        updated: today },
  'bea-trade':            { key: 'iso2',  coverage: bea      ? Object.keys(bea).length       : 0,  region: 'US-bilateral', fields: ['expGds', 'impGds'], updated: today },
};

const OUT = path.join(PUB, 'data-manifest.json');
fs.writeFileSync(OUT, JSON.stringify(manifest, null, 2), 'utf8');
console.log('Written data-manifest.json:');
for (const [name, entry] of Object.entries(manifest)) {
  console.log(`  ${name.padEnd(24)} key:${entry.key.padEnd(6)} coverage:${String(entry.coverage).padStart(5)}`);
}
