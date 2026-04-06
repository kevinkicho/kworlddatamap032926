# Filter Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a slide-in filter panel on the left side of the map that lets users show/dim/hide city dots based on data availability and value thresholds.

**Architecture:** Filter state lives in three globals (`_filterAvail`, `_filterValue`, `_filterDimMode`). A pure function `applyMapFilters(city)` returns `'match'|'dim'|'hide'` for each city. `rebuildMapLayer()` calls this and adjusts dot colour/opacity accordingly. A floating FAB button opens/closes the panel; an active-count badge on the FAB shows how many filters are on.

**Tech Stack:** Vanilla JS, CSS transitions (matches existing wiki sidebar slide-in pattern), Leaflet circleMarker opacity overrides.

---

## File Map

- **Modify:** `public/index.html` — add `#filter-panel` div + `#filter-fab` button
- **Modify:** `public/style.css` — filter panel + FAB styles
- **Modify:** `public/app.js` — filter globals, `applyMapFilters()`, `rebuildMapLayer()` patch, all panel functions

---

### Task 1: HTML — Filter FAB button + panel skeleton

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Add the FAB button** immediately after the `#draw-fab` button (around line 427):

```html
<!-- ── Filter panel FAB ── -->
<button id="filter-fab" onclick="toggleFilterPanel()" title="Filter cities">⚗ Filter</button>
```

- [ ] **Step 2: Add the filter panel div** immediately before the closing `</body>` tag (before `<script src="app.js">`):

