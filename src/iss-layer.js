import { S } from './state.js';

const L = window.L;

function _warn(tag, msg) { if (window.__KWDEBUG__) console.warn(`[${tag}] ${msg}`); }

// ── ISS live position tracker ────────────────────────────────────────────────
export async function toggleIssTracker() {
  S.issOn = !S.issOn;
  const btn = document.getElementById('iss-toggle-btn');
  if (S.issOn) {
    btn.textContent = 'ISS Tracker'; btn.classList.add('on');
    await _fetchIssPosition();
    S._issTimer = setInterval(() => _fetchIssPosition(), 5000);
  } else {
    btn.textContent = 'ISS Tracker'; btn.classList.remove('on');
    if (S._issTimer) { clearInterval(S._issTimer); S._issTimer = null; }
    if (S.issMarker) { S.map.removeLayer(S.issMarker); S.issMarker = null; }
  }
}

async function _fetchIssPosition() {
  try {
    const res = await fetch('http://api.open-notify.org/iss-now.json');
    const data = await res.json();
    const lat = parseFloat(data.iss_position.latitude);
    const lng = parseFloat(data.iss_position.longitude);
    if (S.issMarker) {
      S.issMarker.setLatLng([lat, lng]);
    } else {
      S.issMarker = L.marker([lat, lng], {
        pane: 'overlayLayersPane',
        icon: L.divIcon({
          html: '<span style="font-size:24px">🛰️</span>',
          className: 'iss-icon',
          iconSize: [28, 28], iconAnchor: [14, 14],
        }),
      }).addTo(S.map);
    }
    S.issMarker.bindTooltip(
      '<b style="color:var(--accent)">ISS</b>'
      + '<br><span style="color:var(--text-secondary)">' + lat.toFixed(2) + '°, ' + lng.toFixed(2) + '°</span>'
      + '<br><span style="color:var(--text-muted)">~408 km altitude · ~28,000 km/h</span>',
      { direction: 'top', className: 'admin1-tooltip' }
    );
  } catch(e) {
    _warn('iss', 'Failed to fetch position');
  }
}