#!/usr/bin/env node
/**
 * fetch-tickers.js
 * ────────────────
 * Resolves ticker symbols for all companies in companies.json using
 * Yahoo Finance /v1/finance/search (no auth required).
 *
 * Scoring improvements over v1:
 *  - Strips .com / .co / .io suffixes before tokenising (amazon.com → amazon)
 *  - Strips common corporate suffixes (Inc, Ltd, Corp, Holdings, Group, etc.)
 *  - Recall-weighted scoring for short targets (≤2 tokens):
 *      "Honda" vs "Honda Motor Co." → recall=1.0 rather than precision=0.25
 *  - Exact-normalised-match shortcut for 1-token names
 *  - Min name length guard (skip names < 3 meaningful chars)
 *
 * Usage:
 *   node scripts/fetch-tickers.js              # run / resume (skips companies that already have tickers)
 *   node scripts/fetch-tickers.js --fresh      # restart from scratch (re-checks everyone)
 *   node scripts/fetch-tickers.js --improve    # only missing tickers, fresh checkpoint
 *   node scripts/fetch-tickers.js --dry-run    # print matches, don't save
 *   node scripts/fetch-tickers.js --limit 50   # process at most N companies
 */

'use strict';
require('dotenv').config();

const fs    = require('fs');
const path  = require('path');
const https = require('https');
const url   = require('url');

const COMPANIES_FILE  = path.join(__dirname, '..', 'public', 'companies.json');
const CHECKPOINT_FILE = path.join(__dirname, '.tickers-checkpoint.json');

const args    = process.argv.slice(2);
const FRESH   = args.includes('--fresh');
const IMPROVE = args.includes('--improve'); // only missing tickers, fresh checkpoint
const DRY_RUN = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const LIMIT   = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

// Minimum score thresholds
const MIN_CONFIDENCE  = 0.50; // multi-token names
const MIN_SHORT       = 0.68; // 1–2 token names (lower than old 0.85 — recall scoring handles safety)

// ── HTTP helper ───────────────────────────────────────────────────────────────
function httpGet(urlStr, headers = {}) {
  return new Promise((resolve) => {
    const u = new url.URL(urlStr);
    const opts = {
      hostname: u.hostname, port: 443, path: u.pathname + u.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; kworlddatamap/1.0)',
        Accept: 'application/json',
        ...headers,
      },
    };
    const req = https.request(opts, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => resolve({ status: r.statusCode, headers: r.headers, body: d }));
    });
    req.on('error', e => resolve({ status: 0, headers: {}, body: e.message }));
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Name normalisation ────────────────────────────────────────────────────────
// Strip .com/.co/.io domain suffixes FIRST (before removing dots),
// then strip common corporate legal suffixes, then remove punctuation.
const CORP_RE = /\b(incorporated|corporation|holdings|holding|limited|company|companies|group|plc|inc|corp|ltd|llc|co|sa|ag|nv|bv|gmbh|kk|se|srl|spa|oy|ab|as|asa|tbk|bhd|pcl)\b\.?/g;

function norm(s) {
  return (s || '')
    .toLowerCase()
    .replace(/\.com\b/g, '')   // amazon.com → amazon
    .replace(/\.co\b/g, '')    // foo.co → foo
    .replace(/\.io\b/g, '')    // foo.io → foo
    .replace(/[^a-z0-9\s]/g, ' ')  // punctuation → space
    .replace(CORP_RE, ' ')         // strip legal suffixes
    .replace(/\s+/g, ' ')
    .trim();
}

// Only keep tokens ≥ 2 chars so single-letter noise doesn't count
const tokens = s => norm(s).split(/\s+/).filter(t => t.length >= 2);

// ── Scoring ───────────────────────────────────────────────────────────────────
// For short targets (≤ 2 meaningful tokens) we weight RECALL heavily:
//   "honda" vs "honda motor"  → recall = 1/1 = 1.0  (target fully covered)
// For longer targets we use the balanced F1-like precision score:
//   "cosmo oil" vs "cosmo oil marketing" → precision = 2/3 = 0.67
function score(targetName, resultName) {
  const tt = tokens(targetName);
  const rt = tokens(resultName);
  if (!tt.length || !rt.length) return 0;
  const shared = tt.filter(t => rt.includes(t)).length;
  const precision = shared / Math.max(tt.length, rt.length, 1);
  if (tt.length <= 2) {
    // Recall: fraction of target tokens present in result
    const recall = shared / tt.length;
    return Math.max(precision, recall * 0.88);
  }
  return precision;
}

// ── Yahoo Finance search ──────────────────────────────────────────────────────
async function searchYahoo(name) {
  const q      = encodeURIComponent(name);
  const apiUrl = `https://query1.finance.yahoo.com/v1/finance/search` +
    `?q=${q}&quotesCount=8&newsCount=0&enableFuzzyQuery=false&enableEnhancedTrivialQuery=true`;

  const res = await httpGet(apiUrl);
  if (res.status === 429) return { rateLimit: true };
  if (res.status !== 200) return { error: res.status };

  try {
    const j        = JSON.parse(res.body);
    const equities = (j?.quotes || []).filter(q => q.quoteType === 'EQUITY');
    return { equities };
  } catch (e) {
    return { error: e.message };
  }
}