```html
<!-- ── Filter Panel ── -->
<div id="filter-panel">
  <div id="filter-panel-header">
    <span id="filter-panel-title">⚗ Filters</span>
    <div id="filter-panel-header-right">
      <button id="filter-clear-btn" onclick="clearAllFilters()">Clear all</button>
      <button id="filter-panel-close" onclick="closeFilterPanel()" title="Close">×</button>
    </div>
  </div>

  <div id="filter-dim-row">
    <span class="filter-row-label">Unmatched cities:</span>
    <div class="filter-btn-group">
      <button class="filter-mode-btn active" data-mode="dim"  onclick="setFilterDimMode('dim')">Dim</button>
      <button class="filter-mode-btn"        data-mode="hide" onclick="setFilterDimMode('hide')">Hide</button>
    </div>
  </div>

  <div class="filter-section-head">Availability</div>
  <div id="filter-avail-list">
    <div class="filter-avail-row">
      <span class="filter-avail-label">🌡 Air Quality</span>
      <button class="filter-avail-btn" data-key="airQuality" onclick="toggleAvailFilter('airQuality')">off</button>
    </div>
    <div class="filter-avail-row">
      <span class="filter-avail-label">🚇 Metro system</span>
      <button class="filter-avail-btn" data-key="metro" onclick="toggleAvailFilter('metro')">off</button>
    </div>
    <div class="filter-avail-row">
      <span class="filter-avail-label">🏅 Nobel laureates</span>
      <button class="filter-avail-btn" data-key="nobel" onclick="toggleAvailFilter('nobel')">off</button>
    </div>
    <div class="filter-avail-row">
      <span class="filter-avail-label">🎓 Universities</span>
      <button class="filter-avail-btn" data-key="universities" onclick="toggleAvailFilter('universities')">off</button>
    </div>
    <div class="filter-avail-row">
      <span class="filter-avail-label">✈ Airport data</span>
      <button class="filter-avail-btn" data-key="airport" onclick="toggleAvailFilter('airport')">off</button>
    </div>
    <div class="filter-avail-row">
      <span class="filter-avail-label">📊 Eurostat</span>
      <button class="filter-avail-btn" data-key="eurostat" onclick="toggleAvailFilter('eurostat')">off</button>
    </div>
    <div class="filter-avail-row">
      <span class="filter-avail-label">🇺🇸 Census (US)</span>
      <button class="filter-avail-btn" data-key="census" onclick="toggleAvailFilter('census')">off</button>
    </div>
  </div>

  <div class="filter-section-head">Value Filters</div>
  <div id="filter-value-list">

    <div class="filter-value-group">
      <div class="filter-value-label">🏅 Nobel Laureates</div>
      <div class="filter-bucket-row" data-metric="nobel">
        <button class="filter-bucket active" data-val="null"  onclick="setValueFilter('nobel', null)">Any</button>
        <button class="filter-bucket"        data-val="1"     onclick="setValueFilter('nobel', 1)">1+</button>
        <button class="filter-bucket"        data-val="5"     onclick="setValueFilter('nobel', 5)">5+</button>
        <button class="filter-bucket"        data-val="10"    onclick="setValueFilter('nobel', 10)">10+</button>
        <button class="filter-bucket"        data-val="20"    onclick="setValueFilter('nobel', 20)">20+</button>
      </div>
    </div>

    <div class="filter-value-group">
      <div class="filter-value-label">🎓 Universities</div>
      <div class="filter-bucket-row" data-metric="universities">
        <button class="filter-bucket active" data-val="null" onclick="setValueFilter('universities', null)">Any</button>
        <button class="filter-bucket"        data-val="1"    onclick="setValueFilter('universities', 1)">1+</button>
        <button class="filter-bucket"        data-val="5"    onclick="setValueFilter('universities', 5)">5+</button>
        <button class="filter-bucket"        data-val="10"   onclick="setValueFilter('universities', 10)">10+</button>
      </div>
    </div>

    <div class="filter-value-group">
      <div class="filter-value-label">👥 Population</div>
      <div class="filter-bucket-row" data-metric="pop">
        <button class="filter-bucket active" data-val="null"     onclick="setValueFilter('pop', null)">Any</button>
        <button class="filter-bucket"        data-val="small"    onclick="setValueFilter('pop', 'small')">&lt;100k</button>
        <button class="filter-bucket"        data-val="medium"   onclick="setValueFilter('pop', 'medium')">100k–1M</button>
        <button class="filter-bucket"        data-val="large"    onclick="setValueFilter('pop', 'large')">1M–10M</button>
        <button class="filter-bucket"        data-val="mega"     onclick="setValueFilter('pop', 'mega')">10M+</button>
      </div>
    </div>

    <div class="filter-value-group">
      <div class="filter-value-label">🚇 Metro Stations</div>
      <div class="filter-bucket-row" data-metric="metro">
        <button class="filter-bucket active" data-val="null"   onclick="setValueFilter('metro', null)">Any</button>
        <button class="filter-bucket"        data-val="1"      onclick="setValueFilter('metro', 1)">Has metro</button>
        <button class="filter-bucket"        data-val="100"    onclick="setValueFilter('metro', 100)">100+</button>
        <button class="filter-bucket"        data-val="500"    onclick="setValueFilter('metro', 500)">500+</button>
      </div>
    </div>

    <div class="filter-value-group">
      <div class="filter-value-label">🌡 Air Quality (PM2.5)</div>
      <div class="filter-bucket-row" data-metric="aq">
        <button class="filter-bucket active"                                       data-val="null"      onclick="setValueFilter('aq', null)">Any</button>
        <button class="filter-bucket" style="--aq:#3fb950;--aqbg:#0f2c12"         data-val="Good"      onclick="setValueFilter('aq', 'Good')">Good</button>
        <button class="filter-bucket" style="--aq:#58a6ff;--aqbg:#162040"         data-val="Acceptable" onclick="setValueFilter('aq', 'Acceptable')">OK</button>
        <button class="filter-bucket" style="--aq:#f0a500;--aqbg:#2a1f08"         data-val="Moderate"  onclick="setValueFilter('aq', 'Moderate')">Mod</button>
        <button class="filter-bucket" style="--aq:#ffa657;--aqbg:#2a1208"         data-val="Poor"      onclick="setValueFilter('aq', 'Poor')">Poor</button>
        <button class="filter-bucket" style="--aq:#f85149;--aqbg:#2a0a0a"         data-val="Very Poor" onclick="setValueFilter('aq', 'Very Poor')">V.Poor</button>
        <button class="filter-bucket" style="--aq:#bc8cff;--aqbg:#1e1028"         data-val="Severe"    onclick="setValueFilter('aq', 'Severe')">Severe</button>
      </div>
    </div>

  </div>

  <div id="filter-panel-footer">
    Showing <span id="filter-match-count">—</span> <span id="filter-total-count"></span>
  </div>
</div>
```

- [ ] **Step 3: Verify HTML is valid** — open `public/index.html` in a browser (or run `node -e "require('fs').readFileSync('public/index.html')"`) — no parse errors expected.

- [ ] **Step 4: Commit**
```bash
git add public/index.html
git commit -m "feat: add filter panel HTML skeleton and FAB button"
```

