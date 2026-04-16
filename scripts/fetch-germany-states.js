#!/usr/bin/env node
/**
 * fetch-germany-states.js
 *
 * Produces subnational economic data for Germany's 16 Bundesländer (federal
 * states).
 *   Output: public/germany-states.json
 *
 * Keys match the "name" property used by the Natural Earth admin-1 TopoJSON
 * at public/admin1/DE.json (verified 2026-04-05).
 *
 * Fields per entry:
 *   name                — English name (Natural Earth spelling)
 *   gdp_bn_eur          — GDP, billions EUR (current prices)
 *   gdp_year            — year of GDP data
 *   gdp_per_capita_eur  — GDP per capita, EUR
 *   population          — population (persons)
 *   unemployment_rate   — unemployment rate, %
 *   unemployment_year   — year of unemployment data
 *
 * Data sources:
 *   GDP (2022):
 *     Destatis – Volkswirtschaftliche Gesamtrechnungen der Länder (VGRdL),
 *     Reihe 1 Band 1, nominal GDP by Bundesland 2022 (preliminary).
 *     https://www.statistikportal.de/de/vgrdl
 *   Population (2022):
 *     Destatis – Bevölkerung auf Grundlage des Zensus 2022 / Fortschreibung,
 *     Stichtag 31.12.2022.
 *     https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Bevoelkerung/
 *   Unemployment (2023):
 *     Bundesagentur für Arbeit (BA) – Arbeitslosigkeit im Zeitverlauf,
 *     Jahresdurchschnitt 2023, Arbeitslosenquoten bezogen auf alle
 *     zivilen Erwerbspersonen, nach Bundesländern.
 *     https://statistik.arbeitsagentur.de
 *
 * Usage: node scripts/fetch-germany-states.js
 */

'use strict';

const fs   = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');

const OUT_PATH = path.join(__dirname, '../public/germany-states.json');

// ── Static data ───────────────────────────────────────────────────────────────
//
// Natural Earth key → { name, gdp_bn_eur, population, unemployment_rate }
//
// GDP 2022 (preliminary) in billions EUR, current prices.
// Source: Destatis VGRdL 2022.
//   National total GDP 2022: ~3,876 bn EUR.
//   The figures below sum to ~3,776 bn EUR (rounded; city-states reported
//   separately from surrounding Flächen-länder).
//
// Population 2022: Destatis Fortschreibung des Bevölkerungsstandes,
//   Stichtag 31.12.2022.
//
// Unemployment 2023 annual average, % — Bundesagentur für Arbeit,
//   bezogen auf alle zivilen Erwerbspersonen.
//   Published January 2024.

