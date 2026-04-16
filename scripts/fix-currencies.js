#!/usr/bin/env node
/**
 * scripts/fix-currencies.js
 * 
 * Fixes remaining QAR-that-should-be-KRW in all financial currency fields,
 * and nulls implausible operating_income and net_income values.
 */
'use strict';

const fs = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');

const IN_FILE = path.join(__dirname, '..', 'public', 'companies.json');

const FX = {
  USD:1,EUR:1.08,GBP:1.27,JPY:0.0067,CNY:0.138,KRW:0.00075,
  IDR:6.3e-5,VND:3.9e-5,QAR:0.272,BRL:0.196,INR:0.012,
  CZK:0.044,DKK:0.145,SEK:0.096,NOK:0.092,CHF:1.13,
  AUD:0.648,CAD:0.737,SGD:0.74,HKD:0.128,TWD:0.031,
  RUB:0.011,ILS:0.27,SAR:0.267,AED:0.272,THB:0.028,
  MYR:0.224,PLN:0.249,MXN:0.052,ZAR:0.055,TRY:0.029,
  PHP:0.0173,NZD:0.6,NGN:0.00063,EGP:0.02,HUF:0.0028,
  RON:0.218,KWD:3.25,BHD:2.65,OMR:2.60,JOD:1.41,PKR:0.0036,
  BDT:0.0091,LKR:0.0034,MNT:0.00029,MAD:0.10,TND:0.32,
  GHS:0.067,KES:0.0077,ETB:0.0083,DZD:0.0075,HRK:0.145,
  RSD:0.0093,UAH:0.024,KZT:0.0021,BGN:0.555,
  IQD:0.00077,SYP:7.5e-6,UZS:7.9e-5,XAF:0.0017,XOF:0.0017,
  GNF:0.000115,CRC:0.0019,ZWG:5.5e-5,GEL:0.37,CLP:0.00107,
  COP:0.00024,ARS:0.00098,PEN:0.27,IQD:0.00077,
};

// Max plausible ratios vs revenue
const MAX_OI_RATIO = 0.5;   // operating income shouldn't exceed 50% of revenue in normal cases
const MAX_NI_RATIO = 1.0;   // net income rarely exceeds revenue
const MAX_REV_PER_EMP = 5e6; // $5M per employee

const data = JSON.parse(fs.readFileSync(IN_FILE, 'utf8'));
let stats = { qarToKrw: 0, implausibleOI: 0, implausibleNI: 0, nullOI: 0 };

for (const [cityKey, companies] of Object.entries(data)) {
  for (const co of companies) {
    // Fix QAR → KRW in ALL currency fields
    for (const field of ['revenue_currency', 'net_income_currency', 'operating_income_currency', 'total_assets_currency', 'total_equity_currency']) {
      if (co[field] === 'QAR') {
        co[field] = 'KRW';
        stats.qarToKrw++;
      }
    }

    // Null implausible operating_income
    if (co.operating_income && co.operating_income_currency) {
      const rate = FX[co.operating_income_currency];
      if (!rate) {
        co.operating_income = null;
        co.operating_income_currency = null;
        stats.implausibleOI++;
      } else {
        const oiUSD = co.operating_income * rate;
        const revUSD = co.revenue ? (co.revenue * (FX[co.revenue_currency] || 1)) : 0;
        
        // If OI > 50% of revenue AND revenue exists, or OI > $200B USD
        if ((revUSD > 0 && oiUSD > revUSD * MAX_OI_RATIO && oiUSD > 50e9) || oiUSD > 200e9) {
          co.operating_income = null;
          co.operating_income_currency = null;
          stats.implausibleOI++;
        }
        // Also null if extreme revenue-per-employee
        if (co.employees > 0 && oiUSD / co.employees > MAX_REV_PER_EMP) {
          co.operating_income = null;
          co.operating_income_currency = null;
          stats.implausibleOI++;
        }
      }
    }

    // Null implausible net_income
    if (co.net_income && co.net_income_currency) {
      const rate = FX[co.net_income_currency];
      if (!rate) {
        co.net_income = null;
        co.net_income_currency = null;
        stats.implausibleNI++;
      } else {
        const niUSD = co.net_income * rate;
        const revUSD = co.revenue ? (co.revenue * (FX[co.revenue_currency] || 1)) : 0;
        
        // If NI > 2x revenue AND > $50B, or NI > $300B
        if ((revUSD > 0 && niUSD > revUSD * 2 && niUSD > 50e9) || niUSD > 300e9) {
          co.net_income = null;
          co.net_income_currency = null;
          stats.implausibleNI++;
        }
        if (co.employees > 0 && niUSD / co.employees > MAX_REV_PER_EMP) {
          co.net_income = null;
          co.net_income_currency = null;
          stats.implausibleNI++;
        }
      }
    }
  }
}

atomicWrite(IN_FILE, JSON.stringify(data));

console.log('=== Currency & Financial Data Fix Report ===');
console.log(`QAR → KRW fixes (all fields):  ${stats.qarToKrw}`);
console.log(`Implausible OI nulled:           ${stats.implausibleOI}`);
console.log(`Implausible NI nulled:            ${stats.implausibleNI}`);