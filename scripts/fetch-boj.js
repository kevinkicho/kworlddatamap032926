#!/usr/bin/env node
/**
 * scripts/fetch-boj.js
 *
 * Fetches Japanese Government Bond (JGB) yield curve data from the
 * Ministry of Finance (MoF) Japan — the official publisher of JGB yields.
 *
 * Sources (three CSVs are merged for full coverage):
 *   1. English historical (1974–Dec 2025):
 *      https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/historical/jgbcme_all.csv
 *   2. Japanese full history (1974–Mar 2026, Reiwa era dates):
 *      https://www.mof.go.jp/jgbs/reference/interest_rate/data/jgbcm_all.csv
 *   3. English current month (Apr 2026 onward):
 *      https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/jgbcme.csv
 *
 * The Japanese CSV is used to fill the gap between the English historical
 * cutoff and the current English monthly file.  Reiwa era dates (R8.1.5 etc.)
 * are converted to ISO dates.
 *
 * Frequency: daily (we compute last-trading-day-of-month for history)
 * Tenors: 1Y, 2Y, 3Y, 4Y, 5Y, 6Y, 7Y, 8Y, 9Y, 10Y, 15Y, 20Y, 25Y, 30Y, 40Y
 *
 * Note on BoJ API (stat-search.boj.or.jp/api/v1):
 *   The BoJ launched a JSON API in February 2026. It covers monetary policy,
 *   money supply, FX rates, call money markets etc. — but NOT the JGB yield
 *   curve (those are MoF data, published at mof.go.jp).
 *
 * Output: public/boj-yields.json
 *   {
 *     "JP": {
 *       bond_yield_10y, bond_yield_10y_date, bond_yield_10y_history,
 *       bond_yield_2y,  bond_yield_2y_date,
 *       bond_yield_5y,  bond_yield_5y_date
 *     }
 *   }
 *
 * Usage:
 *   node scripts/fetch-boj.js
 */

'use strict';

const fs   = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');

// English historical ends at Dec 2025; English current = this month only
const MOF_HISTORY_EN_URL = 'https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/historical/jgbcme_all.csv';
const MOF_CURRENT_EN_URL = 'https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/jgbcme.csv';
// Japanese full history (updated more frequently; dates in Reiwa era format)
const MOF_HISTORY_JA_URL = 'https://www.mof.go.jp/jgbs/reference/interest_rate/data/jgbcm_all.csv';

const OUT_FILE         = path.join(__dirname, '..', 'public', 'boj-yields.json');
const HISTORY_MONTHS   = 60; // 5 years

// Reiwa era started 2019-05-01 (R1); R1=2019, R2=2020 … R8=2026
const REIWA_BASE_YEAR = 2018; // offset: Rn year = REIWA_BASE_YEAR + n

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'WorldDataMap/1.0 (educational; nodejs)' },
    signal:  AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.text();
}

/**
 * Convert Reiwa era date string (e.g. "R8.3.31") to ISO date "2026-03-31".
 * Also handles Heisei (H) and Showa (S) if needed, though JGB data only
 * goes back to 1974 (Showa 49).
 *   Showa base: S1 = 1926  → year = 1925 + n
 *   Heisei base: H1 = 1989 → year = 1988 + n
 *   Reiwa base:  R1 = 2019 → year = 2018 + n
 */
