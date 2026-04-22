## Security Notice

**⚠️ IMPORTANT: API Keys in .env**

This project uses a `.env` file for API keys (Yahoo Finance, FRED, NASA, etc.). 
Even though `.env` is in `.gitignore`, accidental commits or file sharing could expose these secrets.

### Why .gitignore isn't enough:
1. **History**: If `.env` was committed before `.gitignore` was added, it stays in git history forever
2. **Staging**: `git add -A` or `git add .` can stage files before `.gitignore` is applied
3. **Backup/sync**: Cloud sync tools, backups, or archives may include `.env`
4. **Submodules**: Secrets can leak via git submodules or worktrees

### Protection measures in place:
- `.env` is in `.gitignore`
- Pre-commit hooks prevent `.env` commits (run `setup-hooks.bat` to install)
- `.env.example` template shows required variables without real values
- `SECURITY.md` has key rotation instructions

### Quick setup:
1. Copy `.env.example` to `.env` and fill in real keys
2. Run `setup-hooks.bat` to install pre-commit protection
3. Never share `.env` or commit it

See [SECURITY.md](SECURITY.md) for key rotation instructions.

### Recent security fixes (2026-04-10)
- Fixed broken module imports (`./state.js` → `../state.js`) in cleanup-registry, event-patch, eez-layer, and wildfire-layer
- Fixed XSS: unescaped data in innerHTML for GTD terrorism, UNESCO heritage, and trade partner onclick attributes
- Fixed XSS: stripped `<script>` tags from `showModal()` content in panel-utils
- Fixed mixed-content: changed ISS tracker from `http://` to `https://`
- Fixed write race condition on `/api/enrich` endpoint (serialized writes)
- Added 8 missing layers to cleanup registry ( предотвращ memory leaks)
- Removed dev-only modules (var-migration, xss-audit) from production bundle
- Consolidated duplicate `showToast` and `escHtml` utility functions
- Fixed broken IIFE string concatenation chain in `_renderCountryPanel`
- Tightened ESLint: `no-unused-vars` and `no-redeclare` changed from `off` to `warn`
- Added `scripts/build-kdb.js` to consolidate all data into single `kdb.json` for Firebase RTDB migration
- Added kdb-aware data loading helpers (`_kdbGet`, `_kdbOrFetch`) — backwards compatible, falls back to individual file fetches

---

# World Data Map

An interactive world map that layers city demographics, corporate headquarters, national economic indicators, governance scores, trade flows, real estate data, climate normals, subnational boundaries, geological overlays, live satellite tracking, and 145+ country-level indicators into a single explorable interface.

**Live demo:** https://kevinkicho.github.io/kworlddatamap032926

**Build status:** 582KB bundled · 106 fetch scripts · 133 pure-utils tests passing · ESLint clean (2026-04-22)

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
- Air Quality (WHO PM2.5), Metro System, Nobel Laureates, Universities, Startups, UNESCO Sites, University Rankings
- Selecting one auto-switches other cities to hidden and matched cities to intensity colouring

**Value filters** — threshold sliders:
- Population, Air Quality index, Metro stations, Nobel count, University count

**Heatmap** — gradient overlay for any metric:
- 4 colour palettes: Warm, Viridis, Inferno, Ocean
- Radius / Blur / Intensity sliders
- Dot intensity mode: matched city dots colour by metric value (p95-normalised)

**Dot controls** — independent vis/colour settings for matched vs other cities:
- Matched: Show / Dim / Hide x Pop colour / Intensity colour
- Other: Full / Dim / Hide x Pop colour / Ghost

### Admin-1 subnational boundaries
- Toggle "Regions" in the top bar → viewport-based lazy loading of first-level admin divisions (states, provinces, prefectures)
- Hover tooltip shows GDP, unemployment, HDI, population where available
- Click any region → sidebar panel with Economy, Human Development, Labour, Demographics sections
- Pre-built subnational data: US (51 states), Japan (47 prefectures), Germany (16 Bundeslander), UK (12 NUTS-1), France (18 regions), South Korea (17 provinces), China (31 provinces), India (36 states), Canada (13 provinces), Australia (8 states), Brazil (27 states), Spain (19 regions), Italy (20 regions), Mexico (32 states), Indonesia (34 provinces)
- Subnational HDI overlay: HDI + health/education/income sub-indices for 400+ regions across 9 countries
- Eurostat NUTS-2 fallback for EU countries without dedicated data
- Mutually exclusive with choropleth layer (one active at a time)

