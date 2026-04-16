import { S } from './state.js';
import { escHtml, escAttr, fmtRevenue, fmtEmployees } from './utils.js';
import { toUSD } from './fx-sidebar.js';
import { ISO2_TO_CURRENCY } from './constants.js';

let _openCompanyWikiPanel = () => {};

export function initCorporationsList(callbacks) {
  _openCompanyWikiPanel = callbacks.openCompanyWikiPanel || _openCompanyWikiPanel;
}

const GCORP_PAGE = 100;

export function buildGlobalCorpList() {
  S.globalCorpList = [];
  const _globalSeenQids = new Set();
  for (const [qid, companies] of Object.entries(S.companiesData)) {
    const city = S.cityByQid.get(qid);
    const cityName = city ? city.name : '—';
    const country = city ? (city.country || '') : '';
    for (const co of companies) {
      if (co.qid && _globalSeenQids.has(co.qid)) continue;
      if (co.qid) _globalSeenQids.add(co.qid);
      const fallbackCur = city ? (ISO2_TO_CURRENCY[city.iso] || null) : null;
      let revenueUSD = co.revenue ? toUSD(co.revenue, co.revenue_currency || fallbackCur) : 0;
      if (revenueUSD > 5e12 && fallbackCur && fallbackCur !== co.revenue_currency) {
        const altUSD = toUSD(co.revenue, fallbackCur);
        if (altUSD > 0 && altUSD < revenueUSD) revenueUSD = altUSD;
      }
      S.globalCorpList.push({ co, cityName, country, cityQid: qid, revenueUSD });
    }
  }

  const countryCounts = {};
  S.globalCorpList.forEach(e => { if (e.country) countryCounts[e.country] = (countryCounts[e.country] || 0) + 1; });
  const countries = Object.keys(countryCounts).sort();
  const cDrop = document.getElementById('gcorp-country');
  _populateCountDropdown(cDrop, 'All countries', '', countries, countryCounts, S.globalCorpList.length);

  const industryCounts = {};
  S.globalCorpList.forEach(e => { if (e.co && e.co.industry) industryCounts[e.co.industry] = (industryCounts[e.co.industry] || 0) + 1; });
  const industries = Object.keys(industryCounts).sort();
  const iDrop = document.getElementById('gcorp-industry');
  _populateCountDropdown(iDrop, 'All industries', '', industries, industryCounts, S.globalCorpList.length);

  renderGlobalCorpList();
  if (window.innerWidth <= 768) {
    const activeTab = document.querySelector('.list-tab.active');
    document.getElementById('global-corp-panel').style.display = (activeTab && activeTab.dataset.tab === 'corps') ? '' : 'none';
  }
}

function _gcorpFinJson(co) {
  const detail = S.companiesDetailData?.[co.qid] || {};
  return escHtml(JSON.stringify({
    qid: co.qid || null,
    description: detail.description || null,
    industry: co.industry || null, exchange: co.exchange || null,
    ticker: co.ticker || null, traded_as: detail.traded_as || null,
    founded: co.founded || null, company_type: co.company_type || null,
    website: detail.website || null,
    ceo: detail.ceo || null, key_people: detail.key_people || null,
    founders: detail.founders || null, parent_org: detail.parent_org || null,
    products: detail.products || null, subsidiaries: detail.subsidiaries || null,
    employees: co.employees || null, employees_history: detail.employees_history || [],
    revenue: co.revenue || null, revenue_year: co.revenue_year || null,
    revenue_currency: co.revenue_currency || null, revenue_history: detail.revenue_history || [],
    net_income: co.net_income || null, net_income_currency: co.net_income_currency || null, net_income_history: detail.net_income_history || [],
    operating_income: detail.operating_income || null, operating_income_currency: detail.operating_income_currency || null, operating_income_history: detail.operating_income_history || [],
    total_assets: detail.total_assets || null, total_assets_currency: detail.total_assets_currency || null, total_assets_history: detail.total_assets_history || [],
    total_equity: detail.total_equity || null, total_equity_currency: detail.total_equity_currency || null, total_equity_history: detail.total_equity_history || [],
    market_cap: co.market_cap || null, market_cap_year: co.market_cap_year || null, market_cap_currency: co.market_cap_currency || null,
    analyst_rating: detail.analyst_rating || null,
    analyst_target_price: detail.analyst_target_price || null,
    analyst_count: detail.analyst_count || null,
    gross_margin: detail.gross_margin || null,
    operating_margin: detail.operating_margin || null,
    profit_margin: detail.profit_margin || null,
    return_on_equity: detail.return_on_equity || null,
    beta: detail.beta || null,
    pe_forward: detail.pe_forward || null,
  }));
}

