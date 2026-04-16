#!/usr/bin/env node
/**
 * scripts/fetch-infoboxes.js
 *
 * Supplements companies.json with data from Wikipedia infoboxes.
 * Runs AFTER fetch-companies — reads companies.json, patches it, writes it back.
 *
 * Wikipedia infoboxes carry data that Wikidata's structured properties often lag
 * years behind on: current revenue, current employees, key people (with roles),
 * company type, products/services, and subsidiaries.
 *
 * Fetch strategy: MediaWiki Action API, 50 articles per request (batch endpoint).
 * ~155 requests covers 7,700 companies in ~3 minutes.
 *
 * Merge strategy:
 *   - Financial fields (revenue, net_income, etc.): use Wikipedia value when its
 *     year is more recent than what we have; also append to _history array.
 *   - Employees: same recency check.
 *   - key_people, type, products, subsidiaries: always use Wikipedia (richer text).
 *   - All Wikipedia-sourced financials gain a _currency field (e.g. "KRW", "USD").
 *
 * Usage:
 *   npm run fetch-infoboxes             resume from checkpoint
 *   npm run fetch-infoboxes -- --fresh  restart from scratch
 */

'use strict';

const https   = require('https');
const http    = require('http');
const fs      = require('fs');
const { atomicWrite } = require('./safe-write');
const path    = require('path');
const { URL } = require('url');

const OUT_FILE        = path.join(__dirname, '..', 'public', 'companies.json');
const CITIES_FILE     = path.join(__dirname, '..', 'public', 'cities-full.json');
const CHECKPOINT_FILE = path.join(__dirname, '.infoboxes-checkpoint.json');
const WP_API          = 'https://en.wikipedia.org/w/api.php';

// Country ISO-2 → most common corporate reporting currency.
// Used as a fallback when Wikipedia infobox revenue has no detectable currency symbol.
const ISO_DEFAULT_CURRENCY = {
  US:'USD', GB:'GBP', JP:'JPY', CN:'CNY', KR:'KRW', IN:'INR', ID:'IDR',
  AU:'AUD', CA:'CAD', CH:'CHF', SE:'SEK', NO:'NOK', DK:'DKK', PL:'PLN',
  RU:'RUB', MX:'MXN', HK:'HKD', SG:'SGD', TW:'TWD', ZA:'ZAR', TR:'TRY',
  MY:'MYR', TH:'THB', PH:'PHP', VN:'VND', NG:'NGN', EG:'EGP', SA:'SAR',
  AE:'AED', IL:'ILS', PK:'PKR', BD:'BDT', BR:'BRL', AR:'ARS', CL:'CLP',
  CO:'COP', CZ:'CZK', HU:'HUF', RO:'RON', KW:'KWD', QA:'QAR',
  NZ:'NZD', DZ:'DZD', MA:'MAD', KE:'KES', GH:'GHS', ET:'ETB',
  // Euro zone
  DE:'EUR', FR:'EUR', IT:'EUR', ES:'EUR', NL:'EUR', BE:'EUR', AT:'EUR',
  PT:'EUR', FI:'EUR', GR:'EUR', IE:'EUR', LU:'EUR', SK:'EUR', SI:'EUR',
  EE:'EUR', LV:'EUR', LT:'EUR', CY:'EUR', MT:'EUR',
};

const BATCH_SIZE  = 50;    // articles per API request (MediaWiki max)
const BATCH_DELAY = 1000;  // ms between batches (politeness)
const RETRY_BASE  = 20000; // ms base backoff
const MAX_RETRIES = 4;
const CP_VERSION  = 1;

const UA = 'kworlddatamap/2.0 (educational; infobox-supplement)';

// ── HTTP helper ───────────────────────────────────────────────────────────────
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
        const retryAfterSec = res.headers['retry-after'] ? parseInt(res.headers['retry-after'], 10) : null;
        const chunks = [];
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

