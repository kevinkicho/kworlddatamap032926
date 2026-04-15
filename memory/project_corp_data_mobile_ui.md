---
name: Corporate Data Cleanup & Mobile UI
description: Full history of corporate data quality fixes and mobile-responsive UI redesign
type: project
originSessionId: current
date: 2026-04-13
---

## Goal
Two interrelated workstreams: (1) fix corporate/financial data quality in companies.json, (2) make the app mobile-friendly with Palo Alto-themed UI.

## Data Cleanup — Completed

### Scripts Created
1. **`scripts/cleanup-companies.js`** — QAR→KRW, year-as-revenue, implausible values, Q-number names, duplicates. Run multiple times with expanded FX/currency maps. Added currencies: IQD, SYP, UZS, XAF, XOF, GNF, CRC, ZWG, GEL.
2. **`scripts/enrich-yahoo-finance.js`** — Full Yahoo Finance enrichment for 4,048 tickers (~25min runtime). Checkpoint + resume support, batch concurrency (5 parallel, 1.2s delay). Fetches: revenue, net_income, employees, financial_currency, plus timestamps (revenue_date, net_income_date, employees_date). 100% API success, 38 returned no data.
3. **`scripts/patch-revenue-from-universe.js`** — Patches companies.json with verified stockUniverse.js data. Uses `nameSimilarEnough()` for ticker collision handling. Fuzzy matching was removed (catastrophic false matches). 245 companies patched.
4. **`scripts/fix-currencies.js`** — QAR→KRW in ALL currency fields (revenue, net_income, operating_income). 33 additional fixes. Also nulled 39 implausible operating_incomes, 60 implausible net_incomes.
5. **`scripts/generate-companies-split.js`** — Rebuilds companies-index.json + companies-detail.json from companies.json. INDEX_FIELDS updated to include revenue_date, net_income_date, employees_date.

### Key Data Bugs Fixed
- **QAR/KRW**: 55 Korean companies had `revenue_currency: "QAR"` instead of `"KRW"`. Extended to operating_income_currency and net_income_currency (33 more fixes).
- **Year-as-revenue**: 569 companies had year values (2024, 2023) scraped as revenue from Wikidata.
- **Implausible revenue**: Market-cap-scale numbers stored as revenue. Nulled with $5T sanity threshold.
- **Null currency**: 292 companies had null/undefined revenue_currency. Fixed by inheriting from currency_yahoo, ticker suffix, or description heuristics. `.SG` tickers misassigned as EUR → corrected to JPY/CNY/SEK.
- **Nintendo employees**: 82,052,962 → null. All employees >5M without verification date → null.
- **Ticker collisions**: Same ticker (AI, SU) on different exchanges. `nameSimilarEnough()` verifies word overlap.

### Data Architecture
- **companies-index.json** is the ACTUAL data source the app loads (via lazy loader). NOT companies.json directly.
- After ANY changes to companies.json, MUST run: `node scripts/generate-companies-split.js`
- stockUniverse.js at `C:\Users\kevin\Desktop\kyahoofinance032926\src\data\stockUniverse.js` — ~800 companies with verified Yahoo Finance data

### Backup Files
- `public/companies.json.bak` — Before cleanup
- `public/companies.json.pre-universe-bak` — Before universe patch
- `public/companies.json.pre-yahoo-enrich-bak` — Before Yahoo enrichment
- `public/companies.json.yahoo-bak` — Earlier backup

### Yahoo Finance API Notes
- `yahoo-finance2` v3 requires `new YahooFinance()` constructor
- Revenue: `quoteSummary.financialData.totalRevenue`
- Net income: `fundamentalsTimeSeries.netIncome`
- Employees: `quoteSummary.summaryProfile.fullTimeEmployees`
- Financial currency: `financialData.financialCurrency` (returns null for many non-US exchanges)
- Checkpoint: `scripts/.yahoo-enrich-checkpoint.json`

## Mobile UI Redesign — Completed (Phase 1)

### Mobile Topbar
- Animated 3-line hamburger morphing into X (desktop: hidden; ≤1024px: visible)
- Topbar opens as organized drawer with pill toggle buttons, glassmorphism backdrop blur
- Custom count dropdown for corp filters (name left, count right)
- Mobile corporation cards: table rows become compact 2-line cards

### Palo Alto Theme (see mobile_paloalto_theme.md for full details)
Applied to: filter panel (all elements), topbar drawer, FABs, city search, basemap/theme controls
Still needs: all other panels (wiki, country, corp, trade, FX, stats, region, compare, bookmarks, nations)

### Critical Breakpoint Change
Mobile layout moved from `@media (max-width: 768px)` to `@media (max-width: 1024px)`. This fixes:
- Hamburger not showing on landscape phones (width >768px)
- Topbar drawer not usable in landscape mode
- Desktop-only `#more-layers-menu` rules wrapped in `@media (min-width: 1025px)` to avoid mobile override conflicts

### Key CSS Classes (Mobile Filter Panel)
- `#filter-panel`, `#filter-panel-header`, `#filter-panel-close`, `#filter-clear-btn`
- `#filter-avail-list`, `.filter-avail-row`, `.filter-avail-btn`
- `#filter-value-list`, `.filter-value-group`, `.filter-bucket`
- `.filter-heat-btn`, `.filter-section-head`, `.filter-mode-btn`
- `.pop-slider-*` — population dual-range slider
- `#heat-palette-row`, `.palette-chip`
- `#heat-controls-row`, `.heat-ctrl-*`
- `#filter-aq-legend`, `.filter-aq-legend-*`
- `#filter-panel-footer`

### Key JS Functions
- `toggleFilterPanel()`, `openFilterPanel()`, `closeFilterPanel()`
- `toggleMobileTopbar()` — hamburger animation + drawer
- `toUSD(value, currency)` — FX conversion
- `fmtRevenue()` — formats revenue for display
- `setValueFilter()`, `toggleAvailFilter()`, `clearAllFilters()`
- `renderGlobalCorpList()` — corporation list/table
- `applyResults()` — Yahoo Finance enrichment results

### JS Sync Rule
- `src/app-legacy.js` is the ES module source
- `public/app.js` is the built/bundled file (esbuild)
- When making JS changes, both must be updated
- Pure CSS changes don't require JS sync