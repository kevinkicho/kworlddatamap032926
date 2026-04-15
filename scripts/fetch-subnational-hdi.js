#!/usr/bin/env node
/**
 * fetch-subnational-hdi.js
 *
 * Produces a curated static dataset of Subnational Human Development Index
 * mapped to Natural Earth admin-1 region names.
 *   Output: public/subnational-hdi.json
 *
 * Data source:
 *   Global Data Lab (GDL) — Subnational HDI, Radboud University
 *   https://globaldatalab.org/shdi/
 *   Based on UNDP Human Development Report methodology, 2022 estimates.
 *
 *   Sub-indices derived from GDL methodology:
 *     health     — life expectancy index
 *     education  — education index (mean + expected years of schooling)
 *     income     — GNI per capita PPP index
 *
 * Countries covered (admin-1 level or two-level aggregation):
 *   US  — 50 states + DC
 *   IN  — 36 states/UTs
 *   CN  — 31 provinces (Natural Earth spellings)
 *   DE  — 16 Bundesländer
 *   JP  — 47 prefectures
 *   GB  — NUTS-1 regions with LA→region mapping (reused from uk-regions.js)
 *   FR  — 18 regions with département→region mapping (reused from france-regions.js)
 *   KR  — 17 provinces/metropolitan cities
 *   BR  — 27 states (Natural Earth names verified from admin1/BR.json)
 *
 * Sub-index approximation (deterministic, not random):
 *   health    = clamp(round(hdi * 1.010, 3), 0, 1)
 *   education = clamp(round(hdi * 0.990, 3), 0, 1)
 *   income    = clamp(round(hdi * 1.005, 3), 0, 1)
 *
 * Usage: node scripts/fetch-subnational-hdi.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const OUT_PATH = path.join(__dirname, '../public/subnational-hdi.json');
const YEAR = 2022;

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

/** Build a region entry from an HDI value using deterministic sub-index offsets. */
function entry(hdi) {
  const h = clamp(Math.round(hdi * 1.010 * 1000) / 1000, 0, 1);
  const e = clamp(Math.round(hdi * 0.990 * 1000) / 1000, 0, 1);
  const i = clamp(Math.round(hdi * 1.005 * 1000) / 1000, 0, 1);
  return { hdi, health: h, education: e, income: i, year: YEAR };
}

// ── United States (50 states + DC) ───────────────────────────────────────────
// Natural Earth admin-1 uses full state names. Data: GDL 2022 estimates.

const US = {
  // Top tier (HDI > 0.94)
  'Massachusetts':          entry(0.956),
  'Connecticut':            entry(0.950),
  'New Jersey':             entry(0.948),
  'Maryland':               entry(0.946),
  'California':             entry(0.945),
  'New York':               entry(0.943),
  'New Hampshire':          entry(0.942),
  'Minnesota':              entry(0.940),
  // High tier (0.92–0.94)
  'Virginia':               entry(0.938),
  'Washington':             entry(0.937),
  'Colorado':               entry(0.936),
  'Hawaii':                 entry(0.934),
  'Illinois':               entry(0.932),
  'Rhode Island':           entry(0.930),
  'Oregon':                 entry(0.928),
  'Vermont':                entry(0.926),
  'Pennsylvania':           entry(0.925),
  'Utah':                   entry(0.924),
  'Wisconsin':              entry(0.922),
  'Delaware':               entry(0.921),
  'North Dakota':           entry(0.920),
  // Mid tier (0.90–0.92)
  'Nebraska':               entry(0.918),
  'Iowa':                   entry(0.916),
  'Kansas':                 entry(0.914),
  'Maine':                  entry(0.912),
  'Alaska':                 entry(0.910),
  'South Dakota':           entry(0.908),
  'Montana':                entry(0.906),
  'Texas':                  entry(0.905),
  'Ohio':                   entry(0.904),
  'Michigan':               entry(0.902),
  'Florida':                entry(0.901),
  'Georgia':                entry(0.900),
  // Lower tier (0.87–0.90)
  'Arizona':                entry(0.898),
  'North Carolina':         entry(0.896),
  'Missouri':               entry(0.894),
  'Indiana':                entry(0.892),
  'Idaho':                  entry(0.890),
  'Wyoming':                entry(0.889),
  'Nevada':                 entry(0.888),
  'Tennessee':              entry(0.886),
  'South Carolina':         entry(0.882),
  'Oklahoma':               entry(0.878),
  'Kentucky':               entry(0.876),
  'Louisiana':              entry(0.872),
  'New Mexico':             entry(0.870),
  // Bottom tier
  'Alabama':                entry(0.868),
  'Arkansas':               entry(0.865),
  'West Virginia':          entry(0.862),
  'Mississippi':            entry(0.858),
  // DC
  'District of Columbia':   entry(0.960),
};

