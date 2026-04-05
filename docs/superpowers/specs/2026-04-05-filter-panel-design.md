# Filter Panel Design

**Date:** 2026-04-05
**Status:** Approved

## Overview

A slide-in filter panel on the left side of the map that lets users narrow which cities are visible based on data availability and value thresholds. Unmatched cities are either dimmed or hidden. A floating "Filter" FAB button on the map opens and closes the panel. An active-filter count badge on the FAB shows how many filters are on at a glance.

---

## UI Structure

### FAB Button (always visible on map)
- Position: bottom-left of the map container, above the AQ bar
- Label: `⚗ Filter`
- Badge: red circle showing active filter count (hidden when count = 0)
- Clicking toggles the panel open/closed

### Filter Panel (slide-in from left)
- Width: 280px
- `position: fixed; left: -280px` → `left: 0` when open
- `transition: left 0.3s cubic-bezier(.4,0,.2,1)` (matches wiki sidebar animation)
- z-index: 980 (below wiki sidebar at 1000, above map at 900)
- Does not conflict with country panel (both are `position:fixed` left, but filter panel has higher z-index; country panel closes when filter panel opens and vice versa)

### Panel sections (top to bottom):
1. **Header** — "⚗ Filters" title + "Clear all" link + close (×) button
2. **Dim / Hide toggle** — two pill buttons: `Dim` / `Hide` (applies to all unmatched cities)
3. **Availability** section — ON/off toggle per dataset
4. **Value Filters** section — bucket buttons per metric (scrollable)
5. **Footer** — live city count: "Showing X of 6,603"

---

## Availability Filters

Toggle buttons (ON / off). When ON, cities **without** that dataset are treated as unmatched.
Multiple availability filters combine with AND logic.

| Label | Data source | Key check |
|---|---|---|
| 🌡 Air Quality | `airQualityData[qid]` | `pm25` exists |
| 🚇 Metro system | `metroTransitData[qid]` | entry exists |
| 🏅 Nobel laureates | `nobelCitiesData[qid]` | entry exists |
| 🎓 Universities | `universitiesData[qid]` | entry exists |
| ✈ Airport data | `airportData[qid]` | entry exists |
| 📊 Eurostat | `eurostatCities[qid]` | entry exists |
| 🇺🇸 Census (US) | `censusCities[qid]` | entry exists |

---

## Value Filters

Bucket buttons — clicking a non-"Any" bucket filters to cities matching that threshold. "Any" clears the filter for that metric. Only one bucket active per metric at a time. Multiple metrics combine with AND logic.

### Nobel Laureates
`nobelCitiesData[qid]?.total`
Buckets: **Any** · **1+** · **5+** · **10+** · **20+**

### Universities
`universitiesData[qid]?.length`
Buckets: **Any** · **1+** · **5+** · **10+**

### Population
`city.pop`
Buckets: **Any** · **<100k** · **100k–1M** · **1M–10M** · **10M+**

### Metro Stations
`metroTransitData[qid]?.stations`
Buckets: **Any** · **Has metro** · **100+** · **500+**

### Air Quality (PM2.5)
`airQualityData[qid]?.category`
Buckets: **Any** · **Good** · **Acceptable** · **Moderate** · **Poor** · **Very Poor** · **Severe**
(Buckets colored with AQ palette: green → blue → amber → orange → red → purple)

---

## Filter Logic

All active filters (availability + value) are evaluated per city on every map render via `rebuildMapLayer()`. A city is **matched** if it passes every active filter. Unmatched cities are either:
- **Dimmed** — rendered at `opacity: 0.12` with a grey color (`#30363d`)
- **Hidden** — not added to the map layer at all

The dim/hide mode is global (one setting for all active filters).

### Implementation in `rebuildMapLayer()`
```js
// After existing color logic:
const filterResult = applyMapFilters(city); // 'match' | 'dim' | 'hide'
if (filterResult === 'hide') return;
const dotOpacity = filterResult === 'dim' ? 0.12 : 0.85;
const dotColor   = filterResult === 'dim' ? '#30363d' : color;
```

---

## State

Two global objects added to `app.js`:

```js
let _filterAvail = {};   // { 'airQuality': true, 'metro': false, ... }
let _filterValue = {};   // { 'nobel': 5, 'pop': '1M-10M', 'aq': 'Good', ... }
let _filterDimMode = 'dim'; // 'dim' | 'hide'
```

All filter state is in-memory only (no persistence needed).

---

## Functions

| Function | Purpose |
|---|---|
| `openFilterPanel()` / `closeFilterPanel()` | Toggle panel, update FAB badge |
| `toggleAvailFilter(key)` | Flip availability filter on/off, rebuild map |
| `setValueFilter(metric, value)` | Set bucket for a metric (null = Any), rebuild map |
| `setFilterDimMode(mode)` | Switch dim/hide, rebuild map |
| `applyMapFilters(city)` | Returns `'match'`, `'dim'`, or `'hide'` for a city |
| `clearAllFilters()` | Reset all state, rebuild map, hide FAB badge |
| `openFilterPanel()` also calls | `_ensureAirQuality()`, `_ensureAirport()`, `_ensureUniversities()` — triggers lazy loads so availability filter data is ready |

---

## Files Changed

- `public/app.js` — filter state globals, all filter functions, `rebuildMapLayer()` integration, FAB button logic
- `public/index.html` — filter panel HTML, FAB button HTML
- `public/style.css` — filter panel styles, FAB styles, dim/hide dot styles

---

## Out of Scope

- Persisting filter state across page reloads
- Combining multiple buckets for one metric (e.g. "Good OR Acceptable")
- Text search within filters
- Exporting filtered city list
