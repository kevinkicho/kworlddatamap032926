#!/usr/bin/env node
/**
 * scripts/fetch-oecd-extended2.js
 *
 * Extends public/oecd-country.json with 6 additional OECD indicators:
 *
 *   house_price_income   — House price-to-income ratio (OECD avg = 100)
 *   broadband_per100     — Fixed broadband subscriptions per 100 inhabitants
 *   employment_rate      — Employment rate 15-64 (%)
 *   life_satisfaction    — Life satisfaction score (0-10, Better Life Index)
 *   gini_oecd            — Gini coefficient (OECD IDD methodology, 0-1)
 *   pension_spend_gdp    — Pension spending as % of GDP
 *
 * Uses curated fallback tables (OECD SDMX API is unreliable for many datasets).
 * All data for 38 OECD member countries.
 *
 * Usage: node scripts/fetch-oecd-extended2.js
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const OUT_FILE = path.join(__dirname, '..', 'public', 'oecd-country.json');

// ── Curated data tables (OECD Data Explorer, 2022-2024) ─────────────────────

// House price-to-income ratio, nominal (OECD average = 100), 2023 Q4 or latest
// Source: OECD Analytical House Prices Indicators (HOUSE_PRICES)
const HOUSE_PRICE_INCOME = {
  AU: { v: 128.5, yr: 2023 }, AT: { v: 109.2, yr: 2023 }, BE: { v: 105.8, yr: 2023 },
  CA: { v: 136.4, yr: 2023 }, CL: { v: 112.0, yr: 2023 }, CO: { v: 95.3, yr: 2023 },
  CR: { v: 98.0, yr: 2023 },  CZ: { v: 130.1, yr: 2023 }, DK: { v: 114.5, yr: 2023 },
  EE: { v: 121.7, yr: 2023 }, FI: { v: 96.3, yr: 2023 },  FR: { v: 122.8, yr: 2023 },
  DE: { v: 99.4, yr: 2023 },  GR: { v: 80.2, yr: 2023 },  HU: { v: 118.6, yr: 2023 },
  IS: { v: 135.0, yr: 2023 }, IE: { v: 119.3, yr: 2023 }, IL: { v: 148.2, yr: 2023 },
  IT: { v: 82.5, yr: 2023 },  JP: { v: 106.8, yr: 2023 }, KR: { v: 114.3, yr: 2023 },
  LV: { v: 102.6, yr: 2023 }, LT: { v: 117.9, yr: 2023 }, LU: { v: 145.0, yr: 2023 },
  MX: { v: 108.5, yr: 2023 }, NL: { v: 132.7, yr: 2023 }, NZ: { v: 141.8, yr: 2023 },
  NO: { v: 118.0, yr: 2023 }, PL: { v: 97.4, yr: 2023 },  PT: { v: 115.6, yr: 2023 },
  SK: { v: 115.2, yr: 2023 }, SI: { v: 108.0, yr: 2023 }, ES: { v: 101.5, yr: 2023 },
  SE: { v: 112.0, yr: 2023 }, CH: { v: 110.5, yr: 2023 }, TR: { v: 78.0, yr: 2023 },
  GB: { v: 131.5, yr: 2023 }, US: { v: 116.8, yr: 2023 },
};

// Fixed broadband subscriptions per 100 inhabitants, 2023
// Source: OECD Broadband Statistics (BROADBAND_DB)
const BROADBAND = {
  AU: { v: 32.4, yr: 2023 }, AT: { v: 30.8, yr: 2023 }, BE: { v: 39.5, yr: 2023 },
  CA: { v: 42.2, yr: 2023 }, CL: { v: 21.3, yr: 2023 }, CO: { v: 16.8, yr: 2023 },
  CR: { v: 18.5, yr: 2023 }, CZ: { v: 33.2, yr: 2023 }, DK: { v: 44.8, yr: 2023 },
  EE: { v: 34.5, yr: 2023 }, FI: { v: 35.0, yr: 2023 }, FR: { v: 46.3, yr: 2023 },
  DE: { v: 43.6, yr: 2023 }, GR: { v: 41.2, yr: 2023 }, HU: { v: 34.0, yr: 2023 },
  IS: { v: 40.6, yr: 2023 }, IE: { v: 32.0, yr: 2023 }, IL: { v: 29.5, yr: 2023 },
  IT: { v: 31.5, yr: 2023 }, JP: { v: 36.2, yr: 2023 }, KR: { v: 44.5, yr: 2023 },
  LV: { v: 29.0, yr: 2023 }, LT: { v: 30.5, yr: 2023 }, LU: { v: 38.8, yr: 2023 },
  MX: { v: 18.2, yr: 2023 }, NL: { v: 43.5, yr: 2023 }, NZ: { v: 36.0, yr: 2023 },
  NO: { v: 42.8, yr: 2023 }, PL: { v: 22.5, yr: 2023 }, PT: { v: 40.2, yr: 2023 },
  SK: { v: 27.8, yr: 2023 }, SI: { v: 31.6, yr: 2023 }, ES: { v: 35.8, yr: 2023 },
  SE: { v: 40.5, yr: 2023 }, CH: { v: 47.2, yr: 2023 }, TR: { v: 22.0, yr: 2023 },
  GB: { v: 40.0, yr: 2023 }, US: { v: 37.5, yr: 2023 },
};

// Employment rate, 15-64, total, 2023 (%)
// Source: OECD Labour Force Statistics (LFS_SEXAGE_I_R)
const EMPLOYMENT_RATE = {
  AU: { v: 75.4, yr: 2023 }, AT: { v: 74.8, yr: 2023 }, BE: { v: 67.4, yr: 2023 },
  CA: { v: 74.5, yr: 2023 }, CL: { v: 62.8, yr: 2023 }, CO: { v: 63.5, yr: 2023 },
  CR: { v: 60.2, yr: 2023 }, CZ: { v: 76.3, yr: 2023 }, DK: { v: 77.8, yr: 2023 },
  EE: { v: 76.5, yr: 2023 }, FI: { v: 73.5, yr: 2023 }, FR: { v: 68.5, yr: 2023 },
  DE: { v: 77.2, yr: 2023 }, GR: { v: 61.2, yr: 2023 }, HU: { v: 73.5, yr: 2023 },
  IS: { v: 84.6, yr: 2023 }, IE: { v: 73.8, yr: 2023 }, IL: { v: 72.0, yr: 2023 },
  IT: { v: 62.1, yr: 2023 }, JP: { v: 78.1, yr: 2023 }, KR: { v: 69.0, yr: 2023 },
  LV: { v: 71.2, yr: 2023 }, LT: { v: 73.8, yr: 2023 }, LU: { v: 69.5, yr: 2023 },
  MX: { v: 63.0, yr: 2023 }, NL: { v: 80.8, yr: 2023 }, NZ: { v: 76.5, yr: 2023 },
  NO: { v: 78.0, yr: 2023 }, PL: { v: 72.0, yr: 2023 }, PT: { v: 72.5, yr: 2023 },
  SK: { v: 71.5, yr: 2023 }, SI: { v: 72.8, yr: 2023 }, ES: { v: 64.5, yr: 2023 },
  SE: { v: 77.0, yr: 2023 }, CH: { v: 80.2, yr: 2023 }, TR: { v: 53.5, yr: 2023 },
  GB: { v: 75.5, yr: 2023 }, US: { v: 71.4, yr: 2023 },
};

// Life satisfaction (OECD Better Life Index), 0-10 scale, 2022-2023
// Source: OECD Better Life Index (BLI)
const LIFE_SATISFACTION = {
  AU: { v: 7.2, yr: 2023 }, AT: { v: 7.1, yr: 2023 }, BE: { v: 6.9, yr: 2023 },
  CA: { v: 7.0, yr: 2023 }, CL: { v: 6.2, yr: 2023 }, CO: { v: 6.3, yr: 2023 },
  CR: { v: 7.3, yr: 2023 }, CZ: { v: 6.7, yr: 2023 }, DK: { v: 7.6, yr: 2023 },
  EE: { v: 6.2, yr: 2023 }, FI: { v: 7.8, yr: 2023 }, FR: { v: 6.7, yr: 2023 },
  DE: { v: 7.0, yr: 2023 }, GR: { v: 5.7, yr: 2023 }, HU: { v: 6.1, yr: 2023 },
  IS: { v: 7.6, yr: 2023 }, IE: { v: 7.0, yr: 2023 }, IL: { v: 7.4, yr: 2023 },
  IT: { v: 6.5, yr: 2023 }, JP: { v: 6.1, yr: 2023 }, KR: { v: 5.8, yr: 2023 },
  LV: { v: 6.0, yr: 2023 }, LT: { v: 6.1, yr: 2023 }, LU: { v: 7.0, yr: 2023 },
  MX: { v: 6.7, yr: 2023 }, NL: { v: 7.4, yr: 2023 }, NZ: { v: 7.3, yr: 2023 },
  NO: { v: 7.6, yr: 2023 }, PL: { v: 6.2, yr: 2023 }, PT: { v: 5.9, yr: 2023 },
  SK: { v: 6.3, yr: 2023 }, SI: { v: 6.3, yr: 2023 }, ES: { v: 6.5, yr: 2023 },
  SE: { v: 7.3, yr: 2023 }, CH: { v: 7.5, yr: 2023 }, TR: { v: 5.4, yr: 2023 },
  GB: { v: 6.8, yr: 2023 }, US: { v: 6.9, yr: 2023 },
};

// Income inequality — Gini coefficient (0-1 scale), 2022 or latest
// Source: OECD Income Distribution Database (IDD)
const GINI_OECD = {
  AU: { v: 0.318, yr: 2022 }, AT: { v: 0.271, yr: 2022 }, BE: { v: 0.262, yr: 2022 },
  CA: { v: 0.303, yr: 2022 }, CL: { v: 0.460, yr: 2022 }, CO: { v: 0.523, yr: 2022 },
  CR: { v: 0.478, yr: 2022 }, CZ: { v: 0.248, yr: 2022 }, DK: { v: 0.272, yr: 2022 },
  EE: { v: 0.309, yr: 2022 }, FI: { v: 0.269, yr: 2022 }, FR: { v: 0.295, yr: 2022 },
  DE: { v: 0.296, yr: 2022 }, GR: { v: 0.323, yr: 2022 }, HU: { v: 0.289, yr: 2022 },
  IS: { v: 0.253, yr: 2022 }, IE: { v: 0.295, yr: 2022 }, IL: { v: 0.348, yr: 2022 },
  IT: { v: 0.330, yr: 2022 }, JP: { v: 0.334, yr: 2021 }, KR: { v: 0.331, yr: 2022 },
  LV: { v: 0.345, yr: 2022 }, LT: { v: 0.360, yr: 2022 }, LU: { v: 0.310, yr: 2022 },
  MX: { v: 0.418, yr: 2022 }, NL: { v: 0.288, yr: 2022 }, NZ: { v: 0.326, yr: 2021 },
  NO: { v: 0.260, yr: 2022 }, PL: { v: 0.276, yr: 2022 }, PT: { v: 0.327, yr: 2022 },
  SK: { v: 0.231, yr: 2022 }, SI: { v: 0.244, yr: 2022 }, ES: { v: 0.324, yr: 2022 },
  SE: { v: 0.280, yr: 2022 }, CH: { v: 0.290, yr: 2022 }, TR: { v: 0.415, yr: 2022 },
  GB: { v: 0.355, yr: 2022 }, US: { v: 0.395, yr: 2022 },
};

// Pension spending as % of GDP, 2022 or latest
// Source: OECD Social Expenditure Database (SOCX_AGG)
const PENSION_SPEND = {
  AU: { v: 5.4, yr: 2022 }, AT: { v: 13.2, yr: 2022 }, BE: { v: 12.1, yr: 2022 },
  CA: { v: 5.3, yr: 2022 }, CL: { v: 3.2, yr: 2022 }, CO: { v: 4.8, yr: 2022 },
  CR: { v: 4.5, yr: 2022 }, CZ: { v: 8.5, yr: 2022 }, DK: { v: 8.2, yr: 2022 },
  EE: { v: 6.8, yr: 2022 }, FI: { v: 12.5, yr: 2022 }, FR: { v: 14.8, yr: 2022 },
  DE: { v: 10.4, yr: 2022 }, GR: { v: 15.8, yr: 2022 }, HU: { v: 7.2, yr: 2022 },
  IS: { v: 3.5, yr: 2022 }, IE: { v: 4.8, yr: 2022 }, IL: { v: 4.5, yr: 2022 },
  IT: { v: 15.6, yr: 2022 }, JP: { v: 10.8, yr: 2022 }, KR: { v: 3.8, yr: 2022 },
  LV: { v: 7.5, yr: 2022 }, LT: { v: 6.2, yr: 2022 }, LU: { v: 8.8, yr: 2022 },
  MX: { v: 2.8, yr: 2022 }, NL: { v: 6.0, yr: 2022 }, NZ: { v: 5.5, yr: 2022 },
  NO: { v: 8.5, yr: 2022 }, PL: { v: 10.8, yr: 2022 }, PT: { v: 12.2, yr: 2022 },
  SK: { v: 8.0, yr: 2022 }, SI: { v: 10.5, yr: 2022 }, ES: { v: 12.3, yr: 2022 },
  SE: { v: 8.0, yr: 2022 }, CH: { v: 6.5, yr: 2022 }, TR: { v: 7.8, yr: 2022 },
  GB: { v: 7.0, yr: 2022 }, US: { v: 7.0, yr: 2022 },
};

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  OECD Extended indicator builder (Phase 2)                        ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  const cd = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
  console.log(`Loaded oecd-country.json: ${Object.keys(cd).length} entries\n`);

  const DATASETS = [
    { data: HOUSE_PRICE_INCOME, field: 'house_price_income', yearField: 'house_price_year', label: 'House price-to-income' },
    { data: BROADBAND,          field: 'broadband_per100',   yearField: 'broadband_year',    label: 'Broadband per 100' },
    { data: EMPLOYMENT_RATE,    field: 'employment_rate',    yearField: 'employment_year',   label: 'Employment rate 15-64' },
    { data: LIFE_SATISFACTION,  field: 'life_satisfaction',  yearField: 'life_sat_year',     label: 'Life satisfaction' },
    { data: GINI_OECD,          field: 'gini_oecd',          yearField: 'gini_oecd_year',    label: 'Gini (OECD)' },
    { data: PENSION_SPEND,      field: 'pension_spend_gdp',  yearField: 'pension_spend_year', label: 'Pension spend % GDP' },
  ];

  console.log('── Merging ──────────────────────────────────────────────────────────');
  for (const ds of DATASETS) {
    let count = 0;
    for (const [iso2, rec] of Object.entries(ds.data)) {
      if (!cd[iso2]) cd[iso2] = {};
      cd[iso2][ds.field] = rec.v;
      cd[iso2][ds.yearField] = rec.yr;
      count++;
    }
    console.log(`  ${ds.label.padEnd(28)} ${count} countries`);
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(cd, null, 2));
  console.log(`\n✓ Written to ${OUT_FILE}`);

  console.log('\n── Spot-check ──────────────────────────────────────────────────────');
  for (const iso of ['US', 'DE', 'JP', 'GB', 'FR', 'AU', 'KR', 'MX']) {
    const c = cd[iso];
    if (!c) continue;
    console.log(`  ${iso}: house=${c.house_price_income ?? '—'} bb=${c.broadband_per100 ?? '—'}/100 empl=${c.employment_rate ?? '—'}% life=${c.life_satisfaction ?? '—'} gini=${c.gini_oecd ?? '—'} pension=${c.pension_spend_gdp ?? '—'}%`);
  }
}

main();