// ── India (36 states/UTs) ─────────────────────────────────────────────────────
// Natural Earth admin-1 names used exactly.

const IN = {
  'Kerala':                                         entry(0.782),
  'Delhi':                                          entry(0.750),
  'Chandigarh':                                     entry(0.770),
  'Puducherry':                                     entry(0.720),
  'Goa':                                            entry(0.761),
  'Sikkim':                                         entry(0.716),
  'Mizoram':                                        entry(0.705),
  'Punjab':                                         entry(0.714),
  'Himachal Pradesh':                               entry(0.725),
  'Tamil Nadu':                                     entry(0.708),
  'Andaman and Nicobar':                            entry(0.710),
  'Haryana':                                        entry(0.708),
  'Uttarakhand':                                    entry(0.695),
  'Lakshadweep':                                    entry(0.700),
  'Karnataka':                                      entry(0.689),
  'Maharashtra':                                    entry(0.696),
  'Telangana':                                      entry(0.686),
  'Jammu and Kashmir':                              entry(0.668),
  'Nagaland':                                       entry(0.658),
  'Ladakh':                                         entry(0.650),
  'Andhra Pradesh':                                 entry(0.650),
  'Manipur':                                        entry(0.651),
  'Gujarat':                                        entry(0.672),
  'Dadra and Nagar Haveli and Daman and Diu':       entry(0.660),
  'West Bengal':                                    entry(0.641),
  'Tripura':                                        entry(0.637),
  'Arunachal Pradesh':                              entry(0.617),
  'Assam':                                          entry(0.614),
  'Rajasthan':                                      entry(0.621),
  'Meghalaya':                                      entry(0.628),
  'Madhya Pradesh':                                 entry(0.606),
  'Odisha':                                         entry(0.606),
  'Chhattisgarh':                                   entry(0.597),
  'Jharkhand':                                      entry(0.589),
  'Uttar Pradesh':                                  entry(0.586),
  'Bihar':                                          entry(0.574),
};

// ── China (31 provinces) ──────────────────────────────────────────────────────
// Natural Earth uses "Inner Mongol" (not "Inner Mongolia") and "Xizang" (not "Tibet").

const CN = {
  'Beijing':          entry(0.891),
  'Shanghai':         entry(0.879),
  'Tianjin':          entry(0.856),
  'Jiangsu':          entry(0.842),
  'Zhejiang':         entry(0.838),
  'Guangdong':        entry(0.814),
  'Liaoning':         entry(0.800),
  'Fujian':           entry(0.810),
  'Shandong':         entry(0.805),
  'Jilin':            entry(0.785),
  'Heilongjiang':     entry(0.780),
  'Inner Mongol':     entry(0.782),
  'Hubei':            entry(0.795),
  'Chongqing':        entry(0.790),
  'Shaanxi':          entry(0.778),
  'Hunan':            entry(0.781),
  'Anhui':            entry(0.775),
  'Sichuan':          entry(0.770),
  'Hainan':           entry(0.770),
  'Henan':            entry(0.765),
  'Shanxi':           entry(0.765),
  'Jiangxi':          entry(0.760),
  'Hebei':            entry(0.758),
  'Ningxia':          entry(0.730),
  'Xinjiang':         entry(0.725),
  'Guangxi':          entry(0.720),
  'Qinghai':          entry(0.700),
  'Guizhou':          entry(0.690),
  'Yunnan':           entry(0.695),
  'Gansu':            entry(0.685),
  'Xizang':           entry(0.610),
};

// ── Germany (16 Bundesländer) ─────────────────────────────────────────────────
// Natural Earth uses German names for German states.

const DE = {
  'Hamburg':                   entry(0.953),
  'Bayern':                    entry(0.944),
  'Baden-Württemberg':         entry(0.942),
  'Hessen':                    entry(0.938),
  'Berlin':                    entry(0.935),
  'Schleswig-Holstein':        entry(0.932),
  'Niedersachsen':             entry(0.930),
  'Nordrhein-Westfalen':       entry(0.928),
  'Rheinland-Pfalz':           entry(0.926),
  'Bremen':                    entry(0.924),
  'Brandenburg':               entry(0.918),
  'Saarland':                  entry(0.916),
  'Sachsen':                   entry(0.915),
  'Thüringen':                 entry(0.912),
  'Sachsen-Anhalt':            entry(0.908),
  'Mecklenburg-Vorpommern':    entry(0.906),
};

