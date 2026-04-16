// scripts/enrich-companies-yahoo.js
// One-time enrichment: add Yahoo Finance fundamentals to companies in companies.json.
// Reads matching ticker files from the kyahoofinance032926/data/stocks/ directory.
//
// For companies already Yahoo-enriched (have gross_margin etc.) we still update:
//   analyst_rating, analyst_target_price, analyst_count  (genuinely new fields)
//
// For the few companies with a ticker match but no prior enrichment, we also add:
//   gross_margin, operating_margin, profit_margin, return_on_equity,
//   revenue_growth_yoy, earnings_growth_yoy, beta, pe_forward
//
// Also removes any stale yf_ prefixed keys written by a previous draft run.
//
// Run: node scripts/enrich-companies-yahoo.js
'use strict';
const fs   = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');

const COMPANIES_FILE = path.join(__dirname, '..', 'public', 'companies.json');
const STOCKS_DIR     = path.join('C:', 'Users', 'kevin', 'OneDrive', 'Desktop',
                                 'kyahoofinance032926', 'data', 'stocks');

const YF_STALE_KEYS = [
  'yf_forward_pe','yf_beta','yf_gross_margin','yf_operating_margin',
  'yf_profit_margin','yf_roe','yf_revenue_growth','yf_earnings_growth',
  'yf_target_price','yf_current_price','yf_analyst_rating','yf_analyst_count',
];

const companies = JSON.parse(fs.readFileSync(COMPANIES_FILE, 'utf8'));
const stockFiles = new Set(fs.readdirSync(STOCKS_DIR).map(f => f.replace('.json', '')));

let enriched = 0, analystOnly = 0, skipped = 0;

for (const cityCompanies of Object.values(companies)) {
  for (const company of cityCompanies) {
    // Always remove stale yf_ keys
    for (const k of YF_STALE_KEYS) delete company[k];

    if (!company.ticker || !stockFiles.has(company.ticker)) {
      skipped++;
      continue;
    }

    let stockData;
    try {
      stockData = JSON.parse(
        fs.readFileSync(path.join(STOCKS_DIR, company.ticker + '.json'), 'utf8')
      );
    } catch {
      skipped++;
      continue;
    }

    const summary = stockData.summary;
    if (!summary) { skipped++; continue; }

    const fd  = summary.financialData        || {};
    const ks  = summary.defaultKeyStatistics || {};
    const rt  = summary.recommendationTrend;
    const now = rt && rt.trend && rt.trend.find(t => t.period === '0m');

    // ── New analyst fields (always write if available) ────────────────────────
    if (fd.recommendationKey) company.analyst_rating      = fd.recommendationKey;
    if (fd.targetMeanPrice)   company.analyst_target_price = fd.targetMeanPrice;

    let analystCount = fd.numberOfAnalystOpinions || null;
    if (!analystCount && now) {
      analystCount = (now.strongBuy || 0) + (now.buy || 0) +
                     (now.hold     || 0) + (now.sell || 0) +
                     (now.strongSell || 0);
    }
    if (analystCount) company.analyst_count = analystCount;

    // ── Fundamental fields: fill only if missing ──────────────────────────────
    const fill = (key, val) => {
      if (company[key] == null && val != null && !isNaN(val)) company[key] = val;
    };

    fill('gross_margin',        fd.grossMargins);
    fill('operating_margin',    fd.operatingMargins);
    fill('profit_margin',       fd.profitMargins ?? ks.profitMargins);
    fill('return_on_equity',    fd.returnOnEquity);
    fill('revenue_growth_yoy',  fd.revenueGrowth);
    fill('earnings_growth_yoy', fd.earningsGrowth);
    fill('beta',                ks.beta);
    fill('pe_forward',          ks.forwardPE);

    // Market cap — always update (live data, very low current coverage at 6%)
    const price = summary.price || {};
    if (price.marketCap && price.marketCap > 0) {
      company.market_cap = price.marketCap;
      company.market_cap_currency = price.currency || 'USD';
      company.market_cap_year = new Date().getFullYear();
    }

    // Employees from Yahoo if missing (fullTimeEmployees in summaryProfile)
    const profile = summary.summaryProfile || {};
    fill('employees', profile.fullTimeEmployees);

    enriched++;
    if (!fd.grossMargins) analystOnly++;
  }
}

atomicWrite(COMPANIES_FILE, JSON.stringify(companies, null, 2), 'utf8');
console.log(`Enriched: ${enriched}  (${analystOnly} analyst-only)  Skipped: ${skipped}`);
