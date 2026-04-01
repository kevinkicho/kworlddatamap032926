# World Data Map

An interactive world map that layers city demographics, corporate headquarters, national economic indicators, US trade flows, and live FX rates into a single explorable interface.

**Live demo:** https://kevinkicho.github.io/kworlddatamap032926

---

## What it does

### Cities layer
- 6,600+ cities worldwide (10k+ population floor, 34 settlement types from Wikidata)
- Click any dot → Wikipedia sidebar with summary, photos, key facts, climate chart
- Colour-coded by population on a log scale; filter and sort via the Explore Cities panel

### Choropleth layer
- Colours entire countries by any of 8 World Bank indicators:
  GDP per capita · Life expectancy · Internet access · Urban population ·
  Literacy · Electricity access · Gini inequality · Child mortality
- Legend and coverage stats update live as you switch indicators

### Economic Centers layer
- Zoom-adaptive clustering: at low zoom, nearby city dots merge into regional economic hubs; zoom in and they split back to individual cities
- Cluster size and colour encode combined market cap or revenue (pale gold → orange-red on a log scale)
- Click a cluster → convex-hull boundary expands, Bezier arcs connect constituent cities
- **Zoom-persistent selection** — scroll the wheel while a cluster is expanded and the selection stays pinned
- Switch metric between Market Cap and Revenue; toggle city dots Show / Dim / Hide

### Corporations panel
- City-level: click any city dot → full list of HQ'd companies with revenue history, net income, total assets, employees, founded year
- Global: "All Corporations" panel with search, country/industry filter, USD-normalized revenue sort

### BEA Trade Flow arrows
- Click any country on the map → animated curved arrows connect it to the United States
- Blue dashed arrows = US exports · Gold dashed arrows = US imports
- Year slider 1999–2025 (Bureau of Economic Analysis annual data, pre-fetched)
- Left-side panel shows Goods exports/imports, balance sparkline, top companies from that country

### FX Rate sidebar
- 💱 button opens a live currency settings panel
- Fetches ECB/Frankfurter reference rates for any historical date you choose
- ~58 currencies editable inline — change any value and economic dot sizes recalculate instantly
- Rates persist in localStorage across sessions

### Census tab (US cities)
- ACS 2023: median income with histogram bars, poverty, unemployment, rent burden, home value, Gini, education, transit use, median age, homeownership
- CBP 2022: establishment count, payroll, sector mix bars, population sparkline, self-employment rate
- Compact 2-column layout, no scrolling required

### Eurostat tab (European cities)
- Unemployment rate, activity rate, total companies from Eurostat Urban Audit (urb_clma, urb_cecfi)
- Median income (EUR), at-risk-of-poverty rate, homeownership, average rent/m² (urb_clivcon)
- 512 European cities across 37 countries; latest available year shown per city
- Tab label switches dynamically between "Census" and "Eurostat" depending on city

