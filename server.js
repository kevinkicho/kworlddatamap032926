require('dotenv').config();
const express = require('express');
const path    = require('path');
const fs      = require('fs');

const app      = express();
const PORT     = 3000;
const OUT_FILE = path.join(__dirname, 'public', 'cities-full.json');

app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(__dirname, 'public')));

/**
 * POST /api/enrich
 * Body: { qid, wiki_thumb, wiki_extract, wiki_images }
 *
 * Persists Wikipedia data into cities-full.json for the city identified by QID.
 * Only null fields are ever written — existing values are never overwritten.
 * All other Wikidata fields are untouched.
 */
app.post('/api/enrich', (req, res) => {
  const { qid, wiki_thumb, wiki_extract, wiki_images } = req.body ?? {};

  // Validate QID — must be Q followed by digits only
  if (!qid || typeof qid !== 'string' || !/^Q\d+$/.test(qid)) {
    return res.status(400).json({ error: 'invalid qid' });
  }

  let cities;
  try {
    cities = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
  } catch {
    return res.status(500).json({ error: 'could not read cities file' });
  }

  const city = cities.find(c => c.qid === qid);
  if (!city) return res.status(404).json({ error: 'city not found' });

  let changed = false;
  if (wiki_thumb   && typeof wiki_thumb   === 'string' && !city.wiki_thumb)   { city.wiki_thumb   = wiki_thumb;   changed = true; }
  if (wiki_extract && typeof wiki_extract === 'string' && !city.wiki_extract) { city.wiki_extract = wiki_extract; changed = true; }
  if (Array.isArray(wiki_images) && wiki_images.length && !city.wiki_images) {
    city.wiki_images = wiki_images.filter(u => typeof u === 'string').slice(0, 10);
    changed = true;
  }

  if (changed) {
    try {
      fs.writeFileSync(OUT_FILE, JSON.stringify(cities, null, 2), 'utf8');
    } catch {
      return res.status(500).json({ error: 'could not write cities file' });
    }
  }

  res.json({ ok: true, changed });
});

app.listen(PORT, () => {
  console.log(`World Data Map running at http://localhost:${PORT}`);
});
