#!/usr/bin/env node
/**
 * scripts/fill-credit-ratings.js
 *
 * Fetches sovereign credit ratings (S&P, Fitch, Moody's) from Wikipedia's
 * "List of countries by credit rating" page and merges them into
 * public/kdb.json country-data section where missing or null.
 *
 * Usage:
 *   node scripts/fill-credit-ratings.js
 *
 * Safe to re-run — only fills null fields, never overwrites existing values.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { atomicWrite } = require('./safe-write');

const OUT_FILE = path.join(__dirname, '..', 'public', 'kdb.json');
const WIKI_URL = 'https://en.wikipedia.org/wiki/List_of_countries_by_credit_rating';
const VALID_RATINGS = new Set([
  'AAA','AA+','AA','AA-','A+','A','A-','BBB+','BBB','BBB-','BB+','BB','BB-',
  'B+','B','B-','CCC+','CCC','CCC-','CC+','CC','CC-','C+','C','C-',
  'SD','D','RD','WD',
  'Aaa','Aa1','Aa2','Aa3','A1','A2','A3','Baa1','Baa2','Baa3',
  'Ba1','Ba2','Ba3','B1','B2','B3','Caa1','Caa2','Caa3','Ca','C',
]);

function isSPorFitch(r) { return /^[A-D][A-Za-z]*[+-]?$/.test(r) && r.length <= 4 && !/[0-9]/.test(r); }
function isMoodys(r) { return /^(Aaa|Aa[123]|A[123]|Baa[123]|Ba[123]|B[123]|Caa[123]|Ca|C)$/.test(r); }

async function fetchWiki() {
  const res = await fetch(WIKI_URL, {
    headers: { 'User-Agent': 'kworlddatamap/1.0 (educational; nodejs)' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();
}

function parseTable(html, sectionId) {
  const ratings = {};
  const sectionRegex = new RegExp(`<h[23][^>]*>.*?id="${sectionId}"[\\s\\S]*?(<table[\\s\\S]*?</table>)`, 'i');
  const sectionMatch = html.match(sectionRegex);
  if (!sectionMatch) {
    const headingRegex = new RegExp(`id="${sectionId}"[\\s\\S]*?(<table[\\s\\S]*?</table>)`, 'i');
    const altMatch = html.match(headingRegex);
    if (!altMatch) return ratings;
    return parseTableRows(altMatch[1], ratings);
  }
  return parseTableRows(sectionMatch[1], ratings);
}

function parseTableRows(tableHtml, ratings) {
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
    const row = rowMatch[1];
    const cells = [];
    const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(row)) !== null) {
      cells.push(cellMatch[1]);
    }
    if (cells.length < 2) continue;

    const name = stripTags(cells[0]).trim();
    const rating = stripTags(cells[1]).trim().replace(/\u00a0/g, ' ').trim();

    if (!name || !rating) continue;
    if (name === 'Country' || name === 'Country/Territory') continue;

    ratings[name] = rating;
  }
  return ratings;
}

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
  'burundi': 'BI', 'cabo verde': 'CV', 'cape verde': 'CV', 'cambodia': 'KH',
  'cameroon': 'CM', 'canada': 'CA', 'cayman islands': 'KY', 'central african republic': 'CF',
  'chad': 'TD', 'chile': 'CL', 'china': 'CN', 'colombia': 'CO',
  'comoros': 'KM', 'congo, republic of the': 'CG', 'congo, rep.': 'CG',
  'congo, democratic republic of the': 'CD', 'democratic republic of the congo': 'CD',
  'cook islands': 'CK', 'costa rica': 'CR', "côte d'ivoire": 'CI', 'ivory coast': 'CI',
  'croatia': 'HR', 'cuba': 'CU', 'curacao': 'CW', 'curaçao': 'CW',
  'cyprus': 'CY', 'czechia': 'CZ', 'czech republic': 'CZ', 'denmark': 'DK',
  'djibouti': 'DJ', 'dominica': 'DM', 'dominican republic': 'DO', 'ecuador': 'EC',
  'egypt': 'EG', 'el salvador': 'SV', 'equatorial guinea': 'GQ', 'eritrea': 'ER',
  'estonia': 'EE', 'eswatini': 'SZ', 'swaziland': 'SZ', 'ethiopia': 'ET',
  'falkland islands': 'FK', 'faroe islands': 'FO', 'fiji': 'FJ', 'finland': 'FI',
  'france': 'FR', 'gabon': 'GA', 'gambia': 'GM', 'gambia, the': 'GM',
  'georgia': 'GE', 'germany': 'DE', 'ghana': 'GH', 'greece': 'GR',
  'grenada': 'GD', 'guatemala': 'GT', 'guernsey': 'GG', 'guinea': 'GN',
  'guinea-bissau': 'GW', 'guyana': 'GY', 'haiti': 'HT', 'honduras': 'HN',
  'hong kong': 'HK', 'hong kong sar': 'HK', 'hungary': 'HU', 'iceland': 'IS',
  'india': 'IN', 'indonesia': 'ID', 'iran': 'IR', 'iran, islamic republic of': 'IR',
  'iraq': 'IQ', 'ireland': 'IE', 'isle of man': 'IM', 'israel': 'IL',
  'italy': 'IT', 'jamaica': 'JM', 'japan': 'JP', 'jersey': 'JE',
  'jordan': 'JO', 'kazakhstan': 'KZ', 'kenya': 'KE', 'kiribati': 'KI',
  'kuwait': 'KW', 'kyrgyzstan': 'KG', 'kyrgyz republic': 'KG', 'laos': 'LA',
  "lao people's democratic republic": 'LA', 'latvia': 'LV', 'lebanon': 'LB',
  'lesotho': 'LS', 'liberia': 'LR', 'libya': 'LY', 'liechtenstein': 'LI',
  'lithuania': 'LT', 'luxembourg': 'LU', 'macao': 'MO', 'macau': 'MO',
  'madagascar': 'MG', 'malawi': 'MW', 'malaysia': 'MY', 'maldives': 'MV',
  'mali': 'ML', 'malta': 'MT', 'marshall islands': 'MH', 'mauritania': 'MR',
  'mauritius': 'MU', 'mexico': 'MX', 'moldova': 'MD', 'republic of moldova': 'MD',
  'monaco': 'MC', 'mongolia': 'MN', 'montenegro': 'ME', 'montserrat': 'MS',
  'morocco': 'MA', 'mozambique': 'MZ', 'myanmar': 'MM', 'namibia': 'NA',
  'nauru': 'NR', 'nepal': 'NP', 'netherlands': 'NL', 'new zealand': 'NZ',
  'nicaragua': 'NI', 'niger': 'NE', 'nigeria': 'NG', 'north korea': 'KP',
  "korea, democratic people's republic of": 'KP', 'north macedonia': 'MK',
  'macedonia, the former yugoslav republic of': 'MK', 'norway': 'NO', 'oman': 'OM',
  'pakistan': 'PK', 'palau': 'PW', 'palestine': 'PS', 'panama': 'PA',
  'papua new guinea': 'PG', 'paraguay': 'PY', 'peru': 'PE', 'philippines': 'PH',
  'poland': 'PL', 'portugal': 'PT', 'qatar': 'QA', 'romania': 'RO',
  'russia': 'RU', 'russian federation': 'RU', 'rwanda': 'RW',
  'saint helena': 'SH', 'saint kitts and nevis': 'KN', 'saint lucia': 'LC',
  'saint vincent and the grenadines': 'VC', 'san marino': 'SM', 'sao tome and principe': 'ST',
  'saudi arabia': 'SA', 'senegal': 'SN', 'serbia': 'RS', 'seychelles': 'SC',
  'sierra leone': 'SL', 'singapore': 'SG', 'slovakia': 'SK', 'slovenia': 'SI',
  'solomon islands': 'SB', 'somalia': 'SO', 'south africa': 'ZA',
  'south korea': 'KR', 'korea, republic of': 'KR', 'south sudan': 'SS', 'spain': 'ES',
  'sri lanka': 'LK', 'sudan': 'SD', 'suriname': 'SR', 'sweden': 'SE',
  'switzerland': 'CH', 'syria': 'SY', 'syrian arab republic': 'SY',
  'taiwan': 'TW', 'tajikistan': 'TJ', 'tanzania': 'TZ',
  'tanzania, united republic of': 'TZ', 'thailand': 'TH', 'timor-leste': 'TL',
  'togo': 'TG', 'trinidad and tobago': 'TT', 'tunisia': 'TN', 'turkey': 'TR',
  'turkiye': 'TR', 'turkmenistan': 'TM', 'turks and caicos islands': 'TC',
  'tuvalu': 'TV', 'uganda': 'UG', 'ukraine': 'UA',
  'united arab emirates': 'AE', 'united kingdom': 'GB',
  'united states': 'US', 'uruguay': 'UY', 'uzbekistan': 'UZ', 'vanuatu': 'VU',
  'venezuela': 'VE', 'venezuela, bolivarian republic of': 'VE',
  'viet nam': 'VN', 'vietnam': 'VN', 'yemen': 'YE', 'zambia': 'ZM', 'zimbabwe': 'ZW',
  'bosnia and herz.': 'BA', 'china, people\'s republic of': 'CN',
  'congo': 'CG', 'dem. rep. congo': 'CD',
  'korea, south': 'KR', 'macedonia (fyrom)': 'MK', 'micronesia': 'FM',
  'republic of congo': 'CG', 'rep. of congo': 'CG', 'drc': 'CD',
  'democratic republic of congo': 'CD', 'dr congo': 'CD',
  'republic of korea': 'KR', 'korea, rep.': 'KR',
  "cote d'ivoire": 'CI', 'ivory coast': 'CI',
  'united states of america': 'US', 'us': 'US',
  'hong kong (china)': 'HK', 'macao (china)': 'MO',
  'republic of moldova': 'MD', 'the bahamas': 'BS', 'the gambia': 'GM',
  'korea, dem. people\'s rep.': 'KP', 'brunei darussalam': 'BN',
  'people\'s republic of china': 'CN', 'prc': 'CN',
  'slovak republic': 'SK', 'czech rep.': 'CZ',
  'russian fed.': 'RU', 'iran (islamic republic of)': 'IR',
  'tanzania (united republic of)': 'TZ',
  'venezuela (bolivarian republic of)': 'VE',
  'bolivia (plurinational state of)': 'BO',
  'saint vincent & the grenadines': 'VC',
  'trinidad & tobago': 'TT',
  'antigua & barbuda': 'AG',
  'são tomé and príncipe': 'ST',
  'sao tome & principe': 'ST',
  'stkitts and nevis': 'KN',
  'st. kitts and nevis': 'KN',
  'st. lucia': 'LC',
  'st. vincent and the grenadines': 'VC',
  'congo, dem. rep.': 'CD',
  'congo, rep.': 'CG',
  'curacao': 'CW', 'curaçao': 'CW',
  'sint maarten (dutch part)': 'SX',
  'guam': 'GU', 'puerto rico': 'PR',
  'new caledonia': 'NC', 'french polynesia': 'PF',
  'kosovo': 'XK',
  'côte d\'ivoire': 'CI',
  'isle of man': 'IM',
  'gibraltar': 'GI',
  'greenland': 'GL',
  'faroe islands': 'FO',
  'republic of the congo': 'CG',
};

async function main() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║   Credit Ratings Fetcher (Wikipedia + Fallback)      ║');
  console.log('╚═══════════════════════════════════════════════════════╝');

  console.log('\nLoading ' + OUT_FILE + '...');
  const kdb = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
  const existing = kdb['country-data'];

  let wikiSP = {}, wikiFitch = {}, wikiMoodys = {};
  let wikiOk = false;

  console.log('\nFetching Wikipedia page...');
  try {
    const html = await fetchWiki();
    console.log('  Fetched ' + html.length + ' bytes');

    wikiSP = parseTable(html, "Standard_\\&amp\\;Poor\\'s");
    if (Object.keys(wikiSP).length === 0) {
      Object.assign(wikiSP, parseTable(html, "Standard_.26_Poor.27s"));
    }

    const fitchSection = html.match(/id="Fitch"[^>]*>[\s\S]*?<table[\s\S]*?<\/table>/i);
    if (fitchSection) {
      wikiFitch = parseTableRows(fitchSection[0], {});
    }

    const moodysSection = html.match(/id="Moody.27s"[^>]*>[\s\S]*?<table[\s\S]*?<\/table>/i);
    if (moodysSection) {
      wikiMoodys = parseTableRows(moodysSection[0], {});
    }

    console.log('  S&P ratings parsed:     ' + Object.keys(wikiSP).length);
    console.log('  Fitch ratings parsed:    ' + Object.keys(wikiFitch).length);
    console.log('  Moody\'s ratings parsed:  ' + Object.keys(wikiMoodys).length);
    wikiOk = true;
  } catch (e) {
    console.error('Failed to fetch Wikipedia: ' + e.message);
    console.error('Skipping Wikipedia step, using fallback data only.');
  }

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

  const FIELD_MAP = { sp: 'credit_sp', fitch: 'credit_fitch', moodys: 'credit_moodys' };

  let spAdded = 0, fitchAdded = 0, moodysAdded = 0;
  let spSkipped = 0, fitchSkipped = 0, moodysSkipped = 0;
  let noMatchSP = 0, noMatchFitch = 0, noMatchMoodys = 0;

  if (wikiOk) {
    for (const [name, rating] of Object.entries(wikiSP)) {
      if (!isSPorFitch(rating) || rating === 'SD' || rating === 'D' || rating === 'RD' || rating === 'WD') continue;
      const iso = resolveIso(name);
      if (!iso || !existing[iso]) { noMatchSP++; continue; }
      if (existing[iso].credit_sp == null) {
        existing[iso].credit_sp = rating;
        spAdded++;
      } else {
        spSkipped++;
      }
    }

    for (const [name, rating] of Object.entries(wikiFitch)) {
      if (!isSPorFitch(rating) || rating === 'SD' || rating === 'D' || rating === 'RD' || rating === 'WD') continue;
      const iso = resolveIso(name);
      if (!iso || !existing[iso]) { noMatchFitch++; continue; }
      if (existing[iso].credit_fitch == null) {
        existing[iso].credit_fitch = rating;
        fitchAdded++;
      } else {
        fitchSkipped++;
      }
    }

    for (const [name, rating] of Object.entries(wikiMoodys)) {
      if (!isMoodys(rating)) continue;
      const iso = resolveIso(name);
      if (!iso || !existing[iso]) { noMatchMoodys++; continue; }
      if (existing[iso].credit_moodys == null) {
        existing[iso].credit_moodys = rating;
        moodysAdded++;
      } else {
        moodysSkipped++;
      }
    }

    console.log('');
    console.log('=== Wikipedia Merge Results ===');
    console.log('S&P added:     ' + spAdded + ' (skipped ' + spSkipped + ', no match ' + noMatchSP + ')');
    console.log('Fitch added:   ' + fitchAdded + ' (skipped ' + fitchSkipped + ', no match ' + noMatchFitch + ')');
    console.log("Moody's added: " + moodysAdded + ' (skipped ' + moodysSkipped + ', no match ' + noMatchMoodys + ')');
  }

  console.log('\nApplying hardcoded fallback data...');
  let fbAdded = 0, fbSkipped = 0, fbNoMatch = 0;
  for (const rating of FALLBACK) {
    const entry = existing[rating.iso2];
    if (!entry) { fbNoMatch++; continue; }
    for (const [srcKey, dstKey] of Object.entries(FIELD_MAP)) {
      if (rating[srcKey] != null && entry[dstKey] == null) {
        entry[dstKey] = rating[srcKey];
        fbAdded++;
      }
    }
  }
  console.log('Fallback: ' + fbAdded + ' fields added, ' + fbSkipped + ' skipped, ' + fbNoMatch + ' no match');

  let spCount = 0, fitchCount = 0, moodysCount = 0;
  const realCount = Object.keys(existing).filter(k => existing[k].name && existing[k].income_level !== 'Aggregates').length;
  for (const entry of Object.values(existing)) {
    if (entry.credit_sp) spCount++;
    if (entry.credit_fitch) fitchCount++;
    if (entry.credit_moodys) moodysCount++;
  }

  console.log('');
  console.log('=== Final Coverage (real countries only) ===');
  console.log('credit_sp:     ' + spCount + '/' + realCount + ' (' + Math.round(spCount / realCount * 100) + '%)');
  console.log('credit_fitch:  ' + fitchCount + '/' + realCount + ' (' + Math.round(fitchCount / realCount * 100) + '%)');
  console.log('credit_moodys: ' + moodysCount + '/' + realCount + ' (' + Math.round(moodysCount / realCount * 100) + '%)');

  const stillMissing = Object.keys(existing).filter(k =>
    existing[k].name && existing[k].income_level !== 'Aggregates' &&
    !existing[k].credit_sp && !existing[k].credit_fitch && !existing[k].credit_moodys
  );
  if (stillMissing.length > 0) {
    console.log('\nCountries still without any rating (' + stillMissing.length + '):');
    stillMissing.forEach(k => console.log('  ' + k + ' ' + existing[k].name));
  }

  atomicWrite(OUT_FILE, JSON.stringify(kdb, null, 2));
  console.log('\nWrote ' + OUT_FILE);
}

const FALLBACK = [
    { iso2: 'AW', sp: 'BBB+', fitch: 'BBB' },
    { iso2: 'AL', sp: 'BB', moodys: 'Ba3' },
    { iso2: 'AD', sp: 'A-', fitch: 'A-' },
    { iso2: 'AO', sp: 'B-', fitch: 'B-', moodys: 'B3' },
    { iso2: 'AG', fitch: 'BB-', moodys: 'B1' },
    { iso2: 'AR', sp: 'CCC+', fitch: 'CCC+', moodys: 'Caa1' },
    { iso2: 'AM', sp: 'BB-', fitch: 'BB-', moodys: 'Ba3' },
    { iso2: 'AU', sp: 'AAA', fitch: 'AAA', moodys: 'Aaa' },
    { iso2: 'AT', sp: 'AA+', fitch: 'AA', moodys: 'Aa1' },
    { iso2: 'AZ', sp: 'BB+', fitch: 'BBB-', moodys: 'Ba1' },
    { iso2: 'BS', sp: 'BB-', fitch: 'BB-', moodys: 'B1' },
    { iso2: 'BH', sp: 'B', fitch: 'B', moodys: 'B2' },
    { iso2: 'BD', sp: 'B+', fitch: 'B+', moodys: 'B1' },
    { iso2: 'BB', sp: 'B+', fitch: 'B+', moodys: 'B3' },
    { iso2: 'BY', moodys: 'C' },
    { iso2: 'BE', sp: 'AA', fitch: 'A+', moodys: 'Aa3' },
    { iso2: 'BZ', sp: 'B-', moodys: 'Caa2' },
    { iso2: 'BJ', sp: 'BB-', fitch: 'B+', moodys: 'B1' },
    { iso2: 'BM', sp: 'A+', moodys: 'A2' },
    { iso2: 'BO', sp: 'CCC-', fitch: 'CCC', moodys: 'Caa1' },
    { iso2: 'BA', sp: 'B+', moodys: 'B3' },
    { iso2: 'BW', sp: 'BBB', moodys: 'A3' },
    { iso2: 'BR', sp: 'BB', fitch: 'BB', moodys: 'Ba1' },
    { iso2: 'BN', fitch: 'A-', moodys: 'Aa3' },
    { iso2: 'BG', sp: 'BBB+', fitch: 'BBB+', moodys: 'Baa1' },
    { iso2: 'BF', sp: 'CCC+' },
    { iso2: 'BI', moodys: 'Caa2' },
    { iso2: 'KH', moodys: 'B2' },
    { iso2: 'CM', sp: 'B-', fitch: 'B', moodys: 'Caa1' },
    { iso2: 'CA', sp: 'AAA', fitch: 'AA+', moodys: 'Aaa' },
    { iso2: 'CV', sp: 'B', fitch: 'B' },
    { iso2: 'CF', fitch: 'CCC-' },
    { iso2: 'TD', sp: 'B-', fitch: 'CCC', moodys: 'Caa2' },
    { iso2: 'CL', sp: 'A', fitch: 'A-', moodys: 'A2' },
    { iso2: 'CN', sp: 'A+', fitch: 'A', moodys: 'A1' },
    { iso2: 'CO', sp: 'BB', fitch: 'BB', moodys: 'Baa2' },
    { iso2: 'KM', moodys: 'Caa2' },
    { iso2: 'CG', sp: 'CCC+', fitch: 'CCC+', moodys: 'Caa2' },
    { iso2: 'CR', sp: 'BB', fitch: 'BB', moodys: 'Ba3' },
    { iso2: 'CI', sp: 'BB', fitch: 'BB', moodys: 'Ba3' },
    { iso2: 'CU', moodys: 'Ca' },
    { iso2: 'CW', fitch: 'BBB+' },
    { iso2: 'HR', sp: 'A', fitch: 'A-', moodys: 'A3' },
    { iso2: 'CY', sp: 'A-', fitch: 'A-', moodys: 'A3' },
    { iso2: 'CZ', sp: 'AA-', fitch: 'AA-', moodys: 'Aa3' },
    { iso2: 'CD', sp: 'B-', moodys: 'B3' },
    { iso2: 'DK', sp: 'AAA', fitch: 'AAA', moodys: 'Aaa' },
    { iso2: 'DJ', moodys: 'Caa1' },
    { iso2: 'DM', fitch: 'BB-', moodys: 'B3' },
    { iso2: 'DO', sp: 'BB', fitch: 'BB-', moodys: 'Ba3' },
    { iso2: 'DZ', sp: 'CCC+', fitch: 'CCC+', moodys: 'Caa2' },
    { iso2: 'EC', sp: 'B-', fitch: 'B-', moodys: 'Caa3' },
    { iso2: 'EG', sp: 'B', fitch: 'B', moodys: 'Caa1' },
    { iso2: 'SV', sp: 'B-', fitch: 'B-', moodys: 'B3' },
    { iso2: 'GQ', sp: 'CCC-', moodys: 'Caa3' },
    { iso2: 'ER' },
    { iso2: 'EE', sp: 'A+', fitch: 'A+', moodys: 'A1' },
    { iso2: 'SZ', moodys: 'B3' },
    { iso2: 'ET', moodys: 'Caa3' },
    { iso2: 'FJ', sp: 'B+', moodys: 'B1' },
    { iso2: 'FI', sp: 'AA+', fitch: 'AA', moodys: 'Aa1' },
    { iso2: 'FR', sp: 'A+', fitch: 'A+', moodys: 'Aa3' },
    { iso2: 'GA', fitch: 'CCC-', moodys: 'Caa1' },
    { iso2: 'GM', sp: 'CCC-', moodys: 'Caa2' },
    { iso2: 'GE', sp: 'BB', fitch: 'BB', moodys: 'Ba2' },
    { iso2: 'DE', sp: 'AAA', fitch: 'AAA', moodys: 'Aaa' },
    { iso2: 'GH', sp: 'B-', fitch: 'B-', moodys: 'Caa3' },
    { iso2: 'GD', fitch: 'BB+', moodys: 'B1' },
    { iso2: 'GR', sp: 'BBB', fitch: 'BBB', moodys: 'Baa3' },
    { iso2: 'GT', sp: 'BB+', fitch: 'BB+', moodys: 'Ba1' },
    { iso2: 'GN', sp: 'B+', moodys: 'Caa3' },
    { iso2: 'GW', moodys: 'Caa3' },
    { iso2: 'GY', moodys: 'Caa1' },
    { iso2: 'HT', sp: 'CCC', fitch: 'CCC-', moodys: 'Caa3' },
    { iso2: 'HN', sp: 'BB-', moodys: 'B1' },
    { iso2: 'HK', sp: 'AA+', moodys: 'Aa3' },
    { iso2: 'HU', sp: 'BBB-', fitch: 'BBB', moodys: 'Ba1' },
    { iso2: 'IS', sp: 'A+', moodys: 'A1' },
    { iso2: 'IN', sp: 'BBB', fitch: 'BBB-', moodys: 'Baa3' },
    { iso2: 'ID', sp: 'BBB', fitch: 'BBB', moodys: 'Baa2' },
    { iso2: 'IR', sp: 'B-', fitch: 'B-', moodys: 'Caa1' },
    { iso2: 'IQ', sp: 'B-', fitch: 'B-', moodys: 'Caa1' },
    { iso2: 'IE', sp: 'AA+', fitch: 'AA', moodys: 'Aa3' },
    { iso2: 'IL', sp: 'A', fitch: 'A', moodys: 'Baa1' },
    { iso2: 'IT', sp: 'BBB+', fitch: 'BBB+', moodys: 'Baa2' },
    { iso2: 'JM', sp: 'BB', fitch: 'BB-', moodys: 'B1' },
    { iso2: 'JP', sp: 'A+', fitch: 'A', moodys: 'A1' },
    { iso2: 'JO', sp: 'BB-', fitch: 'BB-', moodys: 'B1' },
    { iso2: 'KZ', sp: 'BBB-', fitch: 'BBB', moodys: 'Baa1' },
    { iso2: 'KE', sp: 'B', fitch: 'B-', moodys: 'B3' },
    { iso2: 'KI', moodys: 'Caa1' },
    { iso2: 'KN', sp: 'BBB-', fitch: 'BB+' },
    { iso2: 'XK', fitch: 'BB-' },
    { iso2: 'KW', sp: 'AA-', fitch: 'AA-', moodys: 'A1' },
    { iso2: 'KG', sp: 'B+', fitch: 'B', moodys: 'B3' },
    { iso2: 'LA', sp: 'CCC+', fitch: 'CCC+' },
    { iso2: 'LV', sp: 'A', fitch: 'A-', moodys: 'A3' },
    { iso2: 'LB', moodys: 'C' },
    { iso2: 'LS', fitch: 'B' },
    { iso2: 'LI', sp: 'AAA', fitch: 'AAA' },
    { iso2: 'LR', sp: 'CCC', moodys: 'Caa2' },
    { iso2: 'LY', sp: 'CCC-', fitch: 'CCC-', moodys: 'Caa2' },
    { iso2: 'LT', sp: 'A', fitch: 'A', moodys: 'A2' },
    { iso2: 'LU', sp: 'AAA', fitch: 'AAA', moodys: 'Aaa' },
    { iso2: 'MG', sp: 'B-', fitch: 'CCC', moodys: 'Caa3' },
    { iso2: 'MW', sp: 'CCC+', moodys: 'Caa1' },
    { iso2: 'MY', sp: 'A-', fitch: 'BBB+', moodys: 'A3' },
    { iso2: 'MV', fitch: 'CC', moodys: 'Caa2' },
    { iso2: 'ML', moodys: 'Caa2' },
    { iso2: 'MT', sp: 'A-', fitch: 'A+', moodys: 'A2' },
    { iso2: 'MU', sp: 'BBB-', moodys: 'Baa3' },
    { iso2: 'MX', sp: 'BBB', fitch: 'BBB-', moodys: 'Baa2' },
    { iso2: 'MD', sp: 'BB-', fitch: 'B+', moodys: 'B2' },
    { iso2: 'MN', sp: 'BB-', fitch: 'B+', moodys: 'B3' },
    { iso2: 'ME', sp: 'B+', moodys: 'Ba3' },
    { iso2: 'MA', sp: 'BBB-', fitch: 'BB+', moodys: 'Ba1' },
    { iso2: 'MZ', sp: 'CCC+', fitch: 'CCC', moodys: 'Caa2' },
    { iso2: 'MR', sp: 'CCC-', moodys: 'Caa2' },
    { iso2: 'NA', fitch: 'BB-', moodys: 'B1' },
    { iso2: 'NP', fitch: 'BB-' },
    { iso2: 'NL', sp: 'AAA', fitch: 'AAA', moodys: 'Aaa' },
    { iso2: 'NZ', sp: 'AA+', fitch: 'AA+', moodys: 'Aaa' },
    { iso2: 'NI', sp: 'B+', fitch: 'B', moodys: 'B3' },
    { iso2: 'NE', sp: 'CCC', fitch: 'CCC-' },
    { iso2: 'NG', sp: 'B-', fitch: 'B', moodys: 'Caa1' },
    { iso2: 'MK', sp: 'BB-', fitch: 'BB+', moodys: 'Ba3' },
    { iso2: 'NO', sp: 'AAA', fitch: 'AAA', moodys: 'Aaa' },
    { iso2: 'OM', sp: 'BBB-', fitch: 'BBB-', moodys: 'Baa3' },
    { iso2: 'PK', sp: 'B-', fitch: 'B-', moodys: 'Caa1' },
    { iso2: 'PA', sp: 'BBB-', fitch: 'BB+', moodys: 'Baa3' },
    { iso2: 'PG', sp: 'B-', moodys: 'B2' },
    { iso2: 'PY', sp: 'BBB-', fitch: 'BB+', moodys: 'Baa3' },
    { iso2: 'PE', sp: 'BBB-', fitch: 'BBB', moodys: 'Baa1' },
    { iso2: 'PH', sp: 'BBB+', fitch: 'BBB', moodys: 'Baa2' },
    { iso2: 'PL', sp: 'A-', fitch: 'A-', moodys: 'A2' },
    { iso2: 'PT', sp: 'A+', fitch: 'A', moodys: 'A3' },
    { iso2: 'QA', sp: 'AA', fitch: 'AA', moodys: 'Aa3' },
    { iso2: 'RO', sp: 'BBB-', fitch: 'BBB-', moodys: 'Baa3' },
    { iso2: 'RW', sp: 'B+', fitch: 'B+', moodys: 'B2' },
    { iso2: 'VC', moodys: 'B3' },
    { iso2: 'SM', sp: 'BBB+', fitch: 'BBB-' },
    { iso2: 'SA', sp: 'A+', fitch: 'A+', moodys: 'Aa3' },
    { iso2: 'SN', sp: 'CCC+', fitch: 'B-', moodys: 'Ba3' },
    { iso2: 'RS', sp: 'BBB-', fitch: 'BB+', moodys: 'Ba2' },
    { iso2: 'SC', fitch: 'BB' },
    { iso2: 'SG', sp: 'AAA', fitch: 'AAA', moodys: 'Aaa' },
    { iso2: 'SK', sp: 'A+', fitch: 'A-', moodys: 'A3' },
    { iso2: 'SI', sp: 'AA', fitch: 'A+', moodys: 'A3' },
    { iso2: 'SB', moodys: 'Caa1' },
    { iso2: 'SO', sp: 'CCC', fitch: 'CCC' },
    { iso2: 'ZA', sp: 'BB', fitch: 'BB-', moodys: 'Ba2' },
    { iso2: 'KR', sp: 'AA', fitch: 'AA-', moodys: 'Aa2' },
    { iso2: 'SS', moodys: 'Caa2' },
    { iso2: 'ES', sp: 'A+', fitch: 'A', moodys: 'A3' },
    { iso2: 'LK', sp: 'CCC+', fitch: 'CCC+', moodys: 'Caa1' },
    { iso2: 'SD', sp: 'CCC-', fitch: 'CCC-', moodys: 'Caa2' },
    { iso2: 'SR', sp: 'CCC+', moodys: 'Caa3' },
    { iso2: 'SE', sp: 'AAA', fitch: 'AAA', moodys: 'Aaa' },
    { iso2: 'CH', sp: 'AAA', fitch: 'AAA', moodys: 'Aaa' },
    { iso2: 'SY', sp: 'CCC-', fitch: 'CCC-', moodys: 'Caa3' },
    { iso2: 'TW', sp: 'AA+', fitch: 'AA', moodys: 'Aa3' },
    { iso2: 'TJ', sp: 'B', moodys: 'B3' },
    { iso2: 'TZ', fitch: 'B+', moodys: 'B1' },
    { iso2: 'TH', sp: 'BBB+', fitch: 'BBB+', moodys: 'Baa1' },
    { iso2: 'TL', sp: 'CCC+', fitch: 'CCC' },
    { iso2: 'TG', sp: 'B+', moodys: 'B3' },
    { iso2: 'TO', moodys: 'B1' },
    { iso2: 'TT', sp: 'BBB-', moodys: 'Ba2' },
    { iso2: 'TN', fitch: 'B-', moodys: 'Caa1' },
    { iso2: 'TR', sp: 'BB-', fitch: 'BB-', moodys: 'B1' },
    { iso2: 'TM', fitch: 'BB-' },
    { iso2: 'TV', moodys: 'Aa3' },
    { iso2: 'UG', sp: 'B-', fitch: 'B', moodys: 'B2' },
    { iso2: 'UA', sp: 'CCC+', fitch: 'CCC', moodys: 'Ca' },
    { iso2: 'AE', sp: 'AA', fitch: 'AA-', moodys: 'Aa2' },
    { iso2: 'GB', sp: 'AA', fitch: 'AA-', moodys: 'Aa3' },
    { iso2: 'US', sp: 'AA+', fitch: 'AA+', moodys: 'Aa1' },
    { iso2: 'UY', sp: 'BBB+', fitch: 'BBB', moodys: 'Baa1' },
    { iso2: 'UZ', sp: 'BB', fitch: 'BB', moodys: 'Ba3' },
    { iso2: 'VU', moodys: 'B2' },
    { iso2: 'VN', sp: 'BB+', fitch: 'BB+', moodys: 'Ba2' },
    { iso2: 'YE', sp: 'CCC-', fitch: 'CCC', moodys: 'Caa3' },
    { iso2: 'ZM', sp: 'CCC+', fitch: 'B-', moodys: 'Caa3' },
    { iso2: 'ZW', sp: 'CCC-', fitch: 'CCC-', moodys: 'Caa3' },
    { iso2: 'AF', moodys: 'Caa3' },
    { iso2: 'BT', sp: 'BB-', fitch: 'BB-', moodys: 'B2' },
    { iso2: 'GI', moodys: 'Aa3' },
    { iso2: 'GL', sp: 'AAA', fitch: 'AAA' },
    { iso2: 'MC', sp: 'AAA', fitch: 'AAA', moodys: 'Aaa' },
    { iso2: 'MM', sp: 'CCC-', fitch: 'CCC-', moodys: 'Caa1' },
    { iso2: 'SL', sp: 'CCC+', fitch: 'CCC-' },
    { iso2: 'LC', sp: 'BBB-', fitch: 'BBB-', moodys: 'B1' },
    { iso2: 'WS', moodys: 'B1' },
    { iso2: 'PR', sp: 'BBB+', fitch: 'BBB-' },
    { iso2: 'KY', fitch: 'AA', moodys: 'Aa3' },
];

main().catch(err => {
  console.error('Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});