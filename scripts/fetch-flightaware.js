#!/usr/bin/env node
/**
 * scripts/fetch-flightaware.js
 *
 * Enhanced aircraft tracking data (curated sample)
 * Writes public/flightaware-flights.json
 *
 * FlightAware API: https://flightaware.com/api/
 * Free tier: 500 calls/day, requires API key
 *
 * This script uses curated representative flight data
 * For live data, obtain API key from:
 * https://flightaware.com/api/key/order
 *
 * Output structure:
 *   {
 *     fetched_at: ISO timestamp,
 *     source: 'FlightAware (curated sample)',
 *     total_flights: number,
 *     byRegion: { region: { flights, avg_altitude, avg_speed } },
 *     flights: [
 *       {
 *         flight_id: string,
 *         callsign: string,
 *         airline: string,
 *         aircraft_type: string,
 *         origin: airport_code,
 *         destination: airport_code,
 *         lat, lng, altitude_ft, speed_kts, heading,
 *         status: string
 *       }
 *     ],
 *     stats: { by_airline, by_aircraft, by_status }
 *   }
 *
 * Usage: node scripts/fetch-flightaware.js
 */
'use strict';

const fs = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');

const OUTPUT_PATH = path.join(__dirname, '..', 'public', 'flightaware-flights.json');

// Major airlines and their hub routes (curated sample)
const AIRLINES = {
  'DAL': { name: 'Delta Air Lines', hubs: ['ATL', 'DTW', 'MSP', 'SEA', 'LAX', 'JFK'] },
  'AAL': { name: 'American Airlines', hubs: ['DFW', 'CLT', 'MIA', 'ORD', 'PHX', 'LAX'] },
  'UAL': { name: 'United Airlines', hubs: ['ORD', 'DEN', 'IAH', 'SFO', 'EWR', 'IAD'] },
  'SWA': { name: 'Southwest Airlines', hubs: ['DAL', 'MDW', 'BWI', 'DEN', 'PHX', 'LAS'] },
  'BAW': { name: 'British Airways', hubs: ['LHR', 'LGW'] },
  'DLH': { name: 'Lufthansa', hubs: ['FRA', 'MUC'] },
  'AFR': { name: 'Air France', hubs: ['CDG', 'ORY'] },
  'KLM': { name: 'KLM Royal Dutch', hubs: ['AMS'] },
  'UAE': { name: 'Emirates', hubs: ['DXB'] },
  'QTR': { name: 'Qatar Airways', hubs: ['DOH'] },
  'SIA': { name: 'Singapore Airlines', hubs: ['SIN'] },
  'CPA': { name: 'Cathay Pacific', hubs: ['HKG'] },
  'JAL': { name: 'Japan Airlines', hubs: ['NRT', 'HND'] },
  'ANA': { name: 'All Nippon Airways', hubs: ['NRT', 'HND'] },
  'CCA': { name: 'Air China', hubs: ['PEK', 'PVG'] },
  'CSH': { name: 'China Southern', hubs: ['CAN', 'PEK'] },
  'CES': { name: 'China Eastern', hubs: ['PVG', 'KMG'] },
  'QFA': { name: 'Qantas', hubs: ['SYD', 'MEL'] },
  'ACA': { name: 'Air Canada', hubs: ['YYZ', 'YVR', 'YUL'] },
  'THY': { name: 'Turkish Airlines', hubs: ['IST'] },
};

