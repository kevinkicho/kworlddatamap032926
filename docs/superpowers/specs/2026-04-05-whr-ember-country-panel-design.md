# World Happiness Report + Ember Energy Mix — Country Panel Design

## Goal

Add two new data sections to the country panel: World Happiness Report (WHR 2024, 6-factor breakdown) and Ember Energy Mix (5-source electricity breakdown + coal phase-out sparkline).

## Architecture

Two build-time fetch scripts produce intermediate JSON; `migrate-country-data.js` merges both into `country-data.json`. The panel renders two new gauge sections using existing `_cpGaugeRow` and IYChart helpers — no new UI primitives required.

```
scripts/fetch-whr.js    → public/whr-data.json      ─┐
scripts/fetch-ember.js  → public/ember-energy.json  ─┤→ scripts/migrate-country-data.js → country-data.json
```

## Data Sources

### World Happiness Report 2024
- **URL:** `https://happiness-report.s3.amazonaws.com/2024/DataForTable2.1WHR2024.xls`
- **Format:** Excel (.xls). Columns: Country name, Ladder score, Rank, Explained by: Log GDP per capita, Social support, Healthy life expectancy, Freedom to make life choices, Generosity, Perceptions of corruption.
- **Name matching:** Use `countryNameToIso2` lookup (pattern established in other scripts). Manual overrides for common mismatches (e.g. "United States" → "US", "Czechia" → "CZ", "Taiwan Province of China" → "TW").
- **Coverage:** ~140 countries.

### Ember Global Electricity Review
- **URL:** `https://ember-climate.org/app/uploads/2022/03/yearly_full_release_long_format.csv`
- **Format:** Long-format CSV. Columns: Country code (ISO2), Year, Variable, Value (share of electricity generation, %).
- **Variables to extract:** `Coal`, `Gas`, `Nuclear`, `Hydro`, `Wind and Solar`
- **Per country:** latest year values (all 5 variables) + `Coal` history array from 2000 to latest year as `[[year, pct], ...]`.
- **Coverage:** ~200 countries.

## country-data.json New Fields

```json
{
  "whr_score": 7.741,
  "whr_rank": 1,
  "whr_year": 2024,
  "whr_gdp": 1.446,
  "whr_social": 1.162,
  "whr_health": 0.741,
  "whr_freedom": 0.657,
  "whr_generosity": 0.208,
  "whr_corruption": 0.477,

  "energy_coal_pct": 3.2,
  "energy_gas_pct": 14.1,
  "energy_nuclear_pct": 33.0,
  "energy_hydro_pct": 11.4,
  "energy_wind_solar_pct": 35.7,
  "energy_coal_history": [[2000, 28.1], [2001, 27.3], ..., [2023, 3.2]]
}
```

All fields optional — panel renders `--` when absent.

## Panel Additions (app.js)

### "Happiness (WHR 2024)" section
Positioned after the Transparency & Freedom (TI/FH) section.

- Header row: country rank (#N of ~140) + ladder score (e.g. 7.74)
- 6 gauge rows using `_cpGaugeRow`:
  - GDP contribution (max 2.0, green)
  - Social support (max 1.5, green)
  - Healthy life expectancy (max 1.0, green)
  - Freedom (max 0.8, blue)
  - Generosity (max 0.5, purple)
  - Low corruption (max 0.6, blue) — note: higher = less corrupt
- All 6 are additive factor contributions, not percentages

### "Energy Mix" section
Positioned after Happiness section.

- 5 gauge rows (max 100%):
  - Wind & Solar — green
  - Hydro — teal
  - Nuclear — blue
  - Gas — orange
  - Coal — brown/red
- Coal phase-out sparkline: IYChart with `energy_coal_history`, year integers on x-axis
- Label: "Coal share trend (%)"

## Scripts

### scripts/fetch-whr.js
- Downloads WHR Excel via `node-fetch` + parses with `xlsx` npm package
- Outputs `public/whr-data.json`: `{ "FI": { whr_score, whr_rank, whr_year, whr_gdp, ... }, ... }`
- Logs unmatched country names for manual review

### scripts/fetch-ember.js
- Downloads Ember CSV via `node-fetch`, parses with `csv-parse`
- For each ISO2: extract latest year % for all 5 variables; build coal history array
- Outputs `public/ember-energy.json`: `{ "FI": { energy_coal_pct, ..., energy_coal_history }, ... }`
- Skips rows where ISO2 is a region aggregate (World, EU, etc.) based on known list

### scripts/migrate-country-data.js (extend existing)
- Add two new merge passes after existing IMF + FRED passes:
  1. Load `whr-data.json`, merge WHR fields into each matching ISO2 key
  2. Load `ember-energy.json`, merge Ember fields into each matching ISO2 key
- No changes to existing merge logic

## Tests

- `tests/fetch-whr.test.js`: name matching edge cases; missing country returns null; output shape validation
- `tests/fetch-ember.test.js`: history array sorted ascending; latest year selection; region aggregates excluded
- `tests/migrate-country-data.test.js`: WHR/Ember merge doesn't clobber WB/IMF fields; missing ISO2 handled
- App.js panel tests (extend existing): WHR section renders `--` when whr_score absent; Ember gauges render correctly

## Rendering Notes

- WHR factors are contributions to the ladder score (not percentages) — max values are approximate observed maxima from the dataset, used for gauge width normalization
- `_cpGaugeRow` already accepts any numeric max — no changes needed to the helper
- Coal sparkline uses the same IYChart component as bond_yield_10y_history — year integers, not timestamps
- Section headers follow existing pattern: `<h4 class="cp-section-title">Happiness (WHR 2024)</h4>`
