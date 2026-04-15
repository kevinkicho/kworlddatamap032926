#!/usr/bin/env node
/**
 * fetch-comtrade.js
 * Fetches top bilateral trade partners for ~60 major countries from the UN Comtrade
 * free public preview API and writes public/comtrade-partners.json.
 * Values are in billions USD, rounded to 1 decimal place.
 *
 * Usage:
 *   node scripts/fetch-comtrade.js
 *   node scripts/fetch-comtrade.js --fresh
 *
 * API:
 *   https://comtradeapi.un.org/public/v1/preview/C/A/HS
 *   Free, no auth, returns up to ~250 partner rows per request.
 *   flowCode=X → exports, flowCode=M → imports
 *
 * Checkpoint saved every 5 countries to scripts/.comtrade-checkpoint.json.
 */

const fs   = require('fs');
const path = require('path');

const OUTPUT_PATH     = path.join(__dirname, '../public/comtrade-partners.json');
const CHECKPOINT_PATH = path.join(__dirname, '.comtrade-checkpoint.json');
const FRESH           = process.argv.includes('--fresh');
const DELAY_MS        = 1500;
const TOP_N           = 5;
const PERIOD          = '2022';

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ISO-2 → UN numeric reporter code
// Note: some countries use alternate codes in the free preview API:
//   FR=251 (not 250), IN=699 (not 356), CH=757 (not 756),
//   NO=579 (not 578), BD=51 (not 50), RU=2022 has no data → use 2021
const COUNTRIES = {
  US: 842, CN: 156, DE: 276, JP: 392, GB: 826, FR: 251, IN: 699, CA: 124,
  KR: 410, IT: 380, AU: 36,  ES: 724, MX: 484, BR: 76,  NL: 528, RU: 643,
  CH: 757, SE: 752, NO: 579, DK: 208, SA: 682, AE: 784, TR: 792, PL: 616,
  BE: 56,  AR: 32,  ID: 360, TH: 764, MY: 458, SG: 702, ZA: 710, NG: 566,
  EG: 818, KE: 404, IL: 376, GR: 300, PT: 620, CZ: 203, HU: 348, RO: 642,
  UA: 804, PH: 608, VN: 704, PK: 586, BD: 51,  CL: 152, CO: 170, PE: 604,
  IR: 364,
};

// UN numeric code → ISO-2 (covers all reporters + common partners)
// Built from COUNTRIES + additional partners likely to appear in results.
// Alternate reporter codes (251=FR, 699=IN, 757=CH, 579=NO, 51=BD) are included.
const NUM_TO_ISO2 = {
  4:   'AF', 8:   'AL', 12:  'DZ', 24:  'AO', 32:  'AR', 36:  'AU', 40:  'AT',
  50:  'BD', 51:  'BD', 56:  'BE', 64:  'BT', 68:  'BO', 76:  'BR', 100: 'BG',
  104: 'MM', 116: 'KH', 124: 'CA', 144: 'LK', 152: 'CL', 156: 'CN', 170: 'CO',
  191: 'HR', 196: 'CY', 203: 'CZ', 204: 'BJ', 208: 'DK', 231: 'ET', 246: 'FI',
  250: 'FR', 251: 'FR', 276: 'DE', 288: 'GH', 300: 'GR', 320: 'GT', 344: 'HK',
  348: 'HU', 356: 'IN', 360: 'ID', 364: 'IR', 368: 'IQ', 372: 'IE', 376: 'IL',
  380: 'IT', 392: 'JP', 398: 'KZ', 400: 'JO', 404: 'KE', 408: 'KP', 410: 'KR',
  414: 'KW', 418: 'LA', 422: 'LB', 434: 'LY', 442: 'LU', 458: 'MY', 484: 'MX',
  504: 'MA', 528: 'NL', 554: 'NZ', 566: 'NG', 578: 'NO', 579: 'NO', 586: 'PK',
  600: 'PY', 604: 'PE', 608: 'PH', 616: 'PL', 620: 'PT', 630: 'PR', 634: 'QA',
  642: 'RO', 643: 'RU', 682: 'SA', 694: 'SL', 699: 'IN', 702: 'SG', 703: 'SK',
  704: 'VN', 705: 'SI', 710: 'ZA', 724: 'ES', 752: 'SE', 756: 'CH', 757: 'CH',
  764: 'TH', 780: 'TT', 784: 'AE', 788: 'TN', 792: 'TR', 804: 'UA', 818: 'EG',
  826: 'GB', 834: 'TZ', 840: 'US', 842: 'US', 858: 'UY', 860: 'UZ', 862: 'VE',
  887: 'YE', 894: 'ZM',
  // Additional partner codes seen in real data
  31:  'AZ', 72:  'BW', 112: 'BY', 180: 'CD', 226: 'GQ', 292: 'GI',
  440: 'LT', 508: 'MZ', 512: 'OM', 516: 'NA', 591: 'PA', 626: 'TL',
  800: 'UG',
};

