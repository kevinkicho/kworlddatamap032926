#!/usr/bin/env node
/**
 * scripts/fetch-city-infoboxes.js
 *
 * Supplements cities-full.json with data from Wikipedia {{Infobox settlement}} blocks.
 * Runs AFTER fetch-cities — reads cities-full.json, patches it, writes it back.
 *
 * New fields added to each city (when available):
 *   nicknames       — string[]  e.g. ["The Big Apple", "The City That Never Sleeps"]
 *   settlement_type — string    e.g. "Consolidated city-county"
 *   leaders         — {title,name}[]  e.g. [{title:"Mayor", name:"Eric Adams"}]
 *   pop_metro       — number    metro-area population
 *   pop_urban       — number    urban agglomeration population
 *   pop_as_of       — number    year of city population data
 *   utc_offset      — string    e.g. "−5:00" / "+7:00"
 *   wikipedia       — string    Wikipedia article title (stored for future use)
 *
 * Pipeline:
 *   Phase 1 — Batch fetch Wikipedia titles via Wikidata wbgetentities (50 QIDs/req)
 *   Phase 2 — Batch fetch wikitext via MediaWiki Action API (50 titles/req)
 *   Parse {{Infobox settlement}} and merge into city objects.
 *
 * Usage:
 *   npm run fetch-city-infoboxes             resume from checkpoint
 *   npm run fetch-city-infoboxes -- --fresh  restart from scratch
 */

'use strict';

const https   = require('https');
const http    = require('http');
const fs      = require('fs');
const path    = require('path');
const { URL } = require('url');

const OUT_FILE        = path.join(__dirname, '..', 'public', 'cities-full.json');
const CHECKPOINT_FILE = path.join(__dirname, '.city-infoboxes-checkpoint.json');
const WP_API          = 'https://en.wikipedia.org/w/api.php';
const WD_API          = 'https://www.wikidata.org/w/api.php';

const BATCH_SIZE   = 50;    // articles per API request (MediaWiki / Wikidata max)
const BATCH_DELAY  = 1200;  // ms between batches (politeness)
const RETRY_BASE   = 20000; // ms base backoff
const MAX_RETRIES  = 4;
const CP_VERSION   = 1;

const UA = 'kworlddatamap/2.0 (educational; city-infobox-supplement)';

const isFresh = process.argv.includes('--fresh');

