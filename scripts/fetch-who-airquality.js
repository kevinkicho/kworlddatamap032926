#!/usr/bin/env node
/**
 * fetch-who-airquality.js
 * Downloads the WHO Ambient Air Quality Database (V6.1, 2024) Excel file,
 * extracts city-level PM2.5 measurements, matches them to city QIDs in
 * cities-full.json, and writes public/who-airquality.json.
 *
 * Output per QID:
 *   pm25     – annual mean PM2.5 concentration (µg/m³)
 *   year     – measurement year
 *   category – WHO classification (Good / Acceptable / Moderate / Poor / Very Poor / Severe)
 *
 * Matching strategy:
 *   1. Exact normalized name + ISO2 key match
 *   2. First-word match (handles "New York Newark Jersey City" → "New York")
 *   3. Coordinate proximity (≤50 km) for remaining unmatched WHO cities with lat/lon
 *
 * Source: WHO Ambient Air Quality Database V6.1 (Update Jan 2024)
 * Usage:  node scripts/fetch-who-airquality.js
 */
'use strict';

const fs   = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');
const xlsx = require('xlsx');

const CITIES_PATH = path.join(__dirname, '../public/cities-full.json');
const OUTPUT_PATH = path.join(__dirname, '../public/who-airquality.json');

// Primary URL: WHO CDN Excel file
const WHO_XLSX_URL = 'https://cdn.who.int/media/docs/default-source/air-pollution-documents/air-quality-and-health/who_ambient_air_quality_database_version_2024_(v6.1).xlsx?sfvrsn=c504c0cd_3&download=true';

// Fallback: GHO OData API (country-level urban PM2.5 if xlsx fails)
const GHO_API_URL = "https://ghoapi.azureedge.net/api/SDGPM25?$filter=Dim1 eq 'RESIDENCEAREATYPE_URB'&$orderby=TimeDim desc";

// ── PM2.5 category thresholds ─────────────────────────────────────────────────
function categorize(pm25) {
  if (pm25 < 5)  return 'Good';
  if (pm25 < 10) return 'Acceptable';
  if (pm25 < 15) return 'Moderate';
  if (pm25 < 25) return 'Poor';
  if (pm25 < 35) return 'Very Poor';
  return 'Severe';
}

