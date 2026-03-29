# World Data Map — Code Explainer

A plain-language description of every file, section, function, and notable detail in this project.

---

## Project Files

| File | What it does |
|------|-------------|
| `server.js` | Starts a local web server on port 3000 that serves the app to your browser. |
| `public/index.html` | The entire front-end of the app — layout, styles, population density data, city data, and map logic all live here. |
| `package.json` | Lists the project's name, the `npm start` command, and all installed dependencies. |
| `node_modules/datamaps/dist/datamaps.world.min.js` | The datamaps library bundled with world map geography data, served directly to the browser. |

---

## `server.js` — Line by Line

| Line / Block | What it does |
|---|---|
| `require('express')` | Loads the Express framework so we can create an HTTP server. |
| `require('path')` | Loads Node's built-in path helper for building file-system paths safely. |
| `app.use(express.static('public'))` | Tells Express to serve every file inside the `public/` folder at the root URL (`/`). |
| `app.use('/node_modules', ...)` | Exposes the `node_modules` folder over HTTP so the browser can load `datamaps.world.min.js` directly. |
| `app.listen(3000, ...)` | Starts the server and prints the URL to the terminal once it is ready. |

---

## `public/index.html` — Sections

### HTML Structure

| Element | What it does |
|---|---|
| `<header>` | Displays the app title "World Population Density" and its subtitle "People per square kilometer (2020 data)". |
| `<div class="controls">` | Holds three buttons — **Population Density**, **Major Cities**, and **Both Layers** — that switch map views. |
| `<div id="map-container">` | The empty box that datamaps fills with the SVG world map at runtime; cleared and redrawn on each view switch. |
| `<div class="legend-container">` | Wraps the color gradient bar and its numeric labels (0 → 1000+) below the map. |
| `<div class="legend-gradient">` | Holds the "Low" label, the gradient bar, and the "High" label in a horizontal row. |
| `<div class="gradient-bar">` | A 300 px wide CSS gradient strip that visually represents the density color scale from light yellow to dark blue. |
| `<div class="legend-labels">` | Displays the five numeric tick marks (0, 100, 300, 500, 1000+) spread evenly below the gradient bar. |
| `<div class="stats">` | Shows three live data facts — country count, highest density, and global average — filled in by JavaScript. |
| `<div class="stat-item">` | One label + value pair inside `.stats`; there are three of them (Countries, Highest, Global Avg). |
| `<span class="stat-value" id="...">` | The blue-colored number inside each stat item, updated by `calculateStats()` after the map loads. |
| `<div class="data-source">` | A footer line crediting World Bank (2020) as the data source and naming the libraries used. |

---

### CSS Styles

| Selector | What it does |
|---|---|
| `*` | Resets margin, padding, and box-sizing on every element for a consistent baseline. |
| `body` | Sets the dark background (`#0d1117`), light text color, and centers content in a vertical column. |
| `header h1` | Styles the page title in blue (`#58a6ff`) at 1.8 rem — readable but not harsh on sensitive eyes. |
| `.controls` | Lays the three view-toggle buttons out in a centered, wrapping horizontal row with a gap between them. |
| `.btn` | Styles each button with a dark background, subtle border, and a smooth 0.2s hover transition. |
| `.btn:hover` | Brightens the button background and turns the border blue when the mouse is over it. |
| `.btn.active` | Fills the currently selected button solid blue (`#1f6feb`) to show which view is active. |
| `#map-container` | Gives the map a fixed 550 px height, rounded corners, and hides any SVG that overflows the box. |
| `.hoverinfo` | Styles the floating tooltip (dark background, rounded corners, drop shadow) shown on country/city hover. |
| `.legend-container` | Stacks the gradient row and label row vertically, centered, with a small gap. |
| `.legend-gradient` | Aligns the "Low" text, gradient bar, and "High" text in a single horizontal line. |
| `.gradient-bar` | Defines the 6-stop CSS linear gradient (light yellow → dark blue) that mirrors the `getDensityColor` scale. |
| `.legend-labels` | Spreads the five numeric labels evenly across the same 300 px width as the gradient bar. |
| `.stats` | Lays the three stat items out horizontally with spacing between them. |
| `.stat-item` | Aligns the label and value of each stat side by side with a small gap. |
| `.stat-value` | Colors the dynamic numbers blue (`#58a6ff`) and bolds them to stand out from the label text. |
| `.data-source` | Renders the attribution line in a small, muted grey at the bottom of the page. |

