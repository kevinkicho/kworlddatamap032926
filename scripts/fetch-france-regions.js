#!/usr/bin/env node
/**
 * fetch-france-regions.js
 *
 * Produces subnational economic data for France's 13 metropolitan regions
 * plus 5 overseas regions (collectivités).
 *   Output: public/france-regions.json
 *
 * Output structure:
 *   {
 *     "regions": {
 *       "<region name>": { name, gdp_bn_eur, gdp_year, gdp_per_capita_eur,
 *                          population, unemployment_rate, unemployment_year }
 *     },
 *     "dept_to_region": {
 *       "<Natural Earth département name>": "<region name>",
 *       ...
 *     }
 *   }
 *
 * The dept_to_region map covers all 101 Natural Earth admin-1 département
 * features for France, allowing map code to look up the region for any
 * département polygon and display regional-level data.
 *
 * Fields per region:
 *   name               — region name
 *   gdp_bn_eur         — GDP billions EUR (2022, current prices)
 *   gdp_year           — 2022
 *   gdp_per_capita_eur — GDP per capita, EUR (computed)
 *   population         — population (persons, 2022)
 *   unemployment_rate  — unemployment rate, % (2023)
 *   unemployment_year  — 2023
 *
 * Data sources:
 *   GDP (2022):
 *     INSEE Comptes régionaux 2022 (base 2014, provisional).
 *     https://www.insee.fr/fr/statistiques/7756732
 *   Population (2022):
 *     INSEE Recensement de la population 2022.
 *     https://www.insee.fr/fr/statistiques/8268806
 *   Unemployment (2023):
 *     INSEE Enquête Emploi en continu 2023 (taux de chômage BIT par région).
 *     https://www.insee.fr/fr/statistiques/8183438
 *
 * Usage: node scripts/fetch-france-regions.js
 */

'use strict';

const fs   = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');

const OUT_PATH = path.join(__dirname, '../public/france-regions.json');

// ── Static region data ────────────────────────────────────────────────────────
//
// GDP 2022 in billions EUR (current prices), INSEE Comptes régionaux 2022.
// Population 2022, INSEE Recensement.
// Unemployment 2023 annual average (%), INSEE Enquête Emploi.
//
// Metropolitan regions (13) + overseas regions/collectivités (5).

