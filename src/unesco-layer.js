import { S } from './state.js';
import { escHtml } from './utils.js';

const L = window.L;

// ── UNESCO World Heritage Sites layer ─────────────────────────────────────────
export function toggleUnescoLayer() {
  S.unescoOn = !S.unescoOn;
  var btn = document.getElementById('unesco-toggle-btn');
  if (S.unescoOn) {
    btn.textContent = 'UNESCO';
    btn.classList.add('on');
    buildUnescoLayer();
  } else {
    btn.textContent = 'UNESCO';
    btn.classList.remove('on');
    if (S.unescoLayer) { S.map.removeLayer(S.unescoLayer); S.unescoLayer = null; }
  }
}

export function buildUnescoLayer() {
  if (S.unescoLayer) { S.map.removeLayer(S.unescoLayer); S.unescoLayer = null; }
  if (!S.unescoOn || !S.unescoSites.length) return;
  var typeColor = { Cultural: '#e6a817', Natural: '#3fb950', Mixed: '#a371f7' };
  var markers = S.unescoSites.map(function(s) {
    var color = typeColor[s.type] || '#8b949e';
    var marker = L.circleMarker([s.lat, s.lng], {
      pane: 'overlayLayersPane',
      radius: 5, fillColor: color, color: '#0d1117', weight: 1, fillOpacity: 0.85,
    });
    marker.bindTooltip(
      '<b style="color:' + color + '">' + escHtml(s.name) + '</b><br>' +
      '<span style="color:var(--text-secondary)">' + s.type + ' · ' + s.year + ' · ' + s.iso2 + '</span>',
      { direction: 'top', className: 'admin1-tooltip' }
    );
    marker.on('click', function() { window.openCountryPanel(s.iso2); });
    return marker;
  });
  S.unescoLayer = L.layerGroup(markers).addTo(S.map);
}