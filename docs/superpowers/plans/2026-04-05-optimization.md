# Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce redundancy and improve runtime performance in `public/app.js` through targeted, independently-testable changes.

**Architecture:** All changes are within `public/app.js` (vanilla JS, ~7500 lines). No framework, no build step — verify by running `npm start` and opening the browser. Changes are grouped by risk: quick single-line wins first, then extraction refactors, then structural improvements. Each task is independently deployable and does not depend on the next.

**Tech Stack:** Vanilla JS, Leaflet 1.9, Leaflet.heat, served by a local Node/Express server (`npm start`).

---

## Files Changed

- Modify: `public/app.js` — all changes

---

### Task 1: Three immediate wins — guard, debounce, dead code

Three isolated 1–3 line fixes with no cross-task dependencies.

**Files:**
- Modify: `public/app.js:496` (setHeatPalette guard)
- Modify: `public/app.js:1332` (dead loadEdits call)
- Modify: `public/app.js:4061` (zoomend debounce)

- [ ] **Step 1: Guard `rebuildMapLayer` in `setHeatPalette`**

Current code at line 496 unconditionally rebuilds all ~10k city markers on every palette toggle, even when dot color mode is `'pop'` (palette has no effect on dots in that mode).

Replace the body of `setHeatPalette` (lines 489–497):

```js
function setHeatPalette(name) {
  _heatPalette = name;
  document.querySelectorAll('[data-palette]').forEach(b => {
    b.classList.toggle('active', b.dataset.palette === name);
  });
  _updateAvailIntensityStrips();
  _refreshHeatLayer();
  if (_matchedColorMode === 'metric') rebuildMapLayer();
}
```

- [ ] **Step 2: Remove dead `loadEdits()` call in `sortFiltered`**

`sortFiltered` (line 1331) calls `loadEdits()` and assigns it to a local variable `edits` that is never read. This triggers a `localStorage.getItem` + `JSON.parse` on every table sort for no purpose.

Replace lines 1331–1346:

```js
function sortFiltered() {
  filtered.sort((a, b) => {
    let av, bv;
    if (sortCol === 'pop') { av = a.pop ?? -Infinity; bv = b.pop ?? -Infinity; }
    else if (sortCol === 'name') { av = a.name ?? ''; bv = b.name ?? ''; }
    else if (sortCol === 'country') { av = a.country ?? ''; bv = b.country ?? ''; }
    else if (sortCol === 'founded') {
      av = a.founded ?? (sortDir === 'asc' ? Infinity : -Infinity);
      bv = b.founded ?? (sortDir === 'asc' ? Infinity : -Infinity);
    }
    else return 0;
    if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortDir === 'asc' ? av - bv : bv - av;
  });
}
```

- [ ] **Step 3: Debounce the `zoomend` → `buildEconLayer` handler**

The `zoomend` handler (line 4061) fires `buildEconLayer()` synchronously on every zoom event. A pinch-zoom or scroll-wheel burst fires many events; each triggers an O(n²) cluster merge. Debouncing collapses the burst to one call 150ms after the last event.

Replace the `zoomend` handler (lines 4061–4070). Find this exact block:

```js
  map.on('zoomend', () => {
    if (econOn) buildEconLayer();
    if (_heatmapLayer && _heatmapMetric) {
      const z = map.getZoom();
      // Scale from user-set baseline; zoom-in shrinks radius so individual hotspots stay crisp
      const radius = Math.max(10, _heatRadius  - (z - 5) * 3);
      const blur   = Math.max(5,  _heatBlur    - (z - 5) * 2);
      _heatmapLayer.setOptions({ radius, blur, minOpacity: _heatMinOpacity });
    }
```

Add a debounce variable just before the `map.on('zoomend'` line and update the handler:

```js
  let _econZoomDebounce = null;
  map.on('zoomend', () => {
    if (_heatmapLayer && _heatmapMetric) {
      const z = map.getZoom();
      const radius = Math.max(10, _heatRadius - (z - 5) * 3);
      const blur   = Math.max(5,  _heatBlur   - (z - 5) * 2);
      _heatmapLayer.setOptions({ radius, blur, minOpacity: _heatMinOpacity });
    }
    if (econOn) {
      clearTimeout(_econZoomDebounce);
      _econZoomDebounce = setTimeout(() => buildEconLayer(), 150);
    }
```

