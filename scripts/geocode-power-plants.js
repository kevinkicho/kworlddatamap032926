#!/usr/bin/env node
/**
 * scripts/geocode-power-plants.js
 *
 * Geocodes all power plants from global_power_plant_database.csv to city QIDs.
 *
 * Process:
 *   1. Extract unique QIDs from existing power_by_city.json
 *   2. Fetch coordinates for those QIDs from Wikidata (batched SPARQL)
 *   3. Also use cities.json (600 cities, no QIDs) for broader coverage
 *   4. For each plant in the CSV, find the nearest city via haversine distance
 *   5. Generate a comprehensive power_by_city.json and a QID-augmented CSV
 *
 * Output:
 *   public/power_by_city.json     — aggregated by city QID (replaces existing)
 *   public/power_plants_geocoded.csv — original CSV with city_qid, city_name, city_dist_km added
 *   public/power_city_coords.json — city coordinate lookup (cache)
 *
 * Usage: node scripts/geocode-power-plants.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, '..', 'public', 'global_power_plant_database.csv');
const CITIES_PATH = path.join(__dirname, '..', 'public', 'cities.json');
const EXISTING_POWER_PATH = path.join(__dirname, '..', 'public', 'power_by_city.json');
const COORDS_CACHE_PATH = path.join(__dirname, '..', 'public', 'power_city_coords.json');
const OUT_POWER_PATH = path.join(__dirname, '..', 'public', 'power_by_city.json');
const OUT_CSV_PATH = path.join(__dirname, '..', 'public', 'power_plants_geocoded.csv');

const MAX_CITY_DIST_KM = 150; // don't assign plant if nearest city is farther than this
const BATCH_SIZE = 50;        // QIDs per wbgetentities API call (max 50)

// ── Haversine distance in km ──────────────────────────────────────────────────
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
    * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Parse CSV (handles quoted fields with commas) ─────────────────────────────
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { row.push(field.trim()); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (field || row.length) {
          row.push(field.trim());
          if (row.length > 1 || row[0] !== '') rows.push(row);
        }
        row = []; field = '';
        if (ch === '\r' && text[i + 1] === '\n') i++;
      } else field += ch;
    }
  }
  if (field || row.length) { row.push(field.trim()); if (row.length > 1 || row[0] !== '') rows.push(row); }
  return rows;
}

// ── Fetch Wikidata coordinates for a batch of QIDs ────────────────────────────
async function fetchWikidataCoords(qids) {
  const idsParam = qids.join('|');
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(idsParam)}&props=labels|claims&format=json&languages=en`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'WorldDataMap/1.0 (educational)' },
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('retry-after') || '5');
      console.log(`\n    Rate limited, waiting ${retryAfter}s...`);
      await sleep(retryAfter * 1000);
      continue;
    }
    if (!res.ok) throw new Error(`wbgetentities HTTP ${res.status}`);
    const data = await res.json();
    const results = {};
    if (!data.entities) return results;
    for (const [qid, entity] of Object.entries(data.entities)) {
      if (entity.missing) continue;
      const lat = entity.claims?.P625?.[0]?.mainsnak?.datavalue?.value?.latitude;
      const lng = entity.claims?.P625?.[0]?.mainsnak?.datavalue?.value?.longitude;
      const label = entity.labels?.en?.value || null;
      if (typeof lat === 'number' && typeof lng === 'number') {
        results[qid] = { name: label, lat, lng };
      }
    }
    return results;
  }
  throw new Error('Rate limited after retries');
}

// ── Sleep helper ──────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Power Plant Geocoding Pipeline                              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // ── Step 1: Build city coordinate lookup ───────────────────────────────────
  console.log('── Step 1: Building city coordinate lookup ──');

  const cityLookup = []; // [{qid, name, lat, lng, source}]

  // 1a. Load existing power_by_city.json QIDs
  let existingQids = [];
  if (fs.existsSync(EXISTING_POWER_PATH)) {
    const existing = JSON.parse(fs.readFileSync(EXISTING_POWER_PATH, 'utf8'));
    existingQids = Object.keys(existing);
    console.log(`  Existing power_by_city.json: ${existingQids.length} city QIDs`);
  }

  // 1b. Load cities.json (600 cities)
  let cityJsonCities = [];
  if (fs.existsSync(CITIES_PATH)) {
    cityJsonCities = JSON.parse(fs.readFileSync(CITIES_PATH, 'utf8'));
    console.log(`  cities.json: ${cityJsonCities.length} cities`);
    for (const c of cityJsonCities) {
      cityLookup.push({ qid: null, name: c.name, lat: c.lat, lng: c.lng, source: 'cities.json' });
    }
  }

  // 1c. Check for cached Wikidata coordinates
  let wdCoords = {};
  if (fs.existsSync(COORDS_CACHE_PATH)) {
    wdCoords = JSON.parse(fs.readFileSync(COORDS_CACHE_PATH, 'utf8'));
    console.log(`  Cached Wikidata coords: ${Object.keys(wdCoords).length} QIDs`);
  }

  // 1d. Fetch missing QID coordinates from Wikidata
  const missingQids = existingQids.filter(q => !wdCoords[q]);
  if (missingQids.length > 0) {
    console.log(`  Fetching coordinates for ${missingQids.length} missing QIDs from Wikidata...`);
    let fetched = 0;
    for (let i = 0; i < missingQids.length; i += BATCH_SIZE) {
      const batch = missingQids.slice(i, i + BATCH_SIZE);
      try {
        const batchResults = await fetchWikidataCoords(batch);
        Object.assign(wdCoords, batchResults);
        fetched += Object.keys(batchResults).length;
        process.stdout.write(`\r    Batch ${Math.floor(i / BATCH_SIZE) + 1}: got ${Object.keys(batchResults).length} coords (${fetched}/${missingQids.length} total)`);
      } catch (e) {
        console.log(`\n    Batch ${Math.floor(i / BATCH_SIZE) + 1} failed: ${e.message}`);
      }
      await sleep(3000); // rate limit (Wikidata allows ~1 req/s)
    }
    console.log('');
    // Save cache
    fs.writeFileSync(COORDS_CACHE_PATH, JSON.stringify(wdCoords, null, 2));
    console.log(`  Cached ${Object.keys(wdCoords).length} Wikidata coordinates`);
  }

  // 1e. Add Wikidata cities to lookup (avoiding duplicates with cities.json)
  const citiesJsonNames = new Set(cityJsonCities.map(c => c.name.toLowerCase()));
  for (const [qid, info] of Object.entries(wdCoords)) {
    // Skip if name already exists in cities.json (avoid duplicate entries for same city)
    if (info.name && citiesJsonNames.has(info.name.toLowerCase())) continue;
    // Remove the cities.json entry if it has no QID - prefer the Wikidata one
    const existingIdx = cityLookup.findIndex(c => c.qid === null && c.name.toLowerCase() === (info.name || '').toLowerCase());
    if (existingIdx >= 0) {
      cityLookup[existingIdx] = { qid, name: info.name, lat: info.lat, lng: info.lng, source: 'wikidata' };
    } else {
      cityLookup.push({ qid, name: info.name, lat: info.lat, lng: info.lng, source: 'wikidata' });
    }
  }
  console.log(`  Total city lookup entries: ${cityLookup.length} (${cityLookup.filter(c=>c.qid).length} with QID)\n`);

  // ── Step 2: Parse CSV and geocode each plant ───────────────────────────────
  console.log('── Step 2: Parsing CSV and geocoding plants ──');

  const csvText = fs.readFileSync(CSV_PATH, 'utf8');
  const rows = parseCSV(csvText);
  if (rows.length < 2) throw new Error('CSV appears empty or malformed');

  const headers = rows[0];
  console.log(`  CSV headers (${headers.length}): ${headers.join(', ')}`);
  console.log(`  Data rows: ${rows.length - 1}`);

  let geocoded = 0;
  let skipped = 0;
  const perCity = {}; // { qid_or_name: { qid, name, plants: [...] } }

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 6) continue;

    const plant = {};
    for (let j = 0; j < headers.length; j++) {
      plant[headers[j]] = row[j] || null;
    }

    const lat = parseFloat(plant.latitude);
    const lng = parseFloat(plant.longitude);
    if (isNaN(lat) || isNaN(lng)) {
      skipped++;
      continue;
    }

    // Find nearest city
    let nearest = null;
    let nearestDist = Infinity;
    for (const city of cityLookup) {
      const d = haversineKm(lat, lng, city.lat, city.lng);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = city;
      }
    }

    if (!nearest || nearestDist > MAX_CITY_DIST_KM) {
      skipped++;
      continue;
    }

    const key = nearest.qid || nearest.name || `coord_${nearest.lat}_${nearest.lng}`;
    plant.city_qid = nearest.qid || null;
    plant.city_name = nearest.name || null;
    plant.city_dist_km = Math.round(nearestDist * 10) / 10;

    if (!perCity[key]) {
      perCity[key] = { qid: nearest.qid, city_name: nearest.name, plants: [] };
    }
    perCity[key].plants.push(plant);
    geocoded++;
  }

  console.log(`  Geocoded: ${geocoded} plants → ${Object.keys(perCity).length} cities`);
  console.log(`  Skipped (too far or bad coords): ${skipped}\n`);

  // ── Step 3: Build power_by_city.json (comprehensive) ────────────────────────
  console.log('── Step 3: Building power_by_city.json ──');

  const powerByCity = {};
  for (const [key, cityData] of Object.entries(perCity)) {
    const plants = cityData.plants;
    const totalCap = plants.reduce((s, p) => s + (parseFloat(p.capacity_mw) || 0), 0);

    // Determine primary fuel (most common or largest capacity)
    const fuelCounts = {};
    for (const p of plants) {
      const f = p.primary_fuel || 'Unknown';
      fuelCounts[f] = (fuelCounts[f] || 0) + (parseFloat(p.capacity_mw) || 0);
    }
    let primaryFuel = 'Unknown';
    let maxCap = 0;
    for (const [fuel, cap] of Object.entries(fuelCounts)) {
      if (cap > maxCap) { maxCap = cap; primaryFuel = fuel; }
    }

    const qidKey = cityData.qid || key;
    powerByCity[qidKey] = {
      city_name: cityData.city_name,
      qid: cityData.qid,
      count: plants.length,
      total_capacity_mw: Math.round(totalCap * 10) / 10,
      primary_fuel: primaryFuel,
      fuel_breakdown: fuelCounts,
      plants: plants.map(p => ({
        name: p.name || null,
        gppd_idnr: p.gppd_idnr || null,
        capacity_mw: parseFloat(p.capacity_mw) || null,
        primary_fuel: p.primary_fuel || null,
        other_fuel1: p.other_fuel1 || null,
        other_fuel2: p.other_fuel2 || null,
        other_fuel3: p.other_fuel3 || null,
        commissioning_year: p.commissioning_year ? parseInt(p.commissioning_year) || null : null,
        owner: p.owner || null,
        source: p.source || null,
        url: p.url || null,
        geolocation_source: p.geolocation_source || null,
        wepp_id: p.wepp_id || null,
        year_of_capacity_data: p.year_of_capacity_data ? parseInt(p.year_of_capacity_data) || null : null,
        dist_km: p.city_dist_km,
        country: p.country || null,
        country_long: p.country_long || null,
        generation_gwh: {
          2013: parseFloat(p.generation_gwh_2013) || null,
          2014: parseFloat(p.generation_gwh_2014) || null,
          2015: parseFloat(p.generation_gwh_2015) || null,
          2016: parseFloat(p.generation_gwh_2016) || null,
          2017: parseFloat(p.generation_gwh_2017) || null,
          2018: parseFloat(p.generation_gwh_2018) || null,
          2019: parseFloat(p.generation_gwh_2019) || null,
        },
        estimated_generation_gwh: {
          2013: parseFloat(p.estimated_generation_gwh_2013) || null,
          2014: parseFloat(p.estimated_generation_gwh_2014) || null,
          2015: parseFloat(p.estimated_generation_gwh_2015) || null,
          2016: parseFloat(p.estimated_generation_gwh_2016) || null,
          2017: parseFloat(p.estimated_generation_gwh_2017) || null,
        },
        estimated_generation_note: {
          2013: p.estimated_generation_note_2013 || null,
          2014: p.estimated_generation_note_2014 || null,
          2015: p.estimated_generation_note_2015 || null,
          2016: p.estimated_generation_note_2016 || null,
          2017: p.estimated_generation_note_2017 || null,
        },
        generation_data_source: p.generation_data_source || null,
      })),
    };
  }

  fs.writeFileSync(OUT_POWER_PATH, JSON.stringify(powerByCity, null, 2));
  const outSize = (fs.statSync(OUT_POWER_PATH).size / 1024).toFixed(0);
  console.log(`  Written: ${OUT_POWER_PATH} (${outSize} KB)`);
  console.log(`  Cities with plants: ${Object.keys(powerByCity).length}`);
  console.log(`  Total plants mapped: ${Object.values(powerByCity).reduce((s, c) => s + c.count, 0)}\n`);

  // ── Step 4: Write geocoded CSV ─────────────────────────────────────────────
  console.log('── Step 4: Writing geocoded CSV ──');

  const newHeaders = [...headers, 'city_qid', 'city_name', 'city_dist_km'];
  const csvLines = [newHeaders.join(',')];
  for (const cityData of Object.values(perCity)) {
    for (const plant of cityData.plants) {
      const vals = newHeaders.map(h => {
        const v = plant[h];
        if (v == null) return '';
        if (typeof v === 'string' && (v.includes(',') || v.includes('"'))) return `"${v.replace(/"/g, '""')}"`;
        return String(v);
      });
      csvLines.push(vals.join(','));
    }
  }
  fs.writeFileSync(OUT_CSV_PATH, csvLines.join('\n'));
  console.log(`  Written: ${OUT_CSV_PATH} (${csvLines.length - 1} rows)\n`);

  // ── Step 5: Summary ────────────────────────────────────────────────────────
  console.log('── Summary ──');
  const citiesWithQid = Object.values(powerByCity).filter(c => c.qid).length;
  const citiesWithoutQid = Object.values(powerByCity).filter(c => !c.qid).length;
  console.log(`  Cities with QID: ${citiesWithQid}`);
  console.log(`  Cities without QID (using name key): ${citiesWithoutQid}`);
  console.log(`  Total plants geocoded: ${geocoded}`);
  console.log('  ✓ Done');
}

main().catch(e => { console.error(e); process.exit(1); });
