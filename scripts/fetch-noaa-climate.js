#!/usr/bin/env node
/**
 * fetch-noaa-climate.js
 * Fetches 1991-2020 NOAA climate normals for US cities in census-cities.json
 * that are NOT already covered in climate-extra.json.
 *
 * Uses NOAA CDO API v2 (token required):
 *   Step 1: Find nearest NORMAL_MLY station via bounding-box extent query,
 *           pick closest by haversine distance (ties broken by datacoverage).
 *   Step 2: Fetch monthly normals for that station.
 *
 * NOTE on units=metric: NOAA returns values already converted — temperatures
 * in °C and precipitation in mm (not tenths). No division needed.
 *
 * Output: public/noaa-climate.json — keyed by QID:
 *   { months: [{month, high_c, low_c, precip_mm}×12], source, station,
 *     annual_high_c, annual_low_c, annual_precip_mm }
 *
 * Usage:
 *   node scripts/fetch-noaa-climate.js             (all ~447 cities)
 *   node scripts/fetch-noaa-climate.js --limit 10  (first 10, for testing)
 *
 * Checkpoint: saves every 20 cities to scripts/.noaa-checkpoint.json
 */
'use strict';

const fs   = require('fs');
const path = require('path');

// ── Paths ────────────────────────────────────────────────────────────────────
const CENSUS_PATH        = path.join(__dirname, '../public/census-cities.json');
const CITIES_FULL_PATH   = path.join(__dirname, '../public/cities-full.json');
const CLIMATE_EXTRA_PATH = path.join(__dirname, '../public/climate-extra.json');
const OUTPUT_PATH        = path.join(__dirname, '../public/noaa-climate.json');
const CHECKPOINT_PATH    = path.join(__dirname, '.noaa-checkpoint.json');

// ── Config ───────────────────────────────────────────────────────────────────
const NOAA_TOKEN  = 'SvFntxbbKObrBgjgxnWTBwVnHJjVHQtM';
const API_BASE    = 'https://www.ncei.noaa.gov/cdo-web/api/v2';
const DELAY_MS    = 300;   // 300ms between requests (~3 req/s, within 5/s limit)
const CHECKPOINT_INTERVAL = 20;

const LIMIT_ARG = process.argv.indexOf('--limit');
const LIMIT = LIMIT_ARG >= 0 ? parseInt(process.argv[LIMIT_ARG + 1], 10) : Infinity;

// ── Helpers ──────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Haversine distance in km between two lat/lng points */
function haversine(lat1, lon1, lat2, lon2) {
  const R  = 6371;
  const dL = (lat2 - lat1) * Math.PI / 180;
  const dl = (lon2 - lon1) * Math.PI / 180;
  const a  = Math.sin(dL/2)**2 +
             Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dl/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Bounding box [minLat, minLng, maxLat, maxLng] for a given center + radius (km) */
function bbox(lat, lng, radiusKm) {
  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.cos(lat * Math.PI / 180));
  return [
    +(lat - dLat).toFixed(4),
    +(lng - dLng).toFixed(4),
    +(lat + dLat).toFixed(4),
    +(lng + dLng).toFixed(4),
  ];
}

