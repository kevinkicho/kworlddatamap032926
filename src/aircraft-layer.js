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

let _aircraftMoveHandler = null;

// ── OpenSky live aircraft tracker ─────────────────────────────────────────────
export async function toggleAircraftLayer() {
  S.aircraftOn = !S.aircraftOn;
  const btn = document.getElementById('aircraft-toggle-btn');
  if (S.aircraftOn) {
    btn.textContent = '✈️ Aircraft: On'; btn.classList.add('on');
    await _fetchAircraftPositions();
    S._aircraftTimer = setInterval(() => _fetchAircraftPositions(), 30000);

    // Refresh aircraft when map is panned/zoomed
    if (!_aircraftMoveHandler) {
      _aircraftMoveHandler = () => {
        if (S.aircraftOn && S.map.getZoom() >= 5) {
          _fetchAircraftPositions();
        }
      };
      S.map.on('moveend', _aircraftMoveHandler);
    }
  } else {
    btn.textContent = '✈️ Aircraft: Off'; btn.classList.remove('on');
    if (S._aircraftTimer) { clearInterval(S._aircraftTimer); S._aircraftTimer = null; }
    if (S.aircraftLayer) { S.map.removeLayer(S.aircraftLayer); S.aircraftLayer = null; }
    // Remove move handler
    if (_aircraftMoveHandler) {
      S.map.off('moveend', _aircraftMoveHandler);
      _aircraftMoveHandler = null;
    }
    // Clear zoom warning message
    if (S.layersInfo && S.layersInfo.includes('✈️ Zoom in')) {
      document.getElementById('layers-info').textContent = '';
      S.layersInfo = '';
    }
  }
}

async function _fetchAircraftPositions() {
  try {
      const res = await _kdbOrFetch('/aircraft-live-lite.json');
    if (!res.ok) { _warn('aircraft', 'No data available'); return; }
    const data = await res.json();

    const zoom = S.map.getZoom();

    if (!S.aircraftLayer) {
      S.aircraftLayer = L.layerGroup();
    } else {
      S.aircraftLayer.clearLayers();
    }

    // Show zoom warning if too low
    if (zoom < 5) {
      S.layersInfo = '✈️ Zoom in to see aircraft (need zoom 5+)';
      document.getElementById('layers-info').textContent = S.layersInfo;
      return;
    } else if (S.layersInfo && S.layersInfo.includes('Zoom in')) {
      document.getElementById('layers-info').textContent = '';
      S.layersInfo = '';
    }

    // Get viewport bounds with padding based on zoom
    const bounds = S.map.getBounds();
    const padding = zoom >= 10 ? 0.2 : zoom >= 7 ? 0.5 : 1.0;
    const south = Math.max(-90, bounds.getSouth() - padding);
    const north = Math.min(90, bounds.getNorth() + padding);
    let west = bounds.getWest() - padding;
    let east = bounds.getEast() + padding;

    // Performance limit based on zoom - more generous at higher zooms
    const MAX_AIRCRAFT = zoom >= 13 ? 1000 : zoom >= 11 ? 500 : zoom >= 8 ? 250 : 100;

    // Track last clicked marker for tooltip cleanup
    let lastClickedMarker = null;

    // Build markers array first (faster than adding one-by-one)
    const markers = [];
    let count = 0;

    for (const a of data.aircraft || []) {
      if (count >= MAX_AIRCRAFT) break;
      if (a.lo === null || a.la === null) continue;

      // Bounds check
      let inBounds = a.la >= south && a.la <= north;
      if (inBounds) {
        if (east > 180 || west < -180) {
          inBounds = (a.lo >= west || a.lo >= 180) || (a.lo <= east || a.lo <= -180);
        } else {
          inBounds = a.lo >= west && a.lo <= east;
        }
      }
      if (!inBounds) continue;

      const heading = a.t || 0;
      const icon = L.divIcon({
        html: `<div style="width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-bottom:8px solid #3b82f6;transform:rotate(${heading}deg)"></div>`,
        className: 'aircraft-icon',
        iconSize: [10, 10],
        iconAnchor: [5, 5],
      });

      const marker = L.marker([a.la, a.lo], { pane: 'overlayLayersPane', icon });

      // Store tooltip data on marker
      const tooltipData = {
        callsign: a.c || 'N/A',
        country: a.n || '',
        alt: a.a ? Math.round(a.a / 0.3048) : null,
        speed: a.v ? Math.round(a.v * 1.944) : null,
        ground: a.g,
      };

      marker.on('click', function() {
        // Close previous tooltip
        if (lastClickedMarker && lastClickedMarker !== this) {
          lastClickedMarker.closeTooltip();
        }
        // Show new tooltip
        const tt = L.tooltip({
          content: `<b style="color:var(--accent)">${escHtml(tooltipData.callsign)}</b>`
            + `<br><span style="color:var(--text-secondary)">${escHtml(tooltipData.country)}${tooltipData.ground ? ' (Ground)' : ''}</span>`
            + `<br><span style="color:var(--text-muted)">${tooltipData.alt ? tooltipData.alt.toLocaleString() + ' ft' : 'N/A'} · ${tooltipData.speed ? tooltipData.speed + ' kts' : 'N/A'}</span>`,
          direction: 'top',
          className: 'admin1-tooltip',
        });
        this.bindTooltip(tt).openTooltip();
        lastClickedMarker = this;
      });

      markers.push(marker);
      count++;
    }

    // Add all markers at once (faster)
    S.aircraftLayer = L.layerGroup(markers).addTo(S.map);

    _log('aircraft', `Displayed ${count}/${MAX_AIRCRAFT} aircraft (zoom ${zoom})`);
  } catch(e) {
    _warn('aircraft', 'Failed:', e.message);
  }
}