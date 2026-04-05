#!/usr/bin/env node
/**
 * fetch-wikidata-universities.js
 * Queries Wikidata SPARQL for universities (Q3918) located in cities from
 * cities-full.json, and writes public/universities.json.
 *
 * Output per city QID:
 *   [ { qid, name, founded, students }, ... ]  (up to 10 per city, sorted by students desc)
 *
 * Strategy:
 *   - Extract all QIDs from cities-full.json
 *   - Batch them in groups of 100
 *   - For each batch query Wikidata for universities where wdt:P131 = city QID
 *   - Deduplicate by university QID, limit 10 per city
 *
 * Source: Wikidata SPARQL (https://query.wikidata.org/sparql)
 * Usage:  node scripts/fetch-wikidata-universities.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const CITIES_PATH = path.join(__dirname, '../public/cities-full.json');
const OUTPUT_PATH = path.join(__dirname, '../public/universities.json');

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const BATCH_SIZE = 80;           // cities per SPARQL query
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 2000;
const REQUEST_DELAY_MS = 1000;   // polite delay between batches
const MAX_UNI_PER_CITY = 10;

// ── fetch with retries ────────────────────────────────────────────────────────
async function fetchWithRetry(url, opts = {}, maxRetries = MAX_RETRIES) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(60_000) });
      if (res.status === 429) {
        // Rate-limited: wait longer
        const wait = RETRY_DELAY_MS * (attempt + 2);
        console.warn(`  Rate limited (429). Waiting ${wait}ms...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return res;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      console.warn(`  Retry ${attempt + 1}/${maxRetries}: ${err.message}`);
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    }
  }
}

// ── run a SPARQL query ────────────────────────────────────────────────────────
async function sparql(query) {
  const url = SPARQL_ENDPOINT + '?query=' + encodeURIComponent(query) + '&format=json';
  const res = await fetchWithRetry(url, {
    headers: {
      'Accept': 'application/sparql-results+json',
      'User-Agent': 'WorldCitiesMap/1.0 (https://github.com/kevinkicho; data pipeline)'
    }
  });
  return res.json();
}

// ── sleep helper ──────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── extract QID from URI ──────────────────────────────────────────────────────
function extractQid(uri) {
  const m = uri.match(/\/(Q\d+)$/);
  return m ? m[1] : null;
}

// ── build SPARQL for a batch of city QIDs ────────────────────────────────────
function buildBatchQuery(cityQids) {
  const values = cityQids.map(q => `wd:${q}`).join(' ');
  return `
SELECT ?city ?uni ?uniLabel ?founded ?students WHERE {
  VALUES ?city { ${values} }
  ?uni wdt:P31/wdt:P279* wd:Q3918 .
  ?uni wdt:P131 ?city .
  OPTIONAL { ?uni wdt:P571 ?founded }
  OPTIONAL { ?uni wdt:P2196 ?students }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
}
LIMIT 2000
`.trim();
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  const cities = JSON.parse(fs.readFileSync(CITIES_PATH, 'utf8'));
  console.log(`Loaded ${cities.length} cities from cities-full.json`);

  // Extract unique QIDs (skip falsy)
  const qids = [...new Set(cities.map(c => c.qid).filter(Boolean))];
  console.log(`Unique city QIDs: ${qids.length}`);

  // Split into batches
  const batches = [];
  for (let i = 0; i < qids.length; i += BATCH_SIZE) {
    batches.push(qids.slice(i, i + BATCH_SIZE));
  }
  console.log(`Processing ${batches.length} batches of up to ${BATCH_SIZE} cities each`);

  // Accumulate results: cityQid → Map<uniQid, {name, founded, students}>
  const cityUnis = new Map(); // cityQid → Map<uniQid, entry>
  let totalUnis = 0;
  let batchErrors = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    process.stdout.write(`  Batch ${i + 1}/${batches.length} (${batch.length} cities)... `);

    try {
      const query = buildBatchQuery(batch);
      const data = await sparql(query);
      const bindings = data?.results?.bindings || [];

      let batchCount = 0;
      for (const b of bindings) {
        const cityQid = extractQid(b.city?.value || '');
        const uniQid  = extractQid(b.uni?.value || '');
        const name    = b.uniLabel?.value;

        if (!cityQid || !uniQid || !name) continue;
        // Skip auto-generated labels (Wikidata fallback: "Q12345")
        if (/^Q\d+$/.test(name)) continue;

        const founded  = b.founded?.value ? parseInt(b.founded.value.substring(0, 4)) : null;
        const students = b.students?.value ? parseInt(b.students.value) : null;

        if (!cityUnis.has(cityQid)) cityUnis.set(cityQid, new Map());
        const uniMap = cityUnis.get(cityQid);

        // Merge: prefer entry with more data (students > null)
        if (!uniMap.has(uniQid) || (students != null && uniMap.get(uniQid).students == null)) {
          uniMap.set(uniQid, { qid: uniQid, name, founded: founded || null, students: students || null });
          batchCount++;
        }
      }

      totalUnis += batchCount;
      console.log(`${bindings.length} results, ${batchCount} new uni entries`);
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      batchErrors++;
      // On timeout or error, skip batch and continue
    }

    // Polite delay between requests
    if (i < batches.length - 1) {
      await sleep(REQUEST_DELAY_MS);
    }
  }

  console.log(`\nRaw results: ${totalUnis} total university entries across ${cityUnis.size} cities`);
  console.log(`Batch errors: ${batchErrors}/${batches.length}`);

  // ── Build output: sort and limit per city ─────────────────────────────────
  const output = {};

  for (const [cityQid, uniMap] of cityUnis) {
    let unis = [...uniMap.values()];

    // Sort: students descending (nulls last), then alphabetical
    unis.sort((a, b) => {
      if (a.students != null && b.students != null) return b.students - a.students;
      if (a.students != null) return -1;
      if (b.students != null) return 1;
      return a.name.localeCompare(b.name);
    });

    // Limit to top N
    unis = unis.slice(0, MAX_UNI_PER_CITY);

    if (unis.length > 0) {
      output[cityQid] = unis;
    }
  }

  const cityCount = Object.keys(output).length;
  const uniCount  = Object.values(output).reduce((sum, arr) => sum + arr.length, 0);

  console.log(`\nOutput summary:`);
  console.log(`  Cities with universities: ${cityCount}`);
  console.log(`  Total university entries: ${uniCount}`);

  console.log(`\nWriting ${OUTPUT_PATH}...`);
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`Done. Wrote ${cityCount} city entries.`);

  printSamples(output);
}

function printSamples(output) {
  console.log('\n── Sample entries ──');
  const samples = { 'Q60': 'New York', 'Q84': 'London', 'Q1490': 'Tokyo', 'Q90': 'Paris' };
  for (const [qid, label] of Object.entries(samples)) {
    const unis = output[qid];
    if (unis && unis.length > 0) {
      console.log(`  ${label} (${qid}): ${unis.length} universities`);
      unis.slice(0, 3).forEach(u =>
        console.log(`    - ${u.name} (${u.qid}) founded=${u.founded} students=${u.students}`)
      );
    } else {
      console.log(`  ${label} (${qid}): not found`);
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
