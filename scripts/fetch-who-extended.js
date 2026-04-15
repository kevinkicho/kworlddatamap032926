#!/usr/bin/env node
/**
 * scripts/fetch-who-extended.js
 *
 * Fetches extended health indicators from WHO Global Health Observatory
 * and merges into public/country-data.json.
 *
 * NEW fields added (extends the 6 from fetch-who.js):
 *
 *
 *   Disease Burden:
 *     who_tb_incidence      — TB incidence per 100,000
 *     who_hiv_prevalence    — HIV prevalence among 15-49 (%)
 *     who_malaria_incidence — Malaria incidence per 1,000 at risk
 *     who_hepb_prevalence   — Hepatitis B surface antigen prevalence (%)
 *
 *   Lifestyle & Risk Factors:
 *     who_obesity           — Prevalence of obesity among adults (%)
 *     who_tobacco           — Tobacco use among persons 15+ (%)
 *     who_alcohol           — Alcohol per capita consumption (litres pure alcohol)
 *     who_physical_inactivity — Insufficient physical activity among adults (%)
 *
 *   Health System:
 *     who_health_spend_pc   — Current health expenditure per capita (USD)
 *     who_oop_spend         — Out-of-pocket expenditure as % of current health expenditure
 *     who_uhc_index         — UHC service coverage index (0-100)
 *     who_hale              — Healthy life expectancy at birth (years)
 *
 * Source: WHO GHO OData API (free, no key)
 *   https://ghoapi.azureedge.net/api/
 *
 * Coverage: 100-190 countries depending on indicator
 *
 * Usage: node scripts/fetch-who-extended.js
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const CD_PATH  = path.join(__dirname, '..', 'public', 'country-data.json');
const GHO_BASE = 'https://ghoapi.azureedge.net/api/';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// WHO uses ISO-3 codes; we need ISO-2
const ISO3_TO_ISO2 = {};

async function apiFetch(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'WorldDataMap/1.0 (educational)' },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

async function buildIso3Map() {
  process.stdout.write('Building ISO-3 → ISO-2 map … ');
  const json = await apiFetch(
    'https://api.worldbank.org/v2/country?format=json&per_page=400'
  );
  const countries = (json[1] ?? []).filter(c => c.region?.id && c.iso2Code && c.id);
  for (const c of countries) ISO3_TO_ISO2[c.id.toUpperCase()] = c.iso2Code.toUpperCase();
  console.log(`${Object.keys(ISO3_TO_ISO2).length} countries`);
}

// Fetch a GHO indicator; returns { [iso2]: { value, year } }
async function fetchGHO(indicatorCode, label) {
  process.stdout.write(`  ${indicatorCode.padEnd(28)} ${label} … `);
  const url = `${GHO_BASE}${indicatorCode}?$filter=TimeDim ge 2015 and TimeDim le 2024`;
  const best = {};
  try {
    const json = await apiFetch(url);
    const rows = json.value ?? [];
    for (const row of rows) {
      const iso3 = row.SpatialDim;
      if (!iso3 || iso3.length !== 3) continue;
      const iso2 = ISO3_TO_ISO2[iso3];
      if (!iso2) continue;
      // Skip sex-disaggregated rows (keep both sexes / total)
      const d1 = row.Dim1;
      if (d1 && d1 !== 'BTSX' && d1 !== 'TOTL' && d1 !== 'SEX_BTSX' && d1 !== 'SEX_TOTL') continue;
      const val = row.NumericValue;
      if (val == null || isNaN(val)) continue;
      const yr = parseInt(row.TimeDim, 10);
      if (!best[iso2] || yr > best[iso2].year) {
        best[iso2] = { value: val, year: yr };
      }
    }
  } catch (e) {
    console.log(`ERROR: ${e.message}`);
    return {};
  }
  console.log(`${Object.keys(best).length} countries`);
  return best;
}

// Indicator definitions: [ghoCode, fieldName, label, decimalPlaces]
const INDICATORS = [
  // Disease Burden
  ['MDG_0000000020',       'who_tb_incidence',         'TB incidence /100k',          0],
  ['MDG_0000000029',       'who_hiv_prevalence',       'HIV prevalence 15-49 %',      2],
  ['MALARIA_EST_INCIDENCE','who_malaria_incidence',    'Malaria incidence /1k',       1],
  ['WHS4_117',             'who_hepb_prevalence',      'Hepatitis B prevalence %',    2],

  // Lifestyle & Risk Factors
  ['NCD_BMI_30A',          'who_obesity',              'Obesity prevalence %',        1],
  ['M_Est_tob_curr_std',   'who_tobacco',              'Tobacco use 15+ %',           1],
  ['SA_0000001688',        'who_alcohol',              'Alcohol L/capita',            1],
  ['NCD_PAC',              'who_physical_inactivity',  'Insufficient phys. activity %',1],

  // Health System
  ['GHED_CHEGDP_SHA2011',  'who_health_spend_pc',     'Health spend/capita USD',     0],
  ['GHED_OOPSCHE_SHA2011',  'who_oop_spend',           'Out-of-pocket % health spend',1],
  ['UHC_INDEX_REPORTED',    'who_uhc_index',           'UHC service coverage index',  0],
  ['WHOSIS_000002',         'who_hale',                'Healthy life expectancy',     1],
];

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  WHO GHO Extended indicator fetcher                              ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  const cd = JSON.parse(fs.readFileSync(CD_PATH, 'utf8'));
  console.log(`Loaded country-data.json: ${Object.keys(cd).length} entries\n`);

  await buildIso3Map();
  await sleep(500);

  // Clear old extended WHO fields (preserve original 6 from fetch-who.js)
  const extFields = INDICATORS.map(i => i[1]);
  for (const iso in cd) {
    if (!cd[iso]) continue;
    for (const f of extFields) delete cd[iso][f];
    delete cd[iso].who_ext_year;
  }

  console.log('\n── Fetching WHO extended indicators ─────────────────────────────────');
  const results = {};
  for (const [code, field, label] of INDICATORS) {
    results[field] = await fetchGHO(code, label);
    await sleep(800);
  }

  console.log('\n── Merging ──────────────────────────────────────────────────────────');
  let count = 0;
  const allIso = new Set();
  for (const field of extFields) {
    for (const iso of Object.keys(results[field])) allIso.add(iso);
  }

  for (const iso of allIso) {
    if (!cd[iso]) continue;
    let hasAny = false;
    let latestYear = 0;

    for (const [, field, , decimals] of INDICATORS) {
      const rec = results[field][iso];
      if (rec) {
        cd[iso][field] = +rec.value.toFixed(decimals);
        latestYear = Math.max(latestYear, rec.year);
        hasAny = true;
      }
    }
    if (hasAny) {
      cd[iso].who_ext_year = latestYear;
      count++;
    }
  }

  console.log(`  Enriched ${count} countries with extended WHO data`);
  fs.writeFileSync(CD_PATH, JSON.stringify(cd, null, 2));
  console.log(`✓ Written to ${CD_PATH}`);

  console.log('\n── Spot-check ──────────────────────────────────────────────────────');
  for (const iso of ['US', 'DE', 'JP', 'NG', 'IN', 'BR', 'AU', 'ZA']) {
    const c = cd[iso];
    if (!c) continue;
    const vals = extFields.map(f => c[f] != null ? '✓' : '·').join('');
    console.log(`  ${iso}: [${vals}] (${extFields.filter(f => c[f] != null).length}/${extFields.length} indicators)`);
  }

  console.log('\n── Coverage summary ─────────────────────────────────────────────────');
  for (const [, field, label] of INDICATORS) {
    const n = Object.keys(results[field]).filter(iso => cd[iso]).length;
    console.log(`  ${label.padEnd(35)} ${n} countries`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
