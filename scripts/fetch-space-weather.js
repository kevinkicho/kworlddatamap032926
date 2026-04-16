#!/usr/bin/env node
/**
 * scripts/fetch-space-weather.js
 *
 * Fetches space weather data from NOAA SWPC (Space Weather Prediction Center)
 * and writes public/solar-weather.json
 *
 * NOAA SWPC API: https://services.swpc.noaa.gov/
 * No API key required
 *
 * Output structure:
 *   {
 *     fetched_at: ISO timestamp,
 *     source: 'NOAA SWPC',
 *     solar_flare: { class, region, time },
 *     kp_index: { current, forecast: [] },
 *     aurora_forecast: { northern_hemisphere, southern_hemisphere },
 *     geomagnetic_activity: { level, description },
 *     solar_wind: { speed, density, bz }
 *   }
 *
 * Usage: node scripts/fetch-space-weather.js
 */
'use strict';

const fs = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');

const OUTPUT_PATH = path.join(__dirname, '..', 'public', 'solar-weather.json');

// SWPC API endpoints
const SWPC_BASE = 'https://services.swpc.noaa.gov';

// Corrected endpoints (2026)
const ENDPOINTS = {
  kp_index: '/json/boulder_k_index_1m.json',
  solar_wind_plasma: '/products/solar-wind/plasma-2-hour.json',
  solar_wind_mag: '/products/solar-wind/mag-2-hour.json',
  forecast: '/json/45-day-forecast.json',
  alerts: '/products/alerts.json',
};

// KP index to aurora visibility mapping
const KP_AURORA_VISIBILITY = {
  0: { lat_min: 66, description: 'No aurora visible' },
  1: { lat_min: 64, description: 'Aurora visible at very high latitudes' },
  2: { lat_min: 62, description: 'Aurora visible at high latitudes' },
  3: { lat_min: 60, description: 'Aurora visible at high latitudes (e.g., Alaska, Northern Scandinavia)' },
  4: { lat_min: 56, description: 'Aurora visible at mid-high latitudes (e.g., Southern Canada, Southern UK)' },
  5: { lat_min: 52, description: 'Aurora visible at mid latitudes (e.g., Northern US, Central Europe)' },
  6: { lat_min: 48, description: 'Aurora visible at mid latitudes (e.g., Northern US, France, Germany)' },
  7: { lat_min: 44, description: 'Aurora visible at lower mid latitudes (e.g., Southern US, Southern Europe)' },
  8: { lat_min: 40, description: 'Aurora visible at low latitudes (e.g., California, Mediterranean)' },
  9: { lat_min: 36, description: 'Aurora visible at very low latitudes (rare geomagnetic storm)' },
};

// Geomagnetic activity levels
const GEOMAGNETIC_LEVELS = {
  G0: { kp_range: [0, 4], level: 'Quiet', description: 'Normal geomagnetic activity' },
  G1: { kp_range: [5, 5], level: 'Minor Storm', description: 'Minor geomagnetic storm - aurora visible at high latitudes' },
  G2: { kp_range: [6, 6], level: 'Moderate Storm', description: 'Moderate geomagnetic storm - aurora visible at mid latitudes' },
  G3: { kp_range: [7, 7], level: 'Strong Storm', description: 'Strong geomagnetic storm - aurora visible at lower mid latitudes' },
  G4: { kp_range: [8, 8], level: 'Severe Storm', description: 'Severe geomagnetic storm - widespread aurora, possible power grid issues' },
  G5: { kp_range: [9, 9], level: 'Extreme Storm', description: 'Extreme geomagnetic storm - rare event, significant infrastructure impacts possible' },
};

// Solar flare classifications
const FLARE_CLASSES = {
  'A': { intensity: 'Background', description: 'Minimal impact' },
  'B': { intensity: 'Minor', description: 'No impact on Earth' },
  'C': { intensity: 'Moderate', description: 'Minor radio blackouts possible' },
  'M': { intensity: 'Major', description: 'Radio blackouts, radiation storms possible' },
  'X': { intensity: 'Extreme', description: 'Widespread radio blackouts, radiation storms, grid disturbances' },
};

