#!/usr/bin/env node
/**
 * scripts/fetch-celestrak.js
 *
 * Fetches TLE (Two-Line Element) data for active satellites from Celestrak
 * and calculates current positions, writing public/satellites-live.json
 *
 * Celestrak API: https://celestrak.org/NORAD/elements/
 * No API key required
 *
 * Uses satellite.js library for TLE parsing and position calculation
 * Install: npm install satellite.js
 *
 * Output structure:
 *   {
 *     fetched_at: ISO timestamp,
 *     source: 'Celestrak',
 *     total: number,
 *     satellites: [
 *       {
 *         name: satellite name,
 *         norad_id: NORAD catalog ID,
 *         lat: latitude (degrees),
 *         lng: longitude (degrees),
 *         altitude_km: altitude above Earth (km),
 *         velocity_kmh: velocity (km/h),
 *         footprint_km: ground footprint diameter (km),
 *         category: satellite category,
 *         last_update: TLE epoch time
 *       }
 *     ]
 *   }
 *
 * Categories:
 *   - GPS Operational
 *   - GLONASS Operational
 *   - Galileo
 *   - BeiDou
 *   - Geostationary
 *   - Iridium
 *   - Starlink
 *   - ISS
 *   - Weather
 *   - Scientific
 *   - Military
 *
 * Usage: node scripts/fetch-celestrak.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

// Try to load satellite.js, provide helpful error if not installed
let satellite;
try {
  satellite = require('satellite.js');
} catch (err) {
  console.error('[celestrak] ERROR: satellite.js not installed');
  console.error('[celestrak] Run: npm install satellite.js');
  process.exit(1);
}

const OUTPUT_PATH = path.join(__dirname, '..', 'public', 'satellites-live.json');

// Celestrak endpoints for different satellite categories
// New URL format: https://celestrak.org/NORAD/elements/gp.php?GROUP={group}&FORMAT=tle
const CELESTRAK_BASE = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=';

const CATEGORIES = [
  { name: 'GPS Operational', group: 'gps-ops' },
  { name: 'GLONASS Operational', group: 'glo-ops' },
  { name: 'Galileo', group: 'galileo' },
  { name: 'BeiDou', group: 'beidou' },
  { name: 'Geostationary', group: 'geo' },
  { name: 'Iridium', group: 'iridium' },
  { name: 'Starlink', group: 'starlink' },
  { name: 'ISS', group: 'stations' },
  { name: 'Weather', group: 'weather' },
  { name: 'Scientific', group: 'science' },
  { name: 'Military', group: 'military' },
  { name: 'Active Satellites', group: 'active' },
];

// Earth constants
const EARTH_RADIUS_KM = 6371;
const EARTH_ROTATION_RAD_PER_SEC = 7.292115146710651e-5;

/**
 * Parse TLE format and extract satellite data
 */
function parseTLE(tleLines) {
  const name = tleLines[0].trim();
  const line1 = tleLines[1].trim();
  const line2 = tleLines[2].trim();

  // Parse TLE line 1
  const noradId = parseInt(line1.substring(2, 7), 10);
  const epochYear = parseInt(line1.substring(18, 20), 10);
  const epochDay = parseFloat(line1.substring(20, 32));

  // Calculate epoch date
  let year = epochYear < 57 ? 2000 + epochYear : 1900 + epochYear;
  const epochDate = new Date(Date.UTC(year, 0, 1));
  epochDate.setUTCDate(epochDate.getUTCDate() + Math.floor(epochDay - 1));
  epochDate.setUTCMilliseconds((epochDay % 1) * 86400000);

  // Parse TLE line 2
  const inclination = parseFloat(line2.substring(8, 16));
  const raan = parseFloat(line2.substring(17, 25));
  const eccentricity = parseFloat('0.' + line2.substring(26, 33));
  const argPerigee = parseFloat(line2.substring(34, 42));
  const meanAnomaly = parseFloat(line2.substring(43, 51));
  const meanMotion = parseFloat(line2.substring(52, 63));
  const revolutionNumber = parseInt(line2.substring(63, 68), 10);

  // Calculate semi-major axis from mean motion (revolutions per day)
  // Using Kepler's third law
  const mu = 398600.4418; // Earth's gravitational parameter (km^3/s^2)
  const meanMotionRadPerSec = (meanMotion * 2 * Math.PI) / 86400;
  const semiMajorAxis = Math.pow(mu / Math.pow(meanMotionRadPerSec, 2), 1/3);
  const altitude = semiMajorAxis - EARTH_RADIUS_KM;

  return {
    name,
    noradId,
    line1,
    line2,
    epochDate,
    inclination,
    raan,
    eccentricity,
    argPerigee,
    meanAnomaly,
    meanMotion,
    revolutionNumber,
    altitude,
  };
}

