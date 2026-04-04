# Data Layer Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate 13 fragmented JSON data files into a consistent, expandable structure — one country record, QID-keyed supplemental files, uniform history tuples, and a data manifest.

**Architecture:** Four sequential migrations: (1) merge imf-fiscal + fred-yields into country-data, (2) re-key gawc-cities from city names to QIDs, (3) normalize companies history arrays from objects to tuples, (4) generate data-manifest.json. Each migration has a standalone script and corresponding app.js update.

**Tech Stack:** Node.js migration scripts, `public/app.js` (vanilla JS), `node --test` test runner, `lib/pure-utils.cjs` for shared utilities.

**Spec correction:** The brainstorming spec said "add QIDs to cities.json" — this was based on a misread. The app loads `cities-full.json` (6,603 cities, all with QIDs), not `cities.json` (600-entry seed file). The actual name-matching problem is `gawc-cities.json`, handled in Task 2.

---

## File Map

**New files to create:**
- `scripts/migrate-country-data.js` — one-time: merges imf-fiscal + fred-yields into country-data
- `scripts/migrate-gawc.js` — one-time: re-keys gawc-cities.json from names to QIDs
- `scripts/migrate-companies-history.js` — one-time: converts company history objects to tuples
- `scripts/write-manifest.js` — generates public/data-manifest.json from actual file contents
- `tests/migrate-country-data.test.js`
- `tests/migrate-gawc.test.js`
- `tests/migrate-companies-history.test.js`

**Files to modify:**
- `public/country-data.json` — gains IMF + FRED fields after migration
- `public/gawc-cities.json` — re-keyed from city names to QIDs
- `public/companies.json` — history arrays become `[[year, value]]` tuples
- `public/app.js` — remove `_cpMerged`, `_buildGawcByQid`, `fredYields`, `imfFiscal`, `gawcByQid`; update sparkline + history accessors
- `scripts/fetch-imf.js` — change output target to country-data.json
- `scripts/fetch-fred.js` — change output target to country-data.json

**Files to delete after verification:**
- `public/imf-fiscal.json`
- `public/fred-yields.json`

---

## Task 1: Write the country-data merge migration script

**Files:**
- Create: `scripts/migrate-country-data.js`

- [ ] **Step 1: Write the migration script**

```js
// scripts/migrate-country-data.js
// One-time migration: merge imf-fiscal.json + fred-yields.json into country-data.json.
// Run: node scripts/migrate-country-data.js
'use strict';
const fs   = require('fs');
const path = require('path');

const PUB  = path.join(__dirname, '..', 'public');
const CD   = path.join(PUB, 'country-data.json');
const IMF  = path.join(PUB, 'imf-fiscal.json');
const FRED = path.join(PUB, 'fred-yields.json');

const cd   = JSON.parse(fs.readFileSync(CD,   'utf8'));
const imf  = JSON.parse(fs.readFileSync(IMF,  'utf8'));
const fred = JSON.parse(fs.readFileSync(FRED, 'utf8'));

let imfMerged = 0, fredMerged = 0;

// Merge IMF fiscal fields — field names match what _cpMerged() currently exposes
for (const [iso2, data] of Object.entries(imf)) {
  if (!cd[iso2]) cd[iso2] = {};
  Object.assign(cd[iso2], data);
  imfMerged++;
}

// Merge FRED yields — rename to match panel field names used via _cpMerged()
for (const [iso2, data] of Object.entries(fred)) {
  if (!cd[iso2]) cd[iso2] = {};
  cd[iso2].bond_yield_10y         = data.yield_10y;
  cd[iso2].bond_yield_10y_date    = data.yield_10y_date;
  cd[iso2].bond_yield_10y_history = data.yield_history;
  fredMerged++;
}

fs.writeFileSync(CD, JSON.stringify(cd, null, 2), 'utf8');
console.log(`Merged ${imfMerged} IMF + ${fredMerged} FRED records into country-data.json`);
console.log(`Total countries in file: ${Object.keys(cd).length}`);
```

- [ ] **Step 2: Run the migration and verify**

```bash
node scripts/migrate-country-data.js
```

Expected output:
```
Merged 193 IMF + 27 FRED records into country-data.json
Total countries in file: 296
```

Then spot-check the US entry:

```bash
node -e "const d=require('./public/country-data.json'); const us=d['US']; console.log('debt:', us.govt_debt_gdp, 'yield:', us.bond_yield_10y, 'gdp:', us.gdp_per_capita)"
```