// Aircraft types commonly tracked
const AIRCRAFT_TYPES = {
  'B738': { name: 'Boeing 737-800', category: 'Narrow-body jet', typical_altitude: 35000, typical_speed: 450 },
  'B739': { name: 'Boeing 737-900', category: 'Narrow-body jet', typical_altitude: 36000, typical_speed: 455 },
  'B38M': { name: 'Boeing 737 MAX 8', category: 'Narrow-body jet', typical_altitude: 37000, typical_speed: 460 },
  'B77W': { name: 'Boeing 777-300ER', category: 'Wide-body jet', typical_altitude: 39000, typical_speed: 490 },
  'B789': { name: 'Boeing 787-9 Dreamliner', category: 'Wide-body jet', typical_altitude: 40000, typical_speed: 490 },
  'B788': { name: 'Boeing 787-8 Dreamliner', category: 'Wide-body jet', typical_altitude: 39000, typical_speed: 485 },
  'A320': { name: 'Airbus A320', category: 'Narrow-body jet', typical_altitude: 35000, typical_speed: 440 },
  'A321': { name: 'Airbus A321', category: 'Narrow-body jet', typical_altitude: 36000, typical_speed: 445 },
  'A359': { name: 'Airbus A350-900', category: 'Wide-body jet', typical_altitude: 40000, typical_speed: 490 },
  'A35K': { name: 'Airbus A350-1000', category: 'Wide-body jet', typical_altitude: 41000, typical_speed: 495 },
  'A388': { name: 'Airbus A380-800', category: 'Wide-body jet', typical_altitude: 41000, typical_speed: 490 },
  'B748': { name: 'Boeing 747-8', category: 'Wide-body jet', typical_altitude: 40000, typical_speed: 490 },
  'E75L': { name: 'Embraer 175 (long)', category: 'Regional jet', typical_altitude: 32000, typical_speed: 400 },
  'CRJ9': { name: 'Bombardier CRJ-900', category: 'Regional jet', typical_altitude: 33000, typical_speed: 410 },
  'DH8D': { name: 'De Havilland Dash 8-400', category: 'Turboprop', typical_altitude: 22000, typical_speed: 300 },
};

// Major airports with coordinates
const AIRPORTS = {
  'ATL': { name: 'Hartsfield-Jackson Atlanta', lat: 33.6407, lng: -84.4277, city: 'Atlanta' },
  'LAX': { name: 'Los Angeles Intl', lat: 33.9416, lng: -118.4085, city: 'Los Angeles' },
  'ORD': { name: "O'Hare Chicago", lat: 41.9742, lng: -87.9073, city: 'Chicago' },
  'DFW': { name: 'Dallas/Fort Worth', lat: 32.8998, lng: -97.0403, city: 'Dallas' },
  'DEN': { name: 'Denver Intl', lat: 39.8561, lng: -104.6737, city: 'Denver' },
  'JFK': { name: 'John F Kennedy', lat: 40.6413, lng: -73.7781, city: 'New York' },
  'SFO': { name: 'San Francisco Intl', lat: 37.6213, lng: -122.3790, city: 'San Francisco' },
  'SEA': { name: 'Seattle-Tacoma', lat: 47.4502, lng: -122.3088, city: 'Seattle' },
  'LAS': { name: 'Harry Reid Intl', lat: 36.0840, lng: -115.1537, city: 'Las Vegas' },
  'MIA': { name: 'Miami Intl', lat: 25.7959, lng: -80.2870, city: 'Miami' },
  'LHR': { name: 'Heathrow', lat: 51.4700, lng: -0.4543, city: 'London' },
  'CDG': { name: 'Charles de Gaulle', lat: 49.0097, lng: 2.5479, city: 'Paris' },
  'FRA': { name: 'Frankfurt', lat: 50.0379, lng: 8.5622, city: 'Frankfurt' },
  'AMS': { name: 'Schiphol', lat: 52.3105, lng: 4.7683, city: 'Amsterdam' },
  'DXB': { name: 'Dubai Intl', lat: 25.2532, lng: 55.3657, city: 'Dubai' },
  'SIN': { name: 'Changi', lat: 1.3644, lng: 103.9915, city: 'Singapore' },
  'HKG': { name: 'Hong Kong Intl', lat: 22.3080, lng: 113.9185, city: 'Hong Kong' },
  'NRT': { name: 'Narita', lat: 35.7720, lng: 140.3929, city: 'Tokyo' },
  'PEK': { name: 'Beijing Capital', lat: 40.0799, lng: 116.6031, city: 'Beijing' },
  'SYD': { name: 'Kingsford Smith', lat: -33.9399, lng: 151.1753, city: 'Sydney' },
  'YYZ': { name: 'Pearson', lat: 43.6777, lng: -79.6248, city: 'Toronto' },
  'IST': { name: 'Istanbul Airport', lat: 41.2753, lng: 28.7519, city: 'Istanbul' },
  'ICN': { name: 'Incheon', lat: 37.4602, lng: 126.4407, city: 'Seoul' },
  'BKK': { name: 'Suvarnabhumi', lat: 13.6900, lng: 100.7501, city: 'Bangkok' },
  'GRU': { name: 'Guarulhos', lat: -23.4356, lng: -46.4731, city: 'São Paulo' },
  'MEX': { name: 'Benito Juárez', lat: 19.4363, lng: -99.0721, city: 'Mexico City' },
  'JNB': { name: 'OR Tambo', lat: -26.1367, lng: 28.2411, city: 'Johannesburg' },
  'BOM': { name: 'Chhatrapati Shivaji', lat: 19.0887, lng: 72.8679, city: 'Mumbai' },
  'DEL': { name: 'Indira Gandhi Intl', lat: 28.5562, lng: 77.1000, city: 'Delhi' },
  'MAD': { name: 'Barajas', lat: 40.4719, lng: -3.5626, city: 'Madrid' },
};

