import { S } from './state.js';
import { escHtml, fmtNum, fmtRevenue, fmtEmployees } from './utils.js';

let _mobileBackdropOn = () => {};
let _mobileBackdropOff = () => {};
let _switchRadarTab = () => {};
let _openWikiSidebar = () => {};
let _openCountryPanel = () => {};
let _lookupJapanPref = () => null;
let _statSourceAttr = () => '';

let STAT_DEFS, CITY_STAT_DEFS, WB_STAT_DEFS, EUROSTAT_STAT_DEFS, JAPAN_PREF_STAT_DEFS, CORP_STAT_DEFS;
let CAPITAL_COORDS, countryCentroids;

export function initStatsPanel(callbacks) {
  _mobileBackdropOn = callbacks.mobileBackdropOn || _mobileBackdropOn;
  _mobileBackdropOff = callbacks.mobileBackdropOff || _mobileBackdropOff;
  _switchRadarTab = callbacks.switchRadarTab || _switchRadarTab;
  _openWikiSidebar = callbacks.openWikiSidebar || _openWikiSidebar;
  _openCountryPanel = callbacks.openCountryPanel || _openCountryPanel;
  _lookupJapanPref = callbacks.lookupJapanPref || _lookupJapanPref;
  _statSourceAttr = callbacks.statSourceAttr || _statSourceAttr;
  STAT_DEFS = callbacks.STAT_DEFS;
  CITY_STAT_DEFS = callbacks.CITY_STAT_DEFS;
  WB_STAT_DEFS = callbacks.WB_STAT_DEFS;
  EUROSTAT_STAT_DEFS = callbacks.EUROSTAT_STAT_DEFS;
  JAPAN_PREF_STAT_DEFS = callbacks.JAPAN_PREF_STAT_DEFS;
  CORP_STAT_DEFS = callbacks.CORP_STAT_DEFS;
  CAPITAL_COORDS = callbacks.CAPITAL_COORDS;
  countryCentroids = callbacks.countryCentroids;
}

const STATS_WIN = 12;

export function closeStatsPanel() {
  const _sp = document.getElementById('stats-panel');
  if (_sp) { _sp.classList.remove('open'); _sp.style.right = ''; }
  _mobileBackdropOff();
  document.querySelectorAll('.census-stat-clickable.stats-active, .info-chip-clickable.stats-active')
    .forEach(el => el.classList.remove('stats-active'));
  S._activeStatMetric = null;
  S._statsCurrent = null;
  S._statsPoints  = [];
}

export function setStatsScope(scope) {
  S._statsScope = scope;
  if (S._statsCurrent) _renderStatsPanel();
}

export function openStatsPanel(metric, qid) {
  if (S._activeStatMetric === metric + ':' + qid) { closeStatsPanel(); return; }
  S._activeStatMetric = metric + ':' + qid;
  S._statsCurrent = { metric, qid };
  _renderStatsPanel();

  var radarPane = metric.indexOf('wb_energy_') === 0 ? 'energy' : null;
  if (radarPane) {
    var btn = document.querySelector('.cp-radar-tab[onclick*="' + radarPane + '"]');
    if (btn && !btn.classList.contains('cp-radar-tab-active')) _switchRadarTab(btn, radarPane);
  }
}

