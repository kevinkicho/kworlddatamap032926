# Country Sidebar Panel — Design Spec

**Date:** 2026-04-04  
**Status:** Approved  
**Replaces:** `showCountryPopup()` floating popup

---

## 1. Overview

Replace the existing floating country popup with a persistent sidebar panel that slides in from the right when a user clicks a country on the map. The panel gives national data a physical sense of place — it's grounded in the map interaction, not detached from it.

**Goal:** Make national economic and social data feel as engaging and tactile as the city dots. Bar gauges, a radar chart comparing the country to world averages, regional rank chips, and full historical trend charts via IYChart.

---

## 2. Trigger, Size, and Close

- **Trigger:** Clicking a country polygon on the Leaflet map (replaces `showCountryPopup`)
- **Size:** 600px wide, full viewport height, fixed position right edge
- **Animation:** CSS `translateX(100%) → translateX(0)`, 0.25s ease
- **Close via:** × button in header, ESC key, clicking map outside any country
- **One panel at a time:** Clicking a city dot while the country panel is open closes the country panel first, then opens the city Wikipedia sidebar

---

## 3. Panel Layout (Two-Column Dashboard)

```
┌─────────────────────────────────────────────┐
│ 🇩🇪 Germany  Europe · High income · DEU   × │  ← header
├──────────┬──────────┬──────────┬────────────┤
│ $54k     │  2.4%    │  74%     │  −4.0%     │  ← 4 stat cards
│ GDP/cap  │ Inflation│ Debt/GDP │ Fiscal Bal │
├──────────────────────┬──────────────────────┤
│  BAR GAUGES (55%)    │  RADAR + RANKS (45%) │
│                      │                      │
│  World Bank          │  SVG radar vs world  │
│  ── GDP/cap ────▓▓░  │  avg + dashed ring   │
│  ── Life exp ───▓▓░  │                      │
│  ── Population  (no  │  Regional rank chips │
│     gauge, info only)│  🥇 1st / 44 Europe  │
│                      │  🥈 2nd / 44 Europe  │
│  IMF                 │  🥉 3rd / 44 Europe  │
│  ── Debt/GDP ───▓░░  │                      │
│  ── Fiscal bal ─▓░░  │                      │
│  ── CPI Inflat ─▓▓░  │                      │
│  ── Unemploy ───▓░░  │                      │
│                      │                      │
│  FRED                │                      │
│  ── Bond yield ─▓░░  │                      │
├──────────────────────┴──────────────────────┤
│ [GDP/cap] [Debt] [Inflation] [Life exp]      │  ← trend tabs
│ [Unemployment] [Bond yield]                  │
├─────────────────────────────────────────────┤
│  IYChart canvas (historical trend)           │
└─────────────────────────────────────────────┘
```

### Header
- Flag emoji + country name (bold) + region + income level + ISO3 code
- × close button (right-aligned)

### 4 Stat Cards (top row)
Color-coded values: GDP/cap (blue), CPI inflation (green/red by threshold), Govt Debt (amber if >60% GDP, red if >90%), Fiscal Balance (green if surplus, red if deficit).

### Left Column — Bar Gauges (55% width)
Grouped by data source: **World Bank** / **IMF** / **FRED**. Each row: label, bar (filled proportional to world max), value label. Color matches stat card convention. Missing data shows grey "–" instead of bar.

### Right Column — Radar + Rank Chips (45% width)
- SVG radar chart, 6 axes: GDP/cap, Life exp, Debt (inverted — lower is better), Fiscal Balance (inverted), CPI Inflation (inverted), Unemployment (inverted)
- Country polygon filled `#388bfd22`, stroked `#388bfd`
- World average polygon dashed `#8b949e66`
- Below radar: rank chips per indicator — computed at render time by iterating all countries in the same region

---

## 4. Data Pipeline Changes

### `scripts/fetch-imf.js` — add `_history` arrays
Currently stores only the best single value per indicator. Change: also retain yearly series (actuals only, capped at current year) as `*_history: [[year, value], ...]`.

Indicators: `govt_debt_gdp`, `fiscal_balance_gdp`, `cpi_inflation`, `unemployment_rate`  
File size: ~45 KB → ~120 KB

### `scripts/fetch-country-data.js` — keep history already fetched
The World Bank API is already called with `mrv=10` (returns 10 years). Currently the series is discarded. Change: retain as `gdp_per_capita_history` and `life_expectancy_history`.

File size: ~80 KB → ~110 KB

### `scripts/fetch-fred.js` — no change needed
Already stores `yield_history: [["YYYY-MM", val], ...]` for 5 years of monthly data.

### Total JSON payload
Before: ~340 KB uncompressed (~100 KB gzipped)  
After: ~510 KB uncompressed (~153 KB gzipped) — loads in <0.3s on average connection

---

## 5. Frontend Components

All changes are in existing files — no new files created.

### `index.html` (~10 lines)
Add panel shell after the map div. All content injected by JS at click time:
```html
<div id="country-panel" class="country-panel hidden">
  <div id="cp-header"></div>
  <div id="cp-stats-row"></div>
  <div id="cp-body"></div>
  <div id="cp-trend"></div>
</div>
```

### `public/app.js` (~400 lines added)

| Function | Purpose |
|---|---|
| `openCountryPanel(iso2)` | Entry point from map click. Closes existing panel, renders, slides in, binds ESC/outside-click, highlights country border. |
| `_renderCountryPanel(iso2)` | Assembles full panel HTML: header, stat cards, left gauges, right radar+chips, trend tab strip. |
| `_buildRadar(iso2, countryData)` | Returns SVG string. Computes world averages across all countryData entries, renders grid rings + polygons. |
| `_buildRankChips(iso2, countryData)` | Iterates all countries in same region to compute per-indicator rank. Returns chip HTML. |
| `_switchTrendTab(iso2, key)` | Reads `*_history` array, calls IYChart on `#cp-trend` canvas. Shows placeholder if no data. |
| `closeCountryPanel()` | Removes `.open`, resets border highlight, unbinds listeners. |

### `public/style.css` (~60 lines added)
Key rules: slide-in animation, `.cp-stat-card`, `.cp-gauge-row`, `.cp-rank-chip`, `.cp-tab` / `.cp-tab.active`.

---

## 6. Interaction Model

| Action | Result |
|---|---|
| Click country | `openCountryPanel(iso2)` — slides in, default tab = GDP/cap |
| Click country while panel open | Replace content instantly (no close animation) |
| Click trend tab | `_switchTrendTab` — re-renders IYChart with selected indicator history |
| Hover different country (panel open) | Normal hover highlight; panel stays open |
| Click map outside any country | `closeCountryPanel()` — slides out |
| Press ESC | Same as outside click |
| Click × button | Same as outside click |
| Click city dot (panel open) | Close country panel first, then open city sidebar |

---

## 7. What Stays Unchanged

- IYChart (reused as-is for trend rendering)
- Existing trade arc / city dots / clustering
- `countryData` loading logic in `app.js`
- City Wikipedia sidebar
- `showCountryPopup()` is removed and replaced by `openCountryPanel()`

---

## 8. Out of Scope

- Company list tab inside the panel (future enhancement)
- Comparison mode (two countries side by side)
- Mobile/touch layout (map is desktop-first)
- Data quality cleanup for companies.json currency/HQ bugs (separate task)