---

### JavaScript — Data

| Variable | What it does |
|---|---|
| `const densityData` | An object mapping ~180 ISO 3-letter country codes (e.g. `"BGD"`) to their 2020 population density in people/km²; values range from 0.1 (Greenland) to 20,778 (Macao). |
| `const cities` | An array of 20 megacity objects, each with `name`, `lat`, `lng`, `pop` (in raw numbers, e.g. 37,400,000), and `region`. |
| `let currentView` | A string (`'density'`, `'cities'`, or `'both'`) that tracks which layer is active; read by `done()` and `initMap()`. |
| `let datamap` | Holds the live `Datamap` instance so `colorCountries()` and `addCityBubbles()` can access it after creation. |

---

### JavaScript — Functions

#### `getDensityColor(density)`
Returns one of six hex colors based on six population density thresholds:

| Density (people/km²) | Color returned | Meaning |
|---|---|---|
| `null` or `undefined` | `#21262d` (dark grey) | No data available for that country |
| < 10 | `#ffffcc` (pale yellow) | Very sparse (e.g. Greenland, Mongolia) |
| 10 – 49 | `#c7e9b4` (light green) | Low density (e.g. Russia, Canada) |
| 50 – 99 | `#7fcdbb` (teal) | Moderate density (e.g. Iraq, Kenya) |
| 100 – 299 | `#41b6c4` (cyan-blue) | Medium-high density (e.g. China, France) |
| 300 – 499 | `#2c7fb8` (medium blue) | High density (e.g. Philippines, Vietnam) |
| ≥ 500 | `#253494` (dark blue) | Extreme density (e.g. Bangladesh, Singapore) |

---

#### `calculateStats()`
Reads all values from `densityData`, computes three numbers, and writes them into the page:

| Step | What it does |
|---|---|
| `Object.values(densityData).filter(...)` | Extracts all density numbers, removing any null entries. |
| `Math.max(...densities)` | Finds the highest density value across all countries. |
| `densities.reduce(...) / length` | Calculates the mean (average) density across all countries. |
| Loop over `Object.entries` | Finds the 3-letter code of whichever country holds the maximum (used internally; not displayed in UI). |
| DOM updates | Writes country count, highest density (with `/km²`), and rounded average into the three `.stat-value` spans. |

---

#### `initMap()`
Creates a fresh `Datamap` instance and wires up all configuration; called on page load and on every view switch.

| Config key | What it does |
|---|---|
| `element` | Points datamaps at `#map-container` as the SVG target. |
| `projection: 'mercator'` | Uses the standard flat Mercator world projection. |
| `fills.defaultFill` | Sets uncolored countries to dark grey (`#21262d`) before `colorCountries()` runs. |
| `geographyConfig.borderColor` | Draws country borders in a muted dark tone (`#30363d`). |
| `geographyConfig.highlightBorderColor` | Turns the border bright blue (`#58a6ff`) when you hover over a country. |
| `geographyConfig.highlightFillColor(geo)` | A **function** (not a static color) — returns grey if in cities-only view, otherwise returns the density color for that country so hover color stays consistent. |
| `geographyConfig.popupTemplate(geo, data)` | Builds the country tooltip HTML: country name + its density value (or "No data") using a template literal. |
| `done(datamap)` | A callback that fires once the base map SVG is fully drawn (see below). |

**Inside `done(datamap)`:**

| Conditional | What it does |
|---|---|
| `if (currentView !== 'cities')` | Calls `colorCountries()` — skipped when only city bubbles are requested. |
| `if (currentView !== 'density')` | Calls `addCityBubbles()` — skipped when only the density layer is requested. |
| `calculateStats()` | Always runs last to populate the stats bar regardless of view. |