function convertJpEraDate(dateStr) {
  const m = dateStr.match(/^([SHR])(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  const [, era, yearStr, monthStr, dayStr] = m;
  const n = parseInt(yearStr, 10);
  let year;
  if (era === 'R') year = 2018 + n;
  else if (era === 'H') year = 1988 + n;
  else if (era === 'S') year = 1925 + n;
  else return null;
  const mm = monthStr.padStart(2, '0');
  const dd = dayStr.padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/**
 * Parse the MoF JGB CSV format (English version):
 *   Line 0: header like "Interest Rate (Month Year)"
 *   Line 1: "Date,1Y,2Y,...,10Y,...,40Y"
 *   Lines 2+: "YYYY/MM/DD,val,val,...,-,-,..."
 *
 * Returns array of { date: 'YYYY-MM-DD', tenors: { '1Y': num, '2Y': num, ... } }
 */
function parseMofCsvEn(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // Find the header line (starts with "Date")
  const headerIdx = lines.findIndex(l => l.startsWith('Date'));
  if (headerIdx === -1) throw new Error('English CSV header row not found');

  // Map header names: "1Y", "2Y", ... "10Y" etc.
  const rawHeaders = lines[headerIdx].split(',');
  const rows = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (!cols[0] || !cols[0].match(/^\d{4}\/\d{1,2}\/\d{1,2}$/)) continue;

    // Normalize to YYYY-MM-DD (pad month/day)
    const [y, m, d] = cols[0].split('/');
    const date = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    const tenors = {};
    for (let j = 1; j < rawHeaders.length; j++) {
      const key = rawHeaders[j].trim();
      const raw = (cols[j] || '').trim();
      if (raw !== '-' && raw !== '' && !isNaN(raw)) {
        tenors[key] = parseFloat(parseFloat(raw).toFixed(3));
      }
    }
    rows.push({ date, tenors });
  }

  return rows;
}

/**
 * Parse the MoF JGB CSV format (Japanese version with era dates):
 *   Header: Japanese text with era info
 *   Column headers: "日付,1年,2年,...,10年,...,40年"  (but may vary; use position)
 *   Data rows: "R8.3.31,val,val,...,..."
 *
 * Tenor positions are the same as English (1Y=col1, 2Y=col2, ..., 10Y=col10 etc.)
 * We identify tenor by column position matching the standard order.
 */
const TENOR_ORDER = ['1Y','2Y','3Y','4Y','5Y','6Y','7Y','8Y','9Y','10Y','15Y','20Y','25Y','30Y','40Y'];

function parseMofCsvJa(text) {
  // File is Shift-JIS encoded but we read as binary → treat as latin1
  // Just find the data rows by pattern: start with era letter
  const lines = text.split('\n');
  const rows = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line.match(/^[SHR]\d+\.\d+\.\d+,/)) continue;
    const cols = line.split(',');
    const date = convertJpEraDate(cols[0]);
    if (!date) continue;
    const tenors = {};
    for (let j = 1; j < cols.length && j - 1 < TENOR_ORDER.length; j++) {
      const raw = (cols[j] || '').trim();
      if (raw !== '-' && raw !== '' && !isNaN(raw)) {
        tenors[TENOR_ORDER[j - 1]] = parseFloat(parseFloat(raw).toFixed(3));
      }
    }
    rows.push({ date, tenors });
  }

  return rows;
}

/**
 * Given daily rows, produce last-trading-day-of-each-month values.
 * Returns array of [YYYY-MM, value] pairs for the requested tenor.
 */