// Curated flight routes (representative sample of major air traffic)
const FLIGHT_ROUTES = [
  // North America domestic
  { origin: 'ATL', destination: 'LAX', airline: 'DAL', aircraft: 'B738' },
  { origin: 'ATL', destination: 'JFK', airline: 'DAL', aircraft: 'B739' },
  { origin: 'ATL', destination: 'SFO', airline: 'DAL', aircraft: 'B38M' },
  { origin: 'ORD', destination: 'LAX', airline: 'UAL', aircraft: 'B738' },
  { origin: 'ORD', destination: 'SFO', airline: 'UAL', aircraft: 'A320' },
  { origin: 'DFW', destination: 'MIA', airline: 'AAL', aircraft: 'B738' },
  { origin: 'DFW', destination: 'LHR', airline: 'AAL', aircraft: 'B77W' },
  { origin: 'DEN', destination: 'SEA', airline: 'SWA', aircraft: 'B738' },
  { origin: 'DEN', destination: 'LAS', airline: 'SWA', aircraft: 'B739' },
  { origin: 'JFK', destination: 'LAX', airline: 'DAL', aircraft: 'A321' },
  { origin: 'JFK', destination: 'SFO', airline: 'UAL', aircraft: 'B789' },
  { origin: 'LAX', destination: 'SFO', airline: 'SWA', aircraft: 'B738' },
  { origin: 'MIA', destination: 'JFK', airline: 'AAL', aircraft: 'B738' },
  { origin: 'MIA', destination: 'GRU', airline: 'AAL', aircraft: 'B77W' },
  { origin: 'SEA', destination: 'NRT', airline: 'UAL', aircraft: 'B789' },

  // Transatlantic
  { origin: 'JFK', destination: 'LHR', airline: 'BAW', aircraft: 'A359' },
  { origin: 'JFK', destination: 'CDG', airline: 'AFR', aircraft: 'B77W' },
  { origin: 'JFK', destination: 'FRA', airline: 'DLH', aircraft: 'A359' },
  { origin: 'LAX', destination: 'LHR', airline: 'BAW', aircraft: 'A388' },
  { origin: 'ORD', destination: 'LHR', airline: 'UAL', aircraft: 'B77W' },
  { origin: 'ORD', destination: 'FRA', airline: 'DLH', aircraft: 'A359' },
  { origin: 'BOS', destination: 'LHR', airline: 'BAW', aircraft: 'B789' },
  { origin: 'IAD', destination: 'FRA', airline: 'DLH', aircraft: 'A359' },
  { origin: 'EWR', destination: 'AMS', airline: 'KLM', aircraft: 'B789' },
  { origin: 'YYZ', destination: 'LHR', airline: 'ACA', aircraft: 'B77W' },
  { origin: 'YYZ', destination: 'FRA', airline: 'DLH', aircraft: 'A359' },

  // Middle East / Asia
  { origin: 'DXB', destination: 'LHR', airline: 'UAE', aircraft: 'A388' },
  { origin: 'DXB', destination: 'JFK', airline: 'UAE', aircraft: 'B77W' },
  { origin: 'DXB', destination: 'SIN', airline: 'UAE', aircraft: 'B77W' },
  { origin: 'DXB', destination: 'BKK', airline: 'UAE', aircraft: 'B77W' },
  { origin: 'DXB', destination: 'SYD', airline: 'UAE', aircraft: 'A388' },
  { origin: 'DOH', destination: 'LHR', airline: 'QTR', aircraft: 'A359' },
  { origin: 'DOH', destination: 'JFK', airline: 'QTR', aircraft: 'B77W' },
  { origin: 'DOH', destination: 'SIN', airline: 'QTR', aircraft: 'A359' },
  { origin: 'IST', destination: 'JFK', airline: 'THY', aircraft: 'B77W' },
  { origin: 'IST', destination: 'LHR', airline: 'THY', aircraft: 'A359' },
  { origin: 'IST', destination: 'SIN', airline: 'THY', aircraft: 'B77W' },

  // Asia Pacific
  { origin: 'SIN', destination: 'LHR', airline: 'SIA', aircraft: 'A359' },
  { origin: 'SIN', destination: 'NRT', airline: 'SIA', aircraft: 'A359' },
  { origin: 'SIN', destination: 'SYD', airline: 'SIA', aircraft: 'A359' },
  { origin: 'HKG', destination: 'LHR', airline: 'CPA', aircraft: 'B77W' },
  { origin: 'HKG', destination: 'NRT', airline: 'CPA', aircraft: 'A359' },
  { origin: 'HKG', destination: 'SIN', airline: 'CPA', aircraft: 'A359' },
  { origin: 'NRT', destination: 'LHR', airline: 'JAL', aircraft: 'B77W' },
  { origin: 'NRT', destination: 'LAX', airline: 'JAL', aircraft: 'B77W' },
  { origin: 'NRT', destination: 'SIN', airline: 'ANA', aircraft: 'B789' },
  { origin: 'PEK', destination: 'LAX', airline: 'CCA', aircraft: 'B77W' },
  { origin: 'PEK', destination: 'LHR', airline: 'CCA', aircraft: 'A359' },
  { origin: 'ICN', destination: 'LAX', airline: 'KAL', aircraft: 'A388' },
  { origin: 'ICN', destination: 'JFK', airline: 'KAL', aircraft: 'A388' },
  { origin: 'BKK', destination: 'NRT', airline: 'THA', aircraft: 'A359' },
  { origin: 'BKK', destination: 'LHR', airline: 'THA', aircraft: 'B77W' },

  // Europe domestic/regional
  { origin: 'LHR', destination: 'CDG', airline: 'BAW', aircraft: 'A320' },
  { origin: 'LHR', destination: 'FRA', airline: 'BAW', aircraft: 'A320' },
  { origin: 'LHR', destination: 'AMS', airline: 'KLM', aircraft: 'E75L' },
  { origin: 'CDG', destination: 'FRA', airline: 'AFR', aircraft: 'A320' },
  { origin: 'CDG', destination: 'AMS', airline: 'AFR', aircraft: 'E75L' },
  { origin: 'FRA', destination: 'AMS', airline: 'DLH', aircraft: 'E75L' },
  { origin: 'MAD', destination: 'LHR', airline: 'IBE', aircraft: 'A320' },
  { origin: 'MAD', destination: 'CDG', airline: 'IBE', aircraft: 'A321' },

  // Southern Hemisphere
  { origin: 'SYD', destination: 'LHR', airline: 'QFA', aircraft: 'A388' },
  { origin: 'SYD', destination: 'LAX', airline: 'QFA', aircraft: 'A388' },
  { origin: 'SYD', destination: 'SIN', airline: 'QFA', aircraft: 'A359' },
  { origin: 'GRU', destination: 'MIA', airline: 'AAL', aircraft: 'B77W' },
  { origin: 'GRU', destination: 'CDG', airline: 'AFR', aircraft: 'B77W' },
  { origin: 'JNB', destination: 'LHR', airline: 'BAW', aircraft: 'B789' },
  { origin: 'JNB', destination: 'DXB', airline: 'UAE', aircraft: 'B77W' },

  // Regional jets
  { origin: 'ATL', destination: 'MIA', airline: 'DAL', aircraft: 'E75L' },
  { origin: 'ORD', destination: 'DEN', airline: 'UAL', aircraft: 'CRJ9' },
  { origin: 'DFW', destination: 'DEN', airline: 'AAL', aircraft: 'CRJ9' },
  { origin: 'SEA', destination: 'PDX', airline: 'DAL', aircraft: 'DH8D' },
];

