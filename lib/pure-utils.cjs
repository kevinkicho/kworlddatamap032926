// Pure utility functions extracted from public/app.js for testing.
// Keep in sync with app.js when the originals change.

const COLOR_STOPS = [
  [0.00, [80,  50, 200]],  // dim indigo   — ~10k
  [0.28, [40, 120, 255]],  // blue          — ~100k
  [0.50, [20, 200, 210]],  // cyan/teal     — ~600k
  [0.68, [80, 220,  80]],  // green         — ~2M
  [0.82, [250, 210, 30]],  // amber         — ~7M
  [0.92, [250, 120, 20]],  // orange        — ~18M
  [1.00, [240,  30, 30]],  // red           — 40M+
];

function popToT(pop) {
  if (!pop || pop <= 0) return 0;
  const lo = Math.log10(10_000);
  const hi = Math.log10(40_000_000);
  return Math.min(1, Math.max(0, (Math.log10(pop) - lo) / (hi - lo)));
}

function lerpRGB(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function wikiCityColor(pop) {
  const t = popToT(pop);
  for (let i = 1; i < COLOR_STOPS.length; i++) {
    const [t0, c0] = COLOR_STOPS[i - 1];
    const [t1, c1] = COLOR_STOPS[i];
    if (t <= t1) {
      const [r, g, b] = lerpRGB(c0, c1, (t - t0) / (t1 - t0));
      return `rgb(${r},${g},${b})`;
    }
  }
  return 'rgb(240,30,30)';
}

function wikiCityOpacity(pop) { return 0.35 + popToT(pop) * 0.60; }

function wikiCityRadius(pop) { return Math.max(2, Math.min(12, Math.sqrt(pop / 1e6) * 3)); }

function fmtPop(pop) {
  if (pop == null) return '—';
  if (pop >= 1e6) return (pop / 1e6).toFixed(1) + 'M';
  if (pop >= 1e3) return (pop / 1e3).toFixed(0) + 'k';
  return String(pop);
}

function fmtNum(n) { return n == null ? '—' : n.toLocaleString(); }

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escAttr(str) {
  return String(str ?? '').replace(/'/g, '&#39;');
}

function safeOnclick(fnName, ...args) {
  const jsArgs = args.map(a => JSON.stringify(a)).join(',');
  return ` onclick="${escHtml(fnName + '(' + jsArgs + ')')}"`;
}

function isoToFlag(iso2) {
  if (!iso2 || iso2.length !== 2) return '🌐';
  return [...iso2.toUpperCase()].map(c =>
    String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)
  ).join('');
}

function _tradeArc(lat1, lon1, lat2, lon2, offsetDir) {
  let lon2a = lon2;
  if (lon2a - lon1 > 180)  lon2a -= 360;
  if (lon2a - lon1 < -180) lon2a += 360;

  const dl = lat2 - lat1, dn = lon2a - lon1;
  const len = Math.sqrt(dl * dl + dn * dn) || 1;

  const midLat = (lat1 + lat2) / 2;
  const midLon = (lon1 + lon2a) / 2;

  const ctrl = [
    midLat + (-dn / len) * 5 * offsetDir,
    midLon + (dl  / len) * 5 * offsetDir,
  ];

  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40, u = 1 - t;
    pts.push([
      u * u * lat1 + 2 * u * t * ctrl[0] + t * t * lat2,
      u * u * lon1 + 2 * u * t * ctrl[1] + t * t * lon2a,
    ]);
  }
  return pts;
}

function _tradeArrowWeight(usd) {
  const log = Math.log10(Math.max(usd, 1e9));
  return Math.max(2, Math.min(14, 2 + 12 * (log - 9) / (12 - 9)));
}

