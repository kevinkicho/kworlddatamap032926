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

// ── Marine EEZ boundaries layer ──────────────────────────────────────────────
export async function toggleEezLayer() {
  S.eezOn = !S.eezOn;
  const btn = document.getElementById('eez-toggle-btn');
  if (S.eezOn) {
    btn.textContent = 'EEZ Boundaries'; btn.classList.add('on');
    if (!S.eezData) {
      try {
        const res = await _kdbOrFetch('/eez_boundaries.json');
        S.eezData = await res.json();
        if (typeof DatasetManager !== 'undefined') {
          DatasetManager.register('eezData', S.eezData, 'low');
        }
      } catch(e) {
        _warn('eez', 'Failed to load');
        S.eezOn = false; btn.textContent = 'EEZ Boundaries'; btn.classList.remove('on');
        return;
      }
    }
    btn.textContent = 'EEZ Boundaries';
    _buildEezLayer();
  } else {
    btn.textContent = 'EEZ Boundaries'; btn.classList.remove('on');
    if (S.eezLayer) { S.map.removeLayer(S.eezLayer); S.eezLayer = null; }
    if (typeof DatasetManager !== 'undefined') {
      DatasetManager.unregister('eezData');
    }
  }
}

export function _buildEezLayer() {
  if (S.eezLayer) { S.map.removeLayer(S.eezLayer); S.eezLayer = null; }
    if (typeof DatasetManager !== 'undefined') {
      DatasetManager.unregister('eezData');
    }
  if (!S.eezOn || !S.eezData) return;
  S.eezLayer = L.geoJSON(S.eezData, {
    style: () => ({
      color: '#58a6ff',
      weight: 1,
      fillOpacity: 0.05,
      fillColor: '#58a6ff',
    }),
    pane: 'choroplethPane',
    onEachFeature: (feature, layer) => {
      const props = feature.properties;
      if (props.name) {
        layer.bindTooltip(escHtml(props.name), {
          direction: 'top', className: 'admin1-tooltip', sticky: true,
        });
        layer.options.interactive = true;
      }
    },
  }).addTo(S.map);
}