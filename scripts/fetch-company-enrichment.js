#!/usr/bin/env node
/**
 * fetch-company-enrichment.js
 * Re-fetches Wikidata properties for all companies already in companies.json.
 * Adds/refreshes: market_cap, ceo, industry, exchange, ticker, employees,
 * net_income, operating_income, total_assets, total_equity — all in local
 * currencies (JPY stays JPY, KRW stays KRW, etc.)
 *
 * Preserves city assignments and existing structure; merges new fields in-place.
 * Backs up companies.json before writing.
 * Checkpoint saved every CHECKPOINT_EVERY batches — safe to Ctrl+C and resume.
 *
 * Sanity filter: financial values < 100,000 in native currency are skipped
 * (catches common Wikidata error where year is entered as the amount).
 *
 * Usage:
 *   node scripts/fetch-company-enrichment.js           resume if checkpoint exists
 *   node scripts/fetch-company-enrichment.js --fresh   restart from scratch
 */
'use strict';

const https   = require('https');
const http    = require('http');
const fs      = require('fs');
const path    = require('path');
const { URL } = require('url');

const COMPANIES_FILE  = path.join(__dirname, '..', 'public', 'companies.json');
const CHECKPOINT_FILE = path.join(__dirname, '.company-enrichment-checkpoint.json');

const WD_API           = 'https://www.wikidata.org/w/api.php';
const ENR_BATCH        = 50;    // companies per wbgetentities request
const LABEL_BATCH      = 50;    // QIDs per label-resolution request
const API_DELAY        = 1200;  // ms between API requests
const RETRY_BASE       = 30000; // ms base for backoff (30s, 60s, 90s…)
const MAX_RETRIES      = 5;
const CHECKPOINT_EVERY = 10;    // save checkpoint every N company-batches
const MIN_FINANCIAL    = 100_000; // values below this are treated as bad data (e.g. year entered as amount)

const UA = 'kworlddatamap/2.0 (educational; github.com/kworlddatamap)';

// ── Currency: Wikidata unit QID → ISO code ────────────────────────────────────
const WIKIDATA_CURRENCY = {
  // QIDs verified via Wikidata SPARQL (wdt:P31 wd:Q8142 / wdt:P498)
  Q4917:'USD',   Q4916:'EUR',   Q25224:'GBP',  Q8146:'JPY',
  Q202040:'KRW', Q190951:'SGD', Q39099:'CNY',  Q80524:'INR',
  Q173117:'BRL', Q259502:'AUD', Q1104069:'CAD',Q25344:'CHF',
  Q31015:'HKD',  Q208526:'TWD', Q41588:'IDR',  Q4730:'MXN',
  Q132643:'NOK', Q122922:'SEK', Q25417:'DKK',  Q123213:'PLN',
  Q41044:'RUB',  Q181907:'ZAR', Q163712:'MYR', Q172872:'TRY',
  Q200294:'AED', Q199857:'SAR', Q177882:'THB', Q17193:'PHP',
  Q203567:'NGN', Q199462:'EGP', Q131016:'CZK', Q47190:'HUF',
  Q131645:'RON', Q200050:'CLP', Q244819:'COP', Q131309:'ILS',
  Q188289:'PKR', Q194453:'BDT', Q192090:'VND', Q193098:'KWD',
  Q206386:'QAR', Q199674:'DZD', Q200192:'MAD', Q4602:'TND',
  Q1472704:'NZD',Q242915:'CRC', Q81893:'UAH',  Q173751:'KZT',
  Q4608:'GEL',   Q130498:'AMD', Q487888:'UZS', Q201875:'MMK',
  Q206243:'ETB', Q183530:'GHS', Q4589:'TZS',   Q4598:'UGX',
  Q200337:'AOA', Q73408:'ZMW',  Q200753:'MZN', Q202462:'NAD',
  Q212967:'MUR', Q242922:'DOP', Q207396:'GTQ', Q4719:'HNL',
  Q207312:'NIO', Q275112:'BZD', Q209792:'JMD', Q242890:'TTD',
};

function unitToCurrency(unitUrl) {
  if (!unitUrl || unitUrl === '1') return null;
  const m = unitUrl.match(/Q(\d+)$/);
  return m ? (WIKIDATA_CURRENCY['Q' + m[1]] || null) : null;
}

