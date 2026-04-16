#!/usr/bin/env node
/**
 * fetch-japan-stats.js
 * Downloads Japan Cabinet Office prefectural income/GDP data and matches
 * Japanese cities in our dataset to their prefecture's economic statistics.
 *
 * Source: Cabinet Office of Japan — Prefectural Accounts (県民経済計算)
 * https://www.esri.cao.go.jp/jp/sna/data/data_list/kenmin/files/contents/main_2022.html
 *
 * Output: public/japan-prefectures.json
 *   keyed by prefecture name (English), containing per-capita income and GDP data
 *
 * Usage:
 *   node scripts/fetch-japan-stats.js
 */

const fs   = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');
const XLSX = require('xlsx');

const CITIES_PATH = path.join(__dirname, '../public/cities-full.json');
const OUTPUT_PATH = path.join(__dirname, '../public/japan-prefectures.json');

// Cabinet Office base URL for 2022 prefectural accounts
const BASE = 'https://www.esri.cao.go.jp/jp/sna/data/data_list/kenmin/files/contents/tables/2022/';

// Prefecture Japanese → English name mapping
const JP_PREF_EN = {
  '北海道':'Hokkaido','青森県':'Aomori','岩手県':'Iwate','宮城県':'Miyagi',
  '秋田県':'Akita','山形県':'Yamagata','福島県':'Fukushima','茨城県':'Ibaraki',
  '栃木県':'Tochigi','群馬県':'Gunma','埼玉県':'Saitama','千葉県':'Chiba',
  '東京都':'Tokyo','神奈川県':'Kanagawa','新潟県':'Niigata','富山県':'Toyama',
  '石川県':'Ishikawa','福井県':'Fukui','山梨県':'Yamanashi','長野県':'Nagano',
  '岐阜県':'Gifu','静岡県':'Shizuoka','愛知県':'Aichi','三重県':'Mie',
  '滋賀県':'Shiga','京都府':'Kyoto','大阪府':'Osaka','兵庫県':'Hyogo',
  '奈良県':'Nara','和歌山県':'Wakayama','鳥取県':'Tottori','島根県':'Shimane',
  '岡山県':'Okayama','広島県':'Hiroshima','山口県':'Yamaguchi','徳島県':'Tokushima',
  '香川県':'Kagawa','愛媛県':'Ehime','高知県':'Kochi','福岡県':'Fukuoka',
  '佐賀県':'Saga','長崎県':'Nagasaki','熊本県':'Kumamoto','大分県':'Oita',
  '宮崎県':'Miyazaki','鹿児島県':'Kagoshima','沖縄県':'Okinawa',
  // Also handle short forms
  '北海道':'Hokkaido','東京':'Tokyo','大阪':'Osaka','京都':'Kyoto',
};

// English → Japanese prefecture name (for matching our admin field)
// Our cities have admin like "Kanagawa Prefecture" or "Osaka" or "Tokyo"
const PREF_VARIANTS = {
  'Hokkaido Prefecture':'Hokkaido','Aomori Prefecture':'Aomori','Iwate Prefecture':'Iwate',
  'Miyagi Prefecture':'Miyagi','Akita Prefecture':'Akita','Yamagata Prefecture':'Yamagata',
  'Fukushima Prefecture':'Fukushima','Ibaraki Prefecture':'Ibaraki','Tochigi Prefecture':'Tochigi',
  'Gunma Prefecture':'Gunma','Saitama Prefecture':'Saitama','Chiba Prefecture':'Chiba',
  'Tokyo':'Tokyo','Tokyo Metropolis':'Tokyo','Tokyo Prefecture':'Tokyo',
  'Kanagawa Prefecture':'Kanagawa','Niigata Prefecture':'Niigata','Toyama Prefecture':'Toyama',
  'Ishikawa Prefecture':'Ishikawa','Fukui Prefecture':'Fukui','Yamanashi Prefecture':'Yamanashi',
  'Nagano Prefecture':'Nagano','Gifu Prefecture':'Gifu','Shizuoka Prefecture':'Shizuoka',
  'Aichi Prefecture':'Aichi','Mie Prefecture':'Mie','Shiga Prefecture':'Shiga',
  'Kyoto Prefecture':'Kyoto','Kyoto':'Kyoto','Osaka Prefecture':'Osaka','Osaka':'Osaka',
  'Hyogo Prefecture':'Hyogo','Nara Prefecture':'Nara','Wakayama Prefecture':'Wakayama',
  'Tottori Prefecture':'Tottori','Shimane Prefecture':'Shimane','Okayama Prefecture':'Okayama',
  'Hiroshima Prefecture':'Hiroshima','Yamaguchi Prefecture':'Yamaguchi','Tokushima Prefecture':'Tokushima',
  'Kagawa Prefecture':'Kagawa','Ehime Prefecture':'Ehime','Kochi Prefecture':'Kochi',
  'Fukuoka Prefecture':'Fukuoka','Saga Prefecture':'Saga','Nagasaki Prefecture':'Nagasaki',
  'Kumamoto Prefecture':'Kumamoto','Oita Prefecture':'Oita','Miyazaki Prefecture':'Miyazaki',
  'Kagoshima Prefecture':'Kagoshima','Okinawa Prefecture':'Okinawa',
};

