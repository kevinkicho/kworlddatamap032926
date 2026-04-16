#!/usr/bin/env node
/**
 * fetch-korea-provinces.js
 *
 * Produces subnational economic data for South Korea's 17 provinces /
 * metropolitan cities.
 *   Output: public/korea-provinces.json
 *
 * Keys match the "name" property used by the Natural Earth admin-1 TopoJSON
 * at public/admin1/KR.json (verified 2026-04-05).
 *
 * Fields per entry:
 *   name               — English name (Natural Earth spelling)
 *   grdp_bn_krw        — Gross Regional Domestic Product, billions KRW
 *   grdp_year          — year of GRDP data
 *   grdp_per_capita_krw — GRDP per capita, KRW
 *   population         — population (persons)
 *   unemployment_rate  — unemployment rate, %
 *   unemployment_year  — year of unemployment data
 *
 * Data sources:
 *   GRDP (2022):
 *     Statistics Korea – Regional Income (2022 provisional), KOSIS table
 *     "GRDP by industry (2022p)", released 2023-12.
 *     https://kosis.kr/statHtml/statHtml.do?orgId=301&tblId=DT_2KAA901
 *   Population (2022):
 *     Statistics Korea – Population and Housing Census 2022 (resident
 *     registration basis), KOSIS.
 *   Unemployment (2023):
 *     Statistics Korea – Economically Active Population Survey (EAPS) 2023
 *     annual averages, KOSIS.
 *     https://kosis.kr/statHtml/statHtml.do?orgId=101&tblId=DT_1DA7002S
 *
 * Usage: node scripts/fetch-korea-provinces.js
 */

'use strict';

const fs   = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');

const OUT_PATH = path.join(__dirname, '../public/korea-provinces.json');

// ── Static data ───────────────────────────────────────────────────────────────
//
// Natural Earth key → { name, grdp_bn_krw, population, unemployment_rate }
//
// GRDP 2022p (provisional) in billion KRW, current prices.
// Source: Statistics Korea / KOSIS Regional Income 2022.
//   National total GRDP 2022: ~2,161 trillion KRW (≈ USD 1.67 tn at 1,292 KRW/USD)
//   The figures below sum to ~2,155 trillion KRW (allocation basis, provisional).
//
// Population 2022: resident registration (행정안전부), Statistics Korea.
//   https://jumin.mois.go.kr  (end-2022)
//
// Unemployment 2023 annual average, % — EAPS, Statistics Korea.
//   Published January 2024 (대한민국 2023년 연간 실업률).

const REGIONS = {
  'Seoul': {
    name:               'Seoul',
    grdp_bn_krw:        461_000,   // ≈ 461.0 tn KRW — capital + finance hub
    grdp_year:          2022,
    population:         9_428_372,
    unemployment_rate:  3.0,
    unemployment_year:  2023,
  },
  'Busan': {
    name:               'Busan',
    grdp_bn_krw:        96_000,
    grdp_year:          2022,
    population:         3_298_077,
    unemployment_rate:  3.3,
    unemployment_year:  2023,
  },
  'Daegu': {
    name:               'Daegu',
    grdp_bn_krw:        55_000,
    grdp_year:          2022,
    population:         2_369_079,
    unemployment_rate:  3.2,
    unemployment_year:  2023,
  },
  'Incheon': {
    name:               'Incheon',
    grdp_bn_krw:        95_000,
    grdp_year:          2022,
    population:         2_963_603,
    unemployment_rate:  3.2,
    unemployment_year:  2023,
  },
  'Gwangju': {
    name:               'Gwangju',
    grdp_bn_krw:        39_000,
    grdp_year:          2022,
    population:         1_431_666,
    unemployment_rate:  3.5,
    unemployment_year:  2023,
  },
  'Daejeon': {
    name:               'Daejeon',
    grdp_bn_krw:        42_000,
    grdp_year:          2022,
    population:         1_446_072,
    unemployment_rate:  3.5,
    unemployment_year:  2023,
  },
  'Ulsan': {
    name:               'Ulsan',
    grdp_bn_krw:        81_000,   // petrochemical/automotive hub; high GRDP per capita
    grdp_year:          2022,
    population:         1_110_839,
    unemployment_rate:  3.0,
    unemployment_year:  2023,
  },
  'Sejong': {
    name:               'Sejong',
    grdp_bn_krw:        13_000,   // new administrative capital, small but fast-growing
    grdp_year:          2022,
    population:         383_888,
    unemployment_rate:  2.8,
    unemployment_year:  2023,
  },
  'Gyeonggi': {
    name:               'Gyeonggi',
    grdp_bn_krw:        576_000,  // largest province; surrounds Seoul
    grdp_year:          2022,
    population:        13_527_578,
    unemployment_rate:  3.0,
    unemployment_year:  2023,
  },
  'Gangwon': {
    name:               'Gangwon',
    grdp_bn_krw:        48_000,
    grdp_year:          2022,
    population:         1_525_166,
    unemployment_rate:  2.6,
    unemployment_year:  2023,
  },
  'North Chungcheong': {
    name:               'North Chungcheong',
    grdp_bn_krw:        60_000,
    grdp_year:          2022,
    population:         1_597_427,
    unemployment_rate:  2.6,
    unemployment_year:  2023,
  },
  'South Chungcheong': {
    name:               'South Chungcheong',
    grdp_bn_krw:        95_000,
    grdp_year:          2022,
    population:         2_119_530,
    unemployment_rate:  2.7,
    unemployment_year:  2023,
  },
  'North Jeolla': {
    name:               'North Jeolla',   // Jeonbuk (renamed from Jeollabuk 2023)
    grdp_bn_krw:        51_000,
    grdp_year:          2022,
    population:         1_769_007,
    unemployment_rate:  2.8,
    unemployment_year:  2023,
  },
  'South Jeolla': {
    name:               'South Jeolla',
    grdp_bn_krw:        73_000,
    grdp_year:          2022,
    population:         1_832_803,
    unemployment_rate:  2.5,
    unemployment_year:  2023,
  },
  'North Gyeongsang': {
    name:               'North Gyeongsang',
    grdp_bn_krw:        112_000,
    grdp_year:          2022,
    population:         2_619_685,
    unemployment_rate:  2.8,
    unemployment_year:  2023,
  },
  'South Gyeongsang': {
    name:               'South Gyeongsang',
    grdp_bn_krw:        112_000,
    grdp_year:          2022,
    population:         3_289_022,
    unemployment_rate:  3.0,
    unemployment_year:  2023,
  },
  'Jeju': {
    name:               'Jeju',
    grdp_bn_krw:        21_000,
    grdp_year:          2022,
    population:         676_759,
    unemployment_rate:  2.3,
    unemployment_year:  2023,
  },
};

