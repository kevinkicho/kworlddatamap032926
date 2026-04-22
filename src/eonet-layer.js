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

// ── NASA EONET Natural Events Layer ────────────────────────────────────────────
export async function toggleEonetLayer() {
  S.eonetOn = !S.eonetOn;
  const btn = document.getElementById('eonet-toggle-btn');
  if (S.eonetOn) {
    btn.textContent = 'Natural Events';
    btn.classList.add('on');
    if (!S.eonetData) {
      try {
        const res = await _kdbOrFetch('/eonet-events-lite.json');
        S.eonetData = await res.json();
      } catch(e) {
        _warn('eonet', 'Failed to load');
        S.eonetOn = false; btn.textContent = 'Natural Events'; btn.classList.remove('on');
        return;
      }
    }
    _buildEonetLayer();
  } else {
    btn.textContent = 'Natural Events';
    btn.classList.remove('on');
    if (S.eonetLayer) { S.map.removeLayer(S.eonetLayer); S.eonetLayer = null; }
  }
}

export function _buildEonetLayer() {
  if (S.eonetLayer) { S.map.removeLayer(S.eonetLayer); S.eonetLayer = null; }
  if (!S.eonetOn || !S.eonetData) return;
  const layers = [];
  for (const e of S.eonetData.events || []) {
    if (e.lo === null || e.la === null) continue;
    const colorMap = {
      'Wildfires': '#ff6b6b',
      'Volcanoes': '#ffd93d',
      'Severe Storms': '#6b9bff',
      'Dust Storms': '#d4a574',
      'Landslides': '#a574d4',
      'Sea and Lake Ice': '#74d4d4',
      'Smoke': '#a5a5a5',
    };
    const color = colorMap[e.c] || '#888888';
    const size = e.s === 2 ? 8 : e.s === 1 ? 6 : 4;
    const marker = L.circleMarker([e.la, e.lo], {
      pane: 'overlayLayersPane',
      radius: size,
      fillColor: color,
      color: '#000',
      weight: 1,
      fillOpacity: 0.8,
    });
    marker.bindTooltip(
      `<b style="color:${color}">${escHtml(e.t)}</b>`
      + `<br><span style="color:var(--text-secondary)">${escHtml(e.c)}</span>`
      + `<br><span style="color:var(--text-muted)">Date: ${e.d}</span>`,
      { direction: 'top', className: 'admin1-tooltip' }
    );
    layers.push(marker);
  }
  S.eonetLayer = L.layerGroup(layers).addTo(S.map);
  _log('eonet', `Displayed ${layers.length} events`);
}