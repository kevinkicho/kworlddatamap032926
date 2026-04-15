# World Data Map — Code Explainer

A detailed walkthrough of every file, design decision, and notable technique in this project.

---

## Big Picture

The app has two layers:

1. **Static data files** (`public/*.json`) — pre-built by the fetch scripts, committed to git. The browser just loads these; no server queries happen at runtime.
2. **A single-page frontend** (`public/index.html`) — Leaflet.js map + sidebar panels. Zero build step, runs straight in the browser.

```
Browser
  └─ public/index.html          ← all UI logic (Leaflet, sidebar, corp panel)
       ├─ cities-full.json       ← 6k+ city markers with population/coords
       ├─ companies.json         ← companies keyed by city QID
       ├─ country-data.json      ← World Bank indicators keyed by ISO-2
       └─ world-countries.json   ← GeoJSON borders (Natural Earth)

Build time (run once, slow)
  ├─ scripts/fetch-cities.js     → cities-full.json
  ├─ scripts/fetch-companies.js  → companies.json
  └─ scripts/fetch-country-data.js → country-data.json
```

The "join key" between datasets is the city QID (Wikidata entity ID like `Q8684`) and the ISO-2 country code. Every dataset that touches a city references its QID; everything that touches a country references its ISO-2.

---

## `scripts/fetch-cities.js`

Queries Wikidata's SPARQL endpoint to build `cities-full.json`.

### Settlement types (P31)

Wikidata doesn't have a single `is a city` type. Different countries encode cities differently:

| Wikidata type | What it covers |
|---|---|
| Q515 | city (generic) |
| Q1549591 | big city |
| Q486972 | human settlement |
| Q174844 | megacity — **required** for Paris, Delhi, Jakarta, Lagos |
| Q494721 | city in Japan (市) |
| Q42744322 | urban municipality in Germany |
| Q1093829 | city in the United States |
| Q1115575 | civil parish (UK) |
| Q1757204 | urban-type settlement (Russia/CIS) |
| Q15221921 | census town (India) |
| … | 34 types total |

The script queries all 34 types with a `VALUES ?type { … }` block and deduplicates on QID, so a city that carries multiple types (e.g. both Q515 and Q174844) only appears once.

### Population floor

`LOWER_BOUND = 10000`. Cities below 10k population are excluded — they add noise without adding economic signal at the scale this app is designed for.

### Checkpoint/resume

The script saves a checkpoint JSON after every SPARQL batch. If the process is killed or crashes, re-running `npm run fetch-cities` picks up from the last saved batch — no data is lost and no completed batches are re-fetched. Use `--fresh` to ignore the checkpoint and start over.

### Resilience

- **429 (rate limit):** exponential backoff — 30s, 60s, 90s, 120s, 150s waits
- **504 (query timeout):** batch is too heavy — splits into individual city queries
- **Silent timeout:** Wikidata sometimes returns HTTP 200 with 0 rows when Blazegraph internally times out at ~60s. Detected by `elapsed > 30s && rows === 0` → retries with a lite query (fewer OPTIONALs)

---

## `scripts/fetch-companies.js`

Queries Wikidata to build `companies.json`. This is the most technically complex script.

### Significance filter

Two paths qualify a company for inclusion:

1. **Stock-exchange listed** (`wdt:P414 []`) — covers NYSE, NASDAQ, LSE, TSE, SSE, SZSE, HKEX, and hundreds more. Revenue isn't required; listing itself signals significance.
2. **Large private company** — has revenue ≥ 1B in any currency (`wdt:P2139`), and is not a non-profit/foundation/government body.

This combination captures listed firms (including early-stage with negative revenue) and significant unlisted firms like Huawei or IKEA-scale companies.

### HQ matching with P131 hop

Some companies record their HQ at a district level rather than city level. Samsung's registered address is in Gangnam-gu (a Seoul district), not Seoul itself. The query resolves this with:

```sparql
{ ?co wdt:P159 ?hq . }
UNION
{ ?co wdt:P159 ?loc . ?loc wdt:P131 ?hq . }
```

One `P131` (administrative territory) hop up from the recorded location catches these cases.

