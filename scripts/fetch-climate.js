#!/usr/bin/env node
/**
 * fetch-climate.js
 * Fetches 10-year climate normals (2014–2023) from Open-Meteo ERA5 archive for
 * cities that are missing climate data in cities-full.json (pop > 100k).
 *
 * Output: public/climate-extra.json — keyed by QID, same schema as
 * cities-full.json climate.months (high_c, low_c, mean_c, precipitation_mm,
 * sunshine_hours per month), plus derived annual summaries.
 *
 * Source: Open-Meteo Historical Weather API (ERA5 reanalysis) — free, no API key
 *   https://open-meteo.com/en/docs/historical-weather-api
 *
 * Usage:
 *   node scripts/fetch-climate.js             (pop > 100k, ~400 cities, ~5 min)
 *   node scripts/fetch-climate.js --big-only  (pop > 500k only, ~200 cities, ~2 min)
 */
'use strict';

const fs   = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');

const CITIES_PATH = path.join(__dirname, '../public/cities-full.json');
const OUTPUT_PATH = path.join(__dirname, '../public/climate-extra.json');
const BIG_ONLY    = process.argv.includes('--big-only');
const POP_MIN     = BIG_ONLY ? 500_000 : 100_000;

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Open-Meteo ERA5 archive endpoint
const API_BASE = 'https://archive-api.open-meteo.com/v1/archive';

async function fetchClimate(lat, lng, retries = 3) {
  const params = new URLSearchParams({
    latitude:   lat.toFixed(4),
    longitude:  lng.toFixed(4),
    start_date: '2014-01-01',
    end_date:   '2023-12-31',
    daily:      'temperature_2m_max,temperature_2m_min,precipitation_sum,sunshine_duration',
    timezone:   'UTC',
  });
  const url = `${API_BASE}?${params}`;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (res.ok) return res.json();
    if (res.status === 429 && attempt < retries) {
      const wait = attempt * 5_000; // 5s, 10s backoff
      process.stdout.write(`[429 retry ${attempt}/${retries} wait ${wait/1000}s] `);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    throw new Error(`HTTP ${res.status}`);
  }
}

function aggregateMonthly(json) {
  // json.daily.time = ['2014-01-01', ...], json.daily.temperature_2m_max = [...]
  const { time, temperature_2m_max: tmax, temperature_2m_min: tmin,
          precipitation_sum: precip, sunshine_duration: sunshine } = json.daily;
  if (!time?.length) return null;

  // Accumulate by month index (0–11)
  const acc = Array.from({ length: 12 }, () => ({
    sumHigh: 0, sumLow: 0, sumMean: 0, sumPrecip: 0, sumSunshine: 0, count: 0,
  }));

  for (let i = 0; i < time.length; i++) {
    const mo = parseInt(time[i].slice(5, 7), 10) - 1; // 0-based month
    const hi = tmax?.[i], lo = tmin?.[i], pr = precip?.[i], su = sunshine?.[i];
    if (hi == null || lo == null) continue;
    acc[mo].sumHigh    += hi;
    acc[mo].sumLow     += lo;
    acc[mo].sumMean    += (hi + lo) / 2;
    acc[mo].sumPrecip  += pr ?? 0;
    acc[mo].sumSunshine += (su ?? 0) / 3600; // seconds → hours
    acc[mo].count++;
  }

  const months = acc.map((a, i) => {
    if (a.count === 0) return null;
    const days = a.count / 10; // 10 years
    return {
      month:            MONTH_NAMES[i],
      high_c:           +(a.sumHigh    / a.count).toFixed(1),
      low_c:            +(a.sumLow     / a.count).toFixed(1),
      mean_c:           +(a.sumMean    / a.count).toFixed(1),
      precipitation_mm: +(a.sumPrecip  / (a.count / days)).toFixed(1),
      sun:              +(a.sumSunshine / (a.count / days)).toFixed(1),
    };
  }).filter(Boolean);

  if (months.length < 12) return null;

  // Derive annual summaries
  const annualAvgTemp   = +(months.reduce((s, m) => s + m.mean_c, 0) / 12).toFixed(1);
  const annualPrecipMm  = +months.reduce((s, m) => s + m.precipitation_mm, 0).toFixed(0);
  const annualSunHours  = +months.reduce((s, m) => s + m.sun, 0).toFixed(0); // m.sun = monthly total hrs
  const hottestMonth    = months.reduce((a, b) => a.mean_c > b.mean_c ? a : b);
  const coldestMonth    = months.reduce((a, b) => a.mean_c < b.mean_c ? a : b);

  return {
    months,
    annualAvgTemp,
    annualPrecipMm,
    annualSunHours,
    hottestMonth:  hottestMonth.month,
    hottestTempC:  hottestMonth.mean_c,
    coldestMonth:  coldestMonth.month,
    coldestTempC:  coldestMonth.mean_c,
    source: 'Open-Meteo ERA5 2014–2023',
  };
}

async function main() {
  const citiesArr = JSON.parse(fs.readFileSync(CITIES_PATH, 'utf8'));

  // Load existing output to resume interrupted runs
  const existing = fs.existsSync(OUTPUT_PATH)
    ? JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8')) : {};

  const targets = citiesArr.filter(c =>
    (c.pop || 0) >= POP_MIN &&
    !c.climate?.months?.length &&
    !existing[c.qid] &&
    c.lat != null && c.lng != null
  ).sort((a, b) => (b.pop || 0) - (a.pop || 0));

  console.log(`Cities to fetch (pop ≥ ${POP_MIN.toLocaleString()}, no existing climate): ${targets.length}`);
  if (!targets.length) {
    console.log('Nothing to do — all target cities already have climate data.');
    return;
  }

  let done = 0, failed = 0;

  for (const city of targets) {
    const label = `${city.name} (${city.iso})`.padEnd(30);
    try {
      const json = await fetchClimate(city.lat, city.lng);
      const climate = aggregateMonthly(json);
      if (!climate) { console.log(`  ${label} — no data`); failed++; continue; }

      existing[city.qid] = climate;
      done++;
      console.log(`  ${label} avg=${climate.annualAvgTemp}°C  precip=${climate.annualPrecipMm}mm  sun=${climate.annualSunHours}h`);

      // Save every 10 cities so we can resume if interrupted
      if (done % 10 === 0) atomicWrite(OUTPUT_PATH, JSON.stringify(existing));

    } catch (e) {
      console.log(`  ${label} FAILED: ${e.message}`);
      failed++;
    }

    // Respect Open-Meteo free tier rate limit (~1 req per 2s)
    await new Promise(r => setTimeout(r, 2_000));
  }

  atomicWrite(OUTPUT_PATH, JSON.stringify(existing));
  console.log(`\nDone — ${done} fetched, ${failed} failed`);
  console.log(`Total in climate-extra.json: ${Object.keys(existing).length} cities`);
}

main().catch(e => { console.error(e); process.exit(1); });
