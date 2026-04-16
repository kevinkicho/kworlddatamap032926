#!/usr/bin/env node
/**
 * scripts/fetch-ecb-bonds.js
 *
 * Fetches 10-year government bond yields (Maastricht convergence criterion)
 * for all 20 Eurozone member states from the ECB Statistical Data Warehouse.
 * No API key required — ECB Data Portal is public.
 *
 * Series: IRS/M.{CC}.L.L40.CI.0000.EUR.N.Z
 *   FREQ         = M  (monthly)
 *   REF_AREA     = {CC} (ISO-2 country code)
 *   IR_TYPE      = L  (long-term interest rate for convergence purposes)
 *   TR_TYPE      = L40 (debt security issued)
 *   MATURITY_CAT = CI (10 years)
 *   BS_COUNT_SECTOR = 0000 (unspecified)
 *   CURRENCY_TRANS  = EUR
 *   IR_BUS_COV      = N  (new business)
 *   IR_FV_TYPE      = Z  (unspecified)
 *
 * Source: https://data-api.ecb.europa.eu/service/data/
 * Format: SDMX-JSON (jsondata)
 *
 * Output: public/ecb-bonds.json
 *   Per-country latest 10Y yield, date, spread vs DE (bps), and 48-month history.
 *
 * Usage:
 *   node scripts/fetch-ecb-bonds.js
 */

'use strict';

const fs   = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');

const OUT_FILE    = path.join(__dirname, '..', 'public', 'ecb-bonds.json');
const START_DATE  = '2021-01';   // 4+ years of monthly data
const HISTORY_MAX = 48;          // keep last 48 months
const BASE_URL    = 'https://data-api.ecb.europa.eu/service/data';
const DELAY_MS    = 400;

// 20 Eurozone member states (ISO-2)
const EUROZONE_COUNTRIES = [
  'AT', 'BE', 'CY', 'EE', 'FI', 'FR', 'DE', 'GR', 'IE', 'IT',
  'LV', 'LT', 'LU', 'MT', 'NL', 'PT', 'SK', 'SI', 'ES', 'HR',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function ecbFetch(url) {
  const res = await fetch(url, {
    headers: {
      'Accept':     'application/json',
      'User-Agent': 'WorldDataMap/1.0 (educational; nodejs)',
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} — ${body.slice(0, 120)}`);
  }
  return res.json();
}

/**
 * Parse ECB SDMX-JSON (jsondata format).
 * Returns array of [dateStr, value] pairs sorted ascending, null values skipped.
 */
function parseEcbSdmx(json) {
  try {
    const dataset = json.dataSets[0];
    // The first (and only) series key varies; grab it
    const seriesKey = Object.keys(dataset.series)[0];
    const observations = dataset.series[seriesKey].observations;

    // Date labels live in structure.dimensions.observation[0].values
    const timeDim = json.structure.dimensions.observation.find(
      d => d.id === 'TIME_PERIOD' || d.keyPosition !== undefined
    );
    const dateValues = timeDim
      ? timeDim.values
      : json.structure.dimensions.observation[0].values;

    const pairs = [];
    for (const [idx, obs] of Object.entries(observations)) {
      const val = obs[0];
      if (val === null || val === undefined) continue;
      const dateLabel = dateValues[parseInt(idx, 10)].id;
      pairs.push([dateLabel, parseFloat(parseFloat(val).toFixed(4))]);
    }
    // Sort chronologically
    pairs.sort((a, b) => a[0].localeCompare(b[0]));
    return pairs;
  } catch (e) {
    throw new Error(`SDMX parse error: ${e.message}`);
  }
}

/**
 * Fetch the IRS 10Y bond yield series for a single Eurozone country.
 * Returns full history since START_DATE, or null on 404 / no data.
 */
async function fetchBondYield(iso2) {
  const key = `M.${iso2}.L.L40.CI.0000.EUR.N.Z`;
  const url  = `${BASE_URL}/IRS/${key}?format=jsondata&startPeriod=${START_DATE}&detail=dataonly`;
  try {
    const json = await ecbFetch(url);
    const pairs = parseEcbSdmx(json);
    return pairs.length ? pairs : null;
  } catch (e) {
    // 404 = series not available for this country
    if (e.message.startsWith('HTTP 404')) return null;
    throw e;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║   ECB 10-Year Government Bond Yield Fetcher           ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log(`Series  : IRS/M.{CC}.L.L40.CI.0000.EUR.N.Z`);
  console.log(`Output  : ${OUT_FILE}\n`);

  // ── Step 1: Fetch all 20 countries ───────────────────────────────────────
  const raw = {};   // iso2 → full history pairs
  let fetched = 0;
  let skipped = 0;

  for (const iso2 of EUROZONE_COUNTRIES) {
    process.stdout.write(`  ${iso2} … `);
    try {
      const pairs = await fetchBondYield(iso2);
      if (!pairs) {
        console.log('no data / series not found');
        skipped++;
      } else {
        const [latestDate, latestVal] = pairs[pairs.length - 1];
        console.log(`${latestVal.toFixed(3)}%  (${latestDate}, ${pairs.length} obs)`);
        raw[iso2] = pairs;
        fetched++;
      }
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
      skipped++;
    }
    await sleep(DELAY_MS);
  }

  // ── Step 2: Compute spreads vs Germany and assemble output ────────────────
  const deLatest = raw['DE'] ? raw['DE'][raw['DE'].length - 1][1] : null;

  const out = {};
  for (const iso2 of EUROZONE_COUNTRIES) {
    const pairs = raw[iso2];
    if (!pairs) continue;

    const [latestDate, latestVal] = pairs[pairs.length - 1];

    // Keep last HISTORY_MAX months
    const history = pairs.slice(-HISTORY_MAX);

    const entry = {
      bond_yield_10y:      parseFloat(latestVal.toFixed(3)),
      bond_yield_10y_date: latestDate,
      bond_yield_10y_history: history,
    };

    // Spread vs DE in basis points (skip for DE itself)
    if (iso2 !== 'DE' && deLatest !== null) {
      entry.spread_vs_de_bps = Math.round((latestVal - deLatest) * 100);
    }

    out[iso2] = entry;
  }

  // ── Write output ──────────────────────────────────────────────────────────
  atomicWrite(OUT_FILE, JSON.stringify(out, null, 2), 'utf8');
  const sizeKB = (fs.statSync(OUT_FILE).size / 1024).toFixed(1);

  console.log('\n── Spot-check ──');
  for (const iso2 of ['DE', 'IT', 'GR', 'ES', 'PT']) {
    if (out[iso2]) {
      const e = out[iso2];
      const spread = e.spread_vs_de_bps !== undefined ? `  spread +${e.spread_vs_de_bps} bps` : '';
      console.log(`  ${iso2}  ${e.bond_yield_10y.toFixed(3)}%  (${e.bond_yield_10y_date})${spread}`);
    }
  }

  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║   Complete                                            ║');
  console.log('╠═══════════════════════════════════════════════════════╣');
  console.log(`  Countries populated : ${fetched} / ${EUROZONE_COUNTRIES.length}`);
  console.log(`  Skipped (no data)   : ${skipped}`);
  console.log(`  File                : ${sizeKB} KB → ${OUT_FILE}`);
  console.log('╚═══════════════════════════════════════════════════════╝');
}

main().catch(err => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
