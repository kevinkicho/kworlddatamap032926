#!/usr/bin/env node
/**
 * scripts/fetch-companies.js
 *
 * Fetches companies headquartered in our cities from Wikidata.
 *
 * Filters applied:
 *  - Revenue (P2139) is REQUIRED — eliminates govt agencies, schools, police depts, etc.
 *  - Defunct companies (P576 dissolution date) are excluded
 *  - One P131 hop so district-level HQs (e.g. Samsung in Gangnam-gu → Seoul) are attributed correctly
 *
 * Output: public/companies.json  keyed by city QID
 *   { "Q8684": [ { qid, name, industry, employees, revenue, net_income,
 *                  founded, website, wikipedia }, ... ] }
 *
 * Usage:  npm run fetch-companies
 */

'use strict';

const https   = require('https');
const http    = require('http');
const fs      = require('fs');
const path    = require('path');
const { URL } = require('url');

const CITIES_FILE     = path.join(__dirname, '..', 'public', 'cities-full.json');
const OUT_FILE        = path.join(__dirname, '..', 'public', 'companies.json');
const CHECKPOINT_FILE = path.join(__dirname, '.companies-checkpoint.json');
const SPARQL_URL      = 'https://query.wikidata.org/sparql';

const BATCH_SIZE  = 20;     // smaller batches → less query cost per request
const QUERY_LIMIT = 2000;   // SPARQL row cap — if hit, batch is truncated and needs splitting
const DELAY_MS    = 5000;   // pause between batches (ms)
const RETRY_BASE  = 30000;  // base wait for exponential backoff (ms): 30s, 60s, 90s, 120s, 150s
const MAX_RETRIES = 5;      // more attempts before giving up or falling back

// ── HTTP helper ───────────────────────────────────────────────────────────────
function httpGet(url, headers = {}, hops = 5) {
  return new Promise((resolve, reject) => {
    const p   = new URL(url);
    const lib = p.protocol === 'http:' ? http : https;
    lib.get({
      hostname: p.hostname,
      path:     p.pathname + p.search,
      headers:  { 'User-Agent': 'kworlddatamap/1.0 (educational)', ...headers },
    }, res => {
      if ([301,302,303,307,308].includes(res.statusCode) && hops > 0) {
        const loc  = res.headers.location || '';
        const next = loc.startsWith('http') ? loc : new URL(loc, url).href;
        res.resume();
        return httpGet(next, headers, hops - 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        // Drain body so socket is released, attach status for caller
        const chunks = [];
        res.on('data', d => chunks.push(d));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8').slice(0, 300);
          const err  = Object.assign(
            new Error(`HTTP ${res.statusCode}`),
            { status: res.statusCode, body }
          );
          reject(err);
        });
        return;
      }
      const c = [];
      res.on('data', d => c.push(d));
      res.on('end', () => resolve(Buffer.concat(c).toString('utf8')));
      res.on('error', reject);
    }).on('error', reject);
  });
}
const delay = ms => new Promise(r => setTimeout(r, ms));

