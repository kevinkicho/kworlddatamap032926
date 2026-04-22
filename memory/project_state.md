---
name: Project State
description: Full feature list and current commit state of the world cities map app
type: project
originSessionId: 1205a473-4859-4531-9892-74ff6102f51e
---
**Last commit:** 2f7bd82 (2026-04-16) — Extract layers-phase2 module (GTD, crypto, space weather, ocean toggles)
**Build unblocked:** 2026-04-22 — econ-layer duplicate declarations removed (-371 lines from app-legacy.js), missing earthquake/volcano imports added, 10 missing re-exports added. Bundle 582.5KB, 133 pure-utils tests passing. 3 unpushed commits on main.
**Phase 2 & 3 Complete:** 2026-04-10 — 6 new APIs implemented + map layer integration
**Checkpoint:** 2026-04-10 — Build 542.6KB, 203 tests passing, 32+ map layers
**Audit Complete:** 2026-04-10 — GTD lite incidents bug fixed, crypto KE/GH centroids added
**Corp Data Cleanup:** 2026-04-13 — Yahoo Finance enrichment (4,048 tickers), QAR/KRW fix, currency fixes, universe patch (245 companies)
**Mobile UI + Palo Alto:** 2026-04-13 — Mobile breakpoint 768→1024px (landscape fix), Palo Alto theme on filters/toolbar/FABs, pill buttons, glassmorphism
**Live URL:** https://kevinkicho.github.io/kworlddatamap032926

