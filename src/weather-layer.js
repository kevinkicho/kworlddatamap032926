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

// ── Open-Meteo Weather Layer ───────────────────────────────────────────────────
export async function toggleWeatherLayer() {
  S.weatherOn = !S.weatherOn;
  const btn = document.getElementById('weather-toggle-btn');
  if (S.weatherOn) {
    btn.textContent = 'Weather';
    btn.classList.add('on');
    if (!S.weatherData) {
      try {
        const res = await _kdbOrFetch('/weather-stations.json');
        S.weatherData = await res.json();
      } catch(e) {
        _warn('weather', 'Failed to load');
        S.weatherOn = false; btn.textContent = 'Weather'; btn.classList.remove('on');
        return;
      }
    }
    _buildWeatherLayer();
  } else {
    btn.textContent = 'Weather';
    btn.classList.remove('on');
    if (S.weatherLayer) { S.map.removeLayer(S.weatherLayer); S.weatherLayer = null; }
  }
}

export function _buildWeatherLayer() {
  if (S.weatherLayer) { S.map.removeLayer(S.weatherLayer); S.weatherLayer = null; }
  if (!S.weatherOn || !S.weatherData) return;
  const layers = [];
  const conditionIcons = {
    'Clear sky': '☀️', 'Mainly clear': '🌤️', 'Partly cloudy': '⛅',
    'Overcast': '☁️', 'Fog': '🌫️', 'Light drizzle': '🌦️',
    'Moderate drizzle': '🌧️', 'Dense drizzle': '🌧️', 'Slight rain': '🌦️',
    'Moderate rain': '🌧️', 'Heavy rain': '⛈️', 'Slight snow': '🌨️',
    'Moderate snow': '🌨️', 'Heavy snow': '❄️', 'Thunderstorm': '⚡',
  };
  for (const s of S.weatherData.stations || []) {
    if (s.lng === null || s.lat === null) continue;
    const icon = conditionIcons[s.condition] || '🌡️';
    const temp = s.temperature !== null ? `${Math.round(s.temperature)}°C` : 'N/A';
    const humidity = s.humidity !== null ? `${s.humidity}%` : 'N/A';
    const wind = s.wind_speed !== null ? `${Math.round(s.wind_speed)} km/h` : 'N/A';
    const marker = L.circleMarker([s.lat, s.lng], {
      pane: 'overlayLayersPane',
      radius: 5,
      fillColor: s.temperature > 25 ? '#ff6b6b' : s.temperature < 0 ? '#74c0fc' : '#ffd93d',
      color: '#000',
      weight: 0.5,
      fillOpacity: 0.85,
    });
    marker.bindTooltip(
      `<b>${icon} ${s.name}</b>`
      + `<br><span style="color:var(--text-secondary)">${s.condition}</span>`
      + `<br><span style="color:var(--text-muted)">Temp: ${temp} · Humidity: ${humidity}</span>`
      + `<br><span style="color:var(--text-muted)">Wind: ${wind} · ${s.country}</span>`,
      { direction: 'top', className: 'admin1-tooltip', sticky: false }
    );
    layers.push(marker);
  }
  S.weatherLayer = L.layerGroup(layers).addTo(S.map);
  _log('weather', `Displayed ${layers.length} stations`);
}