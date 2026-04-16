import {
  init,
  buildEconLayer, clearAllFilters, closeComparePanel, closeCorpPanel,
  closeCountryCompare, closeFilterPanel, closeModal,
  closeTradePanelFn, closeWikiSidebar, deleteCity,
  closeGlobalCorpPanel,
  renderCorpList, resetAll, resetAllLayers, saveEdit, setCensusColorMetric,
  setCityDotMode, setHeatBlur, setHeatIntensity, setHeatPalette, setHeatRadius,
  setHeatmapMetric, setMatchedColorMode, setMatchedVis, setOtherColorMode,
  setOtherVis, setValueFilter, switchWikiTab, toggleAdmin1Global,
  toggleAirRouteLayer, toggleAqMode, toggleAvailFilter, toggleBookmarksPanel,
  toggleCableLayer, toggleChoroPlay, toggleChoropleth, toggleDrawMode,
  setBasemap, resetPopRange, toggleCities, toggleEarthquakeLayer, toggleEconLayer, toggleEezLayer, toggleFilterAqColor,
  toggleFilterPanel, toggleIssTracker, toggleAircraftLayer, toggleWildfireLayer, toggleLaunchSiteLayer, toggleMoreLayers, togglePeeringdbLayer, toggleProtectedAreasLayer, toggleSatelliteLayer, toggleTectonicLayer, toggleUnescoIchLayer, toggleVesselPortsLayer, toggleVolcanoLayer, toggleWaqiLayer, toggleWeatherLayer,
  toggleFlightAwareLayer, toggleMarineTrafficLayer,
  toggleTheme, toggleUnescoLayer, toggleEonetLayer,
  toggleNationsPanel,
  closeAllMobileSheets,
  toggleMobileTopbar,
  _switchRadarTab, _switchTrendTab, _renderCountryPanel,
  clearRegionSelection, closeCountryPanel, closeRegionPanel,
  corpRowClick, flyTo,
  openComparePanel, openCorpPanel, openCountryCompare, openCountryPanel,
  openModal, openWikiSidebar, openWikiSidebarById, openCompanyWikiPanel,
  toggleBookmark, toggleExtract,
  switchListTab,
  STAT_DEFS, CITY_STAT_DEFS, WB_STAT_DEFS, EUROSTAT_STAT_DEFS, JAPAN_PREF_STAT_DEFS, CORP_STAT_DEFS,
  _lookupJapanPref, _statSourceAttr, CAPITAL_COORDS, countryCentroids
} from './app-legacy.js';

import { fxFetchRates, fxResetDefaults, fxInputChanged, toggleFxSidebar, initFxCallbacks } from './fx-sidebar.js';
import { openLightbox, openCarouselLightbox, closeLightbox, lightboxNav, carGo, carJump, carResume, carStop } from './lightbox.js';
import { initKeyboardNav, setupKeyboardNav, toggleKeyboardHelp } from './keyboard-nav.js';
import { initStatsPanel, closeStatsPanel, setStatsScope, openStatsPanel, statsExpandUp, statsExpandDown, statsGoToCity, statsGoToCountry } from './stats-panel.js';
import { initCorporationsList, buildGlobalCorpList, renderGlobalCorpList, gcorpShowMore, gcorpQueryChanged, gcorpCountryChanged, gcorpIndustryChanged, gcorpSortChanged, gcorpRowClick } from './corporations-list.js';
import { toggleGtdLayer, toggleCryptoLayer, toggleSpaceWeatherLayer, toggleOceanLayer } from './layers-phase2.js';

Object.assign(window, {
  buildEconLayer, clearAllFilters, closeComparePanel, closeCorpPanel,
  closeCountryCompare, closeFilterPanel, closeLightbox, closeModal,
  closeStatsPanel, closeTradePanelFn, closeWikiSidebar, closeGlobalCorpPanel, deleteCity,
  fxFetchRates, fxResetDefaults, gcorpCountryChanged, gcorpIndustryChanged,
  gcorpQueryChanged, gcorpShowMore, gcorpSortChanged, lightboxNav,
  openStatsPanel, renderCorpList, renderGlobalCorpList, resetAll, resetAllLayers, saveEdit, setCensusColorMetric,
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
  switchListTab, toggleNationsPanel, closeAllMobileSheets, toggleMobileTopbar,
  toggleKeyboardHelp
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

initStatsPanel({
  mobileBackdropOn: () => {
    if (window.innerWidth <= 768) {
      const b = document.getElementById('mobile-backdrop');
      if (b) b.classList.add('active');
    }
  },
  mobileBackdropOff: () => {
    const b = document.getElementById('mobile-backdrop');
    if (b) b.classList.remove('active');
  },
  switchRadarTab: _switchRadarTab,
  openWikiSidebar,
  openCountryPanel,
  lookupJapanPref: _lookupJapanPref,
  statSourceAttr: _statSourceAttr,
  STAT_DEFS, CITY_STAT_DEFS, WB_STAT_DEFS, EUROSTAT_STAT_DEFS, JAPAN_PREF_STAT_DEFS, CORP_STAT_DEFS,
  CAPITAL_COORDS, countryCentroids,
});

initKeyboardNav({
  closeCountryCompare,
  closeComparePanel,
  closeWikiSidebar,
  closeCountryPanel: () => { document.getElementById('country-panel').classList.remove('open'); },
  closeCorpPanel,
  closeStatsPanel,
  closeTradePanelFn,
  toggleFilterPanel,
  toggleFxSidebar,
  toggleBookmarksPanel,
  toggleTheme,
  switchWikiTab,
});
setupKeyboardNav();

initCorporationsList({
  openCompanyWikiPanel,
});

init();