function toMonthlyLastDay(rows, tenor) {
  // Group rows by YYYY-MM, keep the last entry in each group
  const byMonth = new Map();
  for (const row of rows) {
    const ym = row.date.slice(0, 7);
    const val = row.tenors[tenor];
    if (val !== undefined) {
      byMonth.set(ym, val); // later rows overwrite — gives last trading day
    }
  }
  return [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║   BoJ / MoF JGB Yield Fetcher                         ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log(`Source  : MoF Japan JGB yield curve CSV`);
  console.log(`Output  : ${OUT_FILE}\n`);

  // ── 1. Fetch English historical data (1974–Dec 2025) ─────────────────────
  process.stdout.write('  Fetching English historical CSV (1974–Dec 2025) … ');
  const histEnText = await fetchText(MOF_HISTORY_EN_URL);
  const histEnRows = parseMofCsvEn(histEnText);
  console.log(`${histEnRows.length} daily rows`);

  // ── 2. Fetch Japanese historical data (1974–most recent month) ────────────
  //    The Japanese version is more up-to-date but uses Reiwa era dates.
  process.stdout.write('  Fetching Japanese historical CSV (era dates) … ');
  const histJaText = await fetchText(MOF_HISTORY_JA_URL);
  const histJaRows = parseMofCsvJa(histJaText);
  console.log(`${histJaRows.length} daily rows`);

  // ── 3. Fetch English current-month data ────────────────────────────────────
  process.stdout.write('  Fetching English current-month CSV … ');
  const currText = await fetchText(MOF_CURRENT_EN_URL);
  const currRows = parseMofCsvEn(currText);
  console.log(`${currRows.length} daily rows`);

  // ── Merge all sources (deduplicate by date; later sources win for same date) ─
  const allRowsMap = new Map();
  for (const row of [...histEnRows, ...histJaRows, ...currRows]) {
    allRowsMap.set(row.date, row);
  }
  const allRows = [...allRowsMap.values()].sort((a, b) => a.date.localeCompare(b.date));
  console.log(`  Total  : ${allRows.length} unique daily rows`);

  // ── 3. Compute monthly series (last-day-of-month per tenor) ───────────────
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - HISTORY_MONTHS);
  const cutoffStr = cutoff.toISOString().slice(0, 7); // YYYY-MM

  const allMonthly10y = toMonthlyLastDay(allRows, '10Y');
  const allMonthly2y  = toMonthlyLastDay(allRows, '2Y');
  const allMonthly5y  = toMonthlyLastDay(allRows, '5Y');

  // Slice to last 5 years for history
  const history10y = allMonthly10y.filter(([ym]) => ym >= cutoffStr);
  const history2y  = allMonthly2y.filter(([ym]) => ym >= cutoffStr);
  const history5y  = allMonthly5y.filter(([ym]) => ym >= cutoffStr);

  if (!history10y.length) throw new Error('No 10Y data found — check CSV format');

  // Latest values
  const [latest10yDate, latest10yVal] = history10y[history10y.length - 1];
  const [latest2yDate,  latest2yVal]  = history2y.length  ? history2y[history2y.length - 1]  : [null, null];
  const [latest5yDate,  latest5yVal]  = history5y.length  ? history5y[history5y.length - 1]  : [null, null];

  console.log(`\n  JP  10Y yield : ${latest10yVal}%  (${latest10yDate}, ${history10y.length} months)`);
  if (latest2yVal  !== null) console.log(`       2Y yield : ${latest2yVal}%  (${latest2yDate})`);
  if (latest5yVal  !== null) console.log(`       5Y yield : ${latest5yVal}%  (${latest5yDate})`);

  // ── 4. Build output ────────────────────────────────────────────────────────
  const out = {
    JP: {
      bond_yield_10y:         latest10yVal,
      bond_yield_10y_date:    latest10yDate,
      bond_yield_10y_history: history10y,
    },
  };
  if (latest2yVal !== null) {
    out.JP.bond_yield_2y      = latest2yVal;
    out.JP.bond_yield_2y_date = latest2yDate;
  }
  if (latest5yVal !== null) {
    out.JP.bond_yield_5y      = latest5yVal;
    out.JP.bond_yield_5y_date = latest5yDate;
  }

  // ── 5. Save ────────────────────────────────────────────────────────────────
  atomicWrite(OUT_FILE, JSON.stringify(out, null, 2), 'utf8');
  const sizeKB = (fs.statSync(OUT_FILE).size / 1024).toFixed(1);

  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║   Complete                                            ║');
  console.log('╠═══════════════════════════════════════════════════════╣');
  console.log(`  JP 10Y: ${latest10yVal}%  as of ${latest10yDate}`);
  console.log(`  File  : ${sizeKB} KB → ${OUT_FILE}`);
  console.log('╚═══════════════════════════════════════════════════════╝');
}

main().catch(err => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
