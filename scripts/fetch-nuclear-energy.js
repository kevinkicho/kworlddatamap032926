#!/usr/bin/env node
/**
 * scripts/fetch-nuclear-energy.js
 *
 * Merges nuclear energy data into public/country-data.json.
 *
 * Source: IAEA PRIS (Power Reactor Information System) 2024
 *
 * Keys added per country:
 *   nuclear_reactors      — number of operating reactors
 *   nuclear_capacity_gw   — total net electrical capacity (GW)
 *   nuclear_generation_twh — annual nuclear generation (TWh)
 *   nuclear_year          — data year
 *
 * Usage: node scripts/fetch-nuclear-energy.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const OUT_FILE = path.join(__dirname, '..', 'public', 'country-data.json');

// ── IAEA PRIS 2024 curated data ────────────────────────────────────────────
// r = operating reactors, cap = net capacity (GW), gen = annual generation (TWh)
const DATA = {
  US: { r: 93, cap: 95.8, gen: 775.4 },
  FR: { r: 56, cap: 61.4, gen: 320.4 },
  CN: { r: 55, cap: 53.2, gen: 433.4 },
  JP: { r: 12, cap: 11.0, gen: 68.7 },
  RU: { r: 37, cap: 28.6, gen: 223.5 },
  KR: { r: 26, cap: 25.8, gen: 186.2 },
  IN: { r: 23, cap: 7.5, gen: 48.7 },
  CA: { r: 19, cap: 13.6, gen: 87.4 },
  UA: { r: 15, cap: 13.1, gen: 74.3 },
  GB: { r: 9, cap: 5.9, gen: 37.4 },
  SE: { r: 6, cap: 6.9, gen: 50.3 },
  ES: { r: 7, cap: 7.1, gen: 55.8 },
  BE: { r: 5, cap: 3.9, gen: 33.2 },
  CZ: { r: 6, cap: 3.9, gen: 30.6 },
  FI: { r: 5, cap: 4.4, gen: 34.8 },
  CH: { r: 4, cap: 3.0, gen: 23.3 },
  PK: { r: 6, cap: 3.5, gen: 25.7 },
  SK: { r: 5, cap: 2.3, gen: 15.4 },
  HU: { r: 4, cap: 1.9, gen: 15.1 },
  BG: { r: 2, cap: 2.0, gen: 16.1 },
  BR: { r: 2, cap: 1.9, gen: 14.6 },
  ZA: { r: 2, cap: 1.9, gen: 11.6 },
  RO: { r: 2, cap: 1.3, gen: 10.4 },
  AR: { r: 3, cap: 1.6, gen: 8.4 },
  MX: { r: 2, cap: 1.6, gen: 12.7 },
  SI: { r: 1, cap: 0.7, gen: 5.9 },
  NL: { r: 1, cap: 0.5, gen: 3.8 },
  AE: { r: 4, cap: 5.6, gen: 36.2 },
  BD: { r: 1, cap: 1.1, gen: 0.0 },  // Rooppur-1 recently connected
  AM: { r: 1, cap: 0.4, gen: 2.8 },
  IR: { r: 1, cap: 0.9, gen: 5.2 },
  EG: { r: 0, cap: 0.0, gen: 0.0 },  // El Dabaa under construction
  TR: { r: 0, cap: 0.0, gen: 0.0 },  // Akkuyu under construction
  PL: { r: 0, cap: 0.0, gen: 0.0 },  // Planned
};

const YEAR = 2024;

// ── Main ──────────────────────────────────────────────────────────────────
function main() {
  console.log('Merging IAEA PRIS 2024 nuclear energy data into country-data.json …');

  const out = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
  let merged = 0;

  for (const [iso2, val] of Object.entries(DATA)) {
    if (!out[iso2]) continue;
    if (val.r === 0) continue; // skip countries with 0 operating reactors
    out[iso2].nuclear_reactors      = val.r;
    out[iso2].nuclear_capacity_gw   = val.cap;
    out[iso2].nuclear_generation_twh = val.gen;
    out[iso2].nuclear_year          = YEAR;
    merged++;
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), 'utf8');
  console.log(`  ${merged} countries merged`);
  console.log('Done.');
}

main();
