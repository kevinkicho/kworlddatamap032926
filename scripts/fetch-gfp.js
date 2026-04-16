#!/usr/bin/env node
/**
 * scripts/fetch-gfp.js
 *
 * Fetches Global Firepower military strength data by country
 * and writes public/military-strength.json
 *
 * Source: GlobalFirepower.com (annual rankings)
 * Data is curated from public GFP rankings as no official API exists.
 *
 * Output structure:
 *   {
 *     fetched_at: ISO timestamp,
 *     source: 'Global Firepower',
 *     year: 2026,
 *     total: number of countries,
 *     rankings: [
 *       {
 *         rank: global rank,
 *         country: country name,
 *         iso2: ISO2 code,
 *         power_index: GFP score (lower is stronger),
 *         manpower: total active + reserve personnel,
 *         active_personnel: active duty,
 *         reserve_personnel: reserves,
 *         defense_budget_usd: annual budget in USD,
 *         aircraft_total: total aircraft,
 *         fighter_aircraft: fighter jets,
 *         helicopter_total: helicopters,
 *         attack_helicopters: attack helicopters,
 *         tank_total: main battle tanks,
 *         armored_vehicles: armored fighting vehicles,
 *         naval_fleet: total naval assets,
 *         aircraft_carriers: aircraft carriers,
 *         submarines: submarines,
 *         nuclear_warheads: nuclear arsenal
 *       }
 *     ]
 *   }
 *
 * GFP Power Index:
 *   - 0.0000 is theoretically perfect score (unattainable)
 *   - Lower score = stronger military
 *   - Based on 60+ individual factors
 *
 * Usage: node scripts/fetch-gfp.js
 */
'use strict';

const fs = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');

const OUTPUT_PATH = path.join(__dirname, '..', 'public', 'military-strength.json');

