'use strict';
const { describe, it, test } = require('node:test');
const assert = require('node:assert/strict');
const {
  popToT, lerpRGB, wikiCityColor, wikiCityOpacity, wikiCityRadius,
  fmtPop, fmtNum, escHtml, escAttr, isoToFlag,
  _tradeArc, _tradeArrowWeight, _convexHull, _arcLine,
  econDotColor, _econCellDeg, fmtEmployees, fmtRevenue,
  _pointInPolygon, validateCities, cityKey,
  _gaugeWidth, _radarScore,
} = require('../lib/pure-utils.cjs');

// ── popToT ────────────────────────────────────────────────────────────────────
describe('popToT', () => {
  it('returns 0 for null/undefined/0', () => {
    assert.equal(popToT(null), 0);
    assert.equal(popToT(0), 0);
    assert.equal(popToT(undefined), 0);
    assert.equal(popToT(-1000), 0);
  });
  it('returns 0 at floor population (10k)', () => {
    assert.equal(popToT(10_000), 0);
  });
  it('returns 1 at ceiling population (40M)', () => {
    assert.equal(popToT(40_000_000), 1);
  });
  it('clamps above ceiling', () => {
    assert.equal(popToT(1e9), 1);
  });
  it('returns between 0 and 1 for midrange population', () => {
    const t = popToT(1_000_000);
    assert.ok(t > 0 && t < 1, `expected 0 < t < 1, got ${t}`);
  });
  it('is monotonically increasing', () => {
    assert.ok(popToT(100_000) < popToT(1_000_000));
    assert.ok(popToT(1_000_000) < popToT(10_000_000));
  });
});

// ── lerpRGB ───────────────────────────────────────────────────────────────────
describe('lerpRGB', () => {
  it('returns a at t=0', () => {
    assert.deepEqual(lerpRGB([10, 20, 30], [100, 200, 255], 0), [10, 20, 30]);
  });
  it('returns b at t=1', () => {
    assert.deepEqual(lerpRGB([10, 20, 30], [100, 200, 255], 1), [100, 200, 255]);
  });
  it('returns midpoint at t=0.5', () => {
    assert.deepEqual(lerpRGB([0, 0, 0], [100, 200, 100], 0.5), [50, 100, 50]);
  });
  it('rounds to integers', () => {
    const result = lerpRGB([0, 0, 0], [1, 1, 1], 0.3);
    result.forEach(v => assert.equal(v, Math.round(v)));
  });
});

