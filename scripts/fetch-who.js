#!/usr/bin/env node
/**
 * scripts/fetch-who.js
 *
 * Fetches health indicators from WHO Global Health Observatory and merges
 * into public/country-data.json.
 *
 * Fields added:
 *   who_physicians     — Physicians per 10,000 population
 *   who_nurses         — Nursing/midwifery per 10,000 population
 *   who_hospital_beds  — Hospital beds per 10,000 population
 *   who_immunization   — DPT3 immunization coverage among 1-year-olds (%)
 *   who_maternal_mort  — Maternal mortality ratio (per 100,000 live births)
 *   who_ncd_mortality  — NCD mortality rate 30-70 (probability %)
 *   who_year           — Year of latest data
 *
 * Source: WHO GHO OData API (free, no key)
 *   https://ghoapi.azureedge.net/api/
 *
 * Coverage: 150-190 countries depending on indicator
 *
 * Usage: node scripts/fetch-who.js
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const CD_PATH = path.join(__dirname, '..', 'public', 'country-data.json');
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
  process.stdout.write(`  ${indicatorCode.padEnd(26)} ${label} … `);
  // Filter to most recent 10 years and both sexes where applicable
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
      // Skip sex-disaggregated rows (keep both sexes or total; WHO uses SEX_BTSX / BTSX / TOTL)
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

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  WHO Global Health Observatory indicator fetcher                  ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  const cd = JSON.parse(fs.readFileSync(CD_PATH, 'utf8'));
  console.log(`Loaded country-data.json: ${Object.keys(cd).length} entries\n`);

  await buildIso3Map();
  await sleep(800);

  // Clear old WHO fields
  for (const iso in cd) {
    if (!cd[iso]) continue;
    delete cd[iso].who_physicians; delete cd[iso].who_nurses;
    delete cd[iso].who_hospital_beds; delete cd[iso].who_immunization;
    delete cd[iso].who_maternal_mort; delete cd[iso].who_ncd_mortality;
    delete cd[iso].who_year;
  }

  console.log('\n── Fetching WHO indicators ──────────────────────────────────────────');

  // HWF_0001: Medical doctors (per 10,000 population)
  const physicians = await fetchGHO('HWF_0001', 'Physicians per 10k');
  await sleep(800);

  // HWF_0006: Nursing and midwifery personnel density (per 10,000 population)
  // HWF_0002 is the absolute headcount, not density
  const nurses = await fetchGHO('HWF_0006', 'Nurses per 10k');
  await sleep(800);

  // DEVICES05: Hospital beds (per 10,000 population)
  // Alternate code: HWF_BEDS or WHS6_102
  let beds = await fetchGHO('WHS6_102', 'Hospital beds per 10k');
  if (Object.keys(beds).length < 50) {
    console.log('  Trying alternate code DEVICES05 …');
    await sleep(800);
    const beds2 = await fetchGHO('DEVICES05', 'Hospital beds (alt)');
    // Merge, preferring newer data
    for (const [iso, rec] of Object.entries(beds2)) {
      if (!beds[iso] || rec.year > beds[iso].year) beds[iso] = rec;
    }
  }
  await sleep(800);

  // WHS4_543: DPT3 immunization coverage (%)
  const immun = await fetchGHO('WHS4_543', 'DPT3 immunization %');
  await sleep(800);

  // MDG_0000000026: Maternal mortality ratio (per 100,000 live births)
  const maternal = await fetchGHO('MDG_0000000026', 'Maternal mortality');
  await sleep(800);

  // NCDMORT3070: Probability of dying between 30-70 from NCDs (%)
  const ncd = await fetchGHO('NCDMORT3070', 'NCD mortality 30-70');

  console.log('\n── Merging ──────────────────────────────────────────────────────────');
  let count = 0;
  const allIso = new Set([
    ...Object.keys(physicians), ...Object.keys(nurses), ...Object.keys(beds),
    ...Object.keys(immun), ...Object.keys(maternal), ...Object.keys(ncd),
  ]);

  for (const iso of allIso) {
    if (!cd[iso]) continue;
    let hasAny = false;
    let latestYear = 0;

    if (physicians[iso]) {
      cd[iso].who_physicians = +physicians[iso].value.toFixed(1);
      latestYear = Math.max(latestYear, physicians[iso].year);
      hasAny = true;
    }
    if (nurses[iso]) {
      cd[iso].who_nurses = +nurses[iso].value.toFixed(1);
      latestYear = Math.max(latestYear, nurses[iso].year);
      hasAny = true;
    }
    if (beds[iso]) {
      cd[iso].who_hospital_beds = +beds[iso].value.toFixed(1);
      latestYear = Math.max(latestYear, beds[iso].year);
      hasAny = true;
    }
    if (immun[iso]) {
      cd[iso].who_immunization = +immun[iso].value.toFixed(0);
      latestYear = Math.max(latestYear, immun[iso].year);
      hasAny = true;
    }
    if (maternal[iso]) {
      cd[iso].who_maternal_mort = +maternal[iso].value.toFixed(0);
      latestYear = Math.max(latestYear, maternal[iso].year);
      hasAny = true;
    }
    if (ncd[iso]) {
      cd[iso].who_ncd_mortality = +ncd[iso].value.toFixed(1);
      latestYear = Math.max(latestYear, ncd[iso].year);
      hasAny = true;
    }
    if (hasAny) {
      cd[iso].who_year = latestYear;
      count++;
    }
  }

  console.log(`  Enriched ${count} countries with WHO data`);
  fs.writeFileSync(CD_PATH, JSON.stringify(cd, null, 2));
  console.log(`✓ Written to ${CD_PATH}`);

  console.log('\n── Spot-check ──────────────────────────────────────────────────────');
  for (const iso of ['US', 'DE', 'JP', 'NG', 'IN', 'BR']) {
    const c = cd[iso];
    if (!c) continue;
    console.log(`  ${iso}: docs=${c.who_physicians ?? 'n/a'}/10k  nurses=${c.who_nurses ?? 'n/a'}/10k  beds=${c.who_hospital_beds ?? 'n/a'}/10k  DPT3=${c.who_immunization ?? 'n/a'}%  maternal=${c.who_maternal_mort ?? 'n/a'}/100k  NCD=${c.who_ncd_mortality ?? 'n/a'}%`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
