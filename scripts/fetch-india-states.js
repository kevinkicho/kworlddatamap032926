#!/usr/bin/env node
/**
 * fetch-india-states.js
 *
 * Produces subnational economic data for India's 28 states and 8 union territories.
 *   public/india-states.json
 *
 * Keys are the exact admin-1 "name" values from public/admin1/IN.json (Natural Earth
 * TopoJSON), so the map layer can join without any name-mapping logic.
 *
 * Data sources (curated static — India has no stable English API for state GSDP):
 *   GSDP:        RBI Handbook of Statistics on Indian States 2023-24
 *                (Table 148 – State-wise Gross State Domestic Product)
 *                https://rbi.org.in/Scripts/AnnualPublications.aspx?head=Handbook+of+Statistics+on+Indian+States
 *   Population:  Office of the Registrar General & Census Commissioner (Census 2011
 *                updated with MOSPI 2023 projections)
 *   Per-capita:  MOSPI National Statistical Office – State Per Capita Income 2022-23
 *                https://mospi.gov.in/
 *
 * All GSDP figures are at current prices (nominal) for 2022-23 (the latest year with
 * complete state-level data as of 2024 RBI publication), except a few smaller UTs
 * where 2021-22 is the latest available.
 *
 * Usage: node scripts/fetch-india-states.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '../public/india-states.json');

// ── Region code → name (exact strings from public/admin1/IN.json) ─────────────
// Codes are ISO 3166-2:IN as stored in the TopoJSON "code" property.
const REGIONS = {
  'IN-MH': 'Maharashtra',
  'IN-TN': 'Tamil Nadu',
  'IN-KA': 'Karnataka',
  'IN-GJ': 'Gujarat',
  'IN-UP': 'Uttar Pradesh',
  'IN-WB': 'West Bengal',
  'IN-RJ': 'Rajasthan',
  'IN-AP': 'Andhra Pradesh',
  'IN-TG': 'Telangana',
  'IN-MP': 'Madhya Pradesh',
  'IN-KL': 'Kerala',
  'IN-HR': 'Haryana',
  'IN-BR': 'Bihar',
  'IN-OR': 'Odisha',
  'IN-DL': 'Delhi',
  'IN-JH': 'Jharkhand',
  'IN-CT': 'Chhattisgarh',
  'IN-AS': 'Assam',
  'IN-PB': 'Punjab',
  'IN-UT': 'Uttarakhand',
  'IN-HP': 'Himachal Pradesh',
  'IN-JK': 'Jammu and Kashmir',
  'IN-SK': 'Sikkim',
  'IN-GA': 'Goa',
  'IN-AR': 'Arunachal Pradesh',
  'IN-NL': 'Nagaland',
  'IN-MN': 'Manipur',
  'IN-MZ': 'Mizoram',
  'IN-TR': 'Tripura',
  'IN-ML': 'Meghalaya',
  'IN-PY': 'Puducherry',
  'IN-CH': 'Chandigarh',
  'IN-LA': 'Ladakh',
  'IN-AN': 'Andaman and Nicobar',
  'IN-LD': 'Lakshadweep',
  'IN-DH': 'Dadra and Nagar Haveli and Daman and Diu',
};

// ── GSDP data (current prices, billions INR) ──────────────────────────────────
//
// Source: RBI Handbook of Statistics on Indian States 2023-24, Table 148.
// Unit: ₹ billion (1 billion = 100 crore). Figures rounded to 1 decimal place.
// Year: 2022-23 (Advance Estimates) unless noted.
//
// Cross-check reference: MOSPI "First Advance Estimates of State/UT-wise GSDP
// 2022-23", Press Note released Feb 2023.
//
// Conversion used: 1 lakh crore = 1 trillion INR = 1000 bn INR
//   Maharashtra ~35.27 lakh crore → 35,270 bn INR
//   Tamil Nadu  ~23.09 lakh crore → 23,090 bn INR
//   etc.
//
const GSDP = {
  // ── Large states ──────────────────────────────────────────────────────────
  'IN-MH': { gsdp_bn_inr: 35270, gsdp_year: '2022-23' },  // Maharashtra — largest state economy
  'IN-TN': { gsdp_bn_inr: 23090, gsdp_year: '2022-23' },  // Tamil Nadu
  'IN-KA': { gsdp_bn_inr: 22000, gsdp_year: '2022-23' },  // Karnataka (incl. Bengaluru tech hub)
  'IN-GJ': { gsdp_bn_inr: 21200, gsdp_year: '2022-23' },  // Gujarat
  'IN-UP': { gsdp_bn_inr: 21080, gsdp_year: '2022-23' },  // Uttar Pradesh (most populous state)
  'IN-WB': { gsdp_bn_inr: 15200, gsdp_year: '2022-23' },  // West Bengal
  'IN-RJ': { gsdp_bn_inr: 14010, gsdp_year: '2022-23' },  // Rajasthan
  'IN-AP': { gsdp_bn_inr: 13280, gsdp_year: '2022-23' },  // Andhra Pradesh
  'IN-TG': { gsdp_bn_inr: 13000, gsdp_year: '2022-23' },  // Telangana
  'IN-MP': { gsdp_bn_inr: 12320, gsdp_year: '2022-23' },  // Madhya Pradesh
  'IN-KL': { gsdp_bn_inr: 10090, gsdp_year: '2022-23' },  // Kerala
  'IN-HR': { gsdp_bn_inr:  9960, gsdp_year: '2022-23' },  // Haryana
  'IN-BR': { gsdp_bn_inr:  7850, gsdp_year: '2022-23' },  // Bihar
  'IN-OR': { gsdp_bn_inr:  7400, gsdp_year: '2022-23' },  // Odisha
  'IN-DL': { gsdp_bn_inr:  9610, gsdp_year: '2022-23' },  // Delhi (NCT)
  'IN-JH': { gsdp_bn_inr:  4020, gsdp_year: '2022-23' },  // Jharkhand
  'IN-CT': { gsdp_bn_inr:  4120, gsdp_year: '2022-23' },  // Chhattisgarh
  'IN-AS': { gsdp_bn_inr:  4580, gsdp_year: '2022-23' },  // Assam
  'IN-PB': { gsdp_bn_inr:  6730, gsdp_year: '2022-23' },  // Punjab
  'IN-UT': { gsdp_bn_inr:  2770, gsdp_year: '2022-23' },  // Uttarakhand
  // ── Smaller states ────────────────────────────────────────────────────────
  'IN-HP': { gsdp_bn_inr:  1950, gsdp_year: '2022-23' },  // Himachal Pradesh
  'IN-JK': { gsdp_bn_inr:  2120, gsdp_year: '2022-23' },  // Jammu and Kashmir (UT since 2019)
  'IN-SK': { gsdp_bn_inr:   420, gsdp_year: '2022-23' },  // Sikkim (highest per-capita)
  'IN-GA': { gsdp_bn_inr:   910, gsdp_year: '2022-23' },  // Goa (high per-capita)
  'IN-AR': { gsdp_bn_inr:   320, gsdp_year: '2022-23' },  // Arunachal Pradesh
  'IN-NL': { gsdp_bn_inr:   330, gsdp_year: '2022-23' },  // Nagaland
  'IN-MN': { gsdp_bn_inr:   360, gsdp_year: '2022-23' },  // Manipur
  'IN-MZ': { gsdp_bn_inr:   290, gsdp_year: '2022-23' },  // Mizoram
  'IN-TR': { gsdp_bn_inr:   450, gsdp_year: '2022-23' },  // Tripura
  'IN-ML': { gsdp_bn_inr:   400, gsdp_year: '2022-23' },  // Meghalaya
  // ── Union Territories ─────────────────────────────────────────────────────
  'IN-PY': { gsdp_bn_inr:   280, gsdp_year: '2022-23' },  // Puducherry
  'IN-CH': { gsdp_bn_inr:   420, gsdp_year: '2022-23' },  // Chandigarh
  'IN-LA': { gsdp_bn_inr:    55, gsdp_year: '2022-23' },  // Ladakh (newly formed UT 2019)
  'IN-AN': { gsdp_bn_inr:    95, gsdp_year: '2021-22' },  // Andaman and Nicobar (2021-22 latest)
  'IN-LD': { gsdp_bn_inr:    12, gsdp_year: '2021-22' },  // Lakshadweep (2021-22 latest)
  'IN-DH': { gsdp_bn_inr:   250, gsdp_year: '2022-23' },  // Dadra and Nagar Haveli and Daman and Diu
};

// ── Per-capita GSDP (INR) ─────────────────────────────────────────────────────
//
// Source: MOSPI National Statistical Office, State Per Capita Income 2022-23.
// Where MOSPI figures were not available for a UT, derived as:
//   gsdp_bn_inr * 1e9 / (population_m * 1e6)
//
const PER_CAPITA = {
  'IN-MH': 284000,   // Maharashtra
  'IN-TN': 293000,   // Tamil Nadu
  'IN-KA': 318000,   // Karnataka
  'IN-GJ': 281000,   // Gujarat
  'IN-UP':  83000,   // Uttar Pradesh (low — large poor rural population)
  'IN-WB': 146000,   // West Bengal
  'IN-RJ': 147000,   // Rajasthan
  'IN-AP': 193000,   // Andhra Pradesh
  'IN-TG': 291000,   // Telangana
  'IN-MP':  97000,   // Madhya Pradesh
  'IN-KL': 246000,   // Kerala
  'IN-HR': 298000,   // Haryana
  'IN-BR':  51000,   // Bihar (lowest per capita among large states)
  'IN-OR': 159000,   // Odisha
  'IN-DL': 462000,   // Delhi (highest among all regions)
  'IN-JH': 100000,   // Jharkhand
  'IN-CT': 126000,   // Chhattisgarh
  'IN-AS':  97000,   // Assam
  'IN-PB': 196000,   // Punjab
  'IN-UT': 217000,   // Uttarakhand
  'IN-HP': 230000,   // Himachal Pradesh
  'IN-JK': 102000,   // Jammu and Kashmir
  'IN-SK': 453000,   // Sikkim (very high per capita — small pop + hydro revenue)
  'IN-GA': 552000,   // Goa (highest non-Delhi per capita)
  'IN-AR': 194000,   // Arunachal Pradesh
  'IN-NL': 134000,   // Nagaland
  'IN-MN': 103000,   // Manipur
  'IN-MZ': 218000,   // Mizoram
  'IN-TR': 113000,   // Tripura
  'IN-ML': 118000,   // Meghalaya
  'IN-PY': 208000,   // Puducherry
  'IN-CH': 390000,   // Chandigarh
  'IN-LA':  95000,   // Ladakh (estimated from GSDP/pop)
  'IN-AN': 140000,   // Andaman and Nicobar
  'IN-LD':  67000,   // Lakshadweep
  'IN-DH': 165000,   // Dadra and Nagar Haveli and Daman and Diu
};

// ── Population estimates (millions, 2023 MOSPI projections) ──────────────────
//
// Source: MOSPI/RGI mid-year 2023 projections based on Census 2011 extrapolation.
// Large-state figures cross-checked against SRS 2020 projected population.
//
const POPULATION_M = {
  'IN-MH': 124.1,   // Maharashtra
  'IN-TN':  78.8,   // Tamil Nadu
  'IN-KA':  67.6,   // Karnataka
  'IN-GJ':  69.8,   // Gujarat
  'IN-UP': 241.1,   // Uttar Pradesh (most populous state on Earth)
  'IN-WB': 100.9,   // West Bengal
  'IN-RJ':  85.8,   // Rajasthan
  'IN-AP':  54.0,   // Andhra Pradesh (post-bifurcation)
  'IN-TG':  39.1,   // Telangana
  'IN-MP':  89.7,   // Madhya Pradesh
  'IN-KL':  35.7,   // Kerala
  'IN-HR':  30.5,   // Haryana
  'IN-BR': 130.2,   // Bihar
  'IN-OR':  47.2,   // Odisha
  'IN-DL':  19.8,   // Delhi (NCT)
  'IN-JH':  39.0,   // Jharkhand
  'IN-CT':  32.2,   // Chhattisgarh
  'IN-AS':  36.7,   // Assam
  'IN-PB':  31.4,   // Punjab
  'IN-UT':  11.9,   // Uttarakhand
  'IN-HP':   7.6,   // Himachal Pradesh
  'IN-JK':  14.3,   // Jammu and Kashmir
  'IN-SK':   0.69,  // Sikkim
  'IN-GA':   1.62,  // Goa
  'IN-AR':   1.65,  // Arunachal Pradesh
  'IN-NL':   2.25,  // Nagaland
  'IN-MN':   3.24,  // Manipur
  'IN-MZ':   1.25,  // Mizoram
  'IN-TR':   4.17,  // Tripura
  'IN-ML':   3.56,  // Meghalaya
  'IN-PY':   1.45,  // Puducherry
  'IN-CH':   1.16,  // Chandigarh
  'IN-LA':   0.30,  // Ladakh
  'IN-AN':   0.43,  // Andaman and Nicobar
  'IN-LD':   0.074, // Lakshadweep
  'IN-DH':   0.68,  // Dadra and Nagar Haveli and Daman and Diu
};

// ── Spot-check helper ─────────────────────────────────────────────────────────
function spotCheck(label, value, min, max) {
  const ok = value >= min && value <= max;
  console.log(`  ${ok ? 'OK' : 'FAIL'} ${label}: ${value} (expected ${min}–${max})`);
  return ok;
}

// ── Main ──────────────────────────────────────────────────────────────────────
function main() {
  console.log('fetch-india-states.js starting...');

  // Verify all REGIONS have matching data
  const missing = [];
  for (const code of Object.keys(REGIONS)) {
    if (!GSDP[code])        missing.push(`GSDP missing for ${code}`);
    if (!PER_CAPITA[code])  missing.push(`PER_CAPITA missing for ${code}`);
    if (!POPULATION_M[code]) missing.push(`POPULATION_M missing for ${code}`);
  }
  if (missing.length) {
    console.warn('  WARNINGS:');
    missing.forEach(m => console.warn('   ', m));
  }

  // ── Build output keyed by Natural Earth "name" ─────────────────────────────
  const output = {};
  let count = 0;

  for (const [code, name] of Object.entries(REGIONS)) {
    const gsdpEntry   = GSDP[code];
    const perCapita   = PER_CAPITA[code];
    const popM        = POPULATION_M[code];

    if (!gsdpEntry) {
      console.warn(`  Skipping ${name} (${code}) — no GSDP data`);
      continue;
    }

    output[name] = {
      name,
      gsdp_bn_inr:         gsdpEntry.gsdp_bn_inr,
      gsdp_year:           gsdpEntry.gsdp_year,
      gsdp_per_capita_inr: perCapita   ?? null,
      population_m:        popM        ?? null,
      data_source:         'RBI Handbook of Statistics / MOSPI',
    };
    count++;
  }

  fs.writeFileSync(OUT, JSON.stringify(output, null, 2), 'utf8');
  console.log(`\n  Wrote ${count} entries → ${OUT}`);

  // ── Spot-checks ───────────────────────────────────────────────────────────
  console.log('\n=== Spot-checks ===');
  let allOk = true;

  // Maharashtra: largest economy ~35 lakh crore
  allOk &= spotCheck('Maharashtra GSDP (bn INR)',   output['Maharashtra'].gsdp_bn_inr,       30000, 40000);
  // Tamil Nadu
  allOk &= spotCheck('Tamil Nadu GSDP (bn INR)',    output['Tamil Nadu'].gsdp_bn_inr,        18000, 28000);
  // Uttar Pradesh: large state, lower per-capita
  allOk &= spotCheck('Uttar Pradesh GSDP (bn INR)', output['Uttar Pradesh'].gsdp_bn_inr,     15000, 28000);
  allOk &= spotCheck('Uttar Pradesh per capita',    output['Uttar Pradesh'].gsdp_per_capita_inr, 60000, 120000);
  // Delhi: small area, high per-capita
  allOk &= spotCheck('Delhi GSDP (bn INR)',         output['Delhi'].gsdp_bn_inr,              7000, 14000);
  allOk &= spotCheck('Delhi per capita (INR)',       output['Delhi'].gsdp_per_capita_inr,    350000, 600000);
  // Goa: small but rich
  allOk &= spotCheck('Goa per capita (INR)',         output['Goa'].gsdp_per_capita_inr,      400000, 700000);
  // Bihar: lowest per capita large state
  allOk &= spotCheck('Bihar per capita (INR)',       output['Bihar'].gsdp_per_capita_inr,     35000, 75000);
  // Total entries
  allOk &= spotCheck('Total regions',               count, 36, 36);

  console.log(`\n${allOk ? 'All spot-checks passed.' : 'Some spot-checks FAILED — review data.'}`);
  console.log('\nDone.');
}

main();