// ── ISO3 → ISO2 lookup table ──────────────────────────────────────────────────
const ISO3_TO_ISO2 = {
  AFG:'AF',ALB:'AL',DZA:'DZ',AND:'AD',AGO:'AO',ATG:'AG',ARG:'AR',ARM:'AM',
  AUS:'AU',AUT:'AT',AZE:'AZ',BHS:'BS',BHR:'BH',BGD:'BD',BRB:'BB',BLR:'BY',
  BEL:'BE',BLZ:'BZ',BEN:'BJ',BTN:'BT',BOL:'BO',BIH:'BA',BWA:'BW',BRA:'BR',
  BRN:'BN',BGR:'BG',BFA:'BF',BDI:'BI',CPV:'CV',KHM:'KH',CMR:'CM',CAN:'CA',
  CAF:'CF',TCD:'TD',CHL:'CL',CHN:'CN',COL:'CO',COM:'KM',COD:'CD',COG:'CG',
  CRI:'CR',HRV:'HR',CUB:'CU',CYP:'CY',CZE:'CZ',DNK:'DK',DJI:'DJ',DOM:'DO',
  ECU:'EC',EGY:'EG',SLV:'SV',GNQ:'GQ',ERI:'ER',EST:'EE',ETH:'ET',FJI:'FJ',
  FIN:'FI',FRA:'FR',GAB:'GA',GMB:'GM',GEO:'GE',DEU:'DE',GHA:'GH',GRC:'GR',
  GTM:'GT',GIN:'GN',GNB:'GW',GUY:'GY',HTI:'HT',HND:'HN',HUN:'HU',ISL:'IS',
  IND:'IN',IDN:'ID',IRN:'IR',IRQ:'IQ',IRL:'IE',ISR:'IL',ITA:'IT',JAM:'JM',
  JPN:'JP',JOR:'JO',KAZ:'KZ',KEN:'KE',PRK:'KP',KOR:'KR',KWT:'KW',KGZ:'KG',
  LAO:'LA',LVA:'LV',LBN:'LB',LSO:'LS',LBR:'LR',LBY:'LY',LIE:'LI',LTU:'LT',
  LUX:'LU',MDG:'MG',MWI:'MW',MYS:'MY',MDV:'MV',MLI:'ML',MLT:'MT',MRT:'MR',
  MUS:'MU',MEX:'MX',MDA:'MD',MCO:'MC',MNG:'MN',MNE:'ME',MAR:'MA',MOZ:'MZ',
  MMR:'MM',NAM:'NA',NPL:'NP',NLD:'NL',NZL:'NZ',NIC:'NI',NER:'NE',NGA:'NG',
  MKD:'MK',NOR:'NO',OMN:'OM',PAK:'PK',PAN:'PA',PNG:'PG',PRY:'PY',PER:'PE',
  PHL:'PH',POL:'PL',PRT:'PT',QAT:'QA',ROU:'RO',RUS:'RU',RWA:'RW',KNA:'KN',
  LCA:'LC',VCT:'VC',WSM:'WS',SMR:'SM',STP:'ST',SAU:'SA',SEN:'SN',SRB:'RS',
  SLE:'SL',SGP:'SG',SVK:'SK',SVN:'SI',SLB:'SB',SOM:'SO',ZAF:'ZA',SSD:'SS',
  ESP:'ES',LKA:'LK',SDN:'SD',SUR:'SR',SWZ:'SZ',SWE:'SE',CHE:'CH',SYR:'SY',
  TWN:'TW',TJK:'TJ',TZA:'TZ',THA:'TH',TLS:'TL',TGO:'TG',TON:'TO',TTO:'TT',
  TUN:'TN',TUR:'TR',TKM:'TM',UGA:'UG',UKR:'UA',ARE:'AE',GBR:'GB',USA:'US',
  URY:'UY',UZB:'UZ',VUT:'VU',VEN:'VE',VNM:'VN',YEM:'YE',ZMB:'ZM',ZWE:'ZW',
  PSE:'PS',XKX:'XK',KOS:'XK',MAC:'MO',HKG:'HK',MNP:'MP',PRI:'PR',VIR:'VI',
  GUM:'GU',ASM:'AS',ABW:'AW',CUW:'CW',SXM:'SX',BES:'BQ',MAF:'MF',SPM:'PM',
  WLF:'WF',PYF:'PF',NCL:'NC',MTQ:'MQ',GLP:'GP',GUF:'GF',REU:'RE',MYT:'YT',
  SHN:'SH',TCA:'TC',BMU:'BM',CYM:'KY',VGB:'VG',AIA:'AI',MSR:'MS',FLK:'FK',
  GIB:'GI',JEY:'JE',GGY:'GG',IMN:'IM',FRO:'FO',GRL:'GL',SJM:'SJ',ALA:'AX',
  ATF:'TF',IOT:'IO',CCK:'CC',CXR:'CX',NFK:'NF',PCN:'PN',HMD:'HM',UMI:'UM',
  COK:'CK',NIU:'NU',TKL:'TK',PLW:'PW',FSM:'FM',MHL:'MH',NRU:'NR',KIR:'KI',
  TUV:'TV'
};