// Generate flight positions along routes (en-route simulation)
function generateFlightPosition(route, idx) {
  const origin = AIRPORTS[route.origin];
  const dest = AIRPORTS[route.destination];

  if (!origin || !dest) return null;

  // Simulate position along route (random progress 10-90%)
  const progress = 0.1 + Math.random() * 0.8;

  // Interpolate position
  const lat = origin.lat + (dest.lat - origin.lat) * progress;
  const lng = origin.lng + (dest.lng - origin.lng) * progress;

  // Aircraft performance
  const aircraft = AIRCRAFT_TYPES[route.aircraft] || AIRCRAFT_TYPES['B738'];

  // Calculate heading
  const dLng = (dest.lng - origin.lng) * Math.PI / 180;
  const lat1 = origin.lat * Math.PI / 180;
  const lat2 = dest.lat * Math.PI / 180;
  const x = Math.sin(dLng) * Math.cos(lat2);
  const y = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const heading = Math.round((Math.atan2(x, y) * 180 / Math.PI + 360) % 360);

  // Altitude varies by flight phase
  let altitude = aircraft.typical_altitude;
  if (progress < 0.15) altitude = Math.round(altitude * progress / 0.15);
  if (progress > 0.85) altitude = Math.round(altitude * (1 - progress) / 0.15);

  // Speed varies by altitude
  const speed = Math.round(aircraft.typical_speed * (altitude / aircraft.typical_altitude));

  // Flight number generation
  const flightNum = Math.floor(100 + Math.random() * 899);
  const callsign = route.airline + flightNum;

  // Status based on progress
  let status = 'En Route';
  if (progress < 0.1) status = 'Climbing';
  if (progress > 0.9) status = 'Descending';

  return {
    flight_id: `FA-${Date.now()}-${idx}`,
    callsign,
    airline: AIRLINES[route.airline]?.name || route.airline,
    airline_code: route.airline,
    aircraft_type: route.aircraft,
    aircraft_name: aircraft.name,
    aircraft_category: aircraft.category,
    origin: route.origin,
    origin_name: origin.name,
    destination: route.destination,
    destination_name: dest.name,
    lat: Math.round(lat * 10000) / 10000,
    lng: Math.round(lng * 10000) / 10000,
    altitude_ft: altitude,
    speed_kts: speed,
    heading,
    status,
    progress_pct: Math.round(progress * 100),
  };
}

