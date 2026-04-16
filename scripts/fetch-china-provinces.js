#!/usr/bin/env node
/**
 * fetch-china-provinces.js
 *
 * Produces subnational economic data for China's 31 provinces, municipalities,
 * and autonomous regions:
 *   public/china-provinces.json
 *
 * Data source: China National Bureau of Statistics (NBS) Statistical Yearbook 2023.
 *   GDP:            NBS Statistical Yearbook 2023, Table 3-1 (Regional GDP)
 *   Population:     NBS Statistical Yearbook 2023, Table 2-6 (Population by Region)
 *   Urbanization:   NBS Statistical Yearbook 2023, Table 2-11 (Urbanization by Region)
 *   GDP per capita: NBS Statistical Yearbook 2023, Table 3-3 (Per Capita GDP by Region)
 *
 * The NBS does not provide a reliable English REST API; figures are hardcoded
 * from published 2023 yearbook data. All GDP figures are in current prices.
 *
 * Keys match the `name` property in public/admin1/CN.json (Natural Earth data).
 *
 * Usage: node scripts/fetch-china-provinces.js
 */

'use strict';

const fs   = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');

const OUT = path.join(__dirname, '../public/china-provinces.json');

// ── 2023 NBS Statistical Yearbook data ───────────────────────────────────────
//
// GDP figures are in billions of CNY (current prices, 2023).
// Population in millions (year-end 2023).
// Urban population rate (%, 2023).
// GDP per capita in CNY (2023).
//
// Sources:
//   GDP:            NBS 2023 Statistical Yearbook, Table 3-1
//   GDP per capita: NBS 2023 Statistical Yearbook, Table 3-3
//   Population:     NBS 2023 Statistical Yearbook, Table 2-6
//   Urbanization:   NBS 2023 Statistical Yearbook, Table 2-11
//
// Keys use the exact `name` property from public/admin1/CN.json.
// ─────────────────────────────────────────────────────────────────────────────

const PROVINCE_DATA = {
  // ── Municipalities ─────────────────────────────────────────────────────────
  Beijing: {
    gdp_bn_cny:        4409.4,
    gdp_per_capita_cny: 200117,
    population_m:       21.84,
    urban_pct:          87.6,
  },
  Tianjin: {
    gdp_bn_cny:        1638.4,
    gdp_per_capita_cny: 113714,
    population_m:       13.60,
    urban_pct:          85.1,
  },
  Shanghai: {
    gdp_bn_cny:        4722.0,
    gdp_per_capita_cny: 190321,
    population_m:       24.74,
    urban_pct:          89.3,
  },
  Chongqing: {
    gdp_bn_cny:        3005.7,
    gdp_per_capita_cny:  92112,
    population_m:       32.08,
    urban_pct:          70.8,
  },

  // ── North China ────────────────────────────────────────────────────────────
  Hebei: {
    gdp_bn_cny:        4382.0,
    gdp_per_capita_cny:  59549,
    population_m:       74.10,
    urban_pct:          60.1,
  },
  Shanxi: {
    gdp_bn_cny:        2573.0,
    gdp_per_capita_cny:  73437,
    population_m:       34.68,
    urban_pct:          62.6,
  },
  'Inner Mongol': {
    gdp_bn_cny:        2312.0,
    gdp_per_capita_cny:  94268,
    population_m:       24.04,
    urban_pct:          69.6,
  },

  // ── Northeast China ────────────────────────────────────────────────────────
  Liaoning: {
    gdp_bn_cny:        3003.0,
    gdp_per_capita_cny:  69971,
    population_m:       41.97,
    urban_pct:          74.6,
  },
  Jilin: {
    gdp_bn_cny:        1326.8,
    gdp_per_capita_cny:  55275,
    population_m:       23.05,
    urban_pct:          68.1,
  },
  Heilongjiang: {
    gdp_bn_cny:        1613.9,
    gdp_per_capita_cny:  49015,
    population_m:       31.49,
    urban_pct:          64.3,
  },

  // ── East China ─────────────────────────────────────────────────────────────
  Jiangsu: {
    gdp_bn_cny:       12822.0,
    gdp_per_capita_cny: 150390,
    population_m:       85.15,
    urban_pct:          74.4,
  },
  Zhejiang: {
    gdp_bn_cny:        8260.0,
    gdp_per_capita_cny: 126583,
    population_m:       65.97,
    urban_pct:          73.4,
  },
  Anhui: {
    gdp_bn_cny:        4711.3,
    gdp_per_capita_cny:  75220,
    population_m:       61.27,
    urban_pct:          60.3,
  },
  Fujian: {
    gdp_bn_cny:        5418.4,
    gdp_per_capita_cny: 127690,
    population_m:       41.98,
    urban_pct:          70.1,
  },
  Jiangxi: {
    gdp_bn_cny:        3222.0,
    gdp_per_capita_cny:  71070,
    population_m:       44.56,
    urban_pct:          59.8,
  },
  Shandong: {
    gdp_bn_cny:        9209.0,
    gdp_per_capita_cny:  90705,
    population_m:      101.65,
    urban_pct:          64.3,
  },

  // ── Central China ──────────────────────────────────────────────────────────
  Henan: {
    gdp_bn_cny:        5914.0,
    gdp_per_capita_cny:  59896,
    population_m:       98.72,
    urban_pct:          58.1,
  },
  Hubei: {
    gdp_bn_cny:        5820.0,
    gdp_per_capita_cny:  99846,
    population_m:       58.44,
    urban_pct:          65.2,
  },
  Hunan: {
    gdp_bn_cny:        5007.2,
    gdp_per_capita_cny:  74454,
    population_m:       65.68,
    urban_pct:          60.3,
  },

  // ── South China ────────────────────────────────────────────────────────────
  Guangdong: {
    gdp_bn_cny:       13570.0,
    gdp_per_capita_cny: 106426,
    population_m:      127.58,
    urban_pct:          74.8,
  },
  Guangxi: {
    gdp_bn_cny:        2627.1,
    gdp_per_capita_cny:  51494,
    population_m:       50.44,
    urban_pct:          56.0,
  },
  Hainan: {
    gdp_bn_cny:         727.4,
    gdp_per_capita_cny:  71691,
    population_m:       10.17,
    urban_pct:          61.2,
  },

  // ── Southwest China ────────────────────────────────────────────────────────
  Sichuan: {
    gdp_bn_cny:        6011.0,
    gdp_per_capita_cny:  71367,
    population_m:       83.74,
    urban_pct:          58.4,
  },
  Guizhou: {
    gdp_bn_cny:        2082.9,
    gdp_per_capita_cny:  55158,
    population_m:       38.54,
    urban_pct:          54.3,
  },
  Yunnan: {
    gdp_bn_cny:        2958.7,
    gdp_per_capita_cny:  62806,
    population_m:       47.09,
    urban_pct:          53.8,
  },
  Xizang: {
    gdp_bn_cny:         213.3,
    gdp_per_capita_cny:  57216,
    population_m:        3.66,
    urban_pct:          38.1,
  },

  // ── Northwest China ────────────────────────────────────────────────────────
  Shaanxi: {
    gdp_bn_cny:        3393.3,
    gdp_per_capita_cny:  86250,
    population_m:       39.57,
    urban_pct:          65.0,
  },
  Gansu: {
    gdp_bn_cny:        1187.2,
    gdp_per_capita_cny:  47859,
    population_m:       24.54,
    urban_pct:          52.4,
  },
  Qinghai: {
    gdp_bn_cny:         367.0,
    gdp_per_capita_cny:  61321,
    population_m:        5.92,
    urban_pct:          55.5,
  },
  Ningxia: {
    gdp_bn_cny:         512.8,
    gdp_per_capita_cny:  70561,
    population_m:        7.24,
    urban_pct:          65.4,
  },
  Xinjiang: {
    gdp_bn_cny:        1986.2,
    gdp_per_capita_cny:  77336,
    population_m:       25.84,
    urban_pct:          56.5,
  },
};