// ── MediaWiki API: fetch wikitext for up to 50 articles ───────────────────────
// host: e.g. 'en.wikipedia.org', 'ja.wikipedia.org', 'ko.wikipedia.org'
// Returns { wikitextMap, returnedToRequested }
//   wikitextMap: { returnedTitle → wikitext }
//   returnedToRequested: { returnedTitle → [requestedTitles...] }
//     — accounts for redirects/normalization so callers can look up both
//       the post-redirect title AND any pre-redirect titles
async function fetchWikitext(titles, host = 'en.wikipedia.org') {
  const apiUrl = `https://${host}/w/api.php`;
  const params = new URLSearchParams({
    action:     'query',
    prop:       'revisions',
    rvprop:     'content',
    rvslots:    'main',
    titles:     titles.join('|'),
    redirects:  '1',
    format:     'json',
    formatversion: '2',
  });
  const raw = await withRetry(
    () => httpGet(`${apiUrl}?${params}`, { Accept: 'application/json' }),
    'Wikipedia API'
  );
  const data = JSON.parse(raw);

  // Chain normalization + redirects to find the final title for each requested title
  const currentTitle = {};
  for (const t of titles) currentTitle[t] = t;
  for (const { from, to } of data.query?.normalized || []) {
    for (const req of Object.keys(currentTitle)) {
      if (currentTitle[req] === from) currentTitle[req] = to;
    }
  }
  for (const { from, to } of data.query?.redirects || []) {
    for (const req of Object.keys(currentTitle)) {
      if (currentTitle[req] === from) currentTitle[req] = to;
    }
  }

  // Build returnedToRequested: final (returned) title → all requested titles that landed there
  const returnedToRequested = {};
  for (const [reqTitle, retTitle] of Object.entries(currentTitle)) {
    if (!returnedToRequested[retTitle]) returnedToRequested[retTitle] = [];
    if (!returnedToRequested[retTitle].includes(reqTitle)) {
      returnedToRequested[retTitle].push(reqTitle);
    }
  }

  const wikitextMap = {};
  for (const page of data.query?.pages || []) {
    if (page.missing) continue;
    const wikitext = page.revisions?.[0]?.slots?.main?.content || '';
    wikitextMap[page.title] = wikitext;
  }
  return { wikitextMap, returnedToRequested };
}

// ── Wikitext parser helpers ───────────────────────────────────────────────────

// Extract the first matching infobox block as a raw string.
// Handles nested {{ }} by counting brace depth.
function extractInfoboxBlock(wikitext) {
  // Match infobox template names used for companies and business entities
  const startRe = /\{\{\s*Infobox\s+(?:company|corporation|conglomerate|enterprise|public company|cooperative|bank|financial company|insurance company|investment company|airline|media company|organization|retail company|technology company|pharmaceutical company|holding company|department store)[^\n]*/i;
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
  return null;  // unclosed block (malformed wikitext)
}

// Split an infobox block into {key: rawValue} pairs.
// Uses depth-aware parsing so that | inside {{templates}} or [[links]] is NOT
// treated as a field separator (which would truncate multi-line template values).
function parseInfoboxFields(block) {
  const fields = {};
  const inner = block.replace(/^\{\{[^\n]+\n?/, '').replace(/\}\}\s*$/, '');

  // Walk character-by-character tracking brace/bracket depth.
  // A field boundary is: newline immediately followed by | at depth 0.
  const parts = [];
  let current = '';
  let depth = 0;
  let linkDepth = 0;

  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    const n = inner[i + 1];

    if (c === '{' && n === '{')     { depth++;     current += c; continue; }
    if (c === '}' && n === '}')     { depth--;     current += c; continue; }
    if (c === '[' && n === '[')     { linkDepth++; current += c; continue; }
    if (c === ']' && n === ']')     { linkDepth--; current += c; continue; }

    // Field separator: newline + | only at top level (not inside a template or link)
    if (c === '\n' && n === '|' && depth === 0 && linkDepth === 0) {
      parts.push(current);
      current = '';
      i++;  // skip the '|'
      continue;
    }

    current += c;
  }
  if (current.trim()) parts.push(current);

  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx).trim().toLowerCase().replace(/[\s-]+/g, '_');
    const val = part.slice(eqIdx + 1).trim();
    if (key && val) fields[key] = val;
  }
  return fields;
}

