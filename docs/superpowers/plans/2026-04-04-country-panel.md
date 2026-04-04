# Country Sidebar Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the floating `showCountryPopup()` with a 600px slide-in sidebar panel showing bar gauges, SVG radar vs world average, regional rank chips, and IYChart historical trend charts for every national indicator.

**Architecture:** All new code goes into existing files (`public/app.js`, `public/style.css`, `public/index.html`). Two fetch scripts are modified to retain historical series. Six focused functions handle the panel lifecycle. Pure data helpers are extracted to `lib/pure-utils.cjs` so they can be unit tested.

**Tech Stack:** Vanilla JS, Leaflet.js, SVG (inline strings), `_IYChart` (existing canvas chart), `node:test` + `node:assert`, Node.js CommonJS.

**Security:** All user-facing strings from JSON data must pass through `escHtml()` before DOM insertion. Colors and computed numbers are safe without escaping.

---

## File Map

| File | Change |
|---|---|
| `scripts/fetch-imf.js` | Add `extractHistory()`; store `*_history` arrays |
| `scripts/fetch-country-data.js` | Accumulate all WB years; store `*_history` arrays for gdp_per_capita + life_expectancy |
| `lib/pure-utils.cjs` | Add `_radarScore`, `_gaugeWidth` |
| `tests/pure-utils.test.js` | Tests for `_radarScore`, `_gaugeWidth` |
| `public/index.html` | Replace `#country-popup` with `#country-panel` shell |
| `public/style.css` | ~60 lines: slide-in panel, gauges, radar, tabs |
| `public/app.js` | 6 new functions; replace `showCountryPopup` call; update `openWikiSidebar` |

---

## Task 1: Update fetch-imf.js — add history arrays

**Files:** Modify `scripts/fetch-imf.js`

- [ ] **Step 1: Add `extractHistory` after `pickBest` (~line 117)**

```js
function extractHistory(yearMap) {
  if (!yearMap || typeof yearMap !== 'object') return [];
  return Object.entries(yearMap)
    .map(([yr, v]) => [Number(yr), v])
    .filter(([yr, v]) => yr <= CURRENT_YEAR && v != null && isFinite(Number(v)))
    .sort((a, b) => a[0] - b[0])
    .map(([yr, v]) => [yr, parseFloat(Number(v).toFixed(3))]);
}
```

- [ ] **Step 2: Store history in the main loop (~line 152-163)**

```js
// BEFORE:
out[iso2][key]           = best.value;
out[iso2][key + '_year'] = best.year;

// AFTER:
out[iso2][key]               = best.value;
out[iso2][key + '_year']     = best.year;
out[iso2][key + '_history']  = extractHistory(yearMap);
```

- [ ] **Step 3: Re-run the script**

```bash
npm run fetch-imf
```

Expected: `Countries saved : 193   File size : ~120 KB`

- [ ] **Step 4: Verify output**

```bash
node -e "
const d = require('./public/imf-fiscal.json');
const us = d['US'];
console.log('debt value:', us.govt_debt_gdp);
console.log('history length:', us.govt_debt_gdp_history?.length);
console.log('first entry:', us.govt_debt_gdp_history?.[0]);
console.log('last entry:', us.govt_debt_gdp_history?.at(-1));
"
```

Expected: history length >= 5, entries like `[ 2015, 104.8 ]`.

- [ ] **Step 5: Commit**

```bash
git add scripts/fetch-imf.js public/imf-fiscal.json
git commit -m "feat: store _history arrays in imf-fiscal.json for trend charts"
```

---

## Task 2: Update fetch-country-data.js — add history arrays

**Files:** Modify `scripts/fetch-country-data.js`

- [ ] **Step 1: Add `all` tracker alongside `best` (~line 81)**

```js
const best = {};   // iso2 -> { value, date }   (most-recent)
const all  = {};   // iso2 -> [{ value, date }]  (all years)
```

- [ ] **Step 2: In the row loop, also push into `all` (after the existing `best` update)**

```js
if (!all[iso2]) all[iso2] = [];
all[iso2].push({ value: row.value, date: row.date });
```

- [ ] **Step 3: After the existing `best` write loop, add history write**

```js
if (indicator.key === 'gdp_per_capita' || indicator.key === 'life_expectancy') {
  for (const [iso2, entries] of Object.entries(all)) {
    if (!out[iso2]) out[iso2] = {};
    out[iso2][indicator.key + '_history'] = entries
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .map(e => [parseInt(String(e.date)), parseFloat(Number(e.value).toFixed(2))]);
  }
}
```

- [ ] **Step 4: Re-run**

```bash
npm run fetch-country-data
```

Typical runtime: 3-5 minutes.

- [ ] **Step 5: Verify**

```bash
node -e "
const d = require('./public/country-data.json');
const us = d['US'];
console.log('gdp history length:', us.gdp_per_capita_history?.length);
console.log('gdp history tail:', us.gdp_per_capita_history?.slice(-3));
console.log('life exp history:', us.life_expectancy_history?.slice(-2));
"
```

- [ ] **Step 6: Commit**

```bash
git add scripts/fetch-country-data.js public/country-data.json
git commit -m "feat: store _history arrays in country-data.json for trend charts"
```

---

## Task 3: Add pure helpers to lib/pure-utils.cjs + tests

**Files:** Modify lib/pure-utils.cjs and tests/pure-utils.test.js

- [ ] **Step 1: Write failing tests at bottom of tests/pure-utils.test.js**

Add two test suites for _gaugeWidth (6 cases) and _radarScore (5 cases) to the destructure at file top.

