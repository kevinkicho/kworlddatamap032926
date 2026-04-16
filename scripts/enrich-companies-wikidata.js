#!/usr/bin/env node
/**
 * enrich-companies-wikidata.js
 *
 * Reads public/companies.json, queries Wikidata SPARQL in batches to backfill
 * missing fields (CEO, founders, parent_org, products, employees, financials),
 * writes the enriched data back. Never overwrites existing non-null values.
 *
 * Usage: node scripts/enrich-companies-wikidata.js
 */
'use strict';

const https = require('https');
const fs    = require('fs');
const { atomicWrite } = require('./safe-write');
const path  = require('path');

const COMPANIES_FILE = path.join(__dirname, '..', 'public', 'companies.json');
const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const BATCH_SIZE = 200;
const BATCH_DELAY_MS = 1500;
const MAX_RETRIES = 2;
const UA = 'kworlddatamap/2.0 (educational; github.com/kworlddatamap)';

// ── String fields: fill only if current is null or empty string ──────────────
const STRING_FIELDS = ['ceo', 'parent_org'];

// ── Array fields: fill only if current is null or empty array ────────────────
const ARRAY_FIELDS = ['founders', 'products'];

// ── Numeric fields: fill only if current is null ─────────────────────────────
const NUMERIC_FIELDS = ['employees', 'net_income', 'total_assets', 'total_equity', 'operating_income'];

/**
 * Merge Wikidata results into a company object. Mutates `co` in place.
 * @param {Object} co - Company object from companies.json
 * @param {Object} wd - Wikidata extracted fields { ceo, founders, parent_org, ... }
 */
function mergeWikidataIntoCompany(co, wd) {
  for (const key of STRING_FIELDS) {
    if ((co[key] == null || co[key] === '') && wd[key] != null && wd[key] !== '') {
      co[key] = wd[key];
    }
  }
  for (const key of ARRAY_FIELDS) {
    if ((!Array.isArray(co[key]) || co[key].length === 0) && Array.isArray(wd[key]) && wd[key].length > 0) {
      co[key] = [...new Set(wd[key])];
    }
  }
  for (const key of NUMERIC_FIELDS) {
    if (co[key] == null && wd[key] != null && !isNaN(wd[key])) {
      co[key] = Number(wd[key]);
    }
  }
}

// ── SPARQL query builder ─────────────────────────────────────────────────────

