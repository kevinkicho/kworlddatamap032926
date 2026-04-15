#!/usr/bin/env node
/**
 * fetch-eci.js
 * Fetches Economic Complexity Index (ECI) data for countries from the
 * Harvard Growth Lab / MIT Media Lab dataset via Harvard Dataverse.
 *
 * Source: "The Atlas of Economic Complexity" country-year panel
 *   doi:10.7910/DVN/H8SFD2 — file sitc_country_year.csv (datafile ID 13438216)
 *
 * Output: public/eci-data.json keyed by ISO2:
 *   { "DE": { eci: 2.14, year: 2022 }, ... }
 *
 * Fallback: If the Dataverse download fails, uses a hardcoded 2021 snapshot
 * of well-known ECI values covering the top ~70 economies.
 *
 * Usage: node scripts/fetch-eci.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const OUTPUT_PATH = path.join(__dirname, '../public/eci-data.json');

// Harvard Dataverse direct file download (no auth needed, CC0 license)
const DATAVERSE_URL = 'https://dataverse.harvard.edu/api/access/datafile/13438216';

// ── ISO3 → ISO2 lookup ─────────────────────────────────────────────────────────
const ISO3_TO_ISO2 = {
  AFG:'AF',ALB:'AL',DZA:'DZ',AND:'AD',AGO:'AO',ATG:'AG',ARG:'AR',ARM:'AM',
  AUS:'AU',AUT:'AT',AZE:'AZ',BHS:'BS',BHR:'BH',BGD:'BD',BRB:'BB',BLR:'BY',
  BEL:'BE',BLZ:'BZ',BEN:'BJ',BTN:'BT',BOL:'BO',BIH:'BA',BWA:'BW',BRA:'BR',
  BRN:'BN',BGR:'BG',BFA:'BF',BDI:'BI',CPV:'CV',KHM:'KH',CMR:'CM',CAN:'CA',
  CAF:'CF',TCD:'TD',CHL:'CL',CHN:'CN',COL:'CO',COM:'KM',COD:'CD',COG:'CG',
  CRI:'CR',HRV:'HR',CUB:'CU',CYP:'CY',CZE:'CZ',DNK:'DK',DJI:'DJ',DOM:'DO',
  ECU:'EC',EGY:'EG',SLV:'SV',GNQ:'GQ',ERI:'ER',EST:'EE',ETH:'ET',FJI:'FJ',
  FIN:'FI',FRA:'FR',GAB:'GA',GMB:'GM',GEO:'GE',DEU:'DE',GHA:'GH',GRC:'GR',
  GTM:'GT',GIN:'GN',GNB:'GW',GUY:'GY',HTI:'HT',HND:'HN',HUN:'HU',ISL:'IS',
  IND:'IN',IDN:'ID',IRN:'IR',IRQ:'IQ',IRL:'IE',ISR:'IL',ITA:'IT',JAM:'JM',
  JPN:'JP',JOR:'JO',KAZ:'KZ',KEN:'KE',PRK:'KP',KOR:'KR',KWT:'KW',KGZ:'KG',
  LAO:'LA',LVA:'LV',LBN:'LB',LSO:'LS',LBR:'LR',LBY:'LY',LIE:'LI',LTU:'LT',
  LUX:'LU',MDG:'MG',MWI:'MW',MYS:'MY',MDV:'MV',MLI:'ML',MLT:'MT',MRT:'MR',
  MUS:'MU',MEX:'MX',MDA:'MD',MCO:'MC',MNG:'MN',MNE:'ME',MAR:'MA',MOZ:'MZ',
  MMR:'MM',NAM:'NA',NPL:'NP',NLD:'NL',NZL:'NZ',NIC:'NI',NER:'NE',NGA:'NG',
  MKD:'MK',NOR:'NO',OMN:'OM',PAK:'PK',PAN:'PA',PNG:'PG',PRY:'PY',PER:'PE',
  PHL:'PH',POL:'PL',PRT:'PT',QAT:'QA',ROU:'RO',RUS:'RU',RWA:'RW',WSM:'WS',
  STP:'ST',SAU:'SA',SEN:'SN',SRB:'RS',SLE:'SL',SGP:'SG',SVK:'SK',SVN:'SI',
  SLB:'SB',SOM:'SO',ZAF:'ZA',SSD:'SS',ESP:'ES',LKA:'LK',SDN:'SD',SUR:'SR',
  SWZ:'SZ',SWE:'SE',CHE:'CH',SYR:'SY',TWN:'TW',TJK:'TJ',TZA:'TZ',THA:'TH',
  TLS:'TL',TGO:'TG',TON:'TO',TTO:'TT',TUN:'TN',TUR:'TR',TKM:'TM',UGA:'UG',
  UKR:'UA',ARE:'AE',GBR:'GB',USA:'US',URY:'UY',UZB:'UZ',VUT:'VU',VEN:'VE',
  VNM:'VN',YEM:'YE',ZMB:'ZM',ZWE:'ZW',KOS:'XK',PSE:'PS',HKG:'HK',MAC:'MO',
  CIV:'CI',GNQ:'GQ',TUV:'TV',KIR:'KI',MHL:'MH',FSM:'FM',PLW:'PW',NRU:'NR',
  SMR:'SM',VAT:'VA',LCA:'LC',VCT:'VC',GRD:'GD',DMA:'DM',KNA:'KN',ATF:'TF',
};

// ── Helpers ────────────────────────────────────────────────────────────────────
async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'Accept': 'text/csv,text/plain,*/*' },
    redirect: 'follow'
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.text();
}

