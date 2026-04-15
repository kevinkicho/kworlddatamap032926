#!/usr/bin/env node
/**
 * fetch-indonesia-provinces.js
 *
 * Produces subnational economic data for Indonesia's provinces.
 *   Output: public/indonesia-provinces.json
 *
 * Keys match the "name" property in public/admin1/ID.json (Natural Earth).
 * Note: NE uses pre-2022 boundaries (33 provinces). Newer provinces
 * (Kalimantan Utara, Papua splits) are not in the admin1 file.
 *
 * Fields per province:
 *   name, gdp_tn_idr, gdp_year, gdp_per_capita_idr, population,
 *   unemployment_rate, unemployment_year, hdi, hdi_year
 *
 * Data sources:
 *   GDP (2022): BPS — GRDP at Current Prices by Province.
 *     https://www.bps.go.id/en/statistics-table/2/MTkyMyMy/
 *   Population (2023): BPS — Population Projection 2020-2045.
 *   Unemployment (2023): BPS — Open Unemployment Rate by Province, August 2023.
 *   HDI (2023): BPS — Human Development Index by Province.
 *
 * Usage: node scripts/fetch-indonesia-provinces.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const OUT_PATH = path.join(__dirname, '../public/indonesia-provinces.json');

// GDP in trillion IDR (2022, current prices). Population (2023 est.).
// Unemployment % (Aug 2023). HDI (2023).
const PROVINCES = {
  'Aceh':                { name: 'Aceh',                gdp_tn_idr: 207,  population: 5_371_500,  unemployment_rate: 6.0, hdi: 0.726 },
  'Sumatera Utara':      { name: 'Sumatera Utara',      gdp_tn_idr: 758,  population: 15_115_100, unemployment_rate: 5.9, hdi: 0.729 },
  'Sumatera Barat':      { name: 'Sumatera Barat',      gdp_tn_idr: 253,  population: 5_640_600,  unemployment_rate: 5.9, hdi: 0.736 },
  'Riau':                { name: 'Riau',                gdp_tn_idr: 674,  population: 6_998_300,  unemployment_rate: 4.2, hdi: 0.730 },
  'Jambi':               { name: 'Jambi',               gdp_tn_idr: 198,  population: 3_685_800,  unemployment_rate: 4.5, hdi: 0.718 },
  'Sumatera Selatan':    { name: 'Sumatera Selatan',    gdp_tn_idr: 484,  population: 8_602_100,  unemployment_rate: 4.1, hdi: 0.711 },
  'Bengkulu':            { name: 'Bengkulu',            gdp_tn_idr: 71,   population: 2_067_000,  unemployment_rate: 3.4, hdi: 0.717 },
  'Lampung':             { name: 'Lampung',             gdp_tn_idr: 349,  population: 9_176_100,  unemployment_rate: 4.2, hdi: 0.697 },
  'Bangka-Belitung':     { name: 'Bangka-Belitung',     gdp_tn_idr: 71,   population: 1_517_800,  unemployment_rate: 4.6, hdi: 0.717 },
  'Kepulauan Riau':      { name: 'Kepulauan Riau',      gdp_tn_idr: 277,  population: 2_247_600,  unemployment_rate: 6.8, hdi: 0.766 },
  'Jakarta Raya':        { name: 'DKI Jakarta',         gdp_tn_idr: 2968, population: 10_679_900, unemployment_rate: 6.5, hdi: 0.823 },
  'Jawa Barat':          { name: 'Jawa Barat',          gdp_tn_idr: 2249, population: 49_935_700, unemployment_rate: 7.4, hdi: 0.724 },
  'Jawa Tengah':         { name: 'Jawa Tengah',         gdp_tn_idr: 1337, population: 37_032_400, unemployment_rate: 5.1, hdi: 0.727 },
  'Yogyakarta':          { name: 'DI Yogyakarta',       gdp_tn_idr: 131,  population: 3_939_300,  unemployment_rate: 3.7, hdi: 0.802 },
  'Jawa Timur':          { name: 'Jawa Timur',          gdp_tn_idr: 2319, population: 40_665_600, unemployment_rate: 4.9, hdi: 0.730 },
  'Banten':              { name: 'Banten',              gdp_tn_idr: 685,  population: 12_398_600, unemployment_rate: 7.5, hdi: 0.729 },
  'Bali':                { name: 'Bali',                gdp_tn_idr: 222,  population: 4_380_800,  unemployment_rate: 2.7, hdi: 0.769 },
  'Nusa Tenggara Barat': { name: 'Nusa Tenggara Barat', gdp_tn_idr: 152,  population: 5_431_900,  unemployment_rate: 2.8, hdi: 0.688 },
  'Nusa Tenggara Timur': { name: 'Nusa Tenggara Timur', gdp_tn_idr: 107,  population: 5_605_300,  unemployment_rate: 3.1, hdi: 0.658 },
  'Kalimantan Barat':    { name: 'Kalimantan Barat',    gdp_tn_idr: 186,  population: 5_453_300,  unemployment_rate: 4.8, hdi: 0.688 },
  'Kalimantan Tengah':   { name: 'Kalimantan Tengah',   gdp_tn_idr: 143,  population: 2_769_200,  unemployment_rate: 3.8, hdi: 0.713 },
  'Kalimantan Selatan':  { name: 'Kalimantan Selatan',  gdp_tn_idr: 172,  population: 4_188_800,  unemployment_rate: 4.3, hdi: 0.709 },
  'Kalimantan Timur':    { name: 'Kalimantan Timur',    gdp_tn_idr: 651,  population: 3_898_200,  unemployment_rate: 5.3, hdi: 0.769 },
  'Sulawesi Utara':      { name: 'Sulawesi Utara',      gdp_tn_idr: 137,  population: 2_639_300,  unemployment_rate: 6.1, hdi: 0.738 },
  'Sulawesi Tengah':     { name: 'Sulawesi Tengah',     gdp_tn_idr: 211,  population: 3_068_800,  unemployment_rate: 2.9, hdi: 0.697 },
  'Sulawesi Selatan':    { name: 'Sulawesi Selatan',    gdp_tn_idr: 518,  population: 9_206_200,  unemployment_rate: 4.3, hdi: 0.720 },
  'Sulawesi Tenggara':   { name: 'Sulawesi Tenggara',   gdp_tn_idr: 140,  population: 2_753_600,  unemployment_rate: 3.0, hdi: 0.700 },
  'Gorontalo':           { name: 'Gorontalo',           gdp_tn_idr: 41,   population: 1_246_600,  unemployment_rate: 3.1, hdi: 0.684 },
  'Sulawesi Barat':      { name: 'Sulawesi Barat',      gdp_tn_idr: 51,   population: 1_437_200,  unemployment_rate: 2.3, hdi: 0.666 },
  'Maluku':              { name: 'Maluku',              gdp_tn_idr: 55,   population: 1_869_400,  unemployment_rate: 6.7, hdi: 0.699 },
  'Maluku Utara':        { name: 'Maluku Utara',        gdp_tn_idr: 46,   population: 1_316_500,  unemployment_rate: 4.2, hdi: 0.693 },
  'Papua Barat':         { name: 'Papua Barat',         gdp_tn_idr: 69,   population: 1_149_400,  unemployment_rate: 5.3, hdi: 0.657 },
  'Papua':               { name: 'Papua',               gdp_tn_idr: 222,  population: 4_468_800,  unemployment_rate: 2.7, hdi: 0.607 },
};

// Compute derived fields
for (const key of Object.keys(PROVINCES)) {
  const p = PROVINCES[key];
  p.gdp_year = 2022;
  p.unemployment_year = 2023;
  p.hdi_year = 2023;
  p.gdp_per_capita_idr = Math.round((p.gdp_tn_idr * 1e12) / p.population);
}

const json = JSON.stringify(PROVINCES);
fs.writeFileSync(OUT_PATH, json);
console.log(`✓ Written ${(json.length / 1024).toFixed(1)} KB to ${OUT_PATH}`);
console.log(`  ${Object.keys(PROVINCES).length} provinces`);

const jkt = PROVINCES['Jakarta Raya'];
console.log(`\n  Jakarta: GDP/cap IDR ${(jkt.gdp_per_capita_idr / 1e6).toFixed(1)}M, HDI ${jkt.hdi}, unemployment ${jkt.unemployment_rate}%`);
const pap = PROVINCES['Papua'];
console.log(`  Papua: GDP/cap IDR ${(pap.gdp_per_capita_idr / 1e6).toFixed(1)}M, HDI ${pap.hdi}, unemployment ${pap.unemployment_rate}%`);