### GROUP BY + GROUP_CONCAT — the row explosion problem

Naively fetching all historical financial data produces a cross-product of rows. A company with 5 revenue years × 4 net_income years × 3 employee records × 2 asset records = **120 rows per company**. At 20 companies per batch, that's 2,400 rows, hitting the 2,000-row LIMIT and truncating data.

The solution: `GROUP BY ?co ?coLabel ?hq` collapses all rows per company into one. Financial history is collected via `GROUP_CONCAT(DISTINCT …)`:

```sparql
GROUP_CONCAT(DISTINCT CONCAT(STR(?rev), "|", IF(BOUND(?revYr), STR(?revYr), "")); separator="§")
AS ?revenueHist
```

`DISTINCT` removes the cross-product duplicates (e.g. `"1000000|2023"` appearing 24 times). The result is a `"§"`-separated string like `"1000000|2020§1200000|2021§1500000|2022"`.

`LIMIT 2000` now applies to **companies** (result rows after GROUP BY), not raw SPARQL rows — so the cap no longer silently truncates large city hubs like Tokyo or Seoul.

### parseHistory()

Parses a GROUP_CONCAT string into a sorted `[{year, value}]` array:

```javascript
"1000000|2020§1200000|2021§1500000|2022"
  →  [{ year: 2020, value: 1000000 }, { year: 2021, value: 1200000 }, { year: 2022, value: 1500000 }]
```

The most recent entry is derived as the scalar `revenue` / `revenue_year` for backwards-compatible display and sorting.

### Fields stored per company

| Field | Type | Notes |
|---|---|---|
| `qid` | string | Wikidata entity ID |
| `name` | string | Label in best available language |
| `industry` | string | P452 (industry) label |
| `exchange` | string | First exchange label (NYSE, TSE, etc.) |
| `ticker` | string | P249 ticker symbol |
| `employees` | number | Most recent headcount |
| `employees_history` | `[{year, value}]` | Full time-series |
| `revenue` | number | Most recent revenue (any currency) |
| `revenue_year` | number | Year of most recent revenue figure |
| `revenue_history` | `[{year, value}]` | Full time-series |
| `net_income` | number | Most recent |
| `net_income_history` | `[{year, value}]` | Full time-series |
| `operating_income` | number | Most recent |
| `operating_income_history` | `[{year, value}]` | Full time-series |
| `total_assets` | number | Most recent |
| `total_assets_history` | `[{year, value}]` | Full time-series |
| `total_equity` | number | Most recent |
| `total_equity_history` | `[{year, value}]` | Full time-series |
| `founded` | number | Year founded (P571) |
| `website` | string | Official website (P856) |
| `wikipedia` | string | English Wikipedia URL |

### Resilience (same pattern as fetch-cities, stricter)

- **Batch 504:** splits into individual city queries, max 2 retries each (not 5 — a city that always times out on full query should fail fast)
- **Individual city 504 exhausted:** falls back to `fetchLite()` — P414-only query with no financial OPTIONALs, completes in 2–5s where full query fails
- **Silent timeout (0 rows, >30s):** retries with lite query
- **Heavy batch (>60s total):** 20s cooldown before next batch to let Wikidata's rate-limit counters reset
- **429:** full exponential backoff (transient rate limit, always recoverable with waiting)

---

## `public/index.html`

The entire frontend in one file. No build tools, no framework — just HTML, CSS, and vanilla JS loaded in a browser.

### Map layer (Leaflet)

Leaflet renders city markers as `L.circleMarker` objects. Marker radius is scaled by population using a logarithmic scale so Tokyo's dot doesn't dwarf every other city. Markers are colored by continent.

A GeoJSON choropleth layer colors country polygons by any of 8 World Bank indicators. The fill color is recalculated on each indicator change using a 5-quantile scale.

### City sidebar

Clicking a city marker:
1. Opens the Wikipedia sidebar and shows a loading spinner
2. Fetches the English Wikipedia summary via the REST API (`/api/rest_v1/page/summary/…`)
3. If the city's country has a non-English Wikipedia language, fetches the local-language article via Wikidata's sitelink lookup
4. Displays the extract, thumbnail, city stats table (population, area, elevation, country), and World Bank indicators for the country

