#!/usr/bin/env node
/**
 * scripts/fetch-admin1-geo.js
 *
 * Downloads Natural Earth 10m admin-1 (states/provinces) GeoJSON,
 * splits it per country into individual TopoJSON files, and saves
 * them to public/admin1/{ISO2}.json.
 *
 * Each file contains the admin-1 boundaries for one country, with
 * properties: name, name_local, iso_3166_2, type_en, region (NUTS code if EU).
 *
 * Source: Natural Earth (public domain)
 *   https://www.naturalearthdata.com/downloads/10m-cultural-vectors/
 *
 * Usage: node scripts/fetch-admin1-geo.js
 */
'use strict';
const fs   = require('fs');
const path = require('path');
const { topology } = require('topojson-server');

const OUT_DIR = path.join(__dirname, '..', 'public', 'admin1');
const NE_URL  = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson';

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  Admin-1 boundary splitter (Natural Earth 10m)                    ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  // Download
  console.log('Downloading Natural Earth admin-1 GeoJSON …');
  const res = await fetch(NE_URL, {
    headers: { 'User-Agent': 'WorldDataMap/1.0 (educational)' },
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const geo = await res.json();
  console.log(`  ${geo.features.length} features downloaded\n`);

  // Group by ISO-A2
  const byCountry = {};
  let skipped = 0;
  for (const f of geo.features) {
    const p = f.properties || {};
    // iso_a2 is the 2-letter code; some features have '-99' for disputed areas
    let iso2 = (p.iso_a2 || '').toUpperCase();
    if (!iso2 || iso2 === '-1' || iso2 === '-99' || iso2.length !== 2) {
      // Try iso_3166_2 prefix (e.g., "US-CA" → "US")
      if (p.iso_3166_2 && p.iso_3166_2.length >= 2) {
        iso2 = p.iso_3166_2.slice(0, 2).toUpperCase();
      } else {
        skipped++;
        continue;
      }
    }
    if (!byCountry[iso2]) byCountry[iso2] = [];

    // Slim down properties
    byCountry[iso2].push({
      type: 'Feature',
      properties: {
        name:       p.name       || p.name_en || '',
        name_local: p.name_local || p.woe_label || '',
        code:       p.iso_3166_2 || '',
        type_en:    p.type_en    || '',
        region:     p.region     || '',     // NUTS code for EU countries
        gn_id:      p.geonamesid || null,
      },
      geometry: f.geometry,
    });
  }
  console.log(`Grouped into ${Object.keys(byCountry).length} countries (${skipped} features skipped)\n`);

  // Create output dir
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  // Convert each country to TopoJSON and save
  let totalSize = 0;
  const summary = [];
  for (const [iso2, features] of Object.entries(byCountry).sort()) {
    const geoCollection = { type: 'FeatureCollection', features };

    // Convert to TopoJSON (much smaller than GeoJSON)
    const topo = topology({ admin1: geoCollection }, 1e4); // quantization = 10k

    const outPath = path.join(OUT_DIR, `${iso2}.json`);
    const json = JSON.stringify(topo);
    fs.writeFileSync(outPath, json);

    const sizeKb = (json.length / 1024).toFixed(1);
    totalSize += json.length;
    summary.push({ iso2, regions: features.length, sizeKb: +sizeKb });
  }

  console.log(`── Written ${summary.length} country files to public/admin1/ ──`);
  console.log(`   Total size: ${(totalSize / 1024 / 1024).toFixed(2)} MB\n`);

  // Show top 10 largest
  summary.sort((a, b) => b.sizeKb - a.sizeKb);
  console.log('Top 10 largest:');
  for (const s of summary.slice(0, 10)) {
    console.log(`  ${s.iso2}: ${s.regions} regions, ${s.sizeKb} KB`);
  }

  // Show countries with >5 regions
  const withData = summary.filter(s => s.regions >= 5);
  console.log(`\n${withData.length} countries with 5+ admin-1 regions`);

  // Generate index file
  const index = {};
  for (const s of summary) {
    index[s.iso2] = { n: s.regions, kb: s.sizeKb };
  }
  const indexPath = path.join(OUT_DIR, '_index.json');
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  console.log(`\n✓ Index written to ${indexPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