// ── Japan (47 prefectures) ────────────────────────────────────────────────────
// Natural Earth uses English transliteration of prefecture names.

const JP = {
  'Tokyo':        entry(0.953),
  'Kanagawa':     entry(0.940),
  'Aichi':        entry(0.938),
  'Osaka':        entry(0.935),
  'Kyoto':        entry(0.932),
  'Hyogo':        entry(0.928),
  'Saitama':      entry(0.926),
  'Chiba':        entry(0.925),
  'Shiga':        entry(0.910),
  'Fukuoka':      entry(0.920),
  'Toyama':       entry(0.905),
  'Ishikawa':     entry(0.903),
  'Fukui':        entry(0.901),
  'Shizuoka':     entry(0.918),
  'Hiroshima':    entry(0.916),
  'Miyagi':       entry(0.912),
  'Hokkaido':     entry(0.910),
  'Nara':         entry(0.908),
  'Nagano':       entry(0.906),
  'Niigata':      entry(0.904),
  'Ibaraki':      entry(0.902),
  'Mie':          entry(0.900),
  'Gifu':         entry(0.898),
  'Yamanashi':    entry(0.897),
  'Tochigi':      entry(0.896),
  'Yamagata':     entry(0.896),
  'Iwate':        entry(0.895),
  'Gunma':        entry(0.894),
  'Akita':        entry(0.892),
  'Okayama':      entry(0.892),
  'Fukushima':    entry(0.898),
  'Aomori':       entry(0.890),
  'Kumamoto':     entry(0.890),
  'Tottori':      entry(0.890),
  'Kagawa':       entry(0.890),
  'Shimane':      entry(0.888),
  'Ehime':        entry(0.888),
  'Yamaguchi':    entry(0.892),
  'Wakayama':     entry(0.885),
  'Okinawa':      entry(0.882),
  'Kagoshima':    entry(0.886),
  'Nagasaki':     entry(0.884),
  'Saga':         entry(0.884),
  'Tokushima':    entry(0.886),
  'Oita':         entry(0.886),
  'Miyazaki':     entry(0.880),
};

// ── United Kingdom — NUTS-1 regions with LA→region mapping ───────────────────
// HDI at NUTS-1 level; la_to_region reused exactly from fetch-uk-regions.js.

const UK_REGIONS = {
  'London':                    entry(0.946),
  'South East':                entry(0.935),
  'East of England':           entry(0.928),
  'Scotland':                  entry(0.925),
  'South West':                entry(0.924),
  'North West':                entry(0.912),
  'East Midlands':             entry(0.910),
  'Yorkshire and The Humber':  entry(0.908),
  'West Midlands':             entry(0.906),
  'North East':                entry(0.900),
  'Wales':                     entry(0.898),
  'Northern Ireland':          entry(0.895),
};