### Choropleth layer
- Colours entire countries by 40+ development/governance/economic indicators
- Legend and coverage stats update live as you switch indicators
- "National borders: On/Off" toggle with hidden Color-by controls until activated

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
- **Peace & Security:** Military spending (% GDP), Global Peace Index score/rank, Press Freedom score/rank
- Energy Mix: Wind/solar, hydro, nuclear, gas, coal percentages (Ember/OWID, ~200 countries)
- **Nuclear Energy:** Reactor count, capacity (GW), generation (TWh) (IAEA PRIS, 31 countries)
- Happiness: WHR score with GDP, social, health, freedom, generosity, corruption components (~150 countries)
- Innovation & Labor (OECD): R&D spending, tax revenue, hours worked, PISA scores, minimum wage (37 countries)
- Social & Wages (OECD): Average wages, productivity, gender pay gap, social spending, youth unemployment, poverty rate
- Trade & Investment (World Bank): Trade/GDP, exports, imports, current account, FDI inflows (257 countries)
- Health (WHO): Physicians, nurses, hospital beds per 10k, DPT3 immunization, maternal mortality, NCD mortality (186-195 countries)
- **Demographics & Environment:** Population growth, net migration, female labor force participation, safe water access, forest cover, research articles per capita
- **Digital Infrastructure:** Fixed broadband download/upload speeds, mobile download speed (Ookla, 123 countries)
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

### Map overlays
- **Tectonic plates:** GeoJSON plate boundary lines with readable fault names on hover (e.g., "African – Antarctic Boundary")
- **Live earthquakes:** USGS real-time feed (M2.5+), auto-refreshing every 5 minutes, circle size by magnitude, colour-coded by depth
- **Volcanoes:** 1,215 Smithsonian GVP volcanoes with red/orange/yellow dots by eruption status, tooltips show name, country, elevation, last eruption
- **ISS tracker:** Live International Space Station position with 5-second updates, polyline trail
- **Aircraft tracking:** Live aircraft positions from OpenSky Network (~12k aircraft, 30s refresh)
- **FlightAware routes:** Commercial flight routes with altitude-based coloring (long-haul, medium, short)
- **MarineTraffic ships:** Live vessel positions (cargo, tanker, passenger, cruise ships) with course arrows
- **Space launch sites:** 29 launch facilities worldwide with rocket emoji markers
- **Marine EEZ:** Exclusive Economic Zone boundaries for 275 maritime zones
- **Submarine cables:** Undersea internet cable routes with landing points
- **Air routes:** City-to-city flight connectivity overlay
- **Satellites:** 922 active satellites (GPS, GLONASS, Galileo, BeiDou, Iridium, ISS, weather, scientific)
- **Space weather:** Aurora visibility zones based on KP index (north/south polar regions)
- **Ocean currents:** Speed and direction arrows with color-coded velocity (cm/s)
- **Air quality:** WAQI live AQI stations with color-coded markers (Good to Hazardous)
- **Weather stations:** Open-Meteo current conditions (temp, humidity, wind, weather)
- **Terrorism incidents:** GTD historical incidents with attack type classification
- **Crypto adoption:** Country markers colored by CoinGecko adoption rank
- **Natural events:** NASA EONET real-time natural events (wildfires, storms, volcanoes, ice)
- **Protected areas:** Global protected areas with IUCN category classification
- **Internet exchanges:** PeeringDB internet exchange points worldwide
- **Live wildfires:** NASA FIRMS active fire hotspots (M6.5M+ locations)

**Layer controls:** Primary toggles (Cities, UNESCO, Economic) visible in top bar; additional layers accessible via "More ▼" dropdown, organized by category (Natural Hazards, Infrastructure, Other).

### Theme & basemap switching
- Dark/light theme toggle (keyboard shortcut: `t`)
- Basemap options: Street (auto dark/light), Satellite, Terrain
- Preferences saved to localStorage

### Keyboard navigation
Full keyboard shortcut support:
- `?` — Show keyboard shortcuts overlay
- `t` — Toggle dark/light theme
- `Escape` — Close panels
- `c` — Toggle choropleth
- `r` — Toggle regions
- And more (press `?` in-app for full list)

### Economic Centers layer
- Zoom-adaptive clustering of corporate headquarters by market cap or revenue
- Click a cluster → convex-hull expands, Bezier arcs connect constituent cities
- Zoom-persistent selection; metric and dot-visibility toggles

### Corporations panel
- City-level: full company list with revenue history, net income, assets, employees, analyst ratings
- Global: "All Corporations" panel with search, country/industry filter, USD-normalized sort
- Finance tab: 5-year price chart, analyst consensus (rating, target price, count), income/balance sheet

### BEA Trade Flow arrows
- Click any country → animated curved arrows to/from United States
- Year slider 1999-2025 (Bureau of Economic Analysis ITA, pre-fetched)

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
| NOAA Climate | 1991-2020 US climate normals | 447 US cities |

### Country comparison
- Compare any two countries side-by-side across all indicator categories
- Includes Peace & Security, Digital Infrastructure, and Demographics & Environment sections

### Stats distribution panel
- Click any gauge row or rank chip → histogram + neighbour list slides in
- National rank, +/-5 ranked neighbours, scrollable full list

---

## Data architecture

The app uses a **federated JSON architecture**: ~92 individual `.json` files in `public/`, each lazy-loaded on demand. This keeps the initial payload small (~2 MB for the first render) while making 277 MB of data available progressively.

### Firebase RTDB migration (optional)

`scripts/build-kdb.js` consolidates all 92 data files + 242 admin-1 boundary files into a single `kdb.json` (277 MB) with namespace keys matching filenames:

```
kdb.json = {
  "country-data": { "US": {...}, "CN": {...}, ... },
  "cities-full": [...],
  "oecd-country": {...},
  "admin1": { "US": {...}, "DE": {...}, ... },
  ...
}
```

Run `npm run build:kdb` to generate. For Firebase RTDB upload (<10 MB per write), use `node scripts/build-kdb.js --split` to produce 3 chunks + a manifest. The app includes `_kdbGet()` and `_kdbOrFetch()` helpers that check `S.kdb` first before falling back to individual file fetches, enabling a future migration path without changing data-access patterns.

Large files (>5 MB) are flagged as "static" in the manifest — these (EEZ boundaries, companies, wildfires, etc.) are better served from Firebase Storage than RTDB.

---

## Running locally

```bash
npm install
npm start       # serves public/ on http://localhost:3000
```

## Build & lint

```bash
npm run build   # esbuild: src/main.js → public/app.js (IIFE bundle)
npm run dev     # same, with --watch for development
npm run lint    # ESLint flat config (no-undef, no-unused-vars, eqeqeq)
npm run test    # 203 unit tests, ~1 second (node:test built-in)
npm run prod    # build + minify JSON data files
npm run build:kdb  # consolidate all data into kdb.json for Firebase RTDB
```

## CI/CD

GitHub Actions workflow (`.github/workflows/ci.yml`) runs on push/PR to main:
- Lint → Build → Test

---

## Data sources

