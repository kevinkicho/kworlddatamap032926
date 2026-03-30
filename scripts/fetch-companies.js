#!/usr/bin/env node
/**
 * scripts/fetch-companies.js
 *
 * Queries the Wikidata SPARQL endpoint for organizations headquartered in
 * cities present in our cities-full.json database, joining on city QID
 * (city.qid ↔ Wikidata property P159 "headquarters location").
 *
 * Output: public/companies.json
 *   Object keyed by city QID → array of company records:
 *   { "Q60": [ { qid, name, industry, employees, founded, website }, ... ] }
 *
 * Usage:  npm run fetch-companies
 * Time:   ~5–10 minutes for the full 5900-city set
 * Safe to re-run — overwrites file in place.
 */

'use strict';

const https  = require('https');
const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const { URL } = require('url');

const CITIES_FILE = path.join(__dirname, '..', 'public', 'cities-full.json');
const OUT_FILE    = path.join(__dirname, '..', 'public', 'companies.json');
const SPARQL_URL  = 'https://query.wikidata.org/sparql';

const BATCH_SIZE  = 50;    // cities per request — keep low to avoid Wikidata timeouts
const DELAY_MS    = 2000;  // polite pause between requests
const RETRY_DELAY = 8000;  // wait after a 429 / 503 before retrying
const MAX_RETRIES = 2;

// ── HTTP GET helper ───────────────────────────────────────────────────────────
function httpGet(url, headers = {}, redirects = 5) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib    = parsed.protocol === 'http:' ? http : https;
    lib.get({ hostname: parsed.hostname, path: parsed.pathname + parsed.search,
               headers: { 'User-Agent': 'kworlddatamap/1.0 (educational project)', ...headers } },
      res => {
        if ([301,302,303,307,308].includes(res.statusCode) && redirects > 0) {
          const next = res.headers.location.startsWith('http')
            ? res.headers.location : new URL(res.headers.location, url).href;
          res.resume();
          return httpGet(next, headers, redirects - 1).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(Object.assign(new Error(`HTTP ${res.statusCode}`), { status: res.statusCode }));
        }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end',  () => resolve(Buffer.concat(chunks).toString('utf8')));
        res.on('error', reject);
      }).on('error', reject);
  });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── SPARQL for one batch ──────────────────────────────────────────────────────
// Intentionally no wdt:P31/wdt:P279* type filter — that traversal causes
// timeouts. Items with P159 on Wikidata are overwhelmingly organisations.
function buildQuery(cityQids) {
  const values = cityQids.map(q => `wd:${q}`).join(' ');
  return `
SELECT ?co ?coLabel ?hq ?indLabel ?employees ?founded ?website WHERE {
  VALUES ?hq { ${values} }
  ?co wdt:P159 ?hq .
  OPTIONAL { ?co wdt:P452 ?ind . }
  OPTIONAL { ?co wdt:P1082 ?employees . }
  OPTIONAL { ?co wdt:P571 ?fd . BIND(YEAR(?fd) AS ?founded) }
  OPTIONAL { ?co wdt:P856 ?website . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
ORDER BY ?hq ?coLabel
LIMIT 3000`;
}

async function fetchBatch(cityQids, retries = MAX_RETRIES) {
  const url = SPARQL_URL + '?query=' + encodeURIComponent(buildQuery(cityQids)) + '&format=json';
  let raw;
  try {
    raw = await httpGet(url, { Accept: 'application/sparql-results+json' });
  } catch (e) {
    if ((e.status === 429 || e.status === 503) && retries > 0) {
      process.stdout.write(`[rate-limited, waiting ${RETRY_DELAY/1000}s] `);
      await delay(RETRY_DELAY);
      return fetchBatch(cityQids, retries - 1);
    }
    return null;   // 504 / other error — skip batch gracefully
  }

  let data;
  try { data = JSON.parse(raw); } catch { return null; }

  // Group by city QID, deduplicate by company QID
  const byCity = {};
  for (const row of (data.results?.bindings || [])) {
    const cityQid = row.hq?.value?.split('/').pop();
    const coQid   = row.co?.value?.split('/').pop();
    if (!cityQid || !coQid) continue;
    if (!byCity[cityQid]) byCity[cityQid] = {};
    if (!byCity[cityQid][coQid]) {
      byCity[cityQid][coQid] = {
        qid:       coQid,
        name:      row.coLabel?.value  || coQid,
        industry:  row.indLabel?.value || null,
        employees: row.employees ? Math.round(Number(row.employees.value)) : null,
        founded:   row.founded   ? Number(row.founded.value)               : null,
        website:   row.website?.value  || null,
      };
    } else {
      const c = byCity[cityQid][coQid];
      if (!c.industry  && row.indLabel)   c.industry  = row.indLabel.value;
      if (!c.employees && row.employees)  c.employees = Math.round(Number(row.employees.value));
      if (!c.founded   && row.founded)    c.founded   = Number(row.founded.value);
      if (!c.website   && row.website)    c.website   = row.website.value;
    }
  }

  // Convert to sorted arrays
  const out = {};
  for (const [cq, cos] of Object.entries(byCity)) {
    out[cq] = Object.values(cos).sort((a, b) => a.name.localeCompare(b.name));
  }
  return out;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const cities = JSON.parse(fs.readFileSync(CITIES_FILE, 'utf8'));
  const qids   = [...new Set(cities.map(c => c.qid).filter(Boolean))];
  console.log(`Loaded ${cities.length} cities, ${qids.length} unique QIDs`);
  console.log(`Querying Wikidata in batches of ${BATCH_SIZE}...\n`);

  const total  = Math.ceil(qids.length / BATCH_SIZE);
  const result = {};
  let   totalCompanies = 0;

  for (let i = 0; i < qids.length; i += BATCH_SIZE) {
    const batch    = qids.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    process.stdout.write(`  [${batchNum}/${total}] `);

    const batchResult = await fetchBatch(batch);

    if (batchResult === null) {
      console.log('skipped (timeout)');
    } else {
      const citiesFound    = Object.keys(batchResult).length;
      const companiesFound = Object.values(batchResult).reduce((s, a) => s + a.length, 0);
      Object.assign(result, batchResult);
      totalCompanies += companiesFound;
      console.log(`${citiesFound} cities, ${companiesFound} companies`);
    }

    if (i + BATCH_SIZE < qids.length) await delay(DELAY_MS);
  }

  // Save
  fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 2), 'utf8');
  const kb = Math.round(fs.statSync(OUT_FILE).size / 1024);
  console.log(`\n✓ ${totalCompanies} companies across ${Object.keys(result).length} cities`);
  console.log(`  Saved → ${OUT_FILE}  (${kb} KB)`);
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