**In-flight extraction from app-legacy.js (as of 2026-04-22):**
- 22 layer modules extracted to src/*-layer.js (econ, cable, air-route, earthquake, volcano, eez, iss, aircraft, firms/wildfire, launch-site, peeringdb, protected-areas, satellite, unesco, unesco-ich, vessel-ports, waqi, weather, eonet, flightaware, marine-traffic, tectonic-plates). All untracked — not yet git-added.
- app-legacy.js down from ~9,800 → 8,498 lines
- Extraction pattern: module exports `toggleXLayer` + `_buildXLayer`; legacy file imports them and re-exports via `export {...}` block at bottom so main.js can resolve them. Helpers wired via `S._helperName = helperName` (e.g. S._drawEconColorRamp, S._companiesLoader, S._openCorpPanel).

**Known remaining bug:** `_gcorpFinJson` is used in app-legacy.js (~line 7130 in global corp list render) but only defined in corporations-list.js without being exported — runtime ReferenceError on that render path. Needs: add `export` to corp-list definition + import in app-legacy.

**WSL/Windows gotcha:** node_modules contains only @esbuild/win32-x64 binary. Bundle from WSL requires separate linux-x64 install; Kevin normally runs `npm run build` from Windows terminal.

**All 6 sub-projects from data-layer cleanup completed (2026-04-05 to 2026-04-06):**
1. Data Layer Cleanup — source consolidation, module boundaries
2. Country Panel Refactor — gauge sections, radar charts, rank chips
3. Map Layer Enhancements — tectonic plates, earthquakes, ISS tracker, submarine cables, air routes
4. UI/UX Polish — theme switching, basemap selection, keyboard nav, URL hash state, responsive, skeleton loading
5. New Data Sources — press freedom (RSF), peace index (GPI), internet speed (Ookla), nuclear energy (IAEA), 7 new WB indicators
6. Infrastructure — ESLint, CI/CD (GitHub Actions), 203 tests, PWA (manifest + service worker), resource preloads

**Current data files (65 JSON in public/):**
- `cities-full.json` — ~14k cities with Wikidata QIDs, coordinates, Wikipedia enrichment
- `companies.json` — ~8,357 companies keyed by city QID; Yahoo Finance enriched (revenue, net_income, employees + timestamps); QAR→KRW fixed; 245 patched from stockUniverse.js
- `volcanoes_full.json` — 1,215 Smithsonian GVP volcanoes with eruption status
- `launch_sites.json` — 29 space launch facilities worldwide
- `eez_boundaries.json` — 275 Exclusive Economic Zone maritime boundaries
- `power_by_city.json` — Power plants matched to cities (50km radius)
- `inform_risk.json` — INFORM 2024 disaster risk scores for 191 countries
- `aircraft-live.json` — Raw OpenSky aircraft data
- `aircraft-live-lite.json` — Minified aircraft data for app
- `migrant-data.json` — World Bank migrant stock data
- `openalex-countries.json` — OpenAlex research output by country
- `country-data.json` — 297 countries with 150+ keys: WB/IMF/FRED/WGI/HDI/TI/FH/WHR/Ember/Trade/WHO/RSF/GPI/Ookla/IAEA

**country-data.json fields (per ISO2 key) — 150+ keys including:**
- World Bank: gdp_per_capita, life_expectancy, urban_pct, gini, internet_pct, child_mortality, electricity_pct, literacy_rate, pm25, forest_pct, air/road_death_rate, military_spend_gdp, pop_growth, net_migration, female_labor_pct, safe_water_pct, research_articles, migrant_stock
- IMF: govt_debt_gdp, fiscal_balance_gdp, cpi_inflation, unemployment_rate
- FRED: bond_yield_10y + history (27 OECD)
- Static: cb_rate/cb_bank (29 countries), credit ratings (12 countries)
- WGI (205): 6 governance indicators
- UNDP HDI (193): hdi, hdi_rank
- Sustainability (WB): co2_per_capita, renewable_energy_pct, health_spend_gdp, education_spend_gdp
- TI CPI (138), Freedom House (121), WHR (143), Ember energy (165), Trade (257), WHO Health (186-195)
- press_freedom_score/rank (168), gpi_score/rank (159), inet_download/upload/mobile_mbps (123), nuclear_reactors/capacity/generation (31)
- research_papers/citations/citations_per_paper (247), migrant_stock (174)

**App:** src/app-legacy.js (~9,800 lines), esbuild bundled to public/app.js
**Tests:** 203 passing (11 test files, node:test)
**Scripts:** 100 in scripts/ (94 original + 6 new Phase 2-3)
**Linting:** ESLint flat config (eslint.config.mjs)
**CI:** GitHub Actions (.github/workflows/ci.yml)
**PWA:** manifest.json + sw.js

**Country panel gauge sections (22):**
World Bank → IMF → FRED → Central Bank → Credit Ratings → Governance (WGI) → Human Development → Transparency & Freedom → Peace & Security → Disaster Risk → Digital Infrastructure → Demographics & Environment → Energy Mix → Nuclear Energy → Research Output (OpenAlex) → Innovation & Labor → Social & Wages → Trade & Investment → Health (WHO) → ECB → BoJ → Trade Partners

**New data available for country panel integration (Phase 2-3):**
- GTD: terrorism_incidents, terrorism_fatalities by country
- Crypto: adoption_rank, crypto_users_pct, defi_value_usd
- Space Weather: kp_index, aurora_visible_lat (global, not country-specific)
- Ocean: current_speed, sst (coordinate-based, not country-specific)
- FlightAware: flight counts by region/airspace
- MarineTraffic: vessel counts by region/territorial waters

**Map overlays:** Tectonic plates (with readable fault names), live earthquakes (USGS), ISS tracker, aircraft tracking (OpenSky), submarine cables, air routes, volcanoes (1,215 Smithsonian GVP), space launch sites (29), marine EEZ boundaries (275)
**Layer controls:** Primary bar (Cities, UNESCO, Economic) + "More ▼" dropdown (Natural Hazards, Infrastructure, Other)
**Theme:** Dark/light toggle + basemap switching (street/satellite/terrain)
**Keyboard nav:** Full shortcut support (? for help overlay)

**Critical bugs to remember:**
- escAttr only escapes single quotes; JSON in HTML attributes must use escHtml
- IMF DataMapper only exposes 4 fiscal codes
- FRED OECD series only covers OECD members; BR/IN/ID/TR/CN return HTTP 400
- fetch-country-data.js REBUILDS country-data.json from scratch — all merge scripts must re-run after it
- WHO GHO uses SEX_BTSX not BTSX for sex dimension filter
- OECD SDMX API unreliable for some datasets; curated fallback tables override live data