Expected: three numbers printed (e.g. `debt: 128.7 yield: 4.13 gdp: 84534.04`).

---

## Task 2: Write tests for country merge

**Files:**
- Create: `tests/migrate-country-data.test.js`

- [ ] **Step 1: Write the tests**

```js
// tests/migrate-country-data.test.js
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');

// Read the actual merged file (migration must have run first)
const cd = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'public', 'country-data.json'), 'utf8'));

describe('country-data merge', () => {
  it('US has World Bank fields', () => {
    assert.ok(typeof cd['US'].gdp_per_capita === 'number');
    assert.ok(typeof cd['US'].life_expectancy === 'number');
  });
  it('US has IMF fields', () => {
    assert.ok(typeof cd['US'].govt_debt_gdp === 'number');
    assert.ok(typeof cd['US'].fiscal_balance_gdp === 'number');
    assert.ok(Array.isArray(cd['US'].govt_debt_gdp_history));
    assert.ok(cd['US'].govt_debt_gdp_history.length > 0);
    // history is [[year, value]] tuples
    assert.ok(Array.isArray(cd['US'].govt_debt_gdp_history[0]));
  });
  it('US has FRED fields under bond_yield_10y name', () => {
    assert.ok(typeof cd['US'].bond_yield_10y === 'number');
    assert.ok(typeof cd['US'].bond_yield_10y_date === 'string');
    assert.ok(Array.isArray(cd['US'].bond_yield_10y_history));
    assert.ok(cd['US'].bond_yield_10y_history.length > 0);
    // history is [["YYYY-MM", value]] tuples
    assert.ok(typeof cd['US'].bond_yield_10y_history[0][0] === 'string');
  });
  it('country without FRED data (e.g. NG) still has World Bank fields', () => {
    assert.ok(typeof cd['NG'].gdp_per_capita === 'number');
    assert.equal(cd['NG'].bond_yield_10y, undefined);
  });
  it('country without IMF data is still present', () => {
    // All 296 WB countries should still be in the file
    assert.ok(Object.keys(cd).length >= 296);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
node --test tests/migrate-country-data.test.js
```

Expected: all 5 tests pass.

---

## Task 3: Update fetch-imf.js to write to country-data.json

**Files:**
- Modify: `scripts/fetch-imf.js`

- [ ] **Step 1: Change the output target**

In `scripts/fetch-imf.js`, find and change:

```js
// FIND (line ~36):
const OUT_FILE = path.join(__dirname, '..', 'public', 'imf-fiscal.json');
```

Replace with:

```js
const OUT_FILE      = path.join(__dirname, '..', 'public', 'country-data.json');
const IMF_KEYS = ['govt_debt_gdp','govt_debt_gdp_year','govt_debt_gdp_history',
                  'fiscal_balance_gdp','fiscal_balance_gdp_year','fiscal_balance_gdp_history',
                  'govt_revenue_gdp','govt_revenue_gdp_year','govt_revenue_gdp_history',
                  'govt_expenditure_gdp','govt_expenditure_gdp_year','govt_expenditure_gdp_history'];
```

- [ ] **Step 2: Change the write logic to merge instead of overwrite**

In `scripts/fetch-imf.js`, find the `fs.writeFileSync` call near the end (currently writes `out` directly). Replace the `out` initialization and write section:

```js
// FIND at top of main():
const out = {};

// REPLACE WITH:
// Load existing country-data.json so we only update IMF keys
let base = {};
try { base = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8')); } catch { /* start fresh */ }
const out = base;
// Clear previous IMF keys to avoid stale data
for (const iso of Object.keys(out)) {
  for (const k of IMF_KEYS) delete out[iso][k];
}
```

The `fs.writeFileSync` line itself stays the same (it writes `out` which is now the merged base).

- [ ] **Step 3: Verify the script still runs without error (dry-run check)**

```bash
node -e "require('./scripts/fetch-imf.js')" 2>&1 | head -5
```

Expected: script starts (or shows API key / network prompt), no syntax errors.

---

## Task 4: Update fetch-fred.js to write to country-data.json

**Files:**
- Modify: `scripts/fetch-fred.js`

- [ ] **Step 1: Change the output target and add rename logic**

In `scripts/fetch-fred.js`, find:

```js
const OUT_FILE = path.join(__dirname, '..', 'public', 'fred-yields.json');
```

Replace with:

```js
const OUT_FILE   = path.join(__dirname, '..', 'public', 'country-data.json');
const FRED_KEYS  = ['bond_yield_10y','bond_yield_10y_date','bond_yield_10y_history'];
```

