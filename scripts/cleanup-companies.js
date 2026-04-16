#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');

const IN_FILE = path.join(__dirname, '..', 'public', 'companies.json');
const BAK_FILE = IN_FILE + '.bak';

if (!fs.existsSync(BAK_FILE)) {
  fs.copyFileSync(IN_FILE, BAK_FILE);
  console.log('Backup saved to companies.json.bak');
}

const FX = {
  USD:1,EUR:1.08,GBP:1.27,JPY:0.0067,CNY:0.138,KRW:0.00075,
  IDR:6.3e-5,VND:0.000039,QAR:0.272,BRL:0.196,INR:0.012,
  CZK:0.044,DKK:0.145,SEK:0.096,NOK:0.092,CHF:1.13,
  AUD:0.648,CAD:0.737,SGD:0.740,HKD:0.128,TWD:0.031,
  RUB:0.011,ILS:0.27,SAR:0.267,AED:0.272,THB:0.028,
  MYR:0.224,PLN:0.249,MXN:0.052,ZAR:0.055,TRY:0.029,
  CLP:0.00107,COP:0.00024,ARS:0.00098,PEN:0.27,PHP:0.0173,
  NZD:0.6,NGN:0.00063,EGP:0.020,HUF:0.0028,RON:0.218,
  KWD:3.25,BHD:2.65,OMR:2.60,JOD:1.41,PKR:0.0036,
  BDT:0.0091,LKR:0.0034,MNT:0.00029,MAD:0.10,TND:0.32,
  GHS:0.067,KES:0.0077,ETB:0.0083,DZD:0.0075,HRK:0.145,
  RSD:0.0093,UAH:0.024,KZT:0.0021,BGN:0.555,
  IQD:0.00077,SYP:0.0000075,UZS:0.000079,XAF:0.0017,XOF:0.0017,
  GNF:0.000115,CRC:0.0019,ZWG:0.000055,ZMK:0.000037,
};

function toUSD(value, currency) {
  if (!value || !currency) return 0;
  const rate = FX[(currency + '').toUpperCase()];
  if (!rate) return -1; // Unknown currency: flag as suspicious
  return value * rate;
}

const MAX_REVENUE_USD = 700e9; // $700B — allows Amazon/Walmart; above this is data error
const MIN_REVENUE_USD = 1e6;   // $1M — below this, likely not a meaningful revenue figure
const MAX_REV_PER_EMPLOYEE = 3e6; // $3M per employee — real companies max ~$2M/emp (trading firms)

// Per-currency caps (in local currency units) — companies exceeding these are data errors
const CURRENCY_CAPS = {
  EUR: 400e9,
  GBP: 250e9,
  JPY: 120e12,
  CNY: 3500e9,
  KRW: 300e12,
  INR: 100e12,
  IDR: 2000e12,
  BRL: 800e9,
  CZK: 500e9,
  SEK: 800e9,
  NOK: 300e9,
  DKK: 150e9,
  CHF: 100e9,
  SAR: 2000e9,
  USD: 700e9,
  IQD: 500e12,
  SYP: 50000e9,
  UZS: 200e12,
  XAF: 100e12,
  XOF: 50e12,
  GNF: 50e12,
  CRC: 50e12,
};

const data = JSON.parse(fs.readFileSync(IN_FILE, 'utf8'));

let stats = {
  qarToKrw: 0,
  yearsNulled: 0,
  qidNamesRemoved: 0,
  duplicatesRemoved: 0,
  implausibleRevNulled: 0,
  tinyRevNulled: 0,
  totalBefore: 0,
  totalAfter: 0,
};

const seenQids = new Set();

for (const [cityKey, companies] of Object.entries(data)) {
  stats.totalBefore += companies.length;
  const cleaned = [];

  for (const co of companies) {
    // Fix QAR → KRW for Korean companies (revenue > 10B in local units tagged as QAR)
    if (co.revenue_currency === 'QAR' && co.revenue && co.revenue > 1e10) {
      co.revenue_currency = 'KRW';
      stats.qarToKrw++;
    }

    // Nullify revenue values that are clearly years
    if (co.revenue !== null && co.revenue !== undefined && co.revenue >= 1800 && co.revenue <= 2100) {
      co.revenue = null;
      stats.yearsNulled++;
    }

    // Nullify implausibly large or tiny revenues
    if (co.revenue && co.revenue_currency) {
      const usd = toUSD(co.revenue, co.revenue_currency);
      const cur = (co.revenue_currency + '').toUpperCase();
      const localCap = CURRENCY_CAPS[cur];
      let nulled = false;
      if (usd === -1) {
        // Unknown currency: null if local value > 1T (likely wrong)
        if (co.revenue > 1e12) { nulled = true; stats.implausibleRevNulled++; }
      } else if (usd > MAX_REVENUE_USD) {
        nulled = true;
        stats.implausibleRevNulled++;
      } else if (localCap && co.revenue > localCap) {
        nulled = true;
        stats.implausibleRevNulled++;
      } else if (usd > 0 && usd < MIN_REVENUE_USD) {
        nulled = true;
        stats.tinyRevNulled++;
      }
      if (nulled) {
        co.revenue = null;
        co.revenue_currency = null;
      }
    }

    // Nullify if revenue-per-employee is implausibly high (> $10M/employee)
    // This catches market-cap-as-revenue errors (e.g. CATL $566B with 132K employees = $4.3M/emp)
    if (co.revenue && co.revenue_currency && co.employees && co.employees > 0) {
      const usd = toUSD(co.revenue, co.revenue_currency);
      if (usd > 0 && (usd / co.employees) > MAX_REV_PER_EMPLOYEE) {
        co.revenue = null;
        co.revenue_currency = null;
        stats.implausibleRevNulled++;
      }
    }

    // Nullify implausibly large or tiny revenues
    if (co.revenue && co.revenue_currency) {
      const usd = toUSD(co.revenue, co.revenue_currency);
      if (usd > MAX_REVENUE_USD) {
        co.revenue = null;
        co.revenue_currency = null;
        stats.implausibleRevNulled++;
      } else if (usd > 0 && usd < MIN_REVENUE_USD) {
        co.revenue = null;
        co.revenue_currency = null;
        stats.tinyRevNulled++;
      }
    }

    // Skip entries where name is just a Q-number
    if (co.name && /^Q\d+$/.test(co.name)) {
      stats.qidNamesRemoved++;
      continue;
    }

    // Deduplicate by QID
    if (co.qid) {
      if (seenQids.has(co.qid)) {
        stats.duplicatesRemoved++;
        continue;
      }
      seenQids.add(co.qid);
    }

    cleaned.push(co);
  }

  data[cityKey] = cleaned;
  stats.totalAfter += cleaned.length;
}

atomicWrite(IN_FILE, JSON.stringify(data));

console.log('=== Company Data Cleanup Report ===');
console.log(`QAR → KRW fixes:              ${stats.qarToKrw}`);
console.log(`Year-as-revenue nulled:       ${stats.yearsNulled}`);
console.log(`Implausible revenue nulled:   ${stats.implausibleRevNulled} (>$600B USD)`);
console.log(`Tiny revenue nulled:          ${stats.tinyRevNulled} (<$1M USD)`);
console.log(`Q-number names removed:       ${stats.qidNamesRemoved}`);
console.log(`Duplicates removed:            ${stats.duplicatesRemoved}`);
console.log(`Total companies before:        ${stats.totalBefore}`);
console.log(`Total companies after:         ${stats.totalAfter}`);