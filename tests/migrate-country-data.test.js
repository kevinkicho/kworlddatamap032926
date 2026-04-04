// tests/migrate-country-data.test.js
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');

// Read the actual merged file (migration must have run first)
const cd = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'public', 'country-data.json'), 'utf8'));

describe('country-data merge', () => {
  it('US has World Bank fields', () => {
    assert.ok(typeof cd['US'].gdp_per_capita === 'number');
    assert.ok(typeof cd['US'].life_expectancy === 'number');
  });
  it('US has IMF fields', () => {
    assert.ok(typeof cd['US'].govt_debt_gdp === 'number');
    assert.ok(typeof cd['US'].fiscal_balance_gdp === 'number');
    assert.ok(Array.isArray(cd['US'].govt_debt_gdp_history));
    assert.ok(cd['US'].govt_debt_gdp_history.length > 0);
    // history is [[year, value]] tuples
    assert.ok(Array.isArray(cd['US'].govt_debt_gdp_history[0]));
  });
  it('US has FRED fields under bond_yield_10y name', () => {
    assert.ok(typeof cd['US'].bond_yield_10y === 'number');
    assert.ok(typeof cd['US'].bond_yield_10y_date === 'string');
    assert.ok(Array.isArray(cd['US'].bond_yield_10y_history));
    assert.ok(cd['US'].bond_yield_10y_history.length > 0);
    // history is [["YYYY-MM", value]] tuples
    assert.ok(typeof cd['US'].bond_yield_10y_history[0][0] === 'string');
  });
  it('country without FRED data (e.g. NG) still has World Bank fields', () => {
    assert.ok(typeof cd['NG'].gdp_per_capita === 'number');
    assert.equal(cd['NG'].bond_yield_10y, undefined);
  });
  it('country without IMF data is still present', () => {
    // All 296 WB countries should still be in the file
    assert.ok(Object.keys(cd).length >= 296);
  });
});
