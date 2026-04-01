#!/usr/bin/env node
/**
 * fetch-eurostat.js
 * Downloads Eurostat Urban Audit data for European cities and writes
 * public/eurostat-cities.json keyed by city QID.
 *
 * Datasets:
 *   urb_clma    – Labour market (unemployment EC1020I, activity rate EC1001I)
 *   urb_clivcon – Living conditions (median income EC3039V, poverty EC3065V,
 *                 homeownership SA1011I, rent/m² SA1049V)
 *   urb_cecfi   – Economy (total companies EC2021V)
 *
 * Usage:
 *   node scripts/fetch-eurostat.js
 *   node scripts/fetch-eurostat.js --fresh
 */

const fs   = require('fs');
const path = require('path');

const CITIES_PATH = path.join(__dirname, '../public/cities-full.json');
const OUTPUT_PATH = path.join(__dirname, '../public/eurostat-cities.json');
const FRESH       = process.argv.includes('--fresh');

const BASE = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data';

// ── City name override table ─────────────────────────────────────────────────
// Maps Eurostat local-language city name → English name used in our dataset.
// Keys are the NORMALISED form (lowercase, no diacritics).
const NAME_OVERRIDES = {
  // Germany
  'munchen':        'Munich',
  'koln':           'Cologne',
  'nurnberg':       'Nuremberg',
  'dusseldorf':     'Düsseldorf',
  'frankfurt am main': 'Frankfurt',
  'hannover':       'Hanover',
  'bremen':         'Bremen',
  'dresden':        'Dresden',
  'leipzig':        'Leipzig',
  // France
  'marseille':      'Marseille',
  'lyon':           'Lyon',
  'toulouse':       'Toulouse',
  'nice':           'Nice',
  'nantes':         'Nantes',
  'strasbourg':     'Strasbourg',
  'montpellier':    'Montpellier',
  'bordeaux':       'Bordeaux',
  'lille':          'Lille',
  'rennes':         'Rennes',
  // Italy
  'roma':           'Rome',
  'milano':         'Milan',
  'napoli':         'Naples',
  'torino':         'Turin',
  'palermo':        'Palermo',
  'genova':         'Genoa',
  'bologna':        'Bologna',
  'firenze':        'Florence',
  'bari':           'Bari',
  'catania':        'Catania',
  'venezia':        'Venice',
  'verona':         'Verona',
  // Spain
  'madrid':         'Madrid',
  'barcelona':      'Barcelona',
  'valencia':       'Valencia',
  'sevilla':        'Seville',
  'zaragoza':       'Zaragoza',
  'malaga':         'Málaga',
  'murcia':         'Murcia',
  'palma':          'Palma',
  'las palmas de gran canaria': 'Las Palmas',
  'bilbao':         'Bilbao',
  'alicante/alacant': 'Alicante',
  'cordoba':        'Córdoba',
  'valladolid':     'Valladolid',
  'vigo':           'Vigo',
  'gijon':          'Gijón',
  // Poland
  'warszawa':       'Warsaw',
  'krakow':         'Kraków',
  'lodz':           'Łódź',
  'wroclaw':        'Wrocław',
  'poznan':         'Poznań',
  'gdansk':         'Gdańsk',
  'szczecin':       'Szczecin',
  'bydgoszcz':      'Bydgoszcz',
  'lublin':         'Lublin',
  'katowice':       'Katowice',
  // Czech Republic
  'praha':          'Prague',
  'brno':           'Brno',
  'ostrava':        'Ostrava',
  'plzen':          'Pilsen',
  // Netherlands
  "'s-gravenhage":  'The Hague',
  's-gravenhage':   'The Hague',
  'den haag':       'The Hague',
  // Belgium
  'bruxelles/brussel': 'Brussels',
  'liege':          'Liège',
  'gent':           'Ghent',
  'antwerpen':      'Antwerp',
  // Greece
  'athina':         'Athens',
  'thessaloniki':   'Thessaloniki',
  'piraias':        'Piraeus',
  'patras':         'Patras',
  // Hungary
  'budapest':       'Budapest',
  'debrecen':       'Debrecen',
  'pecs':           'Pécs',
  // Romania
  'bucuresti':      'Bucharest',
  'cluj-napoca':    'Cluj-Napoca',
  'timisoara':      'Timișoara',
  'iasi':           'Iași',
  // Bulgaria
  'sofiya':         'Sofia',
  'plovdiv':        'Plovdiv',
  'varna':          'Varna',
  // Croatia
  'zagreb':         'Zagreb',
  // Slovakia
  'bratislava':     'Bratislava',
  // Austria
  'wien':           'Vienna',
  'graz':           'Graz',
  'linz':           'Linz',
  'salzburg':       'Salzburg',
  // Portugal
  'lisboa':         'Lisbon',
  'porto':          'Porto',
  // Finland
  'helsinki':       'Helsinki',
  // Denmark
  'kobenhavn':      'Copenhagen',
  // Sweden
  'goteborg':       'Gothenburg',
  'malmo':          'Malmö',
  // Norway (non-EU but sometimes in Urban Audit)
  'oslo':           'Oslo',
  // Estonia
  'tallinn':        'Tallinn',
  // Latvia
  'riga':           'Riga',
  // Lithuania
  'vilnius':        'Vilnius',
  'kaunas':         'Kaunas',
  // Slovenia
  'ljubljana':      'Ljubljana',
  // Cyprus
  'lefkosia':       'Nicosia',
  // Luxembourg
  'luxembourg':     'Luxembourg City',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalize(s) {
  if (!s) return '';
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function stripSuffixes(s) {
  // Remove Eurostat annotation suffixes before normalizing
  return s
    .replace(/\s*\(greater city\)/gi, '')
    .replace(/\s*\(city\)/gi, '')
    .replace(/\s*\(urban core\)/gi, '')
    .trim();
}

function mapName(raw) {
  const stripped = stripSuffixes(raw);
  const n = normalize(stripped);
  if (NAME_OVERRIDES[n]) return NAME_OVERRIDES[n];
  // For bilingual names "A/B", try each part
  if (stripped.includes('/')) {
    for (const part of stripped.split('/').map(p => p.trim())) {
      const pn = normalize(part);
      if (NAME_OVERRIDES[pn]) return NAME_OVERRIDES[pn];
    }
    // Return first part as candidate
    return stripped.split('/')[0].trim();
  }
  return stripped;
}

async function fetchDataset(dataset) {
  const url = `${BASE}/${dataset}?format=JSON&lang=EN`;
  console.log(`  Fetching ${dataset}…`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${dataset}`);
  return res.json();
}

// Extract the latest available value for each city for a given indicator.
// Returns Map<eurostatCityCode, { val, year }>
function extractLatest(json, indicatorCode) {
  const dims    = json.id;         // e.g. ['freq','indic_ur','cities','time']
  const sizes   = json.size;
  const values  = json.value;

  const freqIdx  = dims.indexOf('freq');
  const indicIdx = dims.indexOf('indic_ur');
  const cityIdx  = dims.indexOf('cities');
  const timeIdx  = dims.indexOf('time');

  const freqCats  = Object.keys(json.dimension.freq.category.index);
  const indicCats = Object.keys(json.dimension.indic_ur.category.index);
  const cityCats  = Object.keys(json.dimension.cities.category.index);
  const timeCats  = Object.keys(json.dimension.time.category.index);

  const nFreq  = sizes[freqIdx];
  const nIndic = sizes[indicIdx];
  const nCity  = sizes[cityIdx];
  const nTime  = sizes[timeIdx];

  // Find index of this indicator
  const iI = indicCats.indexOf(indicatorCode);
  if (iI === -1) {
    console.warn(`    Indicator ${indicatorCode} not found in ${Object.keys(json.dimension.indic_ur.category.index).slice(0,5).join(',')}`);
    return new Map();
  }

  // Time categories are typically sorted desc (newest first) — find newest first
  // Build result map
  const result = new Map();
  for (let iC = 0; iC < nCity; iC++) {
    const cityCode = cityCats[iC];
    // Only keep "C" cities (core city), skip "K" (greater city) and "F" (functional urban area)
    if (!cityCode.endsWith('C')) continue;
    for (let iT = 0; iT < nTime; iT++) {
      const flatIdx = iI * nCity * nTime + iC * nTime + iT;
      const raw = values[flatIdx];
      if (raw == null) continue;
      const year = parseInt(timeCats[iT], 10);
      if (!result.has(cityCode) || year > result.get(cityCode).year) {
        result.set(cityCode, { val: parseFloat(raw), year });
      }
    }
  }
  return result;
}

function getCityNames(json) {
  const cats   = json.dimension.cities.category;
  const labels = cats.label || {};
  // Map code → label
  const result = {};
  for (const code of Object.keys(cats.index)) {
    result[code] = labels[code] || code;
  }
  return result;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  // Load our city list
  const cities = JSON.parse(fs.readFileSync(CITIES_PATH, 'utf8'));
  // Filter to European cities (by continent or country ISO belonging to Europe)
  const EUROPEAN_ISOS = new Set([
    'AL','AD','AT','BY','BE','BA','BG','HR','CY','CZ','DK','EE','FI','FR',
    'DE','GR','HU','IS','IE','IT','XK','LV','LI','LT','LU','MT','MD','MC',
    'ME','NL','MK','NO','PL','PT','RO','SM','RS','SK','SI','ES','SE','CH',
    'UA','GB','VA',
  ]);
  const europeanCities = cities.filter(c => EUROPEAN_ISOS.has(c.iso));
  console.log(`European cities in our dataset: ${europeanCities.length}`);

  // Build lookup: normalised name → city object(s)
  const nameIndex = {};
  for (const c of europeanCities) {
    const n = normalize(c.name);
    if (!nameIndex[n]) nameIndex[n] = [];
    nameIndex[n].push(c);
    // Also index by alt_names if any
    if (c.alt_names) {
      for (const alt of c.alt_names) {
        const an = normalize(alt);
        if (!nameIndex[an]) nameIndex[an] = [];
        nameIndex[an].push(c);
      }
    }
  }

  // Also build index by (normalised name, iso) for disambiguation
  const nameIsoIndex = {};
  for (const c of europeanCities) {
    const key = normalize(c.name) + '|' + c.iso;
    nameIsoIndex[key] = c;
  }

  // Load existing output if not --fresh
  let existing = {};
  if (!FRESH && fs.existsSync(OUTPUT_PATH)) {
    try { existing = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8')); } catch (_) {}
  }

  // Fetch all three datasets
  const [clmaJson, clivconJson, cecfiJson] = await Promise.all([
    fetchDataset('urb_clma'),
    fetchDataset('urb_clivcon'),
    fetchDataset('urb_cecfi'),
  ]);

  // Get city code → Eurostat name mapping (from clma which has broad coverage)
  const eurostatNames = getCityNames(clmaJson);
  const eurostatCodes = Object.keys(eurostatNames).filter(c => c.endsWith('C'));
  console.log(`Eurostat city codes (core cities): ${eurostatCodes.length}`);

  // Extract indicators
  console.log('  Extracting indicators…');
  const unemploymentMap   = extractLatest(clmaJson, 'EC1020I');
  const activityMap       = extractLatest(clmaJson, 'EC1001I');
  const medianIncomeMap   = extractLatest(clivconJson, 'EC3039V');
  const povertyMap        = extractLatest(clivconJson, 'EC3065V');
  const homeownershipMap  = extractLatest(clivconJson, 'SA1011I');
  const rentMap           = extractLatest(clivconJson, 'SA1049V');
  const companiesMap      = extractLatest(cecfiJson, 'EC2021V');

  // ── Match Eurostat codes → our city QIDs ────────────────────────────────
  let matched = 0, unmatched = [];
  const result = { ...existing };

  for (const code of eurostatCodes) {
    const euroName = eurostatNames[code] || code;
    // Derive ISO2 from code prefix (first 2 chars, upper-cased)
    const iso2 = code.slice(0, 2).toUpperCase();

    // Try mapped name first, then raw name
    const mappedName = mapName(euroName);
    const normMapped = normalize(mappedName);
    const normRaw    = normalize(stripSuffixes(euroName));

    // Lookup: try (name+iso) then (name only, prefer same-iso)
    let city = nameIsoIndex[normMapped + '|' + iso2]
            || nameIsoIndex[normRaw + '|' + iso2];

    if (!city) {
      const byMapped = nameIndex[normMapped] || [];
      const byRaw    = nameIndex[normRaw]    || [];
      const candidates = [...byMapped, ...byRaw];
      const sameIso = candidates.filter(c => c.iso === iso2);
      city = sameIso[0] || candidates[0] || null;
    }

    if (!city) {
      unmatched.push(`${code} (${euroName})`);
      continue;
    }

    // Build record
    const unemp = unemploymentMap.get(code);
    const act   = activityMap.get(code);
    const inc   = medianIncomeMap.get(code);
    const pov   = povertyMap.get(code);
    const home  = homeownershipMap.get(code);
    const rent  = rentMap.get(code);
    const comp  = companiesMap.get(code);

    // Determine best year (prefer labour market year)
    const year = unemp?.year || act?.year || inc?.year || pov?.year || null;

    const record = {
      eurostatCode: code,
      country: iso2,
      year,
      unemploymentPct:  unemp ? +unemp.val.toFixed(2) : null,
      activityRate:     act   ? +act.val.toFixed(2)   : null,
      medianIncome:     inc   ? +inc.val.toFixed(0)   : null,
      povertyPct:       pov   ? +pov.val.toFixed(2)   : null,
      homeownershipPct: home  ? +home.val.toFixed(2)  : null,
      rentPerSqm:       rent  ? +rent.val.toFixed(2)  : null,
      totalCompanies:   comp  ? Math.round(comp.val)  : null,
    };

    // Only keep if at least one real value
    const hasData = Object.values(record).some((v, i) => i >= 4 && v != null);
    if (hasData) {
      result[city.qid] = record;
      matched++;
    }
  }

  console.log(`\nMatched: ${matched} | Unmatched: ${unmatched.length}`);
  if (unmatched.length <= 30) {
    console.log('Unmatched:', unmatched.join(', '));
  } else {
    console.log('Unmatched (first 30):', unmatched.slice(0, 30).join(', '));
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result));
  console.log(`\nWrote ${Object.keys(result).length} cities to ${OUTPUT_PATH}`);
}

main().catch(e => { console.error(e); process.exit(1); });
