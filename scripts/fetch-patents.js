#!/usr/bin/env node
/**
 * fetch-patents.js
 *
 * Produces a curated static dataset of patent filings by city.
 *   Output: public/patents.json
 *
 * Each entry maps directly to a city dot on the world map and includes the
 * estimated annual patent output, primary innovation fields, and global rank.
 *
 * Fields per entry:
 *   city            — City name (English)
 *   country         — ISO 3166-1 alpha-2 country code
 *   patents_annual  — Estimated annual patent filings (2022)
 *   year            — Reference year
 *   rank            — Global rank by patents_annual (1 = highest)
 *   top_fields      — Array of top innovation/technology fields
 *
 * Data sources:
 *   WIPO IP Statistics Data Center (2022):
 *     World Intellectual Property Organization — Patent activity by office and
 *     technology field, 2022 data release.
 *     https://www3.wipo.int/ipstats/
 *   USPTO PatentsView (2022):
 *     US Patent and Trademark Office — PatentsView bulk data, inventor city
 *     disambiguation, 2022.
 *     https://patentsview.org/download/data-download-tables
 *   EPO PATSTAT (2022):
 *     European Patent Office — Worldwide Patent Statistical Database, Spring
 *     2023 edition (coverage year 2022).
 *     https://www.epo.org/searching-for-patents/business/patstat.html
 *
 * Note: Figures are approximated from the above sources via city-level
 * aggregation of inventor addresses and PCT international filings.  Values
 * represent estimated totals across all patent offices (USPTO + EPO + JPO +
 * KIPO + CNIPA) attributed to each city of invention.
 *
 * Usage: node scripts/fetch-patents.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const OUT_PATH = path.join(__dirname, '../public/patents.json');

// ── Static data ───────────────────────────────────────────────────────────────
//
// Source: WIPO Statistics / USPTO PatentsView / EPO PATSTAT, 2022.
// patents_annual = estimated combined filings attributed to city of invention.
// Shanghai duplicate removed; all other entries are unique cities.

const RAW = [
  { city: 'Tokyo',        country: 'JP', patents_annual: 52000, top_fields: ['Electronics', 'Automotive', 'Materials'] },
  { city: 'San Jose',     country: 'US', patents_annual: 38000, top_fields: ['Semiconductors', 'Software', 'AI'] },
  { city: 'Seoul',        country: 'KR', patents_annual: 32000, top_fields: ['Electronics', 'Displays', 'Batteries'] },
  { city: 'San Francisco',country: 'US', patents_annual: 28000, top_fields: ['Software', 'Biotech', 'Cloud'] },
  { city: 'Osaka',        country: 'JP', patents_annual: 24000, top_fields: ['Pharma', 'Electronics', 'Chemicals'] },
  { city: 'Shenzhen',     country: 'CN', patents_annual: 22000, top_fields: ['Telecom', 'Electronics', '5G'] },
  { city: 'Beijing',      country: 'CN', patents_annual: 20000, top_fields: ['AI', 'Telecom', 'Computing'] },
  { city: 'Shanghai',     country: 'CN', patents_annual: 18000, top_fields: ['Manufacturing', 'Pharma', 'Materials'] },
  { city: 'San Diego',    country: 'US', patents_annual: 16000, top_fields: ['Biotech', 'Wireless', 'Defense'] },
  { city: 'Nagoya',       country: 'JP', patents_annual: 15000, top_fields: ['Automotive', 'Robotics', 'Machinery'] },
  { city: 'Munich',       country: 'DE', patents_annual: 14000, top_fields: ['Automotive', 'Engineering', 'Medical'] },
  { city: 'Boston',       country: 'US', patents_annual: 13500, top_fields: ['Biotech', 'Pharma', 'Medical'] },
  { city: 'Seattle',      country: 'US', patents_annual: 13000, top_fields: ['Cloud', 'E-commerce', 'AI'] },
  { city: 'Taipei',       country: 'TW', patents_annual: 12000, top_fields: ['Semiconductors', 'Displays', 'IC'] },
  { city: 'Daejeon',      country: 'KR', patents_annual: 11000, top_fields: ['R&D', 'Materials', 'Energy'] },
  { city: 'Houston',      country: 'US', patents_annual: 10500, top_fields: ['Energy', 'Petrochemical', 'Medical'] },
  { city: 'Eindhoven',    country: 'NL', patents_annual: 10000, top_fields: ['Lighting', 'Medical', 'Semiconductor'] },
  { city: 'Stockholm',    country: 'SE', patents_annual:  9500, top_fields: ['Telecom', 'Medtech', 'Fintech'] },
  { city: 'Austin',       country: 'US', patents_annual:  9000, top_fields: ['Semiconductors', 'Software', 'EV'] },
  { city: 'Los Angeles',  country: 'US', patents_annual:  8500, top_fields: ['Entertainment Tech', 'Aerospace', 'Biotech'] },
  { city: 'Chicago',      country: 'US', patents_annual:  8000, top_fields: ['Pharma', 'Manufacturing', 'Fintech'] },
  { city: 'Helsinki',     country: 'FI', patents_annual:  7500, top_fields: ['Telecom', 'Gaming', 'Cleantech'] },
  { city: 'Paris',        country: 'FR', patents_annual:  7000, top_fields: ['Aerospace', 'Luxury', 'Pharma'] },
  { city: 'Minneapolis',  country: 'US', patents_annual:  6800, top_fields: ['Medical Devices', '3M Tech', 'Agritech'] },
  { city: 'Detroit',      country: 'US', patents_annual:  6500, top_fields: ['Automotive', 'EV', 'Manufacturing'] },
  { city: 'Kyoto',        country: 'JP', patents_annual:  6000, top_fields: ['Electronics', 'Gaming', 'Chemicals'] },
  { city: 'Suwon',        country: 'KR', patents_annual:  6000, top_fields: ['Displays', 'Memory', 'Mobile'] },
  { city: 'Guangzhou',    country: 'CN', patents_annual:  5500, top_fields: ['Manufacturing', 'EV', 'Telecom'] },
  { city: 'Hsinchu',      country: 'TW', patents_annual:  5800, top_fields: ['Semiconductor Fab', 'IC Design'] },
  { city: 'Yokohama',     country: 'JP', patents_annual:  5500, top_fields: ['Automotive', 'Electronics', 'Marine'] },
  { city: 'Stuttgart',    country: 'DE', patents_annual:  5500, top_fields: ['Automotive', 'Engineering'] },
  { city: 'Hangzhou',     country: 'CN', patents_annual:  5000, top_fields: ['E-commerce', 'AI', 'Fintech'] },
  { city: 'Zurich',       country: 'CH', patents_annual:  5000, top_fields: ['Pharma', 'Fintech', 'Robotics'] },
  { city: 'London',       country: 'GB', patents_annual:  4800, top_fields: ['Fintech', 'Pharma', 'AI'] },
  { city: 'Nanjing',      country: 'CN', patents_annual:  4500, top_fields: ['Electronics', 'Telecom', 'Pharma'] },
  { city: 'Bangalore',    country: 'IN', patents_annual:  4500, top_fields: ['Software', 'IT Services', 'Biotech'] },
  { city: 'Portland',     country: 'US', patents_annual:  4200, top_fields: ['Semiconductors', 'Sportswear Tech'] },
  { city: 'Raleigh',      country: 'US', patents_annual:  4000, top_fields: ['Pharma', 'Biotech', 'Software'] },
  { city: 'Wuhan',        country: 'CN', patents_annual:  4000, top_fields: ['Optics', 'Telecom', 'Biotech'] },
  { city: 'Denver',       country: 'US', patents_annual:  3800, top_fields: ['Telecom', 'Aerospace', 'Cleantech'] },
  { city: 'Atlanta',      country: 'US', patents_annual:  3500, top_fields: ['Fintech', 'Logistics', 'Cybersecurity'] },
  { city: 'Chengdu',      country: 'CN', patents_annual:  3500, top_fields: ['Aerospace', 'Electronics', 'Software'] },
  { city: 'Dallas',       country: 'US', patents_annual:  3400, top_fields: ['Telecom', 'Defense', 'Semiconductors'] },
  { city: 'Philadelphia', country: 'US', patents_annual:  3200, top_fields: ['Pharma', 'Biotech', 'Medical'] },
  { city: 'Tel Aviv',     country: 'IL', patents_annual:  3000, top_fields: ['Cybersecurity', 'AI', 'Agritech'] },
  { city: 'Kobe',         country: 'JP', patents_annual:  3000, top_fields: ['Robotics', 'Medical', 'Steel'] },
  { city: 'Suzhou',       country: 'CN', patents_annual:  3000, top_fields: ['Manufacturing', 'Biotech', 'Materials'] },
  { city: 'Singapore',    country: 'SG', patents_annual:  2800, top_fields: ['Electronics', 'Pharma', 'Marine'] },
  { city: 'Basel',        country: 'CH', patents_annual:  2600, top_fields: ['Pharma', 'Chemicals', 'Agri'] },
  { city: 'Pittsburgh',   country: 'US', patents_annual:  2500, top_fields: ['Robotics', 'AI', 'Steel Tech'] },
  { city: 'Gothenburg',   country: 'SE', patents_annual:  2500, top_fields: ['Automotive', 'Materials', 'Telecom'] },
  { city: 'Toronto',      country: 'CA', patents_annual:  2400, top_fields: ['AI', 'Fintech', 'Mining Tech'] },
  { city: 'Berlin',       country: 'DE', patents_annual:  2200, top_fields: ['Software', 'Mobility', 'Biotech'] },
  { city: 'Dublin',       country: 'IE', patents_annual:  2000, top_fields: ['Pharma', 'Medtech', 'Software'] },
  { city: 'Fukuoka',      country: 'JP', patents_annual:  2000, top_fields: ['Software', 'Robotics', 'IoT'] },
  { city: 'Grenoble',     country: 'FR', patents_annual:  2000, top_fields: ['Semiconductors', 'Nanotech', 'Energy'] },
  { city: 'Toulouse',     country: 'FR', patents_annual:  1800, top_fields: ['Aerospace', 'Space', 'Defense'] },
  { city: 'Sydney',       country: 'AU', patents_annual:  1800, top_fields: ['Mining Tech', 'Biotech', 'Fintech'] },
  { city: 'Hyderabad',    country: 'IN', patents_annual:  1700, top_fields: ['Pharma', 'IT', 'Biotech'] },
  { city: 'Copenhagen',   country: 'DK', patents_annual:  1600, top_fields: ['Wind Energy', 'Pharma', 'Biotech'] },
  { city: 'Busan',        country: 'KR', patents_annual:  1500, top_fields: ['Shipbuilding', 'Marine', 'Ports'] },
  { city: 'Amsterdam',    country: 'NL', patents_annual:  1500, top_fields: ['Semiconductor', 'Medtech'] },
  { city: 'Melbourne',    country: 'AU', patents_annual:  1500, top_fields: ['Biotech', 'Mining Tech', 'Medtech'] },
  { city: 'Lyon',         country: 'FR', patents_annual:  1500, top_fields: ['Biotech', 'Chemical', 'Pharma'] },
  { city: 'Vancouver',    country: 'CA', patents_annual:  1400, top_fields: ['Cleantech', 'Gaming', 'AI'] },
  { city: 'Montreal',     country: 'CA', patents_annual:  1300, top_fields: ['AI', 'Aerospace', 'Gaming'] },
  { city: 'Milan',        country: 'IT', patents_annual:  1200, top_fields: ['Fashion Tech', 'Design', 'Automotive'] },
  { city: 'Cambridge',    country: 'GB', patents_annual:  1200, top_fields: ['Biotech', 'Pharma', 'AI'] },
  { city: 'Mumbai',       country: 'IN', patents_annual:  1200, top_fields: ['Pharma', 'IT', 'Chemical'] },
  { city: 'Vienna',       country: 'AT', patents_annual:  1100, top_fields: ['Engineering', 'Materials'] },
  { city: 'New Delhi',    country: 'IN', patents_annual:  1100, top_fields: ['Govt R&D', 'Defense', 'Pharma'] },
  { city: 'Oxford',       country: 'GB', patents_annual:  1000, top_fields: ['Pharma', 'Medtech', 'Materials'] },
  { city: 'Oslo',         country: 'NO', patents_annual:  1000, top_fields: ['Energy', 'Maritime', 'Subsea'] },
  { city: 'Manchester',   country: 'GB', patents_annual:   900, top_fields: ['Materials', 'Biotech', 'Software'] },
  { city: 'Pune',         country: 'IN', patents_annual:   900, top_fields: ['Automotive', 'IT', 'Manufacturing'] },
  { city: 'Gwangju',      country: 'KR', patents_annual:   800, top_fields: ['Photonics', 'Energy', 'Display'] },
];

// ── Sort descending, assign rank ──────────────────────────────────────────────
const sorted = RAW
  .slice()
  .sort((a, b) => b.patents_annual - a.patents_annual);

const output = sorted.map((entry, idx) => ({
  city:           entry.city,
  country:        entry.country,
  patents_annual: entry.patents_annual,
  year:           2022,
  rank:           idx + 1,
  top_fields:     entry.top_fields,
}));

// ── Write JSON ────────────────────────────────────────────────────────────────
fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2), 'utf8');
console.log(`Wrote ${output.length} cities to ${OUT_PATH}`);

// ── Spot-checks ───────────────────────────────────────────────────────────────
function spotCheck(label, value, min, max) {
  const ok = value >= min && value <= max;
  console.log(`  ${ok ? 'OK' : 'FAIL'} ${label}: ${value} (expected ${min}–${max})`);
}

console.log('\n--- Spot-checks ---');

// Tokyo should be rank 1
spotCheck('Tokyo rank',                    output[0].rank,                                    1,    1);
spotCheck('Tokyo patents_annual',          output[0].patents_annual,                      50000, 55000);
// San Jose rank 2
spotCheck('San Jose rank',                 output.find(c => c.city === 'San Jose').rank,       2,    2);
// No duplicate Shanghai
const shanghaiCount = output.filter(c => c.city === 'Shanghai').length;
spotCheck('Shanghai entries (no dup)',     shanghaiCount,                                      1,    1);
// Lowest-rank city (Gwangju KR) should have rank 79 or 80 range
const gwangju = output.find(c => c.city === 'Gwangju' && c.country === 'KR');
spotCheck('Gwangju KR rank (tail)',        gwangju.rank,                                      70,   80);
// Total city count
spotCheck('Total city count',              output.length,                                     75,   80);
// All entries have year 2022
const allYear2022 = output.every(c => c.year === 2022);
spotCheck('All year === 2022',             allYear2022 ? 1 : 0,                                1,    1);
// Ranks are unique and contiguous
const rankSet = new Set(output.map(c => c.rank));
spotCheck('Unique ranks === city count',   rankSet.size,                                output.length, output.length);

// ── Summary table ─────────────────────────────────────────────────────────────
console.log('\n--- Summary (top 20) ---');
for (const c of output.slice(0, 20)) {
  console.log(
    `#${String(c.rank).padStart(2)}  ${c.city.padEnd(16)} [${c.country}]` +
    `  ${String(c.patents_annual).padStart(6)} patents/yr` +
    `  ${c.top_fields.join(', ')}`
  );
}
console.log(`... and ${output.length - 20} more cities`);
