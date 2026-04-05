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
 *   urb_cenv    – Environment (PM10 EN1003V, NO2 EN1004V, road noise NO1025V)
 *   urb_cgreen  – Green space (m²/inhabitant GR1010V)
 *   urb_ctrans  – Transport (public transport TN1015V, cars/100 TN1020V)
 *   urb_chealth – Health (hospital beds/100k HE1015V)
 *   urb_cpopstr – Population structure (pop change PS3010I, median age PS1020V,
 *                 foreign-born % FO1010V)
 *   urb_ctour   – Tourism (overnight stays TO1010V)
 *   urb_ccult   – Culture (museum visitors MU1010V, libraries LI1010V)
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

// Extract all values (full time series) for each city for a given indicator.
// Returns Map<eurostatCityCode, { latest: {val, year}, history: [[year, val], ...] }>
function extractAll(json, indicatorCode) {
  const dims   = json.id;
  const sizes  = json.size;
  const values = json.value;

  const indicIdx = dims.indexOf('indic_ur');
  const cityIdx  = dims.indexOf('cities');
  const timeIdx  = dims.indexOf('time');

  const indicCats = Object.keys(json.dimension.indic_ur.category.index);
  const cityCats  = Object.keys(json.dimension.cities.category.index);
  const timeCats  = Object.keys(json.dimension.time.category.index);

  const nCity  = sizes[cityIdx];
  const nTime  = sizes[timeIdx];

  const iI = indicCats.indexOf(indicatorCode);
  if (iI === -1) {
    console.warn(`    Indicator ${indicatorCode} not found`);
    return new Map();
  }

  const result = new Map();
  for (let iC = 0; iC < nCity; iC++) {
    const cityCode = cityCats[iC];
    if (!cityCode.endsWith('C')) continue;
    const history = [];
    let latest = null;
    for (let iT = 0; iT < nTime; iT++) {
      const flatIdx = iI * nCity * nTime + iC * nTime + iT;
      const raw = values[flatIdx];
      if (raw == null) continue;
      const year = parseInt(timeCats[iT], 10);
      if (isNaN(year)) continue;
      const val = parseFloat(raw);
      history.push([year, val]);
      if (!latest || year > latest.year) latest = { val, year };
    }
    if (latest) {
      history.sort((a, b) => a[0] - b[0]);
      result.set(cityCode, { latest, history });
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

  // Fetch all datasets (new ones with .catch so a missing dataset doesn't abort)
  const safe = ds => fetchDataset(ds).catch(e => { console.warn(`  WARN: ${ds} failed — ${e.message}`); return null; });
  const [clmaJson, clivconJson, cecfiJson, cenvJson, cgreenJson, ctransJson, chealthJson, cpopstrJson, ctourJson, ccultJson] = await Promise.all([
    fetchDataset('urb_clma'),
    fetchDataset('urb_clivcon'),
    fetchDataset('urb_cecfi'),
    safe('urb_cenv'),
    safe('urb_cgreen'),
    safe('urb_ctrans'),
    safe('urb_chealth'),
    safe('urb_cpopstr'),
    safe('urb_ctour'),
    safe('urb_ccult'),
  ]);

  // Get city code → Eurostat name mapping (from clma which has broad coverage)
  const eurostatNames = getCityNames(clmaJson);
  const eurostatCodes = Object.keys(eurostatNames).filter(c => c.endsWith('C'));
  console.log(`Eurostat city codes (core cities): ${eurostatCodes.length}`);

  // Helper: extract from optional dataset (returns empty Map if dataset is null)
  const tryExtract = (ds, code) => ds ? extractAll(ds, code) : new Map();

  // Extract indicators (full time series)
  console.log('  Extracting indicators…');
  const unemploymentMap    = extractAll(clmaJson,    'EC1020I');
  const activityMap        = extractAll(clmaJson,    'EC1001I');
  const medianIncomeMap    = extractAll(clivconJson, 'EC3039V');
  const povertyMap         = extractAll(clivconJson, 'EC3065V');
  const homeownershipMap   = extractAll(clivconJson, 'SA1011I');
  const rentMap            = extractAll(clivconJson, 'SA1049V');
  const companiesMap       = extractAll(cecfiJson,   'EC2021V');
  // urb_cenv: correct indicator codes from Eurostat labels API
  const sunshineMap        = tryExtract(cenvJson,    'EN1002V'); // sunshine hours/day
  const tempWarmestMap     = tryExtract(cenvJson,    'EN1003V'); // avg temp warmest month °C
  const tempColdestMap     = tryExtract(cenvJson,    'EN1004V'); // avg temp coldest month °C
  const rainfallMap        = tryExtract(cenvJson,    'EN1005V'); // rainfall litre/m²
  const pm10Map            = tryExtract(cenvJson,    'EN2027V'); // annual avg PM10 µg/m³
  const no2Map             = tryExtract(cenvJson,    'EN2026V'); // annual avg NO2 µg/m³
  const greenSpaceMap      = tryExtract(cenvJson,    'EN5205V'); // % green urban areas
  const roadNoise65Map     = tryExtract(cenvJson,    'EN2033I'); // % exposed road noise >65dB day
  const roadNoise55Map     = tryExtract(cenvJson,    'EN2035I'); // % exposed road noise >55dB night
  // urb_cpopstr: correct codes
  const medianAgeMap       = tryExtract(cpopstrJson, 'DE1073V'); // median population age
  const popChangeMap       = tryExtract(cpopstrJson, 'DE1061I'); // population change over 1 year
  const ageDependencyMap   = tryExtract(cpopstrJson, 'DE1058I'); // age dependency ratio
  // urb_ctour: correct codes (culture + recreation + tourism)
  const touristNightsMap   = tryExtract(ctourJson,   'CR2001V'); // total tourist nights
  const museumVisitorsMap  = tryExtract(ctourJson,   'CR1007V'); // museum visitors/year
  const librariesMap       = tryExtract(ctourJson,   'CR1010V'); // public libraries
  const cinemaSeatsPer1kMap= tryExtract(ctourJson,   'CR1003I'); // cinema seats per 1000 residents
  console.log(`    pm10:${pm10Map.size} no2:${no2Map.size} tempW:${tempWarmestMap.size} green:${greenSpaceMap.size} noise65:${roadNoise65Map.size} medAge:${medianAgeMap.size} tourist:${touristNightsMap.size} museum:${museumVisitorsMap.size}`);

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
    const unemp   = unemploymentMap.get(code);
    const act     = activityMap.get(code);
    const inc     = medianIncomeMap.get(code);
    const pov     = povertyMap.get(code);
    const home    = homeownershipMap.get(code);
    const rent    = rentMap.get(code);
    const comp    = companiesMap.get(code);
    const sunsh   = sunshineMap.get(code);
    const tempW   = tempWarmestMap.get(code);
    const tempC   = tempColdestMap.get(code);
    const rain    = rainfallMap.get(code);
    const pm10    = pm10Map.get(code);
    const no2     = no2Map.get(code);
    const green   = greenSpaceMap.get(code);
    const noise65 = roadNoise65Map.get(code);
    const noise55 = roadNoise55Map.get(code);
    const medAge  = medianAgeMap.get(code);
    const popChg  = popChangeMap.get(code);
    const ageDep  = ageDependencyMap.get(code);
    const tourist = touristNightsMap.get(code);
    const museum  = museumVisitorsMap.get(code);
    const lib     = librariesMap.get(code);
    const cinema  = cinemaSeatsPer1kMap.get(code);

    // Determine best year (prefer labour market year)
    const year = unemp?.latest?.year || act?.latest?.year || inc?.latest?.year || pov?.latest?.year || null;

    // Helper: round history pairs
    const hist = (m, dp) => m?.history?.length > 1
      ? m.history.map(([y, v]) => [y, dp === 0 ? Math.round(v) : +v.toFixed(dp)])
      : null;

    const record = {
      eurostatCode: code,
      country: iso2,
      year,
      // Labour market
      unemploymentPct:         unemp?.latest ? +unemp.latest.val.toFixed(2)  : null,
      unemploymentHistory:     hist(unemp, 2),
      activityRate:            act?.latest   ? +act.latest.val.toFixed(2)    : null,
      activityHistory:         hist(act, 2),
      // Living conditions
      medianIncome:            inc?.latest   ? +inc.latest.val.toFixed(0)    : null,
      medianIncomeHistory:     hist(inc, 0),
      povertyPct:              pov?.latest   ? +pov.latest.val.toFixed(2)    : null,
      povertyHistory:          hist(pov, 2),
      homeownershipPct:        home?.latest  ? +home.latest.val.toFixed(2)   : null,
      homeownershipHistory:    hist(home, 2),
      rentPerSqm:              rent?.latest  ? +rent.latest.val.toFixed(2)   : null,
      rentHistory:             hist(rent, 2),
      // Economy
      totalCompanies:          comp?.latest  ? Math.round(comp.latest.val)   : null,
      companiesHistory:        hist(comp, 0),
      // Climate (from urb_cenv)
      sunshineHours:           sunsh?.latest  ? +sunsh.latest.val.toFixed(1)  : null,
      tempWarmest:             tempW?.latest  ? +tempW.latest.val.toFixed(1)  : null,
      tempColdest:             tempC?.latest  ? +tempC.latest.val.toFixed(1)  : null,
      rainfallMm:              rain?.latest   ? +rain.latest.val.toFixed(0)   : null,
      // Environment & air quality
      pm10:                    pm10?.latest   ? +pm10.latest.val.toFixed(1)   : null,
      pm10History:             hist(pm10, 1),
      no2:                     no2?.latest    ? +no2.latest.val.toFixed(1)    : null,
      no2History:              hist(no2, 1),
      greenSpacePct:           green?.latest  ? +green.latest.val.toFixed(1)  : null,
      greenSpacePctHistory:    hist(green, 1),
      roadNoisePct:            noise65?.latest? +noise65.latest.val.toFixed(1): null,
      roadNoisePct55:          noise55?.latest? +noise55.latest.val.toFixed(1): null,
      // Demographics (from urb_cpopstr)
      medianAge:               medAge?.latest ? +medAge.latest.val.toFixed(1) : null,
      medianAgeHistory:        hist(medAge, 1),
      popChangePct:            popChg?.latest ? +popChg.latest.val.toFixed(2) : null,
      popChangePctHistory:     hist(popChg, 2),
      ageDependency:           ageDep?.latest ? +ageDep.latest.val.toFixed(1) : null,
      // Tourism & culture (from urb_ctour)
      touristNights:           tourist?.latest ? Math.round(tourist.latest.val): null,
      touristNightsHistory:    hist(tourist, 0),
      museumVisitors:          museum?.latest  ? Math.round(museum.latest.val) : null,
      museumVisitorsHistory:   hist(museum, 0),
      libraries:               lib?.latest     ? Math.round(lib.latest.val)    : null,
      cinemaSeatsPer1k:        cinema?.latest  ? +cinema.latest.val.toFixed(1) : null,
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
