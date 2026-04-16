#!/usr/bin/env node
/**
 * scripts/fetch-ecb.js
 *
 * Fetches ECB policy rates and Euribor from the ECB Statistical Data Warehouse.
 * No API key required — ECB Data Portal is public.
 *
 * Series fetched:
 *   FM/B.U2.EUR.4F.KR.DFR.LEV        — ECB Deposit Facility Rate (DFR)
 *   FM/B.U2.EUR.4F.KR.MRR_FR.LEV     — ECB Main Refinancing Rate (MRR)
 *   FM/M.U2.EUR.RT.MM.EURIBOR3MD_.HSTA — Euribor 3-month (monthly avg)
 *
 * Source: https://data-api.ecb.europa.eu/service/data/
 * Format: SDMX-JSON (jsondata)
 *
 * Output: public/ecb-data.json
 *   Single top-level object with aggregate Eurozone rates +
 *   optional per-country TARGET2 balances / government bond spreads
 *
 * Usage:
 *   node scripts/fetch-ecb.js
 */

'use strict';

const fs   = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');

const OUT_FILE   = path.join(__dirname, '..', 'public', 'ecb-data.json');
const START_DATE = '2020-01';
const BASE_URL   = 'https://data-api.ecb.europa.eu/service/data';

// 20 Eurozone member states (ISO-2)
const EUROZONE_COUNTRIES = [
  'AT','BE','CY','EE','FI','FR','DE','GR','IE','IT',
  'LV','LT','LU','MT','NL','PT','SK','SI','ES','HR',
];

// Series definitions: { flow, key, label }
const POLICY_SERIES = [
  {
    flow:  'FM',
    key:   'B.U2.EUR.4F.KR.DFR.LEV',
    label: 'ECB Deposit Facility Rate',
    outKey: 'ecb_deposit_rate',
  },
  {
    flow:  'FM',
    key:   'B.U2.EUR.4F.KR.MRR_FR.LEV',
    label: 'ECB Main Refinancing Rate',
    outKey: 'ecb_mro_rate',
  },
  {
    flow:  'FM',
    key:   'M.U2.EUR.RT.MM.EURIBOR3MD_.HSTA',
    label: 'Euribor 3-month',
    outKey: 'euribor_3m',
  },
];

// TARGET2 balances per country — ILM.M.{ISO3_UPPER}.N.C1.T00.Z5.Z01.EUR._T._X.N
// (Intra-Eurosystem claims/liabilities)
// We map ISO-2 → ECB 3-letter codes used in ILM flow
const TARGET2_MAP = {
  AT: 'AT', BE: 'BE', CY: 'CY', EE: 'EE', FI: 'FI',
  FR: 'FR', DE: 'DE', GR: 'GR', IE: 'IE', IT: 'IT',
  LV: 'LV', LT: 'LT', LU: 'LU', MT: 'MT', NL: 'NL',
  PT: 'PT', SK: 'SK', SI: 'SI', ES: 'ES', HR: 'HR',
};

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
    const dateValues = timeDim ? timeDim.values : json.structure.dimensions.observation[0].values;

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
 * Fetch a single ECB series and return full history since START_DATE.
 */
async function fetchEcbSeries(flow, key) {
  const url = `${BASE_URL}/${flow}/${key}?format=jsondata&startPeriod=${START_DATE}&detail=dataonly`;
  const json = await ecbFetch(url);
  return parseEcbSdmx(json);
}

/**
 * Try to fetch TARGET2 balance for a single Eurozone country.
 * Flow: ILM, key: M.{CC}.N.A090100.U2.EUR
 * A090100 = "Claims on Eurosystem" — this is the TARGET2 balance.
 * Values are reported in billions EUR directly.
 * Returns { value_bn_eur, date } or null on failure.
 */
async function fetchTarget2(iso2) {
  const cc = TARGET2_MAP[iso2];
  const key = `M.${cc}.N.A090100.U2.EUR`;
  const url = `${BASE_URL}/ILM/${key}?format=jsondata&startPeriod=2023-01&detail=dataonly`;
  try {
    const json = await ecbFetch(url);
    const pairs = parseEcbSdmx(json);
    if (!pairs.length) return null;
    // Find most recent non-null observation
    let latest = null;
    for (let i = pairs.length - 1; i >= 0; i--) {
      if (pairs[i][1] !== null && pairs[i][1] !== undefined) {
        latest = pairs[i];
        break;
      }
    }
    if (!latest) return null;
    const [date, rawVal] = latest;
    // ECB reports in billions EUR already
    const valBn = parseFloat(rawVal.toFixed(1));
    return { value_bn_eur: valBn, date };
  } catch {
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║   ECB Statistical Data Warehouse Fetcher              ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log(`Output  : ${OUT_FILE}\n`);

  const out = {
    eurozone: true,
    eurozone_countries: EUROZONE_COUNTRIES,
  };

  // ── Step 1: Fetch aggregate policy rates ─────────────────────────────────
  console.log('── Policy rates & Euribor ──');
  for (const { flow, key, label, outKey } of POLICY_SERIES) {
    process.stdout.write(`  ${label.padEnd(36)} … `);
    try {
      const history = await fetchEcbSeries(flow, key);
      if (!history.length) {
        console.log('no data');
        continue;
      }
      const [latestDate, latestVal] = history[history.length - 1];

      out[outKey]           = latestVal;
      out[`${outKey}_date`] = latestDate;

      // Store full history only for Euribor (most useful for charting)
      if (outKey === 'euribor_3m') {
        out.euribor_3m_history = history;
      }

      console.log(`${latestVal.toFixed(2)}%  (${latestDate}, ${history.length} obs)`);
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
    }
    await sleep(400);
  }

  // ── Step 2: Try TARGET2 balances per country ──────────────────────────────
  console.log('\n── TARGET2 balances (per country, best-effort) ──');
  const countriesSection = {};
  let target2Fetched = 0;

  for (const iso2 of EUROZONE_COUNTRIES) {
    process.stdout.write(`  ${iso2} … `);
    const result = await fetchTarget2(iso2);
    if (result) {
      countriesSection[iso2] = { target2_balance_bn_eur: result.value_bn_eur, target2_date: result.date };
      console.log(`${result.value_bn_eur > 0 ? '+' : ''}${result.value_bn_eur} Bn EUR  (${result.date})`);
      target2Fetched++;
    } else {
      console.log('no data / series not found');
    }
    await sleep(300);
  }

  if (Object.keys(countriesSection).length > 0) {
    out.countries = countriesSection;
  }

  // ── Write output ──────────────────────────────────────────────────────────
  atomicWrite(OUT_FILE, JSON.stringify(out, null, 2), 'utf8');
  const sizeKB = (fs.statSync(OUT_FILE).size / 1024).toFixed(1);

  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║   Complete                                            ║');
  console.log('╠═══════════════════════════════════════════════════════╣');
  console.log(`  Policy rates : ${POLICY_SERIES.length} series fetched`);
  console.log(`  TARGET2      : ${target2Fetched} / ${EUROZONE_COUNTRIES.length} countries`);
  console.log(`  File         : ${sizeKB} KB → ${OUT_FILE}`);
  console.log('╚═══════════════════════════════════════════════════════╝');
}

main().catch(err => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