// ── SPARQL query (full) ───────────────────────────────────────────────────────
// Uses GROUP BY + GROUP_CONCAT to fetch complete time-series for all financial
// fields in a single pass, without row-count explosion from cross-product joins.
// LIMIT now applies to companies (one row per company after GROUP BY), so the
// 2000-row cap no longer silently truncates large city hubs like Tokyo or Seoul.
function buildQuery(qids) {
  const vals = qids.map(q => `wd:${q}`).join(' ');
  return `
SELECT ?co ?coLabel ?hq
  (SAMPLE(STR(?indLabel))  AS ?industry)
  (GROUP_CONCAT(DISTINCT STR(?exLabel); separator="§")  AS ?exchangeLabels)
  (SAMPLE(STR(?tk))        AS ?ticker)
  (GROUP_CONCAT(DISTINCT CONCAT(STR(?rev), "|", IF(BOUND(?revYr), STR(?revYr), "")); separator="§") AS ?revenueHist)
  (SAMPLE(?emp)            AS ?employees)
  (SAMPLE(?ni)             AS ?netIncome)
  (SAMPLE(?oi)             AS ?operatingIncome)
  (SAMPLE(?ta)             AS ?totalAssets)
  (SAMPLE(?te)             AS ?totalEquity)
  (SAMPLE(?foundedYr)      AS ?founded)
  (SAMPLE(STR(?site))      AS ?website)
  (SAMPLE(?wpStr)          AS ?wpUrl)
WHERE {
  VALUES ?hq { ${vals} }

  # Direct HQ match OR one P131 hop (e.g. Samsung in Gangnam-gu → Seoul)
  { ?co wdt:P159 ?hq . }
  UNION
  { ?co wdt:P159 ?loc . ?loc wdt:P131 ?hq . }

  # ── Significance filter ────────────────────────────────────────────────────
  # Path 1: publicly traded (P414 existence check — no variable binding to keep
  #   the significance check cheap; exchange label fetched separately below).
  # Path 2: large private companies with revenue ≥ 1B (local currency).
  {
    { ?co wdt:P414 [] . }
    UNION
    {
      ?co wdt:P2139 ?bigRev .
      FILTER(?bigRev >= 1000000000)
      FILTER NOT EXISTS {
        VALUES ?npType {
          wd:Q163740   # non-profit organization
          wd:Q157031   # foundation
          wd:Q41487    # charitable organization
          wd:Q7397682  # non-profit corporation
          wd:Q327333   # government organization
          wd:Q208586   # public library
        }
        ?co wdt:P31 ?npType .
      }
    }
  }

  # Exclude dissolved / defunct companies
  FILTER NOT EXISTS { ?co wdt:P576 [] }

  OPTIONAL { ?co wdt:P452 ?ind . }
  OPTIONAL { ?co wdt:P414 ?ex .  }
  OPTIONAL { ?co wdt:P249 ?tk .  }

  # Revenue: full statement path gives all historical years in GROUP_CONCAT.
  # Cross-product: N_rev_years × 1 (others return single preferred-rank value).
  # DISTINCT in GROUP_CONCAT removes duplicates from any residual cross-product.
  OPTIONAL {
    ?co p:P2139 ?revStmt . ?revStmt ps:P2139 ?rev .
    OPTIONAL { ?revStmt pq:P585 ?revDate . BIND(YEAR(?revDate) AS ?revYr) }
  }

  # Other financial fields use wdt: (preferred-rank single value) to keep the
  # cross-product at 1 and avoid the query-timeout that full statement paths cause.
  OPTIONAL { ?co wdt:P1082 ?emp . }
  OPTIONAL { ?co wdt:P2295 ?ni  . }
  OPTIONAL { ?co wdt:P3362 ?oi  . }
  OPTIONAL { ?co wdt:P2403 ?ta  . }
  OPTIONAL { ?co wdt:P2137 ?te  . }
  OPTIONAL { ?co wdt:P571 ?fd    . BIND(YEAR(?fd) AS ?foundedYr) }
  OPTIONAL { ?co wdt:P856 ?site  . }
  OPTIONAL {
    ?wpPage schema:about ?co ;
            schema:inLanguage "en" ;
            schema:isPartOf <https://en.wikipedia.org/> .
    BIND(STR(?wpPage) AS ?wpStr)
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,ko,ja,zh,de,fr,es,pt,ru,it,ar,tr,nl,pl,sv". }
}
GROUP BY ?co ?coLabel ?hq
ORDER BY ?hq ?coLabel
LIMIT ${QUERY_LIMIT}`;
}

