#!/usr/bin/env node
/**
 * fetch-italy-regions.js
 *
 * Produces subnational economic data for Italy's 20 regions.
 *   Output: public/italy-regions.json
 *
 * Keys match Natural Earth province names in public/admin1/IT.json.
 * Since admin1/IT.json uses provinces, we include a province_to_region
 * mapping so the app can look up region-level data from a province name.
 *
 * Fields per region:
 *   name, gdp_bn_eur, gdp_year, gdp_per_capita_eur, population,
 *   unemployment_rate, unemployment_year
 *
 * Data sources:
 *   GDP (2022): ISTAT — Conti economici regionali, PIL a prezzi correnti
 *     per regione. https://www.istat.it/en/archivio/263591
 *   Population (2024): ISTAT — Popolazione residente per regione,
 *     1 January 2024 (preliminary).
 *   Unemployment (2023): ISTAT — Rilevazione sulle forze di lavoro,
 *     tasso di disoccupazione per regione, media annuale 2023.
 *     https://www.istat.it/en/archivio/employment
 *
 * Usage: node scripts/fetch-italy-regions.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const OUT_PATH = path.join(__dirname, '../public/italy-regions.json');

// ── Province → Region mapping ────────────────────────────────────────────────
const PROVINCE_TO_REGION = {
  // Piemonte
  'Turin': 'Piemonte', 'Cuneo': 'Piemonte', 'Asti': 'Piemonte',
  'Alessandria': 'Piemonte', 'Vercelli': 'Piemonte', 'Novara': 'Piemonte',
  'Biella': 'Piemonte', 'Verbano-Cusio-Ossola': 'Piemonte',
  // Valle d'Aosta
  'Aoste': "Valle d'Aosta",
  // Lombardia
  'Milano': 'Lombardia', 'Bergamo': 'Lombardia', 'Brescia': 'Lombardia',
  'Como': 'Lombardia', 'Cremona': 'Lombardia', 'Lecco': 'Lombardia',
  'Lodi': 'Lombardia', 'Mantova': 'Lombardia', 'Monza e Brianza': 'Lombardia',
  'Pavia': 'Lombardia', 'Sondrio': 'Lombardia', 'Varese': 'Lombardia',
  // Trentino-Alto Adige
  'Trento': 'Trentino-Alto Adige', 'Bozen': 'Trentino-Alto Adige',
  // Veneto
  'Venezia': 'Veneto', 'Verona': 'Veneto', 'Padova': 'Veneto',
  'Vicenza': 'Veneto', 'Treviso': 'Veneto', 'Rovigo': 'Veneto', 'Belluno': 'Veneto',
  // Friuli Venezia Giulia
  'Trieste': 'Friuli Venezia Giulia', 'Udine': 'Friuli Venezia Giulia',
  'Gorizia': 'Friuli Venezia Giulia', 'Pordenone': 'Friuli Venezia Giulia',
  // Liguria
  'Genova': 'Liguria', 'Savona': 'Liguria', 'Imperia': 'Liguria',
  'La Spezia': 'Liguria',
  // Emilia-Romagna
  'Bologna': 'Emilia-Romagna', 'Modena': 'Emilia-Romagna',
  'Parma': 'Emilia-Romagna', 'Reggio Emilia': 'Emilia-Romagna',
  'Ferrara': 'Emilia-Romagna', 'Ravenna': 'Emilia-Romagna',
  'Rimini': 'Emilia-Romagna', 'Forlì-Cesena': 'Emilia-Romagna',
  'Piacenza': 'Emilia-Romagna',
  // Toscana
  'Firenze': 'Toscana', 'Pisa': 'Toscana', 'Livorno': 'Toscana',
  'Lucca': 'Toscana', 'Siena': 'Toscana', 'Arezzo': 'Toscana',
  'Grosseto': 'Toscana', 'Massa-Carrara': 'Toscana', 'Pistoia': 'Toscana',
  'Prato': 'Toscana',
  // Umbria
  'Perugia': 'Umbria', 'Terni': 'Umbria',
  // Marche
  'Ancona': 'Marche', 'Pesaro e Urbino': 'Marche', 'Macerata': 'Marche',
  'Fermo': 'Marche', 'Ascoli Piceno': 'Marche',
  // Lazio
  'Roma': 'Lazio', 'Latina': 'Lazio', 'Frosinone': 'Lazio',
  'Viterbo': 'Lazio', 'Rieti': 'Lazio',
  // Abruzzo
  "L'Aquila": 'Abruzzo', 'Teramo': 'Abruzzo', 'Pescara': 'Abruzzo',
  'Chieti': 'Abruzzo',
  // Molise
  'Campobasso': 'Molise', 'Isernia': 'Molise',
  // Campania
  'Napoli': 'Campania', 'Salerno': 'Campania', 'Caserta': 'Campania',
  'Avellino': 'Campania', 'Benevento': 'Campania',
  // Puglia
  'Bari': 'Puglia', 'Lecce': 'Puglia', 'Taranto': 'Puglia',
  'Brindisi': 'Puglia', 'Foggia': 'Puglia', 'Barletta-Andria Trani': 'Puglia',
  // Basilicata
  'Potenza': 'Basilicata', 'Matera': 'Basilicata',
  // Calabria
  'Cosenza': 'Calabria', 'Catanzaro': 'Calabria',
  'Reggio Calabria': 'Calabria', 'Crotene': 'Calabria',
  'Vibo Valentia': 'Calabria',
  // Sicilia
  'Palermo': 'Sicilia', 'Catania': 'Sicilia', 'Messina': 'Sicilia',
  'Siracusa': 'Sicilia', 'Ragusa': 'Sicilia', 'Trapani': 'Sicilia',
  'Agrigento': 'Sicilia', 'Caltanissetta': 'Sicilia', 'Enna': 'Sicilia',
  // Sardegna
  'Cagliari': 'Sardegna', 'Sassari': 'Sardegna', 'Nuoro': 'Sardegna',
  'Oristrano': 'Sardegna', 'Olbia-Tempio': 'Sardegna',
  'Carbonia-Iglesias': 'Sardegna', 'Medio Campidano': 'Sardegna',
  'Ogliastra': 'Sardegna',
};

// ── Static data: 20 Italian regions ──────────────────────────────────────────
// GDP 2022, current prices, billion EUR (ISTAT).
// Population 2024-01-01 (ISTAT preliminary).
// Unemployment 2023 annual average (ISTAT Labour Force Survey).
const REGIONS = {
  'Piemonte': {
    name: 'Piemonte', gdp_bn_eur: 143.0, gdp_year: 2022,
    population: 4_240_700, unemployment_rate: 6.3, unemployment_year: 2023,
  },
  "Valle d'Aosta": {
    name: "Valle d'Aosta", gdp_bn_eur: 5.2, gdp_year: 2022,
    population: 122_900, unemployment_rate: 5.4, unemployment_year: 2023,
  },
  'Lombardia': {
    name: 'Lombardia', gdp_bn_eur: 422.3, gdp_year: 2022,
    population: 10_019_200, unemployment_rate: 4.4, unemployment_year: 2023,
  },
  'Trentino-Alto Adige': {
    name: 'Trentino-Alto Adige', gdp_bn_eur: 49.5, gdp_year: 2022,
    population: 1_084_000, unemployment_rate: 3.7, unemployment_year: 2023,
  },
  'Veneto': {
    name: 'Veneto', gdp_bn_eur: 173.8, gdp_year: 2022,
    population: 4_838_300, unemployment_rate: 4.5, unemployment_year: 2023,
  },
  'Friuli Venezia Giulia': {
    name: 'Friuli Venezia Giulia', gdp_bn_eur: 40.5, gdp_year: 2022,
    population: 1_194_600, unemployment_rate: 5.1, unemployment_year: 2023,
  },
  'Liguria': {
    name: 'Liguria', gdp_bn_eur: 52.0, gdp_year: 2022,
    population: 1_509_800, unemployment_rate: 7.2, unemployment_year: 2023,
  },
  'Emilia-Romagna': {
    name: 'Emilia-Romagna', gdp_bn_eur: 169.5, gdp_year: 2022,
    population: 4_456_700, unemployment_rate: 4.8, unemployment_year: 2023,
  },
  'Toscana': {
    name: 'Toscana', gdp_bn_eur: 122.0, gdp_year: 2022,
    population: 3_663_100, unemployment_rate: 5.7, unemployment_year: 2023,
  },
  'Umbria': {
    name: 'Umbria', gdp_bn_eur: 23.7, gdp_year: 2022,
    population: 854_100, unemployment_rate: 6.9, unemployment_year: 2023,
  },
  'Marche': {
    name: 'Marche', gdp_bn_eur: 43.5, gdp_year: 2022,
    population: 1_484_700, unemployment_rate: 6.2, unemployment_year: 2023,
  },
  'Lazio': {
    name: 'Lazio', gdp_bn_eur: 207.0, gdp_year: 2022,
    population: 5_714_900, unemployment_rate: 8.0, unemployment_year: 2023,
  },
  'Abruzzo': {
    name: 'Abruzzo', gdp_bn_eur: 33.5, gdp_year: 2022,
    population: 1_269_400, unemployment_rate: 8.7, unemployment_year: 2023,
  },
  'Molise': {
    name: 'Molise', gdp_bn_eur: 6.8, gdp_year: 2022,
    population: 289_800, unemployment_rate: 10.5, unemployment_year: 2023,
  },
  'Campania': {
    name: 'Campania', gdp_bn_eur: 117.5, gdp_year: 2022,
    population: 5_592_200, unemployment_rate: 17.1, unemployment_year: 2023,
  },
  'Puglia': {
    name: 'Puglia', gdp_bn_eur: 82.5, gdp_year: 2022,
    population: 3_907_200, unemployment_rate: 12.8, unemployment_year: 2023,
  },
  'Basilicata': {
    name: 'Basilicata', gdp_bn_eur: 13.8, gdp_year: 2022,
    population: 536_700, unemployment_rate: 8.9, unemployment_year: 2023,
  },
  'Calabria': {
    name: 'Calabria', gdp_bn_eur: 35.5, gdp_year: 2022,
    population: 1_841_300, unemployment_rate: 16.4, unemployment_year: 2023,
  },
  'Sicilia': {
    name: 'Sicilia', gdp_bn_eur: 95.5, gdp_year: 2022,
    population: 4_814_400, unemployment_rate: 16.3, unemployment_year: 2023,
  },
  'Sardegna': {
    name: 'Sardegna', gdp_bn_eur: 37.0, gdp_year: 2022,
    population: 1_571_700, unemployment_rate: 10.2, unemployment_year: 2023,
  },
};

// Compute derived fields
for (const key of Object.keys(REGIONS)) {
  const r = REGIONS[key];
  r.gdp_per_capita_eur = Math.round((r.gdp_bn_eur * 1e9) / r.population);
}

// Write output
const output = { province_to_region: PROVINCE_TO_REGION, regions: REGIONS };
const json = JSON.stringify(output);
fs.writeFileSync(OUT_PATH, json);
console.log(`✓ Written ${(json.length / 1024).toFixed(1)} KB to ${OUT_PATH}`);
console.log(`  ${Object.keys(REGIONS).length} regions, ${Object.keys(PROVINCE_TO_REGION).length} provinces mapped`);

const lom = REGIONS['Lombardia'];
console.log(`\n  Lombardia: GDP/cap €${lom.gdp_per_capita_eur.toLocaleString()}, unemployment ${lom.unemployment_rate}%`);
const sic = REGIONS['Sicilia'];
console.log(`  Sicilia: GDP/cap €${sic.gdp_per_capita_eur.toLocaleString()}, unemployment ${sic.unemployment_rate}%`);
