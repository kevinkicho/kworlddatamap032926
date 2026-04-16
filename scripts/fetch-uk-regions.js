#!/usr/bin/env node
/**
 * fetch-uk-regions.js
 *
 * Produces NUTS-1 regional economic data for the United Kingdom's 12 regions,
 * plus a mapping of Natural Earth admin-1 local authority names → NUTS-1 keys.
 *   Output: public/uk-regions.json
 *
 * Top-level keys in output:
 *   regions      — 12 NUTS-1 regions with economic data
 *   la_to_region — ~232 NE local authority names → NUTS-1 region key
 *
 * Fields per region:
 *   name               — region name
 *   gva_bn_gbp         — GVA billions GBP (2022)
 *   gva_year           — 2022
 *   gva_per_capita_gbp — GVA per capita GBP (computed)
 *   population         — population (persons, 2022)
 *   unemployment_rate  — unemployment rate, % (2023)
 *   unemployment_year  — 2023
 *
 * Data sources:
 *   GVA (2022):
 *     ONS – Regional gross value added (balanced) by industry: all NUTS level regions
 *     Dataset: NUTS1 GVA (balanced) headline estimates, 2022.
 *     https://www.ons.gov.uk/economy/grossvalueaddedgva/datasets/
 *       regionalgrossvalueaddedbalancedbyindustry
 *   Population (2022):
 *     ONS – Mid-year population estimates 2022.
 *     https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/
 *       populationestimates/datasets/populationestimatesforukenglandandwalesscotlandandnorthernireland
 *   Unemployment (2023):
 *     ONS – Labour Force Survey (LFS) annual averages 2023.
 *     https://www.ons.gov.uk/employmentandlabourmarket/peoplenotinwork/unemployment
 *
 * Usage: node scripts/fetch-uk-regions.js
 */

'use strict';

const fs   = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');

const OUT_PATH = path.join(__dirname, '../public/uk-regions.json');

// ── Static region data ────────────────────────────────────────────────────────
//
// NUTS-1 key → { name, gva_bn_gbp, population, unemployment_rate }
//
// GVA 2022 in billions GBP, current basic prices. Source: ONS Regional GVA
// (balanced) 2022. National total: ~2,083 bn GBP.
//
// Population 2022: ONS mid-year estimates.
//
// Unemployment 2023 annual average, % — ONS Labour Force Survey.

const REGIONS = {
  'North East': {
    name:               'North East',
    gva_bn_gbp:         57,
    gva_year:           2022,
    population:         2_647_012,
    unemployment_rate:  4.5,
    unemployment_year:  2023,
  },
  'North West': {
    name:               'North West',
    gva_bn_gbp:         190,
    gva_year:           2022,
    population:         7_417_397,
    unemployment_rate:  4.0,
    unemployment_year:  2023,
  },
  'Yorkshire and The Humber': {
    name:               'Yorkshire and The Humber',
    gva_bn_gbp:         123,
    gva_year:           2022,
    population:         5_541_439,
    unemployment_rate:  3.9,
    unemployment_year:  2023,
  },
  'East Midlands': {
    name:               'East Midlands',
    gva_bn_gbp:         110,
    gva_year:           2022,
    population:         4_880_094,
    unemployment_rate:  3.6,
    unemployment_year:  2023,
  },
  'West Midlands': {
    name:               'West Midlands',
    gva_bn_gbp:         139,
    gva_year:           2022,
    population:         5_954_240,
    unemployment_rate:  4.8,
    unemployment_year:  2023,
  },
  'East of England': {
    name:               'East of England',
    gva_bn_gbp:         170,
    gva_year:           2022,
    population:         6_348_096,
    unemployment_rate:  3.1,
    unemployment_year:  2023,
  },
  'London': {
    name:               'London',
    gva_bn_gbp:         557,
    gva_year:           2022,
    population:         8_799_728,
    unemployment_rate:  4.8,
    unemployment_year:  2023,
  },
  'South East': {
    name:               'South East',
    gva_bn_gbp:         309,
    gva_year:           2022,
    population:         9_278_172,
    unemployment_rate:  3.0,
    unemployment_year:  2023,
  },
  'South West': {
    name:               'South West',
    gva_bn_gbp:         152,
    gva_year:           2022,
    population:         5_712_840,
    unemployment_rate:  2.8,
    unemployment_year:  2023,
  },
  'Wales': {
    name:               'Wales',
    gva_bn_gbp:         68,
    gva_year:           2022,
    population:         3_107_494,
    unemployment_rate:  3.6,
    unemployment_year:  2023,
  },
  'Scotland': {
    name:               'Scotland',
    gva_bn_gbp:         157,
    gva_year:           2022,
    population:         5_447_700,
    unemployment_rate:  3.5,
    unemployment_year:  2023,
  },
  'Northern Ireland': {
    name:               'Northern Ireland',
    gva_bn_gbp:         51,
    gva_year:           2022,
    population:         1_903_175,
    unemployment_rate:  2.5,
    unemployment_year:  2023,
  },
};

