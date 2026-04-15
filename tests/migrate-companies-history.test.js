// tests/migrate-companies-history.test.js
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'public', 'companies.json'), 'utf8'));

// Flatten all companies from all city keys
const allCompanies = Object.values(data).flat();

const HIST_KEYS = [
  'revenue_history', 'net_income_history', 'operating_income_history',
  'total_assets_history', 'total_equity_history', 'employees_history',
];

describe('companies history normalization', () => {
  it('no history array uses object format', () => {
    for (const co of allCompanies) {
      for (const k of HIST_KEYS) {
        const hist = co[k];
        if (!Array.isArray(hist) || !hist.length) continue;
        assert.ok(
          Array.isArray(hist[0]),
          `${co.name}.${k}[0] is not a tuple: ${JSON.stringify(hist[0])}`
        );
      }
    }
  });
  it('all tuple entries have exactly 2 elements', () => {
    for (const co of allCompanies) {
      for (const k of HIST_KEYS) {
        const hist = co[k];
        if (!Array.isArray(hist) || !hist.length) continue;
        for (const entry of hist) {
          assert.equal(entry.length, 2, `${co.name}.${k} entry has ${entry.length} elements`);
        }
      }
    }
  });
  it('year element is a number or null', () => {
    for (const co of allCompanies) {
      for (const k of HIST_KEYS) {
        const hist = co[k];
        if (!Array.isArray(hist) || !hist.length) continue;
        for (const entry of hist) {
          const yearType = typeof entry[0];
          assert.ok(
            yearType === 'number' || entry[0] === null,
            `${co.name}.${k}[0][0] has invalid type: ${yearType} (value: ${JSON.stringify(entry[0])})`
          );
        }
      }
    }
  });
  it('Honda revenue_currency is set at top level', () => {
    const tokyo = data['Q1490'] || [];
    const honda = tokyo.find(c => c.name === 'Honda');
    assert.ok(honda, 'Honda not found in Q1490');
    assert.ok(honda.revenue_currency, 'Honda revenue_currency not set');
  });
});