async function noaaFetch(endpoint, retries = 3) {
  const url = `${API_BASE}${endpoint}`;
  for (let attempt = 1; attempt <= retries; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        headers: { token: NOAA_TOKEN },
        signal: AbortSignal.timeout(25_000),
      });
    } catch (e) {
      if (attempt < retries) {
        process.stdout.write(`[net-err retry ${attempt}] `);
        await sleep(attempt * 3_000);
        continue;
      }
      throw e;
    }
    if (res.status === 429) {
      const wait = attempt * 15_000;
      process.stdout.write(`[429 wait ${wait/1000}s] `);
      await sleep(wait);
      continue;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 120)}`);
    }
    return res.json();
  }
}

/**
 * Find the nearest NORMAL_MLY station for lat/lng using bounding-box search.
 * Tries radiusKm = 50, then 100 if nothing found.
 * Returns {station, distKm} or null.
 */
async function findStation(lat, lng, radiusKm = 50) {
  const [minLat, minLng, maxLat, maxLng] = bbox(lat, lng, radiusKm);
  const params = new URLSearchParams({
    datasetid:  'NORMAL_MLY',
    datatypeid: 'MLY-TMAX-NORMAL',
    extent:     `${minLat},${minLng},${maxLat},${maxLng}`,
    limit:      '25',
    units:      'metric',
  });

  let json;
  try {
    json = await noaaFetch(`/stations?${params}`);
  } catch (e) {
    return null;
  }
  await sleep(DELAY_MS);

  const results = json?.results;
  if (!results?.length) return null;

  // Pick closest station (haversine), break ties by datacoverage
  let best = null, bestDist = Infinity;
  for (const s of results) {
    if (s.latitude == null || s.longitude == null) continue;
    const d = haversine(lat, lng, s.latitude, s.longitude);
    if (d < bestDist || (d === bestDist && (s.datacoverage ?? 0) > (best?.datacoverage ?? 0))) {
      best = s;
      bestDist = d;
    }
  }
  return best ? { station: best, distKm: bestDist } : null;
}

/**
 * Fetch monthly normals for a station. Returns raw NOAA results array or null.
 */
async function fetchMonthlyNormals(stationId) {
  const params = new URLSearchParams({
    datasetid:  'NORMAL_MLY',
    stationid:  stationId,
    startdate:  '2010-01-01',
    enddate:    '2010-12-31',
    datatypeid: 'MLY-TMAX-NORMAL,MLY-TMIN-NORMAL,MLY-PRCP-NORMAL',
    limit:      '40',
    units:      'metric',
  });
  let json;
  try {
    json = await noaaFetch(`/data?${params}`);
  } catch (e) {
    return null;
  }
  await sleep(DELAY_MS);
  return json?.results ?? null;
}

/**
 * Parse NOAA results into the output schema.
 * With units=metric, values are already in °C and mm (no conversion needed).
 * Returns the output record or null if data is incomplete.
 */
function parseNormals(results, stationId) {
  if (!results?.length) return null;

  // Group by month
  const byMonth = {};
  for (const r of results) {
    const month = parseInt(r.date.slice(5, 7), 10); // 1-12
    if (!byMonth[month]) byMonth[month] = {};
    byMonth[month][r.datatype] = r.value;
  }

  const months = [];
  for (let m = 1; m <= 12; m++) {
    const row = byMonth[m];
    if (!row) return null;

    const high_c = row['MLY-TMAX-NORMAL'];
    const low_c  = row['MLY-TMIN-NORMAL'];
    const prcp   = row['MLY-PRCP-NORMAL'];

    // -9999 is NOAA missing-data flag (sometimes also -999 depending on version)
    if (high_c == null || low_c == null) return null;
    if (high_c <= -999 || low_c <= -999) return null;

    months.push({
      month:     m,
      high_c:    +high_c.toFixed(1),
      low_c:     +low_c.toFixed(1),
      precip_mm: (prcp != null && prcp > -999) ? +prcp.toFixed(1) : null,
    });
  }

  if (months.length < 12) return null;

  const annual_high_c    = +(months.reduce((s, m) => s + m.high_c, 0) / 12).toFixed(1);
  const annual_low_c     = +(months.reduce((s, m) => s + m.low_c, 0) / 12).toFixed(1);
  const annual_precip_mm = +months.reduce((s, m) => s + (m.precip_mm ?? 0), 0).toFixed(1);

  return {
    months,
    source:           'NOAA NCEI 1991-2020 Normals',
    station:          stationId,
    annual_high_c,
    annual_low_c,
    annual_precip_mm,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Loading input data...');
  const censusCities = JSON.parse(fs.readFileSync(CENSUS_PATH, 'utf8'));
  const climateExtra = JSON.parse(fs.readFileSync(CLIMATE_EXTRA_PATH, 'utf8'));
  const citiesFull   = JSON.parse(fs.readFileSync(CITIES_FULL_PATH, 'utf8'));

  const ceKeys = new Set(Object.keys(climateExtra));

  // Build lat/lng lookup from cities-full.json
  const latLngByQid = {};
  for (const c of citiesFull) {
    if (c.lat != null && c.lng != null) {
      latLngByQid[c.qid] = { name: c.name, lat: c.lat, lng: c.lng };
    }
  }

  // Working set: census QIDs not in climate-extra with valid coordinates
  const targets = Object.keys(censusCities)
    .filter(qid => !ceKeys.has(qid) && latLngByQid[qid])
    .map(qid => ({
      qid,
      name:      latLngByQid[qid].name,
      lat:       latLngByQid[qid].lat,
      lng:       latLngByQid[qid].lng,
      placeName: censusCities[qid].placeName,
    }));

  const total = Math.min(targets.length, LIMIT);
  console.log(`Target cities (census, not in climate-extra, has lat/lng): ${targets.length}`);
  if (LIMIT < Infinity) console.log(`--limit applied: processing first ${total}`);

  // Load existing output / checkpoint for resume
  let output = {};
  if (fs.existsSync(OUTPUT_PATH)) {
    output = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
    console.log(`Loaded existing output: ${Object.keys(output).length} entries`);
  }
  if (fs.existsSync(CHECKPOINT_PATH)) {
    const cp = JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8'));
    Object.assign(output, cp);
    console.log(`Merged checkpoint: ${Object.keys(output).length} entries total`);
  }

  let done = 0, skipped = 0, noStation = 0, noData = 0, failed = 0;

  for (let i = 0; i < total; i++) {
    const city = targets[i];

    if (output[city.qid]) {
      skipped++;
      continue;
    }

    const label = `[${i+1}/${total}] ${city.name} (${city.qid})`.padEnd(45);
    process.stdout.write(label);

    try {
      // Step 1: Find nearest station (50km, fallback 100km)
      let found = await findStation(city.lat, city.lng, 50);
      if (!found) {
        process.stdout.write(' no station @50km → try 100km... ');
        found = await findStation(city.lat, city.lng, 100);
      }
      if (!found) {
        console.log('NO STATION FOUND');
        noStation++;
        continue;
      }

      const { station, distKm } = found;

      // Step 2: Fetch normals
      const results = await fetchMonthlyNormals(station.id);
      if (!results?.length) {
        console.log(`no data rows for ${station.id}`);
        noData++;
        continue;
      }

      const parsed = parseNormals(results, station.id);
      if (!parsed) {
        console.log(`parse failed: ${station.id} (${results.length} rows)`);
        noData++;
        continue;
      }

      output[city.qid] = parsed;
      done++;
      console.log(
        `OK  hi=${parsed.annual_high_c}°C lo=${parsed.annual_low_c}°C` +
        `  p=${parsed.annual_precip_mm}mm  [${station.id} ${distKm.toFixed(1)}km]`
      );

      // Checkpoint
      if (done % CHECKPOINT_INTERVAL === 0) {
        fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(output));
        console.log(`  [checkpoint: ${Object.keys(output).length} entries saved]`);
      }

    } catch (e) {
      console.log(`FAILED: ${e.message}`);
      failed++;
    }
  }

  // Final save
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  if (fs.existsSync(CHECKPOINT_PATH)) fs.unlinkSync(CHECKPOINT_PATH);

  console.log('\n── Summary ──────────────────────────────────');
  console.log(`Done:        ${done}`);
  console.log(`Skipped:     ${skipped} (already had data, resume)`);
  console.log(`No station:  ${noStation}`);
  console.log(`No/bad data: ${noData}`);
  console.log(`Failed:      ${failed}`);
  console.log(`Total in noaa-climate.json: ${Object.keys(output).length}`);
  console.log(`Output: ${OUTPUT_PATH}`);
}

main().catch(e => { console.error(e); process.exit(1); });