---

### Task 2: CSS — Filter panel styles

**Files:**
- Modify: `public/style.css`

- [ ] **Step 1: Append all filter panel CSS** at the end of `public/style.css`:

```css
/* ── Filter FAB ── */
#filter-fab {
  position: fixed; bottom: 112px; left: 12px;
  background: #161b22; border: 1px solid #30363d;
  color: #8b949e; border-radius: 8px; padding: 5px 12px;
  font-size: 0.78rem; cursor: pointer; font-family: inherit;
  z-index: 994; box-shadow: 0 2px 12px rgba(0,0,0,0.5);
  transition: background 0.15s, border-color 0.15s, color 0.15s;
  white-space: nowrap; display: flex; align-items: center; gap: 6px;
}
#filter-fab:hover { background: #21262d; border-color: #a371f7; color: #a371f7; }
#filter-fab.active { border-color: #a371f7; color: #a371f7; background: #1a1230; }
#filter-fab-badge {
  background: #f85149; color: #fff; border-radius: 10px;
  padding: 0 5px; font-size: 0.72em; font-weight: 700; display: none;
}

/* ── Filter panel ── */
#filter-panel {
  position: fixed; top: 0; left: -290px; width: 280px; height: 100vh;
  background: #161b22; border-right: 1px solid #30363d;
  z-index: 980; display: flex; flex-direction: column;
  transition: left 0.3s cubic-bezier(.4,0,.2,1);
  box-shadow: 4px 0 24px rgba(0,0,0,0.5); overflow: hidden;
}
#filter-panel.open { left: 0; }

#filter-panel-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px; border-bottom: 1px solid #21262d;
  background: #0d1117; flex-shrink: 0;
}
#filter-panel-title { font-size: 0.9rem; font-weight: 700; color: #e6edf3; }
#filter-panel-header-right { display: flex; align-items: center; gap: 10px; }
#filter-clear-btn {
  background: none; border: none; color: #484f58; font-size: 0.75rem;
  cursor: pointer; font-family: inherit; padding: 0;
}
#filter-clear-btn:hover { color: #f85149; }
#filter-panel-close {
  background: none; border: none; color: #8b949e; font-size: 1.3rem;
  cursor: pointer; line-height: 1; padding: 0 2px;
}
#filter-panel-close:hover { color: #e6edf3; }

#filter-dim-row {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 14px; border-bottom: 1px solid #21262d; flex-shrink: 0;
}
.filter-row-label { font-size: 0.75rem; color: #8b949e; white-space: nowrap; }
.filter-btn-group { display: flex; gap: 4px; }
.filter-mode-btn {
  background: none; border: 1px solid #30363d; color: #6e7681;
  border-radius: 5px; padding: 2px 10px; font-size: 0.75rem;
  cursor: pointer; font-family: inherit;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.filter-mode-btn.active { background: #1a2d1a; border-color: #2ea043; color: #3fb950; }

.filter-section-head {
  padding: 6px 14px 4px 11px; background: #0d1117;
  border-top: 1px solid #21262d; border-bottom: 1px solid #21262d;
  border-left: 3px solid #30363d; color: #6e7681;
  font-size: 0.68rem; font-weight: 700; letter-spacing: 0.07em;
  text-transform: uppercase; flex-shrink: 0;
}

/* Availability rows */
#filter-avail-list { padding: 6px 14px 8px; flex-shrink: 0; border-bottom: 1px solid #21262d; }
.filter-avail-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 4px 0;
}
.filter-avail-label { font-size: 0.8rem; color: #c9d1d9; }
.filter-avail-btn {
  background: #21262d; border: 1px solid #30363d; color: #484f58;
  border-radius: 5px; padding: 1px 8px; font-size: 0.72rem;
  cursor: pointer; font-family: inherit; min-width: 36px; text-align: center;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.filter-avail-btn.on { background: #1a2d1a; border-color: #2ea043; color: #3fb950; }

/* Value filter groups */
#filter-value-list { overflow-y: auto; flex: 1; padding: 6px 14px 8px; }
.filter-value-group { margin-bottom: 10px; }
.filter-value-label { font-size: 0.77rem; color: #8b949e; margin-bottom: 4px; }
.filter-bucket-row { display: flex; gap: 4px; flex-wrap: wrap; }
.filter-bucket {
  background: #21262d; border: 1px solid #30363d; color: #6e7681;
  border-radius: 5px; padding: 2px 7px; font-size: 0.73rem;
  cursor: pointer; font-family: inherit;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.filter-bucket.active { background: #1c2233; border-color: #58a6ff; color: #58a6ff; }
/* AQ buckets use CSS custom properties for per-bucket colour */
.filter-bucket[style] { border-color: var(--aq, #30363d); color: var(--aq, #6e7681); background: #21262d; }
.filter-bucket[style].active { background: var(--aqbg, #21262d); border-color: var(--aq, #30363d); color: var(--aq, #6e7681); }

/* Footer */
#filter-panel-footer {
  padding: 8px 14px; border-top: 1px solid #21262d;
  background: #0d1117; font-size: 0.78rem; color: #8b949e; flex-shrink: 0;
}
#filter-match-count { color: #e6edf3; font-weight: 600; font-variant-numeric: tabular-nums; }
#filter-total-count { color: #484f58; }
```

