#!/usr/bin/env node
/**
 * scripts/fetch-cities.js
 *
 * Downloads every city from Wikidata with population >= LOWER_BOUND.
 * Cities with no population data, or population below the floor, are skipped.
 *
 * THREE PHASES
 *   Phase 1 — Slim core query (name, desc, coords, pop, country, admin, timezone)
 *             Uses a VALUES type-filter so Blazegraph hits the P31 index first —
 *             no more full-table scans on lower population tiers.
 *             Only 3 OPTIONALs → fast, no timeouts.
 *   Phase 2 — Enrichment by QID batch (area, elev, founded, website, geonames)
 *             Only high-coverage fields (≥23%). Bounded VALUES — no table scan.
 *   Phase 3 — Sister cities by QID batch (P190 relationships)
 *
 * CHECKPOINT / RESUME
 *   Progress is saved after every page / batch.
 *   If interrupted just run again — resumes from last save.
 *   Deleted automatically on clean finish.
 *
 * Output: public/cities-full.json
 *
 * Usage:
 *   npm run fetch-cities
 *   Resumes from checkpoint if interrupted mid-run.
 *   Merges results into existing cities-full.json on completion — data only grows.
 */

'use strict';

const fs   = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');

// ── Configuration ─────────────────────────────────────────────────────────────

const LOWER_BOUND     = 10_000; // skip cities with population below this
const CORE_BATCH      = 100;    // rows per Phase 1 SPARQL page
const ENRICH_BATCH    = 100;    // QIDs per Phase 2 enrichment request
const SISTER_BATCH    = 150;    // QIDs per Phase 3 sister-city request
const DELAY_MS        = 4_000;  // pause between every request (ms)
const OUT_FILE        = path.join(__dirname, '..', 'public', 'cities-full.json');
const CHECKPOINT_FILE = path.join(__dirname, '.checkpoint.json');

