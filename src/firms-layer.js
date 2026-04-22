import { S } from './state.js';

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

let _wildfireMoveHandler = null;

// ── NASA FIRMS Wildfire Layer ──────────────────────────────────────────────────
export async function toggleWildfireLayer() {
  S.wildfireOn = !S.wildfireOn;
  const btn = document.getElementById('wildfire-toggle-btn');
  if (S.wildfireOn) {
    btn.textContent = 'Wildfires';
    btn.classList.add('on');
    await _fetchWildfireData();
    // Refresh when map is panned/zoomed
    if (!_wildfireMoveHandler) {
      _wildfireMoveHandler = () => {
        if (S.wildfireOn && S.map.getZoom() >= 4) {
          _fetchWildfireData();
        }
      };
      S.map.on('moveend', _wildfireMoveHandler);
    }
  } else {
    btn.textContent = 'Wildfires';
    btn.classList.remove('on');
    if (S.wildfireLayer) { S.map.removeLayer(S.wildfireLayer); S.wildfireLayer = null; }
    if (typeof DatasetManager !== 'undefined') {
      DatasetManager.unregister('wildfireData');
    }
    if (_wildfireMoveHandler) {
      S.map.off('moveend', _wildfireMoveHandler);
      _wildfireMoveHandler = null;
    }
  }
}

async function _fetchWildfireData() {
  try {
      const res = await _kdbOrFetch('/wildfires-live-lite.json');
    if (!res.ok) { _warn('wildfire', 'No data available'); return; }
    const data = await res.json();

    const zoom = S.map.getZoom();

    if (!S.wildfireLayer) {
      S.wildfireLayer = L.layerGroup();
    } else {
      S.wildfireLayer.clearLayers();
    }

    // Clear any previous zoom warning
    if (S.layersInfo && S.layersInfo.includes('Zoom in')) {
      document.getElementById('layers-info').textContent = '';
      S.layersInfo = '';
    }

    // Get viewport bounds
    const bounds = S.map.getBounds();
    const padding = zoom >= 8 ? 0.5 : zoom >= 6 ? 2 : 5;
    const south = Math.max(-90, bounds.getSouth() - padding);
    const north = Math.min(90, bounds.getNorth() + padding);
    let west = bounds.getWest() - padding;
    let east = bounds.getEast() + padding;

    // No zoom-based limits - show all fires (FRP filter already reduced count significantly)
    const MAX_FIRES = data.fires?.length || 1000;

    const markers = [];
    let count = 0;
    let outsideCount = 0;

    for (const f of data.fires || []) {
      if (f.lo === null || f.la === null) continue;

      // Bounds check
      let inBounds = f.la >= south && f.la <= north;
      if (inBounds) {
        if (east > 180 || west < -180) {
          inBounds = (f.lo >= west || f.lo >= 180) || (f.lo <= east || f.lo <= -180);
        } else {
          inBounds = f.lo >= west && f.lo <= east;
        }
      }
      if (!inBounds) { outsideCount++; continue; }

      // Color based on confidence
      const conf = f.c || 70;
      const color = conf >= 70 ? '#ff3333' : conf >= 40 ? '#ff8800' : '#ffcc00';
      const radius = f.s === 1 ? 2.5 : 3.5;

      const marker = L.circleMarker([f.la, f.lo], {
        pane: 'overlayLayersPane',
        radius: radius,
        fillColor: color,
        color: '#000',
        weight: 0.5,
        opacity: 0.7,
        fillOpacity: 0.8
      });

      const sat = f.s === 1 ? 'VIIRS' : 'MODIS';
      const time = f.d === 1 ? 'Day' : 'Night';
      const brightness = f.b ? `${Math.round(f.b)}K` : 'N/A';
      const date = f.date || 'N/A';

      marker.bindTooltip(
        `<b style="color:${color}">🔥 Wildfire</b>`
        + `<br><span style="color:var(--text-secondary)">Confidence: ${conf}%</span>`
        + `<br><span style="color:var(--text-muted)">${sat} · ${time} · ${brightness}</span>`
        + `<br><span style="color:var(--text-muted)">${date}</span>`,
        { direction: 'top', className: 'admin1-tooltip', sticky: false, permanent: false }
      );

      markers.push(marker);
      count++;
    }

    S.wildfireLayer = L.layerGroup(markers).addTo(S.map);
    _log('wildfire', `Displayed ${count} fires (zoom ${zoom}, viewport: ${outsideCount} culled)`);
  } catch(e) {
    _warn('wildfire', 'Failed:', e.message);
  }
}