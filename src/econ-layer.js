import { S } from './state.js';
import { ISO2_TO_CURRENCY } from './constants.js';
import { toUSD } from './fx-sidebar.js';
import { escHtml, escAttr, fmtRevenue } from './utils.js';

const L = window.L;

export function econDotColor(totalUSD) {
  const logMin = Math.log10(5e8);
  const logMax = Math.log10(5e12);
  const t = Math.max(0, Math.min(1, (Math.log10(Math.max(totalUSD, 5e8)) - logMin) / (logMax - logMin)));
  const hue = Math.round(45 + t * 143);
  const sat = Math.round(85 + t * 15);
  const lit = Math.round(62 - t * 10);
  return `hsl(${hue},${sat}%,${lit}%)`;
}

export function _econCellDeg(zoom) {
  if (zoom <= 3) return 20;
  if (zoom <= 4) return 12;
  if (zoom <= 5) return 6;
  if (zoom <= 6) return 3;
  if (zoom <= 7) return 1.5;
  return 0;
}

export function toggleEconLayer() {
  S.econOn = !S.econOn;
  const btn = document.getElementById('econ-toggle-btn');
  if (S.econOn) {
    btn.textContent = 'Economy';
    btn.classList.add('on');
    if (S._drawEconColorRamp) S._drawEconColorRamp();
    S._companiesLoader.ensure().then(() => {
      buildEconLayer();
      if (S._updateMapLegends) S._updateMapLegends();
    });
  } else {
    btn.textContent = 'Economy';
    btn.classList.remove('on');
    if (S.econLayer) { S.map.removeLayer(S.econLayer); S.econLayer = null; }
    collapseEconCluster();
    _econTipHide();
    if (S._updateMapLegends) S._updateMapLegends();
  }
}

export function _clearExpandedLayers() {
  if (S._collapseOnClick) { S.map.off('click', S._collapseOnClick); S._collapseOnClick = null; }
  if (S._expandedLayers) {
    S._expandedLayers.forEach(l => { try { S.map.removeLayer(l); } catch (_) {} });
    S._expandedLayers = null;
  }
}

export function collapseEconCluster() {
  _clearExpandedLayers();
  S._pinnedExpansion = null;
}

export function _convexHull(pts) {
  const n = pts.length;
  if (n < 3) return [...pts];
  const d2 = (a, b) => (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
  let l = 0;
  for (let i = 1; i < n; i++) if (pts[i][1] < pts[l][1]) l = i;
  const hull = []; let p = l, q;
  do {
    hull.push(pts[p]); q = 0;
    for (let i = 1; i < n; i++) {
      if (q === p) { q = i; continue; }
      const cross = (pts[q][1] - pts[p][1]) * (pts[i][0] - pts[p][0])
        - (pts[q][0] - pts[p][0]) * (pts[i][1] - pts[p][1]);
      if (cross < 0 || (cross === 0 && d2(pts[p], pts[i]) > d2(pts[p], pts[q]))) q = i;
    }
    p = q;
  } while (p !== l && hull.length <= n);
  return hull;
}

export function _arcLine(p1, p2, curve = 0.22) {
  const mid = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
  const dl = p2[0] - p1[0], dn = p2[1] - p1[1];
  const ctrl = [mid[0] - dn * curve, mid[1] + dl * curve];
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24, u = 1 - t;
    pts.push([u * u * p1[0] + 2 * u * t * ctrl[0] + t * t * p2[0],
    u * u * p1[1] + 2 * u * t * ctrl[1] + t * t * p2[1]]);
  }
  return pts;
}