// Wikidata entity types that represent cities / towns / settlements.
// Using VALUES on P31 lets Blazegraph hit the type index first and
// avoid scanning the entire P1082 (population) table for each tier.
const SETTLEMENT_TYPES = [
  // ── Core types (original) ───────────────────────────────────────────────
  'wd:Q515',      // city
  'wd:Q1549591',  // big city
  'wd:Q3957',     // town
  'wd:Q532',      // village
  'wd:Q486972',   // human settlement
  'wd:Q7930989',  // city/town
  'wd:Q2208153',  // city of the United States
  'wd:Q5119',     // capital city
  'wd:Q15284',    // municipality

  // ── Russia / post-Soviet / Central Asia ────────────────────────────────
  // Many CIS cities use these types directly (not Q486972) in Wikidata
  'wd:Q1757204',  // urban-type settlement (посёлок городского типа) ~1,100 entries
  'wd:Q1899818',  // urban settlement (post-Soviet general)
  'wd:Q1523821',  // urban-type settlement in Ukraine (селище міського типу)

  // ── Japan ───────────────────────────────────────────────────────────────
  // Japanese cities (市) are typed with this Japan-specific class, not Q515
  'wd:Q494721',   // city in Japan (市) ~800 entries
  'wd:Q5765760',  // town in Japan (町)

  // ── China ───────────────────────────────────────────────────────────────
  // County-level cities often carry Q200547 instead of Q515
  'wd:Q200547',   // county-level city (县级市) ~388 entries

  // ── India / South Asia ──────────────────────────────────────────────────
  // India's census towns are typed separately from Q515/Q486972
  'wd:Q15221921', // census town (India) ~4k entries, many 10k–50k pop
  'wd:Q1184518',  // municipal corporation (India)
  'wd:Q1477849',  // nagar panchayat (India, smallest urban local body)

  // ── Americas ────────────────────────────────────────────────────────────
  'wd:Q1093829',  // city in the United States (used alongside Q515)
  'wd:Q3184121',  // municipality of Brazil
  'wd:Q2198484',  // municipality of Mexico (municipio)

  // ── General urban categories ─────────────────────────────────────────────
  'wd:Q1637706',  // million city (explicit tag, ensures major metros aren't missed)
  'wd:Q1338818',  // urban agglomeration

  // ── Megacities / global cities ────────────────────────────────────────────
  // Paris, Delhi, Lagos, Jakarta, Buenos Aires use ONLY these P31 types —
  // they don't carry Q515 or Q486972. Without these, those cities are invisible.
  'wd:Q174844',   // megacity (Paris, Delhi, Lagos, Jakarta, Buenos Aires...)
  'wd:Q200250',   // metropolis (additional large cities not covered by megacity)
  'wd:Q208511',   // global city (London, NYC, Tokyo classification)

  // ── Germany ───────────────────────────────────────────────────────────────
  // German cities predominantly use this type, not Q515 or Q486972
  'wd:Q42744322', // urban municipality in Germany (Stadtgemeinde) ~1,200 cities
  'wd:Q707813',   // Hanseatic city (Bremen, Hamburg, Lübeck, Rostock…)

  // ── United Kingdom ────────────────────────────────────────────────────────
  'wd:Q1115575',  // civil parish (England/Wales) ~1,500 entries, 10k filter keeps real towns
  'wd:Q18511725', // market town (UK/Ireland) ~450 towns
  'wd:Q2755753',  // area of London (boroughs, districts) ~265
  'wd:Q1006876',  // borough in the United Kingdom ~142
  'wd:Q1357964',  // county town (UK regional capitals) ~66

  // ── United States (additional) ────────────────────────────────────────────
  // Q1093829 (city in the US) already in list — covers 2,433 cities
  'wd:Q62049',    // county seat ~724 (most major US cities qualify)
  'wd:Q15127012', // town in the United States ~419

  // ── Southeast Asia ────────────────────────────────────────────────────────
  // Indonesian kota and Philippine chartered cities use country-specific P31 types.
  // Without these, only Jakarta/Manila (tagged megacity/metropolis) appear —
  // Surabaya, Bandung, Bekasi, Cebu, Davao, and ~90 others are invisible.
  // Note: kabupaten (Indonesian regencies/rural districts) are intentionally excluded.
  'wd:Q3111899',  // city of Indonesia (kota) — all 95 chartered cities
  'wd:Q24764',    // city in the Philippines (chartered city) — Cebu, Davao, Quezon…
].join(' ');

const TIERS = [
  { min: 10_000_000, max:  Infinity },
  { min:  5_000_000, max: 10_000_000 },
  { min:  2_000_000, max:  5_000_000 },
  { min:  1_000_000, max:  2_000_000 },
  { min:    500_000, max:  1_000_000 },
  { min:    200_000, max:    500_000 },
  { min:    100_000, max:    200_000 },
  { min:     50_000, max:    100_000 },
  { min:     10_000, max:     50_000 },
].filter(t => t.min >= LOWER_BOUND);

// ── Checkpoint helpers ────────────────────────────────────────────────────────

function saveCheckpoint(byQid, phase, tierIndex, tierOffset, enrichBatch, sisterBatch) {
  const data = {
    version:     6,
    phase,
    tierIndex,
    tierOffset,
    enrichBatch,
    sisterBatch,
    savedAt:     new Date().toISOString(),
    entries:     Array.from(byQid.entries()),
  };
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(data), 'utf8');
}

function loadCheckpoint() {
  if (!fs.existsSync(CHECKPOINT_FILE)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
    if (data.version !== 6) return null;   // incompatible older format — start fresh
    return data;
  } catch {
    return null;
  }
}

function deleteCheckpoint() {
  if (fs.existsSync(CHECKPOINT_FILE)) fs.unlinkSync(CHECKPOINT_FILE);
}

// ── SPARQL query builders ─────────────────────────────────────────────────────

/**
 * Phase 1 — slim core query.
 * VALUES ?type pre-filters to known settlement types so Blazegraph uses
 * the P31 index instead of scanning all P1082 statements.
 * Only 3 OPTIONALs → each page stays well within the 60s timeout.
 */
