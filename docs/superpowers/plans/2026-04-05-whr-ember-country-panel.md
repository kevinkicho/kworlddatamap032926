# WHR + Ember Energy Mix — Country Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add World Happiness Report 2024 (score + 6 factors) and Ember electricity mix (5-source breakdown + coal history sparkline) to the country panel.

**Architecture:** Two new fetch scripts (`fetch-whr.js`, `fetch-ember.js`) each read `country-data.json`, merge their fields in, and write back — the same pattern as `fetch-imf.js`. App.js gains two new gauge sections rendered in `_renderCountryPanel`, and a `Coal %` trend tab in `_buildTrendTabs` / `_switchTrendTab`.

**Tech Stack:** Node.js 20, `xlsx` npm package (already in devDependencies), native `fetch`, `node --test` test runner.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `scripts/fetch-whr.js` | Create | Download WHR 2024 XLS, parse, merge WHR fields into country-data.json |
| `scripts/fetch-ember.js` | Create | Download Ember CSV, parse, merge energy fields into country-data.json |
| `public/app.js` | Modify | Add Happiness + Energy Mix gauge sections; add Coal % trend tab |
| `package.json` | Modify | Add `fetch-whr` and `fetch-ember` npm scripts |
| `tests/fetch-whr.test.js` | Create | Unit-test name matching; integration-test output shape in country-data.json |
| `tests/fetch-ember.test.js` | Create | Unit-test history sort + region exclusion; integration-test output shape |

---

## Task 1: `scripts/fetch-whr.js` — World Happiness Report fetcher

**Files:**
- Create: `scripts/fetch-whr.js`
- Test: `tests/fetch-whr.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/fetch-whr.test.js`:

```javascript
// tests/fetch-whr.test.js
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');

// ── Unit-test the name-matching logic in isolation ───────────────────────────
// (Copy of buildNameLookup from fetch-whr.js — no network, no xlsx needed)
const NAME_OVERRIDES = {
  'united states':                'US',
  'united kingdom':               'GB',
  'south korea':                  'KR',
  'taiwan province of china':     'TW',
  'hong kong s.a.r. of china':    'HK',
  "congo (brazzaville)":          'CG',
  "congo (kinshasa)":             'CD',
  "cote d'ivoire":                'CI',
  'ivory coast':                  'CI',
  'north macedonia':              'MK',
  'somaliland region':            null,
};

function buildNameLookup(cd, overrides) {
  const map = {};
  for (const [iso2, d] of Object.entries(cd)) {
    if (d.name) map[d.name.toLowerCase()] = iso2;
  }
  for (const [name, iso2] of Object.entries(overrides)) {
    if (iso2) map[name.toLowerCase()] = iso2;
    else map[name.toLowerCase()] = null;
  }
  return map;
}

const mockCd = {
  FI: { name: 'Finland' },
  DE: { name: 'Germany' },
  JP: { name: 'Japan' },
  DK: { name: 'Denmark' },
};

describe('WHR name matching', () => {
  const lookup = buildNameLookup(mockCd, NAME_OVERRIDES);

  it('matches country names from country-data.json', () => {
    assert.equal(lookup['finland'], 'FI');
    assert.equal(lookup['germany'], 'DE');
    assert.equal(lookup['japan'],   'JP');
    assert.equal(lookup['denmark'], 'DK');
  });

  it('applies WHR-specific name overrides', () => {
    assert.equal(lookup['united states'],             'US');
    assert.equal(lookup['south korea'],               'KR');
    assert.equal(lookup['taiwan province of china'],  'TW');
    assert.equal(lookup["cote d'ivoire"],             'CI');
    assert.equal(lookup['ivory coast'],               'CI');
  });

  it('null overrides mark skip-entries', () => {
    assert.equal(lookup['somaliland region'], null);
  });

  it('returns undefined for unknown names', () => {
    assert.equal(lookup['unknown country xyz'], undefined);
  });

  it('override wins over cd.name (case-insensitive)', () => {
    // If cd had an entry { name: 'United States' }, override still applies
    const cdWithUS = { ...mockCd, US: { name: 'United States' } };
    const l = buildNameLookup(cdWithUS, NAME_OVERRIDES);
    assert.equal(l['united states'], 'US');
  });
});

// ── Integration: check country-data.json after running fetch-whr.js ─────────
describe('WHR fields in country-data.json', () => {
  const cdPath = path.join(__dirname, '..', 'public', 'country-data.json');
  let cd;
  try { cd = JSON.parse(fs.readFileSync(cdPath, 'utf8')); }
  catch { cd = null; }

  it('country-data.json is readable', () => {
    assert.ok(cd !== null, 'Could not read country-data.json');
  });

  it('FI has all WHR fields (run: node scripts/fetch-whr.js first)', () => {
    const fi = cd && cd['FI'];
    assert.ok(fi, 'FI missing from country-data.json');
    assert.ok(typeof fi.whr_score === 'number',   'whr_score must be a number');
    assert.ok(typeof fi.whr_rank  === 'number',   'whr_rank must be a number');
    assert.ok(fi.whr_rank >= 1,                   'whr_rank must be >= 1');
    assert.equal(fi.whr_year, 2024,               'whr_year must be 2024');
    assert.ok(typeof fi.whr_gdp        === 'number', 'whr_gdp missing');
    assert.ok(typeof fi.whr_social     === 'number', 'whr_social missing');
    assert.ok(typeof fi.whr_health     === 'number', 'whr_health missing');
    assert.ok(typeof fi.whr_freedom    === 'number', 'whr_freedom missing');
    assert.ok(typeof fi.whr_generosity === 'number', 'whr_generosity missing');
    assert.ok(typeof fi.whr_corruption === 'number', 'whr_corruption missing');
  });

  it('US has WHR fields', () => {
    const us = cd && cd['US'];
    assert.ok(us,                                'US missing from country-data.json');
    assert.ok(typeof us.whr_score === 'number',  'US whr_score missing');
    assert.ok(typeof us.whr_rank  === 'number',  'US whr_rank missing');
  });

  it('covers at least 100 countries with whr_score', () => {
    const count = cd ? Object.values(cd).filter(d => typeof d.whr_score === 'number').length : 0;
    assert.ok(count >= 100, `Only ${count} countries have whr_score — expected 100+`);
  });

  it('existing WB fields are still intact on FI', () => {
    const fi = cd && cd['FI'];
    assert.ok(fi, 'FI missing');
    assert.ok(typeof fi.gdp_per_capita === 'number', 'gdp_per_capita clobbered');
    assert.ok(typeof fi.life_expectancy === 'number', 'life_expectancy clobbered');
  });
});
```