- [ ] **Step 2: Change initialization and write to merge into country-data**

In `scripts/fetch-fred.js`, find (around line 116):

```js
  let out = {};
  if (fs.existsSync(OUT_FILE)) {
    try { out = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8')); } catch { /* start fresh */ }
  }
```

Replace with:

```js
  let out = {};
  try { out = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8')); } catch { /* start fresh */ }
  // Clear previous FRED keys to avoid stale data
  for (const iso of Object.keys(out)) {
    for (const k of FRED_KEYS) delete out[iso][k];
  }
```

- [ ] **Step 3: Change the per-country write to use renamed keys**

In `scripts/fetch-fred.js`, find (around line 145):

```js
      out[iso2] = {
        yield_10y:      latestVal,
        yield_10y_date: latest.date.slice(0, 7),
        yield_history:  history,
      };
```

Replace with:

```js
      if (!out[iso2]) out[iso2] = {};
      out[iso2].bond_yield_10y         = latestVal;
      out[iso2].bond_yield_10y_date    = latest.date.slice(0, 7);
      out[iso2].bond_yield_10y_history = history;
```

- [ ] **Step 4: Syntax check**

```bash
node --check scripts/fetch-fred.js
```

Expected: no output (no syntax errors).

---

## Task 5: Update app.js — remove fredYields, imfFiscal, _cpMerged

**Files:**
- Modify: `public/app.js`

This task has multiple edits to app.js. Make each change separately.

- [ ] **Step 1: Remove fredYields and imfFiscal global declarations**

Find (around line 1623):
```js
let fredYields     = {};   // ISO2 → {yield_10y, yield_10y_date, yield_history} (from fred-yields.json)
let imfFiscal      = {};   // ISO2 → {govt_debt_gdp, fiscal_balance_gdp, ...} (from imf-fiscal.json)
```
Delete both lines.

- [ ] **Step 2: Remove the FRED and IMF fetch calls from Promise.all**

Find (around line 2592):
```js
fetch('/fred-yields.json').catch(() => null),
fetch('/imf-fiscal.json').catch(() => null),
```
Delete both lines.

Find the destructuring on the same Promise.all result:
```js
const [citiesRes, countryRes, geoRes, companiesRes, censusRes, censusBusinessRes, beaTradeRes, eurostatRes, gawcRes, japanRes, airportRes, zillowRes, climateExtraRes, fredRes, imfRes] = await Promise.all([
```
Remove `fredRes` and `imfRes` from the destructured array (leave the rest unchanged):
```js
const [citiesRes, countryRes, geoRes, companiesRes, censusRes, censusBusinessRes, beaTradeRes, eurostatRes, gawcRes, japanRes, airportRes, zillowRes, climateExtraRes] = await Promise.all([
```

- [ ] **Step 3: Remove the fredYields and imfFiscal assignment blocks**

Find (around line 2714):
```js
        fredYields = await fredRes.json();
        console.log(`[init] FRED bond yields loaded (${Object.keys(fredYields).length} countries)`);
```
Delete these lines.

Find (around line 2720):
```js
        imfFiscal = await imfRes.json();
        console.log(`[init] IMF fiscal data loaded (${Object.keys(imfFiscal).length} countries)`);
```
Delete these lines.

- [ ] **Step 4: Simplify _cpWorldMax to loop only countryData**

Find and replace `_cpWorldMax` (around line 2966):

```js
// FIND:
function _cpWorldMax(key) {
  var max = 0, v;
  for (var k in countryData) {
    v = countryData[k][key];
    if (Number.isFinite(v) && v > max) max = v;
  }
  // IMF indicators
  if (typeof imfFiscal !== 'undefined' && imfFiscal) {
    for (var k in imfFiscal) {
      v = imfFiscal[k][key];
      if (Number.isFinite(v) && v > max) max = v;
    }
  }
  // FRED bond yield
  if (key === 'bond_yield_10y' && typeof fredYields !== 'undefined' && fredYields) {
    for (var k in fredYields) {
      v = fredYields[k].yield_10y;
      if (Number.isFinite(v) && v > max) max = v;
    }
  }
  return max || 1;
}

// REPLACE WITH:
function _cpWorldMax(key) {
  var max = 0, v;
  for (var k in countryData) {
    v = countryData[k][key];
    if (Number.isFinite(v) && v > max) max = v;
  }
  return max || 1;
}
```

- [ ] **Step 5: Delete _cpMerged function**

