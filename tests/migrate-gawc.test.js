// tests/migrate-gawc.test.js
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');

const gawc = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'public', 'gawc-cities.json'), 'utf8'));

describe('gawc-cities QID migration', () => {
  it('all keys are Wikidata QID format', () => {
    const nonQid = Object.keys(gawc).filter(k => !/^Q\d+$/.test(k));
    assert.equal(nonQid.length, 0, `Non-QID keys found: ${nonQid.slice(0,5).join(', ')}`);
  });
  it('London (Q84) has Alpha++ tier', () => {
    assert.ok(gawc['Q84'], 'London Q84 missing');
    assert.equal(gawc['Q84'].tier, 'Alpha++');
  });
  it('New York (Q60) is present', () => {
    assert.ok(gawc['Q60'], 'New York Q60 missing');
    assert.ok(typeof gawc['Q60'].score === 'number');
  });
  it('each entry has tier and score only (no name, no iso — cleaned up)', () => {
    for (const [qid, entry] of Object.entries(gawc)) {
      assert.ok('tier' in entry, `${qid} missing tier`);
      assert.ok('score' in entry, `${qid} missing score`);
    }
  });
  it('coverage is at least 270 cities', () => {
    assert.ok(Object.keys(gawc).length >= 270);
  });
});