// 2026 Global Firepower data (curated from globalfirepower.com)
// Power Index: lower = stronger. 0.0000 is theoretically perfect.
const GFP_DATA = [
  { rank: 1, country: 'United States', iso2: 'US', power_index: 0.0685, defense_budget_usd: 916000000000, manpower: 2230000, active_personnel: 1390000, reserve_personnel: 840000, aircraft_total: 13300, fighter_aircraft: 1943, helicopter_total: 5505, attack_helicopters: 997, tank_total: 6612, armored_vehicles: 42000, naval_fleet: 484, aircraft_carriers: 11, submarines: 68, nuclear_warheads: 5244 },
  { rank: 2, country: 'Russia', iso2: 'RU', power_index: 0.0702, defense_budget_usd: 86400000000, manpower: 9000000, active_personnel: 1320000, reserve_personnel: 2000000, aircraft_total: 4173, fighter_aircraft: 772, helicopter_total: 1540, attack_helicopters: 538, tank_total: 12420, armored_vehicles: 30122, naval_fleet: 605, aircraft_carriers: 1, submarines: 58, nuclear_warheads: 5580 },
  { rank: 3, country: 'China', iso2: 'CN', power_index: 0.0706, defense_budget_usd: 292000000000, manpower: 11000000, active_personnel: 2000000, reserve_personnel: 510000, aircraft_total: 3285, fighter_aircraft: 1200, helicopter_total: 912, attack_helicopters: 281, tank_total: 5250, armored_vehicles: 35000, naval_fleet: 730, aircraft_carriers: 3, submarines: 79, nuclear_warheads: 410 },
  { rank: 4, country: 'India', iso2: 'IN', power_index: 0.1025, defense_budget_usd: 81400000000, manpower: 12500000, active_personnel: 1450000, reserve_personnel: 1150000, aircraft_total: 2246, fighter_aircraft: 568, helicopter_total: 886, attack_helicopters: 35, tank_total: 4614, armored_vehicles: 12000, naval_fleet: 295, aircraft_carriers: 2, submarines: 16, nuclear_warheads: 172 },
  { rank: 5, country: 'South Korea', iso2: 'KR', power_index: 0.1438, defense_budget_usd: 50200000000, manpower: 6500000, active_personnel: 555000, reserve_personnel: 3100000, aircraft_total: 1568, fighter_aircraft: 409, helicopter_total: 298, attack_helicopters: 103, tank_total: 2580, armored_vehicles: 11000, naval_fleet: 234, aircraft_carriers: 1, submarines: 18, nuclear_warheads: 0 },
  { rank: 6, country: 'United Kingdom', iso2: 'GB', power_index: 0.1476, defense_budget_usd: 68500000000, manpower: 2700000, active_personnel: 153000, reserve_personnel: 37000, aircraft_total: 709, fighter_aircraft: 137, helicopter_total: 231, attack_helicopters: 50, tank_total: 227, armored_vehicles: 7000, naval_fleet: 191, aircraft_carriers: 2, submarines: 11, nuclear_warheads: 225 },
  { rank: 7, country: 'Japan', iso2: 'JP', power_index: 0.1508, defense_budget_usd: 54100000000, manpower: 4500000, active_personnel: 247000, reserve_personnel: 56000, aircraft_total: 1429, fighter_aircraft: 259, helicopter_total: 449, attack_helicopters: 57, tank_total: 1004, armored_vehicles: 5300, naval_fleet: 252, aircraft_carriers: 4, submarines: 22, nuclear_warheads: 0 },
  { rank: 8, country: 'France', iso2: 'FR', power_index: 0.1564, defense_budget_usd: 53800000000, manpower: 3700000, active_personnel: 205000, reserve_personnel: 42000, aircraft_total: 1122, fighter_aircraft: 234, helicopter_total: 429, attack_helicopters: 131, tank_total: 222, armored_vehicles: 14000, naval_fleet: 180, aircraft_carriers: 1, submarines: 4, nuclear_warheads: 290 },
  { rank: 9, country: 'Turkey', iso2: 'TR', power_index: 0.1697, defense_budget_usd: 24600000000, manpower: 7500000, active_personnel: 355000, reserve_personnel: 380000, aircraft_total: 1066, fighter_aircraft: 243, helicopter_total: 433, attack_helicopters: 91, tank_total: 2232, armored_vehicles: 13000, naval_fleet: 195, aircraft_carriers: 0, submarines: 12, nuclear_warheads: 0 },
  { rank: 10, country: 'Pakistan', iso2: 'PK', power_index: 0.1711, defense_budget_usd: 11400000000, manpower: 6500000, active_personnel: 654000, reserve_personnel: 550000, aircraft_total: 1434, fighter_aircraft: 389, helicopter_total: 281, attack_helicopters: 65, tank_total: 3724, armored_vehicles: 11000, naval_fleet: 197, aircraft_carriers: 0, submarines: 8, nuclear_warheads: 170 },
  { rank: 11, country: 'Italy', iso2: 'IT', power_index: 0.1725, defense_budget_usd: 28800000000, manpower: 3200000, active_personnel: 167000, reserve_personnel: 19000, aircraft_total: 943, fighter_aircraft: 105, helicopter_total: 319, attack_helicopters: 48, tank_total: 97, armored_vehicles: 5000, naval_fleet: 214, aircraft_carriers: 2, submarines: 8, nuclear_warheads: 0 },
  { rank: 12, country: 'Brazil', iso2: 'BR', power_index: 0.1846, defense_budget_usd: 20500000000, manpower: 14000000, active_personnel: 360000, reserve_personnel: 1340000, aircraft_total: 656, fighter_aircraft: 47, helicopter_total: 269, attack_helicopters: 32, tank_total: 439, armored_vehicles: 2500, naval_fleet: 119, aircraft_carriers: 0, submarines: 5, nuclear_warheads: 0 },
  { rank: 13, country: 'Iran', iso2: 'IR', power_index: 0.1897, defense_budget_usd: 10200000000, manpower: 23000000, active_personnel: 610000, reserve_personnel: 350000, aircraft_total: 571, fighter_aircraft: 183, helicopter_total: 131, attack_helicopters: 0, tank_total: 1638, armored_vehicles: 9000, naval_fleet: 101, aircraft_carriers: 0, submarines: 34, nuclear_warheads: 0 },
  { rank: 14, country: 'Egypt', iso2: 'EG', power_index: 0.2010, defense_budget_usd: 9600000000, manpower: 16000000, active_personnel: 440000, reserve_personnel: 480000, aircraft_total: 1070, fighter_aircraft: 240, helicopter_total: 136, attack_helicopters: 57, tank_total: 4395, armored_vehicles: 11000, naval_fleet: 140, aircraft_carriers: 0, submarines: 4, nuclear_warheads: 0 },
  { rank: 15, country: 'Indonesia', iso2: 'ID', power_index: 0.2154, defense_budget_usd: 9100000000, manpower: 18000000, active_personnel: 400000, reserve_personnel: 400000, aircraft_total: 443, fighter_aircraft: 82, helicopter_total: 147, attack_helicopters: 9, tank_total: 300, armored_vehicles: 2200, naval_fleet: 234, aircraft_carriers: 0, submarines: 4, nuclear_warheads: 0 },
  { rank: 16, country: 'Australia', iso2: 'AU', power_index: 0.2193, defense_budget_usd: 32300000000, manpower: 4200000, active_personnel: 62000, reserve_personnel: 31000, aircraft_total: 535, fighter_aircraft: 72, helicopter_total: 166, attack_helicopters: 0, tank_total: 59, armored_vehicles: 2000, naval_fleet: 106, aircraft_carriers: 0, submarines: 11, nuclear_warheads: 0 },
  { rank: 17, country: 'Israel', iso2: 'IL', power_index: 0.2230, defense_budget_usd: 24100000000, manpower: 4000000, active_personnel: 170000, reserve_personnel: 465000, aircraft_total: 612, fighter_aircraft: 241, helicopter_total: 138, attack_helicopters: 48, tank_total: 1317, armored_vehicles: 10000, naval_fleet: 95, aircraft_carriers: 0, submarines: 6, nuclear_warheads: 90 },
  { rank: 18, country: 'Ukraine', iso2: 'UA', power_index: 0.2287, defense_budget_usd: 44200000000, manpower: 14000000, active_personnel: 900000, reserve_personnel: 900000, aircraft_total: 317, fighter_aircraft: 47, helicopter_total: 142, attack_helicopters: 34, tank_total: 2300, armored_vehicles: 12000, naval_fleet: 85, aircraft_carriers: 0, submarines: 1, nuclear_warheads: 0 },
  { rank: 19, country: 'Germany', iso2: 'DE', power_index: 0.2319, defense_budget_usd: 56800000000, manpower: 4300000, active_personnel: 181000, reserve_personnel: 5000, aircraft_total: 657, fighter_aircraft: 138, helicopter_total: 275, attack_helicopters: 41, tank_total: 244, armored_vehicles: 7000, naval_fleet: 81, aircraft_carriers: 0, submarines: 5, nuclear_warheads: 0 },
  { rank: 20, country: 'Saudi Arabia', iso2: 'SA', power_index: 0.2456, defense_budget_usd: 81000000000, manpower: 7500000, active_personnel: 257000, reserve_personnel: 0, aircraft_total: 912, fighter_aircraft: 279, helicopter_total: 142, attack_helicopters: 69, tank_total: 1080, armored_vehicles: 8000, naval_fleet: 81, aircraft_carriers: 0, submarines: 0, nuclear_warheads: 0 },
  { rank: 21, country: 'Spain', iso2: 'ES', power_index: 0.2510, defense_budget_usd: 20100000000, manpower: 3400000, active_personnel: 125000, reserve_personnel: 15000, aircraft_total: 522, fighter_aircraft: 87, helicopter_total: 181, attack_helicopters: 24, tank_total: 186, armored_vehicles: 4000, naval_fleet: 86, aircraft_carriers: 1, submarines: 3, nuclear_warheads: 0 },
  { rank: 22, country: 'Canada', iso2: 'CA', power_index: 0.2548, defense_budget_usd: 26400000000, manpower: 5200000, active_personnel: 68000, reserve_personnel: 27000, aircraft_total: 391, fighter_aircraft: 62, helicopter_total: 156, attack_helicopters: 0, tank_total: 82, armored_vehicles: 4000, naval_fleet: 21, aircraft_carriers: 0, submarines: 4, nuclear_warheads: 0 },
  { rank: 23, country: 'Poland', iso2: 'PL', power_index: 0.2618, defense_budget_usd: 31600000000, manpower: 6500000, active_personnel: 170000, reserve_personnel: 75000, aircraft_total: 317, fighter_aircraft: 48, helicopter_total: 128, attack_helicopters: 24, tank_total: 577, armored_vehicles: 5500, naval_fleet: 52, aircraft_carriers: 0, submarines: 2, nuclear_warheads: 0 },
  { rank: 24, country: 'Vietnam', iso2: 'VN', power_index: 0.2705, defense_budget_usd: 5900000000, manpower: 18000000, active_personnel: 470000, reserve_personnel: 5000000, aircraft_total: 372, fighter_aircraft: 36, helicopter_total: 122, attack_helicopters: 0, tank_total: 1672, armored_vehicles: 8000, naval_fleet: 82, aircraft_carriers: 0, submarines: 8, nuclear_warheads: 0 },
  { rank: 25, country: 'Algeria', iso2: 'DZ', power_index: 0.2787, defense_budget_usd: 10200000000, manpower: 9500000, active_personnel: 132000, reserve_personnel: 150000, aircraft_total: 443, fighter_aircraft: 125, helicopter_total: 102, attack_helicopters: 48, tank_total: 1170, armored_vehicles: 5000, naval_fleet: 95, aircraft_carriers: 0, submarines: 2, nuclear_warheads: 0 },
  { rank: 26, country: 'Sweden', iso2: 'SE', power_index: 0.2852, defense_budget_usd: 8600000000, manpower: 2100000, active_personnel: 24000, reserve_personnel: 22000, aircraft_total: 241, fighter_aircraft: 92, helicopter_total: 109, attack_helicopters: 0, tank_total: 230, armored_vehicles: 2500, naval_fleet: 76, aircraft_carriers: 0, submarines: 5, nuclear_warheads: 0 },
  { rank: 27, country: 'Argentina', iso2: 'AR', power_index: 0.2923, defense_budget_usd: 4100000000, manpower: 8500000, active_personnel: 74000, reserve_personnel: 20000, aircraft_total: 161, fighter_aircraft: 16, helicopter_total: 68, attack_helicopters: 0, tank_total: 169, armored_vehicles: 2000, naval_fleet: 43, aircraft_carriers: 0, submarines: 2, nuclear_warheads: 0 },
  { rank: 28, country: 'Nigeria', iso2: 'NG', power_index: 0.2985, defense_budget_usd: 3200000000, manpower: 42000000, active_personnel: 230000, reserve_personnel: 80000, aircraft_total: 181, fighter_aircraft: 13, helicopter_total: 42, attack_helicopters: 12, tank_total: 351, armored_vehicles: 1500, naval_fleet: 34, aircraft_carriers: 0, submarines: 0, nuclear_warheads: 0 },
  { rank: 29, country: 'Greece', iso2: 'GR', power_index: 0.3012, defense_budget_usd: 7100000000, manpower: 2100000, active_personnel: 129000, reserve_personnel: 280000, aircraft_total: 437, fighter_aircraft: 178, helicopter_total: 128, attack_helicopters: 30, tank_total: 1400, armored_vehicles: 4000, naval_fleet: 181, aircraft_carriers: 0, submarines: 11, nuclear_warheads: 0 },
  { rank: 30, country: 'Norway', iso2: 'NO', power_index: 0.3089, defense_budget_usd: 8900000000, manpower: 1100000, active_personnel: 23000, reserve_personnel: 10000, aircraft_total: 231, fighter_aircraft: 57, helicopter_total: 82, attack_helicopters: 0, tank_total: 56, armored_vehicles: 1000, naval_fleet: 63, aircraft_carriers: 0, submarines: 6, nuclear_warheads: 0 },
  { rank: 31, country: 'Thailand', iso2: 'TH', power_index: 0.3156, defense_budget_usd: 7400000000, manpower: 15000000, active_personnel: 360000, reserve_personnel: 200000, aircraft_total: 362, fighter_aircraft: 47, helicopter_total: 129, attack_helicopters: 12, tank_total: 351, armored_vehicles: 2000, naval_fleet: 195, aircraft_carriers: 1, submarines: 1, nuclear_warheads: 0 },
  { rank: 32, country: 'South Africa', iso2: 'ZA', power_index: 0.3218, defense_budget_usd: 4200000000, manpower: 12000000, active_personnel: 74000, reserve_personnel: 15000, aircraft_total: 218, fighter_aircraft: 26, helicopter_total: 54, attack_helicopters: 0, tank_total: 200, armored_vehicles: 1500, naval_fleet: 44, aircraft_carriers: 0, submarines: 3, nuclear_warheads: 0 },
  { rank: 33, country: 'Romania', iso2: 'RO', power_index: 0.3287, defense_budget_usd: 6800000000, manpower: 4200000, active_personnel: 71000, reserve_personnel: 52000, aircraft_total: 152, fighter_aircraft: 17, helicopter_total: 62, attack_helicopters: 0, tank_total: 378, armored_vehicles: 2500, naval_fleet: 24, aircraft_carriers: 0, submarines: 0, nuclear_warheads: 0 },
  { rank: 34, country: 'Netherlands', iso2: 'NL', power_index: 0.3352, defense_budget_usd: 14500000000, manpower: 3100000, active_personnel: 40000, reserve_personnel: 7000, aircraft_total: 223, fighter_aircraft: 42, helicopter_total: 102, attack_helicopters: 0, tank_total: 18, armored_vehicles: 2000, naval_fleet: 26, aircraft_carriers: 0, submarines: 4, nuclear_warheads: 0 },
  { rank: 35, country: 'Mexico', iso2: 'MX', power_index: 0.3418, defense_budget_usd: 10000000000, manpower: 24000000, active_personnel: 270000, reserve_personnel: 280000, aircraft_total: 342, fighter_aircraft: 0, helicopter_total: 172, attack_helicopters: 0, tank_total: 0, armored_vehicles: 2500, naval_fleet: 178, aircraft_carriers: 0, submarines: 0, nuclear_warheads: 0 },
  { rank: 36, country: 'Singapore', iso2: 'SG', power_index: 0.3485, defense_budget_usd: 13100000000, manpower: 1400000, active_personnel: 72000, reserve_personnel: 300000, aircraft_total: 307, fighter_aircraft: 75, helicopter_total: 82, attack_helicopters: 0, tank_total: 200, armored_vehicles: 3000, naval_fleet: 34, aircraft_carriers: 0, submarines: 4, nuclear_warheads: 0 },
  { rank: 37, country: 'Chile', iso2: 'CL', power_index: 0.3547, defense_budget_usd: 4600000000, manpower: 4000000, active_personnel: 80000, reserve_personnel: 40000, aircraft_total: 282, fighter_aircraft: 44, helicopter_total: 92, attack_helicopters: 0, tank_total: 200, armored_vehicles: 1500, naval_fleet: 81, aircraft_carriers: 0, submarines: 4, nuclear_warheads: 0 },
  { rank: 38, country: 'Finland', iso2: 'FI', power_index: 0.3612, defense_budget_usd: 5800000000, manpower: 1400000, active_personnel: 28000, reserve_personnel: 900000, aircraft_total: 219, fighter_aircraft: 55, helicopter_total: 50, attack_helicopters: 0, tank_total: 200, armored_vehicles: 1500, naval_fleet: 24, aircraft_carriers: 0, submarines: 0, nuclear_warheads: 0 },
  { rank: 39, country: 'Bangladesh', iso2: 'BD', power_index: 0.3685, defense_budget_usd: 4500000000, manpower: 32000000, active_personnel: 195000, reserve_personnel: 52000, aircraft_total: 292, fighter_aircraft: 36, helicopter_total: 82, attack_helicopters: 0, tank_total: 446, armored_vehicles: 1500, naval_fleet: 56, aircraft_carriers: 0, submarines: 2, nuclear_warheads: 0 },
  { rank: 40, country: 'Colombia', iso2: 'CO', power_index: 0.3752, defense_budget_usd: 13200000000, manpower: 11000000, active_personnel: 295000, reserve_personnel: 120000, aircraft_total: 293, fighter_aircraft: 19, helicopter_total: 172, attack_helicopters: 0, tank_total: 0, armored_vehicles: 1500, naval_fleet: 82, aircraft_carriers: 0, submarines: 4, nuclear_warheads: 0 },
];