export function expandEconCluster(group, clusterUSD, cLat, cLng) {
  _clearExpandedLayers();
  S._pinnedExpansion = { group, clusterUSD, cLat, cLng };
  const layers = [];
  const col = econDotColor(clusterUSD);
  const MAX_USD = 2e12;
  const positions = group.map(p => [p.city.lat, p.city.lng]);

  if (positions.length >= 3) {
    const hull = _convexHull(positions);
    const padded = hull.map(([lat, lng]) => {
      const dlat = lat - cLat, dlng = lng - cLng;
      const len = Math.sqrt(dlat * dlat + dlng * dlng) || 0.001;
      const pad = Math.max(1.8, len * 0.22);
      return [lat + dlat / len * pad, lng + dlng / len * pad];
    });
    layers.push(L.polygon(padded, {
      fillColor: col, fillOpacity: 0.07,
      color: col, weight: 1.5, opacity: 0.35,
      dashArray: '7 5', pane: 'econPane', interactive: false,
    }).addTo(S.map));
  } else if (positions.length === 2) {
    layers.push(L.polyline(positions, {
      color: col, weight: 2, opacity: 0.3,
      dashArray: '7 5', pane: 'econPane', interactive: false,
    }).addTo(S.map));
  }

  for (const p of group) {
    layers.push(L.polyline(
      _arcLine([cLat, cLng], [p.city.lat, p.city.lng]),
      { color: col, weight: 1, opacity: 0.2, pane: 'econPane', interactive: false }
    ).addTo(S.map));
  }

  for (const p of group) {
    const cityCol = econDotColor(p.totalUSD);
    const logVal = Math.log10(Math.max(p.totalUSD, 1e8));
    const r = Math.max(6, Math.min(22, 5 + 17 * (logVal - 8) / (13 - 8)));
    const topCos = (p.validCos || []).slice().sort((a, b) => b.usd - a.usd).slice(0, 3);
    const tipHtml =
      `<div style="font-weight:600;color:${cityCol};margin-bottom:2px">${escHtml(p.city.name)}</div>` +
      `<div style="color:var(--text-secondary);font-size:0.78rem;margin-bottom:4px">≈ <span style="color:${cityCol};font-weight:600">$${fmtRevenue(p.totalUSD)}</span> USD</div>` +
      topCos.map(({ co, usd }) =>
        `<div style="color:var(--text-body);font-size:0.79rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(co.name)} <span style="color:${cityCol}">$${fmtRevenue(usd)}</span></div>`
      ).join('');

    const dot = L.circleMarker([p.city.lat, p.city.lng], {
      radius: r, color: cityCol, fillColor: cityCol,
      fillOpacity: 0.22, weight: 2, opacity: 0.9,
      pane: 'econPane', bubblingMouseEvents: false,
    });
    dot.on('mouseover', e => _econTipShow(tipHtml, e.originalEvent.clientX, e.originalEvent.clientY));
    dot.on('mousemove', e => _econTipMove(e.originalEvent.clientX, e.originalEvent.clientY));
    dot.on('mouseout', () => _econTipHide());
    dot.on('click', () => { _econTipHide(); collapseEconCluster(); if (S._openCorpPanel) S._openCorpPanel(p.qid, p.city.name); });
    dot.addTo(S.map);
    layers.push(dot);
  }

  S._expandedLayers = layers;

  setTimeout(() => {
    S._collapseOnClick = collapseEconCluster;
    S.map.on('click', S._collapseOnClick);
  }, 120);
}

function _econTipDOM() {
  if (!S._econTipEl) {
    S._econTipEl = document.createElement('div');
    S._econTipEl.id = 'econ-custom-tip';
    document.body.appendChild(S._econTipEl);
  }
  return S._econTipEl;
}
function _econTipShow(html, clientX, clientY) {
  const el = _econTipDOM();
  el.innerHTML = html;
  el.style.display = 'block';
  _econTipMove(clientX, clientY);
}
function _econTipMove(clientX, clientY) {
  const el = S._econTipEl;
  if (!el || el.style.display === 'none') return;
  const tw = el.offsetWidth, th = el.offsetHeight;
  const vw = window.innerWidth, vh = window.innerHeight;
  const pad = 12;
  let x = clientX + pad;
  let y = clientY - th - pad;
  if (x + tw > vw - 8) x = clientX - tw - pad;
  if (y < 8) y = clientY + pad;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
}
function _econTipHide() {
  if (S._econTipEl) S._econTipEl.style.display = 'none';
}