- [ ] **Step 2: Run tests — expect failures for the integration tests**

```
node --test tests/fetch-whr.test.js
```

Expected: name-matching unit tests PASS; integration tests FAIL (whr_score undefined).

- [ ] **Step 3: Write `scripts/fetch-whr.js`**

```javascript
#!/usr/bin/env node
/**
 * scripts/fetch-whr.js
 *
 * Downloads World Happiness Report 2024 Excel, extracts Ladder score + 6 factor
 * contributions, and merges them into public/country-data.json.
 *
 * Source: https://happiness-report.s3.amazonaws.com/2024/DataForTable2.1WHR2024.xls
 * Coverage: ~143 countries
 *
 * Fields added per ISO2:
 *   whr_score, whr_rank, whr_year (2024)
 *   whr_gdp, whr_social, whr_health, whr_freedom, whr_generosity, whr_corruption
 *
 * Usage: node scripts/fetch-whr.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const CD_PATH = path.join(__dirname, '..', 'public', 'country-data.json');
const URL     = 'https://happiness-report.s3.amazonaws.com/2024/DataForTable2.1WHR2024.xls';

const WHR_KEYS = [
  'whr_score', 'whr_rank', 'whr_year',
  'whr_gdp', 'whr_social', 'whr_health',
  'whr_freedom', 'whr_generosity', 'whr_corruption',
];

// WHR country name → ISO2 overrides for names that don't match country-data.json
const NAME_OVERRIDES = {
  'united states':                'US',
  'united kingdom':               'GB',
  'south korea':                  'KR',
  'taiwan province of china':     'TW',
  'hong kong s.a.r. of china':    'HK',
  "congo (brazzaville)":          'CG',
  "congo (kinshasa)":             'CD',
  "cote d'ivoire":                'CI',
  'ivory coast':                  'CI',
  'north macedonia':              'MK',
  'laos':                         'LA',
  'iran':                         'IR',
  'russia':                       'RU',
  'syria':                        'SY',
  'vietnam':                      'VN',
  'moldova':                      'MD',
  'kosovo':                       'XK',
  'tanzania':                     'TZ',
  'bolivia':                      'BO',
  'venezuela':                    'VE',
  'somaliland region':            null,  // non-sovereign; skip
};

function buildNameLookup(cd) {
  const map = {};
  for (const [iso2, d] of Object.entries(cd)) {
    if (d.name) map[d.name.toLowerCase()] = iso2;
  }
  for (const [name, iso2] of Object.entries(NAME_OVERRIDES)) {
    if (iso2) map[name.toLowerCase()] = iso2;
    else      map[name.toLowerCase()] = null;
  }
  return map;
}

function num(v) {
  const n = parseFloat(v);
  return isNaN(n) ? null : +n.toFixed(3);
}

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  WHR 2024 Fetcher                                ║');
  console.log('╚══════════════════════════════════════════════════╝');

  const cd = JSON.parse(fs.readFileSync(CD_PATH, 'utf8'));

  // Clear stale WHR keys so a re-run removes countries dropped from the report
  for (const iso of Object.keys(cd)) {
    for (const k of WHR_KEYS) delete cd[iso][k];
  }

  const lookup = buildNameLookup(cd);

  console.log('Downloading WHR 2024 Excel…');
  const res = await fetch(URL, {
    headers: { 'User-Agent': 'WorldDataMap/1.0 (educational; nodejs)' },
    signal:  AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${URL}`);

  const buf = Buffer.from(await res.arrayBuffer());
  const wb  = xlsx.read(buf, { type: 'buffer' });
  const ws  = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws, { defval: null });
  console.log(`  Parsed ${rows.length} rows from sheet "${wb.SheetNames[0]}"`);

  let merged = 0;
  const unmatched = [];
  let rank = 0;

  for (const row of rows) {
    // WHR sheets sometimes have blank header rows — skip them
    const name = row['Country name'] || row['country name'] || row['COUNTRY'];
    if (!name || typeof name !== 'string') continue;
    rank++;

    const iso2 = lookup[name.trim().toLowerCase()];
    if (iso2 === null) continue;  // explicitly excluded (e.g. Somaliland)
    if (!iso2)         { unmatched.push(name); continue; }

    if (!cd[iso2]) cd[iso2] = {};
    cd[iso2].whr_score      = num(row['Ladder score']                                 || row['Life Ladder']);
    cd[iso2].whr_rank       = rank;
    cd[iso2].whr_year       = 2024;
    cd[iso2].whr_gdp        = num(row['Explained by: Log GDP per capita']);
    cd[iso2].whr_social     = num(row['Explained by: Social support']);
    cd[iso2].whr_health     = num(row['Explained by: Healthy life expectancy']);
    cd[iso2].whr_freedom    = num(row['Explained by: Freedom to make life choices']);
    cd[iso2].whr_generosity = num(row['Explained by: Generosity']);
    cd[iso2].whr_corruption = num(row['Explained by: Perceptions of corruption']);
    merged++;
  }

  if (unmatched.length) {
    console.warn(`\nUnmatched names (${unmatched.length}) — add to NAME_OVERRIDES if needed:`);
    unmatched.forEach(n => console.warn(`  "${n}"`));
  }

  fs.writeFileSync(CD_PATH, JSON.stringify(cd, null, 2), 'utf8');
  console.log(`\nMerged ${merged} WHR countries into country-data.json`);
  console.log(`Total countries in file: ${Object.keys(cd).length}`);
}

