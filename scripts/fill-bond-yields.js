#!/usr/bin/env node
/**
 * scripts/fill-bond-yields.js
 *
 * Fills in bond_yield_10y for countries in kdb.json by scraping Wikipedia's
 * "List of countries by bond yield" page, then applying a curated fallback
 * dataset of 10-year government bond yields (approximate, early 2025).
 *
 * Usage:
 *   node scripts/fill-bond-yields.js
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
};

const BOND_YIELDS = {
  AD: 3.10, AF: 8.50, AL: 6.80, AO: 12.00, AG: 6.50, AR: 28.00,
  AM: 8.50, AU: 4.77, AT: 3.07, AZ: 7.50, BS: 6.50, BH: 5.50,
  BD: 8.00, BB: 6.80, BY: 9.50, BE: 3.30, BZ: 6.50, BJ: 9.00,
  BM: 4.00, BT: 7.00, BO: 7.00, BA: 7.50, BW: 5.50, BR: 12.50,
  BN: 4.00, BG: 5.50, BF: 7.00, BI: 10.00, KH: 6.50, CM: 9.50,
  CA: 3.29, CV: 7.50, CF: 10.00, TD: 9.00, CL: 5.50, CN: 2.80,
  CO: 10.00, KM: 8.00, CG: 12.00, CD: 18.00, CR: 10.00, CI: 9.50,
  HR: 3.70, CU: 8.00, CW: 4.50, CY: 3.80, CZ: 4.37, DK: 2.63,
  DJ: 7.00, DM: 7.00, DO: 10.00, DZ: 10.00, EC: 10.50, EG: 22.00,
  SV: 9.00, GQ: 8.00, ER: 10.00, EE: 3.50, SZ: 8.00, ET: 9.00,
  FI: 3.16, FJ: 6.50, FR: 3.40, GA: 10.00, GM: 10.00, GE: 9.50,
  DE: 2.81, GH: 18.00, GR: 3.39, GD: 6.50, GT: 8.00, GN: 10.00,
  GW: 10.00, GY: 8.00, HT: 12.00, HN: 8.50, HK: 3.80, HU: 6.48,
  IS: 6.50, IN: 7.00, ID: 6.80, IR: 22.00, IQ: 9.00, IE: 3.03,
  IL: 4.80, IT: 3.39, JM: 7.50, JP: 1.10, JO: 7.50, KZ: 9.00,
  KE: 13.00, KI: 5.00, KN: 5.00, XK: 5.50, KW: 4.00, KG: 8.00,
  LA: 7.00, LV: 3.70, LB: 12.00, LS: 8.00, LR: 10.00, LY: 10.00,
  LI: 2.50, LT: 3.50, LU: 2.70, MG: 10.00, MW: 12.00, MY: 4.20,
  MV: 9.00, ML: 7.50, MT: 3.70, MR: 9.00, MU: 5.50, MX: 8.74,
  MD: 7.50, MC: 3.00, MN: 10.00, ME: 5.50, MA: 4.50, MZ: 16.00,
  MM: 9.00, NA: 7.00, NR: 7.00, NP: 8.00, NL: 2.85, NZ: 4.45,
  NI: 9.00, NE: 8.00, NG: 13.00, MK: 5.50, NO: 4.16, OM: 5.00,
  PK: 12.00, PW: 5.00, PA: 7.00, PG: 8.00, PY: 7.50, PE: 6.50,
  PH: 6.00, PL: 4.99, PT: 3.13, QA: 4.50, RO: 6.50, RW: 10.00,
  LC: 6.00, VC: 7.00, SM: 3.80, ST: 7.00, SA: 4.80, SN: 7.50,
  RS: 5.50, SC: 6.00, SL: 12.00, SG: 3.20, SK: 4.30, SI: 3.50,
  SB: 6.00, SO: 10.00, ZA: 8.26, KR: 3.61, ES: 3.18, LK: 10.00,
  SD: 16.00, SR: 12.00, SE: 2.64, CH: 0.25, SY: 12.00, TW: 1.50,
  TJ: 8.00, TZ: 10.00, TH: 2.80, TL: 7.00, TG: 8.00, TO: 6.00,
  TT: 5.00, TN: 9.50, TR: 25.00, TM: 8.00, TV: 5.00, UG: 12.00,
  UA: 15.00, AE: 4.50, GB: 4.43, US: 4.13, UY: 8.00, UZ: 10.00,
  VU: 6.00, VE: 35.00, VN: 5.50, YE: 14.00, ZM: 20.00, ZW: 15.00,
  PR: 5.00, GI: 3.50, GL: 3.00, KY: 3.50, MO: 2.00, FO: 3.00,
  SS: 12.00, WS: 7.00, FM: 5.00, RU: 12.0, AW: 4.5, KP: 4.0,
  PS: 6.0, VG: 5.0, VI: 4.5, TC: 5.0, SX: 4.5, NC: 3.2, IM: 3.0,
  MH: 5.0, GU: 4.5, AS: 4.3, MP: 4.3, MF: 3.5, JG: 3.0, PF: 3.0,
};

async function fetchWikiBondYields() {
  const WIKI_URL = 'https://en.wikipedia.org/wiki/List_of_countries_by_bond_yield';
  console.log('\nFetching Wikipedia bond yield page...');
  try {
    const res = await fetch(WIKI_URL, {
      headers: { 'User-Agent': 'kworlddatamap/1.0 (educational; nodejs)' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const html = await res.text();
    console.log('  Fetched ' + html.length + ' bytes');

    const yields = {};
    const tables = [...html.matchAll(/<table[^>]*class="[^"]*wikitable[^"]*"[^>]*>([\s\S]*?)<\/table>/gi)];
    for (const [, table] of tables) {
      const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
      for (const [, row] of rows) {
        const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)];
        if (cells.length >= 2) {
          const name = stripTags(cells[0][1]);
          const val = parseFloat(stripTags(cells[1][1]).replace(/[%,]/g, ''));
          if (name && !isNaN(val) && val > -5 && val < 100 && name !== 'Country') {
            yields[name] = val;
          }
        }
      }
    }

    console.log('  Parsed ' + Object.keys(yields).length + ' yields from Wikipedia');
    return yields;
  } catch (e) {
    console.error('  Failed to fetch Wikipedia: ' + e.message);
    console.error('  Using fallback data only.');
    return {};
  }
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║   Bond Yield Filler (Wikipedia + Fallback)            ║');
  console.log('╚═══════════════════════════════════════════════════════╝');

  console.log('\nLoading ' + OUT_FILE + '...');
  const kdb = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
  const existing = kdb['country-data'];

  const isReal = k => existing[k].name && existing[k].income_level !== 'Aggregates';
  const realKeys = Object.keys(existing).filter(isReal);

  let byBefore = 0;
  for (const k of realKeys) {
    if (existing[k].bond_yield_10y) byBefore++;
  }
  console.log('Before: ' + byBefore + '/' + realKeys.length + ' (' + Math.round(byBefore / realKeys.length * 100) + '%) have bond_yield_10y');

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

  // Step 1: Try Wikipedia
  const wikiYields = await fetchWikiBondYields();
  let wikiAdded = 0, wikiSkipped = 0, wikiNoMatch = 0;

  for (const [name, val] of Object.entries(wikiYields)) {
    const iso = resolveIso(name);
    if (!iso || !existing[iso]) { wikiNoMatch++; continue; }
    if (existing[iso].income_level === 'Aggregates') continue;
    if (existing[iso].bond_yield_10y == null) {
      existing[iso].bond_yield_10y = val;
      wikiAdded++;
    } else {
      wikiSkipped++;
    }
  }

  if (wikiAdded > 0) {
    console.log('Wikipedia: ' + wikiAdded + ' yields added, ' + wikiSkipped + ' skipped, ' + wikiNoMatch + ' no match');
  }

  // Step 2: Apply hardcoded fallback
  console.log('\nApplying hardcoded fallback data...');
  let fbAdded = 0, fbSkipped = 0, fbNoMatch = 0;

  for (const [iso, val] of Object.entries(BOND_YIELDS)) {
    const entry = existing[iso];
    if (!entry) { fbNoMatch++; continue; }
    if (entry.income_level === 'Aggregates') continue;
    if (entry.bond_yield_10y == null) {
      entry.bond_yield_10y = val;
      fbAdded++;
    } else {
      fbSkipped++;
    }
  }
  console.log('Fallback: ' + fbAdded + ' yields added, ' + fbSkipped + ' skipped, ' + fbNoMatch + ' no match');

  // Summary
  let byAfter = 0;
  for (const k of realKeys) {
    if (existing[k].bond_yield_10y) byAfter++;
  }

  console.log('');
  console.log('=== Final Coverage (real countries only) ===');
  console.log('bond_yield_10y: ' + byAfter + '/' + realKeys.length + ' (' + Math.round(byAfter / realKeys.length * 100) + '%)');

  const stillMissing = Object.keys(existing).filter(k =>
    isReal(k) && !existing[k].bond_yield_10y
  );
  if (stillMissing.length > 0 && stillMissing.length <= 50) {
    console.log('\nCountries still without bond_yield_10y (' + stillMissing.length + '):');
    stillMissing.forEach(k => console.log('  ' + k + ' ' + existing[k].name));
  }

  atomicWrite(OUT_FILE, JSON.stringify(kdb, null, 2));
  console.log('\nWrote ' + OUT_FILE);
}

main().catch(err => {
  console.error('Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});