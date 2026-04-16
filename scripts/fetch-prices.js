#!/usr/bin/env node
/**
 * fetch-prices.js
 * ───────────────
 * Downloads 5 years of daily price history for every company in
 * companies.json that has a ticker symbol.
 *
 * Per ticker, fetches from Yahoo Finance chart API and saves to
 * public/prices/{TICKER}.json in compact columnar format:
 *
 *   {
 *     ticker:    "AAPL",
 *     currency:  "USD",
 *     exchange:  "NMS",
 *     updated:   "2025-04-01",
 *     t:  [unix, ...],          ← daily timestamps
 *     o:  [170.21, ...],        ← open
 *     h:  [172.33, ...],        ← high
 *     l:  [169.88, ...],        ← low
 *     c:  [171.45, ...],        ← close
 *     a:  [171.45, ...],        ← adjusted close
 *     v:  [52341200, ...],      ← volume
 *     dividends: [{t, amount}], ← cash dividends paid
 *     splits:    [{t, ratio}],  ← stock splits
 *   }
 *
 * Endpoint: /v8/finance/chart/{TICKER}
 * Requires Yahoo Finance session cookie + crumb (same as quoteSummary).
 * Gold subscription needed for full history; 5 years works on free tier too.
 *
 * Skips tickers already downloaded (file exists) unless --fresh.
 * Checkpoints progress — safe to Ctrl+C and resume.
 *
 * Usage:
 *   node scripts/fetch-prices.js              # run / resume
 *   node scripts/fetch-prices.js --fresh      # re-download everything
 *   node scripts/fetch-prices.js --dry-run    # list what would be fetched
 *   node scripts/fetch-prices.js --limit 50   # process at most N tickers
 */

'use strict';
require('dotenv').config();

const fs   = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');
const https = require('https');
const url   = require('url');

const COMPANIES_FILE = path.join(__dirname, '..', 'public', 'companies.json');
const PRICES_DIR     = path.join(__dirname, '..', 'public', 'prices');
const DELAY_MS       = 1200;   // ~50 req/min — polite for a session-based endpoint
const MAX_RETRIES    = 3;

const args     = process.argv.slice(2);
const FRESH    = args.includes('--fresh');
const DRY_RUN  = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const LIMIT    = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

// 5 years back from today
const PERIOD2 = Math.floor(Date.now() / 1000);
const PERIOD1 = PERIOD2 - 5 * 365 * 24 * 3600;

// ── Session (cookie + crumb) ──────────────────────────────────────────────────
let _crumb = null, _cookies = '';

function httpGetRaw(urlStr, extraHeaders = {}, hops = 5) {
  return new Promise((resolve) => {
    if (hops <= 0) return resolve({ status: 0, body: '', cookies: '' });
    let u;
    try { u = new url.URL(urlStr); } catch {
      return resolve({ status: 0, body: '', cookies: '' });
    }
    const req = https.request({
      hostname: u.hostname, port: 443,
      path: u.pathname + u.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; kworlddatamap/1.0)',
        Accept: '*/*',
        ...extraHeaders,
      },
    }, r => {
      const sc      = r.headers['set-cookie'] || [];
      const cookies = sc.map(c => c.split(';')[0]).join('; ');
      if ([301,302,307].includes(r.statusCode) && r.headers.location) {
        const next = r.headers.location.startsWith('http')
          ? r.headers.location
          : `https://${u.hostname}${r.headers.location}`;
        return resolve(httpGetRaw(next, {
          ...extraHeaders,
          Cookie: [extraHeaders.Cookie, cookies].filter(Boolean).join('; '),
        }, hops - 1));
      }
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => resolve({ status: r.statusCode, body: d, cookies }));
    });
    req.on('error', e => resolve({ status: 0, body: e.message, cookies: '' }));
    req.end();
  });
}

async function initSession() {
  if (_crumb) return;
  process.stdout.write('[session] Initialising… ');
  const r1 = await httpGetRaw('https://fc.yahoo.com', {});
  const r2 = await httpGetRaw('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    Cookie: r1.cookies,
  });
  if (r2.status === 200 && r2.body && !r2.body.startsWith('{')) {
    _crumb = r2.body.trim(); _cookies = r1.cookies;
    console.log('ok (crumb:', _crumb.slice(0,8) + '…)');
    return;
  }
  // Fallback
  const r3 = await httpGetRaw('https://finance.yahoo.com', {});
  _cookies = r3.cookies;
  const r4 = await httpGetRaw('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    Cookie: _cookies,
  });
  if (r4.status === 200 && r4.body && !r4.body.startsWith('{')) {
    _crumb = r4.body.trim();
    console.log('ok fallback (crumb:', _crumb.slice(0,8) + '…)');
  } else {
    _crumb = '';
    console.warn('WARNING: could not obtain crumb — requests may fail');
  }
}