- [ ] **Step 4: Verify in browser**

Run `npm start`, open the app.
- Toggle a heatmap metric ON, switch palette while matched color mode is **Pop** → map dots should NOT flicker/redraw (verify via browser DevTools Performance tab or just observe smoothness).
- Click column headers in the city table to sort → no visible change needed, just confirm no JS error in console.
- Turn on the Econ layer, zoom in/out rapidly → economic clusters should update once after zooming stops, not on every tick.

- [ ] **Step 5: Commit**

```bash
git add public/app.js
git commit -m "perf: guard rebuildMapLayer on palette toggle, debounce econ zoomend, remove dead loadEdits call"
```

---

### Task 2: Extract `_cityMetricValue(city, metric)`

The metric-to-value lookup switch (`nobel → .total`, `universities → .length`, `metro → .stations`, `aq → .pm25`, `pop → city.pop`) is copy-pasted identically in three functions: `_buildHeatPoints` (line 543), `_metricDotColor` (line 618), and `_computeP95` (line 691). Adding a new metric currently requires editing all three.

**Files:**
- Modify: `public/app.js` — add `_cityMetricValue`, update three functions

- [ ] **Step 1: Add `_cityMetricValue` just before `_buildHeatPoints` (line 543)**

```js
// Returns the raw numeric value of `metric` for a city (0 if unavailable).
function _cityMetricValue(city, metric) {
  const qid = city.qid;
  if (metric === 'nobel')        return nobelCitiesData[qid]?.total      ?? 0;
  if (metric === 'universities') return universitiesData[qid]?.length    ?? 0;
  if (metric === 'pop')          return city.pop || 0;
  if (metric === 'metro')        return metroTransitData[qid]?.stations  ?? 0;
  if (metric === 'aq')           return airQualityData[qid]?.pm25        ?? 0;
  return 0;
}
```

- [ ] **Step 2: Simplify `_buildHeatPoints` to use `_cityMetricValue`**

Replace the body of `_buildHeatPoints` (lines 543–561):

```js
function _buildHeatPoints(metric) {
  const raw = [];
  for (const city of allCities) {
    const val = _cityMetricValue(city, metric);
    if (val > 0 && _passesMetricValueFilter(metric, city))
      raw.push({ lat: city.lat, lng: city.lng, val });
  }
  if (raw.length === 0) return [];
  const sorted = raw.map(r => r.val).sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1];
  _heatNormP95[metric] = p95;
  return raw.map(r => [r.lat, r.lng, Math.min(r.val / p95, 1.0)]);
}
```

- [ ] **Step 3: Simplify `_metricDotColor` to use `_cityMetricValue`**

Replace the body of `_metricDotColor` (lines 618–627):

```js
function _metricDotColor(city, metric) {
  const val  = _cityMetricValue(city, metric);
  const p95  = _heatNormP95[metric] || 1;
  const t    = Math.min(val / p95, 1.0);
  const stops = _getPaletteStops(metric);
  for (let i = 1; i < stops.length; i++) {
    const [t0, c0] = stops[i - 1];
    const [t1, c1] = stops[i];
    if (t <= t1) return _lerpHex(c0, c1, (t - t0) / (t1 - t0 || 1));
  }
  return stops[stops.length - 1][1];
}
```

- [ ] **Step 4: Simplify `_computeP95` to use `_cityMetricValue`**

Replace the body of `_computeP95` (lines 691–707):

```js
function _computeP95(metric) {
  if (_heatNormP95[metric]) return;
  const vals = allCities.map(c => _cityMetricValue(c, metric)).filter(v => v > 0);
  if (!vals.length) { _heatNormP95[metric] = 1; return; }
  vals.sort((a, b) => a - b);
  _heatNormP95[metric] = vals[Math.floor(vals.length * 0.95)] || vals[vals.length - 1];
}
```

- [ ] **Step 5: Also simplify `_cityHasMetricData` to use `_cityMetricValue`**

`_cityHasMetricData` (around line 599) has the same switch. Replace its body:

```js
function _cityHasMetricData(city, metric) {
  return _cityMetricValue(city, metric) > 0;
}
```

- [ ] **Step 6: Verify in browser**