function buildCoreQuery(min, max, offset) {
  const maxClause = isFinite(max) ? `&& ?pop < ${max}` : '';
  return `
SELECT DISTINCT ?item ?itemLabel ?itemDescription ?pop ?lat ?lon
  ?countryLabel ?iso ?adminLabel ?timezoneLabel
WHERE {
  VALUES ?settlementType { ${SETTLEMENT_TYPES} }
  ?item wdt:P31  ?settlementType ;
        wdt:P1082 ?pop ;
        wdt:P625  ?coord .
  FILTER(?pop >= ${min} ${maxClause})
  OPTIONAL { ?item wdt:P17  ?country . OPTIONAL { ?country wdt:P297 ?iso . } }
  OPTIONAL { ?item wdt:P131 ?admin   . }
  OPTIONAL { ?item wdt:P421 ?timezone . }
  BIND(geof:latitude(?coord)  AS ?lat)
  BIND(geof:longitude(?coord) AS ?lon)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
}
ORDER BY DESC(?pop) ?item
LIMIT  ${CORE_BATCH}
OFFSET ${offset}
`.trim();
}

/**
 * Phase 2 — enrichment by bounded QID list.
 * Only the 5 fields with ≥23% coverage — keeps each batch fast.
 * No table scan because we supply exact QIDs via VALUES.
 */
function buildEnrichQuery(qids) {
  const values = qids.map(q => `wd:${q}`).join(' ');
  return `
SELECT ?item ?area ?elev ?founded ?website ?geonames
WHERE {
  VALUES ?item { ${values} }
  OPTIONAL { ?item wdt:P2046 ?area     . }
  OPTIONAL { ?item wdt:P2044 ?elev     . }
  OPTIONAL { ?item wdt:P571  ?founded  . }
  OPTIONAL { ?item wdt:P856  ?website  . }
  OPTIONAL { ?item wdt:P1566 ?geonames . }
}
`.trim();
}

/** Phase 3 — sister cities by bounded QID list. */
function buildSisterQuery(qids) {
  const values = qids.map(q => `wd:${q}`).join(' ');
  return `
SELECT ?item ?sisterLabel WHERE {
  VALUES ?item { ${values} }
  ?item wdt:P190 ?sister .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
}
`.trim();
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function sparqlFetch(query, attempt = 1) {
  const url =
    'https://query.wikidata.org/sparql?query=' +
    encodeURIComponent(query) + '&format=json';

  let res;
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent': 'WorldDataMap-CityFetcher/1.0 (educational; nodejs)',
        'Accept':     'application/sparql-results+json',
      },
      signal: AbortSignal.timeout(58_000),
    });
  } catch (e) {
    // Timeout or network error — retry up to 3 times with increasing wait
    if (attempt <= 3) {
      const wait = 20_000 * attempt;   // 20s, 40s, 60s
      process.stdout.write(`(${e.message ?? 'network error'} — retry ${attempt}/3 in ${wait / 1000}s) `);
      await sleep(wait);
      return sparqlFetch(query, attempt + 1);
    }
    throw e;
  }

  if (res.status === 429 || res.status === 503) {
    // Rate-limited or overloaded — back off and retry
    if (attempt <= 4) {
      const wait = 30_000 * attempt;   // 30s, 60s, 90s, 120s
      process.stdout.write(`(HTTP ${res.status} — retry ${attempt}/4 in ${wait / 1000}s) `);
      await sleep(wait);
      return sparqlFetch(query, attempt + 1);
    }
  }

  if (res.status === 502) {
    // Gateway timeout from Wikidata's proxy — longer back-off
    if (attempt <= 5) {
      const wait = 45_000 * attempt;   // 45s, 90s, 135s, 180s, 225s
      process.stdout.write(`(HTTP 502 — retry ${attempt}/5 in ${wait / 1000}s) `);
      await sleep(wait);
      return sparqlFetch(query, attempt + 1);
    }
  }

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Value parsers ─────────────────────────────────────────────────────────────

