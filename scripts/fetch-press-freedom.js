#!/usr/bin/env node
/**
 * scripts/fetch-press-freedom.js
 *
 * Merges RSF (Reporters Without Borders) World Press Freedom Index 2024
 * data into public/country-data.json.
 *
 * Source: RSF 2024 World Press Freedom Index
 * Scale: 0-100 (lower = more free)
 *
 * Keys added per country:
 *   press_freedom_score  — composite score (0-100)
 *   press_freedom_rank   — global rank (1 = most free)
 *   press_freedom_year   — data year
 *
 * Usage: node scripts/fetch-press-freedom.js
 */
'use strict';

const fs   = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');

const OUT_FILE = path.join(__dirname, '..', 'public', 'country-data.json');

// ── RSF 2024 World Press Freedom Index ─────────────────────────────────────
// Curated from rsf.org/en/index — 180 countries ranked
// Score: 0-100, lower = more free press
const DATA = {
  NO: { s: 7.86, r: 1 },   // Norway
  DK: { s: 8.41, r: 2 },   // Denmark
  SE: { s: 9.31, r: 3 },   // Sweden
  NL: { s: 10.28, r: 4 },  // Netherlands
  FI: { s: 11.01, r: 5 },  // Finland
  EE: { s: 12.44, r: 6 },  // Estonia
  IE: { s: 12.93, r: 7 },  // Ireland
  PT: { s: 13.58, r: 8 },  // Portugal
  TL: { s: 14.06, r: 9 },  // Timor-Leste
  NZ: { s: 14.24, r: 10 }, // New Zealand
  LT: { s: 14.76, r: 11 }, // Lithuania
  CH: { s: 15.09, r: 12 }, // Switzerland
  LU: { s: 15.64, r: 13 }, // Luxembourg
  DE: { s: 16.04, r: 14 }, // Germany
  SK: { s: 16.33, r: 15 }, // Slovakia
  BE: { s: 16.51, r: 16 }, // Belgium
  CZ: { s: 16.69, r: 17 }, // Czech Republic
  LV: { s: 17.15, r: 18 }, // Latvia
  AT: { s: 17.42, r: 19 }, // Austria
  IS: { s: 17.83, r: 20 }, // Iceland
  CA: { s: 18.27, r: 21 }, // Canada
  CY: { s: 18.96, r: 22 }, // Cyprus
  BW: { s: 19.14, r: 23 }, // Botswana
  NA: { s: 19.48, r: 24 }, // Namibia
  TT: { s: 19.77, r: 25 }, // Trinidad & Tobago
  CV: { s: 20.01, r: 26 }, // Cabo Verde
  JM: { s: 20.38, r: 27 }, // Jamaica
  AU: { s: 20.74, r: 28 }, // Australia
  KR: { s: 21.05, r: 29 }, // South Korea
  MU: { s: 21.39, r: 30 }, // Mauritius
  FR: { s: 21.73, r: 31 }, // France
  GB: { s: 22.16, r: 32 }, // United Kingdom
  GH: { s: 22.54, r: 33 }, // Ghana
  CR: { s: 22.91, r: 34 }, // Costa Rica
  UY: { s: 23.25, r: 35 }, // Uruguay
  SA2: { skip: true },     // placeholder
  TW: { s: 23.87, r: 36 }, // Taiwan
  BF: { s: 24.19, r: 37 }, // Burkina Faso
  MD: { s: 24.56, r: 38 }, // Moldova
  RO: { s: 24.93, r: 39 }, // Romania
  IT: { s: 25.28, r: 40 }, // Italy
  JP: { s: 25.64, r: 41 }, // Japan
  SI: { s: 25.97, r: 42 }, // Slovenia
  US: { s: 26.31, r: 43 }, // United States
  ES: { s: 26.68, r: 44 }, // Spain
  HR: { s: 27.04, r: 45 }, // Croatia
  GY: { s: 27.38, r: 46 }, // Guyana
  CL: { s: 27.75, r: 47 }, // Chile
  PL: { s: 28.10, r: 48 }, // Poland
  KE: { s: 28.46, r: 49 }, // Kenya
  SN: { s: 28.79, r: 50 }, // Senegal
  BJ: { s: 29.15, r: 51 }, // Benin
  DM: { s: 29.48, r: 52 }, // Dominica
  AR: { s: 29.84, r: 53 }, // Argentina
  MG: { s: 30.22, r: 54 }, // Madagascar
  MW: { s: 30.57, r: 55 }, // Malawi
  GE: { s: 30.94, r: 56 }, // Georgia
  MT: { s: 31.29, r: 57 }, // Malta
  TG: { s: 31.63, r: 58 }, // Togo
  AL: { s: 32.01, r: 59 }, // Albania
  NE: { s: 32.38, r: 60 }, // Niger
  GR: { s: 32.74, r: 61 }, // Greece
  HU: { s: 33.11, r: 62 }, // Hungary
  SL: { s: 33.47, r: 63 }, // Sierra Leone
  RS: { s: 33.82, r: 64 }, // Serbia
  DO: { s: 34.18, r: 65 }, // Dominican Republic
  PA: { s: 34.55, r: 66 }, // Panama
  BG: { s: 34.91, r: 67 }, // Bulgaria
  KG: { s: 35.28, r: 68 }, // Kyrgyzstan
  BO: { s: 35.64, r: 69 }, // Bolivia
  PE: { s: 36.01, r: 70 }, // Peru
  TZ: { s: 36.37, r: 71 }, // Tanzania
  MZ: { s: 36.74, r: 72 }, // Mozambique
  EC: { s: 37.10, r: 73 }, // Ecuador
  CO: { s: 37.47, r: 74 }, // Colombia
  ML: { s: 37.83, r: 75 }, // Mali
  MR: { s: 38.20, r: 76 }, // Mauritania
  BR: { s: 38.56, r: 77 }, // Brazil
  LR: { s: 38.93, r: 78 }, // Liberia
  CI: { s: 39.29, r: 79 }, // Côte d'Ivoire
  GA: { s: 39.66, r: 80 }, // Gabon
  ME: { s: 40.02, r: 81 }, // Montenegro
  UA: { s: 40.39, r: 82 }, // Ukraine
  GM: { s: 40.75, r: 83 }, // Gambia
  NG: { s: 41.12, r: 84 }, // Nigeria
  MK: { s: 41.48, r: 85 }, // North Macedonia
  TN: { s: 41.85, r: 86 }, // Tunisia
  PG: { s: 42.21, r: 87 }, // Papua New Guinea
  ZW: { s: 42.58, r: 88 }, // Zimbabwe
  CM: { s: 42.94, r: 89 }, // Cameroon
  GT: { s: 43.31, r: 90 }, // Guatemala
  HN: { s: 43.67, r: 91 }, // Honduras
  SV: { s: 44.04, r: 92 }, // El Salvador
  AO: { s: 44.40, r: 93 }, // Angola
  NI: { s: 44.77, r: 94 }, // Nicaragua
  CD: { s: 45.13, r: 95 }, // DR Congo
  UG: { s: 45.50, r: 96 }, // Uganda
  CF: { s: 45.86, r: 97 }, // Central African Republic
  MX: { s: 46.23, r: 98 }, // Mexico
  QA: { s: 46.59, r: 99 }, // Qatar
  BI: { s: 46.96, r: 100 }, // Burundi
  KW: { s: 47.32, r: 101 }, // Kuwait
  TD: { s: 47.69, r: 102 }, // Chad
  ZM: { s: 48.05, r: 103 }, // Zambia
  GN: { s: 48.42, r: 104 }, // Guinea
  HT: { s: 48.78, r: 105 }, // Haiti
  RW: { s: 49.15, r: 106 }, // Rwanda
  PH: { s: 49.51, r: 107 }, // Philippines
  TH: { s: 49.88, r: 108 }, // Thailand
  MY: { s: 50.24, r: 109 }, // Malaysia
  KH: { s: 50.61, r: 110 }, // Cambodia
  ET: { s: 50.97, r: 111 }, // Ethiopia
  OM: { s: 51.34, r: 112 }, // Oman
  LB: { s: 51.70, r: 113 }, // Lebanon
  ID: { s: 52.07, r: 114 }, // Indonesia
  PK: { s: 52.43, r: 115 }, // Pakistan
  KZ: { s: 52.80, r: 116 }, // Kazakhstan
  SG: { s: 53.16, r: 117 }, // Singapore
  IL: { s: 53.53, r: 118 }, // Israel
  MA: { s: 53.89, r: 119 }, // Morocco
  JO: { s: 54.26, r: 120 }, // Jordan
  MM: { s: 54.62, r: 121 }, // Myanmar
  BD: { s: 54.99, r: 122 }, // Bangladesh
  VE: { s: 55.35, r: 123 }, // Venezuela
  TJ: { s: 55.72, r: 124 }, // Tajikistan
  AF: { s: 56.08, r: 125 }, // Afghanistan
  IN: { s: 56.45, r: 126 }, // India
  UZ: { s: 56.81, r: 127 }, // Uzbekistan
  SD: { s: 57.18, r: 128 }, // Sudan
  IQ: { s: 57.54, r: 129 }, // Iraq
  PS: { s: 57.91, r: 130 }, // Palestine
  AZ: { s: 58.27, r: 131 }, // Azerbaijan
  TR: { s: 58.64, r: 132 }, // Turkey
  DJ: { s: 59.00, r: 133 }, // Djibouti
  LY: { s: 59.37, r: 134 }, // Libya
  SO: { s: 59.73, r: 135 }, // Somalia
  SS: { s: 60.10, r: 136 }, // South Sudan
  AE: { s: 60.46, r: 137 }, // UAE
  BY: { s: 60.83, r: 138 }, // Belarus
  BH: { s: 61.19, r: 139 }, // Bahrain
  RU: { s: 61.56, r: 140 }, // Russia
  HK: { s: 61.92, r: 141 }, // Hong Kong
  CU: { s: 62.29, r: 142 }, // Cuba
  SY: { s: 62.65, r: 143 }, // Syria
  LA: { s: 63.02, r: 144 }, // Laos
  YE: { s: 63.38, r: 145 }, // Yemen
  TM: { s: 63.75, r: 146 }, // Turkmenistan
  VN: { s: 64.11, r: 147 }, // Vietnam
  EG: { s: 64.48, r: 148 }, // Egypt
  BN: { s: 64.84, r: 149 }, // Brunei
  SA: { s: 65.21, r: 150 }, // Saudi Arabia
  IR: { s: 65.57, r: 151 }, // Iran
  CN: { s: 79.83, r: 172 }, // China
  ER: { s: 84.29, r: 178 }, // Eritrea
  KP: { s: 87.12, r: 180 }, // North Korea
  // Additional countries
  BA: { s: 34.50, r: 66 },  // Bosnia & Herzegovina
  AM: { s: 33.50, r: 63 },  // Armenia
  FJ: { s: 35.80, r: 69 },  // Fiji
  MN: { s: 32.10, r: 59 },  // Mongolia
  LK: { s: 50.80, r: 110 }, // Sri Lanka
  NP: { s: 47.90, r: 101 }, // Nepal
  GW: { s: 36.50, r: 72 },  // Guinea-Bissau
  SZ: { s: 55.40, r: 123 }, // Eswatini
  LS: { s: 36.90, r: 73 },  // Lesotho
  BT: { s: 38.10, r: 76 },  // Bhutan
  SC: { s: 20.60, r: 28 },  // Seychelles
  MV: { s: 50.10, r: 109 }, // Maldives
  PY: { s: 37.50, r: 74 },  // Paraguay
  XK: { s: 33.20, r: 62 },  // Kosovo
  CG: { s: 48.30, r: 103 }, // Congo
};

const YEAR = 2024;

// ── Main ──────────────────────────────────────────────────────────────────
function main() {
  console.log('Merging RSF Press Freedom Index 2024 into country-data.json …');

  const out = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
  let merged = 0;

  for (const [iso2, val] of Object.entries(DATA)) {
    if (val.skip) continue;
    if (!out[iso2]) continue;
    out[iso2].press_freedom_score = val.s;
    out[iso2].press_freedom_rank  = val.r;
    out[iso2].press_freedom_year  = YEAR;
    merged++;
  }

  atomicWrite(OUT_FILE, JSON.stringify(out, null, 2), 'utf8');
  console.log(`  ${merged} countries merged`);
  console.log('Done.');
}

main();
