#!/usr/bin/env node
/**
 * fetch-oecd-history.js
 * Adds annual history arrays to public/oecd-country.json using the World Bank API.
 *
 * Fields fetched:
 *   rd_spend_pct    -> rd_spend_history    (GB.XPD.RSDV.GD.ZS)
 *   tertiary_pct    -> tertiary_history    (SE.TER.ENRR)
 *   tax_revenue_pct -> tax_revenue_history (GC.TAX.TOTL.GD.ZS)
 *
 * hours_worked is skipped — no WB equivalent.
 *
 * Usage: node scripts/fetch-oecd-history.js
 */

'use strict';

const { readFileSync, writeFileSync } = require('fs');
const path = require('path');

const OUT_PATH = path.join(__dirname, '../public/oecd-country.json');

// Map: oecd field -> { history field, WB indicator code }
const INDICATORS = [
  { field: 'rd_spend_pct',    historyField: 'rd_spend_history',    wbCode: 'GB.XPD.RSDV.GD.ZS' },
  { field: 'tertiary_pct',    historyField: 'tertiary_history',    wbCode: 'SE.TER.ENRR' },
  { field: 'tax_revenue_pct', historyField: 'tax_revenue_history', wbCode: 'GC.TAX.TOTL.GD.ZS' },
];

const WB_BASE      = 'https://api.worldbank.org/v2/country';
const BATCH_SIZE   = 10;
const BATCH_DELAY_MS = 600;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWBHistory(iso2, wbCode) {
  const url = `${WB_BASE}/${iso2}/indicator/${wbCode}?format=json&per_page=60&mrv=60`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${iso2}/${wbCode}`);

  const json = await res.json();
  // WB returns [metadata, data[]] — data is newest-first
  const rows = json?.[1];
  if (!Array.isArray(rows)) return null;

  const history = rows
    .filter(r => r.value !== null && r.value !== undefined)
    .map(r => [parseInt(r.date, 10), parseFloat(r.value)])
    .filter(([yr, val]) => !isNaN(yr) && !isNaN(val))
    .sort((a, b) => a[0] - b[0]);  // ascending year

  return history.length > 0 ? history : null;
}

async function main() {
  console.log('Reading existing oecd-country.json …');
  const data = JSON.parse(readFileSync(OUT_PATH, 'utf8'));

  for (const { field, historyField, wbCode } of INDICATORS) {
    const countries = Object.keys(data).filter(k => data[k][field] != null);
    console.log(`\n=== ${historyField} (${wbCode}) — ${countries.length} countries ===`);

    let fetched = 0, skipped = 0, errors = 0;

    for (let i = 0; i < countries.length; i += BATCH_SIZE) {
      const batch      = countries.slice(i, i + BATCH_SIZE);
      const batchNum   = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(countries.length / BATCH_SIZE);
      process.stdout.write(`  Batch ${batchNum}/${totalBatches}: [${batch.join(', ')}] … `);

      const results = await Promise.allSettled(
        batch.map(async iso2 => {
          const history = await fetchWBHistory(iso2, wbCode);
          return { iso2, history };
        })
      );

      let batchOk = 0, batchSkip = 0, batchErr = 0;
      for (const r of results) {
        if (r.status === 'fulfilled') {
          const { iso2, history } = r.value;
          if (history) {
            data[iso2][historyField] = history;
            batchOk++;
          } else {
            batchSkip++;
          }
        } else {
          batchErr++;
          console.error(`\n    ERROR: ${r.reason?.message}`);
        }
      }
      console.log(`OK:${batchOk} skip:${batchSkip} err:${batchErr}`);
      fetched += batchOk; skipped += batchSkip; errors += batchErr;

      // Delay between batches to respect rate limits
      if (i + BATCH_SIZE < countries.length) {
        await sleep(BATCH_DELAY_MS);
      }
    }

    console.log(`  Summary: ${fetched} histories added, ${skipped} no data, ${errors} errors`);

    // Quick spot-check for a known country (US)
    if (data['US']?.[historyField]) {
      const usH = data['US'][historyField];
      console.log(`  US spot-check: ${usH.length} years, first=${JSON.stringify(usH[0])}, last=${JSON.stringify(usH[usH.length-1])}`);
    }
  }

  console.log('\nWriting updated oecd-country.json …');
  writeFileSync(OUT_PATH, JSON.stringify(data, null, 2));
  console.log('Done.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
