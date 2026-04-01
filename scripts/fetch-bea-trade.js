#!/usr/bin/env node
/**
 * fetch-bea-trade.js
 * Pre-fetches US bilateral trade data from the BEA ITA API for all countries
 * in ISO2_TO_BEA and writes public/bea-trade.json.
 * The browser then loads this file at startup — zero runtime BEA API calls.
 *
 * Usage:
 *   node scripts/fetch-bea-trade.js
 *   node scripts/fetch-bea-trade.js --fresh
 */

const fs   = require('fs');
const path = require('path');

const OUTPUT_PATH = path.join(__dirname, '../public/bea-trade.json');
const API_KEY     = 'YOUR_BEA_API_KEY_HERE';
const FRESH       = process.argv.includes('--fresh');
const DELAY_MS    = 400;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Mirror of ISO2_TO_BEA from app.js
const ISO2_TO_BEA = {
  AU:'Australia', AT:'Austria', BE:'Belgium', BR:'Brazil', CA:'Canada',
  CL:'Chile', CN:'China', CO:'Colombia', CZ:'Czech Republic', DK:'Denmark',
  EG:'Egypt', FI:'Finland', FR:'France', DE:'Germany', GR:'Greece',
  HK:'Hong Kong', HU:'Hungary', IN:'India', ID:'Indonesia', IE:'Ireland',
  IL:'Israel', IT:'Italy', JP:'Japan', JO:'Jordan', KE:'Kenya', KW:'Kuwait',
  MY:'Malaysia', MX:'Mexico', MA:'Morocco', NL:'Netherlands', NZ:'New Zealand',
  NG:'Nigeria', NO:'Norway', OM:'Oman', PK:'Pakistan', PE:'Peru',
  PH:'Philippines', PL:'Poland', PT:'Portugal', QA:'Qatar', RU:'Russia',
  SA:'Saudi Arabia', ZA:'South Africa', KR:'South Korea', ES:'Spain',
  SE:'Sweden', CH:'Switzerland', TW:'Taiwan', TH:'Thailand', TR:'Turkey',
  AE:'United Arab Emirates', GB:'United Kingdom', VN:'Vietnam',
  BD:'Bangladesh', AR:'Argentina', UA:'Ukraine', RO:'Romania', SK:'Slovak Republic',
  DZ:'Algeria', GT:'Guatemala', HN:'Honduras', CR:'Costa Rica', PA:'Panama',
  DO:'Dominican Republic', CU:'Cuba', TT:'Trinidad and Tobago',
  KZ:'Kazakhstan', UZ:'Uzbekistan', AZ:'Azerbaijan', GE:'Georgia',
  AM:'Armenia', LB:'Lebanon', IQ:'Iraq', LK:'Sri Lanka', MM:'Burma',
  KH:'Cambodia', MN:'Mongolia', ET:'Ethiopia', GH:'Ghana', TZ:'Tanzania',
  AO:'Angola', ZM:'Zambia', MZ:'Mozambique', BW:'Botswana', MU:'Mauritius',
  EC:'Ecuador', VE:'Venezuela', UY:'Uruguay', BO:'Bolivia', PY:'Paraguay',
  SV:'El Salvador', NI:'Nicaragua', BZ:'Belize', JM:'Jamaica',
  AF:'Afghanistan', NP:'Nepal', FJ:'Fiji', PG:'Papua New Guinea',
  BG:'Bulgaria', HR:'Croatia', RS:'Serbia', SI:'Slovenia', LU:'Luxembourg',
  CY:'Cyprus', MT:'Malta', LT:'Lithuania', LV:'Latvia', EE:'Estonia',
  MD:'Moldova', BA:'Bosnia and Herzegovina', AL:'Albania', MK:'North Macedonia',
  LY:'Libya', SD:'Sudan', YE:'Yemen', SY:'Syria', TN:'Tunisia',
  CM:'Cameroon', SN:'Senegal', CD:'Democratic Republic of the Congo',
  CI:"Cote d'Ivoire", MG:'Madagascar', RW:'Rwanda', UG:'Uganda',
};

async function fetchCountry(beaName) {
  const url = `https://apps.bea.gov/api/data/?UserID=${API_KEY}` +
    `&method=GetData&DataSetName=ITA&Indicator=ExpGds,ImpGds,ExpSvc,ImpSvc` +
    `&AreaOrCountry=${encodeURIComponent(beaName)}&Frequency=A&Year=ALL&ResultFormat=JSON`;
  const res = await fetch(url);
  const json = await res.json();
  const rows = json?.BEAAPI?.Results?.Data;
  if (!rows?.length) return null;

  const byYear = {};
  for (const r of rows) {
    const yr = parseInt(r.TimePeriod, 10);
    if (isNaN(yr)) continue;
    const val = parseFloat(r.DataValue.replace(/,/g, '')) * 1e6; // millions → dollars
    if (!byYear[yr]) byYear[yr] = { year: yr };
    if (r.Indicator === 'ExpGds') byYear[yr].expGds = val;
    if (r.Indicator === 'ImpGds') byYear[yr].impGds = val;
    if (r.Indicator === 'ExpSvc') byYear[yr].expSvc = val;
    if (r.Indicator === 'ImpSvc') byYear[yr].impSvc = val;
  }
  return Object.values(byYear).sort((a, b) => a.year - b.year);
}

async function main() {
  let existing = {};
  if (!FRESH && fs.existsSync(OUTPUT_PATH)) {
    try { existing = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8')); } catch (_) {}
  }

  const todo = Object.entries(ISO2_TO_BEA).filter(([iso2]) => FRESH || !existing[iso2]);
  console.log(`Countries: ${Object.keys(ISO2_TO_BEA).length} | to fetch: ${todo.length}`);

  let done = 0, found = 0;
  for (const [iso2, beaName] of todo) {
    try {
      const data = await fetchCountry(beaName);
      existing[iso2] = data || null;
      if (data?.length) found++;
    } catch (e) {
      console.warn(`  WARN [${iso2}/${beaName}]: ${e.message}`);
      existing[iso2] = null;
    }
    done++;
    if (done % 10 === 0 || done === todo.length) {
      process.stdout.write(`\r  ${done}/${todo.length} | with data: ${found}   `);
      fs.writeFileSync(OUTPUT_PATH, JSON.stringify(existing));
    }
    await sleep(DELAY_MS);
  }

  console.log(`\nDone. ${found}/${Object.keys(ISO2_TO_BEA).length} countries with trade data.`);
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(existing));
}

main().catch(e => { console.error(e); process.exit(1); });
