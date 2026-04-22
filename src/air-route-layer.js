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

function _greatCirclePoints(lat1, lng1, lat2, lng2, n) {
  var toRad = Math.PI / 180, toDeg = 180 / Math.PI;
  var la1 = lat1 * toRad, lo1 = lng1 * toRad, la2 = lat2 * toRad, lo2 = lng2 * toRad;

  var dLon = Math.abs(lo2 - lo1);
  var crossesAnti = dLon > Math.PI;

  if (crossesAnti) {
    if (lo2 > lo1) lo1 += 2 * Math.PI;
    else lo2 += 2 * Math.PI;
  }

  var d = 2 * Math.asin(Math.sqrt(Math.pow(Math.sin((la2 - la1) / 2), 2) + Math.cos(la1) * Math.cos(la2) * Math.pow(Math.sin((lo2 - lo1) / 2), 2)));
  if (d < 0.01) return { pts: [[lat1, lng1], [lat2, lng2]], crossesAnti: false };

  var pts = [];
  for (var i = 0; i <= n; i++) {
    var f = i / n;
    var A = Math.sin((1 - f) * d) / Math.sin(d);
    var B = Math.sin(f * d) / Math.sin(d);
    var x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
    var y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
    var z = A * Math.sin(la1) + B * Math.sin(la2);
    var lat = Math.atan2(z, Math.sqrt(x * x + y * y)) * toDeg;
    var lng = Math.atan2(y, x) * toDeg;
    if (lng > 180) lng -= 360;
    if (lng < -180) lng += 360;
    pts.push([lat, lng]);
  }
  return { pts, crossesAnti };
}

// ── Air Routes layer ──────────────────────────────────────────────────────────
export async function toggleAirRouteLayer() {
  S.airRouteOn = !S.airRouteOn;
  var btn = document.getElementById('airroute-toggle-btn');
  if (S.airRouteOn) {
    btn.textContent = '✈ Flights: …';
    btn.classList.add('on');
    if (!S.airRouteData) {
      try {
        var res = await _kdbOrFetch('/air-routes.json');
        S.airRouteData = await res.json();
        _log('air-routes', 'Loaded:', S.airRouteData.routes.length, 'routes');
      } catch(e) {
        _warn('air-routes', 'Failed to load');
        S.airRouteOn = false; btn.textContent = '✈ Flights: Off'; btn.classList.remove('on');
        return;
      }
    }
    btn.textContent = '✈ Flights: On';
    buildAirRouteLayer();
  } else {
    btn.textContent = '✈ Flights: Off';
    btn.classList.remove('on');
    if (S.airRouteLayer) { S.map.removeLayer(S.airRouteLayer); S.airRouteLayer = null; }
  }
}

export function buildAirRouteLayer() {
  if (S.airRouteLayer) { S.map.removeLayer(S.airRouteLayer); S.airRouteLayer = null; }
  if (!S.airRouteOn || !S.airRouteData) return;
  var layers = [];
  var maxAirlines = S.airRouteData.routes[0]?.airlines || 24;
  for (var i = 0; i < S.airRouteData.routes.length; i++) {
    var r = S.airRouteData.routes[i];
    var result = _greatCirclePoints(r.lat1, r.lng1, r.lat2, r.lng2, 20);
    var pts = result.pts;
    var weight = 0.5 + (r.airlines / maxAirlines) * 2;
    var opacity = 0.15 + (r.airlines / maxAirlines) * 0.4;

    if (result.crossesAnti) {
      var splitIdx = -1;
      for (var j = 1; j < pts.length; j++) {
        var dLng = Math.abs(pts[j][1] - pts[j-1][1]);
        if (dLng > 170) { splitIdx = j; break; }
      }
      if (splitIdx > 0) {
        var pts1 = pts.slice(0, splitIdx);
        var line1 = L.polyline(pts1, { pane: 'overlayLayersPane', color: '#58a6ff', weight: weight, opacity: opacity });
        layers.push(line1);
        var pts2 = pts.slice(splitIdx);
        var line2 = L.polyline(pts2, { pane: 'overlayLayersPane', color: '#58a6ff', weight: weight, opacity: opacity });
        layers.push(line2);
        continue;
      }
    }
    var line = L.polyline(pts, {
      pane: 'overlayLayersPane',
      color: '#58a6ff', weight: weight, opacity: opacity,
    });
    line.bindTooltip(
      '<b style="color:var(--accent)">' + escHtml(r.fromIata) + ' ↔ ' + escHtml(r.toIata) + '</b><br>' +
      '<span style="color:var(--text-secondary)">' + escHtml(r.from) + ' ↔ ' + escHtml(r.to) + '</span><br>' +
      '<span style="color:var(--univ-gold)">' + r.airlines + ' airlines</span>',
      { direction: 'top', className: 'admin1-tooltip', sticky: true }
    );
    layers.push(line);
  }
  if (S.airRouteData.hubs) {
    for (var j = 0; j < S.airRouteData.hubs.length; j++) {
      var h = S.airRouteData.hubs[j];
      var dot = L.circleMarker([h.lat, h.lng], {
        pane: 'overlayLayersPane',
        radius: 3 + h.routes / 5, fillColor: '#e3b341', color: '#0d1117',
        weight: 1, fillOpacity: 0.8,
      });
      dot.bindTooltip(
        '<b style="color:var(--univ-gold)">' + escHtml(h.iata) + '</b> ' + escHtml(h.city) + '<br>' +
        '<span style="color:var(--text-secondary)">' + h.routes + ' top intl routes</span>',
        { direction: 'top', className: 'admin1-tooltip' }
      );
      layers.push(dot);
    }
  }
  S.airRouteLayer = L.layerGroup(layers).addTo(S.map);
}