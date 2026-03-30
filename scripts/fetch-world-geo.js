#!/usr/bin/env node
/**
 * scripts/fetch-world-geo.js
 *
 * Downloads the Natural Earth 110m country boundaries (TopoJSON) from the
 * world-atlas npm package via unpkg CDN, converts to GeoJSON, and enriches
 * each feature with its ISO 3166-1 alpha-2 code so the choropleth layer can
 * join it to public/country-data.json.
 *
 * Output: public/world-countries.json  (~500 KB GeoJSON)
 *
 * Usage:
 *   npm run fetch-world-geo
 *
 * Requires: topojson-client  (npm install --save-dev topojson-client)
 * Safe to re-run — overwrites the file in place.
 */

'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

let topo;
try {
  topo = require('topojson-client');
} catch {
  console.error('\nMissing dependency. Please run:\n  npm install --save-dev topojson-client\n');
  process.exit(1);
}

const OUT_FILE = path.join(__dirname, '..', 'public', 'world-countries.json');
const TOPO_URL = 'https://unpkg.com/world-atlas@2/countries-110m.json';

// ── ISO 3166-1 numeric → alpha-2 mapping ──────────────────────────────────────
// world-atlas feature IDs are ISO 3166-1 numeric codes.
const NUM_TO_ISO2 = {
  4:'AF',8:'AL',12:'DZ',20:'AD',24:'AO',28:'AG',31:'AZ',32:'AR',
  36:'AU',40:'AT',44:'BS',48:'BH',50:'BD',51:'AM',56:'BE',60:'BM',
  64:'BT',68:'BO',72:'BW',76:'BR',84:'BZ',90:'SB',96:'BN',
  100:'BG',104:'MM',108:'BI',112:'BY',116:'KH',120:'CM',124:'CA',
  132:'CV',136:'KY',140:'CF',144:'LK',148:'TD',152:'CL',156:'CN',
  170:'CO',174:'KM',178:'CG',180:'CD',188:'CR',191:'HR',192:'CU',
  196:'CY',203:'CZ',204:'BJ',208:'DK',212:'DM',214:'DO',218:'EC',
  222:'SV',226:'GQ',231:'ET',232:'ER',233:'EE',238:'FK',242:'FJ',
  246:'FI',250:'FR',262:'DJ',266:'GA',268:'GE',270:'GM',276:'DE',
  288:'GH',296:'KI',300:'GR',308:'GD',320:'GT',324:'GN',328:'GY',
  332:'HT',340:'HN',344:'HK',348:'HU',352:'IS',356:'IN',360:'ID',
  364:'IR',368:'IQ',372:'IE',376:'IL',380:'IT',384:'CI',388:'JM',
  392:'JP',398:'KZ',400:'JO',404:'KE',408:'KP',410:'KR',414:'KW',
  418:'LA',422:'LB',426:'LS',428:'LV',430:'LR',434:'LY',440:'LT',
  442:'LU',450:'MG',454:'MW',458:'MY',462:'MV',466:'ML',470:'MT',
  478:'MR',480:'MU',484:'MX',496:'MN',498:'MD',504:'MA',508:'MZ',
  516:'NA',520:'NR',524:'NP',528:'NL',540:'NC',554:'NZ',558:'NI',
  562:'NE',566:'NG',578:'NO',583:'FM',586:'PK',591:'PA',598:'PG',
  600:'PY',604:'PE',608:'PH',616:'PL',620:'PT',624:'GW',626:'TL',
  630:'PR',634:'QA',642:'RO',643:'RU',646:'RW',659:'KN',662:'LC',
  670:'VC',674:'SM',678:'ST',682:'SA',686:'SN',690:'SC',694:'SL',
  703:'SK',704:'VN',705:'SI',706:'SO',710:'ZA',716:'ZW',724:'ES',
  728:'SS',729:'SD',740:'SR',748:'SZ',752:'SE',756:'CH',760:'SY',
  762:'TJ',764:'TH',776:'TO',780:'TT',784:'AE',788:'TN',792:'TR',
  795:'TM',798:'TV',800:'UG',804:'UA',807:'MK',818:'EG',826:'GB',
  834:'TZ',840:'US',858:'UY',860:'UZ',862:'VE',882:'WS',887:'YE',
  894:'ZM',275:'PS',
};

// ── HTTP helper (follows redirects, resolves relative location headers) ────────
const { URL } = require('url');

function fetchUrl(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const lib = parsedUrl.protocol === 'http:' ? require('http') : https;
    lib.get(url, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        if (maxRedirects <= 0) return reject(new Error('Too many redirects'));
        const location = res.headers.location;
        const next = location.startsWith('http') ? location : new URL(location, url).href;
        res.resume();
        return fetchUrl(next, maxRedirects - 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end',  ()  => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Downloading world-atlas TopoJSON from unpkg…`);
  const raw      = await fetchUrl(TOPO_URL);
  const topology = JSON.parse(raw);

  console.log('Converting TopoJSON → GeoJSON…');
  const geojson = topo.feature(topology, topology.objects.countries);

  // Enrich with ISO-2 codes
  let matched = 0;
  for (const f of geojson.features) {
    const iso2 = NUM_TO_ISO2[Number(f.id)];
    if (iso2) {
      f.properties       = f.properties || {};
      f.properties.iso2  = iso2;
      matched++;
    }
  }

  console.log(`Matched ${matched} / ${geojson.features.length} countries to ISO-2 codes`);

  fs.writeFileSync(OUT_FILE, JSON.stringify(geojson), 'utf8');
  const kb = Math.round(fs.statSync(OUT_FILE).size / 1024);
  console.log(`Saved → ${OUT_FILE}  (${kb} KB, ${geojson.features.length} features)`);
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
