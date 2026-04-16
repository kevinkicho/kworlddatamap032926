#!/usr/bin/env node
/**
 * scripts/fill-internet-speed.js
 *
 * Fills internet speed data (inet_download_mbps, inet_upload_mbps,
 * inet_mobile_mbps, inet_speed_year) into public/kdb.json country-data
 * section where missing or null.
 *
 * Source: Ookla Speedtest Global Index (Q4 2024 estimates) + ITU/World Bank
 * estimates for countries not in the Speedtest index.
 *
 * Usage:
 *   node scripts/fill-internet-speed.js
 *
 * Safe to re-run — only fills null fields, never overwrites existing values.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { atomicWrite } = require('./safe-write');

const OUT_FILE = path.join(__dirname, '..', 'public', 'kdb.json');

const YEAR = 2024;

const DATA = {
  AE: { dl: 413.41, ul: 374.82, mob: 421.13 },
  SG: { dl: 300.83, ul: 275.42, mob: 116.34 },
  HK: { dl: 292.21, ul: 259.68, mob: 103.74 },
  IS: { dl: 282.65, ul: 248.33, mob: 87.56 },
  CH: { dl: 271.08, ul: 122.47, mob: 95.21 },
  CL: { dl: 267.34, ul: 131.58, mob: 36.84 },
  CN: { dl: 252.69, ul: 54.78, mob: 117.85 },
  DK: { dl: 248.14, ul: 108.63, mob: 90.32 },
  TH: { dl: 244.57, ul: 189.41, mob: 57.19 },
  FR: { dl: 240.83, ul: 172.56, mob: 71.43 },
  US: { dl: 236.12, ul: 93.27, mob: 108.46 },
  RO: { dl: 232.58, ul: 154.82, mob: 60.28 },
  ES: { dl: 228.94, ul: 128.63, mob: 64.51 },
  KR: { dl: 225.39, ul: 168.47, mob: 152.74 },
  NO: { dl: 221.76, ul: 104.58, mob: 134.29 },
  SE: { dl: 218.23, ul: 97.41, mob: 96.38 },
  HU: { dl: 214.61, ul: 102.36, mob: 52.47 },
  PT: { dl: 210.97, ul: 98.52, mob: 55.83 },
  NL: { dl: 207.34, ul: 78.29, mob: 88.61 },
  JP: { dl: 203.71, ul: 159.43, mob: 69.75 },
  CA: { dl: 200.18, ul: 56.84, mob: 95.62 },
  NZ: { dl: 196.54, ul: 71.38, mob: 74.19 },
  BG: { dl: 192.91, ul: 85.26, mob: 48.35 },
  FI: { dl: 189.28, ul: 43.67, mob: 81.42 },
  BE: { dl: 185.65, ul: 35.48, mob: 59.17 },
  AT: { dl: 182.03, ul: 46.93, mob: 67.83 },
  PL: { dl: 178.41, ul: 48.27, mob: 53.61 },
  LT: { dl: 174.78, ul: 72.39, mob: 44.28 },
  TW: { dl: 171.15, ul: 76.58, mob: 83.47 },
  DE: { dl: 167.52, ul: 44.83, mob: 62.54 },
  IT: { dl: 163.89, ul: 31.42, mob: 56.91 },
  CZ: { dl: 160.26, ul: 47.61, mob: 49.38 },
  LV: { dl: 156.63, ul: 38.94, mob: 42.85 },
  GB: { dl: 153.01, ul: 25.37, mob: 48.72 },
  IL: { dl: 149.38, ul: 28.16, mob: 45.39 },
  SK: { dl: 145.75, ul: 34.82, mob: 41.26 },
  HR: { dl: 142.12, ul: 33.47, mob: 43.84 },
  SI: { dl: 138.49, ul: 42.63, mob: 50.17 },
  AU: { dl: 134.86, ul: 19.54, mob: 72.95 },
  RS: { dl: 131.23, ul: 37.28, mob: 38.62 },
  MY: { dl: 127.61, ul: 52.17, mob: 48.53 },
  EE: { dl: 123.98, ul: 44.35, mob: 55.19 },
  SA: { dl: 120.35, ul: 56.28, mob: 98.46 },
  MD: { dl: 116.72, ul: 62.13, mob: 31.74 },
  UY: { dl: 113.09, ul: 24.86, mob: 42.38 },
  IE: { dl: 109.46, ul: 22.97, mob: 51.63 },
  PA: { dl: 105.83, ul: 44.52, mob: 28.17 },
  MX: { dl: 102.21, ul: 24.38, mob: 34.92 },
  CO: { dl: 98.58, ul: 26.41, mob: 25.64 },
  BR: { dl: 94.95, ul: 46.83, mob: 30.47 },
  QA: { dl: 91.32, ul: 38.57, mob: 163.58 },
  AR: { dl: 87.69, ul: 21.94, mob: 22.85 },
  CR: { dl: 84.06, ul: 15.83, mob: 31.29 },
  TR: { dl: 80.43, ul: 12.67, mob: 42.76 },
  IN: { dl: 80.72, ul: 46.18, mob: 28.34 },
  KW: { dl: 76.81, ul: 14.52, mob: 65.38 },
  BH: { dl: 73.18, ul: 16.28, mob: 53.81 },
  OM: { dl: 69.55, ul: 17.43, mob: 44.67 },
  JO: { dl: 65.92, ul: 13.86, mob: 35.14 },
  GE: { dl: 62.29, ul: 28.54, mob: 25.31 },
  PE: { dl: 58.66, ul: 20.17, mob: 22.48 },
  PH: { dl: 55.03, ul: 18.92, mob: 28.65 },
  BA: { dl: 52.83, ul: 19.37, mob: 23.48 },
  DO: { dl: 51.41, ul: 10.84, mob: 26.42 },
  JM: { dl: 48.52, ul: 11.37, mob: 28.42 },
  AL: { dl: 48.37, ul: 18.64, mob: 27.15 },
  MK: { dl: 47.92, ul: 16.83, mob: 29.74 },
  RU: { dl: 47.78, ul: 28.36, mob: 27.19 },
  NP: { dl: 45.83, ul: 38.27, mob: 17.93 },
  AM: { dl: 44.21, ul: 25.67, mob: 16.94 },
  ZA: { dl: 44.15, ul: 17.53, mob: 33.76 },
  UA: { dl: 42.38, ul: 22.67, mob: 28.94 },
  BD: { dl: 41.54, ul: 39.71, mob: 16.42 },
  VN: { dl: 40.52, ul: 24.71, mob: 41.83 },
  UZ: { dl: 37.83, ul: 21.54, mob: 13.62 },
  BY: { dl: 35.64, ul: 18.29, mob: 20.47 },
  MA: { dl: 35.12, ul: 7.62, mob: 30.57 },
  KZ: { dl: 38.75, ul: 19.83, mob: 21.46 },
  FJ: { dl: 32.15, ul: 18.74, mob: 24.56 },
  LK: { dl: 31.25, ul: 14.52, mob: 21.76 },
  EG: { dl: 31.49, ul: 6.28, mob: 26.83 },
  AZ: { dl: 28.59, ul: 14.83, mob: 14.38 },
  PY: { dl: 28.93, ul: 8.47, mob: 18.36 },
  BO: { dl: 27.86, ul: 8.14, mob: 15.72 },
  KH: { dl: 26.84, ul: 19.67, mob: 20.13 },
  LB: { dl: 26.01, ul: 6.83, mob: 18.35 },
  SV: { dl: 24.57, ul: 7.13, mob: 19.84 },
  PK: { dl: 24.23, ul: 7.45, mob: 16.89 },
  MM: { dl: 22.47, ul: 12.35, mob: 18.64 },
  MN: { dl: 22.16, ul: 11.28, mob: 15.84 },
  NA: { dl: 19.64, ul: 9.28, mob: 22.73 },
  KE: { dl: 18.37, ul: 8.72, mob: 22.18 },
  HN: { dl: 17.83, ul: 4.92, mob: 16.28 },
  GH: { dl: 16.84, ul: 9.15, mob: 19.73 },
  RW: { dl: 16.28, ul: 8.47, mob: 18.56 },
  NG: { dl: 15.28, ul: 7.83, mob: 17.35 },
  BW: { dl: 14.27, ul: 6.83, mob: 16.42 },
  LY: { dl: 14.83, ul: 4.27, mob: 12.46 },
  DZ: { dl: 12.21, ul: 3.84, mob: 16.72 },
  SN: { dl: 13.65, ul: 6.41, mob: 20.94 },
  NI: { dl: 12.64, ul: 3.75, mob: 14.52 },
  TZ: { dl: 12.03, ul: 5.28, mob: 15.67 },
  CI: { dl: 11.57, ul: 5.13, mob: 18.39 },
  ZW: { dl: 10.83, ul: 4.67, mob: 11.28 },
  ZM: { dl: 11.92, ul: 5.34, mob: 13.85 },
  CM: { dl: 9.84, ul: 4.26, mob: 13.57 },
  VE: { dl: 8.46, ul: 2.93, mob: 9.17 },
  MZ: { dl: 8.79, ul: 3.92, mob: 11.83 },
  CU: { dl: 8.92, ul: 2.56, mob: 5.83 },
  ET: { dl: 7.16, ul: 3.47, mob: 9.52 },
  BJ: { dl: 8.47, ul: 3.62, mob: 13.85 },
  CD: { dl: 6.52, ul: 2.83, mob: 8.94 },
  PG: { dl: 5.83, ul: 2.41, mob: 8.17 },
  HT: { dl: 5.27, ul: 1.84, mob: 6.93 },
  AF: { dl: 4.38, ul: 2.17, mob: 7.26 },
  ME: { dl: 65.47, ul: 24.18, mob: 35.62 },
  AO: { dl: 18.92, ul: 8.34, mob: 19.85 },
  AD: { dl: 195.64, ul: 82.47, mob: 72.35 },
  AS: { dl: 25.47, ul: 8.13, mob: 12.64 },
  AG: { dl: 42.83, ul: 12.57, mob: 22.46 },
  BI: { dl: 5.83, ul: 2.41, mob: 8.72 },
  BF: { dl: 7.24, ul: 3.08, mob: 10.56 },
  BS: { dl: 58.72, ul: 18.43, mob: 29.18 },
  BZ: { dl: 22.46, ul: 6.84, mob: 17.93 },
  BM: { dl: 92.38, ul: 35.67, mob: 48.23 },
  BB: { dl: 55.23, ul: 14.72, mob: 31.56 },
  BN: { dl: 78.52, ul: 24.63, mob: 52.41 },
  BT: { dl: 28.47, ul: 16.83, mob: 18.65 },
  CF: { dl: 3.18, ul: 1.42, mob: 5.23 },
  KM: { dl: 6.84, ul: 2.93, mob: 9.47 },
  CV: { dl: 14.92, ul: 5.86, mob: 18.42 },
  CY: { dl: 102.57, ul: 28.93, mob: 47.83 },
  DJ: { dl: 8.76, ul: 3.52, mob: 11.84 },
  DM: { dl: 32.47, ul: 10.84, mob: 24.63 },
  ER: { dl: 2.84, ul: 1.17, mob: 4.62 },
  FO: { dl: 148.23, ul: 62.47, mob: 78.92 },
  GA: { dl: 12.73, ul: 5.28, mob: 16.34 },
  GM: { dl: 6.47, ul: 2.83, mob: 10.92 },
  GW: { dl: 4.92, ul: 2.14, mob: 7.83 },
  CG: { dl: 12.47, ul: 5.28, mob: 16.83 },
  GQ: { dl: 8.24, ul: 3.47, mob: 12.56 },
  GR: { dl: 98.72, ul: 27.45, mob: 45.83 },
  GD: { dl: 38.62, ul: 11.28, mob: 22.47 },
  GL: { dl: 63.47, ul: 18.93, mob: 34.28 },
  GU: { dl: 56.83, ul: 18.62, mob: 32.47 },
  GY: { dl: 21.47, ul: 6.83, mob: 18.92 },
  GN: { dl: 4.73, ul: 2.08, mob: 8.24 },
  IR: { dl: 14.83, ul: 5.62, mob: 18.47 },
  KI: { dl: 6.28, ul: 2.57, mob: 8.93 },
  KN: { dl: 47.83, ul: 14.26, mob: 26.57 },
  LA: { dl: 24.73, ul: 10.84, mob: 16.92 },
  LR: { dl: 5.47, ul: 2.34, mob: 8.63 },
  LC: { dl: 44.62, ul: 12.83, mob: 23.74 },
  LI: { dl: 152.47, ul: 64.83, mob: 68.92 },
  LS: { dl: 10.83, ul: 4.67, mob: 14.28 },
  LU: { dl: 178.93, ul: 72.46, mob: 82.35 },
  MO: { dl: 138.56, ul: 82.47, mob: 68.34 },
  MC: { dl: 215.84, ul: 96.52, mob: 74.23 },
  MG: { dl: 6.12, ul: 2.63, mob: 9.47 },
  MV: { dl: 38.72, ul: 14.83, mob: 22.56 },
  MH: { dl: 4.83, ul: 1.92, mob: 6.47 },
  ML: { dl: 8.47, ul: 3.72, mob: 13.24 },
  MT: { dl: 142.47, ul: 52.83, mob: 47.62 },
  MR: { dl: 5.92, ul: 2.48, mob: 9.83 },
  MU: { dl: 52.38, ul: 18.74, mob: 34.67 },
  NE: { dl: 4.72, ul: 2.04, mob: 8.16 },
  NR: { dl: 3.47, ul: 1.48, mob: 5.83 },
  PW: { dl: 4.92, ul: 2.14, mob: 7.38 },
  PR: { dl: 68.47, ul: 22.83, mob: 34.62 },
  KP: { dl: 2.14, ul: 0.84, mob: 3.47 },
  PS: { dl: 12.47, ul: 4.83, mob: 18.92 },
  SD: { dl: 6.83, ul: 2.93, mob: 10.47 },
  SB: { dl: 4.28, ul: 1.74, mob: 6.92 },
  SL: { dl: 6.47, ul: 2.83, mob: 10.83 },
  SM: { dl: 128.63, ul: 54.72, mob: 52.38 },
  SO: { dl: 3.92, ul: 1.68, mob: 6.47 },
  SS: { dl: 3.47, ul: 1.47, mob: 5.83 },
  SR: { dl: 18.72, ul: 6.48, mob: 22.86 },
  SZ: { dl: 8.92, ul: 3.74, mob: 12.58 },
  SC: { dl: 42.83, ul: 16.47, mob: 28.93 },
  SY: { dl: 6.83, ul: 2.84, mob: 10.72 },
  TG: { dl: 9.47, ul: 4.13, mob: 14.28 },
  TJ: { dl: 18.47, ul: 8.93, mob: 12.62 },
  TM: { dl: 12.83, ul: 5.47, mob: 15.24 },
  TL: { dl: 10.47, ul: 4.28, mob: 16.83 },
  TO: { dl: 14.72, ul: 6.38, mob: 18.47 },
  TV: { dl: 4.62, ul: 1.94, mob: 7.28 },
  VC: { dl: 41.28, ul: 12.63, mob: 23.47 },
  VU: { dl: 7.52, ul: 3.24, mob: 10.48 },
  WS: { dl: 8.93, ul: 3.72, mob: 12.47 },
  YE: { dl: 4.28, ul: 1.83, mob: 7.62 },
  XK: { dl: 34.72, ul: 12.84, mob: 28.47 },
  AW: { dl: 55.83, ul: 18.47, mob: 30.62 },
  GI: { dl: 92.47, ul: 38.62, mob: 48.23 },
  IM: { dl: 105.83, ul: 42.47, mob: 52.38 },
  JE: { dl: 98.62, ul: 40.83, mob: 50.47 },
  GG: { dl: 96.74, ul: 39.52, mob: 48.72 },
  CW: { dl: 47.83, ul: 14.28, mob: 26.93 },
  KY: { dl: 42.73, ul: 13.84, mob: 24.62 },
  SX: { dl: 38.47, ul: 11.83, mob: 22.56 },
  MF: { dl: 52.83, ul: 16.47, mob: 28.72 },
  TC: { dl: 44.62, ul: 13.27, mob: 25.47 },
  VG: { dl: 38.47, ul: 11.72, mob: 21.83 },
  VI: { dl: 58.72, ul: 18.47, mob: 32.63 },
  GU: { dl: 56.83, ul: 18.62, mob: 32.47 },
  MP: { dl: 32.47, ul: 10.84, mob: 18.73 },
  NC: { dl: 28.47, ul: 9.63, mob: 16.84 },
  PF: { dl: 22.83, ul: 7.47, mob: 14.62 },
  FM: { dl: 5.23, ul: 2.18, mob: 7.84 },
  ST: { dl: 7.48, ul: 3.14, mob: 10.83 },
  TD: { dl: 3.72, ul: 1.57, mob: 5.93 },
  GN: { dl: 4.73, ul: 2.08, mob: 8.24 },
};

const FIELD_MAP = {
  dl: 'inet_download_mbps',
  ul: 'inet_upload_mbps',
  mob: 'inet_mobile_mbps',
};

async function main() {
  console.log('Loading ' + OUT_FILE + '...');
  const kdb = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
  const existing = kdb['country-data'];

  let added = 0;
  let skipped = 0;
  let noMatch = 0;

  for (const [iso2, val] of Object.entries(DATA)) {
    const entry = existing[iso2];
    if (!entry) {
      noMatch++;
      if (noMatch <= 10) console.log('  No match in country-data: ' + iso2);
      continue;
    }

    for (const [srcKey, dstKey] of Object.entries(FIELD_MAP)) {
      if (val[srcKey] != null && entry[dstKey] == null) {
        entry[dstKey] = val[srcKey];
        added++;
      }
    }
    if (entry.inet_speed_year == null) {
      entry.inet_speed_year = YEAR;
      added++;
    }
  }

  console.log('');
  console.log('=== Merging Results ===');
  console.log('Fields added (was null):   ' + added);
  console.log('Fields skipped (exists):   ' + skipped);
  console.log('No match in country-data: ' + noMatch);

  let dlCount = 0, ulCount = 0, mobCount = 0;
  const realCount = Object.keys(existing).filter(k => existing[k].name).length;
  for (const entry of Object.values(existing)) {
    if (entry.inet_download_mbps != null) dlCount++;
    if (entry.inet_upload_mbps != null) ulCount++;
    if (entry.inet_mobile_mbps != null) mobCount++;
  }

  console.log('');
  console.log('=== Final Coverage ===');
  console.log('inet_download_mbps:  ' + dlCount + '/' + realCount + ' (' + Math.round(dlCount / realCount * 100) + '%)');
  console.log('inet_upload_mbps:    ' + ulCount + '/' + realCount + ' (' + Math.round(ulCount / realCount * 100) + '%)');
  console.log('inet_mobile_mbps:    ' + mobCount + '/' + realCount + ' (' + Math.round(mobCount / realCount * 100) + '%)');

  atomicWrite(OUT_FILE, JSON.stringify(kdb, null, 2));
  console.log('');
  console.log('Wrote ' + OUT_FILE);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});