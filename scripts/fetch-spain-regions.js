#!/usr/bin/env node
/**
 * fetch-spain-regions.js
 *
 * Produces subnational economic data for Spain's 17 autonomous communities
 * plus 2 autonomous cities (Ceuta & Melilla).
 *   Output: public/spain-regions.json
 *
 * Keys match Natural Earth province names in public/admin1/ES.json.
 * Since admin1/ES.json uses provinces (NUTS-3), we include a
 * province_to_region mapping so the app can look up community-level data
 * from a province name.
 *
 * Fields per community:
 *   name                — English name
 *   gdp_bn_eur          — GDP, billions EUR (current prices)
 *   gdp_year            — year of GDP data
 *   gdp_per_capita_eur  — GDP per capita, EUR
 *   population          — population (persons)
 *   unemployment_rate   — unemployment rate, %
 *   unemployment_year   — year of unemployment data
 *
 * Data sources:
 *   GDP (2023): INE — Contabilidad Regional de España, PIB a precios
 *     de mercado por comunidades autónomas. Current prices.
 *     https://www.ine.es/dyngs/INEbase/es/operacion.htm?c=Estadistica_C&cid=1254736167628
 *   Population (2024): INE — Cifras de Población, 1 January 2024.
 *     https://www.ine.es/jaxiT3/Datos.htm?t=2853
 *   Unemployment (2024 Q1): INE — Encuesta de Población Activa (EPA),
 *     tasa de paro por comunidades autónomas, 2024-Q1.
 *     https://www.ine.es/jaxiT3/Datos.htm?t=4247
 *
 * Usage: node scripts/fetch-spain-regions.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const OUT_PATH = path.join(__dirname, '../public/spain-regions.json');

// ── Province → Autonomous Community mapping ──────────────────────────────────
// Keys must match Natural Earth admin1/ES.json property.name values exactly.
const PROVINCE_TO_REGION = {
  // Andalucía
  'Almería': 'Andalucía', 'Cádiz': 'Andalucía', 'Córdoba': 'Andalucía',
  'Granada': 'Andalucía', 'Huelva': 'Andalucía', 'Jaén': 'Andalucía',
  'Málaga': 'Andalucía', 'Sevilla': 'Andalucía',
  // Aragón
  'Huesca': 'Aragón', 'Teruel': 'Aragón', 'Zaragoza': 'Aragón',
  // Asturias
  'Asturias': 'Asturias',
  // Baleares
  'Baleares': 'Illes Balears',
  // Canarias
  'Las Palmas': 'Canarias', 'Santa Cruz de Tenerife': 'Canarias',
  // Cantabria
  'Cantabria': 'Cantabria',
  // Castilla y León
  'Ávila': 'Castilla y León', 'Burgos': 'Castilla y León',
  'León': 'Castilla y León', 'Palencia': 'Castilla y León',
  'Salamanca': 'Castilla y León', 'Segovia': 'Castilla y León',
  'Soria': 'Castilla y León', 'Valladolid': 'Castilla y León',
  'Zamora': 'Castilla y León',
  // Castilla-La Mancha
  'Albacete': 'Castilla-La Mancha', 'Ciudad Real': 'Castilla-La Mancha',
  'Cuenca': 'Castilla-La Mancha', 'Guadalajara': 'Castilla-La Mancha',
  'Toledo': 'Castilla-La Mancha',
  // Cataluña
  'Barcelona': 'Cataluña', 'Gerona': 'Cataluña',
  'Lérida': 'Cataluña', 'Tarragona': 'Cataluña',
  // Comunitat Valenciana
  'Alicante': 'Comunitat Valenciana', 'Castellón': 'Comunitat Valenciana',
  'Valencia': 'Comunitat Valenciana',
  // Extremadura
  'Badajoz': 'Extremadura', 'Cáceres': 'Extremadura',
  // Galicia
  'La Coruña': 'Galicia', 'Lugo': 'Galicia',
  'Orense': 'Galicia', 'Pontevedra': 'Galicia',
  // Madrid
  'Madrid': 'Comunidad de Madrid',
  // Murcia
  'Murcia': 'Región de Murcia',
  // Navarra
  'Navarra': 'Navarra',
  // País Vasco
  'Álava': 'País Vasco', 'Gipuzkoa': 'País Vasco', 'Bizkaia': 'País Vasco',
  // La Rioja
  'La Rioja': 'La Rioja',
  // Ceuta & Melilla
  'Ceuta': 'Ceuta', 'Melilla': 'Melilla',
};

// ── Static data: Autonomous Communities ──────────────────────────────────────
// GDP 2023 (INE, current prices, billions EUR).
// Population: INE 1 Jan 2024.
// Unemployment: INE EPA 2024-Q1.
const REGIONS = {
  'Andalucía': {
    name: 'Andalucía',
    gdp_bn_eur: 190.2, gdp_year: 2023,
    population: 8_542_600, unemployment_rate: 19.8, unemployment_year: 2024,
  },
  'Aragón': {
    name: 'Aragón',
    gdp_bn_eur: 42.5, gdp_year: 2023,
    population: 1_340_500, unemployment_rate: 8.5, unemployment_year: 2024,
  },
  'Asturias': {
    name: 'Asturias',
    gdp_bn_eur: 26.3, gdp_year: 2023,
    population: 1_004_700, unemployment_rate: 11.2, unemployment_year: 2024,
  },
  'Illes Balears': {
    name: 'Illes Balears',
    gdp_bn_eur: 38.5, gdp_year: 2023,
    population: 1_224_600, unemployment_rate: 10.1, unemployment_year: 2024,
  },
  'Canarias': {
    name: 'Canarias',
    gdp_bn_eur: 52.5, gdp_year: 2023,
    population: 2_244_200, unemployment_rate: 16.4, unemployment_year: 2024,
  },
  'Cantabria': {
    name: 'Cantabria',
    gdp_bn_eur: 15.6, gdp_year: 2023,
    population: 588_600, unemployment_rate: 8.8, unemployment_year: 2024,
  },
  'Castilla y León': {
    name: 'Castilla y León',
    gdp_bn_eur: 65.2, gdp_year: 2023,
    population: 2_367_100, unemployment_rate: 9.3, unemployment_year: 2024,
  },
  'Castilla-La Mancha': {
    name: 'Castilla-La Mancha',
    gdp_bn_eur: 47.8, gdp_year: 2023,
    population: 2_112_600, unemployment_rate: 13.2, unemployment_year: 2024,
  },
  'Cataluña': {
    name: 'Cataluña',
    gdp_bn_eur: 273.6, gdp_year: 2023,
    population: 7_901_500, unemployment_rate: 9.1, unemployment_year: 2024,
  },
  'Comunitat Valenciana': {
    name: 'Comunitat Valenciana',
    gdp_bn_eur: 128.4, gdp_year: 2023,
    population: 5_216_300, unemployment_rate: 13.1, unemployment_year: 2024,
  },
  'Extremadura': {
    name: 'Extremadura',
    gdp_bn_eur: 22.3, gdp_year: 2023,
    population: 1_054_800, unemployment_rate: 16.9, unemployment_year: 2024,
  },
  'Galicia': {
    name: 'Galicia',
    gdp_bn_eur: 72.4, gdp_year: 2023,
    population: 2_690_500, unemployment_rate: 10.4, unemployment_year: 2024,
  },
  'Comunidad de Madrid': {
    name: 'Comunidad de Madrid',
    gdp_bn_eur: 280.5, gdp_year: 2023,
    population: 6_928_600, unemployment_rate: 9.0, unemployment_year: 2024,
  },
  'Región de Murcia': {
    name: 'Región de Murcia',
    gdp_bn_eur: 37.0, gdp_year: 2023,
    population: 1_556_500, unemployment_rate: 13.5, unemployment_year: 2024,
  },
  'Navarra': {
    name: 'Navarra',
    gdp_bn_eur: 23.0, gdp_year: 2023,
    population: 668_300, unemployment_rate: 8.2, unemployment_year: 2024,
  },
  'País Vasco': {
    name: 'País Vasco',
    gdp_bn_eur: 83.5, gdp_year: 2023,
    population: 2_213_900, unemployment_rate: 7.5, unemployment_year: 2024,
  },
  'La Rioja': {
    name: 'La Rioja',
    gdp_bn_eur: 10.1, gdp_year: 2023,
    population: 322_700, unemployment_rate: 9.1, unemployment_year: 2024,
  },
  'Ceuta': {
    name: 'Ceuta',
    gdp_bn_eur: 2.1, gdp_year: 2023,
    population: 83_800, unemployment_rate: 24.1, unemployment_year: 2024,
  },
  'Melilla': {
    name: 'Melilla',
    gdp_bn_eur: 1.8, gdp_year: 2023,
    population: 85_700, unemployment_rate: 25.3, unemployment_year: 2024,
  },
};

// ── Compute derived fields ───────────────────────────────────────────────────
for (const key of Object.keys(REGIONS)) {
  const r = REGIONS[key];
  r.gdp_per_capita_eur = Math.round((r.gdp_bn_eur * 1e9) / r.population);
}

// ── Write output ─────────────────────────────────────────────────────────────
const output = {
  province_to_region: PROVINCE_TO_REGION,
  regions: REGIONS,
};

const json = JSON.stringify(output);
fs.writeFileSync(OUT_PATH, json);
console.log(`✓ Written ${(json.length / 1024).toFixed(1)} KB to ${OUT_PATH}`);
console.log(`  ${Object.keys(REGIONS).length} autonomous communities`);
console.log(`  ${Object.keys(PROVINCE_TO_REGION).length} provinces mapped`);

// Spot check
const madrid = REGIONS['Comunidad de Madrid'];
console.log(`\n  Madrid: GDP/cap €${madrid.gdp_per_capita_eur.toLocaleString()}, unemployment ${madrid.unemployment_rate}%`);
const anda = REGIONS['Andalucía'];
console.log(`  Andalucía: GDP/cap €${anda.gdp_per_capita_eur.toLocaleString()}, unemployment ${anda.unemployment_rate}%`);