/**
 * Calculate satellite position from TLE at given time
 */
function calculatePosition(satrec, time) {
  const positionAndVelocity = satellite.propagate(satrec, time);
  const positionEci = positionAndVelocity.position;

  if (!positionEci) {
    return null;
  }

  const gmst = satellite.gstime(time);
  const positionGd = satellite.ecfToGeodetic(
    satellite.eciToEcf(positionEci, gmst),
    EARTH_RADIUS_KM / 6378.137 // Earth flattening factor
  );

  const lat = positionGd.latitude * (180 / Math.PI);
  const lng = positionGd.longitude * (180 / Math.PI);
  const altitude = positionGd.height;

  // Calculate velocity
  const velocityEci = positionAndVelocity.velocity;
  if (velocityEci) {
    const velocityKmh = Math.sqrt(
      velocityEci.x * velocityEci.x +
      velocityEci.y * velocityEci.y +
      velocityEci.z * velocityEci.z
    ) * 3600; // Convert km/s to km/h
    return { lat, lng, altitude, velocityKmh };
  }

  return { lat, lng, altitude, velocityKmh: 0 };
}

/**
 * Calculate ground footprint (area visible from satellite)
 */
function calculateFootprint(altitudeKm) {
  // Simplified footprint calculation
  // Earth central angle visible from satellite
  const earthRadius = EARTH_RADIUS_KM;
  const angle = Math.acos(earthRadius / (earthRadius + altitudeKm));
  const footprintRadius = earthRadius * angle;
  return Math.round(footprintRadius * 2); // Diameter in km
}

