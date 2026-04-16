#!/usr/bin/env node
/**
 * scripts/fetch-air-routes.js
 *
 * Downloads OpenFlights route + airport data and builds
 * public/air-routes.json — the busiest international air routes.
 *
 * Output structure:
 *   { routes: [{from, to, fromIata, toIata, lat1, lng1, lat2, lng2, airlines}],
 *     hubs: [{iata, name, city, country, lat, lng, routes}] }
 *
 * Only includes:
 *   - International routes (different countries)
 *   - Routes with 2+ airlines operating (busier = more significant)
 *   - Top 500 by airline count
 *
 * Source: OpenFlights.org (routes.dat, airports.dat)
 *
 * Usage: node scripts/fetch-air-routes.js
 */
'use strict';
const fs   = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');

const OUT_PATH     = path.join(__dirname, '..', 'public', 'air-routes.json');
const AIRPORTS_URL = 'https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat';
const ROUTES_URL   = 'https://raw.githubusercontent.com/jpatokal/openflights/master/data/routes.dat';

async function fetchText(url, label) {
  process.stdout.write(`  Fetching ${label} … `);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'WorldDataMap/1.0 (educational)' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const lines = text.trim().split('\n');
  console.log(`${lines.length} lines`);
  return lines;
}

function parseCSVLine(line) {
  // Simple CSV parser handling quoted fields
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { result.push(current); current = ''; continue; }
    current += ch;
  }
  result.push(current);
  return result;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  Air Routes builder (OpenFlights)                                ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  const [airportLines, routeLines] = await Promise.all([
    fetchText(AIRPORTS_URL, 'airports'),
    fetchText(ROUTES_URL, 'routes'),
  ]);

  // Parse airports: id → {iata, name, city, country, lat, lng}
  console.log('\n── Parsing airports ─────────────────────────────────────────────────');
  const airports = {};  // by IATA code
  const airportById = {}; // by OpenFlights ID
  for (const line of airportLines) {
    const f = parseCSVLine(line);
    const id = f[0], name = f[1], city = f[2], country = f[3];
    const iata = f[4], lat = parseFloat(f[6]), lng = parseFloat(f[7]);
    if (!iata || iata === '\\N' || iata.length !== 3) continue;
    if (isNaN(lat) || isNaN(lng)) continue;
    const entry = { iata, name, city, country, lat, lng };
    airports[iata] = entry;
    airportById[id] = entry;
  }
  console.log(`  ${Object.keys(airports).length} airports with IATA codes`);

  // Parse routes: count airlines per route pair
  console.log('\n── Parsing routes ───────────────────────────────────────────────────');
  const routeCounts = {};  // "FROM-TO" → airline count
  let parsed = 0, skipped = 0;
  for (const line of routeLines) {
    const f = line.split(',');
    const fromIata = f[2], toIata = f[4];
    if (!fromIata || !toIata || fromIata === '\\N' || toIata === '\\N') { skipped++; continue; }
    const from = airports[fromIata], to = airports[toIata];
    if (!from || !to) { skipped++; continue; }
    // Only international routes
    if (from.country === to.country) { skipped++; continue; }
    // Normalize route key (alphabetical to deduplicate A→B and B→A)
    const key = fromIata < toIata ? `${fromIata}-${toIata}` : `${toIata}-${fromIata}`;
    routeCounts[key] = (routeCounts[key] || 0) + 1;
    parsed++;
  }
  console.log(`  ${parsed} international route entries, ${skipped} skipped`);
  console.log(`  ${Object.keys(routeCounts).length} unique international route pairs`);

  // Sort by airline count and take top 500
  const topRoutes = Object.entries(routeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 500)
    .map(([key, airlines]) => {
      const [iata1, iata2] = key.split('-');
      const a1 = airports[iata1], a2 = airports[iata2];
      return {
        fromIata: iata1, toIata: iata2,
        from: `${a1.city}, ${a1.country}`,
        to: `${a2.city}, ${a2.country}`,
        lat1: +a1.lat.toFixed(4), lng1: +a1.lng.toFixed(4),
        lat2: +a2.lat.toFixed(4), lng2: +a2.lng.toFixed(4),
        airlines,
      };
    });

  console.log(`  Top 500 routes selected (min ${topRoutes[topRoutes.length - 1].airlines} airlines)`);

  // Build hub list: airports appearing in top routes, ranked by connections
  const hubCounts = {};
  for (const r of topRoutes) {
    hubCounts[r.fromIata] = (hubCounts[r.fromIata] || 0) + 1;
    hubCounts[r.toIata] = (hubCounts[r.toIata] || 0) + 1;
  }
  const hubs = Object.entries(hubCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([iata, routes]) => {
      const a = airports[iata];
      return { iata, name: a.name, city: a.city, country: a.country,
               lat: +a.lat.toFixed(4), lng: +a.lng.toFixed(4), routes };
    });

  // Write output
  const output = { routes: topRoutes, hubs };
  const json = JSON.stringify(output);
  atomicWrite(OUT_PATH, json);
  console.log(`\n✓ Written ${(json.length / 1024).toFixed(0)} KB to ${OUT_PATH}`);

  // Spot-check
  console.log('\n── Top 15 busiest international routes ─────────────────────────────');
  topRoutes.slice(0, 15).forEach((r, i) => {
    console.log(`  ${(i + 1 + '.').padEnd(4)} ${r.fromIata}–${r.toIata} ${r.from} ↔ ${r.to} (${r.airlines} airlines)`);
  });

  console.log('\n── Top 15 hub airports ─────────────────────────────────────────────');
  hubs.slice(0, 15).forEach(h => {
    console.log(`  ${h.iata} ${h.city.padEnd(20)} ${h.routes} intl routes in top 500`);
  });
}

main().catch(e => { console.error(e); process.exit(1); });
