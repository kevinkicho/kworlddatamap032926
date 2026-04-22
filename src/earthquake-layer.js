import { S } from './state.js';
import { escHtml } from './utils.js';

const L = window.L;

function _log(tag, msg) { if (window.__KWDEBUG__) console.log(`[${tag}] ${msg}`); }
function _warn(tag, msg) { if (window.__KWDEBUG__) console.warn(`[${tag}] ${msg}`); }

function _quakeColor(depth) {
  if (depth < 70) return '#ffd166';
  if (depth < 300) return '#ef8354';
  return '#d62828';
}

// ── Real-time earthquake layer ───────────────────────────────────────────────
export async function toggleEarthquakeLayer() {
  S.earthquakeOn = !S.earthquakeOn;
  const btn = document.getElementById('earthquake-toggle-btn');
  if (S.earthquakeOn) {
    btn.textContent = 'Earthquakes'; btn.classList.add('on');
    await _fetchEarthquakes();
    S._earthquakeTimer = setInterval(() => _fetchEarthquakes(), 5 * 60_000);
  } else {
    btn.textContent = 'Earthquakes'; btn.classList.remove('on');
    if (S._earthquakeTimer) { clearInterval(S._earthquakeTimer); S._earthquakeTimer = null; }
    if (S.earthquakeLayer) { S.map.removeLayer(S.earthquakeLayer); S.earthquakeLayer = null; }
  }
}

async function _fetchEarthquakes() {
  try {
    const res = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson');
    S.earthquakeData = await res.json();
  } catch(e) {
    _warn('earthquake', 'Failed to fetch USGS data');
    return;
  }
  _buildEarthquakeLayer();
}

export function _buildEarthquakeLayer() {
  if (S.earthquakeLayer) { S.map.removeLayer(S.earthquakeLayer); S.earthquakeLayer = null; }
  if (!S.earthquakeOn || !S.earthquakeData) return;
  const layers = [];
  for (const f of S.earthquakeData.features) {
    const [lng, lat, depth] = f.geometry.coordinates;
    const mag = f.properties.mag || 0;
    const marker = L.circleMarker([lat, lng], {
      pane: 'overlayLayersPane',
      radius: 2 + mag * 2,
      fillColor: _quakeColor(depth),
      color: '#000', weight: 0.5, fillOpacity: 0.75,
    });
    const time = new Date(f.properties.time).toLocaleString();
    marker.bindTooltip(
      '<b style="color:var(--gold)">M' + mag.toFixed(1) + '</b> '
      + escHtml(f.properties.place || '')
      + '<br><span style="color:var(--text-secondary)">Depth: ' + (depth || 0).toFixed(0) + ' km</span>'
      + '<br><span style="color:var(--text-muted)">' + time + '</span>',
      { direction: 'top', className: 'admin1-tooltip' }
    );
    layers.push(marker);
  }
  S.earthquakeLayer = L.layerGroup(layers).addTo(S.map);
}