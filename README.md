# World Data Map

An interactive world map that layers city demographics, corporate headquarters, and national economic indicators into a single explorable interface.

**Live demo:** https://kevinkicho.github.io/kworlddatamap032926

## What it does

Click any city dot to open a sidebar with:
- Wikipedia summary and thumbnail photo
- City population, area, and elevation
- Country-level World Bank indicators (GDP, life expectancy, trade balance, and more)
- A full list of corporations headquartered in that city — revenue history, net income, total assets, employees, and more

The choropleth layer colors entire countries by any of 8 World Bank indicators. Corporate data covers stock-exchange-listed companies and large private firms (revenue ≥ 1 billion) worldwide.

## Running locally

```bash
npm install
npm start       # serves public/ on http://localhost:3000
```

## Rebuilding the data

Data files are pre-built and committed. To regenerate from Wikidata and World Bank:

```bash
# Step 1 — cities  (~1–2 hours; checkpoint/resume supported)
npm run fetch-cities

# Step 2 — companies  (~6–8 hours; checkpoint/resume supported)
npm run fetch-companies

# Step 3 — country indicators  (fast, ~1 minute)
npm run fetch-country-data
```

Each script saves a checkpoint after every batch. If interrupted, re-run the same command (without `--fresh`) to resume from where it left off. Use `--fresh` to wipe the checkpoint and start over.

## Data sources

| Dataset | Source | Notes |
|---|---|---|
| Cities | Wikidata SPARQL | 10,000+ population floor; 34 settlement types |
| Companies | Wikidata SPARQL | Exchange-listed or revenue ≥ 1B; full financial time-series |
| Country indicators | World Bank API | 8 development indicators |
| Country borders | Natural Earth (world-atlas) | 50m resolution GeoJSON |

## Tech stack

- **Frontend:** Leaflet.js, vanilla JS/HTML/CSS, dark GitHub-inspired theme
- **Data pipeline:** Node.js scripts (Wikidata SPARQL + World Bank REST API)
- **Hosting:** Static files — no backend required after data build

## Project structure

```
public/
  index.html            # entire frontend (single file)
  cities-full.json      # city records (6k+ cities, 10k+ population floor)
  companies.json        # companies keyed by city QID, with full financial history
  country-data.json     # World Bank indicators keyed by ISO-2 code
  world-countries.json  # GeoJSON country borders

scripts/
  fetch-cities.js       # Wikidata SPARQL → cities-full.json
  fetch-companies.js    # Wikidata SPARQL → companies.json
  fetch-country-data.js # World Bank API  → country-data.json
  fetch-wikipedia.js    # Wikipedia summaries (used for city enrichment)
```

## License

MIT — feel free to use, modify, and share.