// ── Local authority → NUTS-1 mapping ─────────────────────────────────────────
//
// Maps Natural Earth admin-1 local authority district names to their NUTS-1
// region key. Covers all ~232 NE admin-1 features for the United Kingdom.

const LA_TO_REGION = {
  // North East
  'Newcastle upon Tyne':   'North East',
  'Sunderland':            'North East',
  'Gateshead':             'North East',
  'South Tyneside':        'North East',
  'North Tyneside':        'North East',
  'Northumberland':        'North East',
  'Durham':                'North East',
  'Hartlepool':            'North East',
  'Stockton-on-Tees':      'North East',
  'Middlesbrough':         'North East',
  'Redcar and Cleveland':  'North East',
  'Darlington':            'North East',

  // North West
  'Manchester':                    'North West',
  'Liverpool':                     'North West',
  'Salford':                       'North West',
  'Bolton':                        'North West',
  'Bury':                          'North West',
  'Oldham':                        'North West',
  'Rochdale':                      'North West',
  'Stockport':                     'North West',
  'Tameside':                      'North West',
  'Trafford':                      'North West',
  'Wigan':                         'North West',
  'Knowsley':                      'North West',
  'Sefton':                        'North West',
  'Merseyside':                    'North West',
  'Halton':                        'North West',
  'Warrington':                    'North West',
  'Cheshire East':                 'North West',
  'Cheshire West and Chester':     'North West',
  'Lancashire':                    'North West',
  'Blackburn with Darwen':         'North West',
  'Blackpool':                     'North West',
  'Cumbria':                       'North West',

  // Yorkshire and The Humber
  'Leeds':                       'Yorkshire and The Humber',
  'Sheffield':                   'Yorkshire and The Humber',
  'Bradford':                    'Yorkshire and The Humber',
  'Wakefield':                   'Yorkshire and The Humber',
  'Kirklees':                    'Yorkshire and The Humber',
  'Calderdale':                  'Yorkshire and The Humber',
  'Barnsley':                    'Yorkshire and The Humber',
  'Doncaster':                   'Yorkshire and The Humber',
  'Rotherham':                   'Yorkshire and The Humber',
  'Kingston upon Hull':          'Yorkshire and The Humber',
  'East Riding of Yorkshire':    'Yorkshire and The Humber',
  'North Yorkshire':             'Yorkshire and The Humber',
  'North East Lincolnshire':     'Yorkshire and The Humber',
  'North Lincolnshire':          'Yorkshire and The Humber',
  'York':                        'Yorkshire and The Humber',

  // East Midlands
  'Nottingham':       'East Midlands',
  'Nottinghamshire':  'East Midlands',
  'Derby':            'East Midlands',
  'Derbyshire':       'East Midlands',
  'Leicester':        'East Midlands',
  'Leicestershire':   'East Midlands',
  'Lincolnshire':     'East Midlands',
  'Northamptonshire': 'East Midlands',
  'Rutland':          'East Midlands',

  // West Midlands
  'Birmingham':       'West Midlands',
  'Coventry':         'West Midlands',
  'Wolverhampton':    'West Midlands',
  'Dudley':           'West Midlands',
  'Sandwell':         'West Midlands',
  'Solihull':         'West Midlands',
  'Walsall':          'West Midlands',
  'Staffordshire':    'West Midlands',
  'Stoke-on-Trent':   'West Midlands',
  'Warwickshire':     'West Midlands',
  'Worcestershire':   'West Midlands',
  'Herefordshire':    'West Midlands',
  'Shropshire':       'West Midlands',
  'Telford and Wrekin': 'West Midlands',

  // East of England
  'Essex':                'East of England',
  'Hertfordshire':        'East of England',
  'Norfolk':              'East of England',
  'Suffolk':              'East of England',
  'Cambridgeshire':       'East of England',
  'Central Bedfordshire': 'East of England',
  'Bedford':              'East of England',
  'Luton':                'East of England',
  'Peterborough':         'East of England',
  'Southend-on-Sea':      'East of England',
  'Thurrock':             'East of England',

  // London
  'City':                     'London',
  'Westminster':              'London',
  'Camden':                   'London',
  'Islington':                'London',
  'Hackney':                  'London',
  'Tower Hamlets':            'London',
  'Newham':                   'London',
  'Barking and Dagenham':     'London',
  'Havering':                 'London',
  'Redbridge':                'London',
  'Waltham Forest':           'London',
  'Haringey':                 'London',
  'Enfield':                  'London',
  'Barnet':                   'London',
  'Harrow':                   'London',
  'Brent':                    'London',
  'Ealing':                   'London',
  'Hounslow':                 'London',
  'Richmond upon Thames':     'London',
  'Kingston upon Thames':     'London',
  'Merton':                   'London',
  'Sutton':                   'London',
  'Croydon':                  'London',
  'Bromley':                  'London',
  'Lewisham':                 'London',
  'Greenwich':                'London',
  'Bexley':                   'London',
  'Southwark':                'London',
  'Lambeth':                  'London',
  'Wandsworth':               'London',
  'Hammersmith and Fulham':   'London',
  'Kensington and Chelsea':   'London',
  'Hillingdon':               'London',

  // South East
  'Surrey':                                     'South East',
  'Kent':                                       'South East',
  'East Sussex':                                'South East',
  'West Sussex':                                'South East',
  'Hampshire':                                  'South East',
  'Oxfordshire':                                'South East',
  'Buckinghamshire':                            'South East',
  'Berkshire':                                  'South East',
  'Reading':                                    'South East',
  'Slough':                                     'South East',
  'Wokingham':                                  'South East',
  'Royal Borough of Windsor and Maidenhead':    'South East',
  'West Berkshire':                             'South East',
  'Bracknell Forest':                           'South East',
  'Isle of Wight':                              'South East',
  'Medway':                                     'South East',
  'Milton Keynes':                              'South East',
  'Brighton and Hove':                          'South East',
  'Portsmouth':                                 'South East',
  'Southampton':                                'South East',

  // South West
  'Bristol':                      'South West',
  'Somerset':                     'South West',
  'Devon':                        'South West',
  'Cornwall':                     'South West',
  'Dorset':                       'South West',
  'Gloucestershire':              'South West',
  'Wiltshire':                    'South West',
  'Plymouth':                     'South West',
  'Torbay':                       'South West',
  'Bournemouth':                  'South West',
  'Poole':                        'South West',
  'North Somerset':               'South West',
  'South Gloucestershire':        'South West',
  'Bath and North East Somerset': 'South West',
  'Swindon':                      'South West',
  'Isles of Scilly':              'South West',

  // Wales
  'Cardiff':              'Wales',
  'Swansea':              'Wales',
  'Newport':              'Wales',
  'Wrexham':              'Wales',
  'Flintshire':           'Wales',
  'Denbighshire':         'Wales',
  'Conwy':                'Wales',
  'Gwynedd':              'Wales',
  'Anglesey':             'Wales',
  'Ceredigion':           'Wales',
  'Pembrokeshire':        'Wales',
  'Carmarthenshire':      'Wales',
  'Neath Port Talbot':    'Wales',
  'Bridgend':             'Wales',
  'Vale of Glamorgan':    'Wales',
  'Rhondda':              'Wales',
  'Rhondda, Cynon, Taff': 'Wales',
  'Cynon':                'Wales',
  'Taff':                 'Wales',
  'Merthyr Tydfil':       'Wales',
  'Caerphilly':           'Wales',
  'Blaenau Gwent':        'Wales',
  'Torfaen':              'Wales',
  'Monmouthshire':        'Wales',
  'Powys':                'Wales',

  // Scotland
  'Glasgow':                  'Scotland',
  'Edinburgh':                'Scotland',
  'Aberdeen':                 'Scotland',
  'Dundee':                   'Scotland',
  'Aberdeenshire':            'Scotland',
  'Angus':                    'Scotland',
  'Argyll and Bute':          'Scotland',
  'Clackmannanshire':         'Scotland',
  'Dumfries and Galloway':    'Scotland',
  'East Ayrshire':            'Scotland',
  'East Dunbartonshire':      'Scotland',
  'East Lothian':             'Scotland',
  'East Renfrewshire':        'Scotland',
  'Eilean Siar':              'Scotland',
  'Falkirk':                  'Scotland',
  'Fife':                     'Scotland',
  'Highland':                 'Scotland',
  'Inverclyde':               'Scotland',
  'Midlothian':               'Scotland',
  'Moray':                    'Scotland',
  'North Ayshire':            'Scotland',
  'Orkney':                   'Scotland',
  'Perthshire and Kinross':   'Scotland',
  'Renfrewshire':             'Scotland',
  'Scottish Borders':         'Scotland',
  'Shetland Islands':         'Scotland',
  'South Ayrshire':           'Scotland',
  'South Lanarkshire':        'Scotland',
  'North Lanarkshire':        'Scotland',
  'Stirling':                 'Scotland',
  'West Dunbartonshire':      'Scotland',
  'West Lothian':             'Scotland',

  // Northern Ireland
  'Belfast':              'Northern Ireland',
  'Antrim':               'Northern Ireland',
  'Ards':                 'Northern Ireland',
  'Armagh':               'Northern Ireland',
  'Ballymena':            'Northern Ireland',
  'Ballymoney':           'Northern Ireland',
  'Banbridge':            'Northern Ireland',
  'Carrickfergus':        'Northern Ireland',
  'Castlereagh':          'Northern Ireland',
  'Coleraine':            'Northern Ireland',
  'Craigavon':            'Northern Ireland',
  'Derry':                'Northern Ireland',
  'Down':                 'Northern Ireland',
  'Dungannon':            'Northern Ireland',
  'Fermanagh':            'Northern Ireland',
  'Larne':                'Northern Ireland',
  'Limavady':             'Northern Ireland',
  'Lisburn':              'Northern Ireland',
  'Magherafelt':          'Northern Ireland',
  'Moyle':                'Northern Ireland',
  'Newry and Mourne':     'Northern Ireland',
  'Newtownabbey':         'Northern Ireland',
  'North Down':           'Northern Ireland',
  'Omagh':                'Northern Ireland',
  'Strabane':             'Northern Ireland',
  'Mid Ulster':           'Northern Ireland',
};