const REGIONS = {
  'Île-de-France': {
    name:              'Île-de-France',
    gdp_bn_eur:        765,         // finance, tech, tourism capital; ~30% of national GDP
    gdp_year:          2022,
    population:        12_271_794,
    unemployment_rate: 6.8,
    unemployment_year: 2023,
  },
  'Auvergne-Rhône-Alpes': {
    name:              'Auvergne-Rhône-Alpes',
    gdp_bn_eur:        290,         // Lyon metro + Alpine tourism/industry
    gdp_year:          2022,
    population:        8_092_526,
    unemployment_rate: 5.8,
    unemployment_year: 2023,
  },
  'Nouvelle-Aquitaine': {
    name:              'Nouvelle-Aquitaine',
    gdp_bn_eur:        176,         // largest region by area; aerospace (Bordeaux), wine
    gdp_year:          2022,
    population:        6_010_289,
    unemployment_rate: 6.2,
    unemployment_year: 2023,
  },
  'Occitanie': {
    name:              'Occitanie',
    gdp_bn_eur:        175,         // Toulouse aerospace (Airbus), Mediterranean tourism
    gdp_year:          2022,
    population:        5_973_969,
    unemployment_rate: 8.2,
    unemployment_year: 2023,
  },
  'Hauts-de-France': {
    name:              'Hauts-de-France',
    gdp_bn_eur:        164,         // northern industrial belt; highest unemployment metro
    gdp_year:          2022,
    population:        5_997_734,
    unemployment_rate: 9.2,
    unemployment_year: 2023,
  },
  'Grand Est': {
    name:              'Grand Est',
    gdp_bn_eur:        155,         // Rhine corridor; cross-border with Germany/Luxembourg
    gdp_year:          2022,
    population:        5_561_287,
    unemployment_rate: 7.3,
    unemployment_year: 2023,
  },
  'Provence-Alpes-Côte d\'Azur': {
    name:              'Provence-Alpes-Côte d\'Azur',
    gdp_bn_eur:        170,         // Marseille port; Riviera tourism and luxury
    gdp_year:          2022,
    population:        5_098_405,
    unemployment_rate: 8.0,
    unemployment_year: 2023,
  },
  'Pays de la Loire': {
    name:              'Pays de la Loire',
    gdp_bn_eur:        122,         // Nantes; manufacturing and agri-food
    gdp_year:          2022,
    population:        3_838_060,
    unemployment_rate: 5.3,
    unemployment_year: 2023,
  },
  'Bretagne': {
    name:              'Bretagne',
    gdp_bn_eur:        104,         // agri-food, fisheries, naval defence (Brest)
    gdp_year:          2022,
    population:        3_394_567,
    unemployment_rate: 5.5,
    unemployment_year: 2023,
  },
  'Normandie': {
    name:              'Normandie',
    gdp_bn_eur:        96,          // nuclear energy (EDF), dairy, Channel ports
    gdp_year:          2022,
    population:        3_326_339,
    unemployment_rate: 7.0,
    unemployment_year: 2023,
  },
  'Bourgogne-Franche-Comté': {
    name:              'Bourgogne-Franche-Comté',
    gdp_bn_eur:        79,          // Burgundy wines, TGV axis, cross-border (Swiss Jura)
    gdp_year:          2022,
    population:        2_805_580,
    unemployment_rate: 6.5,
    unemployment_year: 2023,
  },
  'Centre-Val de Loire': {
    name:              'Centre-Val de Loire',
    gdp_bn_eur:        78,          // Loire châteaux, pharma (Sanofi), cereals
    gdp_year:          2022,
    population:        2_573_303,
    unemployment_rate: 6.6,
    unemployment_year: 2023,
  },
  'Corse': {
    name:              'Corse',
    gdp_bn_eur:        11,          // tourism-dependent island economy
    gdp_year:          2022,
    population:        344_679,
    unemployment_rate: 7.5,
    unemployment_year: 2023,
  },
  // ── Overseas regions (DROM) ──────────────────────────────────────────────────
  'Guadeloupe': {
    name:              'Guadeloupe',
    gdp_bn_eur:        10,          // Caribbean; tourism and services
    gdp_year:          2022,
    population:        384_239,
    unemployment_rate: 18.2,
    unemployment_year: 2023,
  },
  'Martinique': {
    name:              'Martinique',
    gdp_bn_eur:        10,          // Caribbean; rum, tourism
    gdp_year:          2022,
    population:        361_225,
    unemployment_rate: 12.4,
    unemployment_year: 2023,
  },
  'Guyane française': {
    name:              'Guyane française',
    gdp_bn_eur:        5,           // Kourou space centre; fast-growing population
    gdp_year:          2022,
    population:        294_146,
    unemployment_rate: 15.0,
    unemployment_year: 2023,
  },
  'La Réunion': {
    name:              'La Réunion',
    gdp_bn_eur:        21,          // Indian Ocean; largest overseas region by GDP
    gdp_year:          2022,
    population:        873_102,
    unemployment_rate: 17.0,
    unemployment_year: 2023,
  },
  'Mayotte': {
    name:              'Mayotte',
    gdp_bn_eur:        3,           // Indian Ocean; youngest and fastest-growing population
    gdp_year:          2022,
    population:        321_000,
    unemployment_rate: 30.0,        // highest unemployment in French territory
    unemployment_year: 2023,
  },
};

// ── Département → region mapping (Natural Earth admin-1 names) ────────────────
//
// Natural Earth uses French département names (with accents) for France.
// One known NE spelling quirk: "Seien-et-Marne" (likely typo for "Seine-et-Marne").
// Both spellings are included so the lookup is robust.