_gaugeWidth: null value returns 0; zero worldMax returns 0; at worldMax returns 100; above worldMax clamps to 100; half worldMax returns 50; result is integer.

_radarScore: null returns 0; higher gdp_per_capita gives higher score; lower govt_debt_gdp gives higher score (inverted); clamps to max 1; clamps to min 0.

- [ ] **Step 2: Run npm test -- confirm two suites fail**

- [ ] **Step 3: Add helpers to lib/pure-utils.cjs before module.exports**

    function _gaugeWidth(value, worldMax) {
      if (value == null || !worldMax) return 0;
      return Math.round(Math.min(100, Math.max(0, (value / worldMax) * 100)));
    }

    const RADAR_INVERTED_KEYS = new Set(["govt_debt_gdp", "cpi_inflation", "unemployment_rate"]);

    function _radarScore(key, value, worldMax) {
      if (value == null || !worldMax) return 0;
      if (key === "fiscal_balance_gdp") return Math.min(1, Math.max(0, (value + 15) / 30));
      const raw = Math.min(1, Math.max(0, value / worldMax));
      return RADAR_INVERTED_KEYS.has(key) ? 1 - raw : raw;
    }

- [ ] **Step 4: Add _gaugeWidth, _radarScore, RADAR_INVERTED_KEYS to module.exports**

- [ ] **Step 5: Run npm test -- all 106+ tests pass**

- [ ] **Step 6: Commit**

    git add lib/pure-utils.cjs tests/pure-utils.test.js
    git commit -m "feat: add _gaugeWidth and _radarScore pure helpers with tests"

---

## Task 4: Replace country-popup HTML in index.html

**Files:** Modify public/index.html

- [ ] **Step 1: Replace the #country-popup div (lines ~298-301)**

Remove: div#country-popup containing button#country-popup-close and div#country-popup-content.

Replace with:

    <!-- Country sidebar panel -->
    <div id="country-panel">
      <div id="cp-header"></div>
      <div id="cp-stats-row"></div>
      <div id="cp-body"></div>
      <div id="cp-trend-section">
        <div id="cp-trend-tabs"></div>
        <div id="cp-trend-chart"></div>
      </div>
    </div>

- [ ] **Step 2: Verify with node**

    node -e "const h=require("fs").readFileSync("./public/index.html","utf8"); console.log(h.includes("country-panel"), !h.includes("country-popup"));"

Expected: true true

- [ ] **Step 3: Commit**

    git add public/index.html
    git commit -m "feat: add country panel HTML shell to index.html"

---

## Task 5: Add panel CSS to style.css

**Files:** Modify public/style.css

- [ ] **Step 1: Replace #country-popup block (~lines 63-83) with the panel styles**

See spec doc section 3 for visual layout. Complete CSS to add:

```css
#country-panel {
  position: fixed; top: 0; right: 0; width: 600px; height: 100vh;
  background: #0d1117; border-left: 1px solid #30363d;
  z-index: 1100; display: flex; flex-direction: column;
  transform: translateX(100%); transition: transform 0.25s ease;
  box-shadow: -8px 0 32px rgba(0,0,0,0.7); overflow: hidden; pointer-events: none;
}
#country-panel.open { transform: translateX(0); pointer-events: auto; }
#cp-header { display: flex; align-items: center; gap: 10px; padding: 12px 16px;
  border-bottom: 1px solid #21262d; background: #161b22; flex-shrink: 0; }
.cp-flag { font-size: 1.6rem; line-height: 1; }
.cp-title-block { flex: 1; min-width: 0; }
.cp-country-name { font-size: 1rem; font-weight: 700; color: #e6edf3; }
.cp-country-meta { font-size: 0.72rem; color: #8b949e; margin-top: 1px; }
.cp-close { background: none; border: none; color: #8b949e; font-size: 1.3rem;
  cursor: pointer; padding: 0 2px; line-height: 1; flex-shrink: 0; }
.cp-close:hover { color: #e6edf3; }
#cp-stats-row { display: grid; grid-template-columns: repeat(4, 1fr);
  gap: 1px; background: #21262d; border-bottom: 1px solid #21262d; flex-shrink: 0; }
.cp-stat-card { background: #161b22; padding: 10px 12px; text-align: center; }
.cp-stat-value { font-size: 1.05rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.cp-stat-label { font-size: 0.68rem; color: #8b949e; margin-top: 2px; letter-spacing: .03em; }
#cp-body { display: flex; flex: 1; overflow: hidden; min-height: 0; }
.cp-gauges { width: 55%; border-right: 1px solid #21262d; overflow-y: auto;
  padding: 12px 14px; display: flex; flex-direction: column; gap: 4px; }
.cp-radar-col { width: 45%; overflow-y: auto; padding: 12px 14px;
  display: flex; flex-direction: column; gap: 10px; }
.cp-gauge-group { margin-top: 6px; }
.cp-gauge-group-label { font-size: 0.65rem; color: #484f58; font-weight: 700;
  letter-spacing: .06em; text-transform: uppercase; margin-bottom: 5px;
  padding-bottom: 3px; border-bottom: 1px solid #21262d; }
.cp-gauge-row { display: flex; align-items: center; gap: 6px; margin-bottom: 5px; }
.cp-gauge-label { font-size: 0.72rem; color: #8b949e; width: 88px; flex-shrink: 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cp-gauge-bar-wrap { flex: 1; height: 4px; background: #21262d; border-radius: 2px; overflow: hidden; }
.cp-gauge-bar { height: 100%; border-radius: 2px; transition: width 0.4s ease; }
.cp-gauge-val { font-size: 0.72rem; font-variant-numeric: tabular-nums; width: 52px; text-align: right; flex-shrink: 0; }
.cp-radar-title { font-size: 0.68rem; color: #484f58; letter-spacing: .06em; text-transform: uppercase; }
.cp-radar-svg { display: block; margin: 0 auto; }
.cp-rank-chips { display: flex; flex-direction: column; gap: 4px; }
.cp-rank-chip { font-size: 0.72rem; color: #8b949e; background: #161b22;
  border: 1px solid #21262d; border-radius: 3px; padding: 3px 7px; white-space: nowrap; }
#cp-trend-section { border-top: 1px solid #21262d; flex-shrink: 0; background: #0d1117; }
#cp-trend-tabs { display: flex; gap: 2px; padding: 6px 10px 0; overflow-x: auto;
  background: #161b22; border-bottom: 1px solid #21262d; }
.cp-tab { background: none; border: none; color: #8b949e; font-size: 0.72rem;
  cursor: pointer; padding: 5px 8px; border-radius: 4px 4px 0 0;
  white-space: nowrap; font-family: inherit; }
.cp-tab:hover { color: #e6edf3; background: #21262d; }
.cp-tab.active { color: #58a6ff; background: #21262d; border-bottom: 2px solid #58a6ff; }
#cp-trend-chart { height: 110px; padding: 8px 12px; }
```

