import { S } from './state.js';
import { escHtml } from './utils.js';

const L = window.L;

async function _kdbOrFetch(url) {
  if (window._kdb && window._kdb[url]) {
    return new Response(JSON.stringify(window._kdb[url]));
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error('Fetch failed: ' + url);
  return res;
}

function _log(tag, msg) { if (window.__KWDEBUG__) console.log(`[${tag}] ${msg}`); }
function _warn(tag, msg) { if (window.__KWDEBUG__) console.warn(`[${tag}] ${msg}`); }

// ── WAQI Air Quality Layer ─────────────────────────────────────────────────────
export async function toggleWaqiLayer() {
  S.waqiOn = !S.waqiOn;
  const btn = document.getElementById('waqi-toggle-btn');
  if (S.waqiOn) {
    btn.textContent = 'Air Quality';
    btn.classList.add('on');
    if (!S.waqiData) {
      try {
        const res = await _kdbOrFetch('/who-airquality.json');
        S.waqiData = await res.json();
      } catch(e) {
        _warn('waqi', 'Failed to load');
        S.waqiOn = false; btn.textContent = 'Air Quality'; btn.classList.remove('on');
        return;
      }
    }
    _buildWaqiLayer();
  } else {
    btn.textContent = 'Air Quality';
    btn.classList.remove('on');
    if (S.waqiLayer) { S.map.removeLayer(S.waqiLayer); S.waqiLayer = null; }
  }
}

export function _buildWaqiLayer() {
  if (S.waqiLayer) { S.map.removeLayer(S.waqiLayer); S.waqiLayer = null; }
  if (!S.waqiOn || !S.waqiData) return;
  const layers = [];
  const AQ_COLORS = [
    [50, '#22c55e'], [100, '#eab308'], [150, '#f97316'], [200, '#ef4444'], [300, '#7c3aed'], [500, '#7f1d1d'],
  ];
  function aqColor(pm25) {
    for (const [threshold, color] of AQ_COLORS) { if (pm25 <= threshold) return color; }
    return '#7f1d1d';
  }
  for (const [qid, aq] of Object.entries(S.waqiData)) {
    if (!aq || aq.pm25 == null) continue;
    const city = S.cityByQid && S.cityByQid.get(qid);
    if (!city || city.lat == null || city.lng == null) continue;
    const color = aqColor(aq.pm25);
    const marker = L.circleMarker([city.lat, city.lng], {
      pane: 'overlayLayersPane',
      radius: aq.pm25 > 150 ? 7 : aq.pm25 > 100 ? 5 : 4,
      fillColor: color,
      color: '#000',
      weight: 0.5,
      fillOpacity: 0.85,
    });
    marker.bindTooltip(
      `<b style="color:${color}">🌫️ ${escHtml(city.name)}</b>`
      + `<br><span style="color:var(--text-secondary)">PM2.5: ${aq.pm25} µg/m³ (${aq.category || '—'})</span>`
      + `<br><span style="color:var(--text-muted)">${escHtml(city.country || '')} · ${aq.year || '—'}</span>`,
      { direction: 'top', className: 'admin1-tooltip', sticky: false }
    );
    layers.push(marker);
  }
  S.waqiLayer = L.layerGroup(layers).addTo(S.map);
  _log('waqi', `Displayed ${layers.length} stations`);
}