const DEPT_TO_REGION = {
  // Île-de-France (8 départements)
  'Paris':                     'Île-de-France',
  'Essonne':                   'Île-de-France',
  'Hauts-de-Seine':            'Île-de-France',
  'Seine-Saint-Denis':         'Île-de-France',
  'Val-de-Marne':              'Île-de-France',
  "Val-d'Oise":                'Île-de-France',
  'Yvelines':                  'Île-de-France',
  'Seine-et-Marne':            'Île-de-France',
  'Seien-et-Marne':            'Île-de-France',  // NE spelling variant / known typo

  // Auvergne-Rhône-Alpes (12 départements)
  'Ain':                       'Auvergne-Rhône-Alpes',
  'Allier':                    'Auvergne-Rhône-Alpes',
  'Ardèche':                   'Auvergne-Rhône-Alpes',
  'Cantal':                    'Auvergne-Rhône-Alpes',
  'Drôme':                     'Auvergne-Rhône-Alpes',
  'Haute-Loire':               'Auvergne-Rhône-Alpes',
  'Haute-Savoie':              'Auvergne-Rhône-Alpes',
  'Isère':                     'Auvergne-Rhône-Alpes',
  'Loire':                     'Auvergne-Rhône-Alpes',
  'Puy-de-Dôme':               'Auvergne-Rhône-Alpes',
  'Rhône':                     'Auvergne-Rhône-Alpes',
  'Savoie':                    'Auvergne-Rhône-Alpes',

  // Nouvelle-Aquitaine (12 départements)
  'Charente':                  'Nouvelle-Aquitaine',
  'Charente-Maritime':         'Nouvelle-Aquitaine',
  'Corrèze':                   'Nouvelle-Aquitaine',
  'Creuse':                    'Nouvelle-Aquitaine',
  'Deux-Sèvres':               'Nouvelle-Aquitaine',
  'Dordogne':                  'Nouvelle-Aquitaine',
  'Gironde':                   'Nouvelle-Aquitaine',
  'Haute-Vienne':              'Nouvelle-Aquitaine',
  'Landes':                    'Nouvelle-Aquitaine',
  'Lot-et-Garonne':            'Nouvelle-Aquitaine',
  'Pyrénées-Atlantiques':      'Nouvelle-Aquitaine',
  'Vienne':                    'Nouvelle-Aquitaine',

  // Occitanie (13 départements)
  'Ariège':                    'Occitanie',
  'Aude':                      'Occitanie',
  'Aveyron':                   'Occitanie',
  'Gard':                      'Occitanie',
  'Gers':                      'Occitanie',
  'Haute-Garonne':             'Occitanie',
  'Hautes-Pyrénées':           'Occitanie',
  'Hérault':                   'Occitanie',
  'Lot':                       'Occitanie',
  'Lozère':                    'Occitanie',
  'Pyrénées-Orientales':       'Occitanie',
  'Tarn':                      'Occitanie',
  'Tarn-et-Garonne':           'Occitanie',

  // Hauts-de-France (5 départements)
  'Aisne':                     'Hauts-de-France',
  'Nord':                      'Hauts-de-France',
  'Oise':                      'Hauts-de-France',
  'Pas-de-Calais':             'Hauts-de-France',
  'Somme':                     'Hauts-de-France',

  // Grand Est (11 départements)
  'Ardennes':                  'Grand Est',
  'Aube':                      'Grand Est',
  'Bas-Rhin':                  'Grand Est',
  'Haute-Marne':               'Grand Est',
  'Haute-Rhin':                'Grand Est',
  'Haute-Saône':               'Grand Est',
  'Marne':                     'Grand Est',
  'Meurthe-et-Moselle':        'Grand Est',
  'Meuse':                     'Grand Est',
  'Moselle':                   'Grand Est',
  'Vosges':                    'Grand Est',

  // Provence-Alpes-Côte d'Azur (6 départements)
  'Alpes-de-Haute-Provence':   "Provence-Alpes-Côte d'Azur",
  'Alpes-Maritimes':           "Provence-Alpes-Côte d'Azur",
  'Bouches-du-Rhône':          "Provence-Alpes-Côte d'Azur",
  'Hautes-Alpes':              "Provence-Alpes-Côte d'Azur",
  'Var':                       "Provence-Alpes-Côte d'Azur",
  'Vaucluse':                  "Provence-Alpes-Côte d'Azur",

  // Pays de la Loire (5 départements)
  'Loire-Atlantique':          'Pays de la Loire',
  'Maine-et-Loire':            'Pays de la Loire',
  'Mayenne':                   'Pays de la Loire',
  'Sarthe':                    'Pays de la Loire',
  'Vendée':                    'Pays de la Loire',

  // Bretagne (4 départements)
  "Côtes-d'Armor":             'Bretagne',
  'Finistère':                 'Bretagne',
  'Ille-et-Vilaine':           'Bretagne',
  'Morbihan':                  'Bretagne',

  // Normandie (5 départements)
  'Calvados':                  'Normandie',
  'Eure':                      'Normandie',
  'Manche':                    'Normandie',
  'Orne':                      'Normandie',
  'Seine-Maritime':            'Normandie',

  // Bourgogne-Franche-Comté (7 départements)
  "Côte-d'Or":                 'Bourgogne-Franche-Comté',
  'Doubs':                     'Bourgogne-Franche-Comté',
  'Jura':                      'Bourgogne-Franche-Comté',
  'Nièvre':                    'Bourgogne-Franche-Comté',
  'Saône-et-Loire':            'Bourgogne-Franche-Comté',
  'Territoire de Belfort':     'Bourgogne-Franche-Comté',
  'Yonne':                     'Bourgogne-Franche-Comté',

  // Centre-Val de Loire (6 départements)
  'Cher':                      'Centre-Val de Loire',
  'Eure-et-Loir':              'Centre-Val de Loire',
  'Indre':                     'Centre-Val de Loire',
  'Indre-et-Loire':            'Centre-Val de Loire',
  'Loir-et-Cher':              'Centre-Val de Loire',
  'Loiret':                    'Centre-Val de Loire',

  // Corse (2 départements)
  'Corse-du-Sud':              'Corse',
  'Haute-Corse':               'Corse',

  // Overseas (5 single-département regions)
  'Guadeloupe':                'Guadeloupe',
  'Martinique':                'Martinique',
  'Guyane française':          'Guyane française',
  'La Réunion':                'La Réunion',
  'Mayotte':                   'Mayotte',
};

