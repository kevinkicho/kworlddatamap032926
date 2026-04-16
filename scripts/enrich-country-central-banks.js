// scripts/enrich-country-central-banks.js
// Adds central bank policy rates and sovereign credit ratings to country-data.json.
// Sources: kyahoofinance032926 centralBankRates.js and mockBondsData.js (static data).
// Run: node scripts/enrich-country-central-banks.js
'use strict';
const fs   = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');

const COUNTRY_FILE = path.join(__dirname, '..', 'public', 'country-data.json');
const countryData  = JSON.parse(fs.readFileSync(COUNTRY_FILE, 'utf8'));

// ── Central bank policy rates (from kyahoofinance032926, approx. early 2025) ──
// Maps ISO2 currency code → rate info.
// EUR applies to all Eurozone members listed below.
const CENTRAL_BANK_RATES = {
  USD: { rate: 5.25, bank: 'Federal Reserve',  label: 'Fed Funds Rate'  },
  EUR: { rate: 4.00, bank: 'ECB',              label: 'Main Refi Rate'  },
  GBP: { rate: 5.25, bank: 'Bank of England',  label: 'Bank Rate'       },
  JPY: { rate: 0.10, bank: 'Bank of Japan',    label: 'Policy Rate'     },
  CHF: { rate: 1.75, bank: 'SNB',              label: 'Policy Rate'     },
  AUD: { rate: 4.35, bank: 'RBA',              label: 'Cash Rate'       },
  CAD: { rate: 5.00, bank: 'Bank of Canada',   label: 'Overnight Rate'  },
  NZD: { rate: 5.50, bank: 'RBNZ',             label: 'OCR'             },
  CNY: { rate: 3.45, bank: 'PBOC',             label: '1-Year LPR'      },
  SEK: { rate: 3.75, bank: 'Riksbank',         label: 'Policy Rate'     },
  NOK: { rate: 4.50, bank: 'Norges Bank',      label: 'Policy Rate'     },
};

// Currency → ISO2 mapping for non-EUR currencies
const CURRENCY_TO_ISO2 = {
  USD: ['US'], GBP: ['GB'], JPY: ['JP'], CHF: ['CH'],
  AUD: ['AU'], CAD: ['CA'], NZD: ['NZ'], CNY: ['CN'],
  SEK: ['SE'], NOK: ['NO'],
};

// Eurozone members (use ECB rate)
const EUROZONE = [
  'AT','BE','CY','DE','EE','ES','FI','FR','GR','IE',
  'IT','LT','LU','LV','MT','NL','PT','SI','SK',
];

// ── Sovereign credit ratings (from kyahoofinance032926 mockBondsData.js) ──
const CREDIT_RATINGS = [
  { iso2: 'AU', sp: 'AAA',  moodys: 'Aaa',  fitch: 'AAA'  },
  { iso2: 'DE', sp: 'AAA',  moodys: 'Aaa',  fitch: 'AAA'  },
  { iso2: 'NL', sp: 'AAA',  moodys: 'Aaa',  fitch: 'AAA'  },
  { iso2: 'CA', sp: 'AAA',  moodys: 'Aaa',  fitch: 'AA+'  },
  { iso2: 'SE', sp: 'AAA',  moodys: 'Aaa',  fitch: 'AAA'  },
  { iso2: 'US', sp: 'AA+',  moodys: 'Aaa',  fitch: 'AA+'  },
  { iso2: 'GB', sp: 'AA',   moodys: 'Aa3',  fitch: 'AA-'  },
  { iso2: 'FR', sp: 'AA-',  moodys: 'Aa2',  fitch: 'AA-'  },
  { iso2: 'JP', sp: 'A+',   moodys: 'A1',   fitch: 'A'    },
  { iso2: 'CN', sp: 'A+',   moodys: 'A1',   fitch: 'A+'   },
  { iso2: 'IT', sp: 'BBB',  moodys: 'Baa3', fitch: 'BBB'  },
  { iso2: 'BR', sp: 'BB',   moodys: 'Ba1',  fitch: 'BB'   },
];

let cbAdded = 0, ratingsAdded = 0;

// Apply central bank rates ─────────────────────────────────────────────────
for (const [currency, info] of Object.entries(CENTRAL_BANK_RATES)) {
  const iso2List = currency === 'EUR' ? EUROZONE : (CURRENCY_TO_ISO2[currency] || []);
  for (const iso2 of iso2List) {
    if (!countryData[iso2]) countryData[iso2] = {};
    countryData[iso2].cb_rate       = info.rate;
    countryData[iso2].cb_bank       = info.bank;
    countryData[iso2].cb_rate_label = info.label;
    cbAdded++;
  }
}

// Apply credit ratings ────────────────────────────────────────────────────
for (const { iso2, sp, moodys, fitch } of CREDIT_RATINGS) {
  if (!countryData[iso2]) countryData[iso2] = {};
  countryData[iso2].credit_sp     = sp;
  countryData[iso2].credit_moodys = moodys;
  countryData[iso2].credit_fitch  = fitch;
  ratingsAdded++;
}

atomicWrite(COUNTRY_FILE, JSON.stringify(countryData, null, 2), 'utf8');
console.log(`Central bank rates added to ${cbAdded} countries`);
console.log(`Credit ratings added to ${ratingsAdded} countries`);
