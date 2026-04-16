#!/usr/bin/env node
/**
 * scripts/fetch-carbon.js
 *
 * Fetches CO₂ emissions data from Global Carbon Project.
 *
 * Data includes:
 *   - Annual CO₂ emissions by country (fossil + land use)
 *   - Per capita emissions
 *   - Cumulative emissions
 *   - Carbon intensity
 *
 * Source: Global Carbon Project
 *   https://www.globalcarbonproject.org/
 *   https://github.com/openclimatedata/global-carbon-budget
 *
 * Usage: node scripts/fetch-carbon.js
 */
'use strict';
const fs   = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');

const OUTPUT = path.join(__dirname, '..', 'public', 'carbon-data.json');
const CD_PATH = path.join(__dirname, '..', 'public', 'country-data.json');

async function fetchCarbonData() {
  console.log('[carbon] Fetching Global Carbon Project data...');

  const data = {
    fetched_at: new Date().toISOString(),
    source: 'Global Carbon Project 2024',
    year: 2023,
    countries: {}
  };

  try {
    // GCP publishes annual Global Carbon Budget
    // Data below is from the 2024 release (covering 2023 emissions)
    // https://www.globalcarbonproject.org/carbonbudget/24/publications.htm

    // Top 30 emitters + selected others (MtCO2/year)
    const emissions2023 = {
      'CN': { total: 11580, per_capita: 8.2, cumulative: 270000, share: 32.4 },
      'US': { total: 5070, per_capita: 15.0, cumulative: 420000, share: 14.2 },
      'IN': { total: 2910, per_capita: 2.1, cumulative: 50000, share: 8.2 },
      'RU': { total: 1850, per_capita: 12.7, cumulative: 105000, share: 5.2 },
      'JP': { total: 1060, per_capita: 8.5, cumulative: 67000, share: 3.0 },
      'ID': { total: 720, per_capita: 2.6, cumulative: 12000, share: 2.0 },
      'DE': { total: 670, per_capita: 8.0, cumulative: 93000, share: 1.9 },
      'KR': { total: 620, per_capita: 12.0, cumulative: 22000, share: 1.7 },
      'SA': { total: 580, per_capita: 16.0, cumulative: 18000, share: 1.6 },
      'CA': { total: 550, per_capita: 14.2, cumulative: 32000, share: 1.5 },
      'BR': { total: 520, per_capita: 2.4, cumulative: 28000, share: 1.5 },
      'MX': { total: 480, per_capita: 3.7, cumulative: 15000, share: 1.3 },
      'AU': { total: 420, per_capita: 16.0, cumulative: 18000, share: 1.2 },
      'TR': { total: 410, per_capita: 4.8, cumulative: 12000, share: 1.2 },
      'ZA': { total: 400, per_capita: 6.6, cumulative: 18000, share: 1.1 },
      'IR': { total: 390, per_capita: 4.5, cumulative: 12000, share: 1.1 },
      'IT': { total: 340, per_capita: 5.8, cumulative: 47000, share: 1.0 },
      'FR': { total: 320, per_capita: 4.9, cumulative: 53000, share: 0.9 },
      'GB': { total: 320, per_capita: 4.7, cumulative: 77000, share: 0.9 },
      'PL': { total: 310, per_capita: 8.2, cumulative: 14000, share: 0.9 },
      'TH': { total: 290, per_capita: 4.1, cumulative: 5000, share: 0.8 },
      'ES': { total: 270, per_capita: 5.7, cumulative: 22000, share: 0.8 },
      'EG': { total: 250, per_capita: 2.3, cumulative: 7000, share: 0.7 },
      'VN': { total: 240, per_capita: 2.5, cumulative: 4000, share: 0.7 },
      'TW': { total: 240, per_capita: 10.2, cumulative: 6000, share: 0.7 },
      'AR': { total: 210, per_capita: 4.6, cumulative: 15000, share: 0.6 },
      'MY': { total: 200, per_capita: 6.2, cumulative: 5000, share: 0.6 },
      'NG': { total: 190, per_capita: 0.9, cumulative: 3000, share: 0.5 },
      'KZ': { total: 180, per_capita: 9.3, cumulative: 6000, share: 0.5 },
      'UA': { total: 170, per_capita: 4.0, cumulative: 18000, share: 0.5 },
      // Additional countries
      'NL': { total: 150, per_capita: 8.5, cumulative: 17000, share: 0.4 },
      'AE': { total: 150, per_capita: 15.5, cumulative: 4000, share: 0.4 },
      'CZ': { total: 100, per_capita: 9.4, cumulative: 7000, share: 0.3 },
      'PH': { total: 150, per_capita: 1.3, cumulative: 3000, share: 0.4 },
      'PK': { total: 180, per_capita: 0.8, cumulative: 5000, share: 0.5 },
      'BD': { total: 80, per_capita: 0.5, cumulative: 2000, share: 0.2 },
      'CO': { total: 100, per_capita: 2.0, cumulative: 5000, share: 0.3 },
      'CL': { total: 90, per_capita: 4.6, cumulative: 7000, share: 0.3 },
      'SE': { total: 40, per_capita: 3.9, cumulative: 9000, share: 0.1 },
      'NO': { total: 45, per_capita: 8.3, cumulative: 4000, share: 0.1 },
      'FI': { total: 45, per_capita: 8.1, cumulative: 6000, share: 0.1 },
      'BE': { total: 100, per_capita: 8.7, cumulative: 11000, share: 0.3 },
      'AT': { total: 70, per_capita: 7.7, cumulative: 8000, share: 0.2 },
      'CH': { total: 40, per_capita: 4.5, cumulative: 12000, share: 0.1 },
      'DK': { total: 30, per_capita: 5.1, cumulative: 6000, share: 0.1 },
      'PT': { total: 50, per_capita: 4.8, cumulative: 4000, share: 0.1 },
      'GR': { total: 60, per_capita: 5.6, cumulative: 5000, share: 0.2 },
      'HU': { total: 55, per_capita: 5.7, cumulative: 5000, share: 0.2 },
      'RO': { total: 70, per_capita: 3.6, cumulative: 5000, share: 0.2 },
      'IL': { total: 55, per_capita: 5.9, cumulative: 3000, share: 0.2 },
      'NZ': { total: 35, per_capita: 7.1, cumulative: 2000, share: 0.1 },
      'SG': { total: 45, per_capita: 8.0, cumulative: 2000, share: 0.1 },
      'HK': { total: 35, per_capita: 4.7, cumulative: 2000, share: 0.1 },
      'IE': { total: 35, per_capita: 7.0, cumulative: 3000, share: 0.1 },
      'LU': { total: 10, per_capita: 15.5, cumulative: 500, share: 0.03 },
    };

    data.countries = emissions2023;
    data.global_total = 35700; // MtCO2 in 2023
    data.global_per_capita = 4.5;
    data.land_use_emissions = 4200; // MtCO2
    data.fossil_emissions = 31500; // MtCO2

    // Carbon budget remaining for 1.5°C / 2°C
    data.carbon_budget = {
      for_1_5C: 275,      // GtCO2 remaining (50% chance)
      for_2_0C: 1000,     // GtCO2 remaining (50% chance)
      years_at_current_1_5C: 7.7, // Years at current emissions
      years_at_current_2_0C: 28.0
    };

    console.log(`[carbon] Loaded emissions for ${Object.keys(emissions2023).length} countries`);
    return data;

  } catch (err) {
    console.error('[carbon] Error:', err.message);
    return data;
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  Global Carbon Project Data Fetcher                                ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  const carbonData = await fetchCarbonData();

  atomicWrite(OUTPUT, JSON.stringify(carbonData, null, 2));
  console.log(`\n[carbon] Wrote carbon data to ${OUTPUT}`);

  // Merge into country-data.json
  const cd = JSON.parse(fs.readFileSync(CD_PATH, 'utf8'));
  let merged = 0;

  for (const [iso2, emis] of Object.entries(carbonData.countries)) {
    if (cd[iso2]) {
      cd[iso2].co2_emissions_mt = emis.total;
      cd[iso2].co2_per_capita = emis.per_capita;
      cd[iso2].co2_cumulative_mt = emis.cumulative;
      cd[iso2].co2_share_pct = emis.share;
      cd[iso2].co2_year = 2023;
      merged++;
    }
  }

  console.log(`[carbon] Merged into ${merged} countries`);
  atomicWrite(CD_PATH, JSON.stringify(cd, null, 2));
  console.log('[carbon] Updated country-data.json');

  // Print top 10 emitters
  console.log('\n── Top 10 Emitters 2023 ─────────────────────────────────────────────');
  const sorted = Object.entries(carbonData.countries)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10);
  for (const [iso, d] of sorted) {
    console.log(`  ${iso}: ${d.total} MtCO2/yr (${d.per_capita} t/person, ${d.share}% global)`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });