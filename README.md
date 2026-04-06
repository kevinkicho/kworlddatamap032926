# World Data Map

An interactive world map that layers city demographics, corporate headquarters, national economic indicators, governance scores, US trade flows, real estate data, climate normals, heatmaps, and live FX rates into a single explorable interface.

**Live demo:** https://kevinkicho.github.io/kworlddatamap032926

> **Built with Claude Code:** Nearly all of this codebase — from the data pipeline scripts to the frontend map logic — was written collaboratively with [Claude Code](https://claude.ai/code) (Anthropic's AI CLI). The human contributor directed features, reviewed output, and provided domain context; Claude Code did the implementation.

---

## What it does

### Cities layer
- ~14,000 cities worldwide (10k+ population floor, 34 settlement types from Wikidata)
- Click any dot → Wikipedia sidebar with summary, photos, key facts, climate chart
- Colour-coded by population on a log scale; filter and sort via the Explore Cities panel

### Filter & Heatmap panel
A unified filter sidebar (FAB button, bottom-right) with:

**Availability filters** — show only cities that have data for a given dataset:
- Air Quality (WHO PM2.5), Metro System, Nobel Laureates, Universities
- Selecting one auto-switches other cities to hidden and matched cities to intensity colouring

**Value filters** — threshold sliders:
- Population, Air Quality index, Metro stations, Nobel count, University count

**Heatmap** — gradient overlay for any metric:
- 4 colour palettes: Warm, Viridis, Inferno, Ocean
- Radius / Blur / Intensity sliders
- Dot intensity mode: matched city dots colour by metric value (p95-normalised)

**Dot controls** — independent vis/colour settings for matched vs other cities:
- Matched: Show / Dim / Hide × Pop colour / Intensity colour
- Other: Full / Dim / Hide × Pop colour / Ghost

### Choropleth layer
- Colours entire countries by World Bank development indicators
- Legend and coverage stats update live as you switch indicators

### Country panel — National Data
Click any country border → full data panel with left/right columns:

**Left column (gauges + history):**
- World Bank: GDP per capita, life expectancy, urban %, internet access, literacy, electricity access, Gini, child mortality, PM2.5 air quality, forest cover, air/road death rates
- IMF WEO: Government debt (% GDP), fiscal balance, CPI inflation, unemployment rate
- FRED/OECD: 10-year bond yield with 5-year history chart (27 developed countries)
- Central Bank: policy rate + bank name (29 countries across 11 currency blocs)
- Credit Ratings: S&P, Moody's, Fitch (12 major economies)
- Governance (WGI): Rule of Law, Control of Corruption, Govt Effectiveness, Voice & Accountability, Political Stability, Regulatory Quality
- Human Development: UNDP HDI score and rank
- Transparency & Freedom: TI Corruption Perceptions Index, Freedom House status
- Energy Mix: Wind/solar, hydro, nuclear, gas, coal percentages (Ember/OWID, ~200 countries)
- Happiness: WHR score with GDP, social, health, freedom, generosity, corruption components (~150 countries)
- Innovation & Labor (OECD): R&D spending, tax revenue, hours worked, PISA scores, minimum wage (37 countries)
- Social & Wages (OECD): Average wages, productivity, gender pay gap, social spending, youth unemployment, poverty rate
- Trade & Investment (World Bank): Trade/GDP, exports, imports, current account, FDI inflows (257 countries)
- Health (WHO): Physicians, nurses, hospital beds per 10k, DPT3 immunization, maternal mortality, NCD mortality (186-195 countries)
- ECB / Euribor: Deposit rate, refi rate, Euribor 3M, bond yields and spreads (Eurozone only)
- BoJ / MoF: JGB yield curve (Japan only)
- Trade Partners: Top 5 export/import partners with names and dollar values, clickable to navigate (UN Comtrade, ~100 countries)

**Right column:**
- Economy radar chart (6 axes) with world-average polygon
- Energy radar chart (5 axes: wind/solar, hydro, nuclear, gas, coal) with percentile-based scaling
- Tabbed Economy / Energy toggle
- Rank chips: GDP/cap, HDI, TI CPI, Rule of Law, Anti-Corruption, Renewables, Internet, Life Expectancy, Urban %, Electricity
- Regional sub-rank within Europe & Central Asia, East Asia & Pacific, etc.

*Every gauge row and stat card is clickable — opens the Stats distribution panel showing all countries ranked for that indicator, with data source attribution.*

### Economic Centers layer
- Zoom-adaptive clustering of corporate headquarters by market cap or revenue
- Click a cluster → convex-hull expands, Bézier arcs connect constituent cities
- Zoom-persistent selection; metric and dot-visibility toggles

### Corporations panel
- City-level: full company list with revenue history, net income, assets, employees, analyst ratings
- Global: "All Corporations" panel with search, country/industry filter, USD-normalized sort
- Finance tab: 5-year price chart, analyst consensus (rating, target price, count), income/balance sheet

### BEA Trade Flow arrows
- Click any country → animated curved arrows to/from United States
- Year slider 1999–2025 (Bureau of Economic Analysis ITA, pre-fetched)

### FX Rate sidebar
- Fetches ECB reference rates (Frankfurter API) for any historical date
- ~58 currencies editable inline; economic dot sizes recalculate instantly
- Rates persist in localStorage

### City data tabs
| Tab | Data | Coverage |
|---|---|---|
| Overview | Climate normals (monthly high/low/precip), city facts | ~14k cities |
| Economy | Revenue/market cap for HQ'd companies | ~9k cities |
| Census | ACS 2023 income, poverty, housing, education | 470 US cities |
| Eurostat | Labour market, living conditions, company count | 512 European cities |
| NOAA Climate | 1991–2020 US climate normals | 447 US cities |

### Stats distribution panel
- Click any gauge row or rank chip → histogram + neighbour list slides in
- National rank, ±5 ranked neighbours, scrollable full list

---

## Running locally

```bash
npm install
npm start       # serves public/ on http://localhost:3000
```

## Test suite

```bash
npm test        # 161 unit tests, ~1 second, zero extra dependencies (node:test built-in)
```

---

## Data sources

All data is pre-fetched by Node.js scripts and committed as JSON — **the app makes no API calls at runtime** except for FX rates (Frankfurter) and Wikipedia content (on city click).

### City & Company data

| Dataset | Source API / URL | Key | Notes |
|---|---|---|---|
| ~14k world cities | [Wikidata SPARQL](https://query.wikidata.org/sparql) | None | P31 type-filter, 10k+ pop floor |
| City infoboxes | [Wikipedia MediaWiki API](https://en.wikipedia.org/w/api.php) | None | Nicknames, leaders, metro pop, climate |
| Company discovery & financials | [Wikidata SPARQL + wbgetentities](https://www.wikidata.org/w/api.php) | None | ~9k companies, full financial time-series |
| Company market caps | Wikidata wbgetentities (P2226) | None | Supplemental one-time fetch |
| Wikipedia infoboxes (companies) | [Wikipedia MediaWiki API](https://en.wikipedia.org/w/api.php) | None | Revenue, employees, key people |
| Analyst ratings & fundamentals | Yahoo Finance quoteSummary (`/v1/finance/`) | None* | 83 companies; session cookie required |
| World city tiers (GaWC 2024) | [GaWC dataset](https://www.lboro.ac.uk/gawc/world2024.html) | None | 305 cities keyed by Wikidata QID |
| Nobel laureate cities | [Wikidata SPARQL](https://query.wikidata.org/sparql) | None | 289 cities — counts by prize category |
| Universities by city | [Wikidata SPARQL](https://query.wikidata.org/sparql) | None | 1,923 cities — university counts |
| Metro/transit systems | Wikidata SPARQL (P81, P1192) | None | 248 cities — lines + station counts |
| WHO Air Quality | [WHO ambient air quality data](https://www.who.int/data/gho/data/themes/air-pollution) | None | 1,561 cities — PM2.5 annual mean |

\* Yahoo Finance uses a session cookie + crumb, not a formal key — but usage terms apply.

### Country-level data

| Dataset | Source API / URL | Key | Coverage | Fields |
|---|---|---|---|---|
| Development indicators | [World Bank Open Data API](https://api.worldbank.org/v2/) | None | ~190 countries | GDP/cap, life expectancy, urban %, Gini, internet, child mortality, electricity, literacy, PM2.5, forest %, air/road death rates |
| Sustainability indicators | [World Bank Open Data API](https://api.worldbank.org/v2/) | None | 226–260 countries | CO₂/capita, renewable energy %, health spend %, education spend % |
| Governance (WGI) | [World Bank Open Data API](https://api.worldbank.org/v2/) | None | 205 countries | Rule of law, corruption, govt effectiveness, voice & accountability, political stability, regulatory quality |
| Fiscal / debt | [IMF DataMapper API](https://www.imf.org/external/datamapper/api/) | None | 191–193 countries | Govt debt % GDP, fiscal balance % GDP |
| CPI inflation & unemployment | [IMF DataMapper API](https://www.imf.org/external/datamapper/api/) | None | 114–193 countries | CPI % change, unemployment rate |
| 10-yr bond yields | [FRED API](https://fred.stlouisfed.org/docs/api/fred/) (OECD series) | **Required** | 27 OECD countries | Monthly yield, 5-yr history |
| Human Development Index | [UNDP HDR data centre](https://hdr.undp.org/data-center/documentation-and-downloads) | None | 193 countries | HDI score, rank, year |
| Corruption Perceptions Index | [Transparency International CPI 2023](https://www.transparency.org/en/cpi/2023) | None (static) | 138 countries | Score 0–100, rank |
| Freedom in the World | [Freedom House 2024](https://freedomhouse.org/report/freedom-world) | None (static) | 121 countries | Aggregate score 0–100, Free/Partly Free/Not Free |
| Central bank policy rates | Static data (early 2025 values) | None | 29 countries, 11 currency blocs | Rate %, bank name, rate label |
| Sovereign credit ratings | Static data | None | 12 major economies | S&P, Moody's, Fitch |
| Energy mix | [Our World in Data / Ember](https://github.com/owid/etl) | None | ~200 countries | Wind/solar, hydro, nuclear, gas, coal % |
| World Happiness Report | [WHR 2024 data](https://worldhappiness.report/) | None | ~150 countries | Happiness score + 6 sub-factors |
| OECD social/labour indicators | [OECD SDMX API](https://stats.oecd.org/) | None | 37 OECD members | Wages, productivity, gender pay gap, social spend, youth unemployment, poverty |
| Trade & investment | [World Bank Open Data API](https://api.worldbank.org/v2/) | None | 257 countries | Trade/GDP, current account, FDI, exports, imports |
| WHO health indicators | [WHO GHO OData API](https://ghoapi.azureedge.net/api/) | None | 186–195 countries | Physicians, nurses, hospital beds, DPT3 immunization, maternal/NCD mortality |
| Economic Complexity Index | [OEC Atlas](https://oec.world/) | None | ~130 countries | ECI score |
| Trade partners | [UN Comtrade](https://comtradeplus.un.org/) | None | ~100 countries | Top 5 export/import partners with values |
| ECB rates & bonds | [ECB Data Portal](https://data.ecb.europa.eu/) | None | Eurozone countries | Deposit/refi rates, Euribor, 10Y yields, spreads |
| BoJ yields | [MoF Japan](https://www.mof.go.jp/) | None | Japan | JGB 2Y, 5Y, 10Y yields |

### US regional data

| Dataset | Source API / URL | Key | Coverage |
|---|---|---|---|
| ACS 5-year estimates 2023 | [Census Bureau ACS API](https://api.census.gov/data/2023/acs/acs5) | None | 470 cities — income, poverty, housing, education |
| County Business Patterns 2022 | [Census Bureau CBP API](https://api.census.gov/data/2022/cbp) | None | 473 cities — establishments, payroll, sector mix |
| Annual Business Survey 2021 | [Census Bureau ABS API](https://api.census.gov/data/2021/abscs) | None | State-level employer firm counts |
| Population (Decennial 2020) | [Census Bureau Decennial API](https://api.census.gov/data/2020/dec/pl) | None | Exact population at place level |
| FIPS code resolution | [Census Geocoder API](https://geocoding.census.gov/geocoder/) | None | Lat/lng → state+place FIPS |
| Bilateral trade flows | [BEA ITA API](https://apps.bea.gov/api/) | **Required** | 57 countries, annual 1999–2025 |
| Home values (ZHVI) | [Zillow Research CSV](https://www.zillow.com/research/data/) | None | 448 US cities, annual history to 2000 |
| Rent index (ZORI) | [Zillow Research CSV](https://www.zillow.com/research/data/) | None | 448 US cities, annual history |
| NOAA climate normals | [NOAA CDO API](https://www.ncdc.noaa.gov/cdo-web/api) | **Required** | 447 US cities — 1991–2020 monthly normals |

### European & Japan data

| Dataset | Source API / URL | Key | Coverage |
|---|---|---|---|
| Urban Audit — Labour market | [Eurostat API](https://ec.europa.eu/eurostat/api/dissemination/) (urb_clma) | None | 512 cities — unemployment, activity rate |
| Urban Audit — Living conditions | [Eurostat API](https://ec.europa.eu/eurostat/api/dissemination/) (urb_clivcon) | None | 512 cities — income, poverty, homeownership, rent |
| Urban Audit — Economy | [Eurostat API](https://ec.europa.eu/eurostat/api/dissemination/) (urb_cecfi) | None | 512 cities — total companies |
| Prefectural GDP & income | [Japan Cabinet Office SNA](https://www.esri.cao.go.jp/jp/sna/data/data_list/kenmin/) | None | 47 prefectures, 2011–2022 XLSX |

### Geography, climate & aviation

| Dataset | Source / URL | Key | Coverage |
|---|---|---|---|
| Country borders | [Natural Earth via world-atlas (unpkg CDN)](https://unpkg.com/world-atlas@2/countries-50m.json) | None | 50m-resolution GeoJSON |
| Climate normals (ERA5) | [Open-Meteo Historical API](https://archive-api.open-meteo.com/v1/archive) | None | ~150 cities, 2014–2023 10-yr averages |
| Airport routes | [OpenFlights GitHub (CC BY 3.0)](https://raw.githubusercontent.com/jpatokal/openflights/master/data/) | None | 1,175 cities, direct destinations |

### Runtime APIs (called live in the browser)

| Purpose | API | Key |
|---|---|---|
| FX rates (any historical date) | [Frankfurter / ECB reference rates](https://api.frankfurter.app/) | None |
| City Wikipedia summary + photos | [Wikipedia REST API](https://en.wikipedia.org/api/rest_v1/) | None |
| Wikipedia infobox (on click) | [MediaWiki Action API](https://en.wikipedia.org/w/api.php) | None |
| Wikidata sitelink lookup | [Wikidata Action API](https://www.wikidata.org/w/api.php) | None |
| City photos | [Wikimedia Commons FilePath](https://commons.wikimedia.org/wiki/Special:FilePath/) | None |
| Company Wikipedia page | Wikipedia REST API (media-list + summary) | None |
| Local-language Wikipedia | Language-specific Wikipedia REST APIs | None |

### Potential future sources

| Source | What's available | Notes |
|---|---|---|
| Pew Research Center | Survey data: social attitudes, religion, demographics by country | No public API; PDFs + topline datasets available for download |
| WHO GHO (extended) | ~2,000 health indicators beyond the 6 currently integrated | Free REST API: `https://ghoapi.azureedge.net/api/` |
| OECD.Stat (extended) | 400+ datasets beyond the 12 currently integrated | Free SDMX-JSON API |
| Reserve Bank of India | Policy rates, CPI, IIP, FX reserves | Free REST API |
| CBRT (Turkey) | Policy rates, inflation, FX | Free REST API |
| PBoC (China) | LPR rates, M2, FX | HTML/CSV; structured access limited |
| OpenStreetMap Nominatim | Geocoding, admin boundaries, POI lookup | Free; rate-limited |
| GeoNames | City alternative names, admin hierarchy, timezone | Free API with registration |
| Global Carbon Project | Country CO₂ emissions with fossil/land-use breakdown | Annual CSV download |

---

## API keys required

Three data sources require API keys. Set them in a `.env` file:

```env
FRED_API_KEY=your_key_here      # Free at https://fred.stlouisfed.org/docs/api/api_key.html
BEA_API_KEY=your_key_here       # Free at https://apps.bea.gov/api/signup/
NOAA_TOKEN=your_token_here      # Free at https://www.ncdc.noaa.gov/cdo-web/token
```

All other data sources (World Bank, IMF, Census, Eurostat, Wikidata, Wikipedia, Open-Meteo, OpenFlights, Zillow, UNDP, Frankfurter) require **no API key**.

---

## Rebuilding the data

Data files are pre-built and committed. To regenerate:

```bash
# Cities (~1–2 hours; checkpoint/resume)
npm run fetch-cities

# City infoboxes — Wikipedia settlement data + climate charts
node scripts/fetch-city-infoboxes.js

# Companies (~6–8 hours; checkpoint/resume)
npm run fetch-companies
node scripts/fetch-market-cap.js       # supplement: Wikidata market caps
node scripts/fetch-infoboxes.js        # supplement: Wikipedia revenue/employees

# Analyst ratings (reads from ../kyahoofinance032926/data/stocks/)
node scripts/enrich-companies-yahoo.js

# Country indicators — World Bank, no key (~1 minute)
npm run fetch-country
node scripts/patch-country-pm25.js    # PM2.5, forest %, air/road death rates

# Governance (WGI) + sustainability — World Bank (~3 minutes)
node scripts/fetch-wgi.js

# Human Development Index — UNDP (~15 seconds)
node scripts/fetch-hdi.js

# TI CPI 2023 + Freedom House 2024 (static data, instant)
node scripts/enrich-freedom-scores.js

# Central bank rates + credit ratings (static data, instant)
node scripts/enrich-country-central-banks.js

# IMF fiscal data → merges into country-data.json, no key (~15 seconds)
npm run fetch-imf

# Bond yields → merges into country-data.json, requires FRED_API_KEY (~2 minutes)
npm run fetch-fred

# US Census — ACS + CBP + ABS + Decennial (~20 seconds)
node scripts/fetch-census-fips.js     # one-time: resolve FIPS codes
node scripts/fetch-census-data.js
node scripts/fetch-census-business.js

# BEA trade data, requires BEA_API_KEY (~2 minutes)
node scripts/fetch-bea-trade.js

# Eurostat Urban Audit (~15 seconds)
node scripts/fetch-eurostat.js
node scripts/fetch-eurostat-extended.js

# Japan Cabinet Office prefectural GDP/income
node scripts/fetch-japan-stats.js

# Real estate — Zillow Research CSVs (~30 seconds)
node scripts/fetch-zillow.js

# Airport connectivity — OpenFlights (~10 seconds)
node scripts/fetch-openflights.js

# Climate normals — Open-Meteo ERA5 (~5 minutes for ~150 cities)
node scripts/fetch-climate.js

# NOAA US climate normals — requires NOAA_TOKEN (~10 minutes)
node scripts/fetch-noaa-climate.js

# WHO air quality — PM2.5 annual means (~30 seconds)
node scripts/fetch-who-airquality.js

# Nobel laureate cities — Wikidata SPARQL (~10 seconds)
node scripts/fetch-nobel-cities.js

# Universities by city — Wikidata SPARQL (~15 seconds)
node scripts/fetch-wikidata-universities.js

# Metro/transit systems — Wikidata SPARQL (~15 seconds)
node scripts/fetch-metro-transit.js

# GaWC world city tiers (data file already in public/)
node scripts/migrate-gawc.js

# Auto-generate data manifest
node scripts/write-manifest.js
```

Each checkpoint-enabled script resumes from where it left off. Add `--fresh` to restart.

---

## Project structure

```
public/
  index.html                  # app shell + panel HTML
  app.js                      # ~7,500-line frontend (vanilla JS)
  style.css                   # all styles
  cities-full.json            # ~14k city records with climate, infobox data
  companies.json              # ~9k companies keyed by city QID (history as [[year,val]] tuples)
  country-data.json           # World Bank + IMF + FRED + WGI + HDI + TI + FH + CB data
  world-countries.json        # GeoJSON country borders (Natural Earth)
  census-cities.json          # ACS 2023, 470 US cities
  census-business.json        # CBP 2022, 473 US cities
  bea-trade.json              # BEA ITA, 57 countries 1999–2025
  eurostat-cities.json        # Eurostat Urban Audit, 512 European cities
  japan-prefectures.json      # Cabinet Office, 47 prefectures 2011–2022
  zillow-cities.json          # Zillow ZHVI + ZORI, 448 US cities
  airport-connectivity.json   # OpenFlights, 1,175 cities
  climate-extra.json          # Open-Meteo ERA5, ~150 cities
  noaa-climate.json           # NOAA 1991–2020 normals, 447 US cities
  gawc-cities.json            # GaWC 2024 tiers, 305 cities (QID-keyed)
  who-airquality.json         # WHO PM2.5 annual mean, 1,561 cities
  metro-transit.json          # Metro/transit systems, 248 cities
  nobel-cities.json           # Nobel laureate counts by city, 289 cities
  universities.json           # University counts by city, 1,923 cities
  oecd-country.json           # OECD social/labour indicators, 37 countries
  eci-data.json               # Economic Complexity Index, ~130 countries
  comtrade-partners.json      # UN Comtrade top trade partners, ~100 countries
  ecb-data.json               # ECB rates, Euribor, TARGET2 balances
  ecb-bonds.json              # Eurozone 10Y bond yields + spreads
  boj-yields.json             # BoJ JGB yield curve
  gawc-cities.json            # GaWC 2024 tiers, 305 cities (QID-keyed)
  data-manifest.json          # auto-generated file registry

scripts/
  fetch-cities.js             # Wikidata SPARQL → cities-full.json
  fetch-city-infoboxes.js     # Wikipedia API → city infoboxes + climate
  fetch-companies.js          # Wikidata SPARQL + wbgetentities → companies.json
  fetch-market-cap.js         # Wikidata P2226 → market caps
  fetch-infoboxes.js          # Wikipedia API → company revenue/employees
  fetch-tickers.js            # Yahoo Finance search → ticker symbols
  fetch-yahoo.js              # Yahoo Finance quoteSummary → fundamentals
  fetch-prices.js             # Yahoo Finance chart → 5-yr price history
  enrich-companies-yahoo.js   # kyahoofinance032926 stocks → analyst ratings
  fetch-country-data.js       # World Bank API → development indicators
  patch-country-pm25.js       # World Bank API → PM2.5, forest, death rates
  fetch-wgi.js                # World Bank WGI + sustainability → governance
  fetch-hdi.js                # UNDP HDR CSV → HDI scores + ranks
  enrich-freedom-scores.js    # Static TI CPI 2023 + Freedom House 2024
  enrich-country-central-banks.js  # Static CB rates + credit ratings
  fetch-imf.js                # IMF DataMapper → fiscal data (merges into country-data.json)
  fetch-fred.js               # FRED API → 10-yr bond yields (merges into country-data.json)
  fetch-census-fips.js        # Census Geocoder → FIPS codes
  fetch-census-data.js        # Census ACS API → income, housing, education
  fetch-census-business.js    # Census CBP/ABS/Decennial → business patterns
  fetch-bea-trade.js          # BEA ITA API → bilateral trade flows
  fetch-eurostat.js           # Eurostat API → Urban Audit labour + living
  fetch-eurostat-extended.js  # Eurostat API → extended indicators
  fetch-japan-stats.js        # Japan Cabinet Office XLSX → prefectural data
  fetch-zillow.js             # Zillow Research CSV → home values + rent
  fetch-openflights.js        # OpenFlights GitHub → airport routes
  fetch-climate.js            # Open-Meteo ERA5 → climate normals
  fetch-noaa-climate.js       # NOAA CDO API → US climate normals
  fetch-who-airquality.js     # WHO ambient air quality → PM2.5 by city
  fetch-metro-transit.js      # Wikidata SPARQL → metro/transit systems
  fetch-nobel-cities.js       # Wikidata SPARQL → Nobel laureate counts
  fetch-wikidata-universities.js  # Wikidata SPARQL → university counts
  fetch-ember.js              # OWID/Ember → energy mix percentages
  fetch-whr.js                # World Happiness Report → happiness scores
  fetch-oecd-social.js        # OECD SDMX → social/labour indicators
  fetch-trade.js              # World Bank → trade & investment indicators
  fetch-who.js                # WHO GHO → health indicators
  fetch-eci.js                # OEC → Economic Complexity Index
  fetch-comtrade.js           # UN Comtrade → top trade partners
  fetch-ecb.js                # ECB → rates, Euribor, TARGET2
  fetch-ecb-bonds.js          # ECB → Eurozone bond yields + spreads
  fetch-boj.js                # BoJ/MoF → JGB yield curve
  fetch-world-geo.js          # world-atlas CDN → GeoJSON borders
  migrate-gawc.js             # GaWC data → QID-keyed JSON
  migrate-country-data.js     # One-time: merged imf-fiscal + fred-yields → country-data
  migrate-companies-history.js  # One-time: converted history objects → [[year,val]] tuples
  write-manifest.js           # Generates data-manifest.json

lib/
  pure-utils.cjs              # Pure functions extracted for unit testing

tests/
  pure-utils.test.js          # Core utility tests
  migrate-country-data.test.js
  migrate-gawc.test.js
  migrate-companies-history.test.js
  test-rank-chips.test.js
  test-trend-tab.test.js
  # 161 tests total (node:test, zero extra dependencies)
```

---

## Tech stack

- **Frontend:** Leaflet.js, Leaflet.heat, vanilla JS/HTML/CSS, dark GitHub-inspired theme
- **Map tiles:** CARTO Dark Matter (OpenStreetMap data)
- **Data pipeline:** Node.js — 49 fetch scripts calling 25+ APIs
- **Testing:** Node.js built-in `node:test` — 161 tests, zero extra dependencies
- **Hosting:** Fully static — no backend required after data build

---

## License

MIT — feel free to use, modify, and share.
