/**
 * Fetch active wildfire data from NASA FIRMS (Fire Information for Resource Management System)
 *
 * NASA FIRMS provides near-real-time active fire data from MODIS and VIIRS satellites.
 *
 * API: https://firms.modaps.eosdis.nasa.gov/api/
 * Requires API key (free from NASA Earthdata)
 *
 * Data includes:
 * - Latitude/longitude of fire detections
 * - Brightness temperature (Kelvin)
 * - Confidence (0-100%)
 * - Fire radiative power (MW)
 * - Satellite source (MODIS/VIIRS)
 */

const fs = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');

// Load environment variables from .env
require('dotenv').config();

const API_KEY = process.env.NASA_MAP_KEY;
const OUTPUT = path.join(__dirname, '..', 'public', 'wildfires-live.json');

// FIRMS API endpoints
const FIRMS_BASE = 'https://firms.modaps.eosdis.nasa.gov/api';

/**
 * Fetch active fire data from FIRMS
 *
 * We use:
 * - MODIS_NRT (MODIS Near Real-Time) - 1km resolution, global
 * - VIIRS_NOAA20_NRT (VIIRS NOAA-20 NRT) - 375m resolution, better for small fires
 */
async function fetchFiresData() {
  if (!API_KEY) {
    console.error('[firms] ERROR: NASA_MAP_KEY not found in .env');
    console.error('[firms] Get a free key at: https://firms.modaps.eosdis.nasa.gov/api/map_key');
    process.exit(1);
  }

  console.log('[firms] Fetching active fire data from NASA FIRMS...');

  try {
    // Fetch both MODIS and VIIRS data - max 5 days allowed by FIRMS API
    // API format: /api/area/csv/[MAP_KEY]/[SOURCE]/[AREA]/[DAYS]
    const [modisData, viirsData] = await Promise.all([
      fetchFires('MODIS_NRT', 5),      // MODIS Near Real-Time, 5 days
      fetchFires('VIIRS_NOAA20_NRT', 5), // VIIRS NOAA-20 NRT, 5 days
    ]);

    // Combine and deduplicate (same fire may be detected by both)
    const allFires = deduplicateFires([...modisData, ...viirsData]);

    // Filter for high confidence (>50%) and high FRP (Fire Radiative Power > 10 MW)
    // This filters out small/insignificant fires and keeps only significant ones
    const filteredFires = allFires.filter(f => {
      const highConfidence = f.confidence > 50;
      const highFRP = f.frp > 10; // Only fires with significant radiative power
      return highConfidence && highFRP;
    }).map(f => ({
      ...f,
      parsedDate: new Date(`${f.acq_date}T${f.acq_time.substring(0,2)}:${f.acq_time.substring(2,4)}`)
    }));

    // Sort by date descending (newest first), then by FRP descending
    filteredFires.sort((a, b) => {
      const dateDiff = b.parsedDate - a.parsedDate;
      if (dateDiff !== 0) return dateDiff;
      return b.frp - a.frp;
    });

    console.log(`[firms] Total unique fires: ${allFires.length}`);
    console.log(`[firms] After confidence + FRP filter: ${filteredFires.length}`);

    return {
      fetched_at: new Date().toISOString(),
      source: 'NASA FIRMS',
      total: filteredFires.length,
      fires: filteredFires
    };

  } catch (err) {
    console.error('[firms] Error:', err.message);
    throw err;
  }
}

/**
 * Fetch fires from a specific satellite source
 * FIRMS API format: /api/area/csv/[MAP_KEY]/[SOURCE]/[AREA]/[DAYS]
 */