Run `npm start`. Turn on the Nobel heatmap → gradient should render correctly. Switch to Intensity dot mode → dots should be coloured by Nobel count. Open the filter panel, set Metro 100+ → dots should colour correctly.

- [ ] **Step 7: Commit**

```bash
git add public/app.js
git commit -m "refactor: extract _cityMetricValue, eliminate metric switch duplication across 4 functions"
```

---

### Task 3: Module-level `cityByQid` Map — eliminate O(n) city lookups

`buildGlobalCorpList` (line 6300–6302) and `renderCorpList` (line 5786–5787 area) each build a local `cityByQid` plain object on every call by iterating all cities. These are O(n) per call. A single module-level `Map` built once after `allCities` is populated gives O(1) lookups everywhere.

**Files:**
- Modify: `public/app.js` — add module-level map, update two functions

- [ ] **Step 1: Add module-level `cityByQid` Map declaration near the top globals**

After this line (around line 5, in the module state section):
```js
let allCities = [];      // rawCities with overrides applied
```

Add:
```js
let cityByQid = new Map();  // QID → city object, rebuilt whenever allCities changes
```

- [ ] **Step 2: Populate the map wherever `allCities` is assigned**

Search for `allCities = rawCities` (line ~1119 in `applyOverrides`). After the assignment, add:

```js
  cityByQid = new Map(allCities.map(c => [c.qid, c]));
```

The full `applyOverrides` function should end like:

```js
function applyOverrides() {
  const edits = loadEdits();
  const deleted = loadDeleted();
  allCities = rawCities
    .filter(c => !deleted.has(c._key))
    .map(c => {
      const ov = edits[c._key];
      return ov ? { ...c, ...ov } : c;
    });
  cityByQid = new Map(allCities.map(c => [c.qid, c]));
}
```

- [ ] **Step 3: Remove the local `cityByQid` object from `buildGlobalCorpList`**

In `buildGlobalCorpList` (lines 6300–6302), remove these two lines:
```js
  const cityByQid = {};
  for (const c of allCities) cityByQid[c.qid] = c;
```
And update the lookup on line 6307 from `cityByQid[qid]` to `cityByQid.get(qid)`.

- [ ] **Step 4: Remove the local `cityByQid` object from the econ layer builder**

In `buildEconLayer` / the section around line 5786–5787, remove:
```js
  const cityByQid = {};
  for (const c of allCities) cityByQid[c.qid] = c;
```
And update `cityByQid[qid]` → `cityByQid.get(qid)` in that function.

- [ ] **Step 5: Verify in browser**

Run `npm start`. Open the Global Corporations panel → list should populate correctly. Open a city popup, click Corporations → corp panel should open with the correct city's companies.

- [ ] **Step 6: Commit**

```bash
git add public/app.js
git commit -m "perf: module-level cityByQid Map replaces per-call O(n) city lookups"
```

---

### Task 4: `loadEdits` cache — eliminate repeated localStorage parses

`loadEdits()` is called 6 times across `applyOverrides`, `sortFiltered` (now removed), `renderRows`, `openEditModal`, and related functions. Each call does `JSON.parse(localStorage.getItem(...))` synchronously. With a module-level cache, the parse happens once; subsequent calls return the cached object.

**Files:**
- Modify: `public/app.js` — add `_editsCache`, update `loadEdits`, invalidate on write

- [ ] **Step 1: Find `loadEdits` and all write sites**

`loadEdits` is at line 1045. Find where edits are saved (search for `localStorage.setItem` and `LS_EDITS`):

```bash
grep -n "localStorage.setItem\|saveEdits\|LS_EDITS" public/app.js | head -20
```

Note the line numbers of all write sites.

- [ ] **Step 2: Add `_editsCache` and update `loadEdits`**

Find `function loadEdits()` (line 1045). Replace it:

```js
let _editsCache = null;
function loadEdits() {
  if (_editsCache !== null) return _editsCache;
  try { _editsCache = JSON.parse(localStorage.getItem(LS_EDITS) || '{}'); }
  catch { _editsCache = {}; }
  return _editsCache;
}
```

- [ ] **Step 3: Invalidate the cache wherever edits are written**

Find `saveEdits` (or wherever `localStorage.setItem(LS_EDITS, ...)` is called). After every write, add:

