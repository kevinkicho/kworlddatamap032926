#!/usr/bin/env node
/**
 * fetch-metro-transit.js
 * Queries Wikidata SPARQL for metro/rapid transit systems and maps them
 * to cities in cities-full.json by QID.
 *
 * Output: public/metro-transit.json
 *   { "Q60": { "lines": 27, "stations": 472, "name": "New York City Subway", "opened": 1904 }, ... }
 *
 * If a city has multiple systems, lines/stations are summed and the
 * largest system's name is used.
 *
 * Strategy:
 *   1. Query all P31=Q5503 (rapid transit) systems with:
 *      - P131 location chain (direct + parent) for city matching
 *      - P625 coordinate for fallback proximity matching
 *      - station count via COUNT(P16) in same GROUP BY query
 *   2. Line count: second query using P527 (has part) filtered to transit line types
 *
 * Usage: node scripts/fetch-metro-transit.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const CITIES_PATH = path.join(__dirname, '../public/cities-full.json');
const OUTPUT_PATH = path.join(__dirname, '../public/metro-transit.json');

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const REQUEST_DELAY_MS = 1200;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 3000;
const COORD_MATCH_KM  = 30; // max distance for coordinate-based city matching

// ── helpers ───────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

function extractQid(uri) {
  if (!uri) return null;
  const m = uri.match(/\/(Q\d+)$/);
  return m ? m[1] : null;
}

function parseYear(val) {
  if (!val) return null;
  const m = val.match(/^(-?\d{1,4})/);
  return m ? parseInt(m[1]) : null;
}

function parseCoord(wkt) {
  // WKT: "Point(-0.10083333 51.49277778)"
  const m = wkt.match(/Point\(([^\s]+)\s+([^\)]+)\)/i);
  return m ? { lon: parseFloat(m[1]), lat: parseFloat(m[2]) } : null;
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function fetchWithRetry(url, opts = {}, retries = MAX_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(120_000) });
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

// ── Main query: systems + station counts + location + coordinate ──────────────
function buildMainQuery() {
  return `
SELECT ?sys ?sysLabel ?city ?coord ?opened (COUNT(?station) AS ?stationCount) WHERE {
  ?sys wdt:P31 wd:Q5503 .
  OPTIONAL { ?sys wdt:P131 ?city }
  OPTIONAL { ?sys wdt:P625 ?coord }
  OPTIONAL { ?sys wdt:P571 ?opened }
  OPTIONAL { ?station wdt:P16 ?sys }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
}
GROUP BY ?sys ?sysLabel ?city ?coord ?opened
ORDER BY DESC(?stationCount)
`.trim();
}

// ── Parent loc query: for unmatched loc QIDs, get their P131 parent ───────────
function buildParentLocQuery(locQids) {
  const filter = locQids.map(q => `wd:${q}`).join(', ');
  return `
SELECT ?loc ?parent WHERE {
  ?loc wdt:P131 ?parent .
  FILTER(?loc IN (${filter}))
}
`.trim();
}

// ── Line count query: P527 children that are transit lines ───────────────────
// Uses FILTER IN (not VALUES) to avoid Wikidata's VALUES+GROUP BY bug
function buildLineCountQuery(sysQids) {
  const filter = sysQids.map(q => `wd:${q}`).join(', ');
  return `
SELECT ?sys (COUNT(DISTINCT ?line) AS ?n) WHERE {
  ?sys wdt:P527 ?line .
  FILTER(?sys IN (${filter}))
  {
    ?line wdt:P31/wdt:P279* wd:Q928830
  } UNION {
    ?line wdt:P31/wdt:P279* wd:Q15079663
  } UNION {
    ?line wdt:P31/wdt:P279* wd:Q60442637
  }
}
GROUP BY ?sys
`.trim();
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  // Load cities and build QID set + spatial index
  const cities = JSON.parse(fs.readFileSync(CITIES_PATH, 'utf8'));
  const cityQids = new Set(cities.map(c => c.qid).filter(Boolean));
  const qidToCity = {};
  for (const c of cities) { if (c.qid) qidToCity[c.qid] = c; }
  console.log(`Loaded ${cities.length} cities, ${cityQids.size} unique QIDs`);

  // ── Step 1: Fetch all transit systems ────────────────────────────────────
  console.log('\nFetching rapid transit systems with station counts...');
  const data = await sparqlQuery(buildMainQuery());
  const bins = data?.results?.bindings || [];
  console.log(`  Got ${bins.length} rows (per-city duplicates expected)`);
  await sleep(REQUEST_DELAY_MS);

  // sysQid → { name, locQids: Set<qid>, coord, stationCount, opened }
  const systems = new Map();
  // unmatchedLocQids: loc QIDs not directly in our city set
  const unmatchedLocs = new Set();

  for (const b of bins) {
    const sysQid = extractQid(b.sys?.value);
    const name   = b.sysLabel?.value;
    if (!sysQid || !name || /^Q\d+$/.test(name)) continue;

    const locQid      = extractQid(b.city?.value);
    const stationCount = parseInt(b.stationCount?.value || '0');
    const opened      = parseYear(b.opened?.value);
    const coord       = b.coord?.value ? parseCoord(b.coord.value) : null;

    if (!systems.has(sysQid)) {
      systems.set(sysQid, { name, locQids: new Set(), coord: null, stationCount: 0, opened: null });
    }
    const entry = systems.get(sysQid);
    if (locQid) entry.locQids.add(locQid);
    if (stationCount > entry.stationCount) entry.stationCount = stationCount;
    if (!entry.opened && opened) entry.opened = opened;
    if (!entry.coord && coord) entry.coord = coord;
  }

  console.log(`  Unique systems: ${systems.size}`);

  // ── Step 2: Match systems to cities via direct P131 ───────────────────────
  const systemToCity = new Map(); // sysQid → cityQid

  for (const [sysQid, entry] of systems) {
    for (const locQid of entry.locQids) {
      if (cityQids.has(locQid)) {
        systemToCity.set(sysQid, locQid);
        break;
      } else {
        unmatchedLocs.add(locQid);
      }
    }
  }
  console.log(`\nDirect city matches: ${systemToCity.size} / ${systems.size}`);
  console.log(`Unmatched loc QIDs to resolve via parent: ${unmatchedLocs.size}`);

  // ── Step 3: Resolve parent P131 for unmatched locs ────────────────────────
  if (unmatchedLocs.size > 0) {
    const locList = [...unmatchedLocs];
    const BATCH = 100;
    const locToParent = new Map();

    for (let i = 0; i < locList.length; i += BATCH) {
      const batch = locList.slice(i, i + BATCH);
      process.stdout.write(`  Parent-loc batch ${Math.floor(i/BATCH)+1}/${Math.ceil(locList.length/BATCH)}... `);
      try {
        const pdata = await sparqlQuery(buildParentLocQuery(batch));
        const pbins = pdata?.results?.bindings || [];
        for (const b of pbins) {
          const loc    = extractQid(b.loc?.value);
          const parent = extractQid(b.parent?.value);
          if (loc && parent && !locToParent.has(loc)) locToParent.set(loc, parent);
        }
        console.log(`${pbins.length} results`);
      } catch (err) {
        console.log(`ERROR: ${err.message}`);
      }
      if (i + BATCH < locList.length) await sleep(REQUEST_DELAY_MS);
    }

    let parentMatches = 0;
    for (const [sysQid, entry] of systems) {
      if (systemToCity.has(sysQid)) continue;
      for (const locQid of entry.locQids) {
        const parent = locToParent.get(locQid);
        if (parent && cityQids.has(parent)) {
          systemToCity.set(sysQid, parent);
          parentMatches++;
          break;
        }
      }
    }
    console.log(`Parent-loc matches: ${parentMatches}`);
  }

  // ── Step 4: Coordinate fallback for still-unmatched systems ──────────────
  let coordMatches = 0;
  for (const [sysQid, entry] of systems) {
    if (systemToCity.has(sysQid)) continue;
    if (!entry.coord) continue;

    let bestCity = null;
    let bestDist = Infinity;
    for (const c of cities) {
      if (c.lat == null || c.lng == null) continue;
      const dist = haversine(entry.coord.lat, entry.coord.lon, c.lat, c.lng);
      if (dist < bestDist) { bestDist = dist; bestCity = c; }
    }
    if (bestCity && bestDist <= COORD_MATCH_KM) {
      systemToCity.set(sysQid, bestCity.qid);
      coordMatches++;
    }
  }
  console.log(`Coordinate matches: ${coordMatches}`);
  console.log(`Total matched systems: ${systemToCity.size}`);

  await sleep(REQUEST_DELAY_MS);

  // ── Step 5: Get line counts per system via P527 ───────────────────────────
  const matchedQids = [...systemToCity.keys()];
  const lineCounts  = new Map();
  const LINE_BATCH  = 40;

  console.log(`\nFetching line counts for ${matchedQids.length} systems...`);
  for (let i = 0; i < matchedQids.length; i += LINE_BATCH) {
    const batch = matchedQids.slice(i, i + LINE_BATCH);
    process.stdout.write(`  Batch ${Math.floor(i/LINE_BATCH)+1}/${Math.ceil(matchedQids.length/LINE_BATCH)}... `);
    try {
      const ld = await sparqlQuery(buildLineCountQuery(batch));
      const lbins = ld?.results?.bindings || [];
      for (const b of lbins) {
        const sysQid = extractQid(b.sys?.value);
        const n = parseInt(b.n?.value || '0');
        if (sysQid && n > 0) lineCounts.set(sysQid, n);
      }
      console.log(`${lbins.length} results`);
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
    }
    if (i + LINE_BATCH < matchedQids.length) await sleep(REQUEST_DELAY_MS);
  }

  // ── Step 6: Build output grouped by city ─────────────────────────────────
  const cityToSystems = new Map();
  for (const [sysQid, cityQid] of systemToCity) {
    const entry = systems.get(sysQid);
    if (!entry) continue;
    if (!cityToSystems.has(cityQid)) cityToSystems.set(cityQid, []);
    cityToSystems.get(cityQid).push({
      sysQid,
      name:     entry.name,
      stations: entry.stationCount > 0 ? entry.stationCount : null,
      lines:    lineCounts.get(sysQid) || null,
      opened:   entry.opened
    });
  }

  const output = {};
  for (const [cityQid, sysList] of cityToSystems) {
    if (sysList.length === 1) {
      const s = sysList[0];
      output[cityQid] = { name: s.name, lines: s.lines, stations: s.stations, opened: s.opened };
    } else {
      // Multiple systems: sum lines/stations, use largest-station system's name
      let totalLines = 0, totalStations = 0;
      let hasLines = false, hasStations = false;
      let bestName = sysList[0].name, bestStations = -1;
      let firstOpened = null;

      for (const s of sysList) {
        if (s.lines    != null) { totalLines    += s.lines;    hasLines    = true; }
        if (s.stations != null) { totalStations += s.stations; hasStations = true; }
        if (s.stations != null && s.stations > bestStations) {
          bestStations = s.stations; bestName = s.name;
        }
        if (s.opened != null && (firstOpened == null || s.opened < firstOpened)) {
          firstOpened = s.opened;
        }
      }
      output[cityQid] = {
        name:     bestName,
        lines:    hasLines    ? totalLines    : null,
        stations: hasStations ? totalStations : null,
        opened:   firstOpened
      };
    }
  }

  // ── Coverage report ───────────────────────────────────────────────────────
  const covered = Object.keys(output).length;
  console.log(`\n=== Coverage Report ===`);
  console.log(`Cities with metro/transit data: ${covered} / ${cityQids.size}`);
  console.log(`  With station counts:  ${Object.values(output).filter(v => v.stations != null).length}`);
  console.log(`  With line counts:     ${Object.values(output).filter(v => v.lines    != null).length}`);

  // Top 5 by stations
  console.log(`\nTop 5 cities by station count:`);
  Object.entries(output)
    .filter(([, v]) => v.stations != null)
    .sort((a, b) => b[1].stations - a[1].stations)
    .slice(0, 5)
    .forEach(([qid, v]) => {
      const city = qidToCity[qid];
      console.log(`  ${city?.name || qid} (${qid}): ${v.stations} stations, ${v.lines ?? '?'} lines — ${v.name} (${v.opened ?? '?'})`);
    });

  // Spot checks
  console.log(`\nKnown-city spot checks:`);
  for (const [qid, label] of [
    ['Q60','New York'],['Q84','London'],['Q956','Beijing'],
    ['Q90','Paris'],  ['Q1490','Tokyo'],['Q649','Moscow']
  ]) {
    const v = output[qid];
    if (v) {
      console.log(`  ${label} (${qid}): ${v.stations ?? '?'} stations, ${v.lines ?? '?'} lines — ${v.name} (${v.opened ?? '?'})`);
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
