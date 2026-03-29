#!/usr/bin/env node
/**
 * scripts/fetch-cities.js
 *
 * Downloads every city from Wikidata with population >= LOWER_BOUND.
 * Cities with no population data, or population below the floor, are skipped.
 *
 * CHECKPOINT / RESUME
 *   Progress is saved to scripts/.checkpoint.json after every page.
 *   If the script is interrupted (power cut, Ctrl-C, crash, lost connection)
 *   just run it again — it will pick up from the last completed page.
 *   The checkpoint is deleted automatically when the run finishes cleanly.
 *
 * Two phases:
 *   Phase 1 — Core data, paginated by population tier
 *   Phase 2 — Sister cities, fetched in QID batches and merged in
 *
 * Output: public/cities-full.json
 *
 * Usage:
 *   node scripts/fetch-cities.js          ← resumes if checkpoint exists
 *   node scripts/fetch-cities.js --fresh  ← ignores checkpoint, starts over
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Configuration ─────────────────────────────────────────────────────────────

const LOWER_BOUND      = 10_000; // skip cities with population below this
const CORE_BATCH       = 100;    // rows per SPARQL request (kept small to avoid 60s timeout)
const SISTER_BATCH     = 150;    // QIDs per sister-city request
const DELAY_MS         = 2_500;  // pause between every request
const OUT_FILE         = path.join(__dirname, '..', 'public', 'cities-full.json');
const CHECKPOINT_FILE  = path.join(__dirname, '.checkpoint.json');

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

/**
 * Saves current progress to disk.
 * Called after every completed page so even a single-page run is resumable.
 *
 * Stored fields:
 *   phase          — 1 (core) or 2 (sisters)
 *   tierIndex      — which TIERS entry we are on
 *   tierOffset     — SPARQL OFFSET within the current tier
 *   sisterBatch    — how many sister-city batches are done
 *   entries        — the full Map serialised as [qid, record] pairs
 */
function saveCheckpoint(byQid, phase, tierIndex, tierOffset, sisterBatch) {
  const data = {
    version:     2,
    phase,
    tierIndex,
    tierOffset,
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
    if (data.version !== 2) return null;      // incompatible format — start fresh
    return data;
  } catch {
    return null;
  }
}

function deleteCheckpoint() {
  if (fs.existsSync(CHECKPOINT_FILE)) fs.unlinkSync(CHECKPOINT_FILE);
}

// ── SPARQL query builders ─────────────────────────────────────────────────────

