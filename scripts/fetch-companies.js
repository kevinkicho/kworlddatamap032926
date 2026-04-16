#!/usr/bin/env node
/**
 * scripts/fetch-companies.js  (v2 — two-phase pipeline)
 *
 * Phase 1 — Discovery (SPARQL, lightweight)
 *   Simple query: city QID → {company QID, city QID} pairs.
 *   No OPTIONALs, no financials, no GROUP BY. Never times out.
 *   50 cities per SPARQL batch.
 *
 * Phase 2 — Enrichment (Wikidata wbgetentities, 50 companies/request)
 *   Full entity JSON per company. Extracts complete financial time-series
 *   (all years, all fields), key people (CEO, founders), exchange listings,
 *   descriptions, parent org, Wikipedia sitelinks.
 *
 * Phase 3 — Label resolution (wbgetentities, labels only)
 *   Resolves entity QIDs (exchanges, industries, CEOs…) → readable names.
 *
 * Phase 4 — Assembly
 *   Groups by city, sorts by revenue, writes companies.json.
 *
 * Usage:
 *   npm run fetch-companies             resume from checkpoint
 *   npm run fetch-companies -- --fresh  restart from scratch
 */

'use strict';

const https   = require('https');
const http    = require('http');
const fs      = require('fs');
const { atomicWrite } = require('./safe-write');
const path    = require('path');
const { URL } = require('url');

const CITIES_FILE     = path.join(__dirname, '..', 'public', 'cities-full.json');
const OUT_FILE        = path.join(__dirname, '..', 'public', 'companies.json');
const CHECKPOINT_FILE = path.join(__dirname, '.companies-checkpoint.json');

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const WD_API          = 'https://www.wikidata.org/w/api.php';

const DISC_BATCH        = 30;   // cities per SPARQL discovery batch (smaller = less truncation risk)
const ENR_BATCH         = 50;   // entities per wbgetentities request
const SPARQL_DELAY      = 3500; // ms between SPARQL requests (politeness + 429 avoidance)
const API_DELAY         = 1200; // ms between entity API requests
const RETRY_BASE        = 30000;// ms base for exponential backoff (30s, 60s, 90s…)
const MAX_RETRIES       = 5;
const CHECKPOINT_EVERY  = 10;   // save enrichment checkpoint every N batches

const UA = 'kworlddatamap/2.0 (educational; github.com/kworlddatamap)';

// ── Wikidata currency QID → ISO code ─────────────────────────────────────────
// Each Wikidata quantity value has a `unit` field pointing to a currency entity.
// We map the most common ones here; anything unmapped is left null.
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
        // Capture Retry-After before consuming body (header available immediately)
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

// Exponential backoff for transient HTTP errors (429 rate-limit, 5xx server errors).
// For 429, honours the Retry-After header if present — otherwise falls back to RETRY_BASE.
async function withRetry(fn, label, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if ([429, 500, 502, 503, 504].includes(e.status) && attempt <= retries) {
        let wait;
        if (e.status === 429 && e.retryAfterSec) {
          // Wikidata says exactly how long to wait — add 2s buffer
          wait = (e.retryAfterSec + 2) * 1000;
        } else {
          wait = RETRY_BASE * attempt;
        }
        process.stdout.write(
          `\n    ⚠  ${label}: HTTP ${e.status} → retry ${attempt}/${retries} in ${wait / 1000}s\n    `
        );
        await delay(wait);
      } else throw e;
    }
  }
}

// ── SPARQL helper ─────────────────────────────────────────────────────────────
async function sparql(query) {
  const url = SPARQL_ENDPOINT + '?query=' + encodeURIComponent(query) + '&format=json';
  // Wrap both fetch AND parse inside withRetry so truncated JSON responses are retried.
  // A truncated response produces a SyntaxError from JSON.parse — we re-throw it as a
  // 502-coded error so withRetry's backoff logic picks it up.
  return await withRetry(async () => {
    const raw = await httpGet(url, { Accept: 'application/sparql-results+json' });
    try {
      return JSON.parse(raw).results?.bindings || [];
    } catch (parseErr) {
      throw Object.assign(
        new Error(`Truncated SPARQL response (${raw.length} bytes): ${parseErr.message}`),
        { status: 502 }
      );
    }
  }, 'SPARQL');
}

