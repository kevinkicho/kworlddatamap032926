#!/usr/bin/env node
/**
 * scripts/enrich-yahoo-finance.js
 *
 * Full Yahoo Finance enrichment for companies.json.
 * Fetches: revenue, netIncome, employees, financialCurrency
 * Plus timestamps: revenue_date, income_date, employees_date
 *
 * Features:
 *   - Checkpoint file for resume after interruption
 *   - Batch concurrency (5 parallel) with rate limiting
 *   - Skip already-fetched tickers on resume
 *   - Dry-run mode
 *
 * Usage:
 *   node scripts/enrich-yahoo-finance.js            # live run
 *   node scripts/enrich-yahoo-finance.js --dry-run   # preview only
 *   node scripts/enrich-yahoo-finance.js --resume     # resume from checkpoint
 */
'use strict';

const fs = require('fs');
const path = require('path');
const YahooFinance = require('yahoo-finance2').default;

const IN_FILE = path.join(__dirname, '..', 'public', 'companies.json');
const BAK_FILE = IN_FILE + '.pre-yahoo-enrich-bak';
const CHECKPOINT_FILE = path.join(__dirname, '..', 'scripts', '.yahoo-enrich-checkpoint.json');

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const CONCURRENCY = 5;
const BATCH_DELAY_MS = 1200;
const MAX_RETRIES = 2;

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const RESUME = args.includes('--resume');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function loadCheckpoint() {
  if (RESUME && fs.existsSync(CHECKPOINT_FILE)) {
    const cp = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
    console.log(`Resuming from checkpoint: ${cp.processed} already done, ${cp.failed} failed`);
    return cp;
  }
  return { processed: [], failed: [], results: {} };
}

function saveCheckpoint(cp) {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(cp));
}

async function fetchCompanyData(ticker) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const [quoteSummary, timeSeries] = await Promise.all([
        yf.quoteSummary(ticker, {
          modules: ['financialData', 'summaryProfile']
        }).catch(() => null),
        yf.fundamentalsTimeSeries(ticker, {
          period1: '2023-01-01',
          period2: '2026-12-31',
          type: 'annual',
          module: 'all'
        }).catch(() => null)
      ]);

      const fd = quoteSummary?.financialData || {};
      const sp = quoteSummary?.summaryProfile || {};
      const latest = timeSeries?.[0] || {};

      const result = {};

      // Revenue: prefer totalRevenue from financialData (freshest), fallback to timeSeries
      const revenue = fd.totalRevenue || latest.totalRevenue;
      if (revenue) {
        result.revenue = Math.round(revenue);
        result.revenue_currency = fd.financialCurrency || null;
        result.revenue_date = latest.date
          ? new Date(latest.date).toISOString().slice(0, 10)
          : null;
      }

      // Net Income: from timeSeries (more reliable, with date)
      const netIncome = latest.netIncome || latest.netIncomeCommonStockholders || latest.dilutedNIAvailtoComStockholders;
      if (netIncome) {
        result.net_income = Math.round(netIncome);
        result.net_income_currency = fd.financialCurrency || null;
        result.net_income_date = latest.date
          ? new Date(latest.date).toISOString().slice(0, 10)
          : null;
      }

      // Employees: from summaryProfile (current snapshot, no historical)
      if (sp.fullTimeEmployees) {
        result.employees = sp.fullTimeEmployees;
        result.employees_date = new Date().toISOString().slice(0, 10);
      }

      // Sector/industry bonus
      if (sp.sector) result.yahoo_sector = sp.sector;
      if (sp.industry) result.yahoo_industry = sp.industry;

      if (Object.keys(result).length === 0) return null;
      return result;
    } catch (e) {
      if (attempt === MAX_RETRIES) {
        return { _error: e.message?.slice(0, 100) || 'unknown' };
      }
      await sleep(3000 * (attempt + 1));
    }
  }
  return null;
}