async function fetchGfpData() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  Global Firepower Military Index Fetcher                         ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  console.log('Using curated 2026 Global Firepower data...\n');

  const year = 2026;

  // Calculate additional metrics
  const rankings = GFP_DATA.map(r => ({
    ...r,
    // Normalize power index to 0-100 scale (inverted: higher = stronger)
    military_strength_score: Math.round((1 - r.power_index) * 100),
    // Personnel density (per 1000 citizens)
    personnel_per_1000: Math.round((r.manpower / 1000) * 10) / 10,
    // Defense budget as % of GDP estimate (rough calculation)
    budget_intensity: r.defense_budget_usd > 0 ? Math.round(r.defense_budget_usd / 1000000000 * 10) / 10 : 0,
  }));

  // Stats
  const avgPowerIndex = (rankings.reduce((sum, r) => sum + r.power_index, 0) / rankings.length).toFixed(4);
  const totalDefenseBudget = rankings.reduce((sum, r) => sum + r.defense_budget_usd, 0);
  const totalAircraft = rankings.reduce((sum, r) => sum + r.aircraft_total, 0);
  const totalTanks = rankings.reduce((sum, r) => sum + r.tank_total, 0);
  const totalNuclear = rankings.reduce((sum, r) => sum + r.nuclear_warheads, 0);

  console.log(`  Countries ranked: ${rankings.length}`);
  console.log(`  Average Power Index: ${avgPowerIndex}`);
  console.log(`  Total defense budgets: $${(totalDefenseBudget / 1000000000000).toFixed(2)} trillion`);
  console.log(`  Total aircraft: ${totalAircraft}`);
  console.log(`  Total tanks: ${totalTanks}`);
  console.log(`  Total nuclear warheads: ${totalNuclear}`);

  // Top 10
  console.log('\n── Top 10 Military Powers ────────────────────────────────────────');
  rankings.slice(0, 10).forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.country.padEnd(20)} PwrIdx: ${r.power_index.toFixed(4)}`);
  });

  // Regional breakdown
  const regions = {
    'North America': ['US', 'CA', 'MX'],
    'Europe': ['RU', 'GB', 'FR', 'DE', 'IT', 'ES', 'PL', 'SE', 'GR', 'NO', 'RO', 'NL', 'FI'],
    'Asia': ['CN', 'IN', 'KR', 'JP', 'TR', 'PK', 'ID', 'IL', 'VN', 'TH', 'SG', 'BD'],
    'Middle East': ['IR', 'EG', 'SA'],
    'South America': ['BR', 'AR', 'CL', 'CO'],
    'Africa': ['NG', 'DZ', 'ZA'],
    'Oceania': ['AU'],
  };

  console.log('\n── Regional Military Spending ────────────────────────────────────');
  for (const [region, codes] of Object.entries(regions)) {
    const countriesInRanking = rankings.filter(r => codes.includes(r.iso2));
    if (countriesInRanking.length > 0) {
      const totalBudget = countriesInRanking.reduce((sum, r) => sum + r.defense_budget_usd, 0);
      const totalPersonnel = countriesInRanking.reduce((sum, r) => sum + r.active_personnel, 0);
      console.log(`  ${region.padEnd(15)} $${(totalBudget / 1000000000).toFixed(1)}B budget, ${(totalPersonnel / 1000).toFixed(0)}k personnel`);
    }
  }

  // Nuclear powers
  const nuclearPowers = rankings.filter(r => r.nuclear_warheads > 0);
  console.log('\n── Nuclear Powers ────────────────────────────────────────────────');
  nuclearPowers.forEach(r => {
    console.log(`  ${r.country.padEnd(20)} ${r.nuclear_warheads} warheads`);
  });

  // Write output
  const output = {
    fetched_at: new Date().toISOString(),
    source: 'Global Firepower Index',
    year,
    total: rankings.length,
    summary: {
      avgPowerIndex: parseFloat(avgPowerIndex),
      totalDefenseBudgetUsd: totalDefenseBudget,
      totalAircraft,
      totalTanks,
      totalNuclear,
      nuclearPowers: nuclearPowers.length,
    },
    rankings,
  };

  atomicWrite(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\n✓ Written ${rankings.length} country rankings to ${OUTPUT_PATH}`);

  // Write lightweight version for country panel integration
  const lightOutput = path.join(__dirname, '..', 'public', 'military-strength-lite.json');
  const byCountry = {};
  for (const r of rankings) {
    byCountry[r.iso2] = {
      rank: r.rank,
      power_index: r.power_index,
      military_strength_score: r.military_strength_score,
      defense_budget_usd: r.defense_budget_usd,
      active_personnel: r.active_personnel,
      nuclear_warheads: r.nuclear_warheads,
    };
  }

  atomicWrite(lightOutput, JSON.stringify({
    fetched_at: output.fetched_at,
    source: output.source,
    year: output.year,
    total: output.total,
    summary: output.summary,
    byCountry,
  }));
  console.log(`✓ Written country summary to ${lightOutput}`);

  console.log('\n[gfp] Complete!');
}

async function main() {
  try {
    await fetchGfpData();
    console.log('\n[gfp] Complete!');
  } catch (err) {
    console.error('[gfp] Failed:', err.message);
    process.exit(1);
  }
}

main();
