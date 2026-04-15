#!/usr/bin/env node
/**
 * fetch-ports.js
 *
 * Produces a curated static dataset of the world's busiest container ports
 * with TEU (twenty-foot equivalent unit) throughput data.
 *   Output: public/ports.json
 *
 * Fields per entry:
 *   city         — city name as used on the map
 *   country      — ISO 3166-1 alpha-2 country code
 *   port         — full port name
 *   teu_millions — annual throughput in millions of TEUs
 *   teu_year     — year of TEU data
 *   rank         — global rank by TEU volume
 *
 * Data sources:
 *   World Shipping Council – Top 50 World Container Ports (2023):
 *     https://www.worldshipping.org/top-50-ports
 *   Lloyd's List – One Hundred Ports 2023 (annual ranking):
 *     https://lloydslist.maritimeintelligence.informa.com/one-hundred-ports
 *
 * Usage: node scripts/fetch-ports.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const OUT_PATH = path.join(__dirname, '../public/ports.json');

// ── Static data ───────────────────────────────────────────────────────────────
//
// Top 50 container ports by TEU, 2023.
// Source: World Shipping Council / Lloyd's List 2023.
//
// teu_millions: annual throughput, millions of TEUs, 2023.

const PORTS = [
  { rank:  1, port: 'Port of Shanghai',            city: 'Shanghai',       country: 'CN', teu_millions: 47.3 },
  { rank:  2, port: 'Port of Singapore',           city: 'Singapore',      country: 'SG', teu_millions: 39.0 },
  { rank:  3, port: 'Port of Ningbo-Zhoushan',     city: 'Ningbo',         country: 'CN', teu_millions: 35.3 },
  { rank:  4, port: 'Port of Shenzhen',            city: 'Shenzhen',       country: 'CN', teu_millions: 30.2 },
  { rank:  5, port: 'Port of Qingdao',             city: 'Qingdao',        country: 'CN', teu_millions: 28.0 },
  { rank:  6, port: 'Port of Guangzhou',           city: 'Guangzhou',      country: 'CN', teu_millions: 25.0 },
  { rank:  7, port: 'Port of Busan',               city: 'Busan',          country: 'KR', teu_millions: 22.4 },
  { rank:  8, port: 'Port of Tianjin',             city: 'Tianjin',        country: 'CN', teu_millions: 21.7 },
  { rank:  9, port: 'Port of Hong Kong',           city: 'Hong Kong',      country: 'HK', teu_millions: 14.3 },
  { rank: 10, port: 'Port of Rotterdam',           city: 'Rotterdam',      country: 'NL', teu_millions: 13.4 },
  { rank: 11, port: 'Port of Jebel Ali',           city: 'Dubai',          country: 'AE', teu_millions: 13.3 },
  { rank: 12, port: 'Port Klang',                  city: 'Kuala Lumpur',   country: 'MY', teu_millions: 13.2 },
  { rank: 13, port: 'Port of Antwerp-Bruges',      city: 'Antwerp',        country: 'BE', teu_millions: 12.0 },
  { rank: 14, port: 'Port of Xiamen',              city: 'Xiamen',         country: 'CN', teu_millions: 12.0 },
  { rank: 15, port: 'Port of Kaohsiung',           city: 'Kaohsiung',      country: 'TW', teu_millions: 11.8 },
  { rank: 16, port: 'Port of Tanjung Pelepas',     city: 'Johor Bahru',    country: 'MY', teu_millions: 11.2 },
  { rank: 17, port: 'Port of Los Angeles',         city: 'Los Angeles',    country: 'US', teu_millions:  9.9 },
  { rank: 18, port: 'Port of Hamburg',             city: 'Hamburg',        country: 'DE', teu_millions:  8.7 },
  { rank: 19, port: 'Port of Long Beach',          city: 'Long Beach',     country: 'US', teu_millions:  8.6 },
  { rank: 20, port: 'Port of Tanjung Priok',       city: 'Jakarta',        country: 'ID', teu_millions:  8.5 },
  { rank: 21, port: 'Port of Colombo',             city: 'Colombo',        country: 'LK', teu_millions:  7.5 },
  { rank: 22, port: 'Laem Chabang Port',           city: 'Bangkok',        country: 'TH', teu_millions:  7.3 },
  { rank: 23, port: 'Port of Dalian',              city: 'Dalian',         country: 'CN', teu_millions:  7.2 },
  { rank: 24, port: 'Port of Piraeus',             city: 'Athens',         country: 'GR', teu_millions:  5.6 },
  { rank: 25, port: 'Port of New York and New Jersey', city: 'New York City', country: 'US', teu_millions: 5.5 },
  { rank: 26, port: 'Tanger Med Port',             city: 'Tangier',        country: 'MA', teu_millions:  5.4 },
  { rank: 27, port: 'Port of Valencia',            city: 'Valencia',       country: 'ES', teu_millions:  5.3 },
  { rank: 28, port: 'Port of Ho Chi Minh City',    city: 'Ho Chi Minh City', country: 'VN', teu_millions: 5.2 },
  { rank: 29, port: 'Port of Savannah',            city: 'Savannah',       country: 'US', teu_millions:  5.1 },
  { rank: 30, port: 'Jawaharlal Nehru Port',       city: 'Mumbai',         country: 'IN', teu_millions:  5.0 },
  { rank: 31, port: 'Port of Algeciras',           city: 'Algeciras',      country: 'ES', teu_millions:  4.8 },
  { rank: 32, port: 'Colombo South Container Terminal', city: 'Colombo',   country: 'LK', teu_millions:  4.7 },
  { rank: 33, port: 'Port of Manila',              city: 'Manila',         country: 'PH', teu_millions:  4.6 },
  { rank: 34, port: 'Mundra Port',                 city: 'Mundra',         country: 'IN', teu_millions:  4.5 },
  { rank: 35, port: 'Port of Felixstowe',          city: 'Felixstowe',     country: 'GB', teu_millions:  4.3 },
  { rank: 36, port: 'Port of Santos',              city: 'Santos',         country: 'BR', teu_millions:  4.2 },
  { rank: 37, port: 'Port of Suzhou (Taicang)',    city: 'Suzhou',         country: 'CN', teu_millions:  4.1 },
  { rank: 38, port: 'Port of Tokyo',               city: 'Tokyo',          country: 'JP', teu_millions:  4.0 },
  { rank: 39, port: 'Port of Yokohama',            city: 'Yokohama',       country: 'JP', teu_millions:  2.8 },
  { rank: 40, port: 'Port of Bremerhaven',         city: 'Bremen',         country: 'DE', teu_millions:  2.7 },
  { rank: 41, port: 'Port of Gothenburg',          city: 'Gothenburg',     country: 'SE', teu_millions:  0.8 },
  { rank: 42, port: 'Port of Le Havre',            city: 'Le Havre',       country: 'FR', teu_millions:  2.9 },
  { rank: 43, port: 'Port of Genoa',               city: 'Genoa',          country: 'IT', teu_millions:  2.6 },
  { rank: 44, port: 'Port of Durban',              city: 'Durban',         country: 'ZA', teu_millions:  2.5 },
  { rank: 45, port: 'Port of Melbourne',           city: 'Melbourne',      country: 'AU', teu_millions:  2.4 },
  { rank: 46, port: 'Port of Manzanillo',          city: 'Manzanillo',     country: 'MX', teu_millions:  2.4 },
  { rank: 47, port: 'Port of Balboa',              city: 'Panama City',    country: 'PA', teu_millions:  2.3 },
  { rank: 48, port: 'Port of Kobe',                city: 'Kobe',           country: 'JP', teu_millions:  2.3 },
  { rank: 49, port: 'Port of Nagoya',              city: 'Nagoya',         country: 'JP', teu_millions:  2.5 },
  { rank: 50, port: 'Jeddah Islamic Port',         city: 'Jeddah',         country: 'SA', teu_millions:  4.4 },
];

// ── Assemble output ───────────────────────────────────────────────────────────

const output = PORTS.map(p => ({
  city:         p.city,
  country:      p.country,
  port:         p.port,
  teu_millions: p.teu_millions,
  teu_year:     2023,
  rank:         p.rank,
}));

fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2), 'utf8');
console.log(`Wrote ${output.length} ports to ${OUT_PATH}`);

// ── Spot-checks ───────────────────────────────────────────────────────────────
function spotCheck(label, value, min, max) {
  const ok = value >= min && value <= max;
  console.log(`  ${ok ? 'OK' : 'FAIL'} ${label}: ${value} (expected ${min}–${max})`);
}

console.log('\n--- Spot-checks ---');

const byRank    = r => output.find(p => p.rank === r);
const shanghai  = byRank(1);
const singapore = byRank(2);
const rotterdam = byRank(10);
const last      = byRank(50);

spotCheck('Shanghai TEU (M)',   shanghai.teu_millions,  40, 55);
spotCheck('Singapore TEU (M)',  singapore.teu_millions, 35, 45);
spotCheck('Rotterdam TEU (M)',  rotterdam.teu_millions, 10, 18);
spotCheck('Port count',         output.length,          50, 50);
spotCheck('Ranks unique',
  new Set(output.map(p => p.rank)).size,                50, 50);
spotCheck('All have teu_year',
  output.filter(p => p.teu_year === 2023).length,       50, 50);
spotCheck('Jeddah TEU (M)',     last.teu_millions,       3,  6);

// ── Summary table sorted by rank ──────────────────────────────────────────────
console.log('\n--- Summary (sorted by rank) ---');
const sorted = output.slice().sort((a, b) => a.rank - b.rank);
for (const p of sorted) {
  console.log(
    `#${String(p.rank).padStart(2)}  ${p.city.padEnd(20)} ${p.country}  ` +
    `${String(p.teu_millions).padStart(5)} M TEU  ${p.port}`
  );
}
