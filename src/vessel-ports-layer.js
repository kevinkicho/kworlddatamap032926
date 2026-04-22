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

// ── Shipping Ports Layer ──────────────────────────────────────────────────────
export async function toggleVesselPortsLayer() {
  S.vesselPortsOn = !S.vesselPortsOn;
  const btn = document.getElementById('vessel-ports-toggle-btn');
  if (S.vesselPortsOn) {
    btn.textContent = 'Ports';
    btn.classList.add('on');
    if (!S.vesselPortsData) {
      try {
        const res = await _kdbOrFetch('/vessel-ports.json');
        S.vesselPortsData = await res.json();
      } catch(e) {
        _warn('vessel-ports', 'Failed to load');
        S.vesselPortsOn = false; btn.textContent = 'Ports'; btn.classList.remove('on');
        return;
      }
    }
    _buildVesselPortsLayer();
  } else {
    btn.textContent = 'Ports';
    btn.classList.remove('on');
    if (S.vesselPortsLayer) { S.map.removeLayer(S.vesselPortsLayer); S.vesselPortsLayer = null; }
  }
}

export function _buildVesselPortsLayer() {
  if (S.vesselPortsLayer) { S.map.removeLayer(S.vesselPortsLayer); S.vesselPortsLayer = null; }
  if (!S.vesselPortsOn || !S.vesselPortsData) return;
  const layers = [];
  for (const port of S.vesselPortsData.ports || []) {
    if (port.lat === null || port.lng === null) continue;
    const colorMap = { 'Large': '#ff4444', 'Medium': '#ffaa00', 'Small': '#888888' };
    const color = colorMap[port.harbor_size] || '#888888';
    const size = port.harbor_size === 'Large' ? 10 : port.harbor_size === 'Medium' ? 7 : 5;
    const marker = L.circleMarker([port.lat, port.lng], {
      pane: 'overlayLayersPane',
      radius: size,
      fillColor: color,
      color: '#000',
      weight: 1,
      fillOpacity: 0.8,
    });
    marker.bindTooltip(
      `<b style="color:${color}">⚓ ${escHtml(port.name)}</b>`
      + `<br><span style="color:var(--text-secondary)">${escHtml(port.city)}, ${escHtml(port.country)}</span>`
      + `<br><span style="color:var(--text-muted)">${escHtml(port.facilities)}</span>`
      + `<br><span style="color:var(--text-muted)">Size: ${port.harbor_size}</span>`,
      { direction: 'top', className: 'admin1-tooltip' }
    );
    layers.push(marker);
  }
  S.vesselPortsLayer = L.layerGroup(layers).addTo(S.map);
  _log('vessel-ports', `Displayed ${layers.length} ports`);
}