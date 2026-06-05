#!/usr/bin/env node
/**
 * scripts/enrich-cities-quick.js
 *
 * Quick Wikidata enrichment for cities in cities-full.json.
 * Uses wbgetentities to fetch country, admin, population, area, elevation,
 * founded date, and settlement type in ~2 minutes.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const CITIES_FILE = path.join(__dirname, '..', 'public', 'cities-full.json');
const COUNTRY_FILE = path.join(__dirname, '..', 'public', 'country-data.json');
const BATCH_SIZE = 40;
const DELAY_MS = 2500;

const P_COUNTRY = 'P17'; const P_ADMIN = 'P131'; const P_POP = 'P1082';
const P_AREA = 'P2046'; const P_ELEV = 'P2044'; const P_FOUNDED = 'P571';
const P_INSTANCE = 'P31'; const P_WEBSITE = 'P856'; const P_GEONAMES = 'P1566';

const TYPE_MAP = {
  'Q515':'City','Q1549591':'Big city','Q3957':'Town','Q532':'Village',
  'Q486972':'Human settlement','Q5119':'Capital','Q15284':'Municipality',
  'Q7930989':'City/town','Q2208153':'US city','Q16560':'Regional capital',
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchBatch(qids) {
  const ids = qids.join('|');
  const props = [P_COUNTRY,P_ADMIN,P_POP,P_AREA,P_ELEV,P_FOUNDED,P_INSTANCE,P_WEBSITE,P_GEONAMES].join('|');
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids}&props=labels|claims&format=json&languages=en`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'WorldDataMap/1.0 (educational)' },
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 429) {
      const ra = parseInt(res.headers.get('retry-after') || '5');
      console.log(`\n  Rate limited, waiting ${ra}s...`);
      await sleep(ra * 1000);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }
  throw new Error('Rate limited');
}

function getValue(entity, prop) {
  const c = entity.claims?.[prop];
  if (!c?.length) return null;
  const s = c[0].mainsnak;
  if (s?.snaktype !== 'value') return null;
  return s.datavalue?.value;
}

async function main() {
  console.log('Loading data...');
  const cities = JSON.parse(fs.readFileSync(CITIES_FILE, 'utf8'));
  const countryData = JSON.parse(fs.readFileSync(COUNTRY_FILE, 'utf8'));
  const withQid = cities.filter(c => c.qid);

  // Build country name → ISO2 lookup
  const nameToIso2 = {};
  const labelToIso2 = {}; // lowercase
  for (const [iso2, d] of Object.entries(countryData)) {
    if (d.name) {
      nameToIso2[d.name.toLowerCase()] = iso2;
      // Common aliases
      labelToIso2[d.name.toLowerCase()] = iso2;
    }
  }
  // Add common country name aliases
  const aliases = {
    'united states of america':'US','united states':'US','usa':'US',
    'united kingdom':'GB','great britain':'GB','uk':'GB',
    'russia':'RU','russian federation':'RU',
    'china':'CN',"people's republic of china":'CN',
    'germany':'DE','france':'FR','japan':'JP','india':'IN',
    'brazil':'BR','canada':'CA','australia':'AU','italy':'IT',
    'spain':'ES','mexico':'MX','south korea':'KR','turkey':'TR',
    'indonesia':'ID','netherlands':'NL','saudi arabia':'SA',
    'switzerland':'CH','sweden':'SE','norway':'NO','poland':'PL',
    'belgium':'BE','austria':'AT','denmark':'DK','finland':'FI',
    'portugal':'PT','greece':'GR','ireland':'IE','new zealand':'NZ',
    'singapore':'SG','malaysia':'MY','thailand':'TH','vietnam':'VN',
    'philippines':'PH','egypt':'EG','south africa':'ZA','nigeria':'NG',
    'kenya':'KE','argentina':'AR','chile':'CL','colombia':'CO','peru':'PE',
    'venezuela':'VE','iran':'IR','iraq':'IQ','israel':'IL','pakistan':'PK',
    'bangladesh':'BD','ukraine':'UA','czech republic':'CZ','romania':'RO',
    'hungary':'HU','uae':'AE','united arab emirates':'AE',
    'morocco':'MA','algeria':'DZ','tunisia':'TN','ethiopia':'ET',
    'tanzania':'TZ','ghana':'GH','angola':'AO','mozambique':'MZ',
    'zimbabwe':'ZW','zambia':'ZM','uganda':'UG','senegal':'SN',
    'ivory coast':'CI',"côte d'ivoire":'CI','cameroon':'CM',
    'madagascar':'MG','myanmar':'MM','sri lanka':'LK','nepal':'NP',
    'taiwan':'TW','cuba':'CU','jamaica':'JM','dominican republic':'DO',
    'panama':'PA','costa rica':'CR','guatemala':'GT','ecuador':'EC',
    'bolivia':'BO','paraguay':'PY','uruguay':'UY',
  };
  Object.assign(nameToIso2, aliases);
  for (const [k,v] of Object.entries(aliases)) labelToIso2[k] = v;

  console.log(`Cities: ${cities.length}, ${withQid.length} with QID\n`);

  // Phase 1: Fetch city enrichment
  console.log('Phase 1: Fetching city data from Wikidata...');
  let enriched = 0, countryHits = 0;
  const countryQidsNeeded = new Set();

  for (let i = 0; i < withQid.length; i += BATCH_SIZE) {
    const batch = withQid.slice(i, i + BATCH_SIZE);
    const qids = batch.map(c => c.qid);

    let data;
    try { data = await fetchBatch(qids); }
    catch (e) { console.log(`\n  Batch ${Math.floor(i/BATCH_SIZE)+1} fail: ${e.message}`); continue; }
    if (!data?.entities) continue;

    for (const city of batch) {
      const e = data.entities[city.qid];
      if (!e || e.missing) continue;

      // Population (real)
      const pop = getValue(e, P_POP);
      if (pop?.amount && (city.pop === 50000 || !city.pop)) {
        city.pop = parseInt(pop.amount) || city.pop;
      }

      // Country — store QID for phase 2 resolution
      const countryVal = getValue(e, P_COUNTRY);
      if (countryVal?.id) {
        city._countryQid = countryVal.id;
        countryQidsNeeded.add(countryVal.id);
      }

      // Admin region — store QID
      const adminVal = getValue(e, P_ADMIN);
      if (adminVal?.id) {
        city._adminQid = adminVal.id;
      }

      // Area
      const area = getValue(e, P_AREA);
      if (area?.amount) city.area_km2 = parseFloat(area.amount) || null;

      // Elevation
      const elev = getValue(e, P_ELEV);
      if (elev?.amount) city.elev_m = parseFloat(elev.amount) || null;

      // Founded
      const founded = getValue(e, P_FOUNDED);
      if (founded?.time) {
        const yr = parseInt(founded.time.replace(/^-?/, '').slice(0, 4));
        if (founded.time.startsWith('-')) city.founded = -yr;
        else city.founded = yr;
      }

      // Settlement type
      const inst = getValue(e, P_INSTANCE);
      if (inst?.id) {
        const tid = inst.id.replace(/.*\//, '');
        city.settlement_type = TYPE_MAP[tid] || null;
      }

      // Website
      const web = getValue(e, P_WEBSITE);
      if (typeof web === 'string') city.website = web;

      // GeoNames
      const geo = getValue(e, P_GEONAMES);
      if (typeof geo === 'string') city.geonames_id = geo;

      enriched++;
    }
    process.stdout.write(`\r  ${Math.min(Math.round((i+BATCH_SIZE)/withQid.length*100), 100)}% — ${enriched} cities`);
    await sleep(DELAY_MS);
  }
  console.log(`\n  ${enriched} cities enriched, ${countryQidsNeeded.size} unique countries to resolve`);

  // Phase 2: Resolve country QIDs to ISO2 codes
  console.log('\nPhase 2: Resolving country codes...');
  const countryQids = [...countryQidsNeeded];
  const countryIso = {};

  for (let i = 0; i < countryQids.length; i += BATCH_SIZE) {
    const batch = countryQids.slice(i, i + BATCH_SIZE);
    let data;
    try { data = await fetchBatch(batch); }
    catch (e) { console.log(`\n  Country batch failed: ${e.message}`); continue; }
    if (!data?.entities) continue;

    for (const qid of batch) {
      const e = data.entities[qid];
      if (!e || e.missing) continue;
      const name = e.labels?.en?.value || '';
      const nameLower = name.toLowerCase();
      // Try name lookup first
      let iso2 = nameToIso2[nameLower] || null;
      // Try ISO3 code from Wikidata
      if (!iso2) {
        const iso3val = getValue(e, 'P298');
        if (iso3val) {
          iso2 = countryData[iso3val.toUpperCase()] ? iso3val.toUpperCase() : null;
        }
      }
      if (iso2) {
        countryIso[qid] = { iso: iso2, name: name || iso2 };
        countryHits++;
      }
    }
    process.stdout.write(`\r  ${Math.min(Math.round((i+BATCH_SIZE)/countryQids.length*100), 100)}% — ${Object.keys(countryIso).length} resolved`);
    await sleep(DELAY_MS);
  }
  console.log(`\n  Resolved ${Object.keys(countryIso).length} countries to ISO2 codes`);

  // Phase 3: Apply country data to cities
  console.log('\nPhase 3: Applying country data...');
  let applied = 0;
  for (const city of withQid) {
    if (city._countryQid && countryIso[city._countryQid]) {
      city.iso = countryIso[city._countryQid].iso;
      city.country = countryIso[city._countryQid].name;
      applied++;
    }
  }
  console.log(`  Applied country data to ${applied} cities`);

  // Phase 4: Non-QID cities — match to nearest QID city
  console.log('\nPhase 4: Matching non-QID cities...');
  const withoutQid = cities.filter(c => !c.qid);
  let matched = 0;
  for (const city of withoutQid) {
    let nearest = null, nearestDist = Infinity;
    for (const qCity of withQid) {
      if (!qCity.iso) continue;
      const dLat = (city.lat - qCity.lat) * 111.32;
      const dLng = (city.lng - qCity.lng) * 111.32 * Math.cos(city.lat * Math.PI / 180);
      const dist = Math.sqrt(dLat * dLat + dLng * dLng);
      if (dist < nearestDist) { nearestDist = dist; nearest = qCity; }
    }
    if (nearest) { city.iso = nearest.iso; city.country = nearest.country; matched++; }
  }
  console.log(`  Matched ${matched} non-QID cities`);

  // Clean up temp fields
  for (const city of cities) {
    delete city._countryQid;
    delete city._adminQid;
  }

  // Stats
  const wCountry = cities.filter(c => c.iso).length;
  const wPop = cities.filter(c => c.pop && c.pop !== 50000).length;
  const wArea = cities.filter(c => c.area_km2).length;
  const wElev = cities.filter(c => c.elev_m != null).length;
  const wFounded = cities.filter(c => c.founded).length;
  const wType = cities.filter(c => c.settlement_type).length;
  const wWeb = cities.filter(c => c.website).length;

  console.log(`\n=== Final Stats ===`);
  console.log(`Total: ${cities.length} cities`);
  console.log(`Country/ISO: ${wCountry} | Population: ${wPop} | Area: ${wArea}`);
  console.log(`Elevation: ${wElev} | Founded: ${wFounded} | Type: ${wType} | Website: ${wWeb}`);

  fs.writeFileSync(CITIES_FILE, JSON.stringify(cities));
  console.log(`\nWritten ${CITIES_FILE}`);
}

main().catch(e => { console.error(e); process.exit(1); });