function _convexHull(pts) {
  const n = pts.length;
  if (n < 3) return [...pts];
  const d2 = (a, b) => (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
  let l = 0;
  for (let i = 1; i < n; i++) if (pts[i][1] < pts[l][1]) l = i;
  const hull = []; let p = l, q;
  do {
    hull.push(pts[p]); q = 0;
    for (let i = 1; i < n; i++) {
      if (q === p) { q = i; continue; }
      const cross = (pts[q][1] - pts[p][1]) * (pts[i][0] - pts[p][0])
        - (pts[q][0] - pts[p][0]) * (pts[i][1] - pts[p][1]);
      if (cross < 0 || (cross === 0 && d2(pts[p], pts[i]) > d2(pts[p], pts[q]))) q = i;
    }
    p = q;
  } while (p !== l && hull.length <= n);
  return hull;
}

function _arcLine(p1, p2, curve = 0.22) {
  const mid = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
  const dl = p2[0] - p1[0], dn = p2[1] - p1[1];
  const ctrl = [mid[0] - dn * curve, mid[1] + dl * curve];
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24, u = 1 - t;
    pts.push([
      u * u * p1[0] + 2 * u * t * ctrl[0] + t * t * p2[0],
      u * u * p1[1] + 2 * u * t * ctrl[1] + t * t * p2[1],
    ]);
  }
  return pts;
}

function econDotColor(totalUSD) {
  const logMin = Math.log10(5e8);
  const logMax = Math.log10(5e12);
  const t = Math.max(0, Math.min(1, (Math.log10(Math.max(totalUSD, 5e8)) - logMin) / (logMax - logMin)));
  const hue = Math.round(45 + t * 143);
  const sat = Math.round(85 + t * 15);
  const lit = Math.round(62 - t * 10);
  return `hsl(${hue},${sat}%,${lit}%)`;
}

function _econCellDeg(zoom) {
  if (zoom <= 3) return 20;
  if (zoom <= 4) return 12;
  if (zoom <= 5) return 6;
  if (zoom <= 6) return 3;
  if (zoom <= 7) return 1.5;
  return 0;
}

function fmtEmployees(n) {
  if (!n) return null;
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1000) return Math.round(n / 1000) + 'k';
  return n.toLocaleString();
}

function fmtRevenue(n) {
  if (!n) return null;
  if (Math.abs(n) >= 1e12) return (n / 1e12).toFixed(1) + 'T';
  if (Math.abs(n) >= 1e9)  return (n / 1e9).toFixed(1) + 'B';
  if (Math.abs(n) >= 1e6)  return (n / 1e6).toFixed(0) + 'M';
  return n.toLocaleString();
}

function _pointInPolygon(lat, lng, poly) {
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [ai, bi] = poly[i], [aj, bj] = poly[j];
    if ((bi > lng) !== (bj > lng) &&
        lat < (aj - ai) * (lng - bi) / (bj - bi) + ai) inside = !inside;
  }
  return inside;
}

function validateCities(data) {
  if (!Array.isArray(data)) throw new Error('cities-full.json is not an array — file may be corrupt');
  const valid = [], bad = [];
  for (const c of data) {
    if (typeof c.name === 'string' && c.name &&
        typeof c.lat === 'number' && typeof c.lng === 'number') {
      valid.push(c);
    } else {
      bad.push(c);
    }
  }
  if (valid.length === 0) throw new Error('cities-full.json contains no valid city records');
  return valid;
}

function cityKey(c) {
  return c.qid || (c.lat + ',' + c.lng);
}

function _gaugeWidth(value, worldMax) {
  if (!Number.isFinite(value) || !worldMax) return 0;
  return Math.round(Math.min(100, Math.max(0, (value / worldMax) * 100)));
}

const RADAR_INVERTED_KEYS = new Set(["govt_debt_gdp", "cpi_inflation", "unemployment_rate"]);

function _radarScore(key, value, worldMax) {
  if (!Number.isFinite(value) || !worldMax) return 0;
  if (key === "fiscal_balance_gdp") return Math.min(1, Math.max(0, (value + 15) / 30));
  const raw = Math.min(1, Math.max(0, value / worldMax));
  return RADAR_INVERTED_KEYS.has(key) ? 1 - raw : raw;
}

module.exports = {
  COLOR_STOPS,
  popToT, lerpRGB, wikiCityColor, wikiCityOpacity, wikiCityRadius,
  fmtPop, fmtNum, escHtml, escAttr, isoToFlag, safeOnclick,
  _tradeArc, _tradeArrowWeight, _convexHull, _arcLine,
  econDotColor, _econCellDeg, fmtEmployees, fmtRevenue,
  _pointInPolygon, validateCities, cityKey,
  _gaugeWidth, _radarScore, RADAR_INVERTED_KEYS,
};