// ── SPARQL query (lite — P414 only, no revenue filter, fewer OPTIONALs) ──────
// Used as fallback when the full query silently times out on a single city.
// Fewer OPTIONAL clauses → far less computation → completes where full query fails.
function buildLiteQuery(qid) {
  return `
SELECT DISTINCT ?co ?coLabel ?hq ?indLabel ?employees ?founded ?website ?wpUrl ?exchangeLabel ?ticker WHERE {
  VALUES ?hq { wd:${qid} }
  { ?co wdt:P159 ?hq . }
  UNION
  { ?co wdt:P159 ?loc . ?loc wdt:P131 ?hq . }
  ?co wdt:P414 ?exchange .
  FILTER NOT EXISTS { ?co wdt:P576 [] }
  OPTIONAL { ?co wdt:P452 ?ind . }
  OPTIONAL { ?co wdt:P1082 ?employees . }
  OPTIONAL { ?co wdt:P249 ?ticker . }
  OPTIONAL { ?co wdt:P571 ?fd . BIND(YEAR(?fd) AS ?founded) }
  OPTIONAL { ?co wdt:P856 ?website . }
  OPTIONAL {
    ?wpPage schema:about ?co ;
            schema:inLanguage "en" ;
            schema:isPartOf <https://en.wikipedia.org/> .
    BIND(STR(?wpPage) AS ?wpUrl)
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,ko,ja,zh,de,fr,es,pt,ru,it,ar,tr,nl,pl,sv". }
}
ORDER BY ?coLabel
LIMIT ${QUERY_LIMIT}`;
}

// ── Fetch lite (single heavy city — P414 only, fast) ─────────────────────────
async function fetchLite(qid) {
  process.stdout.write(`\n    ⚡ full query too heavy — using lite query for ${qid}…\n    `);
  const url = SPARQL_URL + '?query=' + encodeURIComponent(buildLiteQuery(qid)) + '&format=json';
  for (let attempt = 1; attempt <= 3; attempt++) {
    const t0 = Date.now();
    try {
      const raw  = await httpGet(url, { Accept: 'application/sparql-results+json' });
      const data = JSON.parse(raw);
      const rows = data.results?.bindings || [];
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      const out  = parseBatchRows(rows);
      const n    = Object.values(out).reduce((s, a) => s + a.length, 0);
      process.stdout.write(`lite OK: ${rows.length} rows → ${n} cos (${elapsed}s) `);
      return out;
    } catch (e) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      if (attempt < 3) {
        process.stdout.write(`\n    ⚠  lite HTTP ${e.status} after ${elapsed}s → retrying in 20s (${3 - attempt} left)\n    `);
        await delay(20_000);
      } else {
        process.stdout.write(`\n    ✗ lite query also failed — skipping ${qid}\n    `);
        return {};
      }
    }
  }
  return {};
}

