#!/usr/bin/env node
/**
 * fetch-openflights.js
 * Downloads OpenFlights airport + route data, matches airports to city QIDs
 * in cities-full.json, and outputs public/airport-connectivity.json.
 *
 * Output per QID:
 *   iata               – primary airport IATA code (most routes)
 *   airportName        – name of primary airport
 *   directDestinations – unique destination airports (union across all city airports)
 *   airportCount       – number of airports serving this city
 *   airports           – top 3 airports by route count [{iata, name, dests}]
 *
 * Source: OpenFlights.org (CC BY 3.0)
 * Usage:  node scripts/fetch-openflights.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const CITIES_PATH  = path.join(__dirname, '../public/cities-full.json');
const OUTPUT_PATH  = path.join(__dirname, '../public/airport-connectivity.json');

const AIRPORTS_URL = 'https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat';
const ROUTES_URL   = 'https://raw.githubusercontent.com/jpatokal/openflights/master/data/routes.dat';

// ── helpers ──────────────────────────────────────────────────────────────────
function norm(s) {
  if (!s) return '';
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[''`]/g, '').replace(/\s+/g, ' ').trim();
}

async function fetchText(url) {
  console.log(`  GET ${url}`);
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

/** Naive CSV parser that handles double-quoted fields. */
function parseCsvLine(line) {
  const fields = [];
  let inQ = false, f = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { fields.push(f); f = ''; }
    else { f += c; }
  }
  fields.push(f);
  return fields;
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  // ── Step 1: build country-name → ISO2 map from cities-full.json ──────────
  const citiesArr = JSON.parse(fs.readFileSync(CITIES_PATH, 'utf8'));
  const countryToIso2 = {};
  for (const city of citiesArr) {
    if (city.country && city.iso) {
      countryToIso2[norm(city.country)] = city.iso.toUpperCase();
    }
  }
  // A handful of OpenFlights-specific name variants not in our data
  const EXTRA = {
    'united states':           'US',
    'russia':                  'RU',
    'south korea':             'KR',
    'north korea':             'KP',
    'taiwan':                  'TW',
    'iran':                    'IR',
    'moldova':                 'MD',
    'vietnam':                 'VN',
    'bolivia':                 'BO',
    'tanzania':                'TZ',
    'laos':                    'LA',
    'venezuela':               'VE',
    'cape verde':              'CV',
    'ivory coast':             'CI',
    "cote d'ivoire":           'CI',
    'republic of the congo':   'CG',
    'democratic republic of the congo': 'CD',
    'trinidad and tobago':     'TT',
    'czechia':                 'CZ',
    'czech republic':          'CZ',
    'slovak republic':         'SK',
    'north macedonia':         'MK',
    'burma':                   'MM',
    'myanmar':                 'MM',
    'timor-leste':             'TL',
    'east timor':              'TL',
    'svalbard and jan mayen':  'NO',
    'reunion':                 'FR',
    'french guiana':           'GF',
    'martinique':              'MQ',
    'guadeloupe':              'GP',
    'mayotte':                 'YT',
    'new caledonia':           'NC',
    'french polynesia':        'PF',
    'wallis and futuna':       'WF',
    'saint martin':            'MF',
    'sint maarten':            'SX',
    'curacao':                 'CW',
    'aruba':                   'AW',
    'british virgin islands':  'VG',
    'us virgin islands':       'VI',
    'cayman islands':          'KY',
    'turks and caicos islands':'TC',
    'bermuda':                 'BM',
    'guam':                    'GU',
    'puerto rico':             'PR',
    'american samoa':          'AS',
    'northern mariana islands':'MP',
    'hong kong':               'HK',
    'macau':                   'MO',
    'macao':                   'MO',
    'faroe islands':           'FO',
    'greenland':               'GL',
    'isle of man':             'IM',
    'jersey':                  'JE',
    'guernsey':                'GG',
    'gibraltar':               'GI',
    'andorra':                 'AD',
    'monaco':                  'MC',
    'san marino':              'SM',
    'liechtenstein':           'LI',
    'malta':                   'MT',
    'cyprus':                  'CY',
    'montenegro':              'ME',
    'kosovo':                  'XK',
    'western sahara':          'EH',
    'saint helena':            'SH',
    'sao tome and principe':   'ST',
    'equatorial guinea':       'GQ',
    'guinea-bissau':           'GW',
    'eritrea':                 'ER',
    'djibouti':                'DJ',
    'comoros':                 'KM',
    'seychelles':              'SC',
    'maldives':                'MV',
    'bhutan':                  'BT',
    'brunei':                  'BN',
    'cambodia':                'KH',
    'mongolia':                'MN',
    'kyrgyzstan':              'KG',
    'tajikistan':              'TJ',
    'turkmenistan':            'TM',
    'uzbekistan':              'UZ',
    'azerbaijan':              'AZ',
    'georgia':                 'GE',
    'armenia':                 'AM',
    'palestine':               'PS',
    'western sahara':          'EH',
    'antigua and barbuda':     'AG',
    'saint kitts and nevis':   'KN',
    'saint lucia':             'LC',
    'saint vincent and the grenadines': 'VC',
    'grenada':                 'GD',
    'barbados':                'BB',
    'dominica':                'DM',
    'bahamas':                 'BS',
    'belize':                  'BZ',
    'suriname':                'SR',
    'guyana':                  'GY',
    'haiti':                   'HT',
    'cook islands':            'CK',
    'tonga':                   'TO',
    'samoa':                   'WS',
    'solomon islands':         'SB',
    'vanuatu':                 'VU',
    'kiribati':                'KI',
    'nauru':                   'NR',
    'marshall islands':        'MH',
    'micronesia':              'FM',
    'palau':                   'PW',
    'tuvalu':                  'TV',
    'fiji':                    'FJ',
    'papua new guinea':        'PG',
  };
  for (const [k, v] of Object.entries(EXTRA)) countryToIso2[k] = v;
  console.log(`Country→ISO2 map: ${Object.keys(countryToIso2).length} entries`);

  // ── Step 2: build city lookup: norm(cityName)|ISO2 → best QID ────────────
  // For cities with duplicate names, prefer highest population
  const cityLookup = new Map(); // "normName|ISO2" → city
  for (const city of citiesArr) {
    if (!city.iso || !city.qid) continue;
    const key = norm(city.name) + '|' + city.iso.toUpperCase();
    const existing = cityLookup.get(key);
    if (!existing || (city.pop || 0) > (existing.pop || 0)) {
      cityLookup.set(key, city);
    }
  }
  console.log(`City lookup: ${cityLookup.size} entries`);

  // ── Step 3: fetch and parse airports.dat ─────────────────────────────────
  // Columns: id, name, city, country, IATA, ICAO, lat, lng, alt, tz, dst, tz_db, type, source
  const airportText = await fetchText(AIRPORTS_URL);
  const airports    = {}; // IATA → { name, cityNorm, iso2, lat, lng }
  let skippedCountry = 0;

  for (const line of airportText.split('\n')) {
    if (!line.trim()) continue;
    const f = parseCsvLine(line);
    const iata = f[4]?.trim();
    if (!iata || iata === '\\N' || iata.length !== 3) continue;

    const countryRaw = f[3]?.trim();
    const iso2 = countryToIso2[norm(countryRaw)];
    if (!iso2) { skippedCountry++; continue; }

    airports[iata] = {
      name:     f[1]?.trim(),
      cityNorm: norm(f[2]?.trim()),
      iso2,
      lat:      parseFloat(f[6]),
      lng:      parseFloat(f[7]),
    };
  }
  console.log(`Airports parsed: ${Object.keys(airports).length} with IATA (${skippedCountry} skipped – unknown country)`);

  // ── Step 4: parse routes.dat → srcIATA → Set<dstIATA> ───────────────────
  // Columns: airline, airlineId, src, srcId, dst, dstId, codeshare, stops, equip
  const routeText = await fetchText(ROUTES_URL);
  const routes    = {}; // srcIATA → Set<dstIATA>

  for (const line of routeText.split('\n')) {
    if (!line.trim()) continue;
    const f = line.split(',');
    const src = f[2]?.trim();
    const dst = f[4]?.trim();
    if (!src || !dst || src === '\\N' || dst === '\\N') continue;
    if (src.length !== 3 || dst.length !== 3) continue;
    if (!airports[src] || !airports[dst]) continue; // both must be in our airport list
    if (!routes[src]) routes[src] = new Set();
    routes[src].add(dst);
  }
  console.log(`Route map: ${Object.keys(routes).length} airports have outbound routes`);

  // ── Step 5: match airports → QIDs, aggregate per city ───────────────────
  // qid → { airports: [{iata, name, lat, lng, dests, destSet}] }
  const qidMap = {};

  for (const [iata, ap] of Object.entries(airports)) {
    const destSet = routes[iata];
    if (!destSet || destSet.size === 0) continue;

    const key  = ap.cityNorm + '|' + ap.iso2;
    const city = cityLookup.get(key);
    if (!city) continue;

    const qid = city.qid;
    if (!qidMap[qid]) qidMap[qid] = { airports: [] };
    qidMap[qid].airports.push({ iata, name: ap.name, lat: ap.lat, lng: ap.lng, destSet });
  }

  // ── Step 6: build final output ───────────────────────────────────────────
  const output = {};

  for (const [qid, rec] of Object.entries(qidMap)) {
    // Union of all destination IATAs across all airports serving this city
    const allDests = new Set();
    for (const ap of rec.airports) for (const d of ap.destSet) allDests.add(d);

    // Sort airports by individual route count
    rec.airports.sort((a, b) => b.destSet.size - a.destSet.size);
    const primary = rec.airports[0];

    output[qid] = {
      iata:               primary.iata,
      airportName:        primary.name,
      directDestinations: allDests.size,
      airportCount:       rec.airports.length,
      airports: rec.airports.slice(0, 3).map(ap => ({
        iata: ap.iata,
        name: ap.name,
        dests: ap.destSet.size,
      })),
    };
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output));
  console.log(`\nWrote ${Object.keys(output).length} cities to ${OUTPUT_PATH}`);

  // Top 15 most connected cities
  const top15 = Object.entries(output)
    .sort((a, b) => b[1].directDestinations - a[1].directDestinations)
    .slice(0, 15);
  console.log('\nTop 15 most connected cities:');
  for (const [qid, rec] of top15) {
    const city = citiesArr.find(c => c.qid === qid);
    console.log(`  ${(city?.name || qid).padEnd(20)} [${rec.iata}]  ${rec.directDestinations} unique destinations  (${rec.airportCount} airports)`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
