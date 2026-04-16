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

// ── Phase 2 Layers ────────────────────────────────────────────────────────────
// GTD Terrorism Database
export async function toggleGtdLayer() {
  S.gtdOn = !S.gtdOn;
  const btn = document.getElementById('gtd-toggle-btn');
  if (S.gtdOn) {
    btn.textContent = 'Terrorism';
    btn.classList.add('on');
    if (!S.gtdData) {
      try {
        const res = await _kdbOrFetch('/terrorism-incidents-lite.json');
        S.gtdData = await res.json();
      } catch(e) {
        _warn('gtd', 'Failed to load');
        S.gtdOn = false; btn.textContent = 'Terrorism'; btn.classList.remove('on');
        return;
      }
    }
    _buildGtdLayer();
  } else {
    btn.textContent = 'Terrorism';
    btn.classList.remove('on');
    if (S.gtdLayer) { S.map.removeLayer(S.gtdLayer); S.gtdLayer = null; }
  }
}

function _buildGtdLayer() {
  if (S.gtdLayer) { S.map.removeLayer(S.gtdLayer); S.gtdLayer = null; }
  if (!S.gtdOn || !S.gtdData) return;
  const layers = [];
  const attackColors = {
    'Bombing/Explosion': '#ef4444',
    'Armed Assault': '#f97316',
    'Abduction': '#8b5cf6',
    'Facility/Infrastructure Attack': '#6366f1',
    'Hostage Taking': '#ec4899',
  };
  for (const inc of S.gtdData.incidents || []) {
    const color = attackColors[inc.attack_type] || '#888';
    const radius = Math.max(6, Math.min(14, inc.fatalities / 25));
    const marker = L.circleMarker([inc.lat, inc.lng], {
      pane: 'overlayLayersPane',
      radius,
      fillColor: color,
      color: '#000',
      weight: 1,
      fillOpacity: 0.85,
    });
    const date = new Date(inc.date).toLocaleDateString();
    marker.bindTooltip(
      `<b style="color:${color}">⚠️ ${inc.attack_type}</b>`
      + `<br><b>${inc.city}, ${inc.country}</b>`
      + `<br><span style="color:var(--text-muted)">${date}</span>`
      + `<br><span style="color:var(--text-secondary)">Fatalities: ${inc.fatalities} | Wounded: ${inc.wounded}</span>`
      + (inc.perpetrator ? `<br><span style="color:var(--text-secondary)">Perpetrator: ${inc.perpetrator}</span>` : ''),
      { direction: 'top', className: 'admin1-tooltip', sticky: true }
    );
    layers.push(marker);
  }
  S.gtdLayer = L.layerGroup(layers).addTo(S.map);
  _log('gtd', `Displayed ${layers.length} incidents`);
}

// CoinGecko Crypto Adoption
export async function toggleCryptoLayer() {
  S.cryptoOn = !S.cryptoOn;
  const btn = document.getElementById('crypto-toggle-btn');
  if (S.cryptoOn) {
    btn.textContent = 'Crypto Adoption';
    btn.classList.add('on');
    if (!S.cryptoData) {
      try {
        const res = await _kdbOrFetch('/crypto-stats-lite.json');
        S.cryptoData = await res.json();
      } catch(e) {
        _warn('crypto', 'Failed to load');
        S.cryptoOn = false; btn.textContent = 'Crypto Adoption'; btn.classList.remove('on');
        return;
      }
    }
    _buildCryptoLayer();
  } else {
    btn.textContent = 'Crypto Adoption';
    btn.classList.remove('on');
    if (S.cryptoLayer) { S.map.removeLayer(S.cryptoLayer); S.cryptoLayer = null; }
  }
}