// ── Compute GDP per capita and assemble regions output ────────────────────────

const regionsOut = {};

for (const [key, r] of Object.entries(REGIONS)) {
  const perCapita = r.gdp_bn_eur && r.population
    ? Math.round((r.gdp_bn_eur * 1e9) / r.population)
    : null;

  regionsOut[key] = {
    name:                 r.name,
    gdp_bn_eur:           r.gdp_bn_eur,
    gdp_year:             r.gdp_year,
    ...(perCapita !== null ? { gdp_per_capita_eur: perCapita } : {}),
    population:           r.population,
    unemployment_rate:    r.unemployment_rate,
    unemployment_year:    r.unemployment_year,
  };
}

// ── Write output ──────────────────────────────────────────────────────────────

const output = {
  regions:        regionsOut,
  dept_to_region: DEPT_TO_REGION,
};

atomicWrite(OUT_PATH, JSON.stringify(output, null, 2), 'utf8');
console.log(`Wrote ${Object.keys(regionsOut).length} regions and ` +
            `${Object.keys(DEPT_TO_REGION).length} département mappings to ${OUT_PATH}`);

// ── Spot-checks ───────────────────────────────────────────────────────────────
function spotCheck(label, value, min, max) {
  const ok = value >= min && value <= max;
  console.log(`  ${ok ? 'OK' : 'FAIL'} ${label}: ${value} (expected ${min}–${max})`);
}

console.log('\n--- Spot-checks ---');

// Île-de-France is the largest by GDP (~30% of French total ~2,788 bn)
spotCheck('Île-de-France GDP (bn EUR)',            regionsOut['Île-de-France'].gdp_bn_eur,                       600, 900);
// GDP per capita for IDF should be well above national average (~38k)
spotCheck('Île-de-France GDP per capita (EUR)',    regionsOut['Île-de-France'].gdp_per_capita_eur,               50_000, 75_000);
// Mayotte has the highest unemployment
spotCheck('Mayotte unemployment (%)',              regionsOut['Mayotte'].unemployment_rate,                      25, 35);
// Pays de la Loire has one of the lowest unemployment rates
spotCheck('Pays de la Loire unemployment (%)',     regionsOut['Pays de la Loire'].unemployment_rate,             4, 7);
// 18 total regions (13 metro + 5 overseas)
spotCheck('Region count',                          Object.keys(regionsOut).length,                               18, 18);
// dept_to_region should cover 101 + 1 NE spelling variant = 102 entries
spotCheck('Département mapping count',            Object.keys(DEPT_TO_REGION).length,                          100, 110);
// Verify a few key département→region lookups
const lookupOk =
  DEPT_TO_REGION['Paris']             === 'Île-de-France'           &&
  DEPT_TO_REGION['Rhône']             === 'Auvergne-Rhône-Alpes'    &&
  DEPT_TO_REGION['Gironde']           === 'Nouvelle-Aquitaine'       &&
  DEPT_TO_REGION['Haute-Garonne']     === 'Occitanie'                &&
  DEPT_TO_REGION['Nord']              === 'Hauts-de-France'          &&
  DEPT_TO_REGION['Moselle']           === 'Grand Est'                &&
  DEPT_TO_REGION['Bouches-du-Rhône']  === "Provence-Alpes-Côte d'Azur" &&
  DEPT_TO_REGION['Finistère']         === 'Bretagne'                 &&
  DEPT_TO_REGION['Seine-Maritime']    === 'Normandie'                &&
  DEPT_TO_REGION['Doubs']             === 'Bourgogne-Franche-Comté'  &&
  DEPT_TO_REGION['Loiret']            === 'Centre-Val de Loire'      &&
  DEPT_TO_REGION['Haute-Corse']       === 'Corse'                    &&
  DEPT_TO_REGION['Seien-et-Marne']    === 'Île-de-France';           // NE typo variant
console.log(`  ${lookupOk ? 'OK' : 'FAIL'} Key département→region spot lookups (13 checks)`);

// ── Summary table ─────────────────────────────────────────────────────────────
console.log('\n--- Summary (sorted by GDP) ---');
const sorted = Object.entries(regionsOut).sort((a, b) => b[1].gdp_bn_eur - a[1].gdp_bn_eur);
for (const [key, r] of sorted) {
  const pcStr = r.gdp_per_capita_eur
    ? `  pc=${(r.gdp_per_capita_eur / 1_000).toFixed(1)}k EUR`
    : '';
  console.log(
    `${key.padEnd(34)} GDP=${String(r.gdp_bn_eur).padStart(5)} bn EUR` +
    `  pop=${(r.population / 1e6).toFixed(2)}M` +
    `  UR=${r.unemployment_rate}%` +
    pcStr
  );
}
