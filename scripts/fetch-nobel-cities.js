#!/usr/bin/env node
/**
 * fetch-nobel-cities.js
 * Queries Wikidata SPARQL for Nobel laureates and maps them to birth cities
 * in cities-full.json.
 *
 * Output: public/nobel-cities.json
 *   {
 *     "Q60": { "total": 28, "byPrize": { "Physics": 8, "Chemistry": 5, ... } },
 *     ...
 *   }
 *
 * Only counts laureates whose birth city QID is in our cities-full.json dataset.
 *
 * Usage: node scripts/fetch-nobel-cities.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const CITIES_PATH = path.join(__dirname, '../public/cities-full.json');
const OUTPUT_PATH = path.join(__dirname, '../public/nobel-cities.json');

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const REQUEST_DELAY_MS = 1200;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 3000;

// Nobel Prize category QIDs → human-readable names
// Q38104  = Nobel Prize in Physics       (P166 direct)
// Q44585  = Nobel Prize in Chemistry     (P166 direct)
// Q80061  = Nobel Prize in Physiology or Medicine  (P166 direct)
// Q37922  = Nobel Prize in Literature    (P166 direct)
// Q35637  = Nobel Peace Prize            (P166 direct)
// Q47170  = Prize in Economic Sciences in Memory of Alfred Nobel (P166 direct)
const PRIZE_CATEGORIES = {
  'Q38104': 'Physics',
  'Q44585': 'Chemistry',
  'Q80061': 'Medicine',
  'Q37922': 'Literature',
  'Q35637': 'Peace',
  'Q47170': 'Economics'
};

// ── helpers ───────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

function extractQid(uri) {
  if (!uri) return null;
  const m = uri.match(/\/(Q\d+)$/);
  return m ? m[1] : null;
}

async function fetchWithRetry(url, opts = {}, retries = MAX_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(90_000) });
      if (res.status === 429) {
        const wait = RETRY_DELAY_MS * (attempt + 2);
        console.warn(`  429 rate-limit. Waiting ${wait}ms...`);
        await sleep(wait);
        continue;
      }
      if (res.status === 500 || res.status === 503) {
        const wait = RETRY_DELAY_MS * (attempt + 1);
        console.warn(`  HTTP ${res.status}. Waiting ${wait}ms...`);
        await sleep(wait);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return res;
    } catch (err) {
      if (attempt === retries) throw err;
      console.warn(`  Retry ${attempt + 1}/${retries}: ${err.message}`);
      await sleep(RETRY_DELAY_MS);
    }
  }
}

async function sparqlQuery(query) {
  const url = SPARQL_ENDPOINT + '?query=' + encodeURIComponent(query) + '&format=json';
  const res = await fetchWithRetry(url, {
    headers: {
      'Accept': 'application/sparql-results+json',
      'User-Agent': 'kworlddatamap/1.0 (educational project)'
    }
  });
  return res.json();
}

// ── SPARQL: fetch all laureates for one prize category ────────────────────────
// We query per category to keep queries small and avoid timeouts.
// P166 = award received
// P19  = place of birth
function buildPrizeCategoryQuery(prizeQid) {
  return `
SELECT DISTINCT ?person ?birthCity WHERE {
  ?person wdt:P166 wd:${prizeQid} .
  OPTIONAL { ?person wdt:P19 ?birthCity }
}
`.trim();
}

// Fallback: query all 6 Nobel prize categories at once with FILTER IN
// Catches any gaps from individual category queries
function buildBroadNobelQuery() {
  const prizeList = Object.keys(PRIZE_CATEGORIES).map(q => `wd:${q}`).join(', ');
  return `
SELECT DISTINCT ?person ?prize ?birthCity WHERE {
  ?person wdt:P166 ?prize .
  FILTER(?prize IN (${prizeList}))
  OPTIONAL { ?person wdt:P19 ?birthCity }
}
`.trim();
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  // Load cities and build QID set
  const cities = JSON.parse(fs.readFileSync(CITIES_PATH, 'utf8'));
  const cityQids = new Set(cities.map(c => c.qid).filter(Boolean));
  console.log(`Loaded ${cities.length} cities, ${cityQids.size} unique QIDs`);

  // Build QID→city name lookup for display
  const qidToName = {};
  for (const c of cities) {
    if (c.qid) qidToName[c.qid] = c.name;
  }

  // cityQid → { total, byPrize: { Physics: N, ... } }
  // Use a Map for accumulation
  const cityData = new Map(); // cityQid → { byPrize: Map<categoryName, count> }

  function recordLaureate(birthCityQid, categoryName) {
    if (!birthCityQid || !cityQids.has(birthCityQid)) return false;
    if (!cityData.has(birthCityQid)) {
      cityData.set(birthCityQid, { byPrize: new Map() });
    }
    const entry = cityData.get(birthCityQid);
    entry.byPrize.set(categoryName, (entry.byPrize.get(categoryName) || 0) + 1);
    return true;
  }

  // Track unique person+prize combos to avoid double-counting
  // (some laureates received multiple prizes or the same prize is listed multiple times)
  const seen = new Set(); // "personQid|categoryName"

  // ── Query each prize category individually ────────────────────────────────
  let totalLaureates = 0;
  let matchedLaureates = 0;

  for (const [prizeQid, categoryName] of Object.entries(PRIZE_CATEGORIES)) {
    console.log(`\nQuerying ${categoryName} (${prizeQid})...`);
    try {
      const query = buildPrizeCategoryQuery(prizeQid);
      const data  = await sparqlQuery(query);
      const bindings = data?.results?.bindings || [];
      console.log(`  Got ${bindings.length} results`);

      let catMatched = 0;
      for (const b of bindings) {
        const personQid    = extractQid(b.person?.value);
        const birthCityQid = extractQid(b.birthCity?.value);
        if (!personQid) continue;

        const key = `${personQid}|${categoryName}`;
        if (seen.has(key)) continue;
        seen.add(key);
        totalLaureates++;

        if (recordLaureate(birthCityQid, categoryName)) {
          catMatched++;
          matchedLaureates++;
        }
      }
      console.log(`  Matched to our cities: ${catMatched}`);
    } catch (err) {
      console.error(`  ERROR for ${categoryName}: ${err.message}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  // ── Broad fallback: catch any missed via P31/P279* wd:Q7191 ──────────────
  console.log(`\nRunning broad Nobel fallback query...`);
  try {
    const data  = await sparqlQuery(buildBroadNobelQuery());
    const bindings = data?.results?.bindings || [];
    console.log(`  Got ${bindings.length} results`);

    let fallbackMatched = 0;
    for (const b of bindings) {
      const personQid    = extractQid(b.person?.value);
      const prizeQid     = extractQid(b.prize?.value);
      const birthCityQid = extractQid(b.birthCity?.value);
      if (!personQid) continue;

      // Map prize QID to category name (may be a specific year's prize, not the category QID)
      // Use 'Other' for unrecognized prizes
      const categoryName = PRIZE_CATEGORIES[prizeQid] || null;
      if (!categoryName) continue; // Only include the 6 standard categories

      const key = `${personQid}|${categoryName}`;
      if (seen.has(key)) continue;
      seen.add(key);
      totalLaureates++;

      if (recordLaureate(birthCityQid, categoryName)) {
        fallbackMatched++;
        matchedLaureates++;
      }
    }
    console.log(`  Fallback new matches: ${fallbackMatched}`);
  } catch (err) {
    console.error(`  Broad fallback ERROR: ${err.message}`);
  }

  // ── Build output ──────────────────────────────────────────────────────────
  const output = {};
  const allCategories = Object.values(PRIZE_CATEGORIES);

  for (const [cityQid, entry] of cityData) {
    const byPrize = {};
    let total = 0;
    for (const cat of allCategories) {
      const count = entry.byPrize.get(cat) || 0;
      if (count > 0) byPrize[cat] = count;
      total += count;
    }
    if (total > 0) {
      output[cityQid] = { total, byPrize };
    }
  }

  // ── Coverage report ───────────────────────────────────────────────────────
  const covered = Object.keys(output).length;
  console.log(`\n=== Coverage Report ===`);
  console.log(`Total laureate records processed:   ${totalLaureates}`);
  console.log(`Laureates matched to our cities:    ${matchedLaureates}`);
  console.log(`Cities with Nobel laureate data:    ${covered} / ${cityQids.size}`);

  // Top 5 by total
  const top5 = Object.entries(output)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 5);

  console.log(`\nTop 5 cities by Nobel laureate birth count:`);
  for (const [qid, v] of top5) {
    const cityName = qidToName[qid] || qid;
    const breakdown = Object.entries(v.byPrize)
      .map(([k, n]) => `${k}:${n}`)
      .join(', ');
    console.log(`  ${cityName} (${qid}): ${v.total} total — ${breakdown}`);
  }

  // Spot checks
  console.log(`\nKnown-city spot checks:`);
  for (const [qid, label] of [
    ['Q60','New York'], ['Q84','London'], ['Q649','Moscow'],
    ['Q90','Paris'],   ['Q1741','Vienna']
  ]) {
    const v = output[qid];
    if (v) {
      const breakdown = Object.entries(v.byPrize).map(([k,n]) => `${k}:${n}`).join(', ');
      console.log(`  ${label} (${qid}): ${v.total} — ${breakdown}`);
    } else {
      console.log(`  ${label} (${qid}): NOT FOUND`);
    }
  }

  console.log(`\nWriting ${OUTPUT_PATH}...`);
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`Done. Wrote ${covered} entries.`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