- [ ] **Step 2: Delete the stale .choro-popup-* block (search for "Country popup (choropleth click)")**

Delete from that comment through .choro-popup-highlight rule.

- [ ] **Step 3: Commit**

```bash
git add public/style.css
git commit -m "feat: add country panel CSS (slide-in, gauges, radar, tabs)"
```

---

## Task 6: Implement openCountryPanel + closeCountryPanel in app.js

**Files:** Modify public/app.js

- [ ] **Step 1: Add globals after let imfFiscal (~line 1624)**

    let _cpCurrentIso2 = null;
    let _cpEscListener = null;

    const ISO2_TO_ISO3 = { US:"USA", GB:"GBR", DE:"DEU", FR:"FRA", JP:"JPN",
      CN:"CHN", IN:"IND", BR:"BRA", CA:"CAN", AU:"AUS", KR:"KOR", MX:"MEX",
      ID:"IDN", TR:"TUR", SA:"SAU", RU:"RUS", ZA:"ZAF", AR:"ARG", NG:"NGA",
      IT:"ITA", ES:"ESP", PL:"POL", NL:"NLD", CH:"CHE", SE:"SWE", NO:"NOR",
      DK:"DNK", FI:"FIN", BE:"BEL", AT:"AUT", PT:"PRT", GR:"GRC", CZ:"CZE",
      HU:"HUN", RO:"ROU", UA:"UKR", IL:"ISR", AE:"ARE", SG:"SGP",
      MY:"MYS", TH:"THA", VN:"VNM", PH:"PHL", PK:"PAK", BD:"BGD" };

- [ ] **Step 2: Replace showCountryPopup function (lines ~2877-2992)**

    function openCountryPanel(iso2) {
      if (!iso2) return;
      const c = countryData[iso2];
      if (!c) return;
      _cpCurrentIso2 = iso2;
      _renderCountryPanel(iso2);
      document.getElementById("country-panel").classList.add("open");
      if (choroplethLayer) {
        choroplethLayer.eachLayer(layer => {
          const liso = layer.feature?.properties?.iso2;
          if (liso === iso2) layer.setStyle({ weight: 2.5, color: "#58a6ff" });
          else choroplethLayer.resetStyle(layer);
        });
      }
      if (_cpEscListener) document.removeEventListener("keydown", _cpEscListener);
      _cpEscListener = (e) => { if (e.key === "Escape") closeCountryPanel(); };
      document.addEventListener("keydown", _cpEscListener);
      _loadAndShowTrade(iso2, c.name || iso2);
    }

    function closeCountryPanel() {
      _cpCurrentIso2 = null;
      document.getElementById("country-panel").classList.remove("open");
      if (_cpEscListener) {
        document.removeEventListener("keydown", _cpEscListener);
        _cpEscListener = null;
      }
      if (choroplethLayer) choroplethLayer.eachLayer(l => choroplethLayer.resetStyle(l));
    }

- [ ] **Step 3: Replace closeCountryPopup (~line 3328) with shim**

    function closeCountryPopup() { closeCountryPanel(); }

- [ ] **Step 4: Update choropleth click handler (~line 2838)**

Change: showCountryPopup(iso2, e.latlng)
To:     openCountryPanel(iso2)

- [ ] **Step 5: Add closeCountryPanel() as first call in openWikiSidebar (~line 2320)**

- [ ] **Step 6: Add map background click handler after buildChoropleth call (~line 2730)**

    map.on("click", function () { if (_cpCurrentIso2) closeCountryPanel(); });

- [ ] **Step 7: Open browser -- empty panel should slide in on country click, ESC closes it**

- [ ] **Step 8: Commit**

    git add public/app.js
    git commit -m "feat: wire openCountryPanel/closeCountryPanel, replace showCountryPopup"

---

## Task 7: _renderCountryPanel -- Build Panel HTML

**Files:**
- Modify: `public/app.js` (after closeCountryPanel from Task 6)

- [ ] **Step 1: Add helper functions and _renderCountryPanel to app.js**

