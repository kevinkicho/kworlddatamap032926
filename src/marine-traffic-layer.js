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

// ── MarineTraffic Vessel Tracking ─────────────────────────────────────────────
export async function toggleMarineTrafficLayer() {
  S.marineTrafficOn = !S.marineTrafficOn;
  const btn = document.getElementById('marinetraffic-toggle-btn');
  if (S.marineTrafficOn) {
    btn.textContent = 'Ships';
    btn.classList.add('on');
    if (!S.marineTrafficData) {
      try {
        const res = await _kdbOrFetch('/ships-live-lite.json');
        S.marineTrafficData = await res.json();
      } catch(e) {
        _warn('marinetraffic', 'Failed to load');
        S.marineTrafficOn = false; btn.textContent = 'Ships'; btn.classList.remove('on');
        return;
      }
    }
    _buildMarineTrafficLayer();
  } else {
    btn.textContent = 'Ships';
    btn.classList.remove('on');
    if (S.marineTrafficLayer) { S.map.removeLayer(S.marineTrafficLayer); S.marineTrafficLayer = null; }
  }
}

export function _buildMarineTrafficLayer() {
  if (S.marineTrafficLayer) { S.map.removeLayer(S.marineTrafficLayer); S.marineTrafficLayer = null; }
  if (!S.marineTrafficOn || !S.marineTrafficData) return;
  const layers = [];
  const typeColors = {
    'Container': '#3b82f6',
    'Bulk Carrier': '#64748b',
    'Tanker': '#ef4444',
    'Cargo': '#22c55e',
    'Passenger': '#f59e0b',
    'Cruise Ship': '#ec4899',
    'Fishing': '#14b8a6',
    'Naval': '#6366f1',
    'Supply': '#a855f7',
    'Research': '#8b5cf6',
  };
  for (const v of S.marineTrafficData.vessels || []) {
    const color = typeColors[v.tp] || '#888';
    const marker = L.circleMarker([v.lat, v.lng], {
      pane: 'overlayLayersPane',
      radius: v.tp === 'Cruise Ship' || v.tp === 'Container' ? 6 : 4,
      fillColor: color,
      color: '#000',
      weight: 0.5,
      fillOpacity: 0.9,
    });

    const courseArrow = L.polyline([
      [v.lat, v.lng],
      [v.lat + Math.cos(v.crs * Math.PI / 180) * 0.2, v.lng + Math.sin(v.crs * Math.PI / 180) * 0.2]
    ], {
      pane: 'overlayLayersPane',
      color,
      weight: 2,
      opacity: 0.6,
    });

    marker.bindTooltip(
      `<b style="color:${color}">🚢 ${v.nm}</b>`
      + `<br><span style="color:var(--text-secondary)">${v.tp}</span>`
      + `<br><span style="color:var(--text-muted)">Flag: ${v.flag || 'Unknown'}</span>`
      + `<br><span style="color:var(--text-muted)">Spd: ${v.spd} kn | Crs: ${v.crs}°</span>`
      + `<br><span style="color:var(--text-secondary)">→ ${v.dst}</span>`,
      { direction: 'top', className: 'admin1-tooltip', sticky: false }
    );
    layers.push(marker, courseArrow);
  }
  S.marineTrafficLayer = L.layerGroup(layers).addTo(S.map);
  _log('marinetraffic', `Displayed ${layers.length / 2} vessels`);
}