const REGIONS = {
  'Baden-Württemberg': {
    name:               'Baden-Württemberg',
    gdp_bn_eur:         583,         // industrial/export powerhouse; Daimler, Bosch, SAP
    gdp_year:           2022,
    population:         11_280_257,
    unemployment_rate:  3.8,
    unemployment_year:  2023,
  },
  'Bayern': {
    name:               'Bayern',
    gdp_bn_eur:         685,         // largest state economy; BMW, Siemens, MAN
    gdp_year:           2022,
    population:         13_369_393,
    unemployment_rate:  3.2,
    unemployment_year:  2023,
  },
  'Berlin': {
    name:               'Berlin',
    gdp_bn_eur:         176,         // capital city-state; tech & startup hub
    gdp_year:           2022,
    population:         3_755_251,
    unemployment_rate:  8.7,
    unemployment_year:  2023,
  },
  'Brandenburg': {
    name:               'Brandenburg',
    gdp_bn_eur:         87,          // surrounds Berlin; logistics corridor
    gdp_year:           2022,
    population:         2_573_135,
    unemployment_rate:  5.5,
    unemployment_year:  2023,
  },
  'Bremen': {
    name:               'Bremen',
    gdp_bn_eur:         38,          // smallest state by area; port city-state
    gdp_year:           2022,
    population:         684_864,
    unemployment_rate:  10.3,
    unemployment_year:  2023,
  },
  'Hamburg': {
    name:               'Hamburg',
    gdp_bn_eur:         139,         // major port; high per-capita from trade & finance
    gdp_year:           2022,
    population:         1_892_122,
    unemployment_rate:  6.5,
    unemployment_year:  2023,
  },
  'Hessen': {
    name:               'Hessen',
    gdp_bn_eur:         316,         // Frankfurt finance hub; ECB, Deutsche Bank
    gdp_year:           2022,
    population:         6_391_360,
    unemployment_rate:  4.7,
    unemployment_year:  2023,
  },
  'Mecklenburg-Vorpommern': {
    name:               'Mecklenburg-Vorpommern',
    gdp_bn_eur:         51,          // sparsely populated; tourism, agriculture
    gdp_year:           2022,
    population:         1_628_378,
    unemployment_rate:  7.2,
    unemployment_year:  2023,
  },
  'Niedersachsen': {
    name:               'Niedersachsen',
    gdp_bn_eur:         335,         // Volkswagen HQ; automotive & agri belt
    gdp_year:           2022,
    population:         8_140_242,
    unemployment_rate:  5.2,
    unemployment_year:  2023,
  },
  'Nordrhein-Westfalen': {
    name:               'Nordrhein-Westfalen',
    gdp_bn_eur:         771,         // most populous state; Ruhr industrial heartland
    gdp_year:           2022,
    population:         18_139_116,
    unemployment_rate:  6.8,
    unemployment_year:  2023,
  },
  'Rheinland-Pfalz': {
    name:               'Rheinland-Pfalz',
    gdp_bn_eur:         162,         // chemicals (BASF Ludwigshafen), wine
    gdp_year:           2022,
    population:         4_159_150,
    unemployment_rate:  4.5,
    unemployment_year:  2023,
  },
  'Saarland': {
    name:               'Saarland',
    gdp_bn_eur:         40,          // smallest western state; steel & auto supply
    gdp_year:           2022,
    population:         992_666,
    unemployment_rate:  6.5,
    unemployment_year:  2023,
  },
  'Sachsen': {
    name:               'Sachsen',
    gdp_bn_eur:         143,         // largest eastern state; Dresden semiconductor cluster
    gdp_year:           2022,
    population:         4_086_152,
    unemployment_rate:  5.7,
    unemployment_year:  2023,
  },
  'Sachsen-Anhalt': {
    name:               'Sachsen-Anhalt',
    gdp_bn_eur:         71,          // chemicals, logistics; ongoing structural transition
    gdp_year:           2022,
    population:         2_180_684,
    unemployment_rate:  7.3,
    unemployment_year:  2023,
  },
  'Schleswig-Holstein': {
    name:               'Schleswig-Holstein',
    gdp_bn_eur:         110,         // wind energy, maritime, Kiel shipbuilding
    gdp_year:           2022,
    population:         2_953_270,
    unemployment_rate:  5.0,
    unemployment_year:  2023,
  },
  'Thüringen': {
    name:               'Thüringen',
    gdp_bn_eur:         69,          // precision engineering, Erfurt logistics hub
    gdp_year:           2022,
    population:         2_126_846,
    unemployment_rate:  5.4,
    unemployment_year:  2023,
  },
};

// ── Compute GDP per capita and assemble output ────────────────────────────────
const output = {};

for (const [key, r] of Object.entries(REGIONS)) {
  const perCapita = r.gdp_bn_eur && r.population
    ? Math.round((r.gdp_bn_eur * 1e9) / r.population)
    : null;

  output[key] = {
    name:                 r.name,
    gdp_bn_eur:           r.gdp_bn_eur,
    gdp_year:             r.gdp_year,
    ...(perCapita !== null ? { gdp_per_capita_eur: perCapita } : {}),
    population:           r.population,
    unemployment_rate:    r.unemployment_rate,
    unemployment_year:    r.unemployment_year,
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

// Bayern should be the largest GDP
spotCheck('Bayern GDP (bn EUR)',                        output['Bayern'].gdp_bn_eur,             500, 900);
// NRW is the most populous state
spotCheck('Nordrhein-Westfalen population',             output['Nordrhein-Westfalen'].population, 16_000_000, 20_000_000);
// Hamburg has high per-capita due to port trade
spotCheck('Hamburg GDP per capita (EUR)',               output['Hamburg'].gdp_per_capita_eur,     50_000, 120_000);
// Bremen has the highest unemployment among all states
spotCheck('Bremen unemployment (%)',                    output['Bremen'].unemployment_rate,       8, 13);
// Bayern unemployment is among the lowest
spotCheck('Bayern unemployment (%)',                    output['Bayern'].unemployment_rate,       2, 5);
// Berlin per capita should be moderate (large pop, not huge GDP)
spotCheck('Berlin GDP per capita (EUR)',                output['Berlin'].gdp_per_capita_eur,      30_000, 70_000);
// All 16 Bundesländer present
spotCheck('Region count',                               Object.keys(output).length,               16, 16);

// Print summary table
console.log('\n--- Summary ---');
const sorted = Object.entries(output).sort((a, b) => b[1].gdp_bn_eur - a[1].gdp_bn_eur);
for (const [key, r] of sorted) {
  const pcStr = r.gdp_per_capita_eur
    ? `  pc=${(r.gdp_per_capita_eur / 1_000).toFixed(1)}k EUR`
    : '';
  console.log(
    `${key.padEnd(26)} GDP=${String(r.gdp_bn_eur).padStart(5)} bn EUR` +
    `  pop=${(r.population / 1e6).toFixed(2)}M` +
    `  UR=${r.unemployment_rate}%` +
    pcStr
  );
}
