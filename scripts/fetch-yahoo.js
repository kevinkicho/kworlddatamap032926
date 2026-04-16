#!/usr/bin/env node
/**
 * fetch-yahoo.js
 * ──────────────
 * Two-phase Yahoo Finance enrichment:
 *
 *   Phase 1 (--tickers):  Search Yahoo Finance by company name → discover ticker symbols.
 *                          Saves discovered tickers back into companies.json.
 *
 *   Phase 2 (--financials): For every company with a ticker, fetch quoteSummary
 *                            (annual income statement, balance sheet, key stats).
 *                            Merges into companies.json — Yahoo data wins over Wikidata
 *                            for financial fields.
 *
 *   Flags:
 *     --tickers      Run Phase 1
 *     --financials   Run Phase 2
 *     --both         Run Phase 1 then Phase 2  (default if no flag given)
 *     --fresh        Ignore checkpoint, restart from beginning
 *     --limit N      Stop after N companies (useful for testing)
 *
 * Rate limiting:
 *   Yahoo Finance enforces ~2 000 req/day on developer tier.
 *   We default to 1.5 s between requests and honour Retry-After on 429.
 *
 * Auth:
 *   Yahoo Finance quoteSummary requires a session cookie + crumb token.
 *   We bootstrap a session by hitting the Yahoo Finance consent page,
 *   then exchange it for a crumb via /v1/test/getcrumb.
 *   The crumb is appended as &crumb=VALUE to all quoteSummary calls.
 *   Search endpoint (/v1/finance/search) works without any auth.
 */

'use strict';
require('dotenv').config();

const fs   = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');
const http = require('https');
const url  = require('url');

// ── Config ────────────────────────────────────────────────────────────────────
const COMPANIES_FILE   = path.join(__dirname, '..', 'public', 'companies.json');
const CHECKPOINT_FILE  = path.join(__dirname, '.yahoo-checkpoint.json');
const DELAY_MS         = 1500;   // ms between normal requests
const RETRY_BASE_MS    = 3_000;  // base wait on 5xx — short, most 500s = no data not overload
const MAX_RETRIES      = 2;      // 2 retries max, then move on

// ── CLI flags ─────────────────────────────────────────────────────────────────
const args         = process.argv.slice(2);
const FRESH        = args.includes('--fresh');
const RUN_TICKERS  = args.includes('--tickers')   || args.includes('--both') || args.length === 0;
const RUN_FINS     = args.includes('--financials') || args.includes('--both') || args.length === 0;
const limitIdx     = args.indexOf('--limit');
const LIMIT        = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

// ── Crumb / cookie session ────────────────────────────────────────────────────
// Yahoo Finance quoteSummary requires a valid session cookie + crumb.
// Flow: GET consent page → collect Set-Cookie → GET /getcrumb → crumb string.
let _crumb   = null;
let _cookies = '';

async function initSession() {
  if (_crumb) return;
  console.log('[session] Initialising Yahoo Finance session…');

  // Step 1: hit the main finance page (follows consent redirect automatically)
  const r1 = await httpGetRaw('https://fc.yahoo.com', {});
  const raw1 = await httpGetRaw('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    Cookie: r1.cookies,
  });

  if (raw1.status === 200 && raw1.body && !raw1.body.startsWith('{')) {
    _crumb   = raw1.body.trim();
    _cookies = r1.cookies;
    console.log('[session] Crumb obtained:', _crumb);
    return;
  }

  // Fallback: try fetching a finance page first for a richer cookie
  const r2 = await httpGetRaw('https://finance.yahoo.com', {});
  _cookies = r2.cookies;
  const raw2 = await httpGetRaw('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    Cookie: _cookies,
  });
  if (raw2.status === 200 && raw2.body && !raw2.body.startsWith('{')) {
    _crumb = raw2.body.trim();
    console.log('[session] Crumb obtained (fallback):', _crumb);
  } else {
    console.warn('[session] Could not obtain crumb — quoteSummary calls may fail.');
    _crumb = '';
  }
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────
const UA = 'Mozilla/5.0 (compatible; kworlddatamap/1.0; educational non-commercial)';