```javascript
// ---- internal helpers -------------------------------------------------
function _cpFmt(val, decimals) {
  if (val == null || isNaN(val)) return "--";
  decimals = (decimals == null) ? 1 : decimals;
  if (Math.abs(val) >= 1e9)  return (val/1e9).toFixed(decimals)  + "B";
  if (Math.abs(val) >= 1e6)  return (val/1e6).toFixed(decimals)  + "M";
  if (Math.abs(val) >= 1e3)  return (val/1e3).toFixed(decimals)  + "K";
  return val.toFixed(decimals);
}

function _cpWorldMax(key) {
  var max = 0;
  for (var k in countryData) {
    var v = countryData[k][key];
    if (v != null && !isNaN(v) && v > max) max = v;
  }
  return max || 1;
}

function _cpFlagEmoji(iso2) {
  if (!iso2 || iso2.length !== 2) return "";
  var base = 0x1F1E6 - 65;
  return String.fromCodePoint(base + iso2.toUpperCase().charCodeAt(0)) +
         String.fromCodePoint(base + iso2.toUpperCase().charCodeAt(1));
}

function _cpGauge(label, val, max, suffix, cls) {
  suffix = suffix || "";
  cls    = cls    || "";
  if (val == null || isNaN(val)) {
    return "<div class=\"cp-gauge-row\"><span class=\"cp-gauge-lbl\">" + escHtml(label) + "</span><span class=\"cp-gauge-nil\">--</span></div>";
  }
  var pct = Math.min(100, (val / max) * 100).toFixed(1);
  return "<div class=\"cp-gauge-row " + cls + "\">" +
    "<span class=\"cp-gauge-lbl\">" + escHtml(label) + "</span>" +
    "<div class=\"cp-gauge-bar\"><div class=\"cp-gauge-fill\" style=\"width:" + pct + "%\"></div></div>" +
    "<span class=\"cp-gauge-val\">" + val.toFixed(1) + suffix + "</span></div>";
}

// ---- _renderCountryPanel ----------------------------------------------
function _renderCountryPanel(iso2) {
  var cd = countryData[iso2];
  if (!cd) return;

  // header
  document.getElementById("cp-header").innerHTML =
    "<div class=\"cp-header-inner\">" +
      "<span class=\"cp-flag\">" + _cpFlagEmoji(iso2) + "</span>" +
      "<span class=\"cp-name\">" + escHtml(cd.name || iso2) + "</span>" +
      "<span class=\"cp-meta\">" + escHtml(cd.region || "") +
        (cd.income_level ? " · " + escHtml(cd.income_level) : "") +
        " · " + escHtml(iso2) + "</span>" +
      "<button class=\"cp-close\" onclick=\"closeCountryPanel()\">×</button>" +
    "</div>";

  // ---- 4 stat cards ----
  var gdp  = cd.gdp_per_capita,    inf  = cd.cpi_inflation;
  var debt = cd.govt_debt_gdp,     fisc = cd.fiscal_balance_gdp;
  var infCls  = inf  == null ? "" : inf  > 5  ? "cp-red" : inf  > 3 ? "cp-amber" : "cp-green";
  var debtCls = debt == null ? "" : debt > 90 ? "cp-red" : debt > 60 ? "cp-amber" : "";
  var fiscCls = fisc == null ? "" : fisc >= 0 ? "cp-green" : "cp-red";
  document.getElementById("cp-stats-row").innerHTML =
    "<div class=\"cp-stat-cards\">" +
      "<div class=\"cp-stat-card cp-blue\"><div class=\"cp-stat-val\">" + (gdp  != null ? "$" + _cpFmt(gdp, 0)    : "--") + "</div><div class=\"cp-stat-lbl\">GDP/cap</div></div>" +
      "<div class=\"cp-stat-card " + infCls  + "\"><div class=\"cp-stat-val\">" + (inf  != null ? inf.toFixed(1)  + "%" : "--") + "</div><div class=\"cp-stat-lbl\">Inflation</div></div>" +
      "<div class=\"cp-stat-card " + debtCls + "\"><div class=\"cp-stat-val\">" + (debt != null ? debt.toFixed(0) + "%" : "--") + "</div><div class=\"cp-stat-lbl\">Debt/GDP</div></div>" +
      "<div class=\"cp-stat-card " + fiscCls + "\"><div class=\"cp-stat-val\">" + (fisc != null ? (fisc >= 0 ? "+" : "") + fisc.toFixed(1) + "%" : "--") + "</div><div class=\"cp-stat-lbl\">Fiscal Bal</div></div>" +
    "</div>";

  // ---- bar gauges ----
  var maxGdp = _cpWorldMax("gdp_per_capita"), maxLife  = _cpWorldMax("life_expectancy");
  var maxDebt = _cpWorldMax("govt_debt_gdp"), maxInf   = _cpWorldMax("cpi_inflation");
  var maxUnemp = _cpWorldMax("unemployment_rate"), maxYld = _cpWorldMax("bond_yield_10y");

  var leftHtml =
    "<div class=\"cp-gauges\">" +
      "<div class=\"cp-gauge-section-hdr\">World Bank</div>" +
      _cpGauge("GDP/cap",    gdp,                   maxGdp,   "",    "cp-blue") +
      _cpGauge("Life exp",   cd.life_expectancy,    maxLife,  " yrs") +
      (cd.population != null ? "<div class=\"cp-gauge-row\"><span class=\"cp-gauge-lbl\">Population</span><span class=\"cp-gauge-info\">" + _cpFmt(cd.population, 1) + "</span></div>" : "") +
      "<div class=\"cp-gauge-section-hdr\">IMF</div>" +
      _cpGauge("Debt/GDP",    debt,                            maxDebt,  "%") +
      _cpGauge("Fiscal bal",  fisc != null ? Math.abs(fisc) : null, 20, "%", fiscCls) +
      _cpGauge("CPI Inflation", inf != null ? Math.abs(inf) : null, maxInf, "%", infCls) +
      _cpGauge("Unemployment", cd.unemployment_rate,           maxUnemp, "%") +
      "<div class=\"cp-gauge-section-hdr\">FRED</div>" +
      _cpGauge("Bond yield",  cd.bond_yield_10y,               maxYld,   "%") +
    "</div>";

  document.getElementById("cp-body").innerHTML =
    "<div class=\"cp-two-col\">" +
      "<div class=\"cp-left-col\">" + leftHtml + "</div>" +
      "<div class=\"cp-right-col\">" + _buildRadar(iso2) + _buildRankChips(iso2) + "</div>" +
    "</div>";

  // ---- trend tabs ----
  var tabs = [
    { key: "gdp_per_capita",    label: "GDP/cap"      },
    { key: "govt_debt_gdp",     label: "Debt"         },
    { key: "cpi_inflation",     label: "Inflation"    },
    { key: "life_expectancy",   label: "Life exp"     },
    { key: "unemployment_rate", label: "Unemployment" },
    { key: "bond_yield_10y",    label: "Bond yield"   }
  ];
  var tabHtml = tabs.map(function(t) {
    return "<button class=\"cp-tab" + (t.key === "gdp_per_capita" ? " active" : "") + "\" " +
           "onclick=\"_switchTrendTab(" + JSON.stringify(iso2) + "," + JSON.stringify(t.key) + ")\">" +
           escHtml(t.label) + "</button>";
  }).join("");
  document.getElementById("cp-trend").innerHTML =
    "<div class=\"cp-tab-strip\">" + tabHtml + "</div><div id=\"cp-chart-area\"></div>";

  _switchTrendTab(iso2, "gdp_per_capita");
}
```

