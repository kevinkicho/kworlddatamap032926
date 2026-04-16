#!/usr/bin/env node
/**
 * scripts/fill-gdp.js
 *
 * Fills gdp_nominal (billions USD), gdp_ppp (billions USD), and gdp_growth (%)
 * for countries in kdb.json using Wikipedia tables + hardcoded fallback.
 *
 * Wikipedia pages scraped:
 *   - List of countries by GDP (nominal)
 *   - List of countries by GDP (PPP)
 *   - List of countries by GDP growth
 *
 * Also computes gdp_nominal from gdp_per_capita * population where both exist
 * but no external source is available.
 *
 * Usage:
 *   node scripts/fill-gdp.js
 *
 * Safe to re-run — only fills null fields, never overwrites existing values.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { atomicWrite } = require('./safe-write');

const OUT_FILE = path.join(__dirname, '..', 'public', 'kdb.json');

function stripTags(html) {
  return html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/&#160;/g, ' ').replace(/&#91;[^\\]*?&#93;/g, '').replace(/\s+/g, ' ').trim();
}

function parseNum(s) {
  if (!s) return NaN;
  const cleaned = s.replace(/[, ]/g, '').replace(/[–—]/, '-');
  return parseFloat(cleaned);
}

const NAME_TO_ISO = {
  'afghanistan': 'AF', 'albania': 'AL', 'algeria': 'DZ', 'andorra': 'AD',
  'angola': 'AO', 'antigua and barbuda': 'AG', 'argentina': 'AR', 'armenia': 'AM',
  'aruba': 'AW', 'australia': 'AU', 'austria': 'AT', 'azerbaijan': 'AZ',
  'bahamas': 'BS', 'bahamas, the': 'BS', 'bahrain': 'BH', 'bangladesh': 'BD',
  'barbados': 'BB', 'belarus': 'BY', 'belgium': 'BE', 'belize': 'BZ',
  'benin': 'BJ', 'bermuda': 'BM', 'bhutan': 'BT', 'bolivia': 'BO',
  'bosnia and herzegovina': 'BA', 'botswana': 'BW', 'brazil': 'BR',
  'brunei': 'BN', 'brunei darussalam': 'BN', 'bulgaria': 'BG', 'burkina faso': 'BF',
  'burundi': 'BI', 'cabo verde': 'CV', 'cambodia': 'KH', 'cameroon': 'CM',
  'canada': 'CA', 'cayman islands': 'KY', 'central african republic': 'CF',
  'chad': 'TD', 'chile': 'CL', 'china': 'CN', 'colombia': 'CO',
  'comoros': 'KM', 'congo': 'CG', 'costa rica': 'CR', "côte d'ivoire": 'CI',
  'ivory coast': 'CI', 'croatia': 'HR', 'cuba': 'CU', 'curacao': 'CW',
  'cyprus': 'CY', 'czechia': 'CZ', 'czech republic': 'CZ', 'denmark': 'DK',
  'djibouti': 'DJ', 'dominica': 'DM', 'dominican republic': 'DO', 'ecuador': 'EC',
  'egypt': 'EG', 'el salvador': 'SV', 'equatorial guinea': 'GQ', 'eritrea': 'ER',
  'estonia': 'EE', 'eswatini': 'SZ', 'swaziland': 'SZ', 'ethiopia': 'ET',
  'faroe islands': 'FO', 'fiji': 'FJ', 'finland': 'FI', 'france': 'FR',
  'gabon': 'GA', 'gambia': 'GM', 'gambia, the': 'GM', 'georgia': 'GE',
  'germany': 'DE', 'ghana': 'GH', 'greece': 'GR', 'grenada': 'GD',
  'guatemala': 'GT', 'guernsey': 'GG', 'guinea': 'GN', 'guinea-bissau': 'GW',
  'guyana': 'GY', 'haiti': 'HT', 'honduras': 'HN', 'hong kong': 'HK',
  'hong kong sar': 'HK', 'hungary': 'HU', 'iceland': 'IS', 'india': 'IN',
  'indonesia': 'ID', 'iran': 'IR', 'iraq': 'IQ', 'ireland': 'IE',
  'isle of man': 'IM', 'israel': 'IL', 'italy': 'IT', 'jamaica': 'JM',
  'japan': 'JP', 'jersey': 'JE', 'jordan': 'JO', 'kazakhstan': 'KZ',
  'kenya': 'KE', 'kiribati': 'KI', 'kuwait': 'KW', 'kyrgyzstan': 'KG',
  'laos': 'LA', 'latvia': 'LV', 'lebanon': 'LB', 'lesotho': 'LS',
  'liberia': 'LR', 'libya': 'LY', 'liechtenstein': 'LI', 'lithuania': 'LT',
  'luxembourg': 'LU', 'macao': 'MO', 'macau': 'MO', 'madagascar': 'MG',
  'malawi': 'MW', 'malaysia': 'MY', 'maldives': 'MV', 'mali': 'ML',
  'malta': 'MT', 'marshall islands': 'MH', 'mauritania': 'MR', 'mauritius': 'MU',
  'mexico': 'MX', 'moldova': 'MD', 'monaco': 'MC', 'mongolia': 'MN',
  'montenegro': 'ME', 'morocco': 'MA', 'mozambique': 'MZ', 'myanmar': 'MM',
  'namibia': 'NA', 'nauru': 'NR', 'nepal': 'NP', 'netherlands': 'NL',
  'new zealand': 'NZ', 'nicaragua': 'NI', 'niger': 'NE', 'nigeria': 'NG',
  'north korea': 'KP', 'north macedonia': 'MK', 'norway': 'NO', 'oman': 'OM',
  'pakistan': 'PK', 'palau': 'PW', 'palestine': 'PS', 'panama': 'PA',
  'papua new guinea': 'PG', 'paraguay': 'PY', 'peru': 'PE', 'philippines': 'PH',
  'poland': 'PL', 'portugal': 'PT', 'qatar': 'QA', 'romania': 'RO',
  'russia': 'RU', 'rwanda': 'RW', 'saint kitts and nevis': 'KN',
  'saint lucia': 'LC', 'saint vincent and the grenadines': 'VC',
  'san marino': 'SM', 'sao tome and principe': 'ST', 'saudi arabia': 'SA',
  'senegal': 'SN', 'serbia': 'RS', 'seychelles': 'SC', 'sierra leone': 'SL',
  'singapore': 'SG', 'slovakia': 'SK', 'slovenia': 'SI', 'solomon islands': 'SB',
  'somalia': 'SO', 'south africa': 'ZA', 'south korea': 'KR', 'south sudan': 'SS',
  'spain': 'ES', 'sri lanka': 'LK', 'sudan': 'SD', 'suriname': 'SR',
  'sweden': 'SE', 'switzerland': 'CH', 'syria': 'SY', 'taiwan': 'TW',
  'tajikistan': 'TJ', 'tanzania': 'TZ', 'thailand': 'TH', 'timor-leste': 'TL',
  'togo': 'TG', 'trinidad and tobago': 'TT', 'tunisia': 'TN', 'turkey': 'TR',
  'turkiye': 'TR', 'turkmenistan': 'TM', 'tuvalu': 'TV', 'uganda': 'UG',
  'ukraine': 'UA', 'united arab emirates': 'AE', 'united kingdom': 'GB',
  'united states': 'US', 'uruguay': 'UY', 'uzbekistan': 'UZ', 'vanuatu': 'VU',
  'venezuela': 'VE', 'vietnam': 'VN', 'yemen': 'YE', 'zambia': 'ZM',
  'zimbabwe': 'ZW',
  'bosnia and herz.': 'BA', 'congo, dem. rep.': 'CD',
  'korea, south': 'KR', 'macedonia (fyrom)': 'MK', 'micronesia': 'FM',
  'republic of congo': 'CG', 'rep. of congo': 'CG', 'drc': 'CD',
  'democratic republic of congo': 'CD', 'dr congo': 'CD',
  'republic of korea': 'KR', 'korea, rep.': 'KR',
  "cote d'ivoire": 'CI', "côte d'ivoire": 'CI',
  'united states of america': 'US', 'us': 'US',
  'hong kong (china)': 'HK', 'macao (china)': 'MO',
  'republic of moldova': 'MD', 'the bahamas': 'BS', 'the gambia': 'GM',
  'korea, dem. people\'s rep.': 'KP', 'people\'s republic of china': 'CN',
  'slovak republic': 'SK', 'czech rep.': 'CZ', 'russian fed.': 'RU',
  'iran (islamic republic of)': 'IR', 'iran, islamic rep.': 'IR',
  'tanzania (united republic of)': 'TZ',
  'venezuela (bolivarian republic of)': 'VE',
  'bolivia (plurinational state of)': 'BO',
  'saint vincent & the grenadines': 'VC',
  'trinidad & tobago': 'TT', 'antigua & barbuda': 'AG',
  'são tomé and príncipe': 'ST', 'sao tome & principe': 'ST',
  'stkitts and nevis': 'KN', 'st. kitts and nevis': 'KN',
  'st. lucia': 'LC', 'st. vincent and the grenadines': 'VC',
  'congo, dem. rep.': 'CD', 'congo, rep.': 'CG',
  'curacao': 'CW', 'curaçao': 'CW',
  'sint maarten (dutch part)': 'SX', 'guam': 'GU', 'puerto rico': 'PR',
  'new caledonia': 'NC', 'french polynesia': 'PF', 'kosovo': 'XK',
  'gibraltar': 'GI', 'greenland': 'GL', 'faroe islands': 'FO',
  'isle of man': 'IM', 'channel islands': 'JG',
  'democratic people\'s republic of korea': 'KP',
  'hong kong sar (china)': 'HK', 'macao sar (china)': 'MO',
  'united states': 'US', 'china': 'CN',
  'tanzania, united republic of': 'TZ',
  'venezuela, bolivarian republic of': 'VE',
  'bolivia, plurinational state of': 'BO',
  'iran, islamic republic of': 'IR',
  'moldova, republic of': 'MD',
  'korea, republic of': 'KR',
  'congo, democratic republic of the': 'CD',
  'congo, republic of the': 'CG',
  'brunei darussalam': 'BN',
  'lao people\'s democratic republic': 'LA',
  'viet nam': 'VN', 'syrian arab republic': 'SY',
  'russian federation': 'RU',
  'palestine, state of': 'PS',
  'micronesia, fed. sts.': 'FM',
  'turks and caicos islands': 'TC',
  'virgin islands (u.s.)': 'VI', 'british virgin islands': 'VG',
  'netherlands antilles': 'CW',
  'sint maarten': 'SX', 'são tomé and principe': 'ST',
  'hong kong sar': 'HK', 'macao sar': 'MO',
  'korea, dem. people\'s rep.': 'KP',
};

async function fetchWiki(url) {
  console.log('  Fetching ' + url.split('/').pop() + '...');
  const res = await fetch(url, {
    headers: { 'User-Agent': 'kworlddatamap/1.0 (educational; nodejs)' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();
}

function parseTable(html, skipRows) {
  const results = [];
  const tables = [...html.matchAll(/<table[^>]*class="[^"]*wikitable[^"]*"[^>]*>([\s\S]*?)<\/table>/gi)];
  if (tables.length === 0) return results;

  const table = tables[0][1];
  const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  for (let i = (skipRows || 0); i < rows.length; i++) {
    const cells = [...rows[i][1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)];
    if (cells.length >= 2) {
      const name = stripTags(cells[0][1]);
      const val = parseNum(stripTags(cells[1][1]));
      if (name && !isNaN(val) && name !== 'World' && name !== 'Country' && name !== 'Country/Territory') {
        results.push({ name, val });
      }
    }
  }
  return results;
}

function parseGrowthTable(html) {
  const results = [];
  const tables = [...html.matchAll(/<table[^>]*class="[^"]*wikitable[^"]*"[^>]*>([\s\S]*?)<\/table>/gi)];
  if (tables.length === 0) return results;

  for (const [, table] of tables) {
    const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    for (const [, row] of rows) {
      const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)];
      if (cells.length >= 2) {
        const name = stripTags(cells[0][1]);
        const val = parseNum(stripTags(cells[1][1]));
        if (name && !isNaN(val) && name !== 'World' && name !== 'Country' && name !== 'Country/Territory' &&
            name !== 'Rate (%)' && name !== 'Regional groupings') {
          const already = results.find(r => r.name.toLowerCase().replace(/[.,]/g, '') === name.toLowerCase().replace(/[.,]/g, ''));
          if (!already) results.push({ name, val });
        }
      }
    }
    if (results.length > 30) break;
  }
  return results;
}

const FALLBACK_NOMINAL = {
  US: 28751, CN: 18744, DE: 4686, JP: 4028, IN: 3937, GB: 3588,
  FR: 3463, IT: 2929, CA: 2638, BR: 2416, RU: 2220, AU: 1771,
  KR: 1752, MX: 1468, ES: 1465, ID: 1381, NL: 1032, SA: 1069,
  CH: 885, TR: 1042, PL: 774, SE: 586, BE: 578, AR: 621,
  NO: 546, DK: 395, TH: 535, IE: 498, IL: 470, AE: 460,
  NG: 390, ZA: 374, AT: 473, SG: 467, PH: 437, MY: 430,
  VN: 429, EG: 395, BD: 437, CL: 301, RO: 308, CO: 358,
  CZ: 290, PK: 340, PT: 288, NZ: 247, HU: 221, KE: 220,
  PE: 252, KW: 165, KZ: 237, GR: 219, UA: 190, QA: 235,
  HR: 78, HK: 383, NO: 546, FI: 282, IE: 498, BG: 104,
  SK: 128, LT: 78, SI: 73, LV: 43, EE: 36, LU: 90,
  IS: 28, MT: 20, CY: 36, MT: 20, MU: 14, UY: 77,
  LK: 74, GH: 77, DO: 113, CR: 78, PA: 83, EC: 115,
  RO: 308, GT: 100, QA: 235, OM: 100, BH: 44,
  JO: 51, LB: 18, KW: 165, ER: 3.7, KP: 18, GI: 4, VG: 1.2, JG: 12,
};

const FALLBACK_PPP = {
  US: 28751, CN: 38200, IN: 14500, JP: 6512, DE: 5418,
  RU: 5870, GB: 3998, FR: 3800, BR: 4000, IT: 3200,
  CA: 2600, MX: 3000, KR: 2700, AU: 1700, ES: 2300,
  ID: 4200, TR: 3200, NL: 1200, SA: 1700, CH: 800,
  AR: 1300, PL: 1500, SE: 650, BE: 600, TH: 1500,
  IR: 1600, NG: 1300, ZA: 900, PH: 1300, EG: 1800,
  PK: 1400, VN: 1400, BD: 1400, MY: 1200, CO: 1100,
  CL: 700, CZ: 500, RO: 700, PE: 500, UA: 600,
  GR: 380, HK: 450, NO: 550, IE: 500, AT: 550,
  IL: 400, SG: 700, NZ: 240, DK: 380, FI: 290,
  PT: 400, HU: 380, SK: 210, BG: 190, HR: 130,
  LT: 110, SI: 100, LV: 70, EE: 55, LU: 90,
  IS: 25, CY: 45, MT: 25, KW: 250, OM: 120,
  QA: 350, BH: 80, JO: 100, LK: 320, GH: 170,
  DO: 250, CR: 120, PA: 150, EC: 250, GT: 200,
  KE: 250, UY: 100, MU: 35, ER: 8, KP: 40, GI: 4, VG: 1, JG: 15,
};

const FALLBACK_GROWTH = {
  AL: 3.4, DZ: 3.4, AD: 2.4, AO: 2.1, AG: 4.3, AR: 2.5,
  AM: 5.5, AU: 1.9, AT: 1.0, AZ: 4.5, BS: 2.0, BH: 3.5,
  BD: 6.5, BB: 4.5, BY: 3.5, BE: 1.0, BZ: 2.5, BJ: 5.5,
  BT: 4.5, BO: 2.5, BA: 3.0, BW: 3.5, BR: 3.0, BN: 2.0,
  BG: 2.0, BF: 5.0, BI: 3.0, KH: 6.0, CM: 4.0, CA: 1.5,
  CV: 4.0, CF: 3.5, TD: 3.5, CL: 2.5, CN: 5.0, CO: 2.5,
  KM: 3.5, CG: 3.5, CD: 6.0, CR: 3.5, CI: 6.5, HR: 3.5,
  CU: 1.5, CW: 3.0, CY: 2.5, CZ: 1.5, DK: 1.5, DJ: 5.0,
  DM: 4.5, DO: 5.0, EC: 2.5, EG: 3.5, SV: 2.5, GQ: 3.5,
  ER: 2.5, EE: 2.0, SZ: 3.5, ET: 6.0, FI: 1.0, FJ: 3.0,
  FR: 1.0, GA: 3.0, GM: 5.0, GE: 4.5, DE: 0.5, GH: 4.0,
  GR: 2.0, GD: 4.0, GT: 3.5, GN: 5.0, GW: 4.0, GY: 5.0,
  HT: 1.5, HN: 3.5, HK: 3.0, HU: 2.0, IS: 2.0, IN: 7.0,
  ID: 5.0, IR: 3.5, IQ: 4.0, IE: 3.0, IL: 2.0, IT: 1.0,
  JM: 3.0, JP: 1.0, JO: 2.5, KZ: 4.0, KE: 5.5, KI: 2.0,
  KN: 3.5, XK: 4.0, KW: 2.0, KG: 4.0, LA: 5.0, LV: 2.0,
  LB: -2.0, LS: 2.5, LR: 4.0, LY: 5.0, LI: 1.0, LT: 2.5,
  LU: 2.0, MG: 4.0, MW: 4.0, MY: 4.5, MV: 6.0, ML: 5.0,
  MT: 3.5, MR: 3.5, MU: 4.0, MX: 3.0, MD: 2.0, MN: 5.0,
  ME: 4.0, MA: 3.5, MZ: 4.0, MM: 3.0, NA: 3.0, NP: 4.5,
  NL: 1.5, NZ: 2.0, NI: 4.0, NE: 5.0, NG: 3.5, MK: 2.5,
  NO: 1.5, OM: 3.0, PK: 4.0, PA: 4.0, PG: 4.0, PY: 3.5,
  PE: 3.0, PH: 5.5, PL: 3.0, PT: 2.0, QA: 3.0, RO: 3.5,
  RU: 3.0, RW: 6.0, LC: 3.5, VC: 3.0, SM: 1.5, ST: 4.0,
  SA: 2.5, SN: 5.0, RS: 3.5, SC: 4.0, SL: 3.5, SG: 3.0,
  SK: 2.0, SI: 2.5, SB: 2.0, SO: 3.0, ZA: 1.5, KR: 2.5,
  ES: 2.0, LK: 3.0, SD: -2.0, SR: 2.5, SE: 1.0, CH: 1.0,
  SY: -5.0, TW: 3.5, TJ: 5.5, TZ: 5.0, TH: 3.0, TL: 3.0,
  TG: 5.0, TO: 2.5, TT: 2.0, TN: 2.5, TR: 3.5, TM: 5.0,
  TV: 2.0, UG: 5.5, UA: 3.0, AE: 3.0, GB: 0.5, US: 2.5,
  UY: 3.0, UZ: 5.0, VU: 3.0, VE: -3.0, VN: 6.0, YE: -5.0,
  ZM: 3.5, ZW: 3.5,   GL: 1.0, PR: 1.5, GU: 1.5, MO: 5.0,
  KY: 2.0, GI: 3.0, ER: 2.0, KP: -0.5, VG: 2.0, JG: 1.5,
};

async function main() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║   GDP Filler (Wikipedia + Fallback)                   ║');
  console.log('╚═══════════════════════════════════════════════════════╝');

  console.log('\nLoading ' + OUT_FILE + '...');
  const kdb = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
  const existing = kdb['country-data'];

  const isReal = k => existing[k].name && existing[k].income_level !== 'Aggregates';

  const beforeNom = Object.keys(existing).filter(k => isReal(k) && existing[k].gdp_nominal).length;
  const beforePpp = Object.keys(existing).filter(k => isReal(k) && existing[k].gdp_ppp).length;
  const beforeGrow = Object.keys(existing).filter(k => isReal(k) && existing[k].gdp_growth).length;
  const realTotal = Object.keys(existing).filter(k => isReal(k)).length;

  console.log('Before: gdp_nominal=' + beforeNom + '/' + realTotal + '  gdp_ppp=' + beforePpp + '/' + realTotal + '  gdp_growth=' + beforeGrow + '/' + realTotal);

  const nameToIso = {};
  for (const [iso, entry] of Object.entries(existing)) {
    if (entry.name) nameToIso[entry.name.toLowerCase()] = iso;
  }

  function resolveIso(name) {
    const key = name.toLowerCase().replace(/[.,]/g, '').trim();
    if (NAME_TO_ISO[key]) return NAME_TO_ISO[key];
    if (nameToIso[key]) return nameToIso[key];
    const without = key.replace(/,\s*the\s*$/i, '').replace(/\s*\(.*\)\s*$/, '').trim();
    if (NAME_TO_ISO[without]) return NAME_TO_ISO[without];
    if (nameToIso[without]) return nameToIso[without];
    return null;
  }

  // Step 1: Try Wikipedia for GDP nominal
  let nomAdded = 0, pppAdded = 0, growAdded = 0;

  try {
    const html = await fetchWiki('https://en.wikipedia.org/wiki/List_of_countries_by_GDP_(nominal)');
    console.log('  Fetched ' + html.length + ' bytes');
    const rows = parseTable(html, 1);
    console.log('  Parsed ' + rows.length + ' nominal GDP rows');
    for (const { name, val } of rows) {
      const iso = resolveIso(name);
      if (!iso || !existing[iso] || !isReal(iso)) continue;
      if (existing[iso].gdp_nominal == null) {
        existing[iso].gdp_nominal = val;
        nomAdded++;
      }
    }
  } catch (e) {
    console.error('  Failed: ' + e.message);
  }

  // Step 2: Try Wikipedia for GDP PPP
  try {
    const html = await fetchWiki('https://en.wikipedia.org/wiki/List_of_countries_by_GDP_(PPP)');
    console.log('  Fetched ' + html.length + ' bytes');
    const rows = parseTable(html, 1);
    console.log('  Parsed ' + rows.length + ' PPP GDP rows');
    for (const { name, val } of rows) {
      const iso = resolveIso(name);
      if (!iso || !existing[iso] || !isReal(iso)) continue;
      if (existing[iso].gdp_ppp == null) {
        existing[iso].gdp_ppp = val;
        pppAdded++;
      }
    }
  } catch (e) {
    console.error('  Failed: ' + e.message);
  }

  // Step 3: Try Wikipedia for GDP growth
  try {
    const html = await fetchWiki('https://en.wikipedia.org/wiki/List_of_countries_by_GDP_growth');
    console.log('  Fetched ' + html.length + ' bytes');
    const rows = parseGrowthTable(html);
    console.log('  Parsed ' + rows.length + ' growth rows');
    for (const { name, val } of rows) {
      const iso = resolveIso(name);
      if (!iso || !existing[iso] || !isReal(iso)) continue;
      if (existing[iso].gdp_growth == null) {
        existing[iso].gdp_growth = val;
        growAdded++;
      }
    }
  } catch (e) {
    console.error('  Failed: ' + e.message);
  }

  console.log('\nWikipedia results: nominal +' + nomAdded + ', PPP +' + pppAdded + ', growth +' + growAdded);

  // Step 4: Apply fallback data
  console.log('\nApplying fallback data...');
  let fbNom = 0, fbPpp = 0, fbGrow = 0, fbNoMatch = 0;

  for (const [iso, val] of Object.entries(FALLBACK_NOMINAL)) {
    const entry = existing[iso];
    if (!entry) { fbNoMatch++; continue; }
    if (isReal(iso) && entry.gdp_nominal == null) { entry.gdp_nominal = val; fbNom++; }
  }

  for (const [iso, val] of Object.entries(FALLBACK_PPP)) {
    const entry = existing[iso];
    if (!entry) continue;
    if (isReal(iso) && entry.gdp_ppp == null) { entry.gdp_ppp = val; fbPpp++; }
  }

  for (const [iso, val] of Object.entries(FALLBACK_GROWTH)) {
    const entry = existing[iso];
    if (!entry) continue;
    if (isReal(iso) && entry.gdp_growth == null) { entry.gdp_growth = val; fbGrow++; }
  }

  console.log('Fallback: nominal +' + fbNom + ', PPP +' + fbPpp + ', growth +' + fbGrow);

  // Step 5: Compute gdp_nominal from gdp_per_capita * population where still missing
  let computed = 0;
  for (const [iso, entry] of Object.entries(existing)) {
    if (!isReal(iso)) continue;
    if (entry.gdp_nominal == null && entry.gdp_per_capita != null && entry.population != null) {
      entry.gdp_nominal = Math.round(entry.gdp_per_capita * entry.population / 1e9 * 100) / 100;
      computed++;
    }
  }
  console.log('Computed from per_capita * population: +' + computed + ' nominal GDP values');

  // Summary
  const afterNom = Object.keys(existing).filter(k => isReal(k) && existing[k].gdp_nominal).length;
  const afterPpp = Object.keys(existing).filter(k => isReal(k) && existing[k].gdp_ppp).length;
  const afterGrow = Object.keys(existing).filter(k => isReal(k) && existing[k].gdp_growth).length;

  console.log('');
  console.log('=== Final Coverage (real countries only) ===');
  console.log('gdp_nominal: ' + afterNom + '/' + realTotal + ' (' + Math.round(afterNom / realTotal * 100) + '%)');
  console.log('gdp_ppp:     ' + afterPpp + '/' + realTotal + ' (' + Math.round(afterPpp / realTotal * 100) + '%)');
  console.log('gdp_growth:  ' + afterGrow + '/' + realTotal + ' (' + Math.round(afterGrow / realTotal * 100) + '%)');

  const stillMissingNom = Object.keys(existing).filter(k => isReal(k) && !existing[k].gdp_nominal);
  if (stillMissingNom.length > 0 && stillMissingNom.length <= 30) {
    console.log('\nStill missing gdp_nominal (' + stillMissingNom.length + '):');
    stillMissingNom.forEach(k => console.log('  ' + k + ' ' + existing[k].name));
  }

  atomicWrite(OUT_FILE, JSON.stringify(kdb, null, 2));
  console.log('\nWrote ' + OUT_FILE);
}

main().catch(err => {
  console.error('Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});