---

#### `colorCountries()`
Iterates over every country SVG path already drawn by datamaps and applies the correct density color.

| Step | What it does |
|---|---|
| `datamap.svg.selectAll('.datamaps-subunit')` | Uses D3 to select all country shapes inside the map SVG. |
| `.style('fill', function(d) {...})` | Calls `getDensityColor()` with each country's density value to set its fill color. |

---

#### `addCityBubbles()`
Transforms the `cities` array into datamaps bubble objects and renders them on the map.

| Step | What it does |
|---|---|
| `cities.map(city => ({...}))` | Converts each city object into the format datamaps' bubble plugin expects. |
| `radius: Math.sqrt(city.pop / 1000000) * 0.8` | Uses a square-root scale so bubble **area** grows proportionally to population (prevents the largest cities from visually dominating). |
| `fillKey: pop > 15M ? 'high' : pop > 10M ? 'medium' : 'low'` | Classifies each city into one of three tiers, stored as a key for potential color mapping. |
| `datamap.bubbles(bubbles, {...})` | Calls the datamaps bubble plugin to render all 20 circles. |
| `popupTemplate(geo, data)` | Builds the city tooltip: city name + population formatted as `X.XM` (e.g. "37.4M"). |

---

#### `setView(view)`
Handles a button click to switch between the three map modes.

| Step | What it does |
|---|---|
| `currentView = view` | Updates the global tracker so `done()` knows what to render next. |
| `querySelectorAll('.btn').forEach(...)` | Removes the `.active` class from all buttons before re-applying it. |
| `event.target.classList.add('active')` | Marks the clicked button as active (uses the implicit browser `event` global). |
| `document.getElementById('map-container').innerHTML = ''` | Wipes the existing SVG completely so datamaps can draw a clean map. |
| `initMap()` | Re-creates the entire map with the new view settings. |

---

#### `initMap()` — bootstrap call (bottom of script)
The bare `initMap();` line at the very end of the `<script>` block triggers the first map draw when the page first loads, defaulting to the density view.

---

### JavaScript — External Libraries

| Library | Why this version | What it does |
|---|---|---|
| `d3 v3` (CDN) | datamaps was built against D3 v3 and is incompatible with v4+ | Provides the SVG drawing, data-binding, and selection engine that datamaps runs on top of. |
| `topojson v1` (CDN) | datamaps uses the v1 API | Decodes the compressed geographic boundary data that defines country outlines. |
| `datamaps.world.min.js` (npm) | Loaded from local `node_modules` via Express | The main library that ties D3, topojson, and world geography together into one `new Datamap({...})` call. |

> **Note:** The `<script>` tags for these three libraries are placed in `<head>` (before the page body), so they are fully available by the time the inline script at the bottom of `<body>` runs.

---

## How It All Fits Together

```
npm start
   │
   └─► server.js starts Express on port 3000
            │
            ├─► serves public/index.html to the browser
            └─► serves /node_modules/...  to the browser
                        │
                        ▼
              Browser loads index.html
                        │
                        ├─► loads D3 v3      (CDN)
                        ├─► loads topojson v1 (CDN)
                        ├─► loads datamaps    (npm → node_modules)
                        │
                        └─► initMap() called automatically
                                  │
                                  └─► new Datamap({ ... })
                                            │
                                            └─► done() callback fires
                                                      │
                                                      ├─► colorCountries()   ← if density or both
                                                      ├─► addCityBubbles()   ← if cities or both
                                                      └─► calculateStats()   ← always

User clicks a button
   └─► setView('cities' | 'density' | 'both')
            ├─► clears #map-container
            └─► initMap() → done() → same flow above
```

---

## Data Notes

| Item | Detail |
|---|---|
| Density source | World Bank Open Data, 2020 estimates |
| Country coverage | ~180 countries and territories |
| City population figures | UN World Urbanization Prospects estimates |
| City count | 20 largest urban agglomerations |
| Density unit | People per square kilometer (km²) |
