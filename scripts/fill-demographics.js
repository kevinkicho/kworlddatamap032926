#!/usr/bin/env node
/**
 * scripts/fill-demographics.js
 *
 * Fills birth_rate and death_rate (per 1000 population) for countries
 * in kdb.json using Wikipedia tables + hardcoded fallback data.
 *
 * Wikipedia pages scraped:
 *   - List of sovereign states and dependent territories by birth rate
 *   - List of sovereign states and dependent territories by mortality rate
 *
 * Usage:
 *   node scripts/fill-demographics.js
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
    .replace(/&#160;/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseNum(s) {
  if (!s) return NaN;
  return parseFloat(s.replace(/[, ]/g, ''));
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
  'turkmenistan': 'TM', 'tuvalu': 'TV', 'uganda': 'UG', 'ukraine': 'UA',
  'united arab emirates': 'AE', 'united kingdom': 'GB', 'united states': 'US',
  'uruguay': 'UY', 'uzbekistan': 'UZ', 'vanuatu': 'VU', 'venezuela': 'VE',
  'vietnam': 'VN', 'yemen': 'YE', 'zambia': 'ZM', 'zimbabwe': 'ZW',
  'korea, republic of': 'KR', 'russian federation': 'RU',
  'iran, islamic rep.': 'IR', 'hong kong (china)': 'HK',
  'macao (china)': 'MO', 'congo, dem. rep.': 'CD',
  'congo, rep.': 'CG', 'kosovo': 'XK', 'gibraltar': 'GI',
  'greenland': 'GL', 'puerto rico': 'PR', 'guam': 'GU',
  'new caledonia': 'NC', 'french polynesia': 'PF',
  'channel islands': 'JG', 'isle of man': 'IM',
  'bosnia and herz.': 'BA', 'bolivia (plurinational state of)': 'BO',
  'venezuela (bolivarian republic of)': 'VE',
  'iran (islamic republic of)': 'IR', 'turkiye': 'TR',
  'russian fed.': 'RU', 'micronesia, fed. sts.': 'FM',
  'brunei darussalam': 'BN', 'são tomé and príncipe': 'ST',
  'sao tome & principe': 'ST', 'stkitts and nevis': 'KN',
  'st. kitts and nevis': 'KN', 'st. lucia': 'LC',
  'st. vincent and the grenadines': 'VC',
  'trinidad & tobago': 'TT', 'antigua & barbuda': 'AG',
  'congo, democratic republic of the': 'CD',
  'democratic people\'s republic of korea': 'KP',
  'lao people\'s democratic republic': 'LA',
  'viet nam': 'VN', 'syrian arab republic': 'SY',
  'tanzania, united republic of': 'TZ',
  'moldova, republic of': 'MD',
  'korea, dem. people\'s rep.': 'KP',
  'hong kong sar (china)': 'HK', 'macao sar (china)': 'MO',
  'people\'s republic of china': 'CN',
  'sint maarten (dutch part)': 'SX', 'curacao': 'CW', 'curaçao': 'CW',
  'turks and caicos islands': 'TC', 'virgin islands (u.s.)': 'VI',
  'british virgin islands': 'VG', 'american samoa': 'AS',
  'northern mariana islands': 'MP', 'st. martin (french part)': 'MF',
  'sint maarten': 'SX', 'netherlands antilles': 'CW',
};

const FALLBACK_BIRTH = {
  AF: 33.5, AL: 10.8, DZ: 22.0, AD: 6.8, AO: 39.0, AG: 14.5, AR: 16.5,
  AM: 11.8, AU: 12.3, AT: 9.5, AZ: 13.5, BS: 14.0, BH: 12.5, BD: 17.5,
  BB: 11.2, BY: 9.5, BE: 9.8, BZ: 21.0, BJ: 32.0, BM: 10.5, BT: 16.5,
  BO: 21.5, BA: 8.5, BW: 23.0, BR: 14.0, BN: 14.5, BG: 8.5, BF: 34.0,
  BI: 33.0, KH: 20.5, CM: 32.0, CA: 10.0, CV: 20.0, CF: 33.0, TD: 35.0,
  CL: 13.0, CN: 6.8, CO: 14.5, KM: 25.0, CG: 27.0, CD: 37.0, CR: 12.5,
  CI: 27.0, HR: 8.5, CU: 10.0, CW: 12.5, CY: 10.5, CZ: 10.8, DK: 10.5,
  DJ: 25.0, DM: 13.0, DO: 18.5, DZ: 22.0, EC: 17.0, EG: 21.5, SV: 15.5,
  GQ: 28.5, ER: 28.0, EE: 10.0, SZ: 23.0, ET: 28.0, FI: 9.0, FJ: 18.5,
  FR: 10.5, GA: 26.0, GM: 30.0, GE: 12.5, DE: 9.0, GH: 25.0, GR: 7.5,
  GD: 14.0, GT: 20.0, GN: 34.0, GW: 30.0, GY: 16.0, HT: 23.0, HN: 19.5,
  HK: 5.5, HU: 9.5, IS: 11.0, IN: 17.0, ID: 16.5, IR: 14.5, IQ: 25.0,
  IE: 11.5, IL: 19.5, IT: 7.0, JM: 14.0, JP: 6.5, JO: 22.0, KZ: 17.5,
  KE: 27.5, KI: 21.0, KN: 12.0, XK: 11.0, KW: 10.0, KG: 21.0, LA: 22.0,
  LV: 9.5, LB: 13.5, LS: 22.0, LR: 29.0, LY: 18.0, LI: 10.5, LT: 9.5,
  LU: 10.5, MG: 28.0, MW: 30.0, MY: 14.5, MV: 16.0, ML: 34.0, MT: 9.5,
  MR: 28.5, MU: 10.0, MX: 16.5, MD: 10.0, MC: 6.5, MN: 19.5, ME: 11.0,
  MA: 16.5, MZ: 35.0, MM: 16.5, NA: 23.0, NR: 21.5, NP: 17.5, NL: 9.5,
  NZ: 12.5, NI: 18.0, NE: 42.0, NG: 35.0, MK: 8.5, NO: 10.0, OM: 18.0,
  PK: 27.0, PW: 11.0, PS: 23.0, PA: 16.5, PG: 24.0, PY: 17.0, PE: 16.0,
  PH: 21.0, PL: 9.5, PT: 8.0, QA: 9.5, RO: 8.5, RW: 26.0, KN: 12.0,
  LC: 11.5, VC: 12.0, WS: 20.5, SM: 7.0, ST: 28.0, SA: 14.5, SN: 30.0,
  RS: 9.0, SC: 14.5, SL: 32.0, SG: 8.0, SK: 9.5, SI: 9.0, SB: 26.0,
  SO: 38.0, ZA: 20.0, KR: 5.5, SS: 34.0, ES: 7.5, LK: 14.0, SD: 33.0,
  SR: 16.0, SE: 10.5, CH: 10.0, SY: 21.0, TW: 6.5, TJ: 25.0, TZ: 30.0,
  TH: 8.5, TL: 26.0, TG: 30.0, TO: 22.0, TT: 11.0, TN: 14.5, TR: 14.0,
  TM: 22.0, TV: 22.5, UG: 34.0, UA: 8.0, AE: 10.5, GB: 10.5, US: 11.0,
  UY: 13.5, UZ: 24.0, VU: 23.0, VE: 16.5, VN: 15.5, YE: 27.0,
  ZM: 33.0, ZW: 30.0, PR: 7.5, GI: 11.0, GL: 13.5, KY: 11.0,
  MO: 7.5, FO: 13.0, IM: 10.0, GU: 16.5, AS: 20.0, MP: 17.0,
  NC: 13.0, PF: 15.0, CW: 12.5, SX: 13.0, TC: 14.0, VG: 11.0,
  VI: 12.0, JG: 9.5, KP: 14.5, MH: 23.0, NR: 21.5, PW: 11.0,
  FM: 20.5, ER: 28.0, MF: 11.0,
};

const FALLBACK_DEATH = {
  AF: 9.5, AL: 7.5, DZ: 4.5, AD: 4.2, AO: 8.0, AG: 6.5, AR: 7.8,
  AM: 10.0, AU: 7.0, AT: 10.5, AZ: 6.5, BS: 6.5, BH: 2.5, BD: 5.0,
  BB: 9.5, BY: 12.5, BE: 10.5, BZ: 4.0, BJ: 8.0, BM: 7.5, BT: 5.5,
  BO: 7.0, BA: 10.5, BW: 5.5, BR: 7.5, BN: 3.5, BG: 15.5, BF: 9.5,
  BI: 8.0, KH: 5.5, CM: 7.5, CA: 8.0, CV: 5.0, CF: 11.0, TD: 11.5,
  CL: 6.5, CN: 7.5, CO: 5.5, KM: 5.5, CG: 7.5, CD: 8.0, CR: 5.0,
  CI: 7.5, HR: 13.5, CU: 9.5, CW: 7.5, CY: 7.5, CZ: 11.5, DK: 10.0,
  DJ: 7.0, DM: 8.0, DO: 5.5, EC: 5.0, EG: 5.0, SV: 5.5, GQ: 8.0,
  ER: 6.5, EE: 11.5, SZ: 9.0, ET: 6.5, FI: 10.0, FJ: 6.5, FR: 10.5,
  GA: 6.5, GM: 6.5, GE: 11.0, DE: 12.0, GH: 6.0, GR: 12.5, GD: 7.0,
  GT: 4.5, GN: 8.5, GW: 8.0, GY: 6.5, HT: 8.0, HN: 4.5, HK: 7.5,
  HU: 13.0, IS: 7.0, IN: 7.0, ID: 5.5, IR: 5.5, IQ: 4.5, IE: 7.0,
  IL: 5.5, IT: 13.0, JM: 7.0, JP: 11.5, JO: 3.5, KZ: 7.5, KE: 6.0,
  KI: 5.5, KN: 7.5, XK: 10.0, KW: 2.0, KG: 5.5, LA: 6.5, LV: 14.0,
  LB: 6.5, LS: 9.5, LR: 6.5, LY: 3.5, LI: 7.5, LT: 14.5, LU: 8.5,
  MG: 6.0, MW: 6.5, MY: 5.0, MV: 4.5, ML: 9.0, MT: 8.5, MR: 8.0,
  MU: 8.0, MX: 6.0, MD: 12.0, MC: 10.0, MN: 5.0, ME: 12.5, MA: 4.5,
  MZ: 9.0, MM: 7.0, NA: 8.5, NR: 4.5, NP: 5.5, NL: 10.0, NZ: 7.0,
  NI: 4.5, NE: 9.5, NG: 11.5, MK: 12.0, NO: 8.0, OM: 3.5, PK: 6.5,
  PW: 5.0, PS: 3.5, PA: 5.0, PG: 5.5, PY: 4.5, PE: 5.5, PH: 5.5,
  PL: 11.5, PT: 11.0, QA: 1.5, RO: 13.0, RW: 5.0, KN: 7.5, LC: 7.0,
  VC: 7.0, WS: 4.5, SM: 10.0, ST: 5.5, SA: 3.5, SN: 5.0, RS: 13.5,
  SC: 7.0, SL: 9.5, SG: 5.5, SK: 10.0, SI: 11.0, SB: 4.5, SO: 11.0,
  ZA: 10.0, KR: 6.5, SS: 8.0, ES: 9.5, LK: 7.5, SD: 8.5, SR: 7.0,
  SE: 9.5, CH: 8.5, SY: 5.0, TW: 8.0, TJ: 5.0, TZ: 5.5, TH: 7.5,
  TL: 5.5, TG: 6.0, TO: 4.5, TT: 8.0, TN: 6.5, TR: 5.5, TM: 5.5,
  TV: 7.5, UG: 5.0, UA: 13.5, AE: 2.0, GB: 9.5, US: 8.5, UY: 9.5,
  UZ: 5.0, VU: 4.0, VE: 5.5, VN: 6.0, YE: 5.5, ZM: 7.0, ZW: 8.0,
  PR: 8.5, GI: 9.5, GL: 8.5, KY: 5.5, MO: 4.0, FO: 8.0, IM: 10.5,
  GU: 5.5, AS: 4.5, MP: 4.5, NC: 5.0, PF: 5.0, CW: 7.5, SX: 7.0,
  TC: 4.0, VG: 6.0, VI: 7.5, JG: 10.0, KP: 9.5, MH: 4.5, NR: 4.0,
  PW: 4.0, FM: 4.5, ER: 7.0, MF: 7.0,
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

function parseRateTable(html) {
  const results = [];
  const tables = [...html.matchAll(/<table[^>]*class="[^"]*wikitable[^"]*"[^>]*>([\s\S]*?)<\/table>/gi)];
  if (tables.length === 0) return results;

  const table = tables[0][1];
  const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  for (const [, row] of rows) {
    const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)];
    if (cells.length < 2) continue;
    const name = stripTags(cells[0][1]);
    if (!name || name === 'Country' || name === 'Country/Territory' || name === 'Country / territory' ||
        name === 'World' || name.includes('Region') || name.includes('income')) continue;
    // Try second column first (PRB), then third (CIA)
    let val = parseNum(stripTags(cells[1][1]));
    if (isNaN(val) && cells.length >= 3) {
      val = parseNum(stripTags(cells[2][1]));
    }
    if (!isNaN(val) && val >= 0 && val < 100) {
      results.push({ name, val });
    }
  }
  return results;
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║   Demographics Filler (Wikipedia + Fallback)          ║');
  console.log('╚═══════════════════════════════════════════════════════╝');

  console.log('\nLoading ' + OUT_FILE + '...');
  const kdb = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
  const existing = kdb['country-data'];
  const isReal = k => existing[k].name && existing[k].income_level !== 'Aggregates';
  const realKeys = Object.keys(existing).filter(isReal);

  let brBefore = 0, drBefore = 0;
  for (const k of realKeys) {
    if (existing[k].birth_rate) brBefore++;
    if (existing[k].death_rate) drBefore++;
  }
  console.log('Before: birth_rate=' + brBefore + '/' + realKeys.length + '  death_rate=' + drBefore + '/' + realKeys.length);

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

  // Step 1: Wikipedia birth rate
  let wikiBirthAdded = 0, wikiDeathAdded = 0;

  try {
    const html = await fetchWiki('https://en.wikipedia.org/wiki/List_of_sovereign_states_and_dependent_territories_by_birth_rate');
    console.log('  Fetched ' + html.length + ' bytes');
    const rows = parseRateTable(html);
    console.log('  Parsed ' + rows.length + ' birth rate rows');
    for (const { name, val } of rows) {
      const iso = resolveIso(name);
      if (!iso || !existing[iso] || !isReal(iso)) continue;
      if (existing[iso].birth_rate == null) { existing[iso].birth_rate = val; wikiBirthAdded++; }
    }
  } catch (e) {
    console.error('  Failed: ' + e.message);
  }

  // Step 2: Wikipedia death rate
  try {
    const html = await fetchWiki('https://en.wikipedia.org/wiki/List_of_sovereign_states_and_dependent_territories_by_mortality_rate');
    console.log('  Fetched ' + html.length + ' bytes');
    const rows = parseRateTable(html);
    console.log('  Parsed ' + rows.length + ' death rate rows');
    for (const { name, val } of rows) {
      const iso = resolveIso(name);
      if (!iso || !existing[iso] || !isReal(iso)) continue;
      if (existing[iso].death_rate == null) { existing[iso].death_rate = val; wikiDeathAdded++; }
    }
  } catch (e) {
    console.error('  Failed: ' + e.message);
  }

  console.log('\nWikipedia: birth +' + wikiBirthAdded + ', death +' + wikiDeathAdded);

  // Step 3: Apply fallback data
  console.log('\nApplying fallback data...');
  let fbBirth = 0, fbDeath = 0;

  for (const [iso, val] of Object.entries(FALLBACK_BIRTH)) {
    const entry = existing[iso];
    if (!entry || !isReal(iso)) continue;
    if (entry.birth_rate == null) { entry.birth_rate = val; fbBirth++; }
  }

  for (const [iso, val] of Object.entries(FALLBACK_DEATH)) {
    const entry = existing[iso];
    if (!entry || !isReal(iso)) continue;
    if (entry.death_rate == null) { entry.death_rate = val; fbDeath++; }
  }

  console.log('Fallback: birth +' + fbBirth + ', death +' + fbDeath);

  // Summary
  let brAfter = 0, drAfter = 0;
  for (const k of realKeys) {
    if (existing[k].birth_rate) brAfter++;
    if (existing[k].death_rate) drAfter++;
  }

  console.log('');
  console.log('=== Final Coverage (real countries only) ===');
  console.log('birth_rate:  ' + brAfter + '/' + realKeys.length + ' (' + Math.round(brAfter / realKeys.length * 100) + '%)');
  console.log('death_rate:  ' + drAfter + '/' + realKeys.length + ' (' + Math.round(drAfter / realKeys.length * 100) + '%)');

  const missingBirth = realKeys.filter(k => !existing[k].birth_rate);
  const missingDeath = realKeys.filter(k => !existing[k].death_rate);
  if (missingBirth.length > 0 && missingBirth.length <= 30) {
    console.log('\nMissing birth_rate (' + missingBirth.length + '):');
    missingBirth.forEach(k => console.log('  ' + k + ' ' + existing[k].name));
  }
  if (missingDeath.length > 0 && missingDeath.length <= 30) {
    console.log('\nMissing death_rate (' + missingDeath.length + '):');
    missingDeath.forEach(k => console.log('  ' + k + ' ' + existing[k].name));
  }

  atomicWrite(OUT_FILE, JSON.stringify(kdb, null, 2));
  console.log('\nWrote ' + OUT_FILE);
}

main().catch(err => {
  console.error('Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});