Find and delete the entire `_cpMerged` function (around line 2989):

```js
function _cpMerged(iso2) {
  var wb  = countryData[iso2]  || {};
  var imf = imfFiscal[iso2]    || {};
  var cd  = Object.assign({}, wb, imf);
  // FRED bond yield — field names differ from the panel key names
  var fred = fredYields && fredYields[iso2];
  if (fred) {
    cd.bond_yield_10y         = fred.yield_10y;
    cd.bond_yield_10y_history = fred.yield_history;
  }
  return cd;
}
```

- [ ] **Step 6: Replace all _cpMerged(iso2) call sites with direct countryData lookup**

There are 6 occurrences. Replace each:

```js
// FIND (all 6 occurrences):
var cd = _cpMerged(iso2);
// or
var merged = _cpMerged(k);

// REPLACE:
var cd = countryData[iso2] || {};
// or
var merged = countryData[k] || {};
```

Run to confirm no remaining references:
```bash
grep -n "_cpMerged" public/app.js
```
Expected: no output.

- [ ] **Step 7: Run all tests to check for regressions**

```bash
node --test tests/*.test.js
```

Expected: all tests pass (no regressions from removing the merge layer).

---

## Task 6: Delete source files and commit country merge

**Files:**
- Delete: `public/imf-fiscal.json`
- Delete: `public/fred-yields.json`

- [ ] **Step 1: Open the app and verify the country panel**

