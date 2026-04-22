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

// ── PeeringDB Internet Infrastructure Layer ────────────────────────────────────
export async function togglePeeringdbLayer() {
  S.peeringdbOn = !S.peeringdbOn;
  const btn = document.getElementById('peeringdb-toggle-btn');
  if (S.peeringdbOn) {
    btn.textContent = 'Internet Exchanges';
    btn.classList.add('on');
    if (!S.peeringdbData) {
      try {
        const res = await _kdbOrFetch('/peeringdb.json');
        S.peeringdbData = await res.json();
        _log('peeringdb', 'Loaded:', S.peeringdbData.ixps.length, 'IXPs,', S.peeringdbData.stats?.total_ixps_with_coords || S.peeringdbData.ixps.filter(x => x.lat !== null).length, 'with coords');
      } catch(e) {
        _warn('peeringdb', 'Failed to load:', e);
        S.peeringdbOn = false; btn.textContent = 'Internet Exchanges'; btn.classList.remove('on');
        return;
      }
    }
    _buildPeeringdbLayer();
  } else {
    btn.textContent = 'Internet Exchanges';
    btn.classList.remove('on');
    if (S.peeringdbLayer) { S.map.removeLayer(S.peeringdbLayer); S.peeringdbLayer = null; }
  }
}

export function _buildPeeringdbLayer() {
  if (S.peeringdbLayer) { S.map.removeLayer(S.peeringdbLayer); S.peeringdbLayer = null; }
  if (!S.peeringdbOn || !S.peeringdbData) return;
  const layers = [];
  // IXPs - blue circles
  for (const ixp of S.peeringdbData.ixps || []) {
    if (ixp.lat === null || ixp.lng === null) continue;
    const marker = L.circleMarker([ixp.lat, ixp.lng], {
      pane: 'overlayLayersPane',
      radius: 6,
      fillColor: '#3b82f6',
      color: '#1d4ed8',
      weight: 2,
      fillOpacity: 0.8,
    });
    marker.bindTooltip(
      `<b style="color:#3b82f6">🌐 ${escHtml(ixp.name)}</b>`
      + `<br><span style="color:var(--text-secondary)">IXP · ${escHtml(ixp.city)}</span>`
      + `<br><span style="color:var(--text-muted)">${ixp.networks_count} networks</span>`,
      { direction: 'top', className: 'admin1-tooltip' }
    );
    layers.push(marker);
  }
  S.peeringdbLayer = L.layerGroup(layers).addTo(S.map);
  _log('peeringdb', `Displayed ${layers.length} IXPs`);
}