// Strip wikitext markup from a value, returning plain text.
function cleanValue(str) {
  if (!str) return '';
  return str
    // Strip <ref>...</ref> and self-closing <ref ... />
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/<ref[^/]*\/>/gi, '')
    // HTML comments
    .replace(/<!--[\s\S]*?-->/g, '')
    // {{nowrap|text}} → text
    .replace(/\{\{nowrap\|([^}]*)\}\}/gi, '$1')
    // Directional/change templates: {{increase}}, {{decrease}}, {{steady}} → (strip)
    .replace(/\{\{(?:increase|decrease|steady|up|down|IncreasePositive|DecreaseNegative)[^}]*\}\}/gi, '')
    // {{convert|num|unit|...}} → num unit
    .replace(/\{\{convert\|([^|]+)\|([^|}\s]+)[^}]*\}\}/gi, '$1 $2')
    // Currency templates with amount param: {{€|14.442 billion|link=yes}} → €14.442 billion
    // Must come before the symbol-only patterns below.
    .replace(/\{\{([€£¥₩₹$₺₦₱฿])\|([^|}]+)(?:\|[^}]*)?\}\}/g, '$1$2')
    // Currency ISO-code templates with amount: {{EUR|14.442 billion}} → €14.442 billion
    .replace(/\{\{USD\|([^|}]+)(?:\|[^}]*)?\}\}/gi, 'USD $1')
    .replace(/\{\{EUR\|([^|}]+)(?:\|[^}]*)?\}\}/gi, '€$1')
    .replace(/\{\{GBP\|([^|}]+)(?:\|[^}]*)?\}\}/gi, '£$1')
    .replace(/\{\{JPY\|([^|}]+)(?:\|[^}]*)?\}\}/gi, '¥$1')
    .replace(/\{\{KRW\|([^|}]+)(?:\|[^}]*)?\}\}/gi, '₩$1')
    .replace(/\{\{CNY\|([^|}]+)(?:\|[^}]*)?\}\}/gi, '¥$1')
    .replace(/\{\{INR\|([^|}]+)(?:\|[^}]*)?\}\}/gi, '₹$1')
    // Currency templates with no amount: {{USD}}, {{EUR}}, etc. → symbol only
    .replace(/\{\{USD\}\}/gi, 'USD ')
    .replace(/\{\{EUR\}\}/gi, '€')
    .replace(/\{\{GBP\}\}/gi, '£')
    .replace(/\{\{JPY\}\}/gi, '¥')
    .replace(/\{\{KRW\}\}/gi, '₩')
    .replace(/\{\{CNY\}\}/gi, '¥')
    .replace(/\{\{INR\}\}/gi, '₹')
    // {{val|...}} formatting templates
    .replace(/\{\{val\|([^|}]+)[^}]*\}\}/gi, '$1')
    // {{formatnum:NNN}} → NNN
    .replace(/\{\{formatnum:([^}]+)\}\}/gi, '$1')
    // {{unbulleted list|a|b|c}} → a, b, c
    .replace(/\{\{(?:unbulleted list|ubl|plainlist|flatlist)\|([^}]+)\}\}/gi,
      (_, args) => args.split('|').map(s => s.trim()).join(', '))
    // {{plainlist}} block → ignore wrapper
    .replace(/\{\{(?:div col|col-list|columns-list)[^}]*\}\}/gi, '')
    // Generic {{template|value}} → value (keep visible content)
    .replace(/\{\{[^|}]+\|([^}|]+)\}\}/g, '$1')
    // Any remaining {{template}} → remove
    .replace(/\{\{[^}]*\}\}/g, '')
    // [[Link|Display]] → Display
    .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, '$1')
    // [[Link]] → Link
    .replace(/\[\[([^\]|]+)\]\]/g, '$1')
    // ''italic'' and '''bold'''
    .replace(/'{2,3}/g, '')
    // HTML tags
    .replace(/<br\s*\/?>/gi, ', ')
    .replace(/<[^>]+>/g, '')
    // HTML entities
    .replace(/&nbsp;?/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    // Collapse whitespace
    .replace(/\s{2,}/g, ' ').replace(/,\s*,/g, ',')
    .trim();
}

// ── Financial value parser ─────────────────────────────────────────────────────
// Handles patterns like:
//   "₩84.18 trillion"  →  { value: 84180000000000, currency: "KRW" }
//   "US$48.2 billion"  →  { value: 48200000000,    currency: "USD" }
//   "1.019 billion PLN"→  { value: 1019000000,     currency: "PLN" }
//   "$1,234 million"   →  { value: 1234000000,     currency: "USD" }
//   "30.38 trillion"   →  { value: 30380000000000, currency: null  }
// Unambiguous single-currency symbols come first so they match before dollar variants.
// Dollar variants (S$, HK$, A$, etc.) come before the bare $ catch-all.
const CURRENCY_SYMBOLS = [
  ['₩',   'KRW'], ['€',   'EUR'], ['£',   'GBP'], ['¥',   'JPY'],
  ['₹',   'INR'], ['₺',   'TRY'], ['₦',   'NGN'], ['₱',   'PHP'],
  ['฿',   'THB'],
  ['HK$', 'HKD'], ['A$',  'AUD'], ['C$',  'CAD'], ['S$',  'SGD'],
  ['NZ$', 'NZD'], ['US$', 'USD'], ['R$',  'BRL'],
  ['$',   'USD'],
];
// Currencies that share the "$" glyph — if these are detected but the company's
// country default currency is non-dollar, the country default wins.
const DOLLAR_FAMILY = new Set(['USD','CAD','AUD','HKD','SGD','NZD','BRL']);
const CURRENCY_CODES = [
  'USD','EUR','GBP','JPY','KRW','CNY','INR','BRL','CAD','AUD','CHF',
  'SEK','NOK','DKK','PLN','RUB','MXN','HKD','SGD','TWD','ZAR','TRY',
  'IDR','MYR','PHP','THB','NGN','AED','SAR','CZK','HUF','RON','CLP',
];
const MULTIPLIERS = { trillion: 1e12, billion: 1e9, million: 1e6, thousand: 1e3 };

function parseFinancial(str) {
  if (!str) return null;
  const s = cleanValue(str);

  // Detect currency
  let currency = null;
  for (const [sym, code] of CURRENCY_SYMBOLS) {
    if (s.includes(sym)) { currency = code; break; }
  }
  if (!currency) {
    // Check for ISO code as a word (e.g. "84 trillion KRW" or "PLN 1.2 billion")
    for (const code of CURRENCY_CODES) {
      if (new RegExp(`\\b${code}\\b`).test(s)) { currency = code; break; }
    }
  }

  // Extract number + optional multiplier
  const numRe = /([\d,]+(?:\.\d+)?)\s*(trillion|billion|million|thousand)?/i;
  const m = numRe.exec(s);
  if (!m) return null;

  const rawNum = parseFloat(m[1].replace(/,/g, ''));
  if (isNaN(rawNum)) return null;
  const mult = MULTIPLIERS[(m[2] || '').toLowerCase()] || 1;
  const value = Math.round(rawNum * mult);

  return { value, currency };
}

// Parse a year hint from an infobox year field or from a value string
function parseYear(str) {
  if (!str) return null;
  const m = cleanValue(str).match(/\b(19[5-9]\d|20[0-2]\d)\b/);
  return m ? parseInt(m[1], 10) : null;
}

// ── Key people parser ─────────────────────────────────────────────────────────
// Input: "Koo Kwang-mo ([[Chairman]])<br />William Cho ([[CEO]])"
// Output: [{name: "Koo Kwang-mo", role: "Chairman"}, {name: "William Cho", role: "CEO"}]
function parseKeyPeople(str) {
  if (!str) return null;
  let raw = str
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/<ref[^/]*\/>/gi, '');

  // Strip inline presentation templates that may span multiple lines and confuse
  // the block-template regex below (e.g. {{small|\nExecutive Chairman\n}} inside
  // {{plainlist|...}} causes the non-greedy regex to stop at the inner }}).
  raw = raw
    .replace(/\{\{\s*(?:small|smaller|nobr|nowrap|abbr|efn)\s*\|([\s\S]*?)\}\}/gi, '$1')
    .replace(/\{\{\s*(?:small|smaller|nobr|nowrap|abbr|efn)\s*\}\}/gi, '');

  // Pre-process multi-line {{plainlist|...}} / {{unbulleted list|...}} blocks.
  // These span multiple lines and can't be handled by the single-line cleanValue regex.
  // Convert "* Name\nRole" bullet structure → "Name (Role)<br>" format.
  raw = raw.replace(
    /\{\{\s*(?:plainlist|unbulleted list|ubl|flatlist)\s*\|([\s\S]*?)\}\}/gi,
    (_, content) => {
      const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
      const parts = [];
      const cleanLine = t => t
        .replace(/\{\{[^|}]*\|([^}|]*)\}\}/g, '$1')  // {{template|val}} → val
        .replace(/\{\{[^}]*\}\}/g, '')                // {{template}} → ''
        .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, '$1')
        .replace(/\[\[([^\]|]+)\]\]/g, '$1')
        .replace(/&nbsp;?/g, ' ')
        .replace(/'{2,3}/g, '').replace(/<[^>]+>/g, '').trim();

      // Two formats:
      // 1. {{plainlist|* Name\nRole\n* Name\nRole}} — * lines are names, non-* are roles
      // 2. {{Unbulleted list\n|Name (Role)\n|Name (Role)}} — each | line is a full entry
      const hasBullets = lines.some(l => l.startsWith('*'));
      if (hasBullets) {
        // Name/role pairing: * = name, following non-* = role
        let pendingName = null;
        for (const line of lines) {
          const isBullet = line.startsWith('*');
          const text = line.replace(/^[*|]\s*/, '').trim();
          if (!text) continue;
          const clean = cleanLine(text);
          if (!clean) continue;
          if (isBullet) {
            if (pendingName) parts.push(pendingName);
            pendingName = clean;
          } else if (pendingName) {
            parts.push(`${pendingName} (${clean})`);
            pendingName = null;
          }
        }
        if (pendingName) parts.push(pendingName);
      } else {
        // Each line (first line already stripped of template delimiter |) is a full entry
        for (const line of lines) {
          const text = line.replace(/^[*|]\s*/, '').trim();
          if (!text) continue;
          const clean = cleanLine(text);
          if (clean) parts.push(clean);
        }
      }
      return parts.join('<br>');
    }
  );

  // Split on <br>, newlines, semicolons, and bare pipes (pipe-separated people lists)
  const entries = raw.split(/(?:<br\s*\/?>|\n|;|\|)/i).map(s => s.trim()).filter(Boolean);
  const rawPeople = [];
  for (const entry of entries) {
    // Strip leading wiki-list markers and trailing pipe residue before cleaning
    const stripped = entry.replace(/^\s*[*#•]\s*/, '').replace(/\|+\s*$/, '').trim();
    const clean = cleanValue(stripped);
    // Skip empty, unclosed templates, and }}-only template-closure residue
    if (!clean || clean.startsWith('{{') || /^[}\]|]+$/.test(clean)) continue;

    // Handle comma-separated "Name (Role), Name (Role)" patterns on a single line.
    // Split on '), ' followed by an uppercase letter (start of next name).
    if (/\)\s*,\s*[A-Z]/.test(clean)) {
      const parts = clean.split(/\)\s*,\s*(?=[A-Z])/);
      for (let i = 0; i < parts.length; i++) {
        // All parts except the last are missing their closing ')'
        const part = (i < parts.length - 1 ? parts[i] + ')' : parts[i]).trim();
        const pm = part.match(/^(.+?)\s*\((.+)\)$/);
        if (pm) rawPeople.push({ name: pm[1].trim(), role: pm[2].trim() });
        else rawPeople.push({ name: part.replace(/,\s*$/, ''), role: null });
      }
      continue;
    }

    // Standard: "Name (Role)" or "Name, Role"
    const m = clean.match(/^(.+?)\s*[\(,]\s*(.+?)\s*\)?$/);
    if (m) {
      const role = m[2].replace(/\)+$/, '').replace(/[|,]\s*$/, '').trim();
      rawPeople.push({ name: m[1].trim().replace(/[|,]\s*$/, ''), role: role || null });
    } else {
      rawPeople.push({ name: clean.replace(/[|,]\s*$/, '').trim(), role: null });
    }
  }

  // Post-process: pair orphan "(Role)" entries (Telefónica format: name on one line,
  // <br>, then role in parens on next line) with the preceding person who has no role yet.
  const people = [];
  for (const p of rawPeople) {
    const isOrphanRole = /^\([^)]+\)$/.test(p.name) && p.role === null;
    if (isOrphanRole && people.length > 0 && !people[people.length - 1].role) {
      people[people.length - 1].role = p.name.replace(/^\(|\)$/g, '').trim();
    } else if (p.name.length > 1) {
      people.push(p);
    }
  }
  return people.length ? people : null;
}

