# World Data Map

An interactive world map that layers city demographics, corporate headquarters, national economic indicators, live US trade flows, and real-time FX rates into a single explorable interface.

**Live demo:** https://kevinkicho.github.io/kworlddatamap032926

---

## What it does

### Cities layer
- 6,600+ cities worldwide (10k+ population floor, 34 settlement types from Wikidata)
- Click any dot → Wikipedia sidebar with summary, photos, key facts
- Colour-coded by population on a log scale; filter and sort via the Explore Cities panel

### Choropleth layer
- Colours entire countries by any of 8 World Bank indicators:
  GDP per capita · Life expectancy · Internet access · Urban population ·
  Literacy · Electricity access · Gini inequality · Child mortality
- Legend and coverage stats update live as you switch indicators

### Economic Centers layer
- Zoom-adaptive clustering: at low zoom, nearby city dots merge into regional economic hubs; zoom in and they split back to individual cities — national boundaries emerge naturally from geography
- Cluster size and colour encode combined market cap or revenue (pale gold → orange-red on a log scale)
- Click a cluster → convex-hull boundary expands, Bezier arcs connect constituent cities, each city shows its own sized dot
- **Zoom-persistent selection** — scroll the wheel while a cluster is expanded and the selection stays pinned; zoom in to read fine detail without losing your selection
- Switch metric between Market Cap and Revenue; toggle city dots Show / Dim / Hide

### Corporations panel
- City-level: click any city dot → full list of HQ'd companies with revenue history, net income, total assets, employees, founded year
- Global: "All Corporations" panel with search, country/industry filter, USD-normalized revenue sort

### BEA Trade Flow arrows
- Click any country on the map → animated curved arrows connect it to the United States
- Blue dashed arrows = US exports · Gold dashed arrows = US imports
- Year slider 1999–2025 (Bureau of Economic Analysis annual data)
- Left-side panel shows Goods + Services breakdown grid, historical goods-balance sparkline, and top companies from that country
- Country dropdown lets you switch countries without clicking the map
- Trade data cached in localStorage (7-day TTL) for instant repeat visits

### FX Rate sidebar
- 💱 button (bottom-left, always visible) opens a live currency settings panel
- Fetches real ECB/Frankfurter reference rates for any historical date you choose
- ~58 currencies are editable inline — change any value and economic dot sizes, cluster totals, and corp revenue figures recalculate instantly
- Rates persist in localStorage across sessions; Reset button restores built-in defaults
- First visit auto-fetches the latest ECB rates silently in the background

---

## Running locally

```bash
npm install
npm start       # serves public/ on http://localhost:3000
```

## Rebuilding the data

Data files are pre-built and committed. To regenerate from Wikidata and World Bank:

```bash
# Cities  (~1–2 hours; checkpoint/resume supported)
npm run fetch-cities

# Companies  (~6–8 hours; checkpoint/resume supported)
npm run fetch-companies

# Country indicators  (~1 minute)
npm run fetch-country-data
```

Each script saves a checkpoint after every batch. Re-run without `--fresh` to resume; add `--fresh` to start over from scratch.

---

## Data sources

| Dataset | Source | Notes |
|---|---|---|
| Cities | Wikidata SPARQL | 10k+ population floor, 34 settlement types |
| Companies | Wikidata SPARQL | Exchange-listed or revenue ≥ 1B; full financial time-series |
| Country indicators | World Bank API | 8 development indicators |
| Country borders | Natural Earth (world-atlas) | 50m resolution GeoJSON |
| US trade flows | Bureau of Economic Analysis (BEA ITA) | Annual 1999–2025, cached 7 days |
| FX rates | Frankfurter / ECB | Any historical date, cached in localStorage |

---

## Tech stack

- **Frontend:** Leaflet.js, vanilla JS/HTML/CSS, dark GitHub-inspired theme
- **Data pipeline:** Node.js (Wikidata SPARQL + World Bank + BEA REST APIs)
- **Hosting:** Fully static — no backend required after data build

---

## Project structure

```
public/
  index.html              # app shell
  app.js                  # ~2,500-line frontend (map, panels, clustering, trade, FX)
  style.css               # all styles
  cities-full.json        # 6,600+ city records
  companies.json          # companies keyed by city QID, full financial history
  country-data.json       # World Bank indicators keyed by ISO-2
  world-countries.json    # GeoJSON country borders (Natural Earth)

scripts/
  fetch-cities.js         # Wikidata SPARQL → cities-full.json
  fetch-companies.js      # Wikidata SPARQL → companies.json
  fetch-country-data.js   # World Bank API  → country-data.json
```

---

## License

MIT — feel free to use, modify, and share.
