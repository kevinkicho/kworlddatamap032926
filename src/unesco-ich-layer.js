import { S } from './state.js';

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

// ── UNESCO Intangible Heritage Layer ───────────────────────────────────────────
export async function toggleUnescoIchLayer() {
  S.unescoIchOn = !S.unescoIchOn;
  const btn = document.getElementById('unesco-ich-toggle-btn');
  if (S.unescoIchOn) {
    btn.textContent = '🎭 Heritage: On';
    btn.classList.add('on');
    if (!S.unescoIchData) {
      try {
        const res = await _kdbOrFetch('/unesco-ich.json');
        S.unescoIchData = await res.json();
      } catch(e) {
        _warn('unesco-ich', 'Failed to load');
        S.unescoIchOn = false; btn.textContent = '🎭 Heritage: Off'; btn.classList.remove('on');
        return;
      }
    }
    _buildUnescoIchLayer();
  } else {
    btn.textContent = '🎭 Heritage: Off';
    btn.classList.remove('on');
    if (S.unescoIchLayer) { S.map.removeLayer(S.unescoIchLayer); S.unescoIchLayer = null; }
  }
}

export function _buildUnescoIchLayer() {
  if (S.unescoIchLayer) { S.map.removeLayer(S.unescoIchLayer); S.unescoIchLayer = null; }
  if (!S.unescoIchOn || !S.unescoIchData) return;
  _log('unesco-ich', 'Data loaded for country panel integration');
}