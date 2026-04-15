// scripts/build-kdb.js
// Consolidates all public/*.json data files into a single kdb.json
// for Firebase RTDB migration. Namespace keys match current filenames.
//
// Usage:
//   node scripts/build-kdb.js              # Build kdb.json (single file)
//   node scripts/build-kdb.js --split      # Also split into Firebase-friendly chunks (<10MB)
//
// GeoJSON / huge geometry files (eez_boundaries, eez_countries, wildfires-live)
// are tagged as "static" in the manifest — keep these in Storage, not RTDB.
// 'use strict';
const fs = require('fs');
const path = require('path');

const PUB = path.join(__dirname, '..', 'public');
const OUT = path.join(PUB, 'kdb.json');

// Explicit list — these are always included even if scanning misses them.
// Lite variants excluded; canonical data is in the full versions.
// Corrupt files (e.g. volcanoes-full.json which is XML) excluded.
const PRIORITY_FILES = [
  // Critical (loaded on init)
  'country-data', 'cities-full', 'companies', 'companies-index', 'companies-detail',
  // Country-keyed
  'oecd-country', 'bea-trade', 'inform_risk', 'comtrade-partners', 'ecb-bonds',
  'boj-yields', 'eci-data', 'migrant-data',
  // City-keyed (QID)
  'power_by_city', 'universities', 'noaa-climate', 'census-business', 'census-cities',
  'airport-connectivity', 'climate-extra', 'who-airquality', 'census-fips', 'fbi-crime',
  'metro-transit', 'nobel-cities', 'gawc-cities', 'zillow-cities', 'eurostat-cities',
  // GeoJSON / geometry (static — too large for RTDB, store in Firebase Storage)
  'world-countries', 'tectonic-plates', 'volcanoes_full',
  'eez_boundaries', 'eez_countries',
  // Admin1 index
  'admin1/_index',
  // Subnational
  'us-states', 'canada-provinces', 'australia-states', 'subnational-hdi',
  'japan-prefectures', 'india-states', 'china-provinces', 'indonesia-provinces',
  'mexico-states', 'germany-states', 'korea-provinces', 'france-regions',
  'italy-regions', 'spain-regions', 'uk-regions', 'eurostat-regions',
  // ECB / central bank
  'ecb-data', 'pboc-data', 'cbrt-data', 'rbi-data',
  // Infrastructure
  'submarine-cables', 'air-routes', 'peeringdb', 'ports', 'vessel-ports',
  // Scientific / environmental
  'weather-stations', 'forest-data', 'carbon-data', 'protected-areas',
  // Events / live (some are static-large)
  'eonet-events', 'power_plants', 'wildfires-live', 'aircraft-live', 'satellites-live', 'ships-live',
  // Research / academic
  'openalex-countries', 'patents', 'uni-rankings', 'startups',
  // Cost of living / tourism
  'cost-of-living', 'tourism', 'metro-ridership',
  // Culture / rankings
  'unesco', 'unesco-ich', 'passport-rank', 'military-strength',
  // Live / real-time data
  'flightaware-flights', 'ocean-currents', 'solar-weather',
  'terrorism-incidents', 'crypto-stats',
  // Misc
  'launch_sites', 'unhcr-refugees', 'cities', 'data-manifest',
];

// Files to skip (corrupt, lite duplicates, or build artifacts)
const SKIP = new Set([
  'kdb', 'volcanoes-full', // corrupt XML
  'aircraft-live-lite', 'crypto-stats-lite', 'eonet-events-lite',
  'flightaware-flights-lite', 'military-strength-lite', 'ocean-currents-lite',
  'passport-rank-lite', 'satellites-live-lite', 'ships-live-lite',
  'solar-weather-lite', 'terrorism-incidents-lite', 'unesco-ich-lite',
  'wildfires-live-lite', 'volcanoes_100', 'app', 'app.js',
  'style', 'index', 'sw', 'manifest', // non-data files
]);

// Files too large for Firebase RTDB (>5MB) — store in Firebase Storage instead
const STATIC_LARGE = new Set([
  'cities-full', 'companies', 'companies-detail', 'companies-index',
  'eez_boundaries', 'eez_countries', 'wildfires-live',
  'world-countries', 'power_plants', 'aircraft-live',
]);

// Collect files
const seen = new Set();
const existing = [];
for (const f of PRIORITY_FILES) {
  if (seen.has(f) || SKIP.has(f)) continue;
  seen.add(f);
  const fp = path.join(PUB, f + '.json');
  if (fs.existsSync(fp)) existing.push(f);
}

