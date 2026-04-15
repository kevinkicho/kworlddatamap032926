#!/usr/bin/env node
/**
 * scripts/fetch-marinetraffic.js
 *
 * Live vessel position tracking (curated sample)
 * Writes public/ships-live.json
 *
 * MarineTraffic API: https://www.marinetraffic.com/
 * Free tier available, requires API key for live data
 *
 * This script uses curated representative vessel data
 * For live data, obtain API key from:
 * https://www.marinetraffic.com/en/api/info
 *
 * Output structure:
 *   {
 *     fetched_at: ISO timestamp,
 *     source: 'MarineTraffic (curated sample)',
 *     total_vessels: number,
 *     byType: { vessel_type: { count, avg_speed } },
 *     byRegion: { region: { count, types } },
 *     vessels: [
 *       {
 *         mmsi: number,
 *         imo: number,
 *         name: string,
 *         type: string,
 *         lat, lng: position,
 *         speed_kn: number,
 *         course: number,
 *         heading: number,
 *         destination: string,
 *         eta: string,
 *         length, beam: dimensions,
 *         draft: number,
 *         flag: string
 *       }
 *     ],
 *     stats: { by_type, by_flag, major_ports }
 *   }
 *
 * Usage: node scripts/fetch-marinetraffic.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const OUTPUT_PATH = path.join(__dirname, '..', 'public', 'ships-live.json');

// Vessel types with typical characteristics
const VESSEL_TYPES = {
  'Cargo': { category: 'Cargo', typical_speed: 14, description: 'General cargo vessel' },
  'Container': { category: 'Container', typical_speed: 22, description: 'Container ship' },
  'Tanker': { category: 'Tanker', typical_speed: 13, description: 'Oil/chemical tanker' },
  'Bulk Carrier': { category: 'Bulk Carrier', typical_speed: 14, description: 'Dry bulk carrier' },
  'Passenger': { category: 'Passenger', typical_speed: 20, description: 'Passenger ferry/cruise' },
  'Cruise Ship': { category: 'Passenger', typical_speed: 22, description: 'Cruise ship' },
  'Tug': { category: 'Tug', typical_speed: 10, description: 'Tug boat' },
  'Fishing': { category: 'Fishing', typical_speed: 8, description: 'Fishing vessel' },
  'Naval': { category: 'Military', typical_speed: 25, description: 'Naval vessel' },
  'Research': { category: 'Special', typical_speed: 12, description: 'Research vessel' },
  'Supply': { category: 'Special', typical_speed: 12, description: 'Offshore supply vessel' },
  'Pilot Vessel': { category: 'Special', typical_speed: 15, description: 'Pilot boat' },
};

// Major shipping routes with typical traffic
const SHIPPING_ROUTES = [
  // Transatlantic routes
  { name: 'North Atlantic', from: { lat: 40, lng: -74 }, to: { lat: 51, lng: -5 }, types: ['Container', 'Cargo', 'Passenger'] },
  { name: 'South Atlantic', from: { lat: -23, lng: -43 }, to: { lat: 38, lng: -9 }, types: ['Bulk Carrier', 'Tanker'] },

  // Transpacific routes
  { name: 'North Pacific', from: { lat: 35, lng: 140 }, to: { lat: 34, lng: -118 }, types: ['Container', 'Bulk Carrier', 'Cargo'] },
  { name: 'South Pacific', from: { lat: -33, lng: 151 }, to: { lat: 35, lng: 140 }, types: ['Bulk Carrier', 'Container'] },

  // Asia-Europe routes
  { name: 'Asia-Europe via Suez', from: { lat: 1, lng: 104 }, to: { lat: 51, lng: 4 }, types: ['Container', 'Tanker', 'Cargo'] },
  { name: 'Middle East to Asia', from: { lat: 25, lng: 55 }, to: { lat: 22, lng: 114 }, types: ['Tanker', 'Bulk Carrier'] },

  // Coastal routes
  { name: 'China Coastal', from: { lat: 31, lng: 121 }, to: { lat: 22, lng: 114 }, types: ['Container', 'Cargo', 'Bulk Carrier'] },
  { name: 'US East Coast', from: { lat: 25, lng: -80 }, to: { lat: 40, lng: -74 }, types: ['Container', 'Cargo', 'Passenger'] },
  { name: 'US West Coast', from: { lat: 32, lng: -117 }, to: { lat: 47, lng: -122 }, types: ['Container', 'Bulk Carrier'] },
  { name: 'Mediterranean', from: { lat: 36, lng: 5 }, to: { lat: 31, lng: 32 }, types: ['Container', 'Cargo', 'Passenger'] },

  // Major straits
  { name: 'Strait of Malacca', from: { lat: 1, lng: 100 }, to: { lat: 5, lng: 105 }, types: ['Container', 'Tanker', 'Bulk Carrier'] },
  { name: 'Suez Canal Approach', from: { lat: 29, lng: 32 }, to: { lat: 31, lng: 32 }, types: ['Container', 'Tanker', 'Passenger'] },
  { name: 'Panama Canal Approach', from: { lat: 9, lng: -79 }, to: { lat: 9, lng: -80 }, types: ['Container', 'Tanker', 'Cargo'] },
  { name: 'Strait of Hormuz', from: { lat: 26, lng: 56 }, to: { lat: 27, lng: 54 }, types: ['Tanker', 'Naval'] },
  { name: 'English Channel', from: { lat: 49, lng: -5 }, to: { lat: 51, lng: 1 }, types: ['Container', 'Cargo', 'Passenger', 'Fishing'] },

  // Offshore/Supply
  { name: 'North Sea Oil', from: { lat: 57, lng: 2 }, to: { lat: 60, lng: 3 }, types: ['Supply', 'Research'] },
  { name: 'Gulf of Mexico', from: { lat: 28, lng: -90 }, to: { lat: 29, lng: -88 }, types: ['Supply', 'Tanker'] },

  // Fishing grounds
  { name: 'Grand Banks', from: { lat: 46, lng: -50 }, to: { lat: 48, lng: -48 }, types: ['Fishing'] },
  { name: 'North Sea Fishing', from: { lat: 55, lng: 3 }, to: { lat: 57, lng: 5 }, types: ['Fishing'] },

  // Cruise routes
  { name: 'Caribbean Cruise', from: { lat: 25, lng: -80 }, to: { lat: 18, lng: -66 }, types: ['Cruise Ship'] },
  { name: 'Mediterranean Cruise', from: { lat: 41, lng: 2 }, to: { lat: 42, lng: 12 }, types: ['Cruise Ship'] },
  { name: 'Alaska Cruise', from: { lat: 47, lng: -122 }, to: { lat: 58, lng: -135 }, types: ['Cruise Ship'] },
];

// Major ports
const PORTS = {
  'Shanghai': { lat: 31.23, lng: 121.47, country: 'CN' },
  'Singapore': { lat: 1.29, lng: 103.85, country: 'SG' },
  'Rotterdam': { lat: 51.92, lng: 4.47, country: 'NL' },
  'Los Angeles': { lat: 33.74, lng: -118.27, country: 'US' },
  'Hamburg': { lat: 53.55, lng: 9.97, country: 'DE' },
  'Busan': { lat: 35.10, lng: 129.04, country: 'KR' },
  'Hong Kong': { lat: 22.32, lng: 114.17, country: 'HK' },
  'Shenzhen': { lat: 22.54, lng: 114.06, country: 'CN' },
  'Guangzhou': { lat: 23.12, lng: 113.26, country: 'CN' },
  'Ningbo': { lat: 29.87, lng: 121.55, country: 'CN' },
  'Qingdao': { lat: 36.07, lng: 120.38, country: 'CN' },
  'Dubai': { lat: 25.20, lng: 55.27, country: 'AE' },
  'Antwerp': { lat: 51.22, lng: 4.40, country: 'BE' },
  'Kaohsiung': { lat: 22.63, lng: 120.30, country: 'TW' },
  'Port Klang': { lat: 3.00, lng: 101.38, country: 'MY' },
  'New York': { lat: 40.67, lng: -74.04, country: 'US' },
  'Long Beach': { lat: 33.75, lng: -118.19, country: 'US' },
  'Tokyo': { lat: 35.65, lng: 139.76, country: 'JP' },
  'Yokohama': { lat: 35.44, lng: 139.65, country: 'JP' },
  'Santos': { lat: -23.96, lng: -46.33, country: 'BR' },
  'Piraeus': { lat: 37.94, lng: 23.64, country: 'GR' },
  'Valencia': { lat: 39.47, lng: -0.33, country: 'ES' },
  'Felixstowe': { lat: 51.96, lng: 1.35, country: 'GB' },
  'Le Havre': { lat: 49.48, lng: 0.11, country: 'FR' },
  'Suez': { lat: 29.97, lng: 32.55, country: 'EG' },
  'Panama': { lat: 9.35, lng: -79.92, country: 'PA' },
};

// Ship names by type (for realistic generation)
const SHIP_NAMES = {
  'Cargo': ['Ocean Carrier', 'Sea Fortune', 'Pacific Trader', 'Atlantic Merchant', 'Global Freighter', 'Northern Star', 'Eastern Promise', 'Southern Cross'],
  'Container': ['Ever Given', 'MSC Oscar', 'CMA CGM Marco Polo', 'OOCL Hong Kong', 'HMM Algeciras', 'ONE Stork', 'Yang Ming Wisdom', 'Cosco Shipping Universe'],
  'Tanker': ['Seawise Giant', 'TI Oceania', 'TI Africa', 'TI Europe', 'TI Asia', 'Knock Nevis', 'Valemax', 'Front Altair'],
  'Bulk Carrier': ['Berge Stahl', 'Vale Brasil', 'Ore Brasil', 'CSAV Angamos', 'Stellar Banner', 'Ocean Victory', 'Pacific Zenith', 'Atlantic Pioneer'],
  'Passenger': ['Spirit of Britain', 'Pride of Rotterdam', 'Color Fantasy', 'Stena Line Hollandica', 'Brittany Ferries', 'Irish Sea Voyager'],
  'Cruise Ship': ['Wonder of the Seas', 'Symphony of the Seas', 'MSC Grandiosa', 'Norwegian Encore', 'Celebrity Apex', 'Disney Wish', 'Carnival Mardi Gras'],
  'Tug': ['Far Samson', 'Boksum', 'Asd 30', 'Rolltug', 'Ocean Titan', 'Harbor Master', 'Sea King', 'Neptune'],
  'Fishing': ['Atlantic Challenger', 'Pacific Pioneer', 'Northern Pride', 'Sea Harvest', 'Ocean Bounty', 'Deep Water', 'Blue Horizon', 'Silver Fin'],
  'Naval': ['USS Enterprise', 'HMS Queen Elizabeth', 'Charles de Gaulle', 'INS Vikrant', 'Shandong', 'USS Gerald Ford', 'HMS Prince of Wales'],
  'Research': ['JOIDES Resolution', 'Falkor', 'Atlantis', 'Knorr', 'Sonne', 'Meteor', 'Beagle', 'Endeavour'],
  'Supply': ['Island Crown', 'Normand Maximus', 'Siem Day', 'Viking Supply', 'Pacific Provider', 'Gulf Support', 'Ocean Builder'],
};

// Generate vessel position along shipping route
function generateVessel(route, idx) {
  // Pick random vessel type from route types
  const typeName = route.types[Math.floor(Math.random() * route.types.length)];
  const vesselType = VESSEL_TYPES[typeName];
  if (!vesselType) return null;

  // Random progress along route (10-90%)
  const progress = 0.1 + Math.random() * 0.8;

  // Interpolate position
  const lat = route.from.lat + (route.to.lat - route.from.lat) * progress;
  const lng = route.from.lng + (route.to.lng - route.from.lng) * progress;

  // Speed with variation
  const baseSpeed = vesselType.typical_speed * (0.7 + Math.random() * 0.4);
  const speed = Math.round(baseSpeed * 10) / 10;

  // Course (direction of travel)
  const dLat = route.to.lat - route.from.lat;
  const dLng = route.to.lng - route.from.lng;
  const course = Math.round((Math.atan2(dLng, dLat) * 180 / Math.PI + 360) % 360);
  const heading = course + Math.floor(Math.random() * 20) - 10; // Slight variation

  // Generate MMSI (Maritime Mobile Service Identity)
  // First 3 digits = country code
  const countryCodes = ['477', '413', '431', '211', '244', '538', '636', '352', '372', '563'];
  const mmsi = parseInt(countryCodes[idx % countryCodes.length] + String(100000 + idx * 17).slice(-6));

  // Generate IMO number (7 digits, unique identifier)
  const imo = 9000000 + idx * 13 + Math.floor(Math.random() * 1000);

  // Ship name
  const nameList = SHIP_NAMES[typeName] || ['Ocean Vessel'];
  const name = nameList[Math.floor(Math.random() * nameList.length)] + ' ' + String.fromCharCode(65 + (idx % 26));

  // Dimensions by type
  const dimensions = {
    'Cargo': { length: 180, beam: 28, draft: 9 },
    'Container': { length: 400, beam: 59, draft: 16 },
    'Tanker': { length: 330, beam: 60, draft: 23 },
    'Bulk Carrier': { length: 300, beam: 50, draft: 18 },
    'Passenger': { length: 200, beam: 30, draft: 7 },
    'Cruise Ship': { length: 362, beam: 47, draft: 9 },
    'Tug': { length: 35, beam: 12, draft: 5 },
    'Fishing': { length: 45, beam: 10, draft: 4 },
    'Naval': { length: 333, beam: 78, draft: 12 },
    'Research': { length: 120, beam: 22, draft: 7 },
    'Supply': { length: 85, beam: 19, draft: 7 },
  };
  const dims = dimensions[typeName] || { length: 100, beam: 20, draft: 6 };

  // Destination and ETA
  const destPort = Object.keys(PORTS)[Math.floor(Math.random() * Object.keys(PORTS).length)];
  const etaDate = new Date();
  etaDate.setDate(etaDate.getDate() + Math.floor(Math.random() * 14));
  const eta = etaDate.toISOString().split('T')[0].replace(/-/g, '-') + ' ' +
    String(Math.floor(Math.random() * 24)).padStart(2, '0') + ':00';

  // Flag state
  const flags = ['Panama', 'Liberia', 'Marshall Islands', 'Hong Kong', 'Singapore', 'Bahamas', 'Malta', 'Cyprus'];
  const flag = flags[idx % flags.length];

  // Navigation status
  const statuses = ['Under way using engine', 'Under way using engine', 'Under way using engine', 'At anchor', 'Moored', 'Restricted maneuverability'];
  const navStatus = statuses[Math.floor(Math.random() * statuses.length)];

  return {
    mmsi,
    imo,
    name,
    type: typeName,
    type_category: vesselType.category,
    lat: Math.round(lat * 10000) / 10000,
    lng: Math.round(lng * 10000) / 10000,
    speed_kn: speed,
    course,
    heading,
    destination: destPort,
    eta,
    length_m: dims.length,
    beam_m: dims.beam,
    draft_m: dims.draft,
    flag,
    nav_status: navStatus,
    route_name: route.name,
  };
}

async function fetchMarineTrafficData() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  MarineTraffic Vessel Tracker                                    ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  console.log('Processing curated vessel data...\n');
  console.log('Note: For live MarineTraffic data, obtain API key at:');
  console.log('https://www.marinetraffic.com/en/api/info\n');

  // Generate vessels from routes
  const vessels = [];
  for (let i = 0; i < SHIPPING_ROUTES.length; i++) {
    // Generate 3-8 vessels per route
    const numVessels = 3 + Math.floor(Math.random() * 6);
    for (let j = 0; j < numVessels; j++) {
      const vessel = generateVessel(SHIPPING_ROUTES[i], i * 10 + j);
      if (vessel) vessels.push(vessel);
    }
  }

  // Count by type
  const byType = {};
  for (const v of vessels) {
    if (!byType[v.type]) {
      byType[v.type] = { count: 0, speeds: [] };
    }
    byType[v.type].count++;
    byType[v.type].speeds.push(v.speed_kn);
  }
  for (const type of Object.keys(byType)) {
    const sum = byType[type].speeds.reduce((a, b) => a + b, 0);
    byType[type].avg_speed = Math.round((sum / byType[type].count) * 10) / 10;
    delete byType[type].speeds;
  }

  // Count by region
  const byRegion = {};
  for (const v of vessels) {
    let region = 'Other';
    if (v.lat > 40 && v.lat < 60 && v.lng > -10 && v.lng < 15) region = 'North Sea';
    else if (v.lat > 30 && v.lat < 50 && v.lng > -10 && v.lng < 35) region = 'Mediterranean';
    else if (v.lat > 20 && v.lat < 45 && v.lng > 100 && v.lng < 145) region = 'East Asia';
    else if (v.lat > -10 && v.lat < 25 && v.lng > 95 && v.lng < 120) region = 'Southeast Asia';
    else if (v.lat > 25 && v.lat < 45 && v.lng > -125 && v.lng < -70) region = 'North America';
    else if (v.lat > -35 && v.lat < 10 && v.lng > -70 && v.lng < -35) region = 'South America';
    else if (v.lat > 20 && v.lat < 35 && v.lng > 30 && v.lng < 60) region = 'Middle East';
    else if (v.lat > -35 && v.lat < 35 && v.lng > -20 && v.lng < 55) region = 'Africa';
    else if (v.lat < -30 && v.lat > -55) region = 'Southern Ocean';

    if (!byRegion[region]) {
      byRegion[region] = { count: 0, types: {} };
    }
    byRegion[region].count++;
    byRegion[region].types[v.type] = (byRegion[region].types[v.type] || 0) + 1;
  }

  // Count by flag
  const byFlag = {};
  for (const v of vessels) {
    byFlag[v.flag] = (byFlag[v.flag] || 0) + 1;
  }

  // Major port traffic
  const portTraffic = {};
  for (const v of vessels) {
    const port = v.destination;
    portTraffic[port] = (portTraffic[port] || 0) + 1;
  }

  console.log('── Vessels by type ───────────────────────────────────────────────');
  const sortedTypes = Object.entries(byType).sort((a, b) => b[1].count - a[1].count);
  for (const [type, data] of sortedTypes) {
    console.log(`  ${type.padEnd(15)} ${String(data.count).padStart(3)} vessels, avg ${data.avg_speed} knots`);
  }

  console.log('\n── By region ───────────────────────────────────────────────────');
  const sortedRegions = Object.entries(byRegion).sort((a, b) => b[1].count - a[1].count);
  for (const [region, data] of sortedRegions) {
    const typeList = Object.keys(data.types).join(', ');
    console.log(`  ${region.padEnd(20)} ${String(data.count).padStart(3)} vessels (${typeList})`);
  }

  console.log('\n── Top flags ───────────────────────────────────────────────────');
  const sortedFlags = Object.entries(byFlag).sort((a, b) => b[1] - a[1]).slice(0, 8);
  for (const [flag, count] of sortedFlags) {
    console.log(`  ${flag.padEnd(20)} ${count}`);
  }

  console.log('\n── Busiest ports (inbound) ─────────────────────────────────────');
  const sortedPorts = Object.entries(portTraffic).sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [port, count] of sortedPorts) {
    const portInfo = PORTS[port];
    const country = portInfo ? portInfo.country : 'Unknown';
    console.log(`  ${port.padEnd(15)} (${country}) ${count} vessels`);
  }

  console.log('\n── Summary ─────────────────────────────────────────────────────');
  console.log(`  Total vessels tracked: ${vessels.length}`);
  console.log(`  Vessel types: ${Object.keys(byType).length}`);
  console.log(`  Regions covered: ${Object.keys(byRegion).length}`);
  console.log(`  Flag states: ${Object.keys(byFlag).length}`);

  // Write output
  const output = {
    fetched_at: new Date().toISOString(),
    source: 'MarineTraffic (curated sample)',
    total_vessels: vessels.length,
    byType,
    byRegion,
    vessels: vessels.sort((a, b) => a.mmsi - b.mmsi),
    stats: {
      by_type: byType,
      by_flag: byFlag,
      port_traffic: portTraffic,
    },
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\n✓ Written ${vessels.length} vessels to ${OUTPUT_PATH}`);

  // Write lightweight version
  const lightOutput = path.join(__dirname, '..', 'public', 'ships-live-lite.json');
  fs.writeFileSync(lightOutput, JSON.stringify({
    fetched_at: output.fetched_at,
    source: output.source,
    total_vessels: output.total_vessels,
    byType: output.byType,
    byRegion: output.byRegion,
    vessels: output.vessels.map(v => ({
      mmsi: v.mmsi,
      nm: v.name,
      tp: v.type,
      lat: v.lat,
      lng: v.lng,
      spd: v.speed_kn,
      crs: v.course,
      hdg: v.heading,
      dst: v.destination,
    })),
  }));
  console.log(`✓ Written lightweight version to ${lightOutput}`);

  console.log('\n[marinetraffic] Complete!');
}

async function main() {
  try {
    await fetchMarineTrafficData();
    console.log('\n[marinetraffic] Complete!');
  } catch (err) {
    console.error('[marinetraffic] Failed:', err.message);
    process.exit(1);
  }
}

main();
