#!/usr/bin/env node
/**
 * scripts/fetch-market-cap.js
 *
 * One-time supplemental script: fetches Wikidata P2226 (market capitalization)
 * for every company already in companies.json and patches the file in place.
 *
 * Runs in batches of 50 QIDs via wbgetentities (same API used by fetch-companies).
 * Checkpointed — safe to interrupt and resume.
 *
 * Usage:
 *   node scripts/fetch-market-cap.js
 *   node scripts/fetch-market-cap.js --fresh   (re-fetch everything)
 */
'use strict';

const https   = require('https');
const http    = require('http');
const fs      = require('fs');
const { atomicWrite } = require('./safe-write');
const path    = require('path');
const { URL } = require('url');

const OUT_FILE        = path.join(__dirname, '..', 'public', 'companies.json');
const CHECKPOINT_FILE = path.join(__dirname, '.market-cap-checkpoint.json');

const WD_API    = 'https://www.wikidata.org/w/api.php';
const BATCH     = 50;
const DELAY_MS  = 1200;
const RETRY_MS  = 30000;
const MAX_RETRY = 4;
const UA        = 'kworlddatamap/2.0 (educational; market-cap supplement)';

// Wikidata currency QID → ISO code
const WIKIDATA_CURRENCY = {
  Q4917:'USD',   Q4916:'EUR',   Q25224:'GBP',  Q8146:'JPY',
  Q47026:'KRW',  Q25239:'SGD',  Q1104069:'CNY',Q80973:'INR',
  Q7362:'BRL',   Q1043616:'AUD',Q42585:'CAD',  Q25517:'CHF',
  Q62613:'HKD',  Q192152:'TWD', Q170494:'IDR', Q208856:'MXN',
  Q3028:'NOK',   Q41801:'SEK',  Q13114:'DKK',  Q80474:'PLN',
  Q125861:'RUB', Q25255:'ZAR',  Q34735:'MYR',  Q4714:'TRY',
  Q171015:'AED', Q37150:'SAR',  Q174924:'THB', Q193778:'PHP',
  Q213014:'NGN', Q179241:'EGP', Q5185:'CZK',   Q47494:'HUF',
  Q1104676:'RON',Q1464125:'CLP',Q47073:'COP',  Q200185:'ILS',
  Q134144:'PKR', Q131316:'BDT', Q214400:'VND', Q181619:'KWD',
  Q202040:'QAR',
};

function unitToCurrency(unitUrl) {
  if (!unitUrl || unitUrl === '1') return null;
  const m = unitUrl.match(/Q(\d+)$/);
  return m ? (WIKIDATA_CURRENCY['Q' + m[1]] || null) : null;
}

