#!/usr/bin/env node
/**
 * scripts/fetch-country-data.js
 *
 * Fetches country-level development indicators from the World Bank Open Data API
 * (free, no API key required) and writes them to public/country-data.json.
 *
 * The output is a plain object keyed by ISO 3166-1 alpha-2 code (e.g. "JP", "US")
 * so that cities-full.json can be enriched at runtime via city.iso.
 *
 * Usage:
 *   npm run fetch-country
 *
 * Updates the file in place — safe to re-run anytime to refresh values.
 * Typical runtime: ~30–60 seconds.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const OUT_FILE = path.join(__dirname, '..', 'public', 'country-data.json');
const DELAY_MS = 1500;   // polite pause between World Bank requests

// ── Indicators to fetch ───────────────────────────────────────────────────────
// Each entry: { id: World Bank indicator code, key: field name in output JSON }
// We pick the most meaningful for a city-explorer context.
const INDICATORS = [
  { id: 'NY.GDP.PCAP.CD',    key: 'gdp_per_capita',  label: 'GDP per capita (current USD)' },
  { id: 'SP.DYN.LE00.IN',    key: 'life_expectancy', label: 'Life expectancy at birth (years)' },
  { id: 'SP.URB.TOTL.IN.ZS', key: 'urban_pct',       label: 'Urban population (% of total)' },
  { id: 'SI.POV.GINI',       key: 'gini',            label: 'Gini index (income inequality, 0–100)' },
  { id: 'IT.NET.USER.ZS',    key: 'internet_pct',    label: 'Internet users (% of population)' },
  { id: 'SH.DYN.MORT',       key: 'child_mortality', label: 'Under-5 mortality rate (per 1,000 live births)' },
  { id: 'EG.ELC.ACCS.ZS',    key: 'electricity_pct', label: 'Access to electricity (% of population)' },
  { id: 'SE.ADT.LITR.ZS',    key: 'literacy_rate',   label: 'Adult literacy rate, 15+ (%)' },
  // ── New indicators (Sub-project 5) ──
  { id: 'MS.MIL.XPND.GD.ZS', key: 'military_spend_gdp', label: 'Military expenditure (% of GDP)' },
  { id: 'SM.POP.NETM',        key: 'net_migration',       label: 'Net migration (5-year estimate)' },
  { id: 'IP.JRN.ARTC.SC',     key: 'research_articles',   label: 'Scientific & technical journal articles' },
  { id: 'AG.LND.FRST.ZS',     key: 'forest_pct',          label: 'Forest area (% of land area)' },
  { id: 'SH.H2O.SMDW.ZS',    key: 'safe_water_pct',      label: 'People using safely managed drinking water (%)' },
  { id: 'SP.POP.GROW',        key: 'pop_growth',           label: 'Population growth (annual %)' },
  { id: 'SL.TLF.CACT.FE.ZS', key: 'female_labor_pct',    label: 'Female labor force participation rate (%)' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function wbFetch(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'WorldDataMap-CountryFetcher/1.0 (educational; nodejs)' },
    signal:  AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Step 1: build the set of valid country ISO-2 codes ───────────────────────
// The World Bank /country endpoint returns both real countries and regional
// aggregates. Real countries have a non-empty region.id.
async function fetchValidIso2Codes() {
  process.stdout.write('Fetching country list … ');
  const url = 'https://api.worldbank.org/v2/country?format=json&per_page=400';
  const json = await wbFetch(url);
  // json[0] = pagination metadata, json[1] = array of country objects
  const countries = json[1] ?? [];
  const valid = new Set(
    countries
      .filter(c => c.region?.id && c.region.id !== '' && c.iso2Code)
      .map(c => c.iso2Code.toUpperCase())
  );
  console.log(`${valid.size} real countries identified`);
  return valid;
}

// ── Step 2: fetch one indicator for all countries ────────────────────────────
async function fetchIndicator(indicator, validIso2, out) {
  process.stdout.write(`  ${indicator.id.padEnd(22)} (${indicator.label}) … `);

  // mrv=10 → most recent value within last 10 years (CO₂ data lags ~4-5 years behind)
  // per_page=1000 + pagination → guarantees we collect all countries even with 10 rows each
  const BASE = `https://api.worldbank.org/v2/country/all/indicator/${indicator.id}` +
               `?format=json&mrv=10&per_page=1000`;

  // Track the best (most recent) value per country across pages/years
  const best = {};   // iso2 → { value, date }
  const all  = {};   // iso2 → [{ value, date }]  (all years)

  let page = 1, totalPages = 1;
  try {
    do {
      const url  = BASE + (page > 1 ? `&page=${page}` : '');
      const json = await wbFetch(url);
      const meta = json[0] ?? {};
      totalPages = meta.pages ?? 1;
      const rows = json[1] ?? [];

      for (const row of rows) {
        const iso2 = row.country?.id?.toUpperCase();
        if (!iso2 || !validIso2.has(iso2)) continue;
        if (row.value == null) continue;
        // Keep the most recent (largest date) non-null value
        if (!best[iso2] || row.date > best[iso2].date) {
          best[iso2] = { value: row.value, date: row.date };
        }
        // Accumulate all years for history arrays
        if (!all[iso2]) all[iso2] = [];
        all[iso2].push({ value: row.value, date: row.date });
      }

      page++;
      if (page <= totalPages) await sleep(500);   // polite pause between pages
    } while (page <= totalPages);
  } catch (e) {
    console.log(`ERROR: ${e.message} — skipping`);
    return 0;
  }

  let filled = 0;
  for (const [iso2, { value, date }] of Object.entries(best)) {
    if (!out[iso2]) out[iso2] = {};
    out[iso2][indicator.key]            = parseFloat(value.toFixed(2));
    out[iso2][indicator.key + '_year']  = date;
    filled++;
  }

  if (['gdp_per_capita','life_expectancy','military_spend_gdp','pop_growth','forest_pct'].includes(indicator.key)) {
    for (const [iso2, entries] of Object.entries(all)) {
      if (!out[iso2]) out[iso2] = {};
      out[iso2][indicator.key + '_history'] = entries
        .filter(e => e.value != null && isFinite(Number(e.value)))
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        .map(e => [parseInt(String(e.date)), parseFloat(Number(e.value).toFixed(2))]);
    }
  }

  console.log(`${filled} countries`);
  return filled;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║   World Bank Country Data Fetcher                     ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log(`Indicators : ${INDICATORS.length}`);
  console.log(`Output     : ${OUT_FILE}\n`);

  const validIso2 = await fetchValidIso2Codes();
  await sleep(DELAY_MS);

  // Initialize output with country names from our valid set
  // We will backfill names from the first successful indicator response
  const out = {};

  // Fetch country names in one pass
  process.stdout.write('Fetching country names … ');
  try {
    const nameUrl  = 'https://api.worldbank.org/v2/country?format=json&per_page=400';
    const nameJson = await wbFetch(nameUrl);
    let named = 0;
    for (const c of nameJson[1] ?? []) {
      const iso2 = c.iso2Code?.toUpperCase();
      if (!iso2 || !validIso2.has(iso2)) continue;
      if (!out[iso2]) out[iso2] = {};
      out[iso2].name         = c.name;
      out[iso2].region       = c.region?.value ?? null;
      out[iso2].income_level = c.incomeLevel?.value ?? null;
      named++;
    }
    console.log(`${named} countries named`);
  } catch (e) {
    console.log(`WARNING: could not fetch country names — ${e.message}`);
  }
  await sleep(DELAY_MS);

  console.log('\nFetching indicators:\n');
  for (const indicator of INDICATORS) {
    await fetchIndicator(indicator, validIso2, out);
    await sleep(DELAY_MS);
  }

  // ── Write output ──
  const countries = Object.keys(out).sort();
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), 'utf8');

  const sizeKB = (fs.statSync(OUT_FILE).size / 1024).toFixed(1);

  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║   Complete                                            ║');
  console.log('╠═══════════════════════════════════════════════════════╣');
  console.log(`  Countries saved : ${countries.length}`);
  console.log(`  File size       : ${sizeKB} KB`);
  console.log('  ── coverage ──────────────────────────────────────────');
  for (const ind of INDICATORS) {
    const n   = countries.filter(iso => out[iso][ind.key] != null).length;
    const pct = ((n / countries.length) * 100).toFixed(0);
    console.log(`  ${ind.key.padEnd(18)} : ${String(n).padStart(4)} countries  (${pct}%)`);
  }
  console.log('╚═══════════════════════════════════════════════════════╝');
}

main().catch(err => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