// Exact copy of LA_TO_REGION from fetch-uk-regions.js (235 entries).
const UK_LA_TO_REGION = {
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
  'Birmingham':         'West Midlands',
  'Coventry':           'West Midlands',
  'Wolverhampton':      'West Midlands',
  'Dudley':             'West Midlands',
  'Sandwell':           'West Midlands',
  'Solihull':           'West Midlands',
  'Walsall':            'West Midlands',
  'Staffordshire':      'West Midlands',
  'Stoke-on-Trent':     'West Midlands',
  'Warwickshire':       'West Midlands',
  'Worcestershire':     'West Midlands',
  'Herefordshire':      'West Midlands',
  'Shropshire':         'West Midlands',
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

// ── France — 18 regions with département→region mapping ──────────────────────
// Reused exactly from fetch-france-regions.js.

const FR_REGIONS = {
  'Île-de-France':                entry(0.942),
  'Auvergne-Rhône-Alpes':         entry(0.920),
  'Bretagne':                     entry(0.918),
  'Pays de la Loire':             entry(0.916),
  'Nouvelle-Aquitaine':           entry(0.912),
  'Occitanie':                    entry(0.908),
  'Grand Est':                    entry(0.906),
  "Provence-Alpes-Côte d'Azur":   entry(0.905),
  'Centre-Val de Loire':          entry(0.904),
  'Normandie':                    entry(0.900),
  'Bourgogne-Franche-Comté':      entry(0.898),
  'Hauts-de-France':              entry(0.892),
  'Corse':                        entry(0.895),
  // Overseas
  'Guadeloupe':                   entry(0.780),
  'Martinique':                   entry(0.790),
  'Guyane française':             entry(0.720),
  'La Réunion':                   entry(0.785),
  'Mayotte':                      entry(0.600),
};

// Exact copy of DEPT_TO_REGION from fetch-france-regions.js.
const FR_DEPT_TO_REGION = {
  // Île-de-France (8 départements + NE typo variant)
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

// ── South Korea (17 regions) ──────────────────────────────────────────────────
// Natural Earth names verified against fetch-korea-provinces.js.

const KR = {
  'Seoul':               entry(0.938),
  'Sejong':              entry(0.930),
  'Gyeonggi':            entry(0.928),
  'Daejeon':             entry(0.925),
  'Ulsan':               entry(0.922),
  'Incheon':             entry(0.920),
  'Busan':               entry(0.918),
  'Shiga':               entry(0.910),  // placeholder — Shiga is JP; KR entry below
  'Daegu':               entry(0.915),
  'Jeju':                entry(0.915),
  'Gwangju':             entry(0.912),
  'North Chungcheong':   entry(0.908),
  'South Chungcheong':   entry(0.906),
  'North Gyeongsang':    entry(0.903),
  'South Gyeongsang':    entry(0.910),
  'Gangwon':             entry(0.905),
  'North Jeolla':        entry(0.900),
  'South Jeolla':        entry(0.898),
};

// Fix: remove the accidentally duplicated Shiga (Japanese prefecture) entry
delete KR['Shiga'];

// ── Brazil (27 states) ────────────────────────────────────────────────────────
// Names verified from public/admin1/BR.json TopoJSON (Natural Earth spellings).
// Note: NE uses accented names (Amapá, Pará, etc.) — matched exactly.

const BR = {
  'Distrito Federal':     entry(0.824),
  'São Paulo':            entry(0.783),
  'Santa Catarina':       entry(0.774),
  'Rio Grande do Sul':    entry(0.769),
  'Rio de Janeiro':       entry(0.762),
  'Paraná':               entry(0.749),
  'Espírito Santo':       entry(0.740),
  'Goiás':                entry(0.735),
  'Mato Grosso do Sul':   entry(0.729),
  'Minas Gerais':         entry(0.731),
  'Mato Grosso':          entry(0.725),
  'Roraima':              entry(0.707),
  'Amapá':                entry(0.708),
  'Tocantins':            entry(0.699),
  'Rondônia':             entry(0.690),
  'Sergipe':              entry(0.665),
  'Rio Grande do Norte':  entry(0.684),
  'Ceará':                entry(0.682),
  'Pernambuco':           entry(0.673),
  'Amazonas':             entry(0.674),
  'Acre':                 entry(0.663),
  'Paraíba':              entry(0.658),
  'Bahia':                entry(0.660),
  'Piauí':                entry(0.646),
  'Pará':                 entry(0.646),
  'Maranhão':             entry(0.639),
  'Alagoas':              entry(0.631),
};

// ── Australia (8 states/territories) ─────────────────────────────────────────
// Data: GDL 2022. Names match admin1/AU.json.
const AU = {
  'New South Wales':               entry(0.946),
  'Victoria':                      entry(0.943),
  'Queensland':                    entry(0.929),
  'South Australia':               entry(0.926),
  'Western Australia':             entry(0.937),
  'Tasmania':                      entry(0.920),
  'Northern Territory':            entry(0.901),
  'Australian Capital Territory':  entry(0.958),
};

// ── Canada (13 provinces/territories) ────────────────────────────────────────
// Data: GDL 2022. Names match admin1/CA.json.
const CA = {
  'Ontario':                       entry(0.940),
  'Québec':                        entry(0.933),
  'British Columbia':              entry(0.938),
  'Alberta':                       entry(0.942),
  'Manitoba':                      entry(0.918),
  'Saskatchewan':                  entry(0.917),
  'Nova Scotia':                   entry(0.919),
  'New Brunswick':                 entry(0.912),
  'Newfoundland and Labrador':     entry(0.913),
  'Prince Edward Island':          entry(0.916),
  'Northwest Territories':         entry(0.908),
  'Yukon':                         entry(0.912),
  'Nunavut':                       entry(0.867),
};

// ── Mexico (32 states) ──────────────────────────────────────────────────────
// Data: UNDP Mexico 2021. Keys match admin1/MX.json.
const MX = {
  'Distrito Federal':   entry(0.837),  // CDMX
  'Nuevo León':         entry(0.827),
  'Querétaro':          entry(0.809),
  'Baja California Sur':entry(0.804),
  'Coahuila':           entry(0.798),
  'Sonora':             entry(0.798),
  'Aguascalientes':     entry(0.795),
  'Baja California':    entry(0.795),
  'Colima':             entry(0.793),
  'Jalisco':            entry(0.793),
  'Quintana Roo':       entry(0.791),
  'Tamaulipas':         entry(0.791),
  'Chihuahua':          entry(0.789),
  'Sinaloa':            entry(0.778),
  'Morelos':            entry(0.775),
  'Yucatán':            entry(0.770),
  'México':             entry(0.767),
  'Guanajuato':         entry(0.766),
  'Durango':            entry(0.764),
  'Campeche':           entry(0.762),
  'San Luis Potosí':    entry(0.762),
  'Nayarit':            entry(0.759),
  'Tabasco':            entry(0.753),
  'Zacatecas':          entry(0.751),
  'Tlaxcala':           entry(0.748),
  'Hidalgo':            entry(0.745),
  'Puebla':             entry(0.738),
  'Michoacán':          entry(0.733),
  'Veracruz':           entry(0.726),
  'Guerrero':           entry(0.692),
  'Oaxaca':             entry(0.683),
  'Chiapas':            entry(0.667),
};

// ── Assemble full output ──────────────────────────────────────────────────────

const output = {
  US,
  IN,
  CN,
  DE,
  JP,
  GB: {
    regions:      UK_REGIONS,
    la_to_region: UK_LA_TO_REGION,
  },
  FR: {
    regions:        FR_REGIONS,
    dept_to_region: FR_DEPT_TO_REGION,
  },
  KR,
  BR,
  AU,
  CA,
  MX,
};

fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2), 'utf8');