// UN numeric code → common name (for display)
const NUM_TO_NAME = {
  4:   'Afghanistan',        8:   'Albania',           12:  'Algeria',
  24:  'Angola',             32:  'Argentina',         36:  'Australia',
  40:  'Austria',            50:  'Bangladesh',        56:  'Belgium',
  64:  'Bhutan',             68:  'Bolivia',           76:  'Brazil',
  100: 'Bulgaria',           104: 'Myanmar',           116: 'Cambodia',
  124: 'Canada',             144: 'Sri Lanka',         152: 'Chile',
  156: 'China',              170: 'Colombia',          191: 'Croatia',
  196: 'Cyprus',             203: 'Czech Republic',    208: 'Denmark',
  231: 'Ethiopia',           246: 'Finland',           250: 'France',
  276: 'Germany',            288: 'Ghana',             300: 'Greece',
  320: 'Guatemala',          344: 'Hong Kong',         348: 'Hungary',
  356: 'India',              360: 'Indonesia',         364: 'Iran',
  368: 'Iraq',               372: 'Ireland',           376: 'Israel',
  380: 'Italy',              392: 'Japan',             398: 'Kazakhstan',
  400: 'Jordan',             404: 'Kenya',             408: 'North Korea',
  410: 'South Korea',        414: 'Kuwait',            418: 'Laos',
  422: 'Lebanon',            434: 'Libya',             442: 'Luxembourg',
  458: 'Malaysia',           484: 'Mexico',            504: 'Morocco',
  528: 'Netherlands',        554: 'New Zealand',       566: 'Nigeria',
  578: 'Norway',             586: 'Pakistan',          600: 'Paraguay',
  604: 'Peru',               608: 'Philippines',       616: 'Poland',
  620: 'Portugal',           630: 'Puerto Rico',       634: 'Qatar',
  642: 'Romania',            643: 'Russia',            682: 'Saudi Arabia',
  702: 'Singapore',          703: 'Slovakia',          704: 'Vietnam',
  705: 'Slovenia',           710: 'South Africa',      724: 'Spain',
  752: 'Sweden',             756: 'Switzerland',       764: 'Thailand',
  780: 'Trinidad and Tobago',784: 'UAE',               788: 'Tunisia',
  792: 'Turkey',             804: 'Ukraine',           818: 'Egypt',
  826: 'United Kingdom',     834: 'Tanzania',          840: 'United States',
  842: 'United States',      858: 'Uruguay',           860: 'Uzbekistan',
  862: 'Venezuela',          887: 'Yemen',             894: 'Zambia',
  // Additional partner codes seen in real data
  31:  'Azerbaijan',         72:  'Botswana',          112: 'Belarus',
  180: 'Dem. Rep. Congo',   226: 'Equatorial Guinea',  292: 'Gibraltar',
  440: 'Lithuania',         508: 'Mozambique',         512: 'Oman',
  516: 'Namibia',           591: 'Panama',             626: 'Timor-Leste',
  800: 'Uganda',
};

// Partner codes to exclude: aggregate regions, special groupings, or areas NES.
// 0=World, 472=EU, 490=Other Asia NES, 527=Other Oceania NES, 568=Other Europe NES,
// 636=Other Middle East NES, 637=Other LAC NES, 686=Other Africa NES, 697=Other CIS NES,
// 728=South Sudan (sometimes used as NES), 837/838/839=special, 899=areas NES, 900/901=world.
const SKIP_PARTNER_CODES = new Set([0, 97, 472, 490, 527, 568, 577, 636, 637, 686, 697,
  728, 729, 837, 838, 839, 879, 899, 900, 901, 931, 936, 958, 981]);

const BASE_URL = 'https://comtradeapi.un.org/public/v1/preview/C/A/HS';

async function fetchFlow(reporterCode, flowCode, period = PERIOD) {
  const url = `${BASE_URL}?reporterCode=${reporterCode}&cmdCode=TOTAL&flowCode=${flowCode}&period=${period}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for reporter=${reporterCode} flow=${flowCode}`);
  }
  const json = await res.json();
  return json.data || [];
}