function toInt(v)    { if (v == null) return null; const n = global.parseInt(v, 10); return isNaN(n) ? null : n; }
function toFloat(v)  { if (v == null) return null; const n = parseFloat(v);          return isNaN(n) ? null : n; }
function round(v, d) { if (v == null) return null; const f = Math.pow(10, d); return Math.round(v * f) / f; }

function toYear(iso) {
  if (!iso) return null;
  const m = iso.match(/^(-?)(\d+)-/);
  if (!m) return null;
  const yr = global.parseInt(m[2], 10);
  return m[1] === '-' ? -yr : yr;
}

// ── Parsers ───────────────────────────────────────────────────────────────────

function parseCoreBindings(bindings) {
  const records = [];
  let   skipped = 0;
  for (const b of bindings) {
    const name = b.itemLabel?.value ?? '';
    if (!name || /^Q\d+$/.test(name)) { skipped++; continue; }
    const lat = toFloat(b.lat?.value);
    const lng = toFloat(b.lon?.value);
    if (lat == null || lng == null)   { skipped++; continue; }
    const qid = (b.item?.value ?? '').replace('http://www.wikidata.org/entity/', '');
    records.push({
      qid,
      name,
      desc:     b.itemDescription?.value ?? null,
      lat:      round(lat, 4),
      lng:      round(lng, 4),
      pop:      toInt(b.pop?.value),
      country:  b.countryLabel?.value  ?? null,
      iso:      b.iso?.value           ?? null,
      admin:    b.adminLabel?.value    ?? null,
      timezone: b.timezoneLabel?.value ?? null,
      // enrichment fields — filled in Phase 2
      area_km2:    null,
      elev_m:      null,
      founded:     null,
      website:     null,
      geonames_id: null,
      sister_cities: [],
    });
  }
  return { records, skipped };
}

function applyEnrichment(byQid, bindings) {
  let count = 0;
  for (const b of bindings) {
    const qid  = (b.item?.value ?? '').replace('http://www.wikidata.org/entity/', '');
    const city = byQid.get(qid);
    if (!city) continue;
    if (b.area?.value     != null && city.area_km2    == null) city.area_km2    = round(toFloat(b.area.value),  1);
    if (b.elev?.value     != null && city.elev_m      == null) city.elev_m      = toInt(b.elev.value);
    if (b.founded?.value  != null && city.founded     == null) city.founded     = toYear(b.founded.value);
    if (b.website?.value  != null && city.website     == null) city.website     = b.website.value;
    if (b.geonames?.value != null && city.geonames_id == null) city.geonames_id = b.geonames.value;
    count++;
  }
  return count;
}

// ── Merge helper ──────────────────────────────────────────────────────────────

function mergeInto(byQid, r) {
  if (!r.qid) return;
  if (!byQid.has(r.qid)) {
    byQid.set(r.qid, r);
  } else {
    const ex = byQid.get(r.qid);
    if (r.pop != null && (ex.pop == null || r.pop > ex.pop)) ex.pop = r.pop;
    for (const [k, v] of Object.entries(r)) {
      if (k === 'qid' || k === 'sister_cities' || k === 'pop') continue;
      if (ex[k] == null && v != null) ex[k] = v;
    }
  }
}

// ── Phase 1 — slim core data ──────────────────────────────────────────────────