export function buildEconLayer() {
  if (!S.econOn) return;
  const _savedPin = S._pinnedExpansion;
  _clearExpandedLayers();
  S._pinnedExpansion = null;
  if (S.econLayer) { S.map.removeLayer(S.econLayer); S.econLayer = null; }
  if (!Object.keys(S.companiesData).length) return;

  const MAX_PLAUSIBLE_USD = 2e12;
  const metric = 'market_cap';

  const cityPoints = [];
  for (const [qid, companies] of Object.entries(S.companiesData)) {
    const city = S.cityByQid.get(qid);
    if (!city || city.lat == null || city.lng == null) continue;
    let totalUSD = 0;
    const validCos = [];
    for (const co of companies) {
      const countryDefaultCur = ISO2_TO_CURRENCY[city.iso] || null;
      const hasPrimary = !!(co[metric] && (co[metric + '_currency'] || countryDefaultCur));
      const val = hasPrimary ? co[metric] : (co.revenue || co.market_cap);
      const rawCur = hasPrimary ? co[metric + '_currency'] : (co.revenue_currency || co.market_cap_currency);
      const cur = rawCur || countryDefaultCur;
      if (!val || !cur) continue;
      const usd = toUSD(val, cur);
      if (usd > 0 && usd <= MAX_PLAUSIBLE_USD) {
        totalUSD += usd;
        const usedMetric = hasPrimary ? metric : (co.revenue ? 'revenue' : 'market_cap');
        validCos.push({ co, usd, usedMetric });
      }
    }
    if (totalUSD <= 0) continue;
    cityPoints.push({ qid, city, totalUSD, validCos });
  }

  let clusters = cityPoints.map(p => [p]);

  function _clusterMeta(group) {
    const totalUSD = group.reduce((s, p) => s + p.totalUSD, 0);
    const lat = group.reduce((s, p) => s + p.city.lat * p.totalUSD, 0) / totalUSD;
    const lng = group.reduce((s, p) => s + p.city.lng * p.totalUSD, 0) / totalUSD;
    const logVal = Math.log10(Math.max(totalUSD, 1e8));
    const r = Math.max(6, Math.min(32, 4 + 28 * (logVal - 8) / (13 - 8)));
    const px = S.map.latLngToContainerPoint([lat, lng]);
    return { lat, lng, r, px, totalUSD };
  }

  const OVERLAP_PAD = 4;
  let changed = true;
  while (changed) {
    changed = false;
    const meta = clusters.map(_clusterMeta);
    outer: for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const a = meta[i], b = meta[j];
        const dx = a.px.x - b.px.x, dy = a.px.y - b.px.y;
        if (Math.sqrt(dx * dx + dy * dy) < a.r + b.r + OVERLAP_PAD) {
          clusters[i] = clusters[i].concat(clusters[j]);
          clusters.splice(j, 1);
          changed = true;
          break outer;
        }
      }
    }
  }

  const markers = [];
  for (const group of clusters) {
    const clusterUSD = group.reduce((s, p) => s + p.totalUSD, 0);
    const lat = group.reduce((s, p) => s + p.city.lat * p.totalUSD, 0) / clusterUSD;
    const lng = group.reduce((s, p) => s + p.city.lng * p.totalUSD, 0) / clusterUSD;

    const logVal = Math.log10(Math.max(clusterUSD, 1e8));
    const radius = Math.max(4, Math.min(32, 4 + 28 * (logVal - 8) / (13 - 8)));

    const isMerged = group.length > 1;
    const headerLabel = isMerged
      ? `${group.length} cities`
      : escHtml(group[0].city.name);
    const subLabel = isMerged
      ? group.slice(0, 3).map(p => escHtml(p.city.name)).join(', ') + (group.length > 3 ? ` +${group.length - 3} more` : '')
      : null;

    const allCos = group.flatMap(p => p.validCos);
    const topCos = allCos.sort((a, b) => b.usd - a.usd).slice(0, 4);
    const metricLabel = metric === 'market_cap' ? 'Market cap' : 'Revenue';
    const topHtml = topCos.map(({ co, usd, usedMetric }) => {
      const tag = (metric === 'market_cap' && usedMetric !== 'market_cap')
        ? `<span style="color:var(--text-muted);font-size:0.68rem"> rev</span>` : '';
      return `<div style="color:var(--text-body);font-size:0.79rem;padding:1px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">` +
        `${escHtml(co.name)}${tag} <span style="color:var(--gold)">$${fmtRevenue(usd)}</span></div>`;
    }).join('');

    const totalCorps = group.reduce((s, p) => s + p.validCos.length, 0);
    const tip =
      `<div style="font-weight:600;color:var(--gold);margin-bottom:2px">${headerLabel}</div>` +
      (subLabel ? `<div style="color:var(--text-secondary);font-size:0.75rem;margin-bottom:3px">${subLabel}</div>` : '') +
      `<div style="color:var(--text-secondary);font-size:0.78rem;margin-bottom:5px">${metricLabel} ≈ ` +
      `<span style="color:var(--gold);font-weight:600">$${fmtRevenue(clusterUSD)}</span> USD</div>` +
      `<div style="color:var(--text-faint);font-size:0.74rem;margin-bottom:4px">${totalCorps} listed corp${totalCorps !== 1 ? 's' : ''}</div>` +
      topHtml;

    const dotColor = econDotColor(clusterUSD);
    const m = L.circleMarker([lat, lng], {
      radius: Math.max(radius, 6),
      color: dotColor,
      fillColor: dotColor,
      fillOpacity: isMerged ? 0.28 : 0.18,
      weight: isMerged ? 2 : 1.5,
      opacity: 0.9,
      pane: 'econPane',
      bubblingMouseEvents: false,
    });
    m.on('mouseover', e => _econTipShow(tip, e.originalEvent.clientX, e.originalEvent.clientY));
    m.on('mousemove', e => _econTipMove(e.originalEvent.clientX, e.originalEvent.clientY));
    m.on('mouseout', () => _econTipHide());
    if (!isMerged) {
      m.on('click', () => { _econTipHide(); if (S._openCorpPanel) S._openCorpPanel(group[0].qid, group[0].city.name); });
    } else {
      const clusterTitle = `${group.length} cities`;
      m.on('click', () => {
        _econTipHide();
        expandEconCluster(group, clusterUSD, lat, lng);
        if (S._openCorpPanelCluster) S._openCorpPanelCluster(group, clusterTitle);
      });
    }
    markers.push(m);
  }

  S.econLayer = L.layerGroup(markers).addTo(S.map);
  const metricLabel = metric === 'market_cap' ? 'Market cap' : 'Revenue';
  const primaryCount = cityPoints.flatMap(p => p.validCos).filter(c => c.usedMetric === metric).length;
  const fallbackNote = metric === 'market_cap' && primaryCount < cityPoints.flatMap(p => p.validCos).length
    ? ` · ${primaryCount} mkt cap, rest revenue` : '';
  document.getElementById('econ-info').textContent =
    `${cityPoints.length} cities${clusters.length < cityPoints.length ? ` → ${clusters.length} clusters` : ''} · ${metricLabel}${fallbackNote} · click to explore`;

  if (_savedPin) {
    expandEconCluster(_savedPin.group, _savedPin.clusterUSD, _savedPin.cLat, _savedPin.cLng);
  }
}