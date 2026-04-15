#!/usr/bin/env node
/**
 * scripts/fetch-submarine-cables.js
 *
 * Downloads submarine cable routes and landing points from TeleGeography's
 * public API and writes public/submarine-cables.json.
 *
 * Output structure:
 *   { cables: [{id, name, color, coords: [[lng,lat],...]}],
 *     landings: [{id, name, lat, lng}] }
 *
 * Source: TeleGeography Submarine Cable Map (submarinecablemap.com)
 *   API: https://www.submarinecablemap.com/api/v3/
 *
 * The geometry is simplified (Douglas-Peucker) to reduce file size from
 * ~700 KB to ~300 KB while preserving visual fidelity at map zoom levels.
 *
 * Usage: node scripts/fetch-submarine-cables.js
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const OUT_PATH = path.join(__dirname, '..', 'public', 'submarine-cables.json');

const CABLE_URL   = 'https://www.submarinecablemap.com/api/v3/cable/cable-geo.json';
const LANDING_URL = 'https://www.submarinecablemap.com/api/v3/landing-point/landing-point-geo.json';

async function apiFetch(url, label) {
  process.stdout.write(`  Fetching ${label} … `);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'WorldDataMap/1.0 (educational)' },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const json = await res.json();
  console.log(`${json.features.length} features`);
  return json;
}

// Douglas-Peucker line simplification (tolerance in degrees)
function simplifyLine(coords, tolerance) {
  if (coords.length <= 2) return coords;
  let maxDist = 0, maxIdx = 0;
  const [x1, y1] = coords[0];
  const [x2, y2] = coords[coords.length - 1];
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;

  for (let i = 1; i < coords.length - 1; i++) {
    const [px, py] = coords[i];
    let dist;
    if (lenSq === 0) {
      dist = Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
    } else {
      const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
      const projX = x1 + t * dx, projY = y1 + t * dy;
      dist = Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
    }
    if (dist > maxDist) { maxDist = dist; maxIdx = i; }
  }

  if (maxDist > tolerance) {
    const left  = simplifyLine(coords.slice(0, maxIdx + 1), tolerance);
    const right = simplifyLine(coords.slice(maxIdx), tolerance);
    return left.slice(0, -1).concat(right);
  }
  return [coords[0], coords[coords.length - 1]];
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  Submarine Cables fetcher (TeleGeography)                        ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  const [cableGeo, landingGeo] = await Promise.all([
    apiFetch(CABLE_URL, 'cables'),
    apiFetch(LANDING_URL, 'landing points'),
  ]);

  // Process cables: merge multi-segment cables, simplify geometry
  console.log('\n── Processing cables ────────────────────────────────────────────────');
  const cableMap = {};
  let totalPointsBefore = 0;
  for (const f of cableGeo.features) {
    const { id, name, color } = f.properties;
    if (!cableMap[id]) cableMap[id] = { id, name, color, segments: [] };
    const geom = f.geometry;
    if (geom.type === 'MultiLineString') {
      for (const line of geom.coordinates) {
        totalPointsBefore += line.length;
        cableMap[id].segments.push(line);
      }
    } else if (geom.type === 'LineString') {
      totalPointsBefore += geom.coordinates.length;
      cableMap[id].segments.push(geom.coordinates);
    }
  }

  // Simplify each segment (tolerance ~0.05° ≈ 5km at equator)
  const TOLERANCE = 0.05;
  let totalPointsAfter = 0;
  const cables = [];
  for (const c of Object.values(cableMap)) {
    const simplified = c.segments.map(seg => {
      // Round coords to 4 decimal places (~11m precision)
      const s = simplifyLine(seg, TOLERANCE);
      return s.map(([lng, lat]) => [+lng.toFixed(4), +lat.toFixed(4)]);
    });
    totalPointsAfter += simplified.reduce((s, seg) => s + seg.length, 0);
    cables.push({ id: c.id, name: c.name, color: c.color, segments: simplified });
  }
  console.log(`  ${Object.keys(cableMap).length} unique cables`);
  console.log(`  Points: ${totalPointsBefore} → ${totalPointsAfter} (${((1 - totalPointsAfter / totalPointsBefore) * 100).toFixed(0)}% reduction)`);

  // Process landing points
  console.log('\n── Processing landing points ────────────────────────────────────────');
  const landings = landingGeo.features.map(f => ({
    id:   f.properties.id,
    name: f.properties.name,
    lat:  +f.geometry.coordinates[1].toFixed(4),
    lng:  +f.geometry.coordinates[0].toFixed(4),
  }));
  console.log(`  ${landings.length} landing points`);

  // Write output
  const output = { cables, landings };
  const json = JSON.stringify(output);
  fs.writeFileSync(OUT_PATH, json);
  console.log(`\n✓ Written ${(json.length / 1024).toFixed(0)} KB to ${OUT_PATH}`);

  // Spot-check
  console.log('\n── Spot-check (first 10 cables) ────────────────────────────────────');
  cables.slice(0, 10).forEach(c => {
    const pts = c.segments.reduce((s, seg) => s + seg.length, 0);
    console.log(`  ${c.name.padEnd(35)} ${c.segments.length} seg  ${pts} pts  ${c.color}`);
  });
}

main().catch(e => { console.error(e); process.exit(1); });