function buildPopQuery(min, max, offset) {
  const maxClause = isFinite(max) ? `&& ?pop < ${max}` : '';
  return `
SELECT DISTINCT ?item ?itemLabel ?pop ?lat ?lon
  ?countryLabel ?iso
  ?adminLabel ?timezoneLabel
  ?area ?water ?elev
  ?founded ?website ?geonames ?demonym
  ?gdp ?gdpPerCap ?hdi ?popF ?popM ?popUrban
WHERE {
  ?item wdt:P1082 ?pop ;
        wdt:P625  ?coord .
  FILTER(?pop >= ${min} ${maxClause})
  FILTER NOT EXISTS { ?item wdt:P31 wd:Q6256     }
  FILTER NOT EXISTS { ?item wdt:P31 wd:Q3624078  }
  FILTER NOT EXISTS { ?item wdt:P31 wd:Q10864048 }
  OPTIONAL { ?item wdt:P17   ?country . OPTIONAL { ?country wdt:P297 ?iso . } }
  OPTIONAL { ?item wdt:P131  ?admin    . }
  OPTIONAL { ?item wdt:P421  ?timezone . }
  OPTIONAL { ?item wdt:P2046 ?area     . }
  OPTIONAL { ?item wdt:P2927 ?water    . }
  OPTIONAL { ?item wdt:P2044 ?elev     . }
  OPTIONAL { ?item wdt:P571  ?founded  . }
  OPTIONAL { ?item wdt:P856  ?website  . }
  OPTIONAL { ?item wdt:P1566 ?geonames . }
  OPTIONAL { ?item wdt:P1549 ?demonym  . FILTER(LANG(?demonym) = "en") }
  OPTIONAL { ?item wdt:P2131 ?gdp      . }
  OPTIONAL { ?item wdt:P2132 ?gdpPerCap . }
  OPTIONAL { ?item wdt:P1081 ?hdi      . }
  OPTIONAL { ?item wdt:P1539 ?popF     . }
  OPTIONAL { ?item wdt:P1540 ?popM     . }
  OPTIONAL { ?item wdt:P3245 ?popUrban . }
  BIND(geof:latitude(?coord)  AS ?lat)
  BIND(geof:longitude(?coord) AS ?lon)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
}
ORDER BY DESC(?pop) ?item
LIMIT  ${CORE_BATCH}
OFFSET ${offset}
`.trim();
}

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

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'WorldDataMap-CityFetcher/1.0 (educational; nodejs)',
      'Accept':     'application/sparql-results+json',
    },
    signal: AbortSignal.timeout(58_000),
  });

  if ((res.status === 429 || res.status === 503) && attempt <= 3) {
    const wait = DELAY_MS * attempt * 4;
    process.stdout.write(`(HTTP ${res.status} — retry in ${wait / 1000}s) `);
    await sleep(wait);
    return sparqlFetch(query, attempt + 1);
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

function parseBindings(bindings) {
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
      lat:         round(lat, 4),
      lng:         round(lng, 4),
      pop:         toInt(b.pop?.value),
      country:     b.countryLabel?.value  ?? null,
      iso:         b.iso?.value           ?? null,
      admin:       b.adminLabel?.value    ?? null,
      timezone:    b.timezoneLabel?.value ?? null,
      area_km2:    round(toFloat(b.area?.value),  1),
      water_km2:   round(toFloat(b.water?.value), 1),
      elev_m:      toInt(b.elev?.value),
      founded:     toYear(b.founded?.value),
      website:     b.website?.value       ?? null,
      geonames_id: b.geonames?.value      ?? null,
      demonym:     b.demonym?.value        ?? null,
      gdp:         toFloat(b.gdp?.value),
      gdp_per_cap: toFloat(b.gdpPerCap?.value),
      hdi:         round(toFloat(b.hdi?.value), 3),
      pop_male:    toInt(b.popM?.value),
      pop_female:  toInt(b.popF?.value),
      pop_urban:   toInt(b.popUrban?.value),
      sister_cities: [],
    });
  }
  return { records, skipped };
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

// ── Phase 1 — core data ───────────────────────────────────────────────────────