// ── Fetch one batch ───────────────────────────────────────────────────────────
async function fetchBatch(qids, retries = MAX_RETRIES) {
  const url = SPARQL_URL + '?query=' + encodeURIComponent(buildQuery(qids)) + '&format=json';
  const t0  = Date.now();
  let raw;
  try {
    raw = await httpGet(url, { Accept: 'application/sparql-results+json' });
  } catch (e) {
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const retryable = [429, 500, 502, 503, 504].includes(e.status);
    if (retryable && retries > 0) {
      const attempt = MAX_RETRIES - retries + 1;
      const wait    = RETRY_BASE * attempt;   // 30s, 60s, 90s, 120s, 150s
      process.stdout.write(
        `\n    ⚠  HTTP ${e.status} after ${elapsed}s` +
        (e.body ? ` — "${e.body.replace(/\s+/g,' ').trim().slice(0,80)}"` : '') +
        ` → retrying in ${wait/1000}s (${retries} left)\n    `
      );
      await delay(wait);
      return fetchBatch(qids, retries - 1);
    }
    // All retries exhausted — for 504 (query timeout) with multiple cities,
    // fall back to individual city queries rather than skipping entirely.
    if (e.status === 504 && qids.length > 1) {
      process.stdout.write(`\n    ⚡ HTTP 504 — batch too heavy, re-querying ${qids.length} cities individually…\n    `);
      const out = {};
      for (const qid of qids) {
        await delay(1500);
        // Only 2 retries for individual-city fallback — if the full query truly
        // can't complete for this city, fail fast and switch to the lite query.
        const single = await fetchBatch([qid], 2);
        if (single) Object.assign(out, single);
      }
      return out;
    }
    // Single city exhausted all retries on 504 — full query is too heavy.
    // Try the lite query (P414-only, far fewer OPTIONALs) as a last resort.
    if (e.status === 504 && qids.length === 1) {
      return fetchLite(qids[0]);
    }
    process.stdout.write(`\n    ✗ HTTP ${e.status} after ${elapsed}s — skipping batch\n    `);
    return null;
  }

  let data;
  try { data = JSON.parse(raw); }
  catch (e) {
    process.stdout.write(`\n    ✗ JSON parse error — skipping batch\n    `);
    return null;
  }

  const elapsedMs = Date.now() - t0;
  const elapsed   = (elapsedMs / 1000).toFixed(1);
  const rows      = data.results?.bindings || [];

  // Silent-timeout detection: Wikidata sometimes returns HTTP 200 with 0 rows
  // when its internal Blazegraph engine exhausts its ~60s compute budget.
  // Symptom: single-city query, 0 rows, took >30s.  Retry with the lite query
  // (P414-only, fewer OPTIONALs) which completes where the full query fails.
  if (rows.length === 0 && qids.length === 1 && elapsedMs > 30_000) {
    process.stdout.write(`\n    ⚠  silent timeout (${elapsed}s, 0 rows) — retrying with lite query…\n    `);
    await delay(5_000);
    const liteUrl = SPARQL_URL + '?query=' + encodeURIComponent(buildLiteQuery(qids[0])) + '&format=json';
    const t1 = Date.now();
    let liteRaw;
    try {
      liteRaw = await httpGet(liteUrl, { Accept: 'application/sparql-results+json' });
    } catch (e2) {
      process.stdout.write(`\n    ✗ lite query also failed (${e2.status}) — skipping city ${qids[0]}\n    `);
      return {};
    }
    let liteData;
    try { liteData = JSON.parse(liteRaw); } catch { return {}; }
    const liteRows    = liteData.results?.bindings || [];
    const liteElapsed = ((Date.now() - t1) / 1000).toFixed(1);
    process.stdout.write(`lite: ${liteRows.length} rows (${liteElapsed}s) `);
    // Re-parse using the same row structure (revenue/financial fields will be null)
    return parseBatchRows(liteRows);
  }

  // Hit the row cap — this batch was truncated. Re-query each city individually
  // so no companies are silently dropped from large hubs like Tokyo or Seoul.
  if (rows.length >= QUERY_LIMIT && qids.length > 1) {
    process.stdout.write(`\n    ⚡ hit ${QUERY_LIMIT}-row cap — re-querying ${qids.length} cities individually…\n    `);
    const out = {};
    for (const qid of qids) {
      await delay(1500);
      const single = await fetchBatch([qid], retries);
      if (single) Object.assign(out, single);
    }
    return out;
  }

  const out = parseBatchRows(rows);
  process.stdout.write(`${rows.length} rows → ${Object.values(out).reduce((s,a) => s+a.length, 0)} cos (${elapsed}s)`);
  return out;
}

// ── History parser (GROUP_CONCAT → [{year, value}] sorted ascending) ─────────
// GROUP_CONCAT format: "val1|yr1§val2|yr2§..." (DISTINCT already applied in SPARQL)
// Returns [] when str is empty or null.
function parseHistory(str) {
  if (!str) return [];
  return str.split('§')
    .map(s => {
      const [v, y] = s.split('|');
      const value = v ? Math.round(Number(v)) : null;
      const year  = y ? Number(y)             : null;
      return { year, value };
    })
    .filter(h => h.value !== null && !isNaN(h.value))
    .sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
}

// Returns the most-recent entry from a history array, or {value:null, year:null}.
function latestOf(hist) {
  if (!hist.length) return { value: null, year: null };
  return hist[hist.length - 1];
}

