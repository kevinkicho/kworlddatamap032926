// scripts/migrate-gawc.js
// One-time migration: re-key gawc-cities.json from city names to Wikidata QIDs.
// Reads cities-full.json as reference. Logs unmatched cities.
// Run: node scripts/migrate-gawc.js
'use strict';
const fs   = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');

const PUB        = path.join(__dirname, '..', 'public');
const GAWC_IN    = path.join(PUB, 'gawc-cities.json');
const CITIES     = path.join(PUB, 'cities-full.json');

const gawc   = JSON.parse(fs.readFileSync(GAWC_IN,  'utf8'));
const cities = JSON.parse(fs.readFileSync(CITIES,   'utf8'));

const normalize = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
                        .replace(/'/g, '');  // strip apostrophes (Xi'an → xian)

// Known name aliases: GaWC name → cities-full name (for renames/transliterations)
const ALIASES = {
  'kiev':          'kyiv',
  'bangalore':     'bengaluru',
  'xian':          "xi'an".replace(/'/g,''),  // → xian after normalize
  'tegucigalda':   'tegucigalpa',  // typo in GaWC data
  'lisbon':        'lisboa',
  'nur-sultan':    'astana',
};

// Build name+iso index from cities-full
const nameIdx = {};
for (const c of cities) {
  if (!c.qid) continue;
  const n = normalize(c.name);
  if (!nameIdx[n]) nameIdx[n] = [];
  nameIdx[n].push(c);
}

// Resolve a GaWC name to a city entry using multiple strategies
function resolve(name, iso) {
  const n = normalize(name);

  // 1. Exact match
  let candidates = nameIdx[n] || [];
  let city = candidates.find(c => c.iso === iso) || candidates[0];
  if (city) return city;

  // 2. Alias map
  const aliased = ALIASES[n];
  if (aliased) {
    candidates = nameIdx[aliased] || [];
    city = candidates.find(c => c.iso === iso) || candidates[0];
    if (city) return city;
  }

  // 3. Prefix fallback: GaWC name is a prefix of a city name (e.g. "New York" → "New York City")
  //    Pick shortest match to avoid "New York metropolitan area" over "New York City"
  {
    const prefixMatches = Object.entries(nameIdx)
      .filter(([cn]) => cn.startsWith(n + ' ') || cn.startsWith(n + ','))
      .sort((a, b) => a[0].length - b[0].length);  // shortest name wins
    for (const [, cs] of prefixMatches) {
      city = cs.find(c => c.iso === iso) || cs[0];
      if (city) return city;
    }
  }

  // 4. Reverse-prefix: city name is a prefix of GaWC name (e.g. "Luxembourg" → "Luxembourg City")
  {
    const revMatches = Object.entries(nameIdx)
      .filter(([cn]) => n.startsWith(cn + ' ') || n.startsWith(cn + ','))
      .sort((a, b) => b[0].length - a[0].length);  // longest prefix wins
    for (const [, cs] of revMatches) {
      city = cs.find(c => c.iso === iso) || cs[0];
      if (city) return city;
    }
  }

  return null;
}

const out = {};
const unmatched = [];
const seen = new Set();  // deduplicate by QID (handles İzmir/Izmir etc.)

for (const [name, info] of Object.entries(gawc)) {
  const city = resolve(name, info.iso);
  if (!city) {
    unmatched.push(name);
    continue;
  }
  if (!seen.has(city.qid)) {
    out[city.qid] = { tier: info.tier, score: info.score };
    seen.add(city.qid);
  }
}

atomicWrite(GAWC_IN, JSON.stringify(out, null, 2), 'utf8');
console.log(`Matched ${Object.keys(out).length}/${Object.keys(gawc).length} GaWC cities to QIDs`);

if (unmatched.length) {
  console.warn(`Unmatched (${unmatched.length}): ${unmatched.join(', ')}`);
  fs.writeFileSync(path.join(PUB, 'gawc-unmatched.json'), JSON.stringify(unmatched, null, 2), 'utf8');
  console.warn('Written to public/gawc-unmatched.json for manual review');
}