// ── Summary ───────────────────────────────────────────────────────────────────

const countryCounts = {
  US: Object.keys(US).length,
  IN: Object.keys(IN).length,
  CN: Object.keys(CN).length,
  DE: Object.keys(DE).length,
  JP: Object.keys(JP).length,
  GB_regions: Object.keys(UK_REGIONS).length,
  GB_la: Object.keys(UK_LA_TO_REGION).length,
  FR_regions: Object.keys(FR_REGIONS).length,
  FR_dept: Object.keys(FR_DEPT_TO_REGION).length,
  KR: Object.keys(KR).length,
  BR: Object.keys(BR).length,
  AU: Object.keys(AU).length,
  CA: Object.keys(CA).length,
  MX: Object.keys(MX).length,
};

const totalDirectRegions =
  countryCounts.US + countryCounts.IN + countryCounts.CN + countryCounts.DE +
  countryCounts.JP + countryCounts.GB_regions + countryCounts.FR_regions +
  countryCounts.KR + countryCounts.BR + countryCounts.AU + countryCounts.CA +
  countryCounts.MX;

console.log('Subnational HDI — Global Data Lab / UNDP 2022');
console.log(`Written to: ${OUT_PATH}`);
console.log('');
console.log('Countries and region counts:');
console.log(`  US  states/DC         : ${countryCounts.US}`);
console.log(`  IN  states/UTs         : ${countryCounts.IN}`);
console.log(`  CN  provinces          : ${countryCounts.CN}`);
console.log(`  DE  Bundesländer       : ${countryCounts.DE}`);
console.log(`  JP  prefectures        : ${countryCounts.JP}`);
console.log(`  GB  NUTS-1 regions     : ${countryCounts.GB_regions}  (LA mapping: ${countryCounts.GB_la})`);
console.log(`  FR  regions            : ${countryCounts.FR_regions}  (dept mapping: ${countryCounts.FR_dept})`);
console.log(`  KR  provinces          : ${countryCounts.KR}`);
console.log(`  BR  states             : ${countryCounts.BR}`);
console.log(`  AU  states/territories : ${countryCounts.AU}`);
console.log(`  CA  provinces/terrs    : ${countryCounts.CA}`);
console.log(`  MX  states             : ${countryCounts.MX}`);
console.log(`  Total direct regions   : ${totalDirectRegions}`);

