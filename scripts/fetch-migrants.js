/**
 * Fetch refugee and migrant data from World Bank
 *
 * World Bank has several relevant indicators:
 * - SM.POP.TOTL: International migrant stock, total
 * - SM.POP.NETM: Net migration
 * - SM.POP.REFG.OR: Refugee population by origin (not always available)
 * - SM.POP.REFG: Refugee population by country of asylum
 *
 * These complement the peace index data already in country-data.json
 */

const fs = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');

const COUNTRY_DATA = path.join(__dirname, '..', 'public', 'country-data.json');
const OUTPUT = path.join(__dirname, '..', 'public', 'migrant-data.json');

// World Bank API endpoints
const WB_BASE = 'https://api.worldbank.org/v2/country/all/indicator';
const INDICATORS = [
  'SM.POP.TOTL',      // International migrant stock, total
  'SM.POP.NETM',      // Net migration
  'SM.POP.REFG.OR',   // Refugee population by origin
  'SM.POP.REFG'       // Refugee population by country of asylum
];

// Valid ISO2 country codes (not aggregates)
// World Bank uses codes like '1W', 'XD', 'EU' for regions - we need to exclude these
function isValidCountry(iso2) {
  if (!iso2 || typeof iso2 !== 'string') return false;
  // Must be exactly 2 letters, not aggregates (numeric prefixes, X prefixes, etc.)
  // Aggregates: 1A, 1W, XD, XC, XF, EU, etc.
  if (iso2.length !== 2) return false;
  if (/[0-9]/.test(iso2)) return false; // No numeric prefixes (1A, 2A, etc.)
  if (iso2[0] === 'X') return false; // No X-prefixed aggregates
  if (iso2[0] === 'Z') return false; // No Z-prefixed aggregates (Z4, Z7, ZG, etc.)
  if (iso2[0] === 'V') return false; // No V-prefixed aggregates (V2, V3, V4, etc.)
  if (iso2[0] === 'T') return false; // No T-prefixed aggregates (T2-T7)
  if (iso2[0] === 'S') return false; // No S-prefixed aggregates (S3, etc.)
  // Known aggregate codes
  const aggregates = ['EU', 'OE', 'OA', '7E', '7S', '8S', '9S', 'F1', 'S1', 'S2', 'S4', 'S5'];
  if (aggregates.includes(iso2)) return false;
  return true;
}

async function fetchIndicator(indicator) {
  console.log(`[migrants] Fetching ${indicator}...`);

  const url = `${WB_BASE}/${indicator}?format=json&per_page=16000&date=2015:2024`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`World Bank API error: ${res.status}`);
  }

  const data = await res.json();

  if (!Array.isArray(data) || data.length < 2) {
    console.log(`[migrants] No data for ${indicator}`);
    return {};
  }

  // data[0] is metadata, data[1] is records
  const records = data[1] || [];

  // Get latest value per country (filtering out aggregates)
  const latest = {};
  for (const record of records) {
    const iso2 = record.country?.id;
    if (!isValidCountry(iso2)) continue;

    const value = record.value;
    const year = parseInt(record.date) || 0;

    // Keep most recent non-null value
    if (value !== null && value !== undefined) {
      if (!latest[iso2] || year > latest[iso2].year) {
        latest[iso2] = { value, year };
      }
    }
  }

  console.log(`[migrants] ${indicator}: ${Object.keys(latest).length} countries with data`);
  return latest;
}

async function fetchAllIndicators() {
  console.log('[migrants] === Fetching migrant/refugee data from World Bank ===\n');

  const results = {};

  for (const indicator of INDICATORS) {
    try {
      results[indicator] = await fetchIndicator(indicator);
      // Be nice to the API
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      console.log(`[migrants] Error fetching ${indicator}: ${err.message}`);
      results[indicator] = {};
    }
  }

  return results;
}

function buildCountryData(results, countryData) {
  console.log('\n[migrants] === Merging into country-data.json ===\n');

  let merged = 0;
  const migrantStock = results['SM.POP.TOTL'] || {};
  const netMigration = results['SM.POP.NETM'] || {};
  const refugeeOrigin = results['SM.POP.REFG.OR'] || {};
  const refugeeAsylum = results['SM.POP.REFG'] || {};

  for (const iso2 of Object.keys(countryData)) {
    const ms = migrantStock[iso2];
    const nm = netMigration[iso2];
    const ro = refugeeOrigin[iso2];
    const ra = refugeeAsylum[iso2];

    // Add migrant stock (total count)
    if (ms) {
      countryData[iso2].migrant_stock = ms.value;
      countryData[iso2].migrant_stock_year = ms.year;
    }

    // Add net migration
    if (nm) {
      countryData[iso2].net_migration = nm.value;
      countryData[iso2].net_migration_year = nm.year;
    }

    // Add refugee by origin (refugees FROM this country)
    if (ro) {
      countryData[iso2].refugees_by_origin = ro.value;
      countryData[iso2].refugees_by_origin_year = ro.year;
    }

    // Add refugee by asylum (refugees IN this country)
    if (ra) {
      countryData[iso2].refugees_by_asylum = ra.value;
      countryData[iso2].refugees_by_asylum_year = ra.year;
    }

    if (ms || nm || ro || ra) merged++;
  }

  console.log(`[migrants] Merged data for ${merged} countries`);
  return merged;
}

function generateStats(results) {
  console.log('\n[migrants] === Data Coverage ===\n');

  for (const [indicator, data] of Object.entries(results)) {
    const count = Object.keys(data).length;
    const withValue = Object.values(data).filter(d => d.value !== null).length;
    console.log(`${indicator}: ${count} countries, ${withValue} with values`);
  }

  // Top countries by migrant stock
  const ms = results['SM.POP.TOTL'] || {};
  const topMigrant = Object.entries(ms)
    .filter(([, d]) => d.value !== null && d.value > 0)
    .sort((a, b) => b[1].value - a[1].value)
    .slice(0, 10);

  console.log('\nTop 10 countries by migrant stock:');
  topMigrant.forEach(([iso2, d]) => {
    console.log(`  ${iso2}: ${d.value?.toLocaleString()} (${d.year})`);
  });

  // Top refugee origin countries
  const ro = results['SM.POP.REFG.OR'] || {};
  const topRefugeeOrigin = Object.entries(ro)
    .filter(([, d]) => d.value !== null && d.value > 0)
    .sort((a, b) => b[1].value - a[1].value)
    .slice(0, 10);

  console.log('\nTop 10 refugee origin countries:');
  topRefugeeOrigin.forEach(([iso2, d]) => {
    console.log(`  ${iso2}: ${d.value?.toLocaleString()} (${d.year})`);
  });
}

async function main() {
  try {
    const results = await fetchAllIndicators();
    generateStats(results);

    // Write raw data
    atomicWrite(OUTPUT, JSON.stringify(results, null, 2));
    console.log(`\n[migrants] Wrote raw data to ${OUTPUT}`);

    // Merge into country-data.json
    const countryData = JSON.parse(fs.readFileSync(COUNTRY_DATA, 'utf8'));
    const merged = buildCountryData(results, countryData);

    atomicWrite(COUNTRY_DATA, JSON.stringify(countryData, null, 2));
    console.log(`[migrants] Updated country-data.json`);

  } catch (err) {
    console.error('[migrants] Error:', err.message);
    process.exit(1);
  }
}

main();