function fmtNum(v) {
  if (!v && v !== 0) return '-';
  const abs = Math.abs(v);
  if (abs >= 1e12) return (v / 1e12).toFixed(1) + 'T';
  if (abs >= 1e9) return (v / 1e9).toFixed(1) + 'B';
  if (abs >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (abs >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return v.toFixed(0);
}

async function main() {
  if (DRY_RUN) console.log('=== DRY RUN — no files will be modified ===\n');

  if (!DRY_RUN && !fs.existsSync(BAK_FILE)) {
    fs.copyFileSync(IN_FILE, BAK_FILE);
    console.log('Backup saved to', BAK_FILE);
  }

  const data = JSON.parse(fs.readFileSync(IN_FILE, 'utf8'));
  const cp = loadCheckpoint();

  // Build index: ticker -> [{cityKey, index, company}]
  const tickerIndex = new Map();
  for (const [cityKey, list] of Object.entries(data)) {
    for (let i = 0; i < list.length; i++) {
      const co = list[i];
      if (co.ticker) {
        if (!tickerIndex.has(co.ticker)) tickerIndex.set(co.ticker, []);
        tickerIndex.get(co.ticker).push({ cityKey, index: i, company: co });
      }
    }
  }

  const uniqueTickers = [...tickerIndex.keys()];
  const alreadyDone = new Set(cp.processed);
  const toProcess = uniqueTickers.filter(t => !alreadyDone.has(t));

  console.log(`Total unique tickers:     ${uniqueTickers.length}`);
  console.log(`Already processed:        ${alreadyDone.size}`);
  console.log(`Remaining to process:     ${toProcess.length}`);

  if (toProcess.length === 0) {
    console.log('\nAll tickers already processed!');
    applyResults(data, cp);
    return;
  }

  let updated = 0, noData = 0, errors = 0, noChange = 0;
  const t0 = Date.now();

  // Process in concurrent batches
  for (let i = 0; i < toProcess.length; i += CONCURRENCY) {
    const batch = toProcess.slice(i, i + CONCURRENCY);

    const promises = batch.map(async (ticker) => {
      const result = await fetchCompanyData(ticker);

      if (!result) {
        noData++;
        cp.processed.push(ticker);
        cp.failed.push(ticker);
        return;
      }

      if (result._error) {
        errors++;
        cp.processed.push(ticker);
        cp.failed.push(ticker);
        console.log(`  ✗ ${ticker}: ${result._error}`);
        return;
      }

      cp.processed.push(ticker);
      cp.results[ticker] = result;

      // Log
      const entries = tickerIndex.get(ticker) || [];
      const co = entries[0]?.company;
      const name = co?.name || ticker;
      const revStr = result.revenue ? `${result.revenue_currency || '?'} ${fmtNum(result.revenue)}` : '-';
      const niStr = result.net_income ? fmtNum(result.net_income) : '-';
      const empStr = result.employees || '-';
      const dateStr = result.revenue_date || '-';
      console.log(`  ✓ ${name.slice(0, 30).padEnd(30)} (${ticker.padEnd(12)}) rev:${revStr.padEnd(18)} ni:${niStr.padEnd(8)} emp:${String(empStr).padEnd(8)} date:${dateStr}`);

      updated++;
    });

    await Promise.all(promises);

    // Progress + checkpoint every batch
    const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
    const done = cp.processed.length;
    const remaining = uniqueTickers.length - done;
    const rate = done / ((Date.now() - t0) / 1000);
    const eta = rate > 0 ? (remaining / rate / 60).toFixed(1) : '?';
    process.stdout.write(`  [${done}/${uniqueTickers.length}] ${elapsed}s elapsed, ~${eta}min remaining\n`);

    if (!DRY_RUN) saveCheckpoint(cp);

    if (i + CONCURRENCY < toProcess.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  // Apply results to companies.json
  if (!DRY_RUN) {
    applyResults(data, cp);
  }

  const totalElapsed = ((Date.now() - t0) / 1000).toFixed(0);
  console.log('\n=== Yahoo Finance Enrichment Report ===');
  console.log(`Mode:              ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Elapsed:           ${totalElapsed}s`);
  console.log(`Tickers processed: ${cp.processed.length}`);
  console.log(`Updated:           ${updated}`);
  console.log(`No data:           ${noData}`);
  console.log(`Errors:            ${errors}`);
  console.log(`Failed tickers:    ${cp.failed.length}`);

  // Summary of fields obtained
  const allResults = Object.values(cp.results);
  const withRev = allResults.filter(r => r.revenue).length;
  const withNI = allResults.filter(r => r.net_income).length;
  const withEmp = allResults.filter(r => r.employees).length;
  const withDate = allResults.filter(r => r.revenue_date).length;
  console.log(`\nField coverage (of ${allResults.length} successful):`);
  console.log(`  revenue:         ${withRev} (${(withRev/allResults.length*100).toFixed(1)}%)`);
  console.log(`  net_income:       ${withNI} (${(withNI/allResults.length*100).toFixed(1)}%)`);
  console.log(`  employees:        ${withEmp} (${(withEmp/allResults.length*100).toFixed(1)}%)`);
  console.log(`  revenue_date:    ${withDate} (${(withDate/allResults.length*100).toFixed(1)}%)`);
}

function applyResults(data, cp) {
  let companiesUpdated = 0;

  for (const [cityKey, list] of Object.entries(data)) {
    for (let i = 0; i < list.length; i++) {
      const co = list[i];
      if (!co.ticker || !cp.results[co.ticker]) continue;

      const r = cp.results[co.ticker];
      let changed = false;

      if (r.revenue) {
        co.revenue = r.revenue;
        co.revenue_currency = r.revenue_currency || co.revenue_currency;
        if (r.revenue_date) co.revenue_date = r.revenue_date;
        changed = true;
      }

      if (r.net_income) {
        co.net_income = r.net_income;
        co.net_income_currency = r.net_income_currency || co.revenue_currency;
        if (r.net_income_date) co.net_income_date = r.net_income_date;
        changed = true;
      }

      if (r.employees) {
        co.employees = r.employees;
        if (r.employees_date) co.employees_date = r.employees_date;
        changed = true;
      }

      if (changed) companiesUpdated++;
    }
  }

  fs.writeFileSync(IN_FILE, JSON.stringify(data));
  console.log(`\n✔ Applied ${companiesUpdated} company updates to companies.json`);
}

main().catch(e => { console.error(e); process.exit(1); });