export function renderGlobalCorpList() {
  const q = S.gcorpQuery.toLowerCase();
  let list = S.globalCorpList.filter(e => {
    if (q && !e.co.name.toLowerCase().includes(q) && !e.cityName.toLowerCase().includes(q) && !e.country.toLowerCase().includes(q)) return false;
    if (S.gcorpCountry && e.country !== S.gcorpCountry) return false;
    if (S.gcorpIndustry && e.co.industry !== S.gcorpIndustry) return false;
    return true;
  });

  list.sort((a, b) => {
    if (S.gcorpSort === 'revenue_usd') return (b.revenueUSD || 0) - (a.revenueUSD || 0);
    if (S.gcorpSort === 'employees') return (b.co.employees || 0) - (a.co.employees || 0);
    if (S.gcorpSort === 'country') return (a.country || '').localeCompare(b.country || '');
    return a.co.name.localeCompare(b.co.name);
  });

  const total = list.length;
  const visible = list.slice(0, S.globalCorpVis);

  document.getElementById('gcorp-count').textContent =
    total.toLocaleString() + ' corporation' + (total !== 1 ? 's' : '');

  const tbody = document.getElementById('gcorp-tbody');
  tbody.innerHTML = visible.map(({ co, cityName, country, cityQid, revenueUSD }) => {
    const wikiAttrs = co.wikipedia
      ? ` data-wiki="${escAttr(co.wikipedia)}" data-name="${escAttr(co.name)}"`
      : ` data-name="${escAttr(co.name)}"`;
    let revDisp;
    if (revenueUSD > 0) {
      revDisp = `$${fmtRevenue(revenueUSD)}`;
    } else if (co.revenue) {
      const curLabel = co.revenue_currency && co.revenue_currency !== 'USD' ? ` ${escHtml(co.revenue_currency)}` : '';
      revDisp = `${fmtRevenue(co.revenue)}${curLabel}`;
    } else {
      revDisp = '\u2014';
    }
    const empDisp = fmtEmployees(co.employees) || '—';
    const location = [cityName, country].filter(Boolean).join(', ');
    return `<tr${wikiAttrs} data-fin="${_gcorpFinJson(co)}" data-qid="${escAttr(cityQid)}" data-city="${escAttr(cityName)}" onclick="gcorpRowClick(this)">
      <td class="gcorp-name-cell"><span class="gcorp-card-row1"><span class="gcorp-card-name">${escHtml(co.name)}</span><span class="gcorp-card-rev">${revDisp}</span></span><span class="gcorp-card-row2"><span class="gcorp-card-loc">${escHtml(location || '\u2014')}${co.industry ? ' · ' + escHtml(co.industry) : ''}</span><span class="gcorp-card-emp">${empDisp !== '\u2014' ? empDisp : ''}</span></span></td>
      <td class="gcorp-city-cell">${escHtml(cityName)}</td>
      <td class="gcorp-country-cell">${escHtml(country || '\u2014')}</td>
      <td class="gcorp-industry-cell">${co.industry ? escHtml(co.industry) : '\u2014'}</td>
      <td class="gcorp-num">${revDisp}</td>
      <td class="gcorp-neutral">${empDisp}</td>
    </tr>`;
  }).join('');

  const moreRow = document.getElementById('gcorp-more-row');
  if (total > S.globalCorpVis) {
    moreRow.style.display = '';
    document.getElementById('gcorp-more-btn').textContent =
      `Show ${Math.min(GCORP_PAGE, total - S.globalCorpVis)} more (${(total - S.globalCorpVis).toLocaleString()} remaining)`;
  } else {
    moreRow.style.display = 'none';
  }
}