- [ ] **Step 2: Test in browser**

Click Germany. Confirm:
- Header: DE flag + "Germany" + "Europe · High income · DE" + × button
- 4 stat cards colour-coded (GDP/cap blue, inflation green/amber/red, debt threshold, fiscal green/red)
- World Bank / IMF / FRED gauge groups visible
- Missing values show "--" (no bar)
- GDP/cap trend chart auto-renders

- [ ] **Step 3: Commit**

    git add public/app.js
    git commit -m "feat: add _renderCountryPanel -- stat cards, bar gauges, tabs"


---

## Task 8: _buildRadar -- SVG Radar Chart

**Files:**
- Modify: `public/app.js` (after _renderCountryPanel)

The radar has 6 axes. Three indicators are "lower is better" (debt, inflation, unemployment, fiscal deficit), so they are inverted: a value of 0 gets score=1 (best), and the world max gets score=0 (worst). GDP/cap and life expectancy are direct (higher=better).

- [ ] **Step 1: Add _buildRadar**

```javascript
function _buildRadar(iso2) {
  var cd = countryData[iso2];
  if (!cd) return "";

  // 6 axes: [key, label, inverted]
  var axes = [
    { key: "gdp_per_capita",    label: "GDP/cap",    inv: false },
    { key: "life_expectancy",   label: "Life exp",   inv: false },
    { key: "govt_debt_gdp",     label: "Debt",       inv: true  },
    { key: "fiscal_balance_gdp",label: "Fiscal",     inv: true  },
    { key: "cpi_inflation",     label: "Inflation",  inv: true  },
    { key: "unemployment_rate", label: "Unemploy",   inv: true  }
  ];

  // compute world max per axis
  var maxVals = {};
  axes.forEach(function(a) {
    maxVals[a.key] = _cpWorldMax(a.key);
  });

  // score: 0..1 where 1 = best
  function score(key, inv) {
    var v = cd[key];
    if (v == null || isNaN(v)) return 0;
    var s = v / maxVals[key];
    return inv ? 1 - s : s;
  }

  // world avg score per axis
  function avgScore(key, inv) {
    var vals = [], max = maxVals[key];
    for (var k in countryData) {
      var v = countryData[k][key];
      if (v != null && !isNaN(v)) vals.push(inv ? 1 - v/max : v/max);
    }
    if (!vals.length) return 0;
    return vals.reduce(function(a,b){return a+b;},0) / vals.length;
  }

  var n = axes.length;
  var cx = 90, cy = 90, R = 70;
  var PI2 = Math.PI * 2;

  // polar -> cartesian (0 deg = top, clockwise)
  function pt(angle, r) {
    var a = angle - Math.PI / 2;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  }

  // build polygon points string from scores array (0..1)
  function polygon(scores) {
    return scores.map(function(s, i) {
      var p = pt(PI2 * i / n, s * R);
      return p.x.toFixed(1) + "," + p.y.toFixed(1);
    }).join(" ");
  }

  // grid rings at 0.25, 0.5, 0.75, 1.0
  var rings = "";
  [0.25, 0.5, 0.75, 1.0].forEach(function(frac) {
    var pts = axes.map(function(_, i) {
      var p = pt(PI2 * i / n, frac * R);
      return p.x.toFixed(1) + "," + p.y.toFixed(1);
    }).join(" ");
    rings += "<polygon points=\"" + pts + "\" fill=\"none\" stroke=\"#30363d\" stroke-width=\"0.5\"/>";
  });

  // axis lines + labels
  var axisLines = "", labels = "";
  axes.forEach(function(a, i) {
    var tip = pt(PI2 * i / n, R);
    axisLines += "<line x1=\"" + cx + "\" y1=\"" + cy + "\" x2=\"" + tip.x.toFixed(1) + "\" y2=\"" + tip.y.toFixed(1) + "\" stroke=\"#30363d\" stroke-width=\"0.5\"/>";
    var lp = pt(PI2 * i / n, R + 14);
    labels += "<text x=\"" + lp.x.toFixed(1) + "\" y=\"" + lp.y.toFixed(1) + "\" text-anchor=\"middle\" dominant-baseline=\"middle\" font-size=\"7\" fill=\"#8b949e\">" + escHtml(a.label) + "</text>";
  });

  // country scores and world avg scores
  var countryScores = axes.map(function(a) { return score(a.key, a.inv); });
  var avgScores     = axes.map(function(a) { return avgScore(a.key, a.inv); });

  var svgW = 180, svgH = 200;
  var svg =
    "<svg width=\"" + svgW + "\" height=\"" + svgH + "\" viewBox=\"0 0 " + svgW + " " + svgH + "\" xmlns=\"http://www.w3.org/2000/svg\">" +
      rings + axisLines + labels +
      "<polygon points=\"" + polygon(avgScores) + "\" fill=\"none\" stroke=\"#8b949e66\" stroke-width=\"1\" stroke-dasharray=\"3,2\"/>" +
      "<polygon points=\"" + polygon(countryScores) + "\" fill=\"#388bfd22\" stroke=\"#388bfd\" stroke-width=\"1.5\"/>" +
    "</svg>";

  return "<div class=\"cp-radar-wrap\">" + svg + "</div>";
}
```

