#!/usr/bin/env node
/**
 * scripts/fetch-wgi.js
 *
 * Fetches World Bank Governance Indicators (WGI) for all countries.
 * Six dimensions — each scored -2.5 (worst) to +2.5 (best):
 *   wgi_rule_of_law, wgi_corruption, wgi_govt_effectiveness,
 *   wgi_voice_accountability, wgi_political_stability, wgi_regulatory_quality
 *
 * Also fetches four sustainability indicators using the same pipeline:
 *   co2_per_capita, renewable_energy_pct, health_spend_gdp, education_spend_gdp
 *
 * Appends to public/country-data.json (safe to re-run).
 * Free, no API key required (World Bank Open Data).
 *
 * Usage: node scripts/fetch-wgi.js
 * Runtime: ~2-3 minutes
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const OUT_FILE = path.join(__dirname, '..', 'public', 'country-data.json');
const DELAY_MS = 1200;

// ── Governance indicators (WGI) ───────────────────────────────────────────────
// Range: -2.5 to +2.5  (we store raw value; UI normalises to 0-100% bar fill)
const WGI_INDICATORS = [
  { id: 'RL.EST',  key: 'wgi_rule_of_law',          label: 'Rule of Law'                      },
  { id: 'CC.EST',  key: 'wgi_corruption',            label: 'Control of Corruption'            },
  { id: 'GE.EST',  key: 'wgi_govt_effectiveness',    label: 'Government Effectiveness'         },
  { id: 'VA.EST',  key: 'wgi_voice_accountability',  label: 'Voice & Accountability'           },
  { id: 'PV.EST',  key: 'wgi_political_stability',   label: 'Political Stability'              },
  { id: 'RQ.EST',  key: 'wgi_regulatory_quality',    label: 'Regulatory Quality'               },
];

// ── Sustainability / environment indicators ───────────────────────────────────
const SUSTAINABILITY_INDICATORS = [
  { id: 'EN.ATM.CO2E.PC',    key: 'co2_per_capita',       label: 'CO₂ emissions per capita (metric tons)', mrv: 10 },
  { id: 'EG.FEC.RNEW.ZS',    key: 'renewable_energy_pct', label: 'Renewable energy (% of total final energy)' },
  { id: 'SH.XPD.CHEX.GD.ZS', key: 'health_spend_gdp',     label: 'Current health expenditure (% of GDP)' },
  { id: 'SE.XPD.TOTL.GD.ZS', key: 'education_spend_gdp',  label: 'Government education expenditure (% of GDP)' },
];

// ── Keys to clear on re-run ───────────────────────────────────────────────────
const GOVERNED_KEYS = [
  ...WGI_INDICATORS.map(i => i.key),
  ...SUSTAINABILITY_INDICATORS.map(i => i.key),
].flatMap(k => [k, k + '_year']);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function wbFetch(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'WorldDataMap-WGIFetcher/1.0 (educational; nodejs)' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchValidIso2() {
  process.stdout.write('Fetching country list … ');
  const json = await wbFetch('https://api.worldbank.org/v2/country?format=json&per_page=400');
  const valid = new Set(
    (json[1] ?? [])
      .filter(c => c.region?.id && c.iso2Code)
      .map(c => c.iso2Code.toUpperCase())
  );
  console.log(`${valid.size} countries`);
  return valid;
}

async function fetchIndicator(indicator, validIso2, out) {
  process.stdout.write(`  ${indicator.id.padEnd(22)} ${indicator.label} … `);
  // mrv=5 → most recent value within last 5 years (WGI updated annually)
  const mrv = indicator.mrv || 5;
  const BASE = `https://api.worldbank.org/v2/country/all/indicator/${indicator.id}` +
               `?format=json&mrv=${mrv}&per_page=1000`;
  const best = {};
  let page = 1, totalPages = 1;
  try {
    do {
      const url  = BASE + (page > 1 ? `&page=${page}` : '');
      const json = await wbFetch(url);
      totalPages = json[0]?.pages ?? 1;
      for (const row of json[1] ?? []) {
        const iso2 = row.country?.id?.toUpperCase();
        if (!iso2 || !validIso2.has(iso2) || row.value == null) continue;
        if (!best[iso2] || row.date > best[iso2].date) {
          best[iso2] = { value: row.value, date: row.date };
        }
      }
      page++;
      if (page <= totalPages) await sleep(400);
    } while (page <= totalPages);
  } catch (e) {
    console.log(`ERROR: ${e.message} — skipping`);
    return 0;
  }

  let filled = 0;
  for (const [iso2, { value, date }] of Object.entries(best)) {
    if (!out[iso2]) out[iso2] = {};
    out[iso2][indicator.key]           = parseFloat(Number(value).toFixed(3));
    out[iso2][indicator.key + '_year'] = date;
    filled++;
  }
  console.log(`${filled} countries`);
  return filled;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  World Bank: Governance (WGI) + Sustainability fetcher   ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const out      = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
  const validIso2 = await fetchValidIso2();
  await sleep(DELAY_MS);

  // Clear stale keys so re-runs don't leave ghost data
  for (const cd of Object.values(out)) {
    for (const k of GOVERNED_KEYS) delete cd[k];
  }

  console.log('\n── Governance Indicators (WGI, -2.5 to +2.5) ───────────────');
  for (const ind of WGI_INDICATORS) {
    await fetchIndicator(ind, validIso2, out);
    await sleep(DELAY_MS);
  }

  console.log('\n── Sustainability Indicators ────────────────────────────────');
  for (const ind of SUSTAINABILITY_INDICATORS) {
    await fetchIndicator(ind, validIso2, out);
    await sleep(DELAY_MS);
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), 'utf8');
  console.log(`\n✓ Written to ${OUT_FILE}`);
}

main().catch(e => { console.error(e); process.exit(1); });
