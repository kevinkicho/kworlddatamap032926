
---

## Phase 6: Data Pipeline & UI Fixes - COMPLETED 2026-06-05

### ✅ Power Plant Geocoding Pipeline
- Created `scripts/geocode-power-plants.js`:
  - Fetches Wikidata coordinates for 1,122 city QIDs via wbgetentities API
  - Combines with 600 cities from cities.json for broader coverage
  - Haversine proximity matching (150km max) → 22,392 of 34,936 plants geocoded to 1,542 cities
  - Aggregates into `power_by_city.json` with ALL 36 CSV fields preserved
  - Outputs geocoded CSV with city_qid, city_name, city_dist_km columns
- Created `scripts/enrich-cities-quick.js`:
  - Batch Wikidata enrichment for cities (country, admin, population, area, elevation, founded, type, website, geonames)
  - ISO2 country code resolution via Wikidata label matching
  - Non-QID city matching by proximity and SPARQL name lookup
- **Result:** 22,392 plants mapped (up from 2,207), all 36 fields accessible in UI

### ✅ Power Plant UI
- Expandable power plant table in city sidebar (click Energy chip)
- All fields displayed: name, GPPD ID, WEPP ID, capacity, fuels, generation (2013-2019), estimated generation (2013-2017), commissioning year, owner, data sources, distance
- Fuel breakdown icons in summary chip
- Attribution badge in section header (WRI, CC BY 4.0)

### ✅ Data Attribution Metadata
- Created `public/power_plants_metadata.json` — title, version, license, citation, coverage stats
- Created `public/inform_risk_metadata.json` — INFORM Risk Index 2024, EC JRC, CC BY 4.0
- INFORM attribution added to country panel section header

### ✅ City Click Fixes
- **safeOnclick bug:** JSON double quotes collided with HTML `onclick="..."` attribute → changed to single-quote delimiter with `&#39;` escaping
- **Direct sidebar open:** City dot click now opens sidebar directly (`.on('click', openWikiSidebar)`)
- **QID matching:** All 1,607 cities now have Wikidata QIDs (matched via SPARQL batch lookup)

### ✅ CSS & UI Fixes
- **Corporations panel:** Added missing `background: var(--bg-primary)` to `#global-corp-panel` and mobile overlay states
- **Sidebar z-index:** Raised from 1000 → 1060 to render above topbar (1050)
- **Mobile topbar:** Reverted mobile-drawer-section display:none from global to `@media (max-width: 1024px)` only (desktop buttons now visible)
- **Mobile chip grid:** 2-column CSS grid for Cities/Countries/Regions/Economy toggle buttons
- **Mobile legend:** Font sizes increased from 0.5rem → 0.65rem, max-width from 45vw → 65vw
- **Mobile close:** Removed red X close button; users click backdrop to dismiss topbar
- **Mobile reset:** Hidden `#reset-layers-btn` on mobile (chips toggle themselves)

### ✅ Server Changes
- Default port changed from `process.env.PORT || 0` → `process.env.PORT || 36121`

---

## Phase 3 Update: Code Quality Improvements - COMPLETED 2026-04-10
### ✅ Modular Architecture Created

**New Directory Structure:**
```
src/
├── layers/
│   ├── layer-manager.js      # cleanupLayer(), cleanupAllLayers()
│   ├── toggle-layers.js       # Refactored toggles with proper cleanup
│   └── index.js
├── utils/
│   ├── error-boundary.js      # safeFetch(), showErrorNotification()
│   ├── performance.js         # lazyLoadDataset(), debounce(), throttle()
│   └── index.js
├── panels/
│   ├── panel-utils.js         # PanelManager, showToast(), showModal()
│   └── index.js
└── main.js                    # Updated exports
```

### ✅ Error Boundaries Implemented

**safeFetch()** - Fetch with error handling:
```javascript
const data = await safeFetch('/api/data.json', {
  fallbackData: { default: true },
  showError: true
});
```

**showErrorNotification()** - User-facing error toasts
**setLoadingState()** - Panel loading indicators

### ✅ Event Listener Memory Leaks Fixed

**Before**: Listeners added but never removed
**After**: Centralized cleanup in layer-manager.js

All toggle functions now properly clean up:
- Map layers (removeLayer)
- Timers (clearInterval/clearTimeout)
- Event handlers (map.off)

### ✅ Panel Management System

- **PanelManager** - Tracks open panels, handles z-index stacking
- **createClosablePanel()** - Auto escape-key and backdrop click
- **showToast()** - Non-blocking notifications
- **showModal()** - Modal dialog system

All new utilities exported in main.js and available on window object.



---

