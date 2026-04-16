#!/usr/bin/env node
/**
 * patch-country-pm25.js
 * Adds World Bank PM2.5 annual exposure data to the existing country-data.json.
 * Also adds CO2 emissions per capita and renewable energy %.
 *
 * Indicators added:
 *   EN.ATM.PM25.MC.M3  → pm25        (μg/m³, mean annual exposure)
 *   EN.ATM.CO2E.PC     → co2_per_cap (metric tons CO2 per capita)
 *   EG.FEC.RNEW.ZS     → renewables_pct (% of final energy from renewables)
 *
 * Source: World Bank Open Data (no API key required)
 * Usage:  node scripts/patch-country-pm25.js
 */

'use strict';

const fs   = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');

const OUT_FILE = path.join(__dirname, '..', 'public', 'country-data.json');

const INDICATORS = [
  { id: 'EN.ATM.PM25.MC.M3', key: 'pm25',            label: 'PM2.5 mean annual exposure (μg/m³)',         dp: 1 },
  { id: 'AG.LND.FRST.ZS',    key: 'forest_pct',      label: 'Forest area (% of land area)',               dp: 1 },
  { id: 'SH.STA.AIRP.P5',    key: 'air_death_rate',  label: 'Mortality from air pollution (per 100,000)', dp: 1 },
  { id: 'SH.STA.TRAF.P5',    key: 'road_death_rate', label: 'Road traffic death rate (per 100,000)',      dp: 1 },
];

async function fetchIndicator(id, validIso2) {
  const url = `https://api.worldbank.org/v2/country/all/indicator/${id}?format=json&mrv=5&per_page=2000`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${id}`);
  const [meta, rows] = await res.json();

  // Take the most recent value per iso2
  // Match by country.id against known ISO-2 codes to exclude WB regional aggregates
  const best = {};
  for (const r of (rows || [])) {
    const iso = r.country?.id;
    if (!iso || !validIso2.has(iso) || r.value == null) continue;
    if (!best[iso] || r.date > best[iso].date) {
      best[iso] = { value: r.value, date: r.date };
    }
  }
  console.log(`  ${id}: ${Object.keys(best).length} countries`);
  return best;
}

async function main() {
  if (!fs.existsSync(OUT_FILE)) {
    console.error('country-data.json not found — run npm run fetch-country first');
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
  const validIso2 = new Set(Object.keys(data));
  console.log(`Loaded ${validIso2.size} countries from country-data.json`);

  for (const ind of INDICATORS) {
    process.stdout.write(`Fetching ${ind.label} … `);
    try {
      const best = await fetchIndicator(ind.id, validIso2);
      let patched = 0;
      for (const [iso2, rec] of Object.entries(data)) {
        if (best[iso2] != null) {
          const val = best[iso2].value;
          data[iso2][ind.key] = +val.toFixed(ind.dp ?? 2);
          data[iso2][ind.key + '_year'] = parseInt(best[iso2].date, 10);
          patched++;
        }
      }
      console.log(`patched ${patched} countries`);
    } catch (e) {
      console.log(`FAILED: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  atomicWrite(OUT_FILE, JSON.stringify(data));
  console.log(`\nDone — wrote ${Object.keys(data).length} countries to country-data.json`);

  // Quick sanity check
  const sample = data['FI'];
  if (sample) console.log('Finland sample:', JSON.stringify({ pm25: sample.pm25, forest_pct: sample.forest_pct, air_death_rate: sample.air_death_rate }));
}

main().catch(e => { console.error(e); process.exit(1); });
