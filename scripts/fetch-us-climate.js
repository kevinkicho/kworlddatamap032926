#!/usr/bin/env node
/**
 * fetch-us-climate.js
 * Re-fetches Wikipedia wikitext for US cities that have no climate data and
 * patches cities-full.json in-place.
 *
 * The main fetch-city-infoboxes.js script only looked for Celsius weather box
 * fields ("Jan high C") but US Wikipedia articles use Fahrenheit ("Jan high F").
 * This script adds F→C conversion and re-processes only US cities.
 *
 * Usage:
 *   node scripts/fetch-us-climate.js
 */

'use strict';

const https   = require('https');
const http    = require('http');
const fs      = require('fs');
const path    = require('path');
const { URL } = require('url');

const OUT_FILE   = path.join(__dirname, '..', 'public', 'cities-full.json');
const BATCH_SIZE = 50;
const DELAY_MS   = 1200;
const UA = 'kworlddatamap/2.0 (educational; us-climate-patch)';

function httpGet(urlStr) {
  return new Promise((resolve, reject) => {
    const p   = new URL(urlStr);
    const lib = p.protocol === 'http:' ? http : https;
    lib.get({ hostname: p.hostname, path: p.pathname + p.search,
      headers: { 'User-Agent': UA, Accept: 'application/json' } }, res => {
      if ([301,302,303,307,308].includes(res.statusCode)) {
        const loc = res.headers.location || '';
        const next = loc.startsWith('http') ? loc : new URL(loc, urlStr).href;
        res.resume();
        return httpGet(next).then(resolve, reject);
      }
      const c = []; res.on('data', d => c.push(d));
      res.on('end', () => resolve(Buffer.concat(c).toString('utf8')));
      res.on('error', reject);
    }).on('error', reject);
  });
}
const delay = ms => new Promise(r => setTimeout(r, ms));

// ── Wikidata: QIDs → Wikipedia titles ─────────────────────────────────────────
async function fetchWikiTitles(qids) {
  const params = new URLSearchParams({
    action: 'wbgetentities', ids: qids.join('|'),
    props: 'sitelinks', sitefilter: 'enwiki',
    format: 'json', formatversion: '2',
  });
  const raw  = await httpGet(`https://www.wikidata.org/w/api.php?${params}`);
  const data = JSON.parse(raw);
  const out  = {};
  for (const [qid, entity] of Object.entries(data.entities || {})) {
    const title = entity.sitelinks?.enwiki?.title;
    if (title) out[qid] = title;
  }
  return out;
}

// ── Wikipedia: titles → wikitext ──────────────────────────────────────────────
async function fetchWikitext(titles) {
  const params = new URLSearchParams({
    action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main',
    titles: titles.join('|'), redirects: '1',
    format: 'json', formatversion: '2',
  });
  const raw  = await httpGet(`https://en.wikipedia.org/w/api.php?${params}`);
  const data = JSON.parse(raw);
  const out  = {};
  for (const page of data.query?.pages || []) {
    if (page.missing) continue;
    out[page.title] = page.revisions?.[0]?.slots?.main?.content || '';
  }
  return out;
}

// ── Weather box parser (handles both C and F fields) ─────────────────────────
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function parseNum(str) {
  if (!str) return null;
  const v = parseFloat(str.replace(/[−–]/g, '-').replace(/,/g, '').trim());
  return isNaN(v) ? null : v;
}

function extractWeatherBlock(wikitext) {
  // Matches both {{Weather box}} and {{weatherbox}} (US cities often omit the space)
  const m = /\{\{\s*Weather\s*box[^\n]*/i.exec(wikitext);
  if (!m) return null;
  let depth = 0, i = m.index;
  while (i < wikitext.length) {
    if (wikitext[i] === '{' && wikitext[i+1] === '{') { depth++; i += 2; }
    else if (wikitext[i] === '}' && wikitext[i+1] === '}') {
      depth--; if (depth === 0) return wikitext.slice(m.index, i + 2); i += 2;
    } else i++;
  }
  return null;
}

function parseWeatherBox(wikitext) {
  const block = extractWeatherBlock(wikitext);
  if (!block) return null;

  const fields = {};
  const inner = block.replace(/^\{\{[^\n]+\n?/, '').replace(/\}\}\s*$/, '');
  for (const part of inner.split(/\n[ \t]*\|/)) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim()
      .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '').trim();
    if (key && val) fields[key] = val;
  }

  const location = fields['location']?.trim();
  const fToC = f => f != null ? Math.round((f - 32) * 5 / 9 * 10) / 10 : null;
  const inToMm = i => i != null ? Math.round(i * 25.4 * 10) / 10 : null;
  const inToCm = i => i != null ? Math.round(i * 2.54 * 10) / 10 : null;

  const months = MONTHS.map(mon => {
    const entry = { month: mon };
    const get = suffix => parseNum(fields[`${mon} ${suffix}`]);
    const getF = suffix => { const v = get(suffix + ' F'); return v != null ? fToC(v) : null; };

    entry.high_c           = get('high C')          ?? getF('high');
    entry.low_c            = get('low C')            ?? getF('low');
    entry.mean_c           = get('mean C')           ?? getF('mean');
    entry.record_high_c    = get('record high C')    ?? getF('record high');
    entry.record_low_c     = get('record low C')     ?? getF('record low');
    entry.precipitation_mm = get('precipitation mm') ?? inToMm(get('precipitation inch'));
    entry.precipitation_days = get('precipitation days');
    entry.snow_cm          = get('snow cm')          ?? inToCm(get('snow inch'));
    entry.humidity         = get('humidity');
    entry.sun              = get('sun');

    return Object.fromEntries(Object.entries(entry).filter(([, v]) => v !== null));
  });

  const hasData = months.filter(m => m.high_c != null || m.low_c != null).length >= 6;
  if (!hasData) return null;

  const result = { months };
  if (location) result.location = location;
  return result;
}