All data is pre-fetched by Node.js scripts and committed as JSON — **the app makes no API calls at runtime** except for FX rates (Frankfurter), Wikipedia content (on city click), USGS earthquakes (live feed), ISS position (live tracker), and OpenSky aircraft positions (live tracker).

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
| University rankings | [QS / THE / ARWU data](https://www.topuniversities.com/) | None | Top universities by city with rankings |
| Metro/transit systems | Wikidata SPARQL (P81, P1192) | None | 248 cities — lines + station counts |
| Metro ridership | [UITP / Wikipedia](https://en.wikipedia.org/wiki/List_of_metro_systems) | None | 60 systems — annual ridership, lines, stations |
| WHO Air Quality | [WHO ambient air quality data](https://www.who.int/data/gho/data/themes/air-pollution) | None | 1,561 cities — PM2.5 annual mean |
| Container ports | [Lloyd's List / World Shipping Council](https://lloydslist.com/) | None | 50 ports — TEU throughput + rank |
| Tourism arrivals | [Euromonitor / Mastercard GDCI](https://newsroom.mastercard.com/) | None | 50 cities — international visitors/yr + rank |
| Patents by city | [WIPO / USPTO / EPO](https://www.wipo.int/ipstats/) | None | 76 cities — patents/yr + top fields |
| Startups | [StartupBlink / CB Insights / Crunchbase](https://www.startupblink.com/) | None | Unicorn counts, VC funding by city |
| UNESCO World Heritage | [UNESCO WHC](https://whc.unesco.org/) | None | Heritage sites by city |
| Cost of living | [Numbeo / EIU data](https://www.numbeo.com/) | None | Cost indices by city |

\* Yahoo Finance uses a session cookie + crumb, not a formal key — but usage terms apply.

### Country-level data (145+ indicators)

| Dataset | Source API / URL | Key | Coverage | Fields |
|---|---|---|---|---|
| Development indicators | [World Bank Open Data API](https://api.worldbank.org/v2/) | None | ~190 countries | GDP/cap, life expectancy, urban %, Gini, internet, child mortality, electricity, literacy, PM2.5, forest %, air/road death rates, pop growth, net migration, female labor %, safe water %, research articles |
| Sustainability indicators | [World Bank Open Data API](https://api.worldbank.org/v2/) | None | 226-260 countries | CO2/capita, renewable energy %, health spend %, education spend % |
| Governance (WGI) | [World Bank Open Data API](https://api.worldbank.org/v2/) | None | 205 countries | Rule of law, corruption, govt effectiveness, voice & accountability, political stability, regulatory quality |
| Fiscal / debt | [IMF DataMapper API](https://www.imf.org/external/datamapper/api/) | None | 191-193 countries | Govt debt % GDP, fiscal balance % GDP |
| CPI inflation & unemployment | [IMF DataMapper API](https://www.imf.org/external/datamapper/api/) | None | 114-193 countries | CPI % change, unemployment rate |
| 10-yr bond yields | [FRED API](https://fred.stlouisfed.org/docs/api/fred/) (OECD series) | **Required** | 27 OECD countries | Monthly yield, 5-yr history |
| Human Development Index | [UNDP HDR data centre](https://hdr.undp.org/data-center/documentation-and-downloads) | None | 193 countries | HDI score, rank, year |
| Corruption Perceptions Index | [Transparency International CPI 2023](https://www.transparency.org/en/cpi/2023) | None (static) | 138 countries | Score 0-100, rank |
| Freedom in the World | [Freedom House 2024](https://freedomhouse.org/report/freedom-world) | None (static) | 121 countries | Aggregate score 0-100, Free/Partly Free/Not Free |
| Central bank policy rates | Static data (early 2025 values) | None | 29 countries, 11 currency blocs | Rate %, bank name, rate label |
| Sovereign credit ratings | Static data | None | 12 major economies | S&P, Moody's, Fitch |
| Energy mix | [Our World in Data / Ember](https://github.com/owid/etl) | None | ~200 countries | Wind/solar, hydro, nuclear, gas, coal % |
| World Happiness Report | [WHR 2024 data](https://worldhappiness.report/) | None | ~150 countries | Happiness score + 6 sub-factors |
| OECD social/labour indicators | [OECD SDMX API](https://stats.oecd.org/) | None | 37 OECD members | Wages, productivity, gender pay gap, social spend, youth unemployment, poverty |
| Trade & investment | [World Bank Open Data API](https://api.worldbank.org/v2/) | None | 257 countries | Trade/GDP, current account, FDI, exports, imports |
| WHO health indicators | [WHO GHO OData API](https://ghoapi.azureedge.net/api/) | None | 186-195 countries | Physicians, nurses, hospital beds, DPT3 immunization, maternal/NCD mortality |
| Economic Complexity Index | [OEC Atlas](https://oec.world/) | None | ~130 countries | ECI score |
| Trade partners | [UN Comtrade](https://comtradeplus.un.org/) | None | ~100 countries | Top 5 export/import partners with values |
| ECB rates & bonds | [ECB Data Portal](https://data.ecb.europa.eu/) | None | Eurozone countries | Deposit/refi rates, Euribor, 10Y yields, spreads |
| BoJ yields | [MoF Japan](https://www.mof.go.jp/) | None | Japan | JGB 2Y, 5Y, 10Y yields |
| Subnational HDI | [UNDP Global Data Lab / estimates](https://globaldatalab.org/shdi/) | None | 9 countries, 400+ regions | HDI, health, education, income sub-indices |
| **Press Freedom Index** | [RSF 2024](https://rsf.org/en/index) | None (static) | 168 countries | Score 0-100, rank 1-180 |
| **Global Peace Index** | [IEP 2024](https://www.visionofhumanity.org/maps/) | None (static) | 159 countries | Score 1.0-4.0, rank 1-163 |
| **Internet speeds** | [Ookla Speedtest 2024](https://www.speedtest.net/global-index) | None (static) | 123 countries | Fixed download/upload, mobile Mbps |
| **Nuclear energy** | [IAEA PRIS 2024](https://pris.iaea.org/) | None (static) | 31 countries | Reactors, capacity GW, generation TWh |
| **Disaster risk** | [WorldRiskIndex](https://weltrisikobericht.de/) | None (static) | Risk indices by country |
| **Carbon emissions** | [Global Carbon Project](https://globalcarbonproject.org/) | None | CO2 emissions per capita |
| **Research output** | [OpenAlex](https://openalex.org/) | None | 247 countries — publications, citations, cites/paper |
| **Migrant stock** | [World Bank WDI](https://api.worldbank.org/v2/) | None | 174 countries — international migrant stock, net migration |
| **Crypto adoption** | [CoinGecko](https://www.coingecko.com/) | None | 55 countries — adoption rank, users %, DeFi value, exchanges |
| **GTD terrorism** | [Global Terrorism Database](https://www.start.umd.edu/gtd/) | None | Historical incidents — attack type, fatalities, perpetrator |

### US regional data

| Dataset | Source API / URL | Key | Coverage |
|---|---|---|---|
| ACS 5-year estimates 2023 | [Census Bureau ACS API](https://api.census.gov/data/2023/acs/acs5) | None | 470 cities — income, poverty, housing, education |
| County Business Patterns 2022 | [Census Bureau CBP API](https://api.census.gov/data/2022/cbp) | None | 473 cities — establishments, payroll, sector mix |
| Annual Business Survey 2021 | [Census Bureau ABS API](https://api.census.gov/data/2021/abscs) | None | State-level employer firm counts |
| Population (Decennial 2020) | [Census Bureau Decennial API](https://api.census.gov/data/2020/dec/pl) | None | Exact population at place level |
| FIPS code resolution | [Census Geocoder API](https://geocoding.census.gov/geocoder/) | None | Lat/lng → state+place FIPS |
| Bilateral trade flows | [BEA ITA API](https://apps.bea.gov/api/) | **Required** | 57 countries, annual 1999-2025 |
| Home values (ZHVI) | [Zillow Research CSV](https://www.zillow.com/research/data/) | None | 448 US cities, annual history to 2000 |
| Rent index (ZORI) | [Zillow Research CSV](https://www.zillow.com/research/data/) | None | 448 US cities, annual history |
| NOAA climate normals | [NOAA CDO API](https://www.ncdc.noaa.gov/cdo-web/api) | **Required** | 447 US cities — 1991-2020 monthly normals |
| FBI crime statistics | [FBI UCR](https://ucr.fbi.gov/) | None | US states — crime rates |

### Subnational & regional data

| Dataset | Source API / URL | Key | Coverage |
|---|---|---|---|
| Urban Audit — Labour market | [Eurostat API](https://ec.europa.eu/eurostat/api/dissemination/) (urb_clma) | None | 512 cities — unemployment, activity rate |
| Urban Audit — Living conditions | [Eurostat API](https://ec.europa.eu/eurostat/api/dissemination/) (urb_clivcon) | None | 512 cities — income, poverty, homeownership, rent |
| Urban Audit — Economy | [Eurostat API](https://ec.europa.eu/eurostat/api/dissemination/) (urb_cecfi) | None | 512 cities — total companies |
| Prefectural GDP & income | [Japan Cabinet Office SNA](https://www.esri.cao.go.jp/jp/sna/data/data_list/kenmin/) | None | 47 prefectures, 2011-2022 XLSX |
| Germany Bundeslander | [Destatis](https://www.destatis.de/) | None | 16 states — GDP, unemployment, population |
| UK NUTS-1 regions | [ONS](https://www.ons.gov.uk/) | None | 12 regions + 235 LA mappings — GVA, unemployment |
| France regions | [INSEE](https://www.insee.fr/) | None | 18 regions + 102 dept mappings — GDP, unemployment |
| Spain regions | INE Spain | None | 19 autonomous communities |
| Italy regions | ISTAT | None | 20 regions |
| Mexico states | INEGI | None | 32 states |
| Indonesia provinces | BPS Indonesia | None | 34 provinces |
| Admin-1 boundaries | [Natural Earth 10m](https://www.naturalearthdata.com/) | None | TopoJSON for all countries |

### Geography, climate & overlays

| Dataset | Source / URL | Key | Coverage |
|---|---|---|---|
| Country borders | [Natural Earth via world-atlas (unpkg CDN)](https://unpkg.com/world-atlas@2/countries-50m.json) | None | 50m-resolution GeoJSON |
| Climate normals (ERA5) | [Open-Meteo Historical API](https://archive-api.open-meteo.com/v1/archive) | None | ~150 cities, 2014-2023 10-yr averages |
| Airport routes | [OpenFlights GitHub (CC BY 3.0)](https://raw.githubusercontent.com/jpatokal/openflights/master/data/) | None | 1,175 cities, direct destinations |
| Air routes | OurAirports / OpenFlights | None | City-to-city route data |
| Tectonic plates | [Hugo Ahlenius / GeoJSON](https://github.com/fraxen/tectonicplates) | None | Plate boundaries |
| Volcanoes | [Smithsonian GVP](https://volcano.si.edu/) | None | 1,215 Holocene volcanoes with eruption status |
| Space launch sites | [Wikipedia / Space Launch Report](https://www.spacelaunchreport.com/) | None | 29 launch facilities worldwide |
| Marine EEZ | [Flanders Marine Institute](https://www.marineregions.org/) | None | 275 Exclusive Economic Zone boundaries |
| Power plants | [WRI Global Power Plant Database](https://datasets.wri.org/dataset/globalpowerplantdatabase) | None | Power plants matched to cities |
| Disaster risk | [INFORM Risk Index 2024](https://drmkc.jrc.ec.europa.eu/inform-index) | None | 191 countries, multi-hazard risk scores |
| Submarine cables | [TeleGeography](https://www.submarinecablemap.com/) | None | Undersea internet cable routes |
| UNESCO World Heritage | [UNESCO WHC](https://whc.unesco.org/) | None | Heritage sites with coordinates |
| UNESCO Intangible Heritage | [UNESCO ICH](https://ich.unesco.org/) | None | 80 cultural heritage elements |
| WAQI Air Quality | [World Air Quality Index](https://api.waqi.info/) | None | 2000+ cities — live AQI readings |
| Open-Meteo Weather | [Open-Meteo API](https://open-meteo.com/) | None | Weather stations — current conditions |
| Celestrak Satellites | [Celestrak TLE data](https://celestrak.org/) | None | 922 active satellites |
| NOAA Space Weather | [NOAA SWPC](https://services.swpc.noaa.gov/) | None | KP index, aurora forecasts |
| Ocean currents | [Copernicus Marine / NOAA](https://marine.copernicus.eu/) | None | Current speed/direction, SST |
| FlightAware | [FlightAware API](https://flightaware.com/api/) | None | Commercial flight routes |
| MarineTraffic | [MarineTraffic API](https://www.marinetraffic.com/) | None | Live vessel positions |
| GTD Terrorism | [Global Terrorism Database](https://www.start.umd.edu/gtd/) | None | Historical incident data |
| CoinGecko Crypto | [CoinGecko API](https://www.coingecko.com/) | None | Crypto adoption by country |
| NASA EONET | [NASA EONET API](https://eonet.sci.gsfc.nasa.gov/) | None | Real-time natural events |
| Protected Areas | [Protected Planet / UNEP](https://www.protectedplanet.net/) | None | Global protected areas |
| PeeringDB | [PeeringDB](https://www.peeringdb.com/) | None | Internet exchange points |
| NASA FIRMS | [NASA FIRMS API](https://firms.modaps.eosdis.nasa.gov/) | None | Active fire hotspots |

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
| Live earthquakes (M2.5+) | [USGS Earthquake Hazards API](https://earthquake.usgs.gov/fdsnws/event/1/) | None |
| ISS live position | [Open Notify ISS API](http://api.open-notify.org/iss-now.json) | None |
| Live aircraft positions | [OpenSky Network API](https://opensky-network.org/apidoc/) | None | ~12k aircraft, 30s refresh |

---

## API keys required

Four data sources require API keys. Set them in a `.env` file:

```env
FRED_API_KEY=your_key_here           # Free at https://fred.stlouisfed.org/docs/api/api_key.html
BEA_API_KEY=your_key_here            # Free at https://apps.bea.gov/api/signup/
NOAA_TOKEN=your_token_here           # Free at https://www.ncdc.noaa.gov/cdo-web/token
NASA_MAP_KEY=your_key_here           # Free at https://firms.modaps.eosdis.nasa.gov/api/
```

All other data sources (World Bank, IMF, Census, Eurostat, Wikidata, Wikipedia, Open-Meteo, OpenFlights, Zillow, UNDP, Frankfurter, WHO, OECD, UN Comtrade, ECB, USGS, Celestrak, EONET, GTD, CoinGecko, OpenAlex) require **no API key**.

---

## Project structure

```
public/
  index.html                  # app shell + panel HTML
  app.js                      # bundled frontend (esbuild from src/main.js)
  style.css                   # all styles (dark + light themes)
  cities-full.json            # ~14k city records with climate, infobox data
  companies.json              # ~9k companies keyed by city QID
  country-data.json           # 145+ indicators: WB + IMF + FRED + WGI + HDI + TI + FH + CB + RSF + GPI + Ookla + IAEA
  world-countries.json        # GeoJSON country borders (Natural Earth)
  census-cities.json          # ACS 2023, 470 US cities
  census-business.json        # CBP 2022, 473 US cities
  bea-trade.json              # BEA ITA, 57 countries 1999-2025
  eurostat-cities.json        # Eurostat Urban Audit, 512 European cities
  japan-prefectures.json      # Cabinet Office, 47 prefectures 2011-2022
  zillow-cities.json          # Zillow ZHVI + ZORI, 448 US cities
  airport-connectivity.json   # OpenFlights, 1,175 cities
  air-routes.json             # City-to-city air routes
  climate-extra.json          # Open-Meteo ERA5, ~150 cities
  noaa-climate.json           # NOAA 1991-2020 normals, 447 US cities
  gawc-cities.json            # GaWC 2024 tiers, 305 cities (QID-keyed)
  who-airquality.json         # WHO PM2.5 annual mean, 1,561 cities
  metro-transit.json          # Metro/transit systems, 248 cities
  metro-ridership.json        # Metro annual ridership, 60 systems
  nobel-cities.json           # Nobel laureate counts by city, 289 cities
  universities.json           # University counts by city, 1,923 cities
  uni-rankings.json           # University rankings by city
  oecd-country.json           # OECD social/labour indicators, 37 countries
  eci-data.json               # Economic Complexity Index, ~130 countries
  comtrade-partners.json      # UN Comtrade top trade partners, ~100 countries
  ecb-data.json               # ECB rates, Euribor, TARGET2 balances
  ecb-bonds.json              # Eurozone 10Y bond yields + spreads
  boj-yields.json             # BoJ JGB yield curve
  ports.json                  # Container port TEU throughput, 50 ports
  tourism.json                # International visitor arrivals, 50 cities
  patents.json                # Patent output by city, 76 cities
  startups.json               # Startup ecosystems by city
  subnational-hdi.json        # HDI + sub-indices, 9 countries, 400+ regions
  tectonic-plates.json        # Plate boundary GeoJSON
  volcanoes_full.json         # 1,215 volcanoes from Smithsonian GVP
  launch_sites.json           # 29 space launch facilities
  eez_boundaries.json        # 275 EEZ maritime boundaries
  power_by_city.json          # Power plants matched to cities
  inform_risk.json            # INFORM 2024 disaster risk scores
  openalex-countries.json     # OpenAlex research output by country
  submarine-cables.json       # Undersea cable routes
  unesco-ich.json             # UNESCO Intangible Cultural Heritage
  waqi-cities.json            # WAQI live air quality
  weather-stations.json       # Open-Meteo current weather
  satellites-live.json        # Celestrak satellite positions
  eonet-events.json           # NASA EONET natural events
  terrorism-incidents.json    # GTD terrorism data
  crypto-stats.json           # CoinGecko crypto adoption
  solar-weather.json          # NOAA space weather
  ocean-currents.json         # Ocean current data
  flightaware-flights.json    # FlightAware flight routes
  ships-live.json             # MarineTraffic vessel positions
  wildfires-live.json         # NASA FIRMS active fires
  unesco.json                 # UNESCO World Heritage sites
  cost-of-living.json         # Cost of living indices by city
  fbi-crime.json              # US state crime statistics
  us-states.json              # US state boundaries + data
  germany-states.json         # Destatis, 16 Bundeslander
  uk-regions.json             # ONS, 12 NUTS-1 + 235 LA mappings
  france-regions.json         # INSEE, 18 regions + 102 dept mappings
  spain-regions.json          # INE, 19 autonomous communities
  italy-regions.json          # ISTAT, 20 regions
  mexico-states.json          # INEGI, 32 states
  indonesia-provinces.json    # BPS, 34 provinces
  korea-provinces.json        # KOSTAT, 17 provinces
  china-provinces.json        # NBS, 31 provinces
  india-states.json           # Census India, 36 states
  canada-provinces.json       # StatCan, 13 provinces
  australia-states.json       # ABS, 8 states
  eurostat-regions.json       # Eurostat NUTS-2 regional data
  admin1/                     # TopoJSON admin-1 boundaries per country
  data-manifest.json          # auto-generated file registry

src/
  main.js                     # entry point (esbuild bundle root)
  app-legacy.js               # ~8,500-line frontend (vanilla JS) — progressively extracted into layer modules
  *-layer.js                  # per-layer modules: econ, cable, air-route, earthquake, volcano, eez, iss,
                              #   aircraft, firms, launch-site, peeringdb, protected-areas, satellite,
                              #   unesco, unesco-ich, vessel-ports, waqi, weather, eonet, flightaware,
                              #   marine-traffic, tectonic-plates (22 modules extracted from app-legacy)
  state.js                    # centralised app state
  utils.js                    # shared pure utilities

scripts/                      # 106 data pipeline scripts
  fetch-cities.js             # Wikidata SPARQL → cities-full.json
  fetch-country-data.js       # World Bank API → development indicators
  fetch-imf.js                # IMF DataMapper → fiscal data
  fetch-fred.js               # FRED API → 10-yr bond yields
  fetch-press-freedom.js      # RSF 2024 → press freedom scores
  fetch-peace-index.js        # GPI 2024 → peace index scores
  fetch-internet-speed.js     # Ookla 2024 → internet speed data
  fetch-nuclear-energy.js     # IAEA PRIS 2024 → nuclear energy data
  fetch-celestrak.js          # Satellite TLE data
  fetch-coingecko.js          # Crypto adoption by country
  fetch-eonet.js              # NASA natural events
  fetch-flightaware.js        # Flight routes
  fetch-marinetraffic.js      # Vessel positions
  fetch-ocean-data.js         # Ocean currents
  fetch-space-weather.js      # Aurora zones
  build-kdb.js                # Consolidate all data → kdb.json (for Firebase RTDB)
  ...                         # (106 scripts total — see scripts/ directory)

lib/
  pure-utils.cjs              # Pure functions extracted for unit testing

tests/                        # 11 test files, 203 tests (node:test)
  pure-utils.test.js          # Core utility tests
  new-data-sources.test.js    # Data validation for Sub-project 5 sources
  ...                         # (see tests/ directory)

.github/workflows/
  ci.yml                      # GitHub Actions: lint → build → test

eslint.config.mjs             # ESLint flat config (src/ + scripts/)
```

---

## Tech stack

- **Frontend:** Leaflet.js, Leaflet.heat, vanilla JS/HTML/CSS, dark/light theme with basemap switching
- **Map tiles:** CARTO Dark Matter / Light (OpenStreetMap data), Esri Satellite, OpenTopoMap
- **Data pipeline:** Node.js — 94 fetch scripts calling 30+ APIs
- **Build:** esbuild (src/main.js → public/app.js, IIFE bundle)
- **Linting:** ESLint flat config (no-undef, no-unused-vars, eqeqeq)
- **Testing:** Node.js built-in `node:test` — 203 tests, zero extra dependencies
- **CI/CD:** GitHub Actions (lint → build → test on push/PR)
- **Hosting:** Fully static — no backend required after data build

---

## License

MIT — feel free to use, modify, and share.

