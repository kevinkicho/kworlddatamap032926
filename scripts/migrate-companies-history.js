// scripts/migrate-companies-history.js
// One-time: convert company history arrays from [{year,value,currency}] to [[year,value]].
// Currency (if present and constant) is verified to already be at the top level;
// if missing, it is set from the history entries.
// Run: node scripts/migrate-companies-history.js
'use strict';
const fs   = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');

const FILE = path.join(__dirname, '..', 'public', 'companies.json');
const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));

const HIST_KEYS = [
  ['revenue_history',          'revenue_currency'],
  ['net_income_history',       'net_income_currency'],
  ['operating_income_history', 'operating_income_currency'],
  ['total_assets_history',     'total_assets_currency'],
  ['total_equity_history',     'total_equity_currency'],
  ['employees_history',        null],  // no currency on employees
];

let converted = 0;

for (const [cityQid, companies] of Object.entries(data)) {
  for (const co of companies) {
    for (const [histKey, currKey] of HIST_KEYS) {
      const hist = co[histKey];
      if (!Array.isArray(hist) || !hist.length) continue;
      // Detect if already tuples (first element is an array)
      if (Array.isArray(hist[0])) continue;
      // Extract currency from first history entry if top-level field is missing
      if (currKey && !co[currKey] && hist[0].currency) {
        co[currKey] = hist[0].currency;
      }
      // Convert to tuples
      co[histKey] = hist.map(h => [h.year, h.value]);
      converted++;
    }
  }
}

atomicWrite(FILE, JSON.stringify(data, null, 2), 'utf8');
console.log(`Converted ${converted} history arrays to [[year, value]] tuples`);
