const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use('/node_modules', express.static(path.join(__dirname, 'node_modules')));

// ── Wikidata SPARQL ───────────────────────────────────────────────────────────
// Queries cities classified as Q515, Q1549591 (big city), or Q1637706 (million city)
// with population >= 500,000 and known coordinates.
const SPARQL = `
SELECT DISTINCT ?cityLabel ?pop ?lat ?lon WHERE {
  { ?city wdt:P31 wd:Q515 } UNION
  { ?city wdt:P31 wd:Q1549591 } UNION
  { ?city wdt:P31 wd:Q1637706 }
  ?city wdt:P1082 ?pop ;
        wdt:P625 ?coord .
  FILTER(?pop >= 500000)
  BIND(geof:latitude(?coord)  AS ?lat)
  BIND(geof:longitude(?coord) AS ?lon)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
}
ORDER BY DESC(?pop)
LIMIT 800
`.trim();

// ── In-memory cache (12 h TTL) ────────────────────────────────────────────────
let citiesCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 12 * 60 * 60 * 1000;

async function fetchFromWikidata() {
  const url =
    'https://query.wikidata.org/sparql?query=' +
    encodeURIComponent(SPARQL) +
    '&format=json';

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'WorldDataMap/1.0 (educational; nodejs)',
      'Accept':     'application/sparql-results+json',
    },
    signal: AbortSignal.timeout(55_000),   // 55-second timeout
  });

  if (!res.ok) throw new Error(`Wikidata responded with HTTP ${res.status}`);

  const json = await res.json();

  // Parse, filter invalid rows, deduplicate by name (keep highest pop record)
  const map = new Map();
  for (const b of json.results.bindings) {
    const name = b.cityLabel.value;
    if (/^Q\d+$/.test(name)) continue;           // skip unlabeled (Q-number IDs)
    const pop = parseInt(b.pop.value,  10);
    const lat = parseFloat(b.lat.value);
    const lng = parseFloat(b.lon.value);
    if (isNaN(pop) || isNaN(lat) || isNaN(lng)) continue;
    if (!map.has(name) || map.get(name).pop < pop) {
      map.set(name, { name, lat, lng, pop });
    }
  }

  return Array.from(map.values()).sort((a, b) => b.pop - a.pop);
}

// ── API endpoint ──────────────────────────────────────────────────────────────
app.get('/api/cities', async (req, res) => {
  if (citiesCache && Date.now() - cacheTimestamp < CACHE_TTL) {
    return res.json({ source: 'cache', cities: citiesCache });
  }

  try {
    const cities = await fetchFromWikidata();
    citiesCache     = cities;
    cacheTimestamp  = Date.now();
    res.json({ source: 'wikidata', cities });
  } catch (err) {
    console.error('Wikidata fetch error:', err.message);
    if (citiesCache) {
      return res.json({ source: 'stale-cache', cities: citiesCache });
    }
    res.status(503).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`World Data Map running at http://localhost:${PORT}`);
});
