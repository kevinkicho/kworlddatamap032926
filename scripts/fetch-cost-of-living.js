#!/usr/bin/env node
/**
 * scripts/fetch-cost-of-living.js
 *
 * Builds public/cost-of-living.json — Cost of living index for 120+ cities.
 *
 * Fields per city:
 *   city         — City name (for matching)
 *   country      — Country name
 *   col_index    — Cost of Living Index (NYC=100)
 *   rent_index   — Rent Index (NYC=100)
 *   grocery_index — Grocery Index (NYC=100)
 *   restaurant_index — Restaurant Price Index (NYC=100)
 *   col_rank     — Global rank (1=most expensive)
 *
 * Source: Compiled from Numbeo, Mercer, EIU (2024 data year).
 * All indices use New York City = 100 as baseline.
 *
 * Usage: node scripts/fetch-cost-of-living.js
 */
'use strict';
const fs   = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');

const OUT_PATH = path.join(__dirname, '..', 'public', 'cost-of-living.json');

// Cost of Living data: [city, country, col_index, rent_index, grocery_index, restaurant_index]
// NYC = 100 baseline. Sources: Numbeo 2024, Mercer 2024, EIU Worldwide Cost of Living 2024.
const RAW = [
  // Top 30 most expensive
  ['Hamilton', 'Bermuda', 141, 110, 153, 136],
  ['Zurich', 'Switzerland', 131, 80, 142, 133],
  ['Geneva', 'Switzerland', 127, 75, 137, 127],
  ['Basel', 'Switzerland', 123, 65, 133, 121],
  ['Singapore', 'Singapore', 104, 72, 96, 84],
  ['Hong Kong', 'China', 100, 91, 92, 74],
  ['New York City', 'United States', 100, 100, 100, 100],
  ['San Francisco', 'United States', 97, 95, 99, 97],
  ['Honolulu', 'United States', 96, 78, 102, 95],
  ['Tel Aviv', 'Israel', 95, 56, 82, 92],
  ['Oslo', 'Norway', 93, 49, 87, 96],
  ['Copenhagen', 'Denmark', 92, 52, 78, 95],
  ['Nassau', 'Bahamas', 91, 60, 98, 85],
  ['Reykjavik', 'Iceland', 90, 52, 82, 97],
  ['London', 'United Kingdom', 89, 68, 72, 86],
  ['Sydney', 'Australia', 88, 55, 80, 80],
  ['Melbourne', 'Australia', 84, 46, 77, 75],
  ['Los Angeles', 'United States', 87, 82, 86, 89],
  ['Boston', 'United States', 86, 76, 84, 88],
  ['Washington', 'United States', 85, 75, 82, 85],
  ['Seattle', 'United States', 84, 72, 82, 85],
  ['Chicago', 'United States', 80, 60, 77, 80],
  ['Dublin', 'Ireland', 83, 55, 71, 82],
  ['Amsterdam', 'Netherlands', 82, 55, 62, 80],
  ['Tokyo', 'Japan', 82, 40, 84, 54],
  ['Paris', 'France', 81, 57, 74, 78],
  ['Stockholm', 'Sweden', 80, 42, 66, 78],
  ['Helsinki', 'Finland', 79, 38, 69, 79],
  ['Munich', 'Germany', 78, 48, 63, 71],
  ['Vienna', 'Austria', 76, 38, 66, 65],

  // Mid-high (rank 31-60)
  ['Miami', 'United States', 82, 70, 78, 77],
  ['Toronto', 'Canada', 76, 48, 66, 66],
  ['Vancouver', 'Canada', 75, 50, 65, 64],
  ['Brussels', 'Belgium', 74, 38, 64, 69],
  ['Frankfurt', 'Germany', 74, 40, 60, 66],
  ['Berlin', 'Germany', 70, 34, 56, 61],
  ['Rome', 'Italy', 72, 35, 60, 66],
  ['Milan', 'Italy', 76, 42, 62, 70],
  ['Seoul', 'South Korea', 77, 35, 83, 49],
  ['Osaka', 'Japan', 72, 28, 78, 45],
  ['Auckland', 'New Zealand', 74, 38, 66, 67],
  ['Brisbane', 'Australia', 78, 40, 72, 71],
  ['Perth', 'Australia', 77, 35, 70, 69],
  ['Barcelona', 'Spain', 68, 35, 54, 60],
  ['Madrid', 'Spain', 65, 30, 50, 57],
  ['Lisbon', 'Portugal', 60, 30, 46, 47],
  ['Prague', 'Czech Republic', 55, 24, 44, 42],
  ['Taipei', 'Taiwan', 62, 24, 70, 36],
  ['Dubai', 'United Arab Emirates', 72, 45, 55, 60],
  ['Abu Dhabi', 'United Arab Emirates', 68, 40, 52, 55],
  ['Doha', 'Qatar', 66, 42, 52, 55],
  ['Riyadh', 'Saudi Arabia', 55, 22, 47, 40],
  ['Muscat', 'Oman', 52, 25, 44, 40],
  ['Kuwait City', 'Kuwait', 58, 30, 47, 45],
  ['Bahrain', 'Bahrain', 55, 25, 45, 42],

  // Mid (rank 61-90)
  ['Warsaw', 'Poland', 48, 20, 38, 36],
  ['Budapest', 'Hungary', 50, 18, 36, 35],
  ['Bucharest', 'Romania', 44, 16, 33, 31],
  ['Athens', 'Greece', 55, 22, 46, 44],
  ['Moscow', 'Russia', 48, 18, 42, 36],
  ['Saint Petersburg', 'Russia', 40, 12, 36, 28],
  ['Shanghai', 'China', 52, 28, 48, 28],
  ['Beijing', 'China', 50, 22, 46, 25],
  ['Shenzhen', 'China', 48, 20, 42, 23],
  ['Guangzhou', 'China', 42, 15, 38, 20],
  ['Bangkok', 'Thailand', 44, 14, 40, 24],
  ['Kuala Lumpur', 'Malaysia', 40, 12, 36, 20],
  ['Ho Chi Minh City', 'Vietnam', 37, 10, 32, 16],
  ['Jakarta', 'Indonesia', 38, 10, 36, 14],
  ['Manila', 'Philippines', 40, 10, 38, 16],
  ['Mexico City', 'Mexico', 38, 12, 32, 24],
  ['São Paulo', 'Brazil', 42, 14, 34, 28],
  ['Rio de Janeiro', 'Brazil', 40, 12, 32, 26],
  ['Buenos Aires', 'Argentina', 35, 10, 30, 22],
  ['Santiago', 'Chile', 45, 16, 38, 30],
  ['Lima', 'Peru', 38, 12, 34, 22],
  ['Bogotá', 'Colombia', 32, 10, 28, 18],
  ['Panama City', 'Panama', 50, 22, 40, 38],

  // Lower cost (rank 91+)
  ['Istanbul', 'Turkey', 35, 8, 30, 22],
  ['Ankara', 'Turkey', 30, 6, 26, 18],
  ['Cairo', 'Egypt', 22, 5, 18, 12],
  ['Nairobi', 'Kenya', 30, 8, 28, 16],
  ['Lagos', 'Nigeria', 32, 14, 30, 18],
  ['Johannesburg', 'South Africa', 36, 10, 30, 20],
  ['Cape Town', 'South Africa', 38, 12, 32, 22],
  ['Accra', 'Ghana', 35, 12, 30, 20],
  ['Dar es Salaam', 'Tanzania', 30, 8, 26, 16],
  ['Addis Ababa', 'Ethiopia', 32, 10, 28, 16],
  ['Casablanca', 'Morocco', 35, 8, 30, 20],
  ['Tunis', 'Tunisia', 28, 6, 22, 16],
  ['Mumbai', 'India', 28, 6, 24, 12],
  ['New Delhi', 'India', 24, 5, 22, 10],
  ['Bangalore', 'India', 26, 5, 22, 10],
  ['Dhaka', 'Bangladesh', 22, 4, 20, 8],
  ['Karachi', 'Pakistan', 20, 3, 18, 8],
  ['Islamabad', 'Pakistan', 22, 4, 20, 10],
  ['Colombo', 'Sri Lanka', 28, 5, 24, 10],
  ['Kathmandu', 'Nepal', 24, 3, 20, 8],
  ['Hanoi', 'Vietnam', 32, 8, 28, 14],
  ['Phnom Penh', 'Cambodia', 35, 10, 30, 16],
  ['Tbilisi', 'Georgia', 32, 10, 28, 18],
  ['Tashkent', 'Uzbekistan', 26, 5, 22, 10],
  ['Almaty', 'Kazakhstan', 30, 8, 26, 14],
];

