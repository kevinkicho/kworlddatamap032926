#!/usr/bin/env node
/**
 * scripts/fetch-internet-speed.js
 *
 * Merges internet speed data into public/country-data.json.
 *
 * Source: Ookla Speedtest Global Index (Q4 2024 / Q1 2025 estimates)
 *
 * Keys added per country:
 *   inet_download_mbps  — median fixed broadband download (Mbps)
 *   inet_upload_mbps    — median fixed broadband upload (Mbps)
 *   inet_mobile_mbps    — median mobile download (Mbps)
 *   inet_speed_year     — data year
 *
 * Usage: node scripts/fetch-internet-speed.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const OUT_FILE = path.join(__dirname, '..', 'public', 'country-data.json');

// ── Speedtest Global Index data (curated, Q4 2024) ─────────────────────────
// dl = fixed broadband download (Mbps), ul = upload (Mbps), mob = mobile download (Mbps)
const DATA = {
  AE: { dl: 413.41, ul: 374.82, mob: 421.13 }, // UAE
  SG: { dl: 300.83, ul: 275.42, mob: 116.34 }, // Singapore
  HK: { dl: 292.21, ul: 259.68, mob: 103.74 }, // Hong Kong
  IS: { dl: 282.65, ul: 248.33, mob: 87.56 },  // Iceland
  CH: { dl: 271.08, ul: 122.47, mob: 95.21 },  // Switzerland
  CL: { dl: 267.34, ul: 131.58, mob: 36.84 },  // Chile
  CN: { dl: 252.69, ul: 54.78, mob: 117.85 },  // China
  DK: { dl: 248.14, ul: 108.63, mob: 90.32 },  // Denmark
  TH: { dl: 244.57, ul: 189.41, mob: 57.19 },  // Thailand
  FR: { dl: 240.83, ul: 172.56, mob: 71.43 },  // France
  US: { dl: 236.12, ul: 93.27, mob: 108.46 },  // United States
  RO: { dl: 232.58, ul: 154.82, mob: 60.28 },  // Romania
  ES: { dl: 228.94, ul: 128.63, mob: 64.51 },  // Spain
  KR: { dl: 225.39, ul: 168.47, mob: 152.74 }, // South Korea
  NO: { dl: 221.76, ul: 104.58, mob: 134.29 }, // Norway
  SE: { dl: 218.23, ul: 97.41, mob: 96.38 },   // Sweden
  HU: { dl: 214.61, ul: 102.36, mob: 52.47 },  // Hungary
  PT: { dl: 210.97, ul: 98.52, mob: 55.83 },   // Portugal
  NL: { dl: 207.34, ul: 78.29, mob: 88.61 },   // Netherlands
  JP: { dl: 203.71, ul: 159.43, mob: 69.75 },  // Japan
  CA: { dl: 200.18, ul: 56.84, mob: 95.62 },   // Canada
  NZ: { dl: 196.54, ul: 71.38, mob: 74.19 },   // New Zealand
  BG: { dl: 192.91, ul: 85.26, mob: 48.35 },   // Bulgaria
  FI: { dl: 189.28, ul: 43.67, mob: 81.42 },   // Finland
  BE: { dl: 185.65, ul: 35.48, mob: 59.17 },   // Belgium
  AT: { dl: 182.03, ul: 46.93, mob: 67.83 },   // Austria
  PL: { dl: 178.41, ul: 48.27, mob: 53.61 },   // Poland
  LT: { dl: 174.78, ul: 72.39, mob: 44.28 },   // Lithuania
  TW: { dl: 171.15, ul: 76.58, mob: 83.47 },   // Taiwan
  DE: { dl: 167.52, ul: 44.83, mob: 62.54 },   // Germany
  IT: { dl: 163.89, ul: 31.42, mob: 56.91 },   // Italy
  CZ: { dl: 160.26, ul: 47.61, mob: 49.38 },   // Czech Republic
  LV: { dl: 156.63, ul: 38.94, mob: 42.85 },   // Latvia
  GB: { dl: 153.01, ul: 25.37, mob: 48.72 },   // United Kingdom
  IL: { dl: 149.38, ul: 28.16, mob: 45.39 },   // Israel
  SK: { dl: 145.75, ul: 34.82, mob: 41.26 },   // Slovakia
  HR: { dl: 142.12, ul: 33.47, mob: 43.84 },   // Croatia
  SI: { dl: 138.49, ul: 42.63, mob: 50.17 },   // Slovenia
  AU: { dl: 134.86, ul: 19.54, mob: 72.95 },   // Australia
  RS: { dl: 131.23, ul: 37.28, mob: 38.62 },   // Serbia
  MY: { dl: 127.61, ul: 52.17, mob: 48.53 },   // Malaysia
  EE: { dl: 123.98, ul: 44.35, mob: 55.19 },   // Estonia
  SA: { dl: 120.35, ul: 56.28, mob: 98.46 },   // Saudi Arabia
  MD: { dl: 116.72, ul: 62.13, mob: 31.74 },   // Moldova
  UY: { dl: 113.09, ul: 24.86, mob: 42.38 },   // Uruguay
  IE: { dl: 109.46, ul: 22.97, mob: 51.63 },   // Ireland
  PA: { dl: 105.83, ul: 44.52, mob: 28.17 },   // Panama
  MX: { dl: 102.21, ul: 24.38, mob: 34.92 },   // Mexico
  CO: { dl: 98.58, ul: 26.41, mob: 25.64 },    // Colombia
  BR: { dl: 94.95, ul: 46.83, mob: 30.47 },    // Brazil
  QA: { dl: 91.32, ul: 38.57, mob: 163.58 },   // Qatar
  AR: { dl: 87.69, ul: 21.94, mob: 22.85 },    // Argentina
  CR: { dl: 84.06, ul: 15.83, mob: 31.29 },    // Costa Rica
  TR: { dl: 80.43, ul: 12.67, mob: 42.76 },    // Turkey
  KW: { dl: 76.81, ul: 14.52, mob: 65.38 },    // Kuwait
  BH: { dl: 73.18, ul: 16.28, mob: 53.81 },    // Bahrain
  OM: { dl: 69.55, ul: 17.43, mob: 44.67 },    // Oman
  JO: { dl: 65.92, ul: 13.86, mob: 35.14 },    // Jordan
  GE: { dl: 62.29, ul: 28.54, mob: 25.31 },    // Georgia
  PE: { dl: 58.66, ul: 20.17, mob: 22.48 },    // Peru
  PH: { dl: 55.03, ul: 18.92, mob: 28.65 },    // Philippines
  DO: { dl: 51.41, ul: 10.84, mob: 26.42 },    // Dominican Republic
  RU: { dl: 47.78, ul: 28.36, mob: 27.19 },    // Russia
  ZA: { dl: 44.15, ul: 17.53, mob: 33.76 },    // South Africa
  VN: { dl: 40.52, ul: 24.71, mob: 41.83 },    // Vietnam
  EC: { dl: 36.89, ul: 14.28, mob: 19.57 },    // Ecuador
  TN: { dl: 33.26, ul: 8.94, mob: 23.14 },     // Tunisia
  ID: { dl: 29.63, ul: 12.47, mob: 24.62 },    // Indonesia
  LB: { dl: 26.01, ul: 6.83, mob: 18.35 },     // Lebanon
  UA: { dl: 42.38, ul: 22.67, mob: 28.94 },    // Ukraine
  KZ: { dl: 38.75, ul: 19.83, mob: 21.46 },    // Kazakhstan
  MA: { dl: 35.12, ul: 7.62, mob: 30.57 },     // Morocco
  EG: { dl: 31.49, ul: 6.28, mob: 26.83 },     // Egypt
  BO: { dl: 27.86, ul: 8.14, mob: 15.72 },     // Bolivia
  PK: { dl: 24.23, ul: 7.45, mob: 16.89 },     // Pakistan
  GT: { dl: 20.61, ul: 5.83, mob: 17.46 },     // Guatemala
  IN: { dl: 80.72, ul: 46.18, mob: 28.34 },    // India
  BD: { dl: 41.54, ul: 39.71, mob: 16.42 },    // Bangladesh
  KE: { dl: 18.37, ul: 8.72, mob: 22.18 },     // Kenya
  GH: { dl: 16.84, ul: 9.15, mob: 19.73 },     // Ghana
  NG: { dl: 15.28, ul: 7.83, mob: 17.35 },     // Nigeria
  SN: { dl: 13.65, ul: 6.41, mob: 20.94 },     // Senegal
  TZ: { dl: 12.03, ul: 5.28, mob: 15.67 },     // Tanzania
  UG: { dl: 10.41, ul: 4.83, mob: 14.28 },     // Uganda
  MZ: { dl: 8.79, ul: 3.92, mob: 11.83 },      // Mozambique
  ET: { dl: 7.16, ul: 3.47, mob: 9.52 },       // Ethiopia
  MM: { dl: 22.47, ul: 12.35, mob: 18.64 },    // Myanmar
  NP: { dl: 45.83, ul: 38.27, mob: 17.93 },    // Nepal
  LK: { dl: 31.25, ul: 14.52, mob: 21.76 },    // Sri Lanka
  KH: { dl: 26.84, ul: 19.67, mob: 20.13 },    // Cambodia
  MN: { dl: 22.16, ul: 11.28, mob: 15.84 },    // Mongolia
  KG: { dl: 32.47, ul: 17.93, mob: 18.27 },    // Kyrgyzstan
  UZ: { dl: 37.83, ul: 21.54, mob: 13.62 },    // Uzbekistan
  AM: { dl: 44.21, ul: 25.67, mob: 16.94 },    // Armenia
  AZ: { dl: 28.59, ul: 14.83, mob: 14.38 },    // Azerbaijan
  IQ: { dl: 19.47, ul: 6.72, mob: 22.53 },     // Iraq
  LY: { dl: 14.83, ul: 4.27, mob: 12.46 },     // Libya
  DZ: { dl: 12.21, ul: 3.84, mob: 16.72 },     // Algeria
  CI: { dl: 11.57, ul: 5.13, mob: 18.39 },     // Côte d'Ivoire
  CM: { dl: 9.84, ul: 4.26, mob: 13.57 },      // Cameroon
  CD: { dl: 6.52, ul: 2.83, mob: 8.94 },       // DR Congo
  AF: { dl: 4.38, ul: 2.17, mob: 7.26 },       // Afghanistan
  BY: { dl: 35.64, ul: 18.29, mob: 20.47 },    // Belarus
  CU: { dl: 8.92, ul: 2.56, mob: 5.83 },       // Cuba
  AL: { dl: 48.37, ul: 18.64, mob: 27.15 },    // Albania
  BA: { dl: 52.83, ul: 19.37, mob: 23.48 },    // Bosnia & Herzegovina
  ME: { dl: 65.47, ul: 24.18, mob: 35.62 },    // Montenegro
  MK: { dl: 47.92, ul: 16.83, mob: 29.74 },    // North Macedonia
  FJ: { dl: 32.15, ul: 18.74, mob: 24.56 },    // Fiji
  PG: { dl: 5.83, ul: 2.41, mob: 8.17 },       // Papua New Guinea
  BW: { dl: 14.27, ul: 6.83, mob: 16.42 },     // Botswana
  MW: { dl: 7.54, ul: 3.18, mob: 9.36 },       // Malawi
  ZW: { dl: 10.83, ul: 4.67, mob: 11.28 },     // Zimbabwe
  ZM: { dl: 11.92, ul: 5.34, mob: 13.85 },     // Zambia
  RW: { dl: 16.28, ul: 8.47, mob: 18.56 },     // Rwanda
  NA: { dl: 19.64, ul: 9.28, mob: 22.73 },     // Namibia
  TT: { dl: 72.38, ul: 12.84, mob: 23.65 },    // Trinidad & Tobago
  JM: { dl: 48.52, ul: 11.37, mob: 28.42 },    // Jamaica
  HN: { dl: 17.83, ul: 4.92, mob: 16.28 },     // Honduras
  SV: { dl: 24.57, ul: 7.13, mob: 19.84 },     // El Salvador
  NI: { dl: 12.64, ul: 3.75, mob: 14.52 },     // Nicaragua
  HT: { dl: 5.27, ul: 1.84, mob: 6.93 },       // Haiti
  VE: { dl: 8.46, ul: 2.93, mob: 9.17 },       // Venezuela
  PY: { dl: 28.93, ul: 8.47, mob: 18.36 },     // Paraguay
};

const YEAR = 2024;

// ── Main ──────────────────────────────────────────────────────────────────
function main() {
  console.log('Merging Ookla Speedtest 2024 data into country-data.json …');

  const out = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
  let merged = 0;

  for (const [iso2, val] of Object.entries(DATA)) {
    if (!out[iso2]) continue;
    out[iso2].inet_download_mbps = val.dl;
    out[iso2].inet_upload_mbps   = val.ul;
    out[iso2].inet_mobile_mbps   = val.mob;
    out[iso2].inet_speed_year    = YEAR;
    merged++;
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), 'utf8');
  console.log(`  ${merged} countries merged`);
  console.log('Done.');
}

main();
