// scripts/write-manifest.js
// Generates public/data-manifest.json — a registry of every data file.
// Re-run after any file is added or updated to keep coverage counts current.
// Run: node scripts/write-manifest.js
'use strict';
const fs   = require('fs');
const { atomicWrite } = require('./safe-write');
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
const ecb          = readJson('ecb-data.json');
const ecbBonds     = readJson('ecb-bonds.json');
const boj          = readJson('boj-yields.json');
const oecd         = readJson('oecd-country.json');
const comtrade     = readJson('comtrade-partners.json');
const noaaClimate  = readJson('noaa-climate.json');
const japan        = readJson('japan-prefectures.json');
const censusB      = readJson('census-business.json');
const usStates     = readJson('us-states.json');
const eurostatReg  = readJson('eurostat-regions.json');
const canadaProv   = readJson('canada-provinces.json');
const australiaSt  = readJson('australia-states.json');
const whoAirQual   = readJson('who-airquality.json');
const universities = readJson('universities.json');
const fbiCrime     = readJson('fbi-crime.json');
const eciData      = readJson('eci-data.json');
const metroTransit = readJson('metro-transit.json');
const nobelCities  = readJson('nobel-cities.json');

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
  'bea-trade':            { key: 'iso2',  coverage: bea          ? Object.keys(bea).length          : 0,  region: 'US-bilateral', fields: ['expGds', 'impGds'], updated: today },
  'ecb-data':             { key: 'single',coverage: ecb          ? (ecb.eurozone_countries?.length ?? 0) : 0, fields: ['ecb_deposit_rate','ecb_mro_rate','euribor_3m','euribor_3m_history','countries'], updated: today },
  'ecb-bonds':            { key: 'iso2',  coverage: ecbBonds     ? Object.keys(ecbBonds).length     : 0,  region: 'EU', fields: ['bond_yield_10y','bond_yield_10y_history','spread_vs_de_bps'], updated: today },
  'boj-yields':           { key: 'iso2',  coverage: boj          ? Object.keys(boj).length          : 0,  region: 'JP', fields: ['bond_yield_10y','bond_yield_10y_history','bond_yield_2y','bond_yield_5y'], updated: today },
  'oecd-country':         { key: 'iso2',  coverage: oecd         ? Object.keys(oecd).length         : 0,  fields: ['rd_spend_pct','tax_revenue_pct','hours_worked','tertiary_pct','pisa_reading','min_wage_usd_ppp'], updated: today },
  'comtrade-partners':    { key: 'iso2',  coverage: comtrade     ? Object.keys(comtrade).length     : 0,  fields: ['top_exports','top_imports','year'], updated: today },
  'noaa-climate':         { key: 'qid',   coverage: noaaClimate  ? Object.keys(noaaClimate).length  : 0,  region: 'US', fields: ['months','source','station'], updated: today },
  'japan-prefectures':    { key: 'name',  coverage: japan        ? Object.keys(japan).length        : 0,  region: 'JP', fields: sampleFields(japan), updated: today },
  'census-business':      { key: 'qid',   coverage: censusB      ? Object.keys(censusB).length      : 0,  region: 'US', fields: sampleFields(censusB), updated: today },
  'us-states':            { key: 'abbr',  coverage: usStates     ? Object.keys(usStates).length     : 0,  region: 'US', fields: ['unemployment_rate','pcpi','unemployment_history','pcpi_history'], updated: today },
  'eurostat-regions':     { key: 'nuts2', coverage: eurostatReg  ? Object.keys(eurostatReg).length  : 0,  region: 'EU', fields: ['name','country_iso2','unemployment_rate','gdp_pps_eu100','unemployment_history','gdp_pps_history'], updated: today },
  'canada-provinces':     { key: 'abbr',  coverage: canadaProv   ? Object.keys(canadaProv).length   : 0,  region: 'CA', fields: ['name','unemployment_rate','gdp_bn_cad','gdp_per_capita_cad','unemployment_history','gdp_history'], updated: today },
  'australia-states':     { key: 'abbr',  coverage: australiaSt  ? Object.keys(australiaSt).length  : 0,  region: 'AU', fields: ['name','unemployment_rate','gsp_bn_aud','gsp_per_capita_aud','unemployment_history','gsp_history'], updated: today },
  'who-airquality':       { key: 'qid',   coverage: whoAirQual   ? Object.keys(whoAirQual).length   : 0,         fields: ['pm25','year','category'], updated: today },
  'universities':         { key: 'qid',   coverage: universities ? Object.keys(universities).length : 0,         fields: ['qid','name','founded','students'], updated: today },
  'fbi-crime':            { key: 'qid',   coverage: fbiCrime     ? Object.keys(fbiCrime).length     : 0,  region: 'US', fields: ['violentPer100k','propertyPer100k','year'], updated: today },
  'eci-data':             { key: 'iso2',  coverage: eciData      ? Object.keys(eciData).length      : 0,         fields: ['eci','year'], updated: today },
  'metro-transit':        { key: 'qid',   coverage: metroTransit ? Object.keys(metroTransit).length  : 0,         fields: ['name','lines','stations','opened'], updated: today },
  'nobel-cities':         { key: 'qid',   coverage: nobelCities  ? Object.keys(nobelCities).length   : 0,         fields: ['total','byPrize'], updated: today },
};

const OUT = path.join(PUB, 'data-manifest.json');
atomicWrite(OUT, JSON.stringify(manifest, null, 2), 'utf8');
console.log('Written data-manifest.json:');
for (const [name, entry] of Object.entries(manifest)) {
  console.log(`  ${name.padEnd(24)} key:${entry.key.padEnd(6)} coverage:${String(entry.coverage).padStart(5)}`);
}