async function runPhase1(byQid, startTierIndex, startOffset) {
  console.log(`Phase 1: core data — resuming from tier ${startTierIndex + 1}/${TIERS.length}, offset ${startOffset}\n`);

  for (let ti = startTierIndex; ti < TIERS.length; ti++) {
    const { min, max } = TIERS[ti];
    const label  = isFinite(max) ? `${fmt(min)}–${fmt(max)}` : `≥${fmt(min)}`;
    let   offset = (ti === startTierIndex) ? startOffset : 0;
    let   page   = Math.floor(offset / CORE_BATCH) + 1;
    let   tierNew = 0;
    let   consecutiveFails = 0;

    while (true) {
      process.stdout.write(`  [${label}] p${page} offset=${offset} … `);
      let json;
      let fetchError = null;

      // First try with full batch size
      try {
        json = await sparqlFetch(buildCoreQuery(min, max, offset));
      } catch (e) {
        fetchError = e;
      }

      // If full batch failed, retry with half-batch to recover partial data
      if (fetchError) {
        const halfBatch = Math.floor(CORE_BATCH / 2);
        process.stdout.write(`(full-batch failed: ${fetchError.message}) `);
        process.stdout.write(`retrying half-batch (${halfBatch} rows) … `);
        try {
          const halfQuery = buildCoreQuery(min, max, offset).replace(
            `LIMIT  ${CORE_BATCH}`,
            `LIMIT  ${halfBatch}`,
          );
          json = await sparqlFetch(halfQuery);
          fetchError = null;   // half-batch succeeded
          process.stdout.write('ok  ');
        } catch (e2) {
          // Both full and half failed — escalating cooldown, then skip page and continue.
          // Never abandon the tier — Wikidata load spikes are temporary.
          consecutiveFails++;
          // Cooldown: 2min, 4min, 6min, 8min, 10min — gives Wikidata time to recover
          const cooldown = Math.min(consecutiveFails * 120_000, 600_000);
          console.log(`SKIP (${e2.message}) [consecutive fails: ${consecutiveFails}] — cooldown ${cooldown / 60000}min`);
          offset += CORE_BATCH;
          page++;
          await sleep(cooldown);
          continue;
        }
      }

      // Success (either full or half batch)
      consecutiveFails = 0;

      const { records, skipped } = parseCoreBindings(json.results.bindings);
      for (const r of records) mergeInto(byQid, r);
      tierNew += records.length;
      console.log(`${records.length} records (+${skipped} unlabeled) [total: ${byQid.size}]`);

      saveCheckpoint(byQid, 1, ti, offset + CORE_BATCH, 0, 0);

      if (json.results.bindings.length < CORE_BATCH) break;
      offset += CORE_BATCH;
      page++;
      await sleep(DELAY_MS);
    }

    console.log(`  tier ${ti + 1}/${TIERS.length} done: ${tierNew} records  running total: ${byQid.size}\n`);
    await sleep(DELAY_MS);
  }

  console.log('Phase 1 complete.\n');
}

// ── Phase 2 — enrichment ──────────────────────────────────────────────────────

async function runPhase2(byQid, startBatch) {
  const qids  = Array.from(byQid.keys());
  const total = qids.length;
  const bTot  = Math.ceil(total / ENRICH_BATCH);

  console.log(`Phase 2: enrichment — ${total} cities, resuming from batch ${startBatch + 1}/${bTot}\n`);

  // Save transition checkpoint so a crash here resumes at Phase 2
  if (startBatch === 0) saveCheckpoint(byQid, 2, TIERS.length, 0, 0, 0);

  for (let bi = startBatch; bi < bTot; bi++) {
    const chunk = qids.slice(bi * ENRICH_BATCH, (bi + 1) * ENRICH_BATCH);
    process.stdout.write(`  batch ${bi + 1}/${bTot} … `);

    let json;
    try {
      json = await sparqlFetch(buildEnrichQuery(chunk));
    } catch (e) {
      console.log(`ERROR: ${e.message} — skipping batch`);
      saveCheckpoint(byQid, 2, TIERS.length, 0, bi + 1, 0);
      await sleep(DELAY_MS * 2);
      continue;
    }

    const enriched = applyEnrichment(byQid, json.results.bindings);
    console.log(`done  (${enriched} fields applied, ${Math.min((bi + 1) * ENRICH_BATCH, total)}/${total} cities)`);

    saveCheckpoint(byQid, 2, TIERS.length, 0, bi + 1, 0);
    await sleep(DELAY_MS);
  }

  console.log('\nPhase 2 complete.\n');
}