```js
_editsCache = null;
```

Do this for every write site found in Step 1. There should be 1–3 sites.

- [ ] **Step 4: Verify in browser**

Run `npm start`. Edit a city (click a dot → open edit modal → change population → save). Verify the city list updates with the new value. Reload the page, verify the edit persists (loaded from localStorage).

- [ ] **Step 5: Commit**

```bash
git add public/app.js
git commit -m "perf: cache loadEdits result, invalidate on write to avoid repeated JSON.parse"
```

---

### Task 5: Deduplicate inline `finJson` in `renderCorpList`

`renderCorpList` (line 6239–6257) builds an inline 20-field JSON blob identical to `_gcorpFinJson(co)` (line 6340–6359). Any schema change must currently be made in two places.

**Files:**
- Modify: `public/app.js:6239–6257`

- [ ] **Step 1: Replace the inline `finJson` block with a call to `_gcorpFinJson`**

In `renderCorpList`, find lines 6239–6257:
```js
    const finJson = escHtml(JSON.stringify({
      qid: co.qid || null,
      // ... 20 fields ...
      market_cap_currency: co.market_cap_currency || null,
    }));
```

Replace the entire `const finJson = ...` assignment (lines 6239–6257, inclusive) with:
```js
    const finJson = _gcorpFinJson(co);
```

- [ ] **Step 2: Verify in browser**

Run `npm start`. Open a city with corporations (e.g. Tokyo, New York). Click a company row → the company detail panel / chart should open and display financial data correctly.

- [ ] **Step 3: Commit**

```bash
git add public/app.js
git commit -m "refactor: renderCorpList uses _gcorpFinJson, removes 19-line duplicate finJson block"
```

---

### Task 6: Consolidate flag emoji — remove `_cpFlagEmoji`, use `isoToFlag` everywhere

Three functions do the same ISO-2 → flag emoji conversion:
- `_cpFlagEmoji` (line 4544) — used in country panel header
- `isoToFlag` (line 5229) — canonical, used in trade flow panel
- Inline closure somewhere around line 4754

**Files:**
- Modify: `public/app.js:4544–4549` (delete), update call sites

- [ ] **Step 1: Find all call sites of `_cpFlagEmoji` and the inline flag conversion**

```bash
grep -n "_cpFlagEmoji\|0x1F1E6\|fromCodePoint.*1F1" public/app.js
```

Note every line number.

- [ ] **Step 2: Replace every `_cpFlagEmoji(x)` call with `isoToFlag(x)`**

For each call site found, change `_cpFlagEmoji(iso2)` → `isoToFlag(iso2)`.

Note: `isoToFlag` returns `'🌐'` for unknown codes; `_cpFlagEmoji` returns `""`. If any call site depends on the empty-string fallback, use: `isoToFlag(iso2) === '🌐' ? '' : isoToFlag(iso2)`. Check the context at each call site.

- [ ] **Step 3: Delete `_cpFlagEmoji`**

Delete lines 4544–4549:
```js
function _cpFlagEmoji(iso2) {
  if (!iso2 || iso2.length !== 2) return "";
  var base = 0x1F1E6 - 65;
  return String.fromCodePoint(base + iso2.toUpperCase().charCodeAt(0)) +
         String.fromCodePoint(base + iso2.toUpperCase().charCodeAt(1));
}
```

- [ ] **Step 4: Replace any remaining inline flag conversion**

For any inline closure found in Step 1 that isn't a call to `_cpFlagEmoji`, replace the expression with `isoToFlag(iso2)` (adjusting the variable name as needed).

- [ ] **Step 5: Verify in browser**

Run `npm start`. Click a country layer on the map → the country panel should show the correct flag emoji in the header. Hover a trade arc → flag should appear in the trade panel.

- [ ] **Step 6: Commit**

```bash
git add public/app.js
git commit -m "refactor: consolidate flag emoji to isoToFlag, remove _cpFlagEmoji duplicate"
```

---

### Task 7: Hoist `statCell` to module scope

`statCell(label, val, cls, metric)` is defined as an inner function in two separate HTML-building functions: `buildEconomyHtml` (line ~2917) and `buildEurostatHtml` (line ~3690). The two definitions are structurally identical.

**Files:**
- Modify: `public/app.js:2917` area and `public/app.js:3690` area