// ── Build output keyed by Natural Earth `name` property ──────────────────────
function buildOutput() {
  const output = {};

  for (const [name, data] of Object.entries(PROVINCE_DATA)) {
    output[name] = {
      name,
      gdp_bn_cny:        data.gdp_bn_cny,
      gdp_year:          2023,
      gdp_per_capita_cny: data.gdp_per_capita_cny,
      population_m:       data.population_m,
      urban_pct:          data.urban_pct,
      data_source:       'NBS China Statistical Yearbook 2023',
    };
  }

  return output;
}

// ── Spot-check helper ─────────────────────────────────────────────────────────
function spotCheck(label, value, min, max) {
  const ok = value >= min && value <= max;
  console.log(`  ${ok ? '✓' : '✗'} ${label}: ${value} (expected ${min}–${max})`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
function main() {
  console.log('fetch-china-provinces.js starting...');

  const output = buildOutput();
  const count  = Object.keys(output).length;

  console.log(`\n  Built data for ${count} regions`);

  if (count !== 31) {
    console.warn(`  WARNING: expected 31 regions, got ${count}`);
  }

  atomicWrite(OUT, JSON.stringify(output, null, 2), 'utf8');
  console.log(`  Wrote ${OUT}`);

  console.log('\n=== Spot-checks ===');
  spotCheck('Guangdong GDP ($bn CNY)',   output.Guangdong.gdp_bn_cny,   12000, 15000);
  spotCheck('Jiangsu GDP ($bn CNY)',     output.Jiangsu.gdp_bn_cny,     11000, 14000);
  spotCheck('Shandong GDP ($bn CNY)',    output.Shandong.gdp_bn_cny,     8000, 11000);
  spotCheck('Zhejiang GDP ($bn CNY)',    output.Zhejiang.gdp_bn_cny,     7000, 10000);
  spotCheck('Beijing GDP ($bn CNY)',     output.Beijing.gdp_bn_cny,      3500,  5000);
  spotCheck('Shanghai GDP ($bn CNY)',    output.Shanghai.gdp_bn_cny,     4000,  5500);
  spotCheck('Xizang GDP ($bn CNY)',      output.Xizang.gdp_bn_cny,        150,   300);
  spotCheck('Guangdong pop (M)',         output.Guangdong.population_m,   110,   135);
  spotCheck('Shanghai urban %',         output.Shanghai.urban_pct,        85,   95);
  spotCheck('Beijing GDP/cap (CNY)',     output.Beijing.gdp_per_capita_cny, 170000, 230000);
  spotCheck('Inner Mongol name present', output['Inner Mongol'] ? 1 : 0,   1,     1);
  spotCheck('Total region count',        count, 31, 31);

  console.log('\nDone.');
}

main();