- [ ] **Step 2: Check CSS brace balance**
```bash
python -c "
css = open('public/style.css').read()
print('opens:', css.count('{'), 'closes:', css.count('}'), 'delta:', css.count('{')-css.count('}'))
"
```
Expected: `delta: 0`

- [ ] **Step 3: Commit**
```bash
git add public/style.css
git commit -m "feat: add filter panel CSS"
```

---

### Task 3: JS — Filter state globals and `applyMapFilters()`

**Files:**
- Modify: `public/app.js`

- [ ] **Step 1: Add filter state globals** immediately after the `let nobelCitiesData` line (search for `let nobelCitiesData`):

```js
// ── Filter panel state ────────────────────────────────────────────────────────
let _filterAvail = {
  airQuality: false, metro: false, nobel: false,
  universities: false, airport: false, eurostat: false, census: false,
};
let _filterValue = {
  nobel: null, universities: null, pop: null, metro: null, aq: null,
};
let _filterDimMode = 'dim';  // 'dim' | 'hide'
```

- [ ] **Step 2: Add `applyMapFilters()` and `_filterCount()`** immediately after the globals added in Step 1:

```js
function applyMapFilters(city) {
  const qid = city.qid;
  // Availability checks
  if (_filterAvail.airQuality   && !airQualityData[qid])   return _filterDimMode;
  if (_filterAvail.metro        && !metroTransitData[qid])  return _filterDimMode;
  if (_filterAvail.nobel        && !nobelCitiesData[qid])   return _filterDimMode;
  if (_filterAvail.universities && !universitiesData[qid])  return _filterDimMode;
  if (_filterAvail.airport      && !airportData[qid])       return _filterDimMode;
  if (_filterAvail.eurostat     && !eurostatCities[qid])    return _filterDimMode;
  if (_filterAvail.census       && !censusCities[qid])      return _filterDimMode;
  // Value filters
  if (_filterValue.nobel != null) {
    if ((nobelCitiesData[qid]?.total ?? 0) < _filterValue.nobel) return _filterDimMode;
  }
  if (_filterValue.universities != null) {
    if ((universitiesData[qid]?.length ?? 0) < _filterValue.universities) return _filterDimMode;
  }
  if (_filterValue.pop != null) {
    const p = city.pop || 0;
    if (_filterValue.pop === 'small'  && p >= 100_000)   return _filterDimMode;
    if (_filterValue.pop === 'medium' && (p < 100_000  || p >= 1_000_000))  return _filterDimMode;
    if (_filterValue.pop === 'large'  && (p < 1_000_000 || p >= 10_000_000)) return _filterDimMode;
    if (_filterValue.pop === 'mega'   && p < 10_000_000) return _filterDimMode;
  }
  if (_filterValue.metro != null) {
    if ((metroTransitData[qid]?.stations ?? 0) < _filterValue.metro) return _filterDimMode;
  }
  if (_filterValue.aq != null) {
    if ((airQualityData[qid]?.category ?? '') !== _filterValue.aq) return _filterDimMode;
  }
  return 'match';
}

function _filterCount() {
  return Object.values(_filterAvail).filter(Boolean).length +
         Object.values(_filterValue).filter(v => v !== null).length;
}

function _anyFilterActive() { return _filterCount() > 0; }
```