// ── string normalization ──────────────────────────────────────────────────────
function norm(s) {
  if (!s) return '';
  return String(s)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // strip diacritics
    .toLowerCase()
    .replace(/\(.*?\)/g, '')                             // remove parentheticals
    .replace(/\b(city|municipality|metropolitan area|metro|district|province|prefecture|urban agglomeration|agglomeration|urban)\b/g, '')
    .replace(/[''`\-]/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract the first "word chunk" from WHO city name for fuzzy match
// e.g. "New York Newark Jersey City NY NJ PA" → "new york"
// e.g. "Boston Cambridge Newton MA NH" → "boston"
function normFirstChunk(whoCity) {
  // Strip "/ISO3" suffix
  const clean = whoCity.replace(/\/[A-Z]{3}$/, '').trim();
  // Split on comma (if present), take first part
  const commaPart = clean.split(/,/)[0].trim();
  // Normalize first; then take first 1 or 2 words
  const normalized = norm(commaPart);
  // Split into words and return first word OR first two words
  // Return up to 3 words to handle multi-word city names like "New York", "San Francisco"
  const words = normalized.split(' ').filter(Boolean);
  return words.slice(0, 3).join(' ');
}

// ── Haversine distance (km) ───────────────────────────────────────────────────
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── fetch with retries ────────────────────────────────────────────────────────
async function fetchWithRetry(url, opts = {}, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return res;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      console.warn(`  Retry ${attempt + 1}/${maxRetries} for ${url}: ${err.message}`);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

// ── fetch xlsx as buffer ──────────────────────────────────────────────────────
async function fetchBuffer(url) {
  const res = await fetchWithRetry(url);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

// ── parse WHO xlsx ────────────────────────────────────────────────────────────
function parseWhoXlsx(buf) {
  const wb = xlsx.read(buf, { type: 'buffer' });
  console.log('  Sheets:', wb.SheetNames);

  // Find the city-level data sheet — look for one with City column
  let sheetName = null;
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const range = xlsx.utils.decode_range(ws['!ref'] || 'A1:A1');
    const headers = [];
    for (let c = range.s.c; c <= Math.min(range.e.c, 30); c++) {
      const cell = ws[xlsx.utils.encode_cell({ r: range.s.r, c })];
      if (cell) headers.push(String(cell.v).toLowerCase());
    }
    if (headers.some(h => h.includes('city') || h.includes('pm2'))) {
      sheetName = name;
      console.log(`  Using sheet: "${name}"`);
      break;
    }
  }
  if (!sheetName) {
    sheetName = wb.SheetNames[0];
    console.log(`  Falling back to first sheet: "${sheetName}"`);
  }

  const rows = xlsx.utils.sheet_to_json(wb.Sheets[sheetName], { defval: null });
  console.log(`  Rows in sheet: ${rows.length}`);
  if (rows.length > 0) {
    console.log('  Columns:', Object.keys(rows[0]).join(', '));
  }
  return rows;
}

// ── column detection ──────────────────────────────────────────────────────────
function findCol(row, candidates) {
  const keys = Object.keys(row);
  for (const cand of candidates) {
    const hit = keys.find(k => k.toLowerCase() === cand.toLowerCase());
    if (hit) return hit;
  }
  // substring fallback
  for (const cand of candidates) {
    const hit = keys.find(k => k.toLowerCase().includes(cand.toLowerCase()));
    if (hit) return hit;
  }
  return null;
}

// ── GHO API fallback ──────────────────────────────────────────────────────────
async function ghoFallback(cities) {
  console.log('\nUsing WHO GHO API fallback (country-level urban PM2.5)...');
  const res = await fetchWithRetry(GHO_API_URL + '&$top=500');
  const data = await res.json();
  const countryPm25 = {};

  for (const row of (data.value || [])) {
    const iso3 = row.SpatialDim;
    const iso2 = ISO3_TO_ISO2[iso3];
    const year = row.TimeDim;
    const pm25 = row.NumericValue;
    if (!iso2 || pm25 == null || pm25 <= 0) continue;
    if (!countryPm25[iso2] || year > countryPm25[iso2].year) {
      countryPm25[iso2] = { pm25, year };
    }
  }

  console.log(`  Got PM2.5 data for ${Object.keys(countryPm25).length} countries`);
  const output = {};
  const usedIso = new Set();
  for (const city of cities) {
    if (!city.iso || !city.qid) continue;
    const iso2 = city.iso.toUpperCase();
    const entry = countryPm25[iso2];
    if (!entry) continue;
    // Assign to ONE city per country (the first/largest in the array)
    if (!usedIso.has(iso2)) {
      output[city.qid] = {
        pm25: Math.round(entry.pm25 * 10) / 10,
        year: entry.year,
        category: categorize(entry.pm25)
      };
      usedIso.add(iso2);
    }
  }
  return output;
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  const cities = JSON.parse(fs.readFileSync(CITIES_PATH, 'utf8'));
  console.log(`Loaded ${cities.length} cities from cities-full.json`);

  // Build lookup maps
  const nameIsoToQid = new Map();    // norm(name) + '__' + iso2 → qid
  const prefixIsoToQid = new Map();  // prefix1 + '__' + iso2 → qid, prefix2 + '__' + iso2 → qid
  const qidToCity = new Map();       // qid → {lat, lng, iso}

  // First pass: identify metro/aggregate entities to de-prioritize
  const metroQidSet = new Set(cities.filter(c =>
    /metropolitan area/i.test(c.name || '') ||
    /metro area/i.test(c.desc || '') ||
    /urban agglomeration/i.test(c.name || '')
  ).map(c => c.qid));

  for (const city of cities) {
    if (!city.qid || !city.iso) continue;
    const iso2 = city.iso.toUpperCase();
    const normalized = norm(city.name);
    const key = normalized + '__' + iso2;
    if (!nameIsoToQid.has(key)) nameIsoToQid.set(key, city.qid);

    // Register prefix lookups — skip metro areas so real cities get priority
    if (!metroQidSet.has(city.qid)) {
      const words = normalized.split(' ').filter(Boolean);
      for (let len = 1; len <= Math.min(3, words.length); len++) {
        const pfx = words.slice(0, len).join(' ') + '__' + iso2;
        if (!prefixIsoToQid.has(pfx)) prefixIsoToQid.set(pfx, city.qid);
      }
    }

    if (city.lat != null && city.lng != null) {
      qidToCity.set(city.qid, { lat: city.lat, lng: city.lng, iso: iso2 });
    }
  }

  // Build spatial index: country iso2 → [{qid, lat, lng, pop}]
  // Exclude "metropolitan area" entities — they're aggregates, prefer actual cities
  const qidToPop = new Map(cities.map(c => [c.qid, c.pop || 0]));
  const spatialByCountry = new Map();
  for (const [qid, loc] of qidToCity) {
    if (metroQidSet.has(qid)) continue; // skip metro area entities
    if (!spatialByCountry.has(loc.iso)) spatialByCountry.set(loc.iso, []);
    spatialByCountry.get(loc.iso).push({ qid, lat: loc.lat, lng: loc.lng, pop: qidToPop.get(qid) || 0 });
  }

  console.log(`Built lookup with ${nameIsoToQid.size} exact and ${prefixIsoToQid.size} prefix pairs`);

  // ── Download WHO xlsx ──────────────────────────────────────────────────────
  let cityRows = [];
  let xlsxBuf = null;

  try {
    console.log('\nDownloading WHO Air Quality Database V6.1...');
    xlsxBuf = await fetchBuffer(WHO_XLSX_URL);
    console.log(`  Downloaded ${(xlsxBuf.length / 1024).toFixed(0)} KB`);
    cityRows = parseWhoXlsx(xlsxBuf);
  } catch (err) {
    console.error(`WHO xlsx download failed: ${err.message}`);
  }

  // ── GHO API fallback if xlsx failed ───────────────────────────────────────
  if (cityRows.length === 0) {
    try {
      const output = await ghoFallback(cities);
      const count = Object.keys(output).length;
      console.log(`\nGHO fallback matched ${count} cities`);
      atomicWrite(OUTPUT_PATH, JSON.stringify(output, null, 2));
      printSamples(output);
      return;
    } catch (err2) {
      console.error(`GHO API fallback also failed: ${err2.message}`);
      process.exit(1);
    }
  }

  // ── Detect xlsx column names ──────────────────────────────────────────────
  const sampleRow = cityRows[0] || {};
  const cityCol   = findCol(sampleRow, ['city', 'City name', 'Station', 'Settlement', 'location']);
  const isoCol    = findCol(sampleRow, ['iso3', 'ISO3', 'iso_3', 'Country ISO3', 'cou_iso3', 'country_iso3']);
  const pm25Col   = findCol(sampleRow, ['pm25_concentration', 'pm25', 'pm2.5_concentration', 'pm2.5', 'pm2_5', 'Annual mean PM2.5', 'pm25_annual']);
  const yearCol   = findCol(sampleRow, ['year', 'Year', 'reference_year', 'measurement_year']);
  const latCol    = findCol(sampleRow, ['latitude', 'lat', 'Latitude']);
  const lngCol    = findCol(sampleRow, ['longitude', 'lng', 'lon', 'Longitude']);

  console.log(`\nColumn mapping: city="${cityCol}", iso3="${isoCol}", pm25="${pm25Col}", year="${yearCol}", lat="${latCol}", lng="${lngCol}"`);

  if (!cityCol || !isoCol || !pm25Col) {
    console.error('Could not detect required columns. Available:', Object.keys(sampleRow).join(', '));
    process.exit(1);
  }

  // ── Aggregate: best (most recent) PM2.5 per unique (city, iso3) ──────────
  // WHO has multiple years per city; we want the most recent
  const bestByKey = new Map(); // city+iso3 → {pm25, year, lat, lng}
  for (const row of cityRows) {
    const rawCity = row[cityCol];
    const iso3raw = row[isoCol];
    const pm25Raw = row[pm25Col];
    const yearRaw = row[yearCol];
    const lat = latCol ? parseFloat(row[latCol]) : NaN;
    const lng = lngCol ? parseFloat(row[lngCol]) : NaN;

    if (!rawCity || pm25Raw == null) continue;
    const pm25 = parseFloat(pm25Raw);
    if (isNaN(pm25) || pm25 <= 0 || pm25 > 2000) continue;

    const iso3str = iso3raw ? String(iso3raw).trim().toUpperCase() : '';
    const year = yearRaw ? parseInt(yearRaw) : 0;

    const dedupeKey = String(rawCity) + '||' + iso3str;
    const existing = bestByKey.get(dedupeKey);
    if (!existing || year > existing.year) {
      bestByKey.set(dedupeKey, { rawCity: String(rawCity), iso3: iso3str, pm25, year, lat, lng });
    }
  }
  console.log(`\nUnique WHO city entries (most-recent year): ${bestByKey.size}`);

  // ── Match WHO entries to city QIDs ────────────────────────────────────────
  const output = {};
  let matchExact = 0, matchFuzzy = 0, matchGeo = 0, noMatch = 0;

  for (const entry of bestByKey.values()) {
    const { rawCity, iso3, pm25, year, lat, lng } = entry;
    const iso2 = ISO3_TO_ISO2[iso3] || '';
    if (!iso2) { noMatch++; continue; }

    // Strip "/ISO3" suffix from WHO city name
    const cleanCity = rawCity.replace(/\/[A-Z]{3}$/, '').trim();

    // Strategy 1: Exact normalized name match
    const exactKey = norm(cleanCity) + '__' + iso2;
    let qid = nameIsoToQid.get(exactKey);
    if (qid) {
      matchExact++;
    }

    // Strategy 2: First-chunk prefix match (e.g. "New York Newark..." → "new york")
    if (!qid) {
      const chunk = normFirstChunk(cleanCity);
      const chunkWords = chunk.split(' ').filter(Boolean);
      // Try longest prefix match first (3 words, then 2, then 1)
      for (let len = Math.min(3, chunkWords.length); len >= 1 && !qid; len--) {
        const pfx = chunkWords.slice(0, len).join(' ') + '__' + iso2;
        qid = prefixIsoToQid.get(pfx);
      }
      if (qid) matchFuzzy++;
    }

    // Strategy 3: Coordinate proximity (≤50 km), prefer highest-population city within range
    if (!qid && !isNaN(lat) && !isNaN(lng)) {
      const candidates = spatialByCountry.get(iso2) || [];
      const THRESHOLD_KM = 50;
      let bestScore = -Infinity;
      for (const cand of candidates) {
        const d = haversine(lat, lng, cand.lat, cand.lng);
        if (d <= THRESHOLD_KM) {
          // Score: prefer closer AND larger; weight: -dist + log(pop+1)
          const score = -d + Math.log10(cand.pop + 1) * 10;
          if (score > bestScore) {
            bestScore = score;
            qid = cand.qid;
          }
        }
      }
      if (qid) matchGeo++;
    }

    if (qid) {
      // Keep this entry only if we don't already have a better (more recent) one
      if (!output[qid] || year > (output[qid].year || 0)) {
        output[qid] = {
          pm25: Math.round(pm25 * 10) / 10,
          year: year || null,
          category: categorize(pm25)
        };
      }
    } else {
      noMatch++;
    }
  }

  const total = matchExact + matchFuzzy + matchGeo + noMatch;
  console.log(`\nMatching results (${total} unique WHO cities):`);
  console.log(`  Exact name match:      ${matchExact}`);
  console.log(`  Fuzzy first-word match: ${matchFuzzy}`);
  console.log(`  Coordinate proximity:   ${matchGeo}`);
  console.log(`  No match:               ${noMatch}`);
  console.log(`  Unique QIDs with data:  ${Object.keys(output).length}`);

  console.log(`\nWriting ${OUTPUT_PATH}...`);
  atomicWrite(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`Done. Wrote ${Object.keys(output).length} entries.`);

  printSamples(output);
}

function printSamples(output) {
  console.log('\n── Sample entries ──');
  const samples = { 'Q60': 'New York', 'Q84': 'London', 'Q1490': 'Tokyo', 'Q90': 'Paris' };
  for (const [qid, label] of Object.entries(samples)) {
    if (output[qid]) {
      console.log(`  ${label} (${qid}):`, JSON.stringify(output[qid]));
    } else {
      console.log(`  ${label} (${qid}): not found`);
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
