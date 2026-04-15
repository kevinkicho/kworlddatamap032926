#!/usr/bin/env node
/**
 * scripts/fetch-peeringdb.js
 *
 * Fetches internet infrastructure data from PeeringDB API:
 * - Internet Exchange Points (IXPs) with coordinates via facilities
 * - Data Centers / Facilities
 * - Networks
 *
 * and writes public/peeringdb.json + enriches country-data.json.
 *
 * Output structure:
 *   {
 *     fetched_at: ISO timestamp,
 *     source: 'PeeringDB',
 *     ixps: [{ id, name, city, country, iso2, lat, lng, networks_count }],
 *     datacenters: [{ id, name, city, country, iso2, lat, lng, websites_count }],
 *     byCountry: { US: { ixps, datacenters, networks }, ... }
 *   }
 *
 * Also enriches country-data.json with:
 *   - internet_ixps: Number of IXPs
 *   - internet_datacenters: Number of data centers
 *   - internet_networks: Number of networks
 *
 * Source: https://www.peeringdb.com/api/
 * No API key required.
 *
 * Usage: node scripts/fetch-peeringdb.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const OUTPUT_PATH = path.join(__dirname, '..', 'public', 'peeringdb.json');
const COUNTRY_DATA_PATH = path.join(__dirname, '..', 'public', 'country-data.json');

const API_BASE = 'https://www.peeringdb.com/api';

// ISO3 to ISO2 mapping for countries that need conversion
const ISO3_TO_ISO2 = {
  'USA': 'US', 'GBR': 'GB', 'DEU': 'DE', 'FRA': 'FR', 'JPN': 'JP',
  'CHN': 'CN', 'IND': 'IN', 'BRA': 'BR', 'CAN': 'CA', 'AUS': 'AU',
  'ITA': 'IT', 'ESP': 'ES', 'NLD': 'NL', 'SWE': 'SE', 'NOR': 'NO',
  'DNK': 'DK', 'FIN': 'FI', 'POL': 'PL', 'BEL': 'BE', 'CHE': 'CH',
  'AUT': 'AT', 'SGP': 'SG', 'HKG': 'HK', 'KOR': 'KR', 'MEX': 'MX',
  'ARG': 'AR', 'CHL': 'CL', 'ZAF': 'ZA', 'RUS': 'RU', 'TUR': 'TR',
  'SAU': 'SA', 'ARE': 'AE', 'ISR': 'IL', 'EGY': 'EG', 'NGA': 'NG',
  'KEN': 'KE', 'THA': 'TH', 'VNM': 'VN', 'IDN': 'ID', 'MYS': 'MY',
  'PHL': 'PH', 'NZL': 'NZ', 'CZE': 'CZ', 'ROU': 'RO', 'HUN': 'HU',
  'GRC': 'GR', 'PRT': 'PT', 'IRL': 'IE', 'UKR': 'UA', 'COL': 'CO',
  'PER': 'PE', 'VEN': 'VE', 'ECU': 'EC', 'PAK': 'PK', 'BGD': 'BD',
  'LKA': 'LK', 'IRN': 'IR', 'IRQ': 'IQ', 'MAR': 'MA', 'DZA': 'DZ',
  'TUN': 'TN', 'GHA': 'GH', 'CIV': 'CI', 'SEN': 'SN', 'ETH': 'ET',
  'TZA': 'TZ', 'UGA': 'UG', 'ZWE': 'ZW', 'CMR': 'CM', 'PRY': 'PY',
  'URY': 'UY', 'BOL': 'BO', 'CRI': 'CR', 'PAN': 'PA', 'GTM': 'GT',
  'DOM': 'DO', 'CUB': 'CU', 'JAM': 'JM', 'TTO': 'TT', 'ISL': 'IS',
  'LUX': 'LU', 'SVN': 'SI', 'SVK': 'SK', 'HRV': 'HR', 'SRB': 'RS',
  'BGR': 'BG', 'LTU': 'LT', 'LVA': 'LV', 'EST': 'EE', 'BLR': 'BY',
  'KAZ': 'KZ', 'UZB': 'UZ', 'AZE': 'AZ', 'GEO': 'GE', 'ARM': 'AM',
  'QAT': 'QA', 'KWT': 'KW', 'BHR': 'BH', 'OMN': 'OM', 'JOR': 'JO',
  'LBN': 'LB', 'BWA': 'BW', 'NAM': 'NA', 'MUS': 'MU', 'REU': 'RE',
  'MDG': 'MG', 'MOZ': 'MZ', 'ANGO': 'AO', 'COD': 'CD', 'COG': 'CG',
  'GAB': 'GA', 'CAF': 'CF', 'TCD': 'TD', 'NER': 'NE', 'MLI': 'ML',
  'BFA': 'BF', 'GIN': 'GN', 'SLE': 'SL', 'LBR': 'LR', 'TGO': 'TG',
  'BEN': 'BJ', 'MRT': 'MR', 'GMB': 'GM', 'GNB': 'GW', 'CPV': 'CV',
  'SSD': 'SS', 'ERI': 'ER', 'DJI': 'DJ', 'SOM': 'SO', 'SDN': 'SD',
  'LBY': 'LY', 'SYR': 'SY', 'YEM': 'YE', 'AFG': 'AF', 'NPL': 'NP',
  'BTN': 'BT', 'MMR': 'MM', 'LAO': 'LA', 'KHM': 'KH', 'MNG': 'MN',
  'PRK': 'KP', 'TWN': 'TW', 'MNP': 'MP', 'GUM': 'GU', 'FJI': 'FJ',
  'PNG': 'PG', 'SLB': 'SB', 'VUT': 'VU', 'NCL': 'NC', 'PYF': 'PF',
  'WSM': 'WS', 'TON': 'TO', 'KIR': 'KI', 'PLW': 'PW', 'FSM': 'FM',
  'MHL': 'MH', 'NRU': 'NR', 'TUV': 'TV', 'COK': 'CK', 'NIU': 'NU',
  'TKL': 'TK', 'ALA': 'AX', 'FRO': 'FO', 'GRL': 'GL', 'SJM': 'SJ',
  'GIB': 'GI', 'MLT': 'MT', 'SMR': 'SM', 'VAT': 'VA', 'MCO': 'MC',
  'AND': 'AD', 'LIE': 'LI', 'IMN': 'IM', 'JEY': 'JE', 'GGY': 'GG',
  'CYM': 'KY', 'BMU': 'BM', 'TCA': 'TC', 'VGB': 'VG', 'AIA': 'AI',
  'MSR': 'MS', 'ATG': 'AG', 'KNA': 'KN', 'VCT': 'VC', 'GRD': 'GD',
  'DMA': 'DM', 'BRB': 'BB', 'LCA': 'LC', 'BHS': 'BS', 'ABW': 'AW',
  'CUW': 'CW', 'SXM': 'SX', 'BES': 'BQ', 'VIR': 'VI', 'PRI': 'PR',
  'MAF': 'MF', 'BLM': 'BL', 'SPM': 'PM', 'GLP': 'GP', 'MTQ': 'MQ',
  'GUF': 'GF', 'SUR': 'SR', 'GUY': 'GY', 'ATF': 'TF', 'IOT': 'IO',
  'CCK': 'CC', 'CXR': 'CX', 'NFK': 'NF', 'PCN': 'PN', 'ESH': 'EH',
  'MAC': 'MO', 'PSE': 'PS', 'ALA': 'AX', 'KSV': 'XK', 'MNE': 'ME',
};

async function apiFetch(endpoint) {
  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'WorldDataMap/1.0 (educational)' },
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

function iso3ToIso2(iso3) {
  if (!iso3) return null;
  if (ISO3_TO_ISO2[iso3]) return ISO3_TO_ISO2[iso3];
  if (iso3.length === 2) return iso3.toUpperCase();
  return null;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  PeeringDB Internet Infrastructure Fetcher                       ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  // Fetch all endpoints in parallel
  console.log('Fetching data from PeeringDB API...');
  const [ixpData, facData, netData, ixfacData] = await Promise.all([
    apiFetch('/ix?num=10000'),
    apiFetch('/fac?num=10000'),
    apiFetch('/net?num=100000'),
    apiFetch('/ixfac?num=100000'),
  ]);

  console.log(`  IXPs: ${ixpData.data?.length || 0}`);
  console.log(`  Facilities: ${facData.data?.length || 0}`);
  console.log(`  Networks: ${netData.data?.length || 0}`);
  console.log(`  IXP Facilities: ${ixfacData.data?.length || 0}`);

  // Build a map of fac_id -> {lat, lng} from facilities
  const facCoords = {};
  for (const fac of facData.data || []) {
    if (fac.latitude && fac.longitude) {
      facCoords[fac.id] = { lat: +fac.latitude.toFixed(4), lng: +fac.longitude.toFixed(4) };
    }
  }
  console.log(`  Facilities with coordinates: ${Object.keys(facCoords).length}`);

  // Build a map of ix_id -> [{fac_id, lat, lng}] from ixfac
  const ixFacMap = {};
  for (const ixfac of ixfacData.data || []) {
    if (!ixfac.ix_id || !ixfac.fac_id) continue;
    const coords = facCoords[ixfac.fac_id];
    if (!coords) continue;
    if (!ixFacMap[ixfac.ix_id]) ixFacMap[ixfac.ix_id] = [];
    ixFacMap[ixfac.ix_id].push(coords);
  }
  console.log(`  IXPs with facility links: ${Object.keys(ixFacMap).length}`);

  // Process IXPs with coordinates from their facilities
  console.log('\n── Processing IXPs ──────────────────────────────────────────────────');
  const ixps = [];
  const ixpsByCountry = {};
  for (const ix of ixpData.data || []) {
    const iso2 = iso3ToIso2(ix.country);
    if (!iso2) continue;

    // Get coordinates from first facility
    const facs = ixFacMap[ix.id] || [];
    const coords = facs[0] || { lat: null, lng: null };

    const ixp = {
      id: ix.id,
      name: ix.name,
      city: ix.city || '',
      country: ix.country,
      iso2,
      lat: coords.lat,
      lng: coords.lng,
      networks_count: ix.net_count || 0,
      website: ix.website || '',
      facs_count: facs.length,
    };
    ixps.push(ixp);
    ixpsByCountry[iso2] = (ixpsByCountry[iso2] || 0) + 1;
  }
  const ixpsWithCoords = ixps.filter(ix => ix.lat !== null).length;
  console.log(`  ${ixps.length} IXPs total`);
  console.log(`  ${ixpsWithCoords} IXPs with valid coordinates`);
  console.log(`  Countries covered: ${Object.keys(ixpsByCountry).length}`);

  // Process Data Centers / Facilities
  console.log('\n── Processing Data Centers ────────────────────────────────────────');
  const datacenters = [];
  const dcByCountry = {};
  for (const fac of facData.data || []) {
    const iso2 = iso3ToIso2(fac.country);
    if (!iso2) continue;

    const dc = {
      id: fac.id,
      name: fac.name,
      city: fac.city || '',
      country: fac.country,
      iso2,
      lat: fac.latitude ? +fac.latitude.toFixed(4) : null,
      lng: fac.longitude ? +fac.longitude.toFixed(4) : null,
      websites_count: fac.website_count || 0,
      website: fac.website || '',
    };
    datacenters.push(dc);
    dcByCountry[iso2] = (dcByCountry[iso2] || 0) + 1;
  }
  const dcsWithCoords = datacenters.filter(dc => dc.lat !== null).length;
  console.log(`  ${datacenters.length} data centers total`);
  console.log(`  ${dcsWithCoords} data centers with valid coordinates`);
  console.log(`  Countries covered: ${Object.keys(dcByCountry).length}`);

  // Process Networks by country
  console.log('\n── Processing Networks ────────────────────────────────────────────');
  const networksByCountry = {};
  for (const net of netData.data || []) {
    const iso2 = iso3ToIso2(net.country);
    if (!iso2) continue;
    networksByCountry[iso2] = (networksByCountry[iso2] || 0) + 1;
  }
  console.log(`  Countries with networks: ${Object.keys(networksByCountry).length}`);

  // Build byCountry summary
  const allCountries = new Set([
    ...Object.keys(ixpsByCountry),
    ...Object.keys(dcByCountry),
    ...Object.keys(networksByCountry),
  ]);

  const byCountry = {};
  for (const iso2 of allCountries) {
    byCountry[iso2] = {
      ixps: ixpsByCountry[iso2] || 0,
      datacenters: dcByCountry[iso2] || 0,
      networks: networksByCountry[iso2] || 0,
    };
  }

  // Top countries
  console.log('\n── Top 15 countries by internet infrastructure ─────────────────────');
  const topCountries = Array.from(allCountries)
    .map(iso2 => ({
      iso2,
      total: byCountry[iso2].ixps + byCountry[iso2].datacenters + byCountry[iso2].networks,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 15);

  for (const c of topCountries) {
    const d = byCountry[c.iso2];
    console.log(`  ${c.iso2}: ${c.total} total (${d.ixps} IXPs, ${d.datacenters} DCs, ${d.networks} nets)`);
  }

  // Write output
  const output = {
    fetched_at: new Date().toISOString(),
    source: 'PeeringDB',
    ixps,
    datacenters,
    byCountry,
    stats: {
      total_ixps: ixps.length,
      total_ixps_with_coords: ixpsWithCoords,
      total_datacenters: datacenters.length,
      total_datacenters_with_coords: dcsWithCoords,
      total_networks: Object.values(networksByCountry).reduce((a, b) => a + b, 0),
      countries_covered: allCountries.size,
    },
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\n✓ Written to ${OUTPUT_PATH}`);

  // Enrich country-data.json
  console.log('\n── Enriching country-data.json ────────────────────────────────────');
  const countryData = JSON.parse(fs.readFileSync(COUNTRY_DATA_PATH, 'utf8'));
  console.log(`  Loaded ${Object.keys(countryData).length} countries`);

  let enriched = 0;
  for (const [iso2, stats] of Object.entries(byCountry)) {
    if (!countryData[iso2]) continue;
    countryData[iso2].internet_ixps = stats.ixps;
    countryData[iso2].internet_datacenters = stats.datacenters;
    countryData[iso2].internet_networks = stats.networks;
    enriched++;
  }
  console.log(`  Enriched ${enriched} countries`);

  fs.writeFileSync(COUNTRY_DATA_PATH, JSON.stringify(countryData, null, 2));
  console.log(`✓ Updated ${COUNTRY_DATA_PATH}`);

  // Spot-check
  console.log('\n── Spot-check (selected countries) ─────────────────────────────────');
  for (const iso of ['US', 'GB', 'DE', 'FR', 'JP', 'CN', 'SG', 'NL', 'BR', 'AU']) {
    const d = byCountry[iso];
    if (!d) continue;
    console.log(`  ${iso}: ${d.ixps} IXPs, ${d.datacenters} DCs, ${d.networks} networks`);
  }

  // Show IXPs with coordinates
  console.log('\n── Sample IXPs with coordinates ────────────────────────────────────');
  const sampleIxps = ixps.filter(ix => ix.lat !== null).slice(0, 10);
  for (const ix of sampleIxps) {
    console.log(`  ${ix.name}: ${ix.lat}, ${ix.lng} (${ix.city}, ${ix.iso2})`);
  }
}

main().catch(err => {
  console.error('[peeringdb] Error:', err.message);
  process.exit(1);
});