// ── Wikidata entity API helper ────────────────────────────────────────────────
// props: labels | descriptions | claims | sitelinks (any subset)
async function wbGetEntities(qids, props = ['labels', 'descriptions', 'claims', 'sitelinks']) {
  const params = new URLSearchParams({
    action:           'wbgetentities',
    ids:              qids.join('|'),
    props:            props.join('|'),
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

// ── Phase 1: Discovery SPARQL query ──────────────────────────────────────────
// Returns DISTINCT {?co, ?hq} pairs — no OPTIONALs, no financial data, no GROUP BY.
// Significance filter: stock-exchange listed (P414) OR revenue ≥ 1B (non-profits excluded).
// One P131 hop catches district-level HQs (e.g. Samsung in Gangnam-gu → Seoul).
function discoveryQuery(cityQids) {
  const vals = cityQids.map(q => `wd:${q}`).join(' ');
  return `
SELECT DISTINCT ?co ?hq WHERE {
  VALUES ?hq { ${vals} }
  {
    { ?co wdt:P159 ?hq . }
    UNION
    { ?co wdt:P159 ?loc . ?loc wdt:P131 ?hq . }
  }
  {
    { ?co wdt:P414 [] . }
    UNION
    {
      ?co wdt:P2139 ?r .
      FILTER(?r >= 1000000000)
      FILTER NOT EXISTS {
        VALUES ?npType {
          wd:Q163740  wd:Q157031  wd:Q41487
          wd:Q7397682 wd:Q327333  wd:Q208586
        }
        ?co wdt:P31 ?npType .
      }
    }
  }
  FILTER NOT EXISTS { ?co wdt:P576 [] }
}`;
}

// ── Phase 2 & 3: Entity parsing helpers ──────────────────────────────────────

// All non-deprecated, value-type statements for a property
function stmts(claims, prop) {
  return (claims[prop] || []).filter(
    s => s.rank !== 'deprecated' && s.mainsnak.snaktype === 'value'
  );
}

// Full time-series for a quantity property.
// Returns [{year, value, currency}] sorted by year ascending; entries without a year qualifier go last.
function timeSeries(claims, prop) {
  const out = [];
  for (const s of stmts(claims, prop)) {
    const raw = s.mainsnak.datavalue?.value;
    if (!raw?.amount) continue;
    const value = Math.round(Number(raw.amount));
    if (isNaN(value)) continue;
    const currency = unitToCurrency(raw.unit);

    // Year from P585 (point in time) qualifier
    let year = null;
    const t = s.qualifiers?.P585?.[0]?.datavalue?.value?.time;
    if (t) {
      const m = t.match(/^[+-](\d{4})/);
      if (m) year = +m[1];
    }
    out.push({ year, value, currency });
  }

  // Sort: year asc, null-year entries at the end
  out.sort((a, b) => {
    if (a.year == null && b.year == null) return 0;
    if (a.year == null) return 1;
    if (b.year == null) return -1;
    return a.year - b.year;
  });

  // Deduplicate by year (keep first occurrence)
  const seen = new Set();
  return out.filter(r => {
    const k = r.year != null ? String(r.year) : `_${r.value}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// Most recent (highest year) value for a property. Falls back to last entry if no year data.
function latest(claims, prop) {
  const h = timeSeries(claims, prop);
  if (!h.length) return { value: null, year: null, currency: null };
  const withYear = h.filter(e => e.year != null);
  return withYear.length ? withYear[withYear.length - 1] : h[h.length - 1];
}

// QID list from item-type property values (P414=exchange, P452=industry, P169=CEO…)
function itemRefs(claims, prop) {
  return [
    ...new Set(
      stmts(claims, prop)
        .map(s => s.mainsnak.datavalue?.value?.id)
        .filter(Boolean)
    ),
  ];
}

// Like itemRefs but skips statements with a P582 (end time) qualifier —
// used for CEO to return only current holder, not historical ones.
function currentItemRefs(claims, prop) {
  return [
    ...new Set(
      stmts(claims, prop)
        .filter(s => !s.qualifiers?.P582)
        .map(s => s.mainsnak.datavalue?.value?.id)
        .filter(Boolean)
    ),
  ];
}

// First non-deprecated string value
function strVal(claims, prop) {
  for (const s of stmts(claims, prop)) {
    const v = s.mainsnak.datavalue?.value;
    if (typeof v === 'string') return v;
    if (v?.text) return v.text;  // monolingualtext type
  }
  return null;
}

// Year from first non-deprecated time-type statement
function yearVal(claims, prop) {
  for (const s of stmts(claims, prop)) {
    const t = s.mainsnak.datavalue?.value?.time;
    if (t) {
      const m = t.match(/^[+-](\d{4})/);
      if (m) return +m[1];
    }
  }
  return null;
}

// Parse a Wikidata entity → partial company object.
// Quantitative fields are fully resolved. Entity-valued fields (exchange, industry, CEO…)
// are stored as QID arrays prefixed with _ for label resolution in Phase 3.
function parsePartial(entity) {
  const claims  = entity.claims || {};
  const wpTitle = entity.sitelinks?.enwiki?.title;

  const revenueHist        = timeSeries(claims, 'P2139');
  const employeesHist      = timeSeries(claims, 'P1082');
  const netIncomeHist      = timeSeries(claims, 'P2295');
  const opIncomeHist       = timeSeries(claims, 'P3362');
  const totalAssetsHist    = timeSeries(claims, 'P2403');
  const totalEquityHist    = timeSeries(claims, 'P2137');

  const { value: revenue,          year: revenue_year,      currency: revenue_currency }          = latest(claims, 'P2139');
  const { value: employees }                                                                       = latest(claims, 'P1082');
  const { value: net_income,                               currency: net_income_currency }         = latest(claims, 'P2295');
  const { value: operating_income,                         currency: operating_income_currency }   = latest(claims, 'P3362');
  const { value: total_assets,                             currency: total_assets_currency }       = latest(claims, 'P2403');
  const { value: total_equity,                             currency: total_equity_currency }       = latest(claims, 'P2137');
  const { value: market_cap,        year: market_cap_year,  currency: market_cap_currency }        = latest(claims, 'P2226');

  return {
    // Name: prefer English, fall back to Korean/Japanese/Chinese/other language labels.
    // For companies that only exist in local-language Wikipedia, this avoids showing raw QIDs.
    qid:         entity.id,
    name:        entity.labels?.en?.value
               || entity.labels?.ko?.value
               || entity.labels?.ja?.value
               || entity.labels?.zh?.value
               || entity.labels?.ar?.value
               || entity.labels?.ru?.value
               || entity.labels?.de?.value
               || entity.labels?.fr?.value
               || entity.id,
    description: entity.descriptions?.en?.value
               || entity.descriptions?.ko?.value
               || entity.descriptions?.ja?.value
               || entity.descriptions?.zh?.value
               || null,
    ticker:      strVal(claims, 'P249'),
    founded:     yearVal(claims, 'P571'),
    website:     strVal(claims, 'P856'),
    // Wikipedia: prefer English article; fall back to Japanese/Korean for local companies
    wikipedia:   wpTitle
      ? `https://en.wikipedia.org/wiki/${encodeURIComponent(wpTitle.replace(/ /g, '_'))}`
      : entity.sitelinks?.jawiki?.title
        ? `https://ja.wikipedia.org/wiki/${encodeURIComponent(entity.sitelinks.jawiki.title.replace(/ /g, '_'))}`
        : entity.sitelinks?.kowiki?.title
          ? `https://ko.wikipedia.org/wiki/${encodeURIComponent(entity.sitelinks.kowiki.title.replace(/ /g, '_'))}`
          : null,

    // Quantitative: fully resolved (currency from Wikidata unit QID)
    revenue,          revenue_year,     revenue_currency,          revenue_history:          revenueHist,
    employees,                                                     employees_history:         employeesHist,
    net_income,                         net_income_currency,       net_income_history:        netIncomeHist,
    operating_income,                   operating_income_currency, operating_income_history:  opIncomeHist,
    total_assets,                       total_assets_currency,     total_assets_history:      totalAssetsHist,
    total_equity,                       total_equity_currency,     total_equity_history:      totalEquityHist,
    market_cap,       market_cap_year,  market_cap_currency,

    // Entity-valued: QID refs resolved in Phase 3
    _exchangeQids: itemRefs(claims, 'P414'),
    _industryQid:  itemRefs(claims, 'P452')[0] || null,
    _ceoQids:      currentItemRefs(claims, 'P169'),
    _founderQids:  itemRefs(claims, 'P112'),
    _parentQid:    itemRefs(claims, 'P749')[0] || null,
  };
}

// Finalize company: resolve QID refs → labels, strip internal _ fields.
function finalizeCompany(partial, labelMap) {
  const {
    _exchangeQids, _industryQid, _ceoQids, _founderQids, _parentQid,
    ...co
  } = partial;

  co.exchange   = _exchangeQids.map(q => labelMap.get(q)).filter(Boolean).join(', ') || null;
  co.industry   = _industryQid  ? labelMap.get(_industryQid) || null : null;
  co.ceo        = _ceoQids.map(q => labelMap.get(q)).filter(Boolean).join(', ') || null;
  const fArr    = _founderQids.map(q => labelMap.get(q)).filter(Boolean);
  co.founders   = fArr.length ? fArr : null;
  co.parent_org = _parentQid   ? labelMap.get(_parentQid)   || null : null;

  return co;
}

// ── Checkpoint helpers ────────────────────────────────────────────────────────
const CP_VERSION = 2;

function saveCheckpoint(data) {
  fs.writeFileSync(
    CHECKPOINT_FILE,
    JSON.stringify({ version: CP_VERSION, savedAt: new Date().toISOString(), ...data }),
    'utf8'
  );
}

function loadCheckpoint() {
  if (!fs.existsSync(CHECKPOINT_FILE)) return null;
  try {
    const d = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
    return d.version === CP_VERSION ? d : null;
  } catch { return null; }
}

function deleteCheckpoint() {
  if (fs.existsSync(CHECKPOINT_FILE)) fs.unlinkSync(CHECKPOINT_FILE);
}

// Serialize Maps and Sets for JSON storage
function serializeState({ citiesDone, coToCities, partialMap, refQids, labelMap }) {
  return {
    citiesDone:  citiesDone ? [...citiesDone]  : undefined,
    coToCities:  coToCities ? [...coToCities.entries()].map(([co, cs]) => [co, [...cs]]) : undefined,
    partials:    partialMap ? [...partialMap.entries()] : undefined,
    refQids:     refQids    ? [...refQids]    : undefined,
    labelMap:    labelMap   ? [...labelMap.entries()] : undefined,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const FRESH = process.argv.includes('--fresh');
  const cities = JSON.parse(fs.readFileSync(CITIES_FILE, 'utf8'));
  const allCityQids = [...new Set(cities.map(c => c.qid).filter(Boolean))];

  console.log(`\n╔════════════════════════════════════════════════════════╗`);
  console.log(`║  fetch-companies v2 — two-phase pipeline               ║`);
  console.log(`╚════════════════════════════════════════════════════════╝`);
  console.log(`Cities : ${allCityQids.length.toLocaleString()}`);
  console.log(`Output : ${OUT_FILE}\n`);

  if (FRESH) { deleteCheckpoint(); console.log('Mode: --fresh\n'); }

  const cp = FRESH ? null : loadCheckpoint();

  // Restore state from checkpoint
  const coToCities = new Map(
    (cp?.coToCities || []).map(([co, cs]) => [co, new Set(cs)])
  );
  const citiesDone = new Set(cp?.citiesDone || []);
  const partialMap = new Map(cp?.partials   || []);
  const refQids    = new Set(cp?.refQids    || []);
  const labelMap   = new Map(cp?.labelMap   || []);

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 1 — Discovery
  // ─────────────────────────────────────────────────────────────────────────
  const todoCity   = allCityQids.filter(q => !citiesDone.has(q));
  const totalDiscB = Math.ceil(allCityQids.length / DISC_BATCH);

  console.log(`── Phase 1: Discovery ───────────────────────────────────`);
  if (todoCity.length === 0) {
    console.log(`  Complete — ${coToCities.size.toLocaleString()} companies found\n`);
  } else {
    console.log(`  ${citiesDone.size}/${allCityQids.length} cities done · ${todoCity.length} remaining\n`);
    let bNum = Math.floor(citiesDone.size / DISC_BATCH);

    for (let i = 0; i < todoCity.length; i += DISC_BATCH) {
      bNum++;
      const batch = todoCity.slice(i, i + DISC_BATCH);
      process.stdout.write(`  [${bNum}/${totalDiscB}] ${batch.length} cities… `);
      const t0 = Date.now();

      let rows;
      try {
        rows = await sparql(discoveryQuery(batch));
      } catch (e) {
        process.stdout.write(`✗ ${e.status || e.message} — skipping batch\n`);
        batch.forEach(q => citiesDone.add(q));
        await delay(SPARQL_DELAY);
        continue;
      }

      let newCos = 0;
      for (const r of rows) {
        const co   = r.co?.value?.split('/').pop();
        const city = r.hq?.value?.split('/').pop();
        if (!co || !city) continue;
        if (!coToCities.has(co)) { coToCities.set(co, new Set()); newCos++; }
        coToCities.get(co).add(city);
      }
      batch.forEach(q => citiesDone.add(q));

      console.log(`${rows.length} pairs · +${newCos} new cos (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

      saveCheckpoint({ phase: 'discovery', ...serializeState({ citiesDone, coToCities }) });

      if (i + DISC_BATCH < todoCity.length) await delay(SPARQL_DELAY);
    }
    console.log();
  }

  const allCoQids = [...coToCities.keys()];
  console.log(`Discovery complete: ${allCoQids.length.toLocaleString()} companies\n`);

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 2 — Enrichment
  // ─────────────────────────────────────────────────────────────────────────
  const todoEnr   = allCoQids.filter(q => !partialMap.has(q));
  const totalEnrB = Math.ceil(allCoQids.length / ENR_BATCH);

  console.log(`── Phase 2: Enrichment ──────────────────────────────────`);
  if (todoEnr.length === 0) {
    console.log(`  Complete — ${partialMap.size.toLocaleString()} companies enriched\n`);
  } else {
    console.log(`  ${partialMap.size}/${allCoQids.length} done · ${todoEnr.length} remaining\n`);
    let bNum = Math.floor(partialMap.size / ENR_BATCH);

    for (let i = 0; i < todoEnr.length; i += ENR_BATCH) {
      bNum++;
      const batch = todoEnr.slice(i, i + ENR_BATCH);
      process.stdout.write(`  [${bNum}/${totalEnrB}] ${batch.length} cos… `);
      const t0 = Date.now();

      let entities;
      try {
        entities = await wbGetEntities(batch);
      } catch (e) {
        process.stdout.write(`✗ ${e.status || e.message} — skipping\n`);
        await delay(API_DELAY);
        continue;
      }

      let parsed = 0;
      for (const [qid, entity] of Object.entries(entities)) {
        if (entity.missing) {
          partialMap.set(qid, null);  // mark as processed so we don't retry
          continue;
        }
        const partial = parsePartial(entity);
        // Collect all entity QID refs for label resolution
        partial._exchangeQids.forEach(q => refQids.add(q));
        partial._founderQids.forEach(q  => refQids.add(q));
        partial._ceoQids.forEach(q      => refQids.add(q));
        if (partial._industryQid) refQids.add(partial._industryQid);
        if (partial._parentQid)   refQids.add(partial._parentQid);
        partialMap.set(qid, partial);
        parsed++;
      }

      console.log(`${parsed} parsed (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

      // Save checkpoint every N batches and at the final batch
      const isLastBatch = (i + ENR_BATCH >= todoEnr.length);
      if (bNum % CHECKPOINT_EVERY === 0 || isLastBatch) {
        saveCheckpoint({
          phase: 'enrichment',
          ...serializeState({ citiesDone, coToCities, partialMap, refQids }),
        });
      }

      if (!isLastBatch) await delay(API_DELAY);
    }
    console.log();
  }

  console.log(`Enrichment complete: ${partialMap.size.toLocaleString()} companies\n`);

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 3 — Label resolution
  // ─────────────────────────────────────────────────────────────────────────
  const todoLabel  = [...refQids].filter(q => !labelMap.has(q));
  const totalLblB  = Math.ceil(todoLabel.length / ENR_BATCH);

  console.log(`── Phase 3: Label resolution ────────────────────────────`);
  if (todoLabel.length === 0) {
    console.log(`  Complete — ${labelMap.size.toLocaleString()} labels resolved\n`);
  } else {
    console.log(`  ${[...refQids].length} unique refs · ${todoLabel.length} to resolve\n`);
    let bNum = 0;

    for (let i = 0; i < todoLabel.length; i += ENR_BATCH) {
      bNum++;
      const batch = todoLabel.slice(i, i + ENR_BATCH);
      process.stdout.write(`  [${bNum}/${totalLblB}] ${batch.length} QIDs… `);

      let entities;
      try {
        entities = await wbGetEntities(batch, ['labels']);
      } catch (e) {
        process.stdout.write(`✗ ${e.status || e.message} — skipping\n`);
        await delay(API_DELAY);
        continue;
      }

      let resolved = 0;
      for (const [qid, entity] of Object.entries(entities)) {
        if (entity.missing) continue;
        const lbl = entity.labels?.en?.value;
        if (lbl) { labelMap.set(qid, lbl); resolved++; }
      }
      console.log(`${resolved} labels`);

      if (i + ENR_BATCH < todoLabel.length) await delay(API_DELAY);
    }
    console.log();
  }

  // Save final state before assembly (all phases complete)
  saveCheckpoint({
    phase: 'assembly',
    ...serializeState({ citiesDone, coToCities, partialMap, refQids, labelMap }),
  });

  console.log(`Labels complete: ${labelMap.size.toLocaleString()} entries\n`);

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 4 — Assembly
  // ─────────────────────────────────────────────────────────────────────────
  console.log(`── Phase 4: Assembly ────────────────────────────────────`);

  const byCity = {};
  let coCount  = 0;

  for (const [coQid, partial] of partialMap.entries()) {
    if (!partial) continue;  // missing/deleted entity
    const citySet = coToCities.get(coQid);
    if (!citySet?.size) continue;

    const co = finalizeCompany(partial, labelMap);

    for (const cityQid of citySet) {
      if (!byCity[cityQid]) byCity[cityQid] = {};
      byCity[cityQid][coQid] = co;
    }
    coCount++;
  }

  // Sort each city's companies: revenue desc, then name asc
  const result = {};
  let cityCount = 0;
  for (const [cityQid, cosMap] of Object.entries(byCity)) {
    result[cityQid] = Object.values(cosMap).sort((a, b) => {
      const ar = a.revenue || 0, br = b.revenue || 0;
      if (br !== ar) return br - ar;
      return (a.name || '').localeCompare(b.name || '');
    });
    cityCount++;
  }

  console.log(`  Cities with companies : ${cityCount.toLocaleString()}`);
  console.log(`  Total companies       : ${coCount.toLocaleString()}`);

  atomicWrite(OUT_FILE, JSON.stringify(result), 'utf8');
  const mb = (fs.statSync(OUT_FILE).size / 1e6).toFixed(1);
  console.log(`\n  Wrote ${OUT_FILE} (${mb} MB)\n`);

  deleteCheckpoint();
  console.log(`✓ Done\n`);
}

main().catch(e => {
  console.error('\nFatal:', e.message || e);
  process.exit(1);
});
