import { S } from './state.js';

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

// ── Celestrak Satellite Layer ──────────────────────────────────────────────────
export async function toggleSatelliteLayer() {
  S.satelliteOn = !S.satelliteOn;
  const btn = document.getElementById('satellite-toggle-btn');
  if (S.satelliteOn) {
    btn.textContent = 'Satellites';
    btn.classList.add('on');
    if (!S.satelliteData) {
      try {
        const res = await _kdbOrFetch('/satellites-live-lite.json');
        S.satelliteData = await res.json();
      } catch(e) {
        _warn('satellite', 'Failed to load');
        S.satelliteOn = false; btn.textContent = 'Satellites'; btn.classList.remove('on');
        return;
      }
    }
    _buildSatelliteLayer();
  } else {
    btn.textContent = 'Satellites';
    btn.classList.remove('on');
    if (S.satelliteLayer) { S.map.removeLayer(S.satelliteLayer); S.satelliteLayer = null; }
  }
}

export function _buildSatelliteLayer() {
  if (S.satelliteLayer) { S.map.removeLayer(S.satelliteLayer); S.satelliteLayer = null; }
  if (!S.satelliteOn || !S.satelliteData) return;
  const layers = [];
  const categoryColors = {
    'GPS Operational': '#3b82f6', 'GLONASS Operational': '#ef4444',
    'Galileo': '#22c55e', 'BeiDou': '#eab308', 'Geostationary': '#a855f7',
    'Iridium': '#f97316', 'Starlink': '#06b6d4', 'ISS': '#ec4899',
    'Weather': '#6366f1', 'Scientific': '#14b8a6', 'Military': '#64748b',
  };
  for (const s of S.satelliteData.satellites || []) {
    if (s.lo === null || s.la === null) continue;
    const isGeo = s.a > 35000;
    const color = categoryColors[s.c] || '#888';
    const marker = L.circleMarker([s.la, s.lo], {
      pane: 'overlayLayersPane',
      radius: isGeo ? 2 : 4,
      fillColor: color,
      color: isGeo ? color : '#000',
      weight: isGeo ? 0 : 0.5,
      fillOpacity: isGeo ? 0.45 : 0.9,
    });
    marker.bindTooltip(
      `<b style="color:${color}">🛰 ${s.n}</b>`
      + `<br><span style="color:var(--text-secondary)">${s.c}</span>`
      + `<br><span style="color:var(--text-muted)">Alt: ${s.a} km · Vel: ${s.v} km/h</span>`
      + `<br><span style="color:var(--text-muted)">Footprint: ${s.f} km</span>`,
      { direction: 'top', className: 'admin1-tooltip', sticky: false }
    );
    layers.push(marker);
  }
  S.satelliteLayer = L.layerGroup(layers).addTo(S.map);
  _log('satellite', `Displayed ${layers.length} satellites`);
}