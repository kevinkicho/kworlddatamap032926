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

// ── Protected Areas Layer ─────────────────────────────────────────────────────
export async function toggleProtectedAreasLayer() {
  S.protectedAreasOn = !S.protectedAreasOn;
  const btn = document.getElementById('protected-areas-toggle-btn');
  if (S.protectedAreasOn) {
    btn.textContent = '🌲 Protected Areas: On';
    btn.classList.add('on');
    if (!S.protectedAreasData) {
      try {
        const res = await _kdbOrFetch('/protected-areas.json');
        S.protectedAreasData = await res.json();
      } catch(e) {
        _warn('protected-areas', 'Failed to load');
        S.protectedAreasOn = false; btn.textContent = '🌲 Protected Areas: Off'; btn.classList.remove('on');
        return;
      }
    }
    _buildProtectedAreasLayer();
  } else {
    btn.textContent = '🌲 Protected Areas: Off';
    btn.classList.remove('on');
    if (S.protectedAreasLayer) { S.map.removeLayer(S.protectedAreasLayer); S.protectedAreasLayer = null; }
  }
}

export function _buildProtectedAreasLayer() {
  if (S.protectedAreasLayer) { S.map.removeLayer(S.protectedAreasLayer); S.protectedAreasLayer = null; }
  if (!S.protectedAreasOn || !S.protectedAreasData) return;
  const layers = [];
  for (const area of S.protectedAreasData.areas || []) {
    if (area.lat === null || area.lng === null) continue;
    // Color by IUCN category
    const colorMap = {
      'Ia': '#006400', 'Ib': '#006400', 'II': '#228B22',
      'III': '#32CD32', 'IV': '#90EE90', 'V': '#98FB98', 'VI': '#00CED1',
    };
    const color = colorMap[area.iucn] || '#228B22';
    const size = area.area_km2 > 10000 ? 10 : area.area_km2 > 1000 ? 7 : 5;
    const marker = L.circleMarker([area.lat, area.lng], {
      pane: 'overlayLayersPane',
      radius: size,
      fillColor: color,
      color: '#000',
      weight: 1,
      fillOpacity: 0.7,
    });
    const areaStr = area.area_km2 >= 1000 ? `${(area.area_km2/1000).toFixed(1)}k km²` : `${area.area_km2} km²`;
    marker.bindTooltip(
      `<b style="color:${color}">🌲 ${escHtml(area.name)}</b>`
      + `<br><span style="color:var(--text-secondary)">${escHtml(area.country)}</span>`
      + `<br><span style="color:var(--text-muted)">${escHtml(area.type)} · ${areaStr}</span>`
      + `<br><span style="color:var(--text-muted)">Est. ${area.established}</span>`,
      { direction: 'top', className: 'admin1-tooltip' }
    );
    layers.push(marker);
  }
  S.protectedAreasLayer = L.layerGroup(layers).addTo(S.map);
  _log('protected-areas', `Displayed ${layers.length} areas`);
}