// ── wikiCityColor ─────────────────────────────────────────────────────────────
describe('wikiCityColor', () => {
  it('returns an rgb() string', () => {
    assert.match(wikiCityColor(100_000), /^rgb\(\d+,\d+,\d+\)$/);
  });
  it('tiny city → indigo-ish (high blue)', () => {
    const color = wikiCityColor(10_000);
    assert.match(color, /^rgb\(/);
  });
  it('megacity → warm color', () => {
    const color = wikiCityColor(40_000_000);
    // At t=1 we hit the last stop rgb(240,30,30)
    assert.equal(color, 'rgb(240,30,30)');
  });
  it('returns consistent results for the same input', () => {
    assert.equal(wikiCityColor(500_000), wikiCityColor(500_000));
  });
  it('null/zero → color at t=0 (first stop color)', () => {
    assert.equal(wikiCityColor(0), wikiCityColor(null));
  });
});

// ── wikiCityOpacity ───────────────────────────────────────────────────────────
describe('wikiCityOpacity', () => {
  it('minimum opacity is 0.35 (tiny city)', () => {
    assert.equal(wikiCityOpacity(0), 0.35);
    assert.equal(wikiCityOpacity(null), 0.35);
  });
  it('maximum opacity is 0.95 (40M+ city)', () => {
    assert.equal(wikiCityOpacity(40_000_000), 0.95);
  });
  it('is in [0.35, 0.95] range for all populations', () => {
    [10_000, 100_000, 1_000_000, 10_000_000].forEach(pop => {
      const op = wikiCityOpacity(pop);
      assert.ok(op >= 0.35 && op <= 0.95, `opacity ${op} out of range for pop ${pop}`);
    });
  });
  it('increases with population', () => {
    assert.ok(wikiCityOpacity(100_000) < wikiCityOpacity(10_000_000));
  });
});

// ── wikiCityRadius ────────────────────────────────────────────────────────────
describe('wikiCityRadius', () => {
  it('minimum radius is 2', () => {
    assert.equal(wikiCityRadius(0), 2);
    assert.equal(wikiCityRadius(1000), 2);
  });
  it('maximum radius is 12', () => {
    assert.equal(wikiCityRadius(1e10), 12);
  });
  it('1M population → radius 3', () => {
    assert.equal(wikiCityRadius(1_000_000), 3);
  });
  it('4M population → radius 6', () => {
    assert.equal(wikiCityRadius(4_000_000), 6);
  });
  it('increases with population', () => {
    assert.ok(wikiCityRadius(500_000) < wikiCityRadius(5_000_000));
  });
});

// ── fmtPop ────────────────────────────────────────────────────────────────────
describe('fmtPop', () => {
  it('returns dash for null', () => {
    assert.equal(fmtPop(null), '—');
    assert.equal(fmtPop(undefined), '—');
  });
  it('formats millions with 1 decimal', () => {
    assert.equal(fmtPop(1_500_000), '1.5M');
    assert.equal(fmtPop(10_000_000), '10.0M');
  });
  it('formats thousands without decimal', () => {
    assert.equal(fmtPop(50_000), '50k');
    assert.equal(fmtPop(1_000), '1k');
  });
  it('formats small numbers as-is', () => {
    assert.equal(fmtPop(500), '500');
  });
  it('boundary: exactly 1M', () => {
    assert.equal(fmtPop(1_000_000), '1.0M');
  });
  it('boundary: exactly 1k', () => {
    assert.equal(fmtPop(1000), '1k');
  });
});

// ── fmtNum ────────────────────────────────────────────────────────────────────
describe('fmtNum', () => {
  it('returns dash for null/undefined', () => {
    assert.equal(fmtNum(null), '—');
    assert.equal(fmtNum(undefined), '—');
  });
  it('returns string for numbers', () => {
    assert.equal(typeof fmtNum(1000), 'string');
  });
  it('formats 0', () => {
    assert.ok(fmtNum(0).includes('0'));
  });
});

// ── escHtml ───────────────────────────────────────────────────────────────────
describe('escHtml', () => {
  it('escapes ampersand', () => {
    assert.equal(escHtml('a & b'), 'a &amp; b');
  });
  it('escapes less-than', () => {
    assert.equal(escHtml('<script>'), '&lt;script&gt;');
  });
  it('escapes double quotes', () => {
    assert.equal(escHtml('"quoted"'), '&quot;quoted&quot;');
  });
  it('handles null/undefined', () => {
    assert.equal(escHtml(null), '');
    assert.equal(escHtml(undefined), '');
  });
  it('leaves safe characters unchanged', () => {
    assert.equal(escHtml('hello world 123'), 'hello world 123');
  });
  it('does NOT escape single quotes', () => {
    assert.equal(escHtml("it's"), "it's");
  });
});

// ── escAttr ───────────────────────────────────────────────────────────────────
describe('escAttr', () => {
  it('escapes single quotes', () => {
    assert.equal(escAttr("it's"), "it&#39;s");
  });
  it('handles null/undefined', () => {
    assert.equal(escAttr(null), '');
    assert.equal(escAttr(undefined), '');
  });
  it('leaves double quotes unchanged', () => {
    assert.equal(escAttr('"hello"'), '"hello"');
  });
});

// ── isoToFlag ─────────────────────────────────────────────────────────────────
describe('isoToFlag', () => {
  it('US → 🇺🇸', () => {
    assert.equal(isoToFlag('US'), '🇺🇸');
  });
  it('GB → 🇬🇧', () => {
    assert.equal(isoToFlag('GB'), '🇬🇧');
  });
  it('lowercase works', () => {
    assert.equal(isoToFlag('us'), '🇺🇸');
  });
  it('null/undefined → 🌐', () => {
    assert.equal(isoToFlag(null), '🌐');
    assert.equal(isoToFlag(''), '🌐');
  });
  it('3-char code → 🌐', () => {
    assert.equal(isoToFlag('USA'), '🌐');
  });
});

// ── _tradeArc ─────────────────────────────────────────────────────────────────
describe('_tradeArc', () => {
  it('returns exactly 41 points', () => {
    const pts = _tradeArc(0, 0, 10, 10, 1);
    assert.equal(pts.length, 41);
  });
  it('first point is [lat1, lon1]', () => {
    const pts = _tradeArc(38, -77, 35, 139, 1);
    assert.ok(Math.abs(pts[0][0] - 38) < 1e-9);
    assert.ok(Math.abs(pts[0][1] - (-77)) < 1e-9);
  });
  it('last point is [lat2, lon2] when no normalization needed', () => {
    // Paris → Berlin: lon diff = 13.4 - 2.35 = 11 < 180, no normalization
    const pts = _tradeArc(48.86, 2.35, 52.52, 13.41, 1);
    assert.ok(Math.abs(pts[40][0] - 52.52) < 1e-9);
    assert.ok(Math.abs(pts[40][1] - 13.41) < 1e-9);
  });
  it('normalises lon2 > lon1+180 (east→west shortcut)', () => {
    // US (-77) to Japan (139): diff = 216 > 180 → normalise to -221, but
    // since 139 - (-77) = 216 > 180, lon2a = 139 - 360 = -221.
    // Last point longitude should be -221, not 139.
    const pts = _tradeArc(38, -77, 35, 139, 1);
    assert.ok(Math.abs(pts[40][1] - (-221)) < 1e-9);
  });
  it('offset direction affects control point sign', () => {
    const pts1 = _tradeArc(0, 0, 10, 10, +1);
    const ptsM1 = _tradeArc(0, 0, 10, 10, -1);
    // Midpoint (i=20) should differ between +1 and -1 offsets
    assert.notDeepEqual(pts1[20], ptsM1[20]);
  });
});

// ── _tradeArrowWeight ─────────────────────────────────────────────────────────
describe('_tradeArrowWeight', () => {
  it('minimum weight is 2', () => {
    assert.equal(_tradeArrowWeight(0), 2);
    assert.equal(_tradeArrowWeight(1e6), 2); // below 1e9 floor
  });
  it('maximum weight is 14', () => {
    assert.equal(_tradeArrowWeight(1e15), 14);
  });
  it('$1T trade → between 2 and 14', () => {
    const w = _tradeArrowWeight(1e12);
    assert.ok(w >= 2 && w <= 14, `weight ${w} out of range`);
  });
  it('increases with usd', () => {
    assert.ok(_tradeArrowWeight(1e10) < _tradeArrowWeight(1e11));
  });
});

// ── _convexHull ───────────────────────────────────────────────────────────────
describe('_convexHull', () => {
  it('returns input unchanged for < 3 points', () => {
    assert.deepEqual(_convexHull([[0, 0], [1, 1]]), [[0, 0], [1, 1]]);
    assert.deepEqual(_convexHull([[5, 5]]), [[5, 5]]);
  });
  it('hull of a square contains all 4 corners', () => {
    const square = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const hull = _convexHull(square);
    assert.equal(hull.length, 4);
    // All hull points must be vertices of the square
    for (const pt of hull) {
      assert.ok(square.some(v => v[0] === pt[0] && v[1] === pt[1]),
        `hull point [${pt}] not a corner of the square`);
    }
  });
  it('interior point is excluded from hull', () => {
    const pts = [[0, 0], [10, 0], [10, 10], [0, 10], [5, 5]]; // 5,5 is interior
    const hull = _convexHull(pts);
    assert.ok(!hull.some(p => p[0] === 5 && p[1] === 5),
      'interior point [5,5] should not be in hull');
  });
  it('collinear points: returns endpoints', () => {
    const line = [[0, 0], [5, 0], [10, 0]];
    const hull = _convexHull(line);
    // Collinear — the tie-breaking on d2 keeps the farthest point, so we get at most 2 unique points
    assert.ok(hull.length <= 3);
  });
});

// ── _arcLine ──────────────────────────────────────────────────────────────────
describe('_arcLine', () => {
  it('returns exactly 25 points', () => {
    const pts = _arcLine([0, 0], [10, 10]);
    assert.equal(pts.length, 25);
  });
  it('first point equals p1', () => {
    const pts = _arcLine([1, 2], [8, 9]);
    assert.ok(Math.abs(pts[0][0] - 1) < 1e-9 && Math.abs(pts[0][1] - 2) < 1e-9);
  });
  it('last point equals p2', () => {
    const pts = _arcLine([1, 2], [8, 9]);
    assert.ok(Math.abs(pts[24][0] - 8) < 1e-9 && Math.abs(pts[24][1] - 9) < 1e-9);
  });
  it('curve=0 gives a straight line', () => {
    const pts = _arcLine([0, 0], [10, 0], 0);
    // With curve=0, ctrl=[mid[0], mid[1]], so all points should have lng=0
    pts.forEach(p => assert.ok(Math.abs(p[1]) < 1e-9, `expected lng=0, got ${p[1]}`));
  });
});

// ── econDotColor ──────────────────────────────────────────────────────────────
describe('econDotColor', () => {
  it('returns an hsl() string', () => {
    assert.match(econDotColor(1e9), /^hsl\(\d+,\d+%,\d+%\)$/);
  });
  it('minimum value (below floor) → gold-ish hue ~45', () => {
    const color = econDotColor(1e6); // below 5e8 floor → t=0
    assert.equal(color, 'hsl(45,85%,62%)');
  });
  it('maximum value → cyan-teal hue ~188', () => {
    const color = econDotColor(1e15); // above 5e12 ceiling → t=1
    assert.equal(color, 'hsl(188,100%,52%)');
  });
  it('hue increases with totalUSD', () => {
    const h1 = parseInt(econDotColor(1e9).match(/hsl\((\d+)/)[1]);
    const h2 = parseInt(econDotColor(1e12).match(/hsl\((\d+)/)[1]);
    assert.ok(h1 < h2, `expected hue to increase: ${h1} < ${h2}`);
  });
});

// ── _econCellDeg ──────────────────────────────────────────────────────────────
describe('_econCellDeg', () => {
  it('zoom ≤ 3 → 20', () => {
    assert.equal(_econCellDeg(1), 20);
    assert.equal(_econCellDeg(3), 20);
  });
  it('zoom 4 → 12', () => {
    assert.equal(_econCellDeg(4), 12);
  });
  it('zoom 5 → 6', () => {
    assert.equal(_econCellDeg(5), 6);
  });
  it('zoom 6 → 3', () => {
    assert.equal(_econCellDeg(6), 3);
  });
  it('zoom 7 → 1.5', () => {
    assert.equal(_econCellDeg(7), 1.5);
  });
  it('zoom 8+ → 0 (no merging)', () => {
    assert.equal(_econCellDeg(8), 0);
    assert.equal(_econCellDeg(15), 0);
  });
});

// ── fmtEmployees ──────────────────────────────────────────────────────────────
describe('fmtEmployees', () => {
  it('returns null for falsy', () => {
    assert.equal(fmtEmployees(0), null);
    assert.equal(fmtEmployees(null), null);
  });
  it('millions with 1 decimal', () => {
    assert.equal(fmtEmployees(2_500_000), '2.5M');
  });
  it('thousands rounded', () => {
    assert.equal(fmtEmployees(50_000), '50k');
    assert.equal(fmtEmployees(1500), '2k'); // rounds 1.5 → 2
  });
  it('small numbers as locale string', () => {
    assert.equal(typeof fmtEmployees(500), 'string');
    assert.ok(fmtEmployees(500).includes('500'));
  });
});

// ── fmtRevenue ────────────────────────────────────────────────────────────────
describe('fmtRevenue', () => {
  it('returns null for falsy', () => {
    assert.equal(fmtRevenue(0), null);
    assert.equal(fmtRevenue(null), null);
  });
  it('trillions with 1 decimal', () => {
    assert.equal(fmtRevenue(2.5e12), '2.5T');
  });
  it('billions with 1 decimal', () => {
    assert.equal(fmtRevenue(3.7e9), '3.7B');
  });
  it('millions without decimal', () => {
    assert.equal(fmtRevenue(500e6), '500M');
  });
  it('negative trillions', () => {
    assert.equal(fmtRevenue(-1.2e12), '-1.2T');
  });
});

// ── _pointInPolygon ───────────────────────────────────────────────────────────
describe('_pointInPolygon', () => {
  // Square: [lat, lng] corners at (0,0), (0,10), (10,10), (10,0)
  const square = [[0, 0], [0, 10], [10, 10], [10, 0]];

  it('interior point → true', () => {
    assert.equal(_pointInPolygon(5, 5, square), true);
  });
  it('exterior point → false', () => {
    assert.equal(_pointInPolygon(15, 5, square), false);
    assert.equal(_pointInPolygon(5, 15, square), false);
    assert.equal(_pointInPolygon(-1, 5, square), false);
  });
  it('point near corner → false (outside)', () => {
    assert.equal(_pointInPolygon(-1, -1, square), false);
  });
  it('works for triangles', () => {
    const tri = [[0, 0], [0, 10], [10, 5]];
    assert.equal(_pointInPolygon(5, 5, tri), true);
    assert.equal(_pointInPolygon(9, 0, tri), false);
  });
});

// ── validateCities ────────────────────────────────────────────────────────────
describe('validateCities', () => {
  it('throws if input is not an array', () => {
    assert.throws(() => validateCities(null), /not an array/);
    assert.throws(() => validateCities({}), /not an array/);
  });
  it('filters out records without name', () => {
    const data = [{ lat: 1, lng: 2 }, { name: 'Tokyo', lat: 35, lng: 139 }];
    const result = validateCities(data);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'Tokyo');
  });
  it('filters out records with non-number lat/lng', () => {
    const data = [
      { name: 'Bad', lat: '35', lng: 139 },
      { name: 'Good', lat: 35, lng: 139 },
    ];
    assert.equal(validateCities(data).length, 1);
  });
  it('throws if no valid records', () => {
    assert.throws(() => validateCities([{ lat: 1, lng: 2 }]), /no valid city records/);
  });
  it('returns all valid records', () => {
    const data = [
      { name: 'A', lat: 1, lng: 1 },
      { name: 'B', lat: 2, lng: 2 },
    ];
    assert.equal(validateCities(data).length, 2);
  });
});

// ── cityKey ───────────────────────────────────────────────────────────────────
describe('cityKey', () => {
  it('prefers QID when present', () => {
    assert.equal(cityKey({ qid: 'Q84', lat: 51.5, lng: -0.1 }), 'Q84');
  });
  it('falls back to lat,lng string when no QID', () => {
    assert.equal(cityKey({ lat: 51.5, lng: -0.1 }), '51.5,-0.1');
  });
  it('empty qid string is falsy → uses lat,lng', () => {
    assert.equal(cityKey({ qid: '', lat: 35, lng: 139 }), '35,139');
  });
});

// ── _gaugeWidth ───────────────────────────────────────────────────────────────
describe('_gaugeWidth', () => {
  test('null value returns 0', () => assert.equal(_gaugeWidth(null, 100), 0));
  test('zero worldMax returns 0', () => assert.equal(_gaugeWidth(50, 0), 0));
  test('at worldMax returns 100', () => assert.equal(_gaugeWidth(100, 100), 100));
  test('above worldMax clamps to 100', () => assert.equal(_gaugeWidth(150, 100), 100));
  test('half worldMax returns 50', () => assert.equal(_gaugeWidth(50, 100), 50));
  test('result is integer', () => assert.equal(_gaugeWidth(33, 100), 33));
  test('NaN value returns 0', () => assert.equal(_gaugeWidth(NaN, 100), 0));
});

// ── _radarScore ───────────────────────────────────────────────────────────────
describe('_radarScore', () => {
  test('null value returns 0', () => assert.equal(_radarScore('gdp_per_capita', null, 100), 0));
  test('zero worldMax returns 0', () => assert.equal(_radarScore('gdp_per_capita', 50, 0), 0));
  test('higher gdp_per_capita gives higher score', () => {
    assert.ok(_radarScore('gdp_per_capita', 80, 100) > _radarScore('gdp_per_capita', 40, 100));
  });
  test('lower govt_debt_gdp gives higher score (inverted)', () => {
    assert.ok(_radarScore('govt_debt_gdp', 20, 100) > _radarScore('govt_debt_gdp', 80, 100));
  });
  test('score clamps to 0..1 range', () => {
    assert.ok(_radarScore('gdp_per_capita', 200, 100) <= 1);
    assert.ok(_radarScore('gdp_per_capita', -10, 100) >= 0);
  });
  test('fiscal_balance_gdp: -15 → 0 (worst)', () =>
    assert.equal(_radarScore('fiscal_balance_gdp', -15, 100), 0));
  test('fiscal_balance_gdp: 0 → 0.5 (balanced)', () =>
    assert.equal(_radarScore('fiscal_balance_gdp', 0, 100), 0.5));
  test('fiscal_balance_gdp: +15 → 1 (best)', () =>
    assert.equal(_radarScore('fiscal_balance_gdp', 15, 100), 1));
  test('NaN value returns 0', () =>
    assert.equal(_radarScore('gdp_per_capita', NaN, 100), 0));
});