// ── Phase 3 — sister cities ───────────────────────────────────────────────────

async function runPhase3(byQid, startBatch) {
  const qids  = Array.from(byQid.keys());
  const total = qids.length;
  const bTot  = Math.ceil(total / SISTER_BATCH);
  let   links = 0;

  console.log(`Phase 3: sister cities — ${total} cities, resuming from batch ${startBatch + 1}/${bTot}\n`);

  // Save transition checkpoint so a crash here resumes at Phase 3
  if (startBatch === 0) saveCheckpoint(byQid, 3, TIERS.length, 0, 0, 0);

  for (let bi = startBatch; bi < bTot; bi++) {
    const chunk = qids.slice(bi * SISTER_BATCH, (bi + 1) * SISTER_BATCH);
    process.stdout.write(`  batch ${bi + 1}/${bTot} … `);

    let json;
    try {
      json = await sparqlFetch(buildSisterQuery(chunk));
    } catch (e) {
      console.log(`ERROR: ${e.message} — skipping batch`);
      saveCheckpoint(byQid, 3, TIERS.length, 0, 0, bi + 1);
      await sleep(DELAY_MS * 2);
      continue;
    }

    for (const b of json.results.bindings) {
      const qid    = (b.item?.value ?? '').replace('http://www.wikidata.org/entity/', '');
      const sister = b.sisterLabel?.value ?? '';
      if (!sister || /^Q\d+$/.test(sister)) continue;
      const city = byQid.get(qid);
      if (city && !city.sister_cities.includes(sister)) {
        city.sister_cities.push(sister);
        links++;
      }
    }

    console.log(`done  (${Math.min((bi + 1) * SISTER_BATCH, total)}/${total} cities processed)`);
    saveCheckpoint(byQid, 3, TIERS.length, 0, 0, bi + 1);
    await sleep(DELAY_MS);
  }

  console.log(`\n  ${links} sister-city links added\n`);
  console.log('Phase 3 complete.\n');
}

// ── Proximity deduplication ───────────────────────────────────────────────────
// Wikidata often has both a municipality entity (Q515/Q15284) AND a "main
// settlement of X" entity (Q486972) for the same place, at nearly identical
// coordinates but with different QIDs and different population figures.
// This step drops the lower-population duplicate when two cities share the
// same name, same country, and are within 2 km of each other.