// Parse a list field (products, subsidiaries): "A, B, C" or "{{ubl|A|B|C}}"
function parseList(str) {
  if (!str) return null;
  // Pre-process multi-line {{plainlist|...}} / {{unbulleted list|...}} before cleanValue
  // Lines start with * (plainlist) or | (unbulleted list template param syntax)
  let s = str.replace(
    /\{\{\s*(?:unbulleted list|ubl|plainlist|flatlist)\s*\|([\s\S]*?)\}\}/gi,
    (_, content) => content.split('\n').map(l => l.replace(/^\s*[*|]\s*/, '').trim()).filter(Boolean).join(', ')
  );
  const clean = cleanValue(s);
  if (!clean) return null;
  return clean
    .split(/[,;|\n]/)
    .map(s => s.replace(/^\s*[\*#•]\s*/, '').trim())
    .filter(s => s.length > 1 && s.length < 120)
    .slice(0, 25); // cap at 25 items
}

// ── Infobox data extractor ────────────────────────────────────────────────────
// Takes parsed infobox fields and returns a structured supplement object.
function extractIntoboxData(fields) {
  const data = {};

  // ── Financial fields ───────────────────────────────────────────────────────
  const finFields = [
    { key: 'revenue',          yearKey: 'revenue_year',    out: 'revenue' },
    { key: 'operating_income', yearKey: 'operating_year',  out: 'operating_income' },
    { key: 'net_income',       yearKey: 'net_income_year', out: 'net_income' },
    { key: 'assets',           yearKey: 'assets_year',     out: 'total_assets' },
    { key: 'equity',           yearKey: 'equity_year',     out: 'total_equity' },
  ];

  for (const { key, yearKey, out } of finFields) {
    const raw = fields[key];
    if (!raw) continue;
    const parsed = parseFinancial(raw);
    if (!parsed || !parsed.value) continue;
    const year = parseYear(fields[yearKey]) || parseYear(raw);
    data[out]                = parsed.value;
    data[out + '_year']      = year;
    data[out + '_currency']  = parsed.currency;
  }

  // ── Employees ─────────────────────────────────────────────────────────────
  const empRaw = fields['num_employees'] || fields['employees'];
  if (empRaw) {
    const empClean = cleanValue(empRaw);
    const empNum   = empClean.match(/([\d,]+)/);
    const empYear  = parseYear(empRaw);
    if (empNum) {
      data.employees      = parseInt(empNum[1].replace(/,/g, ''), 10);
      data.employees_year = empYear;
    }
  }

  // ── Categorical / text fields ──────────────────────────────────────────────
  const typeRaw = fields['type'];
  if (typeRaw) data.company_type = cleanValue(typeRaw);

  const tradedRaw = fields['traded_as'];
  if (tradedRaw) data.traded_as = cleanValue(tradedRaw);

  const industryRaw = fields['industry'];
  if (industryRaw) data.industry_wiki = cleanValue(industryRaw);

  // Always emit these keys (even as null) so mergeIntoCompany can clear stale values
  const peopleRaw = fields['key_people'];
  data.key_people = peopleRaw ? parseKeyPeople(peopleRaw) : null;

  const prodRaw = fields['products'] || fields['services'];
  data.products = prodRaw ? parseList(prodRaw) : null;

  const subsidRaw = fields['subsid'] || fields['subsidiaries'];
  data.subsidiaries = subsidRaw ? parseList(subsidRaw) : null;

  const parentRaw = fields['parent'];
  if (parentRaw) data.parent_wiki = cleanValue(parentRaw);

  const founderRaw = fields['founder'] || fields['founders'];
  if (founderRaw) {
    const founderClean = cleanValue(founderRaw);
    data.founders_wiki = founderClean.split(/,|;|<br>/).map(s => s.trim()).filter(Boolean);
  }

  return data;
}

// ── Merge infobox data into a company object ──────────────────────────────────
// Wikipedia data fills in / updates fields where its year is more recent.
function mergeIntoCompany(co, infobox, defaultCurrency = null) {
  const out = { ...co };

  // Financial fields: use Wikipedia if more recent than current data
  const finFields = ['revenue', 'operating_income', 'net_income', 'total_assets', 'total_equity'];
  for (const field of finFields) {
    const wikiVal  = infobox[field];
    const wikiYear = infobox[field + '_year'];
    if (!wikiVal) continue;

    // Currency: prefer explicit detection, then fall back to country default.
    // Never store a financial figure without a currency identifier.
    let wikiCurrency = infobox[field + '_currency'];
    // If parseFinancial detected a dollar-family currency (S$, HK$, A$, $…) but
    // the company's country uses a non-dollar currency (JPY, EUR, KRW…), the
    // symbol match was likely spurious (e.g. Sony's infobox contains "S$" somewhere
    // incidentally). In that case, trust the country default instead.
    if (wikiCurrency && DOLLAR_FAMILY.has(wikiCurrency) &&
        defaultCurrency && !DOLLAR_FAMILY.has(defaultCurrency)) {
      wikiCurrency = defaultCurrency;
    }
    const resolvedCurrency = wikiCurrency || defaultCurrency || null;
    if (!resolvedCurrency) continue;  // discard value — currency unknown, unusable for comparison
    // use resolvedCurrency going forward
    wikiCurrency = resolvedCurrency;

    const histKey = field === 'total_assets'    ? 'total_assets_history'
                  : field === 'total_equity'    ? 'total_equity_history'
                  : field === 'operating_income'? 'operating_income_history'
                  : field === 'net_income'       ? 'net_income_history'
                  :                               'revenue_history';

    // Sanity check: if existing history has values in the same currency, reject a new
    // value that is >100× or <1/100× the recent median. This catches Wikipedia infobox
    // unit-scale errors (e.g. "3,132 billion EUR" meaning €3.132B stored as €3.132T).
    const existHist = (out[histKey] || []).filter(h => h.currency === wikiCurrency && h.value > 0);
    if (existHist.length >= 2) {
      const sorted    = existHist.slice().sort((a, b) => a.value - b.value);
      const medianVal = sorted[Math.floor(sorted.length / 2)].value;
      const ratio     = wikiVal / medianVal;
      if (ratio > 100 || ratio < 0.01) continue;  // scale error — skip
    }

    const curYear = out[field + '_year'] || 0;
    if (!out[field] || (wikiYear && wikiYear >= curYear)) {
      out[field]              = wikiVal;
      out[field + '_year']    = wikiYear;
      out[field + '_currency']= wikiCurrency;
    }

    // Append to history if not already present for this year
    if (wikiYear && wikiVal) {
      const hist = out[histKey] || [];
      if (!hist.some(h => h.year === wikiYear)) {
        out[histKey] = [...hist, { year: wikiYear, value: wikiVal, currency: wikiCurrency }]
          .sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
      }
    }
  }

  // Employees: use Wikipedia if more recent
  if (infobox.employees) {
    const curYear  = (out.employees_history || []).filter(h => h.year).slice(-1)[0]?.year || 0;
    const wikiYear = infobox.employees_year || 0;
    if (!out.employees || wikiYear > curYear) {
      out.employees = infobox.employees;
    }
    if (wikiYear && !((out.employees_history || []).some(h => h.year === wikiYear))) {
      out.employees_history = [...(out.employees_history || []),
        { year: wikiYear, value: infobox.employees }
      ].sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
    }
  }

  // Text fields: always take Wikipedia (richer / more current).
  // When the infobox was found (infobox._fromWiki === true) but a field parsed to null/empty,
  // clear any stale values that may contain raw wikitext garbage from prior runs.
  if (infobox.company_type)  out.company_type   = infobox.company_type;
  if (infobox.traded_as)     out.traded_as       = infobox.traded_as;
  if (infobox.industry_wiki) out.industry        = out.industry || infobox.industry_wiki;
  // For list fields: use new value if truthy; clear stale garbage if the raw field existed
  // but parsed to nothing (signalled by explicit null from extractIntoboxData).
  if (infobox.key_people)    out.key_people      = infobox.key_people;
  else if ('key_people' in infobox) delete out.key_people;  // clear stale from prior runs
  if (infobox.products)      out.products        = infobox.products;
  else if ('products' in infobox) delete out.products;
  if (infobox.subsidiaries)  out.subsidiaries    = infobox.subsidiaries;
  else if ('subsidiaries' in infobox) delete out.subsidiaries;
  if (infobox.parent_wiki)   out.parent_org      = out.parent_org || infobox.parent_wiki;
  if (infobox.founders_wiki?.length && !out.founders) out.founders = infobox.founders_wiki;

  return out;
}

// ── Checkpoint helpers ────────────────────────────────────────────────────────
function saveCheckpoint(done) {
  fs.writeFileSync(
    CHECKPOINT_FILE,
    JSON.stringify({ version: CP_VERSION, savedAt: new Date().toISOString(), done: [...done] }),
    'utf8'
  );
}
function loadCheckpoint() {
  if (!fs.existsSync(CHECKPOINT_FILE)) return null;
  try {
    const d = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
    return d.version === CP_VERSION ? d : null;
  } catch { return null; }
}
function deleteCheckpoint() {
  if (fs.existsSync(CHECKPOINT_FILE)) fs.unlinkSync(CHECKPOINT_FILE);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const FRESH = process.argv.includes('--fresh');

  if (!fs.existsSync(OUT_FILE)) {
    console.error(`\n✗ ${OUT_FILE} not found — run npm run fetch-companies first.\n`);
    process.exit(1);
  }

  console.log(`\n╔════════════════════════════════════════════════════════╗`);
  console.log(`║  fetch-infoboxes — Wikipedia infobox supplement        ║`);
  console.log(`╚════════════════════════════════════════════════════════╝`);

  const companies = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));

  // Build city QID → ISO-2 country code map for currency fallback
  const cityQidToIso = {};
  try {
    const cities = JSON.parse(fs.readFileSync(CITIES_FILE, 'utf8'));
    for (const c of cities) if (c.qid && c.iso) cityQidToIso[c.qid] = c.iso;
  } catch { /* cities file optional */ }

  // Build a flat list of {cityQid, coIdx, title, host} for all companies with Wikipedia links
  const todo = [];
  for (const [cityQid, cos] of Object.entries(companies)) {
    for (let i = 0; i < cos.length; i++) {
      const co = cos[i];
      if (!co.wikipedia) continue;
      const m = co.wikipedia.match(/https?:\/\/([^/]+)\/wiki\/([^#?]+)$/);
      if (!m) continue;
      const host  = m[1];   // e.g. 'en.wikipedia.org', 'ja.wikipedia.org'
      const title = decodeURIComponent(m[2].replace(/_/g, ' '));
      todo.push({ cityQid, coIdx: i, title, host });
    }
  }

  // Deduplicate by "host::title" key (same company in multiple cities)
  const titleToEntries = new Map();
  for (const entry of todo) {
    const key = `${entry.host}::${entry.title}`;
    if (!titleToEntries.has(key)) titleToEntries.set(key, []);
    titleToEntries.get(key).push(entry);
  }
  const uniqueTitles = [...titleToEntries.keys()];

  console.log(`Companies with Wikipedia links : ${todo.length.toLocaleString()}`);
  console.log(`Unique Wikipedia articles      : ${uniqueTitles.length.toLocaleString()}`);
  console.log(`Batches (${BATCH_SIZE}/request)              : ${Math.ceil(uniqueTitles.length / BATCH_SIZE)}\n`);

  if (FRESH) { deleteCheckpoint(); console.log('Mode: --fresh\n'); }

  const cp   = FRESH ? null : loadCheckpoint();
  const done = new Set(cp?.done || []);
  const titlesToDo = uniqueTitles.filter(t => !done.has(t));

  console.log(`Resuming: ${done.size} done · ${titlesToDo.length} remaining\n`);

  // Group titlesToDo (host::title keys) by host for per-host batching
  const hostQueues = new Map();  // host → [title, ...]
  for (const key of titlesToDo) {
    const sepIdx = key.indexOf('::');
    const host  = key.slice(0, sepIdx);
    const title = key.slice(sepIdx + 2);
    if (!hostQueues.has(host)) hostQueues.set(host, []);
    hostQueues.get(host).push(title);
  }

  const totalBatches = Math.ceil(titlesToDo.length / BATCH_SIZE);
  let bNum = Math.floor(done.size / BATCH_SIZE);
  let patched = 0;
  let infoboxFound = 0;
  let processedCount = 0;

  for (const [host, titles] of hostQueues) {
    for (let i = 0; i < titles.length; i += BATCH_SIZE) {
      bNum++;
      const batch = titles.slice(i, i + BATCH_SIZE);
      const hostLabel = host.replace('.wikipedia.org', '');
      process.stdout.write(`  [${bNum}/${totalBatches}] ${hostLabel} · ${batch.length} articles… `);
      const t0 = Date.now();

      let wikitextMap, returnedToRequested;
      try {
        ({ wikitextMap, returnedToRequested } = await fetchWikitext(batch, host));
      } catch (e) {
        process.stdout.write(`✗ ${e.status || e.message} — skipping\n`);
        batch.forEach(t => done.add(`${host}::${t}`));
        processedCount += batch.length;
        await delay(BATCH_DELAY);
        continue;
      }

      let batchFound = 0;
      for (const [returnedTitle, wikitext] of Object.entries(wikitextMap)) {
        // Collect all keys: post-redirect title + any pre-redirect titles that landed here
        const allRequestedTitles = returnedToRequested[returnedTitle] || [returnedTitle];
        const allKeys = [...new Set([returnedTitle, ...allRequestedTitles])].map(t => `${host}::${t}`);

        const block = extractInfoboxBlock(wikitext);
        if (!block) { allKeys.forEach(k => done.add(k)); continue; }

        const fields  = parseInfoboxFields(block);
        const infobox = extractIntoboxData(fields);

        // Apply to all company entries reachable via any alias key (dedup by cityQid+coIdx)
        const seen = new Set();
        for (const key of allKeys) {
          for (const { cityQid, coIdx } of titleToEntries.get(key) || []) {
            const id = `${cityQid}:${coIdx}`;
            if (seen.has(id)) continue;
            seen.add(id);
            const cityIso         = cityQidToIso[cityQid] || null;
            const defaultCurrency = cityIso ? (ISO_DEFAULT_CURRENCY[cityIso] || null) : null;
            companies[cityQid][coIdx] = mergeIntoCompany(companies[cityQid][coIdx], infobox, defaultCurrency);
            patched++;
          }
        }
        allKeys.forEach(k => done.add(k));
        batchFound++;
        infoboxFound++;
      }
      // Mark any remaining batch titles as done (missing/absent articles)
      batch.forEach(t => done.add(`${host}::${t}`));

      processedCount += batch.length;
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      process.stdout.write(`${batchFound}/${batch.length} infoboxes parsed (${elapsed}s)\n`);

      // Write checkpoint + updated companies.json every batch
      saveCheckpoint(done);
      atomicWrite(OUT_FILE, JSON.stringify(companies), 'utf8');

      if (processedCount < titlesToDo.length) await delay(BATCH_DELAY);
    }
  }

  const mb = (fs.statSync(OUT_FILE).size / 1e6).toFixed(1);
  console.log(`\n  Infoboxes parsed : ${infoboxFound.toLocaleString()}`);
  console.log(`  Company records patched : ${patched.toLocaleString()}`);
  console.log(`  Wrote ${OUT_FILE} (${mb} MB)`);
  deleteCheckpoint();
  console.log(`\n✓ Done\n`);
}

main().catch(e => {
  console.error('\nFatal:', e.message || e);
  process.exit(1);
});
