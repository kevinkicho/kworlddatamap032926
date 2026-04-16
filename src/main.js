import {
  init,
  buildEconLayer, clearAllFilters, closeComparePanel, closeCorpPanel,
  closeCountryCompare, closeFilterPanel, closeModal,
  closeStatsPanel, closeTradePanelFn, closeWikiSidebar, deleteCity,
  closeGlobalCorpPanel,
  gcorpCountryChanged, gcorpIndustryChanged,
  gcorpQueryChanged, gcorpShowMore, gcorpSortChanged,
  openStatsPanel, renderCorpList, renderGlobalCorpList, resetAll, resetAllLayers, saveEdit, setCensusColorMetric,
  setCityDotMode, setHeatBlur, setHeatIntensity, setHeatPalette, setHeatRadius,
  setHeatmapMetric, setMatchedColorMode, setMatchedVis, setOtherColorMode,
  setOtherVis, setStatsScope, setValueFilter, switchWikiTab, toggleAdmin1Global,
  toggleAirRouteLayer, toggleAqMode, toggleAvailFilter, toggleBookmarksPanel,
  toggleCableLayer, toggleChoroPlay, toggleChoropleth, toggleDrawMode,
  setBasemap, resetPopRange, toggleCities, toggleEarthquakeLayer, toggleEconLayer, toggleEezLayer, toggleFilterAqColor,
  toggleFilterPanel, toggleGtdLayer, toggleIssTracker, toggleAircraftLayer, toggleWildfireLayer, toggleLaunchSiteLayer, toggleMoreLayers, togglePeeringdbLayer, toggleProtectedAreasLayer, toggleSatelliteLayer, toggleTectonicLayer, toggleUnescoIchLayer, toggleVesselPortsLayer, toggleVolcanoLayer, toggleWaqiLayer, toggleWeatherLayer,
  toggleCryptoLayer, toggleSpaceWeatherLayer, toggleOceanLayer, toggleFlightAwareLayer, toggleMarineTrafficLayer,
  toggleTheme, toggleUnescoLayer, toggleEonetLayer,
  toggleNationsPanel,
  closeAllMobileSheets,
  toggleMobileTopbar,
  _switchRadarTab, _switchTrendTab, _renderCountryPanel,
  clearRegionSelection, closeCountryPanel, closeRegionPanel,
  corpRowClick, flyTo, gcorpRowClick,
  openComparePanel, openCorpPanel, openCountryCompare, openCountryPanel,
  openModal, openWikiSidebar, openWikiSidebarById, statsExpandDown, statsExpandUp,
  statsGoToCity, statsGoToCountry, toggleBookmark, toggleExtract,
  switchListTab
} from './app-legacy.js';

import { fxFetchRates, fxResetDefaults, fxInputChanged, toggleFxSidebar, initFxCallbacks } from './fx-sidebar.js';
import { openLightbox, openCarouselLightbox, closeLightbox, lightboxNav, carGo, carJump, carResume, carStop } from './lightbox.js';

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
  openLightbox, openModal, openWikiSidebar, openWikiSidebarById, statsExpandDown, statsExpandUp,
  statsGoToCity, statsGoToCountry, toggleBookmark, toggleExtract,
  switchListTab, toggleNationsPanel, closeAllMobileSheets, toggleMobileTopbar
});

initFxCallbacks({
  onRatesChanged: () => {
    if (typeof buildEconLayer === 'function') buildEconLayer();
    if (typeof renderCorpList === 'function') renderCorpList();
    const gPanel = document.getElementById('global-corp-panel');
    if (gPanel && gPanel.classList.contains('panel-open')) {
      if (typeof renderGlobalCorpList === 'function') renderGlobalCorpList();
    }
  },
  mobileBackdropOn: () => {
    if (window.innerWidth <= 768) {
      const b = document.getElementById('mobile-backdrop');
      if (b) b.classList.add('active');
    }
  },
  mobileBackdropOff: () => {
    const b = document.getElementById('mobile-backdrop');
    if (b) b.classList.remove('active');
  }
});

init();