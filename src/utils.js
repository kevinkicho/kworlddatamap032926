// ── Pure utility functions — no state dependencies ───────────────────────────

// Color scale: log-population → continuous color + opacity
export const COLOR_STOPS = [
  [0.00, [80, 50, 200]],   // dim indigo   — ~10k
  [0.28, [40, 120, 255]],   // blue          — ~100k
  [0.50, [20, 200, 210]],   // cyan/teal     — ~600k
  [0.68, [80, 220, 80]],   // green         — ~2M
  [0.82, [250, 210, 30]],   // amber         — ~7M
  [0.92, [250, 120, 20]],   // orange        — ~18M
  [1.00, [240, 30, 30]],   // red           — 40M+
];

export function popToT(pop) {
  if (!pop || pop <= 0) return 0;
  const lo = Math.log10(10_000);
  const hi = Math.log10(40_000_000);
  return Math.min(1, Math.max(0, (Math.log10(pop) - lo) / (hi - lo)));
}

export function lerpRGB(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

export function wikiCityColor(pop) {
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

export function wikiCityOpacity(pop) { return 0.35 + popToT(pop) * 0.60; }

export function wikiCityRadius(pop) { return Math.max(2, Math.min(12, Math.sqrt(pop / 1e6) * 3)); }

export function fmtPop(pop) {
  if (pop == null) return '—';
  if (pop >= 1e6) return (pop / 1e6).toFixed(1) + 'M';
  if (pop >= 1e3) return (pop / 1e3).toFixed(0) + 'k';
  return String(pop);
}

export function fmtNum(n) { return n == null ? '—' : n.toLocaleString(); }

export function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function escAttr(str) {
  return String(str ?? '').replace(/'/g, '&#39;');
}

export function isoToFlag(iso2) {
  if (!iso2 || iso2.length !== 2) return '🌐';
  return [...iso2.toUpperCase()].map(c =>
    String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)
  ).join('');
}

export function fmtEmployees(n) {
  if (!n) return null;
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1000) return Math.round(n / 1000) + 'k';
  return n.toLocaleString();
}

export function fmtRevenue(n) {
  if (!n) return null;
  if (Math.abs(n) >= 1e12) return (n / 1e12).toFixed(1) + 'T';
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(0) + 'M';
  return n.toLocaleString();
}

export function validateCities(data) {
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
  if (bad.length) console.warn(`[init] Skipped ${bad.length} malformed city records (missing name/lat/lng)`);
  if (valid.length === 0) throw new Error('cities-full.json contains no valid city records');
  return valid;
}

export function cityKey(c) {
  return c.qid || (c.lat + ',' + c.lng);
}