async function fetchCelestrakData() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  Celestrak Satellite Tracker                                     ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  console.log('Fetching TLE data from Celestrak...\n');

  const allSatellites = [];
  const byCategory = {};
  let parseErrors = 0;

  // Fetch TLE data for each category
  for (const category of CATEGORIES) {
    const url = `${CELESTRAK_BASE}${category.group}&FORMAT=tle`;
    console.log(`  Fetching ${category.name}...`);

    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'WorldDataMap/1.0 (educational)' },
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        console.warn(`    Skipped (HTTP ${res.status})`);
        continue;
      }

      const text = await res.text();
      // Strip carriage returns (CRLF -> LF) and split
      const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());

      // Parse TLE format - look for line1 (starts with '1 ') followed by line2 (starts with '2 ')
      // Name may be on a separate line before line1, or may be absent
      let i = 0;
      while (i < lines.length - 1) {
        const line1 = lines[i].trim();
        const line2 = lines[i + 1].trim();

        // Check if this is a TLE entry (line1 starts with '1 ', line2 with '2 ')
        if (!line1.startsWith('1 ') || !line2.startsWith('2 ')) {
          i++;
          continue;
        }

        // Extract name from previous line if it exists and doesn't look like TLE data
        let nameLine = `Satellite-${i}`;
        if (i > 0) {
          const prevLine = lines[i - 1].trim();
          // Name line typically doesn't start with a digit
          if (prevLine && !/^[01]\s/.test(prevLine) && prevLine.length > 0 && prevLine.length < 50) {
            nameLine = prevLine;
          }
        }

        try {
          // Create satellite record for propagation
          const satrec = satellite.twoline2satrec(line1, line2);

          // Check if satrec is valid
          if (!satrec || satrec.error) {
            parseErrors++;
            i += 2;
            continue;
          }

          // Extract basic info from TLE lines
          const noradId = parseInt(line1.substring(2, 7), 10);
          const inclination = parseFloat(line2.substring(8, 16));
          const meanMotion = parseFloat(line2.substring(52, 63));

          // Calculate current position
          const now = new Date();
          const positionAndVelocity = satellite.propagate(satrec, now);
          const positionEci = positionAndVelocity.position;

          if (positionEci) {
            // Use eciToGeodetic directly (satellite.js v4+ API)
            const positionGd = satellite.eciToGeodetic(positionEci, now);

            const lat = positionGd.latitude * (180 / Math.PI);
            const lng = positionGd.longitude * (180 / Math.PI);
            const altitude = positionGd.height;

            // Calculate velocity
            const velocityEci = positionAndVelocity.velocity;
            let velocityKmh = 0;
            if (velocityEci) {
              velocityKmh = Math.sqrt(
                velocityEci.x * velocityEci.x +
                velocityEci.y * velocityEci.y +
                velocityEci.z * velocityEci.z
              ) * 3600;
            }

            const footprint = calculateFootprint(altitude);

            allSatellites.push({
              name: nameLine,
              norad_id: noradId,
              category: category.name,
              lat: Math.round(lat * 1000) / 1000,
              lng: Math.round(lng * 1000) / 1000,
              altitude_km: Math.round(altitude),
              velocity_kmh: Math.round(velocityKmh),
              footprint_km: footprint,
              inclination: inclination,
              period_minutes: meanMotion > 0 ? Math.round((1440 / meanMotion) * 10) / 10 : 0,
              tle_epoch: now.toISOString(),
            });

            byCategory[category.name] = (byCategory[category.name] || 0) + 1;
          } else {
            parseErrors++;
          }
        } catch (err) {
          parseErrors++;
          // Skip invalid TLE entries
        }

        // Skip the two TLE lines we just processed
        i += 2;
      }

      console.log(`    Found: ${byCategory[category.name] || 0}`);

    } catch (err) {
      console.warn(`    Error: ${err.message}`);
    }
  }

  console.log(`\n  Total satellites parsed: ${allSatellites.length}`);
  console.log(`  Parse errors (skipped): ${parseErrors}`);

  // Stats by category
  console.log('\n── Satellites by category ────────────────────────────────────────');
  const sortedCategories = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1]);
  for (const [cat, count] of sortedCategories) {
    console.log(`  ${cat.padEnd(25)} ${count}`);
  }

  // Altitude distribution
  const altitudes = allSatellites.map(s => s.altitude_km);
  const avgAlt = altitudes.length > 0
    ? Math.round(altitudes.reduce((a, b) => a + b, 0) / altitudes.length)
    : 0;
  const maxAlt = altitudes.length > 0 ? Math.max(...altitudes) : 0;
  const minAlt = altitudes.length > 0 ? Math.min(...altitudes) : 0;

  console.log('\n── Altitude Summary ──────────────────────────────────────────────');
  console.log(`  Average: ${avgAlt} km`);
  console.log(`  Range: ${minAlt} km to ${maxAlt} km`);

  // Orbit type classification
  const leo = allSatellites.filter(s => s.altitude_km < 2000).length;
  const meo = allSatellites.filter(s => s.altitude_km >= 2000 && s.altitude_km < 35786).length;
  const geo = allSatellites.filter(s => s.altitude_km >= 35500 && s.altitude_km <= 36000).length;
  const heo = allSatellites.filter(s => s.altitude_km > 36000).length;

  console.log('\n── Orbit Classification ──────────────────────────────────────────');
  console.log(`  LEO (< 2000 km): ${leo}`);
  console.log(`  MEO (2000-35786 km): ${meo}`);
  console.log(`  GEO (~35786 km): ${geo}`);
  console.log(`  HEO (> 36000 km): ${heo}`);

  // Write output
  const output = {
    fetched_at: new Date().toISOString(),
    source: 'Celestrak',
    total: allSatellites.length,
    byCategory,
    orbitDistribution: { leo, meo, geo, heo },
    altitudeSummary: { avg: avgAlt, min: minAlt, max: maxAlt },
    satellites: allSatellites.sort((a, b) => a.name.localeCompare(b.name)),
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\n✓ Written ${allSatellites.length} satellites to ${OUTPUT_PATH}`);

  // Also write lightweight version for map display
  const lightOutput = path.join(__dirname, '..', 'public', 'satellites-live-lite.json');
  const lightweight = {
    fetched_at: output.fetched_at,
    source: output.source,
    total: output.total,
    satellites: allSatellites.map(s => ({
      n: s.name.substring(0, 30),
      i: s.norat_id,
      c: s.category,
      la: s.lat,
      lo: s.lng,
      a: s.altitude_km,
      v: s.velocity_kmh,
      f: s.footprint_km,
    })),
  };

  fs.writeFileSync(lightOutput, JSON.stringify(lightweight));
  console.log(`✓ Written lightweight version to ${lightOutput}`);

  console.log('\n[celestrak] Complete!');
}

async function main() {
  try {
    await fetchCelestrakData();
  } catch (err) {
    console.error('[celestrak] Failed:', err.message);
    process.exit(1);
  }
}

main();