function topPartners(rows) {
  // Aggregate by partnerCode first (API sometimes returns duplicate rows for the same partner
  // under different classification codes). Then sort and take top N.
  const agg = {};
  for (const d of rows) {
    if (SKIP_PARTNER_CODES.has(d.partnerCode) || d.primaryValue <= 0) continue;
    if (!agg[d.partnerCode]) {
      agg[d.partnerCode] = { partnerCode: d.partnerCode, primaryValue: 0 };
    }
    // Only count the largest single row to avoid double-counting sub-classifications
    if (d.primaryValue > agg[d.partnerCode].primaryValue) {
      agg[d.partnerCode].primaryValue = d.primaryValue;
    }
  }
  return Object.values(agg)
    .sort((a, b) => b.primaryValue - a.primaryValue)
    .slice(0, TOP_N)
    .map(d => ({
      iso2:     NUM_TO_ISO2[d.partnerCode] || null,
      name:     NUM_TO_NAME[d.partnerCode] || `Code ${d.partnerCode}`,
      value_bn: Math.round(d.primaryValue / 1e8) / 10,  // → billions, 1 decimal
    }));
}

function hasGoodRows(rows) {
  // Checks that rows exist AND the top partner value is >= $1bn (sanity guard against
  // partial/corrupt data where values are present but implausibly tiny).
  const filtered = rows.filter(d => !SKIP_PARTNER_CODES.has(d.partnerCode) && d.primaryValue > 0);
  if (filtered.length === 0) return false;
  const maxVal = Math.max(...filtered.map(d => d.primaryValue));
  return maxVal >= 1e9; // at least $1bn for the top partner
}

async function fetchFlowWithFallback(numCode, flowCode) {
  // Try PERIOD (2022) first; if empty or data looks corrupt, fall back to 2021.
  let rows = await fetchFlow(numCode, flowCode, PERIOD);
  await sleep(DELAY_MS);
  if (!hasGoodRows(rows)) {
    rows = await fetchFlow(numCode, flowCode, '2021');
    await sleep(DELAY_MS);
  }
  return rows;
}

async function fetchCountry(iso2, numCode) {
  // Sequential fetches (not parallel) to avoid rate-limit 429s.
  // Each flow independently falls back to 2021 if 2022 is empty.
  const exportRows = await fetchFlowWithFallback(numCode, 'X');
  const importRows = await fetchFlowWithFallback(numCode, 'M');

  return {
    year:        parseInt(PERIOD, 10),
    top_exports: topPartners(exportRows),
    top_imports: topPartners(importRows),
  };
}

async function main() {
  // Load checkpoint
  let checkpoint = {};
  if (!FRESH && fs.existsSync(CHECKPOINT_PATH)) {
    try { checkpoint = JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8')); } catch (_) {}
  }

  // Load existing output
  let output = {};
  if (!FRESH && fs.existsSync(OUTPUT_PATH)) {
    try { output = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8')); } catch (_) {}
  }

  // Only skip if checkpoint[iso2] === true (previously succeeded). Retry nulls/false.
  const todo = Object.entries(COUNTRIES).filter(([iso2]) => FRESH || checkpoint[iso2] !== true);
  const total = Object.keys(COUNTRIES).length;
  console.log(`Countries total: ${total} | to fetch: ${todo.length} | already done: ${total - todo.length}`);

  let done = 0, succeeded = 0;

  for (const [iso2, numCode] of todo) {
    process.stdout.write(`  [${done + 1}/${todo.length}] ${iso2} (${numCode})... `);
    try {
      const data = await fetchCountry(iso2, numCode);
      output[iso2]     = data;
      checkpoint[iso2] = true;
      succeeded++;
      console.log(`ok (exports: ${data.top_exports.length}, imports: ${data.top_imports.length})`);
    } catch (e) {
      console.log(`WARN: ${e.message}`);
      output[iso2]     = null;
      checkpoint[iso2] = false;
    }

    done++;

    // Save checkpoint + output every 5 countries
    if (done % 5 === 0 || done === todo.length) {
      fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(checkpoint, null, 2));
      fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output));
      process.stdout.write(`  [checkpoint saved: ${done}/${todo.length}]\n`);
    }
  }

  // Final write (pretty for spot-checking)
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\nDone. ${succeeded}/${total} countries with data saved to ${OUTPUT_PATH}`);
}

main().catch(e => { console.error(e); process.exit(1); });