function deduplicateByProximity(cities) {
  const toRad = d => d * Math.PI / 180;
  function distKm(a, b) {
    const R = 6371;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  const drop = new Set();
  for (let i = 0; i < cities.length; i++) {
    if (drop.has(cities[i].qid)) continue;
    for (let j = i + 1; j < cities.length; j++) {
      if (drop.has(cities[j].qid)) continue;
      const a = cities[i], b = cities[j];
      if (a.name !== b.name || a.country !== b.country) continue;
      if (a.lat == null || b.lat == null) continue;
      // 2 km for small cities; 10 km for large ones (pop > 500k) where
    // administrative sub-entities (special wards, former city areas) can
    // be several km from the metropolitan centroid
    const threshold = ((a.pop ?? 0) > 500_000 || (b.pop ?? 0) > 500_000) ? 10 : 2;
    if (distKm(a, b) < threshold) {
        drop.add((a.pop ?? 0) >= (b.pop ?? 0) ? b.qid : a.qid);
      }
    }
  }

  if (drop.size) console.log(`  Proximity dedup: removed ${drop.size} near-duplicate settlement entries\n`);
  return cities.filter(c => !drop.has(c.qid));
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function fmt(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(0) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(0)     + 'k';
  return String(n);
}

function pct(n, total) { return total === 0 ? '—' : ((n / total) * 100).toFixed(1) + '%'; }

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   Wikidata City Fetcher — with checkpoint/resume ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`Pop floor : ≥ ${LOWER_BOUND.toLocaleString()}`);
  console.log(`Output    : ${OUT_FILE}`);
  console.log(`Checkpoint: ${CHECKPOINT_FILE}\n`);

  let byQid        = new Map();
  let startPhase   = 1;
  let startTier    = 0;
  let startOffset  = 0;
  let startEnrich  = 0;
  let startSister  = 0;

  const cp = loadCheckpoint();

  if (cp) {
    byQid       = new Map(cp.entries);
    startPhase  = cp.phase;
    startTier   = cp.tierIndex;
    startOffset = cp.tierOffset;
    startEnrich = cp.enrichBatch  ?? 0;
    startSister = cp.sisterBatch  ?? 0;

    console.log(`Resuming from checkpoint saved at ${cp.savedAt}`);
    console.log(`  Cities already fetched : ${byQid.size}`);
    console.log(`  Resuming at            : phase ${startPhase}, tier ${startTier}, offset ${startOffset}, enrich batch ${startEnrich}, sister batch ${startSister}\n`);
  } else {
    console.log('No checkpoint found — starting fresh.\n');
  }

  if (startPhase <= 1) await runPhase1(byQid, startTier, startOffset);
  if (startPhase <= 2) await runPhase2(byQid, startPhase === 2 ? startEnrich : 0);
  if (startPhase <= 3) await runPhase3(byQid, startPhase === 3 ? startSister : 0);

  // Merge with any previously saved output so every run accumulates data.
  // Existing cities are kept; new cities are added; if a QID appears in both,
  // the record with the higher population wins and missing fields are filled in.
  if (fs.existsSync(OUT_FILE)) {
    try {
      const existing = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
      let merged = 0, added = 0;
      for (const prev of existing) {
        if (!prev.qid) continue;
        if (!byQid.has(prev.qid)) {
          byQid.set(prev.qid, prev);   // city not seen this run — keep it
          added++;
        } else {
          // city seen in both — fill any null fields from the older record
          const cur = byQid.get(prev.qid);
          for (const [k, v] of Object.entries(prev)) {
            if (k === 'pop') continue;   // keep higher pop (already in cur from this run)
            if (cur[k] == null && v != null) cur[k] = v;
          }
          merged++;
        }
      }
      console.log(`Merged with existing file: ${added} cities recovered, ${merged} records enriched.\n`);
    } catch {
      console.log('Could not read existing output file — writing fresh.\n');
    }
  }

  // Write final output — keep qid so the UI can link to Wikipedia
  let cities = Array.from(byQid.values())
    .sort((a, b) => (b.pop ?? 0) - (a.pop ?? 0));

  cities = deduplicateByProximity(cities);

  atomicWrite(OUT_FILE, JSON.stringify(cities, null, 2), 'utf8');

  deleteCheckpoint();
  console.log('Checkpoint deleted (clean finish).\n');

  // Summary
  const sizeKB = (fs.statSync(OUT_FILE).size / 1024).toFixed(1);
  const total  = cities.length;

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   Complete                                       ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`  Cities saved : ${total}`);
  console.log(`  File size    : ${sizeKB} KB  (${(sizeKB / 1024).toFixed(1)} MB)`);
  console.log('  ── field coverage ──────────────────────────────');

  const fields = [
    ['desc',         c => c.desc],
    ['country',      c => c.country],
    ['iso',          c => c.iso],
    ['admin',        c => c.admin],
    ['timezone',     c => c.timezone],
    ['area_km2',     c => c.area_km2],
    ['elev_m',       c => c.elev_m],
    ['founded',      c => c.founded],
    ['website',      c => c.website],
    ['geonames_id',  c => c.geonames_id],
    ['sister_cities',c => c.sister_cities.length > 0 ? 1 : null],
  ];

  for (const [label, fn] of fields) {
    const n = cities.filter(c => fn(c) != null).length;
    console.log(`  ${label.padEnd(15)} : ${String(n).padStart(7)}  (${pct(n, total)})`);
  }
  console.log('╚══════════════════════════════════════════════════╝');
}

main().catch(err => {
  console.error('\nFatal:', err.message);
  console.error('Checkpoint preserved — run again to resume.');
  process.exit(1);
});
