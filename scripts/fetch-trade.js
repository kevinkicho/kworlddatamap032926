#!/usr/bin/env node
/**
 * scripts/fetch-trade.js
 *
 * Fetches trade/investment indicators from World Bank and merges into
 * public/country-data.json.
 *
 * Fields added:
 *   trade_pct_gdp      — Trade (exports + imports) as % of GDP
 *   current_account_gdp — Current account balance as % of GDP
 *   fdi_inflow_gdp     — FDI net inflows as % of GDP
 *   exports_pct_gdp    — Exports of goods & services as % of GDP
 *   imports_pct_gdp    — Imports of goods & services as % of GDP
 *   trade_year         — Year of latest trade data
 *
 * Source: World Bank Open Data (all free, no key required)
 * Coverage: ~180 countries per indicator
 *
 * Usage: node scripts/fetch-trade.js
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const CD_PATH = path.join(__dirname, '..', 'public', 'country-data.json');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function apiFetch(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'WorldDataMap/1.0 (educational)' },
    signal: AbortSignal.timeout(40_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

async function fetchWB(indicatorId, label) {
  process.stdout.write(`  ${indicatorId.padEnd(26)} ${label} … `);
  const BASE = `https://api.worldbank.org/v2/country/all/indicator/${indicatorId}` +
               `?format=json&mrv=8&per_page=1000`;
  const best = {};
  let page = 1, totalPages = 1;
  try {
    do {
      const json = await apiFetch(BASE + (page > 1 ? `&page=${page}` : ''));
      totalPages = json[0]?.pages ?? 1;
      for (const row of json[1] ?? []) {
        const iso2 = row.country?.id?.toUpperCase();
        if (!iso2 || iso2.length !== 2 || row.value == null) continue;
        const yr = parseInt(row.date, 10);
        if (!best[iso2] || yr > best[iso2].year) {
          best[iso2] = { value: row.value, year: yr };
        }
      }
      page++;
      if (page <= totalPages) await sleep(400);
    } while (page <= totalPages);
  } catch (e) {
    console.log(`ERROR: ${e.message}`);
    return {};
  }
  console.log(`${Object.keys(best).length} countries`);
  return best;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  Trade & Investment indicator fetcher (World Bank)                ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  const cd = JSON.parse(fs.readFileSync(CD_PATH, 'utf8'));
  console.log(`Loaded country-data.json: ${Object.keys(cd).length} entries\n`);

  // Clear old trade fields
  for (const iso in cd) {
    if (!cd[iso]) continue;
    delete cd[iso].trade_pct_gdp; delete cd[iso].current_account_gdp;
    delete cd[iso].fdi_inflow_gdp; delete cd[iso].exports_pct_gdp;
    delete cd[iso].imports_pct_gdp; delete cd[iso].trade_year;
  }

  console.log('── Fetching indicators ─────────────────────────────────────────────');
  const tradeData   = await fetchWB('NE.TRD.GNFS.ZS', 'Trade % of GDP');        await sleep(800);
  const currentAcct = await fetchWB('BN.CAB.XOKA.GD.ZS', 'Current account % GDP'); await sleep(800);
  const fdiData     = await fetchWB('BX.KLT.DINV.WD.GD.ZS', 'FDI inflows % GDP'); await sleep(800);
  const exportsData = await fetchWB('NE.EXP.GNFS.ZS', 'Exports % GDP');         await sleep(800);
  const importsData = await fetchWB('NE.IMP.GNFS.ZS', 'Imports % GDP');

  console.log('\n── Merging ──────────────────────────────────────────────────────────');
  let count = 0;
  const allIso = new Set([
    ...Object.keys(tradeData), ...Object.keys(currentAcct), ...Object.keys(fdiData),
    ...Object.keys(exportsData), ...Object.keys(importsData),
  ]);

  for (const iso of allIso) {
    if (!cd[iso]) continue;
    let hasAny = false;
    let latestYear = 0;

    if (tradeData[iso]) {
      cd[iso].trade_pct_gdp = +tradeData[iso].value.toFixed(1);
      latestYear = Math.max(latestYear, tradeData[iso].year);
      hasAny = true;
    }
    if (currentAcct[iso]) {
      cd[iso].current_account_gdp = +currentAcct[iso].value.toFixed(1);
      latestYear = Math.max(latestYear, currentAcct[iso].year);
      hasAny = true;
    }
    if (fdiData[iso]) {
      cd[iso].fdi_inflow_gdp = +fdiData[iso].value.toFixed(1);
      latestYear = Math.max(latestYear, fdiData[iso].year);
      hasAny = true;
    }
    if (exportsData[iso]) {
      cd[iso].exports_pct_gdp = +exportsData[iso].value.toFixed(1);
      latestYear = Math.max(latestYear, exportsData[iso].year);
      hasAny = true;
    }
    if (importsData[iso]) {
      cd[iso].imports_pct_gdp = +importsData[iso].value.toFixed(1);
      latestYear = Math.max(latestYear, importsData[iso].year);
      hasAny = true;
    }
    if (hasAny) {
      cd[iso].trade_year = latestYear;
      count++;
    }
  }

  console.log(`  Enriched ${count} countries with trade data`);
  fs.writeFileSync(CD_PATH, JSON.stringify(cd, null, 2));
  console.log(`✓ Written to ${CD_PATH}`);

  console.log('\n── Spot-check ──────────────────────────────────────────────────────');
  for (const iso of ['US', 'DE', 'CN', 'SG', 'BR']) {
    const c = cd[iso];
    if (!c) continue;
    console.log(`  ${iso}: trade=${c.trade_pct_gdp ?? 'n/a'}%GDP  CA=${c.current_account_gdp ?? 'n/a'}%  FDI=${c.fdi_inflow_gdp ?? 'n/a'}%  exp=${c.exports_pct_gdp ?? 'n/a'}%  imp=${c.imports_pct_gdp ?? 'n/a'}%`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
