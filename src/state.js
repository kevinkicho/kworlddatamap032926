// ── Shared mutable state ─────────────────────────────────────────────────────
// All modules import { S } from './state.js' and read/write S.propertyName.
// This preserves the mutation-based architecture with minimal refactoring.

export const S = {
  // ── KDB (single data source) ────────────────────────────────────────────────
  kdb: null, // loaded from /kdb.json; null until loaded
  // ── Theme & basemap ────────────────────────────────────────────────────────
  _tileLayer: null,
  _tileAttr: null,
  _tileOpts: null,
  _basemap: 'street', // 'street' | 'satellite' | 'terrain'

  // ── URL hash restore ──────────────────────────────────────────────────────
  _hashRestoreCity: null,
  _hashRestoreCountry: null,
  _hashRestoreChoro: false,

  // ── Core ───────────────────────────────────────────────────────────────────
  map: null,
  wikiLayer: null,
  cityDotMode: 'show',
  rawCities: [],
  allCities: [],
  cityByQid: new Map(),
  countryData: {},
  _avgScoreCache: null,
  _rankCacheByRegion: null,
  filtered: [],
  visibleCount: 100,
  sortCol: 'pop',
  sortDir: 'desc',
  editingKey: null,

  // ── Companies ──────────────────────────────────────────────────────────────
  companiesData: {},
  companiesDetailData: null,

  // ── Choropleth ─────────────────────────────────────────────────────────────
  choroplethLayer: null,
  _choroHoverTarget: null,
  _choroLayerByIso: {},
  worldGeo: null,
  choroOn: false,
  activeChoroKey: 'gdp_per_capita',
  _choroYear: null,
  _choroPlayTimer: null,
  _choroControlsInited: false,

  // ── Econ layer ─────────────────────────────────────────────────────────────
  econLayer: null,
  econOn: false,
  _econTipEl: null,
  _expandedLayers: null,
  _collapseOnClick: null,
  _pinnedExpansion: null,

  // ── Trade ──────────────────────────────────────────────────────────────────
  tradeArrowLayer: null,

  // ── Admin-1 regions ────────────────────────────────────────────────────────
  admin1On: false,
  admin1Layers: {},
  admin1Index: null,
  _admin1Loading: {},
  _admin1HoverTarget: null,
  _admin1HoverIso: null,
  _admin1UpdateTimer: null,
  _countryBounds: null,
  _selectedRegion: null,

  // ── Layer toggles ──────────────────────────────────────────────────────────
  unescoSites: [],
  unescoLayer: null,
  unescoOn: false,
  cableData: null,
  cableLayer: null,
  cableOn: false,
  airRouteData: null,
  airRouteLayer: null,
  airRouteOn: false,
  tectonicData: null,
  tectonicLayer: null,
  tectonicOn: false,
  earthquakeData: null,
  earthquakeLayer: null,
  earthquakeOn: false,
  _earthquakeTimer: null,
  issMarker: null,
  issOn: false,
  _issTimer: null,
  aircraftData: null,
  aircraftLayer: null,
  aircraftOn: false,
  _aircraftTimer: null,
  volcanoData: null,
  volcanoLayer: null,
  volcanoOn: false,
  wildfireData: null,
  wildfireLayer: null,
  wildfireOn: false,
  launchSiteData: null,
  launchSiteLayer: null,
  launchSiteOn: false,
  eezData: null,
  eezLayer: null,
  eezOn: false,
  // New natural events & infrastructure layers
  eonetData: null,
  eonetLayer: null,
  eonetOn: false,
  protectedAreasData: null,
  protectedAreasLayer: null,
  protectedAreasOn: false,
  vesselPortsData: null,
  vesselPortsLayer: null,
  vesselPortsOn: false,
  peeringdbData: null,
  peeringdbLayer: null,
  peeringdbOn: false,
  powerData: {},
  informRisk: {},
  // New API layers (Phase 1)
  waqiData: null, waqiLayer: null, waqiOn: false,
  weatherData: null, weatherLayer: null, weatherOn: false,
  satelliteData: null, satelliteLayer: null, satelliteOn: false,
  unescoIchData: null, unescoIchLayer: null, unescoIchOn: false,
  // Phase 2 layers
  gtdData: null, gtdLayer: null, gtdOn: false,
  cryptoData: null, cryptoLayer: null, cryptoOn: false,
  spaceWeatherData: null, spaceWeatherLayer: null, spaceWeatherOn: false,
  oceanData: null, oceanLayer: null, oceanOn: false,
  // Phase 3 layers
  flightAwareData: null, flightAwareLayer: null, flightAwareOn: false,
  marineTrafficData: null, marineTrafficLayer: null, marineTrafficOn: false,

  // ── FX ─────────────────────────────────────────────────────────────────────
  fxRates: null, // initialized at runtime: { ...FX_TO_USD }

  // ── Edit cache ─────────────────────────────────────────────────────────────
  _editsCache: null,

  // ── City sidebar ───────────────────────────────────────────────────────────
  _sidebarTab: 'info',
  lightboxImages: [],
  lightboxIdx: 0,
  carImages: [],
  carIdx: 0,
  carTimer: null,

  // ── City stats ─────────────────────────────────────────────────────────────
  _activeStatMetric: null,
  _statsScope: 'world',
  _statsCurrent: null,
  _statsPoints: [],
  _statsWinStart: 0,
  _statsWinEnd: 0,

  // ── Supplementary datasets ─────────────────────────────────────────────────
  censusCities: {},
  censusBusiness: {},
  beaTradeData: {},
  eurostatCities: {},
  gawcCities: {},
  japanPrefData: {},
  usStatesData: {},
  eurostatRegions: {},
  canadaProvinces: {},
  australiaStates: {},
  airQualityData: {},
  universitiesData: {},
  fbiCrimeData: {},
  eciData: {},
  metroTransitData: {},
  nobelCitiesData: {},
  colData: {},
  uniRankings: {},
  startupData: {},
  ecbData: {},
  ecbBonds: {},
  bojData: {},
  oecdData: {},
  comtradeData: {},
  noaaClimate: {},
  airportData: {},
  zillowData: {},
  climateExtra: {},
  portData: {},
  tourismData: {},
  metroData: {},
  patentData: {},

  // ── Filter state ───────────────────────────────────────────────────────────
  _filterAvail: {
    airQuality: false, metro: false, nobel: false,
    universities: false, airport: false, eurostat: false, census: false,
  },
  _filterValue: {
    pop: null, nobel: null, universities: null, metro: null, aq: null,
  },
  _matchedVisMode: 'show',
  _matchedColorMode: 'pop',
  _otherShowMode: 'dim',
  _otherColorMode: 'pop',
  _popRangeMin: null,  // log scale: 3=1k, 8=100M
  _popRangeMax: null,
  _heatmapMetric: null,
  _heatmapLayer: null,
  _heatPalette: 'warm',
  _heatNormP95: {},
  _heatRadius: 40,
  _heatBlur: 28,
  _heatMinOpacity: 0.45,
  censusColorMetric: null,
  cityAqMode: false,

  // ── Country panel ──────────────────────────────────────────────────────────
  _cpCurrentIso2: null,
  _cpEscListener: null,
  _cpHighlightedLayer: null,
  _cpWorldMaxCache: new Map(),
  _cpOecdMaxCache: new Map(),

  // ── Corporations ───────────────────────────────────────────────────────────
  corpCityQid: null,
  corpCityName: null,
  corpOverrideList: null,
  _drawActive: false,
  _drawVertices: [],
  _drawPolyline: null,
  _drawPolygon: null,
  _drawDots: [],
  _drawClickTimer: null,
  globalCorpList: [],
  globalCorpVis: 100,
  gcorpQuery: '',
  gcorpCountry: '',
  gcorpIndustry: '',
  gcorpSort: 'revenue_usd',

  // ── Comparison ─────────────────────────────────────────────────────────────
  _cmpCityA: null,
  _cmpCityB: null,
  _ccIsoA: null,
  _ccIsoB: null,
  _bookmarks: null, // initialized at runtime: new Set(JSON.parse(...))

  // ── Credit rating lookups ──────────────────────────────────────────────────
  _creditToNum: null, // initialized by IIFE in app-legacy.js
  _numToCredit: null, // initialized by IIFE in app-legacy.js

  // ── Subnational ────────────────────────────────────────────────────────────
  subnatData: { unemployment: {}, gdp: {}, income: {} },
  subnatFiles: { unemployment: {}, gdp: {}, income: {} },
};