// ── Row parser (shared by full query and lite fallback) ───────────────────────
// Full query uses GROUP BY — one row per company with GROUP_CONCAT history strings.
// Lite query uses SELECT DISTINCT — one row per company (no financial fields).
function parseBatchRows(rows) {
  const byCity = {};
  for (const row of rows) {
    const cityQid = row.hq?.value?.split('/').pop();
    const coQid   = row.co?.value?.split('/').pop();
    if (!cityQid || !coQid) continue;
    if (!byCity[cityQid]) byCity[cityQid] = {};

    // Revenue: GROUP_CONCAT history string → full time-series.
    // Other financials: scalar SAMPLE values (wdt: preferred-rank, no year info).
    // Exchange labels: GROUP_CONCAT ("§"-joined) or single value from lite query.
    const revenueHist = parseHistory(row.revenueHist?.value);
    const { value: revenue, year: revenue_year } = latestOf(revenueHist);

    const employees       = row.employees       ? Math.round(Number(row.employees.value))       : null;
    const net_income      = row.netIncome       ? Math.round(Number(row.netIncome.value))       : null;
    const operating_income= row.operatingIncome ? Math.round(Number(row.operatingIncome.value)) : null;
    const total_assets    = row.totalAssets     ? Math.round(Number(row.totalAssets.value))     : null;
    const total_equity    = row.totalEquity     ? Math.round(Number(row.totalEquity.value))     : null;

    const exchRaw = row.exchangeLabels?.value || row.exchangeLabel?.value || '';
    const exchange = exchRaw.split('§').filter(Boolean)[0] || null;

    byCity[cityQid][coQid] = {
      qid:             coQid,
      name:            row.coLabel?.value  || coQid,
      industry:        row.industry?.value || row.indLabel?.value || null,
      exchange,
      ticker:          row.ticker?.value   || null,
      employees,
      revenue,
      revenue_year,
      revenue_history: revenueHist,
      net_income,
      operating_income,
      total_assets,
      total_equity,
      founded:         row.founded?.value  ? Number(row.founded.value) : null,
      website:         row.website?.value  || null,
      wikipedia:       row.wpUrl?.value    || null,
    };
  }

  const out = {};
  for (const [cq, cos] of Object.entries(byCity)) {
    out[cq] = Object.values(cos).sort((a, b) => {
      const ar = a.revenue || 0, br = b.revenue || 0;
      if (br !== ar) return br - ar;
      return a.name.localeCompare(b.name);
    });
  }
  return out;
}

// ── Checkpoint helpers ────────────────────────────────────────────────────────

function saveCheckpoint(result, nextBatch, skipped) {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify({
    version:   1,
    nextBatch,
    skipped,
    savedAt:   new Date().toISOString(),
    result:    Object.entries(result),   // [[cityQid, [co, ...]], ...]
  }), 'utf8');
}

function loadCheckpoint() {
  if (!fs.existsSync(CHECKPOINT_FILE)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
    if (data.version !== 1) return null;
    return data;
  } catch(e) { return null; }
}