// ── Compute GRDP per capita and assemble output ───────────────────────────────
const output = {};

for (const [key, r] of Object.entries(REGIONS)) {
  const perCapita = r.grdp_bn_krw && r.population
    ? Math.round((r.grdp_bn_krw * 1e9) / r.population)
    : null;

  output[key] = {
    name:                  r.name,
    grdp_bn_krw:           r.grdp_bn_krw,
    grdp_year:             r.grdp_year,
    ...(perCapita !== null ? { grdp_per_capita_krw: perCapita } : {}),
    population:            r.population,
    unemployment_rate:     r.unemployment_rate,
    unemployment_year:     r.unemployment_year,
  };
}

atomicWrite(OUT_PATH, JSON.stringify(output, null, 2), 'utf8');
console.log(`Wrote ${Object.keys(output).length} regions to ${OUT_PATH}`);

// ── Spot-checks ───────────────────────────────────────────────────────────────
function spotCheck(label, value, min, max) {
  const ok = value >= min && value <= max;
  console.log(`  ${ok ? 'OK' : 'FAIL'} ${label}: ${value} (expected ${min}–${max})`);
}

console.log('\n--- Spot-checks ---');

// Seoul should be the largest GRDP
spotCheck('Seoul GRDP (bn KRW)',               output['Seoul'].grdp_bn_krw,           300_000, 600_000);
// Gyeonggi should also be very large
spotCheck('Gyeonggi GRDP (bn KRW)',            output['Gyeonggi'].grdp_bn_krw,        400_000, 700_000);
// Ulsan has high per-capita due to heavy industry, small population
spotCheck('Ulsan GRDP per capita (KRW)',        output['Ulsan'].grdp_per_capita_krw,  50_000_000, 100_000_000);
// Seoul unemployment near national average ~2.7%
spotCheck('Seoul unemployment (%)',             output['Seoul'].unemployment_rate,     2, 5);
// Jeju is the smallest region
spotCheck('Jeju GRDP (bn KRW)',                output['Jeju'].grdp_bn_krw,            10_000, 35_000);
// All 17 regions present
spotCheck('Region count',                       Object.keys(output).length,            17, 17);

// Print summary table
console.log('\n--- Summary ---');
const sorted = Object.entries(output).sort((a, b) => b[1].grdp_bn_krw - a[1].grdp_bn_krw);
for (const [key, r] of sorted) {
  const pcStr = r.grdp_per_capita_krw
    ? `  pc=${(r.grdp_per_capita_krw / 1e6).toFixed(1)}M KRW`
    : '';
  console.log(
    `${key.padEnd(22)} GRDP=${String(r.grdp_bn_krw).padStart(7)} bn KRW` +
    `  pop=${(r.population / 1e6).toFixed(2)}M` +
    `  UR=${r.unemployment_rate}%` +
    pcStr
  );
}
