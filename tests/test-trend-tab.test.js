const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// Extract point-mapping logic for isolated testing (no DOM, no IYChart)
function mapFredPoints(raw) {
  return raw
    .map(function(row) { return { t: new Date(row[0] + '-01').getTime(), v: row[1] }; })
    .filter(function(p) { return Number.isFinite(p.v); });
}

function mapYearPoints(raw) {
  return raw
    .map(function(row) { return { t: row[0], v: row[1] }; })
    .filter(function(p) { return Number.isFinite(p.v); });
}

describe('mapFredPoints', function() {
  test('maps YYYY-MM strings to millisecond timestamps', function() {
    var pts = mapFredPoints([['2023-01', 3.5], ['2023-02', 3.7]]);
    assert.equal(pts.length, 2);
    assert.equal(typeof pts[0].t, 'number');
    assert.ok(pts[0].t > 0, 'timestamp should be positive');
    assert.equal(pts[0].v, 3.5);
  });

  test('filters out null values', function() {
    var pts = mapFredPoints([['2023-01', 3.5], ['2023-02', null], ['2023-03', 3.9]]);
    assert.equal(pts.length, 2);
    assert.equal(pts[1].v, 3.9);
  });

  test('filters out NaN values', function() {
    var pts = mapFredPoints([['2023-01', NaN], ['2023-02', 4.0]]);
    assert.equal(pts.length, 1);
    assert.equal(pts[0].v, 4.0);
  });

  test('returns empty array for empty input', function() {
    assert.deepEqual(mapFredPoints([]), []);
  });

  test('later months produce larger timestamps than earlier months', function() {
    var pts = mapFredPoints([['2022-12', 3.0], ['2023-01', 3.5]]);
    assert.ok(pts[1].t > pts[0].t, 'timestamps should be ascending');
  });
});

describe('mapYearPoints', function() {
  test('maps year integers to {t, v} points', function() {
    var pts = mapYearPoints([[2020, 54000], [2021, 52000]]);
    assert.equal(pts.length, 2);
    assert.equal(pts[0].t, 2020);
    assert.equal(pts[0].v, 54000);
  });

  test('filters out null values', function() {
    var pts = mapYearPoints([[2020, 54000], [2021, null], [2022, 55000]]);
    assert.equal(pts.length, 2);
    assert.equal(pts[1].v, 55000);
  });

  test('returns empty array for empty input', function() {
    assert.deepEqual(mapYearPoints([]), []);
  });
});
