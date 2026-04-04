# Data Layer Cleanup & Expansion Design

**Date:** 2026-04-04  
**Scope:** Phase 1 — structural cleanup only. Phase 2 (new data sources) is a separate session.

---

## Problem Statement

The app has 13 flat JSON files across three incompatible keying schemes (ISO-2, Wikidata QID, plain array), three different history array formats, and no registry documenting what exists or its coverage. The main city render list (`cities.json`) has no QIDs, so every city-level data lookup relies on runtime name-matching against supplemental files. Country-level data is split across three files and merged on every panel click via `_cpMerged()`.

These structural issues make adding new data sources progressively harder and more error-prone.

---

## Goals

1. One country record per ISO-2 key — no runtime merging.
2. Every city in the render list carries its own Wikidata QID — no name-matching for lookups.
3. All history arrays share one format — chart renderer needs zero per-source branching.
4. A machine-readable manifest documents every data file — adding a new source has a clear registration step.

## Non-Goals

- Adding new data sources (Phase 2).
- Migrating `cities-full.json` shape or contents.
- Changing the UI or app.js display logic beyond removing `_cpMerged()` and the name-matching lookup helpers.

---

## Architecture

### Change 1 — Merge country files

**Files affected:** `public/country-data.json`, `public/imf-fiscal.json`, `public/fred-yields.json`

Merge `imf-fiscal.json` and `fred-yields.json` into `country-data.json`. The merged file remains keyed by ISO-2. Fields from IMF and FRED are written directly onto the country object alongside existing World Bank fields. Countries missing from IMF or FRED simply have those fields absent — existing null-checks in app.js already handle this.

```json
"US": {
  "name": "United States",
  "region": "North America",
  "income_level": "High income",
  "gdp_per_capita": 84534.04,
  "gdp_per_capita_year": "2024",
  "gdp_per_capita_history": [[2015, 56572], [2016, 57638], ...],
  "govt_debt_gdp": 128.7,
  "govt_debt_gdp_year": 2026,
  "govt_debt_gdp_history": [[2001, 53.5], ...],
  "fiscal_balance_gdp": -7.9,
  "fiscal_balance_gdp_year": 2026,
  "fiscal_balance_gdp_history": [[2001, -0.5], ...],
  "yield_10y": 4.13,
  "yield_10y_date": "2026-02",
  "yield_history": [["2021-04", 1.64], ...]
}
```

`imf-fiscal.json` and `fred-yields.json` are deleted after migration is verified.

**app.js changes:**
- Delete `_cpMerged()`.
- All references to `this._cpMerged()` replaced with direct `countryData[iso]` access.

**Fetch scripts:** The IMF fetch script and FRED fetch script are updated to write their fields into `country-data.json` (merge by key) instead of their own files.

---

### Change 2 — Add `qid` and `iso` to `cities.json`

**Files affected:** `public/cities.json`

A one-time migration script cross-references the 600 cities in `cities.json` against `cities-full.json` (6,603 entries, all with QIDs) by matching on name + coordinate proximity (within 0.5°). Each matched city gets `qid` and `iso` written back.

```json
{ "name": "New York", "lat": 40.7128, "lng": -74.006, "pop": 8336817, "qid": "Q60", "iso": "US" }
```

Cities that fail to match automatically (expected: <5%) are flagged to a `cities-unmatched.json` output file for manual review.

**app.js changes:**
- Replace all fuzzy name-matching city→QID lookups with direct `supplementalFile[city.qid]`.
- The `iso` field enables direct `countryData[city.iso]` lookups without intermediate mapping.

---

### Change 3 — Normalize history arrays to `[[key, value]]` tuples

**Files affected:** `public/companies.json` (the only file using object-style history)

All other files already use `[[key, value]]` tuples. Only `companies.json` uses `[{year, value, currency}]` objects in `revenue_history`, `net_income_history`, `operating_income_history`, `total_assets_history`, `total_equity_history`, and `employees_history`.

Migration:
- Annual history arrays convert to `[[year, value]]`.
- The `currency` field (where present) moves to a top-level field per company (e.g., `revenue_currency: "JPY"`), since it is constant across all years for a given company.

**app.js / chart renderer:** The `IYChart` renderer already handles `[[key, value]]` tuples. The per-source branching for company history objects is removed.

**Detection rule for renderer:** `typeof history[0][0] === "string"` → monthly (YYYY-MM keys). Otherwise → annual (numeric year keys).

---

### Change 4 — Add `public/data-manifest.json`

A flat JSON registry of every data file. Added to `public/` so it can be fetched by the app if needed, but primarily a developer reference.

```json
{
  "country-data":       { "key": "iso2",  "coverage": 296,  "fields": ["gdp_per_capita", "life_expectancy", "gini", "internet_pct", "child_mortality", "electricity_pct", "urban_pct", "govt_debt_gdp", "fiscal_balance_gdp", "revenue_gdp", "expenditure_gdp", "yield_10y"], "updated": "2026-04" },
  "cities":             { "key": "array", "coverage": 600,  "fields": ["name", "lat", "lng", "pop", "qid", "iso"], "updated": "2026-04" },
  "cities-full":        { "key": "array", "coverage": 6603, "fields": ["qid", "name", "lat", "lng", "pop", "iso", "country", "admin", "timezone", "area_km2", "elev_m", "founded", "website", "sister_cities", "wikipedia"], "updated": "2026-01" },
  "companies":          { "key": "qid",   "coverage": 1237, "fields": ["name", "ticker", "revenue", "employees", "net_income", "operating_income", "total_assets", "total_equity", "industry", "founded", "exchange"], "updated": "2026-03" },
  "eurostat-cities":    { "key": "qid",   "coverage": 512,  "region": "EU", "fields": ["unemploymentPct", "activityRate"], "updated": "2026-03" },
  "zillow-cities":      { "key": "qid",   "coverage": 448,  "region": "US", "fields": ["zhvi"], "updated": "2026-03" },
  "census-cities":      { "key": "qid",   "coverage": 470,  "region": "US", "fields": ["medianIncome", "povertyPct", "unemploymentPct", "medianRent", "medianHomeValue", "gini", "bachelorPlusPct", "medianAge"], "updated": "2026-03" },
  "climate-extra":      { "key": "qid",   "coverage": 75,   "fields": ["months"], "updated": "2026-01" },
  "gawc-cities":        { "key": "qid",   "coverage": 309,  "fields": ["tier", "score"], "updated": "2025-12" },
  "airport-connectivity": { "key": "qid", "coverage": 1175, "fields": ["iata", "directDestinations", "airportCount"], "updated": "2026-02" },
  "bea-trade":          { "key": "iso2",  "coverage": 124,  "region": "US-bilateral", "fields": ["expGds", "impGds"], "updated": "2026-02" },
  "fred-yields":        { "key": "iso2",  "coverage": 0,    "note": "merged into country-data", "updated": "2026-04" },
  "imf-fiscal":         { "key": "iso2",  "coverage": 0,    "note": "merged into country-data", "updated": "2026-04" }
}
```

---

## Migration Order

Migrations must run in this order to avoid breaking the live app:

1. **Merge country files** — update fetch scripts, write merged `country-data.json`, update `_cpMerged()` in app.js, verify panel renders correctly, then delete source files.
2. **Add QIDs to cities.json** — run migration script, review `cities-unmatched.json`, resolve any misses manually, update app.js lookups, verify city panel data loads.
3. **Normalize companies.json history** — migrate object arrays to tuples, update IYChart renderer, verify company charts render.
4. **Write data-manifest.json** — generated last, after all other files are in final shape.

---

## Testing

Each change has a clear verification step:

| Change | Verify |
|--------|--------|
| Country merge | Open country panel for US, DE, JP, ZA — all indicators (GDP, debt, yield) visible |
| City QIDs | Open city popup for New York, Tokyo, Lagos — companies and supplemental data loads |
| History normalization | Open IYChart for a company (Honda, Apple) — revenue/employee history renders |
| Manifest | `data-manifest.json` loads without error; field counts match actual file contents |

The existing 125-test suite covers country panel rendering and should catch regressions.

---

## Phase 2 — Coverage Gaps (separate session)

After cleanup is complete, the highest-value new data sources to add:

| Priority | Source | What it adds | Coverage |
|----------|--------|--------------|----------|
| #1 | WHO Air Quality | PM2.5 per city | ~600 cities |
| #2 | Eurostat Extra | More EU city indicators (GDP, education) | ~500 EU cities |
| #3 | OpenFlights Expansion | Add hub rank + total routes to airport data | ~1,175 cities |
| #4 | NOAA/Open-Meteo | Climate data for remaining 525 cities | 600 → 600 |

Each will use the conventions established in Phase 1: QID key, `[[key, value]]` history tuples, registered in `data-manifest.json`.