- [ ] **Step 2: Test radar visually**

Open panel for Germany, Norway (high scores), Nigeria (low scores). Confirm:
- 6 labelled axes visible
- Germany polygon noticeably larger than world avg dashed ring on GDP/cap and Life exp
- Norway large on most axes
- Nigeria small polygon
- No JavaScript errors in console

- [ ] **Step 3: Commit**

    git add public/app.js
    git commit -m "feat: add _buildRadar -- 6-axis SVG spider chart vs world avg"


---

## Task 9: _buildRankChips -- Regional Rank Badges

**Files:**
- Modify: `public/app.js` (after _buildRadar)

- [ ] **Step 1: Add _buildRankChips**

```javascript
function _buildRankChips(iso2) {
  var cd = countryData[iso2];
  if (!cd || !cd.region) return "";

  var region = cd.region;

  // collect all countries in the same region with valid values
  function rankIn(key, lowerIsBetter) {
    var peers = [];
    for (var k in countryData) {
      var v = countryData[k][key];
      if (v != null && !isNaN(v) && countryData[k].region === region) {
        peers.push({ iso: k, val: v });
      }
    }
    if (peers.length < 2) return null; // not enough peers to rank

    peers.sort(function(a, b) {
      return lowerIsBetter ? a.val - b.val : b.val - a.val;
    });

    var pos = peers.findIndex(function(p) { return p.iso === iso2; });
    if (pos === -1) return null;
    return { rank: pos + 1, total: peers.length };
  }

  var indicators = [
    { key: "gdp_per_capita",    label: "GDP/cap",     inv: false },
    { key: "life_expectancy",   label: "Life exp",    inv: false },
    { key: "govt_debt_gdp",     label: "Debt/GDP",    inv: true  },
    { key: "cpi_inflation",     label: "Inflation",   inv: true  },
    { key: "unemployment_rate", label: "Unemployment",inv: true  }
  ];

  var medals = ["🥇", "🥈", "🥉"];

  var chips = indicators.map(function(ind) {
    var r = rankIn(ind.key, ind.inv);
    if (!r) return "";
    var medal = r.rank <= 3 ? medals[r.rank - 1] : "#" + r.rank;
    var cls = r.rank === 1 ? "cp-rank-chip cp-gold" : r.rank === 2 ? "cp-rank-chip cp-silver" : r.rank === 3 ? "cp-rank-chip cp-bronze" : "cp-rank-chip";
    return "<div class=\"" + cls + "\">" +
      "<span class=\"cp-chip-medal\">" + medal + "</span>" +
      "<span class=\"cp-chip-lbl\">" + escHtml(ind.label) + "</span>" +
      "<span class=\"cp-chip-count\">/ " + r.total + " " + escHtml(region) + "</span>" +
    "</div>";
  }).join("");

  if (!chips) return "";

  return "<div class=\"cp-rank-chips\">" +
    "<div class=\"cp-rank-hdr\">Regional rank</div>" +
    chips + "</div>";
}
```

- [ ] **Step 2: Write unit test for rank logic**

Create :

```javascript
const { test } = require('node:test');
const assert   = require('node:assert/strict');

// Minimal stub: 3 European countries, test GDP rank
function rankIn(iso2, countryData, key, lowerIsBetter) {
  var cd = countryData[iso2];
  if (!cd || !cd.region) return null;
  var region = cd.region;
  var peers = [];
  for (var k in countryData) {
    var v = countryData[k][key];
    if (v != null && !isNaN(v) && countryData[k].region === region)
      peers.push({ iso: k, val: v });
  }
  if (peers.length < 2) return null;
  peers.sort(function(a,b){ return lowerIsBetter ? a.val-b.val : b.val-a.val; });
  var pos = peers.findIndex(function(p){ return p.iso === iso2; });
  if (pos === -1) return null;
  return { rank: pos+1, total: peers.length };
}

test("ranks highest GDP first", function() {
  var data = {
    DE: { region: "Europe", gdp_per_capita: 54000 },
    FR: { region: "Europe", gdp_per_capita: 43000 },
    PL: { region: "Europe", gdp_per_capita: 18000 }
  };
  assert.deepEqual(rankIn("DE", data, "gdp_per_capita", false), { rank: 1, total: 3 });
  assert.deepEqual(rankIn("PL", data, "gdp_per_capita", false), { rank: 3, total: 3 });
});

test("ranks lowest debt first (lowerIsBetter=true)", function() {
  var data = {
    DE: { region: "Europe", govt_debt_gdp: 66 },
    FR: { region: "Europe", govt_debt_gdp: 111 },
    EE: { region: "Europe", govt_debt_gdp: 18  }
  };
  assert.deepEqual(rankIn("EE", data, "govt_debt_gdp", true), { rank: 1, total: 3 });
  assert.deepEqual(rankIn("FR", data, "govt_debt_gdp", true), { rank: 3, total: 3 });
});

test("returns null when country missing from peers", function() {
  var data = {
    DE: { region: "Europe", gdp_per_capita: 54000 },
    US: { region: "Americas", gdp_per_capita: 80000 }
  };
  // US is not in Europe, so only 1 peer -> too few
  assert.equal(rankIn("DE", data, "gdp_per_capita", false), null);
});
```