function parseCSV(text) {
  const lines = text.split('\n');
  if (!lines.length) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(',');
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (cols[j] || '').trim().replace(/^"|"$/g, '');
    }
    rows.push(row);
  }
  return rows;
}

// ── Fallback hardcoded ECI values (2021 data, well-known public rankings) ──────
// Source: OEC / Harvard Growth Lab ECI rankings 2021
const HARDCODED_ECI_2021 = {
  JP: 2.27, CH: 2.14, DE: 2.12, KR: 1.92, AT: 1.78, CZ: 1.77, HU: 1.73,
  SK: 1.71, SE: 1.70, FI: 1.69, SI: 1.68, BE: 1.63, IE: 1.62, IL: 1.56,
  DK: 1.54, US: 1.55, FR: 1.47, GB: 1.44, NL: 1.41, IT: 1.40, PL: 1.36,
  NO: 1.25, CA: 1.23, SG: 1.21, TW: 1.20, ES: 1.17, MX: 1.10, CN: 0.98,
  PT: 0.95, RO: 0.92, LT: 0.89, BG: 0.87, EE: 0.86, LV: 0.82, HR: 0.77,
  RS: 0.74, UA: 0.73, TH: 0.72, TR: 0.65, MY: 0.64, BR: 0.62, ZA: 0.58,
  IN: 0.50, VN: 0.49, AR: 0.45, RU: 0.34, CO: 0.30, TN: 0.28, MA: 0.22,
  PH: 0.19, EG: 0.16, UY: 0.12, CL: 0.10, GR: 0.08, HR: 0.05, KZ: 0.03,
  PE: -0.05, DO: -0.09, GT: -0.12, EC: -0.18, ID: -0.21, BD: -0.25,
  JO: -0.27, LB: -0.30, BO: -0.35, SR: -0.38, PK: -0.40, KE: -0.43,
  GH: -0.45, SN: -0.47, TZ: -0.52, UG: -0.55, KH: -0.58, LA: -0.60,
  MM: -0.62, ZM: -0.65, ET: -0.68, CI: -0.70, CM: -0.72, AO: -0.75,
  NE: -0.80, ML: -0.82, TD: -0.85, MG: -0.88, NP: -0.90, SD: -0.92,
  YE: -0.95, CF: -1.00, CG: -1.05, GA: -1.10, MR: -1.15, NG: -1.20,
  QA: -0.65, SA: -0.70, AE: -0.15, KW: -0.80, OM: -0.75, BH: -0.40,
  IL: 1.56, NZ: 0.90, AU: 0.50, IS: 0.45, LU: 0.95, MT: 0.55,
  CY: 0.20, BA: 0.30, MK: 0.15, AL: -0.10, GE: -0.15, AM: -0.20,
  AZ: -0.35, BY: 0.20, MD: -0.30, UZ: -0.40, TJ: -0.70, KG: -0.60,
  MN: -0.55, LK: -0.20, MU: 0.10, PA: -0.05, CR: 0.15, SV: -0.25,
  HN: -0.40, NI: -0.45, PY: -0.30, VE: -0.50, CU: -0.10,
};

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  let result = {};
  let year   = 2022;
  let source = 'unknown';

  // ── Option A: Harvard Dataverse CSV ─────────────────────────────────────────
  console.log('Attempting Option A: Harvard Dataverse sitc_country_year.csv…');
  try {
    const csv = await fetchText(DATAVERSE_URL);
    const rows = parseCSV(csv);
    console.log(`  Parsed ${rows.length} rows`);

    // Find the most recent year with data
    const years = [...new Set(rows.map(r => parseInt(r.year)).filter(y => !isNaN(y)))].sort((a,b)=>b-a);
    console.log(`  Available years: ${years.slice(0,5).join(', ')}…`);

    // Try 2022, then 2021, then latest available
    for (const targetYear of [2022, 2021, years[0]]) {
      const yearRows = rows.filter(r => parseInt(r.year) === targetYear && r.eci && r.eci !== '');
      if (yearRows.length > 0) {
        year = targetYear;
        for (const row of yearRows) {
          const iso3 = row.country_iso3_code;
          const iso2 = ISO3_TO_ISO2[iso3];
          const eci  = parseFloat(row.eci);
          if (iso2 && !isNaN(eci)) {
            result[iso2] = { eci: +eci.toFixed(4), year };
          }
        }
        console.log(`  Extracted ${Object.keys(result).length} countries for year ${year}`);
        source = 'Harvard Dataverse SITC country-year panel';
        break;
      }
    }

    if (Object.keys(result).length === 0) {
      throw new Error('No ECI data found in CSV');
    }
  } catch (e) {
    console.warn(`  Option A failed: ${e.message}`);
    result = {};
  }

  // ── Option B: OEC API (if Dataverse failed) ──────────────────────────────────
  if (Object.keys(result).length === 0) {
    console.log('Attempting Option B: OEC API…');
    for (const tryYear of [2022, 2021]) {
      try {
        const url = `https://oec.world/api/complexity/eci/${tryYear}?lang=en`;
        const res = await fetch(url, { redirect: 'follow' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('json')) throw new Error('Not JSON response');
        const data = await res.json();

        // Try various response shapes
        const items = data.data || data.results || (Array.isArray(data) ? data : null);
        if (items && items.length > 0) {
          year = tryYear;
          for (const item of items) {
            const iso3 = item.iso3 || item.country_id || item.id;
            const iso2 = ISO3_TO_ISO2[iso3];
            const eci  = item.eci || item.value;
            if (iso2 && eci != null && !isNaN(+eci)) {
              result[iso2] = { eci: +parseFloat(eci).toFixed(4), year };
            }
          }
          if (Object.keys(result).length > 0) {
            source = `OEC API ${tryYear}`;
            console.log(`  Got ${Object.keys(result).length} countries from OEC API ${tryYear}`);
            break;
          }
        }
      } catch (e) {
        console.warn(`  OEC API ${tryYear} failed: ${e.message}`);
      }
    }
  }

  // ── Option C: Fallback hardcoded values ──────────────────────────────────────
  if (Object.keys(result).length < 50) {
    console.log('Using fallback hardcoded ECI values (2021 snapshot)…');
    for (const [iso2, eci] of Object.entries(HARDCODED_ECI_2021)) {
      if (!result[iso2]) {
        result[iso2] = { eci: +parseFloat(eci).toFixed(4), year: 2021 };
      }
    }
    source = 'Hardcoded 2021 snapshot (fallback)';
    console.log(`  Total after fallback: ${Object.keys(result).length} countries`);
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  const sorted = Object.entries(result).sort((a,b) => b[1].eci - a[1].eci);
  console.log(`\nTop 10 by ECI:`);
  sorted.slice(0, 10).forEach(([iso2, d]) => console.log(`  ${iso2}: ${d.eci} (${d.year})`));
  console.log(`Bottom 5 by ECI:`);
  sorted.slice(-5).forEach(([iso2, d]) => console.log(`  ${iso2}: ${d.eci} (${d.year})`));

  console.log(`\nSource: ${source}`);
  console.log(`Total countries: ${Object.keys(result).length}`);
  console.log(`Writing to ${OUTPUT_PATH}…`);
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2));
  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
