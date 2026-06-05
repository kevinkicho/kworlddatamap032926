# World Data Map

An interactive world map layering 1,607 cities, 8,984 corporate headquarters, 145+ country-level economic/governance/development indicators, subnational boundaries, and 25+ map overlays into a single explorable interface.

> **Built with Claude Code:** Nearly all of this codebase was written collaboratively with [Claude Code](https://claude.ai/code) (Anthropic's AI CLI). The human contributor directed features, reviewed output, and provided domain context; Claude Code did the implementation.

**Build status:** 589KB bundled · ~30 map layers · 203 unit tests · ESLint clean

---

## Running locally

```bash
npm install
npm run build      # esbuild: src/main.js → public/app.js (IIFE bundle)
npm start          # serves public/ on http://localhost:36121
```

For development with auto-rebuild:

```bash
npm run dev        # build with --watch
npm start          # in a separate terminal
```

To generate the full 14,000-city dataset from Wikidata (takes ~30-60 min):

```bash
npm run fetch-cities
```

## Quick start (data already included)

All essential data files are pre-built and included:

- **cities-full.json** — 1,607 cities with Wikidata QIDs, countries, populations, elevations
- **companies-index.json** — 8,984 companies across 1,237 cities (generated from companies.json.bak)
- **power_by_city.json** — 22,392 power plants matched to 1,542 cities (all 36 CSV fields, WRI attribution)
- **country-data.json** — 145+ indicators for ~190 countries
- **inform_risk.json** — INFORM Risk Index 2024 for 191 countries (EC JRC, CC BY 4.0)

## Build & lint

```bash
npm run build      # esbuild bundle (589KB)
npm run lint       # ESLint flat config
npm run test       # 203 unit tests (node:test)
```

## What it does

### Map & cities
- 1,607 cities with full Wikidata data (QIDs, country codes, population, area, elevation, founding date)
- Click any dot → sidebar opens with Wikipedia images, city facts, climate charts
- Color-coded by population on a log scale
- Dark/light theme toggle, basemap switching (Street, Satellite, Terrain)

### Topbar toggle buttons (mobile: 2×2 grid)
- **Cities** — show/hide city dots
- **Countries** — choropleth with 40+ indfcators
- **Regions** — subnational admin-1 boundaries
- **Economy** — corporate headquarters as colored dots

### Layers dropdown (25+ overlays)
- **Cultural:** UNESCO Sites, Cultural Heritage
- **Natural Hazards:** Volcanoes, Earthquakes, Wildfires, Tectonic Plates, Natural Events, Air Quality, Weather Stations, Terrorism
- **Infrastructure:** Submarine Cables, Air Routes, Launch Sites, EEZ Boundaries, Internet Exchanges, Ports, Satellites, Ships
- **Other:** ISS Tracker, Live Aircraft, Flight Routes, Protected Areas, Crypto Adoption, Space Weather, Ocean Currents

### City sidebar
- **Info tab:** Population, country, region, type, elevation, density, GDP, HDI, airport routes, seaports, patents, startups, metro, air quality, universities, Nobel laureates, cost of living, energy (power plants)
- **Power plants:** Click the Energy chip → expandable table with all 36 CSV fields per plant (name, capacity, fuel, generation, commissioning year, owner, GPPD/WEPP IDs, estimated generation, data sources). Attribution: WRI Global Power Plant Database v1.3.0, CC BY 4.0
- **Census tab:** ACS 2023 data for US cities
- **Eurostat tab:** Labour, living conditions for EU cities
- **Corporations:** Company headquarters list with revenue, employees, founded year

### Country panel
- World Bank, IMF, FRED, central bank, credit ratings, governance (WGI), HDI, transparency, happiness, peace & security, digital infrastructure, energy mix, nuclear
- **Disaster Risk section** with INFORM Risk Index 2024 (EC JRC, CC BY 4.0 attribution)

### Global corporations panel
- 8,984 companies searchable by name, country, industry
- Revenue normalized to USD via live FX rates

### Data attribution
- Power plants: WRI Global Power Plant Database v1.3.0, CC BY 4.0 (`power_plants_metadata.json`)
- Disaster risk: INFORM Risk Index 2024, EC JRC, CC BY 4.0 (`inform_risk_metadata.json`)

---

## Data pipeline

**New scripts added:**
- `scripts/geocode-power-plants.js` — Geocodes 34,936 power plants to city QIDs using Wikidata API coordinate lookup + haversine proximity matching (150km max). Outputs `power_by_city.json` with all 36 CSV fields and `power_plants_geocoded.csv`.
- `scripts/enrich-cities-quick.js` — Enriches city data with Wikidata fields (country, admin, population, area, elevation, founded, type, website) via wbgetentities API. Matches non-QID cities to country ISO codes by proximity.

---

## Tech stack

- **Frontend:** Leaflet.js 1.9.4, Leaflet.heat, vanilla JS/HTML/CSS
- **Map tiles:** CARTO Dark Matter/Light, Esri Satellite, OpenTopoMap
- **Data pipeline:** Node.js — 106+ scripts calling 30+ APIs
- **Build:** esbuild (IIFE bundle, 589KB)
- **Linting:** ESLint flat config
- **Testing:** node:test (203 tests)
- **Server:** Express.js (dev only, serves public/ + proxies FX/BEA endpoints)

## License

MIT