- [ ] **Step 3: Run failing tests**

    node --test tests/test-rank-chips.js

Expected: FAIL (rankIn not exported/defined)

- [ ] **Step 4: Run passing tests after Step 1**

Re-run same command. The unit tests exercise the pure ranking logic isolated from DOM.

Expected: PASS (all 3 tests)

- [ ] **Step 5: Test chips visually**

Open panel for Germany. Confirm rank chips appear below the radar with region name (e.g. "/ 44 Europe"), medal emojis on top-3 positions, grey chips for lower ranks.

- [ ] **Step 6: Commit**

    git add public/app.js tests/test-rank-chips.js
    git commit -m "feat: add _buildRankChips -- regional rank badges per indicator"


---

## Task 10: _switchTrendTab -- IYChart Trend Rendering

**Files:**
- Modify: `public/app.js` (after _buildRankChips)

IYChart signature (from app.js line ~4295): `_IYChart(containerEl, points, opts)`
where `points = [{t: value, v: value}]`. For year-indexed data (World Bank / IMF), set `opts.isTimestamp = false` so x-axis shows years. For FRED monthly data (`[["YYYY-MM", val]]`), convert to `{t: Date.getTime(), v}` and set `opts.isTimestamp = true`.

- [ ] **Step 1: Add _switchTrendTab**

```javascript
function _switchTrendTab(iso2, key) {
  var cd = countryData[iso2];
  if (!cd) return;

  // update active tab UI
  var tabs = document.querySelectorAll('#cp-trend .cp-tab');
  tabs.forEach(function(btn) {
    btn.classList.toggle('active', btn.getAttribute('onclick').indexOf(JSON.stringify(key)) !== -1);
  });

  var chartArea = document.getElementById('cp-chart-area');
  if (!chartArea) return;

  // bond yield uses FRED monthly data: [["YYYY-MM", val], ...]
  var isFred = (key === 'bond_yield_10y');
  var histKey = key + '_history';
  var raw = cd[histKey];

  if (!raw || !raw.length) {
    chartArea.innerHTML = '<div class="cp-no-data">No historical data available</div>';
    return;
  }

  var points;
  if (isFred) {
    // FRED format: [["YYYY-MM", val], ...]
    points = raw.map(function(row) {
      return { t: new Date(row[0] + '-01').getTime(), v: row[1] };
    }).filter(function(p) { return p.v != null && !isNaN(p.v); });
  } else {
    // World Bank / IMF format: [[year, val], ...]
    points = raw.map(function(row) {
      return { t: row[0], v: row[1] };
    }).filter(function(p) { return p.v != null && !isNaN(p.v); });
  }

  if (!points.length) {
    chartArea.innerHTML = '<div class="cp-no-data">No historical data available</div>';
    return;
  }

  // chart label per key
  var labels = {
    gdp_per_capita:    'GDP per capita (USD)',
    govt_debt_gdp:     'Govt debt (% GDP)',
    cpi_inflation:     'CPI inflation (%)',
    life_expectancy:   'Life expectancy (years)',
    unemployment_rate: 'Unemployment (%)',
    bond_yield_10y:    '10-year bond yield (%)'
  };

  // clear and re-render -- display:block ensures IYChart measures container correctly
  chartArea.innerHTML = '<canvas id="cp-iy-canvas" style="width:100%;height:160px;display:block;"></canvas>';
  var canvas = document.getElementById('cp-iy-canvas');

  requestAnimationFrame(function() {
    _IYChart(canvas, points, {
      isTimestamp: isFred,
      label:       labels[key] || key,
      color:       '#388bfd',
      fillOpacity: 0.15
    });
  });
}
```

- [ ] **Step 2: Write unit test for history point mapping**

Create `tests/test-trend-tab.js`:

```javascript
const { test } = require('node:test');
const assert   = require('node:assert/strict');

// Extract the point-mapping logic to test it in isolation
function mapFredPoints(raw) {
  return raw.map(function(row) {
    return { t: new Date(row[0] + '-01').getTime(), v: row[1] };
  }).filter(function(p) { return p.v != null && !isNaN(p.v); });
}

function mapYearPoints(raw) {
  return raw.map(function(row) {
    return { t: row[0], v: row[1] };
  }).filter(function(p) { return p.v != null && !isNaN(p.v); });
}

test('FRED monthly rows map to timestamp points', function() {
  var raw = [['2023-01', 3.5], ['2023-02', 3.7], ['2023-03', null]];
  var pts = mapFredPoints(raw);
  assert.equal(pts.length, 2);  // null filtered out
  assert.equal(typeof pts[0].t, 'number');
  assert.ok(pts[0].t > 0);
  assert.equal(pts[0].v, 3.5);
});

test('World Bank year rows map to year-integer points', function() {
  var raw = [[2020, 54000], [2021, 52000], [2022, null]];
  var pts = mapYearPoints(raw);
  assert.equal(pts.length, 2);
  assert.equal(pts[0].t, 2020);
  assert.equal(pts[0].v, 54000);
});

test('empty raw returns empty points', function() {
  assert.deepEqual(mapFredPoints([]), []);
  assert.deepEqual(mapYearPoints([]), []);
});
```