Start the app server (`node server.js`) and open the map. Click on US, Germany, Japan, and South Africa. Confirm:
- GDP per capita card visible for all four
- Govt debt gauge visible for US, DE, JP (IMF-covered countries)
- Bond yield trend tab visible for US, DE (FRED-covered countries)
- South Africa has WB + IMF data but no bond yield (expected — FRED doesn't cover ZA)

- [ ] **Step 2: Delete the now-redundant source files**

```bash
git rm public/imf-fiscal.json public/fred-yields.json
```

- [ ] **Step 3: Commit**

```bash
git add public/country-data.json scripts/migrate-country-data.js scripts/fetch-imf.js scripts/fetch-fred.js public/app.js tests/migrate-country-data.test.js
git commit -m "feat: merge imf-fiscal + fred-yields into country-data; delete _cpMerged"
```

---

## Task 7: Write the GaWC migration script

**Files:**
- Create: `scripts/migrate-gawc.js`

Context: `gawc-cities.json` is keyed by city name (e.g. `"London": {tier, score, iso}`). All other supplemental files are keyed by Wikidata QID. `_buildGawcByQid()` in app.js does the name-matching at every startup. This task migrates the file to QID keys so the function can be deleted.

- [ ] **Step 1: Write the migration script**

```js
// scripts/migrate-gawc.js
// One-time migration: re-key gawc-cities.json from city names to Wikidata QIDs.
// Reads cities-full.json as reference. Logs unmatched cities.
// Run: node scripts/migrate-gawc.js
'use strict';
const fs   = require('fs');
const path = require('path');

const PUB        = path.join(__dirname, '..', 'public');
const GAWC_IN    = path.join(PUB, 'gawc-cities.json');
const CITIES     = path.join(PUB, 'cities-full.json');

const gawc   = JSON.parse(fs.readFileSync(GAWC_IN,  'utf8'));
const cities = JSON.parse(fs.readFileSync(CITIES,   'utf8'));

// Build name+iso index from cities-full (same logic as _buildGawcByQid in app.js)
const normalize = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const nameIdx = {};
for (const c of cities) {
  if (!c.qid) continue;
  const n = normalize(c.name);
  if (!nameIdx[n]) nameIdx[n] = [];
  nameIdx[n].push(c);
}

const out = {};
const unmatched = [];

for (const [name, info] of Object.entries(gawc)) {
  const n = normalize(name);
  const candidates = nameIdx[n] || [];
  const city = candidates.find(c => c.iso === info.iso) || candidates[0];
  if (!city) {
    unmatched.push(name);
    continue;
  }
  out[city.qid] = { tier: info.tier, score: info.score };
}

fs.writeFileSync(GAWC_IN, JSON.stringify(out, null, 2), 'utf8');
console.log(`Matched ${Object.keys(out).length}/${Object.keys(gawc).length} GaWC cities to QIDs`);

if (unmatched.length) {
  console.warn(`Unmatched (${unmatched.length}): ${unmatched.join(', ')}`);
  fs.writeFileSync(path.join(PUB, 'gawc-unmatched.json'), JSON.stringify(unmatched, null, 2), 'utf8');
  console.warn('Written to public/gawc-unmatched.json for manual review');
}
```

- [ ] **Step 2: Run the migration**

```bash
node scripts/migrate-gawc.js
```

Expected output (approximate):
```
Matched 305/309 GaWC cities to QIDs
```

Any unmatched cities will be written to `public/gawc-unmatched.json`. Review that file — unmatched cities will silently lose their GaWC tier chip in the UI. Acceptable if ≤5 obscure entries. If a well-known city (London, New York, Tokyo) is missing, check the name normalization.

- [ ] **Step 3: Spot-check the output**

```bash
node -e "
const d=require('./public/gawc-cities.json');
const keys=Object.keys(d);
console.log('Total:', keys.length, 'First key:', keys[0]);
// London = Q84, New York = Q60, Tokyo = Q1490
console.log('London (Q84):', d['Q84']);
console.log('New York (Q60):', d['Q60']);
"
```

Expected: QID-shaped keys, London and New York present with `tier` and `score` fields.

---

## Task 8: Write tests for GaWC migration

**Files:**
- Create: `tests/migrate-gawc.test.js`

- [ ] **Step 1: Write the tests**

```js
// tests/migrate-gawc.test.js
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');

const gawc = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'public', 'gawc-cities.json'), 'utf8'));

describe('gawc-cities QID migration', () => {
  it('all keys are Wikidata QID format', () => {
    const nonQid = Object.keys(gawc).filter(k => !/^Q\d+$/.test(k));
    assert.equal(nonQid.length, 0, `Non-QID keys found: ${nonQid.slice(0,5).join(', ')}`);
  });
  it('London (Q84) has Alpha++ tier', () => {
    assert.ok(gawc['Q84'], 'London Q84 missing');
    assert.equal(gawc['Q84'].tier, 'Alpha++');
  });
  it('New York (Q60) is present', () => {
    assert.ok(gawc['Q60'], 'New York Q60 missing');
    assert.ok(typeof gawc['Q60'].score === 'number');
  });
  it('each entry has tier and score only (no name, no iso — cleaned up)', () => {
    for (const [qid, entry] of Object.entries(gawc)) {
      assert.ok('tier' in entry, `${qid} missing tier`);
      assert.ok('score' in entry, `${qid} missing score`);
    }
  });
  it('coverage is at least 300 cities', () => {
    assert.ok(Object.keys(gawc).length >= 300);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
node --test tests/migrate-gawc.test.js
```

Expected: all 5 tests pass.

---

## Task 9: Update app.js — remove _buildGawcByQid

**Files:**
- Modify: `public/app.js`

- [ ] **Step 1: Delete the gawcByQid variable declaration**

Find (around line 1618):
```js
let gawcByQid      = {};   // QID → {tier, score, name} (built at init from gawcCities)
```
Delete this line.

- [ ] **Step 2: Delete the _buildGawcByQid function**

Find and delete the entire function (around line 1653):
```js
function _buildGawcByQid() {
  if (!Object.keys(gawcCities).length || !allCities.length) return;
  const normalize = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  // Build name index from allCities: normalized name → city objects
  const nameIdx = {};
  for (const c of allCities) {
    const n = normalize(c.name);
    if (!nameIdx[n]) nameIdx[n] = [];
    nameIdx[n].push(c);
  }
  let matched = 0;
  for (const [name, info] of Object.entries(gawcCities)) {
    const n = normalize(name);
    const candidates = nameIdx[n] || [];
    // Prefer same iso2, then any
    let city = candidates.find(c => c.iso === info.iso) || candidates[0];
    if (!city) continue;
    gawcByQid[city.qid] = { tier: info.tier, score: info.score, name };
    matched++;
  }
  console.log(`[GaWC] Matched ${matched}/${Object.keys(gawcCities).length} cities to QIDs`);
}
```

- [ ] **Step 3: Remove the _buildGawcByQid() call from init**

Find (around line 2740):
```js
    _buildGawcByQid();
```
Delete this line.

- [ ] **Step 4: Replace gawcByQid[city.qid] with gawcCities[city.qid] at all 2 usage sites**

Find (around line 1317):
```js
const g = gawcByQid[city.qid];
```
Replace with:
```js
const g = gawcCities[city.qid];
```

Find (around line 1804):
```js
gawc_score: { label:'GaWC World City Rank', key: c=>gawcByQid[c.qid]?.score ?? null,
```
Replace with:
```js
gawc_score: { label:'GaWC World City Rank', key: c=>gawcCities[c.qid]?.score ?? null,
```

- [ ] **Step 5: Update the gawcCities comment to reflect it's now QID-keyed**

Find (around line 1617):
```js
let gawcCities     = {};   // city name → {tier, score, iso} (GaWC 2024 world city network)
```
Replace with:
```js
let gawcCities     = {};   // QID → {tier, score} (GaWC 2024 world city network)
```

- [ ] **Step 6: Verify no remaining references to gawcByQid**

```bash
grep -n "gawcByQid" public/app.js
```
Expected: no output.

- [ ] **Step 7: Run all tests**

```bash
node --test tests/*.test.js
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add public/gawc-cities.json scripts/migrate-gawc.js public/app.js tests/migrate-gawc.test.js
git commit -m "feat: re-key gawc-cities to QIDs; delete _buildGawcByQid name-matching"
```

---

## Task 10: Write the companies history migration script

**Files:**
- Create: `scripts/migrate-companies-history.js`

Context: `companies.json` history arrays use `{year, value, currency}` objects. All other history arrays in the project use `[[key, value]]` tuples. This task normalizes companies to match. The `currency` field (when present) is constant across years per company, so it moves to a top-level `*_currency` field (which several already have from the Yahoo enrichment).

- [ ] **Step 1: Write the migration script**

```js
// scripts/migrate-companies-history.js
// One-time: convert company history arrays from [{year,value,currency}] to [[year,value]].
// Currency (if present and constant) is verified to already be at the top level;
// if missing, it is set from the history entries.
// Run: node scripts/migrate-companies-history.js
'use strict';
const fs   = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'public', 'companies.json');
const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));

const HIST_KEYS = [
  ['revenue_history',          'revenue_currency'],
  ['net_income_history',       'net_income_currency'],
  ['operating_income_history', 'operating_income_currency'],
  ['total_assets_history',     'total_assets_currency'],
  ['total_equity_history',     'total_equity_currency'],
  ['employees_history',        null],  // no currency on employees
];

let converted = 0;

for (const [cityQid, companies] of Object.entries(data)) {
  for (const co of companies) {
    for (const [histKey, currKey] of HIST_KEYS) {
      const hist = co[histKey];
      if (!Array.isArray(hist) || !hist.length) continue;
      // Detect if already tuples (first element is an array)
      if (Array.isArray(hist[0])) continue;
      // Extract currency from first history entry if top-level field is missing
      if (currKey && !co[currKey] && hist[0].currency) {
        co[currKey] = hist[0].currency;
      }
      // Convert to tuples
      co[histKey] = hist.map(h => [h.year, h.value]);
      converted++;
    }
  }
}

fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8');
console.log(`Converted ${converted} history arrays to [[year, value]] tuples`);
```

- [ ] **Step 2: Run the migration**

```bash
node scripts/migrate-companies-history.js
```

Expected output (approximate):
```
Converted 4800 history arrays to [[year, value]] tuples
```

- [ ] **Step 3: Spot-check the output**

```bash
node -e "
const d=require('./public/companies.json');
// Tokyo (Q1490), find Honda
const honda = d['Q1490'].find(c=>c.name==='Honda');
console.log('Honda revenue_history[0]:', honda.revenue_history[0]);
console.log('Honda revenue_currency:', honda.revenue_currency);
console.log('Honda employees_history[0]:', honda.employees_history[0]);
"
```

Expected: `revenue_history[0]` is `[2022, 14950000000000]` (a 2-element array), `revenue_currency` is `"JPY"`.

---

## Task 11: Write tests for companies history migration

**Files:**
- Create: `tests/migrate-companies-history.test.js`

- [ ] **Step 1: Write the tests**

```js
// tests/migrate-companies-history.test.js
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'public', 'companies.json'), 'utf8'));

// Flatten all companies from all city keys
const allCompanies = Object.values(data).flat();

const HIST_KEYS = [
  'revenue_history', 'net_income_history', 'operating_income_history',
  'total_assets_history', 'total_equity_history', 'employees_history',
];

describe('companies history normalization', () => {
  it('no history array uses object format', () => {
    for (const co of allCompanies) {
      for (const k of HIST_KEYS) {
        const hist = co[k];
        if (!Array.isArray(hist) || !hist.length) continue;
        assert.ok(
          Array.isArray(hist[0]),
          `${co.name}.${k}[0] is not a tuple: ${JSON.stringify(hist[0])}`
        );
      }
    }
  });
  it('all tuple entries have exactly 2 elements', () => {
    for (const co of allCompanies) {
      for (const k of HIST_KEYS) {
        const hist = co[k];
        if (!Array.isArray(hist) || !hist.length) continue;
        for (const entry of hist) {
          assert.equal(entry.length, 2, `${co.name}.${k} entry has ${entry.length} elements`);
        }
      }
    }
  });
  it('year element is a number', () => {
    for (const co of allCompanies) {
      if (!co.revenue_history?.length) continue;
      assert.equal(typeof co.revenue_history[0][0], 'number');
    }
  });
  it('Honda revenue_currency is set at top level', () => {
    const tokyo = data['Q1490'] || [];
    const honda = tokyo.find(c => c.name === 'Honda');
    assert.ok(honda, 'Honda not found in Q1490');
    assert.ok(honda.revenue_currency, 'Honda revenue_currency not set');
  });
});
```

- [ ] **Step 2: Run tests**

```bash
node --test tests/migrate-companies-history.test.js
```

Expected: all 4 tests pass.

---

## Task 12: Update app.js — fix sparkline and history accessors

**Files:**
- Modify: `public/app.js`

- [ ] **Step 1: Update the _sparkline function to use tuple access**

Find (around line 5311):
```js
    const _sparkline = (hist, label, color, fmtFn) => {
      const rows = (hist || []).filter(h => h.year && h.value > 0);
      if (rows.length < 2) return '';
      const minV = Math.min(...rows.map(h => h.value));
      const maxV = Math.max(...rows.map(h => h.value));
      const pts  = JSON.stringify(rows.map(h => [h.year, h.value]));
```

Replace with:
```js
    const _sparkline = (hist, label, color, fmtFn) => {
      const rows = (hist || []).filter(h => h[0] && h[1] > 0);
      if (rows.length < 2) return '';
      const minV = Math.min(...rows.map(h => h[1]));
      const maxV = Math.max(...rows.map(h => h[1]));
      const pts  = JSON.stringify(rows);
```

- [ ] **Step 2: Update revHistory and niHistory accessors**

Find (around line 5057):
```js
    return (co.revenue_history || []).filter(r => r.value > 0).map(r => ({ t: r.year, v: r.value }));
```
Replace with:
```js
    return (co.revenue_history || []).filter(r => r[1] > 0).map(r => ({ t: r[0], v: r[1] }));
```

Find (around line 5065):
```js
    return (co.net_income_history || []).filter(r => r.value != null).map(r => ({ t: r.year, v: r.value }));
```
Replace with:
```js
    return (co.net_income_history || []).filter(r => r[1] != null).map(r => ({ t: r[0], v: r[1] }));
```

Find (around line 5070):
```js
  const assetHistory = (co.total_assets_history || []).filter(r => r.value > 0).map(r => ({ t: r.year, v: r.value }));
  const equityHistory = (co.total_equity_history || []).filter(r => r.value != null && r.value !== 0).map(r => ({ t: r.year, v: r.value }));
```
Replace with:
```js
  const assetHistory = (co.total_assets_history || []).filter(r => r[1] > 0).map(r => ({ t: r[0], v: r[1] }));
  const equityHistory = (co.total_equity_history || []).filter(r => r[1] != null && r[1] !== 0).map(r => ({ t: r[0], v: r[1] }));
```

- [ ] **Step 3: Run all tests**

```bash
node --test tests/*.test.js
```

Expected: all tests pass.

- [ ] **Step 4: Manual verify — open a company panel**

Start the server and open the map. Click any city, open the Corporations panel. Click a company with financial data (e.g. Honda in Tokyo, Apple in San Jose). Confirm the revenue/employee sparklines render correctly.

- [ ] **Step 5: Commit**

```bash
git add public/companies.json scripts/migrate-companies-history.js public/app.js tests/migrate-companies-history.test.js
git commit -m "feat: normalize companies history to [[year,value]] tuples; update sparkline reader"
```

---

## Task 13: Generate data-manifest.json

**Files:**
- Create: `scripts/write-manifest.js`
- Create: `public/data-manifest.json`

- [ ] **Step 1: Write the manifest generator**

```js
// scripts/write-manifest.js
// Generates public/data-manifest.json — a registry of every data file.
// Re-run after any file is added or updated to keep coverage counts current.
// Run: node scripts/write-manifest.js
'use strict';
const fs   = require('fs');
const path = require('path');

const PUB = path.join(__dirname, '..', 'public');

function readJson(name) {
  try { return JSON.parse(fs.readFileSync(path.join(PUB, name), 'utf8')); }
  catch { return null; }
}

const countryData  = readJson('country-data.json');
const cities       = readJson('cities-full.json');
const companies    = readJson('companies.json');
const eurostat     = readJson('eurostat-cities.json');
const zillow       = readJson('zillow-cities.json');
const census       = readJson('census-cities.json');
const climate      = readJson('climate-extra.json');
const gawc         = readJson('gawc-cities.json');
const airport      = readJson('airport-connectivity.json');
const bea          = readJson('bea-trade.json');

// Helper: first available field names from a sample entry
const sampleFields = obj => obj ? Object.keys(Object.values(obj)[0] || {}) : [];
const sampleArrFields = arr => arr ? Object.keys(arr[0] || {}) : [];

const today = new Date().toISOString().slice(0, 7); // YYYY-MM

const manifest = {
  'country-data':         { key: 'iso2',  coverage: countryData ? Object.keys(countryData).length : 0,  fields: sampleFields(countryData),  updated: today },
  'cities-full':          { key: 'array', coverage: cities ? cities.length : 0,                          fields: sampleArrFields(cities),     updated: today },
  'companies':            { key: 'qid',   coverage: companies ? Object.keys(companies).length : 0,       fields: sampleFields(companies).length ? Object.keys((Object.values(companies)[0]||[])[0]||{}) : [], updated: today },
  'eurostat-cities':      { key: 'qid',   coverage: eurostat ? Object.keys(eurostat).length : 0,  region: 'EU', fields: sampleFields(eurostat),  updated: today },
  'zillow-cities':        { key: 'qid',   coverage: zillow   ? Object.keys(zillow).length   : 0,  region: 'US', fields: sampleFields(zillow),    updated: today },
  'census-cities':        { key: 'qid',   coverage: census   ? Object.keys(census).length   : 0,  region: 'US', fields: sampleFields(census),    updated: today },
  'climate-extra':        { key: 'qid',   coverage: climate  ? Object.keys(climate).length  : 0,         fields: ['months'],                   updated: today },
  'gawc-cities':          { key: 'qid',   coverage: gawc     ? Object.keys(gawc).length     : 0,         fields: sampleFields(gawc),           updated: today },
  'airport-connectivity': { key: 'qid',   coverage: airport  ? Object.keys(airport).length  : 0,         fields: sampleFields(airport),        updated: today },
  'bea-trade':            { key: 'iso2',  coverage: bea      ? Object.keys(bea).length       : 0,  region: 'US-bilateral', fields: ['expGds', 'impGds'], updated: today },
};

const OUT = path.join(PUB, 'data-manifest.json');
fs.writeFileSync(OUT, JSON.stringify(manifest, null, 2), 'utf8');
console.log('Written data-manifest.json:');
for (const [name, entry] of Object.entries(manifest)) {
  console.log(`  ${name.padEnd(24)} key:${entry.key.padEnd(6)} coverage:${String(entry.coverage).padStart(5)}`);
}
```

- [ ] **Step 2: Run the generator**

```bash
node scripts/write-manifest.js
```

Expected output (approximate):
```
Written data-manifest.json:
  country-data             key:iso2   coverage:  296
  cities-full              key:array  coverage: 6603
  companies                key:qid    coverage: 1237
  eurostat-cities          key:qid    coverage:  512
  zillow-cities            key:qid    coverage:  448
  census-cities            key:qid    coverage:  470
  climate-extra            key:qid    coverage:   75
  gawc-cities              key:qid    coverage:  305
  airport-connectivity     key:qid    coverage: 1175
  bea-trade                key:iso2   coverage:  124
```

- [ ] **Step 3: Run all tests one final time**

```bash
node --test tests/*.test.js
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add public/data-manifest.json scripts/write-manifest.js
git commit -m "feat: add data-manifest.json and write-manifest generator"
```

---

## Completion Checklist

- [ ] `country-data.json` has IMF and FRED fields; `imf-fiscal.json` and `fred-yields.json` deleted
- [ ] `gawc-cities.json` keys are all `Q\d+` QIDs; `_buildGawcByQid` deleted from app.js
- [ ] `companies.json` history arrays are all `[[year, value]]` tuples
- [ ] `data-manifest.json` exists and shows correct coverage counts
- [ ] All tests pass: `node --test tests/*.test.js`
- [ ] Country panel renders correctly for US, DE, JP, ZA
- [ ] Company sparklines render correctly for at least one company
- [ ] GaWC tier chips visible for London, New York, Tokyo