- [ ] **Step 1: Read both `statCell` definitions to confirm they are identical**

```bash
grep -n -A 6 "function statCell" public/app.js
```

Confirm both have the same signature and body. If there are differences, note them — the module-level version must handle both cases.

- [ ] **Step 2: Add a module-level `statCell` before the first use**

Find the line just before `buildEconomyHtml` (around line 2910). Add:

```js
function statCell(label, val, cls = '', metric = '') {
  const metricAttr = metric ? ` data-metric="${escAttr(metric)}"` : '';
  const clsAttr = cls ? ` class="${escAttr(cls)}"` : '';
  return `<div class="stat-cell"${clsAttr}${metricAttr}><span class="stat-label">${escHtml(label)}</span><span class="stat-value">${val}</span></div>`;
}
```

(Adjust the body to exactly match what both inner functions currently produce — read the actual bodies before writing this.)

- [ ] **Step 3: Delete the inner `statCell` from `buildEconomyHtml`**

Inside `buildEconomyHtml`, find and delete the `function statCell(...)` definition. The outer module-level one will be used automatically.

- [ ] **Step 4: Delete the inner `statCell` from `buildEurostatHtml`**

Same as Step 3 for `buildEurostatHtml`.

- [ ] **Step 5: Verify in browser**

Run `npm start`. Open a city panel for a large city (e.g. Paris — has both economy and Eurostat data). The Economy tab and the Eurostat tab should both render stat cells correctly.

- [ ] **Step 6: Commit**

```bash
git add public/app.js
git commit -m "refactor: hoist statCell to module scope, remove two inner function duplicates"
```

---

### Task 8: Pre-compute `avgScore` and `rankIn` caches after country data loads

`avgScore(axis)` (line 4826) iterates all `countryData` entries on every call and is called 6 times per radar chart render. `rankIn(key, lowerIsBetter)` (line 4897) sorts all peer countries on every call and is called ~10 times per country panel open. Both are called in hot paths (sidebar open = user interaction). Pre-computing removes the repeated O(n) work.

**Files:**
- Modify: `public/app.js` — add two caches, update `avgScore` and `rankIn`

- [ ] **Step 1: Add cache variables near the `countryData` declaration**

Find `let countryData = {};` (line 6). Just after it, add:

```js
let _avgScoreCache = null;    // Map<axisKey, avgScore> — computed once after countryData loads
let _rankCacheByRegion = null; // Map<region, Map<indicatorKey, sortedPeers[]>>
```

- [ ] **Step 2: Add `_buildCountryDataCaches()` function**

Add this function near the other country-panel helpers (before `_buildRadar`, around line 4790):

```js
function _buildCountryDataCaches() {
  // avgScore cache: average score per indicator key across all countries
  _avgScoreCache = new Map();
  const RADAR_AXES = ['gdpPerCapita','hdi','giniIndex','lifeExpectancy','co2PerCapita','educationIndex'];
  for (const key of RADAR_AXES) {
    let sum = 0, count = 0;
    for (const k in countryData) {
      const v = countryData[k]?.[key];
      if (Number.isFinite(v)) { sum += v; count++; }
    }
    _avgScoreCache.set(key, count ? sum / count : 0);
  }

  // rankIn cache: per-region sorted peer arrays per indicator
  _rankCacheByRegion = new Map();
  const ALL_KEYS = Object.keys(Object.values(countryData)[0] || {});
  const regions = [...new Set(Object.values(countryData).map(d => d?.region).filter(Boolean))];
  for (const region of regions) {
    const byKey = new Map();
    for (const key of ALL_KEYS) {
      const peers = [];
      for (const iso in countryData) {
        if (countryData[iso]?.region !== region) continue;
        const v = countryData[iso]?.[key];
        if (Number.isFinite(v)) peers.push({ iso, val: v });
      }
      byKey.set(key, peers); // unsorted; sort lazily on first use per key
    }
    _rankCacheByRegion.set(region, byKey);
  }
}
```

- [ ] **Step 3: Call `_buildCountryDataCaches()` after `countryData` is assigned in `init`**

In the init function, find where `countryData` is assigned (around line 4136–4142):

```js
      countryData = await countryRes.json();
      console.log(`[init] Country data loaded (${Object.keys(countryData).length} countries)`);
```

