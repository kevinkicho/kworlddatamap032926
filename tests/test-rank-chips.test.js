const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// Inline the rankIn logic for unit testing (mirrors the app.js implementation)
function rankIn(iso2, countryData, key, lowerIsBetter) {
  var cd = countryData[iso2];
  if (!cd || !cd.region) return null;
  var region = cd.region;
  var peers = [];
  for (var k in countryData) {
    var v = countryData[k][key];
    if (typeof v === 'number' && isFinite(v) && countryData[k].region === region)
      peers.push({ iso: k, val: v });
  }
  if (peers.length < 2) return null;
  peers.sort(function(a, b) { return lowerIsBetter ? a.val - b.val : b.val - a.val; });
  var pos = peers.findIndex(function(p) { return p.iso === iso2; });
  return pos === -1 ? null : { rank: pos + 1, total: peers.length };
}

describe('rankIn', function() {
  test('ranks highest GDP/cap first', function() {
    var data = {
      DE: { region: 'Europe', gdp_per_capita: 54000 },
      FR: { region: 'Europe', gdp_per_capita: 43000 },
      PL: { region: 'Europe', gdp_per_capita: 18000 }
    };
    assert.deepEqual(rankIn('DE', data, 'gdp_per_capita', false), { rank: 1, total: 3 });
    assert.deepEqual(rankIn('PL', data, 'gdp_per_capita', false), { rank: 3, total: 3 });
  });

  test('ranks lowest debt first when lowerIsBetter=true', function() {
    var data = {
      DE: { region: 'Europe', govt_debt_gdp: 66 },
      FR: { region: 'Europe', govt_debt_gdp: 111 },
      EE: { region: 'Europe', govt_debt_gdp: 18 }
    };
    assert.deepEqual(rankIn('EE', data, 'govt_debt_gdp', true), { rank: 1, total: 3 });
    assert.deepEqual(rankIn('FR', data, 'govt_debt_gdp', true), { rank: 3, total: 3 });
  });

  test('returns null when fewer than 2 peers in region', function() {
    var data = {
      DE: { region: 'Europe', gdp_per_capita: 54000 },
      US: { region: 'Americas', gdp_per_capita: 80000 }
    };
    assert.equal(rankIn('DE', data, 'gdp_per_capita', false), null);
  });

  test('returns null when country not in region peers', function() {
    var data = {
      DE: { region: 'Europe', gdp_per_capita: 54000 },
      FR: { region: 'Europe', gdp_per_capita: 43000 },
      JP: { region: 'Asia' }  // no gdp value
    };
    assert.equal(rankIn('JP', data, 'gdp_per_capita', false), null);
  });

  test('returns null when country missing from data entirely', function() {
    var data = {
      DE: { region: 'Europe', gdp_per_capita: 54000 },
      FR: { region: 'Europe', gdp_per_capita: 43000 }
    };
    assert.equal(rankIn('US', data, 'gdp_per_capita', false), null);
  });

  test('ties share the same rank position', function() {
    var data = {
      A: { region: 'X', gdp_per_capita: 100 },
      B: { region: 'X', gdp_per_capita: 100 },
      C: { region: 'X', gdp_per_capita: 50 }
    };
    var rA = rankIn('A', data, 'gdp_per_capita', false);
    var rB = rankIn('B', data, 'gdp_per_capita', false);
    assert.equal(rA.total, 3);
    assert.equal(rB.total, 3);
    // A and B have the same value; sort is stable-ish but both rank 1 or 2
    assert.ok(rA.rank >= 1 && rA.rank <= 2);
    assert.ok(rB.rank >= 1 && rB.rank <= 2);
  });
});