async function runPhase1(byQid, startTierIndex, startOffset) {
  console.log(`Phase 1: core data — resuming from tier ${startTierIndex}, offset ${startOffset}\n`);

  for (let ti = startTierIndex; ti < TIERS.length; ti++) {
    const { min, max } = TIERS[ti];
    const label  = isFinite(max) ? `${fmt(min)}–${fmt(max)}` : `≥${fmt(min)}`;
    let   offset = (ti === startTierIndex) ? startOffset : 0;
    let   page   = Math.floor(offset / CORE_BATCH) + 1;
    let   tierNew = 0;

    while (true) {
      process.stdout.write(`  [${label}] p${page} offset=${offset} … `);
      let json;
      try {
        json = await sparqlFetch(buildPopQuery(min, max, offset));
      } catch (e) {
        console.log(`ERROR: ${e.message} — skipping rest of tier`);
        break;
      }

      const { records, skipped } = parseBindings(json.results.bindings);
      for (const r of records) mergeInto(byQid, r);
      tierNew += records.length;
      console.log(`${records.length} records (+${skipped} unlabeled) [total: ${byQid.size}]`);

      // Save checkpoint after every page
      saveCheckpoint(byQid, 1, ti, offset + CORE_BATCH, 0);

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

// ── Phase 2 — sister cities ───────────────────────────────────────────────────

async function runPhase2(byQid, startBatch) {
  const qids  = Array.from(byQid.keys());
  const total = qids.length;
  const bTot  = Math.ceil(total / SISTER_BATCH);
  let   links = 0;

  console.log(`Phase 2: sister cities — ${total} cities, resuming from batch ${startBatch + 1}/${bTot}\n`);

  for (let bi = startBatch; bi < bTot; bi++) {
    const i     = bi * SISTER_BATCH;
    const chunk = qids.slice(i, i + SISTER_BATCH);
    process.stdout.write(`  batch ${bi + 1}/${bTot} … `);

    let json;
    try {
      json = await sparqlFetch(buildSisterQuery(chunk));
    } catch (e) {
      console.log(`ERROR: ${e.message} — skipping batch`);
      await sleep(DELAY_MS * 2);
      // Still save checkpoint so we skip this batch on resume, not redo it
      saveCheckpoint(byQid, 2, TIERS.length, 0, bi + 1);
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

    console.log(`done  (${Math.min(i + SISTER_BATCH, total)}/${total} cities processed)`);

    // Save checkpoint after every batch
    saveCheckpoint(byQid, 2, TIERS.length, 0, bi + 1);
    await sleep(DELAY_MS);
  }

  console.log(`\n  ${links} sister-city links added\n`);
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function fmt(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(0) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(0)     + 'k';
  return String(n);
}

function pct(n, total) { return ((n / total) * 100).toFixed(1) + '%'; }

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const forceFresh = process.argv.includes('--fresh');

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   Wikidata City Fetcher — with checkpoint/resume ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`Pop floor : ≥ ${LOWER_BOUND.toLocaleString()}`);
  console.log(`Output    : ${OUT_FILE}`);
  console.log(`Checkpoint: ${CHECKPOINT_FILE}\n`);

  // ── Load or initialise state ──────────────────────────────────────────────
  let byQid        = new Map();
  let startPhase   = 1;
  let startTier    = 0;
  let startOffset  = 0;
  let startSister  = 0;

  const cp = forceFresh ? null : loadCheckpoint();

  if (cp) {
    // Restore the saved Map from the [qid, record] pairs array
    byQid = new Map(cp.entries);
    // Sister_cities arrays are plain arrays in JSON — Map restore keeps them
    startPhase  = cp.phase;
    startTier   = cp.tierIndex;
    startOffset = cp.tierOffset;
    startSister = cp.sisterBatch;

    console.log(`Resuming from checkpoint saved at ${cp.savedAt}`);
    console.log(`  Cities already fetched : ${byQid.size}`);
    console.log(`  Resuming at            : phase ${startPhase}, tier ${startTier}, offset ${startOffset}, sister batch ${startSister}\n`);
  } else {
    if (forceFresh) {
      console.log('--fresh flag set — ignoring any existing checkpoint.\n');
      deleteCheckpoint();
    } else {
      console.log('No checkpoint found — starting fresh.\n');
    }
  }

  // ── Run phases ────────────────────────────────────────────────────────────
  if (startPhase <= 1) {
    await runPhase1(byQid, startTier, startOffset);
  }

  await runPhase2(byQid, startSister);

  // ── Write final output ────────────────────────────────────────────────────
  const cities = Array.from(byQid.values())
    .sort((a, b) => (b.pop ?? 0) - (a.pop ?? 0))
    .map(({ qid, ...rest }) => rest);

  fs.writeFileSync(OUT_FILE, JSON.stringify(cities, null, 2), 'utf8');

  // Delete checkpoint — clean finish
  deleteCheckpoint();
  console.log('Checkpoint deleted (clean finish).\n');

  // ── Summary ───────────────────────────────────────────────────────────────
  const sizeKB = (fs.statSync(OUT_FILE).size / 1024).toFixed(1);
  const total  = cities.length;

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   Complete                                       ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`  Cities saved : ${total}`);
  console.log(`  File size    : ${sizeKB} KB  (${(sizeKB / 1024).toFixed(1)} MB)`);
  console.log('  ── field coverage ──────────────────────────────');

  const fields = [
    ['country',      c => c.country],
    ['iso',          c => c.iso],
    ['admin',        c => c.admin],
    ['timezone',     c => c.timezone],
    ['area_km2',     c => c.area_km2],
    ['water_km2',    c => c.water_km2],
    ['elev_m',       c => c.elev_m],
    ['founded',      c => c.founded],
    ['website',      c => c.website],
    ['geonames_id',  c => c.geonames_id],
    ['demonym',      c => c.demonym],
    ['gdp',          c => c.gdp],
    ['gdp_per_cap',  c => c.gdp_per_cap],
    ['hdi',          c => c.hdi],
    ['pop_male',     c => c.pop_male],
    ['pop_female',   c => c.pop_female],
    ['pop_urban',    c => c.pop_urban],
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