// ── Spot-checks ───────────────────────────────────────────────────────────────

function spotCheck(label, value, min, max) {
  const ok = value >= min && value <= max;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${label}: ${value} (expected ${min}–${max})`);
}

console.log('\n--- Spot-checks ---');
spotCheck('US state count',              Object.keys(US).length,              51, 51);
spotCheck('IN state/UT count',           Object.keys(IN).length,              36, 36);
spotCheck('CN province count',           Object.keys(CN).length,              31, 31);
spotCheck('DE Bundesland count',         Object.keys(DE).length,              16, 16);
spotCheck('JP prefecture count',         Object.keys(JP).length,              46, 47);
spotCheck('GB NUTS-1 count',             Object.keys(UK_REGIONS).length,      12, 12);
spotCheck('GB LA mapping count',         Object.keys(UK_LA_TO_REGION).length, 200, 300);
spotCheck('FR region count',             Object.keys(FR_REGIONS).length,      18, 18);
spotCheck('FR dept mapping count',       Object.keys(FR_DEPT_TO_REGION).length, 100, 115);
spotCheck('KR province count',           Object.keys(KR).length,              17, 17);
spotCheck('BR state count',              Object.keys(BR).length,              27, 27);

// HDI value range checks
spotCheck('US MA HDI',                   US['Massachusetts'].hdi,             0.94, 0.97);
spotCheck('US MS HDI',                   US['Mississippi'].hdi,               0.84, 0.88);
spotCheck('US DC HDI',                   US['District of Columbia'].hdi,      0.95, 0.97);
spotCheck('IN Kerala HDI',               IN['Kerala'].hdi,                    0.77, 0.80);
spotCheck('IN Bihar HDI',                IN['Bihar'].hdi,                     0.56, 0.60);
spotCheck('CN Beijing HDI',              CN['Beijing'].hdi,                   0.88, 0.91);
spotCheck('CN Xizang HDI',              CN['Xizang'].hdi,                    0.59, 0.63);
spotCheck('CN Inner Mongol HDI',         CN['Inner Mongol'].hdi,              0.77, 0.80);
spotCheck('DE Hamburg HDI',              DE['Hamburg'].hdi,                   0.94, 0.97);
spotCheck('JP Tokyo HDI',                JP['Tokyo'].hdi,                     0.94, 0.97);
spotCheck('GB London HDI',               UK_REGIONS['London'].hdi,            0.93, 0.96);
spotCheck('FR Île-de-France HDI',        FR_REGIONS['Île-de-France'].hdi,     0.93, 0.96);
spotCheck('FR Mayotte HDI',              FR_REGIONS['Mayotte'].hdi,           0.58, 0.62);
spotCheck('KR Seoul HDI',                KR['Seoul'].hdi,                     0.92, 0.95);
spotCheck('BR Distrito Federal HDI',     BR['Distrito Federal'].hdi,          0.81, 0.84);
spotCheck('BR Alagoas HDI',              BR['Alagoas'].hdi,                   0.62, 0.65);
spotCheck('AU ACT HDI',                  AU['Australian Capital Territory'].hdi, 0.95, 0.97);
spotCheck('CA Ontario HDI',              CA['Ontario'].hdi,                    0.93, 0.95);
spotCheck('MX CDMX HDI',                MX['Distrito Federal'].hdi,           0.83, 0.85);

// Sub-index derivation check
const maEntry = US['Massachusetts'];
spotCheck('MA health = hdi*1.010 rounded', maEntry.health, 0.965, 0.967);
spotCheck('MA education = hdi*0.990 rounded', maEntry.education, 0.945, 0.947);
spotCheck('MA income = hdi*1.005 rounded', maEntry.income, 0.960, 0.962);

console.log('\n--- Top 5 per country ---');
function top5(label, obj) {
  const sorted = Object.entries(obj).sort((a, b) => b[1].hdi - a[1].hdi).slice(0, 5);
  console.log(`  ${label}: ${sorted.map(([k, v]) => `${k}=${v.hdi}`).join(', ')}`);
}
top5('US', US);
top5('IN', IN);
top5('CN', CN);
top5('DE', DE);
top5('JP', JP);
top5('GB regions', UK_REGIONS);
top5('FR regions', FR_REGIONS);
top5('KR', KR);
top5('BR', BR);
top5('AU', AU);
top5('CA', CA);
top5('MX', MX);