main().catch(err => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
```

- [ ] **Step 4: Run the fetcher**

```
node scripts/fetch-whr.js
```

Expected output (approximately):
```
╔══════════════════════════════════════════════════╗
║  WHR 2024 Fetcher                                ║
╚══════════════════════════════════════════════════╝
Downloading WHR 2024 Excel…
  Parsed 143 rows from sheet "Sheet1"

Merged 130+ WHR countries into country-data.json
Total countries in file: 297
```

Note any unmatched names and add them to `NAME_OVERRIDES` if they are sovereign states.

- [ ] **Step 5: Run tests — expect all pass**

```
node --test tests/fetch-whr.test.js
```

Expected: all tests PASS, including `FI has all WHR fields`.

- [ ] **Step 6: Commit**

```bash
git add scripts/fetch-whr.js tests/fetch-whr.test.js public/country-data.json
git commit -m "feat: add WHR 2024 data — happiness score + 6 factors per country"
```

---

## Task 2: `scripts/fetch-ember.js` — Ember energy mix fetcher

**Files:**
- Create: `scripts/fetch-ember.js`
- Test: `tests/fetch-ember.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/fetch-ember.test.js`:

```javascript
// tests/fetch-ember.test.js
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');

// ── Unit-test the history-building logic in isolation ────────────────────────
function buildHistory(yearValueMap) {
  return Object.entries(yearValueMap)
    .map(([yr, v]) => [Number(yr), v])
    .filter(([yr, v]) => yr >= 2000 && v != null && Number.isFinite(Number(v)))
    .sort((a, b) => a[0] - b[0]);
}

const SKIP_CODES = new Set([
  'ASEAN', 'CIS', 'EU', 'EU27', 'G20', 'G7', 'World',
  'Latin America', 'Middle East', 'North Africa', 'OECD',
  'Other Africa', 'Other Asia & Pacific', 'Other CIS',
  'Other Europe', 'South America', 'Southeast Asia',
]);

function isRegionAggregate(code) {
  return SKIP_CODES.has(code);
}

describe('Ember history building', () => {
  it('sorts years ascending', () => {
    const h = buildHistory({ 2020: 50, 2018: 45, 2022: 40 });
    assert.equal(h[0][0], 2018);
    assert.equal(h[1][0], 2020);
    assert.equal(h[2][0], 2022);
  });

  it('filters years before 2000', () => {
    const h = buildHistory({ 1995: 80, 2000: 70, 2010: 60 });
    assert.equal(h.length, 2);
    assert.equal(h[0][0], 2000);
  });

  it('filters null and non-finite values', () => {
    const h = buildHistory({ 2010: null, 2011: NaN, 2012: 55 });
    assert.equal(h.length, 1);
    assert.equal(h[0][1], 55);
  });

  it('returns empty array for empty input', () => {
    assert.deepEqual(buildHistory({}), []);
  });
});

describe('Ember region exclusion', () => {
  it('skips World, EU, G20, ASEAN', () => {
    assert.ok(isRegionAggregate('World'));
    assert.ok(isRegionAggregate('EU'));
    assert.ok(isRegionAggregate('G20'));
    assert.ok(isRegionAggregate('ASEAN'));
  });

  it('does not skip sovereign states', () => {
    assert.ok(!isRegionAggregate('DE'));
    assert.ok(!isRegionAggregate('US'));
    assert.ok(!isRegionAggregate('CN'));
  });
});

// ── Integration: check country-data.json after running fetch-ember.js ────────
describe('Ember fields in country-data.json', () => {
  const cdPath = path.join(__dirname, '..', 'public', 'country-data.json');
  let cd;
  try { cd = JSON.parse(fs.readFileSync(cdPath, 'utf8')); }
  catch { cd = null; }

  it('country-data.json is readable', () => {
    assert.ok(cd !== null, 'Could not read country-data.json');
  });

  it('DE has all Ember fields (run: node scripts/fetch-ember.js first)', () => {
    const de = cd && cd['DE'];
    assert.ok(de, 'DE missing from country-data.json');
    assert.ok(typeof de.energy_coal_pct        === 'number', 'energy_coal_pct missing');
    assert.ok(typeof de.energy_gas_pct         === 'number', 'energy_gas_pct missing');
    assert.ok(typeof de.energy_nuclear_pct     === 'number', 'energy_nuclear_pct missing');
    assert.ok(typeof de.energy_hydro_pct       === 'number', 'energy_hydro_pct missing');
    assert.ok(typeof de.energy_wind_solar_pct  === 'number', 'energy_wind_solar_pct missing');
    assert.ok(typeof de.energy_year            === 'number', 'energy_year missing');
    assert.ok(Array.isArray(de.energy_coal_pct_history),     'energy_coal_pct_history must be array');
    assert.ok(de.energy_coal_pct_history.length > 5,         'history should have 5+ years');
  });

  it('coal history is sorted ascending by year', () => {
    const de = cd && cd['DE'];
    if (!de || !de.energy_coal_pct_history || de.energy_coal_pct_history.length < 2) return;
    const h = de.energy_coal_pct_history;
    for (let i = 1; i < h.length; i++) {
      assert.ok(h[i][0] > h[i-1][0], `History not sorted: ${h[i-1][0]} >= ${h[i][0]}`);
    }
  });

  it('history entries are [year, pct] tuples with year >= 2000', () => {
    const de = cd && cd['DE'];
    if (!de || !de.energy_coal_pct_history) return;
    for (const entry of de.energy_coal_pct_history) {
      assert.ok(Array.isArray(entry) && entry.length === 2, 'Entry must be [year, pct]');
      assert.ok(entry[0] >= 2000, `Year ${entry[0]} < 2000`);
      assert.ok(typeof entry[1] === 'number', 'Value must be number');
    }
  });

  it('covers at least 80 countries with energy_coal_pct', () => {
    const count = cd ? Object.values(cd).filter(d => typeof d.energy_coal_pct === 'number').length : 0;
    assert.ok(count >= 80, `Only ${count} countries have energy_coal_pct — expected 80+`);
  });

  it('existing WB fields are still intact on DE', () => {
    const de = cd && cd['DE'];
    assert.ok(de, 'DE missing');
    assert.ok(typeof de.gdp_per_capita === 'number', 'gdp_per_capita clobbered');
  });
});
```

- [ ] **Step 2: Run tests — expect failures for integration tests**

```
node --test tests/fetch-ember.test.js
```

Expected: unit tests PASS; integration tests FAIL (energy_coal_pct undefined).

- [ ] **Step 3: Write `scripts/fetch-ember.js`**

```javascript
#!/usr/bin/env node
/**
 * scripts/fetch-ember.js
 *
 * Downloads Ember Global Electricity Review (long-format CSV), extracts
 * % share of electricity generation per source per country, and merges into
 * public/country-data.json.
 *
 * Sources tried in order:
 *   1. Ember yearly_full_release_long_format.csv
 *   2. Our World in Data owid-energy-data.csv (fallback, has same variables)
 *
 * Fields added per ISO2:
 *   energy_coal_pct, energy_gas_pct, energy_nuclear_pct,
 *   energy_hydro_pct, energy_wind_solar_pct, energy_year
 *   energy_coal_pct_history  [[year, pct], …]  (2000–latest)
 *
 * Usage: node scripts/fetch-ember.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const CD_PATH = path.join(__dirname, '..', 'public', 'country-data.json');

const EMBER_URL = 'https://ember-climate.org/app/uploads/2022/03/yearly_full_release_long_format.csv';
const OWID_URL  = 'https://raw.githubusercontent.com/owid/energy-data/master/owid-energy-data.csv';

const EMBER_KEYS = [
  'energy_coal_pct', 'energy_gas_pct', 'energy_nuclear_pct',
  'energy_hydro_pct', 'energy_wind_solar_pct', 'energy_year',
  'energy_coal_pct_history',
];

// Region/aggregate ISO codes to skip
const SKIP_CODES = new Set([
  'ASEAN', 'CIS', 'EU', 'EU27', 'G20', 'G7', 'World',
  'Latin America', 'Middle East', 'North Africa', 'OECD',
  'Other Africa', 'Other Asia & Pacific', 'Other CIS',
  'Other Europe', 'South America', 'Southeast Asia',
]);

// Partial ISO3 → ISO2 table (Ember sometimes uses ISO3)
const ISO3_TO_ISO2 = {
  AFG:'AF',ALB:'AL',DZA:'DZ',AGO:'AO',ARG:'AR',ARM:'AM',AUS:'AU',AUT:'AT',
  AZE:'AZ',BHS:'BS',BHR:'BH',BGD:'BD',BLR:'BY',BEL:'BE',BEN:'BJ',BOL:'BO',
  BIH:'BA',BWA:'BW',BRA:'BR',BRN:'BN',BGR:'BG',BFA:'BF',BDI:'BI',CPV:'CV',
  KHM:'KH',CMR:'CM',CAN:'CA',CAF:'CF',TCD:'TD',CHL:'CL',CHN:'CN',COL:'CO',
  COD:'CD',COG:'CG',CRI:'CR',CIV:'CI',HRV:'HR',CUB:'CU',CYP:'CY',CZE:'CZ',
  DNK:'DK',DOM:'DO',ECU:'EC',EGY:'EG',SLV:'SV',ERI:'ER',EST:'EE',ETH:'ET',
  FJI:'FJ',FIN:'FI',FRA:'FR',GAB:'GA',GMB:'GM',GEO:'GE',DEU:'DE',GHA:'GH',
  GRC:'GR',GTM:'GT',GIN:'GN',GUY:'GY',HTI:'HT',HND:'HN',HKG:'HK',HUN:'HU',
  ISL:'IS',IND:'IN',IDN:'ID',IRN:'IR',IRQ:'IQ',IRL:'IE',ISR:'IL',ITA:'IT',
  JAM:'JM',JPN:'JP',JOR:'JO',KAZ:'KZ',KEN:'KE',PRK:'KP',KOR:'KR',KWT:'KW',
  KGZ:'KG',LAO:'LA',LVA:'LV',LBN:'LB',LBR:'LR',LBY:'LY',LTU:'LT',LUX:'LU',
  MDG:'MG',MWI:'MW',MYS:'MY',MLI:'ML',MLT:'MT',MRT:'MR',MUS:'MU',MEX:'MX',
  MDA:'MD',MNG:'MN',MNE:'ME',MAR:'MA',MOZ:'MZ',MMR:'MM',NAM:'NA',NPL:'NP',
  NLD:'NL',NZL:'NZ',NIC:'NI',NER:'NE',NGA:'NG',MKD:'MK',NOR:'NO',OMN:'OM',
  PAK:'PK',PAN:'PA',PNG:'PG',PRY:'PY',PER:'PE',PHL:'PH',POL:'PL',PRT:'PT',
  QAT:'QA',ROU:'RO',RUS:'RU',RWA:'RW',SAU:'SA',SEN:'SN',SRB:'RS',SLE:'SL',
  SGP:'SG',SVK:'SK',SVN:'SI',SOM:'SO',ZAF:'ZA',SSD:'SS',ESP:'ES',LKA:'LK',
  SDN:'SD',SUR:'SR',SWZ:'SZ',SWE:'SE',CHE:'CH',SYR:'SY',TWN:'TW',TJK:'TJ',
  TZA:'TZ',THA:'TH',TLS:'TL',TGO:'TG',TTO:'TT',TUN:'TN',TUR:'TR',TKM:'TM',
  UGA:'UG',UKR:'UA',ARE:'AE',GBR:'GB',USA:'US',URY:'UY',UZB:'UZ',VEN:'VE',
  VNM:'VN',YEM:'YE',ZMB:'ZM',ZWE:'ZW',XKX:'XK',PSE:'PS',
};

function parseCSV(text) {
  const lines = text.split('\n');
  if (!lines.length) return [];
  // Handle quoted headers
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // Simple split — Ember CSVs don't have commas inside field values
    const cols = line.split(',');
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (cols[j] || '').trim().replace(/^"|"$/g, '');
    }
    rows.push(row);
  }
  return rows;
}

function resolveIso2(raw) {
  if (!raw) return null;
  const s = raw.trim();
  if (SKIP_CODES.has(s)) return null;
  if (s.length === 2) return s.toUpperCase();
  if (s.length === 3) return ISO3_TO_ISO2[s.toUpperCase()] || null;
  return null;
}

function buildHistory(yearValueMap) {
  return Object.entries(yearValueMap)
    .map(([yr, v]) => [Number(yr), v])
    .filter(([yr, v]) => yr >= 2000 && v != null && Number.isFinite(Number(v)))
    .sort((a, b) => a[0] - b[0]);
}

// Variables to extract — Ember and OWID use the same names
const VARS = ['Coal', 'Gas', 'Nuclear', 'Hydro', 'Wind and Solar'];

// OWID columns differ: coal_share_elec, gas_share_elec, etc.
const OWID_VAR_MAP = {
  coal_share_elec:         'Coal',
  gas_share_elec:          'Gas',
  nuclear_share_elec:      'Nuclear',
  hydro_share_elec:        'Hydro',
  wind_solar_share_elec:   'Wind and Solar',
  renewables_share_elec:   null,  // not used
};

function processEmberRows(rows) {
  // Long format: one variable per row
  const byCountry = {};
  for (const row of rows) {
    const iso2 = resolveIso2(row['Country code'] || row['ISO'] || row['iso2']);
    if (!iso2) continue;
    const variable = (row['Variable'] || row['variable'] || '').trim();
    const year     = parseInt(row['Year'] || row['year']);
    const value    = parseFloat(row['Value'] || row['value']);
    if (!VARS.includes(variable) || isNaN(year) || isNaN(value) || year < 2000) continue;
    if (!byCountry[iso2]) byCountry[iso2] = {};
    if (!byCountry[iso2][variable]) byCountry[iso2][variable] = {};
    byCountry[iso2][variable][year] = +value.toFixed(2);
  }
  return byCountry;
}

function processOwid(rows) {
  // Wide format: one country-year per row, variables as columns
  const byCountry = {};
  for (const row of rows) {
    const iso2 = resolveIso2(row['iso_code'] || row['ISO code']);
    if (!iso2) continue;
    const year = parseInt(row['year'] || row['Year']);
    if (isNaN(year) || year < 2000) continue;
    for (const [col, variable] of Object.entries(OWID_VAR_MAP)) {
      if (!variable) continue;
      const v = parseFloat(row[col]);
      if (isNaN(v)) continue;
      if (!byCountry[iso2]) byCountry[iso2] = {};
      if (!byCountry[iso2][variable]) byCountry[iso2][variable] = {};
      byCountry[iso2][variable][year] = +v.toFixed(2);
    }
  }
  return byCountry;
}

function buildResult(byCountry) {
  const result = {};
  for (const [iso2, variables] of Object.entries(byCountry)) {
    // Use latest year with at least Coal data present
    const coalYears = variables['Coal']
      ? Object.keys(variables['Coal']).map(Number).sort((a, b) => b - a)
      : [];
    if (!coalYears.length) continue;
    const latestYear = coalYears[0];

    const get = (v) =>
      (variables[v] && variables[v][latestYear] != null) ? variables[v][latestYear] : null;

    result[iso2] = {
      energy_coal_pct:       get('Coal'),
      energy_gas_pct:        get('Gas'),
      energy_nuclear_pct:    get('Nuclear'),
      energy_hydro_pct:      get('Hydro'),
      energy_wind_solar_pct: get('Wind and Solar'),
      energy_year:           latestYear,
      energy_coal_pct_history: buildHistory(variables['Coal'] || {}),
    };
  }
  return result;
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'WorldDataMap/1.0 (educational; nodejs)' },
    signal:  AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.text();
}

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  Ember Energy Mix Fetcher                        ║');
  console.log('╚══════════════════════════════════════════════════╝');

  const cd = JSON.parse(fs.readFileSync(CD_PATH, 'utf8'));

  // Clear stale Ember keys
  for (const iso of Object.keys(cd)) {
    for (const k of EMBER_KEYS) delete cd[iso][k];
  }

  let byCountry = {};
  let source = 'unknown';

  // ── Option A: Ember CSV ────────────────────────────────────────────────────
  console.log('Attempting Ember CSV…');
  try {
    const text = await fetchText(EMBER_URL);
    const rows = parseCSV(text);
    console.log(`  Parsed ${rows.length} rows`);
    byCountry = processEmberRows(rows);
    if (Object.keys(byCountry).length > 50) {
      source = 'Ember Global Electricity Review';
    } else {
      throw new Error(`Too few countries (${Object.keys(byCountry).length})`);
    }
  } catch (e) {
    console.warn(`  Ember failed: ${e.message}`);
    byCountry = {};
  }

  // ── Option B: OWID fallback ────────────────────────────────────────────────
  if (Object.keys(byCountry).length < 50) {
    console.log('Attempting OWID energy data (fallback)…');
    try {
      const text = await fetchText(OWID_URL);
      const rows = parseCSV(text);
      console.log(`  Parsed ${rows.length} rows`);
      byCountry = processOwid(rows);
      source = 'Our World in Data energy dataset';
    } catch (e) {
      console.error(`  OWID failed: ${e.message}`);
      process.exit(1);
    }
  }

  const result = buildResult(byCountry);
  console.log(`  Built ${Object.keys(result).length} country records from ${source}`);

  // Merge into country-data.json
  let merged = 0;
  for (const [iso2, data] of Object.entries(result)) {
    if (!cd[iso2]) cd[iso2] = {};
    Object.assign(cd[iso2], data);
    merged++;
  }

  fs.writeFileSync(CD_PATH, JSON.stringify(cd, null, 2), 'utf8');
  console.log(`\nMerged ${merged} Ember energy records into country-data.json`);
  console.log(`Total countries in file: ${Object.keys(cd).length}`);
}

main().catch(err => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
```

- [ ] **Step 4: Run the fetcher**

```
node scripts/fetch-ember.js
```

Expected output (approximately):
```
╔══════════════════════════════════════════════════╗
║  Ember Energy Mix Fetcher                        ║
╚══════════════════════════════════════════════════╝
Attempting Ember CSV…
  Parsed 90,000+ rows
  Built 150+ country records from Ember Global Electricity Review

Merged 150+ Ember energy records into country-data.json
Total countries in file: 297
```

If Ember URL fails, OWID fallback runs automatically.

- [ ] **Step 5: Run tests — expect all pass**

```
node --test tests/fetch-ember.test.js
```

Expected: all tests PASS.

- [ ] **Step 6: Run full test suite**

```
node --test tests/*.test.js
```

Expected: all 139+ tests PASS (new tests add to the count).

- [ ] **Step 7: Commit**

```bash
git add scripts/fetch-ember.js tests/fetch-ember.test.js public/country-data.json
git commit -m "feat: add Ember energy mix data — 5-source electricity breakdown + coal history"
```

---

## Task 3: `package.json` — add npm scripts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add fetch-whr and fetch-ember to scripts block**

In `package.json`, in the `"scripts"` object, add after `"fetch-imf"`:

```json
"fetch-whr": "node scripts/fetch-whr.js",
"fetch-ember": "node scripts/fetch-ember.js",
```

The scripts block should now include:
```json
"fetch-fred": "node scripts/fetch-fred.js",
"fetch-imf": "node scripts/fetch-imf.js",
"fetch-whr": "node scripts/fetch-whr.js",
"fetch-ember": "node scripts/fetch-ember.js",
"test": "node --test tests/*.test.js"
```

- [ ] **Step 2: Verify**

```
node --test tests/*.test.js
```

Expected: all tests still PASS.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add fetch-whr and fetch-ember npm scripts to package.json"
```

---

## Task 4: `public/app.js` — Happiness + Energy Mix panel sections

**Files:**
- Modify: `public/app.js` (lines ~4546, inside `_renderCountryPanel`)

Context: `_renderCountryPanel` builds `gaugeHtml` as a long concatenated string. The TI/FH section ends at approximately line 4546 (`: "") +`). We insert two new sections immediately after, before the OECD IIFE that follows.

- [ ] **Step 1: Locate the exact insertion point**

The TI/FH section ends with this exact text (find it):
```javascript
      : "") +
    // ── OECD Innovation & Labor ───────────────────────────────────────
    (function() {
```

- [ ] **Step 2: Insert Happiness + Energy Mix sections**

Replace:
```javascript
      : "") +
    // ── OECD Innovation & Labor ───────────────────────────────────────
    (function() {
```

With:
```javascript
      : "") +
    // ── Happiness (WHR 2024) ──────────────────────────────────────────
    (Number.isFinite(cd.whr_score)
      ? '<div class="cp-gauge-section-hdr">Happiness (WHR 2024)</div>' +
        '<div class="cp-gauge-row"><span class="cp-gauge-lbl">Happiness Rank</span><span class="cp-gauge-info">#' + cd.whr_rank + ' of 143</span></div>' +
        _cpGaugeRow('Happiness score',  cd.whr_score,      8.0, '', 'cp-green', '', '') +
        _cpGaugeRow('GDP contribution', cd.whr_gdp,        2.0, '', 'cp-blue',  '', '') +
        _cpGaugeRow('Social support',   cd.whr_social,     1.5, '', 'cp-blue',  '', '') +
        _cpGaugeRow('Life expectancy',  cd.whr_health,     1.0, '', '',          '', '') +
        _cpGaugeRow('Freedom',          cd.whr_freedom,    0.8, '', '',          '', '') +
        _cpGaugeRow('Generosity',       cd.whr_generosity, 0.5, '', 'cp-amber', '', '') +
        _cpGaugeRow('Low corruption',   cd.whr_corruption, 0.6, '', 'cp-green', '', '')
      : '') +
    // ── Energy Mix (Ember) ────────────────────────────────────────────
    (Number.isFinite(cd.energy_coal_pct)
      ? '<div class="cp-gauge-section-hdr">Energy Mix</div>' +
        _cpGaugeRow('Wind & Solar', cd.energy_wind_solar_pct, 100, '%', 'cp-green', '', '') +
        _cpGaugeRow('Hydro',        cd.energy_hydro_pct,      100, '%', 'cp-blue',  '', '') +
        _cpGaugeRow('Nuclear',      cd.energy_nuclear_pct,    100, '%', '',          '', '') +
        _cpGaugeRow('Gas',          cd.energy_gas_pct,        100, '%', 'cp-amber', '', '') +
        _cpGaugeRow('Coal',         cd.energy_coal_pct,       100, '%', 'cp-red',   '', '')
      : '') +
    // ── OECD Innovation & Labor ───────────────────────────────────────
    (function() {
```

- [ ] **Step 3: Run tests to confirm no regressions**

```
node --test tests/*.test.js
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add public/app.js
git commit -m "feat: add Happiness (WHR) and Energy Mix (Ember) sections to country panel"
```

---

## Task 5: `public/app.js` — Coal % trend tab

**Files:**
- Modify: `public/app.js` (two locations in `_buildTrendTabs` and `_switchTrendTab`)

- [ ] **Step 1: Add Coal % to `_buildTrendTabs`**

In `_buildTrendTabs`, the BEA section ends with:
```javascript
  if (hasBea) {
    tabs.push({ key:'bea_exports', label:'→ US Exp' });
    tabs.push({ key:'bea_imports', label:'← US Imp' });
  }

  var trendEl = document.getElementById('cp-trend');
```

Replace with:
```javascript
  if (hasBea) {
    tabs.push({ key:'bea_exports', label:'→ US Exp' });
    tabs.push({ key:'bea_imports', label:'← US Imp' });
  }

  // Ember: coal phase-out history
  if (cd.energy_coal_pct_history && cd.energy_coal_pct_history.length > 0) {
    tabs.push({ key: 'energy_coal_pct', label: 'Coal %' });
  }

  var trendEl = document.getElementById('cp-trend');
```

- [ ] **Step 2: Add `energy_coal_pct` label and color to `_switchTrendTab`**

In `_switchTrendTab`, `chartLabels` is defined as:
```javascript
  var chartLabels = {
    gdp_per_capita:     "GDP per capita (USD)",
    ...
    tax_revenue_history:"Tax revenue — central govt (% GDP)",
  };
```

Add one entry at the end of the `chartLabels` object, before the closing `};`:
```javascript
    tax_revenue_history:"Tax revenue — central govt (% GDP)",
    energy_coal_pct:    "Coal share of electricity (%)",
  };
```

- [ ] **Step 3: Add color for coal tab**

In `_switchTrendTab`, `var color = "#388bfd";` is on the line after `var isTimestamp = false;`. Add the coal color guard immediately after:

Replace:
```javascript
  var isTimestamp = false;
  var color = "#388bfd";

  if (key === 'ecb_bond_10y') {
```

With:
```javascript
  var isTimestamp = false;
  var color = "#388bfd";
  if (key === 'energy_coal_pct') color = '#8B4513';

  if (key === 'ecb_bond_10y') {
```

Note: `energy_coal_pct` data retrieval is handled automatically by the existing `else` branch at the end of `_switchTrendTab`:
```javascript
  } else {
    // World Bank / IMF annual format
    var raw = cd[key + '_history'];  // → cd['energy_coal_pct_history']
    if (raw && raw.length) {
      points = raw.map(function(r) { return { t: r[0], v: r[1] }; })
                  .filter(function(p) { return Number.isFinite(p.v); });
    }
  }
```

No additional code needed — `cd['energy_coal_pct_history']` is the exact field name stored.

- [ ] **Step 4: Run full test suite**

```
node --test tests/*.test.js
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add public/app.js
git commit -m "feat: add Coal % trend tab to country panel sparkline area"
```

---

## Task 6: Verify in browser + final commit

- [ ] **Step 1: Run full test suite**

```
node --test tests/*.test.js
```

Expected: all tests PASS (count should be 139 + new tests from Tasks 1 and 2).

- [ ] **Step 2: Manual browser verification checklist**

Start the dev server: `node server.js` (or `npm start`), open `http://localhost:3000`.

1. Click on **Finland** (FI) → country panel opens
   - Scroll down past TI/FH section
   - Confirm "Happiness (WHR 2024)" section appears with rank "#1 of 143" and 7 green/blue gauge rows
   - Confirm "Energy Mix" section appears with 5 colored gauge rows (Wind & Solar should be high for FI)
   - Click "Coal %" tab in the trend area → coal phase-out chart renders (FI should show declining trend)

2. Click on **Poland** (PL)
   - "Energy Mix" should show Coal gauge nearly full (PL is coal-heavy)
   - Coal % tab shows high flat or slow-declining line

3. Click on **Yemen** (YE) or another country likely absent from WHR
   - Happiness section should NOT appear (no `whr_score`)
   - Energy Mix may or may not appear depending on Ember coverage

- [ ] **Step 3: Push to GitHub**

```bash
git push origin main
```

---

## Self-Review

**Spec coverage check:**
- ✅ `fetch-whr.js` — downloads WHR 2024 XLS, merges 9 fields into country-data.json
- ✅ `fetch-ember.js` — downloads Ember CSV with OWID fallback, merges 7 fields including history
- ✅ Panel: Happiness section with rank header + 7 gauge rows (score + 6 factors)
- ✅ Panel: Energy Mix section with 5 gauge rows
- ✅ Trend tab: Coal % sparkline using existing IYChart pipeline
- ✅ Tests: unit tests for name matching + history logic; integration tests for output shape
- ✅ package.json: `fetch-whr` and `fetch-ember` scripts added
- ✅ Both sections conditional (hidden when data absent — `Number.isFinite()` guard)

**Type consistency check:**
- `energy_coal_pct_history` — stored in country-data.json, referenced in `_buildTrendTabs` and read by `cd[key + '_history']` in `_switchTrendTab` ✓
- `whr_rank` — stored as integer, rendered as string in template with `#` prefix ✓
- `_cpGaugeRow(label, val, max, suffix, cls, wbKey, iso2)` — passing `''` for last two args = non-clickable row ✓

**Placeholder scan:** No TBDs, no "handle edge cases" — all steps have concrete code. ✓