export function gcorpShowMore() {
  S.globalCorpVis += GCORP_PAGE;
  renderGlobalCorpList();
}

export function gcorpQueryChanged(v) { S.gcorpQuery = v; S.globalCorpVis = GCORP_PAGE; renderGlobalCorpList(); }

function _populateCountDropdown(el, allLabel, allValue, items, counts, totalCount) {
  const label = el.querySelector('.count-dropdown-label');
  const count = el.querySelector('.count-dropdown-count');
  const menu = el.querySelector('.count-dropdown-menu');
  label.textContent = allLabel;
  count.textContent = totalCount;
  menu.innerHTML = '';
  const allItem = document.createElement('div');
  allItem.className = 'count-dropdown-item active';
  allItem.dataset.value = allValue;
  allItem.innerHTML = `<span class="count-dropdown-item-name">${allLabel}</span><span class="count-dropdown-item-count">${totalCount}</span>`;
  allItem.addEventListener('click', (e) => { e.stopPropagation(); _selectCountDropdownItem(el, allValue, allLabel, totalCount); el.dataset.value = allValue; if (el.id === 'gcorp-country') gcorpCountryChanged(allValue); else gcorpIndustryChanged(allValue); });
  menu.appendChild(allItem);
  items.forEach(item => {
    const div = document.createElement('div');
    div.className = 'count-dropdown-item';
    div.dataset.value = item;
    div.innerHTML = `<span class="count-dropdown-item-name">${escHtml(item)}</span><span class="count-dropdown-item-count">${counts[item]}</span>`;
    div.addEventListener('click', (e) => { e.stopPropagation(); _selectCountDropdownItem(el, item, item, counts[item]); el.dataset.value = item; if (el.id === 'gcorp-country') gcorpCountryChanged(item); else gcorpIndustryChanged(item); });
    menu.appendChild(div);
  });
}

function _selectCountDropdownItem(el, value, label, count) {
  el.dataset.value = value;
  el.querySelector('.count-dropdown-label').textContent = label;
  el.querySelector('.count-dropdown-count').textContent = count;
  el.classList.remove('open');
  el.querySelectorAll('.count-dropdown-item').forEach(i => {
    i.classList.toggle('active', i.dataset.value === value);
  });
}

export function gcorpCountryChanged(v) { S.gcorpCountry = v; S.globalCorpVis = GCORP_PAGE; renderGlobalCorpList(); }
export function gcorpIndustryChanged(v) { S.gcorpIndustry = v; S.globalCorpVis = GCORP_PAGE; renderGlobalCorpList(); }
export function gcorpSortChanged(v) { S.gcorpSort = v; S.globalCorpVis = GCORP_PAGE; renderGlobalCorpList(); }

export function gcorpRowClick(row) {
  const wikiUrl = row.dataset.wiki;
  const name = row.dataset.name;
  const qid = row.dataset.qid;
  const city = row.dataset.city;
  if (qid && city) { S.corpCityQid = qid; S.corpCityName = city; }
  if (!wikiUrl || !name) return;
  const finData = row.dataset.fin ? JSON.parse(row.dataset.fin) : {};
  const titleMatch = wikiUrl.match(/\/wiki\/([^#?]+)/);
  if (!titleMatch) return;
  _openCompanyWikiPanel(decodeURIComponent(titleMatch[1]), name, wikiUrl, finData);
}

document.addEventListener('click', (e) => {
  const trigger = e.target.closest('.count-dropdown-trigger');
  if (trigger) {
    const dd = trigger.parentElement;
    document.querySelectorAll('.count-dropdown.open').forEach(d => { if (d !== dd) d.classList.remove('open'); });
    dd.classList.toggle('open');
    return;
  }
  document.querySelectorAll('.count-dropdown.open').forEach(d => d.classList.remove('open'));
});