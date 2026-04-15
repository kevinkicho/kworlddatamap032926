#!/usr/bin/env node
/**
 * scripts/fetch-carbon.js
 *
 * Merges CO₂ emissions data into public/country-data.json.
 *
 * Fields added:
 *   co2_total_mt        — Total CO₂ emissions (million tonnes)
 *   co2_per_capita      — CO₂ emissions per capita (tonnes)
 *   co2_coal_pct        — % from coal
 *   co2_oil_pct         — % from oil
 *   co2_gas_pct         — % from gas
 *   co2_cement_pct      — % from cement
 *   co2_year            — Data year
 *
 * Sources: Global Carbon Project 2023, Our World in Data (CO₂ dataset).
 * Curated static table — 60 largest emitters covering ~95% of global emissions.
 *
 * Usage: node scripts/fetch-carbon.js
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const CD_PATH = path.join(__dirname, '..', 'public', 'country-data.json');

// Top 60 CO₂ emitters: total (Mt), per capita (t), fuel breakdown (%)
// Source: Global Carbon Project 2023 / Our World in Data (2022 data year)
const CO2_DATA = {
  CN: { total: 11397, pc: 8.0,  coal: 65, oil: 17, gas: 9,  cement: 8, yr: 2022 },
  US: { total: 5057,  pc: 15.0, coal: 21, oil: 44, gas: 32, cement: 1, yr: 2022 },
  IN: { total: 2830,  pc: 2.0,  coal: 55, oil: 25, gas: 7,  cement: 12, yr: 2022 },
  RU: { total: 1942,  pc: 13.5, coal: 18, oil: 33, gas: 46, cement: 2, yr: 2022 },
  JP: { total: 1080,  pc: 8.6,  coal: 32, oil: 37, gas: 25, cement: 4, yr: 2022 },
  IR: { total: 749,   pc: 8.8,  coal: 1,  oil: 35, gas: 60, cement: 4, yr: 2022 },
  DE: { total: 666,   pc: 8.0,  coal: 33, oil: 34, gas: 26, cement: 3, yr: 2022 },
  KR: { total: 616,   pc: 12.0, coal: 38, oil: 33, gas: 21, cement: 6, yr: 2022 },
  SA: { total: 586,   pc: 16.0, coal: 0,  oil: 52, gas: 46, cement: 2, yr: 2022 },
  ID: { total: 580,   pc: 2.1,  coal: 41, oil: 32, gas: 15, cement: 10, yr: 2022 },
  CA: { total: 545,   pc: 14.2, coal: 8,  oil: 48, gas: 39, cement: 2, yr: 2022 },
  BR: { total: 478,   pc: 2.2,  coal: 7,  oil: 47, gas: 12, cement: 5, yr: 2022 },
  MX: { total: 421,   pc: 3.3,  coal: 6,  oil: 50, gas: 37, cement: 5, yr: 2022 },
  AU: { total: 392,   pc: 15.0, coal: 39, oil: 36, gas: 21, cement: 1, yr: 2022 },
  TR: { total: 391,   pc: 4.6,  coal: 36, oil: 31, gas: 24, cement: 7, yr: 2022 },
  GB: { total: 338,   pc: 5.0,  coal: 5,  oil: 45, gas: 40, cement: 2, yr: 2022 },
  ZA: { total: 435,   pc: 7.3,  coal: 72, oil: 17, gas: 4,  cement: 3, yr: 2022 },
  PL: { total: 305,   pc: 8.0,  coal: 50, oil: 26, gas: 17, cement: 3, yr: 2022 },
  IT: { total: 327,   pc: 5.5,  coal: 7,  oil: 39, gas: 44, cement: 5, yr: 2022 },
  FR: { total: 299,   pc: 4.5,  coal: 4,  oil: 47, gas: 36, cement: 4, yr: 2022 },
  TH: { total: 278,   pc: 3.9,  coal: 22, oil: 37, gas: 31, cement: 7, yr: 2022 },
  EG: { total: 258,   pc: 2.4,  coal: 1,  oil: 38, gas: 56, cement: 5, yr: 2022 },
  PK: { total: 213,   pc: 0.9,  coal: 13, oil: 30, gas: 38, cement: 8, yr: 2022 },
  VN: { total: 299,   pc: 3.1,  coal: 51, oil: 23, gas: 11, cement: 12, yr: 2022 },
  AE: { total: 190,   pc: 19.3, coal: 2,  oil: 32, gas: 62, cement: 4, yr: 2022 },
  MY: { total: 260,   pc: 7.8,  coal: 27, oil: 33, gas: 32, cement: 5, yr: 2022 },
  KZ: { total: 195,   pc: 10.2, coal: 51, oil: 19, gas: 26, cement: 3, yr: 2022 },
  UA: { total: 130,   pc: 3.0,  coal: 30, oil: 18, gas: 40, cement: 3, yr: 2022 },
  AR: { total: 175,   pc: 3.8,  coal: 2,  oil: 40, gas: 51, cement: 3, yr: 2022 },
  IQ: { total: 184,   pc: 4.2,  coal: 0,  oil: 54, gas: 40, cement: 5, yr: 2022 },
  NL: { total: 144,   pc: 8.2,  coal: 11, oil: 38, gas: 40, cement: 2, yr: 2022 },
  PH: { total: 170,   pc: 1.5,  coal: 42, oil: 33, gas: 12, cement: 11, yr: 2022 },
  BD: { total: 100,   pc: 0.6,  coal: 8,  oil: 26, gas: 55, cement: 8, yr: 2022 },
  CL: { total: 82,    pc: 4.2,  coal: 20, oil: 42, gas: 15, cement: 4, yr: 2022 },
  CZ: { total: 96,    pc: 9.0,  coal: 42, oil: 30, gas: 20, cement: 3, yr: 2022 },
  BE: { total: 94,    pc: 8.1,  coal: 5,  oil: 47, gas: 33, cement: 5, yr: 2022 },
  NO: { total: 42,    pc: 7.8,  coal: 3,  oil: 43, gas: 39, cement: 2, yr: 2022 },
  SE: { total: 38,    pc: 3.6,  coal: 7,  oil: 50, gas: 6,  cement: 7, yr: 2022 },
  AT: { total: 63,    pc: 7.0,  coal: 8,  oil: 40, gas: 38, cement: 5, yr: 2022 },
  FI: { total: 38,    pc: 6.9,  coal: 13, oil: 39, gas: 8,  cement: 3, yr: 2022 },
  DK: { total: 29,    pc: 5.0,  coal: 9,  oil: 42, gas: 18, cement: 3, yr: 2022 },
  PT: { total: 42,    pc: 4.1,  coal: 5,  oil: 52, gas: 26, cement: 5, yr: 2022 },
  NZ: { total: 33,    pc: 6.4,  coal: 8,  oil: 48, gas: 17, cement: 2, yr: 2022 },
  IE: { total: 34,    pc: 6.7,  coal: 4,  oil: 46, gas: 33, cement: 5, yr: 2022 },
  GR: { total: 56,    pc: 5.3,  coal: 16, oil: 46, gas: 25, cement: 5, yr: 2022 },
  IL: { total: 66,    pc: 7.1,  coal: 25, oil: 37, gas: 33, cement: 4, yr: 2022 },
  HU: { total: 47,    pc: 4.8,  coal: 12, oil: 32, gas: 40, cement: 3, yr: 2022 },
  RO: { total: 72,    pc: 3.7,  coal: 18, oil: 30, gas: 31, cement: 4, yr: 2022 },
  CO: { total: 80,    pc: 1.5,  coal: 8,  oil: 48, gas: 24, cement: 7, yr: 2022 },
  PE: { total: 52,    pc: 1.5,  coal: 3,  oil: 51, gas: 25, cement: 9, yr: 2022 },
  NG: { total: 130,   pc: 0.6,  coal: 1,  oil: 38, gas: 32, cement: 5, yr: 2022 },
  QA: { total: 100,   pc: 35.6, coal: 0,  oil: 22, gas: 74, cement: 3, yr: 2022 },
  KW: { total: 90,    pc: 21.0, coal: 0,  oil: 50, gas: 47, cement: 2, yr: 2022 },
  BH: { total: 36,    pc: 23.4, coal: 0,  oil: 18, gas: 78, cement: 3, yr: 2022 },
  OM: { total: 68,    pc: 14.5, coal: 0,  oil: 36, gas: 60, cement: 3, yr: 2022 },
  TW: { total: 275,   pc: 11.6, coal: 45, oil: 28, gas: 20, cement: 5, yr: 2022 },
  SG: { total: 48,    pc: 8.5,  coal: 1,  oil: 45, gas: 50, cement: 1, yr: 2022 },
  CH: { total: 35,    pc: 4.0,  coal: 1,  oil: 52, gas: 22, cement: 4, yr: 2022 },
  SK: { total: 33,    pc: 6.0,  coal: 18, oil: 30, gas: 28, cement: 4, yr: 2022 },
  ES: { total: 224,   pc: 4.7,  coal: 5,  oil: 48, gas: 30, cement: 5, yr: 2022 },
};

function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  Global Carbon Project — CO₂ emissions builder                    ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  const cd = JSON.parse(fs.readFileSync(CD_PATH, 'utf8'));
  console.log(`Loaded country-data.json: ${Object.keys(cd).length} entries\n`);

  // Clear old CO₂ fields
  for (const iso in cd) {
    if (!cd[iso]) continue;
    delete cd[iso].co2_total_mt; delete cd[iso].co2_per_capita;
    delete cd[iso].co2_coal_pct; delete cd[iso].co2_oil_pct;
    delete cd[iso].co2_gas_pct; delete cd[iso].co2_cement_pct;
    delete cd[iso].co2_year;
  }

  console.log('── Merging ──────────────────────────────────────────────────────────');
  let count = 0;
  for (const [iso2, d] of Object.entries(CO2_DATA)) {
    if (!cd[iso2]) { console.log(`  SKIP: ${iso2} not in country-data.json`); continue; }
    cd[iso2].co2_total_mt   = d.total;
    cd[iso2].co2_per_capita = d.pc;
    cd[iso2].co2_coal_pct   = d.coal;
    cd[iso2].co2_oil_pct    = d.oil;
    cd[iso2].co2_gas_pct    = d.gas;
    cd[iso2].co2_cement_pct = d.cement;
    cd[iso2].co2_year       = d.yr;
    count++;
  }
  console.log(`  Enriched ${count} countries with CO₂ data`);

  fs.writeFileSync(CD_PATH, JSON.stringify(cd, null, 2));
  console.log(`✓ Written to ${CD_PATH}`);

  console.log('\n── Spot-check ──────────────────────────────────────────────────────');
  for (const iso of ['CN', 'US', 'IN', 'DE', 'JP', 'BR', 'SA', 'QA']) {
    const c = cd[iso];
    if (!c) continue;
    console.log(`  ${iso}: ${c.co2_total_mt}Mt  ${c.co2_per_capita}t/cap  coal=${c.co2_coal_pct}% oil=${c.co2_oil_pct}% gas=${c.co2_gas_pct}% cement=${c.co2_cement_pct}%`);
  }
}

main();
