# Heatmap Layer Design

**Date:** 2026-04-05
**Status:** Approved

## Overview

A smooth Leaflet.heat gradient overlay that visualises a chosen data metric across the map surface. Each value-filter metric in the filter panel gets a heatmap toggle. When active, a colour gradient glows over the map with intensity proportional to the metric value at each city's location. City dots can be shown, dimmed, or hidden independently via a Show/Dim/Hide row — giving the user all three views.

---

## Library

**Leaflet.heat** (`leaflet-heat.js`) — lightweight (~5 KB minified), no extra dependencies, works with Leaflet 1.9.

Load via CDN in `index.html`:
```html
<script src="https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js"></script>
```

Creates a layer with:
```js
L.heatLayer(points, options).addTo(map)
// points: [[lat, lng, intensity], ...]
// options: { radius, blur, maxZoom, gradient }
```

---

## Metrics & Colour Gradients

| Metric | Data source | Intensity value | Gradient |
|---|---|---|---|
| 🏅 Nobel Laureates | `nobelCitiesData[qid].total` | count | `{0.2:'#1a1a4e', 0.5:'#7b2ff7', 1:'#bc8cff'}` |
| 🎓 Universities | `universitiesData[qid].length` | count | `{0.2:'#0d2b4e', 0.5:'#1f6feb', 1:'#a5d6ff'}` |
| 👥 Population | `city.pop` | population | `{0.2:'#0d3b2e', 0.5:'#20c997', 1:'#e6fffa'}` |
| 🚇 Metro Stations | `metroTransitData[qid].stations` | station count | `{0.2:'#2d1a00', 0.5:'#f0a500', 1:'#fff3cd'}` |
| 🌡 Air Quality (PM2.5) | `airQualityData[qid].pm25` | pm25 (inverted: higher = worse = hotter) | `{0.0:'#3fb950', 0.4:'#f0a500', 0.7:'#f85149', 1:'#bc8cff'}` |

Intensity is **normalised to [0, 1]** within each metric using the 95th percentile as the max (prevents outliers like Tokyo from washing out the gradient).

---

## UI Integration — Filter Panel

Each value-filter metric row in the filter panel gains a small heatmap toggle button on the right:

```
🏅 Nobel Laureates   [1+] [5+] [10+] [20+]   [🌡 Heatmap]
```

Clicking `🌡 Heatmap` on a metric:
1. Activates the heatmap for that metric (deactivates any other active heatmap)
2. Shows the **Dots mode row** below: `Show` | `Dim` | `Hide`
3. Button turns accent-coloured (active state)

Clicking again deactivates the heatmap and hides the dots mode row.

The dots mode row defaults to **Dim** (B — gradient is focal, dots still reachable).

---

## State

```js
let _heatmapMetric = null;   // null | 'nobel' | 'universities' | 'pop' | 'metro' | 'aq'
let _heatmapLayer  = null;   // Leaflet.heat layer instance
let _heatDotMode   = 'dim';  // 'show' | 'dim' | 'hide'
```

---

## Functions

| Function | Purpose |
|---|---|
| `setHeatmapMetric(metric)` | Build point array, create/update `_heatmapLayer`, apply gradient options, rebuild map dots |
| `clearHeatmap()` | Remove layer, reset `_heatmapMetric`, restore dot opacity |
| `setHeatDotMode(mode)` | Update `_heatDotMode`, rebuild map layer (dots recolour/dim/hide) |
| `_buildHeatPoints(metric)` | Returns `[[lat,lng,intensity]]` array normalised to [0,1] using 95th-percentile cap |
| `_heatGradient(metric)` | Returns Leaflet.heat gradient object for the metric |

---

## Integration with `rebuildMapLayer()`

```js
// Dot rendering when heatmap is active:
if (_heatmapMetric && _heatDotMode === 'hide') return; // skip dot
const dotOpacity = _heatmapMetric && _heatDotMode === 'dim' ? 0.15 : 0.85;
const dotColor   = _heatmapMetric && _heatDotMode === 'dim' ? '#30363d' : color;
```

This stacks cleanly with the availability/value filter dim logic already in the filter panel spec.

---

## Heatmap Layer Options

```js
{
  radius: 35,
  blur:   25,
  maxZoom: 10,
  max: 1.0,
  gradient: _heatGradient(_heatmapMetric)
}
```

Radius and blur update on map zoom to keep the gradient feeling proportional.

---

## Files Changed

- `public/index.html` — add Leaflet.heat CDN script tag
- `public/app.js` — heatmap state globals, all heatmap functions, `rebuildMapLayer()` integration
- `public/style.css` — heatmap toggle button style, dots-mode row style

---

## Out of Scope

- Heatmap for country-level metrics (only city-point data)
- Animated / time-lapse heatmap
- Exporting heatmap as image
- Custom gradient editor
