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

// ── Submarine Cables layer ────────────────────────────────────────────────────
export async function toggleCableLayer() {
  S.cableOn = !S.cableOn;
  var btn = document.getElementById('cable-toggle-btn');
  if (S.cableOn) {
    btn.textContent = '📡 Cables: …';
    btn.classList.add('on');
    if (!S.cableData) {
      try {
        var res = await _kdbOrFetch('/submarine-cables.json');
        S.cableData = await res.json();
        _log('cables', 'Loaded:', S.cableData.cables.length, 'cables,', S.cableData.landings.length, 'landing points');
      } catch(e) {
        _warn('cables', 'Failed to load submarine-cables.json');
        S.cableOn = false; btn.textContent = 'Submarine Cables'; btn.classList.remove('on');
        return;
      }
    }
    btn.textContent = 'Submarine Cables';
    buildCableLayer();
  } else {
    btn.textContent = 'Submarine Cables';
    btn.classList.remove('on');
    if (S.cableLayer) { S.map.removeLayer(S.cableLayer); S.cableLayer = null; }
  }
}

export function buildCableLayer() {
  if (S.cableLayer) { S.map.removeLayer(S.cableLayer); S.cableLayer = null; }
  if (!S.cableOn || !S.cableData) return;
  var layers = [];
  for (var i = 0; i < S.cableData.cables.length; i++) {
    var c = S.cableData.cables[i];
    for (var j = 0; j < c.segments.length; j++) {
      var latlngs = c.segments[j].map(function(p) { return [p[1], p[0]]; });
      var line = L.polyline(latlngs, {
        pane: 'overlayLayersPane',
        color: c.color || '#58a6ff', weight: 1.5, opacity: 0.6,
      });
      line.bindTooltip('<b style="color:var(--accent)">' + escHtml(c.name) + '</b>', {
        direction: 'top', className: 'admin1-tooltip', sticky: true,
      });
      layers.push(line);
    }
  }
  for (var k = 0; k < S.cableData.landings.length; k++) {
    var lp = S.cableData.landings[k];
    var dot = L.circleMarker([lp.lat, lp.lng], {
      pane: 'overlayLayersPane',
      radius: 2.5, fillColor: '#58a6ff', color: '#0d1117', weight: 0.5,
      fillOpacity: 0.7,
    });
    dot.bindTooltip('<b style="color:var(--accent)">' + escHtml(lp.name) + '</b>', {
      direction: 'top', className: 'admin1-tooltip',
    });
    layers.push(dot);
  }
  S.cableLayer = L.layerGroup(layers).addTo(S.map);
}