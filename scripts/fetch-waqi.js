#!/usr/bin/env node
/**
 * scripts/fetch-waqi.js
 *
 * Fetches live air quality data from WAQI (World Air Quality Index) API
 * and writes public/waqi-cities.json and public/waqi-cities-lite.json
 *
 * WAQI API: https://api.waqi.info/
 * Requires free API token from https://aqicn.org/data-platform/token/
 *
 * Output structure:
 *   {
 *     fetched_at: ISO timestamp,
 *     source: 'WAQI',
 *     total: number,
 *     stations: [
 *       {
 *         idx: station ID,
 *         name: station name,
 *         city: city name,
 *         country: country code,
 *         lat, lng: coordinates,
 *         aqi: AQI value (0-500),
 *         category: 'Good' | 'Moderate' | 'Unhealthy' | etc,
 *         dominant_pollutant: 'pm25' | 'pm10' | 'o3' | etc,
 *         last_update: ISO timestamp
 *       }
 *     ]
 *   }
 *
 * AQI Categories:
 *   0-50: Good (Green)
 *   51-100: Moderate (Yellow)
 *   101-150: Unhealthy for Sensitive Groups (Orange)
 *   151-200: Unhealthy (Red)
 *   201-300: Very Unhealthy (Purple)
 *   301-500: Hazardous (Maroon)
 *
 * Usage: node scripts/fetch-waqi.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

const WAQI_TOKEN = process.env.WAQI_TOKEN;
const OUTPUT_FULL = path.join(__dirname, '..', 'public', 'waqi-cities.json');
const OUTPUT_LITE = path.join(__dirname, '..', 'public', 'waqi-cities-lite.json');

// WAQI API endpoints
const WAQI_BOUNDS = 'https://api.waqi.info/v2/map/bounds/';
const WAQI_SEARCH = 'https://api.waqi.info/v2/search/';

// AQI category thresholds
const AQI_CATEGORIES = [
  { max: 50, name: 'Good', color: '#3fb950' },
  { max: 100, name: 'Moderate', color: '#f0a500' },
  { max: 150, name: 'Unhealthy for Sensitive', color: '#ff8800' },
  { max: 200, name: 'Unhealthy', color: '#ff3333' },
  { max: 300, name: 'Very Unhealthy', color: '#9933ff' },
  { max: 500, name: 'Hazardous', color: '#7f0000' },
];

function getAqiCategory(aqi) {
  for (const cat of AQI_CATEGORIES) {
    if (aqi <= cat.max) return cat;
  }
  return AQI_CATEGORIES[AQI_CATEGORIES.length - 1];
}

async function fetchWaqiData() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  WAQI Live Air Quality Fetcher                                   ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  if (!WAQI_TOKEN) {
    console.error('[waqi] ERROR: WAQI_TOKEN not found in .env');
    console.error('[waqi] Get a free token at: https://aqicn.org/data-platform/token/');
    process.exit(1);
  }

  console.log('Fetching global air quality stations from WAQI...');

  // Define bounds for global coverage (lat/lng bounds)
  const bounds = 'lat=-90,lng=-180,lat=90,lng=180';
  const url = `${WAQI_BOUNDS}?token=${WAQI_TOKEN}&${bounds}`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'WorldDataMap/1.0 (educational)' },
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      throw new Error(`WAQI API error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();

    if (data.status !== 'ok') {
      throw new Error(`WAQI API returned error: ${data.data || 'Unknown error'}`);
    }

    const results = data.data || [];
    console.log(`  Raw stations received: ${results.length}`);

    // Process stations
    const stations = [];
    const byCountry = {};
    let skippedNoCoords = 0;
    let skippedBadAqi = 0;

    for (const item of results) {
      // Skip if no coordinates
      if (!item.lat || !item.lon) {
        skippedNoCoords++;
        continue;
      }

      // Get AQI value - handle different formats
      let aqi = item.aqi;
      if (aqi === '-' || aqi === null || aqi === undefined) {
        skippedBadAqi++;
        continue;
      }

      aqi = parseInt(aqi, 10);
      if (isNaN(aqi) || aqi < 0) {
        skippedBadAqi++;
        continue;
      }

      // Get station details
      const stationName = item.station?.name || 'Unknown Station';
      const city = item.station?.city || '';
      const country = item.station?.country || '';
      const lastUpdate = item.station?.time?.iso || new Date().toISOString();

      // Get category and dominant pollutant
      const category = getAqiCategory(aqi);
      const dominantPollutant = item.iaqi?.pm25 ? 'pm25' :
                                item.iaqi?.pm10 ? 'pm10' :
                                item.iaqi?.o3 ? 'o3' :
                                item.iaqi?.no2 ? 'no2' : 'unknown';

      // Count by country
      if (country) {
        byCountry[country] = (byCountry[country] || 0) + 1;
      }

      stations.push({
        idx: item.uid || item.station?.idx,
        name: stationName,
        city: city.split(',')[0]?.trim() || '',
        country: country,
        lat: parseFloat(item.lat).toFixed(4),
        lng: parseFloat(item.lon).toFixed(4),
        aqi: aqi,
        category: category.name,
        color: category.color,
        dominant_pollutant: dominantPollutant,
        last_update: lastUpdate,
        // Detailed pollutant values if available
        pm25: item.iaqi?.pm25?.v || null,
        pm10: item.iaqi?.pm10?.v || null,
        o3: item.iaqi?.o3?.v || null,
        no2: item.iaqi?.no2?.v || null,
      });
    }

    console.log(`  Valid stations: ${stations.length}`);
    console.log(`  Skipped (no coords): ${skippedNoCoords}`);
    console.log(`  Skipped (bad AQI): ${skippedBadAqi}`);

    // Stats by country
    console.log('\n── Top 15 countries by station count ─────────────────────────────');
    const sortedCountries = Object.entries(byCountry)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);
    for (const [country, count] of sortedCountries) {
      console.log(`  ${country.padEnd(5)} ${count}`);
    }

    // AQI distribution
    const aqiDist = {
      good: stations.filter(s => s.aqi <= 50).length,
      moderate: stations.filter(s => s.aqi <= 100 && s.aqi > 50).length,
      unhealthy_sensitive: stations.filter(s => s.aqi <= 150 && s.aqi > 100).length,
      unhealthy: stations.filter(s => s.aqi <= 200 && s.aqi > 150).length,
      very_unhealthy: stations.filter(s => s.aqi <= 300 && s.aqi > 200).length,
      hazardous: stations.filter(s => s.aqi > 300).length,
    };

    console.log('\n── AQI Distribution ──────────────────────────────────────────────');
    console.log(`  Good (0-50): ${aqiDist.good}`);
    console.log(`  Moderate (51-100): ${aqiDist.moderate}`);
    console.log(`  Unhealthy for Sensitive (101-150): ${aqiDist.unhealthy_sensitive}`);
    console.log(`  Unhealthy (151-200): ${aqiDist.unhealthy}`);
    console.log(`  Very Unhealthy (201-300): ${aqiDist.very_unhealthy}`);
    console.log(`  Hazardous (301+): ${aqiDist.hazardous}`);

    // Calculate country averages for country-data.json integration
    const countryAverages = {};
    for (const [country, count] of Object.entries(byCountry)) {
      const countryStations = stations.filter(s => s.country === country);
      const avgAqi = Math.round(
        countryStations.reduce((sum, s) => sum + s.aqi, 0) / countryStations.length
      );
      countryAverages[country] = {
        avg_aqi: avgAqi,
        station_count: count,
        max_aqi: Math.max(...countryStations.map(s => s.aqi)),
        min_aqi: Math.min(...countryStations.map(s => s.aqi)),
      };
    }

    // Write full output
    const output = {
      fetched_at: new Date().toISOString(),
      source: 'WAQI',
      total: stations.length,
      byCountry,
      aqiDistribution: aqiDist,
      countryAverages,
      stations: stations.sort((a, b) => b.aqi - a.aqi), // Sort by AQI descending
    };

    fs.writeFileSync(OUTPUT_FULL, JSON.stringify(output, null, 2));
    console.log(`\n✓ Written ${stations.length} stations to ${OUTPUT_FULL}`);

    // Write lightweight version for map display
    const lightweight = {
      fetched_at: output.fetched_at,
      source: output.source,
      total: output.total,
      stations: stations.map(s => ({
        i: s.idx,
        n: s.name.substring(0, 40),
        c: s.city.substring(0, 20),
        co: s.country,
        la: parseFloat(s.lat),
        lo: parseFloat(s.lng),
        a: s.aqi,
        cat: s.category,
        col: s.color,
        dp: s.dominant_pollutant,
      })),
    };

    fs.writeFileSync(OUTPUT_LITE, JSON.stringify(lightweight));
    console.log(`✓ Written lightweight version to ${OUTPUT_LITE}`);

    // Return country averages for integration into country-data.json
    console.log('\n[waqi] Country averages ready for country-data.json integration');
    return countryAverages;

  } catch (err) {
    console.error('[waqi] Error:', err.message);
    throw err;
  }
}

async function main() {
  try {
    await fetchWaqiData();
    console.log('\n[waqi] Complete!');
  } catch (err) {
    console.error('[waqi] Failed:', err.message);
    process.exit(1);
  }
}

main();