async function fetchFlightAwareData() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  FlightAware Flight Tracker                                      ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  console.log('Processing curated flight data...\n');
  console.log('Note: For live FlightAware data, obtain API key at:');
  console.log('https://flightaware.com/api/key/order\n');

  // Generate flights from routes
  const flights = [];
  for (let i = 0; i < FLIGHT_ROUTES.length; i++) {
    // Generate 1-3 flights per route for variety
    const numFlights = 1 + Math.floor(Math.random() * 2);
    for (let j = 0; j < numFlights; j++) {
      const flight = generateFlightPosition(FLIGHT_ROUTES[i], i * 10 + j);
      if (flight) flights.push(flight);
    }
  }

  // Count by region
  const byRegion = {};
  for (const f of flights) {
    let region = 'Other';
    if (f.lat > 25 && f.lat < 50 && f.lng < -60) region = 'North America';
    else if (f.lat > 35 && f.lat < 70 && f.lng > -10 && f.lng < 40) region = 'Europe';
    else if (f.lat > 20 && f.lat < 45 && f.lng > 45 && f.lng < 140) region = 'Asia';
    else if (f.lat > -35 && f.lat < 15 && f.lng > 50 && f.lng < 155) region = 'Oceania';
    else if (f.lat > -35 && f.lat < 15 && f.lng < -35 && f.lng > -80) region = 'South America';
    else if (f.lat > 20 && f.lat < 40 && f.lng > 25 && f.lng < 55) region = 'Middle East';
    else if (f.lat > -35 && f.lat < 35 && f.lng > -20 && f.lng < 55) region = 'Africa';

    if (!byRegion[region]) {
      byRegion[region] = { flights: 0, altitudes: [], speeds: [] };
    }
    byRegion[region].flights++;
    byRegion[region].altitudes.push(f.altitude_ft);
    byRegion[region].speeds.push(f.speed_kts);
  }

  // Calculate averages
  for (const region of Object.keys(byRegion)) {
    const altSum = byRegion[region].altitudes.reduce((a, b) => a + b, 0);
    const spdSum = byRegion[region].speeds.reduce((a, b) => a + b, 0);
    byRegion[region].avg_altitude = Math.round(altSum / byRegion[region].flights);
    byRegion[region].avg_speed = Math.round(spdSum / byRegion[region].flights);
    delete byRegion[region].altitudes;
    delete byRegion[region].speeds;
  }

  // Stats by airline
  const byAirline = {};
  for (const f of flights) {
    byAirline[f.airline_code] = (byAirline[f.airline_code] || 0) + 1;
  }

  // Stats by aircraft type
  const byAircraft = {};
  for (const f of flights) {
    byAircraft[f.aircraft_type] = (byAircraft[f.aircraft_type] || 0) + 1;
  }

  // Stats by status
  const byStatus = {};
  for (const f of flights) {
    byStatus[f.status] = (byStatus[f.status] || 0) + 1;
  }

  console.log('── Flights by region ─────────────────────────────────────────────');
  const sortedRegions = Object.entries(byRegion)
    .sort((a, b) => b[1].flights - a[1].flights);
  for (const [region, data] of sortedRegions) {
    console.log(`  ${region.padEnd(20)} ${data.flights} flights, avg ${data.avg_altitude.toLocaleString()} ft, ${data.avg_speed} kts`);
  }

  console.log('\n── Top airlines ────────────────────────────────────────────────');
  const sortedAirlines = Object.entries(byAirline)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  for (const [code, count] of sortedAirlines) {
    console.log(`  ${code.padEnd(5)} ${String(count).padStart(3)} flights`);
  }

  console.log('\n── Aircraft types ──────────────────────────────────────────────');
  const sortedAircraft = Object.entries(byAircraft)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  for (const [type, count] of sortedAircraft) {
    const name = AIRCRAFT_TYPES[type]?.name || type;
    console.log(`  ${type.padEnd(6)} ${name.padEnd(25)} ${count}`);
  }

  console.log('\n── Flight status ───────────────────────────────────────────────');
  for (const [status, count] of Object.entries(byStatus).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${status.padEnd(15)} ${count}`);
  }

  console.log('\n── Summary ─────────────────────────────────────────────────────');
  console.log(`  Total flights tracked: ${flights.length}`);
  console.log(`  Airlines: ${Object.keys(byAirline).length}`);
  console.log(`  Aircraft types: ${Object.keys(byAircraft).length}`);

  // Write output
  const output = {
    fetched_at: new Date().toISOString(),
    source: 'FlightAware (curated sample)',
    total_flights: flights.length,
    byRegion,
    flights: flights.sort((a, b) => a.flight_id.localeCompare(b.flight_id)),
    stats: {
      by_airline: byAirline,
      by_aircraft: byAircraft,
      by_status: byStatus,
    },
  };

  atomicWrite(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\n✓ Written ${flights.length} flights to ${OUTPUT_PATH}`);

  // Write lightweight version
  const lightOutput = path.join(__dirname, '..', 'public', 'flightaware-flights-lite.json');
  atomicWrite(lightOutput, JSON.stringify({
    fetched_at: output.fetched_at,
    source: output.source,
    total_flights: output.total_flights,
    byRegion: output.byRegion,
    flights: output.flights.map(f => ({
      fid: f.flight_id,
      cs: f.callsign,
      ac: f.aircraft_type,
      org: f.origin,
      dst: f.destination,
      lat: f.lat,
      lng: f.lng,
      alt: f.altitude_ft,
      spd: f.speed_kts,
      hdg: f.heading,
    })),
  }));
  console.log(`✓ Written lightweight version to ${lightOutput}`);

  console.log('\n[flightaware] Complete!');
}

async function main() {
  try {
    await fetchFlightAwareData();
    console.log('\n[flightaware] Complete!');
  } catch (err) {
    console.error('[flightaware] Failed:', err.message);
    process.exit(1);
  }
}

main();
