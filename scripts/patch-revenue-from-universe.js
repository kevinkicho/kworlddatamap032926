#!/usr/bin/env node
/**
 * scripts/patch-revenue-from-universe.js
 *
 * Reads verified revenue data from stockUniverse.js and patches
 * our companies.json with correct revenue + currency values.
 *
 * The stockUniverse data has revenue in $B USD, with each market's
 * currency noted. We convert back to local currency units for consistency.
 *
 * Usage:
 *   node scripts/patch-revenue-from-universe.js           # live run
 *   node scripts/patch-revenue-from-universe.js --dry-run  # preview only
 */
'use strict';

const fs = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const IN_FILE = path.join(__dirname, '..', 'public', 'companies.json');
const BAK_FILE = IN_FILE + '.pre-universe-bak';

const FX_TO_USD = {
  USD:1,EUR:1.08,GBP:1.27,JPY:0.0067,CNY:0.138,KRW:0.00075,
  IDR:6.3e-5,VND:0.000039,QAR:0.272,BRL:0.196,INR:0.012,
  CZK:0.044,DKK:0.145,SEK:0.096,NOK:0.092,CHF:1.13,
  AUD:0.648,CAD:0.737,SGD:0.740,HKD:0.128,TWD:0.031,
  RUB:0.011,ILS:0.27,SAR:0.267,AED:0.272,THB:0.028,
  MYR:0.224,PLN:0.249,MXN:0.052,ZAR:0.055,TRY:0.029,
  CLP:0.00107,COP:0.00024,ARS:0.00098,PEN:0.27,PHP:0.0173,
  NZD:0.6,NGN:0.00063,EGP:0.020,HUF:0.0028,RON:0.218,
  KWD:3.25,BHD:2.65,OMR:2.60,JOD:1.41,MAD:0.10,TND:0.32,
  GHS:0.067,KES:0.0077,ETB:0.0083,DZD:0.0075,HRK:0.145,
  RSD:0.0093,UAH:0.024,KZT:0.0021,BDT:0.0091,LKR:0.0034,
  MNT:0.00029,PKR:0.0036,CRC:0.0019,ZWG:0.000055,
};

function parseStockUniverse(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  const results = [];
  let currentCurrency = 'USD';

  const currencyRe = /currency:\s*'([^']+)'/;
  const sRe = /s\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,/;

  for (const line of lines) {
    const curM = line.match(currencyRe);
    if (curM) currentCurrency = curM[1];

    const sM = line.match(sRe);
    if (sM) {
      results.push({
        ticker: sM[1],
        fullName: sM[2],
        marketCapB: parseFloat(sM[3]),
        revenueB: parseFloat(sM[4]),
        currency: currentCurrency,
      });
    }
  }

  return results;
}

