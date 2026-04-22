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

function _warn(tag, msg) { if (window.__KWDEBUG__) console.warn(`[${tag}] ${msg}`); }

// ── Space launch sites layer ─────────────────────────────────────────────────
export async function toggleLaunchSiteLayer() {
  S.launchSiteOn = !S.launchSiteOn;
  const btn = document.getElementById('launchsite-toggle-btn');
  if (S.launchSiteOn) {
    btn.textContent = '🚀 Launch: …'; btn.classList.add('on');
    if (!S.launchSiteData) {
      try {
        const res = await _kdbOrFetch('/launch_sites.json');
        S.launchSiteData = await res.json();
      } catch(e) {
        _warn('launchSite', 'Failed to load');
        S.launchSiteOn = false; btn.textContent = 'Launch Sites'; btn.classList.remove('on');
        return;
      }
    }
    btn.textContent = 'Launch Sites';
    _buildLaunchSiteLayer();
  } else {
    btn.textContent = 'Launch Sites'; btn.classList.remove('on');
    if (S.launchSiteLayer) { S.map.removeLayer(S.launchSiteLayer); S.launchSiteLayer = null; }
  }
}

export function _buildLaunchSiteLayer() {
  if (S.launchSiteLayer) { S.map.removeLayer(S.launchSiteLayer); S.launchSiteLayer = null; }
  if (!S.launchSiteOn || !S.launchSiteData) return;
  const layers = [];
  for (const f of S.launchSiteData.features) {
    const [lng, lat] = f.geometry.coordinates;
    const props = f.properties;
    const marker = L.marker([lat, lng], {
      pane: 'overlayLayersPane',
      icon: L.divIcon({
        html: '<span style="font-size:16px">🚀</span>',
        className: 'launchsite-icon',
        iconSize: [20, 20], iconAnchor: [10, 10],
      }),
    });
    marker.bindTooltip(
      '<b style="color:var(--accent)">🚀 ' + escHtml(props.name) + '</b>'
      + '<br><span style="color:var(--text-muted);font-size:0.85em">' + escHtml(props.abbr || '') + '</span>',
      { direction: 'top', className: 'admin1-tooltip' }
    );
    layers.push(marker);
  }
  S.launchSiteLayer = L.layerGroup(layers).addTo(S.map);
}