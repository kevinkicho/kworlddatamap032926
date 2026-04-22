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

// ── FlightAware Aircraft Tracking ─────────────────────────────────────────────
export async function toggleFlightAwareLayer() {
  S.flightAwareOn = !S.flightAwareOn;
  const btn = document.getElementById('flightaware-toggle-btn');
  if (S.flightAwareOn) {
    btn.textContent = '✈️ FlightAware: On';
    btn.classList.add('on');
    if (!S.flightAwareData) {
      try {
        const res = await _kdbOrFetch('/flightaware-flights-lite.json');
        S.flightAwareData = await res.json();
      } catch(e) {
        _warn('flightaware', 'Failed to load');
        S.flightAwareOn = false; btn.textContent = '✈️ FlightAware: Off'; btn.classList.remove('on');
        return;
      }
    }
    _buildFlightAwareLayer();
  } else {
    btn.textContent = '✈️ FlightAware: Off';
    btn.classList.remove('on');
    if (S.flightAwareLayer) { S.map.removeLayer(S.flightAwareLayer); S.flightAwareLayer = null; }
  }
}

export function _buildFlightAwareLayer() {
  if (S.flightAwareLayer) { S.map.removeLayer(S.flightAwareLayer); S.flightAwareLayer = null; }
  if (!S.flightAwareOn || !S.flightAwareData) return;
  const layers = [];
  for (const f of S.flightAwareData.flights || []) {
    const headingRad = (f.hdg * Math.PI) / 180;
    const startLat = f.lat - (Math.cos(headingRad) * 0.5);
    const startLng = f.lng - (Math.sin(headingRad) * 0.5);
    const endLat = f.lat + (Math.cos(headingRad) * 0.5);
    const endLng = f.lng + (Math.sin(headingRad) * 0.5);

    const aircraftType = f.ac || 'Unknown';
    const altitudeClass = f.alt > 35000 ? 'long-haul' : f.alt > 20000 ? 'medium' : 'short';
    const color = altitudeClass === 'long-haul' ? '#3b82f6' : altitudeClass === 'medium' ? '#22c55e' : '#f59e0b';

    const arrow = L.polyline([[startLat, startLng], [endLat, endLng]], {
      color,
      weight: 2,
      opacity: 0.8,
    });

    const airline = f.cs?.match(/[A-Z]+/)?.[0] || f.cs || 'Unknown';
    arrow.bindTooltip(
      `<b style="color:${color}">✈️ ${f.cs || 'Flight'}</b>`
      + `<br><span style="color:var(--text-secondary)">${airline} ${aircraftType}</span>`
      + `<br><span style="color:var(--text-muted)">${f.org} → ${f.dst}</span>`
      + `<br><span style="color:var(--text-muted)">Alt: ${f.alt.toLocaleString()} ft | Spd: ${f.spd} kts</span>`,
      { direction: 'top', className: 'admin1-tooltip', sticky: false }
    );
    layers.push(arrow);
  }
  S.flightAwareLayer = L.layerGroup(layers).addTo(S.map);
  _log('flightaware', `Displayed ${layers.length} flights`);
}