function _buildCryptoLayer() {
  if (S.cryptoLayer) { S.map.removeLayer(S.cryptoLayer); S.cryptoLayer = null; }
  if (!S.cryptoOn || !S.cryptoData) return;

  const layers = [];
  const byCountry = S.cryptoData.byCountry || {};

  const getAdoptionColor = (rank) => {
    if (rank <= 5) return '#22c55e';
    if (rank <= 10) return '#84cc16';
    if (rank <= 20) return '#eab308';
    if (rank <= 35) return '#f97316';
    return '#ef4444';
  };

  const countryCentroids = {
    'IN': { lat: 20.59, lng: 78.96, name: 'India' },
    'NG': { lat: 9.08, lng: 8.68, name: 'Nigeria' },
    'VN': { lat: 14.06, lng: 108.28, name: 'Vietnam' },
    'US': { lat: 37.09, lng: -95.71, name: 'United States' },
    'PK': { lat: 30.38, lng: 69.35, name: 'Pakistan' },
    'ID': { lat: -0.79, lng: 113.92, name: 'Indonesia' },
    'UA': { lat: 48.38, lng: 31.17, name: 'Ukraine' },
    'PH': { lat: 12.88, lng: 121.77, name: 'Philippines' },
    'TR': { lat: 38.96, lng: 35.24, name: 'Turkey' },
    'BR': { lat: -14.24, lng: -51.93, name: 'Brazil' },
    'TH': { lat: 15.87, lng: 100.99, name: 'Thailand' },
    'RU': { lat: 61.52, lng: 105.32, name: 'Russia' },
    'CO': { lat: 4.57, lng: -74.30, name: 'Colombia' },
    'AR': { lat: -38.42, lng: -63.62, name: 'Argentina' },
    'ZA': { lat: -30.56, lng: 22.94, name: 'South Africa' },
    'MY': { lat: 4.21, lng: 101.98, name: 'Malaysia' },
    'VE': { lat: 6.42, lng: -66.59, name: 'Venezuela' },
    'GB': { lat: 55.38, lng: -3.44, name: 'United Kingdom' },
    'SG': { lat: 1.35, lng: 103.82, name: 'Singapore' },
    'KR': { lat: 35.91, lng: 127.77, name: 'South Korea' },
    'JP': { lat: 36.20, lng: 138.25, name: 'Japan' },
    'DE': { lat: 51.17, lng: 10.45, name: 'Germany' },
    'FR': { lat: 46.23, lng: 2.21, name: 'France' },
    'AU': { lat: -25.27, lng: 133.78, name: 'Australia' },
    'CA': { lat: 56.13, lng: -106.35, name: 'Canada' },
    'NL': { lat: 52.13, lng: 5.29, name: 'Netherlands' },
    'CH': { lat: 46.82, lng: 8.23, name: 'Switzerland' },
    'AE': { lat: 23.42, lng: 53.85, name: 'UAE' },
    'HK': { lat: 22.40, lng: 114.11, name: 'Hong Kong' },
    'TW': { lat: 23.69, lng: 120.96, name: 'Taiwan' },
    'EG': { lat: 26.82, lng: 30.80, name: 'Egypt' },
    'KE': { lat: -0.02, lng: 37.68, name: 'Kenya' },
    'GH': { lat: 7.95, lng: -1.02, name: 'Ghana' },
    'BD': { lat: 23.68, lng: 90.36, name: 'Bangladesh' },
    'CL': { lat: -35.68, lng: -71.54, name: 'Chile' },
    'PE': { lat: -9.19, lng: -75.02, name: 'Peru' },
    'MX': { lat: 23.63, lng: -102.55, name: 'Mexico' },
    'PL': { lat: 51.92, lng: 19.15, name: 'Poland' },
    'IT': { lat: 41.87, lng: 12.57, name: 'Italy' },
    'ES': { lat: 40.46, lng: -3.75, name: 'Spain' },
    'SE': { lat: 60.13, lng: 18.64, name: 'Sweden' },
    'NO': { lat: 60.47, lng: 8.47, name: 'Norway' },
    'DK': { lat: 56.26, lng: 9.50, name: 'Denmark' },
    'FI': { lat: 61.92, lng: 25.75, name: 'Finland' },
    'AT': { lat: 47.52, lng: 14.55, name: 'Austria' },
    'BE': { lat: 50.50, lng: 4.47, name: 'Belgium' },
    'PT': { lat: 39.40, lng: -8.23, name: 'Portugal' },
    'GR': { lat: 39.07, lng: 21.82, name: 'Greece' },
    'CZ': { lat: 49.82, lng: 15.47, name: 'Czech Republic' },
    'IL': { lat: 31.05, lng: 34.85, name: 'Israel' },
    'CN': { lat: 35.86, lng: 104.19, name: 'China' },
    'SA': { lat: 23.89, lng: 45.08, name: 'Saudi Arabia' },
    'KZ': { lat: 48.02, lng: 66.92, name: 'Kazakhstan' },
    'UZ': { lat: 41.38, lng: 64.59, name: 'Uzbekistan' },
    'NZ': { lat: -40.90, lng: 174.89, name: 'New Zealand' },
  };

  for (const [code, data] of Object.entries(byCountry)) {
    const centroid = countryCentroids[code];
    if (!centroid) continue;

    const color = getAdoptionColor(data.adoption_rank);
    const radius = Math.max(5, Math.min(15, 20 - data.adoption_rank / 3));

    const marker = L.circleMarker([centroid.lat, centroid.lng], {
      pane: 'overlayLayersPane',
      radius,
      fillColor: color,
      color: '#000',
      weight: 1,
      fillOpacity: 0.85,
    });

    marker.bindTooltip(
      `<b style="color:${color}">₿ ${centroid.name}</b>`
      + `<br><span style="color:var(--text-secondary)">Rank: #${data.adoption_rank}</span>`
      + `<br><span style="color:var(--text-muted)">Users: ${data.crypto_users_pct.toFixed(1)}%</span>`
      + `<br><span style="color:var(--text-muted)">Est. users: ${(data.estimated_users / 1000000).toFixed(1)}M</span>`
      + `<br><span style="color:var(--text-secondary)">DeFi: $${(data.defi_value_usd / 1000000000).toFixed(1)}B</span>`
      + `<br><span style="color:var(--text-muted)">Exchanges: ${data.exchanges}</span>`,
      { direction: 'top', className: 'admin1-tooltip', sticky: false }
    );

    layers.push(marker);
  }

  S.cryptoLayer = L.layerGroup(layers).addTo(S.map);
  _log('crypto', `Displayed ${layers.length} country markers`);
}

// NOAA Space Weather
export async function toggleSpaceWeatherLayer() {
  S.spaceWeatherOn = !S.spaceWeatherOn;
  const btn = document.getElementById('spaceweather-toggle-btn');
  if (S.spaceWeatherOn) {
    btn.textContent = 'Space Weather';
    btn.classList.add('on');
    if (!S.spaceWeatherData) {
      try {
        const res = await _kdbOrFetch('/solar-weather-lite.json');
        S.spaceWeatherData = await res.json();
      } catch(e) {
        _warn('space-weather', 'Failed to load');
        S.spaceWeatherOn = false; btn.textContent = 'Space Weather'; btn.classList.remove('on');
        return;
      }
    }
    _buildSpaceWeatherLayer();
  } else {
    btn.textContent = 'Space Weather';
    btn.classList.remove('on');
    if (S.spaceWeatherLayer) { S.map.removeLayer(S.spaceWeatherLayer); S.spaceWeatherLayer = null; }
  }
}

function _buildSpaceWeatherLayer() {
  if (S.spaceWeatherLayer) { S.map.removeLayer(S.spaceWeatherLayer); S.spaceWeatherLayer = null; }
  if (!S.spaceWeatherOn || !S.spaceWeatherData) return;
  const kp = S.spaceWeatherData.kp_index || 0;
  const auroraLat = S.spaceWeatherData.aurora_visible_below_lat || 66;
  const outerLat = Math.min(auroraLat + 5, 89);
  function makeAuroraBand(innerLat, outerLatAbs, isNorth) {
    const pts = [];
    const sign = isNorth ? 1 : -1;
    for (let lng = -180; lng <= 180; lng += 4) pts.push([sign * outerLatAbs, lng]);
    for (let lng = 180; lng >= -180; lng -= 4) pts.push([sign * innerLat, lng]);
    return L.polygon(pts, { fillColor: '#8b5cf6', color: '#a78bfa', weight: 2, fillOpacity: 0.25, dashArray: '8, 8' });
  }
  const northBand = makeAuroraBand(auroraLat, outerLat, true);
  northBand.bindTooltip(
    `<b>🌌 Aurora Zone (North)</b>`
    + `<br><span style="color:var(--text-secondary)">KP Index: ${kp}</span>`
    + `<br><span style="color:var(--text-muted)">Visible below ${auroraLat}°N</span>`,
    { direction: 'top', className: 'admin1-tooltip', sticky: false }
  );
  const southBand = makeAuroraBand(auroraLat, outerLat, false);
  southBand.bindTooltip(
    `<b>🌌 Aurora Zone (South)</b>`
    + `<br><span style="color:var(--text-muted)">Visible above ${-auroraLat}°S</span>`,
    { direction: 'top', className: 'admin1-tooltip', sticky: false }
  );
  S.spaceWeatherLayer = L.layerGroup([northBand, southBand]).addTo(S.map);
  _log('space-weather', `Aurora zone displayed (KP: ${kp})`);
}