// ── HTTP helper ───────────────────────────────────────────────────────────────
function httpGet(urlStr, headers = {}, hops = 5) {
  return new Promise((resolve, reject) => {
    const p   = new URL(urlStr);
    const lib = p.protocol === 'http:' ? http : https;
    lib.get({
      hostname: p.hostname,
      path:     p.pathname + p.search,
      headers:  { 'User-Agent': UA, ...headers },
    }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && hops > 0) {
        const loc  = res.headers.location || '';
        const next = loc.startsWith('http') ? loc : new URL(loc, urlStr).href;
        res.resume();
        return httpGet(next, headers, hops - 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        const chunks = [];
        const retryAfterSec = res.headers['retry-after']
          ? parseInt(res.headers['retry-after'], 10) || null
          : null;
        res.on('data', d => chunks.push(d));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8').slice(0, 400);
          reject(Object.assign(
            new Error(`HTTP ${res.statusCode}`),
            { status: res.statusCode, body, retryAfterSec }
          ));
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

// Retry with Retry-After header support (retryAfterSec + 2s buffer)
async function withRetry(fn, label, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if ([429, 500, 502, 503, 504].includes(e.status) && attempt <= retries) {
        const wait = (e.status === 429 && e.retryAfterSec)
          ? (e.retryAfterSec + 2) * 1000
          : RETRY_BASE * attempt;
        process.stdout.write(
          `\n  ⚠  ${label}: HTTP ${e.status} → retry ${attempt}/${retries} in ${(wait/1000).toFixed(0)}s\n  `
        );
        await delay(wait);
      } else throw e;
    }
  }
}

async function wbGetEntities(qids) {
  const params = new URLSearchParams({
    action:           'wbgetentities',
    ids:              qids.join('|'),
    props:            'labels|descriptions|claims|sitelinks',
    languages:        'en|ko|ja|zh|ar|hi|ru|de|fr|es|pt',
    languagefallback: '1',
    format:           'json',
    formatversion:    '2',
  });
  const raw = await withRetry(
    () => httpGet(`${WD_API}?${params}`, { Accept: 'application/json' }),
    'wbGetEntities'
  );
  return JSON.parse(raw).entities || {};
}

// ── Parsing helpers ───────────────────────────────────────────────────────────

function stmts(claims, prop) {
  return (claims[prop] || []).filter(
    s => s.rank !== 'deprecated' && s.mainsnak.snaktype === 'value'
  );
}

// Time-series for a financial quantity property.
// Entries with value < MIN_FINANCIAL are dropped (catches year-as-amount errors).
function timeSeries(claims, prop) {
  const out = [];
  for (const s of stmts(claims, prop)) {
    const raw = s.mainsnak.datavalue?.value;
    if (!raw?.amount) continue;
    const value = Math.round(Number(raw.amount));
    if (isNaN(value) || value < MIN_FINANCIAL) continue; // skip bad/tiny values
    const currency = unitToCurrency(raw.unit);
    let year = null;
    const t = s.qualifiers?.P585?.[0]?.datavalue?.value?.time;
    if (t) { const m = t.match(/^[+-](\d{4})/); if (m) year = +m[1]; }
    out.push({ year, value, currency });
  }
  out.sort((a, b) => {
    if (a.year == null && b.year == null) return 0;
    if (a.year == null) return 1;
    if (b.year == null) return -1;
    return a.year - b.year;
  });
  const seen = new Set();
  return out.filter(r => {
    const k = r.year != null ? String(r.year) : `_${r.value}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// Employees time-series: no MIN_FINANCIAL filter (headcount can be small)
function employeesSeries(claims) {
  const out = [];
  for (const s of stmts(claims, 'P1082')) {
    const raw = s.mainsnak.datavalue?.value;
    if (!raw?.amount) continue;
    const value = Math.round(Number(raw.amount));
    if (isNaN(value) || value < 0) continue;
    let year = null;
    const t = s.qualifiers?.P585?.[0]?.datavalue?.value?.time;
    if (t) { const m = t.match(/^[+-](\d{4})/); if (m) year = +m[1]; }
    out.push({ year, value });
  }
  out.sort((a, b) => {
    if (a.year == null && b.year == null) return 0;
    if (a.year == null) return 1;
    if (b.year == null) return -1;
    return a.year - b.year;
  });
  const seen = new Set();
  return out.filter(r => {
    const k = r.year != null ? String(r.year) : `_${r.value}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function latest(claims, prop) {
  const h = timeSeries(claims, prop);
  if (!h.length) return { value: null, year: null, currency: null };
  const withYear = h.filter(e => e.year != null);
  return withYear.length ? withYear[withYear.length - 1] : h[h.length - 1];
}

function latestEmployees(claims) {
  const h = employeesSeries(claims);
  if (!h.length) return { value: null };
  const withYear = h.filter(e => e.year != null);
  const entry = withYear.length ? withYear[withYear.length - 1] : h[h.length - 1];
  return { value: entry.value, year: entry.year };
}

function itemRefs(claims, prop) {
  return [...new Set(
    stmts(claims, prop)
      .map(s => s.mainsnak.datavalue?.value?.id)
      .filter(Boolean)
  )];
}

// Like itemRefs but skips statements that have a P582 (end time) qualifier —
// used for CEO so we only get the current holder, not all historical ones.
function currentItemRefs(claims, prop) {
  return [...new Set(
    stmts(claims, prop)
      .filter(s => !s.qualifiers?.P582)          // P582 = end time → skip past roles
      .map(s => s.mainsnak.datavalue?.value?.id)
      .filter(Boolean)
  )];
}

function strVal(claims, prop) {
  for (const s of stmts(claims, prop)) {
    const v = s.mainsnak.datavalue?.value;
    if (typeof v === 'string') return v;
    if (v?.text) return v.text;
  }
  return null;
}

function yearVal(claims, prop) {
  for (const s of stmts(claims, prop)) {
    const t = s.mainsnak.datavalue?.value?.time;
    if (t) { const m = t.match(/^[+-](\d{4})/); if (m) return +m[1]; }
  }
  return null;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const FRESH = process.argv.includes('--fresh');

  // Load companies.json
  const companies = JSON.parse(fs.readFileSync(COMPANIES_FILE, 'utf8'));
  const allCos = Object.values(companies).flat();

  // Collect all unique company QIDs
  const allQids = [...new Set(allCos.map(c => c.qid).filter(Boolean))];
  console.log(`Companies in file : ${allCos.length}`);
  console.log(`Unique QIDs       : ${allQids.length}`);

  // Load or init checkpoint
  let processed    = new Set();
  let enrichmentMap = {}; // qid → enriched fields

  if (!FRESH && fs.existsSync(CHECKPOINT_FILE)) {
    try {
      const cp = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
      processed     = new Set(cp.processed || []);
      enrichmentMap = cp.enrichmentMap || {};
      console.log(`Resuming: ${processed.size} already processed`);
    } catch { console.log('Checkpoint unreadable — starting fresh'); }
  }

  const toProcess = allQids.filter(q => !processed.has(q));
  console.log(`To fetch          : ${toProcess.length} companies\n`);

  if (!toProcess.length) {
    console.log('Nothing to fetch — applying existing enrichment to companies.json');
  }

  let batchNum = 0;
  for (let i = 0; i < toProcess.length; i += ENR_BATCH) {
    const batch = toProcess.slice(i, i + ENR_BATCH);
    batchNum++;
    const pct = ((i / toProcess.length) * 100).toFixed(1);
    process.stdout.write(
      `  [${pct}%] Batch ${batchNum}: ${i+1}–${Math.min(i+ENR_BATCH, toProcess.length)}/${toProcess.length} … `
    );

    try {
      // ── Phase A: Fetch company entities ────────────────────────────────────
      const entities = await wbGetEntities(batch);

      // Collect entity-valued QIDs needing label resolution
      const labelQids = new Set();
      const partials  = {};

      for (const [qid, entity] of Object.entries(entities)) {
        if (entity.missing) { processed.add(qid); continue; }
        const claims = entity.claims || {};

        const revenueHist     = timeSeries(claims, 'P2139');
        const netIncomeHist   = timeSeries(claims, 'P2295');
        const opIncomeHist    = timeSeries(claims, 'P3362');
        const totalAssetsHist = timeSeries(claims, 'P2403');
        const totalEquityHist = timeSeries(claims, 'P2137');
        const empHist         = employeesSeries(claims);

        const { value: revenue,          year: revenue_year,     currency: revenue_currency }          = latest(claims, 'P2139');
        const { value: net_income,                               currency: net_income_currency }         = latest(claims, 'P2295');
        const { value: operating_income,                         currency: operating_income_currency }   = latest(claims, 'P3362');
        const { value: total_assets,                             currency: total_assets_currency }       = latest(claims, 'P2403');
        const { value: total_equity,                             currency: total_equity_currency }       = latest(claims, 'P2137');
        const { value: market_cap,       year: market_cap_year,  currency: market_cap_currency }        = latest(claims, 'P2226');
        const { value: employees,        year: employees_year }                                          = latestEmployees(claims);

        const _exchangeQids = itemRefs(claims, 'P414');
        const _industryQid  = itemRefs(claims, 'P452')[0] || null;
        const _ceoQids      = currentItemRefs(claims, 'P169'); // current CEO only
        const _founderQids  = itemRefs(claims, 'P112');
        const _parentQid    = itemRefs(claims, 'P749')[0] || null;

        [..._exchangeQids, _industryQid, ..._ceoQids, ..._founderQids, _parentQid]
          .filter(Boolean).forEach(q => labelQids.add(q));

        // Name/description: only overwrite if better than existing
        const name = entity.labels?.en?.value
          || entity.labels?.ko?.value || entity.labels?.ja?.value
          || entity.labels?.zh?.value || entity.labels?.ar?.value
          || entity.labels?.ru?.value || entity.labels?.de?.value
          || entity.labels?.fr?.value || null;

        const description = entity.descriptions?.en?.value
          || entity.descriptions?.ko?.value || entity.descriptions?.ja?.value
          || entity.descriptions?.zh?.value || null;

        const wpTitle = entity.sitelinks?.enwiki?.title;
        const wikipedia = wpTitle
          ? `https://en.wikipedia.org/wiki/${encodeURIComponent(wpTitle.replace(/ /g, '_'))}`
          : entity.sitelinks?.jawiki?.title
            ? `https://ja.wikipedia.org/wiki/${encodeURIComponent(entity.sitelinks.jawiki.title.replace(/ /g, '_'))}`
            : null;

        partials[qid] = {
          name, description, wikipedia,
          ticker:  strVal(claims, 'P249'),
          founded: yearVal(claims, 'P571'),
          website: strVal(claims, 'P856'),

          revenue, revenue_year, revenue_currency,
          revenue_history: revenueHist,

          employees, employees_year,
          employees_history: empHist,

          net_income, net_income_currency,
          net_income_history: netIncomeHist,

          operating_income, operating_income_currency,
          operating_income_history: opIncomeHist,

          total_assets, total_assets_currency,
          total_assets_history: totalAssetsHist,

          total_equity, total_equity_currency,
          total_equity_history: totalEquityHist,

          market_cap, market_cap_year, market_cap_currency,

          _exchangeQids, _industryQid, _ceoQids, _founderQids, _parentQid,
        };
      }

      // ── Phase B: Resolve entity-valued labels ───────────────────────────────
      const labelMap   = new Map();
      const labelArr   = [...labelQids];
      for (let j = 0; j < labelArr.length; j += LABEL_BATCH) {
        const lb = labelArr.slice(j, j + LABEL_BATCH);
        if (!lb.length) continue;
        await delay(API_DELAY);
        const lents = await wbGetEntities(lb);
        for (const [lqid, lent] of Object.entries(lents)) {
          if (lent.missing) continue;
          const lbl = lent.labels?.en?.value || lent.labels?.ko?.value
            || lent.labels?.ja?.value || lent.labels?.zh?.value || null;
          if (lbl) labelMap.set(lqid, lbl);
        }
      }

      // ── Phase C: Finalize partials → enrichmentMap ─────────────────────────
      for (const [qid, p] of Object.entries(partials)) {
        const { _exchangeQids, _industryQid, _ceoQids, _founderQids, _parentQid, ...fields } = p;
        enrichmentMap[qid] = {
          ...fields,
          exchange:   _exchangeQids.map(q => labelMap.get(q)).filter(Boolean).join(', ') || null,
          industry:   _industryQid  ? labelMap.get(_industryQid) || null : null,
          ceo:        _ceoQids.map(q => labelMap.get(q)).filter(Boolean).join(', ')        || null,
          founders:   _founderQids.map(q => labelMap.get(q)).filter(Boolean),
          parent_org: _parentQid    ? labelMap.get(_parentQid)   || null : null,
        };
        processed.add(qid);
      }

      // Progress summary for this batch
      const mkt = Object.values(enrichmentMap).filter(e => e.market_cap  != null).length;
      const ceo = Object.values(enrichmentMap).filter(e => e.ceo).length;
      const tkr = Object.values(enrichmentMap).filter(e => e.ticker).length;
      process.stdout.write(`done  [mktcap=${mkt} ceo=${ceo} ticker=${tkr}]\n`);

    } catch (e) {
      process.stdout.write(`FAILED: ${e.message}\n`);
    }

    // Checkpoint
    if (batchNum % CHECKPOINT_EVERY === 0) {
      fs.writeFileSync(CHECKPOINT_FILE,
        JSON.stringify({ processed: [...processed], enrichmentMap }), 'utf8');
      process.stdout.write('  ── checkpoint saved ──\n');
    }

    await delay(API_DELAY);
  }

  // Final checkpoint save
  fs.writeFileSync(CHECKPOINT_FILE,
    JSON.stringify({ processed: [...processed], enrichmentMap }), 'utf8');

  // ── Merge enrichment into companies.json ───────────────────────────────────
  console.log('\nMerging enrichment into companies.json…');
  let updated = 0, skipped = 0;
  for (const arr of Object.values(companies)) {
    for (const co of arr) {
      const enr = enrichmentMap[co.qid];
      if (!enr) { skipped++; continue; }
      // Merge: only overwrite null/empty existing fields with new non-null values
      // Exceptions: always refresh financial figures + ceo + exchange + market_cap
      const ALWAYS_REFRESH = new Set([
        'revenue','revenue_year','revenue_currency','revenue_history',
        'employees','employees_year','employees_history',
        'net_income','net_income_currency','net_income_history',
        'operating_income','operating_income_currency','operating_income_history',
        'total_assets','total_assets_currency','total_assets_history',
        'total_equity','total_equity_currency','total_equity_history',
        'market_cap','market_cap_year','market_cap_currency',
        'ceo','exchange','industry','founders','parent_org','ticker',
      ]);
      for (const [k, v] of Object.entries(enr)) {
        if (v === null || v === undefined) continue;
        if (Array.isArray(v) && v.length === 0) continue;
        if (ALWAYS_REFRESH.has(k) || co[k] == null || co[k] === '') {
          co[k] = v;
        }
      }
      updated++;
    }
  }
  console.log(`Updated: ${updated}  |  Skipped (no QID enrichment): ${skipped}`);

  // Backup then write
  const backupPath = COMPANIES_FILE.replace('.json', '-pre-enrich-backup.json');
  fs.copyFileSync(COMPANIES_FILE, backupPath);
  console.log(`Backup saved: ${backupPath}`);
  fs.writeFileSync(COMPANIES_FILE, JSON.stringify(companies), 'utf8');
  console.log('companies.json updated.\n');

  // ── Final coverage stats ───────────────────────────────────────────────────
  const all = Object.values(companies).flat();
  console.log('Coverage after enrichment:');
  const fields = [
    ['revenue',        'Revenue'],
    ['market_cap',     'Market cap'],
    ['employees',      'Employees'],
    ['net_income',     'Net income'],
    ['ceo',            'CEO'],
    ['exchange',       'Exchange'],
    ['industry',       'Industry'],
    ['founders',       'Founders'],
    ['parent_org',     'Parent org'],
    ['ticker',         'Ticker'],
  ];
  for (const [f, label] of fields) {
    const n = all.filter(c => {
      const v = c[f];
      return v != null && v !== '' && !(Array.isArray(v) && v.length === 0);
    }).length;
    const pct = ((n / all.length) * 100).toFixed(1);
    console.log(`  ${label.padEnd(14)} ${String(n).padStart(5)} / ${all.length}  (${pct}%)`);
  }
  console.log('\nDone!');
}

main().catch(e => { console.error(e); process.exit(1); });