async function fetchSpaceWeatherData() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  NOAA Space Weather Data                                         ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  const now = new Date();
  const output = {
    fetched_at: now.toISOString(),
    source: 'NOAA SWPC',
    solar_flare: null,
    kp_index: null,
    aurora_forecast: null,
    geomagnetic_activity: null,
    solar_wind: null,
    warnings: [],
  };

  // 1. Fetch latest solar flare data from forecast
  console.log('Fetching solar flare data...');
  try {
    const forecastRes = await fetch(`${SWPC_BASE}${ENDPOINTS.forecast}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (forecastRes.ok) {
      const forecast = await forecastRes.json();
      // Forecast is an object with 'data' array
      const forecastData = forecast.data || forecast.forecast || [];
      const flareEvents = forecastData.filter(f => f.fluxFlareClass && f.fluxFlareClass !== 'C1');
      if (flareEvents.length > 0) {
        const latest = flareEvents[flareEvents.length - 1];
        output.solar_flare = {
          class: latest.fluxFlareClass || 'Unknown',
          region: latest.sourceLocation || 'Unknown',
          time: latest.startTime,
          description: `Flare forecast: ${latest.fluxFlareClass}`,
        };
        console.log(`  Latest flare: ${output.solar_flare.class} from region ${output.solar_flare.region}`);
      } else {
        output.solar_flare = { class: 'None', region: null, time: null, description: 'No significant flares in past 24h' };
        console.log('  No significant solar flares in past 24h');
      }
    } else {
      console.warn(`  API returned ${forecastRes.status}`);
      output.solar_flare = { class: 'Unknown', region: null, time: null, description: 'Data unavailable' };
    }
  } catch (err) {
    console.warn(`  Fetch failed: ${err.message}`);
    output.solar_flare = { class: 'Unknown', region: null, time: null, description: 'Fetch error' };
  }

  // 2. Fetch KP index (geomagnetic activity)
  console.log('\nFetching KP index (geomagnetic activity)...');
  try {
    const kpRes = await fetch(`${SWPC_BASE}${ENDPOINTS.kp_index}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (kpRes.ok) {
      const kpData = await kpRes.json();
      // Get current and recent KP values (field is k_index not kp)
      const kpValues = kpData.slice(-8).map(d => parseFloat(d.k_index));
      const currentKp = kpValues[kpValues.length - 1] || 0;

      output.kp_index = {
        current: currentKp,
        recent: kpValues,
        max_24h: Math.max(...kpValues),
        avg_24h: (kpValues.reduce((a, b) => a + b, 0) / kpValues.length).toFixed(2),
      };

      // Determine geomagnetic activity level
      const kpRounded = Math.round(currentKp);
      let activityLevel = 'G0';
      for (const [level, data] of Object.entries(GEOMAGNETIC_LEVELS)) {
        if (kpRounded >= data.kp_range[0] && kpRounded <= data.kp_range[1]) {
          activityLevel = level;
          break;
        }
      }

      output.geomagnetic_activity = {
        level: activityLevel,
        kp: currentKp,
        ...GEOMAGNETIC_LEVELS[activityLevel],
      };

      console.log(`  Current KP: ${currentKp} (${output.geomagnetic_activity.level} - ${output.geomagnetic_activity.level})`);
    } else {
      console.warn(`  API returned ${kpRes.status}`);
      output.kp_index = { current: 0, recent: [], max_24h: 0, avg_24h: 0 };
      output.geomagnetic_activity = { level: 'Unknown', kp: 0 };
    }
  } catch (err) {
    console.warn(`  Fetch failed: ${err.message}`);
    output.kp_index = { current: 0, recent: [], max_24h: 0, avg_24h: 0 };
    output.geomagnetic_activity = { level: 'Unknown', kp: 0 };
  }

  // 3. Auroral forecast from KP index (calculated, not API)
  console.log('\nFetching aurora forecast...');
  const kp = output.kp_index?.current || 3;
  const visibility = KP_AURORA_VISIBILITY[Math.round(kp)] || KP_AURORA_VISIBILITY[3];

  output.aurora_forecast = {
    northern_hemisphere: {
      visible_below_latitude: visibility.lat_min,
      description: visibility.description,
      probability_high_lat: kp >= 3 ? 'High' : kp >= 2 ? 'Moderate' : 'Low',
      probability_mid_lat: kp >= 5 ? 'Moderate' : kp >= 4 ? 'Low' : 'Very Low',
    },
    southern_hemisphere: {
      visible_above_latitude: -visibility.lat_min,
      description: visibility.description.replace('visible', 'visible in southern'),
      probability_high_lat: kp >= 3 ? 'High' : kp >= 2 ? 'Moderate' : 'Low',
    },
    best_viewing_locations: getBestViewingLocations(kp),
  };

  console.log(`  Aurora visible below ${visibility.lat_min}°N (Northern Hemisphere)`);
  console.log(`  Best viewing: ${output.aurora_forecast.best_viewing_locations.join(', ')}`);

  // 4. Fetch solar wind data (plasma + magnetic field)
  console.log('\nFetching solar wind data...');
  try {
    const [plasmaRes, magRes] = await Promise.all([
      fetch(`${SWPC_BASE}${ENDPOINTS.solar_wind_plasma}`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000),
      }),
      fetch(`${SWPC_BASE}${ENDPOINTS.solar_wind_mag}`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000),
      }),
    ]);

    let plasmaData = null;
    let magData = null;

    if (plasmaRes.ok) {
      plasmaData = await plasmaRes.json();
    }
    if (magRes.ok) {
      magData = await magRes.json();
    }

    // Plasma data format: [["time_tag","density","speed","temperature"], [values...]]
    if (plasmaData && plasmaData.length > 1) {
      const headers = plasmaData[0];
      const latest = plasmaData[plasmaData.length - 1];
      const densityIdx = headers.indexOf('density');
      const speedIdx = headers.indexOf('speed');
      const tempIdx = headers.indexOf('temperature');

      output.solar_wind = {
        speed_km_s: parseFloat(latest[speedIdx]) || 0,
        density_cm3: parseFloat(latest[densityIdx]) || 0,
        temperature_k: parseFloat(latest[tempIdx]) || 0,
        bz_gauss: 0,
      };

      // Get Bz from mag data
      if (magData && magData.length > 1) {
        const magHeaders = magData[0];
        const magLatest = magData[magData.length - 1];
        const bzIdx = magHeaders.indexOf('bz');
        if (bzIdx >= 0) {
          output.solar_wind.bz_gauss = parseFloat(magLatest[bzIdx]) || 0;
        }
      }

      console.log(`  Speed: ${output.solar_wind.speed_km_s} km/s, Density: ${output.solar_wind.density_cm3}/cm³, Bz: ${output.solar_wind.bz_gauss}nT`);
    } else {
      console.warn('  No solar wind data available');
      output.solar_wind = { speed_km_s: 0, density_cm3: 0, bz_gauss: 0, temperature_k: 0 };
    }
  } catch (err) {
    console.warn(`  Fetch failed: ${err.message}`);
    output.solar_wind = { speed_km_s: 0, density_cm3: 0, bz_gauss: 0, temperature_k: 0 };
  }

  // 5. Generate warnings if applicable
  console.log('\nChecking for space weather warnings...');
  if (output.geomagnetic_activity?.level === 'G1') {
    output.warnings.push({
      type: 'Minor Geomagnetic Storm',
      level: 'G1',
      message: 'Minor geomagnetic storm in progress. Aurora may be visible at high latitudes.',
    });
  } else if (['G2', 'G3', 'G4', 'G5'].includes(output.geomagnetic_activity?.level)) {
    output.warnings.push({
      type: 'Geomagnetic Storm',
      level: output.geomagnetic_activity.level,
      message: `Geomagnetic storm (${output.geomagnetic_activity.level}) in progress. ${output.geomagnetic_activity.description}`,
    });
  }

  if (output.solar_flare?.class?.startsWith('X')) {
    output.warnings.push({
      type: 'X-Class Solar Flare',
      level: 'Extreme',
      message: `X-class solar flare detected (${output.solar_flare.class}). Radio blackouts and radiation storms possible.`,
    });
  } else if (output.solar_flare?.class?.startsWith('M')) {
    output.warnings.push({
      type: 'M-Class Solar Flare',
      level: 'Moderate',
      message: `M-class solar flare detected (${output.solar_flare.class}). Minor radio disruptions possible.`,
    });
  }

  if (output.warnings.length > 0) {
    console.log(`  ⚠️  ${output.warnings.length} active warning(s):`);
    for (const w of output.warnings) {
      console.log(`    - ${w.type} (${w.level}): ${w.message}`);
    }
  } else {
    console.log('  No active warnings');
  }

  // Write output
  atomicWrite(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\n✓ Written space weather data to ${OUTPUT_PATH}`);

  // Write lightweight version for country panel
  const lightOutput = path.join(__dirname, '..', 'public', 'solar-weather-lite.json');
  atomicWrite(lightOutput, JSON.stringify({
    fetched_at: output.fetched_at,
    source: output.source,
    kp_index: output.kp_index?.current || 0,
    geomagnetic_level: output.geomagnetic_activity?.level || 'Unknown',
    aurora_visible_below_lat: output.aurora_forecast?.northern_hemisphere.visible_below_latitude || 66,
    warnings_count: output.warnings.length,
  }));
  console.log(`✓ Written lightweight version to ${lightOutput}`);

  console.log('\n[space-weather] Complete!');
  return output;
}

/**
 * Get best viewing locations for aurora based on KP index
 */
function getBestViewingLocations(kp) {
  const locations = {
    0: ['Northern Alaska', 'Northern Canada', 'Northern Scandinavia', 'Antarctica'],
    1: ['Fairbanks AK', 'Yellowknife Canada', 'Tromsø Norway', 'Reykjavik Iceland'],
    2: ['Anchorage AK', 'Whitehorse Canada', 'Oslo Norway', 'Helsinki Finland'],
    3: ['Seattle WA', 'Calgary Canada', 'Edinburgh Scotland', 'Stockholm Sweden'],
    4: ['Portland OR', 'Minneapolis MN', 'Manchester UK', 'Copenhagen Denmark'],
    5: ['Chicago IL', 'Detroit MI', 'London UK', 'Berlin Germany', 'Amsterdam Netherlands'],
    6: ['New York NY', 'Boston MA', 'Paris France', 'Brussels Belgium'],
    7: ['Washington DC', 'Philadelphia PA', 'Munich Germany', 'Vienna Austria'],
    8: ['Denver CO', 'San Francisco CA', 'Rome Italy', 'Madrid Spain'],
    9: ['Los Angeles CA', 'Miami FL', 'Athens Greece', 'Southern Australia'],
  };
  return locations[Math.min(Math.round(kp), 9)] || locations[3];
}

async function main() {
  try {
    await fetchSpaceWeatherData();
    console.log('\n[space-weather] Complete!');
  } catch (err) {
    console.error('[space-weather] Failed:', err.message);
    process.exit(1);
  }
}

main();