// Raw GET — returns { status, headers, body, cookies }
function httpGetRaw(urlStr, extraHeaders = {}, hops = 5) {
  return new Promise((resolve) => {
    if (hops <= 0) return resolve({ status: 0, headers: {}, body: '', cookies: '' });
    let u;
    try { u = new url.URL(urlStr); } catch { return resolve({ status: 0, headers: {}, body: '', cookies: '' }); }
    const opts = {
      hostname: u.hostname, port: 443,
      path: u.pathname + u.search,
      method: 'GET',
      headers: { 'User-Agent': UA, Accept: '*/*', ...extraHeaders },
    };
    const req = http.request(opts, r => {
      // Collect Set-Cookie
      const sc = r.headers['set-cookie'] || [];
      const cookies = sc.map(c => c.split(';')[0]).join('; ');

      if ((r.statusCode === 301 || r.statusCode === 302 || r.statusCode === 307) && r.headers.location) {
        const next = r.headers.location.startsWith('http')
          ? r.headers.location
          : `https://${u.hostname}${r.headers.location}`;
        // Pass accumulated cookies on redirect
        return resolve(httpGetRaw(next, { ...extraHeaders, Cookie: [extraHeaders.Cookie, cookies].filter(Boolean).join('; ') }, hops - 1));
      }
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => resolve({ ok: r.statusCode < 300, status: r.statusCode, headers: r.headers, body: d, cookies }));
    });
    req.on('error', e => resolve({ ok: false, status: 0, headers: {}, body: e.message, cookies: '' }));
    req.end();
  });
}

