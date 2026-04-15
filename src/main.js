// ── Entry point: imports legacy app, exposes HTML-referenced functions to window ──
import {
  init,
  buildEconLayer, clearAllFilters, closeComparePanel, closeCorpPanel,
  closeCountryCompare, closeFilterPanel, closeLightbox, closeModal,
  closeStatsPanel, closeTradePanelFn, closeWikiSidebar, deleteCity,
  closeGlobalCorpPanel,
  fxFetchRates, fxResetDefaults, gcorpCountryChanged, gcorpIndustryChanged,
  gcorpQueryChanged, gcorpShowMore, gcorpSortChanged, lightboxNav,
  openStatsPanel, renderCorpList, resetAll, resetAllLayers, saveEdit, setCensusColorMetric,
  setCityDotMode, setHeatBlur, setHeatIntensity, setHeatPalette, setHeatRadius,
  setHeatmapMetric, setMatchedColorMode, setMatchedVis, setOtherColorMode,
  setOtherVis, setStatsScope, setValueFilter, switchWikiTab, toggleAdmin1Global,
  toggleAirRouteLayer, toggleAqMode, toggleAvailFilter, toggleBookmarksPanel,
  toggleCableLayer, toggleChoroPlay, toggleChoropleth, toggleDrawMode,
  setBasemap, resetPopRange, toggleCities, toggleEarthquakeLayer, toggleEconLayer, toggleEezLayer, toggleFilterAqColor,
  toggleFilterPanel, toggleFxSidebar, toggleGtdLayer, toggleIssTracker, toggleAircraftLayer, toggleWildfireLayer, toggleLaunchSiteLayer, toggleMoreLayers, togglePeeringdbLayer, toggleProtectedAreasLayer, toggleSatelliteLayer, toggleTectonicLayer, toggleUnescoIchLayer, toggleVesselPortsLayer, toggleVolcanoLayer, toggleWaqiLayer, toggleWeatherLayer,
  toggleCryptoLayer, toggleSpaceWeatherLayer, toggleOceanLayer, toggleFlightAwareLayer, toggleMarineTrafficLayer,
  toggleTheme, toggleUnescoLayer, toggleEonetLayer,
  toggleNationsPanel,
  closeAllMobileSheets,
  toggleMobileTopbar,
  // Functions used in inline onclick handlers
  _switchRadarTab, _switchTrendTab, _renderCountryPanel, carGo, carJump,
  carResume, carStop, clearRegionSelection, closeCountryPanel, closeRegionPanel,
  corpRowClick, flyTo, fxInputChanged, gcorpRowClick, openCarouselLightbox,
  openComparePanel, openCorpPanel, openCountryCompare, openCountryPanel,
  openLightbox, openModal, openWikiSidebar, statsExpandDown, statsExpandUp,
  statsGoToCity, statsGoToCountry, toggleBookmark, toggleExtract,
  switchListTab
} from './app-legacy.js';

// Expose to window for HTML onclick/onchange/oninput handlers
Object.assign(window, {
  buildEconLayer, clearAllFilters, closeComparePanel, closeCorpPanel,
  closeCountryCompare, closeFilterPanel, closeLightbox, closeModal,
  closeStatsPanel, closeTradePanelFn, closeWikiSidebar, closeGlobalCorpPanel, deleteCity,
  fxFetchRates, fxResetDefaults, gcorpCountryChanged, gcorpIndustryChanged,
  gcorpQueryChanged, gcorpShowMore, gcorpSortChanged, lightboxNav,
  openStatsPanel, renderCorpList, resetAll, resetAllLayers, saveEdit, setCensusColorMetric,
  setCityDotMode, setHeatBlur, setHeatIntensity, setHeatPalette, setHeatRadius,
  setHeatmapMetric, setMatchedColorMode, setMatchedVis, setOtherColorMode,
  setOtherVis, setStatsScope, setValueFilter, switchWikiTab, toggleAdmin1Global,
  toggleAirRouteLayer, toggleAqMode, toggleAvailFilter, toggleBookmarksPanel,
  toggleCableLayer, toggleChoroPlay, toggleChoropleth, toggleDrawMode,
  setBasemap, resetPopRange, toggleCities, toggleEarthquakeLayer, toggleEconLayer, toggleEezLayer, toggleFilterAqColor,
  toggleFilterPanel, toggleFxSidebar, toggleGtdLayer, toggleIssTracker, toggleAircraftLayer, toggleWildfireLayer, toggleLaunchSiteLayer, toggleMoreLayers, togglePeeringdbLayer, toggleProtectedAreasLayer, toggleSatelliteLayer, toggleTectonicLayer, toggleUnescoIchLayer, toggleVesselPortsLayer, toggleVolcanoLayer, toggleWaqiLayer, toggleWeatherLayer,
  toggleCryptoLayer, toggleSpaceWeatherLayer, toggleOceanLayer, toggleFlightAwareLayer, toggleMarineTrafficLayer,
  toggleTheme, toggleUnescoLayer, toggleEonetLayer,
  _switchRadarTab, _switchTrendTab, _renderCountryPanel, carGo, carJump,
  carResume, carStop, clearRegionSelection, closeCountryPanel, closeRegionPanel,
  corpRowClick, flyTo, fxInputChanged, gcorpRowClick, openCarouselLightbox,
  openComparePanel, openCorpPanel, openCountryCompare, openCountryPanel,
  openLightbox, openModal, openWikiSidebar, statsExpandDown, statsExpandUp,
  statsGoToCity, statsGoToCountry, toggleBookmark, toggleExtract,
  switchListTab, toggleNationsPanel, closeAllMobileSheets, toggleMobileTopbar
});

// Boot the app
init();