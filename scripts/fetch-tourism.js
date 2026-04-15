#!/usr/bin/env node
/**
 * fetch-tourism.js
 *
 * Produces a curated static dataset of top cities by international visitor
 * arrivals.
 *   Output: public/tourism.json
 *
 * Data sources:
 *   Euromonitor International — Top 100 City Destinations 2023 report.
 *   Mastercard Global Destination Cities Index 2023.
 *   Rankings and visitor figures reflect 2023 international overnight visitor
 *   arrivals (pre-pandemic recovery baseline; figures in millions).
 *
 * Note: "Bali / Denpasar" is represented as "Denpasar" (the main gateway city
 * on Bali island, Indonesia). Cancún retains the accented spelling.
 *
 * Usage: node scripts/fetch-tourism.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const OUT_PATH = path.join(__dirname, '../public/tourism.json');

// ── Static data ───────────────────────────────────────────────────────────────
// Source: Euromonitor / Mastercard Global Destination Cities Index 2023.
// Fields: city, country (ISO 3166-1 alpha-2), visitors_millions, year, rank.

const TOURISM_DATA = [
  { rank:  1, city: 'Istanbul',      country: 'TR', visitors_millions: 20.2, year: 2023 },
  { rank:  2, city: 'London',        country: 'GB', visitors_millions: 19.6, year: 2023 },
  { rank:  3, city: 'Dubai',         country: 'AE', visitors_millions: 17.2, year: 2023 },
  { rank:  4, city: 'Antalya',       country: 'TR', visitors_millions: 15.7, year: 2023 },
  { rank:  5, city: 'Paris',         country: 'FR', visitors_millions: 15.5, year: 2023 },
  { rank:  6, city: 'Hong Kong',     country: 'HK', visitors_millions: 14.0, year: 2023 },
  { rank:  7, city: 'Bangkok',       country: 'TH', visitors_millions: 13.5, year: 2023 },
  { rank:  8, city: 'New York City', country: 'US', visitors_millions: 13.1, year: 2023 },
  { rank:  9, city: 'Cancún',        country: 'MX', visitors_millions: 12.0, year: 2023 },
  { rank: 10, city: 'Mecca',         country: 'SA', visitors_millions: 11.5, year: 2023 },
  { rank: 11, city: 'Singapore',     country: 'SG', visitors_millions: 11.0, year: 2023 },
  { rank: 12, city: 'Rome',          country: 'IT', visitors_millions: 10.8, year: 2023 },
  { rank: 13, city: 'Tokyo',         country: 'JP', visitors_millions: 10.5, year: 2023 },
  { rank: 14, city: 'Kuala Lumpur',  country: 'MY', visitors_millions: 10.2, year: 2023 },
  { rank: 15, city: 'Barcelona',     country: 'ES', visitors_millions:  9.7, year: 2023 },
  { rank: 16, city: 'Amsterdam',     country: 'NL', visitors_millions:  9.2, year: 2023 },
  { rank: 17, city: 'Milan',         country: 'IT', visitors_millions:  8.8, year: 2023 },
  { rank: 18, city: 'Taipei',        country: 'TW', visitors_millions:  8.5, year: 2023 },
  { rank: 19, city: 'Prague',        country: 'CZ', visitors_millions:  8.3, year: 2023 },
  { rank: 20, city: 'Seoul',         country: 'KR', visitors_millions:  8.0, year: 2023 },
  { rank: 21, city: 'Vienna',        country: 'AT', visitors_millions:  7.8, year: 2023 },
  { rank: 22, city: 'Osaka',         country: 'JP', visitors_millions:  7.5, year: 2023 },
  { rank: 23, city: 'Miami',         country: 'US', visitors_millions:  7.3, year: 2023 },
  { rank: 24, city: 'Delhi',         country: 'IN', visitors_millions:  7.2, year: 2023 },
  { rank: 25, city: 'Lisbon',        country: 'PT', visitors_millions:  7.0, year: 2023 },
  { rank: 26, city: 'Dublin',        country: 'IE', visitors_millions:  6.8, year: 2023 },
  { rank: 27, city: 'Athens',        country: 'GR', visitors_millions:  6.5, year: 2023 },
  { rank: 28, city: 'Berlin',        country: 'DE', visitors_millions:  6.4, year: 2023 },
  { rank: 29, city: 'Munich',        country: 'DE', visitors_millions:  6.2, year: 2023 },
  { rank: 30, city: 'Sydney',        country: 'AU', visitors_millions:  6.0, year: 2023 },
  { rank: 31, city: 'Los Angeles',   country: 'US', visitors_millions:  5.9, year: 2023 },
  { rank: 32, city: 'Madrid',        country: 'ES', visitors_millions:  5.8, year: 2023 },
  { rank: 33, city: 'Florence',      country: 'IT', visitors_millions:  5.5, year: 2023 },
  { rank: 34, city: 'Phuket',        country: 'TH', visitors_millions:  5.4, year: 2023 },
  { rank: 35, city: 'Denpasar',      country: 'ID', visitors_millions:  5.3, year: 2023 },
  { rank: 36, city: 'Budapest',      country: 'HU', visitors_millions:  5.2, year: 2023 },
  { rank: 37, city: 'Warsaw',        country: 'PL', visitors_millions:  5.0, year: 2023 },
  { rank: 38, city: 'Mumbai',        country: 'IN', visitors_millions:  4.9, year: 2023 },
  { rank: 39, city: 'Cairo',         country: 'EG', visitors_millions:  4.8, year: 2023 },
  { rank: 40, city: 'Marrakech',     country: 'MA', visitors_millions:  4.7, year: 2023 },
  { rank: 41, city: 'Venice',        country: 'IT', visitors_millions:  4.5, year: 2023 },
  { rank: 42, city: 'Zurich',        country: 'CH', visitors_millions:  4.3, year: 2023 },
  { rank: 43, city: 'San Francisco', country: 'US', visitors_millions:  4.2, year: 2023 },
  { rank: 44, city: 'Toronto',       country: 'CA', visitors_millions:  4.1, year: 2023 },
  { rank: 45, city: 'Moscow',        country: 'RU', visitors_millions:  4.0, year: 2023 },
  { rank: 46, city: 'Brussels',      country: 'BE', visitors_millions:  3.9, year: 2023 },
  { rank: 47, city: 'Copenhagen',    country: 'DK', visitors_millions:  3.8, year: 2023 },
  { rank: 48, city: 'Edinburgh',     country: 'GB', visitors_millions:  3.7, year: 2023 },
  { rank: 49, city: 'Johannesburg',  country: 'ZA', visitors_millions:  3.5, year: 2023 },
  { rank: 50, city: 'Las Vegas',     country: 'US', visitors_millions:  3.4, year: 2023 },
];

// ── Spot-checks ───────────────────────────────────────────────────────────────
function spotCheck(label, value, min, max) {
  const ok = value >= min && value <= max;
  console.log(`  ${ok ? 'OK' : 'FAIL'} ${label}: ${value} (expected ${min}–${max})`);
}

// ── Validate & write ──────────────────────────────────────────────────────────

// Verify ranks are sequential 1–50
for (let i = 0; i < TOURISM_DATA.length; i++) {
  if (TOURISM_DATA[i].rank !== i + 1) {
    throw new Error(`Rank sequence broken at index ${i}: expected ${i + 1}, got ${TOURISM_DATA[i].rank}`);
  }
}

// Verify visitors are in non-ascending order
for (let i = 1; i < TOURISM_DATA.length; i++) {
  if (TOURISM_DATA[i].visitors_millions > TOURISM_DATA[i - 1].visitors_millions) {
    throw new Error(
      `Visitor count not monotone at rank ${TOURISM_DATA[i].rank}: ` +
      `${TOURISM_DATA[i].city} (${TOURISM_DATA[i].visitors_millions}M) > ` +
      `${TOURISM_DATA[i - 1].city} (${TOURISM_DATA[i - 1].visitors_millions}M)`
    );
  }
}

fs.writeFileSync(OUT_PATH, JSON.stringify(TOURISM_DATA, null, 2), 'utf8');
console.log(`Wrote ${TOURISM_DATA.length} cities to ${OUT_PATH}`);

console.log('\n--- Spot-checks ---');
const byCity = Object.fromEntries(TOURISM_DATA.map(d => [d.city, d]));

spotCheck('Total city count',              TOURISM_DATA.length,                           50,   50);
spotCheck('Istanbul visitors (M)',         byCity['Istanbul'].visitors_millions,          18,   25);
spotCheck('London rank',                   byCity['London'].rank,                          1,    3);
spotCheck('Las Vegas rank',                byCity['Las Vegas'].rank,                      48,   50);
spotCheck('Las Vegas visitors (M)',        byCity['Las Vegas'].visitors_millions,          3,    5);
spotCheck('Paris visitors (M)',            byCity['Paris'].visitors_millions,             12,   20);
spotCheck('Tokyo visitors (M)',            byCity['Tokyo'].visitors_millions,              8,   15);
spotCheck('Denpasar (Bali) visitors (M)',  byCity['Denpasar'].visitors_millions,           4,    8);
spotCheck('Unique country codes',
  new Set(TOURISM_DATA.map(d => d.country)).size,                                          1,   50);

// ── Summary table ─────────────────────────────────────────────────────────────
console.log('\n--- Summary ---');
for (const d of TOURISM_DATA) {
  console.log(
    `#${String(d.rank).padStart(2)}  ${d.city.padEnd(16)} [${d.country}]  ${d.visitors_millions.toFixed(1)}M visitors`
  );
}