function pickBest(companyName, equities) {
  // Skip very short or purely numeric names — too ambiguous to match safely
  const normTarget = norm(companyName);
  if (normTarget.length < 3) return null;
  const targetToks = tokens(companyName);
  if (targetToks.length === 0) return null;

  let best = null, bestScore = -1;

  for (const item of equities) {
    for (const n of [item.longname, item.shortname].filter(Boolean)) {
      const s = score(companyName, n);
      // Small bonus for clean symbols with no exchange suffix (.T, .HK, etc.)
      const adjusted = s + (!/\.\w+$/.test(item.symbol || '') ? 0.05 : 0);

      // Exact normalised-name match is an instant win (handles "Casio" = "Casio")
      const exactMatch = norm(n) === normTarget;
      const finalScore = exactMatch ? Math.max(adjusted, 0.95) : adjusted;

      if (finalScore > bestScore) { bestScore = finalScore; best = item; }
    }
  }

  // Threshold: stricter for very short names to prevent false positives,
  // but much more lenient than the old 0.85 thanks to recall scoring.
  const threshold = targetToks.length <= 2 ? MIN_SHORT : MIN_CONFIDENCE;

  if (bestScore < threshold) return null;
  if (!best?.symbol || best.symbol.length > 10 || /\s/.test(best.symbol)) return null;
  return { ticker: best.symbol, exchange: best.exchDisp || best.exchange || '', score: bestScore };
}

// ── Checkpoint ────────────────────────────────────────────────────────────────
function loadCheckpoint() {
  if ((FRESH || IMPROVE) && fs.existsSync(CHECKPOINT_FILE)) fs.unlinkSync(CHECKPOINT_FILE);
  if (!fs.existsSync(CHECKPOINT_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8')); } catch { return {}; }
}

function saveCheckpoint(done) {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(done, null, 2));
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log('Loading companies.json…');
  const companies = JSON.parse(fs.readFileSync(COMPANIES_FILE, 'utf8'));
  const all       = Object.values(companies).flat().filter(c => c.qid);
  console.log(`${all.length} companies with QIDs`);

  const done = loadCheckpoint();
  console.log(`Checkpoint: ${Object.keys(done).length} already processed`);

  // --improve: only companies without tickers, fresh checkpoint
  // default:   skip companies that already have a ticker
  // --fresh:   re-check everyone
  const needWork = all
    .filter(c => FRESH ? true : !c.ticker)
    .filter(c => !done[c.qid])
    .slice(0, LIMIT);

  console.log(`${needWork.length} companies to search\n`);
  if (!needWork.length) {
    console.log('Nothing to do.');
    return;
  }

  let found = 0, skipped = 0;

  for (let i = 0; i < needWork.length; i++) {
    const co = needWork[i];
    process.stdout.write(`[${i+1}/${needWork.length}] "${co.name}"… `);

    const result = await searchYahoo(co.name);

    if (result.rateLimit) {
      console.log('rate limited — waiting 30s');
      await sleep(30000);
      i--; continue;
    }

    if (result.error) {
      console.log(`error: ${result.error}`);
      done[co.qid] = 'skipped';
      skipped++;
      await sleep(1500);
      continue;
    }

    const best = pickBest(co.name, result.equities);

    if (!best) {
      const topName  = result.equities[0]?.longname || result.equities[0]?.shortname || '(none)';
      const topScore = result.equities.length ? score(co.name, topName).toFixed(2) : '—';
      console.log(`no match (best: "${topName}" score ${topScore})`);
      done[co.qid] = 'skipped';
      skipped++;
    } else {
      console.log(`→ ${best.ticker} (${best.exchange}) score ${best.score.toFixed(2)}`);
      done[co.qid] = { ticker: best.ticker, exchange: best.exchange, score: best.score };
      found++;
    }

    if ((i + 1) % 100 === 0) saveCheckpoint(done);
    await sleep(1200); // ~50 req/min
  }

  saveCheckpoint(done);

  console.log(`\n── Results ──`);
  console.log(`  Found:   ${found}`);
  console.log(`  Skipped: ${skipped}`);

  if (DRY_RUN) {
    console.log('\n-- Dry run: matched tickers --');
    Object.entries(done)
      .filter(([, v]) => v !== 'skipped')
      .slice(0, 30)
      .forEach(([qid, v]) => {
        const co = all.find(c => c.qid === qid);
        console.log(`  ${(co?.name || qid).padEnd(40)} → ${v.ticker.padEnd(10)} (${v.exchange}) ${v.score.toFixed(2)}`);
      });
    return;
  }

  // Write tickers back into companies.json
  for (const cos of Object.values(companies)) {
    for (const co of cos) {
      if (!co.qid) continue;
      const result = done[co.qid];
      if (result && result !== 'skipped') {
        co.ticker          = result.ticker;
        co.ticker_exchange = result.exchange || null;
      }
    }
  }

  const applied = Object.values(companies).flat().filter(c => c.ticker).length;
  fs.writeFileSync(COMPANIES_FILE, JSON.stringify(companies));
  console.log(`\nSaved to companies.json`);
  console.log(`Ticker coverage: ${applied} / ${Object.values(companies).flat().length} companies`);
})();