// ── HTTP helper ────────────────────────────────────────────────────────────────
function httpGet(urlStr, headers = {}, hops = 5) {
  return new Promise((resolve, reject) => {
    const p   = new URL(urlStr);
    const lib = p.protocol === 'http:' ? http : https;
    lib.get({
      hostname: p.hostname,
      path:     p.pathname + p.search,
      headers:  { 'User-Agent': UA, ...headers },
    }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && hops > 0) {
        const loc  = res.headers.location || '';
        const next = loc.startsWith('http') ? loc : new URL(loc, urlStr).href;
        res.resume();
        return httpGet(next, headers, hops - 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        const chunks = [];
        const retryAfterSec = res.headers['retry-after']
          ? parseInt(res.headers['retry-after'], 10) || null
          : null;
        res.on('data', d => chunks.push(d));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8').slice(0, 300);
          reject(Object.assign(new Error(`HTTP ${res.statusCode}`), { status: res.statusCode, body, retryAfterSec }));
        });
        return;
      }
      const c = [];
      res.on('data', d => c.push(d));
      res.on('end', () => resolve(Buffer.concat(c).toString('utf8')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

const delay = ms => new Promise(r => setTimeout(r, ms));

async function withRetry(fn, label, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try { return await fn(); }
    catch (e) {
      if ([429, 500, 502, 503, 504].includes(e.status) && attempt <= retries) {
        const wait = (e.status === 429 && e.retryAfterSec)
          ? (e.retryAfterSec + 2) * 1000
          : RETRY_BASE * attempt;
        process.stdout.write(`\n    ⚠  ${label}: HTTP ${e.status} → retry in ${wait / 1000}s\n    `);
        await delay(wait);
      } else throw e;
    }
  }
}

// ── Phase 1: Wikidata → Wikipedia titles (50 QIDs/batch) ──────────────────────
async function fetchWikipediaTitles(qids) {
  const params = new URLSearchParams({
    action:     'wbgetentities',
    ids:        qids.join('|'),
    props:      'sitelinks',
    sitefilter: 'enwiki',
    format:     'json',
    formatversion: '2',
  });
  const raw  = await withRetry(
    () => httpGet(`${WD_API}?${params}`, { Accept: 'application/json' }),
    'Wikidata sitelinks'
  );
  const data = JSON.parse(raw);
  const result = {};  // qid → Wikipedia title
  for (const [qid, entity] of Object.entries(data.entities || {})) {
    const title = entity.sitelinks?.enwiki?.title;
    if (title) result[qid] = title;
  }
  return result;
}

// ── Phase 2: MediaWiki → wikitext (50 titles/batch) ───────────────────────────
async function fetchWikitext(titles) {
  const params = new URLSearchParams({
    action:      'query',
    prop:        'revisions',
    rvprop:      'content',
    rvslots:     'main',
    titles:      titles.join('|'),
    redirects:   '1',
    format:      'json',
    formatversion: '2',
  });
  const raw  = await withRetry(
    () => httpGet(`${WP_API}?${params}`, { Accept: 'application/json' }),
    'Wikipedia wikitext'
  );
  const data = JSON.parse(raw);

  // Build redirect map: redirected title → canonical title
  const redirectMap = {};
  for (const r of data.query?.redirects || []) {
    redirectMap[r.from] = r.to;
  }

  const result = {};  // canonical title → wikitext
  for (const page of data.query?.pages || []) {
    if (page.missing) continue;
    const wikitext = page.revisions?.[0]?.slots?.main?.content || '';
    result[page.title] = wikitext;
  }
  return { result, redirectMap };
}

// ── Wikitext parser helpers ───────────────────────────────────────────────────

function extractInfoboxBlock(wikitext) {
  // Match {{Infobox settlement}} (and common variants)
  const startRe = /\{\{\s*Infobox\s+(?:settlement|city|urban area|municipality)[^\n]*/i;
  const m = startRe.exec(wikitext);
  if (!m) return null;

  let depth = 0;
  let i = m.index;
  while (i < wikitext.length) {
    if (wikitext[i] === '{' && wikitext[i + 1] === '{') { depth++; i += 2; }
    else if (wikitext[i] === '}' && wikitext[i + 1] === '}') {
      depth--;
      if (depth === 0) return wikitext.slice(m.index, i + 2);
      i += 2;
    } else i++;
  }
  return null;
}

function parseInfoboxFields(block) {
  const fields = {};
  const inner = block.replace(/^\{\{[^\n]+\n?/, '').replace(/\}\}\s*$/, '');
  const parts = inner.split(/\n[ \t]*\|/);
  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx).trim().toLowerCase().replace(/[\s-]+/g, '_');
    const val = part.slice(eqIdx + 1).trim();
    if (key && val) fields[key] = val;
  }
  return fields;
}

function cleanValue(str) {
  if (!str) return '';
  return str
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/<ref[^/]*\/>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\{\{nowrap\|([^}]*)\}\}/gi, '$1')
    .replace(/\{\{(?:increase|decrease|steady|up|down)[^}]*\}\}/gi, '')
    .replace(/\{\{convert\|([^|]+)\|([^|}\s]+)[^}]*\}\}/gi, '$1 $2')
    .replace(/\{\{(?:unbulleted list|ubl|plainlist|flatlist)\|([^}]+)\}\}/gi,
      (_, args) => args.split('|').map(s => s.trim()).join(', '))
    .replace(/\{\{[^|}]+\|([^}|]+)\}\}/g, '$1')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, '$1')
    .replace(/\[\[([^\]|]+)\]\]/g, '$1')
    .replace(/'{2,3}/g, '')
    .replace(/<br\s*\/?>/gi, ', ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    // Strip everything from first newline onward (field values are single-line after parsing)
    .replace(/\n.*/s, '')
    .replace(/\s{2,}/g, ' ').replace(/,\s*,/g, ',')
    .trim();
}

// Pick first non-empty value from a list of field name candidates
function pick(fields, ...keys) {
  for (const k of keys) {
    const v = fields[k];
    if (v && v.trim()) return v.trim();
  }
  return null;
}

// Parse population number from wikitext value (strips commas, refs, templates)
function parsePop(str) {
  if (!str) return null;
  // Take only the first value when multiple are listed (e.g. "18,414,288 <br />20,748,395 (Extended UA)")
  const first = str.split(/<br\s*\/?>/i)[0];
  const clean = cleanValue(first);
  // Strip thousands-separator commas only (between digits), not list-separator commas
  const m = clean.replace(/(\d),(\d)/g, '$1$2').match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

// Parse a year from wikitext (handles "[[2020 United States census|2020]]", "mid 2025", etc.)
function parseYear(str) {
  if (!str) return null;
  const m = cleanValue(str).match(/\b(19[5-9]\d|20[0-2]\d)\b/);
  return m ? parseInt(m[1], 10) : null;
}

// Parse nicknames — may be multi-line list or comma/br separated
function parseNicknames(str) {
  if (!str) return null;
  const raw = str
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/<ref[^/]*\/>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // Split on <br>, newlines, or {{·}} bullets
  const parts = raw
    .split(/\s*(?:<br\s*\/?>\s*|\n\s*\*\s*|\{\{·\}\}\s*)/i)
    .map(s => cleanValue(s))
    .filter(s => s.length > 0 && s !== ',');

  return parts.length ? parts : null;
}

// Executive title keywords — prefer these over legislative bodies
const EXEC_TITLE_RE = /\b(mayor|governor|president|premier|chief\s+minister|lord\s+mayor|prime\s+minister|minister-president|chancellor|prefect|wali\s*kota|bupati|intendant)\b/i;

// Parse leaders from fields like leader_title1, leader_name1, leader_title2, leader_name2, …
// Returns array sorted so executive titles come first (max 3 entries).
function parseLeaders(fields) {
  const all = [];

  // Collect indexed slots 1–6
  for (let i = 1; i <= 6; i++) {
    const title = cleanValue(pick(fields, `leader_title${i}`));
    const name  = cleanValue(pick(fields, `leader_name${i}`));
    if (title && name) all.push({ title, name });
  }

  // Fallback: un-indexed
  if (!all.length) {
    const title = cleanValue(pick(fields, 'leader_title'));
    const name  = cleanValue(pick(fields, 'leader_name'));
    if (title && name) all.push({ title, name });
  }

  if (!all.length) return null;

  // Sort: executive titles first, then others; keep max 3
  const exec  = all.filter(l => EXEC_TITLE_RE.test(l.title));
  const other = all.filter(l => !EXEC_TITLE_RE.test(l.title));
  return [...exec, ...other].slice(0, 3);
}

// ── Parse infobox into patch object ──────────────────────────────────────────
function parseSettlementInfobox(wikitext) {
  const block = extractInfoboxBlock(wikitext);
  if (!block) return null;
  const f = parseInfoboxFields(block);

  const patch = {};

  // Nicknames
  const nickRaw = pick(f, 'nickname', 'nicknames', 'other_name', 'other_names');
  const nicks   = parseNicknames(nickRaw);
  if (nicks) patch.nicknames = nicks;

  // Settlement type
  const stype = cleanValue(pick(f, 'settlement_type', 'type'));
  if (stype) patch.settlement_type = stype;

  // Leaders
  const leaders = parseLeaders(f);
  if (leaders) patch.leaders = leaders;

  // Metro population
  const metro = parsePop(pick(f, 'population_metro', 'pop_metro', 'population_greater_city'));
  if (metro && metro > 1000) patch.pop_metro = metro;

  // Urban population
  const urban = parsePop(pick(f, 'population_urban', 'pop_urban'));
  if (urban && urban > 1000) patch.pop_urban = urban;

  // Population year
  const popYear = parseYear(pick(f, 'population_as_of', 'pop_as_of'));
  if (popYear) patch.pop_as_of = popYear;

  // UTC offset (supplement if not already in cities-full.json)
  const utc = cleanValue(pick(f, 'utc_offset', 'utc_offset1', 'utc_offset_dst'));
  if (utc && /[+-−]?\d/.test(utc)) patch.utc_offset = utc.replace('−', '−');  // normalize minus sign

  return Object.keys(patch).length ? patch : null;
}

// ── Weather box parser ────────────────────────────────────────────────────────
// Extracts {{Weather box}} template → structured climate object
// Fields follow naming: "Jan high C", "Jan low C", "Jan precipitation mm", etc.
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function extractWeatherBlock(wikitext) {
  const startRe = /\{\{\s*Weather\s+box[^\n]*/i;
  const m = startRe.exec(wikitext);
  if (!m) return null;

  let depth = 0;
  let i = m.index;
  while (i < wikitext.length) {
    if (wikitext[i] === '{' && wikitext[i + 1] === '{') { depth++; i += 2; }
    else if (wikitext[i] === '}' && wikitext[i + 1] === '}') {
      depth--;
      if (depth === 0) return wikitext.slice(m.index, i + 2);
      i += 2;
    } else i++;
  }
  return null;
}

function parseNum(str) {
  if (!str) return null;
  // Normalize Unicode minus signs (U+2212 −, U+2013 –) to ASCII hyphen-minus
  const v = parseFloat(str.replace(/[−–]/g, '-').replace(/,/g, '').trim());
  return isNaN(v) ? null : v;
}

function parseWeatherBox(wikitext) {
  const block = extractWeatherBlock(wikitext);
  if (!block) return null;

  // Parse fields: "| Jan high C = 13.8" style
  const fields = {};
  const inner = block.replace(/^\{\{[^\n]+\n?/, '').replace(/\}\}\s*$/, '');
  for (const part of inner.split(/\n[ \t]*\|/)) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim()
      .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .trim();
    if (key && val) fields[key] = val;
  }

  // Location / period label
  const location = fields['location'] ? fields['location'].trim() : undefined;

  // Build monthly array
  const months = MONTHS.map((mon, idx) => {
    const entry = { month: mon };
    const get = suffix => parseNum(fields[`${mon} ${suffix}`]);

    entry.high_c          = get('high C');
    entry.low_c           = get('low C');
    entry.mean_c          = get('mean C');
    entry.record_high_c   = get('record high C');
    entry.record_low_c    = get('record low C');
    entry.precipitation_mm = get('precipitation mm');
    entry.precipitation_days = get('precipitation days');
    entry.snow_cm         = get('snow cm');
    entry.humidity        = get('humidity');
    entry.sun             = get('sun');

    // Drop null-only entries
    return Object.fromEntries(Object.entries(entry).filter(([, v]) => v !== null));
  });

  // Only return if we got meaningful temperature data for at least 6 months
  const hasData = months.filter(m => m.high_c != null || m.low_c != null).length >= 6;
  if (!hasData) return null;

  const result = { months };
  if (location) result.location = location;
  return result;
}

// ── Climate chart parser ──────────────────────────────────────────────────────
// Handles {{climate chart}} — positional format used by South Korea, China, parts of Europe.
//
// Format:
//   {{climate chart
//   | City name
//   | low1 | high1 | precip1    ← January
//   | low2 | high2 | precip2    ← February
//   ...                          (12 months × 3 values = 36 positional params)
//   | float=Right }}             ← optional named params, ignored
//
// low/high are °C, precip is mm.
function parseClimateChart(wikitext) {
  // Match {{climate chart}} (case-insensitive, with optional whitespace)
  const startRe = /\{\{\s*climate\s+chart\s*/i;
  const m = startRe.exec(wikitext);
  if (!m) return null;

  // Extract block with balanced-brace counting
  let depth = 0, i = m.index;
  while (i < wikitext.length) {
    if (wikitext[i] === '{' && wikitext[i + 1] === '{') { depth++; i += 2; }
    else if (wikitext[i] === '}' && wikitext[i + 1] === '}') {
      depth--;
      if (depth === 0) { i += 2; break; }
      i += 2;
    } else i++;
  }
  const block = wikitext.slice(m.index, i);

  // Split by | separators
  const inner = block
    .replace(/^\{\{[^\n]*\n?/, '')   // strip opening {{climate chart line
    .replace(/\}\}\s*$/, '');         // strip closing }}

  const parts = inner
    .split('|')
    .map(s => s.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
               .replace(/<!--[\s\S]*?-->/g, '')
               .trim())
    .filter(s => s.length > 0);

  // Collect only numeric (non-named) positional values — skip "key = value" pairs
  // and skip the first part (city/location name)
  const nums = [];
  let locationLabel = null;
  let firstNonNamed = true;

  for (const part of parts) {
    if (part.includes('=')) continue;  // named param — skip
    if (firstNonNamed) {
      locationLabel = part.replace(/\[\[[^\]]*\]\]/g, s => s.replace(/.*\|/, '').replace(']]', '')).trim();
      firstNonNamed = false;
      continue;  // first positional = city name
    }
    const n = parseNum(part);
    if (n !== null) nums.push(n);
  }

  // Need at least 24 values (8 months × 3) to be useful; full set is 36 (12 × 3)
  if (nums.length < 24) return null;

  const months = MONTHS.map((mon, idx) => {
    const base = idx * 3;
    if (base + 2 >= nums.length) return { month: mon };
    const entry = {
      month:            mon,
      low_c:            nums[base],
      high_c:           nums[base + 1],
      precipitation_mm: nums[base + 2],
    };
    // Drop null entries
    return Object.fromEntries(Object.entries(entry).filter(([, v]) => v !== null));
  });

  const hasData = months.filter(m => m.high_c != null).length >= 6;
  if (!hasData) return null;

  const result = { months, source: 'climate_chart' };
  if (locationLabel) result.location = locationLabel;
  return result;
}

// ── Checkpoint helpers ─────────────────────────────────────────────────────────
function loadCheckpoint() {
  if (isFresh) return null;
  try {
    const cp = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
    if (cp.version !== CP_VERSION) {
      console.log(`Checkpoint version mismatch (${cp.version} vs ${CP_VERSION}) — restarting fresh.`);
      return null;
    }
    return cp;
  } catch { return null; }
}

function saveCheckpoint(cp) {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(cp), 'utf8');
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== fetch-city-infoboxes ===');

  // Load cities
  const cities = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
  console.log(`Loaded ${cities.length} cities from ${path.basename(OUT_FILE)}`);

  // Build QID → index map
  const qidIndex = {};
  cities.forEach((c, i) => { if (c.qid) qidIndex[c.qid] = i; });
  const allQids = Object.keys(qidIndex);

  // Load or init checkpoint
  let cp = loadCheckpoint();
  if (!cp) {
    cp = { version: CP_VERSION, phase1Done: {}, doneQids: [] };
    console.log('Starting fresh.');
  } else {
    console.log(`Resuming — ${cp.doneQids.length} / ${allQids.length} cities done.`);
  }

  const doneSet = new Set(cp.doneQids);
  const remainingQids = allQids.filter(q => !doneSet.has(q));

  if (!remainingQids.length) {
    console.log('Nothing to do — all cities already processed.');
    return;
  }

  let patched = 0;

  // Process in batches of BATCH_SIZE
  for (let i = 0; i < remainingQids.length; i += BATCH_SIZE) {
    const batchQids  = remainingQids.slice(i, i + BATCH_SIZE);
    const batchNum   = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatch = Math.ceil(remainingQids.length / BATCH_SIZE);

    process.stdout.write(`Batch ${batchNum}/${totalBatch} (${batchQids.length} cities) … `);

    try {
      // ── Phase 1: get Wikipedia titles ──
      const titleMap = await fetchWikipediaTitles(batchQids);  // qid → title
      await delay(300);

      // Group cities by Wikipedia title (dedup if multiple QIDs share same article)
      const titleToQids = {};
      for (const qid of batchQids) {
        const title = titleMap[qid];
        if (!title) continue;
        if (!titleToQids[title]) titleToQids[title] = [];
        titleToQids[title].push(qid);
      }

      const uniqueTitles = Object.keys(titleToQids);
      if (!uniqueTitles.length) {
        console.log('no Wikipedia articles found');
        cp.doneQids.push(...batchQids);
        saveCheckpoint(cp);
        continue;
      }

      // ── Phase 2: fetch wikitext ──
      const { result: wikitextMap } = await fetchWikitext(uniqueTitles);
      await delay(BATCH_DELAY);

      // ── Parse & merge ──
      for (const [title, qids] of Object.entries(titleToQids)) {
        const wikitext = wikitextMap[title];
        if (!wikitext) continue;

        const patch   = parseSettlementInfobox(wikitext);
        // Try {{Weather box}} first (named params), fall back to {{climate chart}} (positional)
        const climate = parseWeatherBox(wikitext) ?? parseClimateChart(wikitext);

        if (!patch && !climate) continue;

        for (const qid of qids) {
          const idx = qidIndex[qid];
          if (idx == null) continue;
          const city = cities[idx];

          // Store Wikipedia title for future use
          if (!city.wikipedia) city.wikipedia = title;

          // Merge settlement infobox fields
          if (patch) {
            if (patch.nicknames)       city.nicknames       = patch.nicknames;
            if (patch.settlement_type) city.settlement_type = patch.settlement_type;
            if (patch.leaders)         city.leaders         = patch.leaders;
            if (patch.pop_metro)       city.pop_metro       = patch.pop_metro;
            if (patch.pop_urban)       city.pop_urban       = patch.pop_urban;
            if (patch.pop_as_of)       city.pop_as_of       = patch.pop_as_of;
            if (patch.utc_offset && !city.utc_offset) city.utc_offset = patch.utc_offset;
          }

          // Merge climate data
          if (climate) city.climate = climate;

          patched++;
        }
      }

      cp.doneQids.push(...batchQids);
      saveCheckpoint(cp);

      const pct = Math.round((cp.doneQids.length / allQids.length) * 100);
      console.log(`done (${patched} patched so far, ${pct}% complete)`);

    } catch (e) {
      console.log(`\n  ✗ Error: ${e.message} — skipping batch`);
      cp.doneQids.push(...batchQids);
      saveCheckpoint(cp);
    }
  }

  // ── Write output ──────────────────────────────────────────────────────────
  fs.writeFileSync(OUT_FILE, JSON.stringify(cities), 'utf8');
  console.log(`\nDone. Patched ${patched} cities → ${path.basename(OUT_FILE)}`);
  if (fs.existsSync(CHECKPOINT_FILE)) fs.unlinkSync(CHECKPOINT_FILE);
}

main().catch(e => { console.error(e); process.exit(1); });