function buildSparqlQuery(qids) {
  const values = qids.map(q => 'wd:' + q).join(' ');
  return `
SELECT ?company ?ceoLabel ?founderLabel ?parentLabel ?productLabel
       ?employees ?netIncome ?totalAssets ?totalEquity ?operatingIncome
WHERE {
  VALUES ?company { ${values} }
  OPTIONAL { ?company wdt:P169 ?ceo }
  OPTIONAL { ?company wdt:P112 ?founder }
  OPTIONAL { ?company wdt:P749 ?parent }
  OPTIONAL { ?company wdt:P1056 ?product }
  OPTIONAL { ?company wdt:P1128 ?employees }
  OPTIONAL { ?company wdt:P2295 ?netIncome }
  OPTIONAL { ?company wdt:P2403 ?totalAssets }
  OPTIONAL { ?company wdt:P2138 ?totalEquity }
  OPTIONAL { ?company wdt:P3362 ?operatingIncome }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

function sparqlFetch(query) {
  return new Promise((resolve, reject) => {
    const url = new (require('url').URL)(SPARQL_ENDPOINT);
    url.searchParams.set('query', query);
    url.searchParams.set('format', 'json');

    const req = https.get(url.toString(), {
      headers: { 'User-Agent': UA, 'Accept': 'application/sparql-results+json' }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try { resolve(JSON.parse(body)); }
          catch (e) { reject(new Error('JSON parse error: ' + e.message)); }
        } else {
          reject(new Error('SPARQL HTTP ' + res.statusCode));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('SPARQL timeout')); });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Parse SPARQL results into per-company objects ────────────────────────────

function parseSparqlResults(results) {
  const byCompany = {};
  for (const row of results.results.bindings) {
    const qid = row.company.value.replace('http://www.wikidata.org/entity/', '');
    if (!byCompany[qid]) byCompany[qid] = { ceo: null, parent_org: null, founders: [], products: [], employees: null, net_income: null, total_assets: null, total_equity: null, operating_income: null };
    const entry = byCompany[qid];

    if (row.ceoLabel?.value && !entry.ceo) entry.ceo = row.ceoLabel.value;
    if (row.parentLabel?.value && !entry.parent_org) entry.parent_org = row.parentLabel.value;
    if (row.founderLabel?.value) entry.founders.push(row.founderLabel.value);
    if (row.productLabel?.value) entry.products.push(row.productLabel.value);

    const numOrNull = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
    if (row.employees?.value && entry.employees == null) entry.employees = numOrNull(row.employees.value);
    if (row.netIncome?.value && entry.net_income == null) entry.net_income = numOrNull(row.netIncome.value);
    if (row.totalAssets?.value && entry.total_assets == null) entry.total_assets = numOrNull(row.totalAssets.value);
    if (row.totalEquity?.value && entry.total_equity == null) entry.total_equity = numOrNull(row.totalEquity.value);
    if (row.operatingIncome?.value && entry.operating_income == null) entry.operating_income = numOrNull(row.operatingIncome.value);
  }
  // Deduplicate arrays
  for (const entry of Object.values(byCompany)) {
    entry.founders = [...new Set(entry.founders)];
    entry.products = [...new Set(entry.products)];
  }
  return byCompany;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Loading companies.json...');
  const companies = JSON.parse(fs.readFileSync(COMPANIES_FILE, 'utf8'));
  const allCompanies = Object.values(companies).flat();

  // Build QID → company references (may have duplicates across cities)
  const qidToCompanies = {};
  for (const co of allCompanies) {
    if (!co.qid) continue;
    if (!qidToCompanies[co.qid]) qidToCompanies[co.qid] = [];
    qidToCompanies[co.qid].push(co);
  }

  // Filter to QIDs that have at least one missing field
  const needsEnrich = Object.keys(qidToCompanies).filter(qid => {
    const co = qidToCompanies[qid][0];
    return STRING_FIELDS.some(k => co[k] == null || co[k] === '') ||
           ARRAY_FIELDS.some(k => !Array.isArray(co[k]) || co[k].length === 0) ||
           NUMERIC_FIELDS.some(k => co[k] == null);
  });

  console.log(`${needsEnrich.length} / ${Object.keys(qidToCompanies).length} companies need enrichment`);

  // Batch SPARQL queries
  const totalBatches = Math.ceil(needsEnrich.length / BATCH_SIZE);
  let enriched = 0;

  for (let i = 0; i < needsEnrich.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batch = needsEnrich.slice(i, i + BATCH_SIZE);
    const query = buildSparqlQuery(batch);

    let result = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        result = await sparqlFetch(query);
        break;
      } catch (err) {
        console.warn(`  Batch ${batchNum}/${totalBatches} attempt ${attempt + 1} failed: ${err.message}`);
        if (attempt < MAX_RETRIES) await sleep(BATCH_DELAY_MS * (attempt + 1) * 2);
      }
    }

    if (!result) {
      console.error(`  Batch ${batchNum} FAILED after ${MAX_RETRIES + 1} attempts — skipping`);
      continue;
    }

    const parsed = parseSparqlResults(result);
    for (const qid of Object.keys(parsed)) {
      const targets = qidToCompanies[qid] || [];
      for (const co of targets) {
        mergeWikidataIntoCompany(co, parsed[qid]);
      }
      if (targets.length) enriched++;
    }

    console.log(`  Batch ${batchNum}/${totalBatches} — ${i + batch.length}/${needsEnrich.length} processed, ${enriched} enriched`);
    if (i + BATCH_SIZE < needsEnrich.length) await sleep(BATCH_DELAY_MS);
  }

  // Write back
  atomicWrite(COMPANIES_FILE, JSON.stringify(companies, null, 2), 'utf8');
  console.log(`\nDone. ${enriched} companies enriched. Written to ${COMPANIES_FILE}`);

  // Coverage report
  const total = allCompanies.length;
  const fields = [...STRING_FIELDS, ...ARRAY_FIELDS, ...NUMERIC_FIELDS];
  for (const f of fields) {
    let count = 0;
    for (const co of allCompanies) {
      const v = co[f];
      if (v != null && v !== '' && !(Array.isArray(v) && v.length === 0)) count++;
    }
    console.log(`  ${f.padEnd(22)} ${count} / ${total} (${Math.round(count / total * 100)}%)`);
  }
}

// Export for testing, run main only when executed directly
module.exports = { mergeWikidataIntoCompany, parseSparqlResults, buildSparqlQuery };

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}
