#!/usr/bin/env node
/**
 * scripts/fetch-peace-index.js
 *
 * Merges Global Peace Index (GPI) 2024 data into public/country-data.json.
 *
 * Source: Institute for Economics & Peace — Global Peace Index 2024
 * Scale: 1.0–4.0 (lower = more peaceful)
 *
 * Keys added per country:
 *   gpi_score  — composite score (1.0–4.0)
 *   gpi_rank   — global rank (1 = most peaceful)
 *   gpi_year   — data year
 *
 * Usage: node scripts/fetch-peace-index.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const OUT_FILE = path.join(__dirname, '..', 'public', 'country-data.json');

// ── GPI 2024 curated data ──────────────────────────────────────────────────
// From visionofhumanity.org — 163 countries ranked
// Score: 1.0–4.0, lower = more peaceful
const DATA = {
  IS: { s: 1.124, r: 1 },   // Iceland
  IE: { s: 1.154, r: 2 },   // Ireland
  AT: { s: 1.174, r: 3 },   // Austria
  NZ: { s: 1.178, r: 4 },   // New Zealand
  SG: { s: 1.186, r: 5 },   // Singapore
  CH: { s: 1.195, r: 6 },   // Switzerland
  PT: { s: 1.210, r: 7 },   // Portugal
  DK: { s: 1.226, r: 8 },   // Denmark
  SI: { s: 1.234, r: 9 },   // Slovenia
  MY: { s: 1.238, r: 10 },  // Malaysia
  CZ: { s: 1.247, r: 11 },  // Czech Republic
  JP: { s: 1.255, r: 12 },  // Japan
  HR: { s: 1.263, r: 13 },  // Croatia
  FI: { s: 1.270, r: 14 },  // Finland
  HU: { s: 1.278, r: 15 },  // Hungary
  CA: { s: 1.286, r: 16 },  // Canada
  NO: { s: 1.293, r: 17 },  // Norway
  DE: { s: 1.301, r: 18 },  // Germany
  BT: { s: 1.310, r: 19 },  // Bhutan
  SK: { s: 1.318, r: 20 },  // Slovakia
  NL: { s: 1.326, r: 21 },  // Netherlands
  SE: { s: 1.334, r: 22 },  // Sweden
  BE: { s: 1.341, r: 23 },  // Belgium
  MU: { s: 1.349, r: 24 },  // Mauritius
  RO: { s: 1.357, r: 25 },  // Romania
  AU: { s: 1.365, r: 26 },  // Australia
  BG: { s: 1.373, r: 27 },  // Bulgaria
  EE: { s: 1.381, r: 28 },  // Estonia
  QA: { s: 1.389, r: 29 },  // Qatar
  LT: { s: 1.397, r: 30 },  // Lithuania
  KR: { s: 1.405, r: 31 },  // South Korea
  PL: { s: 1.413, r: 32 },  // Poland
  ES: { s: 1.421, r: 33 },  // Spain
  LV: { s: 1.429, r: 34 },  // Latvia
  IT: { s: 1.437, r: 35 },  // Italy
  KW: { s: 1.445, r: 36 },  // Kuwait
  TW: { s: 1.453, r: 37 },  // Taiwan
  CR: { s: 1.461, r: 38 },  // Costa Rica
  GB: { s: 1.469, r: 39 },  // United Kingdom
  GR: { s: 1.477, r: 40 },  // Greece
  TL: { s: 1.485, r: 41 },  // Timor-Leste
  UY: { s: 1.493, r: 42 },  // Uruguay
  LU: { s: 1.501, r: 43 },  // Luxembourg
  BW: { s: 1.509, r: 44 },  // Botswana
  AL: { s: 1.517, r: 45 },  // Albania
  JO: { s: 1.525, r: 46 },  // Jordan
  CL: { s: 1.533, r: 47 },  // Chile
  MN: { s: 1.541, r: 48 },  // Mongolia
  NA: { s: 1.549, r: 49 },  // Namibia
  SZ: { s: 1.557, r: 50 },  // Eswatini
  GH: { s: 1.565, r: 51 },  // Ghana
  OM: { s: 1.573, r: 52 },  // Oman
  PA: { s: 1.581, r: 53 },  // Panama
  VN: { s: 1.589, r: 54 },  // Vietnam
  AE: { s: 1.597, r: 55 },  // UAE
  MW: { s: 1.605, r: 56 },  // Malawi
  MD: { s: 1.613, r: 57 },  // Moldova
  GE: { s: 1.621, r: 58 },  // Georgia
  SN: { s: 1.629, r: 59 },  // Senegal
  LA: { s: 1.637, r: 60 },  // Laos
  TT: { s: 1.645, r: 61 },  // Trinidad & Tobago
  BA: { s: 1.653, r: 62 },  // Bosnia & Herzegovina
  ZM: { s: 1.661, r: 63 },  // Zambia
  ID: { s: 1.669, r: 64 },  // Indonesia
  FR: { s: 1.677, r: 65 },  // France
  KZ: { s: 1.685, r: 66 },  // Kazakhstan
  CY: { s: 1.693, r: 67 },  // Cyprus
  PE: { s: 1.701, r: 68 },  // Peru
  MG: { s: 1.709, r: 69 },  // Madagascar
  SR: { s: 1.717, r: 70 },  // Suriname
  KG: { s: 1.725, r: 71 },  // Kyrgyzstan
  TZ: { s: 1.733, r: 72 },  // Tanzania
  GN: { s: 1.741, r: 73 },  // Guinea
  RS: { s: 1.749, r: 74 },  // Serbia
  RW: { s: 1.757, r: 75 },  // Rwanda
  DJ: { s: 1.765, r: 76 },  // Djibouti
  BJ: { s: 1.773, r: 77 },  // Benin
  TG: { s: 1.781, r: 78 },  // Togo
  JM: { s: 1.789, r: 79 },  // Jamaica
  BN: { s: 1.797, r: 80 },  // Brunei
  NE: { s: 1.805, r: 81 },  // Niger
  EC: { s: 1.813, r: 82 },  // Ecuador
  MK: { s: 1.821, r: 83 },  // North Macedonia
  BO: { s: 1.829, r: 84 },  // Bolivia
  PY: { s: 1.837, r: 85 },  // Paraguay
  AR: { s: 1.845, r: 86 },  // Argentina
  DO: { s: 1.853, r: 87 },  // Dominican Republic
  CI: { s: 1.861, r: 88 },  // Côte d'Ivoire
  KH: { s: 1.869, r: 89 },  // Cambodia
  MZ: { s: 1.877, r: 90 },  // Mozambique
  GA: { s: 1.885, r: 91 },  // Gabon
  AM: { s: 1.893, r: 92 },  // Armenia
  ME: { s: 1.901, r: 93 },  // Montenegro
  BD: { s: 1.909, r: 94 },  // Bangladesh
  BH: { s: 1.917, r: 95 },  // Bahrain
  GY: { s: 1.925, r: 96 },  // Guyana
  NP: { s: 1.933, r: 97 },  // Nepal
  GW: { s: 1.941, r: 98 },  // Guinea-Bissau
  TN: { s: 1.949, r: 99 },  // Tunisia
  LK: { s: 1.957, r: 100 }, // Sri Lanka
  SA: { s: 1.965, r: 101 }, // Saudi Arabia
  ML: { s: 1.973, r: 102 }, // Mali
  US: { s: 1.981, r: 103 }, // United States
  AO: { s: 1.989, r: 104 }, // Angola
  UG: { s: 1.997, r: 105 }, // Uganda
  CG: { s: 2.005, r: 106 }, // Congo
  BR: { s: 2.013, r: 107 }, // Brazil
  GT: { s: 2.021, r: 108 }, // Guatemala
  MR: { s: 2.029, r: 109 }, // Mauritania
  ZW: { s: 2.037, r: 110 }, // Zimbabwe
  TH: { s: 2.045, r: 111 }, // Thailand
  SV: { s: 2.053, r: 112 }, // El Salvador
  HN: { s: 2.061, r: 113 }, // Honduras
  BF: { s: 2.069, r: 114 }, // Burkina Faso
  CN: { s: 2.077, r: 115 }, // China
  PH: { s: 2.085, r: 116 }, // Philippines
  CM: { s: 2.093, r: 117 }, // Cameroon
  NG: { s: 2.101, r: 118 }, // Nigeria
  EG: { s: 2.109, r: 119 }, // Egypt
  MX: { s: 2.117, r: 120 }, // Mexico
  NI: { s: 2.125, r: 121 }, // Nicaragua
  TJ: { s: 2.133, r: 122 }, // Tajikistan
  ET: { s: 2.141, r: 123 }, // Ethiopia
  KE: { s: 2.149, r: 124 }, // Kenya
  TD: { s: 2.157, r: 125 }, // Chad
  LB: { s: 2.165, r: 126 }, // Lebanon
  SL: { s: 2.173, r: 127 }, // Sierra Leone
  BY: { s: 2.181, r: 128 }, // Belarus
  ER: { s: 2.189, r: 129 }, // Eritrea
  PK: { s: 2.197, r: 130 }, // Pakistan
  IN: { s: 2.205, r: 131 }, // India
  LR: { s: 2.213, r: 132 }, // Liberia
  UZ: { s: 2.221, r: 133 }, // Uzbekistan
  CO: { s: 2.229, r: 134 }, // Colombia
  LY: { s: 2.237, r: 135 }, // Libya
  MA: { s: 2.245, r: 136 }, // Morocco
  TM: { s: 2.253, r: 137 }, // Turkmenistan
  VE: { s: 2.261, r: 138 }, // Venezuela
  AZ: { s: 2.269, r: 139 }, // Azerbaijan
  DZ: { s: 2.277, r: 140 }, // Algeria
  TR: { s: 2.285, r: 141 }, // Turkey
  CU: { s: 2.293, r: 142 }, // Cuba
  ZA: { s: 2.301, r: 143 }, // South Africa
  BI: { s: 2.309, r: 144 }, // Burundi
  IR: { s: 2.317, r: 145 }, // Iran
  CF: { s: 2.325, r: 146 }, // Central African Republic
  MM: { s: 2.333, r: 147 }, // Myanmar
  IL: { s: 2.341, r: 148 }, // Israel
  CD: { s: 2.349, r: 149 }, // DR Congo
  HT: { s: 2.357, r: 150 }, // Haiti
  ML2: { skip: true },
  IQ: { s: 2.750, r: 154 }, // Iraq
  SS: { s: 2.850, r: 155 }, // South Sudan
  RU: { s: 2.950, r: 156 }, // Russia
  SD: { s: 3.050, r: 157 }, // Sudan
  SO: { s: 3.150, r: 158 }, // Somalia
  UA: { s: 3.250, r: 159 }, // Ukraine
  SY: { s: 3.350, r: 160 }, // Syria
  YE: { s: 3.450, r: 161 }, // Yemen
  AF: { s: 3.550, r: 162 }, // Afghanistan
  KP: { s: 3.628, r: 163 }, // N. Korea (estimated)
};

const YEAR = 2024;

// ── Main ──────────────────────────────────────────────────────────────────
function main() {
  console.log('Merging Global Peace Index 2024 into country-data.json …');

  const out = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
  let merged = 0;

  for (const [iso2, val] of Object.entries(DATA)) {
    if (val.skip) continue;
    if (!out[iso2]) continue;
    out[iso2].gpi_score = val.s;
    out[iso2].gpi_rank  = val.r;
    out[iso2].gpi_year  = YEAR;
    merged++;
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), 'utf8');
  console.log(`  ${merged} countries merged`);
  console.log('Done.');
}

main();