Add the cache build call immediately after:
```js
      countryData = await countryRes.json();
      console.log(`[init] Country data loaded (${Object.keys(countryData).length} countries)`);
      _buildCountryDataCaches();
```

- [ ] **Step 4: Update `avgScore` inside `_buildRadar` to use the cache**

Find `function avgScore(axis)` (line 4826) inside `_buildRadar`. Replace its body:

```js
  function avgScore(axis) {
    if (_avgScoreCache) return _avgScoreCache.get(axis.key) ?? 0;
    // fallback: compute live if cache not ready
    var sum = 0, count = 0;
    for (var k in countryData) {
      var v = (countryData[k] || {})[axis.key];
      if (Number.isFinite(v)) { sum += v; count++; }
    }
    return count ? sum / count : 0;
  }
```

- [ ] **Step 5: Update `rankIn` inside `_buildRankChips` to use the cache**

Find `function rankIn(key, lowerIsBetter)` (line 4897) inside `_buildRankChips`. Replace its body:

```js
  function rankIn(key, lowerIsBetter) {
    let peers;
    if (_rankCacheByRegion) {
      const regionMap = _rankCacheByRegion.get(region);
      if (!regionMap) return null;
      let cached = regionMap.get(key);
      if (!cached) return null;
      // sort on first use for this key (lazy sort)
      if (!regionMap.get(key + '__sorted_' + lowerIsBetter)) {
        cached = cached.slice().sort((a, b) => lowerIsBetter ? a.val - b.val : b.val - a.val);
        regionMap.set(key + '__sorted_' + lowerIsBetter, cached);
      } else {
        cached = regionMap.get(key + '__sorted_' + lowerIsBetter);
      }
      peers = cached;
    } else {
      // fallback: compute live
      peers = [];
      for (var k in countryData) {
        if (countryData[k]?.region !== region) continue;
        var v = countryData[k]?.[key];
        if (Number.isFinite(v)) peers.push({ iso: k, val: v });
      }
      peers.sort((a, b) => lowerIsBetter ? a.val - b.val : b.val - a.val);
    }
    if (peers.length < 2) return null;
    var pos = peers.findIndex(p => p.iso === iso2);
    if (pos < 0) return null;
    return { rank: pos + 1, total: peers.length };
  }
```

- [ ] **Step 6: Verify in browser**

Run `npm start`. Click on a large country's territory → country panel should open. The radar chart should render with the world-average polygon. The rank chips (e.g. "3rd / 12 in region") should appear for applicable indicators.

- [ ] **Step 7: Commit**

```bash
git add public/app.js
git commit -m "perf: pre-compute avgScore and rankIn caches after countryData loads, eliminate O(n) work per sidebar open"
```

---

### Task 9: Lazy loader factory — replace 9 copy-pasted loaders

Nine async functions (lines 22–198) share an identical structure: check a `_loaded` flag, check an in-flight `_loading` promise, fetch a URL, assign to a global, log success, call `rebuildMapLayer` if filter/heatmap is active, handle error, set `_loaded = true` in finally. The only differences are the URL, the target global, and the optional `rebuildMapLayer` condition. A factory function collapses this to one-liners.

**Files:**
- Modify: `public/app.js:1–198`

- [ ] **Step 1: Add `createLazyLoader` factory before the existing loaders (before line 19)**

```js
/**
 * Creates a lazy data loader function.
 * @param {string} url - URL to fetch (JSON)
 * @param {function(data): void} assign - called with parsed data on success
 * @param {function(): boolean} [shouldRebuild] - if provided and returns true after load, rebuildMapLayer() is called
 * @returns {{ ensure: function(): Promise<void>, loaded: function(): boolean }}
 */
function createLazyLoader(url, assign, shouldRebuild) {
  let loaded = false, loading = null;
  async function ensure() {
    if (loaded) return;
    if (loading) return loading;
    loading = (async () => {
      try {
        const res = await fetch(url);
        if (res.ok) {
          assign(await res.json());
          console.log(`[lazy] ${url} loaded`);
          if (shouldRebuild && shouldRebuild()) rebuildMapLayer();
        }
      } catch (e) {
        console.warn(`[lazy] ${url} failed`, e);
      } finally {
        loaded = true;
        loading = null;
      }
    })();
    return loading;
  }
  return { ensure, isLoaded: () => loaded };
}
```

