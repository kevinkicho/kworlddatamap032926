// tests/fetch-whr.test.js
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');

// ── Unit-test the name-matching logic in isolation ───────────────────────────
const NAME_OVERRIDES = {
  'united states':                'US',
  'united kingdom':               'GB',
  'south korea':                  'KR',
  'taiwan province of china':     'TW',
  'hong kong s.a.r. of china':    'HK',
  "congo (brazzaville)":          'CG',
  "congo (kinshasa)":             'CD',
  "cote d'ivoire":                'CI',
  'ivory coast':                  'CI',
  'north macedonia':              'MK',
  'somaliland region':            null,
};

function buildNameLookup(cd, overrides) {
  const map = {};
  for (const [iso2, d] of Object.entries(cd)) {
    if (d.name) map[d.name.toLowerCase()] = iso2;
  }
  for (const [name, iso2] of Object.entries(overrides)) {
    if (iso2) map[name.toLowerCase()] = iso2;
    else map[name.toLowerCase()] = null;
  }
  return map;
}

const mockCd = {
  FI: { name: 'Finland' },
  DE: { name: 'Germany' },
  JP: { name: 'Japan' },
  DK: { name: 'Denmark' },
};

describe('WHR name matching', () => {
  const lookup = buildNameLookup(mockCd, NAME_OVERRIDES);

  it('matches country names from country-data.json', () => {
    assert.equal(lookup['finland'], 'FI');
    assert.equal(lookup['germany'], 'DE');
    assert.equal(lookup['japan'],   'JP');
    assert.equal(lookup['denmark'], 'DK');
  });

  it('applies WHR-specific name overrides', () => {
    assert.equal(lookup['united states'],             'US');
    assert.equal(lookup['south korea'],               'KR');
    assert.equal(lookup['taiwan province of china'],  'TW');
    assert.equal(lookup["cote d'ivoire"],             'CI');
    assert.equal(lookup['ivory coast'],               'CI');
  });

  it('null overrides mark skip-entries', () => {
    assert.equal(lookup['somaliland region'], null);
  });

  it('returns undefined for unknown names', () => {
    assert.equal(lookup['unknown country xyz'], undefined);
  });

  it('override wins over cd.name (case-insensitive)', () => {
    // cd maps 'America' → 'US'; override should map 'united states' → 'US' independently
    const cdWithUS = { ...mockCd, US: { name: 'America' } };
    const l = buildNameLookup(cdWithUS, NAME_OVERRIDES);
    assert.equal(l['united states'], 'US',  'override should match WHR name');
    assert.equal(l['america'],       'US',  'cd.name path should still work');
  });
});

// ── Integration: check country-data.json after running fetch-whr.js ─────────
describe('WHR fields in country-data.json', () => {
  const cdPath = path.join(__dirname, '..', 'public', 'country-data.json');
  let cd;
  try { cd = JSON.parse(fs.readFileSync(cdPath, 'utf8')); }
  catch { cd = null; }

  it('country-data.json is readable', () => {
    assert.ok(cd !== null, 'Could not read country-data.json');
  });

  it('FI has all WHR fields (run: node scripts/fetch-whr.js first)', () => {
    const fi = cd && cd['FI'];
    assert.ok(fi, 'FI missing from country-data.json');
    assert.ok(typeof fi.whr_score === 'number',   'whr_score must be a number');
    assert.ok(typeof fi.whr_rank  === 'number',   'whr_rank must be a number');
    assert.ok(fi.whr_rank >= 1,                   'whr_rank must be >= 1');
    assert.equal(fi.whr_year, 2024,               'whr_year must be 2024');
    assert.ok(typeof fi.whr_gdp        === 'number', 'whr_gdp missing');
    assert.ok(typeof fi.whr_social     === 'number', 'whr_social missing');
    assert.ok(typeof fi.whr_health     === 'number', 'whr_health missing');
    assert.ok(typeof fi.whr_freedom    === 'number', 'whr_freedom missing');
    assert.ok(typeof fi.whr_generosity === 'number', 'whr_generosity missing');
    assert.ok(typeof fi.whr_corruption === 'number', 'whr_corruption missing');
  });

  it('US has WHR fields', () => {
    const us = cd && cd['US'];
    assert.ok(us,                                'US missing from country-data.json');
    assert.ok(typeof us.whr_score === 'number',  'US whr_score missing');
    assert.ok(typeof us.whr_rank  === 'number',  'US whr_rank missing');
  });

  it('covers at least 100 countries with whr_score', () => {
    const count = cd ? Object.values(cd).filter(d => typeof d.whr_score === 'number').length : 0;
    assert.ok(count >= 100, `Only ${count} countries have whr_score — expected 100+`);
  });

  it('existing WB fields are still intact on FI', () => {
    const fi = cd && cd['FI'];
    assert.ok(fi, 'FI missing');
    assert.ok(typeof fi.gdp_per_capita === 'number', 'gdp_per_capita clobbered');
    assert.ok(typeof fi.life_expectancy === 'number', 'life_expectancy clobbered');
  });
});