- [ ] **Step 3: Run tests**

    node --test tests/test-trend-tab.js

Expected: PASS (all 3 tests pass -- pure functions, no DOM)

- [ ] **Step 4: Test IYChart in browser**

Open panel for USA, click each tab in sequence:
- GDP/cap -> line chart with ~10 years of data
- Debt -> line chart
- Inflation -> line chart
- Life exp -> line chart
- Unemployment -> line chart
- Bond yield -> monthly line chart (denser x-axis)
- A country with no FRED data (e.g. a small African nation) -> Bond yield shows "No historical data available"

- [ ] **Step 5: Commit**

    git add public/app.js tests/test-trend-tab.js
    git commit -m "feat: add _switchTrendTab -- IYChart history rendering per tab"


---

## Task 11: Integration -- Wire Map, City Sidebar, and E2E Smoke Test

**Files:**
- Modify: `public/app.js` (choropleth click handler + openWikiSidebar)
- Modify: `public/index.html` (add panel scaffold, remove old popup)
- Modify: `public/style.css` (remove old popup CSS)

This task wires the new panel into the live map interaction and removes the old floating popup.

- [ ] **Step 1: Replace showCountryPopup call in the choropleth click handler**

Find in `public/app.js` (around line 2838):
```javascript
click: function (e) {
  L.DomEvent.stopPropagation(e);
  showCountryPopup(iso2, e.latlng);
}
```

Replace with:
```javascript
click: function (e) {
  L.DomEvent.stopPropagation(e);
  openCountryPanel(iso2);
}
```

- [ ] **Step 2: Remove showCountryPopup and closeCountryPopup (or keep shim)**

Find `showCountryPopup` function in `public/app.js` (around line 2877). Delete the entire function body. Replace with a one-line shim in case any other caller exists:
```javascript
function showCountryPopup(iso2) { openCountryPanel(iso2); }
```

Find `closeCountryPopup` function (around line 3328). Replace with:
```javascript
function closeCountryPopup() { closeCountryPanel(); }
```

- [ ] **Step 3: Prepend closeCountryPanel() to openWikiSidebar**

Find `openWikiSidebar` in `public/app.js` (around line 2319). At the very start of the function body, add:
```javascript
closeCountryPanel();
```

This ensures clicking a city dot always closes the country panel first.

- [ ] **Step 4: Add panel scaffold to index.html**

Find in `public/index.html` the old popup div (around line 298):
```html
<div id="country-popup" ...>
```

Remove the old `#country-popup` div entirely. After the map div (`<div id="map">`), add:
```html
<!-- Country sidebar panel -->
<div id="country-panel" class="country-panel">
  <div id="cp-header"></div>
  <div id="cp-stats-row"></div>
  <div id="cp-body"></div>
  <div id="cp-trend"></div>
</div>
```

- [ ] **Step 5: Remove old popup CSS, verify new CSS from Task 5 is present**

In `public/style.css`, find and delete the old `#country-popup` block (around lines 63-83) and any `.choro-popup-*` classes (around lines 1191-1199). The new `.country-panel` block from Task 5 should already be present.

- [ ] **Step 6: Smoke test the full interaction**

Open the app in browser. Run through every interaction in the spec:

| Action | Expected |
|--------|----------|
| Click Germany on map | Panel slides in from right, flag + stats + gauges + radar visible |
| Click × button | Panel slides out |
| Click France | Panel slides in for France |
| Press ESC | Panel slides out |
| Click ocean (outside country) | Panel slides out |
| Click USA then click a city dot in USA | Country panel closes, city Wikipedia sidebar opens |
| Click country while panel already open (click another country) | Panel content replaces instantly |
| Click trend tab "Debt" | IYChart re-renders with debt history |
| Click country with no FRED data, click Bond yield tab | "No historical data available" shown |
| Zoom in/out while panel open | Panel stays fixed on right, map zooms normally |

- [ ] **Step 7: Run full unit test suite**

    node --test tests/

Expected: all existing tests still pass, plus new tests from Tasks 3, 9, 10

- [ ] **Step 8: Commit**

    git add public/app.js public/index.html public/style.css
    git commit -m "feat: wire country panel into map -- replace showCountryPopup, close on city click"

---

## Spec Coverage Check

| Spec requirement | Task |
|---|---|
| Slide-in panel, 600px wide, full-height right edge | Task 5 (CSS) |
| `openCountryPanel(iso2)` entry point, replaces showCountryPopup | Task 6 + Task 11 |
| `closeCountryPanel()` — ESC, × button, outside click | Task 6 |
| 4 stat cards with colour coding | Task 7 |
| Bar gauges grouped by World Bank / IMF / FRED | Task 7 |
| SVG radar chart, 6 axes, vs world avg | Task 8 |
| Regional rank chips per indicator | Task 9 |
| Trend tab strip — 6 tabs | Task 7 |
| IYChart history rendering per tab | Task 10 |
| IMF history arrays in country JSON | Task 1 |
| World Bank history arrays in country JSON | Task 2 |
| FRED history already present | (no change needed — already stored) |
| Click city dot closes country panel first | Task 11 Step 3 |
| Clicking a second country replaces content instantly | Task 6 (openCountryPanel closes existing) |
| Country border highlight on open | Task 6 |
| Border highlight removed on close | Task 6 |

