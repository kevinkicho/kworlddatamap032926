#!/usr/bin/env node
/**
 * Download tectonic plate boundary GeoJSON from GitHub (Hugo Ahlenius / Nordpil).
 * Simplifies to essential properties and saves to public/tectonic-plates.json.
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const URL = 'https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_boundaries.json';
const OUT = path.join(__dirname, '..', 'public', 'tectonic-plates.json');

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'node' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

(async () => {
  console.log('Fetching tectonic plate boundaries...');
  const raw = await fetch(URL);
  const geo = JSON.parse(raw);

  // Simplify: keep only Name property, round coordinates to 2 decimal places
  const simplified = {
    type: 'FeatureCollection',
    features: geo.features.map(f => ({
      type: 'Feature',
      properties: { name: f.properties.Name || 'Unknown' },
      geometry: {
        type: f.geometry.type,
        coordinates: f.geometry.coordinates.map(ring =>
          Array.isArray(ring[0])
            ? ring.map(coord => [Math.round(coord[0] * 100) / 100, Math.round(coord[1] * 100) / 100])
            : [Math.round(ring[0] * 100) / 100, Math.round(ring[1] * 100) / 100]
        ),
      },
    })),
  };

  fs.writeFileSync(OUT, JSON.stringify(simplified));
  const size = (fs.statSync(OUT).size / 1024).toFixed(0);
  console.log(`Written: ${OUT} (${size}KB, ${simplified.features.length} boundaries)`);
})();