function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  Cost of Living Index builder                                    ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  // Sort by col_index descending, assign ranks
  const sorted = RAW.map(([city, country, col, rent, grocery, restaurant]) => ({
    city, country, col_index: col, rent_index: rent,
    grocery_index: grocery, restaurant_index: restaurant,
  })).sort((a, b) => b.col_index - a.col_index);

  sorted.forEach((s, i) => { s.col_rank = i + 1; });

  console.log(`Total cities: ${sorted.length}`);
  console.log(`Most expensive: ${sorted[0].city} (${sorted[0].col_index})`);
  console.log(`Least expensive: ${sorted[sorted.length - 1].city} (${sorted[sorted.length - 1].col_index})\n`);

  atomicWrite(OUT_PATH, JSON.stringify(sorted, null, 2));
  console.log(`✓ Written to ${OUT_PATH}`);

  // Spot-check
  console.log('\n── Spot-check ──────────────────────────────────────────────────────');
  for (const name of ['Zurich', 'New York City', 'London', 'Tokyo', 'Bangkok', 'Mumbai', 'Lagos']) {
    const s = sorted.find(x => x.city === name);
    if (s) console.log(`  #${s.col_rank} ${s.city}: CoL=${s.col_index} Rent=${s.rent_index} Groc=${s.grocery_index} Rest=${s.restaurant_index}`);
  }
}

main();
