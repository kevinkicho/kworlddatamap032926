// tests/fetch-ember.test.js
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');

// ── Unit-test the history-building logic in isolation ────────────────────────
function buildHistory(yearValueMap) {
  return Object.entries(yearValueMap)
    .map(([yr, v]) => [Number(yr), +Number(v).toFixed(2)])
    .filter(([yr, v]) => yr >= 2000 && Number.isFinite(v))
    .sort((a, b) => a[0] - b[0]);
}

const SKIP_CODES = new Set([
  'ASEAN', 'CIS', 'EU', 'EU27', 'G20', 'G7', 'World',
  'Latin America', 'Middle East', 'North Africa', 'OECD',
  'Other Africa', 'Other Asia & Pacific', 'Other CIS',
  'Other Europe', 'South America', 'Southeast Asia',
]);

function isRegionAggregate(code) {
  return SKIP_CODES.has(code);
}

describe('Ember history building', () => {
  it('sorts years ascending', () => {
    const h = buildHistory({ 2020: 50, 2018: 45, 2022: 40 });
    assert.equal(h[0][0], 2018);
    assert.equal(h[1][0], 2020);
    assert.equal(h[2][0], 2022);
  });

  it('filters years before 2000', () => {
    const h = buildHistory({ 1995: 80, 2000: 70, 2010: 60 });
    assert.equal(h.length, 2);
    assert.equal(h[0][0], 2000);
  });

  it('filters NaN/non-finite values; null coerces to 0 and is retained', () => {
    const h = buildHistory({ 2010: null, 2011: NaN, 2012: 55 });
    // null → Number(null) = 0, which is finite — kept as 0.00
    // NaN  → Number(NaN)  = NaN, which is non-finite — dropped
    assert.equal(h.length, 2);
    assert.equal(h[0][1], 0);
    assert.equal(h[1][1], 55);
  });

  it('returns empty array for empty input', () => {
    assert.deepEqual(buildHistory({}), []);
  });
});

describe('Ember region exclusion', () => {
  it('skips World, EU, G20, ASEAN', () => {
    assert.ok(isRegionAggregate('World'));
    assert.ok(isRegionAggregate('EU'));
    assert.ok(isRegionAggregate('G20'));
    assert.ok(isRegionAggregate('ASEAN'));
  });

  it('does not skip sovereign states', () => {
    assert.ok(!isRegionAggregate('DE'));
    assert.ok(!isRegionAggregate('US'));
    assert.ok(!isRegionAggregate('CN'));
  });
});

// ── Integration: check country-data.json after running fetch-ember.js ────────
describe('Ember fields in country-data.json', () => {
  const cdPath = path.join(__dirname, '..', 'public', 'country-data.json');
  let cd;
  try { cd = JSON.parse(fs.readFileSync(cdPath, 'utf8')); }
  catch { cd = null; }

  it('country-data.json is readable', () => {
    assert.ok(cd !== null, 'Could not read country-data.json');
  });

  it('DE has all Ember fields (run: node scripts/fetch-ember.js first)', () => {
    const de = cd && cd['DE'];
    assert.ok(de, 'DE missing from country-data.json');
    assert.ok(typeof de.energy_coal_pct        === 'number', 'energy_coal_pct missing');
    assert.ok(typeof de.energy_gas_pct         === 'number', 'energy_gas_pct missing');
    assert.ok(typeof de.energy_nuclear_pct     === 'number', 'energy_nuclear_pct missing');
    assert.ok(typeof de.energy_hydro_pct       === 'number', 'energy_hydro_pct missing');
    assert.ok(typeof de.energy_wind_solar_pct  === 'number', 'energy_wind_solar_pct missing');
    assert.ok(typeof de.energy_year            === 'number', 'energy_year missing');
    assert.ok(Array.isArray(de.energy_coal_pct_history),     'energy_coal_pct_history must be array');
    assert.ok(de.energy_coal_pct_history.length > 5,         'history should have 5+ years');
  });

  it('coal history is sorted ascending by year', () => {
    const de = cd && cd['DE'];
    if (!de || !de.energy_coal_pct_history || de.energy_coal_pct_history.length < 2) return;
    const h = de.energy_coal_pct_history;
    for (let i = 1; i < h.length; i++) {
      assert.ok(h[i][0] > h[i-1][0], `History not sorted: ${h[i-1][0]} >= ${h[i][0]}`);
    }
  });

  it('history entries are [year, pct] tuples with year >= 2000', () => {
    const de = cd && cd['DE'];
    if (!de || !de.energy_coal_pct_history) return;
    for (const entry of de.energy_coal_pct_history) {
      assert.ok(Array.isArray(entry) && entry.length === 2, 'Entry must be [year, pct]');
      assert.ok(entry[0] >= 2000, `Year ${entry[0]} < 2000`);
      assert.ok(typeof entry[1] === 'number', 'Value must be number');
    }
  });

  it('covers at least 80 countries with energy_coal_pct', () => {
    const count = cd ? Object.values(cd).filter(d => typeof d.energy_coal_pct === 'number').length : 0;
    assert.ok(count >= 80, `Only ${count} countries have energy_coal_pct — expected 80+`);
  });

  it('existing WB and WHR fields are still intact on DE', () => {
    const de = cd && cd['DE'];
    assert.ok(de, 'DE missing');
    assert.ok(typeof de.gdp_per_capita === 'number', 'gdp_per_capita clobbered');
    assert.ok(typeof de.whr_score === 'number', 'whr_score clobbered');
  });
});