### Stats distribution panel
- Click **any data value** in the Economy tab, Info tab chips, or World Bank chips → panel slides in to the left of the sidebar
- Shows: histogram with the current city/country highlighted in gold, national rank (#X of ~470 for US Census data), state or region sub-rank, ranked neighbor list ±5
- List is scrollable; ▲/▼ buttons load 12 more entries above/below
- Click any row to fly the map to that city or country and update the highlight
- **Census metrics (17):** income, poverty, unemployment, rent burden, rent, home value, Gini, SNAP, education, transit, age, homeownership, establishments, payroll, manufacturing share, pop growth, self-employment
- **City metrics (6, global):** population, metro population, city area, density, elevation, year founded — with 🌍 World / 📍 National scope toggle
- **World Bank metrics (8, all countries):** GDP/cap, life expectancy, urban %, internet %, Gini, literacy, child mortality, electricity access — with region sub-rank; aggregate entries excluded

### Overview tab — climate chart
- Monthly high/low temperature bars + precipitation overlay (all values in Celsius / mm)
- Covers cities worldwide including US cities (Fahrenheit Wikipedia articles converted to Celsius)
- 335 of 473 US cities have climate data; remainder have no Wikipedia weather table

---

## Running locally

```bash
npm install
npm start       # serves public/ on http://localhost:3000
```

## Rebuilding the data

Data files are pre-built and committed. To regenerate:

```bash
# Cities  (~1–2 hours; checkpoint/resume supported)
npm run fetch-cities

# City infoboxes — Wikipedia settlement data + climate charts
node scripts/fetch-city-infoboxes.js

# US climate data only (fast, ~10 min) — patches cities-full.json in-place
node scripts/fetch-us-climate.js

# Companies  (~6–8 hours; checkpoint/resume supported)
npm run fetch-companies

# Country indicators  (~1 minute)
npm run fetch-country-data

# BEA trade data  (~2 minutes, pre-fetches all countries)
node scripts/fetch-bea-trade.js

# Eurostat Urban Audit  (~15 seconds, downloads 3 datasets)
node scripts/fetch-eurostat.js
```

Each checkpoint-enabled script resumes from where it left off. Add `--fresh` to restart from scratch.

---

## Data sources

| Dataset | Source | Notes |
|---|---|---|
| Cities | Wikidata SPARQL | 10k+ population floor, 34 settlement types |
| City infoboxes | Wikipedia API | Climate, leaders, metro pop, nicknames |
| Companies | Wikidata SPARQL | Exchange-listed or revenue ≥ 1B; full financial time-series |
| Country indicators | World Bank API | 8 development indicators, ~180 real countries |
| Country borders | Natural Earth (world-atlas) | 50m resolution GeoJSON |
| US Census (ACS) | Census Bureau API | 2023 5-year estimates, 470 cities |
| US Census (CBP) | Census Bureau API | 2022 County Business Patterns, 473 cities |
| US trade flows | Bureau of Economic Analysis (BEA ITA) | Annual 1999–2025, pre-fetched JSON |
| European cities | Eurostat Urban Audit | 512 cities, labour market + living conditions |
| FX rates | Frankfurter / ECB | Any historical date, cached in localStorage |

---

## Tech stack

- **Frontend:** Leaflet.js, vanilla JS/HTML/CSS, dark GitHub-inspired theme
- **Data pipeline:** Node.js (Wikidata SPARQL + Wikipedia + World Bank + BEA + Census REST APIs)
- **Hosting:** Fully static — no backend required after data build

---

## Project structure

```
public/
  index.html              # app shell + panel HTML
  app.js                  # ~3,300-line frontend (map, panels, clustering, trade, FX, stats)
  style.css               # all styles (~1,150 lines)
  cities-full.json        # 6,600+ city records with climate data
  companies.json          # companies keyed by city QID, full financial history
  country-data.json       # World Bank indicators keyed by ISO-2
  world-countries.json    # GeoJSON country borders (Natural Earth)
  census-cities.json      # ACS 2023, 470 US cities
  census-business.json    # CBP 2022, 473 US cities
  bea-trade.json          # BEA ITA trade data, 57 countries pre-fetched
  eurostat-cities.json    # Eurostat Urban Audit, 512 European cities

scripts/
  fetch-cities.js         # Wikidata SPARQL → cities-full.json
  fetch-city-infoboxes.js # Wikipedia API → climate, leaders, nicknames
  fetch-us-climate.js     # Targeted US climate patch (Fahrenheit → Celsius)
  fetch-companies.js      # Wikidata SPARQL → companies.json
  fetch-country-data.js   # World Bank API  → country-data.json
  fetch-bea-trade.js      # BEA ITA API     → bea-trade.json
  fetch-census-data.js    # Census ACS API  → census-cities.json
  fetch-census-business.js# Census CBP API  → census-business.json
  fetch-eurostat.js       # Eurostat Urban Audit → eurostat-cities.json
```

---

## License

MIT — feel free to use, modify, and share.