const allJson = fs.readdirSync(PUB).filter(f => f.endsWith('.json') && f !== 'kdb.json');
for (const f of allJson) {
  const stem = f.replace(/\.json$/, '');
  if (!seen.has(stem) && !SKIP.has(stem)) {
    existing.push(stem);
    seen.add(stem);
  }
}

// Admin1 per-country files
const admin1Dir = path.join(PUB, 'admin1');
const admin1Files = fs.existsSync(admin1Dir)
  ? fs.readdirSync(admin1Dir).filter(f => f.endsWith('.json'))
  : [];

console.log(`Consolidating ${existing.length} data files + ${admin1Files.length} admin1 files into kdb.json...\n`);

// ── Build kdb.json ────────────────────────────────────────────────────────────
const kdb = {};
let totalBytes = 0;
const sizes = {};
const skipped = [];

for (const stem of existing) {
  const fp = path.join(PUB, stem + '.json');
  try {
    const raw = fs.readFileSync(fp, 'utf8');
    const size = Buffer.byteLength(raw, 'utf8');
    const data = JSON.parse(raw);
    kdb[stem] = data;
    sizes[stem] = size;
    totalBytes += size;
    const count = Array.isArray(data) ? data.length
      : (typeof data === 'object' && data !== null) ? Object.keys(data).length : 1;
    const sizeMB = (size / 1024 / 1024).toFixed(1);
    const tag = STATIC_LARGE.has(stem) ? ' [STATIC]' : '';
    console.log(`  ${stem.padEnd(32)} ${String(count).padStart(6)} entries  ${sizeMB.padStart(7)} MB${tag}`);
  } catch (e) {
    console.warn(`  SKIP ${stem}: ${e.message}`);
    skipped.push(stem);
  }
}

// Admin1 per-country data nested under "admin1" key (not static — each is small)
if (admin1Files.length > 0) {
  kdb.admin1 = {};
  let admin1Bytes = 0;
  for (const f of admin1Files) {
    const code = f.replace('.json', '');
    const fp = path.join(admin1Dir, f);
    try {
      const raw = fs.readFileSync(fp, 'utf8');
      kdb.admin1[code] = JSON.parse(raw);
      admin1Bytes += Buffer.byteLength(raw, 'utf8');
    } catch (e) {
      console.warn(`  SKIP admin1/${code}: ${e.message}`);
    }
  }
  sizes['admin1/*'] = admin1Bytes;
  totalBytes += admin1Bytes;
  console.log(`  ${'admin1/*'.padEnd(32)} ${String(admin1Files.length).padStart(6)} files  ${(admin1Bytes / 1024 / 1024).toFixed(1).padStart(7)} MB`);
}

// Write kdb.json
const out = JSON.stringify(kdb);
fs.writeFileSync(OUT, out, 'utf8');
const outMB = (Buffer.byteLength(out, 'utf8') / 1024 / 1024).toFixed(1);
console.log(`\nDone! kdb.json written: ${outMB} MB`);
console.log(`  ${existing.length} data namespaces + 1 admin1 namespace`);
if (skipped.length) console.log(`  Skipped: ${skipped.join(', ')}`);