function _renderStatsPanel() {
  const { metric, qid } = S._statsCurrent;
  const censusDef    = STAT_DEFS[metric];
  const cityDef      = CITY_STAT_DEFS[metric];
  const wbDef        = WB_STAT_DEFS[metric];
  const eurostatDef  = EUROSTAT_STAT_DEFS[metric];
  const japanDef     = JAPAN_PREF_STAT_DEFS[metric];
  const corpDef      = CORP_STAT_DEFS[metric];
  const def = censusDef || cityDef || wbDef || eurostatDef || japanDef || corpDef;
  if (!def) return;

  const isCityStat     = !!cityDef;
  const isWbStat       = !!wbDef;
  const isEurostatStat = !!eurostatDef;
  const isJapanPrefStat = !!japanDef;
  const isCorpStat     = !!corpDef;

  document.querySelectorAll('.census-stat-clickable.stats-active, .info-chip-clickable.stats-active, .wb-chip-clickable.stats-active')
    .forEach(el => el.classList.remove('stats-active'));
  document.querySelectorAll(`[onclick*="openStatsPanel('${metric}'"]`)
    .forEach(el => el.classList.add('stats-active'));

  const selfCity    = (isWbStat) ? null : S.cityByQid.get(qid);
  const selfIso     = isWbStat ? qid : (selfCity?.iso || '');
  const selfState   = selfCity?.admin || '';
  const selfCountry = isWbStat ? (S.countryData[qid]?.name || qid)
                                 : (selfCity?.country || selfIso);

  const points = [];
  if (isWbStat) {
    if (wbDef.src === 'oecd') {
      for (const [iso2, odata] of Object.entries(S.oecdData)) {
        if (!odata) continue;
        const rawVal = odata[wbDef.key];
        if (rawVal == null || isNaN(rawVal)) continue;
        const cdata = S.countryData[iso2];
        points.push({ qid: iso2, val: rawVal, name: (cdata && cdata.name) || iso2, region: (cdata && cdata.region) || '', iso: iso2 });
      }
    } else if (wbDef.src === 'eci') {
      for (const [iso2, edata] of Object.entries(S.eciData)) {
        if (!edata) continue;
        const rawVal = edata[wbDef.key];
        if (rawVal == null || isNaN(rawVal)) continue;
        const cdata = S.countryData[iso2];
        points.push({ qid: iso2, val: rawVal, name: (cdata && cdata.name) || iso2, region: (cdata && cdata.region) || '', iso: iso2 });
      }
    } else {
      for (const [iso2, cdata] of Object.entries(S.countryData)) {
        if (!cdata || !cdata.region || cdata.region === 'Aggregates') continue;
        const rawVal = cdata[wbDef.key];
        if (rawVal == null || isNaN(rawVal)) continue;
        points.push({ qid: iso2, val: rawVal, name: cdata.name || iso2, region: cdata.region || '', iso: iso2 });
      }
    }
  } else if (isCityStat) {
    const pool = (S._statsScope === 'country' && selfIso)
      ? S.allCities.filter(c => c.iso === selfIso)
      : S.allCities;
    for (const c of pool) {
      const val = def.key(c);
      if (val == null || isNaN(val)) continue;
      points.push({ qid: c.qid, val, name: c.name, state: c.admin || '', iso: c.iso || '', country: c.country || '' });
    }
  } else if (isJapanPrefStat) {
    const jpCities = S.allCities.filter(c => c.iso === 'JP');
    const prefRepCity = {};
    for (const c of jpCities) {
      const match = _lookupJapanPref(c);
      if (!match) continue;
      const existing = prefRepCity[match.name];
      if (!existing || (c.pop || 0) > (existing.pop || 0)) prefRepCity[match.name] = c;
    }
    for (const [prefName, data] of Object.entries(S.japanPrefData)) {
      const val = data[japanDef.key];
      if (val == null || isNaN(val)) continue;
      const repCity = prefRepCity[prefName];
      if (!repCity) continue;
      points.push({ qid: repCity.qid, val, name: prefName, state: 'Japan', iso: 'JP', country: 'Japan', prefName });
    }
  } else if (isEurostatStat) {
    for (const [cqid, data] of Object.entries(S.eurostatCities)) {
      if (!data) continue;
      const val = data[eurostatDef.key];
      if (val == null || isNaN(val)) continue;
      const city = S.cityByQid.get(cqid);
      if (!city) continue;
      points.push({ qid: cqid, val, name: city.name, state: data.country || city.iso || '', iso: city.iso || '', country: city.country || city.iso || '' });
    }
  } else if (isCorpStat) {
    for (const arr of Object.values(S.companiesData)) {
      for (const co of arr) {
        if (!co.qid) continue;
        const val = corpDef.key(co);
        if (val == null || isNaN(val) || val <= 0) continue;
        points.push({ qid: co.qid, val, name: co.name, state: co.industry || '', iso: '', country: co.exchange || '' });
      }
    }
  } else {
    const src = def.src === 'acs' ? S.censusCities : S.censusBusiness;
    for (const [cqid, data] of Object.entries(src)) {
      if (!data) continue;
      const val = typeof def.key === 'function' ? def.key(data) : data[def.key];
      if (val == null || isNaN(val)) continue;
      const city = S.cityByQid.get(cqid);
      if (!city) continue;
      points.push({ qid: cqid, val, name: city.name, state: city.admin || '', iso: 'US', country: 'United States' });
    }
  }
  if (!points.length) return;

  const ascending = def.higherBetter === false;
  points.sort((a, b) => ascending ? a.val - b.val : b.val - a.val);
  points.forEach((p, i) => { p.rank = i + 1; });

  const selfJapanPref = isJapanPrefStat ? _lookupJapanPref(selfCity)?.name : null;
  const entityIdx = isWbStat
    ? points.findIndex(p => p.qid === selfIso)
    : isJapanPrefStat
    ? points.findIndex(p => p.prefName === selfJapanPref)
    : points.findIndex(p => p.qid === qid);
  if (entityIdx < 0) { closeStatsPanel(); return; }
  const cp = points[entityIdx];

  S._statsPoints   = points;
  S._statsWinStart = Math.max(0, entityIdx - 5);
  S._statsWinEnd   = Math.min(points.length - 1, entityIdx + 5);

  let subRank = 0, subTotal = 0, subLabel = '';
  if (isWbStat && cp.region) {
    const regionPts = points.filter(p => p.region === cp.region);
    subRank  = regionPts.findIndex(p => p.qid === cp.qid) + 1;
    subTotal = regionPts.length;
    subLabel = cp.region;
  } else if (isEurostatStat && selfIso) {
    const countryPts = points.filter(p => p.iso === selfIso);
    subRank  = countryPts.findIndex(p => p.qid === qid) + 1;
    subTotal = countryPts.length;
    subLabel = selfCountry || selfIso;
  } else if (isCityStat && S._statsScope === 'world' && selfIso) {
    const countryPts = points.filter(p => p.iso === selfIso);
    subRank  = countryPts.findIndex(p => p.qid === qid) + 1;
    subTotal = countryPts.length;
    subLabel = selfCountry;
  } else if (!isCityStat && !isWbStat && !isEurostatStat && selfState) {
    const statePts = points.filter(p => p.state === selfState);
    subRank  = statePts.findIndex(p => p.qid === qid) + 1;
    subTotal = statePts.length;
    subLabel = selfState;
  }

  const vals = points.map(p => p.val);
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const BUCKETS = 14;
  const bSize = (maxV - minV) / BUCKETS || 1;
  const counts = Array(BUCKETS).fill(0);
  const entityBkt = Math.min(BUCKETS-1, Math.floor((cp.val - minV) / bSize));
  for (const {val} of points) counts[Math.min(BUCKETS-1, Math.floor((val - minV) / bSize))]++;
  const maxCnt = Math.max(...counts, 1);
  const HW = 262, HH = 56, HPAD = 2;
  const bw = (HW - HPAD*2) / BUCKETS;
  const histBars = counts.map((cnt, i) => {
    const bh = Math.max(2, (cnt/maxCnt)*(HH-HPAD*2));
    const x = HPAD + i*bw, y = HH - HPAD - bh;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw-1).toFixed(1)}" height="${bh.toFixed(1)}" rx="1.5"
      fill="${i===entityBkt?'#f0a500':'#2a8ee8'}" opacity="${i===entityBkt?1:0.45}"/>`;
  }).join('');
  const markerX = HPAD + (entityBkt+0.5)*bw;
  const histSvg = `<svg viewBox="0 0 ${HW} ${HH+14}" width="${HW}" height="${HH+14}" style="display:block">
    ${histBars}
    <line x1="${markerX.toFixed(1)}" y1="0" x2="${markerX.toFixed(1)}" y2="${HH}" stroke="#f0a500" stroke-width="1.5" stroke-dasharray="3 2"/>
    <text x="${HPAD}" y="${HH+11}" font-size="7" fill="#6e7681" text-anchor="start">${def.fmt(minV)}</text>
    <text x="${HW/2}" y="${HH+11}" font-size="7" fill="#6e7681" text-anchor="middle">${def.fmt((minV+maxV)/2)}</text>
    <text x="${HW-HPAD}" y="${HH+11}" font-size="7" fill="#6e7681" text-anchor="end">${def.fmt(maxV)}</text>
  </svg>`;

  const note = def.higherBetter === true  ? '↑ higher ranked = higher value'
             : def.higherBetter === false ? '↑ higher ranked = lower value' : '';

  const primaryLabel = isWbStat ? 'countries worldwide'
    : isJapanPrefStat ? 'Japanese prefectures'
    : isEurostatStat ? 'European cities (Eurostat)'
    : isCityStat ? (S._statsScope === 'world' ? 'worldwide' : escHtml(selfCountry))
    : isCorpStat ? 'companies worldwide'
    : 'US cities with Census data';
  const scopeToggle = isCityStat ? `
    <div id="stats-scope-row">
      <button class="stats-scope-btn${S._statsScope==='world'?' active':''}" onclick="setStatsScope('world')">🌍 World</button>
      <button class="stats-scope-btn${S._statsScope==='country'?' active':''}" onclick="setStatsScope('country')"
        >📍 ${escHtml(selfCountry)}</button>
    </div>` : '';

  let trendChartHtml = '';
  if (isJapanPrefStat && selfCity) {
    const jpMatch = _lookupJapanPref(selfCity);
    const histKey = metric === 'japan_perCapitaIncome' ? 'perCapitaIncomeHistory' : 'gdpHistory';
    const history = jpMatch?.data?.[histKey];
    if (history && history.length >= 2) {
      const TW = 262, TH = 54, TPAD = 4;
      const xs = history.map(([y]) => y);
      const vs = history.map(([, v]) => v);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minVt = Math.min(...vs), maxVt = Math.max(...vs);
      const rangeV = maxVt - minVt || 1;
      const toX = x => TPAD + (x - minX) / (maxX - minX || 1) * (TW - TPAD * 2);
      const toY = v => TH - TPAD - (v - minVt) / rangeV * (TH - TPAD * 2);
      const pts = history.map(([x, v]) => `${toX(x).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');
      const dots = history.map(([x, v]) =>
        `<circle cx="${toX(x).toFixed(1)}" cy="${toY(v).toFixed(1)}" r="1.8" fill="#f0a500" opacity="0.7"/>`).join('');
      const firstLbl = `${xs[0]}: ${def.fmt(vs[0])}`;
      const lastLbl  = `${xs[xs.length-1]}: ${def.fmt(vs[vs.length-1])}`;
      trendChartHtml = `<div class="stats-trend-wrap">
        <svg viewBox="0 0 ${TW} ${TH+16}" width="${TW}" height="${TH+16}" style="display:block">
          <polyline points="${pts}" fill="none" stroke="#58a6ff" stroke-width="1.8" stroke-linejoin="round" opacity="0.85"/>
          ${dots}
          <text x="${TPAD}" y="${TH+13}" font-size="7" fill="#6e7681">${escHtml(firstLbl)}</text>
          <text x="${TW-TPAD}" y="${TH+13}" font-size="7" fill="#f0a500" text-anchor="end">${escHtml(lastLbl)}</text>
        </svg>
      </div>`;
    }
  } else if (isEurostatStat && eurostatDef.histKey) {
    const esRecord = S.eurostatCities[qid];
    const history  = esRecord?.[eurostatDef.histKey];
    if (history && history.length >= 2) {
      const TW = 262, TH = 54, TPAD = 4;
      const xs = history.map(([y]) => y);
      const vs = history.map(([, v]) => v);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minV = Math.min(...vs), maxV = Math.max(...vs);
      const rangeV = maxV - minV || 1;
      const toX = x => TPAD + (x - minX) / (maxX - minX || 1) * (TW - TPAD * 2);
      const toY = v => TH - TPAD - (v - minV) / rangeV * (TH - TPAD * 2);
      const pts = history.map(([x, v]) => `${toX(x).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');
      const dots = history.map(([x, v]) =>
        `<circle cx="${toX(x).toFixed(1)}" cy="${toY(v).toFixed(1)}" r="1.8" fill="#f0a500" opacity="0.7"/>`).join('');
      const firstLbl = `${xs[0]}: ${def.fmt(vs[0])}`;
      const lastLbl  = `${xs[xs.length-1]}: ${def.fmt(vs[vs.length-1])}`;
      trendChartHtml = `<div class="stats-trend-wrap">
        <svg viewBox="0 0 ${TW} ${TH+16}" width="${TW}" height="${TH+16}" style="display:block">
          <polyline points="${pts}" fill="none" stroke="#58a6ff" stroke-width="1.8" stroke-linejoin="round" opacity="0.85"/>
          ${dots}
          <text x="${TPAD}" y="${TH+13}" font-size="7" fill="#6e7681">${escHtml(firstLbl)}</text>
          <text x="${TW-TPAD}" y="${TH+13}" font-size="7" fill="#f0a500" text-anchor="end">${escHtml(lastLbl)}</text>
        </svg>
      </div>`;
    }
  }

  document.getElementById('stats-panel-title').textContent = def.label;
  document.getElementById('stats-panel-city').textContent  = cp.name + (selfState || (!isWbStat && selfCountry) ? ' · '+(selfState||selfCountry) : '');
  document.getElementById('stats-panel-body').innerHTML = `
    ${scopeToggle}
    ${trendChartHtml}
    <div class="stats-hist-wrap">${histSvg}</div>
    <div class="stats-ranks">
      <div class="stats-rank-badge">
        <span class="stats-rank-n">#${cp.rank} / ${points.length}</span>
        <span class="stats-rank-lbl">${primaryLabel}</span>
      </div>
      ${subRank > 0 ? `<div class="stats-rank-badge">
        <span class="stats-rank-n">#${subRank} / ${subTotal}</span>
        <span class="stats-rank-lbl">${escHtml(subLabel)}</span>
      </div>` : ''}
    </div>
    ${note ? `<div class="stats-note">${note}</div>` : ''}
    <div id="stats-rank-list-wrap" class="stats-rank-list"></div>
    <div class="stats-source">${points.length} ${primaryLabel}</div>
    <div class="stats-source-attr">${_statSourceAttr(metric)}</div>
  `;
  const _sp = document.getElementById('stats-panel');
  const _wikiOpen = document.getElementById('wiki-sidebar')?.classList.contains('open');
  const _corpOpen = document.getElementById('corp-panel')?.classList.contains('open');
  const _cpOpen   = document.getElementById('country-panel')?.classList.contains('open');
  const _baseRight = _cpOpen ? 600 : (_wikiOpen && _corpOpen) ? 880 : _corpOpen ? 460 : 420;
  _sp.style.right = _baseRight + 'px';
  _sp.classList.add('open');
  _mobileBackdropOn();
  _updateStatsListHtml();
}

function _updateStatsListHtml() {
  const metric = S._statsCurrent?.metric;
  const def = STAT_DEFS[metric] || CITY_STAT_DEFS[metric] || WB_STAT_DEFS[metric] || EUROSTAT_STAT_DEFS[metric] || JAPAN_PREF_STAT_DEFS[metric];
  const listEl = document.getElementById('stats-rank-list-wrap');
  if (!listEl || !def || !S._statsPoints.length) return;
  const { qid } = S._statsCurrent;
  const isWbStat = !!WB_STAT_DEFS[metric];
  const isJapanPrefStat = !!JAPAN_PREF_STAT_DEFS[metric];
  const curId = isWbStat ? (S._statsCurrent.qid) : qid;
  const aboveCount = S._statsWinStart;
  const belowCount = S._statsPoints.length - 1 - S._statsWinEnd;
  const jpSelfCity = isJapanPrefStat ? S.cityByQid.get(qid) : null;
  const jpSelfPref = isJapanPrefStat ? _lookupJapanPref(jpSelfCity)?.name : null;
  const rows = S._statsPoints.slice(S._statsWinStart, S._statsWinEnd + 1).map(p => {
    const isCur = isJapanPrefStat ? (p.prefName === jpSelfPref) : (p.qid === curId);
    const navFn = isWbStat ? escHtml('statsGoToCountry(' + JSON.stringify(p.qid) + ')') : escHtml('statsGoToCity(' + JSON.stringify(p.qid) + ')');
    const sub = isWbStat ? '' : (p.state ? ` · ${escHtml(p.state)}` : '');
    return `<div class="stats-rank-row${isCur?' stats-rank-current':''}" onclick="${navFn}">
      <span class="stats-rank-num">#${p.rank}</span>
      <span class="stats-rank-name">${escHtml(p.name)}<span class="stats-rank-sub">${sub}</span></span>
      <span class="stats-rank-val">${def.fmt(p.val)}</span>
    </div>`;
  }).join('');
  listEl.innerHTML = `
    ${aboveCount > 0 ? `<button class="stats-rank-more" onclick="statsExpandUp()">▲ ${aboveCount.toLocaleString()} more above</button>` : ''}
    ${rows}
    ${belowCount > 0 ? `<button class="stats-rank-more" onclick="statsExpandDown()">▼ ${belowCount.toLocaleString()} more below</button>` : ''}
  `;
  listEl.querySelector('.stats-rank-current')?.scrollIntoView({ block: 'nearest' });
}

export function statsExpandUp() {
  S._statsWinStart = Math.max(0, S._statsWinStart - STATS_WIN);
  _updateStatsListHtml();
  document.getElementById('stats-rank-list-wrap')?.scrollTo({ top: 0 });
}

export function statsExpandDown() {
  S._statsWinEnd = Math.min(S._statsPoints.length - 1, S._statsWinEnd + STATS_WIN);
  _updateStatsListHtml();
}

export function statsGoToCity(qid) {
  const city = S.cityByQid.get(qid);
  if (!city || city.lat == null) return;
  S.map.flyTo([city.lat, city.lng], Math.max(S.map.getZoom(), 5), { duration: 1 });
  _openWikiSidebar(qid, city.name);
  if (S._statsCurrent && S._statsCurrent.qid !== qid) openStatsPanel(S._statsCurrent.metric, qid);
}

export function statsGoToCountry(iso2) {
  const pt = CAPITAL_COORDS[iso2] || countryCentroids[iso2];
  if (pt) S.map.flyTo(pt, Math.max(S.map.getZoom(), 4), { duration: 1 });
  if (S._statsCurrent && S._statsCurrent.qid !== iso2) openStatsPanel(S._statsCurrent.metric, iso2);
  if (typeof _openCountryPanel === "function" && S.countryData[iso2]) _openCountryPanel(iso2);
}