## Phase 4: Data Loading & Memory Management - COMPLETED 2026-04-10

### Large JSON Lazy Loading
**Files**: src/layers/data-loader.js`n
New utilities for loading large datasets:
- **loadEezData()** - Loads 62MB EEZ boundaries with progress notification
- **loadWildfireData()** - Loads 11MB wildfire data with limit filtering
- **unloadLargeDataset()** - Frees memory when layers toggled off
- **DatasetManager** - Tracks loaded datasets, unloads low-priority when memory pressure
- **preloadCriticalDatasets()** - Loads small critical data first, defers large datasets
- **getDatasetInfo()** - Returns size and load status for UI display

### Event Listener Memory Leak Fixes
**File**: src/utils/event-patch.js`n
- **HandlerRegistry** - Tracks map event handlers for cleanup
- **patchToggleFunctions()** - Patches existing toggles (called after init)
- **registerMoveHandler()** - Registers handlers with automatic cleanup
- **cleanupAllMapHandlers()** - Clears all handlers and timers

### var-to-const Migration Utilities
**File**: src/utils/var-migration.js`n
- **analyzeVarDeclarations()** - Analyzes code for var usage
- **getVarStats()** - Returns migration statistics
- **validateNewModules()** - Ensures new files use const/let

Recommendation: Keep app-legacy.js stable (376 vars). All new modules use const/let.

### XSS Audit Utilities
**File**: src/utils/xss-audit.js`n
- **auditXSS()** - Scans code for innerHTML vulnerabilities
- **generateXSSReport()** - Creates human-readable audit report
- **quickXSSCheck()** - Summary of existing audit (29 innerHTML, 25 use escHtml)

Status: Most innerHTML usages properly escaped with escHtml(). No immediate action needed.


---

## Phase 5: Lazy Loading & Memory Management - COMPLETED 2026-04-10

### Lazy Loading for Large Datasets
**Files**: `src/layers/eez-layer.js`, `src/layers/wildfire-layer.js`

**EEZ Layer Improvements:**
- `toggleEezLayerImproved()` - Loads 60MB+ EEZ boundaries with progress feedback
- **Features:**
  - AbortController support for load cancellation
  - Toast notifications showing load time and size
  - Automatic memory cleanup when toggled off (~60MB freed)
  - DatasetManager integration for memory tracking
  - Preload support for background loading

**Wildfire Layer Improvements:**
- `toggleWildfireLayerImproved()` - Loads 50MB+ wildfire data with viewport filtering
- **Features:**
  - Viewport-based filtering (only shows fires in visible area)
  - Zoom-based limits (200-2000 fires depending on zoom level)
  - Retry logic with exponential backoff (3 attempts)
  - Sorted by importance (confidence + brightness)
  - Debounced refresh on map movement
  - Automatic memory cleanup when toggled off (~50MB freed)

### Centralized Cleanup System
**File**: `src/utils/cleanup-registry.js`

New `CleanupRegistry` for tracking and cleaning up resources:
- **registerHandler()** - Track map event handlers
- **registerInterval()** / **clearInterval()** - Manage timers
- **registerTimeout()** / **clearTimeout()** - Manage timeouts
- **cleanupLayer()** - Complete cleanup for a layer (handlers + data + DOM)
- **cleanupAll()** - Nuclear option for emergency cleanup

**Exported utilities:**
- `cleanupResource(type, name)` - Clean up single resource
- `registerResource(type, name, value)` - Register for auto-cleanup
- `cleanupLayerResources(layerName)` - Full layer cleanup
- `cleanupAllResources()` - Emergency cleanup
- `getCleanupStatus()` - Get resource counts

### UI Improvements
**File**: `public/style.css`

**New CSS:**
- `.loading-dots` - Animated loading indicator
- `.toast-container` / `.toast` - Notification system
- `.toast.loading` - Loading toast with spinner
- `.memory-indicator` - Memory usage display

### Usage
**To use improved toggles**, the HTML has been updated to use:
- `onclick="toggleEezLayerImproved()"` instead of `toggleEezLayer()`
- `onclick="toggleWildfireLayerImproved()"` instead of `toggleWildfireLayer()`

**In browser console:**
```javascript
// EEZ status
toggleEezLayerImproved()     // Toggle with progress feedback
getEezStatus()               // Get size and status
preloadEezData()             // Load in background

// Wildfire status
toggleWildfireLayerImproved() // Toggle with viewport filtering
getWildfireStatus()           // Get size, count, zoom info
refreshWildfireData()         // Force refresh

// Cleanup
CleanupRegistry.getStatus()   // See tracked resources
cleanupAllResources()         // Emergency cleanup
```

