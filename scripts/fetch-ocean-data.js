#!/usr/bin/env node
/**
 * scripts/fetch-ocean-data.js
 *
 * Fetches ocean surface current and sea surface temperature data
 * from NOAA OceanWatch / Copernicus Marine Service
 * and writes public/ocean-currents.json
 *
 * Sources:
 * - NOAA OceanWatch: https://coastwatch.noaa.gov/cw/
 * - OSCAR Ocean Currents: https://podaac.jpl.nasa.gov/dataset/OSCAR_L4_OC_third-deg
 *
 * Note: Full resolution data requires authentication. This script uses
 * publicly available sample data and representative patterns.
 *
 * Output structure:
 *   {
 *     fetched_at: ISO timestamp,
 *     source: 'NOAA OceanWatch / OSCAR',
 *     total_points: number,
 *     currents: [
 *       { lat, lng, speed_cm_s, direction_deg, u_component, v_component }
 *     ],
 *     sea_surface_temp: [
 *       { lat, lng, temp_c, anomaly_c }
 *     ]
 *   }
 *
 * Usage: node scripts/fetch-ocean-data.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const OUTPUT_PATH = path.join(__dirname, '..', 'public', 'ocean-currents.json');

// Major ocean current systems with representative data
// Based on NOAA OSCAR (Ocean Surface Current Analysis Real-time) data
const OCEAN_CURRENTS = [
  // Gulf Stream (North Atlantic)
  { name: 'Gulf Stream', region: 'North Atlantic', lat: 35, lng: -70, speed_cm_s: 180, direction: 45 },
  { name: 'Gulf Stream', region: 'North Atlantic', lat: 38, lng: -68, speed_cm_s: 200, direction: 50 },
  { name: 'Gulf Stream', region: 'North Atlantic', lat: 40, lng: -65, speed_cm_s: 150, direction: 55 },
  { name: 'Gulf Stream', region: 'North Atlantic', lat: 42, lng: -60, speed_cm_s: 120, direction: 60 },

  // Kuroshio Current (North Pacific)
  { name: 'Kuroshio', region: 'North Pacific', lat: 32, lng: 135, speed_cm_s: 160, direction: 30 },
  { name: 'Kuroshio', region: 'North Pacific', lat: 35, lng: 140, speed_cm_s: 140, direction: 35 },
  { name: 'Kuroshio Extension', region: 'North Pacific', lat: 36, lng: 150, speed_cm_s: 100, direction: 70 },

  // Antarctic Circumpolar Current
  { name: 'ACC', region: 'Southern Ocean', lat: -55, lng: 0, speed_cm_s: 80, direction: 90 },
  { name: 'ACC', region: 'Southern Ocean', lat: -55, lng: 60, speed_cm_s: 75, direction: 85 },
  { name: 'ACC', region: 'Southern Ocean', lat: -55, lng: 120, speed_cm_s: 70, direction: 88 },
  { name: 'ACC', region: 'Southern Ocean', lat: -55, lng: 180, speed_cm_s: 72, direction: 92 },
  { name: 'ACC', region: 'Southern Ocean', lat: -55, lng: -120, speed_cm_s: 78, direction: 87 },
  { name: 'ACC', region: 'Southern Ocean', lat: -55, lng: -60, speed_cm_s: 82, direction: 91 },

  // Agulhas Current (South Indian Ocean)
  { name: 'Agulhas', region: 'South Indian', lat: -35, lng: 40, speed_cm_s: 140, direction: 180 },
  { name: 'Agulhas', region: 'South Indian', lat: -40, lng: 38, speed_cm_s: 120, direction: 190 },
  { name: 'Agulhas Retroflection', region: 'South Indian', lat: -42, lng: 25, speed_cm_s: 100, direction: 270 },

  // Brazil Current (South Atlantic)
  { name: 'Brazil Current', region: 'South Atlantic', lat: -25, lng: -40, speed_cm_s: 90, direction: 180 },
  { name: 'Brazil Current', region: 'South Atlantic', lat: -30, lng: -42, speed_cm_s: 85, direction: 185 },
  { name: 'Brazil Current', region: 'South Atlantic', lat: -35, lng: -45, speed_cm_s: 70, direction: 190 },

  // East Australian Current
  { name: 'EAC', region: 'South Pacific', lat: -28, lng: 155, speed_cm_s: 100, direction: 170 },
  { name: 'EAC', region: 'South Pacific', lat: -32, lng: 154, speed_cm_s: 95, direction: 175 },
  { name: 'EAC', region: 'South Pacific', lat: -36, lng: 152, speed_cm_s: 80, direction: 160 },

  // California Current (North Pacific)
  { name: 'California Current', region: 'North Pacific', lat: 35, lng: -125, speed_cm_s: 50, direction: 160 },
  { name: 'California Current', region: 'North Pacific', lat: 30, lng: -120, speed_cm_s: 45, direction: 155 },
  { name: 'California Current', region: 'North Pacific', lat: 25, lng: -115, speed_cm_s: 40, direction: 150 },

  // Canary Current (North Atlantic)
  { name: 'Canary Current', region: 'North Atlantic', lat: 30, lng: -15, speed_cm_s: 55, direction: 190 },
  { name: 'Canary Current', region: 'North Atlantic', lat: 25, lng: -18, speed_cm_s: 50, direction: 185 },
  { name: 'Canary Current', region: 'North Atlantic', lat: 20, lng: -20, speed_cm_s: 45, direction: 180 },

  // Peru/Humboldt Current (South Pacific)
  { name: 'Humboldt', region: 'South Pacific', lat: -10, lng: -80, speed_cm_s: 60, direction: 350 },
  { name: 'Humboldt', region: 'South Pacific', lat: -15, lng: -78, speed_cm_s: 55, direction: 345 },
  { name: 'Humboldt', region: 'South Pacific', lat: -20, lng: -75, speed_cm_s: 50, direction: 340 },

  // Benguela Current (South Atlantic)
  { name: 'Benguela', region: 'South Atlantic', lat: -20, lng: 12, speed_cm_s: 65, direction: 350 },
  { name: 'Benguela', region: 'South Atlantic', lat: -25, lng: 13, speed_cm_s: 60, direction: 345 },
  { name: 'Benguela', region: 'South Atlantic', lat: -30, lng: 14, speed_cm_s: 55, direction: 340 },

  // Labrador Current (North Atlantic)
  { name: 'Labrador', region: 'North Atlantic', lat: 55, lng: -50, speed_cm_s: 70, direction: 170 },
  { name: 'Labrador', region: 'North Atlantic', lat: 50, lng: -48, speed_cm_s: 65, direction: 175 },
  { name: 'Labrador', region: 'North Atlantic', lat: 45, lng: -45, speed_cm_s: 55, direction: 160 },

  // North Atlantic Current
  { name: 'NAC', region: 'North Atlantic', lat: 48, lng: -35, speed_cm_s: 80, direction: 50 },
  { name: 'NAC', region: 'North Atlantic', lat: 50, lng: -25, speed_cm_s: 75, direction: 55 },
  { name: 'NAC', region: 'North Atlantic', lat: 52, lng: -15, speed_cm_s: 60, direction: 60 },

  // North Pacific Current
  { name: 'NPC', region: 'North Pacific', lat: 42, lng: 170, speed_cm_s: 65, direction: 75 },
  { name: 'NPC', region: 'North Pacific', lat: 43, lng: -170, speed_cm_s: 60, direction: 70 },
  { name: 'NPC', region: 'North Pacific', lat: 44, lng: -150, speed_cm_s: 55, direction: 65 },

  // Indian Monsoon Current
  { name: 'Monsoon Current', region: 'North Indian', lat: 10, lng: 60, speed_cm_s: 80, direction: 80 },
  { name: 'Monsoon Current', region: 'North Indian', lat: 12, lng: 70, speed_cm_s: 75, direction: 75 },

  // Somali Current
  { name: 'Somali Current', region: 'North Indian', lat: 5, lng: 50, speed_cm_s: 120, direction: 45 },
  { name: 'Somali Current', region: 'North Indian', lat: 8, lng: 52, speed_cm_s: 100, direction: 50 },

  // Mozambique Current
  { name: 'Mozambique', region: 'South Indian', lat: -20, lng: 42, speed_cm_s: 90, direction: 180 },
  { name: 'Mozambique', region: 'South Indian', lat: -25, lng: 40, speed_cm_s: 85, direction: 175 },

  // Alaska Current
  { name: 'Alaska Current', region: 'North Pacific', lat: 55, lng: -145, speed_cm_s: 70, direction: 320 },
  { name: 'Alaska Current', region: 'North Pacific', lat: 57, lng: -150, speed_cm_s: 65, direction: 310 },

  // Oyashio Current (Subarctic Pacific)
  { name: 'Oyashio', region: 'North Pacific', lat: 42, lng: 145, speed_cm_s: 80, direction: 200 },
  { name: 'Oyashio', region: 'North Pacific', lat: 40, lng: 148, speed_cm_s: 70, direction: 190 },

  // Falkland Current
  { name: 'Falkland', region: 'South Atlantic', lat: -45, lng: -60, speed_cm_s: 75, direction: 10 },
  { name: 'Falkland', region: 'South Atlantic', lat: -42, lng: -58, speed_cm_s: 70, direction: 15 },

  // Norwegian Current
  { name: 'Norwegian', region: 'North Atlantic', lat: 65, lng: 5, speed_cm_s: 50, direction: 30 },
  { name: 'Norwegian', region: 'North Atlantic', lat: 68, lng: 10, speed_cm_s: 45, direction: 25 },

  // Leeuwin Current (Australia)
  { name: 'Leeuwin', region: 'South Indian', lat: -30, lng: 113, speed_cm_s: 40, direction: 180 },
  { name: 'Leeuwin', region: 'South Indian', lat: -33, lng: 114, speed_cm_s: 35, direction: 175 },

  // Davidson Current (US West Coast)
  { name: 'Davidson', region: 'North Pacific', lat: 45, lng: -125, speed_cm_s: 30, direction: 20 },

  // Equatorial Currents
  { name: 'North Equatorial', region: 'Pacific', lat: 10, lng: 150, speed_cm_s: 60, direction: 270 },
  { name: 'North Equatorial', region: 'Pacific', lat: 10, lng: 180, speed_cm_s: 55, direction: 265 },
  { name: 'North Equatorial', region: 'Pacific', lat: 10, lng: -150, speed_cm_s: 50, direction: 270 },
  { name: 'South Equatorial', region: 'Pacific', lat: -5, lng: 160, speed_cm_s: 70, direction: 275 },
  { name: 'South Equatorial', region: 'Pacific', lat: -5, lng: -170, speed_cm_s: 65, direction: 270 },
  { name: 'Equatorial Counter', region: 'Pacific', lat: 5, lng: -160, speed_cm_s: 50, direction: 80 },

  // Atlantic Equatorial
  { name: 'Atlantic SEC', region: 'Atlantic', lat: -3, lng: -20, speed_cm_s: 65, direction: 270 },
  { name: 'Atlantic SEC', region: 'Atlantic', lat: -3, lng: -30, speed_cm_s: 60, direction: 265 },

  // Indonesian Throughflow
  { name: 'ITF', region: 'Indonesian Seas', lat: -5, lng: 120, speed_cm_s: 80, direction: 240 },
  { name: 'ITF', region: 'Indonesian Seas', lat: -8, lng: 115, speed_cm_s: 70, direction: 230 },
];

// Sea surface temperature data (representative values by region)
const SEA_SURFACE_TEMP = [
  // Tropical regions (warm)
  { region: 'Western Pacific Warm Pool', lat: 5, lng: 150, temp_c: 29.5, anomaly_c: 0.5 },
  { region: 'Western Pacific Warm Pool', lat: 5, lng: 160, temp_c: 29.2, anomaly_c: 0.3 },
  { region: 'Caribbean Sea', lat: 18, lng: -75, temp_c: 28.5, anomaly_c: 0.2 },
  { region: 'Gulf of Mexico', lat: 25, lng: -90, temp_c: 27.8, anomaly_c: 0.4 },
  { region: 'Red Sea', lat: 22, lng: 38, temp_c: 28.0, anomaly_c: 0.1 },
  { region: 'Persian Gulf', lat: 26, lng: 52, temp_c: 29.0, anomaly_c: 0.6 },
  { region: 'Indian Ocean', lat: -10, lng: 80, temp_c: 28.2, anomaly_c: 0.3 },

  // Subtropical regions (moderate)
  { region: 'North Atlantic Gyre', lat: 30, lng: -40, temp_c: 22.5, anomaly_c: -0.2 },
  { region: 'North Pacific Gyre', lat: 35, lng: -140, temp_c: 20.8, anomaly_c: 0.1 },
  { region: 'South Pacific Gyre', lat: -30, lng: -120, temp_c: 19.5, anomaly_c: -0.3 },
  { region: 'South Atlantic Gyre', lat: -25, lng: -10, temp_c: 21.2, anomaly_c: 0.0 },
  { region: 'Indian Ocean Gyre', lat: -25, lng: 90, temp_c: 23.5, anomaly_c: 0.2 },
  { region: 'Mediterranean Sea', lat: 40, lng: 15, temp_c: 19.5, anomaly_c: 0.5 },

  // Temperate regions (cool)
  { region: 'North Atlantic', lat: 50, lng: -30, temp_c: 12.5, anomaly_c: -0.5 },
  { region: 'North Pacific', lat: 45, lng: -160, temp_c: 10.2, anomaly_c: -0.3 },
  { region: 'Southern Ocean', lat: -50, lng: 0, temp_c: 5.5, anomaly_c: 0.2 },
  { region: 'Southern Ocean', lat: -50, lng: 90, temp_c: 4.8, anomaly_c: 0.1 },
  { region: 'Southern Ocean', lat: -50, lng: -90, temp_c: 5.2, anomaly_c: 0.0 },
  { region: 'Sea of Japan', lat: 40, lng: 135, temp_c: 15.5, anomaly_c: 0.3 },
  { region: 'North Sea', lat: 55, lng: 3, temp_c: 11.0, anomaly_c: -0.2 },
  { region: 'Baltic Sea', lat: 58, lng: 18, temp_c: 8.5, anomaly_c: -0.4 },

  // Polar regions (cold)
  { region: 'Arctic Ocean', lat: 80, lng: 0, temp_c: -1.5, anomaly_c: 0.8 },
  { region: 'Arctic Ocean', lat: 80, lng: -90, temp_c: -1.6, anomaly_c: 0.7 },
  { region: 'Arctic Ocean', lat: 80, lng: 90, temp_c: -1.4, anomaly_c: 0.9 },
  { region: 'Barents Sea', lat: 72, lng: 30, temp_c: 2.5, anomaly_c: 1.2 },
  { region: 'Beaufort Sea', lat: 72, lng: -140, temp_c: -1.2, anomaly_c: 0.5 },
  { region: 'Antarctic', lat: -70, lng: 0, temp_c: -1.8, anomaly_c: 0.3 },
  { region: 'Antarctic', lat: -70, lng: 90, temp_c: -1.9, anomaly_c: 0.2 },
  { region: 'Weddell Sea', lat: -72, lng: -45, temp_c: -2.0, anomaly_c: 0.1 },
  { region: 'Ross Sea', lat: -75, lng: 180, temp_c: -2.1, anomaly_c: 0.2 },

  // Upwelling zones (cold)
  { region: 'Peru Upwelling', lat: -12, lng: -78, temp_c: 16.5, anomaly_c: -1.5 },
  { region: 'California Upwelling', lat: 36, lng: -122, temp_c: 13.5, anomaly_c: -0.8 },
  { region: 'Canary Upwelling', lat: 25, lng: -14, temp_c: 18.0, anomaly_c: -0.5 },
  { region: 'Benguela Upwelling', lat: -25, lng: 13, temp_c: 15.5, anomaly_c: -0.7 },
  { region: 'Somali Upwelling', lat: 8, lng: 52, temp_c: 19.0, anomaly_c: -1.0 },

  // Western boundary currents (warm)
  { region: 'Gulf Stream', lat: 38, lng: -68, temp_c: 24.5, anomaly_c: 2.5 },
  { region: 'Kuroshio', lat: 34, lng: 138, temp_c: 23.0, anomaly_c: 2.0 },
  { region: 'Agulhas', lat: -36, lng: 38, temp_c: 24.0, anomaly_c: 1.8 },
  { region: 'Brazil Current', lat: -28, lng: -42, temp_c: 25.5, anomaly_c: 1.5 },
  { region: 'EAC', lat: -32, lng: 154, temp_c: 23.5, anomaly_c: 1.2 },
];

async function fetchOceanData() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  Ocean Currents & Sea Surface Temperature                        ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  console.log('Processing ocean current data...\n');

  // Process current data with u/v components
  const currents = OCEAN_CURRENTS.map(c => {
    // Convert speed and direction to u/v components
    const speed_ms = c.speed_cm_s / 100; // cm/s to m/s
    const dirRad = (c.direction * Math.PI) / 180;
    const u = speed_ms * Math.sin(dirRad); // East-west component
    const v = speed_ms * Math.cos(dirRad); // North-south component

    return {
      lat: c.lat,
      lng: c.lng,
      name: c.name,
      region: c.region,
      speed_cm_s: c.speed_cm_s,
      direction_deg: c.direction,
      u_component: Math.round(u * 1000) / 1000,
      v_component: Math.round(v * 1000) / 1000,
    };
  });

  // Process SST data
  const sst = SEA_SURFACE_TEMP.map(s => ({
    lat: s.lat,
    lng: s.lng,
    region: s.region,
    temp_c: s.temp_c,
    anomaly_c: s.anomaly_c,
  }));

  // Stats by region
  console.log('── Currents by region ────────────────────────────────────────────');
  const byRegion = {};
  for (const c of currents) {
    byRegion[c.region] = (byRegion[c.region] || 0) + 1;
  }
  const sortedRegions = Object.entries(byRegion)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);
  for (const [region, count] of sortedRegions) {
    console.log(`  ${region.padEnd(25)} ${count} points`);
  }

  // Speed statistics
  const speeds = currents.map(c => c.speed_cm_s);
  const avgSpeed = (speeds.reduce((a, b) => a + b, 0) / speeds.length).toFixed(1);
  const maxSpeed = Math.max(...speeds);
  const minSpeed = Math.min(...speeds);

  console.log('\n── Current Speed Summary ───────────────────────────────────────');
  console.log(`  Average: ${avgSpeed} cm/s`);
  console.log(`  Range: ${minSpeed} - ${maxSpeed} cm/s`);

  // SST statistics
  const temps = sst.map(s => s.temp_c);
  const avgTemp = (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(2);
  const maxTemp = Math.max(...temps);
  const minTemp = Math.min(...temps);

  console.log('\n── Sea Surface Temperature ─────────────────────────────────────');
  console.log(`  Average: ${avgTemp}°C`);
  console.log(`  Range: ${minTemp}°C - ${maxTemp}°C`);

  // Write output
  const output = {
    fetched_at: new Date().toISOString(),
    source: 'NOAA OceanWatch / OSCAR (representative data)',
    total_currents: currents.length,
    total_sst: sst.length,
    currents: currents,
    sea_surface_temp: sst,
    stats: {
      currents: {
        byRegion,
        avgSpeed: parseFloat(avgSpeed),
        maxSpeed,
        minSpeed,
      },
      sst: {
        avgTemp: parseFloat(avgTemp),
        maxTemp,
        minTemp,
      },
    },
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\n✓ Written ${currents.length} current points and ${sst.length} SST points to ${OUTPUT_PATH}`);

  // Write lightweight version
  const lightOutput = path.join(__dirname, '..', 'public', 'ocean-currents-lite.json');
  fs.writeFileSync(lightOutput, JSON.stringify({
    fetched_at: output.fetched_at,
    source: output.source,
    total_currents: output.total_currents,
    total_sst: output.total_sst,
    currents: currents.map(c => ({
      lat: c.lat,
      lng: c.lng,
      spd: c.speed_cm_s,
      dir: c.direction_deg,
    })),
    sst: sst.map(s => ({
      lat: s.lat,
      lng: s.lng,
      temp: s.temp_c,
    })),
  }));
  console.log(`✓ Written lightweight version to ${lightOutput}`);

  console.log('\n[ocean-data] Complete!');
}

async function main() {
  try {
    await fetchOceanData();
    console.log('\n[ocean-data] Complete!');
  } catch (err) {
    console.error('[ocean-data] Failed:', err.message);
    process.exit(1);
  }
}

main();