async function apiGet(urlStr, attempt = 1) {
  await initSession();
  const res = await httpGetRaw(urlStr, { Cookie: _cookies });
  if (res.status === 401 && attempt === 1) {
    _crumb = null; _cookies = '';
    await initSession();
    return apiGet(urlStr, 2);
  }
  if (res.status === 429) {
    const wait = parseInt(
      (await httpGetRaw(urlStr)).cookies || '60', 10
    ) * 1000 || 60000;
    console.warn(`\n  429 rate-limited — waiting ${(wait/1000).toFixed(0)}s`);
    await sleep(wait + 2000);
    return apiGet(urlStr, attempt);
  }
  if (res.status >= 500 && attempt <= MAX_RETRIES) {
    await sleep(15000 * attempt);
    return apiGet(urlStr, attempt + 1);
  }
  return res;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Chart API fetch ───────────────────────────────────────────────────────────
async function fetchPrices(ticker) {
  const endpoint =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}` +
    `?period1=${PERIOD1}&period2=${PERIOD2}&interval=1d&events=div%7Csplit&crumb=${encodeURIComponent(_crumb || '')}`;

  const res = await apiGet(endpoint);
  if (res.status !== 200) return { error: `HTTP ${res.status}` };

  let j;
  try { j = JSON.parse(res.body); } catch (e) { return { error: `parse: ${e.message}` }; }

  const result = j?.chart?.result?.[0];
  if (!result) {
    const errMsg = j?.chart?.error?.description || 'no result';
    return { error: errMsg };
  }

  const meta   = result.meta || {};
  const ts     = result.timestamp || [];
  const quote  = result.indicators?.quote?.[0] || {};
  const adj    = result.indicators?.adjclose?.[0]?.adjclose || [];

  // Round price values to 4 dp, volume to integer
  const round4 = arr => (arr || []).map(v => v == null ? null : +v.toFixed(4));
  const roundV = arr => (arr || []).map(v => v == null ? null : Math.round(v));

  // Dividends: { "timestamp": { amount, date } }
  const rawDiv = result.events?.dividends || {};
  const dividends = Object.values(rawDiv)
    .map(d => ({ t: d.date, amount: +d.amount.toFixed(4) }))
    .sort((a, b) => a.t - b.t);

  // Splits: { "timestamp": { numerator, denominator, splitRatio, date } }
  const rawSplit = result.events?.splits || {};
  const splits = Object.values(rawSplit)
    .map(s => ({ t: s.date, ratio: s.splitRatio }))
    .sort((a, b) => a.t - b.t);

  return {
    ticker,
    currency:  meta.currency || null,
    exchange:  meta.exchangeName || null,
    updated:   new Date().toISOString().slice(0, 10),
    t:  ts,
    o:  round4(quote.open),
    h:  round4(quote.high),
    l:  round4(quote.low),
    c:  round4(quote.close),
    a:  round4(adj),
    v:  roundV(quote.volume),
    dividends,
    splits,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  // Ensure output directory exists
  if (!fs.existsSync(PRICES_DIR)) fs.mkdirSync(PRICES_DIR, { recursive: true });

  console.log('Loading companies.json…');
  const companies = JSON.parse(fs.readFileSync(COMPANIES_FILE, 'utf8'));

  // Collect all unique tickers (one ticker may appear for multiple city entries)
  const tickerMap = {};  // ticker → company name (first seen)
  for (const cos of Object.values(companies)) {
    for (const co of cos) {
      if (co.ticker && !tickerMap[co.ticker]) tickerMap[co.ticker] = co.name;
    }
  }

  const allTickers = Object.keys(tickerMap).sort();
  console.log(`${allTickers.length} unique tickers found in companies.json`);

  // Filter to those not yet downloaded (unless --fresh)
  const todo = allTickers
    .filter(t => FRESH || !fs.existsSync(path.join(PRICES_DIR, `${t}.json`)))
    .slice(0, LIMIT);

  console.log(`${todo.length} tickers to download\n`);

  if (DRY_RUN) {
    console.log('-- Dry run: first 30 tickers --');
    todo.slice(0, 30).forEach((t, i) => {
      console.log(`  ${String(i+1).padStart(3)}. ${t.padEnd(12)} ${tickerMap[t]}`);
    });
    return;
  }

  if (!todo.length) {
    console.log('Nothing to do — all tickers already downloaded. Use --fresh to re-download.');
    return;
  }

  let ok = 0, errors = 0;

  for (let i = 0; i < todo.length; i++) {
    const ticker = todo[i];
    const name   = tickerMap[ticker];
    process.stdout.write(`[${i+1}/${todo.length}] ${ticker.padEnd(12)} ${name.slice(0,35).padEnd(35)} `);

    const data = await fetchPrices(ticker);

    if (data.error) {
      console.log(`✗ ${data.error}`);
      errors++;
    } else {
      fs.writeFileSync(
        path.join(PRICES_DIR, `${ticker}.json`),
        JSON.stringify(data),
      );
      const days = data.t?.length || 0;
      console.log(`✓ ${days} days  div:${data.dividends.length}  split:${data.splits.length}`);
      ok++;
    }

    await sleep(DELAY_MS);
  }

  console.log(`\n── Done ──`);
  console.log(`  Downloaded: ${ok}`);
  console.log(`  Errors:     ${errors}`);
  console.log(`  Saved to:   public/prices/`);
  console.log(`  Total files: ${fs.readdirSync(PRICES_DIR).length}`);
})();
