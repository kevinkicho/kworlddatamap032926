#!/usr/bin/env node
/**
 * scripts/fetch-disaster-risk.js
 *
 * Fetches INFORM Risk Index data and merges into public/country-data.json.
 *
 * Fields added:
 *   inform_risk        — INFORM overall risk index (0-10)
 *   inform_hazard      — Hazard & Exposure dimension (0-10)
 *   inform_vulnerability — Vulnerability dimension (0-10)
 *   inform_coping      — Lack of Coping Capacity dimension (0-10)
 *   inform_natural     — Natural hazard sub-component (0-10)
 *   inform_human       — Human hazard sub-component (0-10)
 *   inform_class       — Risk class: "Very High" / "High" / "Medium" / "Low" / "Very Low"
 *
 * Source: INFORM Risk Index 2024 (EC Joint Research Centre)
 *   https://drmkc.jrc.ec.europa.eu/inform-index/
 *
 * Coverage: ~191 countries
 *
 * Usage: node scripts/fetch-disaster-risk.js
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const CD_PATH  = path.join(__dirname, '..', 'public', 'country-data.json');
const API_BASE = 'https://drmkc.jrc.ec.europa.eu/inform-index/API/InformAPI/countries/Scores/';
const WF_ID    = 261; // latest workflow ID

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ISO-3 to ISO-2 mapping (built from World Bank API)
let ISO3_TO_ISO2 = {};

async function apiFetch(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'WorldDataMap/1.0 (educational)' },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (attempt === 3) throw e;
      console.log(`    Retry ${attempt}/3 (${e.message})`);
      await sleep(2000 * attempt);
    }
  }
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

async function fetchIndicator(code, label) {
  process.stdout.write(`  ${code.padEnd(12)} ${label} … `);
  const url = `${API_BASE}?WorkflowId=${WF_ID}&IndicatorId=${code}`;
  const data = await apiFetch(url);
  const result = {};
  for (const row of data) {
    const iso3 = row.Iso3;
    const iso2 = ISO3_TO_ISO2[iso3];
    if (!iso2) continue;
    const val = parseFloat(row.IndicatorScore);
    if (isNaN(val)) continue;
    result[iso2] = val;
  }
  console.log(`${Object.keys(result).length} countries`);
  return result;
}

function riskClass(score) {
  if (score >= 6.5) return 'Very High';
  if (score >= 5.0) return 'High';
  if (score >= 3.5) return 'Medium';
  if (score >= 2.0) return 'Low';
  return 'Very Low';
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  INFORM Risk Index fetcher (EC JRC)                              ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  const cd = JSON.parse(fs.readFileSync(CD_PATH, 'utf8'));
  console.log(`Loaded country-data.json: ${Object.keys(cd).length} entries\n`);

  await buildIso3Map();
  await sleep(1000);

  // Clear old INFORM fields
  for (const iso in cd) {
    if (!cd[iso]) continue;
    delete cd[iso].inform_risk; delete cd[iso].inform_hazard;
    delete cd[iso].inform_vulnerability; delete cd[iso].inform_coping;
    delete cd[iso].inform_natural; delete cd[iso].inform_human;
    delete cd[iso].inform_class;
  }

  console.log('\n── Fetching INFORM indicators ───────────────────────────────────────');
  const indicators = [
    ['INFORM',   'Overall Risk'],
    ['HA',       'Hazard & Exposure'],
    ['VU',       'Vulnerability'],
    ['CC',       'Lack of Coping Capacity'],
    ['HA.NAT',   'Natural Hazard'],
    ['HA.HUM',   'Human Hazard'],
  ];

  const results = {};
  for (const [code, label] of indicators) {
    results[code] = await fetchIndicator(code, label);
    await sleep(1500);
  }

  console.log('\n── Merging ──────────────────────────────────────────────────────────');
  let count = 0;
  for (const iso in cd) {
    if (!cd[iso]) continue;
    const risk = results['INFORM']?.[iso];
    if (risk == null) continue;
    cd[iso].inform_risk          = +risk.toFixed(1);
    cd[iso].inform_hazard        = +(results['HA']?.[iso] ?? 0).toFixed(1) || undefined;
    cd[iso].inform_vulnerability = +(results['VU']?.[iso] ?? 0).toFixed(1) || undefined;
    cd[iso].inform_coping        = +(results['CC']?.[iso] ?? 0).toFixed(1) || undefined;
    cd[iso].inform_natural       = +(results['HA.NAT']?.[iso] ?? 0).toFixed(1) || undefined;
    cd[iso].inform_human         = +(results['HA.HUM']?.[iso] ?? 0).toFixed(1) || undefined;
    cd[iso].inform_class         = riskClass(risk);
    count++;
  }
  console.log(`  Enriched ${count} countries with INFORM Risk data`);

  fs.writeFileSync(CD_PATH, JSON.stringify(cd, null, 2));
  console.log(`✓ Written to ${CD_PATH}`);

  console.log('\n── Spot-check ──────────────────────────────────────────────────────');
  for (const iso of ['US', 'DE', 'JP', 'BR', 'IN', 'NG', 'SO', 'AF', 'SY', 'CH', 'NO']) {
    const c = cd[iso];
    if (!c || c.inform_risk == null) continue;
    console.log(`  ${iso}: Risk=${c.inform_risk} (${c.inform_class})  H=${c.inform_hazard} V=${c.inform_vulnerability} C=${c.inform_coping}`);
  }

  // Risk class distribution
  console.log('\n── Risk class distribution ──────────────────────────────────────────');
  const dist = {};
  for (const iso in cd) {
    if (cd[iso]?.inform_class) dist[cd[iso].inform_class] = (dist[cd[iso].inform_class] || 0) + 1;
  }
  for (const cls of ['Very High', 'High', 'Medium', 'Low', 'Very Low']) {
    console.log(`  ${cls.padEnd(12)} ${dist[cls] || 0} countries`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