async function apiGet(urlStr, attempt = 1) {
  await initSession();
  const res = await httpGetRaw(urlStr, { Cookie: _cookies });

  if (res.status === 401 && attempt === 1) {
    // Crumb expired — reset session and retry once
    _crumb = null; _cookies = '';
    await initSession();
    return apiGet(urlStr, 2);
  }
  if (res.status === 429) {
    const wait = parseInt(res.headers?.['retry-after'] || '60', 10) * 1000 + 2000;
    console.warn(`  429 rate-limited — waiting ${(wait/1000).toFixed(0)}s`);
    await sleep(wait);
    return apiGet(urlStr, attempt);
  }
  if (res.status >= 500 && attempt <= MAX_RETRIES) {
    const wait = RETRY_BASE_MS * attempt;
    console.warn(`  ${res.status} server error — retry ${attempt}/${MAX_RETRIES} in ${wait/1000}s`);
    await sleep(wait);
    return apiGet(urlStr, attempt + 1);
  }
  return res;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Checkpoint helpers ────────────────────────────────────────────────────────
function loadCheckpoint() {
  if (FRESH || !fs.existsSync(CHECKPOINT_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8')); }
  catch { return {}; }
}
function saveCheckpoint(cp) {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(cp), 'utf8');
}

// ── Yahoo Finance endpoints ───────────────────────────────────────────────────
// These are the standard Yahoo Finance data endpoints (same data Yahoo Finance
// website uses). No special auth needed for public market data — our OAuth
// token is sent as Bearer but the endpoints work without it too.
const YF_BASE = 'https://query1.finance.yahoo.com';

async function searchTicker(companyName) {
  const q = encodeURIComponent(companyName);
  const res = await httpGetRaw(`${YF_BASE}/v1/finance/search?q=${q}&quotesCount=5&newsCount=0&listsCount=0`);
  if (!res.ok) return null;
  try {
    const j = JSON.parse(res.body);
    // Response is flat: { quotes: [...], news: [...], ... }
    const quotes = j?.quotes || j?.finance?.result?.[0]?.quotes || [];
    // Prefer EQUITY type, then prefer US exchange (no dot in symbol = US-listed ADR)
    const equity = quotes.filter(q => q.quoteType === 'EQUITY');
    if (!equity.length) return null;

    // Score by name similarity using common-prefix + token overlap
    const norm  = s => (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const tokens = s => norm(s).split(/\s+/).filter(Boolean);
    const target = norm(companyName);
    const targetToks = tokens(companyName);

    let best = null, bestScore = -1;
    for (const q of equity) {
      const name  = norm(q.longname || q.shortname || '');
      const toks  = tokens(q.longname || q.shortname || '');
      // Token intersection score
      const shared = targetToks.filter(t => toks.includes(t)).length;
      const tokScore = shared / Math.max(targetToks.length, toks.length, 1);
      // Character prefix score
      let matches = 0;
      for (let i = 0; i < Math.min(target.length, name.length); i++) {
        if (target[i] === name[i]) matches++;
      }
      const charScore = matches / Math.max(target.length, name.length, 1);
      const score = (tokScore * 0.7) + (charScore * 0.3);
      if (score > bestScore) { bestScore = score; best = q; }
    }
    if (bestScore < 0.35) return null; // too uncertain
    // Prefer US-listed symbol (no exchange suffix like .T, .DE) when score is similar
    const usListed = equity.find(q => !/\.\w+$/.test(q.symbol) && norm(q.longname || q.shortname || '') === norm(best?.longname || best?.shortname || ''));
    return (usListed || best)?.symbol || null;
  } catch { return null; }
}

// Modules to request from quoteSummary
// All available quoteSummary modules — one API call per company gets everything.
const SUMMARY_MODULES = [
  // Financials — annual + quarterly
  'incomeStatementHistory',
  'incomeStatementHistoryQuarterly',
  'balanceSheetHistory',
  'balanceSheetHistoryQuarterly',
  'cashflowStatementHistory',
  'cashflowStatementHistoryQuarterly',
  // Stats & ratios
  'defaultKeyStatistics',
  'financialData',
  'summaryDetail',
  // Profile
  'summaryProfile',
  'assetProfile',
  'quoteType',
  'price',
  // Earnings
  'earnings',
  'earningsHistory',
  'earningsTrend',
  // Analyst coverage
  'recommendationTrend',
  'upgradeDowngradeHistory',
  // Ownership
  'majorHoldersBreakdown',
  'institutionOwnership',
  'fundOwnership',
  'insiderHolders',
  'insiderTransactions',
  'netSharePurchaseActivity',
  // Calendar
  'calendarEvents',
  // ESG
  'esgScores',
].join(',');

async function fetchQuoteSummary(ticker) {
  await initSession();
  const crumbParam = _crumb ? `&crumb=${encodeURIComponent(_crumb)}` : '';
  const res = await apiGet(
    `${YF_BASE}/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${SUMMARY_MODULES}${crumbParam}`
  );
  if (!res.ok) return null;
  try { return JSON.parse(res.body)?.quoteSummary?.result?.[0] || null; }
  catch { return null; }
}

// ── Data extraction from quoteSummary ─────────────────────────────────────────
function r(obj, key) { return obj?.[key]?.raw ?? null; }  // shorthand: extract .raw
function f(obj, key) { return obj?.[key]?.fmt  ?? null; }  // extract .fmt (formatted string)

function yearFromDate(unixTs) {
  if (!unixTs) return null;
  return new Date(unixTs * 1000).getFullYear();
}

function extractAll(summary, ticker) {
  if (!summary) return null;
  const result = { ticker };

  // ── Profile ───────────────────────────────────────────────────────────────
  const ap = summary.assetProfile || summary.summaryProfile || {};
  const sp = summary.summaryProfile || {};
  if (ap.sector)                result.sector              = ap.sector;
  if (ap.industry)              result.industry_yahoo      = ap.industry;
  if (ap.fullTimeEmployees)     result.employees_yahoo     = ap.fullTimeEmployees;
  if (sp.longBusinessSummary)   result.description_yahoo   = sp.longBusinessSummary.slice(0, 1200);
  if (ap.country)               result.hq_country_yahoo    = ap.country;
  if (ap.city)                  result.hq_city_yahoo       = ap.city;
  if (ap.state)                 result.hq_state_yahoo      = ap.state;
  if (ap.address1)              result.hq_address_yahoo    = ap.address1;
  if (ap.website)               result.website_yahoo       = ap.website;
  if (ap.phone)                 result.phone_yahoo         = ap.phone;
  // Company officers (CEO, CFO, etc.)
  if (ap.companyOfficers?.length) {
    result.officers_yahoo = ap.companyOfficers.map(o => ({
      name:  o.name,
      title: o.title,
      age:   o.age || null,
      pay:   r(o, 'totalPay'),
    }));
  }

  // ── Quote type & price info ───────────────────────────────────────────────
  const qt = summary.quoteType || {};
  if (qt.exchange)      result.exchange_yahoo      = qt.exchange;
  if (qt.exchangeName)  result.exchange_name_yahoo = qt.exchangeName;
  if (qt.quoteType)     result.quote_type          = qt.quoteType;
  if (qt.longName)      result.long_name_yahoo     = qt.longName;
  if (qt.currency)      result.currency_yahoo      = qt.currency;

  const pr = summary.price || {};
  if (r(pr,'marketCap'))         result.market_cap_yahoo       = r(pr,'marketCap');
  if (r(pr,'regularMarketPrice')) result.last_price_yahoo      = r(pr,'regularMarketPrice');
  if (pr.currency)               result.currency_yahoo         = pr.currency;

  // ── Summary detail (trading stats) ───────────────────────────────────────
  const sd = summary.summaryDetail || {};
  if (r(sd,'trailingPE'))        result.pe_trailing            = r(sd,'trailingPE');
  if (r(sd,'forwardPE'))         result.pe_forward             = r(sd,'forwardPE');
  if (r(sd,'priceToSalesTrailing12Months')) result.ps_ratio   = r(sd,'priceToSalesTrailing12Months');
  if (r(sd,'dividendYield'))     result.dividend_yield         = r(sd,'dividendYield');
  if (r(sd,'dividendRate'))      result.dividend_rate          = r(sd,'dividendRate');
  if (r(sd,'exDividendDate'))    result.ex_dividend_date       = r(sd,'exDividendDate');
  if (r(sd,'payoutRatio'))       result.payout_ratio           = r(sd,'payoutRatio');
  if (r(sd,'fiftyTwoWeekHigh'))  result.week52_high            = r(sd,'fiftyTwoWeekHigh');
  if (r(sd,'fiftyTwoWeekLow'))   result.week52_low             = r(sd,'fiftyTwoWeekLow');
  if (r(sd,'averageVolume'))     result.avg_volume             = r(sd,'averageVolume');
  if (r(sd,'marketCap'))         result.market_cap_yahoo       = result.market_cap_yahoo || r(sd,'marketCap');

  // ── Key statistics ────────────────────────────────────────────────────────
  const ks = summary.defaultKeyStatistics || {};
  if (r(ks,'enterpriseValue'))   result.enterprise_value       = r(ks,'enterpriseValue');
  if (r(ks,'trailingEps'))       result.eps_trailing           = r(ks,'trailingEps');
  if (r(ks,'forwardEps'))        result.eps_forward            = r(ks,'forwardEps');
  if (r(ks,'pegRatio'))          result.peg_ratio              = r(ks,'pegRatio');
  if (r(ks,'priceToBook'))       result.price_to_book          = r(ks,'priceToBook');
  if (r(ks,'enterpriseToRevenue')) result.ev_to_revenue        = r(ks,'enterpriseToRevenue');
  if (r(ks,'enterpriseToEbitda')) result.ev_to_ebitda          = r(ks,'enterpriseToEbitda');
  if (r(ks,'sharesOutstanding')) result.shares_outstanding     = r(ks,'sharesOutstanding');
  if (r(ks,'floatShares'))       result.float_shares           = r(ks,'floatShares');
  if (r(ks,'sharesShort'))       result.shares_short           = r(ks,'sharesShort');
  if (r(ks,'shortRatio'))        result.short_ratio            = r(ks,'shortRatio');
  if (r(ks,'shortPercentOfFloat')) result.short_pct_float      = r(ks,'shortPercentOfFloat');
  if (r(ks,'heldPercentInsiders')) result.pct_insider          = r(ks,'heldPercentInsiders');
  if (r(ks,'heldPercentInstitutions')) result.pct_institutional = r(ks,'heldPercentInstitutions');
  if (r(ks,'bookValue'))         result.book_value_per_share   = r(ks,'bookValue');
  if (r(ks,'beta'))              result.beta                   = r(ks,'beta');
  if (r(ks,'52WeekChange'))      result.week52_change          = r(ks,'52WeekChange');
  if (r(ks,'lastDividendDate'))  result.last_dividend_date     = r(ks,'lastDividendDate');
  if (r(ks,'lastSplitDate'))     result.last_split_date        = r(ks,'lastSplitDate');
  if (ks.lastSplitFactor)        result.last_split_factor      = ks.lastSplitFactor;

  // ── Current financials ────────────────────────────────────────────────────
  const fd = summary.financialData || {};
  if (r(fd,'totalRevenue'))      result.revenue_yahoo          = r(fd,'totalRevenue');
  if (r(fd,'grossProfits'))      result.gross_profit           = r(fd,'grossProfits');
  if (r(fd,'ebitda'))            result.ebitda                 = r(fd,'ebitda');
  if (r(fd,'netIncomeToCommon')) result.net_income_yahoo       = r(fd,'netIncomeToCommon');
  if (r(fd,'totalDebt'))         result.total_debt             = r(fd,'totalDebt');
  if (r(fd,'totalCash'))         result.total_cash             = r(fd,'totalCash');
  if (r(fd,'totalCashPerShare')) result.cash_per_share         = r(fd,'totalCashPerShare');
  if (r(fd,'operatingCashflow')) result.operating_cashflow     = r(fd,'operatingCashflow');
  if (r(fd,'freeCashflow'))      result.free_cashflow          = r(fd,'freeCashflow');
  if (r(fd,'operatingMargins'))  result.operating_margin       = r(fd,'operatingMargins');
  if (r(fd,'profitMargins'))     result.profit_margin          = r(fd,'profitMargins');
  if (r(fd,'grossMargins'))      result.gross_margin           = r(fd,'grossMargins');
  if (r(fd,'ebitdaMargins'))     result.ebitda_margin          = r(fd,'ebitdaMargins');
  if (r(fd,'returnOnAssets'))    result.return_on_assets       = r(fd,'returnOnAssets');
  if (r(fd,'returnOnEquity'))    result.return_on_equity       = r(fd,'returnOnEquity');
  if (r(fd,'debtToEquity'))      result.debt_to_equity         = r(fd,'debtToEquity');
  if (r(fd,'currentRatio'))      result.current_ratio          = r(fd,'currentRatio');
  if (r(fd,'quickRatio'))        result.quick_ratio            = r(fd,'quickRatio');
  if (r(fd,'revenueGrowth'))     result.revenue_growth_yoy     = r(fd,'revenueGrowth');
  if (r(fd,'earningsGrowth'))    result.earnings_growth_yoy    = r(fd,'earningsGrowth');
  if (r(fd,'revenuePerShare'))   result.revenue_per_share      = r(fd,'revenuePerShare');

  // ── Annual income statement history ──────────────────────────────────────
  const incA = summary.incomeStatementHistory?.incomeStatementHistory || [];
  result.income_annual = incA.map(s => ({
    year:              yearFromDate(r(s,'endDate')),
    revenue:           r(s,'totalRevenue'),
    cost_of_revenue:   r(s,'costOfRevenue'),
    gross_profit:      r(s,'grossProfit'),
    rd_expense:        r(s,'researchDevelopment'),
    sga_expense:       r(s,'sellingGeneralAdministrative'),
    operating_income:  r(s,'operatingIncome'),
    ebit:              r(s,'ebit'),
    interest_expense:  r(s,'interestExpense'),
    income_before_tax: r(s,'incomeBeforeTax'),
    net_income:        r(s,'netIncome'),
    eps:               r(s,'basicEps'),
    eps_diluted:       r(s,'dilutedEps'),
  })).filter(s => s.year).sort((a,b) => a.year - b.year);

  // ── Quarterly income statement history ───────────────────────────────────
  const incQ = summary.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];
  result.income_quarterly = incQ.map(s => ({
    date:              f(s,'endDate'),
    year:              yearFromDate(r(s,'endDate')),
    revenue:           r(s,'totalRevenue'),
    gross_profit:      r(s,'grossProfit'),
    operating_income:  r(s,'operatingIncome'),
    net_income:        r(s,'netIncome'),
    eps_diluted:       r(s,'dilutedEps'),
  })).filter(s => s.year).sort((a,b) => (a.date||'') < (b.date||'') ? -1 : 1);

  // ── Annual balance sheet history ──────────────────────────────────────────
  const bsA = summary.balanceSheetHistory?.balanceSheetStatements || [];
  result.balance_sheet_annual = bsA.map(s => ({
    year:              yearFromDate(r(s,'endDate')),
    cash:              r(s,'cash'),
    short_investments: r(s,'shortTermInvestments'),
    net_receivables:   r(s,'netReceivables'),
    inventory:         r(s,'inventory'),
    total_current_assets: r(s,'totalCurrentAssets'),
    ppe_net:           r(s,'propertyPlantEquipment'),
    goodwill:          r(s,'goodwill'),
    intangibles:       r(s,'intangibleAssets'),
    total_assets:      r(s,'totalAssets'),
    short_term_debt:   r(s,'shortLongTermDebt'),
    total_current_liabilities: r(s,'totalCurrentLiabilities'),
    long_term_debt:    r(s,'longTermDebt'),
    total_liabilities: r(s,'totalLiab'),
    total_equity:      r(s,'totalStockholderEquity'),
    retained_earnings: r(s,'retainedEarnings'),
  })).filter(s => s.year).sort((a,b) => a.year - b.year);

  // ── Quarterly balance sheet ───────────────────────────────────────────────
  const bsQ = summary.balanceSheetHistoryQuarterly?.balanceSheetStatements || [];
  result.balance_sheet_quarterly = bsQ.map(s => ({
    date:          f(s,'endDate'),
    year:          yearFromDate(r(s,'endDate')),
    cash:          r(s,'cash'),
    total_assets:  r(s,'totalAssets'),
    total_debt:    r(s,'longTermDebt'),
    total_equity:  r(s,'totalStockholderEquity'),
  })).filter(s => s.year).sort((a,b) => (a.date||'') < (b.date||'') ? -1 : 1);

  // ── Annual cash flow history ──────────────────────────────────────────────
  const cfA = summary.cashflowStatementHistory?.cashflowStatements || [];
  result.cashflow_annual = cfA.map(s => ({
    year:               yearFromDate(r(s,'endDate')),
    operating_cf:       r(s,'totalCashFromOperatingActivities'),
    capex:              r(s,'capitalExpenditures'),
    free_cash_flow:     r(s,'freeCashflow'),
    investing_cf:       r(s,'totalCashflowsFromInvestingActivities'),
    financing_cf:       r(s,'totalCashFromFinancingActivities'),
    dividends_paid:     r(s,'dividendsPaid'),
    stock_repurchased:  r(s,'repurchaseOfStock'),
    depreciation:       r(s,'depreciation'),
    net_income:         r(s,'netIncome'),
    change_in_cash:     r(s,'changeInCash'),
  })).filter(s => s.year).sort((a,b) => a.year - b.year);

  // ── Quarterly cash flow ───────────────────────────────────────────────────
  const cfQ = summary.cashflowStatementHistoryQuarterly?.cashflowStatements || [];
  result.cashflow_quarterly = cfQ.map(s => ({
    date:           f(s,'endDate'),
    year:           yearFromDate(r(s,'endDate')),
    operating_cf:   r(s,'totalCashFromOperatingActivities'),
    capex:          r(s,'capitalExpenditures'),
    free_cash_flow: r(s,'freeCashflow'),
  })).filter(s => s.year).sort((a,b) => (a.date||'') < (b.date||'') ? -1 : 1);

  // ── Earnings (quarterly EPS actual vs estimate) ───────────────────────────
  const eq = summary.earnings?.earningsChart?.quarterly || [];
  result.earnings_quarterly = eq.map(q => ({
    date:     q.date,
    actual:   r(q,'actual'),
    estimate: r(q,'estimate'),
  })).filter(q => q.date);

  // ── Earnings history (EPS surprises) ─────────────────────────────────────
  const eh = summary.earningsHistory?.history || [];
  result.earnings_history = eh.map(h => ({
    date:       f(h,'quarter'),
    eps_actual: r(h,'epsActual'),
    eps_est:    r(h,'epsEstimate'),
    surprise:   r(h,'epsDifference'),
    surprise_pct: r(h,'surprisePercent'),
  })).filter(h => h.date);

  // ── Analyst recommendations trend ─────────────────────────────────────────
  const rt = summary.recommendationTrend?.trend || [];
  result.analyst_recommendations = rt.map(t => ({
    period:      t.period,
    strong_buy:  t.strongBuy,
    buy:         t.buy,
    hold:        t.hold,
    sell:        t.sell,
    strong_sell: t.strongSell,
  })).filter(t => t.period);

  // ── Upgrade/downgrade history (most recent 10) ────────────────────────────
  const ug = summary.upgradeDowngradeHistory?.history || [];
  result.analyst_actions = ug.slice(0, 10).map(u => ({
    date:   u.epochGradeDate ? new Date(u.epochGradeDate * 1000).toISOString().slice(0,10) : null,
    firm:   u.firm,
    action: u.action,
    from:   u.fromGrade,
    to:     u.toGrade,
  })).filter(u => u.date);

  // ── Earnings trend (forward estimates) ────────────────────────────────────
  const et = summary.earningsTrend?.trend || [];
  result.earnings_estimates = et.map(t => ({
    period:          t.period,
    revenue_est:     r(t.revenueEstimate,'avg'),
    eps_est:         r(t.earningsEstimate,'avg'),
    growth_est:      r(t,'growth'),
  })).filter(t => t.period);

  // ── Ownership ─────────────────────────────────────────────────────────────
  const mh = summary.majorHoldersBreakdown || {};
  if (r(mh,'insidersPercentHeld')) result.pct_insider       = r(mh,'insidersPercentHeld');
  if (r(mh,'institutionsPercentHeld')) result.pct_institutional = r(mh,'institutionsPercentHeld');

  const instOwn = summary.institutionOwnership?.ownershipList || [];
  result.top_institutions = instOwn.slice(0, 10).map(o => ({
    name:    o.organization,
    shares:  r(o,'position'),
    pct:     r(o,'pctHeld'),
  })).filter(o => o.name);

  const fundOwn = summary.fundOwnership?.ownershipList || [];
  result.top_funds = fundOwn.slice(0, 10).map(o => ({
    name:    o.organization,
    shares:  r(o,'position'),
    pct:     r(o,'pctHeld'),
  })).filter(o => o.name);

  const insiders = summary.insiderHolders?.holders || [];
  result.insider_holders = insiders.map(o => ({
    name:       o.name,
    relation:   o.relation,
    shares:     r(o,'positionDirect'),
    pct:        r(o,'positionDirectDate') ? null : null,
    latest_buy: r(o,'latestTransType') ? o.latestTransType : null,
  })).filter(o => o.name);

  // ── Calendar events ───────────────────────────────────────────────────────
  const cal = summary.calendarEvents || {};
  if (cal.earnings?.earningsDate?.length) {
    result.next_earnings_date = f(cal.earnings.earningsDate[0], null) || null;
  }
  if (r(cal,'exDividendDate')) result.ex_dividend_date = r(cal,'exDividendDate');

  // ── ESG scores ────────────────────────────────────────────────────────────
  const esg = summary.esgScores || {};
  if (r(esg,'totalEsg'))         result.esg_total       = r(esg,'totalEsg');
  if (r(esg,'environmentScore')) result.esg_environment = r(esg,'environmentScore');
  if (r(esg,'socialScore'))      result.esg_social      = r(esg,'socialScore');
  if (r(esg,'governanceScore'))  result.esg_governance  = r(esg,'governanceScore');
  if (esg.peerGroup)             result.esg_peer_group  = esg.peerGroup;

  // ── Keep backward-compat aliases used by app.js display ──────────────────
  result.revenue_history_yahoo      = result.income_annual?.map(s => ({
    year: s.year, revenue: s.revenue, gross_profit: s.gross_profit,
    net_income: s.net_income, ebit: s.ebit,
  })) || [];
  result.cashflow_history_yahoo     = result.cashflow_annual || [];
  result.balance_sheet_history_yahoo = result.balance_sheet_annual || [];

  return result;
}

// ── Merge Yahoo data into existing company object ─────────────────────────────
// Yahoo wins for financial fields; Wikidata fields kept where Yahoo has nothing.
function mergeYahoo(co, yf) {
  if (!yf) return;

  if (yf.ticker) co.ticker = yf.ticker;

  // Profile — Yahoo fills in, Wikidata kept if richer
  if (yf.sector)                              co.sector            = yf.sector;
  if (yf.industry_yahoo && !co.industry)      co.industry          = yf.industry_yahoo;
  if (yf.employees_yahoo)                     co.employees_yahoo   = yf.employees_yahoo;
  if (yf.description_yahoo && !co.description) co.description      = yf.description_yahoo;
  if (yf.website_yahoo && !co.website)        co.website           = yf.website_yahoo;
  if (yf.hq_country_yahoo)                    co.hq_country_yahoo  = yf.hq_country_yahoo;
  if (yf.hq_city_yahoo)                       co.hq_city_yahoo     = yf.hq_city_yahoo;
  if (yf.currency_yahoo)                      co.currency_yahoo    = yf.currency_yahoo;
  if (yf.long_name_yahoo)                     co.long_name_yahoo   = yf.long_name_yahoo;
  if (yf.exchange_yahoo)                      co.exchange_yahoo    = yf.exchange_yahoo;
  if (yf.officers_yahoo)                      co.officers_yahoo    = yf.officers_yahoo;

  // All financial + market + ownership fields — Yahoo always wins
  const COPY = [
    // Market
    'market_cap_yahoo','last_price_yahoo','enterprise_value',
    'pe_trailing','pe_forward','ps_ratio','peg_ratio',
    'price_to_book','ev_to_revenue','ev_to_ebitda',
    'dividend_yield','dividend_rate','payout_ratio',
    'week52_high','week52_low','week52_change','avg_volume','beta',
    'eps_trailing','eps_forward',
    'shares_outstanding','float_shares','shares_short','short_ratio','short_pct_float',
    'book_value_per_share','last_split_date','last_split_factor',
    'pct_insider','pct_institutional',
    // Current financials
    'revenue_yahoo','gross_profit','ebitda','net_income_yahoo',
    'total_debt','total_cash','cash_per_share',
    'operating_cashflow','free_cashflow',
    'operating_margin','profit_margin','gross_margin','ebitda_margin',
    'return_on_assets','return_on_equity',
    'debt_to_equity','current_ratio','quick_ratio',
    'revenue_growth_yoy','earnings_growth_yoy','revenue_per_share',
    // Historical series
    'income_annual','income_quarterly',
    'balance_sheet_annual','balance_sheet_quarterly',
    'cashflow_annual','cashflow_quarterly',
    'earnings_quarterly','earnings_history',
    'earnings_estimates',
    'analyst_recommendations','analyst_actions',
    'top_institutions','top_funds','insider_holders',
    // ESG
    'esg_total','esg_environment','esg_social','esg_governance','esg_peer_group',
    // Backward-compat aliases
    'revenue_history_yahoo','cashflow_history_yahoo','balance_sheet_history_yahoo',
  ];
  for (const f of COPY) {
    if (yf[f] != null) co[f] = yf[f];
  }
}

// ── Phase 1: Ticker discovery ─────────────────────────────────────────────────
async function runTickerPhase(companies) {
  const cp = loadCheckpoint();
  if (!cp.tickersDone) cp.tickersDone = {};

  let done = 0, found = 0, tried = 0;
  const noTicker = [];
  for (const [cityQid, cos] of Object.entries(companies)) {
    for (const co of cos) {
      if (!co.qid) continue;
      if (co.ticker || cp.tickersDone[co.qid]) { done++; continue; }
      noTicker.push({ cityQid, co });
    }
  }

  console.log(`\n── Phase 1: Ticker discovery ──`);
  console.log(`Already have ticker or searched: ${done}`);
  console.log(`Remaining to search: ${noTicker.length}`);

  for (const { co } of noTicker) {
    if (tried >= LIMIT) break;
    tried++;
    process.stdout.write(`[${tried}/${noTicker.length}] Searching "${co.name}"… `);
    const ticker = await searchTicker(co.name);
    if (ticker) {
      co.ticker = ticker;
      found++;
      console.log(`→ ${ticker}`);
    } else {
      console.log('not found');
    }
    cp.tickersDone[co.qid] = true;

    // Save checkpoint + file every 100 companies
    if (tried % 100 === 0) {
      saveCheckpoint(cp);
      atomicWrite(COMPANIES_FILE, JSON.stringify(companies));
      console.log(`  [checkpoint saved — ${found} tickers found so far]`);
    }
    await sleep(DELAY_MS);
  }

  saveCheckpoint(cp);
  atomicWrite(COMPANIES_FILE, JSON.stringify(companies));
  console.log(`\nPhase 1 done. Found ${found} new tickers out of ${tried} searched.\n`);
}

// ── Phase 2: Financial data fetch ─────────────────────────────────────────────
async function runFinancialsPhase(companies) {
  const cp = loadCheckpoint();
  if (!cp.financialsDone) cp.financialsDone = {};

  const withTicker = [];
  for (const [cityQid, cos] of Object.entries(companies)) {
    for (const co of cos) {
      if (co.ticker && co.qid && !cp.financialsDone[co.qid]) {
        withTicker.push({ cityQid, co });
      }
    }
  }

  console.log(`\n── Phase 2: Financial data fetch ──`);
  console.log(`Companies with tickers to fetch: ${withTicker.length}`);

  let fetched = 0, failed = 0;
  for (const { co } of withTicker) {
    if (fetched + failed >= LIMIT) break;
    process.stdout.write(`[${fetched+failed+1}/${withTicker.length}] ${co.ticker} (${co.name})… `);

    const summary = await fetchQuoteSummary(co.ticker);
    if (summary) {
      const yf = extractAll(summary, co.ticker);
      mergeYahoo(co, yf);
      fetched++;
      const revYears = yf?.revenue_history_yahoo?.length || 0;
      console.log(`OK (${revYears} revenue years)`);
    } else {
      failed++;
      console.log('no data');
    }
    cp.financialsDone[co.qid] = true;

    // Checkpoint every 50
    if ((fetched + failed) % 50 === 0) {
      saveCheckpoint(cp);
      atomicWrite(COMPANIES_FILE, JSON.stringify(companies));
      console.log(`  [checkpoint — ${fetched} fetched, ${failed} failed]`);
    }
    await sleep(DELAY_MS);
  }

  saveCheckpoint(cp);
  atomicWrite(COMPANIES_FILE, JSON.stringify(companies));
  console.log(`\nPhase 2 done. ${fetched} companies enriched, ${failed} failed.\n`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log('Loading companies.json…');
  const companies = JSON.parse(fs.readFileSync(COMPANIES_FILE, 'utf8'));
  const total = Object.values(companies).flat().length;
  console.log(`${total} companies loaded across ${Object.keys(companies).length} cities`);

  if (RUN_TICKERS)  await runTickerPhase(companies);
  if (RUN_FINS)     await runFinancialsPhase(companies);

  // Final coverage report
  const all = Object.values(companies).flat();
  const withTicker  = all.filter(c => c.ticker).length;
  const withRevYahoo = all.filter(c => c.revenue_yahoo).length;
  const withHistory  = all.filter(c => c.revenue_history_yahoo?.length).length;
  console.log('── Coverage after run ──');
  console.log(`Tickers:          ${withTicker} / ${all.length}`);
  console.log(`Revenue (Yahoo):  ${withRevYahoo}`);
  console.log(`Revenue history:  ${withHistory}`);
})();