async function fetchFires(source, days = 1) {
  // Use 'world' for global coverage
  const url = `${FIRMS_BASE}/area/csv/${API_KEY}/${source}/world/${days}`;

  console.log(`[firms] Fetching ${source} last ${days} day(s)...`);

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FIRMS API error: ${res.status} - ${text.substring(0, 200)}`);
  }

  const text = await res.text();

  // Parse CSV response
  const lines = text.trim().split('\n');
  if (lines.length < 2) {
    console.log(`[firms] ${source}: No fire data returned`);
    return [];
  }

  // First line is header
  // latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,confidence,version,bright_t31,frp,daynight

  // Parse data rows
  // New FIRMS CSV format: latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
  const fires = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < 13) continue;

    // Parse confidence - new format uses letters: n=nominal, h=high, l=low
    const confRaw = cols[9];
    let confidence = 0;
    if (confRaw === 'h') confidence = 100;      // high confidence
    else if (confRaw === 'n') confidence = 70;  // nominal (standard)
    else if (confRaw === 'l') confidence = 30;  // low confidence
    else confidence = parseInt(confRaw) || 70;  // fallback

    const fire = {
      lat: parseFloat(cols[0]),
      lng: parseFloat(cols[1]),
      brightness: parseFloat(cols[2]),     // brightness temperature (K)
      scan: parseFloat(cols[3]),           // scan angle
      track: parseFloat(cols[4]),          // track angle
      acq_date: cols[5],                    // acquisition date (YYYY-MM-DD)
      acq_time: cols[6],                    // acquisition time (HHMM)
      satellite: cols[7] || source.toLowerCase(),
      instrument: cols[8] || '',
      confidence: confidence,
      version: cols[10] || '',
      frp: parseFloat(cols[12]) || 0,      // Fire Radiative Power (MW)
      daynight: cols[13] || 'N',            // D=day, N=night
    };

    fires.push(fire);
  }

  console.log(`[firms] ${source}: ${fires.length} fire detections`);
  return fires;
}

/**
 * Deduplicate fires detected by both MODIS and VIIRS
 * If same location within 1km and same date, keep the VIIRS (higher resolution)
 */
function deduplicateFires(fires) {
  const seen = new Map();

  for (const f of fires) {
    // Round to ~1km precision (0.01 degrees ≈ 1km)
    const key = `${f.lat.toFixed(2)}_${f.lng.toFixed(2)}_${f.acq_date}`;

    if (!seen.has(key)) {
      seen.set(key, f);
    } else {
      // Keep the one with higher confidence or VIIRS (better resolution)
      const existing = seen.get(key);
      if (f.satellite.includes('VIIRS') || f.confidence > existing.confidence) {
        seen.set(key, f);
      }
    }
  }

  return Array.from(seen.values());
}

/**
 * Generate summary statistics
 */
function generateStats(data) {
  const byDayNight = { day: 0, night: 0 };
  const confidenceBands = { low: 0, medium: 0, high: 0 };

  for (const f of data.fires) {
    // Count by day/night
    if (f.daynight === 'D') byDayNight.day++;
    else byDayNight.night++;

    // Confidence bands
    if (f.confidence < 40) confidenceBands.low++;
    else if (f.confidence < 70) confidenceBands.medium++;
    else confidenceBands.high++;
  }

  console.log('\n[firms] === Summary ===');
  console.log(`Total fires: ${data.fires.length}`);
  console.log(`Day: ${byDayNight.day} (${Math.round(byDayNight.day / data.fires.length * 100)}%)`);
  console.log(`Night: ${byDayNight.night} (${Math.round(byDayNight.night / data.fires.length * 100)}%)`);
  console.log(`Confidence: Low ${confidenceBands.low}, Medium ${confidenceBands.medium}, High ${confidenceBands.high}`);

  return { byDayNight, confidenceBands };
}

async function main() {
  try {
    const data = await fetchFiresData();
    const stats = generateStats(data);

    // Write full data
    atomicWrite(OUTPUT, JSON.stringify(data, null, 2));
    console.log(`\n[firms] Wrote ${data.fires.length} fires to ${OUTPUT}`);

    // Also write lightweight version for the app
    const lightweight = {
      fetched_at: data.fetched_at,
      source: data.source,
      total: data.fires.length,
      fires: data.fires.map(f => ({
        la: f.lat,
        lo: f.lng,
        b: f.brightness,
        c: f.confidence,
        s: f.satellite.includes('VIIRS') ? 1 : 0,  // 0=modis, 1=viirs
        d: f.daynight === 'D' ? 1 : 0,              // 0=night, 1=day
        date: f.acq_date,                           // Add date for display
      }))
    };

    const lightOutput = path.join(__dirname, '..', 'public', 'wildfires-live-lite.json');
    atomicWrite(lightOutput, JSON.stringify(lightweight));
    console.log(`[firms] Wrote lightweight version to ${lightOutput}`);

  } catch (err) {
    console.error('[firms] Error:', err.message);
    process.exit(1);
  }
}

main();