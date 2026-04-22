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

const _PLATE_NAMES = {
  AF: 'African', AN: 'Antarctic', SO: 'South American', NA: 'North American',
  PA: 'Pacific', AU: 'Australian', EU: 'Eurasian', IN: 'Indian', AR: 'Arabian',
  CO: 'Cocos', NZ: 'Nazca', PH: 'Philippine', CA: 'Caribbean', JF: 'Juan de Fuca',
  OK: 'Okhotsk', AM: 'Amur', SM: 'Somalia', NB: 'Nubia', SC: 'Scotia'
};

function _parsePlateName(code) {
  const parts = code.split('-');
  if (parts.length !== 2) return code;
  const [a, b] = parts.map(p => _PLATE_NAMES[p] || p);
  return `${a} – ${b} Boundary`;
}

// ── Tectonic plate boundaries ─────────────────────────────────────────────────
export async function toggleTectonicLayer() {
  S.tectonicOn = !S.tectonicOn;
  const btn = document.getElementById('tectonic-toggle-btn');
  if (S.tectonicOn) {
    btn.textContent = '🗺 Plates: …'; btn.classList.add('on');
    if (!S.tectonicData) {
      try {
        const res = await _kdbOrFetch('/tectonic-plates.json');
        S.tectonicData = await res.json();
      } catch(e) {
        _warn('tectonic', 'Failed to load');
        S.tectonicOn = false; btn.textContent = 'Tectonic Plates'; btn.classList.remove('on');
        return;
      }
    }
    btn.textContent = 'Tectonic Plates';
    S.tectonicLayer = L.geoJSON(S.tectonicData, {
      style: () => ({ color: '#e85d04', weight: 2, opacity: 0.7, interactive: false }),
      pane: 'choroplethPane',
      onEachFeature: (feature, layer) => {
        if (feature.properties.name) {
          const displayName = _parsePlateName(feature.properties.name);
          layer.bindTooltip(escHtml(displayName), {
            direction: 'top', className: 'admin1-tooltip', sticky: true,
          });
          layer.options.interactive = true;
        }
      },
    }).addTo(S.map);
  } else {
    btn.textContent = 'Tectonic Plates'; btn.classList.remove('on');
    if (S.tectonicLayer) { S.map.removeLayer(S.tectonicLayer); S.tectonicLayer = null; }
  }
}

// ── More Layers Dropdown ─────────────────────────────────────────────────────
export function toggleMoreLayers(e) {
  e.stopPropagation();
  const btn = document.getElementById('more-layers-btn');
  const menu = document.getElementById('more-layers-menu');
  const isOpen = menu.classList.contains('open');
  btn.classList.toggle('open', !isOpen);
  menu.classList.toggle('open', !isOpen);
}

export function _setLayerBtn(id, emoji, label, isOn) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.textContent = `${emoji} ${label}: ${isOn ? 'On' : 'Off'}`;
  btn.classList.toggle('on', isOn);
}