- [ ] **Step 2: Replace all 9 loader pairs (flag + function) with factory calls**

Delete lines 19–198 (all 9 loaders and their flag variables) and replace with:

```js
// ── Lazy dataset loaders ──────────────────────────────────────────────────────
const _worldGeoLoader      = createLazyLoader('/world-countries.json',
  d => { worldGeo = d; _computeCountryCentroids(); });

const _eurostatLoader      = createLazyLoader('/eurostat-cities.json',
  d => { eurostatCities = d; },
  () => _filterAvail.eurostat);

const _companiesLoader     = createLazyLoader('/companies.json',
  d => { companiesData = d; });

const _univLoader          = createLazyLoader('/universities.json',
  d => { universitiesData = d; },
  () => _filterAvail.universities || _filterValue.universities != null || _heatmapMetric === 'universities');

const _noaaLoader          = createLazyLoader('/noaa-climate.json',
  d => { noaaClimate = d; });

const _airportLoader       = createLazyLoader('/airport-connectivity.json',
  d => { airportData = d; },
  () => _filterAvail.airport);

const _aqLoader            = createLazyLoader('/who-airquality.json',
  d => { airQualityData = d; },
  () => _filterAvail.airQuality || _filterValue.aq != null || _heatmapMetric === 'aq');

const _metroLoader         = createLazyLoader('/metro-transit.json',
  d => { metroTransitData = d; },
  () => _filterAvail.metro || _filterValue.metro != null || _heatmapMetric === 'metro');

const _nobelLoader         = createLazyLoader('/nobel-cities.json',
  d => { nobelCitiesData = d; },
  () => _filterAvail.nobel || _filterValue.nobel != null || _heatmapMetric === 'nobel');
```

- [ ] **Step 3: Update all `_ensureXxx()` call sites to use `.ensure()`**

Search for every call to the old functions:
```bash
grep -n "_ensureWorldGeo\|_ensureEurostat\|_ensureCompanies\|_ensureUniversities\|_ensureNoaaClimate\|_ensureAirport\|_ensureAirQuality\|_ensureMetroTransit\|_ensureNobelCities" public/app.js
```

Replace each call:
- `_ensureWorldGeo()` → `_worldGeoLoader.ensure()`
- `_ensureEurostat()` → `_eurostatLoader.ensure()`
- `_ensureCompanies()` → `_companiesLoader.ensure()`
- `_ensureUniversities()` → `_univLoader.ensure()`
- `_ensureNoaaClimate()` → `_noaaLoader.ensure()`
- `_ensureAirport()` → `_airportLoader.ensure()`
- `_ensureAirQuality()` → `_aqLoader.ensure()`
- `_ensureMetroTransit()` → `_metroLoader.ensure()`
- `_ensureNobelCities()` → `_nobelLoader.ensure()`

Also update any `_companiesLoaded` / `_eurostatLoaded` etc. flag checks to use `.isLoaded()` on the respective loader, or just remove them if the old functions were the only consumers.

- [ ] **Step 4: Verify in browser**

Run `npm start`. Open the filter panel → click Availability → Air Quality ON → cities with AQ data should show. Turn on the Nobel heatmap → gradient should appear. Open a city in Europe → Eurostat tab should load. Open a US city → NOAA climate data should appear.

- [ ] **Step 5: Commit**

```bash
git add public/app.js
git commit -m "refactor: replace 9 copy-pasted lazy loaders with createLazyLoader factory (~130 lines eliminated)"
```

---

## Self-Review

**Spec coverage check:**
- A1 (rebuildMapLayer marker reuse) — intentionally out of scope; most invasive change, left for a dedicated session
- A11 (init Promise.all split) — intentionally out of scope; requires careful coordination with loading UI
- B8 (_setActiveBtn) — intentionally omitted; the pattern is clear but the dot controls are already working correctly and the gain is cosmetic; not worth the risk in this pass
- All other Tier 1 and Tier 2 audit items are covered

**Placeholder scan:** No TBDs or vague steps — all code blocks are complete.

**Type consistency:** `createLazyLoader` returns `{ ensure, isLoaded }` and all call sites use `.ensure()` — consistent throughout Task 9.
