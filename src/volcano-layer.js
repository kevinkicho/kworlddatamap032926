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

function _volcanoColor(lastEruption) {
  if (lastEruption == null) return '#888';
  if (lastEruption > 1900) return '#d62828';
  if (lastEruption > 0) return '#ef8354';
  if (lastEruption > -10000) return '#ffd166';
  return '#888';
}

// ── Volcano layer ─────────────────────────────────────────────────────────────
export async function toggleVolcanoLayer() {
  S.volcanoOn = !S.volcanoOn;
  const btn = document.getElementById('volcano-toggle-btn');
  if (S.volcanoOn) {
    btn.textContent = 'Volcanoes'; btn.classList.add('on');
    if (!S.volcanoData) {
      try {
        const res = await _kdbOrFetch('/volcanoes_full.json');
        S.volcanoData = await res.json();
      } catch(e) {
        _warn('volcano', 'Failed to load');
        S.volcanoOn = false; btn.textContent = 'Volcanoes'; btn.classList.remove('on');
        return;
      }
    }
    btn.textContent = 'Volcanoes';
    _buildVolcanoLayer();
  } else {
    btn.textContent = 'Volcanoes'; btn.classList.remove('on');
    if (S.volcanoLayer) { S.map.removeLayer(S.volcanoLayer); S.volcanoLayer = null; }
  }
}

export function _buildVolcanoLayer() {
  if (S.volcanoLayer) { S.map.removeLayer(S.volcanoLayer); S.volcanoLayer = null; }
  if (!S.volcanoOn || !S.volcanoData) return;
  const layers = [];
  for (const f of S.volcanoData.features) {
    const [lng, lat] = f.geometry.coordinates;
    const props = f.properties;
    const marker = L.circleMarker([lat, lng], {
      pane: 'overlayLayersPane',
      radius: 5,
      fillColor: _volcanoColor(props.Last_Eruption_Year),
      color: '#000', weight: 0.5, fillOpacity: 0.85,
    });
    const elev = props.Elevation || 0;
    const lastYr = props.Last_Eruption_Year;
    const lastStr = lastYr == null ? 'Unknown' :
                    lastYr < 0 ? `${Math.abs(lastYr)} BCE` :
                    `${lastYr}`;
    marker.bindTooltip(
      '<b style="color:var(--red)">' + escHtml(props.Volcano_Name || 'Volcano') + '</b>'
      + '<br><span style="color:var(--text-secondary)">' + escHtml(props.Country || '') + '</span>'
      + '<br>Elevation: ' + elev + ' m'
      + '<br>Last eruption: ' + lastStr
      + '<br><span style="color:var(--text-muted)">' + escHtml(props.Primary_Volcano_Type || '') + '</span>',
      { direction: 'top', className: 'admin1-tooltip' }
    );
    layers.push(marker);
  }
  S.volcanoLayer = L.layerGroup(layers).addTo(S.map);
}