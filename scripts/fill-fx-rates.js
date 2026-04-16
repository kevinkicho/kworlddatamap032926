#!/usr/bin/env node
/**
 * scripts/fill-fx-rates.js
 *
 * Fills fx_rate (local currency units per 1 USD) for countries
 * in kdb.json using hardcoded fallback data.
 *
 * Exchange rates are approximate mid-2025 values.
 * For countries using USD or with fixed 1:1 pegs, rate is 1.
 * For Eurozone countries, rate is derived from EUR/USD.
 *
 * Usage:
 *   node scripts/fill-fx-rates.js
 *
 * Safe to re-run — only fills null fields, never overwrites existing values.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { atomicWrite } = require('./safe-write');

const OUT_FILE = path.join(__dirname, '..', 'public', 'kdb.json');

const FX_RATES = {
  AD: 0.92, AE: 3.67, AF: 70.5, AG: 2.70, AL: 93.5, AM: 390,
  AO: 832, AR: 1050, AT: 0.92, AU: 1.56, AW: 1.79, AZ: 1.70,
  BA: 1.80, BB: 2.00, BD: 121, BE: 0.92, BF: 566, BG: 1.80,
  BH: 0.376, BI: 2940, BJ: 566, BN: 1.34, BO: 6.91, BR: 5.65,
  BS: 1.00, BT: 82.5, BW: 13.6, BY: 3.27, BZ: 2.00,
  CA: 1.37, CD: 2850, CF: 566, CG: 566, CH: 0.88, CI: 566,
  CK: 1.56, CL: 967, CM: 566, CN: 7.25, CO: 4140, KM: 404,
  CR: 514, CU: 24.0, CV: 102, CW: 1.79, CY: 0.92, CZ: 23.4,
  DE: 0.92, DJ: 177.7, DK: 6.88, DM: 2.70, DO: 62.0, DZ: 133.5,
  EC: 1.00, EE: 0.92, EG: 50.9, ER: 15.0, ES: 0.92, ET: 58.0,
  FI: 0.92, FJ: 2.27, FK: 0.76, FO: 6.88, FR: 0.92, GA: 566,
  GB: 0.79, GD: 2.70, GE: 2.73, GG: 0.79, GH: 12.8, GI: 0.79,
  GL: 6.88, GM: 46.5, GN: 8550, GQ: 566, GR: 0.92,
  GT: 7.71, GU: 1.00, GW: 566, GY: 209, HK: 7.81,
  HN: 24.8, HR: 0.92, HT: 133.5, HU: 376, IS: 136, IN: 83.5,
  ID: 15800, IR: 42000, IQ: 1310, IE: 0.92, IM: 0.79, IL: 3.66,
  IT: 0.92, JM: 157, JP: 149, JE: 0.79, JO: 0.709, KZ: 480,
  KE: 129, KG: 85.5, KH: 4050, KI: 1.00, KN: 2.70, KP: 900,
  KR: 1350, KW: 0.306, KY: 0.83, LA: 21900, LB: 89500, LC: 2.70,
  LI: 0.92, LK: 298, LR: 192, LS: 17.7, LT: 0.92, LU: 0.92,
  LV: 0.92, LY: 4.78, MA: 10.0, MC: 0.92, MD: 17.8, ME: 0.92,
  MF: 0.92, MG: 4550, MH: 1.00, MK: 54.5, ML: 566, MM: 2100,
  MN: 3450, MO: 8.03, MP: 1.00, MR: 397, MU: 46.5,
  MV: 15.4, MW: 1745, MX: 19.5, MY: 4.43, MZ: 63.5,
  NA: 17.7, NC: 102, NE: 566, NG: 1550, NI: 36.6, NL: 0.92,
  NO: 10.7, NP: 133, NR: 1.56, NZ: 1.67, OM: 0.385,
  PK: 278, PA: 1.00, PE: 3.71, PG: 3.95, PH: 56.0,
  PL: 3.98, PT: 0.92, PW: 1.00, PY: 7480, QA: 3.64,
  RO: 4.57, RS: 104, RW: 1290, SA: 3.75, SB: 8.25,
  SC: 13.7, SD: 570, SE: 10.7, SG: 1.34, SH: 0.79,
  SI: 0.92, SK: 0.92, SL: 22.7, SM: 0.92, SN: 566,
  SO: 571, SR: 33.0, SS: 1300, ST: 22.2, SV: 8.75,
  SX: 1.79, SY: 13100, SZ: 17.7, TC: 1.00, TD: 566,
  TG: 566, TH: 33.5, TJ: 10.5, TK: 1.56, TL: 1.00,
  TM: 3.50, TN: 3.14, TO: 2.27, TR: 36.5, TT: 6.77,
  TV: 1.00, TW: 31.8, TZ: 2600, UA: 41.5, UG: 3700,
  AE: 3.67, GB: 0.79, US: 1.00, UY: 41.5, UZ: 12800,
  VU: 118, VE: 36.5, VN: 24800, VI: 1.00, VG: 1.00,
  WF: 102, WS: 2.68, YE: 535, ZA: 17.7, ZM: 27.0, ZW: 15.7,
  PR: 1.00, GI: 0.79, FO: 6.88, GL: 6.88, AX: 0.92,
  PM: 0.92, BL: 0.92, MF: 0.92,
  XK: 0.92, PS: 3.67, JG: 0.79, AS: 1.00,
  BM: 1.00, FM: 1.00, MT: 0.92, PF: 102, RU: 97.0, VC: 2.70,
};

async function main() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║   FX Rate Filler (Hardcoded Fallback)                  ║');
  console.log('╚═══════════════════════════════════════════════════════╝');

  console.log('\nLoading ' + OUT_FILE + '...');
  const kdb = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
  const existing = kdb['country-data'];
  const isReal = k => existing[k].name && existing[k].income_level !== 'Aggregates';

  const realKeys = Object.keys(existing).filter(isReal);
  let before = 0;
  for (const k of realKeys) { if (existing[k].fx_rate) before++; }
  console.log('Before: fx_rate=' + before + '/' + realKeys.length);

  let added = 0, skipped = 0, noMatch = 0;
  for (const [iso, rate] of Object.entries(FX_RATES)) {
    const entry = existing[iso];
    if (!entry) { noMatch++; continue; }
    if (!isReal(iso)) continue;
    if (entry.fx_rate == null) {
      entry.fx_rate = rate;
      added++;
    } else {
      skipped++;
    }
  }

  let after = 0;
  for (const k of realKeys) { if (existing[k].fx_rate) after++; }

  console.log('Added: ' + added + ', skipped: ' + skipped + ', no match: ' + noMatch);
  console.log('');
  console.log('=== Final Coverage (real countries only) ===');
  console.log('fx_rate: ' + after + '/' + realKeys.length + ' (' + Math.round(after / realKeys.length * 100) + '%)');

  const missing = realKeys.filter(k => !existing[k].fx_rate);
  if (missing.length > 0 && missing.length <= 30) {
    console.log('\nMissing fx_rate (' + missing.length + '):');
    missing.forEach(k => console.log('  ' + k + ' ' + existing[k].name));
  }

  atomicWrite(OUT_FILE, JSON.stringify(kdb, null, 2));
  console.log('\nWrote ' + OUT_FILE);
}

main().catch(err => {
  console.error('Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});