// Ocean Currents
export async function toggleOceanLayer() {
  S.oceanOn = !S.oceanOn;
  const btn = document.getElementById('ocean-toggle-btn');
  if (S.oceanOn) {
    btn.textContent = 'Ocean Currents';
    btn.classList.add('on');
    if (!S.oceanData) {
      try {
        const res = await _kdbOrFetch('/ocean-currents-lite.json');
        S.oceanData = await res.json();
      } catch(e) {
        _warn('ocean', 'Failed to load');
        S.oceanOn = false; btn.textContent = 'Ocean Currents'; btn.classList.remove('on');
        return;
      }
    }
    _buildOceanLayer();
  } else {
    btn.textContent = 'Ocean Currents';
    btn.classList.remove('on');
    if (S.oceanLayer) {
      if (S.oceanLayer._legend) { S.map.removeControl(S.oceanLayer._legend); S.oceanLayer._legend = null; }
      S.map.removeLayer(S.oceanLayer);
      S.oceanLayer = null;
    }
  }
}

function _buildOceanLayer() {
  if (S.oceanLayer) { S.map.removeLayer(S.oceanLayer); S.oceanLayer = null; }
  if (!S.oceanOn || !S.oceanData) return;

  const layers = [];

  const getSpeedColor = (speed) => {
    if (speed >= 150) return '#ef4444';
    if (speed >= 100) return '#f97316';
    if (speed >= 70) return '#eab308';
    if (speed >= 40) return '#22c55e';
    return '#3b82f6';
  };

  const getArrowLength = (speed) => {
    if (speed >= 150) return 0.8;
    if (speed >= 100) return 0.6;
    if (speed >= 70) return 0.45;
    if (speed >= 40) return 0.3;
    return 0.2;
  };

  const getArrowWeight = (speed) => {
    if (speed >= 150) return 4;
    if (speed >= 100) return 3;
    if (speed >= 70) return 2.5;
    return 2;
  };

  for (const c of S.oceanData.currents || []) {
    const dirRad = (c.dir * Math.PI) / 180;
    const arrowLen = getArrowLength(c.spd);
    const weight = getArrowWeight(c.spd);
    const color = getSpeedColor(c.spd);

    const startLat = c.lat - (Math.cos(dirRad) * arrowLen);
    const startLng = c.lng - (Math.sin(dirRad) * arrowLen);
    const endLat = c.lat + (Math.cos(dirRad) * arrowLen);
    const endLng = c.lng + (Math.sin(dirRad) * arrowLen);

    const arrow = L.polyline([[startLat, startLng], [endLat, endLng]], {
      pane: 'overlayLayersPane',
      color,
      weight,
      opacity: 0.85,
      lineCap: 'round',
    });

    const arrowhead = L.marker([endLat, endLng], {
      pane: 'overlayLayersPane',
      icon: L.divIcon({
        className: 'ocean-arrowhead',
        html: `<svg width="20" height="20" viewBox="0 0 20 20" style="transform: rotate(${c.dir - 90}deg); filter: drop-shadow(0 0 2px #000);">
          <polygon points="10,0 20,20 10,15 0,20" fill="${color}" stroke="#000" stroke-width="0.5"/>
        </svg>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      }),
    });

    if (c.spd >= 100) {
      const glow = L.circleMarker([c.lat, c.lng], {
        pane: 'overlayLayersPane',
        radius: 8,
        fillColor: color,
        color: 'transparent',
        fillOpacity: 0.15,
        weight: 0,
      });
      layers.push(glow);
    }

    const dirLabels = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const dirIndex = Math.round(c.dir / 45) % 8;
    const dirLabel = dirLabels[dirIndex];

    arrow.bindTooltip(
      `<b style="color:${color}">🌊 ${c.name || c.region || 'Ocean Current'}</b>`
      + `<br><span style="color:var(--text-secondary)">Speed: <b>${c.spd} cm/s</b> (${(c.spd / 50).toFixed(1)} km/h)</span>`
      + `<br><span style="color:var(--text-muted)">Direction: ${c.dir}° (${dirLabel})</span>`
      + `<br><span style="color:var(--text-muted)">Region: ${c.region || 'Unknown'}</span>`
      + (c.spd >= 150 ? `<br><span style="color:#ef4444">⚡ Very fast current</span>` : '')
      + (c.spd >= 100 && c.spd < 150 ? `<br><span style="color:#f97316">⚡ Fast current</span>` : ''),
      { direction: 'top', className: 'admin1-tooltip', sticky: false }
    );

    layers.push(arrow, arrowhead);
  }

  const legend = L.control({ position: 'bottomright' });
  legend.onAdd = () => {
    const div = L.DomUtil.create('div', 'ocean-legend');
    div.style.cssText = 'background:var(--panel-bg); padding:10px; border-radius:8px; border:1px solid var(--border); font-size:11px;';
    div.innerHTML = `
      <div style="font-weight:600; margin-bottom:6px; color:var(--text);">🌊 Current Speed</div>
      <div style="display:flex; align-items:center; gap:6px; margin:3px 0;">
        <span style="display:inline-block; width:20px; height:4px; background:#ef4444; border-radius:2px;"></span>
        <span style="color:var(--text-secondary);">≥150 cm/s (Very Fast)</span>
      </div>
      <div style="display:flex; align-items:center; gap:6px; margin:3px 0;">
        <span style="display:inline-block; width:20px; height:4px; background:#f97316; border-radius:2px;"></span>
        <span style="color:var(--text-secondary);">100-149 cm/s (Fast)</span>
      </div>
      <div style="display:flex; align-items:center; gap:6px; margin:3px 0;">
        <span style="display:inline-block; width:20px; height:4px; background:#eab308; border-radius:2px;"></span>
        <span style="color:var(--text-secondary);">70-99 cm/s (Moderate)</span>
      </div>
      <div style="display:flex; align-items:center; gap:6px; margin:3px 0;">
        <span style="display:inline-block; width:20px; height:4px; background:#22c55e; border-radius:2px;"></span>
        <span style="color:var(--text-secondary);">40-69 cm/s (Slow)</span>
      </div>
      <div style="display:flex; align-items:center; gap:6px; margin:3px 0;">
        <span style="display:inline-block; width:20px; height:4px; background:#3b82f6; border-radius:2px;"></span>
        <span style="color:var(--text-secondary);">&lt;40 cm/s (Very Slow)</span>
      </div>
    `;
    return div;
  };
  legend.addTo(S.map);

  S.oceanLayer = L.layerGroup(layers).addTo(S.map);
  S.oceanLayer._legend = legend;
  _log('ocean', `Displayed ${layers.length} elements (${S.oceanData.currents?.length || 0} currents)`);
}