async function downloadXlsx(filename) {
  const url = BASE + filename;
  console.log(`  Downloading ${filename}…`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = await res.arrayBuffer();
  return XLSX.read(buf, { type: 'array' });
}

async function main() {
  // soukatu7.xlsx = Per capita prefectural income (一人当たり県民所得)
  // This file has rows: prefecture name, years as columns
  const wb7 = await downloadXlsx('soukatu7.xlsx');
  const ws7  = wb7.Sheets[wb7.SheetNames[0]];
  const rows7 = XLSX.utils.sheet_to_json(ws7, { header: 1, defval: null });

  // Debug: show first 10 rows
  console.log('First rows of soukatu7:');
  for (let i = 0; i < Math.min(10, rows7.length); i++) {
    console.log('  row', i, ':', rows7[i]?.slice(0, 8));
  }

  // soukatu1.xlsx = Gross prefectural product (県内総生産) at market prices
  const wb1 = await downloadXlsx('soukatu1.xlsx');
  const ws1  = wb1.Sheets[wb1.SheetNames[0]];
  const rows1 = XLSX.utils.sheet_to_json(ws1, { header: 1, defval: null });

  console.log('\nFirst rows of soukatu1:');
  for (let i = 0; i < Math.min(10, rows1.length); i++) {
    console.log('  row', i, ':', rows1[i]?.slice(0, 8));
  }

  // Parse per-capita income (soukatu7)
  // Expected format: header rows with years, then prefecture rows
  const perCapitaByPref = {};
  let yearCols7 = null;
  for (const row of rows7) {
    if (!row) continue;
    const firstCell = String(row[0] || '').trim();

    // Find year header row (contains 4-digit years)
    if (!yearCols7) {
      const potentialYears = row.map(c => {
        const n = parseInt(String(c || '').trim(), 10);
        return n >= 2000 && n <= 2030 ? n : null;
      });
      if (potentialYears.filter(Boolean).length >= 5) {
        yearCols7 = potentialYears;
        console.log('\nFound year columns in soukatu7:', yearCols7.filter(Boolean));
        continue;
      }
    }

    // Prefecture data rows
    if (yearCols7) {
      // Prefecture code is in col 0, name in col 1
      const jpNameRaw = String(row[1] || row[0] || '').trim().replace(/[　\s]+/g, '');
      const jpName = jpNameRaw;
      const enName = JP_PREF_EN[jpName] || JP_PREF_EN[jpName + '県'] || JP_PREF_EN[jpName + '府'] || JP_PREF_EN[jpName + '都'];
      if (!enName) continue;

      const byYear = {};
      for (let i = 0; i < row.length; i++) {
        const yr = yearCols7[i];
        if (!yr) continue;
        const val = parseFloat(String(row[i] || '').replace(/,/g, ''));
        if (!isNaN(val) && val > 0) byYear[yr] = Math.round(val * 1000); // thousands yen → yen
      }
      if (Object.keys(byYear).length > 0) {
        perCapitaByPref[enName] = byYear;
      }
    }
  }

  // Parse gross prefectural product (soukatu1) — in 100M yen
  const gdpByPref = {};
  let yearCols1 = null;
  for (const row of rows1) {
    if (!row) continue;
    const firstCell = String(row[0] || '').trim();
    if (!yearCols1) {
      const potentialYears = row.map(c => {
        const n = parseInt(String(c || '').trim(), 10);
        return n >= 2000 && n <= 2030 ? n : null;
      });
      if (potentialYears.filter(Boolean).length >= 5) {
        yearCols1 = potentialYears;
        continue;
      }
    }
    if (yearCols1) {
      const jpNameRaw = String(row[1] || row[0] || '').trim().replace(/[　\s]+/g, '');
      const enName = JP_PREF_EN[jpNameRaw] || JP_PREF_EN[jpNameRaw + '県'] || JP_PREF_EN[jpNameRaw + '府'] || JP_PREF_EN[jpNameRaw + '都'];
      if (!enName) continue;
      const byYear = {};
      for (let i = 0; i < row.length; i++) {
        const yr = yearCols1[i];
        if (!yr) continue;
        const val = parseFloat(String(row[i] || '').replace(/,/g, ''));
        if (!isNaN(val) && val > 0) byYear[yr] = Math.round(val * 1e6); // 百万円 → yen
      }
      if (Object.keys(byYear).length > 0) gdpByPref[enName] = byYear;
    }
  }

  console.log('\nPrefectures with per-capita income:', Object.keys(perCapitaByPref).length);
  console.log('Sample (Tokyo):', JSON.stringify(perCapitaByPref['Tokyo'])?.slice(0, 100));
  console.log('Prefectures with GDP:', Object.keys(gdpByPref).length);

  // Build output: keyed by English prefecture name
  const output = {};
  const allPrefs = new Set([...Object.keys(perCapitaByPref), ...Object.keys(gdpByPref)]);
  for (const pref of allPrefs) {
    const income = perCapitaByPref[pref];
    const gdp    = gdpByPref[pref];
    // Latest year available
    const latestIncome = income ? Math.max(...Object.keys(income).map(Number)) : null;
    const latestGdp    = gdp    ? Math.max(...Object.keys(gdp).map(Number))    : null;
    output[pref] = {
      perCapitaIncomeJpy:        latestIncome ? income[latestIncome] : null,
      perCapitaIncomeYear:       latestIncome,
      perCapitaIncomeHistory:    income ? Object.entries(income).map(([y,v])=>[+y,v]).sort((a,b)=>a[0]-b[0]) : null,
      gdpJpy:                    latestGdp ? gdp[latestGdp] : null,
      gdpYear:                   latestGdp,
      gdpHistory:                gdp ? Object.entries(gdp).map(([y,v])=>[+y,v]).sort((a,b)=>a[0]-b[0]) : null,
    };
  }

  atomicWrite(OUTPUT_PATH, JSON.stringify(output));
  console.log(`\nWrote ${Object.keys(output).length} prefectures to ${OUTPUT_PATH}`);
}

main().catch(e => { console.error(e); process.exit(1); });