- [ ] **Step 3: Verify syntax**
```bash
node --check public/app.js && echo PASS
```
Expected: `PASS`

- [ ] **Step 4: Commit**
```bash
git add public/app.js
git commit -m "feat: add filter state globals and applyMapFilters()"
```

---

### Task 4: JS — Patch `rebuildMapLayer()` to apply filters

**Files:**
- Modify: `public/app.js`

- [ ] **Step 1: Replace the `allCities.forEach` block inside `rebuildMapLayer()`**

Find this block (around line 630):
```js
  allCities.forEach(function (city) {
    const aqCol     = cityAqMode ? airQualityDotColor(city) : null;
    const censusCol = aqCol ? null : censusDotColor(city);
    const color = aqCol || censusCol || wikiCityColor(city.pop);
    const radius = wikiCityRadius(city.pop);
```

Replace with:
```js
  let _filterMatchCount = 0;
  allCities.forEach(function (city) {
    // Apply map filters (availability + value)
    const filterResult = _anyFilterActive() ? applyMapFilters(city) : 'match';
    if (filterResult === 'hide') return;
    const filterDim = filterResult === 'dim';
    if (!filterDim) _filterMatchCount++;

    const aqCol     = (!filterDim && cityAqMode) ? airQualityDotColor(city) : null;
    const censusCol = aqCol ? null : (!filterDim ? censusDotColor(city) : null);
    const color  = filterDim ? '#30363d' : (aqCol || censusCol || wikiCityColor(city.pop));
    const radius = wikiCityRadius(city.pop);
```

- [ ] **Step 2: After the `wikiLayer.addTo(map)` line, add the match-count update:**

Find:
```js
  wikiLayer.addTo(map);
}
```

Replace with:
```js
  wikiLayer.addTo(map);
  // Update filter footer count
  const matchEl = document.getElementById('filter-match-count');
  const totalEl = document.getElementById('filter-total-count');
  if (matchEl) matchEl.textContent = _anyFilterActive() ? _filterMatchCount.toLocaleString() : allCities.length.toLocaleString();
  if (totalEl) totalEl.textContent = _anyFilterActive() ? `of ${allCities.length.toLocaleString()}` : '';
}
```

- [ ] **Step 3: Also patch the opacity line** — find:
```js
    const opacity = (aqCol || censusCol) ? 0.92 : wikiCityOpacity(city.pop);
```
Replace with:
```js
    const opacity = filterDim ? 0.13 : ((aqCol || censusCol) ? 0.92 : wikiCityOpacity(city.pop));
```

- [ ] **Step 4: Verify syntax**
```bash
node --check public/app.js && echo PASS
```
Expected: `PASS`

- [ ] **Step 5: Commit**
```bash
git add public/app.js
git commit -m "feat: integrate filter results into rebuildMapLayer()"
```

---

### Task 5: JS — Panel open/close, FAB badge, dim/hide toggle, clear all

**Files:**
- Modify: `public/app.js`

- [ ] **Step 1: Add panel control functions** after `_anyFilterActive()`:

```js
function toggleFilterPanel() {
  const panel = document.getElementById('filter-panel');
  if (panel.classList.contains('open')) closeFilterPanel();
  else openFilterPanel();
}

function openFilterPanel() {
  // Trigger lazy loads so availability filters have data
  _ensureAirQuality();
  _ensureAirport();
  _ensureUniversities();
  document.getElementById('filter-panel').classList.add('open');
  document.getElementById('filter-fab').classList.add('active');
}

function closeFilterPanel() {
  document.getElementById('filter-panel').classList.remove('open');
  document.getElementById('filter-fab').classList.remove('active');
}

function _updateFilterBadge() {
  const badge = document.getElementById('filter-fab-badge');
  const n = _filterCount();
  if (!badge) return;
  badge.textContent = n;
  badge.style.display = n > 0 ? '' : 'none';
}

function setFilterDimMode(mode) {
  _filterDimMode = mode;
  document.querySelectorAll('.filter-mode-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  rebuildMapLayer();
}

function clearAllFilters() {
  Object.keys(_filterAvail).forEach(k => { _filterAvail[k] = false; });
  Object.keys(_filterValue).forEach(k => { _filterValue[k] = null; });
  document.querySelectorAll('.filter-avail-btn').forEach(b => b.classList.remove('on'));
  document.querySelectorAll('.filter-bucket').forEach(b => {
    b.classList.toggle('active', b.dataset.val === 'null');
  });
  _updateFilterBadge();
  rebuildMapLayer();
}
```

