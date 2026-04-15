// ── Visualization definitions: color palettes, basemaps, GaWC tiers ─────────────────
// Pure data configurations for map visualization and styling.
// No external dependencies - only uses inline functions and literal values.

// ── Palette system for heat maps ────────────────────────────────────────────────
// Each palette entry: array of [stop, hexColor] pairs sorted ascending by stop.
// 'warm' has per-metric colours; the others use a single _all scale.
export const HEAT_PALETTES = {
  warm: {
    nobel:        [[0,'#3b1f6e'],[0.35,'#7b2ff7'],[0.65,'#a371f7'],[1,'#e0ccff']],
    universities: [[0,'#0d2b55'],[0.35,'#1f6feb'],[0.65,'#58a6ff'],[1,'#cce5ff']],
    pop:          [[0,'#0a3020'],[0.35,'#20c997'],[0.65,'#3fb950'],[1,'#d1fadf']],
    metro:        [[0,'#2e1c00'],[0.35,'#b87800'],[0.65,'#f0a500'],[1,'#ffe08a']],
    aq:           [[0,'#1a4a1a'],[0.3,'#3fb950'],[0.55,'#f0a500'],[0.78,'#f85149'],[1,'#bc8cff']],
  },
  viridis: { _all: [[0,'#440154'],[0.25,'#31688e'],[0.5,'#35b779'],[0.75,'#90d743'],[1,'#fde725']] },
  inferno: { _all: [[0,'#0d0221'],[0.25,'#56106e'],[0.5,'#bb3754'],[0.75,'#f98c09'],[1,'#fcffa4']] },
  ocean:   { _all: [[0,'#03071e'],[0.25,'#1565c0'],[0.5,'#0097a7'],[0.75,'#80deea'],[1,'#e0f7fa']] },
};

// Maps availability filter keys and value filter keys to their metric names
export const AVAIL_TO_METRIC = {
  metro: 'metro', nobel: 'nobel', universities: 'universities',
  airQuality: 'aq', airport: null, eurostat: null, census: null,
};
export const VALUE_TO_METRIC = {
  metro: 'metro', nobel: 'nobel', universities: 'universities', aq: 'aq', pop: 'pop',
};

// GaWC tier → numeric score (Alpha++=12 … Sufficiency=1)
export const GAWC_TIER_SCORE = {
  'Alpha++': 12, 'Alpha+': 11, 'Alpha': 10, 'Alpha-': 9,
  'Beta+': 8, 'Beta': 7, 'Beta-': 6,
  'Gamma+': 5, 'Gamma': 4, 'Gamma-': 3,
  'High sufficiency': 2, 'Sufficiency': 1,
};
export const GAWC_TIER_COLOR = {
  'Alpha++': '#f0a500', 'Alpha+': '#f0a500', 'Alpha': '#58a6ff', 'Alpha-': '#58a6ff',
  'Beta+': '#3fb950', 'Beta': '#3fb950', 'Beta-': '#3fb950',
  'Gamma+': '#8b949e', 'Gamma': '#8b949e', 'Gamma-': '#8b949e',
  'High sufficiency': '#484f58', 'Sufficiency': '#484f58',
};

// Basemap tile URLs and attribution
export const BASEMAP_URLS = {
  street_dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  street_light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  // Primary terrain (OpenTopoMap - often has rate limits/outages)
  terrain: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
  // Fallback terrain (ESRI World Topo - more reliable, free for viewing)
  terrain_fallback: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
};
export const BASEMAP_ATTR = {
  street_dark: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  street_light: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  satellite: '&copy; <a href="https://www.esri.com">Esri</a> World Imagery',
  terrain: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
  terrain_fallback: '&copy; <a href="https://www.esri.com">Esri</a> World Topo',
};