// ── Climate chart parser (handles imperial units used by many US cities) ──────
function parseClimateChart(wikitext) {
  const m = /\{\{\s*climate\s+chart\s*/i.exec(wikitext);
  if (!m) return null;
  let depth = 0, i = m.index;
  while (i < wikitext.length) {
    if (wikitext[i] === '{' && wikitext[i+1] === '{') { depth++; i += 2; }
    else if (wikitext[i] === '}' && wikitext[i+1] === '}') {
      depth--; if (depth === 0) { i += 2; break; } i += 2;
    } else i++;
  }
  const block = wikitext.slice(m.index, i);
  const inner = block.replace(/^\{\{[^\n]*\n?/, '').replace(/\}\}\s*$/, '');
  const parts = inner.split('|')
    .map(s => s.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '').replace(/<!--[\s\S]*?-->/g, '').trim())
    .filter(s => s.length > 0);

  const nums = [];
  let locationLabel = null, firstNonNamed = true, isImperial = false;
  for (const part of parts) {
    if (part.includes('=')) {
      if (/^\s*units\s*=\s*imperial/i.test(part)) isImperial = true;
      continue;
    }
    if (firstNonNamed) {
      locationLabel = part.replace(/\[\[[^\]]*\]\]/g, s => s.replace(/.*\|/, '').replace(']]', '')).trim();
      firstNonNamed = false; continue;
    }
    const n = parseNum(part);
    if (n !== null) nums.push(n);
  }
  if (nums.length < 24) return null;

  const fToC = f => Math.round((f - 32) * 5 / 9 * 10) / 10;
  const inToMm = i => Math.round(i * 25.4 * 10) / 10;

  const months = MONTHS.map((mon, idx) => {
    const base = idx * 3;
    if (base + 2 >= nums.length) return { month: mon };
    const entry = {
      month:            mon,
      low_c:            isImperial ? fToC(nums[base])     : nums[base],
      high_c:           isImperial ? fToC(nums[base + 1]) : nums[base + 1],
      precipitation_mm: isImperial ? inToMm(nums[base + 2]) : nums[base + 2],
    };
    return Object.fromEntries(Object.entries(entry).filter(([, v]) => v !== null));
  });

  const hasData = months.filter(m => m.high_c != null).length >= 6;
  if (!hasData) return null;
  const result = { months, source: 'climate_chart' };
  if (locationLabel) result.location = locationLabel;
  return result;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const cities = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));

  // Target: US cities missing climate data, that have a Wikipedia title or QID
  const targets = cities.filter(c => c.iso === 'US' && (!c.climate || !c.climate.months));
  console.log(`US cities missing climate: ${targets.length}`);

  const qidIndex = {};
  cities.forEach((c, i) => { if (c.qid) qidIndex[c.qid] = i; });

  let patched = 0;

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(targets.length / BATCH_SIZE);
    process.stdout.write(`Batch ${batchNum}/${totalBatches} … `);

    try {
      // Phase 1: prefer stored wikipedia title, otherwise look up via Wikidata
      const needQidLookup = batch.filter(c => !c.wikipedia);
      const titleMap = {};
      if (needQidLookup.length) {
        const qids = needQidLookup.map(c => c.qid).filter(Boolean);
        if (qids.length) {
          const looked = await fetchWikiTitles(qids);
          Object.assign(titleMap, looked);
          await delay(400);
        }
      }
      // Use stored title where available
      batch.forEach(c => { if (c.wikipedia) titleMap[c.qid] = c.wikipedia; });

      const titles = [...new Set(Object.values(titleMap))];
      if (!titles.length) { console.log('no titles'); continue; }

      // Phase 2: fetch wikitext
      const wikitextMap = await fetchWikitext(titles);
      await delay(DELAY_MS);

      // Parse climate
      for (const city of batch) {
        const title = titleMap[city.qid];
        if (!title) continue;
        const wikitext = wikitextMap[title];
        if (!wikitext) continue;
        const climate = parseWeatherBox(wikitext) ?? parseClimateChart(wikitext);
        if (!climate) continue;
        const idx = qidIndex[city.qid];
        if (idx == null) continue;
        cities[idx].climate = climate;
        patched++;
      }

      console.log(`done (${patched} patched so far)`);
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
    }
  }

  console.log(`\nDone — patched ${patched} / ${targets.length} US cities with climate data.`);
  fs.writeFileSync(OUT_FILE, JSON.stringify(cities));
  console.log(`Saved ${OUT_FILE}`);
}

main().catch(e => { console.error(e); process.exit(1); });