- [ ] **Step 2: Update the FAB button HTML** — the badge span must be inside the button. Go back to `index.html` and update the filter-fab button added in Task 1:

```html
<button id="filter-fab" onclick="toggleFilterPanel()" title="Filter cities">
  ⚗ Filter<span id="filter-fab-badge"></span>
</button>
```

- [ ] **Step 3: Verify syntax**
```bash
node --check public/app.js && echo PASS
```
Expected: `PASS`

- [ ] **Step 4: Commit**
```bash
git add public/app.js public/index.html
git commit -m "feat: add filter panel open/close, FAB badge, dim/hide toggle, clear all"
```

---

### Task 6: JS — Availability filter toggles

**Files:**
- Modify: `public/app.js`

- [ ] **Step 1: Add `toggleAvailFilter()`** after `clearAllFilters()`:

```js
function toggleAvailFilter(key) {
  _filterAvail[key] = !_filterAvail[key];
  const btn = document.querySelector(`.filter-avail-btn[data-key="${key}"]`);
  if (btn) {
    btn.classList.toggle('on', _filterAvail[key]);
    btn.textContent = _filterAvail[key] ? 'ON' : 'off';
  }
  _updateFilterBadge();
  rebuildMapLayer();
}
```

- [ ] **Step 2: Verify syntax**
```bash
node --check public/app.js && echo PASS
```
Expected: `PASS`

- [ ] **Step 3: Commit**
```bash
git add public/app.js
git commit -m "feat: add availability filter toggle"
```

---

### Task 7: JS — Value filter bucket buttons

**Files:**
- Modify: `public/app.js`

- [ ] **Step 1: Add `setValueFilter()`** after `toggleAvailFilter()`:

```js
function setValueFilter(metric, value) {
  // value is null (Any), a number, a string like 'small'/'Good', etc.
  _filterValue[metric] = value;
  // Update button active state in that metric's row
  const row = document.querySelector(`.filter-bucket-row[data-metric="${metric}"]`);
  if (row) {
    row.querySelectorAll('.filter-bucket').forEach(btn => {
      const bval = btn.dataset.val === 'null' ? null : btn.dataset.val;
      const numVal = bval !== null && !isNaN(Number(bval)) ? Number(bval) : bval;
      btn.classList.toggle('active', numVal === value);
    });
  }
  _updateFilterBadge();
  rebuildMapLayer();
}
```

- [ ] **Step 2: Verify syntax**
```bash
node --check public/app.js && echo PASS
```
Expected: `PASS`

- [ ] **Step 3: Commit**
```bash
git add public/app.js
git commit -m "feat: add value filter bucket button handler"
```

---

### Task 8: Manual smoke test

- [ ] **Step 1: Start the dev server**
```bash
cd C:/Users/kevin/OneDrive/Desktop/kworlddatamap032926
node server.js
```

- [ ] **Step 2: Open http://localhost:3000 in the browser**

- [ ] **Step 3: Verify FAB button**
  - "⚗ Filter" button appears fixed bottom-left above the FX and Draw buttons
  - Clicking it slides the filter panel in from the left
  - Clicking again (or ×) closes it

- [ ] **Step 4: Verify availability filters**
  - Toggle "🏅 Nobel laureates" ON → button turns green "ON"
  - Cities without Nobel data dim to grey
  - FAB badge shows "1"
  - Toggle "🎓 Universities" ON → badge shows "2", cities must have both to show normally

- [ ] **Step 5: Verify value filters**
  - Click "20+" under Nobel Laureates → only cities with 20+ laureates show normally (~10 cities)
  - Footer shows "Showing X of 6,603"
  - Click "Any" → filter clears, all cities normal again

- [ ] **Step 6: Verify Dim/Hide toggle**
  - With a filter active, switch "Dim" → "Hide" → unmatched cities disappear entirely
  - Switch back to "Dim" → they reappear faded

- [ ] **Step 7: Verify Clear all**
  - With multiple filters active, click "Clear all" → all filters reset, all cities normal, badge disappears

- [ ] **Step 8: Commit any fixes found during smoke test**
```bash
git add public/app.js public/index.html public/style.css
git commit -m "fix: filter panel smoke test fixes"
```