// ── Compute GVA per capita and assemble regions output ────────────────────────
const regions = {};

for (const [key, r] of Object.entries(REGIONS)) {
  const perCapita = r.gva_bn_gbp && r.population
    ? Math.round(r.gva_bn_gbp * 1e9 / r.population)
    : null;

  regions[key] = {
    name:               r.name,
    gva_bn_gbp:         r.gva_bn_gbp,
    gva_year:           r.gva_year,
    ...(perCapita !== null ? { gva_per_capita_gbp: perCapita } : {}),
    population:         r.population,
    unemployment_rate:  r.unemployment_rate,
    unemployment_year:  r.unemployment_year,
  };
}

const output = { regions, la_to_region: LA_TO_REGION };

atomicWrite(OUT_PATH, JSON.stringify(output, null, 2), 'utf8');
console.log(`Wrote ${Object.keys(regions).length} NUTS-1 regions and ${Object.keys(LA_TO_REGION).length} LA mappings to ${OUT_PATH}`);

// ── Spot-checks ───────────────────────────────────────────────────────────────
function spotCheck(label, value, min, max) {
  const ok = value >= min && value <= max;
  console.log(`  ${ok ? 'OK' : 'FAIL'} ${label}: ${value} (expected ${min}–${max})`);
}

console.log('\n--- Spot-checks ---');

