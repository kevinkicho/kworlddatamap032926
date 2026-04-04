#!/usr/bin/env node
/**
 * scripts/fetch-hdi.js
 *
 * Fetches the UNDP Human Development Index (HDI) time-series CSV from the
 * official Human Development Reports data centre (free, no API key).
 *
 * Adds to public/country-data.json:
 *   hdi            — composite score 0–1 (higher = better)
 *   hdi_rank       — global rank (1 = highest)
 *   hdi_year       — year of estimate
 *
 * Country matching: UNDP uses ISO3 codes.  We map ISO3 → ISO2 using the
 * World Bank country list (same as other fetch scripts).
 *
 * Usage: node scripts/fetch-hdi.js
 * Runtime: ~15 seconds
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const OUT_FILE = path.join(__dirname, '..', 'public', 'country-data.json');

// UNDP publishes yearly composite indices as a CSV.
// The URL below is the 2023–24 Human Development Report composite indices file.
// If this 404s in the future, find the latest at:
//   https://hdr.undp.org/data-center/documentation-and-downloads
const HDI_CSV_URL =
  'https://hdr.undp.org/sites/default/files/2023-24_HDR/HDR23-24_Composite_indices_complete_time_series.csv';

// World Bank ISO3 → ISO2 map endpoint
const WB_COUNTRIES_URL = 'https://api.worldbank.org/v2/country?format=json&per_page=400';

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'WorldDataMap-HDIFetcher/1.0 (educational; nodejs)' },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.text();
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'WorldDataMap-HDIFetcher/1.0 (educational; nodejs)' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Simple CSV parser: handles quoted fields with commas
function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const header = splitCSVRow(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = splitCSVRow(lines[i]);
    const row = {};
    header.forEach((h, idx) => { row[h.trim()] = (vals[idx] || '').trim(); });
    rows.push(row);
  }
  return rows;
}

function splitCSVRow(line) {
  const out = []; let cur = ''; let inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { out.push(cur); cur = ''; }
    else { cur += ch; }
  }
  out.push(cur);
  return out;
}

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  UNDP Human Development Index fetcher    ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // Build ISO3 → ISO2 map from World Bank
  process.stdout.write('Building ISO3 → ISO2 map … ');
  const wbJson = await fetchJson(WB_COUNTRIES_URL);
  const iso3toIso2 = {};
  for (const c of wbJson[1] ?? []) {
    if (c.id && c.iso2Code) iso3toIso2[c.id.toUpperCase()] = c.iso2Code.toUpperCase();
  }
  console.log(`${Object.keys(iso3toIso2).length} entries`);

  // Download UNDP CSV
  process.stdout.write('Downloading UNDP HDI CSV … ');
  const csv = await fetchText(HDI_CSV_URL);
  const rows = parseCSV(csv);
  console.log(`${rows.length} rows`);

  // HDI column names in the UNDP CSV: "hdi_2022", "hdi_2021", etc.
  // Find the most recent year column (hdi_YYYY with highest YYYY)
  const sampleRow = rows[0] || {};
  const hdiCols = Object.keys(sampleRow)
    .filter(k => /^hdi_\d{4}$/.test(k))
    .sort((a, b) => parseInt(b.split('_')[1]) - parseInt(a.split('_')[1]));
  const latestHdiCol = hdiCols[0];
  const latestYear   = parseInt(latestHdiCol.split('_')[1]);
  console.log(`Most recent HDI column: ${latestHdiCol} (${latestYear})`);

  // Build HDI map: iso3 → { hdi, rank (we compute from sorted values) }
  const hdiMap = {};
  for (const row of rows) {
    const iso3 = (row['iso3'] || row['ISO3'] || row['country'] || '').toUpperCase().trim();
    if (!iso3 || iso3.length !== 3) continue;
    const raw = row[latestHdiCol];
    if (!raw || raw === '..' || raw === '') continue;
    const val = parseFloat(raw);
    if (!isFinite(val)) continue;
    hdiMap[iso3] = val;
  }

  // Sort to compute ranks
  const sorted = Object.entries(hdiMap).sort((a, b) => b[1] - a[1]);
  const hdiRanks = {};
  sorted.forEach(([iso3], i) => { hdiRanks[iso3] = i + 1; });

  // Apply to country-data.json
  const out = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
  let filled = 0, unmatched = 0;
  for (const [iso3, val] of Object.entries(hdiMap)) {
    const iso2 = iso3toIso2[iso3];
    if (!iso2) { unmatched++; continue; }
    if (!out[iso2]) out[iso2] = {};
    out[iso2].hdi      = parseFloat(val.toFixed(3));
    out[iso2].hdi_rank = hdiRanks[iso3];
    out[iso2].hdi_year = latestYear;
    filled++;
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), 'utf8');
  console.log(`\n✓ HDI added for ${filled} countries  (${unmatched} ISO3 unmatched)`);
  console.log(`  Written to ${OUT_FILE}`);
}

main().catch(e => { console.error(e); process.exit(1); });