function deleteCheckpoint() {
  if (fs.existsSync(CHECKPOINT_FILE)) fs.unlinkSync(CHECKPOINT_FILE);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const FRESH  = process.argv.includes('--fresh');
  const cities = JSON.parse(fs.readFileSync(CITIES_FILE, 'utf8'));
  const qids   = [...new Set(cities.map(c => c.qid).filter(Boolean))];
  const total  = Math.ceil(qids.length / BATCH_SIZE);

  console.log(`\n╔══════════════════════════════════════════════════╗`);
  console.log(`║   fetch-companies — with checkpoint/resume       ║`);
  console.log(`╚══════════════════════════════════════════════════╝`);
  console.log(`Cities : ${cities.length} | QIDs: ${qids.length} | Batches: ${total}`);
  console.log(`Filter : stock-exchange listed (P414) OR revenue ≥ 1B; defunct excluded`);
  console.log(`Output : ${OUT_FILE}\n`);

  // --fresh wipes any existing checkpoint and output
  if (FRESH) {
    deleteCheckpoint();
    console.log(`Mode: --fresh — ignoring checkpoint and existing data\n`);
  }

  // ── Resume from checkpoint if available ──────────────────────────────────
  let result     = {};
  let startBatch = 0;
  let skipped    = 0;

  const cp = !FRESH && loadCheckpoint();
  if (cp) {
    result     = Object.fromEntries(cp.result);
    startBatch = cp.nextBatch;
    skipped    = cp.skipped ?? 0;
    const coSoFar = Object.values(result).reduce((s, a) => s + a.length, 0);
    console.log(`Resuming from checkpoint saved at ${cp.savedAt}`);
    console.log(`  Batches already done : ${startBatch}/${total}`);
    console.log(`  Companies so far     : ${coSoFar}`);
    console.log(`  Skipped so far       : ${skipped}\n`);
  } else if (!FRESH) {
    // No checkpoint — load existing output for end-of-run merge
    // (preserves data from any city batches that get skipped this run)
    console.log(`No checkpoint found — starting from batch 1.\n`);
  }

  // ── Batch loop ────────────────────────────────────────────────────────────
  let totalCo = Object.values(result).reduce((s, a) => s + a.length, 0);

  for (let i = startBatch * BATCH_SIZE; i < qids.length; i += BATCH_SIZE) {
    const batch = qids.slice(i, i + BATCH_SIZE);
    const n     = Math.floor(i / BATCH_SIZE) + 1;
    process.stdout.write(`  [${String(n).padStart(3)}/${total}] `);

    const batchStart = Date.now();
    const br = await fetchBatch(batch);
    const batchMs = Date.now() - batchStart;

    if (br === null) {
      skipped++;
      console.log('');
    } else {
      const nc = Object.values(br).reduce((s, a) => s + a.length, 0);
      totalCo += nc;
      Object.assign(result, br);
      console.log('');
    }

    // Save checkpoint after every batch so any interruption is recoverable
    saveCheckpoint(result, n, skipped);

    // Progress summary every 20 batches
    if (n % 20 === 0) {
      const pct = ((n / total) * 100).toFixed(0);
      console.log(`\n  ── ${pct}% done | ${totalCo} companies so far | ${skipped} batches skipped ──\n`);
    }

    if (i + BATCH_SIZE < qids.length) {
      // After a heavy batch (>60s total including retries), give Wikidata extra
      // breathing room to reset rate-limit counters before the next request.
      const cooldown = batchMs > 60_000 ? 20_000 : DELAY_MS;
      if (cooldown > DELAY_MS) process.stdout.write(`  (heavy batch — cooling down ${cooldown/1000}s)\n`);
      await delay(cooldown);
    }
  }

  // ── Merge with existing output for any skipped batches ───────────────────
  // Companies from a previous run whose city batch was skipped this run
  // are preserved here so the file only ever grows, never loses data.
  let existing = {};
  if (!FRESH && fs.existsSync(OUT_FILE)) {
    try { existing = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8')); }
    catch(e) { /* ignore */ }
  }
  let preserved = 0;
  for (const [cityQid, existingCos] of Object.entries(existing)) {
    if (!result[cityQid]) { result[cityQid] = existingCos; preserved++; }
  }
  if (preserved) console.log(`\n  Preserved ${preserved} cities from previous output (skipped batches)`);

  // ── Write output ──────────────────────────────────────────────────────────
  fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 2), 'utf8');
  const kb = Math.round(fs.statSync(OUT_FILE).size / 1024);

  deleteCheckpoint();
  console.log(`\n╔══════════════════════════════════════════════════╗`);
  console.log(`║   Complete                                       ║`);
  console.log(`╠══════════════════════════════════════════════════╣`);
  console.log(`  Companies : ${totalCo} across ${Object.keys(result).length} cities`);
  console.log(`  Skipped   : ${skipped}/${total} batches`);
  console.log(`  File      : ${OUT_FILE} (${kb} KB)`);
  console.log(`  Checkpoint: deleted (clean finish)`);
  console.log(`╚══════════════════════════════════════════════════╝`);
}

main().catch(e => { console.error('\nFatal:', e.message); process.exit(1); });
