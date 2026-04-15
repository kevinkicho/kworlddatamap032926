#!/usr/bin/env node
/**
 * fetch-mexico-states.js
 *
 * Produces subnational economic data for Mexico's 32 states.
 *   Output: public/mexico-states.json
 *
 * Keys match the "name" property in public/admin1/MX.json (Natural Earth).
 *
 * Fields per state:
 *   name, gdp_bn_mxn, gdp_year, gdp_per_capita_mxn, population,
 *   unemployment_rate, unemployment_year, hdi, hdi_year
 *
 * Data sources:
 *   GDP (2022): INEGI — PIB por entidad federativa, precios corrientes.
 *     https://www.inegi.org.mx/app/tabulados/default.aspx?nc=cn_pibt_07
 *   Population (2020): INEGI Censo de Población y Vivienda 2020.
 *   Unemployment (2023): INEGI — ENOE, tasa de desocupación trimestral
 *     promedio anual 2023.
 *   HDI (2021): UNDP Mexico / PNUD — Índice de Desarrollo Humano
 *     por entidad federativa.
 *
 * Usage: node scripts/fetch-mexico-states.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const OUT_PATH = path.join(__dirname, '../public/mexico-states.json');

// Keys match Natural Earth admin1/MX.json property.name exactly.
// "Distrito Federal" in NE = CDMX.
const STATES = {
  'Aguascalientes':     { name: 'Aguascalientes',     gdp_bn_mxn: 243, population: 1_425_607,  unemployment_rate: 3.2, hdi: 0.795 },
  'Baja California':    { name: 'Baja California',    gdp_bn_mxn: 636, population: 3_769_020,  unemployment_rate: 2.4, hdi: 0.795 },
  'Baja California Sur':{ name: 'Baja California Sur',gdp_bn_mxn: 168, population: 798_447,    unemployment_rate: 3.1, hdi: 0.804 },
  'Campeche':           { name: 'Campeche',           gdp_bn_mxn: 557, population: 928_363,    unemployment_rate: 2.8, hdi: 0.762 },
  'Chiapas':            { name: 'Chiapas',            gdp_bn_mxn: 327, population: 5_543_828,  unemployment_rate: 2.6, hdi: 0.667 },
  'Chihuahua':          { name: 'Chihuahua',          gdp_bn_mxn: 622, population: 3_741_869,  unemployment_rate: 2.7, hdi: 0.789 },
  'Coahuila':           { name: 'Coahuila',           gdp_bn_mxn: 614, population: 3_146_771,  unemployment_rate: 3.0, hdi: 0.798 },
  'Colima':             { name: 'Colima',             gdp_bn_mxn: 107, population: 731_391,    unemployment_rate: 2.9, hdi: 0.793 },
  'Distrito Federal':   { name: 'Ciudad de México',   gdp_bn_mxn: 2897, population: 9_209_944, unemployment_rate: 4.8, hdi: 0.837 },
  'Durango':            { name: 'Durango',            gdp_bn_mxn: 217, population: 1_832_650,  unemployment_rate: 2.3, hdi: 0.764 },
  'Guanajuato':         { name: 'Guanajuato',         gdp_bn_mxn: 721, population: 6_166_934,  unemployment_rate: 3.5, hdi: 0.766 },
  'Guerrero':           { name: 'Guerrero',           gdp_bn_mxn: 267, population: 3_540_685,  unemployment_rate: 2.0, hdi: 0.692 },
  'Hidalgo':            { name: 'Hidalgo',            gdp_bn_mxn: 287, population: 3_082_841,  unemployment_rate: 2.8, hdi: 0.745 },
  'Jalisco':            { name: 'Jalisco',            gdp_bn_mxn: 1145, population: 8_348_151, unemployment_rate: 3.0, hdi: 0.793 },
  'México':             { name: 'Estado de México',   gdp_bn_mxn: 1326, population: 16_992_418, unemployment_rate: 4.3, hdi: 0.767 },
  'Michoacán':          { name: 'Michoacán',          gdp_bn_mxn: 426, population: 4_748_846,  unemployment_rate: 2.4, hdi: 0.733 },
  'Morelos':            { name: 'Morelos',            gdp_bn_mxn: 179, population: 1_971_520,  unemployment_rate: 3.1, hdi: 0.775 },
  'Nayarit':            { name: 'Nayarit',            gdp_bn_mxn: 115, population: 1_235_456,  unemployment_rate: 3.2, hdi: 0.759 },
  'Nuevo León':         { name: 'Nuevo León',         gdp_bn_mxn: 1377, population: 5_784_442, unemployment_rate: 3.3, hdi: 0.827 },
  'Oaxaca':             { name: 'Oaxaca',             gdp_bn_mxn: 268, population: 4_132_148,  unemployment_rate: 1.8, hdi: 0.683 },
  'Puebla':             { name: 'Puebla',             gdp_bn_mxn: 582, population: 6_583_278,  unemployment_rate: 3.2, hdi: 0.738 },
  'Querétaro':          { name: 'Querétaro',          gdp_bn_mxn: 439, population: 2_368_467,  unemployment_rate: 3.4, hdi: 0.809 },
  'Quintana Roo':       { name: 'Quintana Roo',       gdp_bn_mxn: 300, population: 1_857_985,  unemployment_rate: 2.5, hdi: 0.791 },
  'San Luis Potosí':    { name: 'San Luis Potosí',    gdp_bn_mxn: 394, population: 2_822_255,  unemployment_rate: 2.2, hdi: 0.762 },
  'Sinaloa':            { name: 'Sinaloa',            gdp_bn_mxn: 370, population: 3_026_943,  unemployment_rate: 3.0, hdi: 0.778 },
  'Sonora':             { name: 'Sonora',             gdp_bn_mxn: 566, population: 2_944_840,  unemployment_rate: 3.2, hdi: 0.798 },
  'Tabasco':            { name: 'Tabasco',            gdp_bn_mxn: 574, population: 2_402_598,  unemployment_rate: 3.8, hdi: 0.753 },
  'Tamaulipas':         { name: 'Tamaulipas',         gdp_bn_mxn: 539, population: 3_527_735,  unemployment_rate: 2.9, hdi: 0.791 },
  'Tlaxcala':           { name: 'Tlaxcala',           gdp_bn_mxn: 105, population: 1_342_977,  unemployment_rate: 3.7, hdi: 0.748 },
  'Veracruz':           { name: 'Veracruz',           gdp_bn_mxn: 618, population: 8_062_579,  unemployment_rate: 2.4, hdi: 0.726 },
  'Yucatán':            { name: 'Yucatán',            gdp_bn_mxn: 257, population: 2_320_898,  unemployment_rate: 2.3, hdi: 0.770 },
  'Zacatecas':          { name: 'Zacatecas',          gdp_bn_mxn: 174, population: 1_622_138,  unemployment_rate: 2.1, hdi: 0.751 },
};

// Compute derived fields
for (const key of Object.keys(STATES)) {
  const s = STATES[key];
  s.gdp_year = 2022;
  s.unemployment_year = 2023;
  s.hdi_year = 2021;
  s.gdp_per_capita_mxn = Math.round((s.gdp_bn_mxn * 1e9) / s.population);
}

const json = JSON.stringify(STATES);
fs.writeFileSync(OUT_PATH, json);
console.log(`✓ Written ${(json.length / 1024).toFixed(1)} KB to ${OUT_PATH}`);
console.log(`  ${Object.keys(STATES).length} states`);

const cdmx = STATES['Distrito Federal'];
console.log(`\n  CDMX: GDP/cap MXN ${cdmx.gdp_per_capita_mxn.toLocaleString()}, HDI ${cdmx.hdi}, unemployment ${cdmx.unemployment_rate}%`);
const chis = STATES['Chiapas'];
console.log(`  Chiapas: GDP/cap MXN ${chis.gdp_per_capita_mxn.toLocaleString()}, HDI ${chis.hdi}, unemployment ${chis.unemployment_rate}%`);