// ── HTTP helper ───────────────────────────────────────────────────────────────
function httpGet(urlStr, hops = 5) {
  return new Promise((resolve, reject) => {
    const p   = new URL(urlStr);
    const lib = p.protocol === 'http:' ? http : https;
    lib.get({
      hostname: p.hostname,
      path:     p.pathname + p.search,
      headers:  { 'User-Agent': UA },
    }, res => {
      if ([301,302,303,307,308].includes(res.statusCode) && hops > 0) {
        const loc = res.headers.location || '';
        return httpGet(loc.startsWith('http') ? loc : new URL(loc, urlStr).href, hops - 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        const retryAfter = res.headers['retry-after'] ? parseInt(res.headers['retry-after'],10) : null;
        res.resume();
        const e = Object.assign(new Error(`HTTP ${res.statusCode}`), { status: res.statusCode, retryAfter });
        return reject(e);
      }
      const c = [];
      res.on('data', d => c.push(d));
      res.on('end', () => resolve(Buffer.concat(c).toString('utf8')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

const delay = ms => new Promise(r => setTimeout(r, ms));

async function withRetry(fn, label) {
  for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
    try { return await fn(); }
    catch (e) {
      if (attempt === MAX_RETRY) throw e;
      const wait = e.retryAfter ? e.retryAfter * 1000 : RETRY_MS * (attempt + 1);
      process.stdout.write(` retry(${attempt+1}) after ${(wait/1000).toFixed(0)}s…`);
      await delay(wait);
    }
  }
}

// ── Extract most-recent P2226 value from entity claims ────────────────────────
function extractMarketCap(entity) {
  const stmts = entity.claims?.P2226;
  if (!stmts || !stmts.length) return null;

  let best = null;
  for (const s of stmts) {
    const dv = s.mainsnak?.datavalue;
    if (dv?.type !== 'quantity') continue;
    const raw      = dv.value;
    const value    = Math.round(Math.abs(Number(raw.amount)));
    const currency = unitToCurrency(raw.unit);
    if (!value || !currency) continue;

    // Year from P585 (point in time) qualifier
    let year = null;
    for (const q of Object.values(s.qualifiers || {})) {
      for (const qv of q) {
        if (qv.property === 'P585' && qv.datavalue?.value?.time) {
          const m = qv.datavalue.value.time.match(/\+(\d{4})/);
          if (m) year = parseInt(m[1], 10);
        }
      }
    }

    if (!best || (year && (!best.year || year > best.year))) {
      best = { value, currency, year };
    }
  }
  return best;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const FRESH = process.argv.includes('--fresh');

  const companies = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));

  // Build unique QID list (companies can appear in multiple cities)
  const qidToEntries = new Map();
  for (const [cityQid, cos] of Object.entries(companies)) {
    for (let i = 0; i < cos.length; i++) {
      const qid = cos[i].qid;
      if (!qid) continue;
      if (!qidToEntries.has(qid)) qidToEntries.set(qid, []);
      qidToEntries.get(qid).push({ cityQid, idx: i });
    }
  }

  const allQids = [...qidToEntries.keys()];
  const cp      = (!FRESH && fs.existsSync(CHECKPOINT_FILE))
    ? JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'))
    : { done: [] };
  const doneSet = new Set(cp.done);
  const todo    = allQids.filter(q => !doneSet.has(q));

  const totalBatches = Math.ceil(allQids.length / BATCH);
  const startBatch   = Math.floor(doneSet.size / BATCH);

  console.log(`\n╔════════════════════════════════════════════════════╗`);
  console.log(`║  fetch-market-cap — Wikidata P2226 supplement      ║`);
  console.log(`╚════════════════════════════════════════════════════╝`);
  console.log(`Companies : ${allQids.length.toLocaleString()} unique QIDs`);
  console.log(`Batches   : ${totalBatches}`);
  console.log(`Resuming  : ${doneSet.size} done · ${todo.length} remaining\n`);

  let patched = 0;
  let bNum    = startBatch;

  for (let i = 0; i < todo.length; i += BATCH) {
    bNum++;
    const batch = todo.slice(i, i + BATCH);
    process.stdout.write(`  [${bNum}/${totalBatches}] ${batch.length} entities… `);
    const t0 = Date.now();

    let entities;
    try {
      const url = `${WD_API}?action=wbgetentities&ids=${batch.join('|')}&props=claims&format=json`;
      const raw = await withRetry(() => httpGet(url), `batch ${bNum}`);
      entities  = JSON.parse(raw).entities || {};
    } catch (e) {
      process.stdout.write(`✗ ${e.message} — skipping\n`);
      batch.forEach(q => doneSet.add(q));
      fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify({ done: [...doneSet] }), 'utf8');
      await delay(DELAY_MS);
      continue;
    }

    let batchPatched = 0;
    for (const [qid, entity] of Object.entries(entities)) {
      if (entity.missing) { doneSet.add(qid); continue; }
      const mc = extractMarketCap(entity);
      if (mc) {
        for (const { cityQid, idx } of (qidToEntries.get(qid) || [])) {
          companies[cityQid][idx].market_cap          = mc.value;
          companies[cityQid][idx].market_cap_currency = mc.currency;
          companies[cityQid][idx].market_cap_year     = mc.year;
          batchPatched++;
          patched++;
        }
      }
      doneSet.add(qid);
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    process.stdout.write(`${batchPatched} patched (${elapsed}s)\n`);

    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify({ done: [...doneSet] }), 'utf8');
    atomicWrite(OUT_FILE, JSON.stringify(companies), 'utf8');

    if (i + BATCH < todo.length) await delay(DELAY_MS);
  }

  const mb = (fs.statSync(OUT_FILE).size / 1e6).toFixed(1);
  console.log(`\n  Market cap patched : ${patched.toLocaleString()} company records`);
  console.log(`  Wrote ${OUT_FILE} (${mb} MB)`);
  if (fs.existsSync(CHECKPOINT_FILE)) fs.unlinkSync(CHECKPOINT_FILE);
  console.log(`\n✓ Done\n`);
}

main().catch(e => { console.error('\nFatal:', e.message); process.exit(1); });