// London should be the largest GVA by far
spotCheck('London GVA (bn GBP)',                     regions['London'].gva_bn_gbp,             400, 700);
// South East second largest
spotCheck('South East GVA (bn GBP)',                 regions['South East'].gva_bn_gbp,         200, 400);
// North East smallest English region
spotCheck('North East GVA (bn GBP)',                 regions['North East'].gva_bn_gbp,         40,  80);
// London GVA per capita — highest in UK
spotCheck('London GVA per capita (GBP)',             regions['London'].gva_per_capita_gbp,     40_000, 90_000);
// South West unemployment — lowest in UK
spotCheck('South West unemployment (%)',             regions['South West'].unemployment_rate,  1, 5);
// All 12 regions present
spotCheck('Region count',                            Object.keys(regions).length,              12, 12);
// LA mapping covers a significant number of entries
spotCheck('LA mapping count',                        Object.keys(LA_TO_REGION).length,         200, 300);

// ── Summary table ─────────────────────────────────────────────────────────────
console.log('\n--- Summary ---');
const sorted = Object.entries(regions).sort((a, b) => b[1].gva_bn_gbp - a[1].gva_bn_gbp);
for (const [key, r] of sorted) {
  const pcStr = r.gva_per_capita_gbp
    ? `  pc=£${(r.gva_per_capita_gbp / 1_000).toFixed(1)}k`
    : '';
  console.log(
    `${key.padEnd(28)} GVA=£${String(r.gva_bn_gbp).padStart(4)}bn` +
    `  pop=${(r.population / 1e6).toFixed(2)}M` +
    `  UR=${r.unemployment_rate}%` +
    pcStr
  );
}
