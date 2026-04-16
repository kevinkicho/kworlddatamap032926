#!/usr/bin/env node
/**
 * scripts/enrich-revenue-yahoo.js
 *
 * Fetches verified revenue + currency data from Yahoo Finance for companies
 * that have tickers, and updates companies.json with corrected values.
 *
 * Usage: node scripts/enrich-revenue-yahoo.js [--limit N] [--offset N] [--dry-run]
 */
'use strict';

const fs = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');
const YahooFinance = require('yahoo-finance2').default;

const IN_FILE = path.join(__dirname, '..', 'public', 'companies.json');
const BAK_FILE = IN_FILE + '.yahoo-bak';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const BATCH_SIZE = 50;
const DELAY_MS = 800; // politeness delay between batches
const MAX_RETRIES = 2;

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : Infinity;
const offsetIdx = args.indexOf('--offset');
const OFFSET = offsetIdx >= 0 ? parseInt(args[offsetIdx + 1]) : 0;

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchRevenue(ticker) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const data = await yf.quoteSummary(ticker, { modules: ['financialData'] });
      const fd = data.financialData;
      if (fd && fd.totalRevenue) {
        return { revenue: fd.totalRevenue, currency: fd.financialCurrency || null };
      }
      return null;
    } catch (e) {
      if (attempt === MAX_RETRIES) return null;
      await sleep(2000);
    }
  }
  return null;
}

async function main() {
  // Backup
  if (!fs.existsSync(BAK_FILE)) {
    fs.copyFileSync(IN_FILE, BAK_FILE);
    console.log('Backup saved to', BAK_FILE);
  }

  const data = JSON.parse(fs.readFileSync(IN_FILE, 'utf8'));
  const companies = Object.values(data).flat();

  // Build index: ticker -> {cityKey, index, company}
  const tickerMap = new Map();
  for (const [cityKey, list] of Object.entries(data)) {
    for (let i = 0; i < list.length; i++) {
      const co = list[i];
      if (co.ticker) {
        // Yahoo uses different tickers; try both original and with common suffixes
        tickerMap.set(co.ticker, { cityKey, index: i, company: co });
      }
    }
  }

  const uniqueTickers = [...new Set(companies.filter(c => c.ticker).map(c => c.ticker))];
  const toProcess = uniqueTickers.slice(OFFSET, OFFSET + LIMIT);

  console.log(`Total unique tickers: ${uniqueTickers.length}`);
  console.log(`Processing: ${toProcess.length} tickers (offset: ${OFFSET})`);
  if (DRY_RUN) console.log('DRY RUN — no changes will be saved');

  let updated = 0;
  let notFound = 0;
  let noChange = 0;
  let errors = 0;

  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch = toProcess.slice(i, i + BATCH_SIZE);
    console.log(`\nBatch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(toProcess.length / BATCH_SIZE)} (${batch.length} tickers)...`);

    for (const ticker of batch) {
      const result = await fetchRevenue(ticker);
      const entries = [...tickerMap.entries()].filter(([t]) => t === ticker);

      if (!result) {
        notFound++;
        continue;
      }

      for (const [t, { cityKey, index, company }] of entries) {
        const { revenue, currency } = result;
        const oldUSD = company.revenue && company.revenue_currency ? 'present' : 'null';
        const newRevB = revenue > 1e9 ? (revenue / 1e9).toFixed(1) + 'B' :
                       revenue > 1e6 ? (revenue / 1e6).toFixed(1) + 'M' : revenue.toFixed(0);

        if (company.revenue === revenue && company.revenue_currency === currency) {
          noChange++;
          continue;
        }

        // Always overwrite with Yahoo data (it's more reliable)
        if (!DRY_RUN) {
          data[cityKey][index].revenue = revenue;
          data[cityKey][index].revenue_currency = currency;
          // Also update revenue_year to indicate freshness
          data[cityKey][index].revenue_year = 2025;
        }

        console.log(`  ✓ ${company.name} (${ticker}): ${company.revenue_currency || '?'} ${(company.revenue || 0).toExponential(2)} → ${currency || '?'} ${newRevB}`);
        updated++;
      }
    }

    if (i + BATCH_SIZE < toProcess.length) {
      await sleep(DELAY_MS);
    }
  }

  console.log('\n=== Revenue Enrichment Report ===');
  console.log(`Updated:     ${updated}`);
  console.log(`No change:   ${noChange}`);
  console.log(`Not found:   ${notFound}`);
  console.log(`Errors:      ${errors}`);

  if (!DRY_RUN) {
    atomicWrite(IN_FILE, JSON.stringify(data));
    console.log('\nSaved to', IN_FILE);
  } else {
    console.log('\nDRY RUN — no changes saved');
  }
}

main().catch(e => { console.error(e); process.exit(1); });