// ── Firebase RTDB split mode ──────────────────────────────────────────────────
// Splits kdb.json into <10MB chunks for Firebase RTDB upload.
// Static-large namespaces are excluded from RTDB chunks (serve from Storage).
if (process.argv.includes('--split')) {
  const CHUNK_DIR = path.join(PUB, 'kdb-chunks');
  if (!fs.existsSync(CHUNK_DIR)) fs.mkdirSync(CHUNK_DIR, { recursive: true });
  // Clean up old chunks
  for (const f of fs.readdirSync(CHUNK_DIR)) {
    if (f.endsWith('.json')) fs.unlinkSync(path.join(CHUNK_DIR, f));
  }
  const MAX = 9 * 1024 * 1024; // 9MB with safety margin

  function splitObj(key, obj) {
    const entries = Object.entries(obj);
    const result = [];
    let current = {};
    let currentSize = 0;
    for (const [k, v] of entries) {
      const entryBytes = Buffer.byteLength(JSON.stringify(v), 'utf8') + k.length + 20;
      if (currentSize > 0 && currentSize + entryBytes > MAX) {
        result.push(current);
        current = {};
        currentSize = 0;
      }
      current[k] = v;
      currentSize += entryBytes;
    }
    if (Object.keys(current).length > 0) result.push(current);
    return result;
  }

  const chunks = [];
  let currentChunk = { data: {}, size: 0 };

  function flushChunk() {
    if (Object.keys(currentChunk.data).length > 0) {
      chunks.push(currentChunk);
      currentChunk = { data: {}, size: 0 };
    }
  }

  for (const key of Object.keys(kdb)) {
    if (STATIC_LARGE.has(key)) continue; // skip large static files for RTDB
    const val = kdb[key];
    const valBytes = Buffer.byteLength(JSON.stringify(val), 'utf8');

    // Namespace itself too large — split into sub-chunks
    if (valBytes > MAX) {
      flushChunk();
      if (typeof val === 'object' && !Array.isArray(val) && val !== null && !val.type) {
        // Regular object — split by keys
        const subChunks = splitObj(key, val);
        for (let si = 0; si < subChunks.length; si++) {
          const subKey = `${key}__${si}`;
          const subData = {};
          subData[subKey] = subChunks[si];
          const subBytes = Buffer.byteLength(JSON.stringify(subData), 'utf8');
          chunks.push({ data: subData, size: subBytes });
        }
      } else {
        // Array or GeoJSON — split by slicing
        const arr = Array.isArray(val) ? val : (val.features || [val]);
        const numSlices = Math.ceil(valBytes / (MAX * 0.85));
        const sliceSize = Math.ceil(arr.length / numSlices);
        for (let si = 0; si < numSlices; si++) {
          const slice = arr.slice(si * sliceSize, (si + 1) * sliceSize);
          const subKey = `${key}__${si}`;
          const subData = {};
          subData[subKey] = val.type === 'FeatureCollection'
            ? { type: 'FeatureCollection', features: slice }
            : slice;
          const subBytes = Buffer.byteLength(JSON.stringify(subData), 'utf8');
          if (subBytes > MAX) {
            // Individual slice still too large — just push it anyway (it's a single entry)
            console.warn(`  WARNING: ${subKey} is ${(subBytes / 1024 / 1024).toFixed(1)} MB — exceeds 10MB RTDB limit`);
          }
          chunks.push({ data: subData, size: subBytes });
        }
      }
      continue;
    }

    // Fits in current chunk?
    if (currentChunk.size > 0 && currentChunk.size + valBytes > MAX) {
      flushChunk();
    }
    currentChunk.data[key] = val;
    currentChunk.size += valBytes;
  }
  flushChunk();

  console.log(`\nSplitting RTDB data into ${chunks.length} chunks (< 10MB each):`);
  console.log(`  (Static-large files served from Firebase Storage: ${[...STATIC_LARGE].join(', ')})\n`);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkJson = JSON.stringify(chunk.data);
    const chunkFile = path.join(CHUNK_DIR, `chunk${i}.json`);
    fs.writeFileSync(chunkFile, chunkJson, 'utf8');
    const chunkMB = (Buffer.byteLength(chunkJson, 'utf8') / 1024 / 1024).toFixed(1);
    const keys = Object.keys(chunk.data).join(', ');
    console.log(`  chunk${i}.json: ${chunkMB} MB — ${keys}`);
  }

  // Write manifest
  const manifest = {
    totalChunks: chunks.length,
    staticLarge: [...STATIC_LARGE],
    chunks: chunks.map((c, i) => ({
      file: `chunk${i}.json`,
      namespaces: Object.keys(c.data),
    })),
  };
  fs.writeFileSync(path.join(CHUNK_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  // Write a Firebase Storage upload list
  const storageList = [...STATIC_LARGE].map(s => ({ path: `data/${s}.json`, size: sizes[s] || 0 }));
  fs.writeFileSync(path.join(CHUNK_DIR, 'static-files.json'), JSON.stringify(storageList, null, 2), 'utf8');

  console.log(`\nManifest: kdb-chunks/manifest.json`);
  console.log(`Static file list: kdb-chunks/static-files.json`);
  console.log(`\nUpload RTDB chunks:`);
  for (let i = 0; i < chunks.length; i++) {
    console.log(`  firebase database:set /kdb/chunk${i} kdb-chunks/chunk${i}.json --project YOUR_PROJECT`);
  }
  console.log(`\nUpload static files to Firebase Storage:`);
  for (const s of STATIC_LARGE) {
    console.log(`  firebase storage:upload public/${s}.json data/${s}.json --project YOUR_PROJECT`);
  }
} else {
  console.log(`\nTo split for Firebase RTDB (< 10MB chunks):`);
  console.log(`  node scripts/build-kdb.js --split`);
}