function main() {
  if (DRY_RUN) console.log('=== DRY RUN — no files will be modified ===\n');

  if (!DRY_RUN && !fs.existsSync(BAK_FILE)) {
    fs.copyFileSync(IN_FILE, BAK_FILE);
    console.log('Backup saved to', BAK_FILE);
  }

  const universePath = path.join('C:', 'Users', 'kevin', 'Desktop', 'kyahoofinance032926', 'src', 'data', 'stockUniverse.js');
  const universeEntries = parseStockUniverse(universePath);
  console.log(`Parsed ${universeEntries.length} companies from stockUniverse.js`);

  const data = JSON.parse(fs.readFileSync(IN_FILE, 'utf8'));
  const companies = Object.values(data).flat();
  console.log(`Loaded ${companies.length} companies from companies.json\n`);

  // Build lookup maps for efficient matching
  const byTicker = new Map();
  const byNameLower = new Map();
  for (const co of companies) {
    if (co.ticker) {
      if (!byTicker.has(co.ticker)) byTicker.set(co.ticker, []);
      byTicker.get(co.ticker).push(co);
    }
    if (co.name) {
      const key = co.name.toLowerCase();
      if (!byNameLower.has(key)) byNameLower.set(key, []);
      byNameLower.get(key).push(co);
    }
  }

  const STOP_WORDS = new Set(['inc','corp','ltd','group','co','the','of','and','sa','nv','se','ag','plc','holding','holdings','international','global']);

  function nameSimilarEnough(coName, universeName) {
    const a = (coName || '').toLowerCase().replace(/[.,&'+/-]/g, ' ');
    const b = universeName.toLowerCase().replace(/[.,&'+/-]/g, ' ');
    const wordsA = a.split(/\s+/).filter(w => w.length >= 3 && !STOP_WORDS.has(w));
    const wordsB = b.split(/\s+/).filter(w => w.length >= 3 && !STOP_WORDS.has(w));
    if (wordsA.length === 0 && wordsB.length === 0) return true;
    if (wordsA.length === 0 || wordsB.length === 0) {
      const shortA = a.split(/\s+/).filter(w => w.length >= 2);
      const shortB = b.split(/\s+/).filter(w => w.length >= 2);
      if (shortA.length === 0 || shortB.length === 0) return false;
      let hits = 0;
      for (const wa of shortA) for (const wb of shortB) if (wa === wb) { hits++; break; }
      return hits > 0;
    }
    let hits = 0;
    for (const wa of wordsA) {
      for (const wb of wordsB) {
        if (wa === wb || wa.includes(wb) || wb.includes(wa)) { hits++; break; }
      }
    }
    return hits > 0;
  }

  let matched = 0, updated = 0, noChange = 0, skipped = 0;
  const seenQids = new Set();

  for (const uEntry of universeEntries) {
    if (!uEntry.revenueB || uEntry.revenueB <= 0) { skipped++; continue; }

    const currency = uEntry.currency;
    const revenueUSD = uEntry.revenueB * 1e9;

    const fxRate = FX_TO_USD[currency];
    if (!fxRate) {
      console.log(`  ⚠ No FX rate for ${currency} — skipping ${uEntry.ticker}`);
      skipped++;
      continue;
    }

    const revenueLocal = revenueUSD / fxRate;

    let matches = [];

    // 1. Exact ticker match — but verify name overlap to avoid cross-market collisions
    if (byTicker.has(uEntry.ticker)) {
      for (const co of byTicker.get(uEntry.ticker)) {
        if (nameSimilarEnough(co.name, uEntry.fullName)) {
          matches.push({ co, method: 'ticker' });
        }
      }
    }

    // 2. Exact name match
    if (matches.length === 0) {
      const nameKey = uEntry.fullName.toLowerCase();
      if (byNameLower.has(nameKey)) {
        for (const co of byNameLower.get(nameKey)) {
          matches.push({ co, method: 'name' });
        }
      }
    }

    // No fuzzy matching — too many false positives with shared words like "China", "Bank", etc.
    // Stick to exact ticker and exact name matches only.

    if (matches.length === 0) { skipped++; continue; }

    for (const { co, method } of matches) {
      if (seenQids.has(co.qid)) continue;
      seenQids.add(co.qid);
      matched++;

      const oldRev = co.revenue;
      const oldCur = co.revenue_currency;

      // Skip if already correct within 5%
      if (oldRev && oldCur === currency && Math.abs(oldRev - revenueLocal) / revenueLocal < 0.05) {
        noChange++;
        continue;
      }

      const fmtOld = oldRev
        ? `${oldCur || '?'} ${oldRev > 1e12 ? (oldRev/1e12).toFixed(1)+'T' : oldRev > 1e9 ? (oldRev/1e9).toFixed(1)+'B' : oldRev > 1e6 ? (oldRev/1e6).toFixed(1)+'M' : oldRev}`
        : '-';

      const fmtNew = revenueLocal > 1e12 ? (revenueLocal/1e12).toFixed(1)+'T' :
                     revenueLocal > 1e9 ? (revenueLocal/1e9).toFixed(1)+'B' :
                     revenueLocal > 1e6 ? (revenueLocal/1e6).toFixed(1)+'M' : revenueLocal.toFixed(0);

      console.log(`  ✓ [${method}] ${co.name} (${uEntry.ticker}): ${fmtOld} → ${currency} ${fmtNew} ($${uEntry.revenueB}B USD)`);

      if (!DRY_RUN) {
        co.revenue = Math.round(revenueLocal);
        co.revenue_currency = currency;
      }
      updated++;
    }
  }

  if (!DRY_RUN) {
    atomicWrite(IN_FILE, JSON.stringify(data));
    console.log('\n✔ companies.json updated');
  }

  console.log('\n=== Universe Patch Report ===');
  console.log(`Mode:              ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Universe entries:  ${universeEntries.length}`);
  console.log(`Matched:           ${matched}`);
  console.log(`Updated:           ${updated}`);
  console.log(`No change:         ${noChange}`);
  console.log(`Skipped:           ${skipped}`);
}

main();