### Corporation panel

Clicking the "Corporations (N) ↗" button in a city popup:
1. Opens a right-side panel (slides in at 460px)
2. Reads the company list from `companies.json` (already in memory)
3. Renders a sortable, searchable table of companies for that city
4. Clicking a company row opens its Wikipedia article in the wiki sidebar and shows a financial data table with history pills

### History pills in the detail panel

For any financial field with 2+ data points, a row of year-labeled pills appears below the main value:

```
Revenue    $1.5B  2022
  [2020: $1.0B]  [2021: $1.2B]  [2022: $1.5B]  ← pills; most recent in green
```

This applies to: Revenue, Operating Income, Net Income, Total Assets, Total Equity, and Employees. The complete time-series is stored in `data-fin` (JSON in a `data-` attribute on each table row) and read when the row is clicked.

### Data flow summary

```
Page load
  └─ fetch cities-full.json      → allCities[] (Leaflet markers)
  └─ fetch country-data.json     → countryData{} (choropleth, sidebar stats)
  └─ fetch world-countries.json  → L.geoJSON choropleth layer
  └─ fetch companies.json        → companiesData{} (keyed by city QID)

User clicks city marker
  └─ lookup companiesData[city.qid]  → corp count badge in popup
  └─ open Wikipedia sidebar          → fetch Wikipedia API

User opens corp panel
  └─ render companiesData[city.qid]  → sortable table
  └─ click company row               → fetch Wikipedia API (company article)
                                     → render finData history pills
```

---

## `scripts/fetch-country-data.js`

Fetches 8 World Bank development indicators for every country via the World Bank REST API. Fast (~1 minute). Output is `country-data.json` keyed by ISO-2 code.

Indicators fetched:

| Indicator code | What it measures |
|---|---|
| NY.GDP.PCAP.CD | GDP per capita (USD) |
| SP.POP.TOTL | Total population |
| SP.DYN.LE00.IN | Life expectancy at birth |
| SE.ADT.LITR.ZS | Adult literacy rate |
| NE.TRD.GNFS.ZS | Trade as % of GDP |
| SH.MED.BEDS.ZS | Hospital beds per 1,000 |
| EG.ELC.ACCS.ZS | Access to electricity (%) |
| IT.NET.USER.ZS | Internet users (%) |

---

## Design decisions worth noting

**Revenue in local currency, not USD.** Wikidata financial figures are in each company's reporting currency. A Chinese company reporting in RMB will show a much larger number than a US company reporting in USD. This is intentional — exchange rates fluctuate and adding a conversion step would introduce its own staleness problem. The data is useful for trend analysis within a company's own history, not for cross-currency comparison.

**10,000 population floor.** Cities below 10k are excluded. At this scale of analysis — corporate geography, national economic indicators — sub-10k settlements add noise. The floor can be changed in `LOWER_BOUND` in fetch-cities.js but is intentionally kept at 10k.

**No backend at runtime.** All data is pre-built into JSON files. The app works as a GitHub Pages static site. The only "server" needed is during the data build phase.

**Wikidata as the authoritative source.** Both city and company data come from Wikidata via SPARQL. This gives us consistent entity IDs (QIDs) that serve as reliable join keys across datasets, plus multilingual labels and rich structured data that Wikipedia prose alone doesn't have.

**P131 hop for district HQs.** Some of the world's largest companies (Samsung, Sony subsidiaries, etc.) record their HQ in a district or ward rather than the parent city. One `wdt:P131` (located in administrative territory) hop up from the recorded location catches these without expanding the query to an arbitrary depth.

---

## Running the full data pipeline

```bash
# 1. Cities — 1–2 hours depending on Wikidata load
npm run fetch-cities

# 2. Companies — 6–8 hours; run after fetch-cities so new cities are included
npm run fetch-companies -- --fresh

# 3. Country indicators — ~1 minute
npm run fetch-country-data
```

Steps 1 and 2 both support checkpoint/resume. If interrupted, re-run the same command without `--fresh` to resume. The checkpoint file is saved in `scripts/` and deleted on clean completion.
