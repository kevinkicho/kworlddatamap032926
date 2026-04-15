(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };

  // src/utils.js
  function popToT(pop) {
    if (!pop || pop <= 0) return 0;
    const lo = Math.log10(1e4);
    const hi = Math.log10(4e7);
    return Math.min(1, Math.max(0, (Math.log10(pop) - lo) / (hi - lo)));
  }
  function lerpRGB(a, b, t) {
    return [
      Math.round(a[0] + (b[0] - a[0]) * t),
      Math.round(a[1] + (b[1] - a[1]) * t),
      Math.round(a[2] + (b[2] - a[2]) * t)
    ];
  }
  function wikiCityColor(pop) {
    const t = popToT(pop);
    for (let i = 1; i < COLOR_STOPS.length; i++) {
      const [t0, c0] = COLOR_STOPS[i - 1];
      const [t1, c1] = COLOR_STOPS[i];
      if (t <= t1) {
        const [r, g, b] = lerpRGB(c0, c1, (t - t0) / (t1 - t0));
        return `rgb(${r},${g},${b})`;
      }
    }
    return "rgb(240,30,30)";
  }
  function wikiCityOpacity(pop) {
    return 0.35 + popToT(pop) * 0.6;
  }
  function wikiCityRadius(pop) {
    return Math.max(2, Math.min(12, Math.sqrt(pop / 1e6) * 3));
  }
  function fmtPop(pop) {
    if (pop == null) return "\u2014";
    if (pop >= 1e6) return (pop / 1e6).toFixed(1) + "M";
    if (pop >= 1e3) return (pop / 1e3).toFixed(0) + "k";
    return String(pop);
  }
  function fmtNum(n) {
    return n == null ? "\u2014" : n.toLocaleString();
  }
  function escHtml(str) {
    return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function escAttr(str) {
    return String(str ?? "").replace(/'/g, "&#39;");
  }
  function isoToFlag(iso2) {
    if (!iso2 || iso2.length !== 2) return "\u{1F310}";
    return [...iso2.toUpperCase()].map(
      (c) => String.fromCodePoint(127462 + c.charCodeAt(0) - 65)
    ).join("");
  }
  function fmtEmployees(n) {
    if (!n) return null;
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return Math.round(n / 1e3) + "k";
    return n.toLocaleString();
  }
  function fmtRevenue(n) {
    if (!n) return null;
    if (Math.abs(n) >= 1e12) return (n / 1e12).toFixed(1) + "T";
    if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + "B";
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(0) + "M";
    return n.toLocaleString();
  }
  function validateCities(data) {
    if (!Array.isArray(data)) throw new Error("cities-full.json is not an array \u2014 file may be corrupt");
    const valid = [], bad = [];
    for (const c of data) {
      if (typeof c.name === "string" && c.name && typeof c.lat === "number" && typeof c.lng === "number") {
        valid.push(c);
      } else {
        bad.push(c);
      }
    }
    if (bad.length) console.warn(`[init] Skipped ${bad.length} malformed city records (missing name/lat/lng)`);
    if (valid.length === 0) throw new Error("cities-full.json contains no valid city records");
    return valid;
  }
  function cityKey(c) {
    return c.qid || c.lat + "," + c.lng;
  }
  var COLOR_STOPS;
  var init_utils = __esm({
    "src/utils.js"() {
      COLOR_STOPS = [
        [0, [80, 50, 200]],
        // dim indigo   — ~10k
        [0.28, [40, 120, 255]],
        // blue          — ~100k
        [0.5, [20, 200, 210]],
        // cyan/teal     — ~600k
        [0.68, [80, 220, 80]],
        // green         — ~2M
        [0.82, [250, 210, 30]],
        // amber         — ~7M
        [0.92, [250, 120, 20]],
        // orange        — ~18M
        [1, [240, 30, 30]]
        // red           — 40M+
      ];
    }
  });

  // src/state.js
  var S;
  var init_state = __esm({
    "src/state.js"() {
      S = {
        // ── KDB (single data source) ────────────────────────────────────────────────
        kdb: null,
        // loaded from /kdb.json; null until loaded
        // ── Theme & basemap ────────────────────────────────────────────────────────
        _tileLayer: null,
        _tileAttr: null,
        _tileOpts: null,
        _basemap: "street",
        // 'street' | 'satellite' | 'terrain'
        // ── URL hash restore ──────────────────────────────────────────────────────
        _hashRestoreCity: null,
        _hashRestoreCountry: null,
        _hashRestoreChoro: false,
        // ── Core ───────────────────────────────────────────────────────────────────
        map: null,
        wikiLayer: null,
        cityDotMode: "show",
        rawCities: [],
        allCities: [],
        cityByQid: /* @__PURE__ */ new Map(),
        countryData: {},
        _avgScoreCache: null,
        _rankCacheByRegion: null,
        filtered: [],
        visibleCount: 100,
        sortCol: "pop",
        sortDir: "desc",
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
        activeChoroKey: "gdp_per_capita",
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
        waqiData: null,
        waqiLayer: null,
        waqiOn: false,
        weatherData: null,
        weatherLayer: null,
        weatherOn: false,
        satelliteData: null,
        satelliteLayer: null,
        satelliteOn: false,
        unescoIchData: null,
        unescoIchLayer: null,
        unescoIchOn: false,
        // Phase 2 layers
        gtdData: null,
        gtdLayer: null,
        gtdOn: false,
        cryptoData: null,
        cryptoLayer: null,
        cryptoOn: false,
        spaceWeatherData: null,
        spaceWeatherLayer: null,
        spaceWeatherOn: false,
        oceanData: null,
        oceanLayer: null,
        oceanOn: false,
        // Phase 3 layers
        flightAwareData: null,
        flightAwareLayer: null,
        flightAwareOn: false,
        marineTrafficData: null,
        marineTrafficLayer: null,
        marineTrafficOn: false,
        // ── FX ─────────────────────────────────────────────────────────────────────
        fxRates: null,
        // initialized at runtime: { ...FX_TO_USD }
        // ── Edit cache ─────────────────────────────────────────────────────────────
        _editsCache: null,
        // ── City sidebar ───────────────────────────────────────────────────────────
        _sidebarTab: "info",
        lightboxImages: [],
        lightboxIdx: 0,
        carImages: [],
        carIdx: 0,
        carTimer: null,
        // ── City stats ─────────────────────────────────────────────────────────────
        _activeStatMetric: null,
        _statsScope: "world",
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
          airQuality: false,
          metro: false,
          nobel: false,
          universities: false,
          airport: false,
          eurostat: false,
          census: false
        },
        _filterValue: {
          pop: null,
          nobel: null,
          universities: null,
          metro: null,
          aq: null
        },
        _matchedVisMode: "show",
        _matchedColorMode: "pop",
        _otherShowMode: "dim",
        _otherColorMode: "pop",
        _popRangeMin: null,
        // log scale: 3=1k, 8=100M
        _popRangeMax: null,
        _heatmapMetric: null,
        _heatmapLayer: null,
        _heatPalette: "warm",
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
        _cpWorldMaxCache: /* @__PURE__ */ new Map(),
        _cpOecdMaxCache: /* @__PURE__ */ new Map(),
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
        gcorpQuery: "",
        gcorpCountry: "",
        gcorpIndustry: "",
        gcorpSort: "revenue_usd",
        // ── Comparison ─────────────────────────────────────────────────────────────
        _cmpCityA: null,
        _cmpCityB: null,
        _ccIsoA: null,
        _ccIsoB: null,
        _bookmarks: null,
        // initialized at runtime: new Set(JSON.parse(...))
        // ── Credit rating lookups ──────────────────────────────────────────────────
        _creditToNum: null,
        // initialized by IIFE in app-legacy.js
        _numToCredit: null,
        // initialized by IIFE in app-legacy.js
        // ── Subnational ────────────────────────────────────────────────────────────
        subnatData: { unemployment: {}, gdp: {}, income: {} },
        subnatFiles: { unemployment: {}, gdp: {}, income: {} }
      };
    }
  });

  // src/constants.js
  var FX_LABELS, FX_TO_USD, STATE_NAME_TO_ABBR, ISO2_TO_CURRENCY, CAPITAL_COORDS, ISO_TO_WIKI_LANG, CA_PROV_TO_ABBR, AU_STATE_TO_ABBR;
  var init_constants = __esm({
    "src/constants.js"() {
      FX_LABELS = {
        USD: "US Dollar",
        EUR: "Euro",
        GBP: "British Pound",
        JPY: "Japanese Yen",
        CNY: "Chinese Yuan",
        KRW: "South Korean Won",
        INR: "Indian Rupee",
        BRL: "Brazilian Real",
        CAD: "Canadian Dollar",
        AUD: "Australian Dollar",
        CHF: "Swiss Franc",
        SEK: "Swedish Krona",
        NOK: "Norwegian Krone",
        DKK: "Danish Krone",
        PLN: "Polish Z\u0142oty",
        HKD: "Hong Kong Dollar",
        SGD: "Singapore Dollar",
        TWD: "New Taiwan Dollar",
        MXN: "Mexican Peso",
        ZAR: "South African Rand",
        TRY: "Turkish Lira",
        RUB: "Russian Ruble",
        IDR: "Indonesian Rupiah",
        MYR: "Malaysian Ringgit",
        PHP: "Philippine Peso",
        THB: "Thai Baht",
        NGN: "Nigerian Naira",
        AED: "UAE Dirham",
        SAR: "Saudi Riyal",
        EGP: "Egyptian Pound",
        QAR: "Qatari Riyal",
        KWD: "Kuwaiti Dinar",
        BHD: "Bahraini Dinar",
        OMR: "Omani Rial",
        CZK: "Czech Koruna",
        HUF: "Hungarian Forint",
        RON: "Romanian Leu",
        BGN: "Bulgarian Lev",
        HRK: "Croatian Kuna",
        RSD: "Serbian Dinar",
        UAH: "Ukrainian Hryvnia",
        KZT: "Kazakhstani Tenge",
        DZD: "Algerian Dinar",
        MAD: "Moroccan Dirham",
        TND: "Tunisian Dinar",
        GHS: "Ghanaian Cedi",
        KES: "Kenyan Shilling",
        ETB: "Ethiopian Birr",
        COP: "Colombian Peso",
        PEN: "Peruvian Sol",
        CLP: "Chilean Peso",
        ARS: "Argentine Peso",
        ILS: "Israeli Shekel",
        JOD: "Jordanian Dinar",
        PKR: "Pakistani Rupee",
        BDT: "Bangladeshi Taka",
        LKR: "Sri Lankan Rupee",
        VND: "Vietnamese Dong",
        MNT: "Mongolian T\xF6gr\xF6g",
        NZD: "New Zealand Dollar",
        IQD: "Iraqi Dinar",
        SYP: "Syrian Pound",
        UZS: "Uzbekistani Som",
        XAF: "Central African CFA Franc",
        XOF: "West African CFA Franc",
        GNF: "Guinean Franc",
        CRC: "Costa Rican Colon",
        ZWG: "Zimbabwe Gold",
        GEL: "Georgian Lari",
        BTC: "Bitcoin",
        ETH: "Ethereum"
      };
      FX_TO_USD = {
        USD: 1,
        EUR: 1.08,
        GBP: 1.27,
        JPY: 67e-4,
        CNY: 0.138,
        KRW: 75e-5,
        INR: 0.012,
        BRL: 0.196,
        CAD: 0.737,
        AUD: 0.648,
        CHF: 1.13,
        SEK: 0.096,
        NOK: 0.092,
        DKK: 0.145,
        PLN: 0.249,
        HKD: 0.128,
        SGD: 0.74,
        TWD: 0.031,
        MXN: 0.052,
        ZAR: 0.055,
        TRY: 0.029,
        RUB: 0.011,
        IDR: 63e-6,
        MYR: 0.224,
        PHP: 0.0173,
        THB: 0.028,
        NGN: 63e-5,
        AED: 0.272,
        SAR: 0.267,
        EGP: 0.02,
        QAR: 0.274,
        KWD: 3.25,
        BHD: 2.65,
        OMR: 2.6,
        CZK: 0.044,
        HUF: 28e-4,
        RON: 0.218,
        BGN: 0.555,
        HRK: 0.145,
        RSD: 93e-4,
        UAH: 0.024,
        KZT: 21e-4,
        DZD: 75e-4,
        MAD: 0.1,
        TND: 0.32,
        GHS: 0.067,
        KES: 77e-4,
        ETB: 83e-4,
        COP: 24e-5,
        PEN: 0.27,
        CLP: 107e-5,
        ARS: 98e-5,
        ILS: 0.27,
        JOD: 1.41,
        PKR: 36e-4,
        BDT: 91e-4,
        LKR: 34e-4,
        VND: 39e-6,
        MNT: 29e-5,
        IQD: 77e-5,
        SYP: 75e-7,
        UZS: 79e-6,
        XAF: 17e-4,
        XOF: 17e-4,
        GNF: 115e-6,
        CRC: 19e-4,
        ZWG: 55e-6,
        GEL: 0.37,
        BTC: 65e3,
        ETH: 3200
      };
      STATE_NAME_TO_ABBR = {
        "Alabama": "AL",
        "Alaska": "AK",
        "Arizona": "AZ",
        "Arkansas": "AR",
        "California": "CA",
        "Colorado": "CO",
        "Connecticut": "CT",
        "Delaware": "DE",
        "District of Columbia": "DC",
        "Florida": "FL",
        "Georgia": "GA",
        "Hawaii": "HI",
        "Idaho": "ID",
        "Illinois": "IL",
        "Indiana": "IN",
        "Iowa": "IA",
        "Kansas": "KS",
        "Kentucky": "KY",
        "Louisiana": "LA",
        "Maine": "ME",
        "Maryland": "MD",
        "Massachusetts": "MA",
        "Michigan": "MI",
        "Minnesota": "MN",
        "Mississippi": "MS",
        "Missouri": "MO",
        "Montana": "MT",
        "Nebraska": "NE",
        "Nevada": "NV",
        "New Hampshire": "NH",
        "New Jersey": "NJ",
        "New Mexico": "NM",
        "New York": "NY",
        "North Carolina": "NC",
        "North Dakota": "ND",
        "Ohio": "OH",
        "Oklahoma": "OK",
        "Oregon": "OR",
        "Pennsylvania": "PA",
        "Rhode Island": "RI",
        "South Carolina": "SC",
        "South Dakota": "SD",
        "Tennessee": "TN",
        "Texas": "TX",
        "Utah": "UT",
        "Vermont": "VT",
        "Virginia": "VA",
        "Washington": "WA",
        "West Virginia": "WV",
        "Wisconsin": "WI",
        "Wyoming": "WY"
      };
      ISO2_TO_CURRENCY = {
        US: "USD",
        GB: "GBP",
        DE: "EUR",
        FR: "EUR",
        IT: "EUR",
        ES: "EUR",
        NL: "EUR",
        BE: "EUR",
        AT: "EUR",
        PT: "EUR",
        FI: "EUR",
        IE: "EUR",
        GR: "EUR",
        LU: "EUR",
        JP: "JPY",
        CN: "CNY",
        KR: "KRW",
        IN: "INR",
        BR: "BRL",
        CA: "CAD",
        AU: "AUD",
        CH: "CHF",
        SE: "SEK",
        NO: "NOK",
        DK: "DKK",
        PL: "PLN",
        HK: "HKD",
        SG: "SGD",
        TW: "TWD",
        MX: "MXN",
        ZA: "ZAR",
        TR: "TRY",
        RU: "RUB",
        ID: "IDR",
        MY: "MYR",
        PH: "PHP",
        TH: "THB",
        NG: "NGN",
        AE: "AED",
        SA: "SAR",
        EG: "EGP",
        QA: "QAR",
        KW: "KWD",
        BH: "BHD",
        OM: "OMR",
        CZ: "CZK",
        HU: "HUF",
        RO: "RON",
        BG: "BGN",
        HR: "HRK",
        RS: "RSD",
        UA: "UAH",
        KZ: "KZT",
        DZ: "DZD",
        MA: "MAD",
        TN: "TND",
        GH: "GHS",
        KE: "KES",
        ET: "ETB",
        CO: "COP",
        PE: "PEN",
        CL: "CLP",
        AR: "ARS",
        IL: "ILS",
        JO: "JOD",
        PK: "PKR",
        BD: "BDT",
        LK: "LKR",
        VN: "VND",
        MN: "MNT",
        NZ: "NZD",
        SK: "EUR",
        SI: "EUR",
        EE: "EUR",
        LV: "EUR",
        LT: "EUR",
        CY: "EUR",
        MT: "EUR",
        IQ: "IQD",
        SY: "SYP",
        UZ: "UZS",
        CM: "XAF",
        CF: "XAF",
        CG: "XAF",
        GA: "XAF",
        GQ: "XAF",
        TD: "XAF",
        BJ: "XOF",
        BF: "XOF",
        CI: "XOF",
        GW: "XOF",
        ML: "XOF",
        NE: "XOF",
        SN: "XOF",
        TG: "XOF",
        GN: "GNF",
        CR: "CRC",
        ZW: "ZWG",
        GE: "GEL"
      };
      CAPITAL_COORDS = {
        US: [38.91, -77.04],
        AU: [-35.28, 149.13],
        AT: [48.21, 16.37],
        BE: [50.85, 4.35],
        BR: [-15.78, -47.93],
        CA: [45.42, -75.69],
        CL: [-33.46, -70.65],
        CN: [39.91, 116.39],
        CO: [4.71, -74.07],
        CZ: [50.08, 14.44],
        DK: [55.68, 12.57],
        EG: [30.06, 31.25],
        FI: [60.17, 24.94],
        FR: [48.86, 2.35],
        DE: [52.52, 13.41],
        GR: [37.98, 23.73],
        HK: [22.32, 114.17],
        HU: [47.5, 19.04],
        IN: [28.61, 77.21],
        ID: [-6.21, 106.85],
        IE: [53.33, -6.25],
        IL: [31.78, 35.22],
        IT: [41.9, 12.5],
        JP: [35.69, 139.69],
        JO: [31.96, 35.95],
        KE: [-1.29, 36.82],
        KW: [29.37, 47.98],
        MY: [3.14, 101.69],
        MX: [19.43, -99.13],
        MA: [34.02, -6.85],
        NL: [52.37, 4.89],
        NZ: [-41.29, 174.78],
        NG: [9.07, 7.4],
        NO: [59.91, 10.75],
        OM: [23.61, 58.59],
        PK: [33.72, 73.04],
        PE: [-12.04, -77.03],
        PH: [14.6, 120.98],
        PL: [52.23, 21.01],
        PT: [38.72, -9.14],
        QA: [25.29, 51.53],
        RU: [55.75, 37.62],
        SA: [24.69, 46.72],
        ZA: [-25.74, 28.19],
        KR: [37.57, 126.98],
        ES: [40.42, -3.7],
        SE: [59.33, 18.07],
        CH: [46.95, 7.45],
        TW: [25.04, 121.56],
        TH: [13.75, 100.52],
        TR: [39.92, 32.85],
        AE: [24.47, 54.37],
        GB: [51.51, -0.13],
        VN: [21.03, 105.83],
        BD: [23.72, 90.41],
        AR: [-34.61, -58.38],
        UA: [50.45, 30.52],
        RO: [44.44, 26.1],
        SK: [48.15, 17.11],
        DZ: [36.74, 3.06],
        GT: [14.64, -90.51],
        HN: [14.1, -87.21],
        CR: [9.93, -84.08],
        PA: [8.99, -79.52],
        DO: [18.48, -69.9],
        CU: [23.13, -82.38],
        TT: [10.65, -61.52],
        KZ: [51.18, 71.45],
        UZ: [41.3, 69.24],
        AZ: [40.41, 49.87],
        GE: [41.69, 44.83],
        AM: [40.18, 44.51],
        LB: [33.89, 35.5],
        IQ: [33.34, 44.4],
        LK: [6.93, 79.85],
        MM: [16.87, 96.19],
        KH: [11.55, 104.92],
        MN: [47.91, 106.89],
        ET: [9.03, 38.74],
        GH: [5.56, -0.2],
        TZ: [-6.8, 39.27],
        AO: [-8.84, 13.23],
        ZM: [-15.42, 28.28],
        MZ: [-25.97, 32.57],
        BW: [-24.65, 25.91],
        MU: [-20.16, 57.5],
        EC: [-0.22, -78.51],
        VE: [10.5, -66.92],
        UY: [-34.9, -56.19],
        BO: [-16.5, -68.15],
        PY: [-25.28, -57.64],
        SV: [13.69, -89.19],
        NI: [12.14, -86.28],
        BZ: [17.25, -88.77],
        JM: [17.99, -76.79],
        AF: [34.53, 69.17],
        NP: [27.7, 85.32],
        FJ: [-18.14, 178.44],
        PG: [-9.44, 147.18],
        BG: [42.7, 23.32],
        HR: [45.81, 15.97],
        RS: [44.82, 20.46],
        SI: [46.05, 14.51],
        LU: [49.61, 6.13],
        CY: [35.17, 33.36],
        MT: [35.9, 14.51],
        LT: [54.69, 25.28],
        LV: [56.95, 24.11],
        EE: [59.44, 24.75],
        MD: [47, 28.86],
        BA: [43.85, 18.4],
        AL: [41.33, 19.82],
        MK: [41.99, 21.43],
        LY: [32.9, 13.18],
        SD: [15.55, 32.53],
        TN: [36.82, 10.17],
        CM: [3.87, 11.52],
        SN: [14.69, -17.44],
        CD: [-4.32, 15.32],
        MG: [-18.91, 47.54],
        RW: [-1.94, 30.06],
        UG: [0.32, 32.58],
        CI: [5.36, -4.01],
        // Small countries / microstates missing from world GeoJSON centroids
        MC: [43.74, 7.43],
        SM: [43.94, 12.46],
        LI: [47.14, 9.52],
        AD: [42.51, 1.52],
        VA: [41.9, 12.45],
        SG: [1.35, 103.82],
        IS: [64.14, -21.9],
        BH: [26.21, 50.59],
        MV: [4.18, 73.51],
        BN: [4.94, 114.95],
        SC: [-4.62, 55.45],
        MO: [22.2, 113.54],
        XK: [42.67, 21.17],
        PS: [31.95, 35.23],
        KP: [39.02, 125.76],
        KI: [1.33, 172.98],
        TV: [-8.52, 179.2],
        NR: [-0.53, 166.92],
        PW: [7.5, 134.62],
        MH: [7.11, 171.18],
        FM: [6.92, 158.16],
        WS: [-13.82, -172.14],
        TO: [-21.14, -175.2],
        VU: [-17.73, 168.32],
        SB: [-9.43, 160.04],
        FO: [62.01, -6.77],
        GL: [64.18, -51.74],
        NC: [-22.27, 166.46],
        PF: [-17.53, -149.57],
        KG: [42.87, 74.59],
        TJ: [38.56, 68.77],
        TM: [37.95, 58.38],
        TL: [-8.56, 125.57],
        GN: [9.54, -13.68],
        GM: [13.45, -16.58],
        GW: [11.86, -15.6],
        SL: [8.49, -13.23],
        LR: [6.3, -10.8],
        ML: [12.65, -8],
        BF: [12.37, -1.52],
        NE: [13.51, 2.12],
        TD: [12.11, 15.04],
        CF: [4.36, 18.55],
        CG: [-4.27, 15.29],
        GQ: [3.75, 8.78],
        GA: [0.39, 9.45],
        DJ: [11.59, 43.15],
        ER: [15.34, 38.93],
        SO: [2.05, 45.34],
        SS: [4.86, 31.57],
        LS: [-29.32, 27.48],
        SZ: [-26.32, 31.14],
        MW: [-13.97, 33.79],
        MR: [18.08, -15.97],
        ST: [0.34, 6.73],
        CV: [14.93, -23.51],
        KM: [-11.7, 43.26],
        GD: [12.06, -61.74],
        DM: [15.3, -61.39],
        LC: [13.91, -60.98],
        KN: [17.3, -62.72],
        VC: [13.16, -61.23],
        AG: [17.12, -61.85],
        BB: [13.1, -59.62],
        BS: [25.08, -77.35],
        HT: [18.54, -72.34],
        GI: [36.14, -5.35],
        IM: [54.15, -4.49]
      };
      ISO_TO_WIKI_LANG = {
        JP: "ja",
        CN: "zh",
        KR: "ko",
        TW: "zh",
        HK: "zh",
        DE: "de",
        AT: "de",
        CH: "de",
        FR: "fr",
        BE: "fr",
        ES: "es",
        MX: "es",
        AR: "es",
        CO: "es",
        CL: "es",
        PE: "es",
        VE: "es",
        PT: "pt",
        BR: "pt",
        IT: "it",
        RU: "ru",
        BY: "be",
        UA: "uk",
        NL: "nl",
        PL: "pl",
        CZ: "cs",
        SK: "sk",
        HU: "hu",
        RO: "ro",
        BG: "bg",
        HR: "hr",
        SE: "sv",
        NO: "no",
        DK: "da",
        FI: "fi",
        TR: "tr",
        GR: "el",
        IL: "he",
        SA: "ar",
        AE: "ar",
        EG: "ar",
        IN: "hi",
        ID: "id",
        TH: "th",
        VN: "vi",
        MY: "ms"
      };
      CA_PROV_TO_ABBR = {
        "Alberta": "AB",
        "British Columbia": "BC",
        "Manitoba": "MB",
        "New Brunswick": "NB",
        "Newfoundland and Labrador": "NL",
        "Northwest Territories": "NT",
        "Nova Scotia": "NS",
        "Nunavut": "NU",
        "Ontario": "ON",
        "Prince Edward Island": "PE",
        "Quebec": "QC",
        "Saskatchewan": "SK",
        "Yukon": "YT"
      };
      AU_STATE_TO_ABBR = {
        "New South Wales": "NSW",
        "Victoria": "VIC",
        "Queensland": "QLD",
        "Western Australia": "WA",
        "South Australia": "SA",
        "Tasmania": "TAS",
        "Australian Capital Territory": "ACT",
        "Northern Territory": "NT"
      };
    }
  });

  // src/choro-defs.js
  var CHORO_INDICATORS;
  var init_choro_defs = __esm({
    "src/choro-defs.js"() {
      CHORO_INDICATORS = [
        {
          key: "gdp_per_capita",
          label: "GDP per capita (USD)",
          fmt: (v) => "$" + Math.round(v).toLocaleString(),
          c0: [40, 30, 100],
          c1: [60, 210, 100],
          histKey: "gdp_per_capita_history"
        },
        {
          key: "life_expectancy",
          label: "Life expectancy (years)",
          fmt: (v) => v.toFixed(1) + " yrs",
          c0: [210, 50, 50],
          c1: [50, 185, 110],
          histKey: "life_expectancy_history"
        },
        {
          key: "internet_pct",
          label: "Internet users (%)",
          fmt: (v) => v.toFixed(1) + "%",
          c0: [35, 35, 80],
          c1: [20, 200, 240]
        },
        {
          key: "urban_pct",
          label: "Urban population (%)",
          fmt: (v) => v.toFixed(1) + "%",
          c0: [150, 130, 70],
          c1: [30, 120, 210]
        },
        {
          key: "literacy_rate",
          label: "Literacy rate (%)",
          fmt: (v) => v.toFixed(1) + "%",
          c0: [200, 80, 40],
          c1: [50, 100, 220]
        },
        {
          key: "electricity_pct",
          label: "Electricity access (%)",
          fmt: (v) => v.toFixed(1) + "%",
          c0: [60, 40, 20],
          c1: [240, 200, 50]
        },
        {
          key: "gini",
          label: "Income inequality (Gini)",
          fmt: (v) => v.toFixed(1) + " / 100",
          c0: [50, 180, 100],
          c1: [220, 50, 50]
        },
        // low Gini = more equal = good (green)
        {
          key: "child_mortality",
          label: "Child mortality (/ 1k births)",
          fmt: (v) => v.toFixed(1) + " / 1k",
          c0: [50, 180, 100],
          c1: [220, 50, 50]
        },
        {
          key: "co2_per_capita",
          label: "CO\u2082 per capita (tonnes)",
          fmt: (v) => v.toFixed(1) + " t",
          c0: [50, 180, 100],
          c1: [220, 50, 50]
        },
        {
          key: "inform_risk",
          label: "Disaster Risk (INFORM)",
          fmt: (v) => v.toFixed(1) + " / 10",
          c0: [50, 180, 100],
          c1: [220, 50, 50]
        },
        {
          key: "unesco_total",
          label: "UNESCO World Heritage Sites",
          fmt: (v) => v + " sites",
          c0: [40, 30, 80],
          c1: [230, 168, 23]
        },
        {
          key: "hdi",
          label: "Human Development Index",
          fmt: (v) => v.toFixed(3),
          c0: [210, 50, 50],
          c1: [50, 185, 110]
        },
        {
          key: "who_obesity",
          label: "Obesity prevalence (%)",
          fmt: (v) => v.toFixed(1) + "%",
          c0: [50, 180, 100],
          c1: [220, 50, 50]
        },
        {
          key: "co2_total_mt",
          label: "Total CO\u2082 emissions (Mt)",
          fmt: (v) => Math.round(v).toLocaleString() + " Mt",
          c0: [40, 60, 80],
          c1: [220, 50, 50]
        },
        {
          key: "who_hale",
          label: "Healthy Life Expectancy (years)",
          fmt: (v) => v.toFixed(1) + " yrs",
          c0: [210, 50, 50],
          c1: [50, 185, 110]
        }
      ];
    }
  });

  // src/stat-defs.js
  var AQ_STOPS, CENSUS_BRACKET_LABELS, CENSUS_BRACKET_COLORS, CENSUS_METRICS;
  var init_stat_defs = __esm({
    "src/stat-defs.js"() {
      AQ_STOPS = [
        { min: 50, color: "#bc8cff", label: "Severe" },
        { min: 25, color: "#f85149", label: "Very Poor" },
        { min: 15, color: "#ffa657", label: "Poor" },
        { min: 10, color: "#f0a500", label: "Moderate" },
        { min: 5, color: "#58a6ff", label: "Acceptable" },
        { min: 0, color: "#3fb950", label: "Good" }
      ];
      CENSUS_BRACKET_LABELS = ["< $15k", "$15\u201325k", "$25\u201350k", "$50\u201375k", "$75\u2013100k", "$100\u2013150k", "$150\u2013200k", "$200k+"];
      CENSUS_BRACKET_COLORS = ["#8b949e", "#58a6ff", "#2a8ee8", "#3fb950", "#56d364", "#ffa657", "#f0a500", "#e05c2e"];
      CENSUS_METRICS = {
        medianIncome: { label: "Median Income", lo: "$30k", hi: "$150k+", min: 3e4, max: 15e4, stops: [[31, 102, 235], [63, 185, 80], [240, 165, 0]] },
        povertyPct: { label: "Poverty Rate", lo: "0%", hi: "40%+", min: 0, max: 40, stops: [[63, 185, 80], [255, 166, 87], [248, 81, 73]] },
        unemploymentPct: { label: "Unemployment", lo: "0%", hi: "15%+", min: 0, max: 15, stops: [[63, 185, 80], [255, 166, 87], [248, 81, 73]] },
        rentBurdenedPct: { label: "Rent-Burdened", lo: "10%", hi: "60%+", min: 10, max: 60, stops: [[63, 185, 80], [255, 166, 87], [248, 81, 73]] },
        gini: { label: "Gini Index", lo: "0.30", hi: "0.60+", min: 0.3, max: 0.6, stops: [[63, 185, 80], [255, 166, 87], [248, 81, 73]] },
        bachelorPlusPct: { label: "College-Educated", lo: "10%", hi: "70%+", min: 10, max: 70, stops: [[31, 102, 235], [88, 166, 255], [224, 240, 255]] },
        snapPct: { label: "SNAP Receipt", lo: "0%", hi: "30%+", min: 0, max: 30, stops: [[63, 185, 80], [255, 166, 87], [248, 81, 73]] },
        transitPct: { label: "Transit Use", lo: "0%", hi: "40%+", min: 0, max: 40, stops: [[224, 240, 255], [88, 166, 255], [31, 102, 235]] },
        medianAge: { label: "Median Age", lo: "25", hi: "45+", min: 25, max: 45, stops: [[88, 166, 255], [31, 102, 235], [111, 66, 193]] },
        ownerOccPct: { label: "Homeownership", lo: "20%", hi: "80%+", min: 20, max: 80, stops: [[224, 240, 255], [63, 185, 80], [31, 102, 235]] }
      };
    }
  });

  // src/viz-defs.js
  var HEAT_PALETTES, AVAIL_TO_METRIC, VALUE_TO_METRIC, GAWC_TIER_SCORE, GAWC_TIER_COLOR, BASEMAP_URLS, BASEMAP_ATTR;
  var init_viz_defs = __esm({
    "src/viz-defs.js"() {
      HEAT_PALETTES = {
        warm: {
          nobel: [[0, "#3b1f6e"], [0.35, "#7b2ff7"], [0.65, "#a371f7"], [1, "#e0ccff"]],
          universities: [[0, "#0d2b55"], [0.35, "#1f6feb"], [0.65, "#58a6ff"], [1, "#cce5ff"]],
          pop: [[0, "#0a3020"], [0.35, "#20c997"], [0.65, "#3fb950"], [1, "#d1fadf"]],
          metro: [[0, "#2e1c00"], [0.35, "#b87800"], [0.65, "#f0a500"], [1, "#ffe08a"]],
          aq: [[0, "#1a4a1a"], [0.3, "#3fb950"], [0.55, "#f0a500"], [0.78, "#f85149"], [1, "#bc8cff"]]
        },
        viridis: { _all: [[0, "#440154"], [0.25, "#31688e"], [0.5, "#35b779"], [0.75, "#90d743"], [1, "#fde725"]] },
        inferno: { _all: [[0, "#0d0221"], [0.25, "#56106e"], [0.5, "#bb3754"], [0.75, "#f98c09"], [1, "#fcffa4"]] },
        ocean: { _all: [[0, "#03071e"], [0.25, "#1565c0"], [0.5, "#0097a7"], [0.75, "#80deea"], [1, "#e0f7fa"]] }
      };
      AVAIL_TO_METRIC = {
        metro: "metro",
        nobel: "nobel",
        universities: "universities",
        airQuality: "aq",
        airport: null,
        eurostat: null,
        census: null
      };
      VALUE_TO_METRIC = {
        metro: "metro",
        nobel: "nobel",
        universities: "universities",
        aq: "aq",
        pop: "pop"
      };
      GAWC_TIER_SCORE = {
        "Alpha++": 12,
        "Alpha+": 11,
        "Alpha": 10,
        "Alpha-": 9,
        "Beta+": 8,
        "Beta": 7,
        "Beta-": 6,
        "Gamma+": 5,
        "Gamma": 4,
        "Gamma-": 3,
        "High sufficiency": 2,
        "Sufficiency": 1
      };
      GAWC_TIER_COLOR = {
        "Alpha++": "#f0a500",
        "Alpha+": "#f0a500",
        "Alpha": "#58a6ff",
        "Alpha-": "#58a6ff",
        "Beta+": "#3fb950",
        "Beta": "#3fb950",
        "Beta-": "#3fb950",
        "Gamma+": "#8b949e",
        "Gamma": "#8b949e",
        "Gamma-": "#8b949e",
        "High sufficiency": "#484f58",
        "Sufficiency": "#484f58"
      };
      BASEMAP_URLS = {
        street_dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        street_light: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        // Primary terrain (OpenTopoMap - often has rate limits/outages)
        terrain: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
        // Fallback terrain (ESRI World Topo - more reliable, free for viewing)
        terrain_fallback: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
      };
      BASEMAP_ATTR = {
        street_dark: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        street_light: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        satellite: '&copy; <a href="https://www.esri.com">Esri</a> World Imagery',
        terrain: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
        terrain_fallback: '&copy; <a href="https://www.esri.com">Esri</a> World Topo'
      };
    }
  });

  // src/app-legacy.js
  function createLazyLoader(url, assign, shouldRebuild) {
    let loaded = false, loading = null;
    async function ensure() {
      if (loaded) return;
      if (loading) return loading;
      var stem = url.replace(/^\//, "").replace(/\.json(\?.*)?$/, "");
      var kdbData = _kdbGet(stem);
      if (kdbData !== null) {
        assign(kdbData);
        console.log(`[kdb] lazy hit: ${stem}`);
        if (shouldRebuild && shouldRebuild()) rebuildMapLayer();
        loaded = true;
        return;
      }
      loading = (async () => {
        try {
          const res = await fetch(url);
          if (res.ok) {
            assign(await res.json());
            console.log(`[lazy] ${url} loaded`);
            if (shouldRebuild && shouldRebuild()) rebuildMapLayer();
          }
        } catch (e) {
          console.warn(`[lazy] ${url} failed`, e);
        } finally {
          loaded = true;
          loading = null;
        }
      })();
      return loading;
    }
    return { ensure, isLoaded: () => loaded };
  }
  function _kdbGet(stem) {
    if (!S.kdb) return null;
    var key = _URL_TO_KDB[stem] || stem;
    var val = S.kdb[key];
    if (!val) return null;
    if (_URL_TO_KDB[stem] && _URL_TO_KDB[stem] !== stem) {
      var full = val;
      if (full && typeof full === "object") {
      }
    }
    if (stem.startsWith("admin1/") && S.kdb.admin1) {
      var code = stem.replace("admin1/", "").replace(".json", "");
      return S.kdb.admin1[code] || null;
    }
    return val;
  }
  async function _kdbOrFetch(url) {
    var stem = url.replace(/^\//, "").replace(/\.json(\?.*)?$/, "");
    var kdbData = _kdbGet(stem);
    if (kdbData !== null) {
      console.log("[kdb] hit: " + stem);
      return { ok: true, status: 200, json: async () => kdbData };
    }
    var res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
    return res;
  }
  function applyMapFilters(city) {
    const qid = city.qid;
    if (S._filterAvail.airQuality && !S.airQualityData[qid]) return "other";
    if (S._filterAvail.metro && !S.metroTransitData[qid]) return "other";
    if (S._filterAvail.nobel && !S.nobelCitiesData[qid]) return "other";
    if (S._filterAvail.universities && !S.universitiesData[qid]) return "other";
    if (S._filterAvail.airport && !S.airportData[qid]) return "other";
    if (S._filterAvail.eurostat && !S.eurostatCities[qid]) return "other";
    if (S._filterAvail.census && !S.censusCities[qid]) return "other";
    if (S._filterValue.nobel !== null) {
      if ((S.nobelCitiesData[qid]?.total ?? 0) < S._filterValue.nobel) return "other";
    }
    if (S._filterValue.universities !== null) {
      if ((S.universitiesData[qid]?.length ?? 0) < S._filterValue.universities) return "other";
    }
    if (S._filterValue.pop !== null) {
      const p = city.pop || 0;
      if (typeof S._filterValue.pop === "object") {
        const { min, max } = S._filterValue.pop;
        if (p < min || p > max) return "other";
      } else {
        if (S._filterValue.pop === "small" && p >= 1e5) return "other";
        if (S._filterValue.pop === "medium" && (p < 1e5 || p >= 1e6)) return "other";
        if (S._filterValue.pop === "large" && (p < 1e6 || p >= 1e7)) return "other";
        if (S._filterValue.pop === "mega" && p < 1e7) return "other";
      }
    }
    if (S._filterValue.metro !== null) {
      if ((S.metroTransitData[qid]?.stations ?? 0) < S._filterValue.metro) return "other";
    }
    if (S._filterValue.aq !== null) {
      if ((S.airQualityData[qid]?.category ?? "") !== S._filterValue.aq) return "other";
    }
    return "match";
  }
  function _filterCount() {
    return Object.values(S._filterAvail).filter(Boolean).length + Object.values(S._filterValue).filter((v) => v !== null).length;
  }
  function _anyFilterActive() {
    return _filterCount() > 0;
  }
  function _valueFilterColor(city) {
    const qid = city.qid;
    if (S._filterValue.nobel != null) {
      const n = S.nobelCitiesData[qid]?.total ?? 0;
      if (n < S._filterValue.nobel) return null;
      const t = Math.min(n / 50, 1);
      return `hsl(265,${Math.round(55 + t * 30)}%,${Math.round(62 - t * 18)}%)`;
    }
    if (S._filterValue.universities != null) {
      const n = S.universitiesData[qid]?.length ?? 0;
      if (n < S._filterValue.universities) return null;
      const t = Math.min(n / 100, 1);
      return `hsl(210,${Math.round(65 + t * 30)}%,${Math.round(65 - t * 22)}%)`;
    }
    if (S._filterValue.metro != null) {
      const n = S.metroTransitData[qid]?.stations ?? 0;
      if (n < S._filterValue.metro) return null;
      const t = Math.min(n / 500, 1);
      return `hsl(${Math.round(42 - t * 8)},${Math.round(85 + t * 10)}%,${Math.round(58 - t * 18)}%)`;
    }
    if (S._filterValue.aq != null) {
      return airQualityDotColor(city) || null;
    }
    if (S._filterValue.pop != null) {
      return null;
    }
    return null;
  }
  function toggleFilterPanel() {
    const panel = document.getElementById("filter-panel");
    if (panel.classList.contains("open")) closeFilterPanel();
    else openFilterPanel();
  }
  function openFilterPanel() {
    _aqLoader.ensure();
    _airportLoader.ensure();
    _univLoader.ensure();
    _metroLoader.ensure();
    _nobelLoader.ensure();
    _eurostatLoader.ensure();
    document.getElementById("filter-panel").classList.add("open");
    document.getElementById("filter-fab").classList.add("active");
    _mobileBackdropOn();
  }
  function closeFilterPanel() {
    document.getElementById("filter-panel").classList.remove("open");
    document.getElementById("filter-fab").classList.remove("active");
    _mobileBackdropOff();
  }
  function _updateDotControls() {
    const active = _anyFilterActive() || !!S._heatmapMetric;
    document.querySelectorAll("#dot-controls-section button").forEach((b) => {
      b.disabled = !active;
    });
  }
  function _updateFilterBadge() {
    const badge = document.getElementById("filter-fab-badge");
    const n = _filterCount();
    if (!badge) return;
    badge.textContent = n;
    badge.style.display = n > 0 ? "" : "none";
  }
  function setMatchedVis(mode) {
    S._matchedVisMode = mode;
    document.querySelectorAll("[data-matched-vis]").forEach((b) => {
      b.classList.toggle("active", b.dataset.matchedVis === mode);
    });
    rebuildMapLayer();
  }
  function setMatchedColorMode(mode) {
    S._matchedColorMode = mode;
    document.querySelectorAll("[data-matched-col]").forEach((b) => {
      b.classList.toggle("active", b.dataset.matchedCol === mode);
    });
    _updateAvailIntensityStrips();
    rebuildMapLayer();
  }
  function setOtherVis(mode) {
    S._otherShowMode = mode;
    document.querySelectorAll("[data-other-vis]").forEach((b) => {
      b.classList.toggle("active", b.dataset.otherVis === mode);
    });
    rebuildMapLayer();
  }
  function setOtherColorMode(mode) {
    S._otherColorMode = mode;
    document.querySelectorAll("[data-other-col]").forEach((b) => {
      b.classList.toggle("active", b.dataset.otherCol === mode);
    });
    rebuildMapLayer();
  }
  function clearAllFilters() {
    if (S._heatmapMetric) clearHeatmap();
    Object.keys(S._filterAvail).forEach((k) => {
      S._filterAvail[k] = false;
    });
    Object.keys(S._filterValue).forEach((k) => {
      S._filterValue[k] = null;
    });
    document.querySelectorAll(".filter-avail-btn").forEach((b) => {
      b.classList.remove("on");
      b.textContent = "off";
    });
    document.querySelectorAll(".filter-bucket").forEach((b) => {
      b.classList.toggle("active", b.dataset.val === "null");
    });
    S._popRangeMin = POP_SCALE.min;
    S._popRangeMax = POP_SCALE.max;
    _updatePopSliderUI(POP_SCALE.min, POP_SCALE.max);
    localStorage.removeItem("wdm_popMin");
    localStorage.removeItem("wdm_popMax");
    S._matchedVisMode = "show";
    S._matchedColorMode = "pop";
    S._otherShowMode = "dim";
    S._otherColorMode = "pop";
    document.querySelectorAll("[data-matched-vis]").forEach((b) => b.classList.toggle("active", b.dataset.matchedVis === "show"));
    document.querySelectorAll("[data-matched-col]").forEach((b) => b.classList.toggle("active", b.dataset.matchedCol === "pop"));
    document.querySelectorAll("[data-other-vis]").forEach((b) => b.classList.toggle("active", b.dataset.otherVis === "dim"));
    document.querySelectorAll("[data-other-col]").forEach((b) => b.classList.toggle("active", b.dataset.otherCol === "pop"));
    S._heatPalette = "warm";
    S._heatRadius = 40;
    S._heatBlur = 28;
    S._heatMinOpacity = 0.45;
    document.querySelectorAll("[data-palette]").forEach((b) => b.classList.toggle("active", b.dataset.palette === "warm"));
    const rSlider = document.getElementById("heat-radius-slider");
    const bSlider = document.getElementById("heat-blur-slider");
    const iSlider = document.getElementById("heat-intensity-slider");
    if (rSlider) {
      rSlider.value = 40;
      document.getElementById("heat-radius-val").textContent = "40";
    }
    if (bSlider) {
      bSlider.value = 28;
      document.getElementById("heat-blur-val").textContent = "28";
    }
    if (iSlider) {
      iSlider.value = 45;
      document.getElementById("heat-intensity-val").textContent = "45%";
    }
    _updateAvailIntensityStrips();
    _updateFilterBadge();
    rebuildMapLayer();
  }
  async function toggleAvailFilter(key) {
    const wasOn = S._filterAvail[key];
    const pane = S.map && S.map.getPane("cityPane");
    if (pane && (pane.style.opacity === "0" || S.wikiLayer && !S.map.hasLayer(S.wikiLayer))) {
      setCityDotMode("show");
    }
    Object.keys(S._filterAvail).forEach((k) => {
      S._filterAvail[k] = false;
    });
    document.querySelectorAll(".filter-avail-btn").forEach((b) => {
      b.classList.remove("on");
      b.textContent = "off";
    });
    if (!wasOn) {
      S._filterAvail[key] = true;
      const btn = document.querySelector(`.filter-avail-btn[data-key="${key}"]`);
      if (btn) {
        btn.classList.add("on");
        btn.textContent = "ON";
      }
      S._otherShowMode = "hide";
      document.querySelectorAll("[data-other-vis]").forEach((b) => b.classList.toggle("active", b.dataset.otherVis === "hide"));
      S._matchedColorMode = "metric";
      document.querySelectorAll("[data-matched-col]").forEach((b) => b.classList.toggle("active", b.dataset.matchedCol === "metric"));
      if (key === "eurostat") await _eurostatLoader.ensure();
    }
    _updateAvailIntensityStrips();
    _updateFilterBadge();
    rebuildMapLayer();
  }
  function setValueFilter(metric, value) {
    S._filterValue[metric] = value;
    const row = document.querySelector(`.filter-bucket-row[data-metric="${metric}"]`);
    if (row) {
      row.querySelectorAll(".filter-bucket").forEach((btn) => {
        const bval = btn.dataset.val === "null" ? null : btn.dataset.val;
        const numVal = bval !== null && !isNaN(Number(bval)) ? Number(bval) : bval;
        btn.classList.toggle("active", numVal === value);
      });
    }
    _updateFilterBadge();
    if (S._heatmapMetric === metric) _refreshHeatLayer();
    rebuildMapLayer();
  }
  function _popSliderValToNum(val) {
    return Math.pow(10, Number(val));
  }
  function _popFormat(num) {
    if (num >= 1e9) return (num / 1e9).toFixed(1) + "B";
    if (num >= 1e6) return (num / 1e6).toFixed(1) + "M";
    if (num >= 1e3) return (num / 1e3).toFixed(0) + "k";
    return num.toString();
  }
  function _updatePopSliderUI(minVal, maxVal) {
    const minEl = document.getElementById("pop-slider-min");
    const maxEl = document.getElementById("pop-slider-max");
    const minValEl = document.getElementById("pop-slider-min-val");
    const maxValEl = document.getElementById("pop-slider-max-val");
    if (!minEl || !maxEl) return;
    minEl.value = minVal;
    maxEl.value = maxVal;
    const isAny = minVal <= POP_SCALE.min && maxVal >= POP_SCALE.max;
    if (isAny) {
      minValEl.textContent = "Any";
      maxValEl.textContent = "";
      maxValEl.style.display = "none";
      const dash = maxValEl.previousElementSibling;
      if (dash) dash.style.display = "none";
    } else {
      minValEl.textContent = _popFormat(_popSliderValToNum(minVal));
      maxValEl.textContent = _popFormat(_popSliderValToNum(maxVal));
      maxValEl.style.display = "";
      const dash = maxValEl.previousElementSibling;
      if (dash) dash.style.display = "";
    }
    _updatePopSliderTrack();
  }
  function _updatePopSliderTrack() {
    const minEl = document.getElementById("pop-slider-min");
    const maxEl = document.getElementById("pop-slider-max");
    const track = document.querySelector(".pop-slider-track");
    if (!track || !minEl || !maxEl) return;
    const minVal = Number(minEl.value);
    const maxVal = Number(maxEl.value);
    const range = POP_SCALE.max - POP_SCALE.min;
    const minPct = (minVal - POP_SCALE.min) / range * 100;
    const maxPct = (maxVal - POP_SCALE.min) / range * 100;
    track.style.background = `linear-gradient(to right,
    rgba(128,128,128,0.5) 0%, rgba(128,128,128,0.5) ${minPct}%,
    #ff6b6b ${minPct}%, #ffa94d ${minPct + (maxPct - minPct) * 0.16}%,
    #ffd43b ${minPct + (maxPct - minPct) * 0.33}%, #69db7c ${minPct + (maxPct - minPct) * 0.5}%,
    #4dabf7 ${minPct + (maxPct - minPct) * 0.66}%, #9775fa ${minPct + (maxPct - minPct) * 0.83}%,
    #f06595 ${maxPct}%, rgba(128,128,128,0.5) ${maxPct}%, rgba(128,128,128,0.5) 100%
  )`;
  }
  function setPopRange(minVal, maxVal) {
    S._popRangeMin = minVal;
    S._popRangeMax = maxVal;
    const isAny = minVal <= POP_SCALE.min && maxVal >= POP_SCALE.max;
    if (isAny) {
      S._filterValue.pop = null;
    } else {
      S._filterValue.pop = { min: _popSliderValToNum(minVal), max: _popSliderValToNum(maxVal) };
    }
    _updatePopSliderUI(minVal, maxVal);
    _updateFilterBadge();
    rebuildMapLayer();
  }
  function resetPopRange() {
    setPopRange(POP_SCALE.min, POP_SCALE.max);
  }
  function _initPopSlider() {
    const minEl = document.getElementById("pop-slider-min");
    const maxEl = document.getElementById("pop-slider-max");
    if (!minEl || !maxEl) return;
    const savedMin = localStorage.getItem("wdm_popMin");
    const savedMax = localStorage.getItem("wdm_popMax");
    if (savedMin !== null && savedMax !== null) {
      const minVal = Math.max(POP_SCALE.min, Math.min(POP_SCALE.max, Number(savedMin)));
      const maxVal = Math.max(POP_SCALE.min, Math.min(POP_SCALE.max, Number(savedMax)));
      if (minVal < maxVal) {
        S._popRangeMin = minVal;
        S._popRangeMax = maxVal;
        if (minVal > POP_SCALE.min || maxVal < POP_SCALE.max) {
          S._filterValue.pop = { min: _popSliderValToNum(minVal), max: _popSliderValToNum(maxVal) };
        }
      }
    }
    const currentMin = S._popRangeMin ?? POP_SCALE.min;
    const currentMax = S._popRangeMax ?? POP_SCALE.max;
    _updatePopSliderUI(currentMin, currentMax);
    minEl.addEventListener("input", () => {
      let newMin = Number(minEl.value);
      let newMax = Number(maxEl.value);
      if (newMin > newMax) newMin = newMax;
      setPopRange(newMin, newMax);
      localStorage.setItem("wdm_popMin", newMin);
      localStorage.setItem("wdm_popMax", newMax);
    });
    maxEl.addEventListener("input", () => {
      let newMin = Number(minEl.value);
      let newMax = Number(maxEl.value);
      if (newMax < newMin) newMax = newMin;
      setPopRange(newMin, newMax);
      localStorage.setItem("wdm_popMin", newMin);
      localStorage.setItem("wdm_popMax", newMax);
    });
  }
  async function setHeatmapMetric(metric) {
    if (S._heatmapMetric === metric) {
      clearHeatmap();
      return;
    }
    if (metric === "aq") await _aqLoader.ensure();
    if (metric === "metro") await _metroLoader.ensure();
    if (metric === "nobel") await _nobelLoader.ensure();
    if (metric === "universities") await _univLoader.ensure();
    S._heatmapMetric = metric;
    document.querySelectorAll(".filter-heat-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.metric === metric);
    });
    const palRow = document.getElementById("heat-palette-row");
    if (palRow) palRow.style.display = "block";
    const ctrlRow = document.getElementById("heat-controls-row");
    if (ctrlRow) ctrlRow.style.display = "block";
    _refreshHeatLayer();
    rebuildMapLayer();
  }
  function clearHeatmap() {
    S._heatmapMetric = null;
    if (S._heatmapLayer) {
      S._heatmapLayer.remove();
      S._heatmapLayer = null;
    }
    const palRow = document.getElementById("heat-palette-row");
    if (palRow) palRow.style.display = "none";
    const ctrlRow = document.getElementById("heat-controls-row");
    if (ctrlRow) ctrlRow.style.display = "none";
    document.querySelectorAll(".filter-heat-btn").forEach((b) => b.classList.remove("active"));
    rebuildMapLayer();
  }
  function setHeatPalette(name) {
    S._heatPalette = name;
    document.querySelectorAll("[data-palette]").forEach((b) => {
      b.classList.toggle("active", b.dataset.palette === name);
    });
    _updateAvailIntensityStrips();
    _refreshHeatLayer();
    if (S._matchedColorMode === "metric") rebuildMapLayer();
  }
  function setHeatRadius(v) {
    S._heatRadius = Number(v);
    const el = document.getElementById("heat-radius-val");
    if (el) el.textContent = v;
    if (S._heatmapLayer) S._heatmapLayer.setOptions({ radius: S._heatRadius });
  }
  function setHeatBlur(v) {
    S._heatBlur = Number(v);
    const el = document.getElementById("heat-blur-val");
    if (el) el.textContent = v;
    if (S._heatmapLayer) S._heatmapLayer.setOptions({ blur: S._heatBlur });
  }
  function setHeatIntensity(v) {
    S._heatMinOpacity = Number(v) / 100;
    const el = document.getElementById("heat-intensity-val");
    if (el) el.textContent = v + "%";
    if (S._heatmapLayer) S._heatmapLayer.setOptions({ minOpacity: S._heatMinOpacity });
  }
  function _passesMetricValueFilter(metric, city) {
    const qid = city.qid;
    const fv = S._filterValue[metric];
    if (fv == null) return true;
    switch (metric) {
      case "nobel":
        return (S.nobelCitiesData[qid]?.total ?? 0) >= fv;
      case "universities":
        return (S.universitiesData[qid]?.length ?? 0) >= fv;
      case "metro":
        return (S.metroTransitData[qid]?.stations ?? 0) >= fv;
      case "aq":
        return (S.airQualityData[qid]?.category ?? "") === fv;
      case "pop": {
        const p = city.pop || 0;
        if (fv === "small") return p < 1e5;
        if (fv === "medium") return p >= 1e5 && p < 1e6;
        if (fv === "large") return p >= 1e6 && p < 1e7;
        if (fv === "mega") return p >= 1e7;
        return true;
      }
      default:
        return true;
    }
  }
  function _cityMetricValue(city, metric) {
    const qid = city.qid;
    if (metric === "nobel") return S.nobelCitiesData[qid]?.total ?? 0;
    if (metric === "universities") return S.universitiesData[qid]?.length ?? 0;
    if (metric === "pop") return city.pop || 0;
    if (metric === "metro") return S.metroTransitData[qid]?.stations ?? 0;
    if (metric === "aq") return S.airQualityData[qid]?.pm25 ?? 0;
    return 0;
  }
  function _buildHeatPoints(metric) {
    const raw = [];
    for (const city of S.allCities) {
      const val = _cityMetricValue(city, metric);
      if (val > 0 && _passesMetricValueFilter(metric, city))
        raw.push({ lat: city.lat, lng: city.lng, val });
    }
    if (raw.length === 0) return [];
    const sorted = raw.map((r) => r.val).sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1];
    S._heatNormP95[metric] = p95;
    return raw.map((r) => [r.lat, r.lng, Math.min(r.val / p95, 1)]);
  }
  function _refreshHeatLayer() {
    if (!S._heatmapMetric) return;
    const points = _buildHeatPoints(S._heatmapMetric);
    if (S._heatmapLayer) {
      S._heatmapLayer.remove();
      S._heatmapLayer = null;
    }
    if (points.length > 0 && typeof L !== "undefined" && L.heatLayer) {
      S._heatmapLayer = L.heatLayer(points, {
        radius: S._heatRadius,
        blur: S._heatBlur,
        maxZoom: 10,
        max: 1,
        minOpacity: S._heatMinOpacity,
        gradient: _heatGradient(S._heatmapMetric)
      }).addTo(S.map);
    }
  }
  function _lerpHex(c0, c1, t) {
    const r0 = parseInt(c0.slice(1, 3), 16), g0 = parseInt(c0.slice(3, 5), 16), b0 = parseInt(c0.slice(5, 7), 16);
    const r1 = parseInt(c1.slice(1, 3), 16), g1 = parseInt(c1.slice(3, 5), 16), b1 = parseInt(c1.slice(5, 7), 16);
    return `rgb(${Math.round(r0 + (r1 - r0) * t)},${Math.round(g0 + (g1 - g0) * t)},${Math.round(b0 + (b1 - b0) * t)})`;
  }
  function _getPaletteStops(metric) {
    const pal = HEAT_PALETTES[S._heatPalette] || HEAT_PALETTES.warm;
    return pal[metric] || pal._all || HEAT_PALETTES.warm[metric] || HEAT_PALETTES.warm.pop;
  }
  function _cityHasMetricData(city, metric) {
    return _cityMetricValue(city, metric) > 0;
  }
  function _metricDotColor(city, metric) {
    const val = _cityMetricValue(city, metric);
    const p95 = S._heatNormP95[metric] || 1;
    const t = Math.min(val / p95, 1);
    const stops = _getPaletteStops(metric);
    for (let i = 1; i < stops.length; i++) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      if (t <= t1) return _lerpHex(c0, c1, (t - t0) / (t1 - t0 || 1));
    }
    return stops[stops.length - 1][1];
  }
  function _buildMetricGradientCSS(metric) {
    const stops = _getPaletteStops(metric);
    const parts = stops.map(([t, c]) => `${c} ${Math.round(t * 100)}%`);
    return `linear-gradient(to right, ${parts.join(", ")})`;
  }
  function _buildPopGradientCSS() {
    const parts = COLOR_STOPS.map(([t, [r, g, b]]) => `rgb(${r},${g},${b}) ${Math.round(t * 100)}%`);
    return `linear-gradient(to right, ${parts.join(", ")})`;
  }
  function _updateAvailIntensityStrips() {
    document.querySelectorAll("#filter-avail-list .filter-avail-row").forEach((row) => {
      const strip = row.querySelector(".avail-intensity-strip");
      if (!strip) return;
      const metric = row.dataset.metric;
      const key = row.querySelector(".filter-avail-btn")?.dataset.key;
      const isOn = key ? S._filterAvail[key] : false;
      if (isOn && metric) {
        strip.style.background = S._matchedColorMode === "pop" ? _buildPopGradientCSS() : _buildMetricGradientCSS(metric);
        strip.style.display = "inline-block";
      } else {
        strip.style.display = "none";
      }
    });
  }
  function _activeIntensityMetric() {
    if (S._heatmapMetric) return S._heatmapMetric;
    const availKey = Object.keys(S._filterAvail).find((k) => S._filterAvail[k]);
    if (availKey) return AVAIL_TO_METRIC[availKey] || null;
    const valKey = Object.keys(S._filterValue).find((k) => S._filterValue[k] !== null);
    return valKey ? VALUE_TO_METRIC[valKey] || null : null;
  }
  function _computeP95(metric) {
    if (S._heatNormP95[metric]) return;
    const vals = S.allCities.map((c) => _cityMetricValue(c, metric)).filter((v) => v > 0);
    if (!vals.length) {
      S._heatNormP95[metric] = 1;
      return;
    }
    vals.sort((a, b) => a - b);
    S._heatNormP95[metric] = vals[Math.floor(vals.length * 0.95)] || vals[vals.length - 1];
  }
  function _heatGradient(metric) {
    const stops = _getPaletteStops(metric);
    const g = {};
    for (const [t, c] of stops) g[t] = c;
    return g;
  }
  function toUSD(value, currency) {
    if (!value || !currency) return 0;
    const rate = S.fxRates[(currency + "").toUpperCase()];
    return rate ? value * rate : 0;
  }
  function toggleFxSidebar() {
    const el = document.getElementById("fx-sidebar");
    const opening = !el.classList.contains("open");
    el.classList.toggle("open", opening);
    if (opening) {
      _fxRenderList();
      _mobileBackdropOn();
    } else {
      _mobileBackdropOff();
    }
  }
  function _fxSaveToLS() {
    try {
      const date = document.getElementById("fx-date")?.value || "latest";
      localStorage.setItem(LS_FX_KEY, JSON.stringify({ date, rates: S.fxRates }));
    } catch (_) {
    }
  }
  function _fxLoadFromLS() {
    try {
      const raw = localStorage.getItem(LS_FX_KEY);
      if (!raw) return false;
      const { date, rates } = JSON.parse(raw);
      if (rates && typeof rates === "object") {
        Object.assign(S.fxRates, rates);
        const dateEl = document.getElementById("fx-date");
        if (dateEl && date && date !== "latest") dateEl.value = date;
        return true;
      }
    } catch (_) {
    }
    return false;
  }
  async function fxFetchRates() {
    const date = document.getElementById("fx-date")?.value || "latest";
    const statusEl = document.getElementById("fx-status");
    const btn = document.getElementById("fx-fetch-btn");
    statusEl.textContent = "\u23F3 Fetching\u2026";
    if (btn) btn.disabled = true;
    try {
      const apiDate = date || "latest";
      const res = await fetch(`/api/fx?date=${encodeURIComponent(apiDate)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.rates) throw new Error("No rates in response");
      for (const [cur, val] of Object.entries(json.rates)) {
        if (val > 0) S.fxRates[cur.toUpperCase()] = 1 / val;
      }
      const returnedDate = json.date || apiDate;
      const dateEl = document.getElementById("fx-date");
      if (dateEl) dateEl.value = returnedDate;
      statusEl.textContent = `\u2713 ECB rates \xB7 ${returnedDate}`;
      statusEl.style.color = "#3fb950";
      _fxSaveToLS();
      _fxRenderList();
      _fxApplyRates();
    } catch (e) {
      statusEl.textContent = `\u2717 ${e.message}`;
      statusEl.style.color = "#f85149";
    } finally {
      if (btn) btn.disabled = false;
    }
  }
  function fxResetDefaults() {
    S.fxRates = { ...FX_TO_USD };
    localStorage.removeItem(LS_FX_KEY);
    const statusEl = document.getElementById("fx-status");
    if (statusEl) {
      statusEl.textContent = "Reset to built-in rates";
      statusEl.style.color = "#8b949e";
    }
    const dateEl = document.getElementById("fx-date");
    if (dateEl) dateEl.value = "2025-01-02";
    _fxRenderList();
    _fxApplyRates();
  }
  function fxInputChanged(cur, val) {
    const n = parseFloat(val);
    if (!n || n <= 0) return;
    S.fxRates[cur] = n;
    _fxSaveToLS();
    _fxApplyRates();
  }
  function _fxRenderList() {
    const list = document.getElementById("fx-list");
    if (!list) return;
    const curs = Object.keys(FX_TO_USD).filter((c) => c !== "USD").sort();
    list.innerHTML = curs.map((cur) => {
      const rate = S.fxRates[cur] ?? FX_TO_USD[cur];
      const def = FX_TO_USD[cur];
      const diff = Math.abs(rate - def) / def;
      const modified = diff > 1e-3;
      const perUSD = rate > 0 ? 1 / rate : 0;
      const dispPerUSD = perUSD >= 1e3 ? perUSD.toFixed(0) : perUSD >= 10 ? perUSD.toFixed(2) : perUSD >= 1 ? perUSD.toFixed(3) : perUSD.toPrecision(3);
      return `<div class="fx-row${modified ? " fx-modified" : ""}">
      <span class="fx-cur">${cur}</span>
      <span class="fx-label">${FX_LABELS[cur] || ""}</span>
      <input class="fx-input" type="number" step="any" min="0"
        value="${rate.toPrecision(4)}"
        title="1 ${cur} = X USD"
        onchange="fxInputChanged('${cur}', this.value)" />
      <span class="fx-per-usd">${dispPerUSD}<span class="fx-per-usd-unit">/USD</span></span>
    </div>`;
    }).join("");
  }
  function _fxApplyRates() {
    if (S.econOn) buildEconLayer();
    if (S.corpCityQid) renderCorpList();
    const gPanel = document.getElementById("global-corp-panel");
    if (gPanel && gPanel.classList.contains("panel-open")) renderGlobalCorpList();
  }
  function loadEdits() {
    if (S._editsCache !== null) return S._editsCache;
    try {
      S._editsCache = JSON.parse(localStorage.getItem(LS_EDITS) || "{}");
    } catch {
      S._editsCache = {};
    }
    return S._editsCache;
  }
  function loadDeleted() {
    try {
      return new Set(JSON.parse(localStorage.getItem(LS_DELETED) || "[]"));
    } catch {
      return /* @__PURE__ */ new Set();
    }
  }
  function saveEditsStore(edits) {
    localStorage.setItem(LS_EDITS, JSON.stringify(edits));
    S._editsCache = null;
  }
  function saveDeletedStore(del) {
    localStorage.setItem(LS_DELETED, JSON.stringify([...del]));
  }
  function migrateEditKeys(cities) {
    const coordToQid = /* @__PURE__ */ new Map();
    for (const c of cities) {
      if (c.qid) coordToQid.set(c.lat + "," + c.lng, c.qid);
    }
    const edits = loadEdits();
    const editKeys = Object.keys(edits);
    const oldEditKeys = editKeys.filter((k) => /^-?\d/.test(k) && k.includes(","));
    if (oldEditKeys.length > 0) {
      const migrated = {};
      let count = 0;
      for (const [k, v] of Object.entries(edits)) {
        const newKey = /^-?\d/.test(k) && k.includes(",") ? coordToQid.get(k) ?? null : k;
        if (newKey) {
          migrated[newKey] = v;
          count++;
        }
      }
      saveEditsStore(migrated);
      console.log(`[init] Migrated ${count} city edits to QID keys`);
    }
    const deleted = loadDeleted();
    const oldDelKeys = [...deleted].filter((k) => /^-?\d/.test(k) && k.includes(","));
    if (oldDelKeys.length > 0) {
      const migrated = /* @__PURE__ */ new Set();
      for (const k of deleted) {
        const newKey = /^-?\d/.test(k) && k.includes(",") ? coordToQid.get(k) ?? null : k;
        if (newKey) migrated.add(newKey);
      }
      saveDeletedStore(migrated);
      console.log(`[init] Migrated ${oldDelKeys.length} deleted-city entries to QID keys`);
    }
  }
  function applyOverrides() {
    const edits = loadEdits();
    const deleted = loadDeleted();
    S.allCities = S.rawCities.filter((c) => !deleted.has(c._key)).map((c) => {
      const ov = edits[c._key];
      return ov ? { ...c, ...ov } : c;
    });
    S.cityByQid = new Map(S.allCities.map((c) => [c.qid, c]));
    const hasChanges = Object.keys(edits).length > 0 || deleted.size > 0;
    document.getElementById("reset-all-btn").style.display = hasChanges ? "" : "none";
  }
  function rebuildMapLayer() {
    if (S.wikiLayer) S.map.removeLayer(S.wikiLayer);
    S.wikiLayer = L.layerGroup();
    let _filterMatchCount = 0;
    const filterActive = _anyFilterActive();
    const heatActive = !!S._heatmapMetric;
    const intensityMetric = S._matchedColorMode === "metric" ? _activeIntensityMetric() : null;
    if (intensityMetric) _computeP95(intensityMetric);
    S.allCities.forEach(function(city) {
      let affected = true;
      if (filterActive || heatActive) {
        const passesFilter = !filterActive || applyMapFilters(city) === "match";
        const hasMetric = !heatActive || _cityHasMetricData(city, S._heatmapMetric);
        affected = passesFilter && hasMetric;
      }
      let color, opacity, markerWeight;
      const radius = wikiCityRadius(city.pop);
      if (!filterActive && !heatActive) {
        const aqCol = S.cityAqMode ? airQualityDotColor(city) : null;
        const censusCol = aqCol ? null : censusDotColor(city);
        color = aqCol || censusCol || wikiCityColor(city.pop);
        opacity = aqCol || censusCol ? 0.92 : wikiCityOpacity(city.pop);
        markerWeight = 0.5;
        _filterMatchCount++;
      } else if (affected) {
        _filterMatchCount++;
        if (S._matchedVisMode === "hide") return;
        if (S._matchedVisMode === "dim") {
          markerWeight = 0.5;
          if (intensityMetric) {
            color = _metricDotColor(city, intensityMetric);
            opacity = 0.35;
          } else {
            color = "#484f58";
            opacity = 0.2;
          }
        } else {
          markerWeight = 1.5;
          opacity = Math.max(0.85, wikiCityOpacity(city.pop));
          if (intensityMetric) {
            color = _metricDotColor(city, intensityMetric);
          } else {
            const valueCol = filterActive ? _valueFilterColor(city) : null;
            const aqCol = !valueCol && S.cityAqMode ? airQualityDotColor(city) : null;
            const censusCol = !valueCol && !aqCol ? censusDotColor(city) : null;
            color = valueCol || aqCol || censusCol || wikiCityColor(city.pop);
            if (aqCol || censusCol) opacity = 0.92;
          }
        }
      } else {
        if (S._otherShowMode === "hide") return;
        if (S._otherShowMode === "dim") {
          color = "#30363d";
          opacity = 0.13;
          markerWeight = 0.5;
        } else {
          markerWeight = 0.5;
          if (S._otherColorMode === "ghost") {
            color = "#30363d";
            opacity = 0.2;
          } else {
            const aqCol = S.cityAqMode ? airQualityDotColor(city) : null;
            const censusCol = aqCol ? null : censusDotColor(city);
            color = aqCol || censusCol || wikiCityColor(city.pop);
            opacity = aqCol || censusCol ? 0.92 : wikiCityOpacity(city.pop);
          }
        }
      }
      const location = [city.admin, city.country].filter(Boolean).join(", ");
      let tip = `<strong>${escHtml(city.name)}</strong>`;
      if (location) tip += `<br/><span style="color:var(--text-secondary);font-size:0.8em">${escHtml(location)}</span>`;
      if (city.desc) tip += `<br/><span style="color:var(--text-body);font-size:0.8em;font-style:italic">${escHtml(city.desc)}</span>`;
      tip += `<br/>Population: <strong>${fmtPop(city.pop)}</strong>`;
      if (S.cityAqMode && city.qid) {
        const aq = S.airQualityData[city.qid];
        if (aq) tip += `<br/><span style="color:${color};font-weight:600">${aq.pm25} \xB5g/m\xB3 PM2.5</span> <span style="color:var(--text-secondary);font-size:0.8em">(${escHtml(aq.category)}, ${aq.year})</span>`;
        else tip += `<br/><span style="color:var(--text-muted);font-size:0.8em">No PM2.5 data</span>`;
      }
      if (city.qid) {
        const coCount = S.companiesData[city.qid]?.length || 0;
        const coLabel = coCount > 0 ? `Corporations (${coCount})` : "Corporations";
        tip += `<br/><span style="display:flex;gap:10px;margin-top:3px">`;
        tip += `<a href="#" onclick="event.preventDefault();openWikiSidebar('${city.qid}','${escAttr(city.name)}')" style="color:var(--accent);font-size:0.8em">Wikipedia \u2197</a>`;
        tip += `<a href="#" onclick="event.preventDefault();openCorpPanel('${city.qid}','${escAttr(city.name)}')" style="color:var(--purple);font-size:0.8em">${coLabel} \u2197</a>`;
        tip += `</span>`;
      }
      L.circleMarker([city.lat, city.lng], {
        radius,
        fillColor: color,
        fillOpacity: opacity,
        color,
        opacity,
        weight: markerWeight,
        pane: "cityPane"
      }).bindPopup(tip, { maxWidth: 260, minWidth: 160 }).addTo(S.wikiLayer);
    });
    S.wikiLayer.addTo(S.map);
    _updateDotControls();
    const matchEl = document.getElementById("filter-match-count");
    const totalEl = document.getElementById("filter-total-count");
    if (matchEl) matchEl.textContent = _anyFilterActive() ? _filterMatchCount.toLocaleString() : S.allCities.length.toLocaleString();
    if (totalEl) totalEl.textContent = _anyFilterActive() ? `of ${S.allCities.length.toLocaleString()}` : "";
  }
  function updateStats() {
    const cities = S.allCities;
    const total = cities.reduce((s, c) => s + (c.pop || 0), 0);
    document.getElementById("stat-count").textContent = cities.length.toLocaleString();
    document.getElementById("stat-largest").textContent = cities[0] ? cities[0].name + " (" + (cities[0].pop / 1e6).toFixed(1) + "M)" : "\u2014";
    document.getElementById("stat-total").textContent = (total / 1e9).toFixed(2) + "B";
    document.getElementById("wiki-legend-title").textContent = cities.length.toLocaleString() + " cities on S.map \xB7 circle size and color = population";
  }
  function applyFilters() {
    const search = document.getElementById("f-search").value.trim().toLowerCase();
    const country = document.getElementById("f-country").value;
    const minPop = parseInt(document.getElementById("f-minpop").value) || 0;
    const [col, dir] = document.getElementById("f-sort").value.split("-");
    S.sortCol = col;
    S.sortDir = dir;
    updateSortHeaders();
    S.filtered = S.allCities.filter((c) => {
      if (search && !(c.name || "").toLowerCase().includes(search)) return false;
      if (country && c.country !== country) return false;
      if (minPop && (c.pop || 0) < minPop) return false;
      return true;
    });
    sortFiltered();
    S.visibleCount = PAGE_SIZE;
    renderRows();
  }
  function sortFiltered() {
    S.filtered.sort((a, b) => {
      let av, bv;
      if (S.sortCol === "pop") {
        av = a.pop ?? -Infinity;
        bv = b.pop ?? -Infinity;
      } else if (S.sortCol === "name") {
        av = a.name ?? "";
        bv = b.name ?? "";
      } else if (S.sortCol === "country") {
        av = a.country ?? "";
        bv = b.country ?? "";
      } else if (S.sortCol === "founded") {
        av = a.founded ?? (S.sortDir === "asc" ? Infinity : -Infinity);
        bv = b.founded ?? (S.sortDir === "asc" ? Infinity : -Infinity);
      } else return 0;
      if (typeof av === "string") return S.sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return S.sortDir === "asc" ? av - bv : bv - av;
    });
  }
  function updateSortHeaders() {
    document.querySelectorAll("thead th[data-col]").forEach((th) => {
      th.classList.remove("sort-asc", "sort-desc");
      if (th.dataset.col === S.sortCol) th.classList.add("sort-" + S.sortDir);
    });
  }
  async function switchListTab(tab) {
    const citiesPanel = document.getElementById("list-panel");
    const corpsPanel = document.getElementById("global-corp-panel");
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      if (tab === "corps") {
        if (corpsPanel.classList.contains("panel-open")) {
          corpsPanel.classList.remove("panel-open");
          corpsPanel.style.display = "none";
          _mobileBackdropOff();
          document.querySelectorAll(".list-tab").forEach((b) => b.classList.remove("active"));
          return;
        }
        citiesPanel.style.display = "none";
        citiesPanel.classList.remove("panel-open");
        if (!S.globalCorpList.length) {
          await _companiesLoader.ensure();
          buildGlobalCorpList();
        }
        corpsPanel.style.display = "";
        corpsPanel.classList.add("panel-open");
        _mobileBackdropOn();
        document.querySelectorAll(".list-tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === "corps"));
      } else {
        if (citiesPanel.classList.contains("panel-open")) {
          citiesPanel.style.display = "none";
          citiesPanel.classList.remove("panel-open");
          _mobileBackdropOff();
          document.querySelectorAll(".list-tab").forEach((b) => b.classList.remove("active"));
          return;
        }
        corpsPanel.classList.remove("panel-open");
        corpsPanel.style.display = "none";
        citiesPanel.style.display = "";
        citiesPanel.classList.add("panel-open");
        _mobileBackdropOn();
        document.querySelectorAll(".list-tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === "cities"));
      }
      return;
    }
    if (tab === "corps") {
      if (corpsPanel.classList.contains("panel-open")) {
        closeGlobalCorpPanel();
        return;
      }
      if (!S.globalCorpList.length) {
        await _companiesLoader.ensure();
        buildGlobalCorpList();
      }
      corpsPanel.style.display = "";
      corpsPanel.classList.add("panel-open");
      document.querySelectorAll(".list-tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === "corps"));
    } else {
      closeGlobalCorpPanel();
      citiesPanel.style.display = "";
      document.querySelectorAll(".list-tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === "cities"));
    }
  }
  function closeGlobalCorpPanel() {
    const corpsPanel = document.getElementById("global-corp-panel");
    if (corpsPanel) {
      corpsPanel.classList.remove("panel-open");
      corpsPanel.style.display = "none";
    }
    document.querySelectorAll(".list-tab").forEach((b) => b.classList.remove("active"));
  }
  function renderRows() {
    const edits = loadEdits();
    const tbody = document.getElementById("list-body");
    const slice = S.filtered.slice(0, S.visibleCount);
    const hasMore = S.filtered.length > S.visibleCount;
    tbody.innerHTML = slice.map((city) => {
      const color = wikiCityColor(city.pop);
      const isEdited = !!edits[city._key];
      const rowClass = isEdited ? "edited-row" : "";
      const key = escAttr(city._key);
      return `<tr class="${rowClass}" onclick="flyTo(${city.lat},${city.lng})">
      <td class="city-dot"><span class="dot" style="background:${color}"></span></td>
      <td class="city-edit" onclick="event.stopPropagation()">
        <button class="edit-btn" onclick="openModal('${key}')">\u270E</button>
      </td>
      <td class="city-name">${escHtml(city.name)}${isEdited ? ' <span style="color:#f97316;font-size:0.75em" title="Locally edited">\u270E</span>' : ""}</td>
      <td>${escHtml(city.country || "\u2014")}</td>
      <td>${escHtml(city.admin || "\u2014")}</td>
      <td class="city-pop">${fmtPop(city.pop)}</td>
      <td>${fmtNum(city.area_km2)}</td>
      <td>${city.founded != null ? city.founded : "\u2014"}</td>
      <td>${escHtml(city.timezone || "\u2014")}</td>
      <td>${city.qid ? `<a href="https://www.wikidata.org/wiki/Special:GoToLinkedPage/enwiki/${city.qid}" target="_blank" style="color:var(--accent);font-size:0.8em;text-decoration:none" title="Open Wikipedia article">\u2197 Wiki</a>` : "\u2014"}</td>
    </tr>`;
    }).join("");
    document.getElementById("list-meta-text").textContent = `Showing ${Math.min(S.visibleCount, S.filtered.length).toLocaleString()} of ${S.filtered.length.toLocaleString()} cities`;
    const moreRow = document.getElementById("load-more-row");
    moreRow.style.display = hasMore ? "" : "none";
    if (hasMore) {
      document.getElementById("load-more-btn").textContent = `Show more (${(S.filtered.length - S.visibleCount).toLocaleString()} remaining)`;
    }
  }
  function flyTo(lat, lng) {
    S.map.flyTo([lat, lng], 10, { duration: 1.2 });
    document.getElementById("map-wrapper").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function openModal(key) {
    const city = S.allCities.find((c) => c._key === key);
    if (!city) return;
    S.editingKey = key;
    document.getElementById("modal-title").textContent = `Edit \u2014 ${city.name}`;
    document.getElementById("e-name").value = city.name ?? "";
    document.getElementById("e-pop").value = city.pop ?? "";
    document.getElementById("e-country").value = city.country ?? "";
    document.getElementById("e-admin").value = city.admin ?? "";
    document.getElementById("e-desc").value = city.desc ?? "";
    document.getElementById("e-area").value = city.area_km2 ?? "";
    document.getElementById("e-founded").value = city.founded ?? "";
    document.getElementById("e-lat").value = city.lat;
    document.getElementById("e-lng").value = city.lng;
    document.getElementById("e-timezone").value = city.timezone ?? "";
    document.getElementById("edit-modal").classList.add("open");
  }
  function closeModal() {
    document.getElementById("edit-modal").classList.remove("open");
    S.editingKey = null;
  }
  function saveEdit() {
    if (!S.editingKey) return;
    const edits = loadEdits();
    const numOrNull = (v) => v === "" ? null : Number(v);
    edits[S.editingKey] = {
      name: document.getElementById("e-name").value.trim() || void 0,
      pop: numOrNull(document.getElementById("e-pop").value),
      country: document.getElementById("e-country").value.trim() || null,
      admin: document.getElementById("e-admin").value.trim() || null,
      desc: document.getElementById("e-desc").value.trim() || null,
      area_km2: numOrNull(document.getElementById("e-area").value),
      founded: numOrNull(document.getElementById("e-founded").value),
      lat: Number(document.getElementById("e-lat").value),
      lng: Number(document.getElementById("e-lng").value),
      timezone: document.getElementById("e-timezone").value.trim() || null
    };
    Object.keys(edits[S.editingKey]).forEach((k) => {
      if (edits[S.editingKey][k] === void 0) delete edits[S.editingKey][k];
    });
    saveEditsStore(edits);
    closeModal();
    refresh();
  }
  function deleteCity() {
    if (!S.editingKey) return;
    if (!confirm("Remove this city from the S.map and list? (You can reset all edits later.)")) return;
    const deleted = loadDeleted();
    deleted.add(S.editingKey);
    saveDeletedStore(deleted);
    const edits = loadEdits();
    delete edits[S.editingKey];
    saveEditsStore(edits);
    closeModal();
    refresh();
  }
  function resetAll() {
    if (!confirm("Reset all your edits and deletions? The original dataset will be restored.")) return;
    localStorage.removeItem(LS_EDITS);
    S._editsCache = null;
    localStorage.removeItem(LS_DELETED);
    refresh();
  }
  function refresh() {
    applyOverrides();
    rebuildMapLayer();
    updateStats();
    populateCountryFilter();
    applyFilters();
  }
  function initHeaderSort() {
    document.querySelectorAll("thead th[data-col]").forEach((th) => {
      th.addEventListener("click", function() {
        const col = this.dataset.col;
        if (S.sortCol === col) {
          S.sortDir = S.sortDir === "asc" ? "desc" : "asc";
        } else {
          S.sortCol = col;
          S.sortDir = col === "name" || col === "country" ? "asc" : "desc";
        }
        const selectVal = `${S.sortCol}-${S.sortDir}`;
        const sel = document.getElementById("f-sort");
        for (const opt of sel.options) {
          if (opt.value === selectVal) {
            sel.value = selectVal;
            break;
          }
        }
        updateSortHeaders();
        sortFiltered();
        S.visibleCount = PAGE_SIZE;
        renderRows();
      });
    });
  }
  function populateCountryFilter() {
    const sel = document.getElementById("f-country");
    const current = sel.value;
    const countries = [...new Set(S.allCities.map((c) => c.country).filter(Boolean))].sort();
    sel.innerHTML = '<option value="">All countries</option>';
    countries.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      if (c === current) opt.selected = true;
      sel.appendChild(opt);
    });
  }
  function openLightbox(images, idx) {
    S.lightboxImages = images;
    S.lightboxIdx = idx;
    document.getElementById("wiki-lightbox").classList.add("open");
    renderLightboxFrame();
  }
  function openCarouselLightbox() {
    openLightbox(window._lbImgs, S.carIdx);
  }
  function closeLightbox() {
    document.getElementById("wiki-lightbox").classList.remove("open");
  }
  function lightboxNav(dir) {
    S.lightboxIdx = (S.lightboxIdx + dir + S.lightboxImages.length) % S.lightboxImages.length;
    renderLightboxFrame();
  }
  function renderLightboxFrame() {
    document.getElementById("lightbox-img").src = S.lightboxImages[S.lightboxIdx];
    document.getElementById("lightbox-counter").textContent = S.lightboxImages.length > 1 ? `${S.lightboxIdx + 1} / ${S.lightboxImages.length}` : "";
    document.getElementById("lightbox-prev").style.display = S.lightboxImages.length > 1 ? "" : "none";
    document.getElementById("lightbox-next").style.display = S.lightboxImages.length > 1 ? "" : "none";
  }
  function carStart(images) {
    S.carImages = images;
    S.carIdx = 0;
    clearInterval(S.carTimer);
    if (images.length > 1) S.carTimer = setInterval(() => carGo(1), 4500);
  }
  function carStop() {
    clearInterval(S.carTimer);
    S.carTimer = null;
  }
  function carResume() {
    if (S.carImages.length > 1) S.carTimer = setInterval(() => carGo(1), 4500);
  }
  function carGo(dir) {
    S.carIdx = (S.carIdx + dir + S.carImages.length) % S.carImages.length;
    carRender();
  }
  function carJump(i) {
    S.carIdx = i;
    carRender();
    carStop();
    if (S.carImages.length > 1) S.carTimer = setInterval(() => carGo(1), 4500);
  }
  function carRender() {
    const img = document.getElementById("wiki-car-img");
    const counter = document.getElementById("wiki-car-counter");
    if (!img) return;
    img.classList.add("fade");
    setTimeout(() => {
      img.src = S.carImages[S.carIdx];
      img.classList.remove("fade");
    }, 180);
    if (counter) counter.textContent = `${S.carIdx + 1} / ${S.carImages.length}`;
    document.querySelectorAll(".wiki-car-dot").forEach((d, i) => d.classList.toggle("active", i === S.carIdx));
  }
  function closeWikiSidebar() {
    carStop();
    document.getElementById("wiki-sidebar").classList.remove("open");
    closeStatsPanel();
    _mobileBackdropOff();
    _updateHash();
  }
  function closeStatsPanel() {
    const _sp = document.getElementById("stats-panel");
    if (_sp) {
      _sp.classList.remove("open");
      _sp.style.right = "";
    }
    _mobileBackdropOff();
    document.querySelectorAll(".census-stat-clickable.stats-active, .info-chip-clickable.stats-active").forEach((el) => el.classList.remove("stats-active"));
    S._activeStatMetric = null;
    S._statsCurrent = null;
    S._statsPoints = [];
  }
  function setStatsScope(scope) {
    S._statsScope = scope;
    if (S._statsCurrent) _renderStatsPanel();
  }
  function openStatsPanel(metric, qid) {
    if (S._activeStatMetric === metric + ":" + qid) {
      closeStatsPanel();
      return;
    }
    S._activeStatMetric = metric + ":" + qid;
    S._statsCurrent = { metric, qid };
    _renderStatsPanel();
    var radarPane = metric.indexOf("wb_energy_") === 0 ? "energy" : null;
    if (radarPane) {
      var btn = document.querySelector('.cp-radar-tab[onclick*="' + radarPane + '"]');
      if (btn && !btn.classList.contains("cp-radar-tab-active")) _switchRadarTab(btn, radarPane);
    }
  }
  function _renderStatsPanel() {
    const { metric, qid } = S._statsCurrent;
    const censusDef = STAT_DEFS[metric];
    const cityDef = CITY_STAT_DEFS[metric];
    const wbDef = WB_STAT_DEFS[metric];
    const eurostatDef = EUROSTAT_STAT_DEFS[metric];
    const japanDef = JAPAN_PREF_STAT_DEFS[metric];
    const corpDef = CORP_STAT_DEFS[metric];
    const def = censusDef || cityDef || wbDef || eurostatDef || japanDef || corpDef;
    if (!def) return;
    const isCityStat = !!cityDef;
    const isWbStat = !!wbDef;
    const isEurostatStat = !!eurostatDef;
    const isJapanPrefStat = !!japanDef;
    const isCorpStat = !!corpDef;
    document.querySelectorAll(".census-stat-clickable.stats-active, .info-chip-clickable.stats-active, .wb-chip-clickable.stats-active").forEach((el) => el.classList.remove("stats-active"));
    document.querySelectorAll(`[onclick*="openStatsPanel('${metric}'"]`).forEach((el) => el.classList.add("stats-active"));
    const selfCity = isWbStat ? null : S.cityByQid.get(qid);
    const selfIso = isWbStat ? qid : selfCity?.iso || "";
    const selfState = selfCity?.admin || "";
    const selfCountry = isWbStat ? S.countryData[qid]?.name || qid : selfCity?.country || selfIso;
    const points = [];
    if (isWbStat) {
      if (wbDef.src === "oecd") {
        for (const [iso2, odata] of Object.entries(S.oecdData)) {
          if (!odata) continue;
          const rawVal = odata[wbDef.key];
          if (rawVal == null || isNaN(rawVal)) continue;
          const cdata = S.countryData[iso2];
          points.push({ qid: iso2, val: rawVal, name: cdata && cdata.name || iso2, region: cdata && cdata.region || "", iso: iso2 });
        }
      } else if (wbDef.src === "eci") {
        for (const [iso2, edata] of Object.entries(S.eciData)) {
          if (!edata) continue;
          const rawVal = edata[wbDef.key];
          if (rawVal == null || isNaN(rawVal)) continue;
          const cdata = S.countryData[iso2];
          points.push({ qid: iso2, val: rawVal, name: cdata && cdata.name || iso2, region: cdata && cdata.region || "", iso: iso2 });
        }
      } else {
        for (const [iso2, cdata] of Object.entries(S.countryData)) {
          if (!cdata || !cdata.region || cdata.region === "Aggregates") continue;
          const rawVal = cdata[wbDef.key];
          if (rawVal == null || isNaN(rawVal)) continue;
          points.push({ qid: iso2, val: rawVal, name: cdata.name || iso2, region: cdata.region || "", iso: iso2 });
        }
      }
    } else if (isCityStat) {
      const pool = S._statsScope === "country" && selfIso ? S.allCities.filter((c) => c.iso === selfIso) : S.allCities;
      for (const c of pool) {
        const val = def.key(c);
        if (val == null || isNaN(val)) continue;
        points.push({ qid: c.qid, val, name: c.name, state: c.admin || "", iso: c.iso || "", country: c.country || "" });
      }
    } else if (isJapanPrefStat) {
      const jpCities = S.allCities.filter((c) => c.iso === "JP");
      const prefRepCity = {};
      for (const c of jpCities) {
        const match = _lookupJapanPref(c);
        if (!match) continue;
        const existing = prefRepCity[match.name];
        if (!existing || (c.pop || 0) > (existing.pop || 0)) prefRepCity[match.name] = c;
      }
      for (const [prefName, data] of Object.entries(S.japanPrefData)) {
        const val = data[japanDef.key];
        if (val == null || isNaN(val)) continue;
        const repCity = prefRepCity[prefName];
        if (!repCity) continue;
        points.push({ qid: repCity.qid, val, name: prefName, state: "Japan", iso: "JP", country: "Japan", prefName });
      }
    } else if (isEurostatStat) {
      for (const [cqid, data] of Object.entries(S.eurostatCities)) {
        if (!data) continue;
        const val = data[eurostatDef.key];
        if (val == null || isNaN(val)) continue;
        const city = S.cityByQid.get(cqid);
        if (!city) continue;
        points.push({ qid: cqid, val, name: city.name, state: data.country || city.iso || "", iso: city.iso || "", country: city.country || city.iso || "" });
      }
    } else if (isCorpStat) {
      for (const arr of Object.values(S.companiesData)) {
        for (const co of arr) {
          if (!co.qid) continue;
          const val = corpDef.key(co);
          if (val == null || isNaN(val) || val <= 0) continue;
          points.push({ qid: co.qid, val, name: co.name, state: co.industry || "", iso: "", country: co.exchange || "" });
        }
      }
    } else {
      const src = def.src === "acs" ? S.censusCities : S.censusBusiness;
      for (const [cqid, data] of Object.entries(src)) {
        if (!data) continue;
        const val = typeof def.key === "function" ? def.key(data) : data[def.key];
        if (val == null || isNaN(val)) continue;
        const city = S.cityByQid.get(cqid);
        if (!city) continue;
        points.push({ qid: cqid, val, name: city.name, state: city.admin || "", iso: "US", country: "United States" });
      }
    }
    if (!points.length) return;
    const ascending = def.higherBetter === false;
    points.sort((a, b) => ascending ? a.val - b.val : b.val - a.val);
    points.forEach((p, i) => {
      p.rank = i + 1;
    });
    const selfJapanPref = isJapanPrefStat ? _lookupJapanPref(selfCity)?.name : null;
    const entityIdx = isWbStat ? points.findIndex((p) => p.qid === selfIso) : isJapanPrefStat ? points.findIndex((p) => p.prefName === selfJapanPref) : points.findIndex((p) => p.qid === qid);
    if (entityIdx < 0) {
      closeStatsPanel();
      return;
    }
    const cp = points[entityIdx];
    S._statsPoints = points;
    S._statsWinStart = Math.max(0, entityIdx - 5);
    S._statsWinEnd = Math.min(points.length - 1, entityIdx + 5);
    let subRank = 0, subTotal = 0, subLabel = "";
    if (isWbStat && cp.region) {
      const regionPts = points.filter((p) => p.region === cp.region);
      subRank = regionPts.findIndex((p) => p.qid === cp.qid) + 1;
      subTotal = regionPts.length;
      subLabel = cp.region;
    } else if (isEurostatStat && selfIso) {
      const countryPts = points.filter((p) => p.iso === selfIso);
      subRank = countryPts.findIndex((p) => p.qid === qid) + 1;
      subTotal = countryPts.length;
      subLabel = selfCountry || selfIso;
    } else if (isCityStat && S._statsScope === "world" && selfIso) {
      const countryPts = points.filter((p) => p.iso === selfIso);
      subRank = countryPts.findIndex((p) => p.qid === qid) + 1;
      subTotal = countryPts.length;
      subLabel = selfCountry;
    } else if (!isCityStat && !isWbStat && !isEurostatStat && selfState) {
      const statePts = points.filter((p) => p.state === selfState);
      subRank = statePts.findIndex((p) => p.qid === qid) + 1;
      subTotal = statePts.length;
      subLabel = selfState;
    }
    const vals = points.map((p) => p.val);
    const minV = Math.min(...vals), maxV = Math.max(...vals);
    const BUCKETS = 14;
    const bSize = (maxV - minV) / BUCKETS || 1;
    const counts = Array(BUCKETS).fill(0);
    const entityBkt = Math.min(BUCKETS - 1, Math.floor((cp.val - minV) / bSize));
    for (const { val } of points) counts[Math.min(BUCKETS - 1, Math.floor((val - minV) / bSize))]++;
    const maxCnt = Math.max(...counts, 1);
    const HW = 262, HH = 56, HPAD = 2;
    const bw = (HW - HPAD * 2) / BUCKETS;
    const histBars = counts.map((cnt, i) => {
      const bh = Math.max(2, cnt / maxCnt * (HH - HPAD * 2));
      const x = HPAD + i * bw, y = HH - HPAD - bh;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 1).toFixed(1)}" height="${bh.toFixed(1)}" rx="1.5"
      fill="${i === entityBkt ? "#f0a500" : "#2a8ee8"}" opacity="${i === entityBkt ? 1 : 0.45}"/>`;
    }).join("");
    const markerX = HPAD + (entityBkt + 0.5) * bw;
    const histSvg = `<svg viewBox="0 0 ${HW} ${HH + 14}" width="${HW}" height="${HH + 14}" style="display:block">
    ${histBars}
    <line x1="${markerX.toFixed(1)}" y1="0" x2="${markerX.toFixed(1)}" y2="${HH}" stroke="#f0a500" stroke-width="1.5" stroke-dasharray="3 2"/>
    <text x="${HPAD}" y="${HH + 11}" font-size="7" fill="#6e7681" text-anchor="start">${def.fmt(minV)}</text>
    <text x="${HW / 2}" y="${HH + 11}" font-size="7" fill="#6e7681" text-anchor="middle">${def.fmt((minV + maxV) / 2)}</text>
    <text x="${HW - HPAD}" y="${HH + 11}" font-size="7" fill="#6e7681" text-anchor="end">${def.fmt(maxV)}</text>
  </svg>`;
    const note = def.higherBetter === true ? "\u2191 higher ranked = higher value" : def.higherBetter === false ? "\u2191 higher ranked = lower value" : "";
    const primaryLabel = isWbStat ? "countries worldwide" : isJapanPrefStat ? "Japanese prefectures" : isEurostatStat ? "European cities (Eurostat)" : isCityStat ? S._statsScope === "world" ? "worldwide" : escHtml(selfCountry) : isCorpStat ? "companies worldwide" : "US cities with Census data";
    const scopeToggle = isCityStat ? `
    <div id="stats-scope-row">
      <button class="stats-scope-btn${S._statsScope === "world" ? " active" : ""}" onclick="setStatsScope('world')">\u{1F30D} World</button>
      <button class="stats-scope-btn${S._statsScope === "country" ? " active" : ""}" onclick="setStatsScope('country')"
        >\u{1F4CD} ${escHtml(selfCountry)}</button>
    </div>` : "";
    let trendChartHtml = "";
    if (isJapanPrefStat && selfCity) {
      const jpMatch = _lookupJapanPref(selfCity);
      const histKey = metric === "japan_perCapitaIncome" ? "perCapitaIncomeHistory" : "gdpHistory";
      const history2 = jpMatch?.data?.[histKey];
      if (history2 && history2.length >= 2) {
        const TW = 262, TH = 54, TPAD = 4;
        const xs = history2.map(([y]) => y);
        const vs = history2.map(([, v]) => v);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minVt = Math.min(...vs), maxVt = Math.max(...vs);
        const rangeV = maxVt - minVt || 1;
        const toX = (x) => TPAD + (x - minX) / (maxX - minX || 1) * (TW - TPAD * 2);
        const toY = (v) => TH - TPAD - (v - minVt) / rangeV * (TH - TPAD * 2);
        const pts = history2.map(([x, v]) => `${toX(x).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");
        const dots = history2.map(([x, v]) => `<circle cx="${toX(x).toFixed(1)}" cy="${toY(v).toFixed(1)}" r="1.8" fill="#f0a500" opacity="0.7"/>`).join("");
        const firstLbl = `${xs[0]}: ${def.fmt(vs[0])}`;
        const lastLbl = `${xs[xs.length - 1]}: ${def.fmt(vs[vs.length - 1])}`;
        trendChartHtml = `<div class="stats-trend-wrap">
        <svg viewBox="0 0 ${TW} ${TH + 16}" width="${TW}" height="${TH + 16}" style="display:block">
          <polyline points="${pts}" fill="none" stroke="#58a6ff" stroke-width="1.8" stroke-linejoin="round" opacity="0.85"/>
          ${dots}
          <text x="${TPAD}" y="${TH + 13}" font-size="7" fill="#6e7681">${escHtml(firstLbl)}</text>
          <text x="${TW - TPAD}" y="${TH + 13}" font-size="7" fill="#f0a500" text-anchor="end">${escHtml(lastLbl)}</text>
        </svg>
      </div>`;
      }
    } else if (isEurostatStat && eurostatDef.histKey) {
      const esRecord = S.eurostatCities[qid];
      const history2 = esRecord?.[eurostatDef.histKey];
      if (history2 && history2.length >= 2) {
        const TW = 262, TH = 54, TPAD = 4;
        const xs = history2.map(([y]) => y);
        const vs = history2.map(([, v]) => v);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minV2 = Math.min(...vs), maxV2 = Math.max(...vs);
        const rangeV = maxV2 - minV2 || 1;
        const toX = (x) => TPAD + (x - minX) / (maxX - minX || 1) * (TW - TPAD * 2);
        const toY = (v) => TH - TPAD - (v - minV2) / rangeV * (TH - TPAD * 2);
        const pts = history2.map(([x, v]) => `${toX(x).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");
        const dots = history2.map(([x, v]) => `<circle cx="${toX(x).toFixed(1)}" cy="${toY(v).toFixed(1)}" r="1.8" fill="#f0a500" opacity="0.7"/>`).join("");
        const firstLbl = `${xs[0]}: ${def.fmt(vs[0])}`;
        const lastLbl = `${xs[xs.length - 1]}: ${def.fmt(vs[vs.length - 1])}`;
        trendChartHtml = `<div class="stats-trend-wrap">
        <svg viewBox="0 0 ${TW} ${TH + 16}" width="${TW}" height="${TH + 16}" style="display:block">
          <polyline points="${pts}" fill="none" stroke="#58a6ff" stroke-width="1.8" stroke-linejoin="round" opacity="0.85"/>
          ${dots}
          <text x="${TPAD}" y="${TH + 13}" font-size="7" fill="#6e7681">${escHtml(firstLbl)}</text>
          <text x="${TW - TPAD}" y="${TH + 13}" font-size="7" fill="#f0a500" text-anchor="end">${escHtml(lastLbl)}</text>
        </svg>
      </div>`;
      }
    }
    document.getElementById("stats-panel-title").textContent = def.label;
    document.getElementById("stats-panel-city").textContent = cp.name + (selfState || !isWbStat && selfCountry ? " \xB7 " + (selfState || selfCountry) : "");
    document.getElementById("stats-panel-body").innerHTML = `
    ${scopeToggle}
    ${trendChartHtml}
    <div class="stats-hist-wrap">${histSvg}</div>
    <div class="stats-ranks">
      <div class="stats-rank-badge">
        <span class="stats-rank-n">#${cp.rank} / ${points.length}</span>
        <span class="stats-rank-lbl">${primaryLabel}</span>
      </div>
      ${subRank > 0 ? `<div class="stats-rank-badge">
        <span class="stats-rank-n">#${subRank} / ${subTotal}</span>
        <span class="stats-rank-lbl">${escHtml(subLabel)}</span>
      </div>` : ""}
    </div>
    ${note ? `<div class="stats-note">${note}</div>` : ""}
    <div id="stats-rank-list-wrap" class="stats-rank-list"></div>
    <div class="stats-source">${points.length} ${primaryLabel}</div>
    <div class="stats-source-attr">${_statSourceAttr(metric)}</div>
  `;
    const _sp = document.getElementById("stats-panel");
    const _wikiOpen = document.getElementById("wiki-sidebar")?.classList.contains("open");
    const _corpOpen = document.getElementById("corp-panel")?.classList.contains("open");
    const _cpOpen = document.getElementById("country-panel")?.classList.contains("open");
    const _baseRight = _cpOpen ? 600 : _wikiOpen && _corpOpen ? 880 : _corpOpen ? 460 : 420;
    _sp.style.right = _baseRight + "px";
    _sp.classList.add("open");
    _mobileBackdropOn();
    _updateStatsListHtml();
  }
  function _updateStatsListHtml() {
    const metric = S._statsCurrent?.metric;
    const def = STAT_DEFS[metric] || CITY_STAT_DEFS[metric] || WB_STAT_DEFS[metric] || EUROSTAT_STAT_DEFS[metric] || JAPAN_PREF_STAT_DEFS[metric];
    const listEl = document.getElementById("stats-rank-list-wrap");
    if (!listEl || !def || !S._statsPoints.length) return;
    const { qid } = S._statsCurrent;
    const isWbStat = !!WB_STAT_DEFS[metric];
    const isJapanPrefStat = !!JAPAN_PREF_STAT_DEFS[metric];
    const curId = isWbStat ? S._statsCurrent.qid : qid;
    const aboveCount = S._statsWinStart;
    const belowCount = S._statsPoints.length - 1 - S._statsWinEnd;
    const jpSelfCity = isJapanPrefStat ? S.cityByQid.get(qid) : null;
    const jpSelfPref = isJapanPrefStat ? _lookupJapanPref(jpSelfCity)?.name : null;
    const rows = S._statsPoints.slice(S._statsWinStart, S._statsWinEnd + 1).map((p) => {
      const isCur = isJapanPrefStat ? p.prefName === jpSelfPref : p.qid === curId;
      const navFn = isWbStat ? `statsGoToCountry('${p.qid}')` : `statsGoToCity('${p.qid}')`;
      const sub = isWbStat ? "" : p.state ? ` \xB7 ${escHtml(p.state)}` : "";
      return `<div class="stats-rank-row${isCur ? " stats-rank-current" : ""}" onclick="${navFn}">
      <span class="stats-rank-num">#${p.rank}</span>
      <span class="stats-rank-name">${escHtml(p.name)}<span class="stats-rank-sub">${sub}</span></span>
      <span class="stats-rank-val">${def.fmt(p.val)}</span>
    </div>`;
    }).join("");
    listEl.innerHTML = `
    ${aboveCount > 0 ? `<button class="stats-rank-more" onclick="statsExpandUp()">\u25B2 ${aboveCount.toLocaleString()} more above</button>` : ""}
    ${rows}
    ${belowCount > 0 ? `<button class="stats-rank-more" onclick="statsExpandDown()">\u25BC ${belowCount.toLocaleString()} more below</button>` : ""}
  `;
    listEl.querySelector(".stats-rank-current")?.scrollIntoView({ block: "nearest" });
  }
  function statsExpandUp() {
    S._statsWinStart = Math.max(0, S._statsWinStart - STATS_WIN);
    _updateStatsListHtml();
    document.getElementById("stats-rank-list-wrap")?.scrollTo({ top: 0 });
  }
  function statsExpandDown() {
    S._statsWinEnd = Math.min(S._statsPoints.length - 1, S._statsWinEnd + STATS_WIN);
    _updateStatsListHtml();
  }
  function statsGoToCity(qid) {
    const city = S.cityByQid.get(qid);
    if (!city || city.lat == null) return;
    S.map.flyTo([city.lat, city.lng], Math.max(S.map.getZoom(), 5), { duration: 1 });
    openWikiSidebar(qid, city.name);
    if (S._statsCurrent && S._statsCurrent.qid !== qid) openStatsPanel(S._statsCurrent.metric, qid);
  }
  function statsGoToCountry(iso2) {
    const pt = CAPITAL_COORDS[iso2] || countryCentroids[iso2];
    if (pt) S.map.flyTo(pt, Math.max(S.map.getZoom(), 4), { duration: 1 });
    if (S._statsCurrent && S._statsCurrent.qid !== iso2) openStatsPanel(S._statsCurrent.metric, iso2);
    if (typeof openCountryPanel === "function" && S.countryData[iso2]) openCountryPanel(iso2);
  }
  function switchWikiTab(tab) {
    if (!VALID_SIDEBAR_TABS.has(tab)) tab = "info";
    S._sidebarTab = tab;
    ["info", "economy", "finance", "overview"].forEach((t) => {
      const el = document.getElementById(`wiki-tab-${t}`);
      if (el) el.style.display = t === tab ? "" : "none";
    });
    document.querySelectorAll(".wiki-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    });
    const body = document.getElementById("wiki-sidebar-body");
    if (body) body.scrollTop = 0;
    if (tab === "finance") {
      const finEl = document.getElementById("wiki-tab-finance");
      if (finEl?._iycRedraw) requestAnimationFrame(finEl._iycRedraw);
    }
  }
  function renderInfobox(city, images, wpExtra, wpUrl, fromCache) {
    const body = document.getElementById("wiki-sidebar-body");
    const footer = document.getElementById("wiki-sidebar-footer");
    let carouselHtml = "";
    if (images && images.length > 0) {
      window._lbImgs = images;
      const dots = images.map(
        (_, i) => `<button class="wiki-car-dot${i === 0 ? " active" : ""}" onclick="carJump(${i})"></button>`
      ).join("");
      carouselHtml = `
      <div class="wiki-carousel"
           onmouseenter="carStop()"
           onmouseleave="carResume()">
        <img id="wiki-car-img" class="wiki-carousel-img"
             src="${escHtml(images[0])}"
             onclick="openCarouselLightbox()" alt="" />
        ${images.length > 1 ? `
          <div class="wiki-car-overlay">
            <button class="wiki-car-btn" onclick="carGo(-1)">&#8249;</button>
            <div class="wiki-car-dots">${dots}</div>
            <button class="wiki-car-btn" onclick="carGo(1)">&#8250;</button>
          </div>
          <div class="wiki-car-counter" id="wiki-car-counter">1 / ${images.length}</div>
        ` : ""}
      </div>`;
    }
    function row(label, val, isHtml) {
      if (val == null || val === "") return "";
      const cellVal = isHtml ? val : escHtml(String(val));
      return `<tr>
      <td class="wiki-info-label">${escHtml(label)}</td>
      <td class="wiki-info-val">${cellVal}</td>
    </tr>`;
    }
    const density = city.pop && city.area_km2 ? Math.round(city.pop / city.area_km2).toLocaleString() + " /km\xB2" : null;
    const foundedFmt = city.founded != null ? city.founded < 0 ? Math.abs(city.founded) + " BC" : city.founded.toString() : null;
    const websiteHtml = city.website ? `<a href="${escHtml(city.website)}" target="_blank" rel="noopener">${escHtml(city.website.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</a>` : null;
    const sistersHtml = city.sister_cities && city.sister_cities.length ? escHtml(city.sister_cities.slice(0, 8).join(", ")) + (city.sister_cities.length > 8 ? ` <span style="color:var(--text-faint)">+${city.sister_cities.length - 8} more</span>` : "") : null;
    const coordsFmt = city.lat != null ? `${Math.abs(city.lat).toFixed(4)}\xB0${city.lat >= 0 ? "N" : "S"}, ${Math.abs(city.lng).toFixed(4)}\xB0${city.lng >= 0 ? "E" : "W"}` : null;
    const gdpHtml = wpExtra && wpExtra.gdp ? `${wpExtra.gdp} <span style="color:var(--text-faint);font-size:0.75em">(local currency)</span>` : null;
    const hdi = wpExtra && wpExtra.hdi ? wpExtra.hdi.toFixed(3) : null;
    const nicknamesArr = city.nicknames && city.nicknames.length ? city.nicknames : wpExtra && wpExtra.nickname ? [wpExtra.nickname] : null;
    const nicknamesHtml = nicknamesArr ? nicknamesArr.map((n) => escHtml(n)).join("<br>") : null;
    const leadersHtml = city.leaders && city.leaders.length ? city.leaders.map(
      (l) => `<tr><td class="wiki-info-label">${escHtml(l.title)}</td><td class="wiki-info-val">${escHtml(l.name)}</td></tr>`
    ).join("") : "";
    const popMetroFmt = city.pop_metro != null ? fmtNum(city.pop_metro) : null;
    const popUrbanFmt = city.pop_urban != null ? fmtNum(city.pop_urban) : null;
    const popAsOf = city.pop_as_of ? ` <span style="color:var(--text-muted);font-size:0.72em">${city.pop_as_of}</span>` : "";
    function section(title, rowArr) {
      const content = rowArr.join("");
      if (!content.trim()) return "";
      return `<tr><td colspan="2" class="wiki-info-section-head">${title}</td></tr>${content}`;
    }
    const geonamesHtml = city.geonames_id ? `<a href="https://www.geonames.org/${escHtml(String(city.geonames_id))}" target="_blank" rel="noopener">${escHtml(String(city.geonames_id))}</a>` : null;
    const tzFmt = city.timezone ? city.utc_offset ? `${escHtml(city.timezone)} (${escHtml(city.utc_offset)})` : escHtml(city.timezone) : city.utc_offset ? escHtml(city.utc_offset) : null;
    function infoChip(label, val, isHtml = false, span2 = false, cityMetric = "") {
      if (!val && val !== 0) return "";
      const v = isHtml ? val : escHtml(String(val));
      const extraCls = cityMetric ? " info-chip-clickable" : "";
      const extraAttr = cityMetric ? ` onclick="openStatsPanel('${cityMetric}','${escHtml(city.qid)}')" title="Click to see world ranking"` : "";
      return `<div class="info-chip${span2 ? " info-chip-wide" : ""}${extraCls}"${extraAttr}><div class="info-chip-lbl">${label}</div><div class="info-chip-val">${v}</div></div>`;
    }
    const infoChips = `<div class="info-chips">
    ${city.pop != null ? infoChip("Population", fmtNum(city.pop) + (popAsOf ? ' <span class="info-chip-dim">' + popAsOf.replace(/<[^>]+>/g, "").trim() + "</span>" : ""), true, false, "pop") : ""}
    ${city.country ? infoChip("Country", city.country) : ""}
    ${city.admin ? infoChip("Region", city.admin) : ""}
    ${city.settlement_type ? infoChip("Type", city.settlement_type) : ""}
    ${city.iso ? infoChip("ISO", city.iso) : ""}
    ${tzFmt ? infoChip("Timezone", tzFmt, true) : ""}
    ${coordsFmt ? infoChip("Coords", coordsFmt) : ""}
    ${city.elev_m != null ? infoChip("Elevation", fmtNum(city.elev_m) + " m", false, false, "elev_m") : ""}
    ${popMetroFmt ? infoChip("Metro pop", popMetroFmt, false, false, "pop_metro") : ""}
    ${popUrbanFmt ? infoChip("Urban pop", popUrbanFmt) : ""}
    ${density ? infoChip("Density", density, false, false, "density") : ""}
    ${city.area_km2 != null ? infoChip("Area", fmtNum(city.area_km2) + " km\xB2", false, false, "area_km2") : ""}
    ${foundedFmt ? infoChip("Founded", foundedFmt, false, false, "founded") : ""}
    ${nicknamesHtml ? infoChip("Known as", nicknamesHtml, true, true) : ""}
    ${gdpHtml ? infoChip("City GDP", gdpHtml, true) : ""}
    ${hdi ? infoChip("HDI", hdi) : ""}
    ${(() => {
      const g = S.gawcCities[city.qid];
      if (!g) return "";
      const col = GAWC_TIER_COLOR[g.tier] || "#8b949e";
      return infoChip("World City", `<span class="gawc-tier-chip" style="background:${col}22;color:${col};border:1px solid ${col}55">${escHtml(g.tier)}</span>`, true, false, "gawc_score");
    })()}
    ${(() => {
      const a = S.airportData[city.qid];
      if (!a) return "";
      return infoChip("Airport", `<span style="color:var(--accent);font-weight:600">\u2708 ${fmtNum(a.directDestinations)}</span> <span style="color:var(--text-secondary);font-size:0.78em">direct routes \xB7 ${escHtml(a.iata)}</span>`, true, false, "directDestinations");
    })()}
    ${(() => {
      const p = S.portData[city.qid];
      if (!p) return "";
      return infoChip("Port", `<span style="color:var(--accent);font-weight:600">\u2693 ${p.teu_millions}M TEU</span> <span style="color:var(--text-secondary);font-size:0.78em">${escHtml(p.port)}</span> <span style="color:var(--text-muted);font-size:0.72em">#${p.rank} globally</span>`, true, false, "port_teu");
    })()}
    ${(() => {
      const t = S.tourismData[city.qid];
      if (!t) return "";
      return infoChip("Tourism", `<span style="color:var(--gold);font-weight:600">${t.visitors_millions}M</span> <span style="color:var(--text-secondary);font-size:0.78em">visitors/yr</span> <span style="color:var(--text-muted);font-size:0.72em">#${t.rank} globally \xB7 ${t.year}</span>`, true, false, "tourism_visitors");
    })()}
    ${(() => {
      const pt = S.patentData[city.qid];
      if (!pt) return "";
      return infoChip("Patents", `<span style="color:var(--purple);font-weight:600">${fmtNum(pt.patents_annual)}</span> <span style="color:var(--text-secondary);font-size:0.78em">patents/yr</span> <span style="color:var(--text-faint);font-size:0.72em">${(pt.top_fields || []).slice(0, 2).join(", ")}</span>`, true, false, "patents_annual");
    })()}
    ${(() => {
      const cl = S.colData[city.qid];
      if (!cl) return "";
      return infoChip("Cost of Living", `<span style="color:var(--univ-gold);font-weight:600">${cl.col_index}</span> <span style="color:var(--text-secondary);font-size:0.78em">CoL index</span> <span style="color:var(--text-faint);font-size:0.72em">Rent:${cl.rent_index} Groc:${cl.grocery_index} Rest:${cl.restaurant_index}</span> <span style="color:var(--text-muted);font-size:0.72em">#${cl.col_rank} globally</span>`, true, false, "col_index");
    })()}
    ${(() => {
      const su = S.startupData[city.qid];
      if (!su) return "";
      return infoChip("Startups", `<span style="color:var(--purple);font-weight:600">\u{1F984} ${su.unicorns}</span> <span style="color:var(--text-secondary);font-size:0.78em">unicorns</span> <span style="color:var(--success);font-size:0.78em">$${su.total_funding_bn}B</span> <span style="color:var(--text-secondary);font-size:0.78em">funding</span> <span style="color:var(--text-muted);font-size:0.72em">#${su.ecosystem_rank} globally</span>`, true, false, "startup_unicorns");
    })()}
    ${(() => {
      const aq = S.airQualityData[city.qid];
      if (!aq) return "";
      const AQ_COL = { "Good": "#3fb950", "Acceptable": "#58a6ff", "Moderate": "#f0a500", "Poor": "#ffa657", "Very Poor": "#f85149", "Severe": "#bc8cff" };
      const col = AQ_COL[aq.category] || "#8b949e";
      const badge = `<span style="background:${col}22;color:${col};border:1px solid ${col}55;border-radius:4px;padding:1px 5px;font-size:0.75em;font-weight:600">${escHtml(aq.category)}</span>`;
      return infoChip("Air Quality", `<span style="color:${col};font-weight:700">${aq.pm25}</span><span style="color:var(--text-secondary);font-size:0.78em"> \xB5g/m\xB3 PM2.5</span> ${badge} <span style="color:var(--text-muted);font-size:0.72em">${aq.year}</span>`, true, false, "who_pm25");
    })()}
    ${(() => {
      const m = S.metroTransitData[city.qid];
      if (!m) return "";
      const mr = S.metroData[city.qid];
      const parts = [];
      if (mr && mr.ridership_millions) parts.push(`<span style="color:var(--accent);font-weight:600">${fmtNum(mr.ridership_millions)}M</span><span style="color:var(--text-secondary);font-size:0.78em"> riders/yr</span>`);
      if (m.lines) parts.push(`<span style="color:var(--text-primary);font-weight:600">${m.lines}</span><span style="color:var(--text-secondary);font-size:0.78em"> lines</span>`);
      if (m.stations) parts.push(`<span style="color:var(--text-primary);font-weight:600">${m.stations}</span><span style="color:var(--text-secondary);font-size:0.78em"> stations</span>`);
      if (m.opened) parts.push(`<span style="color:var(--text-muted);font-size:0.72em">since ${m.opened}</span>`);
      return infoChip("Metro", `\u{1F687} ${parts.join(" \xB7 ")} <span style="color:var(--text-secondary);font-size:0.73em">${escHtml(m.name)}</span>`, true, false, "metroStations");
    })()}
    ${(() => {
      const n = S.nobelCitiesData[city.qid];
      if (!n) return "";
      const cats = Object.entries(n.byPrize || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span title="${escHtml(k)}" style="font-size:0.8em">${v}\xD7${escHtml(k.slice(0, 3))}</span>`).join(" ");
      return infoChip("Nobels", `<span style="color:var(--gold);font-weight:700">${n.total}</span> <span style="color:var(--text-secondary);font-size:0.78em">laureates</span> <span style="color:var(--text-faint);font-size:0.76em">(${cats})</span>`, true, false, "nobelLaureates");
    })()}
    ${(() => {
      const p = S.powerData[city.qid];
      if (!p) return "";
      const fuelIcon = { "Hydro": "\u{1F4A7}", "Nuclear": "\u2622\uFE0F", "Coal": "\u26AB", "Gas": "\u{1F525}", "Oil": "\u{1F6E2}\uFE0F", "Solar": "\u2600\uFE0F", "Wind": "\u{1F32C}\uFE0F", "Biomass": "\u{1F33F}", "Geothermal": "\u{1F30B}", "Waste": "\u{1F5D1}\uFE0F" };
      const icon = fuelIcon[p.primary_fuel] || "\u26A1";
      const capStr = p.total_capacity_mw >= 1e3 ? `${(p.total_capacity_mw / 1e3).toFixed(1)} GW` : `${Math.round(p.total_capacity_mw)} MW`;
      return infoChip("Energy", `<span style="color:var(--accent);font-weight:600">${icon} ${capStr}</span> <span style="color:var(--text-secondary);font-size:0.78em">${p.count} plant${p.count > 1 ? "s" : ""}</span> <span style="color:var(--text-muted);font-size:0.72em">${p.primary_fuel || "mixed"}</span>`, true, false, "");
    })()}
    ${(() => {
      const ca = climateAnnual(getCityClimate(city));
      if (!ca) return "";
      const tempCol = ca.avgTemp > 25 ? "#ffa657" : ca.avgTemp > 15 ? "#3fb950" : ca.avgTemp > 5 ? "#58a6ff" : "#a5d6ff";
      const hotCl = ca.hottestTemp > 30 ? "#f85149" : ca.hottestTemp > 22 ? "#ffa657" : "#f0a500";
      const coldCl = ca.coldestTemp < 0 ? "#a5d6ff" : ca.coldestTemp < 8 ? "#79c0ff" : "#58a6ff";
      let out = "";
      out += infoChip("Avg Temp", `<span style="color:${tempCol};font-weight:600">${ca.avgTemp.toFixed(1)}\xB0C</span>`, true, false, "annualAvgTemp");
      out += infoChip("Hot/Cold", `<span style="color:${hotCl};font-weight:600">${ca.hottestTemp.toFixed(1)}\xB0C</span> <span style="color:var(--text-faint)">/</span> <span style="color:${coldCl};font-weight:600">${ca.coldestTemp.toFixed(1)}\xB0C</span>`, true, false, "hottestMonthTemp");
      out += infoChip("Rainfall", `<span style="color:#79c0ff;font-weight:600">${fmtNum(Math.round(ca.precipMm))}</span><span style="color:var(--text-secondary);font-size:0.78em"> mm/yr</span>`, true, false, "annualPrecipMm");
      if (ca.sunHours != null) out += infoChip("Sunshine", `<span style="color:var(--gold);font-weight:600">${fmtNum(Math.round(ca.sunHours))}</span><span style="color:var(--text-secondary);font-size:0.78em"> hrs/yr</span>`, true, false, "annualSunHours");
      return out;
    })()}
  </div>`;
    const govSec = leadersHtml ? `<tr><td colspan="2" class="wiki-info-section-head">Government</td></tr>${leadersHtml}` : "";
    const linksSec = section("Links", [
      row("Website", websiteHtml, !!websiteHtml),
      row("Sister cities", sistersHtml, !!sistersHtml),
      row("GeoNames", geonamesHtml, !!geonamesHtml)
    ]);
    const wb = city.iso ? S.countryData[city.iso] : null;
    function wbChip(label, key, fmt, wbMetric) {
      if (!wb || wb[key] == null) return "";
      const yr = wb[key + "_year"] ? ` <span class="wb-chip-yr">${wb[key + "_year"]}</span>` : "";
      const extra = wbMetric && city.iso ? ` wb-chip-clickable" onclick="openStatsPanel('${wbMetric}','${escHtml(city.iso)}')" title="Click to see country rankings"` : `"`;
      return `<div class="wb-chip${extra}><div class="wb-chip-lbl">${label}</div><div class="wb-chip-val">${escHtml(fmt(wb[key]))}${yr}</div></div>`;
    }
    const wbSec = wb ? `<tr><td colspan="2" class="wiki-info-section-head">Country \xB7 ${escHtml(wb.name || city.country || city.iso)} <span style="color:var(--text-muted);font-size:0.75em">(World Bank)</span></td></tr>
    <tr><td colspan="2" class="wb-chips-row">
      <div class="wb-chips">
        ${wbChip("GDP/cap", "gdp_per_capita", (v) => "$" + Math.round(v).toLocaleString(), "wb_gdp_per_capita")}
        ${wbChip("Life exp.", "life_expectancy", (v) => v.toFixed(1) + " yr", "wb_life_expectancy")}
        ${wbChip("Urban", "urban_pct", (v) => v.toFixed(1) + "%", "wb_urban_pct")}
        ${wbChip("Internet", "internet_pct", (v) => v.toFixed(1) + "%", "wb_internet_pct")}
        ${wbChip("Gini", "gini", (v) => v.toFixed(1), "wb_gini")}
        ${wbChip("Literacy", "literacy_rate", (v) => v.toFixed(1) + "%", "wb_literacy_rate")}
        ${wbChip("Child mort.", "child_mortality", (v) => v.toFixed(1) + "/1k", "wb_child_mortality")}
        ${wbChip("Electric.", "electricity_pct", (v) => v.toFixed(1) + "%", "wb_electricity_pct")}
        ${wbChip("PM2.5", "pm25", (v) => v.toFixed(1) + " \u03BCg/m\xB3", "wb_pm25")}
        ${wbChip("Forest", "forest_pct", (v) => v.toFixed(1) + "%", "wb_forest_pct")}
        ${wbChip("Air deaths", "air_death_rate", (v) => v.toFixed(1) + "/100k", "wb_air_death_rate")}
        ${wbChip("Road deaths", "road_death_rate", (v) => v.toFixed(1) + "/100k", "wb_road_death_rate")}
        ${wb.income_level ? `<div class="wb-chip wb-chip-full"><div class="wb-chip-lbl">Income level</div><div class="wb-chip-val">${escHtml(wb.income_level)}</div></div>` : ""}
        ${(() => {
      const e = city.iso ? S.eciData[city.iso] : null;
      if (!e) return "";
      const col = e.eci > 1.5 ? "#3fb950" : e.eci > 0.5 ? "#58a6ff" : e.eci > -0.5 ? "#f0a500" : "#f85149";
      return `<div class="wb-chip wb-chip-clickable" onclick="openStatsPanel('eci','${escHtml(city.iso)}')" title="Economic Complexity Index \u2014 click for country ranking"><div class="wb-chip-lbl">Complexity (ECI)</div><div class="wb-chip-val" style="color:${col}">${e.eci > 0 ? "+" : ""}${e.eci.toFixed(2)} <span class="wb-chip-yr">${e.year}</span></div></div>`;
    })()}
      </div>
    </td></tr>` : "";
    const climateHtml = (() => {
      const cl = getCityClimate(city);
      if (!cl || !cl.months || !cl.months.length) return "";
      const mons = cl.months;
      const hasTemp = mons.some((m) => m.high_c != null || m.low_c != null);
      const hasPrec = mons.some((m) => m.precipitation_mm != null);
      const hasMean = mons.some((m) => m.mean_c != null);
      if (!hasTemp && !hasPrec) return "";
      const MON_ABB = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
      const MON_MED = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const MON_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      const LP = 30, RP = hasPrec ? 26 : 4, TP = 16, BP = 18;
      const CW = 204, CH = 94;
      const TW = LP + CW + RP, TH = TP + CH + BP;
      const barW = Math.floor(CW / 12) - 1;
      const allTemps = mons.flatMap((m) => [m.high_c, m.low_c, m.mean_c].filter((v) => v != null));
      const tMinRaw = allTemps.length ? Math.min(...allTemps) : 0;
      const tMaxRaw = allTemps.length ? Math.max(...allTemps) : 30;
      const tPad = Math.max((tMaxRaw - tMinRaw) * 0.12, 2);
      const tMin = Math.floor((tMinRaw - tPad) / 5) * 5;
      const tMax = Math.ceil((tMaxRaw + tPad) / 5) * 5;
      const tRange = tMax - tMin || 1;
      const tY = (v) => v == null ? null : TP + CH - Math.round((v - tMin) / tRange * CH);
      const allPrec = mons.map((m) => m.precipitation_mm || 0);
      const pMaxRaw = Math.max(...allPrec, 1);
      const pAxisMax = Math.ceil(pMaxRaw / 50) * 50;
      const pBarH = (v) => Math.round(v / pAxisMax * CH);
      const tStep = tMax - tMin <= 20 ? 5 : tMax - tMin <= 45 ? 10 : 20;
      const tTicks = [];
      for (let t = Math.ceil(tMin / tStep) * tStep; t <= tMax; t += tStep) tTicks.push(t);
      const pStep = pAxisMax <= 100 ? 50 : pAxisMax <= 400 ? 100 : 200;
      const pTicks = [];
      for (let p = pStep; p < pAxisMax; p += pStep) pTicks.push(p);
      const svgGrid = tTicks.map((t) => {
        const y = tY(t), zero = t === 0;
        return `<line x1="${LP}" y1="${y}" x2="${LP + CW}" y2="${y}"
        stroke="${zero ? "#388bfd" : "#21262d"}" stroke-width="${zero ? 1.2 : 0.7}"
        stroke-dasharray="${zero ? "3 2" : "4 3"}"/>`;
      }).join("");
      const svgAxes = `
      <line x1="${LP}" y1="${TP}" x2="${LP}" y2="${TP + CH}" stroke="#30363d" stroke-width="1.2"/>
      <line x1="${LP}" y1="${TP + CH}" x2="${LP + CW}" y2="${TP + CH}" stroke="#30363d" stroke-width="1.2"/>
      ${hasPrec ? `<line x1="${LP + CW}" y1="${TP}" x2="${LP + CW}" y2="${TP + CH}" stroke="#1e3a5f" stroke-width="0.9"/>` : ""}`;
      const svgTLabels = tTicks.map((t) => {
        const y = tY(t), zero = t === 0;
        return `<text x="${LP - 4}" y="${y + 3}" text-anchor="end" font-size="7.5"
        fill="${zero ? "#58a6ff" : "#6e7681"}">${t > 0 ? "+" : ""}${t}\xB0</text>`;
      }).join("");
      const svgPLabels = hasPrec ? pTicks.map((p) => {
        const y = TP + CH - pBarH(p);
        if (y < TP + 6 || y > TP + CH - 6) return "";
        return `<text x="${LP + CW + 4}" y="${y + 3}" text-anchor="start" font-size="7" fill="#3b82f6aa">${p}</text>`;
      }).join("") : "";
      const svgUnits = `
      <text x="${LP - 4}" y="${TP - 4}" text-anchor="end" font-size="7" fill="#484f58">\xB0C</text>
      ${hasPrec ? `<text x="${LP + CW + 4}" y="${TP - 4}" text-anchor="start" font-size="7" fill="#1f4d8e">mm</text>` : ""}`;
      const svgCols = mons.map((m, i) => {
        const x = LP + i * (barW + 1);
        const cx = x + Math.floor(barW / 2);
        let bars = "";
        if (hasPrec && m.precipitation_mm != null) {
          const bh = pBarH(m.precipitation_mm);
          const by = TP + CH - bh;
          bars += `<rect x="${x}" y="${by}" width="${barW}" height="${bh}" fill="#1f6feb" opacity="0.28" rx="1"/>`;
          const pv = Math.round(m.precipitation_mm);
          if (bh >= 16) {
            bars += `<text x="${cx}" y="${by + bh - 3}" text-anchor="middle" font-size="6.5" fill="#58a6ff" opacity="0.95">${pv}</text>`;
          } else if (bh >= 3) {
            bars += `<text x="${cx}" y="${by - 2}" text-anchor="middle" font-size="6" fill="#3b82f6" opacity="0.8">${pv}</text>`;
          }
        }
        if (m.high_c != null) {
          const y1 = tY(m.high_c);
          const y2 = m.low_c != null ? tY(m.low_c) : y1 + 4;
          bars += `<rect x="${x + 1}" y="${y1}" width="${barW - 2}" height="${Math.max(y2 - y1, 2)}" fill="#f78166" opacity="0.82" rx="1"/>`;
          const labelVal = m.mean_c ?? m.high_c;
          const lSign = labelVal > 0 ? "+" : "";
          bars += `<text x="${cx}" y="${y1 - 3}" text-anchor="middle" font-size="7" fill="#ffa07a" font-weight="600">${lSign}${labelVal}\xB0</text>`;
        }
        const tip = [
          MON_FULL[i],
          m.high_c != null ? `\u2191 ${m.high_c > 0 ? "+" : ""}${m.high_c}\xB0C` : null,
          m.low_c != null ? `\u2193 ${m.low_c > 0 ? "+" : ""}${m.low_c}\xB0C` : null,
          m.mean_c != null ? `\u2248 ${m.mean_c > 0 ? "+" : ""}${m.mean_c}\xB0C` : null,
          m.precipitation_mm != null ? `\u{1F4A7} ${m.precipitation_mm} mm` : null,
          m.sun != null ? `\u2600 ${m.sun} hrs` : null
        ].filter(Boolean).join("\n");
        return `<g class="climate-col">
        <title>${escHtml(tip)}</title>
        <rect class="climate-col-bg" x="${x}" y="${TP}" width="${barW}" height="${CH}" rx="1"/>
        ${bars}
        <text class="climate-mon-abbr" x="${cx}" y="${TP + CH + 13}" text-anchor="middle" font-size="8" fill="#8b949e">${MON_ABB[i]}</text>
        <text class="climate-mon-full" x="${cx}" y="${TP + CH + 13}" text-anchor="middle" font-size="7" fill="#c9d1d9" font-weight="600">${MON_MED[i]}</text>
      </g>`;
      }).join("");
      let meanSvg = "";
      if (hasMean) {
        const pts = mons.map((m, i) => {
          if (m.mean_c == null) return null;
          return `${LP + i * (barW + 1) + Math.floor(barW / 2)},${tY(m.mean_c)}`;
        }).filter(Boolean);
        if (pts.length > 1) {
          meanSvg = `<path d="M${pts.join("L")}" fill="none" stroke="#ffa657" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" opacity="0.9" pointer-events="none"/>`;
          meanSvg += pts.map((p) => `<circle cx="${p.split(",")[0]}" cy="${p.split(",")[1]}" r="2" fill="#ffa657" opacity="0.9" pointer-events="none"/>`).join("");
        }
      }
      const legend = [
        hasTemp ? `<span><span class="clim-swatch" style="background:#f78166;opacity:0.85"></span>Hi/Lo \xB0C</span>` : "",
        hasMean ? `<span><span class="clim-line-swatch"></span>Mean</span>` : "",
        hasPrec ? `<span><span class="clim-swatch" style="background:#1f6feb;opacity:0.45"></span>Precip mm</span>` : ""
      ].filter(Boolean).join("");
      const sourceLabel = cl.location ? `<div style="font-size:0.63rem;color:var(--text-muted);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(cl.location)}</div>` : "";
      return `
      <div class="wiki-climate-wrap">
        <div class="wiki-climate-head">Climate <span style="font-size:0.65rem;color:var(--text-muted);font-weight:400">\xB7 hover for details</span></div>
        <svg viewBox="0 0 ${TW} ${TH}" width="100%" style="display:block;overflow:visible">
          ${svgGrid}${svgAxes}${svgTLabels}${svgPLabels}${svgUnits}
          ${svgCols}
          ${meanSvg}
        </svg>
        <div class="clim-legend">${legend}</div>
        ${sourceLabel}
      </div>`;
    })();
    const wpExtract = wpExtra && wpExtra.extract ? wpExtra.extract : null;
    const extractHtml = wpExtract ? `
    <div class="wiki-extract-wrap">
      <div class="wiki-extract-head">Overview</div>
      <div class="wiki-extract collapsed" id="wiki-extract-text">${escHtml(wpExtract)}</div>
      <button class="wiki-expand-btn" id="wiki-expand-btn" onclick="toggleExtract()">Show more</button>
    </div>` : "";
    const censusData = city.iso === "US" ? getCensusData(city) : null;
    const businessData = city.iso === "US" ? S.censusBusiness[city.qid] || null : null;
    const eurostatData = S.eurostatCities[city.qid] || null;
    const japanPref = city.iso === "JP" ? _lookupJapanPref(city) : null;
    const hasCensus = !!(censusData || businessData);
    const hasEurostat = !!eurostatData;
    const hasJapan = !!japanPref;
    const hasEconomy = hasCensus || hasEurostat || hasJapan;
    const econBtnEl = document.getElementById("wiki-tab-economy-btn");
    if (econBtnEl) {
      econBtnEl.style.display = hasEconomy ? "" : "none";
      econBtnEl.textContent = hasCensus ? "Census" : hasEurostat ? "Eurostat" : "Prefecture";
    }
    if (!VALID_SIDEBAR_TABS.has(S._sidebarTab) || S._sidebarTab === "economy" && !hasEconomy) S._sidebarTab = "info";
    const infoEl = document.getElementById("wiki-tab-info");
    const economyEl = document.getElementById("wiki-tab-economy");
    const overviewEl = document.getElementById("wiki-tab-overview");
    const regionInfo = _getRegionData(city);
    const regionHtml = regionInfo ? _buildRegionHtml(regionInfo) : "";
    const univList = S.universitiesData[city.qid] || [];
    const univHtml = univList.length ? (function() {
      const rows = univList.slice(0, 20).map((u) => {
        const foundedStr = u.founded ? `<span class="univ-meta">est. ${u.founded}</span>` : "";
        const studentsStr = u.students ? `<span class="univ-meta">${fmtNum(u.students)} students</span>` : "";
        const rk = S.uniRankings[u.qid];
        const rankBadge = rk ? `<span class="univ-rank">${rk.qs_rank <= 50 ? "\u{1F3C6}" : ""} QS#${rk.qs_rank} THE#${rk.the_rank}</span>` : "";
        const meta = [foundedStr, studentsStr].filter(Boolean).join(" \xB7 ");
        return `<li class="univ-item"><span class="univ-name">${escHtml(u.name)}</span>${rankBadge}${meta ? `<br><span class="univ-detail">${meta}</span>` : ""}</li>`;
      }).join("");
      const more = univList.length > 20 ? `<li class="univ-more">+${univList.length - 20} more</li>` : "";
      return `<div class="univ-section"><div class="univ-header">Universities &amp; Research Institutions <span class="univ-count">${univList.length}</span></div><ul class="univ-list">${rows}${more}</ul></div>`;
    })() : "";
    if (infoEl) {
      infoEl.innerHTML = `
      ${carouselHtml}
      <div class="wiki-city-header">
        <div class="wiki-city-name">${escHtml(city.name)}<button class="bm-toggle" onclick="toggleBookmark('${escAttr(city.qid)}')" title="Save city">${S._bookmarks.has(city.qid) ? "\u2605" : "\u2606"}</button></div>
        ${city.desc ? `<div class="wiki-city-desc">${escHtml(city.desc)}</div>` : ""}
      </div>
      ${infoChips}
      ${govSec || linksSec || wbSec ? `<table class="wiki-info-table">${govSec}${linksSec}${wbSec}</table>` : ""}
      ${regionHtml}
      ${univHtml}
    `;
      infoEl.querySelectorAll(".region-spark[data-region-pts]").forEach((el) => {
        try {
          const pts = JSON.parse(el.dataset.regionPts);
          const color = el.dataset.regionColor || "#58a6ff";
          const src = el.dataset.regionSrc || "pct";
          const yFmt = src === "pct" ? (v) => v.toFixed(1) + "%" : src === "eu_gdp" ? (v) => v.toFixed(0) + "%" : src === "pcpi" ? (v) => "$" + Math.round(v).toLocaleString() : src === "cad_gdp" ? (v) => "CA$" + v.toFixed(0) + "B" : src === "aud_gsp" ? (v) => "A$" + v.toFixed(0) + "B" : (v) => String(v);
          const isMonthly = pts.length > 0 && typeof pts[0][0] === "string" && pts[0][0].includes("-");
          const mapped = isMonthly ? pts.map((h) => ({ t: (/* @__PURE__ */ new Date(h[0] + "-01")).getTime(), v: h[1] })) : pts.map((h) => ({ t: h[0], v: h[1] }));
          const xFmt = isMonthly ? (t) => new Date(t).getFullYear() : (t) => String(t);
          _IYChart(el, mapped, {
            color,
            height: 44,
            isTimestamp: isMonthly,
            autoColor: false,
            yFmt,
            xFmt
          });
        } catch (_) {
        }
      });
    }
    if (economyEl) economyEl.innerHTML = hasCensus ? buildEconomyHtml(censusData, businessData, city.qid) : hasEurostat ? buildEurostatHtml(eurostatData, city.qid) : hasJapan ? buildJapanPrefHtml(japanPref.data, japanPref.name, city.qid) : "";
    if (overviewEl) overviewEl.innerHTML = `${climateHtml}${extractHtml}`;
    switchWikiTab(S._sidebarTab);
    if (images && images.length > 0) carStart(images);
    const wikiLink = wpUrl ? `<a class="wiki-footer-link" href="${escHtml(wpUrl)}" target="_blank" rel="noopener">
         <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#58a6ff" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
         Read full article on Wikipedia
       </a>` : "";
    const siteLink = city.website ? `<a class="wiki-footer-link" href="${escHtml(city.website)}" target="_blank" rel="noopener">
         <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#58a6ff" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1-4-10z"/></svg>
         Official website
       </a>` : "";
    const cmpBtn = `<button class="wiki-cmp-btn" onclick="openComparePanel('${escHtml(city.qid)}')">Compare</button>`;
    footer.innerHTML = wikiLink || siteLink ? wikiLink + siteLink + cmpBtn + `<span class="wiki-cache-note">${fromCache ? "Cached \xB7 " : ""}Data from Wikipedia &amp; Wikidata</span>` : cmpBtn;
  }
  function toggleExtract() {
    const el = document.getElementById("wiki-extract-text");
    const btn = document.getElementById("wiki-expand-btn");
    if (!el) return;
    const collapsed = el.classList.toggle("collapsed");
    btn.textContent = collapsed ? "Show more" : "Show less";
  }
  function _cpMapClickHandler() {
    if (S._cpCurrentIso2) closeCountryPanel();
  }
  function airQualityDotColor(city) {
    const aq = S.airQualityData[city.qid];
    if (!aq) return "#21262d";
    const pm = aq.pm25;
    for (const s of AQ_STOPS) {
      if (pm >= s.min) return s.color;
    }
    return "#3fb950";
  }
  async function toggleAqMode() {
    S.cityAqMode = !S.cityAqMode;
    const btn = document.getElementById("aq-toggle-btn");
    const leg = document.getElementById("aq-legend-wrap");
    const cov = document.getElementById("aq-coverage");
    const fpBtn = document.getElementById("filter-aq-color-btn");
    const fpLeg = document.getElementById("filter-aq-legend");
    if (S.cityAqMode) {
      if (btn) {
        btn.textContent = "Loading\u2026";
        btn.disabled = true;
      }
      if (fpBtn) {
        fpBtn.textContent = "\u{1F3A8} Loading\u2026";
        fpBtn.disabled = true;
      }
      await _aqLoader.ensure();
      if (btn) {
        btn.textContent = "On";
        btn.disabled = false;
        btn.classList.add("on");
      }
      if (fpBtn) {
        fpBtn.textContent = "\u{1F3A8} Color";
        fpBtn.disabled = false;
        fpBtn.classList.add("active");
      }
      if (leg) leg.style.display = "";
      if (fpLeg) {
        fpLeg.style.display = "";
        const covEl = fpLeg.querySelector(".filter-aq-coverage");
        if (covEl) covEl.textContent = Object.keys(S.airQualityData).length.toLocaleString() + " cities with data";
      }
      const covered = Object.keys(S.airQualityData).length;
      if (cov) cov.textContent = covered + " cities";
      if (S.censusColorMetric) {
        setCensusColorMetric("");
        const cs = document.getElementById("census-metric-select");
        if (cs) cs.value = "";
      }
    } else {
      if (btn) {
        btn.textContent = "Off";
        btn.classList.remove("on");
      }
      if (fpBtn) {
        fpBtn.textContent = "\u{1F3A8} Color";
        fpBtn.classList.remove("active");
      }
      if (leg) leg.style.display = "none";
      if (fpLeg) fpLeg.style.display = "none";
      if (cov) cov.textContent = "";
    }
    rebuildMapLayer();
    const legendTitle = document.getElementById("wiki-legend-title");
    if (legendTitle) {
      legendTitle.textContent = S.cityAqMode ? "Cities colored by WHO PM2.5 annual mean \xB7 click dot for details" : S.allCities.length.toLocaleString() + " cities on S.map \xB7 circle size and color = population";
    }
  }
  async function toggleFilterAqColor() {
    await toggleAqMode();
  }
  function _censusColorInterp(t, stops) {
    t = Math.max(0, Math.min(1, t));
    const seg = (stops.length - 1) * t;
    const i = Math.min(Math.floor(seg), stops.length - 2);
    const f = seg - i;
    const a = stops[i], b = stops[i + 1];
    return `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)},${Math.round(a[1] + (b[1] - a[1]) * f)},${Math.round(a[2] + (b[2] - a[2]) * f)})`;
  }
  function censusDotColor(city) {
    if (!S.censusColorMetric || city.iso !== "US") return null;
    const d = S.censusCities[city.qid];
    if (!d) return "#484f58";
    const cfg = CENSUS_METRICS[S.censusColorMetric];
    if (!cfg) return null;
    const val = d[S.censusColorMetric];
    if (val == null) return "#484f58";
    const t = (val - cfg.min) / (cfg.max - cfg.min);
    return _censusColorInterp(t, cfg.stops);
  }
  function setCensusColorMetric(val) {
    S.censusColorMetric = val || null;
    if (S.censusColorMetric) {
      const pane = S.map && S.map.getPane("cityPane");
      if (pane && (pane.style.opacity === "0" || !S.map.hasLayer(S.wikiLayer))) setCityDotMode("show");
      if (!S._filterAvail.census) {
        Object.keys(S._filterAvail).forEach((k) => {
          S._filterAvail[k] = false;
        });
        document.querySelectorAll(".filter-avail-btn").forEach((b) => {
          b.classList.remove("on");
          b.textContent = "off";
        });
        if (S.cityAqMode) toggleAqMode();
        S._filterAvail.census = true;
        const censusBtn = document.querySelector('.filter-avail-btn[data-key="census"]');
        if (censusBtn) {
          censusBtn.classList.add("on");
          censusBtn.textContent = "ON";
        }
        S._otherShowMode = "hide";
        document.querySelectorAll("[data-other-vis]").forEach((b) => b.classList.toggle("active", b.dataset.otherVis === "hide"));
        S._matchedColorMode = "metric";
        document.querySelectorAll("[data-matched-col]").forEach((b) => b.classList.toggle("active", b.dataset.matchedCol === "metric"));
      }
      _updateFilterBadge();
    } else {
      if (S._filterAvail.census) {
        S._filterAvail.census = false;
        const censusBtn = document.querySelector('.filter-avail-btn[data-key="census"]');
        if (censusBtn) {
          censusBtn.classList.remove("on");
          censusBtn.textContent = "off";
        }
        _updateFilterBadge();
      }
    }
    const bar = document.getElementById("census-color-bar");
    if (bar) {
      const inner = document.getElementById("census-color-legend-inner");
      if (S.censusColorMetric && CENSUS_METRICS[S.censusColorMetric]) {
        const cfg = CENSUS_METRICS[S.censusColorMetric];
        document.getElementById("census-leg-lo").textContent = cfg.lo;
        document.getElementById("census-leg-hi").textContent = cfg.hi;
        const canvas = document.getElementById("census-color-ramp");
        if (canvas) {
          const ctx = canvas.getContext("2d");
          const grd = ctx.createLinearGradient(0, 0, canvas.width, 0);
          cfg.stops.forEach((s, i) => {
            grd.addColorStop(i / (cfg.stops.length - 1), `rgb(${s[0]},${s[1]},${s[2]})`);
          });
          ctx.fillStyle = grd;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        if (inner) inner.style.display = "";
      } else {
        if (inner) inner.style.display = "none";
      }
    }
    rebuildMapLayer();
  }
  function getCensusData(city) {
    return S.censusCities[city.qid] || null;
  }
  function getCityClimate(city) {
    if (city.climate?.months?.length === 12) return city.climate;
    const ex = S.climateExtra[city.qid];
    if (ex?.months?.length === 12) return ex;
    const noaa = S.noaaClimate[city.qid];
    if (noaa?.months?.length === 12) return noaa;
    return null;
  }
  function climateAnnual(clim) {
    if (!clim?.months?.length) return null;
    const m = clim.months;
    const avgTemp = clim.annualAvgTemp ?? +(m.reduce((s, mo) => s + (mo.mean_c ?? (mo.high_c + mo.low_c) / 2), 0) / m.length).toFixed(1);
    const precipMm = clim.annualPrecipMm ?? +m.reduce((s, mo) => s + (mo.precipitation_mm ?? 0), 0).toFixed(0);
    const sunHours = clim.annualSunHours ?? (m.some((mo) => mo.sun != null) ? +m.reduce((s, mo) => s + (mo.sun ?? 0), 0).toFixed(0) : null);
    const hottest = m.reduce((a, b) => (b.mean_c ?? (b.high_c + b.low_c) / 2) > (a.mean_c ?? (a.high_c + a.low_c) / 2) ? b : a);
    const coldest = m.reduce((a, b) => (b.mean_c ?? (b.high_c + b.low_c) / 2) < (a.mean_c ?? (a.high_c + a.low_c) / 2) ? b : a);
    return {
      avgTemp,
      precipMm,
      sunHours,
      hottestTemp: hottest.mean_c ?? (hottest.high_c + hottest.low_c) / 2,
      coldestTemp: coldest.mean_c ?? (coldest.high_c + coldest.low_c) / 2
    };
  }
  function _statSourceAttr(metric) {
    var sources = {
      // World Bank
      wb_gdp_per_capita: "World Bank \xB7 WDI (NY.GDP.PCAP.CD)",
      wb_life_expectancy: "World Bank \xB7 WDI (SP.DYN.LE00.IN)",
      wb_urban_pct: "World Bank \xB7 WDI (SP.URB.TOTL.IN.ZS)",
      wb_internet_pct: "World Bank \xB7 WDI (IT.NET.USER.ZS)",
      wb_gini: "World Bank \xB7 WDI (SI.POV.GINI)",
      wb_literacy_rate: "World Bank \xB7 WDI (SE.ADT.LITR.ZS)",
      wb_child_mortality: "World Bank \xB7 WDI (SH.DYN.MORT)",
      wb_electricity_pct: "World Bank \xB7 WDI (EG.ELC.ACCS.ZS)",
      wb_pm25: "World Bank \xB7 WDI (EN.ATM.PM25.MC.M3)",
      wb_forest_pct: "World Bank \xB7 WDI (AG.LND.FRST.ZS)",
      wb_air_death_rate: "World Bank \xB7 WDI (SH.STA.AIRP.P5)",
      wb_road_death_rate: "World Bank \xB7 WDI (SH.STA.TRAF.P5)",
      // IMF
      wb_govt_debt_gdp: "IMF \xB7 World Economic Outlook (GGXWDG_NGDP)",
      wb_fiscal_balance_gdp: "IMF \xB7 World Economic Outlook (GGXCNL_NGDP)",
      wb_cpi_inflation: "IMF \xB7 World Economic Outlook (PCPIPCH)",
      wb_unemployment_rate: "IMF \xB7 World Economic Outlook (LUR)",
      // FRED
      wb_bond_yield_10y: "FRED \xB7 OECD 10-Year Government Bond Yields",
      // Central Bank
      wb_cb_rate: "Central bank official websites \xB7 manually curated",
      // Credit Ratings
      wb_credit_sp: "S&P Global Ratings",
      wb_credit_moodys: "Moody's Investors Service",
      wb_credit_fitch: "Fitch Ratings",
      // Governance
      wb_wgi_rule_of_law: "World Bank \xB7 Worldwide Governance Indicators",
      wb_wgi_corruption: "World Bank \xB7 Worldwide Governance Indicators",
      wb_wgi_govt_effectiveness: "World Bank \xB7 Worldwide Governance Indicators",
      wb_wgi_voice_accountability: "World Bank \xB7 Worldwide Governance Indicators",
      wb_wgi_political_stability: "World Bank \xB7 Worldwide Governance Indicators",
      wb_wgi_regulatory_quality: "World Bank \xB7 Worldwide Governance Indicators",
      // HDI & Sustainability
      wb_hdi: "UNDP \xB7 Human Development Report 2024",
      wb_renewable_energy_pct: "World Bank \xB7 WDI (EG.FEC.RNEW.ZS)",
      wb_health_spend_gdp: "World Bank \xB7 WDI (SH.XPD.CHEX.GD.ZS)",
      wb_education_spend_gdp: "World Bank \xB7 WDI (SE.XPD.TOTL.GD.ZS)",
      // Transparency & Freedom
      wb_ti_cpi: "Transparency International \xB7 CPI 2023",
      wb_fh_score: "Freedom House \xB7 Freedom in the World 2024",
      // WHR
      wb_whr_score: "World Happiness Report 2024 \xB7 Gallup World Poll",
      wb_whr_gdp: "World Happiness Report 2024 \xB7 Gallup World Poll",
      wb_whr_social: "World Happiness Report 2024 \xB7 Gallup World Poll",
      wb_whr_health: "World Happiness Report 2024 \xB7 Gallup World Poll",
      wb_whr_freedom: "World Happiness Report 2024 \xB7 Gallup World Poll",
      wb_whr_generosity: "World Happiness Report 2024 \xB7 Gallup World Poll",
      wb_whr_corruption: "World Happiness Report 2024 \xB7 Gallup World Poll",
      // Energy
      wb_energy_wind_solar_pct: "Our World in Data \xB7 Ember Global Electricity Review",
      wb_energy_hydro_pct: "Our World in Data \xB7 Ember Global Electricity Review",
      wb_energy_nuclear_pct: "Our World in Data \xB7 Ember Global Electricity Review",
      wb_energy_gas_pct: "Our World in Data \xB7 Ember Global Electricity Review",
      wb_energy_coal_pct: "Our World in Data \xB7 Ember Global Electricity Review",
      // OECD
      wb_rd_spend_pct: "OECD \xB7 Main Science and Technology Indicators",
      wb_tax_revenue_pct: "OECD \xB7 Revenue Statistics",
      wb_hours_worked: "OECD \xB7 Employment Outlook",
      wb_tertiary_pct: "OECD \xB7 Education at a Glance",
      wb_pisa_reading: "OECD \xB7 PISA 2022",
      wb_min_wage_usd_ppp: "OECD \xB7 Minimum Wage Database",
      wb_avg_wage_usd: "OECD \xB7 Average Annual Wages (USD PPP)",
      wb_labour_prod: "OECD \xB7 Level of GDP per Capita and Productivity",
      wb_gender_pay_gap: "OECD \xB7 Gender Pay Gap (median earnings)",
      wb_social_spend_gdp: "OECD \xB7 Social Expenditure Database (SOCX)",
      wb_youth_unemployment: "World Bank \xB7 WDI (SL.UEM.1524.ZS)",
      wb_poverty_rate_oecd: "OECD \xB7 Income Distribution Database (IDD)",
      oecd_house_price_income: "OECD \xB7 Analytical House Prices Indicators (HOUSE_PRICES)",
      oecd_broadband_per100: "OECD \xB7 Broadband Statistics (BROADBAND_DB)",
      oecd_employment_rate: "OECD \xB7 Labour Force Statistics (LFS)",
      oecd_life_satisfaction: "OECD \xB7 Better Life Index (BLI)",
      oecd_gini: "OECD \xB7 Income Distribution Database (IDD)",
      oecd_pension_spend: "OECD \xB7 Social Expenditure Database (SOCX_AGG)",
      eci: "Observatory of Economic Complexity \xB7 Atlas",
      // Trade (World Bank)
      wb_trade_pct_gdp: "World Bank \xB7 WDI (NE.TRD.GNFS.ZS)",
      wb_current_account: "World Bank \xB7 WDI (BN.CAB.XOKA.GD.ZS)",
      wb_fdi_inflow: "World Bank \xB7 WDI (BX.KLT.DINV.WD.GD.ZS)",
      wb_exports_pct_gdp: "World Bank \xB7 WDI (NE.EXP.GNFS.ZS)",
      wb_imports_pct_gdp: "World Bank \xB7 WDI (NE.IMP.GNFS.ZS)",
      // Health (WHO)
      wb_who_physicians: "WHO \xB7 Global Health Observatory (HWF_0001)",
      wb_who_nurses: "WHO \xB7 Global Health Observatory (HWF_0006)",
      wb_who_hospital_beds: "WHO \xB7 Global Health Observatory (WHS6_102)",
      wb_who_immunization: "WHO \xB7 Global Health Observatory (WHS4_543)",
      wb_who_maternal_mort: "WHO \xB7 Global Health Observatory (MDG_0000000026)",
      wb_who_ncd_mortality: "WHO \xB7 Global Health Observatory (NCDMORT3070)",
      wb_who_uhc_index: "WHO \xB7 Global Health Observatory (UHC_INDEX_REPORTED)",
      wb_who_hale: "WHO \xB7 Global Health Observatory (WHOSIS_000002)",
      wb_who_health_spend_pc: "WHO \xB7 Global Health Observatory (GHED_CHEGDP_SHA2011)",
      wb_who_oop_spend: "WHO \xB7 Global Health Observatory (GHED_OOPSCHE_SHA2011)",
      wb_who_tb_incidence: "WHO \xB7 Global Health Observatory (MDG_0000000020)",
      wb_who_hiv_prevalence: "WHO \xB7 Global Health Observatory (MDG_0000000029)",
      wb_who_malaria_incidence: "WHO \xB7 Global Health Observatory (MALARIA_EST_INCIDENCE)",
      wb_who_hepb_prevalence: "WHO \xB7 Global Health Observatory (WHS4_117)",
      wb_who_obesity: "WHO \xB7 Global Health Observatory (NCD_BMI_30A)",
      wb_who_tobacco: "WHO \xB7 Global Health Observatory (M_Est_tob_curr_std)",
      wb_who_alcohol: "WHO \xB7 Global Health Observatory (SA_0000001688)",
      wb_who_physical_inactivity: "WHO \xB7 Global Health Observatory (NCD_PAC)",
      // CO₂ Emissions (Global Carbon Project)
      wb_co2_total: "Global Carbon Project 2023 / Our World in Data",
      wb_co2_per_capita: "Global Carbon Project 2023 / Our World in Data",
      wb_co2_coal_pct: "Global Carbon Project 2023 / Our World in Data",
      wb_co2_oil_pct: "Global Carbon Project 2023 / Our World in Data",
      wb_co2_gas_pct: "Global Carbon Project 2023 / Our World in Data",
      wb_co2_cement_pct: "Global Carbon Project 2023 / Our World in Data",
      // UNESCO
      wb_unesco_total: "UNESCO World Heritage Centre (whc.unesco.org)",
      // INFORM Risk
      wb_inform_risk: "INFORM Risk Index 2024 (EC Joint Research Centre)",
      wb_inform_hazard: "INFORM Risk Index 2024 (EC Joint Research Centre)",
      wb_inform_vulnerability: "INFORM Risk Index 2024 (EC Joint Research Centre)",
      wb_inform_coping: "INFORM Risk Index 2024 (EC Joint Research Centre)",
      // Cost of Living
      col_index: "Numbeo / Mercer / EIU Cost of Living Index 2024 (NYC=100)",
      startup_unicorns: "StartupBlink 2024 / CB Insights / Crunchbase",
      startup_funding: "StartupBlink 2024 / CB Insights / Crunchbase",
      // Census
      population: "U.S. Census Bureau \xB7 ACS 2023",
      medianIncome: "U.S. Census Bureau \xB7 ACS 2023",
      povertyRate: "U.S. Census Bureau \xB7 ACS 2023",
      medianHomeValue: "U.S. Census Bureau \xB7 ACS 2023",
      medianRent: "U.S. Census Bureau \xB7 ACS 2023",
      bachelorsPct: "U.S. Census Bureau \xB7 ACS 2023",
      foreignBornPct: "U.S. Census Bureau \xB7 ACS 2023",
      unemploymentPct: "U.S. Census Bureau \xB7 ACS 2023",
      commuteTime: "U.S. Census Bureau \xB7 ACS 2023",
      // City-level
      airQuality: "WHO \xB7 Ambient Air Pollution Database",
      metroStations: "Wikidata \xB7 metro/transit systems",
      nobelCount: "Wikidata \xB7 Nobel laureate birthplaces",
      universityCount: "Wikidata \xB7 higher education institutions",
      airportConnections: "OpenFlights \xB7 airport route data",
      // Zillow
      zhvi: "Zillow \xB7 Home Value Index (ZHVI)",
      zori: "Zillow \xB7 Observed Rent Index (ZORI)",
      // Crime
      violentPer100k: "FBI \xB7 Uniform Crime Report",
      propertyPer100k: "FBI \xB7 Uniform Crime Report",
      // Japan
      japan_perCapitaIncome: "Japan Cabinet Office \xB7 prefectural accounts",
      japan_gdp: "Japan Cabinet Office \xB7 prefectural accounts",
      // Climate
      avgHighTemp: "NOAA \xB7 U.S. Climate Normals 1991\u20132020",
      avgLowTemp: "NOAA \xB7 U.S. Climate Normals 1991\u20132020",
      annualPrecipMm: "NOAA \xB7 U.S. Climate Normals 1991\u20132020",
      warmestMonthTemp: "Open-Meteo \xB7 ERA5 reanalysis 2014\u20132023",
      coldestMonthTemp: "Open-Meteo \xB7 ERA5 reanalysis 2014\u20132023",
      // Peace & Security
      wb_military_spend_gdp: "World Bank \xB7 WDI (MS.MIL.XPND.GD.ZS)",
      wb_gpi_score: "Global Peace Index 2024 \xB7 Institute for Economics & Peace",
      wb_press_freedom: "RSF World Press Freedom Index 2024",
      // Digital Infrastructure
      wb_inet_download: "Ookla Speedtest Global Index 2024",
      wb_inet_upload: "Ookla Speedtest Global Index 2024",
      wb_inet_mobile: "Ookla Speedtest Global Index 2024",
      // Demographics & Environment
      wb_pop_growth: "World Bank \xB7 WDI (SP.POP.GROW)",
      wb_net_migration: "World Bank \xB7 WDI (SM.POP.NETM)",
      wb_migrant_stock: "World Bank \xB7 WDI (SM.POP.TOTL)",
      wb_female_labor: "World Bank \xB7 WDI (SL.TLF.CACT.FE.ZS)",
      wb_safe_water: "World Bank \xB7 WDI (SH.H2O.SMDW.ZS)",
      wb_research_articles: "World Bank \xB7 WDI (IP.JRN.ARTC.SC)",
      // Nuclear Energy
      wb_nuclear_reactors: "IAEA PRIS 2024 (pris.iaea.org)",
      wb_nuclear_capacity: "IAEA PRIS 2024 (pris.iaea.org)",
      wb_nuclear_generation: "IAEA PRIS 2024 (pris.iaea.org)"
    };
    if (metric.indexOf("eurostat_") === 0) return "Source: Eurostat \xB7 Urban Audit";
    var src = sources[metric];
    return src ? "Source: " + escHtml(src) : "";
  }
  function statCell(label, val, cls = "", metric = "", qid = "", title = "Click to see ranking") {
    const extra = metric && qid ? ` census-stat-clickable" onclick="openStatsPanel('${metric}','${escHtml(qid)}')" title="${escHtml(title)}"` : `"`;
    return `<div class="census-stat${extra}><div class="census-stat-label">${label}</div><div class="census-stat-value${cls ? " " + cls : ""}">${val}</div></div>`;
  }
  function buildEconomyHtml(acs, biz, qid) {
    const fmt$ = (v) => v != null && v > 0 ? "$" + fmtNum(Math.round(v)) : "\u2014";
    const fmtPct = (v) => v != null && v >= 0 ? v.toFixed(1) + "%" : "\u2014";
    const fmtN = (v) => v != null ? fmtNum(v) : "\u2014";
    const fmt$M = (v) => v != null && v > 0 ? "$" + fmtRevenue(v * 1e3) : "\u2014";
    let html = '<div class="census-wrap">';
    if (acs) {
      const brackets = acs.brackets || [];
      const maxPct = Math.max(...brackets, 0.1);
      const BAR_W = 128, BAR_H = 8, GAP = 4, LBL_W = 60, PCT_W = 30;
      const svgW = LBL_W + BAR_W + PCT_W;
      const svgH = brackets.length * (BAR_H + GAP) + 2;
      const incomeBars = brackets.map((pct, i) => {
        const y = i * (BAR_H + GAP) + 1;
        const bw = Math.max(2, pct / maxPct * BAR_W);
        const pctTxt = pct >= 0.5 ? pct.toFixed(1) + "%" : "";
        return `<text x="${LBL_W - 3}" y="${y + BAR_H - 1}" text-anchor="end" font-size="7" fill="#8b949e">${CENSUS_BRACKET_LABELS[i] || ""}</text>
        <rect x="${LBL_W}" y="${y}" width="${bw.toFixed(1)}" height="${BAR_H}" rx="1.5" fill="${CENSUS_BRACKET_COLORS[i]}" opacity="0.85"/>
        <text x="${LBL_W + bw + 2}" y="${y + BAR_H - 1}" font-size="7" fill="#8b949e">${pctTxt}</text>`;
      }).join("");
      const incomeSvg = `<svg viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" style="display:block;overflow:visible">${incomeBars}</svg>`;
      const medIncomeFmt = acs.medianIncome > 0 ? "$" + fmtNum(Math.round(acs.medianIncome)) : "\u2014";
      const povCls = acs.povertyPct > 20 ? "census-red" : acs.povertyPct > 10 ? "census-amber" : "";
      const unempCls = acs.unemploymentPct > 8 ? "census-red" : acs.unemploymentPct > 5 ? "census-amber" : "";
      const burdCls = acs.rentBurdenedPct > 40 ? "census-red" : acs.rentBurdenedPct > 25 ? "census-amber" : "";
      const snapCls = acs.snapPct > 20 ? "census-red" : acs.snapPct > 10 ? "census-amber" : "";
      const giniCls = acs.gini > 0.5 ? "census-red" : acs.gini > 0.43 ? "census-amber" : "";
      html += `
      <div class="census-head">Household Economy \xB7 ACS ${acs.year || 2023}</div>
      <div class="econ-two-col">
        <div class="econ-col-left">
          <div class="census-subtitle" style="margin-bottom:4px">Income Distribution</div>
          ${incomeSvg}
        </div>
        <div class="econ-col-right">
          <div class="census-stats-grid econ-right-grid">
            ${statCell("Median Income", medIncomeFmt, "census-gold", "medianIncome", qid)}
            ${statCell("Poverty", fmtPct(acs.povertyPct), povCls, "povertyPct", qid)}
            ${statCell("Unemployed", fmtPct(acs.unemploymentPct), unempCls, "unemploymentPct", qid)}
            ${statCell("Rent-Burdened", fmtPct(acs.rentBurdenedPct), burdCls, "rentBurdenedPct", qid)}
            ${statCell("Median Rent", fmt$(acs.medianRent) + (acs.medianRent > 0 ? "/mo" : ""), "", "medianRent", qid)}
            ${statCell("Home Value", fmt$(acs.medianHomeValue), "", "medianHomeValue", qid)}
            ${statCell("Gini", acs.gini != null ? acs.gini.toFixed(3) : "\u2014", giniCls, "gini", qid)}
            ${statCell("SNAP", fmtPct(acs.snapPct), snapCls, "snapPct", qid)}
          </div>
        </div>
      </div>
      <div class="census-stats-grid" style="margin-top:6px;grid-template-columns:repeat(4,1fr)">
        ${statCell("College+", fmtPct(acs.bachelorPlusPct), "", "bachelorPlusPct", qid)}
        ${statCell("Transit", fmtPct(acs.transitPct), "", "transitPct", qid)}
        ${statCell("Med. Age", acs.medianAge != null ? acs.medianAge + " yr" : "\u2014", "", "medianAge", qid)}
        ${statCell("Homeown.", fmtPct(acs.ownerOccPct), "", "ownerOccPct", qid)}
      </div>`;
    }
    if (biz) {
      const pt = biz.popTrend || {};
      const popYears = [2019, 2020, 2021, 2022].filter((y) => pt[`pop${y}`] != null);
      const popVals = popYears.map((y) => pt[`pop${y}`]);
      let sparkSvg = "";
      if (popVals.length >= 2) {
        const W = 108, H = 30, PAD = 3;
        const minV = Math.min(...popVals), maxV = Math.max(...popVals);
        const range = maxV - minV || 1;
        const xs = popVals.map((_, i) => PAD + i * (W - PAD * 2) / (popVals.length - 1));
        const ys = popVals.map((v) => H - PAD - (v - minV) / range * (H - PAD * 2));
        const pts = xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
        const gc = (pt.growthPct || 0) >= 0 ? "#3fb950" : "#f85149";
        const dots = xs.map(
          (x, i) => `<circle cx="${x.toFixed(1)}" cy="${ys[i].toFixed(1)}" r="2" fill="${gc}"/>
         <text x="${x.toFixed(1)}" y="${H + 6}" text-anchor="middle" font-size="6.5" fill="#6e7681">${String(popYears[i]).slice(2)}</text>`
        ).join("");
        sparkSvg = `<svg viewBox="0 0 ${W} ${H + 10}" width="${W}" height="${H + 10}" style="display:block;overflow:visible">
        <polyline points="${pts}" fill="none" stroke="${gc}" stroke-width="1.6" opacity="0.85"/>
        ${dots}
      </svg>`;
      }
      const growthCls = (pt.growthPct || 0) >= 0 ? "census-gold" : "census-red";
      const growthStr = popVals.length >= 2 ? `<span class="census-stat-value ${growthCls} census-stat-clickable" style="font-size:0.78rem" onclick="openStatsPanel('popGrowthPct','${qid}')" title="Click to see ranking">${(pt.growthPct || 0) >= 0 ? "+" : ""}${(pt.growthPct || 0).toFixed(1)}%</span> <span class="census-stat-label">pop 19\u219222</span>` : "";
      const cbp = biz.cbp || {};
      const SECTORS = [
        { key: "manufacturing", label: "Mfg", color: "#f0a500" },
        { key: "professional", label: "Prof/Tech", color: "#58a6ff" },
        { key: "information", label: "Info/Tech", color: "#a371f7" },
        { key: "finance", label: "Finance", color: "#3fb950" },
        { key: "hospitality", label: "Hospitality", color: "#ffa657" }
      ];
      const totalEstab = cbp.total?.estab || 1;
      const maxEstab = Math.max(...SECTORS.map((s) => cbp[s.key]?.estab || 0), 1);
      const SBW = 100, SBH = 8, SGAP = 4, SLBW = 52, SPCTW = 28;
      const sSvgW = SLBW + SBW + SPCTW, sSvgH = SECTORS.length * (SBH + SGAP) + 2;
      const sectorBars = SECTORS.map((s, i) => {
        const estab = cbp[s.key]?.estab || 0;
        const y = i * (SBH + SGAP) + 1;
        const bw = Math.max(2, estab / maxEstab * SBW);
        return `<text x="${SLBW - 3}" y="${y + SBH - 1}" text-anchor="end" font-size="7" fill="#8b949e">${s.label}</text>
        <rect x="${SLBW}" y="${y}" width="${bw.toFixed(1)}" height="${SBH}" rx="1.5" fill="${s.color}" opacity="0.85"/>
        <text x="${SLBW + bw + 2}" y="${y + SBH - 1}" font-size="7" fill="#8b949e">${estab > 0 ? fmtN(estab) : ""}</text>`;
      }).join("");
      const sectorSvg = `<svg viewBox="0 0 ${sSvgW} ${sSvgH}" width="${sSvgW}" height="${sSvgH}" style="display:block;overflow:visible">${sectorBars}</svg>`;
      const mfgShare = cbp.manufacturing?.estab && cbp.total?.estab ? (cbp.manufacturing.estab / cbp.total.estab * 100).toFixed(1) + "%" : "\u2014";
      const selfEmplPct = biz.selfEmpl?.selfEmplPct;
      const selfEmplDisplay = selfEmplPct != null && selfEmplPct < 35 ? fmtPct(selfEmplPct) : "\u2014";
      html += `
      <div class="census-section-title" style="margin-top:${acs ? "10" : "0"}px">Business Structure \xB7 CBP 2022</div>
      ${biz.countyName ? `<div class="census-source" style="margin-top:0;margin-bottom:4px">County: ${escHtml(biz.countyName)}</div>` : ""}
      <div class="econ-two-col">
        <div class="econ-col-left">
          <div class="census-subtitle" style="margin-bottom:3px">Population ${growthStr ? "" : "Trend"}</div>
          ${growthStr ? `<div style="margin-bottom:4px">${growthStr}</div>` : ""}
          ${sparkSvg ? sparkSvg : '<div class="census-source">N/A</div>'}
        </div>
        <div class="econ-col-right">
          <div class="census-subtitle" style="margin-bottom:3px">Sector Mix</div>
          ${sectorSvg}
        </div>
      </div>
      <div class="census-stats-grid" style="margin-top:6px;grid-template-columns:repeat(4,1fr)">
        ${statCell("Estab.", fmtN(cbp.total?.estab), "", "totalEstab", qid)}
        ${statCell("Payroll", fmt$M(cbp.total?.payann), "", "totalPayroll", qid)}
        ${statCell("Mfg Share", mfgShare, cbp.manufacturing?.estab / totalEstab > 0.08 ? "census-gold" : "", "mfgShare", qid)}
        ${statCell("Self-Empl.", selfEmplDisplay, "", "selfEmplPct", qid)}
      </div>`;
    }
    const zw = S.zillowData[qid];
    if (zw) {
      const fmtDollar = (v) => "$" + fmtNum(Math.round(v));
      html += `<div class="census-section-title" style="margin-top:10px">Housing Market \xB7 Zillow</div>
    <div class="es-trends">`;
      if (zw.zhviHistory?.length >= 2) {
        const { svg, range } = _eurostatSparkline(zw.zhviHistory, "#58a6ff", 110, 28);
        html += `<div class="es-trend-row census-stat-clickable" onclick="openStatsPanel('zhvi','${escHtml(qid)}')" title="Click to see ranking">
        <span class="es-trend-label">Home Value</span>
        <span class="es-trend-spark">${svg}</span>
        <span class="es-trend-val" style="color:var(--accent)">${zw.zhvi ? fmtDollar(zw.zhvi) : "\u2014"}</span>
        <span class="es-trend-range">${range}</span>
      </div>`;
      }
      if (zw.zoriHistory?.length >= 2) {
        const { svg, range } = _eurostatSparkline(zw.zoriHistory, "#f0a500", 110, 28);
        html += `<div class="es-trend-row census-stat-clickable" onclick="openStatsPanel('zori','${escHtml(qid)}')" title="Click to see ranking">
        <span class="es-trend-label">Rent Index</span>
        <span class="es-trend-spark">${svg}</span>
        <span class="es-trend-val" style="color:var(--gold)">${zw.zori ? fmtDollar(zw.zori) + "/mo" : "\u2014"}</span>
        <span class="es-trend-range">${range}</span>
      </div>`;
      }
      html += `</div>`;
    }
    const crime = S.fbiCrimeData[qid];
    if (crime) {
      const vCol = crime.violentPer100k > 800 ? "census-red" : crime.violentPer100k > 400 ? "census-amber" : "census-green";
      const pCol = crime.propertyPer100k > 3e3 ? "census-red" : crime.propertyPer100k > 1500 ? "census-amber" : "";
      html += `<div class="census-section-title" style="margin-top:10px">Crime \xB7 FBI UCR ${crime.year}</div>
    <div class="census-stats-grid" style="grid-template-columns:repeat(2,1fr);margin-top:4px">
      ${statCell("Violent Crime", crime.violentPer100k.toFixed(0) + "/100k", vCol, "fbi_violentPer100k", qid)}
      ${statCell("Property Crime", crime.propertyPer100k.toFixed(0) + "/100k", pCol, "fbi_propertyPer100k", qid)}
    </div>`;
    }
    html += `<div class="census-source" style="margin-top:8px">US Census Bureau \xB7 ACS 2023 \xB7 CBP 2022 \xB7 Decennial 2020${zw ? " \xB7 Zillow Research" : ""}${crime ? " \xB7 FBI UCR" : ""}</div></div>`;
    return html;
  }
  function _eurostatSparkline(history2, color, W, H) {
    if (!history2 || history2.length < 2) return { svg: "", range: "" };
    const xs = history2.map(([y]) => y);
    const vs = history2.map(([, v]) => v);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minV = Math.min(...vs), maxV = Math.max(...vs);
    const rangeV = maxV - minV || 1;
    const PAD = 2;
    const toX = (x) => PAD + (x - minX) / (maxX - minX || 1) * (W - PAD * 2);
    const toY = (v) => H - PAD - (v - minV) / rangeV * (H - PAD * 2);
    const pts = history2.map(([x, v]) => `${toX(x).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");
    const svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="display:block;overflow:visible">
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" opacity="0.9"/>
    <circle cx="${toX(xs[xs.length - 1]).toFixed(1)}" cy="${toY(vs[vs.length - 1]).toFixed(1)}" r="2.2" fill="${color}"/>
  </svg>`;
    const range = `${minX}\u2013${maxX}`;
    return { svg, range };
  }
  function _getRegionData(city) {
    if (city.iso === "US") {
      const cen = S.censusCities[city.qid];
      let abbr = null;
      if (cen?.placeName) {
        const parts = cen.placeName.split(",");
        const stateName = parts[parts.length - 1]?.trim();
        abbr = STATE_NAME_TO_ABBR[stateName];
      }
      if (!abbr) abbr = STATE_NAME_TO_ABBR[city.admin];
      if (abbr && S.usStatesData[abbr]) return { abbr, label: S.usStatesData[abbr].name, src: "us", data: S.usStatesData[abbr] };
    }
    if (city.iso === "CA") {
      const abbr = CA_PROV_TO_ABBR[city.admin];
      if (abbr && S.canadaProvinces[abbr]) return { abbr, label: S.canadaProvinces[abbr].name || city.admin, src: "ca", data: S.canadaProvinces[abbr] };
    }
    if (city.iso === "AU") {
      const abbr = AU_STATE_TO_ABBR[city.admin];
      if (abbr && S.australiaStates[abbr]) return { abbr, label: S.australiaStates[abbr].name || city.admin, src: "au", data: S.australiaStates[abbr] };
    }
    if (Object.keys(S.eurostatRegions).length) {
      const QID_NUTS2 = {
        Q64: "DE30",
        // Berlin
        Q1055: "DE60",
        // Hamburg
        Q1741: "AT13",
        // Vienna
        Q216: "LT01",
        // Vilnius
        Q19660: "RO32",
        // Bucharest
        Q1085: "CZ01",
        // Prague
        Q1435: "HR05",
        // Zagreb
        Q585: "NO08",
        // Oslo
        Q26793: "NO0A",
        // Bergen
        Q25804: "NO06",
        // Trondheim
        Q472: "BG41",
        // Sofia
        Q437: "SI04",
        // Ljubljana
        Q240: "BE10",
        // Brussels-Capital Region
        Q2079: "DED5",
        // Leipzig (Saxony)
        Q1731: "DED2",
        // Dresden (Saxony)
        Q2211: "SE22",
        // Malmö (Lomma Municipality)
        Q1754: "SE11"
        // Stockholm city
      };
      if (QID_NUTS2[city.qid] && S.eurostatRegions[QID_NUTS2[city.qid]]) {
        const r = S.eurostatRegions[QID_NUTS2[city.qid]];
        return { abbr: QID_NUTS2[city.qid], label: r.name, src: "eu", data: r };
      }
      const singleCode = SINGLE_NUTS2[city.iso];
      if (singleCode && S.eurostatRegions[singleCode]) {
        const r = S.eurostatRegions[singleCode];
        return { abbr: singleCode, label: r.name, src: "eu", data: r };
      }
      if (city.iso === "SE" && city.admin === "Sweden" && city.name) {
        const SE_COUNTY_NUTS2 = {
          "Stockholm County": "SE11",
          "Uppsala County": "SE12",
          "S\xF6dermanland County": "SE12",
          "\xD6sterg\xF6tland County": "SE12",
          "\xD6rebro County": "SE12",
          "J\xF6nk\xF6ping County": "SE21",
          "Kronoberg County": "SE21",
          "Kalmar County": "SE21",
          "Gotland County": "SE21",
          "Sk\xE5ne County": "SE22",
          "Halland County": "SE22",
          "Blekinge County": "SE22",
          "V\xE4stra G\xF6taland County": "SE23",
          "V\xE4rmland County": "SE31",
          "G\xE4vleborg County": "SE31",
          "Dalarna County": "SE31",
          "V\xE4sternorrland County": "SE32",
          "J\xE4mtland County": "SE32",
          "V\xE4sterbotten County": "SE33",
          "Norrbotten County": "SE33",
          "V\xE4stmanland County": "SE12"
        };
        const code = SE_COUNTY_NUTS2[city.name];
        if (code && S.eurostatRegions[code]) {
          const r = S.eurostatRegions[code];
          return { abbr: code, label: r.name, src: "eu", data: r };
        }
      }
      const isoKey = city.iso || (city.country === "Netherlands" ? "NL" : null);
      const countryMap = isoKey && ADMIN_TO_NUTS2[isoKey];
      if (countryMap) {
        const code = countryMap[city.admin];
        if (code && S.eurostatRegions[code]) {
          const r = S.eurostatRegions[code];
          return { abbr: code, label: r.name, src: "eu", data: r };
        }
      }
    }
    return null;
  }
  function _buildRegionHtml(region) {
    const d = region.data;
    let rows = "";
    if (Number.isFinite(d.unemployment_rate)) {
      const yr = d.unemployment_year ? ` (${d.unemployment_year})` : "";
      rows += `<tr><td class="wi-lbl">Unemployment</td><td class="wi-val">${d.unemployment_rate.toFixed(1)}%${yr}</td></tr>`;
    }
    if (Number.isFinite(d.gdp_pps_eu100)) {
      const year = d.gdp_pps_year ? ` (${d.gdp_pps_year})` : "";
      rows += `<tr><td class="wi-lbl">GDP vs EU avg</td><td class="wi-val">${d.gdp_pps_eu100}% of EU${year}</td></tr>`;
    }
    if (Number.isFinite(d.pcpi)) {
      rows += `<tr><td class="wi-lbl">Income per capita</td><td class="wi-val">$${Math.round(d.pcpi).toLocaleString()}</td></tr>`;
    }
    if (Number.isFinite(d.gdp_per_capita_cad)) {
      rows += `<tr><td class="wi-lbl">Income per capita</td><td class="wi-val">CA$${Math.round(d.gdp_per_capita_cad).toLocaleString()}</td></tr>`;
    }
    if (Number.isFinite(d.gdp_bn_cad)) {
      rows += `<tr><td class="wi-lbl">Provincial GDP</td><td class="wi-val">CA$${d.gdp_bn_cad.toFixed(0)}B</td></tr>`;
    }
    if (Number.isFinite(d.gsp_bn_aud)) {
      rows += `<tr><td class="wi-lbl">State GSP</td><td class="wi-val">A$${d.gsp_bn_aud.toFixed(0)}B</td></tr>`;
    }
    if (Number.isFinite(d.gsp_per_capita_aud)) {
      rows += `<tr><td class="wi-lbl">Income per capita</td><td class="wi-val">A$${Math.round(d.gsp_per_capita_aud).toLocaleString()}</td></tr>`;
    }
    if (!rows) return "";
    const _spark = (hist, color, src, label) => {
      const pts = (hist || []).filter((h) => Array.isArray(h) && h[1] != null && isFinite(h[1]));
      if (pts.length < 2) return "";
      const minV = Math.min(...pts.map((h) => h[1]));
      const maxV = Math.max(...pts.map((h) => h[1]));
      const range = `${minV.toFixed(src === "eu_gdp" ? 0 : 1)} \u2013 ${maxV.toFixed(src === "eu_gdp" ? 0 : 1)}`;
      return `<div class="region-spark-wrap">
      <div class="region-spark-hdr"><span>${escHtml(label)}</span><span class="region-spark-range">${escHtml(range)}</span></div>
      <div class="region-spark" data-region-pts="${escHtml(JSON.stringify(pts))}" data-region-color="${escHtml(color)}" data-region-src="${src}" style="height:44px"></div>
    </div>`;
    };
    let sparks = "";
    sparks += _spark(d.unemployment_history, "#e3b341", "pct", "Unemployment history");
    sparks += _spark(d.pcpi_history, "#3fb950", "pcpi", "Income per capita history");
    sparks += _spark(d.gdp_pps_history, "#58a6ff", "eu_gdp", "GDP vs EU avg (%)");
    sparks += _spark(d.gdp_history, "#3fb950", "cad_gdp", "Provincial GDP (CA$B)");
    sparks += _spark(d.gsp_history, "#3fb950", "aud_gsp", "State GSP (A$B)");
    return `<div class="region-stats-block">
    <div class="region-stats-hdr">\u{1F4CD} ${escHtml(region.label)}</div>
    <table class="wiki-info-table">${rows}</table>
    ${sparks}
  </div>`;
  }
  function _lookupJapanPref(city) {
    if (!city || !Object.keys(S.japanPrefData).length) return null;
    const stripDiac = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const clean = (s) => stripDiac(s || "").replace(/\s*(Prefecture|Metropolis|Metro|Subprefecture|府|県|都|道)\s*/gi, "").trim().toLowerCase();
    const cityName = city.name || "";
    if (/^Tokyo/i.test(cityName) && S.japanPrefData["Tokyo"])
      return { name: "Tokyo", data: S.japanPrefData["Tokyo"] };
    if (/^Osaka/i.test(cityName) && S.japanPrefData["Osaka"])
      return { name: "Osaka", data: S.japanPrefData["Osaka"] };
    if (/^Sapporo/i.test(cityName) && S.japanPrefData["Hokkaido"])
      return { name: "Hokkaido", data: S.japanPrefData["Hokkaido"] };
    if (/^Naha/i.test(cityName) && S.japanPrefData["Okinawa"])
      return { name: "Okinawa", data: S.japanPrefData["Okinawa"] };
    const adminClean = clean(city.admin || "");
    if (!adminClean || adminClean === "japan") return null;
    for (const [pref, data] of Object.entries(S.japanPrefData)) {
      const prefClean = clean(pref);
      if (adminClean === prefClean || adminClean.includes(prefClean) || prefClean.includes(adminClean)) {
        return { name: pref, data };
      }
    }
    return null;
  }
  function buildJapanPrefHtml(pref, prefName, qid) {
    if (!pref) return "";
    const fmtJpy = (v) => v == null ? "\u2014" : "\xA5" + fmtNum(Math.round(v));
    const fmtBill = (v) => v == null ? "\u2014" : "\xA5" + fmtRevenue(v);
    function jpSparkline(history2, color) {
      if (!history2 || history2.length < 2) return "";
      const W = 110, H = 28;
      const xs = history2.map((h) => h[0]), ys = history2.map((h) => h[1]);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const rangeY = maxY - minY || 1;
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const rangeX = maxX - minX || 1;
      const pts = history2.map(
        ([x, y]) => `${((x - minX) / rangeX * (W - 4) + 2).toFixed(1)},${(H - 2 - (y - minY) / rangeY * (H - 4)).toFixed(1)}`
      ).join(" ");
      return `<svg width="${W}" height="${H}" style="display:block;overflow:visible">
      <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" opacity="0.85"/>
      <circle cx="${pts.split(" ").at(-1).split(",")[0]}" cy="${pts.split(" ").at(-1).split(",")[1]}" r="2.5" fill="${color}"/>
    </svg>`;
    }
    const incomeHistory = pref.perCapitaIncomeHistory;
    const gdpHistory = pref.gdpHistory;
    const incYear = pref.perCapitaIncomeYear || "";
    const gdpYear = pref.gdpYear || "";
    const incomeRange = incomeHistory && incomeHistory.length >= 2 ? `${incomeHistory[0][0]}\u2013${incomeHistory[incomeHistory.length - 1][0]}` : "";
    const gdpRange = gdpHistory && gdpHistory.length >= 2 ? `${gdpHistory[0][0]}\u2013${gdpHistory[gdpHistory.length - 1][0]}` : "";
    const click = (metric) => `census-stat-clickable" onclick="openStatsPanel('${metric}','${escHtml(qid)}')" title="Click to see Japan prefecture ranking"`;
    return `<div class="census-wrap">
    <div class="census-head">Prefecture \xB7 Cabinet Office${incYear ? " \xB7 " + incYear : ""}</div>
    <div style="margin-bottom:6px;font-size:0.7rem;color:var(--text-secondary)">${escHtml(prefName)} Prefecture</div>

    <div class="census-stats-grid" style="grid-template-columns:repeat(2,1fr);margin-bottom:12px">
      <div class="census-stat ${click("japan_perCapitaIncome")}>
        <div class="census-stat-label">Per-Capita Income</div>
        <div class="census-stat-value">${fmtJpy(pref.perCapitaIncomeJpy)}</div>
      </div>
      <div class="census-stat ${click("japan_gdp")}>
        <div class="census-stat-label">Prefectural GDP</div>
        <div class="census-stat-value">${fmtBill(pref.gdpJpy)}</div>
      </div>
    </div>

    ${incomeHistory && incomeHistory.length >= 2 ? `
    <div class="es-trends">
      <div class="es-trend-row" onclick="openStatsPanel('japan_perCapitaIncome','${escHtml(qid)}')" title="Click to see prefecture ranking">
        <span class="es-trend-label">Per-Capita Income</span>
        <span>${jpSparkline(incomeHistory, "#f0a500")}</span>
        <span class="es-trend-val" style="color:var(--gold)">${fmtJpy(pref.perCapitaIncomeJpy)}</span>
        <span class="es-trend-range">${incomeRange}</span>
      </div>
    </div>` : ""}

    ${gdpHistory && gdpHistory.length >= 2 ? `
    <div class="es-trends" style="margin-top:6px">
      <div class="es-trend-row" onclick="openStatsPanel('japan_gdp','${escHtml(qid)}')" title="Click to see prefecture ranking">
        <span class="es-trend-label">Prefectural GDP</span>
        <span>${jpSparkline(gdpHistory, "#3fb950")}</span>
        <span class="es-trend-val" style="color:var(--success)">${fmtBill(pref.gdpJpy)}</span>
        <span class="es-trend-range">${gdpRange}</span>
      </div>
    </div>` : ""}

    <div id="trade-source" style="margin-top:10px">Source: Japan Cabinet Office \xB7 Prefectural Accounts</div>
  </div>`;
  }
  function buildEurostatHtml(es, qid) {
    const fmtPct = (v) => v != null ? v.toFixed(1) + "%" : "\u2014";
    const fmtEur = (v) => v != null ? "\u20AC" + fmtNum(Math.round(v)) : "\u2014";
    const fmtN = (v) => v != null ? fmtNum(Math.round(v)) : "\u2014";
    const yr = es.year ? ` \xB7 ${es.year}` : "";
    const unempCls = es.unemploymentPct > 12 ? "census-red" : es.unemploymentPct > 7 ? "census-amber" : "";
    const povCls = es.povertyPct > 25 ? "census-red" : es.povertyPct > 15 ? "census-amber" : "";
    const pm10Cls = es.pm10 != null ? es.pm10 > 45 ? "census-red" : es.pm10 > 25 ? "census-amber" : "census-green" : "";
    const no2Cls = es.no2 != null ? es.no2 > 40 ? "census-red" : es.no2 > 25 ? "census-amber" : "census-green" : "";
    let html = `<div class="census-wrap">
    <div class="census-head">Urban Audit \xB7 Eurostat${yr}</div>
    <div class="census-stats-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:6px">
      ${statCell("Unemployment", fmtPct(es.unemploymentPct), unempCls, "eurostat_unemploymentPct", qid, "Click to see European ranking")}
      ${statCell("Activity Rate", fmtPct(es.activityRate), "", "eurostat_activityRate", qid, "Click to see European ranking")}
      ${statCell("Companies", fmtN(es.totalCompanies), "", "eurostat_totalCompanies", qid, "Click to see European ranking")}
    </div>`;
    if (es.medianIncome != null || es.povertyPct != null || es.homeownershipPct != null || es.rentPerSqm != null) {
      html += `<div class="census-section-title" style="margin-top:6px">Living Conditions</div>
    <div class="census-stats-grid" style="grid-template-columns:repeat(2,1fr);margin-top:4px">
      ${statCell("Median Income", fmtEur(es.medianIncome), "census-gold", "eurostat_medianIncome", qid, "Click to see European ranking")}
      ${statCell("At-Risk Poverty", fmtPct(es.povertyPct), povCls, "eurostat_povertyPct", qid, "Click to see European ranking")}
      ${statCell("Homeownership", fmtPct(es.homeownershipPct), "", "eurostat_homeownershipPct", qid, "Click to see European ranking")}
      ${statCell("Rent / m\xB2", es.rentPerSqm != null ? "\u20AC" + es.rentPerSqm.toFixed(1) : "\u2014", "", "eurostat_rentPerSqm", qid, "Click to see European ranking")}
    </div>`;
    }
    if (es.pm10 != null || es.no2 != null || es.greenSpacePct != null || es.roadNoisePct != null) {
      html += `<div class="census-section-title" style="margin-top:6px">Environment & Air Quality</div>
    <div class="census-stats-grid" style="grid-template-columns:repeat(2,1fr);margin-top:4px">
      ${es.pm10 != null ? statCell("PM10", es.pm10.toFixed(1) + " \u03BCg/m\xB3", pm10Cls, "eurostat_pm10", qid, "Click to see European ranking") : ""}
      ${es.no2 != null ? statCell("NO\u2082", es.no2.toFixed(1) + " \u03BCg/m\xB3", no2Cls, "eurostat_no2", qid, "Click to see European ranking") : ""}
      ${es.greenSpacePct != null ? statCell("Green Urban Area", es.greenSpacePct.toFixed(1) + "% land", "", "eurostat_greenSpacePct", qid, "Click to see European ranking") : ""}
      ${es.roadNoisePct != null ? statCell("Road Noise >65dB", es.roadNoisePct.toFixed(1) + "% residents", "", "eurostat_roadNoisePct", qid, "Click to see European ranking") : ""}
    </div>`;
    }
    if (es.publicTransportPerInhab != null || es.carsPerHundred != null || es.hospitalBedsPer100k != null) {
      html += `<div class="census-section-title" style="margin-top:6px">Transport &amp; Health</div>
    <div class="census-stats-grid" style="grid-template-columns:repeat(3,1fr);margin-top:4px">
      ${es.publicTransportPerInhab != null ? statCell("Transit veh-km/p", fmtN(es.publicTransportPerInhab), "", "eurostat_publicTransportPerInhab", qid, "Click to see European ranking") : ""}
      ${es.carsPerHundred != null ? statCell("Cars / 100 people", es.carsPerHundred.toFixed(0), "", "eurostat_carsPerHundred", qid, "Click to see European ranking") : ""}
      ${es.hospitalBedsPer100k != null ? statCell("Hospital beds/100k", fmtN(es.hospitalBedsPer100k), "", "eurostat_hospitalBedsPer100k", qid, "Click to see European ranking") : ""}
    </div>`;
    }
    if (es.tempWarmest != null || es.tempColdest != null || es.rainfallMm != null || es.sunshineHours != null) {
      html += `<div class="census-section-title" style="margin-top:6px">Climate</div>
    <div class="census-stats-grid" style="grid-template-columns:repeat(2,1fr);margin-top:4px">
      ${es.tempWarmest != null ? statCell("Warmest Month", es.tempWarmest.toFixed(1) + "\xB0C", "", "eurostat_tempWarmest", qid, "Click to see European ranking") : ""}
      ${es.tempColdest != null ? statCell("Coldest Month", es.tempColdest.toFixed(1) + "\xB0C", "", "eurostat_tempColdest", qid, "Click to see European ranking") : ""}
      ${es.rainfallMm != null ? statCell("Rainfall/yr", fmtNum(Math.round(es.rainfallMm)) + " mm", "", "eurostat_rainfallMm", qid, "Click to see European ranking") : ""}
      ${es.sunshineHours != null ? statCell("Sunshine", es.sunshineHours.toFixed(1) + " hr/day", "", "eurostat_sunshineHours", qid, "Click to see European ranking") : ""}
    </div>`;
    }
    if (es.touristNights != null || es.museumVisitors != null || es.libraries != null || es.cinemaSeatsPer1k != null) {
      html += `<div class="census-section-title" style="margin-top:6px">Tourism & Culture</div>
    <div class="census-stats-grid" style="grid-template-columns:repeat(2,1fr);margin-top:4px">
      ${es.touristNights != null ? statCell("Tourist Nights", fmtN(es.touristNights), "", "eurostat_touristNights", qid, "Click to see European ranking") : ""}
      ${es.museumVisitors != null ? statCell("Museum Visitors", fmtN(es.museumVisitors), "", "eurostat_museumVisitors", qid, "Click to see European ranking") : ""}
      ${es.libraries != null ? statCell("Public Libraries", fmtN(es.libraries), "", "eurostat_libraries", qid, "Click to see European ranking") : ""}
      ${es.cinemaSeatsPer1k != null ? statCell("Cinema Seats/1k", es.cinemaSeatsPer1k.toFixed(1), "", "", qid) : ""}
    </div>`;
    }
    if (es.medianAge != null || es.popChangePct != null || es.ageDependency != null || es.foreignBornPct != null) {
      const popChangeFmt = (v) => v != null ? (v >= 0 ? "+" : "") + v.toFixed(2) + "%" : "\u2014";
      const popChangeCls = es.popChangePct != null ? es.popChangePct > 0 ? "census-green" : "census-red" : "";
      html += `<div class="census-section-title" style="margin-top:6px">Demographics</div>
    <div class="census-stats-grid" style="grid-template-columns:repeat(2,1fr);margin-top:4px">
      ${es.medianAge != null ? statCell("Median Age", es.medianAge.toFixed(1) + " yrs", "", "eurostat_medianAge", qid, "Click to see European ranking") : ""}
      ${es.popChangePct != null ? statCell("Pop Change/yr", popChangeFmt(es.popChangePct), popChangeCls, "eurostat_popChangePct", qid, "Click to see European ranking") : ""}
      ${es.foreignBornPct != null ? statCell("Foreign-Born", es.foreignBornPct.toFixed(1) + "%", "", "eurostat_foreignBornPct", qid, "Click to see European ranking") : ""}
      ${es.ageDependency != null ? statCell("Age Dependency", es.ageDependency.toFixed(1) + "%", "", "eurostat_ageDependency", qid, "Click to see European ranking") : ""}
    </div>`;
    }
    const TREND_ROWS = [
      { key: "unemploymentHistory", label: "Unemployment", valKey: "unemploymentPct", fmt: fmtPct, color: "#f85149", metric: "eurostat_unemploymentPct" },
      { key: "medianIncomeHistory", label: "Median Income", valKey: "medianIncome", fmt: fmtEur, color: "#f0a500", metric: "eurostat_medianIncome" },
      { key: "povertyHistory", label: "At-Risk Poverty", valKey: "povertyPct", fmt: fmtPct, color: "#ffa657", metric: "eurostat_povertyPct" },
      { key: "activityHistory", label: "Activity Rate", valKey: "activityRate", fmt: fmtPct, color: "#3fb950", metric: "eurostat_activityRate" },
      { key: "homeownershipHistory", label: "Homeownership", valKey: "homeownershipPct", fmt: fmtPct, color: "#58a6ff", metric: "eurostat_homeownershipPct" },
      { key: "rentHistory", label: "Rent / m\xB2", valKey: "rentPerSqm", fmt: (v) => "\u20AC" + v.toFixed(1), color: "#a371f7", metric: "eurostat_rentPerSqm" },
      { key: "companiesHistory", label: "Companies", valKey: "totalCompanies", fmt: fmtN, color: "#79c0ff", metric: "eurostat_totalCompanies" },
      { key: "pm10History", label: "PM10", valKey: "pm10", fmt: (v) => v.toFixed(1) + " \u03BCg/m\xB3", color: "#ff7b72", metric: "eurostat_pm10" },
      { key: "no2History", label: "NO\u2082", valKey: "no2", fmt: (v) => v.toFixed(1) + " \u03BCg/m\xB3", color: "#ffa657", metric: "eurostat_no2" },
      { key: "greenSpacePctHistory", label: "Green Urban Area %", valKey: "greenSpacePct", fmt: (v) => v.toFixed(1) + "%", color: "#3fb950", metric: "eurostat_greenSpacePct" },
      { key: "touristNightsHistory", label: "Tourist Nights", valKey: "touristNights", fmt: fmtN, color: "#e3b341", metric: "eurostat_touristNights" },
      { key: "museumVisitorsHistory", label: "Museum Visitors", valKey: "museumVisitors", fmt: fmtN, color: "#d2a8ff", metric: "eurostat_museumVisitors" },
      { key: "medianAgeHistory", label: "Median Age", valKey: "medianAge", fmt: (v) => v.toFixed(1) + " yrs", color: "#79c0ff", metric: "eurostat_medianAge" },
      { key: "popChangePctHistory", label: "Pop Change/yr", valKey: "popChangePct", fmt: (v) => (v >= 0 ? "+" : "") + v.toFixed(2) + "%", color: "#56d364", metric: "eurostat_popChangePct" }
    ].filter((r) => es[r.key] && es[r.key].length >= 2);
    if (TREND_ROWS.length > 0) {
      html += `<div class="census-section-title" style="margin-top:10px">Trends</div>
    <div class="es-trends">`;
      for (const r of TREND_ROWS) {
        const { svg, range } = _eurostatSparkline(es[r.key], r.color, 110, 28);
        const latestVal = es[r.valKey] != null ? r.fmt(es[r.valKey]) : "\u2014";
        html += `<div class="es-trend-row census-stat-clickable" onclick="openStatsPanel('${r.metric}','${escHtml(qid)}')" title="Click to see European ranking">
        <span class="es-trend-label">${r.label}</span>
        <span class="es-trend-spark">${svg}</span>
        <span class="es-trend-val" style="color:${r.color}">${latestVal}</span>
        <span class="es-trend-range">${range}</span>
      </div>`;
      }
      html += `</div>`;
    }
    html += `<div class="census-source" style="margin-top:8px">Eurostat Urban Audit \xB7 urb_clma \xB7 urb_clivcon \xB7 urb_cecfi \xB7 urb_cenv \xB7 urb_ctour \xB7 urb_cpopstr</div></div>`;
    return html;
  }
  async function openWikiSidebar(qid, cityName) {
    closeCountryPanel();
    const sidebar = document.getElementById("wiki-sidebar");
    const body = document.getElementById("wiki-sidebar-body");
    const footer = document.getElementById("wiki-sidebar-footer");
    const titleEl = document.getElementById("wiki-sidebar-title");
    titleEl.textContent = cityName;
    footer.innerHTML = "";
    sidebar.dataset.qid = qid;
    sidebar.classList.add("open");
    _mobileBackdropOn();
    _updateHash();
    const city = S.cityByQid.get(qid);
    _univLoader.ensure();
    _airportLoader.ensure();
    _aqLoader.ensure();
    _powerLoader.ensure();
    const EU_ISOS = /* @__PURE__ */ new Set(["AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"]);
    if (city?.iso && EU_ISOS.has(city.iso)) _eurostatLoader.ensure();
    if (city?.iso === "US") _noaaLoader.ensure();
    const hasP18 = city?.wiki_images?.some((u) => u.includes("Special:FilePath"));
    if (hasP18 && (city?.wiki_images?.length || city?.wiki_extract)) {
      const wpUrl = city.wikipedia ? `https://en.wikipedia.org/wiki/${encodeURIComponent(city.wikipedia).replace(/%20/g, "_")}` : city.qid ? `https://en.wikipedia.org/wiki/Special:GoToLinkedPage/wikidata/${city.qid}` : null;
      renderInfobox(city, city.wiki_images, { extract: city.wiki_extract ?? null }, wpUrl, true);
      return;
    }
    const _infoEl = document.getElementById("wiki-tab-info");
    const _economyEl = document.getElementById("wiki-tab-economy");
    const _overviewEl = document.getElementById("wiki-tab-overview");
    if (_infoEl) _infoEl.innerHTML = '<div class="skeleton-block"><div class="skeleton skeleton-img"></div><div class="skeleton skeleton-text-lg" style="width:60%"></div><div class="skeleton skeleton-text" style="width:90%"></div><div class="skeleton skeleton-text" style="width:75%"></div><div class="skeleton skeleton-text" style="width:85%"></div><div class="skeleton skeleton-chip"></div><div class="skeleton skeleton-chip"></div><div class="skeleton skeleton-chip"></div></div>';
    if (_economyEl) _economyEl.innerHTML = "";
    if (_overviewEl) _overviewEl.innerHTML = "";
    const _econBtnEl = document.getElementById("wiki-tab-economy-btn");
    const _finBtnEl = document.getElementById("wiki-tab-finance-btn");
    if (_econBtnEl) _econBtnEl.style.display = "none";
    if (_finBtnEl) _finBtnEl.style.display = "none";
    const _safeTab = !VALID_SIDEBAR_TABS.has(S._sidebarTab) || S._sidebarTab === "economy" || S._sidebarTab === "finance" ? "info" : S._sidebarTab;
    switchWikiTab(_safeTab);
    try {
      const wdRes = await fetch(
        `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(qid)}&props=sitelinks&sitefilter=enwiki&format=json&origin=*`
      );
      if (!wdRes.ok) throw new Error(`Wikidata API returned ${wdRes.status}`);
      const wdJson = await wdRes.json();
      const sitelink = wdJson.entities?.[qid]?.sitelinks?.enwiki?.title;
      if (!sitelink) throw new Error("No English Wikipedia article found for this city.");
      const [wpRes, imgListRes, wdClaimsRes] = await Promise.all([
        fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(sitelink)}`),
        fetch("https://en.wikipedia.org/w/api.php?" + new URLSearchParams({
          action: "query",
          prop: "images",
          titles: sitelink,
          imlimit: "30",
          format: "json",
          origin: "*"
        })),
        fetch(`https://www.wikidata.org/w/api.php?` + new URLSearchParams({
          action: "wbgetentities",
          ids: qid,
          props: "claims",
          format: "json",
          origin: "*"
        }))
      ]);
      if (!wpRes.ok) throw new Error(`Wikipedia summary API returned ${wpRes.status}`);
      const wpJson = await wpRes.json();
      const fallbackThumb = wpJson.originalimage?.source ?? wpJson.thumbnail?.source ?? null;
      const wpExtract = wpJson.extract ?? null;
      const wpUrl = wpJson.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(sitelink)}`;
      let wpExtra = { extract: wpExtract };
      try {
        const wdClaims = await wdClaimsRes.json();
        const claims = wdClaims.entities?.[qid]?.claims ?? {};
        const gdpVal = claims.P2131?.[0]?.mainsnak?.datavalue?.value?.amount;
        if (gdpVal) {
          const n = Math.abs(parseFloat(gdpVal));
          wpExtra.gdp = n >= 1e12 ? (n / 1e12).toFixed(2) + " trillion" : n >= 1e9 ? (n / 1e9).toFixed(1) + " billion" : n >= 1e6 ? (n / 1e6).toFixed(1) + " million" : fmtNum(Math.round(n));
        }
        const hdiVal = claims.P1081?.[0]?.mainsnak?.datavalue?.value?.amount;
        if (hdiVal) wpExtra.hdi = parseFloat(hdiVal);
        const nickClaims = claims.P1449 ?? [];
        const nickEn = nickClaims.find((c) => c.mainsnak?.datavalue?.value?.language === "en");
        if (nickEn) wpExtra.nickname = nickEn.mainsnak.datavalue.value.text;
        const p18file = claims.P18?.[0]?.mainsnak?.datavalue?.value;
        if (p18file) {
          const fname = p18file.replace(/ /g, "_");
          wpExtra.p18Image = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fname)}?width=900`;
        }
      } catch {
      }
      let images = [];
      try {
        const imgListJson = await imgListRes.json();
        const pageKey = Object.keys(imgListJson.query?.pages ?? {})[0];
        const rawImgs = imgListJson.query?.pages?.[pageKey]?.images ?? [];
        const candidates = rawImgs.filter((img) => /\.(jpe?g|png|webp)$/i.test(img.title)).filter((img) => !IMG_EXCLUDE.test(img.title)).slice(0, 12);
        if (candidates.length > 0) {
          const infoRes = await fetch(
            "https://en.wikipedia.org/w/api.php?" + new URLSearchParams({
              action: "query",
              prop: "imageinfo",
              iiprop: "url|size",
              titles: candidates.map((t) => t.title).join("|"),
              iiurlwidth: "900",
              format: "json",
              origin: "*"
            })
          );
          const infoJson = await infoRes.json();
          images = Object.values(infoJson.query?.pages ?? {}).filter((p) => {
            const i = p.imageinfo?.[0];
            return i && i.width >= 300 && i.height >= 200;
          }).map((p) => p.imageinfo[0].thumburl ?? p.imageinfo[0].url).filter(Boolean).slice(0, 8);
        }
      } catch {
      }
      if (wpExtra.p18Image) {
        images = images.filter((u) => u !== wpExtra.p18Image && u !== fallbackThumb);
        images.unshift(wpExtra.p18Image);
      } else if (fallbackThumb && !images.includes(fallbackThumb)) {
        images.unshift(fallbackThumb);
      }
      if (city) {
        renderInfobox(city, images, wpExtra, wpUrl, false);
      } else {
        body.innerHTML = `
        <div>
          ${images[0] ? `<img class="wiki-img" src="${escHtml(images[0])}" alt="" style="width:100%;max-height:220px;object-fit:cover;display:block" />` : ""}
          <div style="padding:16px;font-size:0.85rem;line-height:1.65;color:var(--text-body)">${escHtml(wpExtra?.extract ?? "")}</div>
        </div>`;
        footer.innerHTML = `<a class="wiki-footer-link" href="${escHtml(wpUrl)}" target="_blank" rel="noopener">Read full article on Wikipedia \u2197</a>`;
      }
      if (images.length || wpExtract) {
        fetch("/api/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ qid, wiki_thumb: images[0] ?? null, wiki_extract: wpExtract, wiki_images: images })
        }).then((r) => r.json()).then((json) => {
          if (json.changed && city) {
            if (images.length) city.wiki_images = images;
            if (images[0]) city.wiki_thumb = images[0];
            if (wpExtract) city.wiki_extract = wpExtract;
          }
        }).catch(() => {
        });
      }
    } catch (err) {
      if (city) {
        renderInfobox(city, [], {}, null, false);
        const errNote = document.createElement("div");
        errNote.className = "wiki-error";
        errNote.innerHTML = `<em>Could not load Wikipedia article: ${escHtml(err.message)}</em><br/>
        <a href="https://www.wikidata.org/wiki/Special:GoToLinkedPage/enwiki/${qid}" target="_blank" rel="noopener">Try opening Wikipedia directly \u2197</a>`;
        document.getElementById("wiki-sidebar-body").appendChild(errNote);
      } else {
        body.innerHTML = `<div class="wiki-error">${escHtml(err.message)}<br/>
        <a href="https://www.wikidata.org/wiki/Special:GoToLinkedPage/enwiki/${qid}" target="_blank" rel="noopener">Try opening Wikipedia directly \u2197</a></div>`;
      }
    }
  }
  function _swapTileLayer() {
    if (!S._tileLayer || !S.map) return;
    S.map.removeLayer(S._tileLayer);
    const theme = document.documentElement.getAttribute("data-theme") || "dark";
    let key = S._basemap;
    if (key === "street") key = theme === "dark" ? "street_dark" : "street_light";
    const opts = {
      attribution: BASEMAP_ATTR[key],
      subdomains: "abcd",
      maxZoom: 20
    };
    let tileKey = key;
    if (key === "terrain" && _terrainFallbackActive) {
      tileKey = "terrain_fallback";
      opts.attribution = BASEMAP_ATTR.terrain_fallback;
    }
    if (key === "terrain") {
      opts.errorTileUrl = _errorTileDataUrl;
    }
    S._tileLayer = L.tileLayer(BASEMAP_URLS[tileKey], opts).addTo(S.map);
    if (key === "terrain") {
      let errorCount = 0;
      S._tileLayer.on("tileerror", (err) => {
        errorCount++;
        if (err.tile) {
          err.tile.src = _errorTileDataUrl;
        }
        if (errorCount >= 3 && !_terrainFallbackActive) {
          _terrainFallbackActive = true;
          console.warn("OpenTopoMap unavailable, switching to ESRI World Topo");
          setTimeout(() => _swapTileLayer(), 100);
        }
      });
    }
  }
  function setBasemap(mode) {
    S._basemap = mode;
    localStorage.setItem("wdm_basemap", mode);
    _swapTileLayer();
  }
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    document.querySelector('meta[name="color-scheme"]').content = theme;
    const btn = document.getElementById("theme-toggle");
    if (btn) btn.textContent = theme === "dark" ? "\u{1F319}" : "\u2600\uFE0F";
    _swapTileLayer();
    localStorage.setItem("wdm_theme", theme);
  }
  function toggleTheme() {
    const cur = document.documentElement.getAttribute("data-theme") || "dark";
    applyTheme(cur === "dark" ? "light" : "dark");
  }
  function _updateHash() {
    clearTimeout(_hashUpdateTimer);
    _hashUpdateTimer = setTimeout(() => {
      const parts = [];
      const sidebarQid = document.getElementById("wiki-sidebar")?.dataset.qid;
      if (sidebarQid && document.getElementById("wiki-sidebar")?.classList.contains("open")) {
        parts.push("city=" + sidebarQid);
      }
      if (S._cpCurrentIso2) parts.push("country=" + S._cpCurrentIso2);
      if (S.choroOn) {
        parts.push("choro=" + S.activeChoroKey);
        if (S._choroYear) parts.push("year=" + S._choroYear);
      }
      const hash = parts.length ? "#" + parts.join("&") : "";
      if (window.location.hash !== hash) {
        history.replaceState(null, "", hash || window.location.pathname);
      }
    }, 300);
  }
  function _restoreFromHash() {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const params = {};
    hash.split("&").forEach((part) => {
      const [k, v] = part.split("=");
      if (k && v) params[k] = decodeURIComponent(v);
    });
    if (params.choro) {
      S.activeChoroKey = params.choro;
      if (params.year) S._choroYear = parseInt(params.year);
      S._hashRestoreChoro = true;
    }
    if (params.city) S._hashRestoreCity = params.city;
    if (params.country) S._hashRestoreCountry = params.country;
  }
  function _initKeyboardNav() {
    document.addEventListener("keydown", (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.isComposing) return;
      switch (e.key) {
        case "Escape": {
          const panels = [
            { el: "country-compare-panel", close: () => closeCountryCompare() },
            { el: "compare-panel", close: () => closeComparePanel() },
            { el: "wiki-sidebar", check: "open", close: () => closeWikiSidebar() },
            { el: "country-panel", check: "open", close: () => {
              document.getElementById("country-panel").classList.remove("open");
              S._cpCurrentIso2 = null;
            } },
            { el: "corp-panel", check: "open", close: () => closeCorpPanel() },
            { el: "stats-panel", check: "open", close: () => closeStatsPanel() },
            { el: "trade-panel", check: "open", close: () => closeTradePanelFn() },
            { el: "filter-panel", check: "open", close: () => toggleFilterPanel() },
            { el: "fx-sidebar", check: "open", close: () => toggleFxSidebar() },
            { el: "bookmarks-panel", check: "visible", close: () => toggleBookmarksPanel() }
          ];
          for (const p of panels) {
            const el = document.getElementById(p.el);
            if (!el) continue;
            if (p.check === "open" && el.classList.contains("open")) {
              p.close();
              e.preventDefault();
              return;
            }
            if (p.check === "visible" && el.classList.contains("visible")) {
              p.close();
              e.preventDefault();
              return;
            }
            if (!p.check && el.classList.contains("visible")) {
              p.close();
              e.preventDefault();
              return;
            }
          }
          break;
        }
        case "/":
          e.preventDefault();
          document.getElementById("city-search-input")?.focus();
          break;
        case "?":
          _toggleKeyboardHelp();
          break;
        case "t":
          toggleTheme();
          break;
        case "1":
        case "2":
        case "3":
        case "4": {
          const tabs = ["info", "overview", "economy", "finance"];
          const idx = parseInt(e.key) - 1;
          if (document.getElementById("wiki-sidebar")?.classList.contains("open")) {
            switchWikiTab(tabs[idx]);
            e.preventDefault();
          }
          break;
        }
        case "ArrowLeft":
        case "ArrowRight": {
          const sel = document.getElementById("choro-select");
          if (sel && S.choroOn) {
            const dir = e.key === "ArrowLeft" ? -1 : 1;
            const newIdx = Math.max(0, Math.min(sel.options.length - 1, sel.selectedIndex + dir));
            if (newIdx !== sel.selectedIndex) {
              sel.selectedIndex = newIdx;
              sel.dispatchEvent(new Event("change"));
            }
            e.preventDefault();
          }
          break;
        }
      }
    });
  }
  function _toggleKeyboardHelp() {
    let overlay = document.getElementById("keyboard-help");
    if (overlay) {
      overlay.remove();
      return;
    }
    overlay = document.createElement("div");
    overlay.id = "keyboard-help";
    overlay.className = "keyboard-help-overlay";
    overlay.innerHTML = `<div class="keyboard-help-card"><h3>Keyboard Shortcuts</h3><div class="kb-row"><kbd>Esc</kbd> Close topmost panel</div><div class="kb-row"><kbd>/</kbd> Focus search</div><div class="kb-row"><kbd>?</kbd> Toggle this help</div><div class="kb-row"><kbd>t</kbd> Toggle dark/light theme</div><div class="kb-row"><kbd>1-4</kbd> Switch sidebar tabs</div><div class="kb-row"><kbd>\u2190 \u2192</kbd> Cycle choropleth indicator</div><button onclick="document.getElementById('keyboard-help').remove()">Close</button></div>`;
    overlay.addEventListener("click", (ev) => {
      if (ev.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  }
  async function init() {
    showLoading(true, "Loading world S.map\u2026");
    S.map = L.map("map-container", {
      center: [20, 0],
      zoom: 2,
      minZoom: 2,
      maxZoom: 18,
      zoomControl: true,
      attributionControl: true,
      maxBounds: [[-88, -185], [88, 185]],
      // hard stop just past antimeridian
      maxBoundsViscosity: 1,
      // no elasticity — tiles always fill the view
      worldCopyJump: false
    });
    S.map.createPane("choroplethPane");
    S.map.getPane("choroplethPane").style.zIndex = 350;
    S.map.createPane("admin1Pane");
    S.map.getPane("admin1Pane").style.zIndex = 370;
    S.map.createPane("tradePane");
    S.map.getPane("tradePane").style.zIndex = 390;
    S.map.createPane("cityPane");
    S.map.getPane("cityPane").style.zIndex = 400;
    S.map.createPane("cryptoPane");
    S.map.getPane("cryptoPane").style.zIndex = 410;
    S.map.createPane("econPane");
    S.map.getPane("econPane").style.zIndex = 420;
    S.map.createPane("overlayLayersPane");
    S.map.getPane("overlayLayersPane").style.zIndex = 430;
    const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
    const TILE_OPTS = { attribution: TILE_ATTR, subdomains: "abcd", maxZoom: 20 };
    S._tileLayer = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", TILE_OPTS).addTo(S.map);
    S._tileAttr = TILE_ATTR;
    S._tileOpts = TILE_OPTS;
    const savedBasemap = localStorage.getItem("wdm_basemap") || "street";
    if (savedBasemap !== "street") {
      S._basemap = savedBasemap;
      const bmSel = document.getElementById("basemap-select");
      if (bmSel) bmSel.value = savedBasemap;
    }
    const savedTheme = localStorage.getItem("wdm_theme") || "dark";
    if (savedTheme !== "dark") applyTheme(savedTheme);
    else if (savedBasemap !== "street") _swapTileLayer();
    const savedCitiesMode = localStorage.getItem("wdm_citiesMode") || "show";
    if (savedCitiesMode !== "show") setCityDotMode(savedCitiesMode);
    _initPopSlider();
    _initKeyboardNav();
    _restoreFromHash();
    window.addEventListener("hashchange", () => _restoreFromHash());
    let _econZoomDebounce = null;
    S.map.on("zoomend", () => {
      if (S._heatmapLayer && S._heatmapMetric) {
        const z = S.map.getZoom();
        const radius = Math.max(10, S._heatRadius - (z - 5) * 3);
        const blur = Math.max(5, S._heatBlur - (z - 5) * 2);
        S._heatmapLayer.setOptions({ radius, blur, minOpacity: S._heatMinOpacity });
      }
      if (S.econOn) {
        clearTimeout(_econZoomDebounce);
        _econZoomDebounce = setTimeout(() => buildEconLayer(), 150);
      }
    });
    S.map.on("click", () => {
      if (!S._drawActive) {
        closeTradePanelFn();
        closeCountryPopup();
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (S._drawActive || S._drawPolygon) _drawClear();
        closeCountryPopup();
        const menu = document.getElementById("more-layers-menu");
        const btn = document.getElementById("more-layers-btn");
        if (menu) menu.classList.remove("open");
        if (btn) btn.classList.remove("open");
      }
    });
    document.addEventListener("click", (e) => {
      const dropdown = document.getElementById("more-layers-dropdown");
      if (dropdown && !dropdown.contains(e.target)) {
        const menu = document.getElementById("more-layers-menu");
        const btn = document.getElementById("more-layers-btn");
        if (menu) menu.classList.remove("open");
        if (btn) btn.classList.remove("open");
      }
    });
    const terminator = L.terminator({
      fillColor: "#0a0f1a",
      fillOpacity: 0.45,
      color: "#334155",
      weight: 1,
      opacity: 0.6,
      interactive: false
    }).addTo(S.map);
    setInterval(() => terminator.setTime(/* @__PURE__ */ new Date()), 6e4);
    showLoading(true, "Loading city dataset\u2026");
    try {
      let _matchCityQid = function(name, isoOrCountry) {
        var key = (name + "|" + isoOrCountry).toLowerCase();
        if (_cityNameIdx[key]) return _cityNameIdx[key];
        var iso = _countryNameToIso[isoOrCountry.toLowerCase()];
        if (iso) {
          key = (name + "|" + iso).toLowerCase();
          if (_cityNameIdx[key]) return _cityNameIdx[key];
        }
        return null;
      }, _loadCityArrayFromUrl = function(url, label, assign) {
        var stem = url.replace(/^\//, "").replace(/\.json(\?.*)?$/, "");
        var kdbData = _kdbGet(stem);
        if (kdbData !== null) {
          if (Array.isArray(kdbData)) {
            var matched = 0;
            for (var i = 0; i < kdbData.length; i++) {
              var qid = _matchCityQid(kdbData[i].city, kdbData[i].country);
              if (qid) {
                assign(qid, kdbData[i]);
                matched++;
              }
            }
            console.log("[kdb] " + label + ": " + matched + "/" + kdbData.length + " matched to cities");
          }
          return Promise.resolve();
        }
        return fetch(url).then(function(res) {
          if (!res.ok) return;
          return res.json().then(function(arr) {
            if (!Array.isArray(arr)) return;
            var matched2 = 0;
            for (var i2 = 0; i2 < arr.length; i2++) {
              var qid2 = _matchCityQid(arr[i2].city, arr[i2].country);
              if (qid2) {
                assign(qid2, arr[i2]);
                matched2++;
              }
            }
            console.log("[lazy] " + label + ": " + matched2 + "/" + arr.length + " matched to cities");
          });
        }).catch(function() {
          console.warn("[lazy] " + label + " failed to load");
        });
      };
      const [citiesRes, countryRes] = await Promise.all([
        fetch("/cities-full.json"),
        fetch("/country-data.json").catch(() => null)
      ]);
      if (!citiesRes.ok) throw new Error("Could not load cities-full.json (HTTP " + citiesRes.status + ")");
      var raw = await citiesRes.json();
      S.rawCities = validateCities(raw);
      S.rawCities.forEach((c) => {
        c._key = cityKey(c);
      });
      migrateEditKeys(S.rawCities);
      if (countryRes && countryRes.ok) {
        try {
          S.countryData = await countryRes.json();
          console.log(`[init] Country data loaded (${Object.keys(S.countryData).length} countries)`);
          _buildCountryDataCaches();
        } catch {
          console.warn("[init] country-data.json is malformed \u2014 World Bank data will be unavailable");
        }
      } else {
        console.info('[init] country-data.json not found \u2014 run "npm run fetch-country" to enable World Bank indicators');
      }
      var _cityNameIdx = {};
      for (var _ci = 0; _ci < S.rawCities.length; _ci++) {
        var _c = S.rawCities[_ci];
        var _k = (_c.name + "|" + (_c.iso || "")).toLowerCase();
        if (!_cityNameIdx[_k]) _cityNameIdx[_k] = _c.qid;
      }
      var _countryNameToIso = {};
      for (var _iso in S.countryData) {
        var _cdata = S.countryData[_iso];
        if (_cdata && _cdata.name) {
          _countryNameToIso[_cdata.name.toLowerCase()] = _iso;
        }
      }
      const _backgroundLoad = () => {
        const _bg = [
          { url: "/census-cities.json", assign: (d) => {
            S.censusCities = d;
            document.getElementById("census-color-bar").style.display = "flex";
          } },
          { url: "/census-business.json", assign: (d) => {
            S.censusBusiness = d;
          } },
          { url: "/bea-trade.json", assign: (d) => {
            S.beaTradeData = d;
          } },
          { url: "/gawc-cities.json", assign: (d) => {
            S.gawcCities = d;
          } },
          { url: "/japan-prefectures.json", assign: (d) => {
            S.japanPrefData = d;
          } },
          { url: "/zillow-cities.json", assign: (d) => {
            S.zillowData = d;
          } },
          { url: "/climate-extra.json", assign: (d) => {
            S.climateExtra = d;
          } },
          { url: "/ecb-data.json", assign: (d) => {
            S.ecbData = d;
          } },
          { url: "/ecb-bonds.json", assign: (d) => {
            S.ecbBonds = d;
          } },
          { url: "/boj-yields.json", assign: (d) => {
            S.bojData = d;
          } },
          { url: "/oecd-country.json", assign: (d) => {
            S.oecdData = d;
          } },
          { url: "/comtrade-partners.json", assign: (d) => {
            S.comtradeData = d;
          } },
          { url: "/us-states.json", assign: (d) => {
            S.usStatesData = d;
          } },
          { url: "/eurostat-regions.json", assign: (d) => {
            S.eurostatRegions = d;
          } },
          { url: "/canada-provinces.json", assign: (d) => {
            S.canadaProvinces = d;
          } },
          { url: "/australia-states.json", assign: (d) => {
            S.australiaStates = d;
          } },
          { url: "/fbi-crime.json", assign: (d) => {
            S.fbiCrimeData = d;
          } },
          { url: "/eci-data.json", assign: (d) => {
            S.eciData = d;
          } },
          { url: "/admin1/_index.json", assign: (d) => {
            S.admin1Index = d;
          } },
          { url: "/subnational-hdi.json", assign: (d) => {
            S.subnatHdiData = d;
          } },
          { url: "/unesco.json", assign: (d) => {
            S.unescoSites = d;
          } }
        ];
        _bg.forEach((item) => {
          var stem = item.url.replace(/^\//, "").replace(/\.json(\?.*)?$/, "");
          var kdbData = _kdbGet(stem);
          if (kdbData !== null) {
            item.assign(kdbData);
            console.log("[kdb] " + stem + " loaded");
            return;
          }
          fetch(item.url).then((r) => r.ok ? r.json() : Promise.reject()).then((d) => {
            item.assign(d);
            console.log(`[lazy] ${item.url} loaded`);
          }).catch(() => {
            console.warn(`[lazy] ${item.url} failed`);
          });
        });
        _loadCityArrayFromUrl("/ports.json", "Ports", function(qid, d) {
          S.portData[qid] = { port: d.port, teu_millions: d.teu_millions, teu_year: d.teu_year, rank: d.rank };
        });
        _loadCityArrayFromUrl("/tourism.json", "Tourism", function(qid, d) {
          S.tourismData[qid] = { visitors_millions: d.visitors_millions, year: d.year, rank: d.rank };
        });
        _loadCityArrayFromUrl("/metro-ridership.json", "Metro", function(qid, d) {
          S.metroData[qid] = { system: d.system, ridership_millions: d.ridership_millions, lines: d.lines, stations: d.stations, rank: d.rank };
        });
        _loadCityArrayFromUrl("/patents.json", "Patents", function(qid, d) {
          S.patentData[qid] = { patents_annual: d.patents_annual, year: d.year, rank: d.rank, top_fields: d.top_fields };
        });
        _loadCityArrayFromUrl("/cost-of-living.json", "Cost of Living", function(qid, d) {
          S.colData[qid] = { col_index: d.col_index, rent_index: d.rent_index, grocery_index: d.grocery_index, restaurant_index: d.restaurant_index, col_rank: d.col_rank };
        });
        _loadCityArrayFromUrl("/startups.json", "Startups", function(qid, d) {
          S.startupData[qid] = { unicorns: d.unicorns, total_funding_bn: d.total_funding_bn, ecosystem_rank: d.ecosystem_rank, top_startups: d.top_startups };
        });
        var _uniStem = "uni-rankings";
        var _uniKdb = _kdbGet(_uniStem);
        if (_uniKdb !== null && Array.isArray(_uniKdb)) {
          for (var ri = 0; ri < _uniKdb.length; ri++) {
            S.uniRankings[_uniKdb[ri].qid] = { qs_rank: _uniKdb[ri].qs_rank, the_rank: _uniKdb[ri].the_rank };
          }
          console.log("[kdb] University rankings loaded: " + _uniKdb.length);
        } else {
          fetch("/uni-rankings.json").then((r) => r.ok ? r.json() : Promise.reject()).then(function(ranks) {
            for (var ri2 = 0; ri2 < ranks.length; ri2++) {
              S.uniRankings[ranks[ri2].qid] = { qs_rank: ranks[ri2].qs_rank, the_rank: ranks[ri2].the_rank };
            }
            console.log("[lazy] University rankings loaded: " + ranks.length);
          }).catch(function() {
            console.warn("[lazy] University rankings failed");
          });
        }
      };
      _backgroundLoad();
      applyOverrides();
      rebuildMapLayer();
      S.map.off("click", _cpMapClickHandler);
      S.map.on("click", _cpMapClickHandler);
      initChoroControls();
      S._choroControlsInited = true;
      updateStats();
      _companiesLoader.ensure().then(() => rebuildMapLayer()).catch(() => {
      });
      showLoading(false);
      S.map.on("click", function() {
        var tb = document.getElementById("topbar");
        if (tb) tb.classList.remove("mobile-open");
        var mbtn = document.getElementById("mobile-topbar-toggle");
        if (mbtn) mbtn.classList.remove("open");
      });
      if (S._hashRestoreCity) {
        const qid = S._hashRestoreCity;
        const city = S.cityByQid.get(qid);
        if (city) openWikiSidebar(qid, city.name);
        S._hashRestoreCity = null;
      }
      if (S._hashRestoreCountry) {
        const iso2 = S._hashRestoreCountry;
        if (S.countryData[iso2]) openCountryPanel(iso2);
        S._hashRestoreCountry = null;
      }
      if (S._hashRestoreChoro) {
        toggleChoropleth();
        S._hashRestoreChoro = false;
      }
      document.getElementById("trade-year-slider").addEventListener("input", function() {
        const iso2 = this.dataset.iso2;
        const data = tradeCache[iso2];
        if (!data) return;
        const yr = parseInt(this.value, 10);
        _updateTradePanelNumbers(iso2, data, yr);
        drawTradeArrows(iso2, data, yr);
      });
      if (!_fxLoadFromLS()) {
        const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
        const dateEl = document.getElementById("fx-date");
        if (dateEl && !dateEl.value) dateEl.value = today;
        fxFetchRates().catch(() => {
        });
      }
      populateCountryFilter();
      document.getElementById("f-search").addEventListener("input", applyFilters);
      document.getElementById("f-country").addEventListener("change", applyFilters);
      document.getElementById("f-minpop").addEventListener("change", applyFilters);
      document.getElementById("f-sort").addEventListener("change", applyFilters);
      document.getElementById("load-more-btn").addEventListener("click", function() {
        S.visibleCount += PAGE_SIZE;
        renderRows();
      });
      initHeaderSort();
      S.filtered = [...S.allCities];
      renderRows();
      document.getElementById("list-panel").style.display = "";
      document.getElementById("global-corp-panel").style.display = "none";
      if (Object.keys(S.companiesData).length) {
        document.getElementById("econ-bar").style.display = "";
        buildGlobalCorpList();
      }
    } catch (err) {
      showLoadingError(err.message);
    }
  }
  function choroLerpRGB(c0, c1, t) {
    return [
      Math.round(c0[0] + (c1[0] - c0[0]) * t),
      Math.round(c0[1] + (c1[1] - c0[1]) * t),
      Math.round(c0[2] + (c1[2] - c0[2]) * t)
    ];
  }
  function _choroHistValue(iso2, ind) {
    if (S._choroYear == null || !ind.histKey) return null;
    const c = S.countryData[iso2];
    if (!c) return null;
    const hist = c[ind.histKey];
    if (!Array.isArray(hist)) return null;
    for (let i = hist.length - 1; i >= 0; i--) {
      if (hist[i][0] <= S._choroYear) return hist[i][1];
    }
    return null;
  }
  function choroRange(indicatorKey, ind) {
    let min = Infinity, max = -Infinity;
    for (const iso of Object.keys(S.countryData)) {
      const v = S._choroYear != null && ind && ind.histKey ? _choroHistValue(iso, ind) : S.countryData[iso][indicatorKey];
      if (v != null && isFinite(v)) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    return min <= max ? { min, max } : null;
  }
  function choroColor(iso2, ind, range) {
    const c = S.countryData[iso2];
    if (!c) return "#1c2128";
    const v = S._choroYear != null && ind.histKey ? _choroHistValue(iso2, ind) : c[ind.key];
    if (v == null || !isFinite(v)) return "#1c2128";
    const t = range ? Math.max(0, Math.min(1, (v - range.min) / (range.max - range.min))) : 0.5;
    const [r, g, b] = choroLerpRGB(ind.c0, ind.c1, t);
    return `rgb(${r},${g},${b})`;
  }
  function buildChoropleth() {
    if (!S.worldGeo || !S.choroOn) return;
    if (S.choroplethLayer) {
      S.map.removeLayer(S.choroplethLayer);
      S.choroplethLayer = null;
    }
    S._choroLayerByIso = {};
    const ind = CHORO_INDICATORS.find((i) => i.key === S.activeChoroKey) || CHORO_INDICATORS[0];
    const range = choroRange(ind.key, ind);
    let covered = 0;
    S.choroplethLayer = L.geoJSON(S.worldGeo, {
      pane: "choroplethPane",
      style: function(feature) {
        const iso2 = feature.properties && feature.properties.iso2;
        const rawV = S._choroYear != null && ind.histKey ? _choroHistValue(iso2, ind) : S.countryData[iso2] && S.countryData[iso2][ind.key];
        const hasData = iso2 && rawV != null;
        if (hasData) covered++;
        return {
          fillColor: choroColor(iso2, ind, range),
          fillOpacity: hasData ? 0.7 : 0.12,
          color: "#30363d",
          weight: 0.6,
          opacity: 0.8
        };
      },
      onEachFeature: function(feature, layer) {
        const iso2 = feature.properties && feature.properties.iso2;
        if (iso2) S._choroLayerByIso[iso2] = layer;
        layer.on({
          mouseover: function(e) {
            if (S._choroHoverTarget && S._choroHoverTarget !== e.target) {
              try {
                S.choroplethLayer.resetStyle(S._choroHoverTarget);
              } catch (ex) {
              }
            }
            S._choroHoverTarget = e.target;
            e.target.setStyle({ weight: 1.5, color: "#58a6ff", fillOpacity: e.target.options.fillOpacity + 0.15 });
          },
          mouseout: function(e) {
            var liso = e.target.feature && e.target.feature.properties && e.target.feature.properties.iso2;
            if (liso !== S._cpCurrentIso2) {
              S.choroplethLayer.resetStyle(e.target);
            }
            if (S._choroHoverTarget === e.target) S._choroHoverTarget = null;
          },
          click: function(e) {
            L.DomEvent.stopPropagation(e);
            openCountryPanel(iso2);
          }
        });
      }
    }).addTo(S.map);
    if (S.wikiLayer) {
      S.map.removeLayer(S.wikiLayer);
      S.wikiLayer.addTo(S.map);
    }
    updateChoroLegend(ind, range, covered);
  }
  function _restyleChoropleth() {
    if (!S.choroplethLayer || !S.worldGeo || !S.choroOn) {
      buildChoropleth();
      return;
    }
    var ind = CHORO_INDICATORS.find(function(i) {
      return i.key === S.activeChoroKey;
    }) || CHORO_INDICATORS[0];
    var range = choroRange(ind.key, ind);
    var covered = 0;
    S.choroplethLayer.eachLayer(function(layer) {
      var iso2 = layer.feature && layer.feature.properties && layer.feature.properties.iso2;
      var rawV = S._choroYear != null && ind.histKey ? _choroHistValue(iso2, ind) : S.countryData[iso2] && S.countryData[iso2][ind.key];
      var hasData = iso2 && rawV != null;
      if (hasData) covered++;
      layer.setStyle({
        fillColor: choroColor(iso2, ind, range),
        fillOpacity: hasData ? 0.7 : 0.12
      });
    });
    updateChoroLegend(ind, range, covered);
  }
  function updateChoroLegend(ind, range, covered) {
    const lo = document.getElementById("choro-lo-label");
    const hi = document.getElementById("choro-hi-label");
    const cv = document.getElementById("choro-coverage");
    const canvas = document.getElementById("choro-ramp");
    const ctx = canvas.getContext("2d");
    if (range) {
      lo.textContent = ind.fmt(range.min);
      hi.textContent = ind.fmt(range.max);
    } else {
      lo.textContent = "\u2014";
      hi.textContent = "\u2014";
    }
    cv.textContent = covered ? `(${covered} countries)` : "";
    const grad = ctx.createLinearGradient(0, 0, 120, 0);
    for (let s = 0; s <= 10; s++) {
      const t = s / 10;
      const [r, g, b] = choroLerpRGB(ind.c0, ind.c1, t);
      grad.addColorStop(t, `rgb(${r},${g},${b})`);
    }
    ctx.clearRect(0, 0, 120, 8);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 120, 8);
  }
  function _updateChoroSliderVisibility() {
    var ind = CHORO_INDICATORS.find(function(i) {
      return i.key === S.activeChoroKey;
    });
    var sliderEl = document.getElementById("choro-time-slider");
    if (!sliderEl) return;
    if (ind && ind.histKey) {
      sliderEl.style.display = "";
      var rangeEl = document.getElementById("choro-year-range");
      var minYear = 9999, maxYear = 0;
      for (var iso in S.countryData) {
        var hist = S.countryData[iso][ind.histKey];
        if (!Array.isArray(hist) || !hist.length) continue;
        var first = hist[0][0], last = hist[hist.length - 1][0];
        if (typeof first === "number" && first < minYear) minYear = first;
        if (typeof last === "number" && last > maxYear) maxYear = last;
      }
      if (minYear < maxYear) {
        rangeEl.min = minYear;
        rangeEl.max = maxYear;
        rangeEl.value = maxYear;
      }
      document.getElementById("choro-year-label").textContent = "Year: Latest";
    } else {
      sliderEl.style.display = "none";
    }
  }
  function _onChoroYearChange() {
    var rangeEl = document.getElementById("choro-year-range");
    var year = parseInt(rangeEl.value, 10);
    var maxYear = parseInt(rangeEl.max, 10);
    if (year >= maxYear) {
      S._choroYear = null;
      document.getElementById("choro-year-label").textContent = "Year: Latest";
    } else {
      S._choroYear = year;
      document.getElementById("choro-year-label").textContent = "Year: " + year;
    }
    _restyleChoropleth();
  }
  function _stopChoroPlay() {
    if (S._choroPlayTimer) {
      clearInterval(S._choroPlayTimer);
      S._choroPlayTimer = null;
    }
    var btn = document.getElementById("choro-play-btn");
    if (btn) btn.textContent = "\u25B6";
  }
  function toggleChoroPlay() {
    if (S._choroPlayTimer) {
      _stopChoroPlay();
      return;
    }
    var rangeEl = document.getElementById("choro-year-range");
    var minY = parseInt(rangeEl.min, 10);
    var maxY = parseInt(rangeEl.max, 10);
    var cur = parseInt(rangeEl.value, 10);
    if (cur >= maxY) cur = minY;
    rangeEl.value = cur;
    S._choroYear = cur;
    document.getElementById("choro-year-label").textContent = "Year: " + cur;
    _restyleChoropleth();
    var btn = document.getElementById("choro-play-btn");
    if (btn) btn.textContent = "\u23F8";
    S._choroPlayTimer = setInterval(function() {
      cur++;
      if (cur > maxY) {
        _stopChoroPlay();
        S._choroYear = null;
        rangeEl.value = maxY;
        document.getElementById("choro-year-label").textContent = "Year: Latest";
        _restyleChoropleth();
        return;
      }
      rangeEl.value = cur;
      S._choroYear = cur;
      document.getElementById("choro-year-label").textContent = "Year: " + cur;
      _restyleChoropleth();
    }, 600);
  }
  function openCountryPanel(iso2) {
    if (!iso2) return;
    const c = S.countryData[iso2];
    if (!c) return;
    document.getElementById("wiki-sidebar").classList.remove("open");
    if (typeof closeComparePanel === "function") closeComparePanel();
    if (typeof closeCountryCompare === "function") closeCountryCompare();
    if (S._cpCurrentIso2) {
      document.getElementById("country-panel").classList.remove("open");
    }
    S._cpCurrentIso2 = iso2;
    _informLoader.ensure();
    _gtdLoader.ensure();
    _cryptoLoader.ensure();
    if (typeof _renderCountryPanel === "function") _renderCountryPanel(iso2);
    document.getElementById("country-panel").classList.add("open");
    _mobileBackdropOn();
    _updateHash();
    const _spEl = document.getElementById("stats-panel");
    if (_spEl && _spEl.classList.contains("open")) _spEl.style.right = "600px";
    if (S.choroplethLayer) {
      if (S._cpHighlightedLayer) {
        try {
          S.choroplethLayer.resetStyle(S._cpHighlightedLayer);
        } catch (ex) {
        }
      }
      S._cpHighlightedLayer = S._choroLayerByIso[iso2] || null;
      if (S._cpHighlightedLayer) S._cpHighlightedLayer.setStyle({ weight: 2.5, color: "#58a6ff" });
    }
    if (S._cpEscListener) document.removeEventListener("keydown", S._cpEscListener);
    S._cpEscListener = function(e) {
      if (e.key === "Escape") closeCountryPanel();
    };
    document.addEventListener("keydown", S._cpEscListener);
    if (typeof _loadAndShowTrade === "function") _loadAndShowTrade(iso2, c.name || iso2);
  }
  function closeCountryPanel() {
    if (!S._cpCurrentIso2) return;
    S._cpCurrentIso2 = null;
    document.getElementById("country-panel").classList.remove("open");
    _mobileBackdropOff();
    _updateHash();
    if (S._cpEscListener) {
      document.removeEventListener("keydown", S._cpEscListener);
      S._cpEscListener = null;
    }
    if (S.choroplethLayer && S._cpHighlightedLayer) {
      try {
        S.choroplethLayer.resetStyle(S._cpHighlightedLayer);
      } catch (ex) {
      }
      S._cpHighlightedLayer = null;
    }
    const _spEl2 = document.getElementById("stats-panel");
    if (_spEl2 && _spEl2.classList.contains("open")) {
      const _wikiOpen2 = document.getElementById("wiki-sidebar")?.classList.contains("open");
      const _corpOpen2 = document.getElementById("corp-panel")?.classList.contains("open");
      _spEl2.style.right = (_wikiOpen2 && _corpOpen2 ? 880 : _corpOpen2 ? 460 : 420) + "px";
    }
  }
  function _cpFmt(val, decimals) {
    if (!Number.isFinite(val)) return "--";
    decimals = decimals == null ? 1 : decimals;
    if (Math.abs(val) >= 1e9) return (val / 1e9).toFixed(decimals) + "B";
    if (Math.abs(val) >= 1e6) return (val / 1e6).toFixed(decimals) + "M";
    if (Math.abs(val) >= 1e3) return (val / 1e3).toFixed(decimals) + "K";
    return val.toFixed(decimals);
  }
  function _cpWorldMax(key) {
    if (S._cpWorldMaxCache.has(key)) return S._cpWorldMaxCache.get(key);
    var max = 0, v;
    for (var k in S.countryData) {
      v = S.countryData[k][key];
      if (Number.isFinite(v) && v > max) max = v;
    }
    var result = max || 1;
    S._cpWorldMaxCache.set(key, result);
    return result;
  }
  function _cpOecdMax(key) {
    if (S._cpOecdMaxCache.has(key)) return S._cpOecdMaxCache.get(key);
    var max = 0, v;
    for (var k in S.oecdData) {
      v = S.oecdData[k][key];
      if (Number.isFinite(v) && v > max) max = v;
    }
    var result = max || 1;
    S._cpOecdMaxCache.set(key, result);
    return result;
  }
  function _cpWgiRow(label, val, wbKey, iso2) {
    var clickable = wbKey && iso2;
    var onc = clickable ? ' onclick="' + escHtml("openStatsPanel(" + JSON.stringify(wbKey) + "," + JSON.stringify(iso2) + ")") + '"' : "";
    var clickCls = clickable ? " cp-gauge-row-clickable" : "";
    if (!Number.isFinite(val)) {
      return '<div class="cp-gauge-row' + clickCls + '"' + onc + '><span class="cp-gauge-lbl">' + escHtml(label) + '</span><span class="cp-gauge-nil">--</span></div>';
    }
    var pct = Math.min(100, (val + 2.5) / 5 * 100).toFixed(1);
    var cls = val >= 1 ? "cp-green" : val >= 0 ? "" : val >= -1 ? "cp-amber" : "cp-red";
    var sign = val >= 0 ? "+" : "";
    return '<div class="cp-gauge-row ' + cls + clickCls + '"' + onc + '><span class="cp-gauge-lbl">' + escHtml(label) + '</span><div class="cp-gauge-bar"><div class="cp-gauge-fill" style="width:' + pct + '%"></div></div><span class="cp-gauge-val">' + sign + val.toFixed(2) + "</span></div>";
  }
  function _cpGaugeRow(label, val, max, suffix, cls, wbKey, iso2, displayVal) {
    suffix = suffix || "";
    cls = cls || "";
    var clickable = wbKey && iso2;
    var onc = clickable ? ' onclick="' + escHtml("openStatsPanel(" + JSON.stringify(wbKey) + "," + JSON.stringify(iso2) + ")") + '"' : "";
    var clickCls = clickable ? " cp-gauge-row-clickable" : "";
    if (!Number.isFinite(val)) {
      return '<div class="cp-gauge-row' + clickCls + '"' + onc + '><span class="cp-gauge-lbl">' + escHtml(label) + '</span><span class="cp-gauge-nil">--</span></div>';
    }
    var pct = Math.min(100, Math.abs(val) / max * 100).toFixed(1);
    var shown = displayVal != null ? displayVal : val.toFixed(1) + suffix;
    return '<div class="cp-gauge-row ' + cls + clickCls + '"' + onc + '><span class="cp-gauge-lbl">' + escHtml(label) + '</span><div class="cp-gauge-bar"><div class="cp-gauge-fill" style="width:' + pct + '%"></div></div><span class="cp-gauge-val">' + escHtml(String(shown)) + "</span></div>";
  }
  function clearRegionSelection(iso2) {
    S._selectedRegion = null;
    _renderCountryPanel(iso2);
  }
  function _renderCountryPanel(iso2) {
    if (!S.countryData[iso2]) return;
    var cd = S.countryData[iso2] || {};
    var metaParts = [];
    if (cd.region) metaParts.push(escHtml(cd.region));
    if (cd.income_level) metaParts.push(escHtml(cd.income_level));
    metaParts.push(escHtml(iso2));
    document.getElementById("cp-header").innerHTML = '<span class="cp-flag">' + isoToFlag(iso2) + '</span><div style="flex:1;min-width:0"><div class="cp-country-name">' + escHtml(cd.name || iso2) + '</div><div class="cp-country-meta">' + metaParts.join(" \xB7 ") + `</div></div><button class="wiki-cmp-btn" onclick="openCountryCompare('` + escAttr(iso2) + `')">Compare</button><button class="cp-close" onclick="closeCountryPanel()">\xD7</button>`;
    var gdp = cd.gdp_per_capita, inf = cd.cpi_inflation;
    var debt = cd.govt_debt_gdp, fisc = cd.fiscal_balance_gdp;
    var infCls = !Number.isFinite(inf) ? "" : inf > 5 ? "cp-red" : inf > 3 ? "cp-amber" : "cp-green";
    var debtCls = !Number.isFinite(debt) ? "" : debt > 90 ? "cp-red" : debt > 60 ? "cp-amber" : "";
    var fiscCls = !Number.isFinite(fisc) ? "" : fisc >= 0 ? "cp-green" : "cp-red";
    function statCard(cls, val, fmt, suffix, label, wbKey) {
      var display = Number.isFinite(val) ? fmt(val) + suffix : "--";
      var onc = wbKey ? ' onclick="' + escHtml("openStatsPanel(" + JSON.stringify(wbKey) + "," + JSON.stringify(iso2) + ")") + '"' : "";
      var clickCls = wbKey ? " cp-stat-card-clickable" : "";
      return '<div class="cp-stat-card ' + cls + clickCls + '"' + onc + '><div class="cp-stat-val">' + display + '</div><div class="cp-stat-lbl">' + label + "</div></div>";
    }
    document.getElementById("cp-stats-row").innerHTML = statCard("cp-blue", gdp, function(v) {
      return "$" + _cpFmt(v, 0);
    }, "", "GDP/cap", "wb_gdp_per_capita") + statCard(infCls, inf, function(v) {
      return v.toFixed(1);
    }, "%", "Inflation", "wb_cpi_inflation") + statCard(debtCls, debt, function(v) {
      return v.toFixed(0);
    }, "%", "Debt/GDP", "wb_govt_debt_gdp") + statCard(fiscCls, fisc, function(v) {
      return (v >= 0 ? "+" : "") + v.toFixed(1);
    }, "%", "Fiscal Bal", "wb_fiscal_balance_gdp");
    var maxGdp = _cpWorldMax("gdp_per_capita"), maxLife = _cpWorldMax("life_expectancy");
    var maxDebt = _cpWorldMax("govt_debt_gdp"), maxInf = _cpWorldMax("cpi_inflation");
    var maxUnemp = _cpWorldMax("unemployment_rate"), maxYld = _cpWorldMax("bond_yield_10y");
    var maxRd = _cpOecdMax("rd_spend_pct"), maxTax = _cpOecdMax("tax_revenue_pct");
    var maxHrs = _cpOecdMax("hours_worked"), maxTert = _cpOecdMax("tertiary_pct");
    var gaugeHtml = _buildRegionSection() + '<div class="cp-gauge-section-hdr">World Bank</div>' + _cpGaugeRow("GDP/cap", gdp, maxGdp, "", "cp-blue", "wb_gdp_per_capita", iso2) + _cpGaugeRow("Life exp", cd.life_expectancy, maxLife, " yrs", "", "wb_life_expectancy", iso2) + (Number.isFinite(cd.population) ? '<div class="cp-gauge-row"><span class="cp-gauge-lbl">Population</span><span class="cp-gauge-info">' + _cpFmt(cd.population, 1) + "</span></div>" : "") + '<div class="cp-gauge-section-hdr">IMF</div>' + _cpGaugeRow("Debt/GDP", debt, maxDebt, "%", debtCls, "wb_govt_debt_gdp", iso2) + _cpGaugeRow("Fiscal bal", fisc, 20, "%", fiscCls, "wb_fiscal_balance_gdp", iso2) + _cpGaugeRow("CPI Inflation", inf, maxInf, "%", infCls, "wb_cpi_inflation", iso2) + _cpGaugeRow("Unemployment", cd.unemployment_rate, maxUnemp, "%", "", "wb_unemployment_rate", iso2) + '<div class="cp-gauge-section-hdr">FRED</div>' + _cpGaugeRow("Bond yield", cd.bond_yield_10y, maxYld, "%", "", "wb_bond_yield_10y", iso2) + (Number.isFinite(cd.cb_rate) ? '<div class="cp-gauge-section-hdr">' + escHtml(cd.cb_bank || "Central Bank") + "</div>" + _cpGaugeRow(cd.cb_rate_label || "Policy Rate", cd.cb_rate, 30, "%", "", "wb_cb_rate", iso2) : "") + (cd.credit_sp || cd.credit_moodys || cd.credit_fitch ? '<div class="cp-gauge-section-hdr">Credit Ratings</div>' + (Number.isFinite(cd.credit_sp_num) ? _cpGaugeRow("S&P", cd.credit_sp_num, 21, "", "", "wb_credit_sp", iso2, cd.credit_sp) : "") + (Number.isFinite(cd.credit_moodys_num) ? _cpGaugeRow("Moody's", cd.credit_moodys_num, 21, "", "", "wb_credit_moodys", iso2, cd.credit_moodys) : "") + (Number.isFinite(cd.credit_fitch_num) ? _cpGaugeRow("Fitch", cd.credit_fitch_num, 21, "", "", "wb_credit_fitch", iso2, cd.credit_fitch) : "") : "") + // ── Governance (WGI) ─────────────────────────────────────────────
    (Number.isFinite(cd.wgi_rule_of_law) ? '<div class="cp-gauge-section-hdr">Governance (WGI)</div>' + _cpWgiRow("Rule of Law", cd.wgi_rule_of_law, "wb_wgi_rule_of_law", iso2) + _cpWgiRow("Anti-Corruption", cd.wgi_corruption, "wb_wgi_corruption", iso2) + _cpWgiRow("Govt Effective.", cd.wgi_govt_effectiveness, "wb_wgi_govt_effectiveness", iso2) + _cpWgiRow("Voice & Acct", cd.wgi_voice_accountability, "wb_wgi_voice_accountability", iso2) + _cpWgiRow("Pol. Stability", cd.wgi_political_stability, "wb_wgi_political_stability", iso2) + _cpWgiRow("Regulatory", cd.wgi_regulatory_quality, "wb_wgi_regulatory_quality", iso2) : "") + // ── Human Development ─────────────────────────────────────────────
    (Number.isFinite(cd.hdi) ? '<div class="cp-gauge-section-hdr">Human Development (UNDP)</div>' + _cpGaugeRow("HDI", cd.hdi, 1, "", "cp-blue", "wb_hdi", iso2) + (Number.isFinite(cd.hdi_rank) ? '<div class="cp-gauge-row"><span class="cp-gauge-lbl">HDI Rank</span><span class="cp-gauge-info">#' + cd.hdi_rank + " of 193</span></div>" : "") + _cpGaugeRow("Renewable energy", cd.renewable_energy_pct, 100, "%", "", "wb_renewable_energy_pct", iso2) + _cpGaugeRow("Health spending", cd.health_spend_gdp, 20, "% GDP", "", "wb_health_spend_gdp", iso2) + _cpGaugeRow("Edu spending", cd.education_spend_gdp, 15, "% GDP", "", "wb_education_spend_gdp", iso2) : "") + // ── Transparency & Freedom ────────────────────────────────────────
    (Number.isFinite(cd.ti_cpi_score) || Number.isFinite(cd.fh_score) ? '<div class="cp-gauge-section-hdr">Transparency &amp; Freedom</div>' + (Number.isFinite(cd.ti_cpi_score) ? _cpGaugeRow(
      "Corruption (TI)",
      cd.ti_cpi_score,
      100,
      "/100",
      cd.ti_cpi_score >= 70 ? "cp-green" : cd.ti_cpi_score >= 45 ? "" : "cp-red",
      "wb_ti_cpi",
      iso2
    ) + (cd.ti_cpi_rank ? '<div class="cp-gauge-row"><span class="cp-gauge-lbl">TI Rank</span><span class="cp-gauge-info">#' + cd.ti_cpi_rank + "</span></div>" : "") : "") + (Number.isFinite(cd.fh_score) ? _cpGaugeRow(
      "Freedom (FH)",
      cd.fh_score,
      100,
      "/100",
      cd.fh_score >= 70 ? "cp-green" : cd.fh_score >= 36 ? "" : "cp-red",
      "wb_fh_score",
      iso2
    ) + (cd.fh_status ? '<div class="cp-gauge-row"><span class="cp-gauge-lbl">Status</span><span class="cp-gauge-info cp-gauge-badge ' + (cd.fh_status === "Free" ? "cp-badge-green" : cd.fh_status === "Partly Free" ? "cp-badge-amber" : "cp-badge-red") + '">' + escHtml(cd.fh_status) + "</span></div>" : "") : "") : "") + // ── Happiness (WHR 2024) ──────────────────────────────────────────
    (Number.isFinite(cd.whr_score) ? '<div class="cp-gauge-section-hdr">Happiness (WHR 2024)</div><div class="cp-gauge-row"><span class="cp-gauge-lbl">Happiness Rank</span><span class="cp-gauge-info">#' + cd.whr_rank + " of 143</span></div>" + _cpGaugeRow("Happiness score", cd.whr_score, 8, "", "cp-green", "wb_whr_score", iso2) + _cpGaugeRow("GDP contribution", cd.whr_gdp, 2, "", "cp-blue", "wb_whr_gdp", iso2) + _cpGaugeRow("Social support", cd.whr_social, 1.5, "", "cp-blue", "wb_whr_social", iso2) + _cpGaugeRow("Life expectancy", cd.whr_health, 1, "", "", "wb_whr_health", iso2) + _cpGaugeRow("Freedom", cd.whr_freedom, 0.8, "", "", "wb_whr_freedom", iso2) + _cpGaugeRow("Generosity", cd.whr_generosity, 0.5, "", "cp-amber", "wb_whr_generosity", iso2) + _cpGaugeRow("Low corruption", cd.whr_corruption, 0.6, "", "cp-green", "wb_whr_corruption", iso2) : "") + // ── Peace & Security ─────────────────────────────────────────────
    (function() {
      var c = S.countryData[iso2];
      if (!c) return "";
      var rows = "";
      if (Number.isFinite(c.military_spend_gdp)) rows += _cpGaugeRow("Military spend", c.military_spend_gdp, _cpWorldMax("military_spend_gdp"), "% GDP", "", "wb_military_spend_gdp", iso2);
      if (Number.isFinite(c.gpi_score)) rows += _cpGaugeRow("Peace index", c.gpi_score, 4, "", c.gpi_score <= 1.5 ? "cp-green" : c.gpi_score >= 2.5 ? "cp-red" : "", "wb_gpi_score", iso2);
      if (Number.isFinite(c.gpi_rank)) rows += '<div class="cp-gauge-row"><span class="cp-gauge-lbl">GPI Rank</span><span class="cp-gauge-info">#' + c.gpi_rank + " of 163</span></div>";
      if (Number.isFinite(c.press_freedom_score)) rows += _cpGaugeRow("Press freedom", c.press_freedom_score, 100, "", c.press_freedom_score <= 25 ? "cp-green" : c.press_freedom_score >= 55 ? "cp-red" : "cp-amber", "wb_press_freedom", iso2);
      if (Number.isFinite(c.press_freedom_rank)) rows += '<div class="cp-gauge-row"><span class="cp-gauge-lbl">RSF Rank</span><span class="cp-gauge-info">#' + c.press_freedom_rank + " of 180</span></div>";
      return rows ? '<div class="cp-gauge-section-hdr">Peace &amp; Security</div>' + rows : "";
    })() + // ── Disaster Risk (INFORM 2024) ───────────────────────────────────────
    (function() {
      var r = S.informRisk[iso2];
      if (!r || !Number.isFinite(r.risk_score)) return "";
      var cls = r.risk_score >= 6.5 ? "cp-red" : r.risk_score >= 3.5 ? "cp-amber" : "cp-green";
      var rows = "";
      rows += _cpGaugeRow("Risk Score", r.risk_score, 10, "", cls, "", iso2);
      if (r.rank) rows += '<div class="cp-gauge-row"><span class="cp-gauge-lbl">Global Rank</span><span class="cp-gauge-info">#' + r.rank + " of 191</span></div>";
      if (r.risk_class) rows += '<div class="cp-gauge-row"><span class="cp-gauge-lbl">Risk Level</span><span class="cp-gauge-info cp-gauge-badge ' + (r.risk_class === "Very High" ? "cp-badge-red" : r.risk_class === "High" ? "cp-badge-amber" : r.risk_class === "Medium" ? "" : "cp-badge-green") + '">' + escHtml(r.risk_class) + "</span></div>";
      if (Number.isFinite(r.hazard_exposure)) rows += _cpGaugeRow("Hazard & Exposure", r.hazard_exposure, 10, "", r.hazard_exposure >= 6 ? "cp-red" : r.hazard_exposure >= 3 ? "cp-amber" : "", "", iso2);
      if (Number.isFinite(r.vulnerability)) rows += _cpGaugeRow("Vulnerability", r.vulnerability, 10, "", r.vulnerability >= 6 ? "cp-red" : r.vulnerability >= 3 ? "cp-amber" : "", "", iso2);
      if (Number.isFinite(r.coping_capacity)) rows += _cpGaugeRow("Lack of Coping", r.coping_capacity, 10, "", r.coping_capacity >= 6 ? "cp-red" : r.coping_capacity >= 3 ? "cp-amber" : "", "", iso2);
      var hazardRows = "";
      if (Number.isFinite(r.earthquake)) hazardRows += '<span title="Earthquake risk">' + (r.earthquake >= 5 ? "\u{1F534}" : r.earthquake >= 2 ? "\u{1F7E1}" : "\u26AA") + " Quake " + r.earthquake.toFixed(1) + "</span> ";
      if (Number.isFinite(r.flood)) hazardRows += '<span title="Flood risk">' + (r.flood >= 5 ? "\u{1F534}" : r.flood >= 2 ? "\u{1F7E1}" : "\u26AA") + " Flood " + r.flood.toFixed(1) + "</span> ";
      if (Number.isFinite(r.cyclone)) hazardRows += '<span title="Cyclone risk">' + (r.cyclone >= 5 ? "\u{1F534}" : r.cyclone >= 2 ? "\u{1F7E1}" : "\u26AA") + " Cyclone " + r.cyclone.toFixed(1) + "</span> ";
      if (Number.isFinite(r.drought)) hazardRows += '<span title="Drought risk">' + (r.drought >= 5 ? "\u{1F534}" : r.drought >= 2 ? "\u{1F7E1}" : "\u26AA") + " Drought " + r.drought.toFixed(1) + "</span> ";
      if (Number.isFinite(r.conflict) && r.conflict > 0) hazardRows += '<span title="Conflict risk">' + (r.conflict >= 5 ? "\u{1F534}" : r.conflict >= 2 ? "\u{1F7E1}" : "\u26AA") + " Conflict " + r.conflict.toFixed(1) + "</span> ";
      if (hazardRows) rows += '<div class="cp-gauge-row"><span class="cp-gauge-lbl">Hazards</span><span class="cp-gauge-info" style="font-size:0.72em">' + hazardRows + "</span></div>";
      return '<div class="cp-gauge-section-hdr">Disaster Risk (INFORM 2024)</div>' + rows;
    })() + // ── Digital Infrastructure ────────────────────────────────────────
    (function() {
      var c = S.countryData[iso2];
      if (!c) return "";
      var rows = "";
      if (Number.isFinite(c.inet_download_mbps)) rows += _cpGaugeRow("Download", c.inet_download_mbps, _cpWorldMax("inet_download_mbps"), " Mbps", "cp-blue", "wb_inet_download", iso2);
      if (Number.isFinite(c.inet_upload_mbps)) rows += _cpGaugeRow("Upload", c.inet_upload_mbps, _cpWorldMax("inet_upload_mbps"), " Mbps", "cp-blue", "wb_inet_upload", iso2);
      if (Number.isFinite(c.inet_mobile_mbps)) rows += _cpGaugeRow("Mobile", c.inet_mobile_mbps, _cpWorldMax("inet_mobile_mbps"), " Mbps", "", "wb_inet_mobile", iso2);
      return rows ? '<div class="cp-gauge-section-hdr">Digital Infrastructure</div>' + rows : "";
    })() + // ── Demographics & Environment ────────────────────────────────────
    (function() {
      var c = S.countryData[iso2];
      if (!c) return "";
      var rows = "";
      if (Number.isFinite(c.pop_growth)) rows += _cpGaugeRow("Pop growth", c.pop_growth, _cpWorldMax("pop_growth"), "%", "", "wb_pop_growth", iso2);
      if (Number.isFinite(c.net_migration)) rows += _cpGaugeRow("Net migration", c.net_migration, _cpWorldMax("net_migration"), "", "", "wb_net_migration", iso2);
      if (Number.isFinite(c.migrant_stock)) rows += _cpGaugeRow("Migrant stock", c.migrant_stock, _cpWorldMax("migrant_stock"), "", "", "wb_migrant_stock", iso2);
      if (Number.isFinite(c.female_labor_pct)) rows += _cpGaugeRow("Female labor", c.female_labor_pct, 100, "%", "cp-purple", "wb_female_labor", iso2);
      if (Number.isFinite(c.safe_water_pct)) rows += _cpGaugeRow("Safe water", c.safe_water_pct, 100, "%", "cp-blue", "wb_safe_water", iso2);
      if (Number.isFinite(c.forest_pct)) rows += _cpGaugeRow("Forest area", c.forest_pct, 100, "%", "cp-green", "wb_forest_pct", iso2);
      if (Number.isFinite(c.research_articles)) rows += _cpGaugeRow("Research articles", c.research_articles, _cpWorldMax("research_articles"), "", "cp-purple", "wb_research_articles", iso2);
      return rows ? '<div class="cp-gauge-section-hdr">Demographics &amp; Environment</div>' + rows : "";
    })() + // ── Humanitarian & Forest ─────────────────────────────────────────
    (function() {
      var c = S.countryData[iso2];
      if (!c) return "";
      var rows = "";
      var maxRefOrigin = _cpWorldMax("refugees_by_origin") || 15e6;
      var maxRefAsylum = _cpWorldMax("refugees_by_asylum") || 4e6;
      var maxForestLoss = _cpWorldMax("forest_loss_sqkm") || 5e4;
      var maxForestCover = _cpWorldMax("forest_cover_2000_sqkm") || 9e6;
      var fmtRefugees = function(n) {
        if (!Number.isFinite(n)) return "";
        return n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(0) + "k" : n;
      };
      if (Number.isFinite(c.refugees_by_origin)) {
        rows += _cpGaugeRow("Refugees abroad", c.refugees_by_origin, maxRefOrigin, "", "cp-amber", "unhcr_refugees_origin", iso2, fmtRefugees(c.refugees_by_origin));
        if (c.refugees_by_origin_year) rows += '<span class="cp-gauge-year">(' + c.refugees_by_origin_year + ")</span>";
      }
      if (Number.isFinite(c.refugees_by_asylum)) {
        rows += _cpGaugeRow("Refugees hosted", c.refugees_by_asylum, maxRefAsylum, "", "cp-blue", "unhcr_refugees_asylum", iso2, fmtRefugees(c.refugees_by_asylum));
        if (c.refugees_by_asylum_year) rows += '<span class="cp-gauge-year">(' + c.refugees_by_asylum_year + ")</span>";
      }
      if (Number.isFinite(c.forest_loss_sqkm)) {
        rows += _cpGaugeRow("Forest loss", c.forest_loss_sqkm, maxForestLoss, " km\xB2", "cp-red", "gfw_forest_loss", iso2);
        if (c.forest_loss_year) rows += '<span class="cp-gauge-year">(' + c.forest_loss_year + ")</span>";
      }
      if (Number.isFinite(c.forest_cover_2000_sqkm)) {
        rows += _cpGaugeRow("Forest cover 2000", c.forest_cover_2000_sqkm, maxForestCover, " km\xB2", "cp-green", "gfw_forest_cover", iso2);
      }
      return rows ? '<div class="cp-gauge-section-hdr">Humanitarian &amp; Forest</div>' + rows : "";
    })() + // ── Energy Mix (Ember) ────────────────────────────────────────────
    (Number.isFinite(cd.energy_coal_pct) ? '<div class="cp-gauge-section-hdr">Energy Mix</div>' + _cpGaugeRow("Wind & Solar", cd.energy_wind_solar_pct, 100, "%", "cp-green", "wb_energy_wind_solar_pct", iso2) + _cpGaugeRow("Hydro", cd.energy_hydro_pct, 100, "%", "cp-blue", "wb_energy_hydro_pct", iso2) + _cpGaugeRow("Nuclear", cd.energy_nuclear_pct, 100, "%", "", "wb_energy_nuclear_pct", iso2) + _cpGaugeRow("Gas", cd.energy_gas_pct, 100, "%", "cp-amber", "wb_energy_gas_pct", iso2) + _cpGaugeRow("Coal", cd.energy_coal_pct, 100, "%", "cp-red", "wb_energy_coal_pct", iso2) + (Number.isFinite(cd.nuclear_reactors) ? _cpGaugeRow("Reactors", cd.nuclear_reactors, _cpWorldMax("nuclear_reactors"), "", "cp-amber", "wb_nuclear_reactors", iso2) : "") + (Number.isFinite(cd.nuclear_capacity_gw) ? _cpGaugeRow("Nuclear capacity", cd.nuclear_capacity_gw, _cpWorldMax("nuclear_capacity_gw"), " GW", "cp-amber", "wb_nuclear_capacity", iso2) : "") + (Number.isFinite(cd.nuclear_generation_twh) ? _cpGaugeRow("Nuclear output", cd.nuclear_generation_twh, _cpWorldMax("nuclear_generation_twh"), " TWh", "cp-amber", "wb_nuclear_generation", iso2) : "") : "") + // ── Research Output (OpenAlex) ───────────────────────────────────────
    (function() {
      var c = S.countryData[iso2];
      if (!c || !Number.isFinite(c.research_papers)) return "";
      var rows = "";
      var maxPapers = _cpWorldMax("research_papers") || 5e7;
      var maxCites = _cpWorldMax("research_citations") || 1e9;
      var fmtPapers = c.research_papers >= 1e6 ? (c.research_papers / 1e6).toFixed(1) + "M" : c.research_papers >= 1e3 ? (c.research_papers / 1e3).toFixed(0) + "k" : c.research_papers;
      var fmtCites = c.research_citations >= 1e9 ? (c.research_citations / 1e9).toFixed(1) + "B" : c.research_citations >= 1e6 ? (c.research_citations / 1e6).toFixed(1) + "M" : c.research_citations >= 1e3 ? (c.research_citations / 1e3).toFixed(0) + "k" : c.research_citations;
      rows += _cpGaugeRow("Research papers", c.research_papers, maxPapers, "", "cp-purple", "wb_research_papers", iso2, fmtPapers);
      rows += _cpGaugeRow("Citations", c.research_citations, maxCites, "", "cp-purple", "wb_research_citations", iso2, fmtCites);
      if (Number.isFinite(c.research_citations_per_paper)) {
        rows += _cpGaugeRow("Cites/paper", c.research_citations_per_paper, 50, "", c.research_citations_per_paper >= 20 ? "cp-green" : c.research_citations_per_paper >= 10 ? "cp-blue" : "", "wb_research_cites_per_paper", iso2);
      }
      return rows ? '<div class="cp-gauge-section-hdr">Research Output (OpenAlex)</div>' + rows : "";
    })() + // ── OECD Innovation & Labor ───────────────────────────────────────
    (function() {
      var od = S.oecdData[iso2];
      if (!od) return "";
      var rows = "";
      var maxPisa = _cpOecdMax("pisa_reading");
      var maxWage = _cpOecdMax("min_wage_usd_ppp");
      if (Number.isFinite(od.rd_spend_pct)) rows += _cpGaugeRow("R&D spend", od.rd_spend_pct, maxRd, "%", "cp-blue", "wb_rd_spend_pct", iso2);
      if (Number.isFinite(od.tax_revenue_pct)) rows += _cpGaugeRow("Tax rev (fed)", od.tax_revenue_pct, maxTax, "% GDP", "", "wb_tax_revenue_pct", iso2);
      if (Number.isFinite(od.hours_worked)) rows += _cpGaugeRow("Hours worked", od.hours_worked, maxHrs, "/yr", "", "wb_hours_worked", iso2);
      if (Number.isFinite(od.tertiary_pct)) rows += _cpGaugeRow("Tertiary edu", od.tertiary_pct, maxTert, "%", "cp-blue", "wb_tertiary_pct", iso2);
      if (Number.isFinite(od.pisa_reading)) rows += _cpGaugeRow("PISA reading", od.pisa_reading, maxPisa, "pts", "cp-blue", "wb_pisa_reading", iso2);
      if (Number.isFinite(od.min_wage_usd_ppp)) rows += _cpGaugeRow("Min wage", od.min_wage_usd_ppp, maxWage, "$/hr PPP", "cp-blue", "wb_min_wage_usd_ppp", iso2);
      return rows ? '<div class="cp-gauge-section-hdr">Innovation &amp; Labor (OECD)</div>' + rows : "";
    })() + // ── OECD Social & Wages ──────────────────────────────────────────
    (function() {
      var od = S.oecdData[iso2];
      if (!od) return "";
      var rows = "";
      var maxWage = _cpOecdMax("avg_wage_usd");
      var maxProd = _cpOecdMax("labour_productivity");
      var maxGap = _cpOecdMax("gender_pay_gap");
      var maxSoc = _cpOecdMax("social_spend_gdp");
      var maxYu = _cpOecdMax("youth_unemployment");
      var maxPov = _cpOecdMax("poverty_rate_oecd");
      if (Number.isFinite(od.avg_wage_usd)) rows += _cpGaugeRow("Avg wage", od.avg_wage_usd, maxWage, "$/yr", "cp-blue", "wb_avg_wage_usd", iso2);
      if (Number.isFinite(od.labour_productivity)) rows += _cpGaugeRow("Productivity", od.labour_productivity, maxProd, "$/hr", "cp-blue", "wb_labour_prod", iso2);
      if (Number.isFinite(od.gender_pay_gap)) rows += _cpGaugeRow("Gender pay gap", od.gender_pay_gap, maxGap, "%", "cp-amber", "wb_gender_pay_gap", iso2);
      if (Number.isFinite(od.social_spend_gdp)) rows += _cpGaugeRow("Social spend", od.social_spend_gdp, maxSoc, "% GDP", "", "wb_social_spend_gdp", iso2);
      if (Number.isFinite(od.youth_unemployment)) rows += _cpGaugeRow("Youth unemp", od.youth_unemployment, maxYu, "%", "cp-red", "wb_youth_unemployment", iso2);
      if (Number.isFinite(od.poverty_rate_oecd)) rows += _cpGaugeRow("Poverty rate", od.poverty_rate_oecd, maxPov, "%", "cp-red", "wb_poverty_rate_oecd", iso2);
      return rows ? '<div class="cp-gauge-section-hdr">Social &amp; Wages (OECD)</div>' + rows : "";
    })() + // ── Housing & Quality of Life (OECD) ──────────────────────────────
    (function() {
      var od = S.oecdData[iso2];
      if (!od) return "";
      var rows = "";
      if (Number.isFinite(od.house_price_income)) rows += _cpGaugeRow("House price/inc", od.house_price_income, _cpOecdMax("house_price_income"), "", "cp-amber", "oecd_house_price_income", iso2);
      if (Number.isFinite(od.broadband_per100)) rows += _cpGaugeRow("Broadband", od.broadband_per100, _cpOecdMax("broadband_per100"), "/100", "cp-blue", "oecd_broadband_per100", iso2);
      if (Number.isFinite(od.employment_rate)) rows += _cpGaugeRow("Employment", od.employment_rate, 100, "%", "cp-green", "oecd_employment_rate", iso2);
      if (Number.isFinite(od.life_satisfaction)) rows += _cpGaugeRow("Life satisf.", od.life_satisfaction, 10, "", "cp-blue", "oecd_life_satisfaction", iso2);
      if (Number.isFinite(od.gini_oecd)) rows += _cpGaugeRow("Gini (OECD)", od.gini_oecd * 100, 60, "", "cp-amber", "oecd_gini", iso2);
      if (Number.isFinite(od.pension_spend_gdp)) rows += _cpGaugeRow("Pension spend", od.pension_spend_gdp, _cpOecdMax("pension_spend_gdp"), "% GDP", "", "oecd_pension_spend", iso2);
      return rows ? '<div class="cp-gauge-section-hdr">Housing &amp; Quality of Life (OECD)</div>' + rows : "";
    })() + // ── Trade & Investment (World Bank) ───────────────────────────────
    (function() {
      var c = S.countryData[iso2];
      if (!c) return "";
      var rows = "";
      if (Number.isFinite(c.trade_pct_gdp)) rows += _cpGaugeRow("Trade/GDP", c.trade_pct_gdp, _cpWorldMax("trade_pct_gdp"), "%", "", "wb_trade_pct_gdp", iso2);
      if (Number.isFinite(c.exports_pct_gdp)) rows += _cpGaugeRow("Exports", c.exports_pct_gdp, _cpWorldMax("exports_pct_gdp"), "% GDP", "cp-blue", "wb_exports_pct_gdp", iso2);
      if (Number.isFinite(c.imports_pct_gdp)) rows += _cpGaugeRow("Imports", c.imports_pct_gdp, _cpWorldMax("imports_pct_gdp"), "% GDP", "cp-amber", "wb_imports_pct_gdp", iso2);
      if (Number.isFinite(c.current_account_gdp)) rows += _cpGaugeRow("Current acct", c.current_account_gdp, Math.max(Math.abs(_cpWorldMax("current_account_gdp")), 30), "% GDP", c.current_account_gdp >= 0 ? "cp-green" : "cp-red", "wb_current_account", iso2);
      if (Number.isFinite(c.fdi_inflow_gdp)) rows += _cpGaugeRow("FDI inflows", c.fdi_inflow_gdp, _cpWorldMax("fdi_inflow_gdp"), "% GDP", "cp-blue", "wb_fdi_inflow", iso2);
      return rows ? '<div class="cp-gauge-section-hdr">Trade &amp; Investment (World Bank)</div>' + rows : "";
    })() + // ── Health (WHO GHO) ──────────────────────────────────────────────
    (function() {
      var c = S.countryData[iso2];
      if (!c) return "";
      var rows = "";
      if (Number.isFinite(c.who_physicians)) rows += _cpGaugeRow("Physicians", c.who_physicians, _cpWorldMax("who_physicians"), "/10k", "cp-blue", "wb_who_physicians", iso2);
      if (Number.isFinite(c.who_nurses)) rows += _cpGaugeRow("Nurses", c.who_nurses, _cpWorldMax("who_nurses"), "/10k", "cp-blue", "wb_who_nurses", iso2);
      if (Number.isFinite(c.who_hospital_beds)) rows += _cpGaugeRow("Hospital beds", c.who_hospital_beds, _cpWorldMax("who_hospital_beds"), "/10k", "", "wb_who_hospital_beds", iso2);
      if (Number.isFinite(c.who_immunization)) rows += _cpGaugeRow("DPT3 immun.", c.who_immunization, 100, "%", "cp-green", "wb_who_immunization", iso2);
      if (Number.isFinite(c.who_maternal_mort)) rows += _cpGaugeRow("Maternal mort", c.who_maternal_mort, _cpWorldMax("who_maternal_mort"), "/100k", "cp-red", "wb_who_maternal_mort", iso2);
      if (Number.isFinite(c.who_ncd_mortality)) rows += _cpGaugeRow("NCD mort 30-70", c.who_ncd_mortality, _cpWorldMax("who_ncd_mortality"), "%", "cp-amber", "wb_who_ncd_mortality", iso2);
      if (Number.isFinite(c.who_uhc_index)) rows += _cpGaugeRow("UHC coverage", c.who_uhc_index, 100, "", "cp-blue", "wb_who_uhc_index", iso2);
      if (Number.isFinite(c.who_hale)) rows += _cpGaugeRow("Healthy life exp", c.who_hale, _cpWorldMax("who_hale"), " yrs", "cp-green", "wb_who_hale", iso2);
      if (Number.isFinite(c.who_health_spend_pc)) rows += _cpGaugeRow("Health spend/cap", c.who_health_spend_pc, _cpWorldMax("who_health_spend_pc"), " USD", "cp-blue", "wb_who_health_spend_pc", iso2);
      if (Number.isFinite(c.who_oop_spend)) rows += _cpGaugeRow("Out-of-pocket", c.who_oop_spend, 100, "%", "cp-amber", "wb_who_oop_spend", iso2);
      return rows ? '<div class="cp-gauge-section-hdr">Health (WHO)</div>' + rows : "";
    })() + // ── Disease Burden (WHO GHO) ──────────────────────────────────────
    (function() {
      var c = S.countryData[iso2];
      if (!c) return "";
      var rows = "";
      if (Number.isFinite(c.who_tb_incidence)) rows += _cpGaugeRow("TB incidence", c.who_tb_incidence, _cpWorldMax("who_tb_incidence"), "/100k", "cp-red", "wb_who_tb_incidence", iso2);
      if (Number.isFinite(c.who_hiv_prevalence)) rows += _cpGaugeRow("HIV prevalence", c.who_hiv_prevalence, _cpWorldMax("who_hiv_prevalence"), "%", "cp-red", "wb_who_hiv_prevalence", iso2);
      if (Number.isFinite(c.who_malaria_incidence)) rows += _cpGaugeRow("Malaria", c.who_malaria_incidence, _cpWorldMax("who_malaria_incidence"), "/1k", "cp-red", "wb_who_malaria_incidence", iso2);
      if (Number.isFinite(c.who_hepb_prevalence)) rows += _cpGaugeRow("Hepatitis B", c.who_hepb_prevalence, _cpWorldMax("who_hepb_prevalence"), "%", "cp-amber", "wb_who_hepb_prevalence", iso2);
      return rows ? '<div class="cp-gauge-section-hdr">Disease Burden (WHO)</div>' + rows : "";
    })() + // ── Lifestyle & Risk Factors (WHO GHO) ────────────────────────────
    (function() {
      var c = S.countryData[iso2];
      if (!c) return "";
      var rows = "";
      if (Number.isFinite(c.who_obesity)) rows += _cpGaugeRow("Obesity", c.who_obesity, _cpWorldMax("who_obesity"), "%", "cp-amber", "wb_who_obesity", iso2);
      if (Number.isFinite(c.who_tobacco)) rows += _cpGaugeRow("Tobacco use", c.who_tobacco, _cpWorldMax("who_tobacco"), "%", "cp-red", "wb_who_tobacco", iso2);
      if (Number.isFinite(c.who_alcohol)) rows += _cpGaugeRow("Alcohol", c.who_alcohol, _cpWorldMax("who_alcohol"), " L/cap", "cp-amber", "wb_who_alcohol", iso2);
      if (Number.isFinite(c.who_physical_inactivity)) rows += _cpGaugeRow("Phys. inactivity", c.who_physical_inactivity, _cpWorldMax("who_physical_inactivity"), "%", "cp-amber", "wb_who_physical_inactivity", iso2);
      return rows ? '<div class="cp-gauge-section-hdr">Lifestyle (WHO)</div>' + rows : "";
    })() + // ── CO₂ Emissions (Global Carbon Project) ────────────────────────
    (function() {
      var c = S.countryData[iso2];
      if (!c) return "";
      var rows = "";
      if (Number.isFinite(c.co2_total_mt)) rows += _cpGaugeRow("Total CO\u2082", c.co2_total_mt, _cpWorldMax("co2_total_mt"), " Mt", "cp-red", "wb_co2_total", iso2);
      if (Number.isFinite(c.co2_per_capita)) rows += _cpGaugeRow("CO\u2082 per capita", c.co2_per_capita, _cpWorldMax("co2_per_capita"), " t", "cp-red", "wb_co2_per_capita", iso2);
      if (Number.isFinite(c.co2_coal_pct)) rows += _cpGaugeRow("Coal", c.co2_coal_pct, 100, "%", "cp-grey", "wb_co2_coal_pct", iso2);
      if (Number.isFinite(c.co2_oil_pct)) rows += _cpGaugeRow("Oil", c.co2_oil_pct, 100, "%", "cp-grey", "wb_co2_oil_pct", iso2);
      if (Number.isFinite(c.co2_gas_pct)) rows += _cpGaugeRow("Gas", c.co2_gas_pct, 100, "%", "cp-grey", "wb_co2_gas_pct", iso2);
      if (Number.isFinite(c.co2_cement_pct)) rows += _cpGaugeRow("Cement", c.co2_cement_pct, 100, "%", "cp-grey", "wb_co2_cement_pct", iso2);
      return rows ? '<div class="cp-gauge-section-hdr">CO\u2082 Emissions (GCP)</div>' + rows : "";
    })() + // ── UNESCO World Heritage Sites ──────────────────────────────────
    (function() {
      var c = S.countryData[iso2];
      if (!c || !c.unesco_total) return "";
      var rows = "";
      rows += _cpGaugeRow("Total sites", c.unesco_total, _cpWorldMax("unesco_total"), "", "cp-blue", "wb_unesco_total", iso2);
      if (c.unesco_cultural) rows += '<div class="cp-gauge-row"><span class="cp-gauge-lbl">Cultural</span><span class="cp-gauge-info" style="color:var(--bookmark-gold)">' + escHtml(c.unesco_cultural) + "</span></div>";
      if (c.unesco_natural) rows += '<div class="cp-gauge-row"><span class="cp-gauge-lbl">Natural</span><span class="cp-gauge-info" style="color:var(--success)">' + escHtml(c.unesco_natural) + "</span></div>";
      if (c.unesco_mixed) rows += '<div class="cp-gauge-row"><span class="cp-gauge-lbl">Mixed</span><span class="cp-gauge-info" style="color:var(--purple)">' + escHtml(c.unesco_mixed) + "</span></div>";
      return '<div class="cp-gauge-section-hdr">UNESCO World Heritage</div>' + rows;
    })() + // ── INFORM Risk Index ────────────────────────────────────────────
    (function() {
      var c = S.countryData[iso2];
      if (!c || c.inform_risk == null) return "";
      var riskColor = c.inform_risk >= 6.5 ? "#f85149" : c.inform_risk >= 5 ? "#d29922" : c.inform_risk >= 3.5 ? "#e3b341" : "#3fb950";
      var rows = "";
      rows += _cpGaugeRow("Overall Risk", c.inform_risk, 10, "/10", c.inform_risk >= 5 ? "cp-red" : "cp-green", "wb_inform_risk", iso2);
      if (c.inform_class) rows += '<div class="cp-gauge-row"><span class="cp-gauge-lbl">Risk Class</span><span class="cp-gauge-info" style="color:' + riskColor + '">' + c.inform_class + "</span></div>";
      if (Number.isFinite(c.inform_hazard)) rows += _cpGaugeRow("Hazard & Exposure", c.inform_hazard, 10, "/10", "cp-amber", "wb_inform_hazard", iso2);
      if (Number.isFinite(c.inform_vulnerability)) rows += _cpGaugeRow("Vulnerability", c.inform_vulnerability, 10, "/10", "cp-amber", "wb_inform_vulnerability", iso2);
      if (Number.isFinite(c.inform_coping)) rows += _cpGaugeRow("Lack of Coping Cap.", c.inform_coping, 10, "/10", "cp-amber", "wb_inform_coping", iso2);
      return '<div class="cp-gauge-section-hdr">Disaster Risk (INFORM)</div>' + rows;
    })() + // ── ECB (Eurozone only) ───────────────────────────────────────────
    (function() {
      if (!S.ecbData.eurozone_countries || !S.ecbData.eurozone_countries.includes(iso2)) return "";
      var rows = '<div class="cp-gauge-section-hdr">ECB / Euribor</div>';
      if (Number.isFinite(S.ecbData.ecb_deposit_rate)) {
        rows += '<div class="cp-gauge-row"><span class="cp-gauge-lbl">ECB Deposit Rate</span><span class="cp-gauge-info">' + S.ecbData.ecb_deposit_rate.toFixed(2) + "%</span></div>";
      }
      if (Number.isFinite(S.ecbData.ecb_mro_rate)) {
        rows += '<div class="cp-gauge-row"><span class="cp-gauge-lbl">ECB Refi Rate</span><span class="cp-gauge-info">' + S.ecbData.ecb_mro_rate.toFixed(2) + "%</span></div>";
      }
      if (Number.isFinite(S.ecbData.euribor_3m)) {
        rows += '<div class="cp-gauge-row"><span class="cp-gauge-lbl">Euribor 3M</span><span class="cp-gauge-info">' + S.ecbData.euribor_3m.toFixed(2) + "%</span></div>";
      }
      var eb = S.ecbBonds[iso2];
      if (eb && Number.isFinite(eb.bond_yield_10y)) {
        var yldDate = eb.bond_yield_10y_date ? " (" + eb.bond_yield_10y_date + ")" : "";
        rows += '<div class="cp-gauge-row"><span class="cp-gauge-lbl">10Y Bond Yield</span><span class="cp-gauge-info">' + eb.bond_yield_10y.toFixed(2) + "%" + yldDate + "</span></div>";
        if (iso2 !== "DE" && Number.isFinite(eb.spread_vs_de_bps)) {
          var spreadSign = eb.spread_vs_de_bps >= 0 ? "+" : "";
          rows += '<div class="cp-gauge-row"><span class="cp-gauge-lbl">Spread vs DE</span><span class="cp-gauge-info">' + spreadSign + Math.round(eb.spread_vs_de_bps) + " bps</span></div>";
        }
      }
      var t2 = S.ecbData.countries && S.ecbData.countries[iso2];
      if (t2 && Number.isFinite(t2.target2_balance_bn_eur)) {
        var val = t2.target2_balance_bn_eur;
        var sign = val >= 0 ? "+" : "";
        rows += '<div class="cp-gauge-row"><span class="cp-gauge-lbl">TARGET2 balance</span><span class="cp-gauge-info">' + sign + val.toFixed(0) + " Bn EUR</span></div>";
      }
      return rows;
    })() + // ── BoJ/MoF yields (JP additional tenors) ────────────────────────
    (function() {
      var bj = S.bojData[iso2];
      if (!bj) return "";
      var rows = "";
      if (Number.isFinite(bj.bond_yield_2y)) {
        rows += '<div class="cp-gauge-row"><span class="cp-gauge-lbl">2Y JGB yield</span><span class="cp-gauge-info">' + bj.bond_yield_2y.toFixed(3) + "%</span></div>";
      }
      if (Number.isFinite(bj.bond_yield_5y)) {
        rows += '<div class="cp-gauge-row"><span class="cp-gauge-lbl">5Y JGB yield</span><span class="cp-gauge-info">' + bj.bond_yield_5y.toFixed(3) + "%</span></div>";
      }
      return rows ? '<div class="cp-gauge-section-hdr">JGB Yield Curve (MoF)</div>' + rows : "";
    })() + // ── Trade Partners (UN Comtrade) ──────────────────────────────────
    (function() {
      var ct = S.comtradeData[iso2];
      if (!ct) return "";
      function partnerRows(list) {
        return list.slice(0, 5).map(function(p) {
          var flag = isoToFlag(p.iso2);
          var val = p.value_bn >= 100 ? "$" + Math.round(p.value_bn) + "B" : p.value_bn >= 1 ? "$" + p.value_bn.toFixed(1) + "B" : "$" + (p.value_bn * 1e3).toFixed(0) + "M";
          return `<div class="cp-trade-partner-row" onclick="openCountryPanel('` + escAttr(p.iso2) + `')"><span class="cp-trade-flag">` + flag + '</span><span class="cp-trade-name">' + escHtml(p.name) + '</span><span class="cp-trade-val">' + val + "</span></div>";
        }).join("");
      }
      var html = '<div class="cp-gauge-section-hdr">Top Trade Partners (' + (ct.year || "") + ")</div>";
      if (ct.top_exports && ct.top_exports.length) {
        html += '<div class="cp-trade-sub-hdr">Exports to</div>' + partnerRows(ct.top_exports);
      }
      if (ct.top_imports && ct.top_imports.length) {
        html += '<div class="cp-trade-sub-hdr">Imports from</div>' + partnerRows(ct.top_imports);
      }
      return html;
    })() + // Terrorism (GTD)
    (function() {
      var gtd = S.gtdSummary && S.gtdSummary.byCountry ? S.gtdSummary.byCountry[iso2] : null;
      if (!gtd) return "";
      var rows = "";
      rows += '<div class="cp-gauge-row"><span class="cp-gauge-lbl">Incidents</span><span class="cp-gauge-info">' + escHtml(gtd.incidents) + "</span></div>";
      rows += '<div class="cp-gauge-row"><span class="cp-gauge-lbl">Fatalities</span><span class="cp-gauge-info">' + escHtml(gtd.fatalities) + "</span></div>";
      rows += '<div class="cp-gauge-row"><span class="cp-gauge-lbl">Years Active</span><span class="cp-gauge-info">' + escHtml(gtd.years_active) + "</span></div>";
      return '<div class="cp-gauge-section-hdr">Terrorism (GTD 2010-2024)</div>' + rows;
    })() + // Crypto Adoption
    (function() {
      var crypto = S.cryptoSummary && S.cryptoSummary.byCountry ? S.cryptoSummary.byCountry[iso2] : null;
      if (!crypto) return "";
      var rows = "";
      var rankColor = crypto.adoption_rank <= 10 ? "cp-green" : crypto.adoption_rank <= 25 ? "cp-blue" : crypto.adoption_rank <= 40 ? "" : "cp-amber";
      rows += '<div class="cp-gauge-row"><span class="cp-gauge-lbl">Adoption Rank</span><span class="cp-gauge-info ' + rankColor + '">#' + crypto.adoption_rank + " of 55</span></div>";
      rows += _cpGaugeRow("Crypto users", crypto.crypto_users_pct, 10, "%", "cp-blue", "", iso2);
      if (crypto.exchanges) rows += '<div class="cp-gauge-row"><span class="cp-gauge-lbl">Exchanges</span><span class="cp-gauge-info">' + crypto.exchanges + "</span></div>";
      return '<div class="cp-gauge-section-hdr">Crypto Adoption</div>' + rows;
    })();
    document.getElementById("cp-body").innerHTML = '<div class="cp-left-col">' + gaugeHtml + '</div><div class="cp-right-col">' + (typeof _buildRadarCard === "function" ? _buildRadarCard(iso2) : "") + (typeof _buildRankChips === "function" ? _buildRankChips(iso2) : "") + "</div>";
    _buildTrendTabs(iso2);
  }
  function _buildCountryDataCaches() {
    for (var iso in S.countryData) {
      var c = S.countryData[iso];
      if (!c) continue;
      if (c.credit_sp) c.credit_sp_num = S._creditToNum.sp[c.credit_sp] ?? null;
      if (c.credit_moodys) c.credit_moodys_num = S._creditToNum.moodys[c.credit_moodys] ?? null;
      if (c.credit_fitch) c.credit_fitch_num = S._creditToNum.fitch[c.credit_fitch] ?? null;
    }
    var radarAxes = [
      { key: "gdp_per_capita", inv: false },
      { key: "life_expectancy", inv: false },
      { key: "govt_debt_gdp", inv: true },
      { key: "fiscal_balance_gdp", inv: true },
      { key: "cpi_inflation", inv: true },
      { key: "unemployment_rate", inv: true }
    ];
    S._avgScoreCache = /* @__PURE__ */ new Map();
    radarAxes.forEach(function(axis) {
      var max = _cpWorldMax(axis.key);
      var sum = 0, count = 0;
      for (var k in S.countryData) {
        var v = (S.countryData[k] || {})[axis.key];
        if (!Number.isFinite(v)) continue;
        var raw;
        if (axis.key === "fiscal_balance_gdp") {
          raw = Math.min(1, Math.max(0, (v + 15) / 30));
        } else {
          var r2 = Math.min(1, Math.max(0, v / (max || 1)));
          raw = axis.inv ? 1 - r2 : r2;
        }
        sum += raw;
        count++;
      }
      S._avgScoreCache.set(axis.key, count ? sum / count : 0);
    });
    var rankKeys = [
      "gdp_per_capita",
      "life_expectancy",
      "govt_debt_gdp",
      "cpi_inflation",
      "unemployment_rate",
      "hdi",
      "ti_cpi_score",
      "wgi_rule_of_law",
      "wgi_corruption",
      "renewable_energy_pct"
    ];
    S._rankCacheByRegion = /* @__PURE__ */ new Map();
    var regions = [];
    for (var iso in S.countryData) {
      var r = S.countryData[iso] && S.countryData[iso].region;
      if (r && regions.indexOf(r) === -1) regions.push(r);
    }
    regions.forEach(function(region) {
      var byKey = /* @__PURE__ */ new Map();
      rankKeys.forEach(function(key) {
        var peers = [];
        for (var iso2 in S.countryData) {
          if (!S.countryData[iso2] || S.countryData[iso2].region !== region) continue;
          var v = S.countryData[iso2][key];
          if (Number.isFinite(v)) peers.push({ iso: iso2, val: v });
        }
        byKey.set(key, peers);
      });
      S._rankCacheByRegion.set(region, byKey);
    });
  }
  function _buildRadar(iso2) {
    if (!S.countryData[iso2]) return "";
    var cd = S.countryData[iso2] || {};
    var axes = [
      { key: "gdp_per_capita", label: "GDP/cap", inv: false },
      { key: "life_expectancy", label: "Life exp", inv: false },
      { key: "govt_debt_gdp", label: "Debt", inv: true },
      { key: "fiscal_balance_gdp", label: "Fiscal", inv: true },
      { key: "cpi_inflation", label: "Inflation", inv: true },
      { key: "unemployment_rate", label: "Unemploy", inv: true }
    ];
    var n = axes.length;
    var cx = 90, cy = 92, R = 65;
    var maxVals = {};
    axes.forEach(function(a) {
      maxVals[a.key] = _cpWorldMax(a.key);
    });
    function score(key, inv, val) {
      if (!Number.isFinite(val)) return 0;
      var max = maxVals[key];
      if (!max) return 0;
      if (key === "fiscal_balance_gdp") {
        return Math.min(1, Math.max(0, (val + 15) / 30));
      }
      var raw = Math.min(1, Math.max(0, val / max));
      return inv ? 1 - raw : raw;
    }
    function avgScore(axis) {
      if (S._avgScoreCache) return S._avgScoreCache.get(axis.key) ?? 0;
      var sum = 0, count = 0;
      for (var k in S.countryData) {
        var merged = S.countryData[k] || {};
        var v = merged[axis.key];
        if (Number.isFinite(v)) {
          sum += score(axis.key, axis.inv, v);
          count++;
        }
      }
      return count ? sum / count : 0;
    }
    function pt(angle, r) {
      var a = angle - Math.PI / 2;
      return { x: (cx + r * Math.cos(a)).toFixed(1), y: (cy + r * Math.sin(a)).toFixed(1) };
    }
    function polyPts(scores) {
      return scores.map(function(s, i) {
        var p = pt(2 * Math.PI * i / n, s * R);
        return p.x + "," + p.y;
      }).join(" ");
    }
    var countryScores = axes.map(function(a) {
      return score(a.key, a.inv, cd[a.key]);
    });
    var avgScores = axes.map(function(a) {
      return avgScore(a);
    });
    var rings = [0.25, 0.5, 0.75, 1].map(function(frac) {
      var pts = axes.map(function(_, i) {
        var p = pt(2 * Math.PI * i / n, frac * R);
        return p.x + "," + p.y;
      }).join(" ");
      return '<polygon points="' + pts + '" fill="none" stroke="#30363d" stroke-width="0.5"/>';
    }).join("");
    var axisLines = "", axisLabels = "";
    axes.forEach(function(a, i) {
      var tip = pt(2 * Math.PI * i / n, R);
      axisLines += '<line x1="' + cx + '" y1="' + cy + '" x2="' + tip.x + '" y2="' + tip.y + '" stroke="#30363d" stroke-width="0.5"/>';
      var lp = pt(2 * Math.PI * i / n, R + 15);
      axisLabels += '<text x="' + lp.x + '" y="' + lp.y + '" text-anchor="middle" dominant-baseline="middle" font-size="7" fill="#8b949e">' + escHtml(a.label) + "</text>";
    });
    var svgW = 180, svgH = 200;
    return '<div class="cp-radar-wrap"><svg width="' + svgW + '" height="' + svgH + '" viewBox="0 0 ' + svgW + " " + svgH + '" xmlns="http://www.w3.org/2000/svg">' + rings + axisLines + axisLabels + '<polygon points="' + polyPts(avgScores) + '" fill="none" stroke="#8b949e" stroke-width="1" stroke-dasharray="3,2" opacity="0.5"/><polygon points="' + polyPts(countryScores) + '" fill="#388bfd" fill-opacity="0.2" stroke="#388bfd" stroke-width="1.5"/></svg></div>';
  }
  function _buildEnergyRadar(iso2) {
    var cd = S.countryData[iso2];
    if (!cd || !Number.isFinite(cd.energy_year)) return "";
    var axes = [
      { key: "energy_wind_solar_pct", label: "Wind/Solar" },
      { key: "energy_hydro_pct", label: "Hydro" },
      { key: "energy_nuclear_pct", label: "Nuclear" },
      { key: "energy_gas_pct", label: "Gas" },
      { key: "energy_coal_pct", label: "Coal" }
    ];
    var n = axes.length;
    var cx = 90, cy = 92, R = 65;
    function pt(angle, r) {
      return { x: cx + r * Math.sin(angle), y: cy - r * Math.cos(angle) };
    }
    function polyPts(scores) {
      return scores.map(function(s, i) {
        var p = pt(2 * Math.PI * i / n, s * R);
        return p.x.toFixed(2) + "," + p.y.toFixed(2);
      }).join(" ");
    }
    var sortedByAxis = axes.map(function(a) {
      var vals = [];
      for (var k in S.countryData) {
        var v = S.countryData[k][a.key];
        if (Number.isFinite(v)) vals.push(v);
      }
      vals.sort(function(x, y) {
        return x - y;
      });
      return vals;
    });
    function percentile(axisIdx, val) {
      if (!Number.isFinite(val)) return 0;
      var sorted = sortedByAxis[axisIdx];
      if (!sorted.length) return 0;
      var lo = 0, hi = sorted.length;
      while (lo < hi) {
        var mid = lo + hi >> 1;
        if (sorted[mid] < val) lo = mid + 1;
        else hi = mid;
      }
      return sorted.length > 1 ? lo / (sorted.length - 1) : 0.5;
    }
    var avgScores = axes.map(function(a, i) {
      var sorted = sortedByAxis[i];
      if (!sorted.length) return 0;
      var medianVal = sorted[Math.floor(sorted.length / 2)];
      return percentile(i, medianVal);
    });
    var countryScores = axes.map(function(a, i) {
      return percentile(i, cd[a.key]);
    });
    var rings = "";
    [0.25, 0.5, 0.75, 1].forEach(function(frac) {
      var pts = axes.map(function(_, i) {
        var p = pt(2 * Math.PI * i / n, frac * R);
        return p.x.toFixed(2) + "," + p.y.toFixed(2);
      }).join(" ");
      rings += '<polygon points="' + pts + '" fill="none" stroke="#30363d" stroke-width="0.5"/>';
    });
    var axisLines = "";
    var axisLabels = "";
    axes.forEach(function(a, i) {
      var outer = pt(2 * Math.PI * i / n, R);
      axisLines += '<line x1="' + cx + '" y1="' + cy + '" x2="' + outer.x.toFixed(2) + '" y2="' + outer.y.toFixed(2) + '" stroke="#30363d" stroke-width="0.5"/>';
      var lp = pt(2 * Math.PI * i / n, R + 14);
      axisLabels += '<text x="' + lp.x.toFixed(2) + '" y="' + lp.y.toFixed(2) + '" text-anchor="middle" dominant-baseline="middle" font-size="7" fill="#8b949e">' + escHtml(a.label) + "</text>";
    });
    var cleanPct = (cd.energy_wind_solar_pct || 0) + (cd.energy_hydro_pct || 0) + (cd.energy_nuclear_pct || 0);
    var fillColor = cleanPct >= 60 ? "#2ea043" : cleanPct >= 30 ? "#388bfd" : "#d29922";
    var svgW = 180, svgH = 200;
    return '<div class="cp-radar-section"><div class="cp-radar-title">Energy Mix (' + cd.energy_year + ')</div><div class="cp-radar-wrap"><svg width="' + svgW + '" height="' + svgH + '" viewBox="0 0 ' + svgW + " " + svgH + '" xmlns="http://www.w3.org/2000/svg">' + rings + axisLines + axisLabels + '<polygon points="' + polyPts(avgScores) + '" fill="none" stroke="#8b949e" stroke-width="1" stroke-dasharray="3,2" opacity="0.5"/><polygon points="' + polyPts(countryScores) + '" fill="' + fillColor + '" fill-opacity="0.2" stroke="' + fillColor + '" stroke-width="1.5"/></svg></div></div>';
  }
  function _buildRadarCard(iso2) {
    var econHtml = typeof _buildRadar === "function" ? _buildRadar(iso2) : "";
    var energyHtml = typeof _buildEnergyRadar === "function" ? _buildEnergyRadar(iso2) : "";
    if (!econHtml && !energyHtml) return "";
    if (!energyHtml) return econHtml;
    if (!econHtml) return energyHtml;
    return `<div class="cp-radar-card"><div class="cp-radar-tabs"><button class="cp-radar-tab cp-radar-tab-active" onclick="_switchRadarTab(this,'economy')">Economy</button><button class="cp-radar-tab" onclick="_switchRadarTab(this,'energy')">Energy</button></div><div class="cp-radar-pane" data-pane="economy">` + econHtml + '</div><div class="cp-radar-pane cp-radar-pane-hidden" data-pane="energy">' + energyHtml + "</div></div>";
  }
  function _switchRadarTab(btn, pane) {
    var card = btn;
    while (card && !card.classList.contains("cp-radar-card")) card = card.parentElement;
    if (!card) return;
    card.querySelectorAll(".cp-radar-tab").forEach(function(b) {
      b.classList.remove("cp-radar-tab-active");
    });
    card.querySelectorAll(".cp-radar-pane").forEach(function(p) {
      p.classList.add("cp-radar-pane-hidden");
    });
    btn.classList.add("cp-radar-tab-active");
    var target = card.querySelector('[data-pane="' + pane + '"]');
    if (target) target.classList.remove("cp-radar-pane-hidden");
  }
  function _buildRankChips(iso2) {
    var wbData = S.countryData[iso2];
    if (!wbData || !wbData.region) return "";
    var region = wbData.region;
    var cd = S.countryData[iso2] || {};
    function rankIn(key, lowerIsBetter) {
      var peers;
      if (S._rankCacheByRegion) {
        var regionMap = S._rankCacheByRegion.get(region);
        if (!regionMap) return null;
        var cacheKey = key + "__" + lowerIsBetter;
        var cached = regionMap.get(cacheKey);
        if (!cached) {
          var raw = regionMap.get(key);
          if (!raw) return null;
          cached = raw.slice().sort(function(a, b) {
            return lowerIsBetter ? a.val - b.val : b.val - a.val;
          });
          regionMap.set(cacheKey, cached);
        }
        peers = cached;
      } else {
        peers = [];
        for (var k in S.countryData) {
          if (!S.countryData[k] || S.countryData[k].region !== region) continue;
          var v = S.countryData[k][key];
          if (Number.isFinite(v)) peers.push({ iso: k, val: v });
        }
        peers.sort(function(a, b) {
          return lowerIsBetter ? a.val - b.val : b.val - a.val;
        });
      }
      if (peers.length < 2) return null;
      var pos = peers.findIndex(function(p) {
        return p.iso === iso2;
      });
      return pos === -1 ? null : { rank: pos + 1, total: peers.length };
    }
    var indicators = [
      { key: "gdp_per_capita", label: "GDP/cap", inv: false, wbKey: "wb_gdp_per_capita" },
      { key: "life_expectancy", label: "Life exp", inv: false, wbKey: "wb_life_expectancy" },
      { key: "govt_debt_gdp", label: "Debt/GDP", inv: true, wbKey: "wb_govt_debt_gdp" },
      { key: "cpi_inflation", label: "Inflation", inv: true, wbKey: "wb_cpi_inflation" },
      { key: "unemployment_rate", label: "Unemployment", inv: true, wbKey: "wb_unemployment_rate" },
      { key: "hdi", label: "HDI", inv: false, wbKey: "wb_hdi" },
      { key: "ti_cpi_score", label: "Transparency", inv: false, wbKey: "wb_ti_cpi" },
      { key: "wgi_rule_of_law", label: "Rule of Law", inv: false, wbKey: "wb_wgi_rule_of_law" },
      { key: "wgi_corruption", label: "Anti-Corrupt.", inv: false, wbKey: "wb_wgi_corruption" },
      { key: "renewable_energy_pct", label: "Renewables", inv: false, wbKey: "wb_renewable_energy_pct" }
    ];
    var chips = indicators.map(function(ind) {
      var r = rankIn(ind.key, ind.inv);
      if (!r) return "";
      var rankLabel = "#" + r.rank;
      var onclick = "openStatsPanel(" + JSON.stringify(ind.wbKey) + "," + JSON.stringify(iso2) + ")";
      return '<button class="cp-rank-chip" onclick="' + escHtml(onclick) + '" title="Click to see global ranking"><div class="cp-chip-top"><span class="cp-chip-lbl">' + escHtml(ind.label) + '</span><span class="cp-chip-rank">' + rankLabel + '</span></div><div class="cp-chip-sub">of ' + r.total + " \xB7 " + escHtml(region) + "</div></button>";
    }).filter(function(s) {
      return s !== "";
    }).join("");
    if (!chips) return "";
    return '<div class="cp-rank-chips"><div class="cp-rank-hdr">Regional rank</div>' + chips + "</div>";
  }
  function _buildTrendTabs(iso2) {
    var cd = S.countryData[iso2] || {};
    var isEurozone = !!(S.ecbData.eurozone_countries && S.ecbData.eurozone_countries.includes(iso2));
    var isJP = iso2 === "JP";
    var hasBea = !!(S.beaTradeData[iso2] && S.beaTradeData[iso2].length > 0);
    var tabs = [
      { key: "gdp_per_capita", label: "GDP/cap" },
      { key: "cpi_inflation", label: "Inflation" },
      { key: "unemployment_rate", label: "Unemploy" },
      { key: "govt_debt_gdp", label: "Debt/GDP" },
      { key: "fiscal_balance_gdp", label: "Fiscal" },
      { key: "life_expectancy", label: "Life exp" }
    ].filter(function(d) {
      return cd[d.key + "_history"] && cd[d.key + "_history"].length > 0;
    });
    if (isEurozone && S.ecbBonds[iso2] && S.ecbBonds[iso2].bond_yield_10y_history && S.ecbBonds[iso2].bond_yield_10y_history.length > 0) {
      tabs.push({ key: "ecb_bond_10y", label: "Bond 10Y" });
    } else if (cd.bond_yield_10y_history && cd.bond_yield_10y_history.length > 0) {
      tabs.push({ key: "bond_yield_10y", label: "Bond 10Y" });
    }
    if (isEurozone) {
      if (S.ecbData.ecb_deposit_rate_history && S.ecbData.ecb_deposit_rate_history.length > 0) {
        tabs.push({ key: "ecb_deposit_rate", label: "ECB Rate" });
      }
      if (S.ecbData.ecb_mro_rate_history && S.ecbData.ecb_mro_rate_history.length > 0) {
        tabs.push({ key: "ecb_mro_rate", label: "ECB MRO" });
      }
      if (S.ecbData.euribor_3m_history && S.ecbData.euribor_3m_history.length > 0) {
        tabs.push({ key: "euribor_3m", label: "Euribor 3M" });
      }
    }
    var od = S.oecdData[iso2];
    if (od) {
      if (od.rd_spend_history && od.rd_spend_history.length > 0) tabs.push({ key: "rd_spend_history", label: "R&D spend" });
      if (od.tertiary_history && od.tertiary_history.length > 0) tabs.push({ key: "tertiary_history", label: "Tertiary edu" });
      if (od.tax_revenue_history && od.tax_revenue_history.length > 0) tabs.push({ key: "tax_revenue_history", label: "Tax revenue" });
    }
    if (isJP && S.bojData.JP) {
      if (S.bojData.JP.bond_yield_10y_history && S.bojData.JP.bond_yield_10y_history.length > 0)
        tabs.push({ key: "jgb_10y", label: "JGB 10Y" });
    }
    if (hasBea) {
      tabs.push({ key: "bea_exports", label: "\u2192 US Exp" });
      tabs.push({ key: "bea_imports", label: "\u2190 US Imp" });
    }
    if (cd.energy_coal_pct_history && cd.energy_coal_pct_history.length > 0) {
      tabs.push({ key: "energy_coal_pct", label: "Coal %" });
    }
    var trendEl = document.getElementById("cp-trend");
    if (!trendEl || tabs.length === 0) {
      if (trendEl) trendEl.style.display = "none";
      return;
    }
    var html = '<div class="cp-tab-strip">' + tabs.map(function(d, i) {
      return '<button class="cp-tab' + (i === 0 ? " active" : "") + '" onclick="_switchTrendTab(' + JSON.stringify(iso2) + "," + JSON.stringify(d.key) + ')">' + escHtml(d.label) + "</button>";
    }).join("") + '</div><div id="cp-chart-area"></div>';
    trendEl.innerHTML = html;
    trendEl.style.display = "";
    _switchTrendTab(iso2, tabs[0].key);
  }
  function _switchTrendTab(iso2, key) {
    var cd = S.countryData[iso2] || {};
    document.querySelectorAll("#cp-trend .cp-tab").forEach(function(btn) {
      var onc = btn.getAttribute("onclick") || "";
      btn.classList.toggle("active", onc.indexOf(JSON.stringify(key)) !== -1);
    });
    var chartArea = document.getElementById("cp-chart-area");
    if (!chartArea) return;
    var chartLabels = {
      gdp_per_capita: "GDP per capita (USD)",
      govt_debt_gdp: "Govt debt (% of GDP)",
      cpi_inflation: "CPI inflation (%)",
      life_expectancy: "Life expectancy (yrs)",
      unemployment_rate: "Unemployment (%)",
      fiscal_balance_gdp: "Fiscal balance (% GDP)",
      bond_yield_10y: "10-yr bond yield (%)",
      ecb_bond_10y: "10-yr sovereign yield (%)",
      ecb_deposit_rate: "ECB deposit rate (%)",
      ecb_mro_rate: "ECB MRO / refi rate (%)",
      euribor_3m: "Euribor 3M (%)",
      jgb_10y: "JGB 10Y yield (%)",
      bea_exports: "US goods exports (USD bn)",
      bea_imports: "US goods imports (USD bn)",
      rd_spend_history: "R&D spending (% of GDP)",
      tertiary_history: "Tertiary enrollment (%)",
      tax_revenue_history: "Tax revenue \u2014 central govt (% GDP)",
      energy_coal_pct: "Coal share of electricity (%)"
    };
    var points = null;
    var isTimestamp = false;
    var color = "#388bfd";
    if (key === "energy_coal_pct") color = "#8B4513";
    if (key === "ecb_bond_10y") {
      var h = S.ecbBonds[iso2] && S.ecbBonds[iso2].bond_yield_10y_history;
      if (h && h.length) {
        isTimestamp = true;
        points = h.map(function(r) {
          return { t: (/* @__PURE__ */ new Date(r[0] + "-01")).getTime(), v: r[1] };
        });
      }
    } else if (key === "euribor_3m") {
      var h = S.ecbData.euribor_3m_history;
      if (h && h.length) {
        isTimestamp = true;
        points = h.map(function(r) {
          return { t: (/* @__PURE__ */ new Date(r[0] + "-01")).getTime(), v: r[1] };
        });
      }
    } else if (key === "ecb_deposit_rate" || key === "ecb_mro_rate") {
      var h = key === "ecb_deposit_rate" ? S.ecbData.ecb_deposit_rate_history : S.ecbData.ecb_mro_rate_history;
      if (h && h.length) {
        isTimestamp = true;
        points = h.map(function(r) {
          return { t: new Date(r[0]).getTime(), v: r[1] };
        });
      }
    } else if (key === "jgb_10y") {
      var h = S.bojData.JP && S.bojData.JP.bond_yield_10y_history;
      if (h && h.length) {
        isTimestamp = true;
        points = h.map(function(r) {
          return { t: (/* @__PURE__ */ new Date(r[0] + "-01")).getTime(), v: r[1] };
        });
      }
    } else if (key === "bea_exports" || key === "bea_imports") {
      var arr = S.beaTradeData[iso2];
      color = key === "bea_exports" ? "#3fb950" : "#f85149";
      if (arr && arr.length) {
        var field = key === "bea_exports" ? "expGds" : "impGds";
        points = arr.map(function(r) {
          return { t: r.year, v: r[field] > 0 ? r[field] / 1e9 : null };
        }).filter(function(p) {
          return p.v !== null && Number.isFinite(p.v);
        });
      }
    } else if (key === "rd_spend_history" || key === "tertiary_history" || key === "tax_revenue_history") {
      var od = S.oecdData[iso2];
      var raw = od && od[key];
      if (raw && raw.length) {
        points = raw.map(function(r) {
          return { t: r[0], v: r[1] };
        }).filter(function(p) {
          return Number.isFinite(p.v);
        });
      }
    } else if (key === "bond_yield_10y") {
      var raw = cd.bond_yield_10y_history;
      if (raw && raw.length) {
        isTimestamp = true;
        points = raw.map(function(r) {
          return { t: (/* @__PURE__ */ new Date(r[0] + "-01")).getTime(), v: r[1] };
        }).filter(function(p) {
          return Number.isFinite(p.v);
        });
      }
    } else {
      var raw = cd[key + "_history"];
      if (raw && raw.length) {
        points = raw.map(function(r) {
          return { t: r[0], v: r[1] };
        }).filter(function(p) {
          return Number.isFinite(p.v);
        });
      }
    }
    if (!points || !points.length) {
      chartArea.innerHTML = '<div class="cp-no-data">No historical data available</div>';
      return;
    }
    chartArea.innerHTML = '<canvas id="cp-iy-canvas" style="width:100%;height:144px;display:block;"></canvas>';
    var canvas = document.getElementById("cp-iy-canvas");
    requestAnimationFrame(function() {
      _IYChart(canvas, points, {
        isTimestamp,
        label: chartLabels[key] || key,
        color,
        fillOpacity: 0.15
      });
    });
  }
  function _computeCountryCentroids() {
    if (!S.worldGeo) return;
    for (const feat of S.worldGeo.features) {
      const iso2 = feat.properties?.iso2;
      if (!iso2) continue;
      const pts = [];
      const collect = (ring) => ring.forEach(([lng, lat]) => pts.push([lat, lng]));
      const g = feat.geometry;
      if (g.type === "Polygon") g.coordinates.forEach(collect);
      else if (g.type === "MultiPolygon") g.coordinates.forEach((p) => p.forEach(collect));
      if (pts.length) {
        countryCentroids[iso2] = [
          pts.reduce((s, c) => s + c[0], 0) / pts.length,
          pts.reduce((s, c) => s + c[1], 0) / pts.length
        ];
      }
    }
  }
  async function fetchBeaTrade(beaCountryName) {
    const url = `https://apps.bea.gov/api/data/?UserID=YOUR_BEA_API_KEY_HERE&method=GetData&DataSetName=ITA&Indicator=ExpGds,ImpGds,ExpSvcs,ImpSvcs&AreaOrCountry=${encodeURIComponent(beaCountryName)}&Frequency=A&Year=ALL&ResultFormat=JSON`;
    const res = await fetch(url);
    const json = await res.json();
    const rows = json?.BEAAPI?.Results?.Data;
    if (!rows) return null;
    const byYear = {};
    for (const r of rows) {
      const yr = parseInt(r.TimePeriod, 10);
      if (isNaN(yr)) continue;
      const raw = parseFloat((r.DataValue || "").replace(/,/g, ""));
      if (isNaN(raw)) continue;
      const val = raw * 1e6;
      if (!byYear[yr]) byYear[yr] = { year: yr };
      if (r.Indicator === "ExpGds") byYear[yr].expGds = val;
      if (r.Indicator === "ImpGds") byYear[yr].impGds = val;
      if (r.Indicator === "ExpSvcs") byYear[yr].expSvcs = val;
      if (r.Indicator === "ImpSvcs") byYear[yr].impSvcs = val;
    }
    return Object.values(byYear).sort((a, b) => a.year - b.year);
  }
  function _saveTradeToLS(iso2, data) {
    try {
      localStorage.setItem(LS_TRADE_PREFIX + iso2, JSON.stringify({ ts: Date.now(), data }));
    } catch (_) {
    }
  }
  function _loadTradeFromLS(iso2) {
    try {
      const raw = localStorage.getItem(LS_TRADE_PREFIX + iso2);
      if (!raw) return null;
      const { ts, data } = JSON.parse(raw);
      if (Date.now() - ts > LS_TRADE_TTL) {
        localStorage.removeItem(LS_TRADE_PREFIX + iso2);
        return null;
      }
      return data;
    } catch (_) {
      return null;
    }
  }
  function _tradeArc(lat1, lon1, lat2, lon2, offsetDir) {
    let lon2a = lon2;
    if (lon2a - lon1 > 180) lon2a -= 360;
    if (lon2a - lon1 < -180) lon2a += 360;
    const dl = lat2 - lat1, dn = lon2a - lon1;
    const len = Math.sqrt(dl * dl + dn * dn) || 1;
    const midLat = (lat1 + lat2) / 2;
    const midLon = (lon1 + lon2a) / 2;
    const ctrl = [
      midLat + -dn / len * 5 * offsetDir,
      midLon + dl / len * 5 * offsetDir
    ];
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40, u = 1 - t;
      pts.push([
        u * u * lat1 + 2 * u * t * ctrl[0] + t * t * lat2,
        u * u * lon1 + 2 * u * t * ctrl[1] + t * t * lon2a
      ]);
    }
    return pts;
  }
  function _tradeArrowWeight(usd) {
    const log = Math.log10(Math.max(usd, 1e9));
    return Math.max(2, Math.min(14, 2 + 12 * (log - 9) / (12 - 9)));
  }
  function drawTradeArrows(iso2, data, year) {
    clearTradeArrows();
    const targetPt = CAPITAL_COORDS[iso2] || countryCentroids[iso2];
    const usPt = CAPITAL_COORDS["US"];
    if (!targetPt) return;
    const row = data.find((d) => d.year === year) || data[data.length - 1];
    if (!row) return;
    const markers = [];
    const expTotal = (row.expGds || 0) + (row.expSvcs || 0);
    const impTotal = (row.impGds || 0) + (row.impSvcs || 0);
    if (expTotal > 0) {
      const pts = _tradeArc(usPt[0], usPt[1], targetPt[0], targetPt[1], 1);
      markers.push(L.polyline(pts, {
        color: "#58a6ff",
        weight: _tradeArrowWeight(expTotal),
        opacity: 0.85,
        className: "trade-arrow-export",
        pane: "tradePane",
        interactive: false
      }));
      markers.push(L.circleMarker(targetPt, {
        radius: Math.max(4, _tradeArrowWeight(expTotal) * 0.65),
        color: "#58a6ff",
        fillColor: "#58a6ff",
        fillOpacity: 0.9,
        weight: 0,
        pane: "tradePane",
        interactive: false
      }));
    }
    if (impTotal > 0) {
      const pts = _tradeArc(targetPt[0], targetPt[1], usPt[0], usPt[1], -1);
      markers.push(L.polyline(pts, {
        color: "#f0a500",
        weight: _tradeArrowWeight(impTotal),
        opacity: 0.85,
        className: "trade-arrow-import",
        pane: "tradePane",
        interactive: false
      }));
      markers.push(L.circleMarker(usPt, {
        radius: Math.max(4, _tradeArrowWeight(impTotal) * 0.65),
        color: "#f0a500",
        fillColor: "#f0a500",
        fillOpacity: 0.9,
        weight: 0,
        pane: "tradePane",
        interactive: false
      }));
    }
    S.tradeArrowLayer = L.layerGroup(markers).addTo(S.map);
  }
  function clearTradeArrows() {
    if (S.tradeArrowLayer) {
      S.map.removeLayer(S.tradeArrowLayer);
      S.tradeArrowLayer = null;
    }
  }
  function _getTopCompaniesByIso(iso2, limit = 6) {
    const cos = [];
    for (const city of S.allCities) {
      if (city.iso !== iso2) continue;
      for (const co of S.companiesData[city.qid] || []) {
        if (co.name) cos.push(co);
      }
    }
    const fallbackCur = ISO2_TO_CURRENCY[iso2] || null;
    cos.sort((a, b) => toUSD(b.revenue || 0, b.revenue_currency || fallbackCur) - toUSD(a.revenue || 0, a.revenue_currency || fallbackCur));
    return cos.slice(0, limit);
  }
  function openTradePanel(iso2, countryName, data) {
    const latestYear = data[data.length - 1]?.year || 2024;
    document.getElementById("trade-panel-flag").textContent = isoToFlag(iso2);
    document.getElementById("trade-panel-title").textContent = `${countryName} \u2194 United States`;
    const slider = document.getElementById("trade-year-slider");
    slider.min = data[0]?.year || 1999;
    slider.max = latestYear;
    slider.value = latestYear;
    slider.dataset.iso2 = iso2;
    const chartEl = document.getElementById("trade-chart");
    chartEl.innerHTML = "";
    if (window._tradChartDestroy) {
      window._tradChartDestroy();
      window._tradChartDestroy = null;
    }
    const balPts = data.filter((d) => d.expGds != null || d.expSvcs != null).map((d) => ({
      t: d.year,
      v: (d.expGds || 0) + (d.expSvcs || 0) - ((d.impGds || 0) + (d.impSvcs || 0))
    }));
    if (balPts.length >= 2) {
      const { draw, destroy } = _IYChart(chartEl, balPts, { fmt: "rev", autoColor: true });
      window._tradChartDestroy = destroy;
      requestAnimationFrame(draw);
    }
    const topCos = _getTopCompaniesByIso(iso2, 6);
    document.getElementById("trade-companies-list").innerHTML = topCos.length ? topCos.map((co) => {
      const rev = co.revenue ? `<span class="tco-rev">$${fmtRevenue(toUSD(co.revenue, co.revenue_currency))}</span>` : "";
      const ind = co.industry ? `<span class="tco-ind">${escHtml(co.industry)}</span>` : "";
      return `<div class="tco-row"><span class="tco-name">${escHtml(co.name)}</span>${ind}${rev}</div>`;
    }).join("") : '<div class="tco-empty">No company data for this country</div>';
    _updateTradePanelNumbers(iso2, data, latestYear);
    drawTradeArrows(iso2, data, latestYear);
    document.getElementById("trade-panel").classList.add("open");
    _mobileBackdropOn();
  }
  function _updateTradePanelNumbers(iso2, data, year) {
    const row = data.find((d) => d.year === year) || data[data.length - 1];
    if (!row) return;
    document.getElementById("trade-year-label").textContent = year;
    const fmt = (v) => v ? "$" + fmtRevenue(v) : null;
    const expGds = row.expGds || 0, expSvc = row.expSvcs || 0;
    const impGds = row.impGds || 0, impSvc = row.impSvcs || 0;
    const expTotal = expGds + expSvc, impTotal = impGds + impSvc;
    document.getElementById("tf-exp-total").textContent = fmt(expTotal) || "\u2014";
    document.getElementById("tf-imp-total").textContent = fmt(impTotal) || "\u2014";
    const expParts = [expGds && `Goods ${fmt(expGds)}`, expSvc && `Svc ${fmt(expSvc)}`].filter(Boolean);
    const impParts = [impGds && `Goods ${fmt(impGds)}`, impSvc && `Svc ${fmt(impSvc)}`].filter(Boolean);
    document.getElementById("tf-exp-detail").textContent = expParts.join(" \xB7 ");
    document.getElementById("tf-imp-detail").textContent = impParts.join(" \xB7 ");
    const maxFlow = Math.max(expTotal, impTotal, 1);
    document.getElementById("tf-exp-bar").style.width = `${(expTotal / maxFlow * 100).toFixed(1)}%`;
    document.getElementById("tf-imp-bar").style.width = `${(impTotal / maxFlow * 100).toFixed(1)}%`;
    const balance = expTotal - impTotal;
    const balEl = document.getElementById("trade-balance-val");
    balEl.textContent = (balance >= 0 ? "+" : "\u2212") + "$" + fmtRevenue(Math.abs(balance));
    balEl.style.color = balance >= 0 ? "#3fb950" : "#f85149";
    document.getElementById("trade-balance-label").textContent = balance >= 0 ? "US Surplus" : "US Deficit";
  }
  function closeCountryPopup() {
    closeCountryPanel();
  }
  function closeTradePanelFn() {
    document.getElementById("trade-panel").classList.remove("open");
    clearTradeArrows();
    _mobileBackdropOff();
    if (window._tradChartDestroy) {
      window._tradChartDestroy();
      window._tradChartDestroy = null;
    }
  }
  async function _loadAndShowTrade(iso2, countryName) {
    if (iso2 === "US") return;
    const beaName = ISO2_TO_BEA[iso2];
    if (!beaName) return;
    if (!tradeCache[iso2]) {
      if (S.beaTradeData[iso2]) {
        tradeCache[iso2] = S.beaTradeData[iso2];
      } else {
        const cached = _loadTradeFromLS(iso2);
        if (cached) {
          tradeCache[iso2] = cached;
        } else {
          document.getElementById("trade-panel-flag").textContent = "\u23F3";
          document.getElementById("trade-panel-title").textContent = "Loading\u2026";
          document.getElementById("trade-panel").classList.add("open");
          try {
            const data = await fetchBeaTrade(beaName);
            if (!data || !data.length) {
              document.getElementById("trade-panel-title").textContent = `No BEA data for ${countryName}`;
              return;
            }
            tradeCache[iso2] = data;
            _saveTradeToLS(iso2, data);
          } catch (_) {
            document.getElementById("trade-panel-title").textContent = "Trade data unavailable";
            return;
          }
        }
      }
    }
    openTradePanel(iso2, countryName, tradeCache[iso2]);
  }
  async function toggleChoropleth() {
    S.choroOn = !S.choroOn;
    const btn = document.getElementById("choro-toggle-btn");
    var opts = document.getElementById("choro-options");
    if (S.choroOn) {
      if (S.admin1On) {
        await toggleAdmin1Global();
      }
      const origText = btn.textContent;
      btn.textContent = "Loading\u2026";
      btn.disabled = true;
      await _worldGeoLoader.ensure();
      if (!S._choroControlsInited) {
        initChoroControls();
        S._choroControlsInited = true;
      }
      btn.textContent = "Countries";
      btn.disabled = false;
      btn.classList.add("on");
      if (opts) opts.style.display = "flex";
      _updateMapLegends();
      buildChoropleth();
    } else {
      btn.textContent = "Countries";
      btn.classList.remove("on");
      if (opts) opts.style.display = "none";
      if (S.choroplethLayer) {
        S.map.removeLayer(S.choroplethLayer);
        S.choroplethLayer = null;
      }
      _updateMapLegends();
    }
    _updateHash();
  }
  function toggleNationsPanel() {
    _nationsPanelOpen = !_nationsPanelOpen;
    const panel = document.getElementById("nations-panel");
    const btn = document.getElementById("nations-fab");
    panel.classList.toggle("visible", _nationsPanelOpen);
    if (btn) btn.classList.toggle("active", _nationsPanelOpen);
    if (_nationsPanelOpen && !panel.dataset.inited) {
      _buildNationsList();
      panel.dataset.inited = "1";
    }
  }
  function _buildNationsList() {
    const body = document.getElementById("nations-panel-body");
    body.innerHTML = "";
    if (!document.getElementById("choro-select")) {
      const sel = document.createElement("select");
      sel.id = "choro-select";
      sel.style.display = "none";
      body.appendChild(sel);
    }
    CHORO_INDICATORS.forEach((ind) => {
      const div = document.createElement("div");
      div.className = "nations-indicator" + (S.activeChoroKey === ind.key ? " active" : "");
      div.dataset.key = ind.key;
      div.textContent = ind.label;
      div.addEventListener("click", () => {
        S.activeChoroKey = ind.key;
        S._choroYear = null;
        _updateChoroSliderVisibility();
        const sel = document.getElementById("choro-select");
        if (sel) sel.value = ind.key;
        if (!S.choroOn) toggleChoropleth();
        buildChoropleth();
        _updateNationsActive();
        _updateMapLegends();
      });
      body.appendChild(div);
    });
  }
  function _updateNationsActive() {
    document.querySelectorAll(".nations-indicator").forEach((div) => {
      div.classList.toggle("active", div.dataset.key === S.activeChoroKey);
    });
  }
  function initChoroControls() {
    const sel = document.getElementById("choro-select");
    CHORO_INDICATORS.forEach((ind) => {
      const opt = document.createElement("option");
      opt.value = ind.key;
      opt.textContent = ind.label;
      if (ind.key === S.activeChoroKey) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", function() {
      S.activeChoroKey = this.value;
      S._choroYear = null;
      _stopChoroPlay();
      _updateChoroSliderVisibility();
      buildChoropleth();
    });
    document.getElementById("choropleth-bar").style.display = "inline-flex";
  }
  function _admin1RegionVal(iso2, regionName) {
    var result = null;
    var sd = S.subnatData[iso2];
    if (sd) {
      if (sd.regions) {
        var mapKey = sd.la_to_region || sd.dept_to_region || sd.province_to_region;
        if (mapKey) {
          var regionKey = mapKey[regionName];
          if (regionKey && sd.regions[regionKey]) result = sd.regions[regionKey];
        }
        if (!result && sd.regions[regionName]) result = sd.regions[regionName];
      }
      if (!result && sd[regionName]) result = sd[regionName];
      if (!result) {
        for (var k in sd) {
          if (sd[k] && sd[k].name === regionName) {
            result = sd[k];
            break;
          }
        }
      }
    }
    if (!result) {
      var euroCountries = ADMIN_TO_NUTS2[iso2];
      if (euroCountries && Object.keys(S.eurostatRegions).length) {
        var nuts2 = euroCountries[regionName];
        if (nuts2 && S.eurostatRegions[nuts2]) {
          result = { label: S.eurostatRegions[nuts2].name, gdp_pps_eu100: S.eurostatRegions[nuts2].gdp_pps_eu100 };
        }
      }
    }
    var hdiCountry = S.subnatHdiData[iso2];
    if (hdiCountry) {
      var hdiLookup = hdiCountry.regions || hdiCountry;
      var hdiMap = hdiCountry.la_to_region || hdiCountry.dept_to_region || hdiCountry.province_to_region || null;
      var hdi = hdiLookup[regionName];
      if (!hdi && hdiMap) hdi = hdiLookup[hdiMap[regionName]];
      if (!hdi && sd && sd.la_to_region) hdi = hdiLookup[sd.la_to_region[regionName]];
      if (!hdi && sd && sd.dept_to_region) hdi = hdiLookup[sd.dept_to_region[regionName]];
      if (hdi) {
        if (!result) result = {};
        result.hdi = hdi.hdi;
        result.hdi_health = hdi.health;
        result.hdi_education = hdi.education;
        result.hdi_income = hdi.income;
        result.hdi_year = hdi.year;
      }
    }
    return result;
  }
  async function _ensureTopoClient() {
    if (window.topojson) return window.topojson;
    await new Promise(function(resolve, reject) {
      var s = document.createElement("script");
      s.src = "https://unpkg.com/topojson-client@3/dist/topojson-client.min.js";
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return window.topojson;
  }
  function _buildAdmin1Layer(iso2, geoData) {
    return L.geoJSON(geoData, {
      pane: "admin1Pane",
      style: function(feature) {
        var name = feature.properties && feature.properties.name;
        var regionData = _admin1RegionVal(iso2, name);
        var hasData = !!regionData;
        return {
          fillColor: hasData ? "#1f6feb" : "#30363d",
          fillOpacity: hasData ? 0.25 : 0.08,
          color: "#58a6ff",
          weight: 1,
          opacity: 0.6
        };
      },
      onEachFeature: function(feature, layer) {
        var name = feature.properties && feature.properties.name || "";
        var code = feature.properties && feature.properties.code || "";
        var regionData = _admin1RegionVal(iso2, name);
        var tip = "<b>" + escHtml(name) + "</b>";
        if (code) tip += ' <span style="opacity:.6">(' + escHtml(code) + ")</span>";
        if (regionData) {
          if (regionData.gdp_pps_eu100 != null) tip += "<br>GDP: " + regionData.gdp_pps_eu100 + " (EU=100)";
          if (regionData.gdp_bn_eur != null) tip += "<br>GDP: \u20AC" + regionData.gdp_bn_eur + "B";
          if (regionData.gva_bn_gbp != null) tip += "<br>GVA: \xA3" + regionData.gva_bn_gbp + "B";
          if (regionData.unemployment_rate != null) tip += "<br>Unemployment: " + regionData.unemployment_rate + "%";
          if (regionData.pcpi != null) tip += "<br>Per-cap income: $" + Math.round(regionData.pcpi).toLocaleString();
          if (regionData.gdp_bn_cny != null) tip += "<br>GDP: \xA5" + regionData.gdp_bn_cny + "B";
          if (regionData.grdp_bn_krw != null) tip += "<br>GRDP: \u20A9" + Math.round(regionData.grdp_bn_krw).toLocaleString() + "B";
          if (regionData.gsdp_bn_inr != null) tip += "<br>GSDP: \u20B9" + Math.round(regionData.gsdp_bn_inr).toLocaleString() + "B";
          if (regionData.gsp_bn_aud != null) tip += "<br>GSP: A$" + regionData.gsp_bn_aud + "B";
          if (regionData.gdp_bn_cad != null) tip += "<br>GDP: C$" + regionData.gdp_bn_cad + "B";
          if (regionData.perCapitaIncomeJpy != null) tip += "<br>Income: \xA5" + Math.round(regionData.perCapitaIncomeJpy / 1e3) + "k";
          if (regionData.population_m != null) tip += "<br>Pop: " + regionData.population_m + "M";
          if (regionData.population != null && !regionData.population_m) tip += "<br>Pop: " + Math.round(regionData.population / 1e6 * 10) / 10 + "M";
          if (regionData.hdi != null) tip += "<br>HDI: " + regionData.hdi.toFixed(3);
        }
        layer.bindTooltip(tip, { sticky: true, className: "admin1-tooltip" });
        layer.on({
          click: function(e) {
            L.DomEvent.stopPropagation(e);
            S._selectedRegion = { iso2, name, code, data: regionData };
            openCountryPanel(iso2);
          },
          mouseover: function(e) {
            if (S._admin1HoverTarget && S._admin1HoverTarget !== e.target) {
              try {
                var prevIso = S._admin1HoverIso;
                if (prevIso && S.admin1Layers[prevIso]) S.admin1Layers[prevIso].resetStyle(S._admin1HoverTarget);
              } catch (ex) {
              }
            }
            S._admin1HoverTarget = e.target;
            S._admin1HoverIso = iso2;
            e.target.setStyle({ weight: 2, fillOpacity: 0.4, color: "#79c0ff" });
          },
          mouseout: function(e) {
            if (S.admin1Layers[iso2]) S.admin1Layers[iso2].resetStyle(e.target);
            if (S._admin1HoverTarget === e.target) {
              S._admin1HoverTarget = null;
              S._admin1HoverIso = null;
            }
          }
        });
      }
    });
  }
  function _loadAdmin1Country(iso2) {
    if (S.admin1Layers[iso2]) return Promise.resolve();
    if (S._admin1Loading[iso2]) return S._admin1Loading[iso2];
    S._admin1Loading[iso2] = (async function() {
      try {
        var fetches = [];
        if (!admin1Cache[iso2]) {
          fetches.push(
            _kdbOrFetch("/admin1/" + iso2 + ".json").then(function(r) {
              return r.json();
            }).then(function(d) {
              if (d) admin1Cache[iso2] = d;
            }).catch(function() {
            })
          );
        }
        if (S.subnatFiles[iso2] && !S.subnatData[iso2]) {
          fetches.push(fetch("/" + S.subnatFiles[iso2]).then(function(r) {
            if (r.ok) return r.json();
            return null;
          }).then(function(d) {
            if (d) S.subnatData[iso2] = d;
          }).catch(function() {
          }));
        }
        if (fetches.length) await Promise.all(fetches);
        if (!admin1Cache[iso2]) return;
        var topoClient = await _ensureTopoClient();
        var topo = admin1Cache[iso2];
        var objKey = Object.keys(topo.objects)[0];
        var geoData = topoClient.feature(topo, topo.objects[objKey]);
        var layer = _buildAdmin1Layer(iso2, geoData);
        if (S.admin1On) {
          layer.addTo(S.map);
          S.admin1Layers[iso2] = layer;
        }
      } catch (e) {
        console.warn("[admin1] Failed to load", iso2, e.message);
      } finally {
        delete S._admin1Loading[iso2];
      }
    })();
    return S._admin1Loading[iso2];
  }
  function _ensureCountryBounds() {
    if (S._countryBounds) return;
    S._countryBounds = {};
    if (!S.worldGeo) return;
    for (var i = 0; i < S.worldGeo.features.length; i++) {
      var feat = S.worldGeo.features[i];
      var iso2 = (feat.properties && (feat.properties.iso2 || feat.properties.ISO_A2) || "").toUpperCase();
      if (!iso2 || iso2.length !== 2) continue;
      var minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
      var found = false;
      var processRing = function(ring) {
        for (var j = 0; j < ring.length; j++) {
          var lng = ring[j][0], lat = ring[j][1];
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
          found = true;
        }
      };
      var g = feat.geometry;
      if (!g) continue;
      if (g.type === "Polygon") g.coordinates.forEach(processRing);
      else if (g.type === "MultiPolygon") g.coordinates.forEach(function(p) {
        p.forEach(processRing);
      });
      if (found) {
        S._countryBounds[iso2] = L.latLngBounds([minLat, minLng], [maxLat, maxLng]);
      }
    }
  }
  function _visibleCountries() {
    if (!S.worldGeo || !S.admin1Index) return [];
    _ensureCountryBounds();
    var bounds = S.map.getBounds();
    var result = [];
    for (var iso2 in S._countryBounds) {
      if (!S.admin1Index[iso2]) continue;
      if (bounds.intersects(S._countryBounds[iso2])) result.push(iso2);
    }
    return result;
  }
  function _updateAdmin1Visible() {
    if (!S.admin1On) return;
    var visible = _visibleCountries();
    var toLoad = visible.filter(function(iso2) {
      return !S.admin1Layers[iso2] && !S._admin1Loading[iso2];
    });
    if (toLoad.length === 0) return;
    toLoad.sort(function(a, b) {
      return (S.admin1Index[a].kb || 0) - (S.admin1Index[b].kb || 0);
    });
    var batch = toLoad.slice(0, 10);
    var promises = batch.map(function(iso2) {
      return _loadAdmin1Country(iso2);
    });
    Promise.all(promises).then(function() {
      if (S.admin1On) _updateAdmin1Visible();
    });
  }
  function _debouncedAdmin1Update() {
    if (S._admin1UpdateTimer) clearTimeout(S._admin1UpdateTimer);
    S._admin1UpdateTimer = setTimeout(_updateAdmin1Visible, 200);
  }
  async function toggleAdmin1Global() {
    S.admin1On = !S.admin1On;
    var btn = document.getElementById("admin1-toggle-btn");
    if (S.admin1On) {
      if (S.choroOn) {
        await toggleChoropleth();
      }
      btn.textContent = "Loading\u2026";
      btn.disabled = true;
      await _worldGeoLoader.ensure();
      if (!S.admin1Index) {
        var idxRes = await _kdbOrFetch("/admin1/_index.json");
        if (idxRes.ok) S.admin1Index = await idxRes.json();
        else S.admin1Index = {};
      }
      await _ensureTopoClient();
      btn.textContent = "Regions";
      btn.disabled = false;
      btn.classList.add("on");
      _updateAdmin1Visible();
      S.map.on("moveend", _debouncedAdmin1Update);
    } else {
      btn.textContent = "Regions";
      btn.classList.remove("on");
      S.map.off("moveend", _debouncedAdmin1Update);
      closeRegionPanel();
      for (var iso2 in S.admin1Layers) {
        if (S.admin1Layers[iso2]) S.map.removeLayer(S.admin1Layers[iso2]);
      }
      S.admin1Layers = {};
    }
  }
  function _buildRegionSection() {
    var r = S._selectedRegion;
    if (!r || !r.data) {
      S._selectedRegion = null;
      return "";
    }
    var rd = r.data;
    var html = '<div class="cp-gauge-section-hdr" style="color:var(--accent)">' + escHtml(r.name) + (r.code ? ' <span style="opacity:.6;font-weight:400">(' + escHtml(r.code) + ")</span>" : "") + `<button onclick="clearRegionSelection('` + escHtml(r.iso2) + `')" style="float:right;background:none;border:none;color:var(--text-faint);cursor:pointer;font-size:.75rem" title="Clear region selection">\xD7</button></div>`;
    if (rd.gdp_bn_eur != null) {
      html += _cpInfoRow("GDP", "\u20AC" + fmtNum(rd.gdp_bn_eur) + "B");
      if (rd.gdp_per_capita_eur != null) html += _cpInfoRow("GDP/cap", "\u20AC" + fmtNum(rd.gdp_per_capita_eur));
    }
    if (rd.gva_bn_gbp != null) {
      html += _cpInfoRow("GVA", "\xA3" + fmtNum(rd.gva_bn_gbp) + "B");
      if (rd.gva_per_capita_gbp != null) html += _cpInfoRow("GVA/cap", "\xA3" + fmtNum(rd.gva_per_capita_gbp));
    }
    if (rd.gdp_pps_eu100 != null) html += _cpInfoRow("GDP (PPS, EU=100)", rd.gdp_pps_eu100);
    if (rd.pcpi != null) html += _cpInfoRow("Per-cap income", "$" + fmtNum(Math.round(rd.pcpi)));
    if (rd.gdp_bn_cny != null) {
      html += _cpInfoRow("GDP", "\xA5" + fmtNum(rd.gdp_bn_cny) + "B");
      if (rd.gdp_per_capita_cny != null) html += _cpInfoRow("GDP/cap", "\xA5" + fmtNum(rd.gdp_per_capita_cny));
    }
    if (rd.grdp_bn_krw != null) html += _cpInfoRow("GRDP", "\u20A9" + fmtNum(Math.round(rd.grdp_bn_krw)) + "B");
    if (rd.gsdp_bn_inr != null) html += _cpInfoRow("GSDP", "\u20B9" + fmtNum(Math.round(rd.gsdp_bn_inr)) + "B");
    if (rd.gsp_bn_aud != null) html += _cpInfoRow("GSP", "A$" + fmtNum(rd.gsp_bn_aud) + "B");
    if (rd.gdp_bn_cad != null) html += _cpInfoRow("GDP", "C$" + fmtNum(rd.gdp_bn_cad) + "B");
    if (rd.perCapitaIncomeJpy != null) html += _cpInfoRow("Per-cap income", "\xA5" + fmtNum(Math.round(rd.perCapitaIncomeJpy)));
    if (rd.unemployment_rate != null) html += _cpInfoRow("Unemployment", rd.unemployment_rate + "%");
    if (rd.population_m != null) html += _cpInfoRow("Population", fmtNum(rd.population_m) + "M");
    else if (rd.population != null) html += _cpInfoRow("Population", fmtNum(rd.population));
    if (rd.hdi != null) html += _cpInfoRow("HDI", rd.hdi.toFixed(3));
    if (rd.hdi_health != null) html += _cpInfoRow("HDI Health", rd.hdi_health.toFixed(3));
    if (rd.hdi_education != null) html += _cpInfoRow("HDI Education", rd.hdi_education.toFixed(3));
    if (rd.hdi_income != null) html += _cpInfoRow("HDI Income", rd.hdi_income.toFixed(3));
    S._selectedRegion = null;
    return html;
  }
  function _cpInfoRow(label, value) {
    return '<div class="cp-gauge-row"><span class="cp-gauge-lbl">' + escHtml(label) + '</span><span class="cp-gauge-info">' + value + "</span></div>";
  }
  function closeRegionPanel() {
    var rp = document.getElementById("region-panel");
    if (rp) rp.classList.remove("open");
    _mobileBackdropOff();
  }
  function _updateMapLegends() {
    const citiesVisible = S.wikiLayer && S.map.hasLayer(S.wikiLayer) && S.cityDotMode !== "hide";
    const wl = document.getElementById("wiki-legend");
    const cl = document.getElementById("choro-legend");
    const el = document.getElementById("econ-legend-inline");
    if (wl) wl.style.display = citiesVisible ? "flex" : "none";
    if (cl) cl.style.display = S.choroOn ? "flex" : "none";
    if (el) el.style.display = S.econOn ? "flex" : "none";
  }
  function setCityDotMode(mode) {
    S.cityDotMode = mode;
    const pane = S.map && S.map.getPane("cityPane");
    if (!pane) return;
    pane.style.opacity = mode === "hide" ? "0" : mode === "dim" ? "0.2" : "1";
    pane.style.pointerEvents = mode === "hide" ? "none" : "";
    if (mode === "hide" && S.wikiLayer && S.map.hasLayer(S.wikiLayer)) {
      S.map.removeLayer(S.wikiLayer);
      S.map.closePopup();
      closeWikiSidebar();
    } else if (mode !== "hide" && S.wikiLayer && !S.map.hasLayer(S.wikiLayer)) {
      S.wikiLayer.addTo(S.map);
      _updateDotControls();
    }
    document.querySelectorAll(".city-vis-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
    const topbarBtn = document.getElementById("cities-toggle-btn");
    if (topbarBtn) {
      topbarBtn.textContent = "Cities";
      topbarBtn.classList.toggle("on", mode !== "hide");
      topbarBtn.classList.toggle("dim", mode === "dim");
    }
    _updateMapLegends();
    localStorage.setItem("wdm_citiesMode", mode);
  }
  function toggleCities() {
    const pane = S.map && S.map.getPane("cityPane");
    if (!pane) return;
    if (S.map.hasLayer(S.wikiLayer)) {
      if (pane.style.opacity === "1") {
        setCityDotMode("dim");
      } else if (pane.style.opacity === "0.2") {
        setCityDotMode("hide");
      } else {
        setCityDotMode("show");
      }
    } else {
      setCityDotMode("show");
    }
  }
  function _drawEconColorRamp() {
    const canvas = document.getElementById("econ-color-ramp");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height;
    for (let x = 0; x < w; x++) {
      ctx.fillStyle = econDotColor(Math.pow(10, Math.log10(5e8) + x / w * (Math.log10(5e12) - Math.log10(5e8))));
      ctx.fillRect(x, 0, 1, h);
    }
  }
  function toggleUnescoLayer() {
    S.unescoOn = !S.unescoOn;
    var btn = document.getElementById("unesco-toggle-btn");
    if (S.unescoOn) {
      btn.textContent = "UNESCO";
      btn.classList.add("on");
      buildUnescoLayer();
    } else {
      btn.textContent = "UNESCO";
      btn.classList.remove("on");
      if (S.unescoLayer) {
        S.map.removeLayer(S.unescoLayer);
        S.unescoLayer = null;
      }
    }
  }
  function buildUnescoLayer() {
    if (S.unescoLayer) {
      S.map.removeLayer(S.unescoLayer);
      S.unescoLayer = null;
    }
    if (!S.unescoOn || !S.unescoSites.length) return;
    var typeColor = { Cultural: "#e6a817", Natural: "#3fb950", Mixed: "#a371f7" };
    var markers = S.unescoSites.map(function(s) {
      var color = typeColor[s.type] || "#8b949e";
      var marker = L.circleMarker([s.lat, s.lng], {
        pane: "overlayLayersPane",
        radius: 5,
        fillColor: color,
        color: "#0d1117",
        weight: 1,
        fillOpacity: 0.85
      });
      marker.bindTooltip(
        '<b style="color:' + color + '">' + escHtml(s.name) + '</b><br><span style="color:var(--text-secondary)">' + s.type + " \xB7 " + s.year + " \xB7 " + s.iso2 + "</span>",
        { direction: "top", className: "admin1-tooltip" }
      );
      marker.on("click", function() {
        openCountryPanel(s.iso2);
      });
      return marker;
    });
    S.unescoLayer = L.layerGroup(markers).addTo(S.map);
  }
  async function toggleCableLayer() {
    S.cableOn = !S.cableOn;
    var btn = document.getElementById("cable-toggle-btn");
    if (S.cableOn) {
      btn.textContent = "\u{1F4E1} Cables: \u2026";
      btn.classList.add("on");
      if (!S.cableData) {
        try {
          var res = await _kdbOrFetch("/submarine-cables.json");
          S.cableData = await res.json();
          console.log("[cables] Loaded: " + S.cableData.cables.length + " cables, " + S.cableData.landings.length + " landing points");
        } catch (e) {
          console.warn("[cables] Failed to load submarine-cables.json");
          S.cableOn = false;
          btn.textContent = "Submarine Cables";
          btn.classList.remove("on");
          return;
        }
      }
      btn.textContent = "Submarine Cables";
      buildCableLayer();
    } else {
      btn.textContent = "Submarine Cables";
      btn.classList.remove("on");
      if (S.cableLayer) {
        S.map.removeLayer(S.cableLayer);
        S.cableLayer = null;
      }
    }
  }
  function buildCableLayer() {
    if (S.cableLayer) {
      S.map.removeLayer(S.cableLayer);
      S.cableLayer = null;
    }
    if (!S.cableOn || !S.cableData) return;
    var layers = [];
    for (var i = 0; i < S.cableData.cables.length; i++) {
      var c = S.cableData.cables[i];
      for (var j = 0; j < c.segments.length; j++) {
        var latlngs = c.segments[j].map(function(p) {
          return [p[1], p[0]];
        });
        var line = L.polyline(latlngs, {
          pane: "overlayLayersPane",
          color: c.color || "#58a6ff",
          weight: 1.5,
          opacity: 0.6
        });
        line.bindTooltip('<b style="color:var(--accent)">' + escHtml(c.name) + "</b>", {
          direction: "top",
          className: "admin1-tooltip",
          sticky: true
        });
        layers.push(line);
      }
    }
    for (var k = 0; k < S.cableData.landings.length; k++) {
      var lp = S.cableData.landings[k];
      var dot = L.circleMarker([lp.lat, lp.lng], {
        pane: "overlayLayersPane",
        radius: 2.5,
        fillColor: "#58a6ff",
        color: "#0d1117",
        weight: 0.5,
        fillOpacity: 0.7
      });
      dot.bindTooltip('<b style="color:var(--accent)">' + escHtml(lp.name) + "</b>", {
        direction: "top",
        className: "admin1-tooltip"
      });
      layers.push(dot);
    }
    S.cableLayer = L.layerGroup(layers).addTo(S.map);
  }
  function _greatCirclePoints(lat1, lng1, lat2, lng2, n) {
    var toRad = Math.PI / 180, toDeg = 180 / Math.PI;
    var la1 = lat1 * toRad, lo1 = lng1 * toRad, la2 = lat2 * toRad, lo2 = lng2 * toRad;
    var dLon = Math.abs(lo2 - lo1);
    var crossesAnti = dLon > Math.PI;
    if (crossesAnti) {
      if (lo2 > lo1) lo1 += 2 * Math.PI;
      else lo2 += 2 * Math.PI;
    }
    var d = 2 * Math.asin(Math.sqrt(Math.pow(Math.sin((la2 - la1) / 2), 2) + Math.cos(la1) * Math.cos(la2) * Math.pow(Math.sin((lo2 - lo1) / 2), 2)));
    if (d < 0.01) return { pts: [[lat1, lng1], [lat2, lng2]], crossesAnti: false };
    var pts = [];
    for (var i = 0; i <= n; i++) {
      var f = i / n;
      var A = Math.sin((1 - f) * d) / Math.sin(d);
      var B = Math.sin(f * d) / Math.sin(d);
      var x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
      var y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
      var z = A * Math.sin(la1) + B * Math.sin(la2);
      var lat = Math.atan2(z, Math.sqrt(x * x + y * y)) * toDeg;
      var lng = Math.atan2(y, x) * toDeg;
      if (lng > 180) lng -= 360;
      if (lng < -180) lng += 360;
      pts.push([lat, lng]);
    }
    return { pts, crossesAnti };
  }
  async function toggleAirRouteLayer() {
    S.airRouteOn = !S.airRouteOn;
    var btn = document.getElementById("airroute-toggle-btn");
    if (S.airRouteOn) {
      btn.textContent = "\u2708 Flights: \u2026";
      btn.classList.add("on");
      if (!S.airRouteData) {
        try {
          var res = await _kdbOrFetch("/air-routes.json");
          S.airRouteData = await res.json();
          console.log("[air-routes] Loaded: " + S.airRouteData.routes.length + " routes");
        } catch (e) {
          console.warn("[air-routes] Failed to load");
          S.airRouteOn = false;
          btn.textContent = "\u2708 Flights: Off";
          btn.classList.remove("on");
          return;
        }
      }
      btn.textContent = "\u2708 Flights: On";
      buildAirRouteLayer();
    } else {
      btn.textContent = "\u2708 Flights: Off";
      btn.classList.remove("on");
      if (S.airRouteLayer) {
        S.map.removeLayer(S.airRouteLayer);
        S.airRouteLayer = null;
      }
    }
  }
  function buildAirRouteLayer() {
    if (S.airRouteLayer) {
      S.map.removeLayer(S.airRouteLayer);
      S.airRouteLayer = null;
    }
    if (!S.airRouteOn || !S.airRouteData) return;
    var layers = [];
    var maxAirlines = S.airRouteData.routes[0]?.airlines || 24;
    for (var i = 0; i < S.airRouteData.routes.length; i++) {
      var r = S.airRouteData.routes[i];
      var result = _greatCirclePoints(r.lat1, r.lng1, r.lat2, r.lng2, 20);
      var pts = result.pts;
      var weight = 0.5 + r.airlines / maxAirlines * 2;
      var opacity = 0.15 + r.airlines / maxAirlines * 0.4;
      if (result.crossesAnti) {
        var splitIdx = -1;
        for (var j = 1; j < pts.length; j++) {
          var dLng = Math.abs(pts[j][1] - pts[j - 1][1]);
          if (dLng > 170) {
            splitIdx = j;
            break;
          }
        }
        if (splitIdx > 0) {
          var pts1 = pts.slice(0, splitIdx);
          var line1 = L.polyline(pts1, { pane: "overlayLayersPane", color: "#58a6ff", weight, opacity });
          layers.push(line1);
          var pts2 = pts.slice(splitIdx);
          var line2 = L.polyline(pts2, { pane: "overlayLayersPane", color: "#58a6ff", weight, opacity });
          layers.push(line2);
          continue;
        }
      }
      var line = L.polyline(pts, {
        pane: "overlayLayersPane",
        color: "#58a6ff",
        weight,
        opacity
      });
      line.bindTooltip(
        '<b style="color:var(--accent)">' + escHtml(r.fromIata) + " \u2194 " + escHtml(r.toIata) + '</b><br><span style="color:var(--text-secondary)">' + escHtml(r.from) + " \u2194 " + escHtml(r.to) + '</span><br><span style="color:var(--univ-gold)">' + r.airlines + " airlines</span>",
        { direction: "top", className: "admin1-tooltip", sticky: true }
      );
      layers.push(line);
    }
    if (S.airRouteData.hubs) {
      for (var j = 0; j < S.airRouteData.hubs.length; j++) {
        var h = S.airRouteData.hubs[j];
        var dot = L.circleMarker([h.lat, h.lng], {
          pane: "overlayLayersPane",
          radius: 3 + h.routes / 5,
          fillColor: "#e3b341",
          color: "#0d1117",
          weight: 1,
          fillOpacity: 0.8
        });
        dot.bindTooltip(
          '<b style="color:var(--univ-gold)">' + escHtml(h.iata) + "</b> " + escHtml(h.city) + '<br><span style="color:var(--text-secondary)">' + h.routes + " top intl routes</span>",
          { direction: "top", className: "admin1-tooltip" }
        );
        layers.push(dot);
      }
    }
    S.airRouteLayer = L.layerGroup(layers).addTo(S.map);
  }
  function _parsePlateName(code) {
    const parts = code.split("-");
    if (parts.length !== 2) return code;
    const [a, b] = parts.map((p) => _PLATE_NAMES[p] || p);
    return `${a} \u2013 ${b} Boundary`;
  }
  async function toggleTectonicLayer() {
    S.tectonicOn = !S.tectonicOn;
    const btn = document.getElementById("tectonic-toggle-btn");
    if (S.tectonicOn) {
      btn.textContent = "\u{1F5FA} Plates: \u2026";
      btn.classList.add("on");
      if (!S.tectonicData) {
        try {
          const res = await _kdbOrFetch("/tectonic-plates.json");
          S.tectonicData = await res.json();
        } catch (e) {
          console.warn("[tectonic] Failed to load");
          S.tectonicOn = false;
          btn.textContent = "Tectonic Plates";
          btn.classList.remove("on");
          return;
        }
      }
      btn.textContent = "Tectonic Plates";
      S.tectonicLayer = L.geoJSON(S.tectonicData, {
        style: () => ({ color: "#e85d04", weight: 2, opacity: 0.7, interactive: false }),
        pane: "choroplethPane",
        onEachFeature: (feature, layer) => {
          if (feature.properties.name) {
            const displayName = _parsePlateName(feature.properties.name);
            layer.bindTooltip(escHtml(displayName), {
              direction: "top",
              className: "admin1-tooltip",
              sticky: true
            });
            layer.options.interactive = true;
          }
        }
      }).addTo(S.map);
    } else {
      btn.textContent = "Tectonic Plates";
      btn.classList.remove("on");
      if (S.tectonicLayer) {
        S.map.removeLayer(S.tectonicLayer);
        S.tectonicLayer = null;
      }
    }
  }
  function _quakeColor(depth) {
    if (depth < 70) return "#ffd166";
    if (depth < 300) return "#ef8354";
    return "#d62828";
  }
  async function toggleEarthquakeLayer() {
    S.earthquakeOn = !S.earthquakeOn;
    const btn = document.getElementById("earthquake-toggle-btn");
    if (S.earthquakeOn) {
      btn.textContent = "Earthquakes";
      btn.classList.add("on");
      await _fetchEarthquakes();
      S._earthquakeTimer = setInterval(() => _fetchEarthquakes(), 5 * 6e4);
    } else {
      btn.textContent = "Earthquakes";
      btn.classList.remove("on");
      if (S._earthquakeTimer) {
        clearInterval(S._earthquakeTimer);
        S._earthquakeTimer = null;
      }
      if (S.earthquakeLayer) {
        S.map.removeLayer(S.earthquakeLayer);
        S.earthquakeLayer = null;
      }
    }
  }
  async function _fetchEarthquakes() {
    try {
      const res = await fetch("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson");
      S.earthquakeData = await res.json();
    } catch (e) {
      console.warn("[earthquake] Failed to fetch USGS data");
      return;
    }
    _buildEarthquakeLayer();
  }
  function _buildEarthquakeLayer() {
    if (S.earthquakeLayer) {
      S.map.removeLayer(S.earthquakeLayer);
      S.earthquakeLayer = null;
    }
    if (!S.earthquakeOn || !S.earthquakeData) return;
    const layers = [];
    for (const f of S.earthquakeData.features) {
      const [lng, lat, depth] = f.geometry.coordinates;
      const mag = f.properties.mag || 0;
      const marker = L.circleMarker([lat, lng], {
        pane: "overlayLayersPane",
        radius: 2 + mag * 2,
        fillColor: _quakeColor(depth),
        color: "#000",
        weight: 0.5,
        fillOpacity: 0.75
      });
      const time = new Date(f.properties.time).toLocaleString();
      marker.bindTooltip(
        '<b style="color:var(--gold)">M' + mag.toFixed(1) + "</b> " + escHtml(f.properties.place || "") + '<br><span style="color:var(--text-secondary)">Depth: ' + (depth || 0).toFixed(0) + ' km</span><br><span style="color:var(--text-muted)">' + time + "</span>",
        { direction: "top", className: "admin1-tooltip" }
      );
      layers.push(marker);
    }
    S.earthquakeLayer = L.layerGroup(layers).addTo(S.map);
  }
  function _volcanoColor(lastEruption) {
    if (lastEruption == null) return "#888";
    if (lastEruption > 1900) return "#d62828";
    if (lastEruption > 0) return "#ef8354";
    if (lastEruption > -1e4) return "#ffd166";
    return "#888";
  }
  function toggleMoreLayers(e) {
    e.stopPropagation();
    const btn = document.getElementById("more-layers-btn");
    const menu = document.getElementById("more-layers-menu");
    const isOpen = menu.classList.contains("open");
    btn.classList.toggle("open", !isOpen);
    menu.classList.toggle("open", !isOpen);
  }
  async function toggleVolcanoLayer() {
    S.volcanoOn = !S.volcanoOn;
    const btn = document.getElementById("volcano-toggle-btn");
    if (S.volcanoOn) {
      btn.textContent = "Volcanoes";
      btn.classList.add("on");
      if (!S.volcanoData) {
        try {
          const res = await _kdbOrFetch("/volcanoes_full.json");
          S.volcanoData = await res.json();
        } catch (e) {
          console.warn("[volcano] Failed to load");
          S.volcanoOn = false;
          btn.textContent = "Volcanoes";
          btn.classList.remove("on");
          return;
        }
      }
      btn.textContent = "Volcanoes";
      _buildVolcanoLayer();
    } else {
      btn.textContent = "Volcanoes";
      btn.classList.remove("on");
      if (S.volcanoLayer) {
        S.map.removeLayer(S.volcanoLayer);
        S.volcanoLayer = null;
      }
    }
  }
  function _buildVolcanoLayer() {
    if (S.volcanoLayer) {
      S.map.removeLayer(S.volcanoLayer);
      S.volcanoLayer = null;
    }
    if (!S.volcanoOn || !S.volcanoData) return;
    const layers = [];
    for (const f of S.volcanoData.features) {
      const [lng, lat] = f.geometry.coordinates;
      const props = f.properties;
      const marker = L.circleMarker([lat, lng], {
        pane: "overlayLayersPane",
        radius: 5,
        fillColor: _volcanoColor(props.Last_Eruption_Year),
        color: "#000",
        weight: 0.5,
        fillOpacity: 0.85
      });
      const elev = props.Elevation || 0;
      const lastYr = props.Last_Eruption_Year;
      const lastStr = lastYr == null ? "Unknown" : lastYr < 0 ? `${Math.abs(lastYr)} BCE` : `${lastYr}`;
      marker.bindTooltip(
        '<b style="color:var(--red)">' + escHtml(props.Volcano_Name || "Volcano") + '</b><br><span style="color:var(--text-secondary)">' + escHtml(props.Country || "") + "</span><br>Elevation: " + elev + " m<br>Last eruption: " + lastStr + '<br><span style="color:var(--text-muted)">' + escHtml(props.Primary_Volcano_Type || "") + "</span>",
        { direction: "top", className: "admin1-tooltip" }
      );
      layers.push(marker);
    }
    S.volcanoLayer = L.layerGroup(layers).addTo(S.map);
  }
  async function toggleLaunchSiteLayer() {
    S.launchSiteOn = !S.launchSiteOn;
    const btn = document.getElementById("launchsite-toggle-btn");
    if (S.launchSiteOn) {
      btn.textContent = "\u{1F680} Launch: \u2026";
      btn.classList.add("on");
      if (!S.launchSiteData) {
        try {
          const res = await _kdbOrFetch("/launch_sites.json");
          S.launchSiteData = await res.json();
        } catch (e) {
          console.warn("[launchSite] Failed to load");
          S.launchSiteOn = false;
          btn.textContent = "Launch Sites";
          btn.classList.remove("on");
          return;
        }
      }
      btn.textContent = "Launch Sites";
      _buildLaunchSiteLayer();
    } else {
      btn.textContent = "Launch Sites";
      btn.classList.remove("on");
      if (S.launchSiteLayer) {
        S.map.removeLayer(S.launchSiteLayer);
        S.launchSiteLayer = null;
      }
    }
  }
  function _buildLaunchSiteLayer() {
    if (S.launchSiteLayer) {
      S.map.removeLayer(S.launchSiteLayer);
      S.launchSiteLayer = null;
    }
    if (!S.launchSiteOn || !S.launchSiteData) return;
    const layers = [];
    for (const f of S.launchSiteData.features) {
      const [lng, lat] = f.geometry.coordinates;
      const props = f.properties;
      const marker = L.marker([lat, lng], {
        pane: "overlayLayersPane",
        icon: L.divIcon({
          html: '<span style="font-size:16px">\u{1F680}</span>',
          className: "launchsite-icon",
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        })
      });
      marker.bindTooltip(
        '<b style="color:var(--accent)">\u{1F680} ' + escHtml(props.name) + '</b><br><span style="color:var(--text-muted);font-size:0.85em">' + escHtml(props.abbr || "") + "</span>",
        { direction: "top", className: "admin1-tooltip" }
      );
      layers.push(marker);
    }
    S.launchSiteLayer = L.layerGroup(layers).addTo(S.map);
  }
  async function toggleEezLayer() {
    S.eezOn = !S.eezOn;
    const btn = document.getElementById("eez-toggle-btn");
    if (S.eezOn) {
      btn.textContent = "EEZ Boundaries";
      btn.classList.add("on");
      if (!S.eezData) {
        try {
          const res = await _kdbOrFetch("/eez_boundaries.json");
          S.eezData = await res.json();
          if (typeof DatasetManager !== "undefined") {
            DatasetManager.register("eezData", S.eezData, "low");
          }
        } catch (e) {
          console.warn("[eez] Failed to load");
          S.eezOn = false;
          btn.textContent = "EEZ Boundaries";
          btn.classList.remove("on");
          return;
        }
      }
      btn.textContent = "EEZ Boundaries";
      _buildEezLayer();
    } else {
      btn.textContent = "EEZ Boundaries";
      btn.classList.remove("on");
      if (S.eezLayer) {
        S.map.removeLayer(S.eezLayer);
        S.eezLayer = null;
      }
      if (typeof DatasetManager !== "undefined") {
        DatasetManager.unregister("eezData");
      }
    }
  }
  function _buildEezLayer() {
    if (S.eezLayer) {
      S.map.removeLayer(S.eezLayer);
      S.eezLayer = null;
    }
    if (typeof DatasetManager !== "undefined") {
      DatasetManager.unregister("eezData");
    }
    if (!S.eezOn || !S.eezData) return;
    S.eezLayer = L.geoJSON(S.eezData, {
      style: () => ({
        color: "#58a6ff",
        weight: 1,
        fillOpacity: 0.05,
        fillColor: "#58a6ff"
      }),
      pane: "choroplethPane",
      onEachFeature: (feature, layer) => {
        const props = feature.properties;
        if (props.name) {
          layer.bindTooltip(escHtml(props.name), {
            direction: "top",
            className: "admin1-tooltip",
            sticky: true
          });
          layer.options.interactive = true;
        }
      }
    }).addTo(S.map);
  }
  async function toggleIssTracker() {
    S.issOn = !S.issOn;
    const btn = document.getElementById("iss-toggle-btn");
    if (S.issOn) {
      btn.textContent = "ISS Tracker";
      btn.classList.add("on");
      await _fetchIssPosition();
      S._issTimer = setInterval(() => _fetchIssPosition(), 5e3);
    } else {
      btn.textContent = "ISS Tracker";
      btn.classList.remove("on");
      if (S._issTimer) {
        clearInterval(S._issTimer);
        S._issTimer = null;
      }
      if (S.issMarker) {
        S.map.removeLayer(S.issMarker);
        S.issMarker = null;
      }
    }
  }
  async function _fetchIssPosition() {
    try {
      const res = await fetch("http://api.open-notify.org/iss-now.json");
      const data = await res.json();
      const lat = parseFloat(data.iss_position.latitude);
      const lng = parseFloat(data.iss_position.longitude);
      if (S.issMarker) {
        S.issMarker.setLatLng([lat, lng]);
      } else {
        S.issMarker = L.marker([lat, lng], {
          pane: "overlayLayersPane",
          icon: L.divIcon({
            html: '<span style="font-size:24px">\u{1F6F0}\uFE0F</span>',
            className: "iss-icon",
            iconSize: [28, 28],
            iconAnchor: [14, 14]
          })
        }).addTo(S.map);
      }
      S.issMarker.bindTooltip(
        '<b style="color:var(--accent)">ISS</b><br><span style="color:var(--text-secondary)">' + lat.toFixed(2) + "\xB0, " + lng.toFixed(2) + '\xB0</span><br><span style="color:var(--text-muted)">~408 km altitude \xB7 ~28,000 km/h</span>',
        { direction: "top", className: "admin1-tooltip" }
      );
    } catch (e) {
      console.warn("[iss] Failed to fetch position");
    }
  }
  async function toggleAircraftLayer() {
    S.aircraftOn = !S.aircraftOn;
    const btn = document.getElementById("aircraft-toggle-btn");
    if (S.aircraftOn) {
      btn.textContent = "\u2708\uFE0F Aircraft: On";
      btn.classList.add("on");
      await _fetchAircraftPositions();
      S._aircraftTimer = setInterval(() => _fetchAircraftPositions(), 3e4);
      if (!_aircraftMoveHandler) {
        _aircraftMoveHandler = () => {
          if (S.aircraftOn && S.map.getZoom() >= 5) {
            _fetchAircraftPositions();
          }
        };
        S.map.on("moveend", _aircraftMoveHandler);
      }
    } else {
      btn.textContent = "\u2708\uFE0F Aircraft: Off";
      btn.classList.remove("on");
      if (S._aircraftTimer) {
        clearInterval(S._aircraftTimer);
        S._aircraftTimer = null;
      }
      if (S.aircraftLayer) {
        S.map.removeLayer(S.aircraftLayer);
        S.aircraftLayer = null;
      }
      if (_aircraftMoveHandler) {
        S.map.off("moveend", _aircraftMoveHandler);
        _aircraftMoveHandler = null;
      }
      if (S.layersInfo && S.layersInfo.includes("\u2708\uFE0F Zoom in")) {
        document.getElementById("layers-info").textContent = "";
        S.layersInfo = "";
      }
    }
  }
  async function _fetchAircraftPositions() {
    try {
      const res = await _kdbOrFetch("/aircraft-live-lite.json");
      if (!res.ok) {
        console.warn("[aircraft] No data available");
        return;
      }
      const data = await res.json();
      const zoom = S.map.getZoom();
      if (!S.aircraftLayer) {
        S.aircraftLayer = L.layerGroup();
      } else {
        S.aircraftLayer.clearLayers();
      }
      if (zoom < 5) {
        S.layersInfo = "\u2708\uFE0F Zoom in to see aircraft (need zoom 5+)";
        document.getElementById("layers-info").textContent = S.layersInfo;
        return;
      } else if (S.layersInfo && S.layersInfo.includes("Zoom in")) {
        document.getElementById("layers-info").textContent = "";
        S.layersInfo = "";
      }
      const bounds = S.map.getBounds();
      const padding = zoom >= 10 ? 0.2 : zoom >= 7 ? 0.5 : 1;
      const south = Math.max(-90, bounds.getSouth() - padding);
      const north = Math.min(90, bounds.getNorth() + padding);
      let west = bounds.getWest() - padding;
      let east = bounds.getEast() + padding;
      const MAX_AIRCRAFT = zoom >= 13 ? 1e3 : zoom >= 11 ? 500 : zoom >= 8 ? 250 : 100;
      let lastClickedMarker = null;
      const markers = [];
      let count = 0;
      for (const a of data.aircraft || []) {
        if (count >= MAX_AIRCRAFT) break;
        if (a.lo === null || a.la === null) continue;
        let inBounds = a.la >= south && a.la <= north;
        if (inBounds) {
          if (east > 180 || west < -180) {
            inBounds = a.lo >= west || a.lo >= 180 || (a.lo <= east || a.lo <= -180);
          } else {
            inBounds = a.lo >= west && a.lo <= east;
          }
        }
        if (!inBounds) continue;
        const heading = a.t || 0;
        const icon = L.divIcon({
          html: `<div style="width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-bottom:8px solid #3b82f6;transform:rotate(${heading}deg)"></div>`,
          className: "aircraft-icon",
          iconSize: [10, 10],
          iconAnchor: [5, 5]
        });
        const marker = L.marker([a.la, a.lo], { pane: "overlayLayersPane", icon });
        const tooltipData = {
          callsign: a.c || "N/A",
          country: a.n || "",
          alt: a.a ? Math.round(a.a / 0.3048) : null,
          speed: a.v ? Math.round(a.v * 1.944) : null,
          ground: a.g
        };
        marker.on("click", function() {
          if (lastClickedMarker && lastClickedMarker !== this) {
            lastClickedMarker.closeTooltip();
          }
          const tt = L.tooltip({
            content: `<b style="color:var(--accent)">${escHtml(tooltipData.callsign)}</b><br><span style="color:var(--text-secondary)">${escHtml(tooltipData.country)}${tooltipData.ground ? " (Ground)" : ""}</span><br><span style="color:var(--text-muted)">${tooltipData.alt ? tooltipData.alt.toLocaleString() + " ft" : "N/A"} \xB7 ${tooltipData.speed ? tooltipData.speed + " kts" : "N/A"}</span>`,
            direction: "top",
            className: "admin1-tooltip"
          });
          this.bindTooltip(tt).openTooltip();
          lastClickedMarker = this;
        });
        markers.push(marker);
        count++;
      }
      S.aircraftLayer = L.layerGroup(markers).addTo(S.map);
      console.log(`[aircraft] Displayed ${count}/${MAX_AIRCRAFT} aircraft (zoom ${zoom})`);
    } catch (e) {
      console.warn("[aircraft] Failed:", e.message);
    }
  }
  async function toggleWildfireLayer() {
    S.wildfireOn = !S.wildfireOn;
    const btn = document.getElementById("wildfire-toggle-btn");
    if (S.wildfireOn) {
      btn.textContent = "Wildfires";
      btn.classList.add("on");
      await _fetchWildfireData();
      if (!_wildfireMoveHandler) {
        _wildfireMoveHandler = () => {
          if (S.wildfireOn && S.map.getZoom() >= 4) {
            _fetchWildfireData();
          }
        };
        S.map.on("moveend", _wildfireMoveHandler);
      }
    } else {
      btn.textContent = "Wildfires";
      btn.classList.remove("on");
      if (S.wildfireLayer) {
        S.map.removeLayer(S.wildfireLayer);
        S.wildfireLayer = null;
      }
      if (typeof DatasetManager !== "undefined") {
        DatasetManager.unregister("wildfireData");
      }
      if (_wildfireMoveHandler) {
        S.map.off("moveend", _wildfireMoveHandler);
        _wildfireMoveHandler = null;
      }
    }
  }
  async function _fetchWildfireData() {
    try {
      const res = await _kdbOrFetch("/wildfires-live-lite.json");
      if (!res.ok) {
        console.warn("[wildfire] No data available");
        return;
      }
      const data = await res.json();
      const zoom = S.map.getZoom();
      if (!S.wildfireLayer) {
        S.wildfireLayer = L.layerGroup();
      } else {
        S.wildfireLayer.clearLayers();
      }
      if (S.layersInfo && S.layersInfo.includes("Zoom in")) {
        document.getElementById("layers-info").textContent = "";
        S.layersInfo = "";
      }
      const bounds = S.map.getBounds();
      const padding = zoom >= 8 ? 0.5 : zoom >= 6 ? 2 : 5;
      const south = Math.max(-90, bounds.getSouth() - padding);
      const north = Math.min(90, bounds.getNorth() + padding);
      let west = bounds.getWest() - padding;
      let east = bounds.getEast() + padding;
      const MAX_FIRES = data.fires?.length || 1e3;
      const markers = [];
      let count = 0;
      let outsideCount = 0;
      for (const f of data.fires || []) {
        if (f.lo === null || f.la === null) continue;
        let inBounds = f.la >= south && f.la <= north;
        if (inBounds) {
          if (east > 180 || west < -180) {
            inBounds = f.lo >= west || f.lo >= 180 || (f.lo <= east || f.lo <= -180);
          } else {
            inBounds = f.lo >= west && f.lo <= east;
          }
        }
        if (!inBounds) {
          outsideCount++;
          continue;
        }
        const conf = f.c || 70;
        const color = conf >= 70 ? "#ff3333" : conf >= 40 ? "#ff8800" : "#ffcc00";
        const radius = f.s === 1 ? 2.5 : 3.5;
        const marker = L.circleMarker([f.la, f.lo], {
          pane: "overlayLayersPane",
          radius,
          fillColor: color,
          color: "#000",
          weight: 0.5,
          opacity: 0.7,
          fillOpacity: 0.8
        });
        const sat = f.s === 1 ? "VIIRS" : "MODIS";
        const time = f.d === 1 ? "Day" : "Night";
        const brightness = f.b ? `${Math.round(f.b)}K` : "N/A";
        const date = f.date || "N/A";
        marker.bindTooltip(
          `<b style="color:${color}">\u{1F525} Wildfire</b><br><span style="color:var(--text-secondary)">Confidence: ${conf}%</span><br><span style="color:var(--text-muted)">${sat} \xB7 ${time} \xB7 ${brightness}</span><br><span style="color:var(--text-muted)">${date}</span>`,
          { direction: "top", className: "admin1-tooltip", sticky: false, permanent: false }
        );
        markers.push(marker);
        count++;
      }
      S.wildfireLayer = L.layerGroup(markers).addTo(S.map);
      console.log(`[wildfire] Displayed ${count} fires (zoom ${zoom}, viewport: ${outsideCount} culled)`);
    } catch (e) {
      console.warn("[wildfire] Failed:", e.message);
    }
  }
  async function toggleEonetLayer() {
    S.eonetOn = !S.eonetOn;
    const btn = document.getElementById("eonet-toggle-btn");
    if (S.eonetOn) {
      btn.textContent = "Natural Events";
      btn.classList.add("on");
      if (!S.eonetData) {
        try {
          const res = await _kdbOrFetch("/eonet-events-lite.json");
          S.eonetData = await res.json();
        } catch (e) {
          console.warn("[eonet] Failed to load");
          S.eonetOn = false;
          btn.textContent = "Natural Events";
          btn.classList.remove("on");
          return;
        }
      }
      _buildEonetLayer();
    } else {
      btn.textContent = "Natural Events";
      btn.classList.remove("on");
      if (S.eonetLayer) {
        S.map.removeLayer(S.eonetLayer);
        S.eonetLayer = null;
      }
    }
  }
  function _buildEonetLayer() {
    if (S.eonetLayer) {
      S.map.removeLayer(S.eonetLayer);
      S.eonetLayer = null;
    }
    if (!S.eonetOn || !S.eonetData) return;
    const layers = [];
    for (const e of S.eonetData.events || []) {
      if (e.lo === null || e.la === null) continue;
      const colorMap = {
        "Wildfires": "#ff6b6b",
        "Volcanoes": "#ffd93d",
        "Severe Storms": "#6b9bff",
        "Dust Storms": "#d4a574",
        "Landslides": "#a574d4",
        "Sea and Lake Ice": "#74d4d4",
        "Smoke": "#a5a5a5"
      };
      const color = colorMap[e.c] || "#888888";
      const size = e.s === 2 ? 8 : e.s === 1 ? 6 : 4;
      const marker = L.circleMarker([e.la, e.lo], {
        pane: "overlayLayersPane",
        radius: size,
        fillColor: color,
        color: "#000",
        weight: 1,
        fillOpacity: 0.8
      });
      marker.bindTooltip(
        `<b style="color:${color}">${escHtml(e.t)}</b><br><span style="color:var(--text-secondary)">${escHtml(e.c)}</span><br><span style="color:var(--text-muted)">Date: ${e.d}</span>`,
        { direction: "top", className: "admin1-tooltip" }
      );
      layers.push(marker);
    }
    S.eonetLayer = L.layerGroup(layers).addTo(S.map);
    console.log(`[eonet] Displayed ${layers.length} events`);
  }
  async function toggleProtectedAreasLayer() {
    S.protectedAreasOn = !S.protectedAreasOn;
    const btn = document.getElementById("protected-areas-toggle-btn");
    if (S.protectedAreasOn) {
      btn.textContent = "\u{1F332} Protected Areas: On";
      btn.classList.add("on");
      if (!S.protectedAreasData) {
        try {
          const res = await _kdbOrFetch("/protected-areas.json");
          S.protectedAreasData = await res.json();
        } catch (e) {
          console.warn("[protected-areas] Failed to load");
          S.protectedAreasOn = false;
          btn.textContent = "\u{1F332} Protected Areas: Off";
          btn.classList.remove("on");
          return;
        }
      }
      _buildProtectedAreasLayer();
    } else {
      btn.textContent = "\u{1F332} Protected Areas: Off";
      btn.classList.remove("on");
      if (S.protectedAreasLayer) {
        S.map.removeLayer(S.protectedAreasLayer);
        S.protectedAreasLayer = null;
      }
    }
  }
  function _buildProtectedAreasLayer() {
    if (S.protectedAreasLayer) {
      S.map.removeLayer(S.protectedAreasLayer);
      S.protectedAreasLayer = null;
    }
    if (!S.protectedAreasOn || !S.protectedAreasData) return;
    const layers = [];
    for (const area of S.protectedAreasData.areas || []) {
      if (area.lat === null || area.lng === null) continue;
      const colorMap = {
        "Ia": "#006400",
        "Ib": "#006400",
        "II": "#228B22",
        "III": "#32CD32",
        "IV": "#90EE90",
        "V": "#98FB98",
        "VI": "#00CED1"
      };
      const color = colorMap[area.iucn] || "#228B22";
      const size = area.area_km2 > 1e4 ? 10 : area.area_km2 > 1e3 ? 7 : 5;
      const marker = L.circleMarker([area.lat, area.lng], {
        pane: "overlayLayersPane",
        radius: size,
        fillColor: color,
        color: "#000",
        weight: 1,
        fillOpacity: 0.7
      });
      const areaStr = area.area_km2 >= 1e3 ? `${(area.area_km2 / 1e3).toFixed(1)}k km\xB2` : `${area.area_km2} km\xB2`;
      marker.bindTooltip(
        `<b style="color:${color}">\u{1F332} ${escHtml(area.name)}</b><br><span style="color:var(--text-secondary)">${escHtml(area.country)}</span><br><span style="color:var(--text-muted)">${escHtml(area.type)} \xB7 ${areaStr}</span><br><span style="color:var(--text-muted)">Est. ${area.established}</span>`,
        { direction: "top", className: "admin1-tooltip" }
      );
      layers.push(marker);
    }
    S.protectedAreasLayer = L.layerGroup(layers).addTo(S.map);
    console.log(`[protected-areas] Displayed ${layers.length} areas`);
  }
  async function toggleVesselPortsLayer() {
    S.vesselPortsOn = !S.vesselPortsOn;
    const btn = document.getElementById("vessel-ports-toggle-btn");
    if (S.vesselPortsOn) {
      btn.textContent = "Ports";
      btn.classList.add("on");
      if (!S.vesselPortsData) {
        try {
          const res = await _kdbOrFetch("/vessel-ports.json");
          S.vesselPortsData = await res.json();
        } catch (e) {
          console.warn("[vessel-ports] Failed to load");
          S.vesselPortsOn = false;
          btn.textContent = "Ports";
          btn.classList.remove("on");
          return;
        }
      }
      _buildVesselPortsLayer();
    } else {
      btn.textContent = "Ports";
      btn.classList.remove("on");
      if (S.vesselPortsLayer) {
        S.map.removeLayer(S.vesselPortsLayer);
        S.vesselPortsLayer = null;
      }
    }
  }
  function _buildVesselPortsLayer() {
    if (S.vesselPortsLayer) {
      S.map.removeLayer(S.vesselPortsLayer);
      S.vesselPortsLayer = null;
    }
    if (!S.vesselPortsOn || !S.vesselPortsData) return;
    const layers = [];
    for (const port of S.vesselPortsData.ports || []) {
      if (port.lat === null || port.lng === null) continue;
      const colorMap = { "Large": "#ff4444", "Medium": "#ffaa00", "Small": "#888888" };
      const color = colorMap[port.harbor_size] || "#888888";
      const size = port.harbor_size === "Large" ? 10 : port.harbor_size === "Medium" ? 7 : 5;
      const marker = L.circleMarker([port.lat, port.lng], {
        pane: "overlayLayersPane",
        radius: size,
        fillColor: color,
        color: "#000",
        weight: 1,
        fillOpacity: 0.8
      });
      marker.bindTooltip(
        `<b style="color:${color}">\u2693 ${escHtml(port.name)}</b><br><span style="color:var(--text-secondary)">${escHtml(port.city)}, ${escHtml(port.country)}</span><br><span style="color:var(--text-muted)">${escHtml(port.facilities)}</span><br><span style="color:var(--text-muted)">Size: ${port.harbor_size}</span>`,
        { direction: "top", className: "admin1-tooltip" }
      );
      layers.push(marker);
    }
    S.vesselPortsLayer = L.layerGroup(layers).addTo(S.map);
    console.log(`[vessel-ports] Displayed ${layers.length} ports`);
  }
  async function togglePeeringdbLayer() {
    S.peeringdbOn = !S.peeringdbOn;
    const btn = document.getElementById("peeringdb-toggle-btn");
    if (S.peeringdbOn) {
      btn.textContent = "Internet Exchanges";
      btn.classList.add("on");
      if (!S.peeringdbData) {
        try {
          const res = await _kdbOrFetch("/peeringdb.json");
          S.peeringdbData = await res.json();
          console.log("[peeringdb] Loaded:", S.peeringdbData.ixps.length, "IXPs,", S.peeringdbData.stats?.total_ixps_with_coords || S.peeringdbData.ixps.filter((x) => x.lat !== null).length, "with coords");
        } catch (e) {
          console.warn("[peeringdb] Failed to load:", e);
          S.peeringdbOn = false;
          btn.textContent = "Internet Exchanges";
          btn.classList.remove("on");
          return;
        }
      }
      _buildPeeringdbLayer();
    } else {
      btn.textContent = "Internet Exchanges";
      btn.classList.remove("on");
      if (S.peeringdbLayer) {
        S.map.removeLayer(S.peeringdbLayer);
        S.peeringdbLayer = null;
      }
    }
  }
  function _buildPeeringdbLayer() {
    if (S.peeringdbLayer) {
      S.map.removeLayer(S.peeringdbLayer);
      S.peeringdbLayer = null;
    }
    if (!S.peeringdbOn || !S.peeringdbData) return;
    const layers = [];
    for (const ixp of S.peeringdbData.ixps || []) {
      if (ixp.lat === null || ixp.lng === null) continue;
      const marker = L.circleMarker([ixp.lat, ixp.lng], {
        pane: "overlayLayersPane",
        radius: 6,
        fillColor: "#3b82f6",
        color: "#1d4ed8",
        weight: 2,
        fillOpacity: 0.8
      });
      marker.bindTooltip(
        `<b style="color:#3b82f6">\u{1F310} ${escHtml(ixp.name)}</b><br><span style="color:var(--text-secondary)">IXP \xB7 ${escHtml(ixp.city)}</span><br><span style="color:var(--text-muted)">${ixp.networks_count} networks</span>`,
        { direction: "top", className: "admin1-tooltip" }
      );
      layers.push(marker);
    }
    S.peeringdbLayer = L.layerGroup(layers).addTo(S.map);
    console.log(`[peeringdb] Displayed ${layers.length} IXPs`);
  }
  async function toggleWaqiLayer() {
    S.waqiOn = !S.waqiOn;
    const btn = document.getElementById("waqi-toggle-btn");
    if (S.waqiOn) {
      btn.textContent = "Air Quality";
      btn.classList.add("on");
      if (!S.waqiData) {
        try {
          const res = await _kdbOrFetch("/who-airquality.json");
          S.waqiData = await res.json();
        } catch (e) {
          console.warn("[waqi] Failed to load");
          S.waqiOn = false;
          btn.textContent = "Air Quality";
          btn.classList.remove("on");
          return;
        }
      }
      _buildWaqiLayer();
    } else {
      btn.textContent = "Air Quality";
      btn.classList.remove("on");
      if (S.waqiLayer) {
        S.map.removeLayer(S.waqiLayer);
        S.waqiLayer = null;
      }
    }
  }
  function _buildWaqiLayer() {
    if (S.waqiLayer) {
      S.map.removeLayer(S.waqiLayer);
      S.waqiLayer = null;
    }
    if (!S.waqiOn || !S.waqiData) return;
    const layers = [];
    const AQ_COLORS = [
      [50, "#22c55e"],
      [100, "#eab308"],
      [150, "#f97316"],
      [200, "#ef4444"],
      [300, "#7c3aed"],
      [500, "#7f1d1d"]
    ];
    function aqColor(pm25) {
      for (const [threshold, color] of AQ_COLORS) {
        if (pm25 <= threshold) return color;
      }
      return "#7f1d1d";
    }
    for (const [qid, aq] of Object.entries(S.waqiData)) {
      if (!aq || aq.pm25 == null) continue;
      const city = S.cityByQid && S.cityByQid.get(qid);
      if (!city || city.lat == null || city.lng == null) continue;
      const color = aqColor(aq.pm25);
      const marker = L.circleMarker([city.lat, city.lng], {
        pane: "overlayLayersPane",
        radius: aq.pm25 > 150 ? 7 : aq.pm25 > 100 ? 5 : 4,
        fillColor: color,
        color: "#000",
        weight: 0.5,
        fillOpacity: 0.85
      });
      marker.bindTooltip(
        `<b style="color:${color}">\u{1F32B}\uFE0F ${escHtml(city.name)}</b><br><span style="color:var(--text-secondary)">PM2.5: ${aq.pm25} \xB5g/m\xB3 (${aq.category || "\u2014"})</span><br><span style="color:var(--text-muted)">${escHtml(city.country || "")} \xB7 ${aq.year || "\u2014"}</span>`,
        { direction: "top", className: "admin1-tooltip", sticky: false }
      );
      layers.push(marker);
    }
    S.waqiLayer = L.layerGroup(layers).addTo(S.map);
    console.log(`[waqi] Displayed ${layers.length} stations`);
  }
  async function toggleWeatherLayer() {
    S.weatherOn = !S.weatherOn;
    const btn = document.getElementById("weather-toggle-btn");
    if (S.weatherOn) {
      btn.textContent = "Weather";
      btn.classList.add("on");
      if (!S.weatherData) {
        try {
          const res = await _kdbOrFetch("/weather-stations.json");
          S.weatherData = await res.json();
        } catch (e) {
          console.warn("[weather] Failed to load");
          S.weatherOn = false;
          btn.textContent = "Weather";
          btn.classList.remove("on");
          return;
        }
      }
      _buildWeatherLayer();
    } else {
      btn.textContent = "Weather";
      btn.classList.remove("on");
      if (S.weatherLayer) {
        S.map.removeLayer(S.weatherLayer);
        S.weatherLayer = null;
      }
    }
  }
  function _buildWeatherLayer() {
    if (S.weatherLayer) {
      S.map.removeLayer(S.weatherLayer);
      S.weatherLayer = null;
    }
    if (!S.weatherOn || !S.weatherData) return;
    const layers = [];
    const conditionIcons = {
      "Clear sky": "\u2600\uFE0F",
      "Mainly clear": "\u{1F324}\uFE0F",
      "Partly cloudy": "\u26C5",
      "Overcast": "\u2601\uFE0F",
      "Fog": "\u{1F32B}\uFE0F",
      "Light drizzle": "\u{1F326}\uFE0F",
      "Moderate drizzle": "\u{1F327}\uFE0F",
      "Dense drizzle": "\u{1F327}\uFE0F",
      "Slight rain": "\u{1F326}\uFE0F",
      "Moderate rain": "\u{1F327}\uFE0F",
      "Heavy rain": "\u26C8\uFE0F",
      "Slight snow": "\u{1F328}\uFE0F",
      "Moderate snow": "\u{1F328}\uFE0F",
      "Heavy snow": "\u2744\uFE0F",
      "Thunderstorm": "\u26A1"
    };
    for (const s of S.weatherData.stations || []) {
      if (s.lng === null || s.lat === null) continue;
      const icon = conditionIcons[s.condition] || "\u{1F321}\uFE0F";
      const temp = s.temperature !== null ? `${Math.round(s.temperature)}\xB0C` : "N/A";
      const humidity = s.humidity !== null ? `${s.humidity}%` : "N/A";
      const wind = s.wind_speed !== null ? `${Math.round(s.wind_speed)} km/h` : "N/A";
      const marker = L.circleMarker([s.lat, s.lng], {
        pane: "overlayLayersPane",
        radius: 5,
        fillColor: s.temperature > 25 ? "#ff6b6b" : s.temperature < 0 ? "#74c0fc" : "#ffd93d",
        color: "#000",
        weight: 0.5,
        fillOpacity: 0.85
      });
      marker.bindTooltip(
        `<b>${icon} ${s.name}</b><br><span style="color:var(--text-secondary)">${s.condition}</span><br><span style="color:var(--text-muted)">Temp: ${temp} \xB7 Humidity: ${humidity}</span><br><span style="color:var(--text-muted)">Wind: ${wind} \xB7 ${s.country}</span>`,
        { direction: "top", className: "admin1-tooltip", sticky: false }
      );
      layers.push(marker);
    }
    S.weatherLayer = L.layerGroup(layers).addTo(S.map);
    console.log(`[weather] Displayed ${layers.length} stations`);
  }
  async function toggleSatelliteLayer() {
    S.satelliteOn = !S.satelliteOn;
    const btn = document.getElementById("satellite-toggle-btn");
    if (S.satelliteOn) {
      btn.textContent = "Satellites";
      btn.classList.add("on");
      if (!S.satelliteData) {
        try {
          const res = await _kdbOrFetch("/satellites-live-lite.json");
          S.satelliteData = await res.json();
        } catch (e) {
          console.warn("[satellite] Failed to load");
          S.satelliteOn = false;
          btn.textContent = "Satellites";
          btn.classList.remove("on");
          return;
        }
      }
      _buildSatelliteLayer();
    } else {
      btn.textContent = "Satellites";
      btn.classList.remove("on");
      if (S.satelliteLayer) {
        S.map.removeLayer(S.satelliteLayer);
        S.satelliteLayer = null;
      }
    }
  }
  function _buildSatelliteLayer() {
    if (S.satelliteLayer) {
      S.map.removeLayer(S.satelliteLayer);
      S.satelliteLayer = null;
    }
    if (!S.satelliteOn || !S.satelliteData) return;
    const layers = [];
    const categoryColors = {
      "GPS Operational": "#3b82f6",
      "GLONASS Operational": "#ef4444",
      "Galileo": "#22c55e",
      "BeiDou": "#eab308",
      "Geostationary": "#a855f7",
      "Iridium": "#f97316",
      "Starlink": "#06b6d4",
      "ISS": "#ec4899",
      "Weather": "#6366f1",
      "Scientific": "#14b8a6",
      "Military": "#64748b"
    };
    for (const s of S.satelliteData.satellites || []) {
      if (s.lo === null || s.la === null) continue;
      const isGeo = s.a > 35e3;
      const color = categoryColors[s.c] || "#888";
      const marker = L.circleMarker([s.la, s.lo], {
        pane: "overlayLayersPane",
        radius: isGeo ? 2 : 4,
        fillColor: color,
        color: isGeo ? color : "#000",
        weight: isGeo ? 0 : 0.5,
        fillOpacity: isGeo ? 0.45 : 0.9
      });
      marker.bindTooltip(
        `<b style="color:${color}">\u{1F6F0} ${s.n}</b><br><span style="color:var(--text-secondary)">${s.c}</span><br><span style="color:var(--text-muted)">Alt: ${s.a} km \xB7 Vel: ${s.v} km/h</span><br><span style="color:var(--text-muted)">Footprint: ${s.f} km</span>`,
        { direction: "top", className: "admin1-tooltip", sticky: false }
      );
      layers.push(marker);
    }
    S.satelliteLayer = L.layerGroup(layers).addTo(S.map);
    console.log(`[satellite] Displayed ${layers.length} satellites`);
  }
  async function toggleUnescoIchLayer() {
    S.unescoIchOn = !S.unescoIchOn;
    const btn = document.getElementById("unesco-ich-toggle-btn");
    if (S.unescoIchOn) {
      btn.textContent = "\u{1F3AD} Heritage: On";
      btn.classList.add("on");
      if (!S.unescoIchData) {
        try {
          const res = await _kdbOrFetch("/unesco-ich.json");
          S.unescoIchData = await res.json();
        } catch (e) {
          console.warn("[unesco-ich] Failed to load");
          S.unescoIchOn = false;
          btn.textContent = "\u{1F3AD} Heritage: Off";
          btn.classList.remove("on");
          return;
        }
      }
      _buildUnescoIchLayer();
    } else {
      btn.textContent = "\u{1F3AD} Heritage: Off";
      btn.classList.remove("on");
      if (S.unescoIchLayer) {
        S.map.removeLayer(S.unescoIchLayer);
        S.unescoIchLayer = null;
      }
    }
  }
  function _buildUnescoIchLayer() {
    if (S.unescoIchLayer) {
      S.map.removeLayer(S.unescoIchLayer);
      S.unescoIchLayer = null;
    }
    if (!S.unescoIchOn || !S.unescoIchData) return;
    console.log("[unesco-ich] Data loaded for country panel integration");
  }
  async function toggleGtdLayer() {
    S.gtdOn = !S.gtdOn;
    const btn = document.getElementById("gtd-toggle-btn");
    if (S.gtdOn) {
      btn.textContent = "Terrorism";
      btn.classList.add("on");
      if (!S.gtdData) {
        try {
          const res = await _kdbOrFetch("/terrorism-incidents-lite.json");
          S.gtdData = await res.json();
        } catch (e) {
          console.warn("[gtd] Failed to load");
          S.gtdOn = false;
          btn.textContent = "Terrorism";
          btn.classList.remove("on");
          return;
        }
      }
      _buildGtdLayer();
    } else {
      btn.textContent = "Terrorism";
      btn.classList.remove("on");
      if (S.gtdLayer) {
        S.map.removeLayer(S.gtdLayer);
        S.gtdLayer = null;
      }
    }
  }
  function _buildGtdLayer() {
    if (S.gtdLayer) {
      S.map.removeLayer(S.gtdLayer);
      S.gtdLayer = null;
    }
    if (!S.gtdOn || !S.gtdData) return;
    const layers = [];
    const attackColors = {
      "Bombing/Explosion": "#ef4444",
      "Armed Assault": "#f97316",
      "Abduction": "#8b5cf6",
      "Facility/Infrastructure Attack": "#6366f1",
      "Hostage Taking": "#ec4899"
    };
    for (const inc of S.gtdData.incidents || []) {
      const color = attackColors[inc.attack_type] || "#888";
      const radius = Math.max(6, Math.min(14, inc.fatalities / 25));
      const marker = L.circleMarker([inc.lat, inc.lng], {
        pane: "overlayLayersPane",
        radius,
        fillColor: color,
        color: "#000",
        weight: 1,
        fillOpacity: 0.85
      });
      const date = new Date(inc.date).toLocaleDateString();
      marker.bindTooltip(
        `<b style="color:${color}">\u26A0\uFE0F ${inc.attack_type}</b><br><b>${inc.city}, ${inc.country}</b><br><span style="color:var(--text-muted)">${date}</span><br><span style="color:var(--text-secondary)">Fatalities: ${inc.fatalities} | Wounded: ${inc.wounded}</span>` + (inc.perpetrator ? `<br><span style="color:var(--text-secondary)">Perpetrator: ${inc.perpetrator}</span>` : ""),
        { direction: "top", className: "admin1-tooltip", sticky: true }
      );
      layers.push(marker);
    }
    S.gtdLayer = L.layerGroup(layers).addTo(S.map);
    console.log(`[gtd] Displayed ${layers.length} incidents`);
  }
  async function toggleCryptoLayer() {
    S.cryptoOn = !S.cryptoOn;
    const btn = document.getElementById("crypto-toggle-btn");
    if (S.cryptoOn) {
      btn.textContent = "Crypto Adoption";
      btn.classList.add("on");
      if (!S.cryptoData) {
        try {
          const res = await _kdbOrFetch("/crypto-stats-lite.json");
          S.cryptoData = await res.json();
        } catch (e) {
          console.warn("[crypto] Failed to load");
          S.cryptoOn = false;
          btn.textContent = "Crypto Adoption";
          btn.classList.remove("on");
          return;
        }
      }
      _buildCryptoLayer();
    } else {
      btn.textContent = "Crypto Adoption";
      btn.classList.remove("on");
      if (S.cryptoLayer) {
        S.map.removeLayer(S.cryptoLayer);
        S.cryptoLayer = null;
      }
    }
  }
  function _buildCryptoLayer() {
    if (S.cryptoLayer) {
      S.map.removeLayer(S.cryptoLayer);
      S.cryptoLayer = null;
    }
    if (!S.cryptoOn || !S.cryptoData) return;
    const layers = [];
    const byCountry = S.cryptoData.byCountry || {};
    const getAdoptionColor = (rank) => {
      if (rank <= 5) return "#22c55e";
      if (rank <= 10) return "#84cc16";
      if (rank <= 20) return "#eab308";
      if (rank <= 35) return "#f97316";
      return "#ef4444";
    };
    const countryCentroids2 = {
      "IN": { lat: 20.59, lng: 78.96, name: "India" },
      "NG": { lat: 9.08, lng: 8.68, name: "Nigeria" },
      "VN": { lat: 14.06, lng: 108.28, name: "Vietnam" },
      "US": { lat: 37.09, lng: -95.71, name: "United States" },
      "PK": { lat: 30.38, lng: 69.35, name: "Pakistan" },
      "ID": { lat: -0.79, lng: 113.92, name: "Indonesia" },
      "UA": { lat: 48.38, lng: 31.17, name: "Ukraine" },
      "PH": { lat: 12.88, lng: 121.77, name: "Philippines" },
      "TR": { lat: 38.96, lng: 35.24, name: "Turkey" },
      "BR": { lat: -14.24, lng: -51.93, name: "Brazil" },
      "TH": { lat: 15.87, lng: 100.99, name: "Thailand" },
      "RU": { lat: 61.52, lng: 105.32, name: "Russia" },
      "CO": { lat: 4.57, lng: -74.3, name: "Colombia" },
      "AR": { lat: -38.42, lng: -63.62, name: "Argentina" },
      "ZA": { lat: -30.56, lng: 22.94, name: "South Africa" },
      "MY": { lat: 4.21, lng: 101.98, name: "Malaysia" },
      "VE": { lat: 6.42, lng: -66.59, name: "Venezuela" },
      "GB": { lat: 55.38, lng: -3.44, name: "United Kingdom" },
      "SG": { lat: 1.35, lng: 103.82, name: "Singapore" },
      "KR": { lat: 35.91, lng: 127.77, name: "South Korea" },
      "JP": { lat: 36.2, lng: 138.25, name: "Japan" },
      "DE": { lat: 51.17, lng: 10.45, name: "Germany" },
      "FR": { lat: 46.23, lng: 2.21, name: "France" },
      "AU": { lat: -25.27, lng: 133.78, name: "Australia" },
      "CA": { lat: 56.13, lng: -106.35, name: "Canada" },
      "NL": { lat: 52.13, lng: 5.29, name: "Netherlands" },
      "CH": { lat: 46.82, lng: 8.23, name: "Switzerland" },
      "AE": { lat: 23.42, lng: 53.85, name: "UAE" },
      "HK": { lat: 22.4, lng: 114.11, name: "Hong Kong" },
      "TW": { lat: 23.69, lng: 120.96, name: "Taiwan" },
      "EG": { lat: 26.82, lng: 30.8, name: "Egypt" },
      "KE": { lat: -0.02, lng: 37.68, name: "Kenya" },
      "GH": { lat: 7.95, lng: -1.02, name: "Ghana" },
      "BD": { lat: 23.68, lng: 90.36, name: "Bangladesh" },
      "CL": { lat: -35.68, lng: -71.54, name: "Chile" },
      "PE": { lat: -9.19, lng: -75.02, name: "Peru" },
      "MX": { lat: 23.63, lng: -102.55, name: "Mexico" },
      "PL": { lat: 51.92, lng: 19.15, name: "Poland" },
      "IT": { lat: 41.87, lng: 12.57, name: "Italy" },
      "ES": { lat: 40.46, lng: -3.75, name: "Spain" },
      "SE": { lat: 60.13, lng: 18.64, name: "Sweden" },
      "NO": { lat: 60.47, lng: 8.47, name: "Norway" },
      "DK": { lat: 56.26, lng: 9.5, name: "Denmark" },
      "FI": { lat: 61.92, lng: 25.75, name: "Finland" },
      "AT": { lat: 47.52, lng: 14.55, name: "Austria" },
      "BE": { lat: 50.5, lng: 4.47, name: "Belgium" },
      "PT": { lat: 39.4, lng: -8.23, name: "Portugal" },
      "GR": { lat: 39.07, lng: 21.82, name: "Greece" },
      "CZ": { lat: 49.82, lng: 15.47, name: "Czech Republic" },
      "IL": { lat: 31.05, lng: 34.85, name: "Israel" },
      "CN": { lat: 35.86, lng: 104.19, name: "China" },
      "SA": { lat: 23.89, lng: 45.08, name: "Saudi Arabia" },
      "KZ": { lat: 48.02, lng: 66.92, name: "Kazakhstan" },
      "UZ": { lat: 41.38, lng: 64.59, name: "Uzbekistan" },
      "NZ": { lat: -40.9, lng: 174.89, name: "New Zealand" }
    };
    for (const [code, data] of Object.entries(byCountry)) {
      const centroid = countryCentroids2[code];
      if (!centroid) continue;
      const color = getAdoptionColor(data.adoption_rank);
      const radius = Math.max(5, Math.min(15, 20 - data.adoption_rank / 3));
      const marker = L.circleMarker([centroid.lat, centroid.lng], {
        pane: "overlayLayersPane",
        radius,
        fillColor: color,
        color: "#000",
        weight: 1,
        fillOpacity: 0.85
      });
      marker.bindTooltip(
        `<b style="color:${color}">\u20BF ${centroid.name}</b><br><span style="color:var(--text-secondary)">Rank: #${data.adoption_rank}</span><br><span style="color:var(--text-muted)">Users: ${data.crypto_users_pct.toFixed(1)}%</span><br><span style="color:var(--text-muted)">Est. users: ${(data.estimated_users / 1e6).toFixed(1)}M</span><br><span style="color:var(--text-secondary)">DeFi: $${(data.defi_value_usd / 1e9).toFixed(1)}B</span><br><span style="color:var(--text-muted)">Exchanges: ${data.exchanges}</span>`,
        { direction: "top", className: "admin1-tooltip", sticky: false }
      );
      layers.push(marker);
    }
    S.cryptoLayer = L.layerGroup(layers).addTo(S.map);
    console.log(`[crypto] Displayed ${layers.length} country markers`);
  }
  async function toggleSpaceWeatherLayer() {
    S.spaceWeatherOn = !S.spaceWeatherOn;
    const btn = document.getElementById("spaceweather-toggle-btn");
    if (S.spaceWeatherOn) {
      btn.textContent = "Space Weather";
      btn.classList.add("on");
      if (!S.spaceWeatherData) {
        try {
          const res = await _kdbOrFetch("/solar-weather-lite.json");
          S.spaceWeatherData = await res.json();
        } catch (e) {
          console.warn("[space-weather] Failed to load");
          S.spaceWeatherOn = false;
          btn.textContent = "Space Weather";
          btn.classList.remove("on");
          return;
        }
      }
      _buildSpaceWeatherLayer();
    } else {
      btn.textContent = "Space Weather";
      btn.classList.remove("on");
      if (S.spaceWeatherLayer) {
        S.map.removeLayer(S.spaceWeatherLayer);
        S.spaceWeatherLayer = null;
      }
    }
  }
  function _buildSpaceWeatherLayer() {
    if (S.spaceWeatherLayer) {
      S.map.removeLayer(S.spaceWeatherLayer);
      S.spaceWeatherLayer = null;
    }
    if (!S.spaceWeatherOn || !S.spaceWeatherData) return;
    const kp = S.spaceWeatherData.kp_index || 0;
    const auroraLat = S.spaceWeatherData.aurora_visible_below_lat || 66;
    const outerLat = Math.min(auroraLat + 5, 89);
    function makeAuroraBand(innerLat, outerLatAbs, isNorth) {
      const pts = [];
      const sign = isNorth ? 1 : -1;
      for (let lng = -180; lng <= 180; lng += 4) pts.push([sign * outerLatAbs, lng]);
      for (let lng = 180; lng >= -180; lng -= 4) pts.push([sign * innerLat, lng]);
      return L.polygon(pts, { fillColor: "#8b5cf6", color: "#a78bfa", weight: 2, fillOpacity: 0.25, dashArray: "8, 8" });
    }
    const northBand = makeAuroraBand(auroraLat, outerLat, true);
    northBand.bindTooltip(
      `<b>\u{1F30C} Aurora Zone (North)</b><br><span style="color:var(--text-secondary)">KP Index: ${kp}</span><br><span style="color:var(--text-muted)">Visible below ${auroraLat}\xB0N</span>`,
      { direction: "top", className: "admin1-tooltip", sticky: false }
    );
    const southBand = makeAuroraBand(auroraLat, outerLat, false);
    southBand.bindTooltip(
      `<b>\u{1F30C} Aurora Zone (South)</b><br><span style="color:var(--text-muted)">Visible above ${-auroraLat}\xB0S</span>`,
      { direction: "top", className: "admin1-tooltip", sticky: false }
    );
    S.spaceWeatherLayer = L.layerGroup([northBand, southBand]).addTo(S.map);
    console.log(`[space-weather] Aurora zone displayed (KP: ${kp})`);
  }
  async function toggleOceanLayer() {
    S.oceanOn = !S.oceanOn;
    const btn = document.getElementById("ocean-toggle-btn");
    if (S.oceanOn) {
      btn.textContent = "Ocean Currents";
      btn.classList.add("on");
      if (!S.oceanData) {
        try {
          const res = await _kdbOrFetch("/ocean-currents-lite.json");
          S.oceanData = await res.json();
        } catch (e) {
          console.warn("[ocean] Failed to load");
          S.oceanOn = false;
          btn.textContent = "Ocean Currents";
          btn.classList.remove("on");
          return;
        }
      }
      _buildOceanLayer();
    } else {
      btn.textContent = "Ocean Currents";
      btn.classList.remove("on");
      if (S.oceanLayer) {
        if (S.oceanLayer._legend) {
          S.map.removeControl(S.oceanLayer._legend);
          S.oceanLayer._legend = null;
        }
        S.map.removeLayer(S.oceanLayer);
        S.oceanLayer = null;
      }
    }
  }
  function _buildOceanLayer() {
    if (S.oceanLayer) {
      S.map.removeLayer(S.oceanLayer);
      S.oceanLayer = null;
    }
    if (!S.oceanOn || !S.oceanData) return;
    const layers = [];
    const getSpeedColor = (speed) => {
      if (speed >= 150) return "#ef4444";
      if (speed >= 100) return "#f97316";
      if (speed >= 70) return "#eab308";
      if (speed >= 40) return "#22c55e";
      return "#3b82f6";
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
      const dirRad = c.dir * Math.PI / 180;
      const arrowLen = getArrowLength(c.spd);
      const weight = getArrowWeight(c.spd);
      const color = getSpeedColor(c.spd);
      const startLat = c.lat - Math.cos(dirRad) * arrowLen;
      const startLng = c.lng - Math.sin(dirRad) * arrowLen;
      const endLat = c.lat + Math.cos(dirRad) * arrowLen;
      const endLng = c.lng + Math.sin(dirRad) * arrowLen;
      const arrow = L.polyline([[startLat, startLng], [endLat, endLng]], {
        pane: "overlayLayersPane",
        color,
        weight,
        opacity: 0.85,
        lineCap: "round"
      });
      const arrowhead = L.marker([endLat, endLng], {
        pane: "overlayLayersPane",
        icon: L.divIcon({
          className: "ocean-arrowhead",
          html: `<svg width="20" height="20" viewBox="0 0 20 20" style="transform: rotate(${c.dir - 90}deg); filter: drop-shadow(0 0 2px #000);">
          <polygon points="10,0 20,20 10,15 0,20" fill="${color}" stroke="#000" stroke-width="0.5"/>
        </svg>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        })
      });
      if (c.spd >= 100) {
        const glow = L.circleMarker([c.lat, c.lng], {
          pane: "overlayLayersPane",
          radius: 8,
          fillColor: color,
          color: "transparent",
          fillOpacity: 0.15,
          weight: 0
        });
        layers.push(glow);
      }
      const dirLabels = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
      const dirIndex = Math.round(c.dir / 45) % 8;
      const dirLabel = dirLabels[dirIndex];
      arrow.bindTooltip(
        `<b style="color:${color}">\u{1F30A} ${c.name || c.region || "Ocean Current"}</b><br><span style="color:var(--text-secondary)">Speed: <b>${c.spd} cm/s</b> (${(c.spd / 50).toFixed(1)} km/h)</span><br><span style="color:var(--text-muted)">Direction: ${c.dir}\xB0 (${dirLabel})</span><br><span style="color:var(--text-muted)">Region: ${c.region || "Unknown"}</span>` + (c.spd >= 150 ? `<br><span style="color:#ef4444">\u26A1 Very fast current</span>` : "") + (c.spd >= 100 && c.spd < 150 ? `<br><span style="color:#f97316">\u26A1 Fast current</span>` : ""),
        { direction: "top", className: "admin1-tooltip", sticky: false }
      );
      layers.push(arrow, arrowhead);
    }
    const legend = L.control({ position: "bottomright" });
    legend.onAdd = () => {
      const div = L.DomUtil.create("div", "ocean-legend");
      div.style.cssText = "background:var(--panel-bg); padding:10px; border-radius:8px; border:1px solid var(--border); font-size:11px;";
      div.innerHTML = `
      <div style="font-weight:600; margin-bottom:6px; color:var(--text);">\u{1F30A} Current Speed</div>
      <div style="display:flex; align-items:center; gap:6px; margin:3px 0;">
        <span style="display:inline-block; width:20px; height:4px; background:#ef4444; border-radius:2px;"></span>
        <span style="color:var(--text-secondary);">\u2265150 cm/s (Very Fast)</span>
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
    console.log(`[ocean] Displayed ${layers.length} elements (${S.oceanData.currents?.length || 0} currents)`);
  }
  async function toggleFlightAwareLayer() {
    S.flightAwareOn = !S.flightAwareOn;
    const btn = document.getElementById("flightaware-toggle-btn");
    if (S.flightAwareOn) {
      btn.textContent = "\u2708\uFE0F FlightAware: On";
      btn.classList.add("on");
      if (!S.flightAwareData) {
        try {
          const res = await _kdbOrFetch("/flightaware-flights-lite.json");
          S.flightAwareData = await res.json();
        } catch (e) {
          console.warn("[flightaware] Failed to load");
          S.flightAwareOn = false;
          btn.textContent = "\u2708\uFE0F FlightAware: Off";
          btn.classList.remove("on");
          return;
        }
      }
      _buildFlightAwareLayer();
    } else {
      btn.textContent = "\u2708\uFE0F FlightAware: Off";
      btn.classList.remove("on");
      if (S.flightAwareLayer) {
        S.map.removeLayer(S.flightAwareLayer);
        S.flightAwareLayer = null;
      }
    }
  }
  function _buildFlightAwareLayer() {
    if (S.flightAwareLayer) {
      S.map.removeLayer(S.flightAwareLayer);
      S.flightAwareLayer = null;
    }
    if (!S.flightAwareOn || !S.flightAwareData) return;
    const layers = [];
    for (const f of S.flightAwareData.flights || []) {
      const headingRad = f.hdg * Math.PI / 180;
      const startLat = f.lat - Math.cos(headingRad) * 0.5;
      const startLng = f.lng - Math.sin(headingRad) * 0.5;
      const endLat = f.lat + Math.cos(headingRad) * 0.5;
      const endLng = f.lng + Math.sin(headingRad) * 0.5;
      const aircraftType = f.ac || "Unknown";
      const altitudeClass = f.alt > 35e3 ? "long-haul" : f.alt > 2e4 ? "medium" : "short";
      const color = altitudeClass === "long-haul" ? "#3b82f6" : altitudeClass === "medium" ? "#22c55e" : "#f59e0b";
      const arrow = L.polyline([[startLat, startLng], [endLat, endLng]], {
        color,
        weight: 2,
        opacity: 0.8
      });
      const airline = f.cs?.match(/[A-Z]+/)?.[0] || f.cs || "Unknown";
      arrow.bindTooltip(
        `<b style="color:${color}">\u2708\uFE0F ${f.cs || "Flight"}</b><br><span style="color:var(--text-secondary)">${airline} ${aircraftType}</span><br><span style="color:var(--text-muted)">${f.org} \u2192 ${f.dst}</span><br><span style="color:var(--text-muted)">Alt: ${f.alt.toLocaleString()} ft | Spd: ${f.spd} kts</span>`,
        { direction: "top", className: "admin1-tooltip", sticky: false }
      );
      layers.push(arrow);
    }
    S.flightAwareLayer = L.layerGroup(layers).addTo(S.map);
    console.log(`[flightaware] Displayed ${layers.length} flights`);
  }
  async function toggleMarineTrafficLayer() {
    S.marineTrafficOn = !S.marineTrafficOn;
    const btn = document.getElementById("marinetraffic-toggle-btn");
    if (S.marineTrafficOn) {
      btn.textContent = "Ships";
      btn.classList.add("on");
      if (!S.marineTrafficData) {
        try {
          const res = await _kdbOrFetch("/ships-live-lite.json");
          S.marineTrafficData = await res.json();
        } catch (e) {
          console.warn("[marinetraffic] Failed to load");
          S.marineTrafficOn = false;
          btn.textContent = "Ships";
          btn.classList.remove("on");
          return;
        }
      }
      _buildMarineTrafficLayer();
    } else {
      btn.textContent = "Ships";
      btn.classList.remove("on");
      if (S.marineTrafficLayer) {
        S.map.removeLayer(S.marineTrafficLayer);
        S.marineTrafficLayer = null;
      }
    }
  }
  function _buildMarineTrafficLayer() {
    if (S.marineTrafficLayer) {
      S.map.removeLayer(S.marineTrafficLayer);
      S.marineTrafficLayer = null;
    }
    if (!S.marineTrafficOn || !S.marineTrafficData) return;
    const layers = [];
    const typeColors = {
      "Container": "#3b82f6",
      "Bulk Carrier": "#64748b",
      "Tanker": "#ef4444",
      "Cargo": "#22c55e",
      "Passenger": "#f59e0b",
      "Cruise Ship": "#ec4899",
      "Fishing": "#14b8a6",
      "Naval": "#6366f1",
      "Supply": "#a855f7",
      "Research": "#8b5cf6"
    };
    for (const v of S.marineTrafficData.vessels || []) {
      const color = typeColors[v.tp] || "#888";
      const marker = L.circleMarker([v.lat, v.lng], {
        pane: "overlayLayersPane",
        radius: v.tp === "Cruise Ship" || v.tp === "Container" ? 6 : 4,
        fillColor: color,
        color: "#000",
        weight: 0.5,
        fillOpacity: 0.9
      });
      const courseArrow = L.polyline([
        [v.lat, v.lng],
        [v.lat + Math.cos(v.crs * Math.PI / 180) * 0.2, v.lng + Math.sin(v.crs * Math.PI / 180) * 0.2]
      ], {
        pane: "overlayLayersPane",
        color,
        weight: 2,
        opacity: 0.6
      });
      marker.bindTooltip(
        `<b style="color:${color}">\u{1F6A2} ${v.nm}</b><br><span style="color:var(--text-secondary)">${v.tp}</span><br><span style="color:var(--text-muted)">Flag: ${v.flag || "Unknown"}</span><br><span style="color:var(--text-muted)">Spd: ${v.spd} kn | Crs: ${v.crs}\xB0</span><br><span style="color:var(--text-secondary)">\u2192 ${v.dst}</span>`,
        { direction: "top", className: "admin1-tooltip", sticky: false }
      );
      layers.push(marker, courseArrow);
    }
    S.marineTrafficLayer = L.layerGroup(layers).addTo(S.map);
    console.log(`[marinetraffic] Displayed ${layers.length / 2} vessels`);
  }
  function resetAllLayers() {
    setCityDotMode("hide");
    const toggles = [
      ["choroOn", toggleChoropleth],
      ["admin1On", toggleAdmin1Global],
      ["unescoOn", toggleUnescoLayer],
      ["econOn", toggleEconLayer],
      ["cableOn", toggleCableLayer],
      ["airRouteOn", toggleAirRouteLayer],
      ["tectonicOn", toggleTectonicLayer],
      ["earthquakeOn", toggleEarthquakeLayer],
      ["volcanoOn", toggleVolcanoLayer],
      ["wildfireOn", toggleWildfireLayer],
      ["launchSiteOn", toggleLaunchSiteLayer],
      ["eezOn", toggleEezLayer],
      ["issOn", toggleIssTracker],
      ["aircraftOn", toggleAircraftLayer],
      ["eonetOn", toggleEonetLayer],
      ["protectedAreasOn", toggleProtectedAreasLayer],
      ["vesselPortsOn", toggleVesselPortsLayer],
      ["peeringdbOn", togglePeeringdbLayer],
      ["waqiOn", toggleWaqiLayer],
      ["weatherOn", toggleWeatherLayer],
      ["satelliteOn", toggleSatelliteLayer],
      ["unescoIchOn", toggleUnescoIchLayer],
      ["gtdOn", toggleGtdLayer],
      ["cryptoOn", toggleCryptoLayer],
      ["spaceWeatherOn", toggleSpaceWeatherLayer],
      ["oceanOn", toggleOceanLayer],
      ["flightAwareOn", toggleFlightAwareLayer],
      ["marineTrafficOn", toggleMarineTrafficLayer]
    ];
    for (const [key, fn] of toggles) {
      if (S[key]) fn();
    }
    _updateMapLegends();
  }
  function closeAllMobileSheets() {
    const backdrop = document.getElementById("mobile-backdrop");
    if (backdrop) backdrop.classList.remove("active");
    const topbar = document.getElementById("topbar");
    if (topbar) topbar.classList.remove("mobile-open");
    const mbtn = document.getElementById("mobile-topbar-toggle");
    if (mbtn) mbtn.textContent = "\u2630";
    closeWikiSidebar();
    closeFilterPanel();
    closeCorpPanel();
    closeStatsPanel();
    closeTradePanelFn();
    closeCountryPanel();
    closeRegionPanel();
    closeGlobalCorpPanel();
    const listPanel = document.getElementById("list-panel");
    if (listPanel) {
      listPanel.classList.remove("panel-open");
    }
    document.querySelectorAll(".list-tab").forEach((b) => b.classList.remove("active"));
  }
  function toggleMobileTopbar() {
    const topbar = document.getElementById("topbar");
    const mbtn = document.getElementById("mobile-topbar-toggle");
    const backdrop = document.getElementById("mobile-backdrop");
    const opening = !topbar.classList.contains("mobile-open");
    topbar.classList.toggle("mobile-open", opening);
    if (mbtn) mbtn.classList.toggle("open", opening);
    if (backdrop) {
      if (opening) backdrop.classList.add("active");
      else backdrop.classList.remove("active");
    }
    if (!opening) {
      const layersMenu = document.getElementById("more-layers-menu");
      if (layersMenu) layersMenu.style.display = "none";
    }
  }
  function _mobileBackdropOn() {
    if (window.innerWidth <= 768) {
      const b = document.getElementById("mobile-backdrop");
      if (b) b.classList.add("active");
    }
  }
  function _mobileBackdropOff() {
    const b = document.getElementById("mobile-backdrop");
    if (b) b.classList.remove("active");
  }
  async function toggleEconLayer() {
    S.econOn = !S.econOn;
    const btn = document.getElementById("econ-toggle-btn");
    if (S.econOn) {
      btn.textContent = "Economy";
      btn.classList.add("on");
      _drawEconColorRamp();
      await _companiesLoader.ensure();
      buildEconLayer();
      _updateMapLegends();
    } else {
      btn.textContent = "Economy";
      btn.classList.remove("on");
      if (S.econLayer) {
        S.map.removeLayer(S.econLayer);
        S.econLayer = null;
      }
      collapseEconCluster();
      _econTipHide();
      _updateMapLegends();
    }
  }
  function _clearExpandedLayers() {
    if (S._collapseOnClick) {
      S.map.off("click", S._collapseOnClick);
      S._collapseOnClick = null;
    }
    if (S._expandedLayers) {
      S._expandedLayers.forEach((l) => {
        try {
          S.map.removeLayer(l);
        } catch (_) {
        }
      });
      S._expandedLayers = null;
    }
  }
  function collapseEconCluster() {
    _clearExpandedLayers();
    S._pinnedExpansion = null;
  }
  function _convexHull(pts) {
    const n = pts.length;
    if (n < 3) return [...pts];
    const d2 = (a, b) => (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
    let l = 0;
    for (let i = 1; i < n; i++) if (pts[i][1] < pts[l][1]) l = i;
    const hull = [];
    let p = l, q;
    do {
      hull.push(pts[p]);
      q = 0;
      for (let i = 1; i < n; i++) {
        if (q === p) {
          q = i;
          continue;
        }
        const cross = (pts[q][1] - pts[p][1]) * (pts[i][0] - pts[p][0]) - (pts[q][0] - pts[p][0]) * (pts[i][1] - pts[p][1]);
        if (cross < 0 || cross === 0 && d2(pts[p], pts[i]) > d2(pts[p], pts[q])) q = i;
      }
      p = q;
    } while (p !== l && hull.length <= n);
    return hull;
  }
  function _arcLine(p1, p2, curve = 0.22) {
    const mid = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
    const dl = p2[0] - p1[0], dn = p2[1] - p1[1];
    const ctrl = [mid[0] - dn * curve, mid[1] + dl * curve];
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24, u = 1 - t;
      pts.push([
        u * u * p1[0] + 2 * u * t * ctrl[0] + t * t * p2[0],
        u * u * p1[1] + 2 * u * t * ctrl[1] + t * t * p2[1]
      ]);
    }
    return pts;
  }
  function expandEconCluster(group, clusterUSD, cLat, cLng) {
    _clearExpandedLayers();
    S._pinnedExpansion = { group, clusterUSD, cLat, cLng };
    const layers = [];
    const col = econDotColor(clusterUSD);
    const MAX_USD = 2e12;
    const positions = group.map((p) => [p.city.lat, p.city.lng]);
    if (positions.length >= 3) {
      const hull = _convexHull(positions);
      const padded = hull.map(([lat, lng]) => {
        const dlat = lat - cLat, dlng = lng - cLng;
        const len = Math.sqrt(dlat * dlat + dlng * dlng) || 1e-3;
        const pad = Math.max(1.8, len * 0.22);
        return [lat + dlat / len * pad, lng + dlng / len * pad];
      });
      layers.push(L.polygon(padded, {
        fillColor: col,
        fillOpacity: 0.07,
        color: col,
        weight: 1.5,
        opacity: 0.35,
        dashArray: "7 5",
        pane: "econPane",
        interactive: false
      }).addTo(S.map));
    } else if (positions.length === 2) {
      layers.push(L.polyline(positions, {
        color: col,
        weight: 2,
        opacity: 0.3,
        dashArray: "7 5",
        pane: "econPane",
        interactive: false
      }).addTo(S.map));
    }
    for (const p of group) {
      layers.push(L.polyline(
        _arcLine([cLat, cLng], [p.city.lat, p.city.lng]),
        { color: col, weight: 1, opacity: 0.2, pane: "econPane", interactive: false }
      ).addTo(S.map));
    }
    for (const p of group) {
      const cityCol = econDotColor(p.totalUSD);
      const logVal = Math.log10(Math.max(p.totalUSD, 1e8));
      const r = Math.max(6, Math.min(22, 5 + 17 * (logVal - 8) / (13 - 8)));
      const topCos = (p.validCos || []).slice().sort((a, b) => b.usd - a.usd).slice(0, 3);
      const tipHtml = `<div style="font-weight:600;color:${cityCol};margin-bottom:2px">${escHtml(p.city.name)}</div><div style="color:var(--text-secondary);font-size:0.78rem;margin-bottom:4px">\u2248 <span style="color:${cityCol};font-weight:600">$${fmtRevenue(p.totalUSD)}</span> USD</div>` + topCos.map(
        ({ co, usd }) => `<div style="color:var(--text-body);font-size:0.79rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(co.name)} <span style="color:${cityCol}">$${fmtRevenue(usd)}</span></div>`
      ).join("");
      const dot = L.circleMarker([p.city.lat, p.city.lng], {
        radius: r,
        color: cityCol,
        fillColor: cityCol,
        fillOpacity: 0.22,
        weight: 2,
        opacity: 0.9,
        pane: "econPane",
        bubblingMouseEvents: false
      });
      dot.on("mouseover", (e) => _econTipShow(tipHtml, e.originalEvent.clientX, e.originalEvent.clientY));
      dot.on("mousemove", (e) => _econTipMove(e.originalEvent.clientX, e.originalEvent.clientY));
      dot.on("mouseout", () => _econTipHide());
      dot.on("click", () => {
        _econTipHide();
        collapseEconCluster();
        openCorpPanel(p.qid, p.city.name);
      });
      dot.addTo(S.map);
      layers.push(dot);
    }
    S._expandedLayers = layers;
    setTimeout(() => {
      S._collapseOnClick = collapseEconCluster;
      S.map.on("click", S._collapseOnClick);
    }, 120);
  }
  function _econTipDOM() {
    if (!S._econTipEl) {
      S._econTipEl = document.createElement("div");
      S._econTipEl.id = "econ-custom-tip";
      document.body.appendChild(S._econTipEl);
    }
    return S._econTipEl;
  }
  function _econTipShow(html, clientX, clientY) {
    const el = _econTipDOM();
    el.innerHTML = html;
    el.style.display = "block";
    _econTipMove(clientX, clientY);
  }
  function _econTipMove(clientX, clientY) {
    const el = S._econTipEl;
    if (!el || el.style.display === "none") return;
    const tw = el.offsetWidth, th = el.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    const pad = 12;
    let x = clientX + pad;
    let y = clientY - th - pad;
    if (x + tw > vw - 8) x = clientX - tw - pad;
    if (y < 8) y = clientY + pad;
    el.style.left = x + "px";
    el.style.top = y + "px";
  }
  function _econTipHide() {
    if (S._econTipEl) S._econTipEl.style.display = "none";
  }
  function econDotColor(totalUSD) {
    const logMin = Math.log10(5e8);
    const logMax = Math.log10(5e12);
    const t = Math.max(0, Math.min(1, (Math.log10(Math.max(totalUSD, 5e8)) - logMin) / (logMax - logMin)));
    const hue = Math.round(45 + t * 143);
    const sat = Math.round(85 + t * 15);
    const lit = Math.round(62 - t * 10);
    return `hsl(${hue},${sat}%,${lit}%)`;
  }
  function buildEconLayer() {
    if (!S.econOn) return;
    const _savedPin = S._pinnedExpansion;
    _clearExpandedLayers();
    S._pinnedExpansion = null;
    if (S.econLayer) {
      S.map.removeLayer(S.econLayer);
      S.econLayer = null;
    }
    if (!Object.keys(S.companiesData).length) return;
    const MAX_PLAUSIBLE_USD = 2e12;
    const metric = "market_cap";
    const cityPoints = [];
    for (const [qid, companies] of Object.entries(S.companiesData)) {
      const city = S.cityByQid.get(qid);
      if (!city || city.lat == null || city.lng == null) continue;
      let totalUSD = 0;
      const validCos = [];
      for (const co of companies) {
        const countryDefaultCur = ISO2_TO_CURRENCY[city.iso] || null;
        const hasPrimary = !!(co[metric] && (co[metric + "_currency"] || countryDefaultCur));
        const val = hasPrimary ? co[metric] : co.revenue || co.market_cap;
        const rawCur = hasPrimary ? co[metric + "_currency"] : co.revenue_currency || co.market_cap_currency;
        const cur = rawCur || countryDefaultCur;
        if (!val || !cur) continue;
        const usd = toUSD(val, cur);
        if (usd > 0 && usd <= MAX_PLAUSIBLE_USD) {
          totalUSD += usd;
          const usedMetric = hasPrimary ? metric : co.revenue ? "revenue" : "market_cap";
          validCos.push({ co, usd, usedMetric });
        }
      }
      if (totalUSD <= 0) continue;
      cityPoints.push({ qid, city, totalUSD, validCos });
    }
    let clusters = cityPoints.map((p) => [p]);
    function _clusterMeta(group) {
      const totalUSD = group.reduce((s, p) => s + p.totalUSD, 0);
      const lat = group.reduce((s, p) => s + p.city.lat * p.totalUSD, 0) / totalUSD;
      const lng = group.reduce((s, p) => s + p.city.lng * p.totalUSD, 0) / totalUSD;
      const logVal = Math.log10(Math.max(totalUSD, 1e8));
      const r = Math.max(6, Math.min(32, 4 + 28 * (logVal - 8) / (13 - 8)));
      const px = S.map.latLngToContainerPoint([lat, lng]);
      return { lat, lng, r, px, totalUSD };
    }
    const OVERLAP_PAD = 4;
    let changed = true;
    while (changed) {
      changed = false;
      const meta = clusters.map(_clusterMeta);
      outer: for (let i = 0; i < clusters.length; i++) {
        for (let j = i + 1; j < clusters.length; j++) {
          const a = meta[i], b = meta[j];
          const dx = a.px.x - b.px.x, dy = a.px.y - b.px.y;
          if (Math.sqrt(dx * dx + dy * dy) < a.r + b.r + OVERLAP_PAD) {
            clusters[i] = clusters[i].concat(clusters[j]);
            clusters.splice(j, 1);
            changed = true;
            break outer;
          }
        }
      }
    }
    const markers = [];
    for (const group of clusters) {
      const clusterUSD = group.reduce((s, p) => s + p.totalUSD, 0);
      const lat = group.reduce((s, p) => s + p.city.lat * p.totalUSD, 0) / clusterUSD;
      const lng = group.reduce((s, p) => s + p.city.lng * p.totalUSD, 0) / clusterUSD;
      const logVal = Math.log10(Math.max(clusterUSD, 1e8));
      const radius = Math.max(4, Math.min(32, 4 + 28 * (logVal - 8) / (13 - 8)));
      const isMerged = group.length > 1;
      const headerLabel = isMerged ? `${group.length} cities` : escHtml(group[0].city.name);
      const subLabel = isMerged ? group.slice(0, 3).map((p) => escHtml(p.city.name)).join(", ") + (group.length > 3 ? ` +${group.length - 3} more` : "") : null;
      const allCos = group.flatMap((p) => p.validCos);
      const topCos = allCos.sort((a, b) => b.usd - a.usd).slice(0, 4);
      const metricLabel2 = metric === "market_cap" ? "Market cap" : "Revenue";
      const topHtml = topCos.map(({ co, usd, usedMetric }) => {
        const tag = metric === "market_cap" && usedMetric !== "market_cap" ? `<span style="color:var(--text-muted);font-size:0.68rem"> rev</span>` : "";
        return `<div style="color:var(--text-body);font-size:0.79rem;padding:1px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(co.name)}${tag} <span style="color:var(--gold)">$${fmtRevenue(usd)}</span></div>`;
      }).join("");
      const totalCorps = group.reduce((s, p) => s + p.validCos.length, 0);
      const tip = `<div style="font-weight:600;color:var(--gold);margin-bottom:2px">${headerLabel}</div>` + (subLabel ? `<div style="color:var(--text-secondary);font-size:0.75rem;margin-bottom:3px">${subLabel}</div>` : "") + `<div style="color:var(--text-secondary);font-size:0.78rem;margin-bottom:5px">${metricLabel2} \u2248 <span style="color:var(--gold);font-weight:600">$${fmtRevenue(clusterUSD)}</span> USD</div><div style="color:var(--text-faint);font-size:0.74rem;margin-bottom:4px">${totalCorps} listed corp${totalCorps !== 1 ? "s" : ""}</div>` + topHtml;
      const dotColor = econDotColor(clusterUSD);
      const m = L.circleMarker([lat, lng], {
        radius: Math.max(radius, 6),
        color: dotColor,
        fillColor: dotColor,
        fillOpacity: isMerged ? 0.28 : 0.18,
        weight: isMerged ? 2 : 1.5,
        opacity: 0.9,
        pane: "econPane",
        bubblingMouseEvents: false
        // prevent click from bubbling to S.map collapse handler
      });
      m.on("mouseover", (e) => _econTipShow(tip, e.originalEvent.clientX, e.originalEvent.clientY));
      m.on("mousemove", (e) => _econTipMove(e.originalEvent.clientX, e.originalEvent.clientY));
      m.on("mouseout", () => _econTipHide());
      if (!isMerged) {
        m.on("click", () => {
          _econTipHide();
          openCorpPanel(group[0].qid, group[0].city.name);
        });
      } else {
        const clusterTitle = `${group.length} cities`;
        m.on("click", () => {
          _econTipHide();
          expandEconCluster(group, clusterUSD, lat, lng);
          openCorpPanelCluster(group, clusterTitle);
        });
      }
      markers.push(m);
    }
    S.econLayer = L.layerGroup(markers).addTo(S.map);
    const metricLabel = metric === "market_cap" ? "Market cap" : "Revenue";
    const primaryCount = cityPoints.flatMap((p) => p.validCos).filter((c) => c.usedMetric === metric).length;
    const fallbackNote = metric === "market_cap" && primaryCount < cityPoints.flatMap((p) => p.validCos).length ? ` \xB7 ${primaryCount} mkt cap, rest revenue` : "";
    document.getElementById("econ-info").textContent = `${cityPoints.length} cities${clusters.length < cityPoints.length ? ` \u2192 ${clusters.length} clusters` : ""} \xB7 ${metricLabel}${fallbackNote} \xB7 click to explore`;
    if (_savedPin) {
      expandEconCluster(_savedPin.group, _savedPin.clusterUSD, _savedPin.cLat, _savedPin.cLng);
    }
  }
  async function openCorpPanel(qid, cityName) {
    S.corpCityQid = qid;
    S.corpCityName = cityName;
    S.corpOverrideList = null;
    document.getElementById("corp-panel-title").textContent = cityName + " \xB7 Corporations";
    document.getElementById("corp-search").value = "";
    document.getElementById("corp-sort").value = "revenue";
    document.getElementById("corp-panel").classList.add("open");
    document.getElementById("wiki-sidebar").classList.add("corp-open");
    _mobileBackdropOn();
    await _companiesLoader.ensure();
    renderCorpList();
  }
  async function openCorpPanelCluster(cityPoints, title) {
    const dominant = cityPoints.reduce((best, p) => p.totalUSD > best.totalUSD ? p : best, cityPoints[0]);
    S.corpCityQid = dominant.qid;
    S.corpCityName = title;
    document.getElementById("corp-panel-title").textContent = title + " \xB7 Corporations";
    document.getElementById("corp-search").value = "";
    document.getElementById("corp-sort").value = "revenue";
    document.getElementById("corp-panel").classList.add("open");
    document.getElementById("wiki-sidebar").classList.add("corp-open");
    _mobileBackdropOn();
    await _companiesLoader.ensure();
    S.corpOverrideList = cityPoints.flatMap((p) => S.companiesData[p.qid] || []);
    renderCorpList();
  }
  function closeCorpPanel() {
    S.corpOverrideList = null;
    document.getElementById("corp-panel").classList.remove("open");
    document.getElementById("wiki-sidebar").classList.remove("corp-open");
    _mobileBackdropOff();
  }
  function _onDrawContainerClick(e) {
    if (!S._drawActive) return;
    e.stopPropagation();
    if (S._drawClickTimer) {
      clearTimeout(S._drawClickTimer);
      S._drawClickTimer = null;
    }
    const latlng = S.map.containerPointToLatLng(S.map.mouseEventToContainerPoint(e));
    S._drawClickTimer = setTimeout(() => {
      S._drawClickTimer = null;
      _drawAddVertex(latlng);
    }, 220);
  }
  function _onDrawContainerDblClick(e) {
    if (!S._drawActive) return;
    e.stopPropagation();
    e.preventDefault();
    if (S._drawClickTimer) {
      clearTimeout(S._drawClickTimer);
      S._drawClickTimer = null;
    }
    _drawFinish();
  }
  function toggleDrawMode() {
    if (S._drawPolygon) {
      _drawClear();
      return;
    }
    if (S._drawActive) {
      _drawFinish();
      return;
    }
    S._drawActive = true;
    S._drawVertices = [];
    S.map.dragging.disable();
    S.map.doubleClickZoom.disable();
    S.map.getContainer().addEventListener("click", _onDrawContainerClick, true);
    S.map.getContainer().addEventListener("dblclick", _onDrawContainerDblClick, true);
    const btn = document.getElementById("draw-fab");
    if (btn) {
      btn.innerHTML = '\u2713<span class="fab-label">Done</span>';
      btn.title = "Click to add points \xB7 Double-click or Done to close \xB7 Esc to cancel";
      btn.classList.add("active");
    }
    S.map.getContainer().style.cursor = "crosshair";
  }
  function _drawClear() {
    if (S._drawClickTimer) {
      clearTimeout(S._drawClickTimer);
      S._drawClickTimer = null;
    }
    S._drawActive = false;
    S._drawVertices = [];
    [S._drawPolyline, S._drawPolygon, ...S._drawDots].forEach((l) => {
      try {
        if (l) S.map.removeLayer(l);
      } catch (_) {
      }
    });
    S._drawPolyline = S._drawPolygon = null;
    S._drawDots = [];
    S.map.dragging.enable();
    S.map.doubleClickZoom.enable();
    S.map.getContainer().removeEventListener("click", _onDrawContainerClick, true);
    S.map.getContainer().removeEventListener("dblclick", _onDrawContainerDblClick, true);
    const btn = document.getElementById("draw-fab");
    if (btn) {
      btn.innerHTML = "\u2B21";
      btn.title = "Draw a region to explore";
      btn.classList.remove("active");
    }
    S.map.getContainer().style.cursor = "";
  }
  function _drawAddVertex(latlng) {
    S._drawVertices.push([latlng.lat, latlng.lng]);
    const dot = L.circleMarker([latlng.lat, latlng.lng], {
      radius: 5,
      color: "#f0a500",
      fillColor: "#f0a500",
      fillOpacity: 1,
      weight: 2,
      pane: "econPane",
      interactive: false
    }).addTo(S.map);
    S._drawDots.push(dot);
    if (S._drawPolyline) S.map.removeLayer(S._drawPolyline);
    if (S._drawVertices.length >= 2) {
      S._drawPolyline = L.polyline(S._drawVertices, {
        color: "#f0a500",
        weight: 2,
        opacity: 0.85,
        dashArray: "6 4",
        pane: "econPane",
        interactive: false
      }).addTo(S.map);
    }
    const btn = document.getElementById("draw-fab");
    if (btn && S._drawVertices.length === 1) btn.title = "Keep clicking to add points \xB7 Double-click or click Done to close";
  }
  function _drawFinish() {
    if (S._drawVertices.length < 3) {
      _drawClear();
      return;
    }
    if (S._drawPolyline) {
      S.map.removeLayer(S._drawPolyline);
      S._drawPolyline = null;
    }
    S._drawPolygon = L.polygon(S._drawVertices, {
      color: "#f0a500",
      weight: 2,
      opacity: 0.85,
      fillColor: "#f0a500",
      fillOpacity: 0.06,
      dashArray: "6 4",
      pane: "econPane",
      interactive: false
    }).addTo(S.map);
    S._drawActive = false;
    S.map.dragging.enable();
    S.map.doubleClickZoom.enable();
    S.map.getContainer().removeEventListener("click", _onDrawContainerClick, true);
    S.map.getContainer().removeEventListener("dblclick", _onDrawContainerDblClick, true);
    S.map.getContainer().style.cursor = "";
    const btn = document.getElementById("draw-fab");
    if (btn) {
      btn.innerHTML = '\u2715<span class="fab-label">Clear</span>';
      btn.title = "Clear drawn region";
      btn.classList.add("active");
    }
    _drawProcessResults();
  }
  function _pointInPolygon(lat, lng, poly) {
    let inside = false;
    const n = poly.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const [ai, bi] = poly[i], [aj, bj] = poly[j];
      if (bi > lng !== bj > lng && lat < (aj - ai) * (lng - bi) / (bj - bi) + ai) inside = !inside;
    }
    return inside;
  }
  function _drawProcessResults() {
    const enclosed = S.allCities.filter(
      (c) => c.lat != null && c.lng != null && _pointInPolygon(c.lat, c.lng, S._drawVertices)
    );
    if (!enclosed.length) {
      alert("No cities found inside the drawn region.");
      _drawClear();
      return;
    }
    const MAX_USD = 2e12;
    const metric = "market_cap";
    const group = enclosed.map((city) => {
      const companies = S.companiesData[city.qid] || [];
      let totalUSD2 = 0;
      const validCos = [];
      const fallbackCur = ISO2_TO_CURRENCY[city.iso] || null;
      for (const co of companies) {
        const val = co[metric] || co.revenue || co.market_cap;
        const cur = co[metric + "_currency"] || co.revenue_currency || co.market_cap_currency || fallbackCur;
        if (!val || !cur) continue;
        const usd = toUSD(val, cur);
        if (usd > 0 && usd <= MAX_USD) {
          totalUSD2 += usd;
          validCos.push({ co, usd, usedMetric: metric });
        }
      }
      return { qid: city.qid, city, totalUSD: totalUSD2, validCos };
    });
    const totalUSD = group.reduce((s, p) => s + p.totalUSD, 0);
    const cLat = enclosed.reduce((s, c) => s + c.lat, 0) / enclosed.length;
    const cLng = enclosed.reduce((s, c) => s + c.lng, 0) / enclosed.length;
    const title = `Drawn region \xB7 ${enclosed.length} cit${enclosed.length === 1 ? "y" : "ies"}`;
    openCorpPanelCluster(group, title);
    S.filtered = enclosed.slice();
    S.visibleCount = PAGE_SIZE;
    renderRows();
    document.getElementById("list-meta-text").textContent = `${enclosed.length} cities in drawn region`;
    switchListTab("cities");
    document.getElementById("list-panel").style.display = "";
    if (totalUSD > 0) {
      collapseEconCluster();
      expandEconCluster(group.filter((p) => p.totalUSD > 0), totalUSD, cLat, cLng);
    }
  }
  function renderCorpList() {
    const tbody = document.getElementById("corp-tbody");
    const countEl = document.getElementById("corp-count");
    if (!S.corpCityQid && !S.corpOverrideList || !tbody) return;
    const query = document.getElementById("corp-search").value.toLowerCase().trim();
    const sortBy = document.getElementById("corp-sort").value;
    const displayCur = document.getElementById("corp-display-currency")?.value || "";
    let companies = (S.corpOverrideList || S.companiesData[S.corpCityQid] || []).slice();
    const _seenQids = /* @__PURE__ */ new Set();
    companies = companies.filter((co) => {
      if (!co.qid || !_seenQids.has(co.qid)) {
        if (co.qid) _seenQids.add(co.qid);
        return true;
      }
      return false;
    });
    const curSel = document.getElementById("corp-display-currency");
    if (curSel) {
      const usedCurs = [...new Set(companies.flatMap((co) => [
        co.revenue_currency,
        co.net_income_currency
      ].filter(Boolean)))].sort();
      const extras = ["USD", "EUR", "JPY", "CNY", "BTC", "ETH"];
      const allOpts = [.../* @__PURE__ */ new Set([...extras, ...usedCurs])];
      const prev = curSel.value;
      curSel.innerHTML = '<option value="">As reported</option>' + allOpts.map((c) => `<option value="${c}"${c === prev ? " selected" : ""}>${c}${FX_LABELS[c] ? " \xB7 " + FX_LABELS[c] : ""}</option>`).join("");
    }
    const _corpCityIso = S.cityByQid.get(S.corpCityQid)?.iso;
    function _toDisp(val, cur) {
      if (!val) return null;
      if (!displayCur || displayCur === (cur || "")) return val;
      const usd = toUSD(val, cur || ISO2_TO_CURRENCY[_corpCityIso] || "USD");
      if (!usd) return null;
      const rate = S.fxRates[displayCur];
      return rate ? usd / rate : null;
    }
    function _fmtDisp(val, cur) {
      const v = _toDisp(val, cur);
      if (v == null) return "\u2014";
      const sym = displayCur === "BTC" ? "\u20BF" : displayCur === "ETH" ? "\u039E" : displayCur ? displayCur + " " : "";
      const decimals = displayCur === "BTC" ? v < 1 ? v.toFixed(4) : v.toFixed(2) : displayCur === "ETH" ? v < 1 ? v.toFixed(3) : v.toFixed(1) : fmtRevenue(v);
      return sym + decimals;
    }
    if (query) {
      companies = companies.filter(
        (co) => co.name.toLowerCase().includes(query) || (co.industry || "").toLowerCase().includes(query)
      );
    }
    companies.sort((a, b) => {
      if (sortBy === "revenue") {
        const av = displayCur ? _toDisp(a.revenue, a.revenue_currency) || 0 : a.revenue || 0;
        const bv = displayCur ? _toDisp(b.revenue, b.revenue_currency) || 0 : b.revenue || 0;
        return bv - av;
      }
      if (sortBy === "net_income") {
        const av = displayCur ? _toDisp(a.net_income, a.net_income_currency) || 0 : a.net_income || 0;
        const bv = displayCur ? _toDisp(b.net_income, b.net_income_currency) || 0 : b.net_income || 0;
        return bv - av;
      }
      if (sortBy === "founded") return (a.founded || 9999) - (b.founded || 9999);
      return a.name.localeCompare(b.name);
    });
    countEl.textContent = companies.length + " result" + (companies.length !== 1 ? "s" : "");
    if (companies.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="color:var(--text-faint);padding:20px 10px;font-size:0.8rem">No corporations match your search.</td></tr>`;
      return;
    }
    tbody.innerHTML = companies.map((co) => {
      const wikiAttr = co.wikipedia ? ` data-wiki="${escAttr(co.wikipedia)}" data-name="${escAttr(co.name)}"` : "";
      const finJson = _gcorpFinJson(co);
      const wdUrl = `https://www.wikidata.org/wiki/${escHtml(co.qid)}`;
      const linkHtml = co.wikipedia ? `<a href="${escAttr(co.wikipedia)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="Wikipedia">W\u2197</a>` : `<a href="${escHtml(wdUrl)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="Wikidata">D\u2197</a>`;
      const histLen = (co.revenue_history || []).length;
      const revYearHtml = co.revenue_year ? ` <span style="color:var(--text-muted);font-size:0.7rem">${co.revenue_year}${histLen > 1 ? ` <span title="${histLen} years of data">\xB7${histLen}yr</span>` : ""}</span>` : "";
      return `<tr${wikiAttr} data-fin="${finJson}" onclick="corpRowClick(this)" title="${escAttr(co.name)}">
      <td class="co-name-cell">${escHtml(co.name)}</td>
      <td class="co-industry-cell">${co.industry ? escHtml(co.industry) : "\u2014"}</td>
      <td class="co-num" title="${displayCur ? "\u2248 " + displayCur : co.revenue_currency || ""}">
        ${_fmtDisp(co.revenue, co.revenue_currency) !== "\u2014" ? _fmtDisp(co.revenue, co.revenue_currency) + (displayCur ? "" : revYearHtml) : "\u2014"}
      </td>
      <td class="co-num" title="${displayCur ? "\u2248 " + displayCur : co.net_income_currency || ""}">
        ${_fmtDisp(co.net_income, co.net_income_currency)}
      </td>
      <td class="co-neutral">${co.founded || "\u2014"}</td>
      <td class="co-link">${linkHtml}</td>
    </tr>`;
    }).join("");
  }
  function corpRowClick(row) {
    const wikiUrl = row.dataset.wiki;
    const name = row.dataset.name;
    if (!wikiUrl) return;
    const finData = row.dataset.fin ? JSON.parse(row.dataset.fin) : {};
    const titleMatch = wikiUrl.match(/\/wiki\/([^#?]+)/);
    if (!titleMatch) return;
    openCompanyWikiPanel(decodeURIComponent(titleMatch[1]), name, wikiUrl, finData);
  }
  function buildGlobalCorpList() {
    S.globalCorpList = [];
    const _globalSeenQids = /* @__PURE__ */ new Set();
    for (const [qid, companies] of Object.entries(S.companiesData)) {
      const city = S.cityByQid.get(qid);
      const cityName = city ? city.name : "\u2014";
      const country = city ? city.country || "" : "";
      for (const co of companies) {
        if (co.qid && _globalSeenQids.has(co.qid)) continue;
        if (co.qid) _globalSeenQids.add(co.qid);
        const fallbackCur = city ? ISO2_TO_CURRENCY[city.iso] || null : null;
        let revenueUSD = co.revenue ? toUSD(co.revenue, co.revenue_currency || fallbackCur) : 0;
        if (revenueUSD > 5e12 && fallbackCur && fallbackCur !== co.revenue_currency) {
          const altUSD = toUSD(co.revenue, fallbackCur);
          if (altUSD > 0 && altUSD < revenueUSD) revenueUSD = altUSD;
        }
        S.globalCorpList.push({ co, cityName, country, cityQid: qid, revenueUSD });
      }
    }
    const countryCounts = {};
    S.globalCorpList.forEach((e) => {
      if (e.country) countryCounts[e.country] = (countryCounts[e.country] || 0) + 1;
    });
    const countries = Object.keys(countryCounts).sort();
    const cDrop = document.getElementById("gcorp-country");
    _populateCountDropdown(cDrop, "All countries", "", countries, countryCounts, S.globalCorpList.length);
    const industryCounts = {};
    S.globalCorpList.forEach((e) => {
      if (e.co && e.co.industry) industryCounts[e.co.industry] = (industryCounts[e.co.industry] || 0) + 1;
    });
    const industries = Object.keys(industryCounts).sort();
    const iDrop = document.getElementById("gcorp-industry");
    _populateCountDropdown(iDrop, "All industries", "", industries, industryCounts, S.globalCorpList.length);
    renderGlobalCorpList();
    if (window.innerWidth <= 768) {
      const activeTab = document.querySelector(".list-tab.active");
      document.getElementById("global-corp-panel").style.display = activeTab && activeTab.dataset.tab === "corps" ? "" : "none";
    }
  }
  function _gcorpFinJson(co) {
    const detail = S.companiesDetailData?.[co.qid] || {};
    return escHtml(JSON.stringify({
      qid: co.qid || null,
      description: detail.description || null,
      industry: co.industry || null,
      exchange: co.exchange || null,
      ticker: co.ticker || null,
      traded_as: detail.traded_as || null,
      founded: co.founded || null,
      company_type: co.company_type || null,
      website: detail.website || null,
      ceo: detail.ceo || null,
      key_people: detail.key_people || null,
      founders: detail.founders || null,
      parent_org: detail.parent_org || null,
      products: detail.products || null,
      subsidiaries: detail.subsidiaries || null,
      employees: co.employees || null,
      employees_history: detail.employees_history || [],
      revenue: co.revenue || null,
      revenue_year: co.revenue_year || null,
      revenue_currency: co.revenue_currency || null,
      revenue_history: detail.revenue_history || [],
      net_income: co.net_income || null,
      net_income_currency: co.net_income_currency || null,
      net_income_history: detail.net_income_history || [],
      operating_income: detail.operating_income || null,
      operating_income_currency: detail.operating_income_currency || null,
      operating_income_history: detail.operating_income_history || [],
      total_assets: detail.total_assets || null,
      total_assets_currency: detail.total_assets_currency || null,
      total_assets_history: detail.total_assets_history || [],
      total_equity: detail.total_equity || null,
      total_equity_currency: detail.total_equity_currency || null,
      total_equity_history: detail.total_equity_history || [],
      market_cap: co.market_cap || null,
      market_cap_year: co.market_cap_year || null,
      market_cap_currency: co.market_cap_currency || null,
      analyst_rating: detail.analyst_rating || null,
      analyst_target_price: detail.analyst_target_price || null,
      analyst_count: detail.analyst_count || null,
      gross_margin: detail.gross_margin || null,
      operating_margin: detail.operating_margin || null,
      profit_margin: detail.profit_margin || null,
      return_on_equity: detail.return_on_equity || null,
      beta: detail.beta || null,
      pe_forward: detail.pe_forward || null
    }));
  }
  function renderGlobalCorpList() {
    const q = S.gcorpQuery.toLowerCase();
    let list = S.globalCorpList.filter((e) => {
      if (q && !e.co.name.toLowerCase().includes(q) && !e.cityName.toLowerCase().includes(q) && !e.country.toLowerCase().includes(q)) return false;
      if (S.gcorpCountry && e.country !== S.gcorpCountry) return false;
      if (S.gcorpIndustry && e.co.industry !== S.gcorpIndustry) return false;
      return true;
    });
    list.sort((a, b) => {
      if (S.gcorpSort === "revenue_usd") return (b.revenueUSD || 0) - (a.revenueUSD || 0);
      if (S.gcorpSort === "employees") return (b.co.employees || 0) - (a.co.employees || 0);
      if (S.gcorpSort === "country") return (a.country || "").localeCompare(b.country || "");
      return a.co.name.localeCompare(b.co.name);
    });
    const total = list.length;
    const visible = list.slice(0, S.globalCorpVis);
    document.getElementById("gcorp-count").textContent = total.toLocaleString() + " corporation" + (total !== 1 ? "s" : "");
    const tbody = document.getElementById("gcorp-tbody");
    tbody.innerHTML = visible.map(({ co, cityName, country, cityQid, revenueUSD }) => {
      const wikiAttrs = co.wikipedia ? ` data-wiki="${escAttr(co.wikipedia)}" data-name="${escAttr(co.name)}"` : ` data-name="${escAttr(co.name)}"`;
      let revDisp;
      if (revenueUSD > 0) {
        revDisp = `$${fmtRevenue(revenueUSD)}`;
      } else if (co.revenue) {
        const curLabel = co.revenue_currency && co.revenue_currency !== "USD" ? ` ${escHtml(co.revenue_currency)}` : "";
        revDisp = `${fmtRevenue(co.revenue)}${curLabel}`;
      } else {
        revDisp = "\u2014";
      }
      const empDisp = fmtEmployees(co.employees) || "\u2014";
      const location = [cityName, country].filter(Boolean).join(", ");
      return `<tr${wikiAttrs} data-fin="${_gcorpFinJson(co)}" data-qid="${escAttr(cityQid)}" data-city="${escAttr(cityName)}" onclick="gcorpRowClick(this)">
      <td class="gcorp-name-cell"><span class="gcorp-card-row1"><span class="gcorp-card-name">${escHtml(co.name)}</span><span class="gcorp-card-rev">${revDisp}</span></span><span class="gcorp-card-row2"><span class="gcorp-card-loc">${escHtml(location || "\u2014")}${co.industry ? " \xB7 " + escHtml(co.industry) : ""}</span><span class="gcorp-card-emp">${empDisp !== "\u2014" ? empDisp : ""}</span></span></td>
      <td class="gcorp-city-cell">${escHtml(cityName)}</td>
      <td class="gcorp-country-cell">${escHtml(country || "\u2014")}</td>
      <td class="gcorp-industry-cell">${co.industry ? escHtml(co.industry) : "\u2014"}</td>
      <td class="gcorp-num">${revDisp}</td>
      <td class="gcorp-neutral">${empDisp}</td>
    </tr>`;
    }).join("");
    const moreRow = document.getElementById("gcorp-more-row");
    if (total > S.globalCorpVis) {
      moreRow.style.display = "";
      document.getElementById("gcorp-more-btn").textContent = `Show ${Math.min(GCORP_PAGE, total - S.globalCorpVis)} more (${(total - S.globalCorpVis).toLocaleString()} remaining)`;
    } else {
      moreRow.style.display = "none";
    }
  }
  function gcorpShowMore() {
    S.globalCorpVis += GCORP_PAGE;
    renderGlobalCorpList();
  }
  function gcorpQueryChanged(v) {
    S.gcorpQuery = v;
    S.globalCorpVis = GCORP_PAGE;
    renderGlobalCorpList();
  }
  function _populateCountDropdown(el, allLabel, allValue, items, counts, totalCount) {
    const label = el.querySelector(".count-dropdown-label");
    const count = el.querySelector(".count-dropdown-count");
    const menu = el.querySelector(".count-dropdown-menu");
    label.textContent = allLabel;
    count.textContent = totalCount;
    menu.innerHTML = "";
    const allItem = document.createElement("div");
    allItem.className = "count-dropdown-item active";
    allItem.dataset.value = allValue;
    allItem.innerHTML = `<span class="count-dropdown-item-name">${allLabel}</span><span class="count-dropdown-item-count">${totalCount}</span>`;
    allItem.addEventListener("click", (e) => {
      e.stopPropagation();
      _selectCountDropdownItem(el, allValue, allLabel, totalCount);
      el.dataset.value = allValue;
      if (el.id === "gcorp-country") gcorpCountryChanged(allValue);
      else gcorpIndustryChanged(allValue);
    });
    menu.appendChild(allItem);
    items.forEach((item) => {
      const div = document.createElement("div");
      div.className = "count-dropdown-item";
      div.dataset.value = item;
      div.innerHTML = `<span class="count-dropdown-item-name">${escHtml(item)}</span><span class="count-dropdown-item-count">${counts[item]}</span>`;
      div.addEventListener("click", (e) => {
        e.stopPropagation();
        _selectCountDropdownItem(el, item, item, counts[item]);
        el.dataset.value = item;
        if (el.id === "gcorp-country") gcorpCountryChanged(item);
        else gcorpIndustryChanged(item);
      });
      menu.appendChild(div);
    });
  }
  function _selectCountDropdownItem(el, value, label, count) {
    el.dataset.value = value;
    el.querySelector(".count-dropdown-label").textContent = label;
    el.querySelector(".count-dropdown-count").textContent = count;
    el.classList.remove("open");
    el.querySelectorAll(".count-dropdown-item").forEach((i) => {
      i.classList.toggle("active", i.dataset.value === value);
    });
  }
  function gcorpCountryChanged(v) {
    S.gcorpCountry = v;
    S.globalCorpVis = GCORP_PAGE;
    renderGlobalCorpList();
  }
  function gcorpIndustryChanged(v) {
    S.gcorpIndustry = v;
    S.globalCorpVis = GCORP_PAGE;
    renderGlobalCorpList();
  }
  function gcorpSortChanged(v) {
    S.gcorpSort = v;
    S.globalCorpVis = GCORP_PAGE;
    renderGlobalCorpList();
  }
  function gcorpRowClick(row) {
    const wikiUrl = row.dataset.wiki;
    const name = row.dataset.name;
    const qid = row.dataset.qid;
    const city = row.dataset.city;
    if (qid && city) {
      S.corpCityQid = qid;
      S.corpCityName = city;
    }
    if (!wikiUrl || !name) return;
    const finData = row.dataset.fin ? JSON.parse(row.dataset.fin) : {};
    const titleMatch = wikiUrl.match(/\/wiki\/([^#?]+)/);
    if (!titleMatch) return;
    openCompanyWikiPanel(decodeURIComponent(titleMatch[1]), name, wikiUrl, finData);
  }
  function _IYChart(containerEl, points, opts = {}) {
    const {
      color = "#58a6ff",
      height = 80,
      isTimestamp = true,
      autoColor = true,
      yFmt = (v) => v.toLocaleString(),
      xFmt = isTimestamp ? (t) => new Date(t * 1e3).toLocaleDateString("en-US", { month: "short", year: "2-digit" }) : (t) => String(t),
      showXLabels = false,
      showYLabels = false,
      ranges = null,
      defaultDays = 0
    } = opts;
    containerEl.innerHTML = "";
    containerEl.style.userSelect = "none";
    let activeDays = defaultDays;
    let btnRow = null;
    if (ranges?.length) {
      btnRow = document.createElement("div");
      btnRow.className = "iyc-range-row";
      ranges.forEach((r) => {
        const btn = document.createElement("button");
        btn.className = "iyc-range" + (r.days === activeDays ? " active" : "");
        btn.textContent = r.label;
        btn.dataset.days = r.days;
        btn.onclick = () => {
          activeDays = r.days;
          btnRow.querySelectorAll(".iyc-range").forEach(
            (b) => b.classList.toggle("active", +b.dataset.days === activeDays)
          );
          draw();
        };
        btnRow.appendChild(btn);
      });
      containerEl.appendChild(btnRow);
    }
    const wrap = document.createElement("div");
    wrap.style.cssText = "position:relative;overflow:hidden";
    const canvas = document.createElement("canvas");
    canvas.style.cssText = `width:100%;height:${height}px;display:block;cursor:crosshair`;
    const tt = document.createElement("div");
    tt.className = "iyc-tooltip";
    tt.style.display = "none";
    wrap.appendChild(canvas);
    wrap.appendChild(tt);
    containerEl.appendChild(wrap);
    const DPR = window.devicePixelRatio || 1;
    let _L = null;
    function getVisible() {
      if (!activeDays) return points;
      if (isTimestamp) {
        const last = points[points.length - 1]?.t || 0;
        return points.filter((p) => p.t >= last - activeDays * 86400);
      }
      return points.slice(-Math.max(2, Math.round(activeDays / 365)));
    }
    function draw() {
      const W = wrap.offsetWidth || containerEl.offsetWidth || 280;
      const H = height;
      canvas.width = W * DPR;
      canvas.height = H * DPR;
      const vis = getVisible();
      if (vis.length < 2) {
        _L = null;
        return;
      }
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const PT = 6 * DPR, PB = (showXLabels ? 16 : 4) * DPR;
      const PL = 2 * DPR, PR = (showYLabels ? 48 : 2) * DPR;
      const pW = canvas.width - PL - PR, pH = canvas.height - PT - PB;
      const tMin = vis[0].t, tMax = vis[vis.length - 1].t;
      const vals = vis.map((p) => p.v);
      const vMin = Math.min(...vals), vMax = Math.max(...vals);
      const vPad = (vMax - vMin) * 0.1 || Math.abs(vMax) * 0.05 || 1;
      const vLo = vMin - vPad, vHi = vMax + vPad;
      const xOf = (t) => PL + (tMax === tMin ? pW / 2 : (t - tMin) / (tMax - tMin) * pW);
      const yOf = (v) => PT + pH - (vHi === vLo ? pH / 2 : (v - vLo) / (vHi - vLo) * pH);
      const lineClr = autoColor ? vis[vis.length - 1].v >= vis[0].v ? "#3fb950" : "#f85149" : color;
      ctx.strokeStyle = "rgba(48,54,61,0.5)";
      ctx.lineWidth = DPR * 0.5;
      for (let i = 1; i <= 3; i++) {
        const y = PT + pH * i / 4;
        ctx.beginPath();
        ctx.moveTo(PL, y);
        ctx.lineTo(PL + pW, y);
        ctx.stroke();
      }
      if (showYLabels) {
        ctx.fillStyle = "#484f58";
        ctx.font = `${9 * DPR}px system-ui,sans-serif`;
        ctx.textAlign = "right";
        [0, 0.5, 1].forEach((f) => {
          const v = vLo + (vHi - vLo) * f;
          ctx.fillText(yFmt(v), canvas.width - DPR, PT + pH * (1 - f) + 3 * DPR);
        });
      }
      const grad = ctx.createLinearGradient(0, PT, 0, canvas.height - PB);
      grad.addColorStop(0, lineClr + "33");
      grad.addColorStop(1, lineClr + "00");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(xOf(tMin), canvas.height - PB);
      vis.forEach((p) => ctx.lineTo(xOf(p.t), yOf(p.v)));
      ctx.lineTo(xOf(tMax), canvas.height - PB);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = lineClr;
      ctx.lineWidth = 1.5 * DPR;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.setLineDash([]);
      ctx.beginPath();
      vis.forEach((p, i) => i === 0 ? ctx.moveTo(xOf(p.t), yOf(p.v)) : ctx.lineTo(xOf(p.t), yOf(p.v)));
      ctx.stroke();
      if (showXLabels) {
        ctx.fillStyle = "#484f58";
        ctx.textAlign = "center";
        ctx.font = `${8 * DPR}px system-ui,sans-serif`;
        const n = Math.min(vis.length - 1, Math.max(2, Math.floor(W / 80)));
        for (let i = 0; i <= n; i++) {
          const idx = Math.round(i / n * (vis.length - 1));
          ctx.fillText(xFmt(vis[idx].t), xOf(vis[idx].t), canvas.height - 2 * DPR);
        }
      }
      _L = { vis, xOf, yOf, tMin, tMax, pW, pH, PT, PB, PL, PR, lineClr, DPR, cW: canvas.width, cH: canvas.height, W };
    }
    function _crosshair(pt) {
      if (!_L) return;
      const { xOf, yOf, PT, PB, PL, PR, lineClr, DPR: DPR2, cW, cH } = _L;
      const ctx = canvas.getContext("2d");
      const cx = xOf(pt.t), cy = yOf(pt.v);
      ctx.setLineDash([3 * DPR2, 3 * DPR2]);
      ctx.strokeStyle = "rgba(180,180,180,0.22)";
      ctx.lineWidth = DPR2;
      ctx.beginPath();
      ctx.moveTo(cx, PT);
      ctx.lineTo(cx, cH - PB);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(PL, cy);
      ctx.lineTo(cW - PR, cy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = lineClr;
      ctx.strokeStyle = "#0d1117";
      ctx.lineWidth = 2 * DPR2;
      ctx.beginPath();
      ctx.arc(cx, cy, 3.5 * DPR2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    function _nearest(mx) {
      if (!_L) return null;
      const { vis, tMin, tMax, pW, PL, DPR: DPR2 } = _L;
      const tAt = tMin + (mx * DPR2 - PL) / pW * (tMax - tMin);
      let best = null, bestD = Infinity;
      vis.forEach((p) => {
        const d = Math.abs(p.t - tAt);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      });
      return best;
    }
    canvas.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const pt = _nearest(mx);
      if (!pt || !_L) return;
      draw();
      _crosshair(pt);
      const vis = _L.vis;
      const pct = vis.length > 1 ? ((pt.v - vis[0].v) / vis[0].v * 100).toFixed(1) : null;
      const pctHtml = pct != null ? ` <span class="iyc-tt-p" style="color:${parseFloat(pct) >= 0 ? "var(--success)" : "var(--danger)"}">${parseFloat(pct) >= 0 ? "+" : ""}${pct}%</span>` : "";
      tt.innerHTML = `<span class="iyc-tt-x">${xFmt(pt.t)}</span> <span class="iyc-tt-v">${yFmt(pt.v)}</span>${pctHtml}`;
      tt.style.display = "block";
      const tw = tt.offsetWidth, th = tt.offsetHeight;
      let tx = mx - tw / 2;
      if (tx < 0) tx = 0;
      if (tx + tw > rect.width) tx = rect.width - tw;
      tt.style.left = tx + "px";
      tt.style.top = (my < rect.height / 2 ? my + 12 : my - th - 6) + "px";
    });
    canvas.addEventListener("mouseleave", () => {
      tt.style.display = "none";
      draw();
    });
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      if (!ranges?.length || !btnRow) return;
      const btns = [...btnRow.querySelectorAll(".iyc-range")];
      const cur = btns.findIndex((b) => +b.dataset.days === activeDays);
      const next = Math.max(0, Math.min(btns.length - 1, cur + (e.deltaY > 0 ? 1 : -1)));
      if (next !== cur) btns[next].click();
    }, { passive: false });
    const ro = new ResizeObserver(() => draw());
    ro.observe(containerEl);
    draw();
    return { draw, destroy: () => ro.disconnect() };
  }
  async function _fetchWikiImages(articleTitle) {
    try {
      const res = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/media-list/${encodeURIComponent(articleTitle)}`
      );
      if (!res.ok) return [];
      const j = await res.json();
      return (j.items || []).filter((item) => {
        if (item.type !== "image") return false;
        const t = (item.title || "").toLowerCase();
        if (t.endsWith(".svg")) return false;
        if (/\b(flag|seal|coat_of_arms|icon|blank|S.map|chart|graph|signature|commons-logo|edit-clear|question_book)\b/.test(t)) return false;
        return (item.srcset?.length || 0) > 0;
      }).map((item) => {
        const raw = item.srcset[item.srcset.length - 1]?.src || item.srcset[0]?.src || "";
        return raw.startsWith("//") ? "https:" + raw : raw;
      }).filter(Boolean).slice(0, 20);
    } catch {
      return [];
    }
  }
  async function _renderCompanyPriceSection(ticker, containerEl) {
    if (!ticker || !containerEl) return;
    const phId = "co-price-" + ticker.replace(/[^a-z0-9]/gi, "_");
    const ph = containerEl.querySelector("#" + phId);
    if (!ph) return;
    try {
      const res = await fetch("/prices/" + encodeURIComponent(ticker) + ".json");
      if (!res.ok) {
        ph.remove();
        return;
      }
      const data = await res.json();
      const rawPrices = data.a || data.c || [];
      const points = (data.t || []).map((ts, i) => ({ t: ts, v: rawPrices[i] })).filter((p) => p.v != null);
      if (points.length < 10) {
        ph.remove();
        return;
      }
      const latest = points[points.length - 1];
      const now = latest.v;
      const fmtPx = (v) => v >= 100 ? v.toFixed(2) : v >= 1 ? v.toFixed(2) : v.toFixed(4);
      const currSym = { USD: "$", EUR: "\u20AC", GBP: "\xA3", JPY: "\xA5" }[data.currency] || "";
      const priceAgo = (days) => {
        const target = latest.t - days * 86400;
        const idx = points.findIndex((p) => p.t >= target);
        return idx > 0 ? points[idx].v : null;
      };
      const pct = (o, n) => o ? +((n - o) / o * 100).toFixed(1) : null;
      const fmtPct = (v) => v == null ? "" : (v >= 0 ? "+" : "") + v + "%";
      const pClr = (v) => v == null ? "#8b949e" : v >= 0 ? "#3fb950" : "#f85149";
      const chg1m = pct(priceAgo(30), now);
      const chg1y = pct(priceAgo(365), now);
      const chg5y = pct(points[0].v, now);
      const yr1Ts = latest.t - 365 * 86400;
      const yrPts = points.filter((p) => p.t >= yr1Ts);
      const w52lo = Math.min(...yrPts.map((p) => p.v));
      const w52hi = Math.max(...yrPts.map((p) => p.v));
      const w52p = w52hi > w52lo ? ((now - w52lo) / (w52hi - w52lo) * 100).toFixed(0) : 50;
      const recentDivs = (data.dividends || []).filter((d) => d.t >= yr1Ts);
      const divHtml = recentDivs.length ? `<div style="font-size:0.67rem;color:var(--text-secondary);padding:0 14px;margin-bottom:4px">Div (12mo): ${recentDivs.map((d) => currSym + d.amount).join(" \xB7 ")}</div>` : "";
      const perfSpans = [
        chg1m != null ? `<span style="color:${pClr(chg1m)};font-size:0.7rem">${fmtPct(chg1m)} 1M</span>` : "",
        chg1y != null ? `<span style="color:${pClr(chg1y)};font-size:0.7rem">${fmtPct(chg1y)} 1Y</span>` : "",
        chg5y != null ? `<span style="color:${pClr(chg5y)};font-size:0.7rem">${fmtPct(chg5y)} 5Y</span>` : ""
      ].filter(Boolean).join('<span style="color:var(--border);margin:0 3px">\xB7</span>');
      ph.innerHTML = `
      <div style="padding:8px 14px 4px;display:flex;align-items:baseline;justify-content:space-between">
        <span style="font-size:0.95rem;font-weight:700;color:var(--text-primary)">${currSym}${fmtPx(now)}<span style="font-size:0.68rem;font-weight:400;color:var(--text-faint)"> ${data.currency || ""}</span></span>
        <span>${perfSpans}</span>
      </div>
      <div id="${phId}-chart" style="padding:0 14px"></div>
      <div style="display:flex;align-items:center;gap:5px;padding:4px 14px">
        <span style="font-size:0.64rem;color:var(--text-faint);flex-shrink:0">52W</span>
        <span style="font-size:0.64rem;color:var(--text-secondary);flex-shrink:0">${fmtPx(w52lo)}</span>
        <div style="flex:1;height:3px;background:var(--bg-elevated);border-radius:2px;overflow:hidden">
          <div style="width:${w52p}%;height:100%;background:var(--accent);border-radius:2px"></div>
        </div>
        <span style="font-size:0.64rem;color:var(--text-secondary);flex-shrink:0">${fmtPx(w52hi)}</span>
      </div>
      ${divHtml}
      <div style="font-size:0.6rem;color:var(--text-muted);padding:0 14px 8px">${ticker} \xB7 ${data.exchange || ""} \xB7 5Y daily \xB7 ${data.updated || ""}</div>
    `;
      const chartEl = ph.querySelector(`#${phId}-chart`);
      if (chartEl) {
        _IYChart(chartEl, points, {
          height: 140,
          isTimestamp: true,
          autoColor: true,
          showXLabels: true,
          showYLabels: true,
          yFmt: (v) => currSym + fmtPx(v),
          xFmt: (t) => new Date(t * 1e3).toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
          ranges: [
            { label: "1M", days: 30 },
            { label: "3M", days: 90 },
            { label: "6M", days: 180 },
            { label: "1Y", days: 365 },
            { label: "3Y", days: 1095 },
            { label: "5Y", days: 1825 },
            { label: "Max", days: 0 }
          ],
          defaultDays: 365
        });
      }
    } catch (_) {
      if (ph) ph.remove();
    }
  }
  function _renderFinanceTab(co, containerEl) {
    if (!co || !containerEl) return;
    const ticker = co.ticker || "";
    const cur = co.revenue_currency || co.net_income_currency || "";
    const curSym = { USD: "$", EUR: "\u20AC", GBP: "\xA3", JPY: "\xA5", CNY: "\xA5", KRW: "\u20A9", INR: "\u20B9" }[cur] || "";
    const pct = (v) => v == null ? null : (v * 100).toFixed(1) + "%";
    const fmtV = (v) => v == null ? null : fmtRevenue(v);
    const fmtP = (v) => v == null ? null : (v >= 0 ? "+" : "") + (v * 100).toFixed(1) + "%";
    const fmtX = (v) => v == null ? null : v.toFixed(2) + "\xD7";
    const fmtR = (v) => v == null ? null : v.toFixed(2);
    const clr = (v) => v == null ? "#8b949e" : v >= 0 ? "#3fb950" : "#f85149";
    const sec = (label) => `<div style="padding:8px 14px 4px;font-size:0.65rem;font-weight:600;color:var(--text-faint);text-transform:uppercase;letter-spacing:0.06em;border-top:1px solid var(--bg-elevated)">${label}</div>`;
    const chip = (label, val, color = "#c9d1d9") => {
      if (val == null || val === "") return "";
      return `<div style="background:var(--bg-elevated);border-radius:6px;padding:5px 9px;min-width:0">
      <div style="font-size:0.6rem;color:var(--text-faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(label)}</div>
      <div style="font-size:0.78rem;color:${color};font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(String(val))}</div>
    </div>`;
    };
    const grid = (...chips) => {
      const cells = chips.filter(Boolean).join("");
      return cells ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;padding:6px 14px">${cells}</div>` : "";
    };
    const bar = (label, val, color = "#58a6ff") => {
      if (val == null) return "";
      const w = Math.min(100, Math.abs(val * 100)).toFixed(1);
      const c = val >= 0 ? color : "#f85149";
      return `<div style="padding:3px 14px">
      <div style="display:flex;justify-content:space-between;margin-bottom:2px">
        <span style="font-size:0.68rem;color:var(--text-secondary)">${escHtml(label)}</span>
        <span style="font-size:0.68rem;font-weight:600;color:${c}">${(val * 100).toFixed(1)}%</span>
      </div>
      <div style="height:4px;background:var(--bg-elevated);border-radius:2px">
        <div style="width:${w}%;height:100%;background:${c};border-radius:2px"></div>
      </div>
    </div>`;
    };
    let _fn = 0;
    const chartPh = (pts, color, fmt, height = 80) => {
      if (!pts || pts.length < 2) return "";
      const id = `fin-iyc-${++_fn}`;
      return `<div id="${id}" data-fin-pts="${escHtml(JSON.stringify(pts))}" data-fin-color="${escHtml(color)}" data-fin-fmt="${fmt}" style="padding:0 8px 4px;height:${height}px"></div>`;
    };
    const mcap = co.market_cap;
    const ev = co.enterprise_value;
    const shares = co.shares_outstanding;
    const eps = co.eps ?? co.eps_trailing;
    const pe = co.pe_trailing;
    const peFwd = co.pe_forward;
    const pb = co.price_to_book;
    const beta = co.beta;
    const w52chg = co.week52_change;
    const divYield = co.dividend_yield;
    const divRate = co.dividend_rate;
    const sector = co.sector;
    const industry = co.industry;
    const analystRating = co.analyst_rating || null;
    const analystTarget = co.analyst_target_price || null;
    const analystCount = co.analyst_count || null;
    const lastPrice = co.last_price_yahoo || null;
    const opMargin = co.operating_margin;
    const prMargin = co.profit_margin;
    const grMargin = co.gross_margin;
    const ebMargin = co.ebitda_margin;
    const roe = co.return_on_equity;
    const roa = co.return_on_assets;
    const revGrowth = co.revenue_growth_yoy;
    const earnGrowth = co.earnings_growth_yoy;
    const totalCash = co.total_cash;
    const totalDebt = co.total_debt;
    const ebitda = co.ebitda;
    const fcf = co.free_cashflow;
    const ocf = co.operating_cashflow;
    const de = co.debt_to_equity;
    const cr = co.current_ratio;
    const qr = co.quick_ratio;
    const pctInsider = co.pct_insider;
    const pctInst = co.pct_institutional;
    const revHistory = (() => {
      const yh = (co.revenue_history_yahoo || []).filter((r) => r.revenue > 0).map((r) => ({ t: r.year, v: r.revenue }));
      if (yh.length >= 2) return yh;
      return (co.revenue_history || []).filter((r) => r[1] > 0).map((r) => ({ t: r[0], v: r[1] }));
    })();
    const niHistory = (() => {
      const yh = (co.revenue_history_yahoo || []).filter((r) => r.net_income != null).map((r) => ({ t: r.year, v: r.net_income }));
      if (yh.length >= 2) return yh;
      return (co.net_income_history || []).filter((r) => r[1] != null).map((r) => ({ t: r[0], v: r[1] }));
    })();
    const cfHistory = (co.cashflow_history_yahoo || []).filter((r) => r.free_cash_flow != null).map((r) => ({ t: r.year, v: r.free_cash_flow }));
    const assetHistory = (co.total_assets_history || []).filter((r) => r[1] > 0).map((r) => ({ t: r[0], v: r[1] }));
    const equityHistory = (co.total_equity_history || []).filter((r) => r[1] != null && r[1] !== 0).map((r) => ({ t: r[0], v: r[1] }));
    const phId = "co-price-" + ticker.replace(/[^a-z0-9]/gi, "_");
    let html = '<div id="' + phId + '"><div class="skeleton-block"><div class="skeleton skeleton-text" style="width:40%"></div><div class="skeleton" style="height:120px;border-radius:6px"></div></div></div>';
    const hasKeyStats = mcap || ev || eps != null || pe != null || pb != null || beta != null || divYield != null;
    if (hasKeyStats) {
      html += sec("Key Statistics");
      html += grid(
        chip("Market Cap", mcap ? fmtV(mcap) : null),
        chip("Enterprise Val", ev ? fmtV(ev) : null),
        chip("Shares Out.", shares ? fmtV(shares) : null),
        chip("EPS (TTM)", eps != null ? (curSym || "$") + eps.toFixed(2) : null),
        chip("P/E (TTM)", pe != null ? fmtX(pe) : null),
        chip("P/E (Fwd)", peFwd != null ? fmtX(peFwd) : null),
        chip("Price/Book", pb != null ? fmtX(pb) : null),
        chip("Beta", beta != null ? fmtR(beta) : null, beta != null ? beta > 1.2 ? "#f0a500" : beta < 0.8 ? "#58a6ff" : "#c9d1d9" : "#c9d1d9"),
        chip("52W Change", w52chg != null ? fmtP(w52chg) : null, clr(w52chg)),
        chip("Div Yield", divYield != null ? pct(divYield) : null, "#3fb950"),
        chip("Div Rate", divRate != null ? (curSym || "$") + divRate.toFixed(2) : null)
      );
    }
    const hasMargins = opMargin != null || prMargin != null || grMargin != null || ebMargin != null || roe != null || roa != null;
    if (hasMargins) {
      html += sec("Profitability");
      if (grMargin != null) html += bar("Gross Margin", grMargin, "#58a6ff");
      if (opMargin != null) html += bar("Operating Margin", opMargin, "#3fb950");
      if (ebMargin != null) html += bar("EBITDA Margin", ebMargin, "#f0a500");
      if (prMargin != null) html += bar("Net Profit Margin", prMargin, "#bc8cff");
      html += grid(
        chip("Return on Equity", roe != null ? pct(roe) : null, clr(roe)),
        chip("Return on Assets", roa != null ? pct(roa) : null, clr(roa)),
        chip("Revenue Growth", revGrowth != null ? fmtP(revGrowth) : null, clr(revGrowth)),
        chip("Earnings Growth", earnGrowth != null ? fmtP(earnGrowth) : null, clr(earnGrowth))
      );
    }
    const hasHealth = totalCash != null || totalDebt != null || de != null || cr != null;
    if (hasHealth) {
      html += sec("Financial Health");
      html += grid(
        chip("Cash & Equiv", totalCash ? fmtV(totalCash) : null, "#3fb950"),
        chip("Total Debt", totalDebt ? fmtV(totalDebt) : null, "#f85149"),
        chip("EBITDA", ebitda ? fmtV(ebitda) : null),
        chip("Free Cash Flow", fcf ? fmtV(fcf) : null, clr(fcf)),
        chip("Oper. Cash Flow", ocf ? fmtV(ocf) : null, clr(ocf)),
        chip("D/E Ratio", de != null ? fmtR(de) : null, de != null ? de > 2 ? "#f85149" : de > 1 ? "#f0a500" : "#3fb950" : "#c9d1d9"),
        chip("Current Ratio", cr != null ? fmtR(cr) : null, cr != null ? cr >= 1.5 ? "#3fb950" : cr >= 1 ? "#f0a500" : "#f85149" : "#c9d1d9"),
        chip("Quick Ratio", qr != null ? fmtR(qr) : null)
      );
    }
    if (pctInsider != null || pctInst != null) {
      html += sec("Ownership");
      html += grid(
        chip("Insider Held", pctInsider != null ? pct(pctInsider) : null),
        chip("Institutional", pctInst != null ? pct(pctInst) : null)
      );
    }
    if (analystRating || analystTarget != null) {
      const RATING_LABELS = {
        strongBuy: "Strong Buy",
        buy: "Buy",
        hold: "Hold",
        underperform: "Underperform",
        sell: "Sell"
      };
      const RATING_COLORS = {
        strongBuy: "#3fb950",
        buy: "#58a6ff",
        hold: "#f0a500",
        underperform: "#f85149",
        sell: "#f85149"
      };
      const ratingLabel = RATING_LABELS[analystRating] || analystRating;
      const ratingColor = RATING_COLORS[analystRating] || "#8b949e";
      let uptside = null;
      if (analystTarget != null && lastPrice != null && lastPrice > 0) {
        uptside = (analystTarget - lastPrice) / lastPrice;
      }
      html += sec("Analyst Consensus" + (analystCount ? " \xB7 " + analystCount + " analysts" : ""));
      html += grid(
        analystRating ? chip("Rating", ratingLabel, ratingColor) : "",
        analystTarget != null ? chip("Price Target", (curSym || "$") + analystTarget.toFixed(2)) : "",
        uptside != null ? chip("Upside", fmtP(uptside), clr(uptside)) : ""
      );
    }
    if (sector || industry) {
      html += `<div style="padding:6px 14px 4px;display:flex;gap:6px;flex-wrap:wrap">
      ${sector ? `<span style="background:var(--bg-elevated);border-radius:12px;padding:2px 10px;font-size:0.68rem;color:var(--accent)">${escHtml(sector)}</span>` : ""}
      ${industry ? `<span style="background:var(--bg-elevated);border-radius:12px;padding:2px 10px;font-size:0.68rem;color:var(--text-secondary)">${escHtml(industry)}</span>` : ""}
    </div>`;
    }
    const hasCharts = revHistory.length >= 2 || niHistory.length >= 2 || cfHistory.length >= 2 || assetHistory.length >= 2;
    if (hasCharts) {
      html += sec("Historical Trends");
      if (revHistory.length >= 2) {
        html += `<div style="padding:0 14px 2px;font-size:0.67rem;color:var(--text-secondary)">Revenue${cur ? " (" + cur + ")" : ""}</div>`;
        html += chartPh(revHistory, "#58a6ff", "rev", 80);
      }
      if (niHistory.length >= 2) {
        html += `<div style="padding:4px 14px 2px;font-size:0.67rem;color:var(--text-secondary)">Net Income${cur ? " (" + cur + ")" : ""}</div>`;
        html += chartPh(niHistory, "#3fb950", "rev", 70);
      }
      if (cfHistory.length >= 2) {
        html += `<div style="padding:4px 14px 2px;font-size:0.67rem;color:var(--text-secondary)">Free Cash Flow${cur ? " (" + cur + ")" : ""}</div>`;
        html += chartPh(cfHistory, "#bc8cff", "rev", 70);
      }
      if (assetHistory.length >= 2) {
        html += `<div style="padding:4px 14px 2px;font-size:0.67rem;color:var(--text-secondary)">Total Assets${cur ? " (" + cur + ")" : ""}</div>`;
        html += chartPh(assetHistory, "#f0a500", "rev", 70);
      }
      if (equityHistory.length >= 2) {
        html += `<div style="padding:4px 14px 2px;font-size:0.67rem;color:var(--text-secondary)">Total Equity${cur ? " (" + cur + ")" : ""}</div>`;
        html += chartPh(equityHistory, "#e07b54", "rev", 70);
      }
    }
    html += `<div style="height:16px"></div>`;
    containerEl.innerHTML = html;
    const _finDrawFns = [];
    containerEl.querySelectorAll("[data-fin-pts]").forEach((el) => {
      try {
        const pts = JSON.parse(el.dataset.finPts);
        const color = el.dataset.finColor;
        const inst = _IYChart(el, pts, {
          color,
          height: parseInt(el.style.height),
          isTimestamp: false,
          autoColor: false,
          yFmt: fmtRevenue,
          xFmt: (t) => String(t)
        });
        if (inst?.draw) _finDrawFns.push(inst.draw);
      } catch (_) {
      }
    });
    containerEl._iycRedraw = () => _finDrawFns.forEach((fn) => {
      try {
        fn();
      } catch (_) {
      }
    });
    if (ticker) _renderCompanyPriceSection(ticker, containerEl);
  }
  async function openCompanyWikiPanel(articleTitle, name, wikiUrl, finData = {}) {
    const sidebar = document.getElementById("wiki-sidebar");
    const body = document.getElementById("wiki-sidebar-body");
    const footer = document.getElementById("wiki-sidebar-footer");
    const titleEl = document.getElementById("wiki-sidebar-title");
    titleEl.textContent = name;
    footer.innerHTML = "";
    const _coInfoEl = document.getElementById("wiki-tab-info");
    const _coOverEl = document.getElementById("wiki-tab-overview");
    const _coEconEl = document.getElementById("wiki-tab-economy");
    const _coFinEl = document.getElementById("wiki-tab-finance");
    const _coEconBtn = document.getElementById("wiki-tab-economy-btn");
    const _coFinBtn = document.getElementById("wiki-tab-finance-btn");
    if (_coInfoEl) _coInfoEl.innerHTML = '<div class="skeleton-block"><div class="skeleton skeleton-text-lg" style="width:50%"></div><div class="skeleton skeleton-text" style="width:80%"></div><div class="skeleton skeleton-text" style="width:65%"></div><div class="skeleton skeleton-chip"></div><div class="skeleton skeleton-chip"></div></div>';
    if (_coOverEl) _coOverEl.innerHTML = "";
    if (_coEconEl) _coEconEl.innerHTML = "";
    if (_coFinEl) _coFinEl.innerHTML = "";
    if (_coEconBtn) _coEconBtn.style.display = "none";
    if (_coFinBtn) _coFinBtn.style.display = "none";
    switchWikiTab("info");
    sidebar.classList.add("open");
    if (!S.companiesDetailData) {
      _companiesDetailLoader.ensure();
    }
    const corpCity = S.cityByQid.get(S.corpCityQid);
    const localLang = corpCity ? ISO_TO_WIKI_LANG[corpCity.iso] || null : null;
    const tryLocal = localLang && localLang !== "en";
    try {
      const enApiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(articleTitle)}`;
      const mediaPromise = _fetchWikiImages(articleTitle);
      const enRaw = await fetch(enApiUrl);
      if (!enRaw.ok) throw new Error("HTTP " + enRaw.status);
      const enData = await enRaw.json();
      const extraImages = await mediaPromise;
      let displayData = enData;
      let displayLang = "en";
      let localWikiUrl = null;
      if (tryLocal && enData.wikibase_item) {
        try {
          const wdUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(enData.wikibase_item)}&props=sitelinks&sitefilter=${localLang}wiki&format=json&origin=*`;
          const wdRaw = await fetch(wdUrl);
          const wdJson = await wdRaw.json();
          const localTitle = wdJson.entities?.[enData.wikibase_item]?.sitelinks?.[`${localLang}wiki`]?.title;
          if (localTitle) {
            const localApiUrl = `https://${localLang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(localTitle)}`;
            localWikiUrl = `https://${localLang}.wikipedia.org/wiki/${encodeURIComponent(localTitle)}`;
            const localRaw = await fetch(localApiUrl);
            if (localRaw.ok) {
              const localJson = await localRaw.json();
              if (localJson.extract) {
                displayData = localJson;
                displayLang = localLang;
              }
            }
          }
        } catch (_) {
        }
      }
      const _thumb = displayData.thumbnail?.source || null;
      const _allImgs = [_thumb, ...extraImages].filter(Boolean).filter((src, i, arr) => arr.indexOf(src) === i);
      let imgHtml = "";
      if (_allImgs.length > 0) {
        window._lbImgs = _allImgs;
        S.carImages = _allImgs;
        S.carIdx = 0;
        carStop();
        const dots = _allImgs.map(
          (_, i) => `<button class="wiki-car-dot${i === 0 ? " active" : ""}" onclick="carJump(${i})"></button>`
        ).join("");
        imgHtml = `
        <div class="wiki-carousel"
             onmouseenter="carStop()"
             onmouseleave="carResume()">
          <img id="wiki-car-img" class="wiki-carousel-img"
               src="${escAttr(_allImgs[0])}"
               onclick="openCarouselLightbox()" alt="${escAttr(name)}" />
          ${_allImgs.length > 1 ? `
            <div class="wiki-car-overlay">
              <button class="wiki-car-btn" onclick="carGo(-1)">&#8249;</button>
              <div class="wiki-car-dots">${dots}</div>
              <button class="wiki-car-btn" onclick="carGo(1)">&#8250;</button>
            </div>
            <div class="wiki-car-counter" id="wiki-car-counter">1 / ${_allImgs.length}</div>
          ` : ""}
        </div>`;
        if (_allImgs.length > 1) {
          S.carTimer = setInterval(() => carGo(1), 4500);
        }
      }
      const extract = displayData.extract || "";
      if (S.companiesDetailData && finData.qid) {
        const detail = S.companiesDetailData[finData.qid];
        if (detail) {
          for (const [k, v] of Object.entries(detail)) {
            if (finData[k] == null || finData[k] === "" || Array.isArray(finData[k]) && finData[k].length === 0) {
              finData[k] = v;
            }
          }
        }
      }
      const _chip = (label, val, color = "#c9d1d9", isHtml = false, span2 = false) => {
        if (val == null || val === "") return "";
        const v = isHtml ? val : escHtml(String(val));
        return `<div style="background:var(--bg-elevated);border-radius:6px;padding:5px 9px;min-width:0;overflow:hidden;${span2 ? "grid-column:span 2;" : ""}">
        <div style="font-size:0.62rem;color:var(--text-faint);margin-bottom:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(label)}</div>
        <div style="font-size:0.79rem;color:${color};font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${v}</div>
      </div>`;
      };
      let _iycN = 0;
      const _sparkline = (hist, label, color, fmtFn) => {
        const rows = (hist || []).filter((h) => h[0] && h[1] > 0);
        if (rows.length < 2) return "";
        const minV = Math.min(...rows.map((h) => h[1]));
        const maxV = Math.max(...rows.map((h) => h[1]));
        const pts = JSON.stringify(rows);
        const fmt = fmtFn === fmtEmployees ? "emp" : "rev";
        const id = `iyc-${++_iycN}`;
        return `<div style="border-top:1px solid var(--bg-elevated)">
        <div style="display:flex;justify-content:space-between;padding:4px 14px 0">
          <span style="font-size:0.7rem;color:var(--text-secondary)">${escHtml(label)}</span>
          <span style="font-size:0.62rem;color:var(--text-muted)">${fmtFn(minV)} \u2013 ${fmtFn(maxV)}</span>
        </div>
        <div id="${id}" data-iyc-pts="${escHtml(pts)}" data-iyc-color="${escHtml(color)}" data-iyc-fmt="${fmt}" style="height:52px;padding:0 8px 4px"></div>
      </div>`;
      };
      const _cur = (c) => c && c !== "USD" ? ` ${c}` : "";
      const _yr2 = (yr) => yr ? `'${String(yr).slice(-2)}` : "";
      const coQid = finData.qid || "";
      const _rankChip = (label, val, color, metric) => {
        if (!val && val !== 0) return "";
        const v = escHtml(String(val));
        const hasClick = !!(coQid && metric);
        const onclick = hasClick ? `onclick="openStatsPanel('${metric}','${escHtml(coQid)}')"` : "";
        const title = hasClick ? `title="Click to see global ranking"` : "";
        const cursor = hasClick ? "cursor:pointer;" : "";
        return `<div ${onclick} ${title} style="${cursor}background:var(--bg-elevated);border-radius:6px;padding:5px 9px;min-width:0;overflow:hidden;">
        <div style="font-size:0.62rem;color:var(--text-faint);margin-bottom:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(label)}</div>
        <div style="font-size:0.79rem;color:${color};font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${v}</div>
      </div>`;
      };
      const keyChips = [
        finData.revenue ? _rankChip("Revenue", fmtRevenue(finData.revenue) + _cur(finData.revenue_currency) + " " + _yr2(finData.revenue_year), "#58a6ff", "corp_revenue") : "",
        finData.market_cap ? _rankChip("Market Cap", fmtRevenue(finData.market_cap) + _cur(finData.market_cap_currency) + " " + _yr2(finData.market_cap_year), "#f0a500", "corp_market_cap") : "",
        finData.net_income ? _rankChip("Net Income", fmtRevenue(finData.net_income) + _cur(finData.net_income_currency), "#3fb950", "corp_net_income") : "",
        finData.employees ? _rankChip("Employees", fmtEmployees(finData.employees), "#79c0ff", "corp_employees") : ""
      ].filter(Boolean).join("");
      const ceoDisplay = (() => {
        if (finData.key_people?.length) return finData.key_people.map((p) => p.name + (p.role ? ` (${p.role})` : "")).join(" \xB7 ");
        return finData.ceo || null;
      })();
      const exchangeVal = (() => {
        const ex = finData.exchange || finData.traded_as || "";
        return ex + (finData.ticker ? ` \xB7 ${finData.ticker}` : "");
      })();
      const profileChips = [
        finData.founded ? _chip("Founded", finData.founded) : "",
        finData.company_type ? _chip("Type", finData.company_type) : "",
        finData.industry ? _chip("Industry", finData.industry, "#c9d1d9", false, true) : "",
        exchangeVal ? _chip("Exchange", exchangeVal, "#c9d1d9", false, true) : "",
        ceoDisplay ? _chip("CEO", ceoDisplay, "#c9d1d9", false, ceoDisplay.length > 22) : "",
        finData.parent_org ? _chip("Parent", finData.parent_org, "#c9d1d9", false, true) : "",
        finData.founders?.length ? _chip("Founders", finData.founders.join(", "), "#c9d1d9", false, true) : "",
        finData.website ? _chip(
          "Website",
          `<a href="${escAttr(finData.website)}" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:none" onclick="event.stopPropagation()">${escHtml(finData.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""))}</a>`,
          "#58a6ff",
          true,
          true
        ) : "",
        finData.products?.length ? _chip("Products", finData.products.slice(0, 6).join(", "), "#c9d1d9", false, true) : "",
        finData.subsidiaries?.length ? _chip("Subsidiaries", finData.subsidiaries.slice(0, 5).join(", ") + (finData.subsidiaries.length > 5 ? "\u2026" : ""), "#c9d1d9", false, true) : ""
      ].filter(Boolean).join("");
      const trendRows = [
        _sparkline(finData.revenue_history, "Revenue", "#58a6ff", fmtRevenue),
        _sparkline(finData.operating_income_history, "Operating Inc.", "#3fb950", fmtRevenue),
        _sparkline(finData.net_income_history, "Net Income", "#3fb950", fmtRevenue),
        _sparkline(finData.total_assets_history, "Total Assets", "#bc8cff", fmtRevenue),
        _sparkline(finData.total_equity_history, "Total Equity", "#f0a500", fmtRevenue),
        _sparkline(finData.employees_history, "Employees", "#79c0ff", fmtEmployees)
      ].filter(Boolean).join("");
      const _chipGrid = (chips) => chips ? `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:5px;padding:10px 14px 8px;border-bottom:1px solid var(--bg-elevated)">${chips}</div>` : "";
      const finHtml = _chipGrid(keyChips) + _chipGrid(profileChips) + (trendRows ? `<div style="padding-bottom:6px;border-bottom:1px solid var(--bg-elevated)">${trendRows}</div>` : "");
      const langBadge = displayLang !== "en" ? `<span style="font-size:0.68rem;background:var(--bg-elevated);color:var(--text-secondary);border-radius:4px;padding:2px 6px;margin-left:8px;vertical-align:middle">${displayLang}</span>` : "";
      const infoTabEl = document.getElementById("wiki-tab-info");
      if (infoTabEl) {
        infoTabEl.innerHTML = `
        ${imgHtml}
        <div class="wiki-city-header">
          <div class="wiki-city-name">${escHtml(displayData.title || name)}${langBadge}</div>
          ${displayData.description || finData.description ? `<div class="wiki-city-desc">${escHtml(displayData.description || finData.description)}</div>` : ""}
        </div>
        ${finHtml}
      `;
        infoTabEl.querySelectorAll("[data-iyc-pts]").forEach((el) => {
          try {
            const pts = JSON.parse(el.dataset.iycPts).map(([t, v]) => ({ t, v }));
            const color = el.dataset.iycColor || "#58a6ff";
            const fmt = el.dataset.iycFmt === "emp" ? fmtEmployees : fmtRevenue;
            _IYChart(el, pts, {
              color,
              height: 52,
              isTimestamp: false,
              autoColor: false,
              yFmt: fmt,
              xFmt: (t) => String(t)
            });
          } catch (_) {
          }
        });
      }
      const _finTabEl = document.getElementById("wiki-tab-finance");
      const _finBtnEl2 = document.getElementById("wiki-tab-finance-btn");
      if (finData.ticker && _finTabEl && _finBtnEl2) {
        _finBtnEl2.style.display = "";
        _renderFinanceTab(finData, _finTabEl);
      }
      const overTabEl = document.getElementById("wiki-tab-overview");
      if (overTabEl) overTabEl.innerHTML = extract ? `
      <div class="wiki-extract-wrap">
        <div class="wiki-extract-head">Overview</div>
        <div class="wiki-extract collapsed" id="wiki-extract-text">${escHtml(extract)}</div>
        <button class="wiki-expand-btn" id="wiki-expand-btn" onclick="toggleExtract()">Show more</button>
      </div>` : '<div style="padding:16px;color:var(--text-faint);font-size:0.82rem">No Wikipedia overview available.</div>';
      const svgIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#58a6ff" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
      const enLink = `<a class="wiki-footer-link" href="${escAttr(wikiUrl)}" target="_blank" rel="noopener">${svgIcon} Wikipedia (EN)</a>`;
      const locLink = localWikiUrl && displayLang !== "en" ? `<a class="wiki-footer-link" href="${escAttr(localWikiUrl)}" target="_blank" rel="noopener">${svgIcon} Wikipedia (${displayLang.toUpperCase()})</a>` : "";
      const yfLink = finData.ticker ? `<a class="wiki-footer-link" href="https://finance.yahoo.com/quote/${encodeURIComponent(finData.ticker)}" target="_blank" rel="noopener">${svgIcon} Yahoo Finance (${escHtml(finData.ticker)})</a>` : "";
      footer.innerHTML = `<div style="display:flex;gap:4px;flex-wrap:wrap">${locLink}${enLink}${yfLink}</div>`;
    } catch (e) {
      const _errEl = document.getElementById("wiki-tab-info");
      if (_errEl) _errEl.innerHTML = `<div class="wiki-error">Could not load Wikipedia article.<br/><a href="${escAttr(wikiUrl)}" target="_blank" rel="noopener">Open Wikipedia directly \u2197</a></div>`;
    }
  }
  function openComparePanel(qidA) {
    closeCountryPanel();
    document.getElementById("wiki-sidebar").classList.remove("open");
    if (typeof closeCountryCompare === "function") closeCountryCompare();
    S._cmpCityA = S.cityByQid.get(qidA) || null;
    S._cmpCityB = null;
    const panel = document.getElementById("compare-panel");
    panel.classList.add("visible");
    _mobileBackdropOn();
    document.getElementById("compare-col-a").textContent = S._cmpCityA ? S._cmpCityA.name : "\u2014";
    document.getElementById("compare-col-b").textContent = "\u2014";
    document.getElementById("compare-tbody").innerHTML = "";
    document.getElementById("compare-search-input").value = "";
    document.getElementById("compare-search-results").innerHTML = "";
    setTimeout(() => document.getElementById("compare-search-input").focus(), 50);
  }
  function closeComparePanel() {
    document.getElementById("compare-panel").classList.remove("visible");
    _mobileBackdropOff();
    S._cmpCityA = null;
    S._cmpCityB = null;
  }
  function _renderComparison() {
    if (!S._cmpCityA || !S._cmpCityB) return;
    const a = S._cmpCityA, b = S._cmpCityB;
    document.getElementById("compare-col-a").textContent = a.name;
    document.getElementById("compare-col-b").textContent = b.name;
    const rows = [];
    const fmtN = (v) => v != null ? fmtNum(Math.round(v)) : null;
    function metricRow(label, va, vb, fmt, higherBetter, unit = "") {
      if (va == null && vb == null) return;
      const fva = va != null ? fmt(va) + unit : "\u2014";
      const fvb = vb != null ? fmt(vb) + unit : "\u2014";
      let clsA = "", clsB = "";
      if (va != null && vb != null && va !== vb && higherBetter != null) {
        if (higherBetter) {
          clsA = va > vb ? "cmp-better" : "cmp-worse";
          clsB = vb > va ? "cmp-better" : "cmp-worse";
        } else {
          clsA = va < vb ? "cmp-better" : "cmp-worse";
          clsB = vb < va ? "cmp-better" : "cmp-worse";
        }
      }
      rows.push(`<tr><td class="cmp-metric">${escHtml(label)}</td><td class="cmp-val ${clsA}">${fva}</td><td class="cmp-val ${clsB}">${fvb}</td></tr>`);
    }
    function sectionRow(label) {
      rows.push(`<tr class="cmp-section"><td colspan="3">${label}</td></tr>`);
    }
    sectionRow("City");
    metricRow("Country", a.country, b.country, (v) => escHtml(v), null);
    metricRow("Population", a.pop, b.pop, fmtN, true);
    metricRow("Metro pop.", a.pop_metro, b.pop_metro, fmtN, true);
    metricRow("Area", a.area_km2, b.area_km2, (v) => fmtNum(Math.round(v)) + " km\xB2", null);
    metricRow("Founded", a.founded, b.founded, (v) => v < 0 ? Math.abs(v) + " BC" : String(v), false);
    metricRow("Elevation", a.elev_m, b.elev_m, (v) => fmtNum(Math.round(v)) + " m", null);
    const caA = climateAnnual(getCityClimate(a)), caB = climateAnnual(getCityClimate(b));
    if (caA || caB) {
      sectionRow("Climate");
      metricRow("Avg Temp", caA?.avgTemp ?? null, caB?.avgTemp ?? null, (v) => v.toFixed(1) + "\xB0C", null);
      metricRow("Hottest month", caA?.hottestTemp ?? null, caB?.hottestTemp ?? null, (v) => v.toFixed(1) + "\xB0C", null);
      metricRow("Coldest month", caA?.coldestTemp ?? null, caB?.coldestTemp ?? null, (v) => v.toFixed(1) + "\xB0C", null);
      metricRow("Rainfall/yr", caA?.precipMm ?? null, caB?.precipMm ?? null, (v) => fmtNum(Math.round(v)) + " mm", null);
      metricRow("Sunshine", caA?.sunHours ?? null, caB?.sunHours ?? null, (v) => fmtNum(Math.round(v)) + " hrs/yr", null);
    }
    const aqA = S.airQualityData[a.qid], aqB = S.airQualityData[b.qid];
    if (aqA || aqB) {
      sectionRow("Air Quality (WHO)");
      metricRow("PM2.5 annual mean", aqA?.pm25 ?? null, aqB?.pm25 ?? null, (v) => v.toFixed(1) + " \xB5g/m\xB3", false);
    }
    const wbA = a.iso ? S.countryData[a.iso] : null;
    const wbB = b.iso ? S.countryData[b.iso] : null;
    if (wbA || wbB) {
      sectionRow("Country (World Bank)");
      metricRow("GDP per capita", wbA?.gdp_per_capita ?? null, wbB?.gdp_per_capita ?? null, (v) => "$" + Math.round(v).toLocaleString(), true);
      metricRow("Life expectancy", wbA?.life_expectancy ?? null, wbB?.life_expectancy ?? null, (v) => v.toFixed(1) + " yrs", true);
      metricRow("HDI", wbA?.hdi ?? null, wbB?.hdi ?? null, (v) => v.toFixed(3), true);
      metricRow("Internet access", wbA?.internet_pct ?? null, wbB?.internet_pct ?? null, (v) => v.toFixed(1) + "%", true);
      metricRow("Income inequality (Gini)", wbA?.gini ?? null, wbB?.gini ?? null, (v) => v.toFixed(1), false);
      const eciA = a.iso ? S.eciData[a.iso] : null;
      const eciB = b.iso ? S.eciData[b.iso] : null;
      metricRow("Economic Complexity (ECI)", eciA?.eci ?? null, eciB?.eci ?? null, (v) => (v > 0 ? "+" : "") + v.toFixed(2), true);
    }
    const uniA = S.universitiesData[a.qid], uniB = S.universitiesData[b.qid];
    const nbA = S.nobelCitiesData[a.qid], nbB = S.nobelCitiesData[b.qid];
    if (uniA || uniB || nbA || nbB) {
      sectionRow("Education & Research");
      metricRow("Universities", uniA?.length ?? null, uniB?.length ?? null, (v) => String(v), true);
      metricRow("Nobel Laureates", nbA?.total ?? null, nbB?.total ?? null, (v) => String(v), true);
    }
    const airA = S.airportData[a.qid], airB = S.airportData[b.qid];
    const gawcA = S.gawcCities[a.qid], gawcB = S.gawcCities[b.qid];
    const metA = S.metroTransitData[a.qid], metB = S.metroTransitData[b.qid];
    if (airA || airB || gawcA || gawcB || metA || metB) {
      sectionRow("Connectivity & Transit");
      metricRow("Direct air routes", airA?.directDestinations ?? null, airB?.directDestinations ?? null, (v) => fmtNum(v) + " destinations", true);
      if (gawcA || gawcB) metricRow("World City tier", gawcA?.tier ?? null, gawcB?.tier ?? null, (v) => escHtml(v), null);
      metricRow("Metro stations", metA?.stations ?? null, metB?.stations ?? null, (v) => fmtNum(v), true);
      metricRow("Metro lines", metA?.lines ?? null, metB?.lines ?? null, (v) => String(v), true);
    }
    const esA = S.eurostatCities[a.qid], esB = S.eurostatCities[b.qid];
    if (esA || esB) {
      sectionRow("City Stats (Eurostat)");
      metricRow("Unemployment", esA?.unemploymentPct ?? null, esB?.unemploymentPct ?? null, (v) => v.toFixed(1) + "%", false);
      metricRow("Median income", esA?.medianIncome ?? null, esB?.medianIncome ?? null, (v) => "\u20AC" + fmtNum(Math.round(v)), true);
      metricRow("Poverty rate", esA?.povertyPct ?? null, esB?.povertyPct ?? null, (v) => v.toFixed(1) + "%", false);
      metricRow("Tourist nights", esA?.touristNights ?? null, esB?.touristNights ?? null, (v) => fmtNum(v), true);
      metricRow("PM10", esA?.pm10 ?? null, esB?.pm10 ?? null, (v) => v.toFixed(1) + " \xB5g/m\xB3", false);
      metricRow("Green urban land", esA?.greenSpacePct ?? null, esB?.greenSpacePct ?? null, (v) => v.toFixed(1) + "%", true);
      metricRow("Median age", esA?.medianAge ?? null, esB?.medianAge ?? null, (v) => v.toFixed(1) + " yrs", null);
    }
    const csA = a.iso === "US" ? S.censusCities[a.qid] : null;
    const csB = b.iso === "US" ? S.censusCities[b.qid] : null;
    const crA = S.fbiCrimeData[a.qid], crB = S.fbiCrimeData[b.qid];
    if (csA || csB || crA || crB) {
      sectionRow("City Stats (US Census / FBI)");
      metricRow("Median income", csA?.medianIncome ?? null, csB?.medianIncome ?? null, (v) => "$" + fmtNum(Math.round(v)), true);
      metricRow("Poverty rate", csA?.povertyPct ?? null, csB?.povertyPct ?? null, (v) => v.toFixed(1) + "%", false);
      metricRow("Unemployment", csA?.unemploymentPct ?? null, csB?.unemploymentPct ?? null, (v) => v.toFixed(1) + "%", false);
      metricRow("Median home value", csA?.medianHomeValue ?? null, csB?.medianHomeValue ?? null, (v) => "$" + fmtNum(Math.round(v)), true);
      metricRow("Violent crime", crA?.violentPer100k ?? null, crB?.violentPer100k ?? null, (v) => v.toFixed(0) + "/100k", false);
      metricRow("Property crime", crA?.propertyPer100k ?? null, crB?.propertyPer100k ?? null, (v) => v.toFixed(0) + "/100k", false);
    }
    document.getElementById("compare-tbody").innerHTML = rows.join("");
  }
  function showLoading(visible, msg) {
    const overlay = document.getElementById("loading-overlay");
    const text = document.getElementById("loading-text");
    overlay.classList.toggle("visible", visible);
    if (visible && msg) text.textContent = msg;
    document.getElementById("loading-error").style.display = "none";
    text.style.display = "block";
  }
  function showLoadingError(msg) {
    document.getElementById("loading-error").textContent = "Error: " + msg;
    document.getElementById("loading-error").style.display = "block";
    document.getElementById("loading-text").style.display = "none";
  }
  function _saveBookmarks() {
    localStorage.setItem("wdm_bookmarks", JSON.stringify(Array.from(S._bookmarks)));
  }
  function toggleBookmark(qid) {
    if (S._bookmarks.has(qid)) S._bookmarks.delete(qid);
    else S._bookmarks.add(qid);
    _saveBookmarks();
    var btn = document.querySelector(".bm-toggle");
    if (btn) btn.textContent = S._bookmarks.has(qid) ? "\u2605" : "\u2606";
    if (document.getElementById("bookmarks-panel").classList.contains("visible")) renderBookmarksPanel();
    var fab = document.getElementById("bookmarks-fab");
    if (fab) fab.textContent = S._bookmarks.size ? "\u2605 Saved (" + S._bookmarks.size + ")" : "\u2606 Saved";
  }
  function toggleBookmarksPanel() {
    var panel = document.getElementById("bookmarks-panel");
    var visible = panel.classList.contains("visible");
    panel.classList.toggle("visible");
    if (!visible) renderBookmarksPanel();
  }
  function renderBookmarksPanel() {
    var body = document.getElementById("bookmarks-body");
    if (!S._bookmarks.size) {
      body.innerHTML = '<div style="padding:16px;color:var(--text-secondary);text-align:center;font-size:0.8rem">No saved cities yet.<br>Click \u2606 on a city to save it.</div>';
      return;
    }
    var html = "";
    S._bookmarks.forEach(function(qid) {
      var city = S.cityByQid.get(qid);
      if (!city) return;
      html += '<div class="bm-item" onclick="map.flyTo([' + city.lat + "," + city.lng + "],8);openWikiSidebar('" + escAttr(qid) + "','" + escAttr(city.name) + `')"><span class="bm-name">` + escHtml(city.name) + '</span><span class="bm-meta">' + escHtml(city.country || "") + (city.pop ? " \xB7 " + fmtPop(city.pop) : "") + `</span><button class="bm-rm" onclick="event.stopPropagation();toggleBookmark('` + escAttr(qid) + `')" title="Remove">\u2715</button></div>`;
    });
    body.innerHTML = html;
  }
  function openCountryCompare(iso2) {
    closeCountryPanel();
    document.getElementById("wiki-sidebar").classList.remove("open");
    if (typeof closeComparePanel === "function") closeComparePanel();
    S._ccIsoA = iso2;
    S._ccIsoB = null;
    const panel = document.getElementById("country-compare-panel");
    panel.classList.add("visible");
    _mobileBackdropOn();
    const cd = S.countryData[iso2];
    document.getElementById("cc-col-a").textContent = cd ? cd.name : iso2;
    document.getElementById("cc-col-b").textContent = "\u2014";
    document.getElementById("cc-tbody").innerHTML = "";
    document.getElementById("cc-search-input").value = "";
    document.getElementById("cc-search-results").innerHTML = "";
    setTimeout(() => document.getElementById("cc-search-input").focus(), 50);
  }
  function closeCountryCompare() {
    document.getElementById("country-compare-panel").classList.remove("visible");
    _mobileBackdropOff();
    S._ccIsoA = null;
    S._ccIsoB = null;
  }
  function _renderCountryComparison() {
    if (!S._ccIsoA || !S._ccIsoB) return;
    const a = S.countryData[S._ccIsoA], b = S.countryData[S._ccIsoB];
    if (!a || !b) return;
    document.getElementById("cc-col-a").innerHTML = isoToFlag(S._ccIsoA) + " " + escHtml(a.name);
    document.getElementById("cc-col-b").innerHTML = isoToFlag(S._ccIsoB) + " " + escHtml(b.name);
    const rows = [];
    function metricRow(label, va, vb, fmt, higherBetter, unit) {
      unit = unit || "";
      if (va == null && vb == null) return;
      const fva = va != null ? fmt(va) + unit : "\u2014";
      const fvb = vb != null ? fmt(vb) + unit : "\u2014";
      let clsA = "", clsB = "";
      if (va != null && vb != null && va !== vb && higherBetter != null) {
        if (higherBetter) {
          clsA = va > vb ? "cmp-better" : "cmp-worse";
          clsB = vb > va ? "cmp-better" : "cmp-worse";
        } else {
          clsA = va < vb ? "cmp-better" : "cmp-worse";
          clsB = vb < va ? "cmp-better" : "cmp-worse";
        }
      }
      rows.push('<tr><td class="cmp-metric">' + escHtml(label) + '</td><td class="cmp-val ' + clsA + '">' + fva + '</td><td class="cmp-val ' + clsB + '">' + fvb + "</td></tr>");
    }
    function sectionRow(label) {
      rows.push('<tr class="cmp-section"><td colspan="3">' + label + "</td></tr>");
    }
    const f1 = (v) => v.toFixed(1);
    const f0 = (v) => fmtNum(Math.round(v));
    const fDol = (v) => "$" + fmtNum(Math.round(v));
    const fPct = (v) => v.toFixed(1) + "%";
    sectionRow("Economy");
    metricRow("GDP per capita", a.gdp_per_capita, b.gdp_per_capita, fDol, true);
    metricRow("Population", a.population, b.population, (v) => _cpFmt(v, 1), true);
    metricRow("CPI Inflation", a.cpi_inflation, b.cpi_inflation, fPct, false);
    metricRow("Unemployment", a.unemployment_rate, b.unemployment_rate, fPct, false);
    metricRow("Govt Debt/GDP", a.govt_debt_gdp, b.govt_debt_gdp, (v) => v.toFixed(0) + "%", false);
    metricRow("Fiscal Balance", a.fiscal_balance_gdp, b.fiscal_balance_gdp, (v) => (v >= 0 ? "+" : "") + v.toFixed(1) + "%", true);
    metricRow("Bond yield 10Y", a.bond_yield_10y, b.bond_yield_10y, (v) => v.toFixed(2) + "%", null);
    sectionRow("Human Development");
    metricRow("HDI", a.hdi, b.hdi, (v) => v.toFixed(3), true);
    metricRow("Life expectancy", a.life_expectancy, b.life_expectancy, (v) => v.toFixed(1) + " yrs", true);
    metricRow("Happiness (WHR)", a.whr_score, b.whr_score, f1, true);
    metricRow("Freedom House", a.fh_score, b.fh_score, (v) => v + "/100", true);
    metricRow("Corruption (TI)", a.ti_cpi_score, b.ti_cpi_score, (v) => v + "/100", true);
    sectionRow("Health (WHO)");
    metricRow("Healthy life exp", a.who_hale, b.who_hale, (v) => v.toFixed(1) + " yrs", true);
    metricRow("UHC index", a.who_uhc_index, b.who_uhc_index, f0, true);
    metricRow("Obesity", a.who_obesity, b.who_obesity, fPct, false);
    metricRow("Physicians/10k", a.who_physicians, b.who_physicians, f1, true);
    metricRow("Health spend/cap", a.who_health_spend_pc, b.who_health_spend_pc, fDol, true);
    sectionRow("Trade & Investment");
    metricRow("Trade/GDP", a.trade_pct_gdp, b.trade_pct_gdp, (v) => v.toFixed(0) + "%", null);
    metricRow("Exports/GDP", a.exports_pct_gdp, b.exports_pct_gdp, fPct, null);
    metricRow("FDI inflows/GDP", a.fdi_inflow_gdp, b.fdi_inflow_gdp, fPct, true);
    sectionRow("Energy & Environment");
    metricRow("CO\u2082 per capita", a.co2_per_capita, b.co2_per_capita, (v) => v.toFixed(1) + " t", false);
    metricRow("CO\u2082 total", a.co2_total_mt, b.co2_total_mt, (v) => v.toFixed(0) + " Mt", false);
    metricRow("Renewable energy", a.renewable_energy_pct, b.renewable_energy_pct, fPct, true);
    if (a.energy_coal_pct != null || b.energy_coal_pct != null) {
      metricRow("Wind & Solar", a.energy_wind_solar_pct, b.energy_wind_solar_pct, fPct, true);
      metricRow("Coal", a.energy_coal_pct, b.energy_coal_pct, fPct, false);
      metricRow("Nuclear", a.energy_nuclear_pct, b.energy_nuclear_pct, fPct, null);
    }
    sectionRow("Culture & Risk");
    metricRow("UNESCO sites", a.unesco_total, b.unesco_total, f0, true);
    metricRow("INFORM Risk", a.inform_risk, b.inform_risk, f1, false);
    const oA = S.oecdData[S._ccIsoA], oB = S.oecdData[S._ccIsoB];
    if (oA || oB) {
      sectionRow("OECD");
      metricRow("Avg wage", oA?.avg_wage_usd ?? null, oB?.avg_wage_usd ?? null, fDol, true);
      metricRow("R&D spend", oA?.rd_spend_pct ?? null, oB?.rd_spend_pct ?? null, fPct, true);
      metricRow("Hours worked/yr", oA?.hours_worked ?? null, oB?.hours_worked ?? null, f0, false);
      metricRow("Tertiary edu", oA?.tertiary_pct ?? null, oB?.tertiary_pct ?? null, fPct, true);
      metricRow("Gender pay gap", oA?.gender_pay_gap ?? null, oB?.gender_pay_gap ?? null, fPct, false);
      metricRow("Youth unemployment", oA?.youth_unemployment ?? null, oB?.youth_unemployment ?? null, fPct, false);
      metricRow("Life satisfaction", oA?.life_satisfaction ?? null, oB?.life_satisfaction ?? null, (v) => v.toFixed(1) + "/10", true);
    }
    if (a.wgi_rule_of_law != null || b.wgi_rule_of_law != null) {
      sectionRow("Governance (WGI)");
      metricRow("Rule of Law", a.wgi_rule_of_law, b.wgi_rule_of_law, f1, true);
      metricRow("Anti-Corruption", a.wgi_corruption, b.wgi_corruption, f1, true);
      metricRow("Govt Effectiveness", a.wgi_govt_effectiveness, b.wgi_govt_effectiveness, f1, true);
      metricRow("Voice & Accountability", a.wgi_voice_accountability, b.wgi_voice_accountability, f1, true);
    }
    if (a.military_spend_gdp != null || b.military_spend_gdp != null || a.gpi_score != null || b.gpi_score != null) {
      sectionRow("Peace & Security");
      metricRow("Military spend", a.military_spend_gdp, b.military_spend_gdp, (v) => v.toFixed(1) + "% GDP", null);
      metricRow("Peace index (GPI)", a.gpi_score, b.gpi_score, (v) => v.toFixed(2), false);
      metricRow("Press freedom", a.press_freedom_score, b.press_freedom_score, f1, false);
    }
    if (a.inet_download_mbps != null || b.inet_download_mbps != null) {
      sectionRow("Digital Infrastructure");
      metricRow("Download speed", a.inet_download_mbps, b.inet_download_mbps, (v) => v.toFixed(0) + " Mbps", true);
      metricRow("Upload speed", a.inet_upload_mbps, b.inet_upload_mbps, (v) => v.toFixed(0) + " Mbps", true);
      metricRow("Mobile speed", a.inet_mobile_mbps, b.inet_mobile_mbps, (v) => v.toFixed(0) + " Mbps", true);
    }
    if (a.pop_growth != null || b.pop_growth != null) {
      sectionRow("Demographics & Environment");
      metricRow("Pop growth", a.pop_growth, b.pop_growth, (v) => (v >= 0 ? "+" : "") + v.toFixed(2) + "%", null);
      metricRow("Net migration", a.net_migration, b.net_migration, (v) => (v > 0 ? "+" : "") + Math.round(v).toLocaleString(), null);
      metricRow("Migrant stock", a.migrant_stock, b.migrant_stock, (v) => v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? (v / 1e3).toFixed(0) + "k" : String(v), null);
      metricRow("Female labor", a.female_labor_pct, b.female_labor_pct, fPct, true);
      metricRow("Safe water", a.safe_water_pct, b.safe_water_pct, fPct, true);
      metricRow("Forest area", a.forest_pct, b.forest_pct, fPct, true);
      metricRow("Research articles", a.research_articles, b.research_articles, (v) => Math.round(v).toLocaleString(), true);
    }
    document.getElementById("cc-tbody").innerHTML = rows.join("");
  }
  var PAGE_SIZE, _worldGeoLoader, _eurostatLoader, _companiesLoader, _companiesDetailLoader, _univLoader, _noaaLoader, _airportLoader, _aqLoader, _metroLoader, _nobelLoader, _powerLoader, _informLoader, _gtdLoader, _cryptoLoader, _URL_TO_KDB, POP_SCALE, tradeCache, countryCentroids, admin1Cache, LS_FX_KEY, LS_EDITS, LS_DELETED, IMG_EXCLUDE, STATS_WIN, VALID_SIDEBAR_TABS, STAT_DEFS, CITY_STAT_DEFS, WB_STAT_DEFS, CORP_STAT_DEFS, EUROSTAT_STAT_DEFS, JAPAN_PREF_STAT_DEFS, ADMIN_TO_NUTS2, SINGLE_NUTS2, _errorTileDataUrl, _terrainFallbackActive, _hashUpdateTimer, ISO2_TO_BEA, LS_TRADE_PREFIX, LS_TRADE_TTL, _nationsPanelOpen, _PLATE_NAMES, _aircraftMoveHandler, _wildfireMoveHandler, GCORP_PAGE;
  var init_app_legacy = __esm({
    "src/app-legacy.js"() {
      init_utils();
      init_state();
      init_constants();
      init_choro_defs();
      init_stat_defs();
      init_viz_defs();
      PAGE_SIZE = 100;
      _worldGeoLoader = createLazyLoader(
        "/world-countries.json",
        (d) => {
          S.worldGeo = d;
          _computeCountryCentroids();
        }
      );
      _eurostatLoader = createLazyLoader(
        "/eurostat-cities.json",
        (d) => {
          S.eurostatCities = d;
        },
        () => S._filterAvail.eurostat
      );
      _companiesLoader = createLazyLoader(
        "/companies-index.json",
        (d) => {
          S.companiesData = d;
        }
      );
      _companiesDetailLoader = createLazyLoader(
        "/companies-detail.json",
        (d) => {
          S.companiesDetailData = d;
        }
      );
      _univLoader = createLazyLoader(
        "/universities.json",
        (d) => {
          S.universitiesData = d;
        },
        () => S._filterAvail.universities || S._filterValue.universities !== null || S._heatmapMetric === "universities"
      );
      _noaaLoader = createLazyLoader(
        "/noaa-climate.json",
        (d) => {
          S.noaaClimate = d;
        }
      );
      _airportLoader = createLazyLoader(
        "/airport-connectivity.json",
        (d) => {
          S.airportData = d;
        },
        () => S._filterAvail.airport
      );
      _aqLoader = createLazyLoader(
        "/who-airquality.json",
        (d) => {
          S.airQualityData = d;
        },
        () => S._filterAvail.airQuality || S._filterValue.aq !== null || S._heatmapMetric === "aq"
      );
      _metroLoader = createLazyLoader(
        "/metro-transit.json",
        (d) => {
          S.metroTransitData = d;
        },
        () => S._filterAvail.metro || S._filterValue.metro !== null || S._heatmapMetric === "metro"
      );
      _nobelLoader = createLazyLoader(
        "/nobel-cities.json",
        (d) => {
          S.nobelCitiesData = d;
        },
        () => S._filterAvail.nobel || S._filterValue.nobel !== null || S._heatmapMetric === "nobel"
      );
      _powerLoader = createLazyLoader(
        "/power_by_city.json",
        (d) => {
          S.powerData = d;
        }
      );
      _informLoader = createLazyLoader(
        "/inform_risk.json",
        (d) => {
          S.informRisk = d;
        }
      );
      _gtdLoader = createLazyLoader(
        "/terrorism-incidents-lite.json",
        (d) => {
          S.gtdSummary = d;
        }
      );
      _cryptoLoader = createLazyLoader(
        "/crypto-stats-lite.json",
        (d) => {
          S.cryptoSummary = d;
        }
      );
      _URL_TO_KDB = {
        "aircraft-live-lite": "aircraft-live",
        "crypto-stats-lite": "crypto-stats",
        "eonet-events-lite": "eonet-events",
        "flightaware-flights-lite": "flightaware-flights",
        "military-strength-lite": "military-strength",
        "ocean-currents-lite": "ocean-currents",
        "passport-rank-lite": "passport-rank",
        "satellites-live-lite": "satellites-live",
        "ships-live-lite": "ships-live",
        "solar-weather-lite": "solar-weather",
        "terrorism-incidents-lite": "terrorism-incidents",
        "unesco-ich-lite": "unesco-ich",
        "wildfires-live-lite": "wildfires-live",
        "who-airquality": "who-airquality"
      };
      POP_SCALE = { min: 3, max: 8 };
      tradeCache = {};
      countryCentroids = {};
      admin1Cache = {};
      S.fxRates = { ...FX_TO_USD };
      LS_FX_KEY = "fx_rates_v2";
      LS_EDITS = "wcm_edits";
      LS_DELETED = "wcm_deleted";
      document.getElementById("edit-modal").addEventListener("click", function(e) {
        if (e.target === this) closeModal();
      });
      document.getElementById("wiki-lightbox").addEventListener("click", function(e) {
        if (e.target === this) closeLightbox();
      });
      document.addEventListener("keydown", function(e) {
        const lb = document.getElementById("wiki-lightbox");
        if (!lb.classList.contains("open")) return;
        if (e.key === "ArrowLeft") lightboxNav(-1);
        if (e.key === "ArrowRight") lightboxNav(1);
        if (e.key === "Escape") closeLightbox();
      });
      IMG_EXCLUDE = /flag|coat|coa_|locator|location_map|location S.map|icon|emblem|seal|logo|banner|signature|blank|symbol|layout|streets|district|wikisource|wikidata|commons-logo|silhouette|\.svg$/i;
      STATS_WIN = 12;
      VALID_SIDEBAR_TABS = /* @__PURE__ */ new Set(["info", "economy", "finance", "overview"]);
      STAT_DEFS = {
        medianIncome: { label: "Median Income", src: "acs", key: "medianIncome", fmt: (v) => "$" + fmtNum(Math.round(v)), higherBetter: true },
        povertyPct: { label: "Poverty Rate", src: "acs", key: "povertyPct", fmt: (v) => v.toFixed(1) + "%", higherBetter: false },
        unemploymentPct: { label: "Unemployment Rate", src: "acs", key: "unemploymentPct", fmt: (v) => v.toFixed(1) + "%", higherBetter: false },
        rentBurdenedPct: { label: "Rent-Burdened", src: "acs", key: "rentBurdenedPct", fmt: (v) => v.toFixed(1) + "%", higherBetter: false },
        medianRent: { label: "Median Rent", src: "acs", key: "medianRent", fmt: (v) => "$" + fmtNum(Math.round(v)) + "/mo", higherBetter: null },
        medianHomeValue: { label: "Median Home Value", src: "acs", key: "medianHomeValue", fmt: (v) => "$" + fmtNum(Math.round(v)), higherBetter: null },
        gini: { label: "Gini Index", src: "acs", key: "gini", fmt: (v) => v.toFixed(3), higherBetter: false },
        snapPct: { label: "SNAP Receipt", src: "acs", key: "snapPct", fmt: (v) => v.toFixed(1) + "%", higherBetter: false },
        bachelorPlusPct: { label: "College-Educated", src: "acs", key: "bachelorPlusPct", fmt: (v) => v.toFixed(1) + "%", higherBetter: true },
        transitPct: { label: "Transit Use", src: "acs", key: "transitPct", fmt: (v) => v.toFixed(1) + "%", higherBetter: null },
        medianAge: { label: "Median Age", src: "acs", key: "medianAge", fmt: (v) => v.toFixed(0) + " yr", higherBetter: null },
        ownerOccPct: { label: "Homeownership Rate", src: "acs", key: "ownerOccPct", fmt: (v) => v.toFixed(1) + "%", higherBetter: null },
        totalEstab: { label: "Total Establishments", src: "biz", key: (d) => d.cbp?.total?.estab, fmt: (v) => fmtNum(v), higherBetter: null },
        totalPayroll: { label: "Total Payroll/yr", src: "biz", key: (d) => d.cbp?.total?.payann, fmt: (v) => "$" + fmtRevenue(v * 1e3), higherBetter: null },
        mfgShare: { label: "Manufacturing Share", src: "biz", key: (d) => {
          const t = d.cbp?.total?.estab, m = d.cbp?.manufacturing?.estab;
          return t && m ? m / t * 100 : null;
        }, fmt: (v) => v.toFixed(1) + "%", higherBetter: null },
        popGrowthPct: { label: "Population Growth", src: "biz", key: (d) => d.popTrend?.growthPct, fmt: (v) => (v >= 0 ? "+" : "") + v.toFixed(1) + "%", higherBetter: true },
        selfEmplPct: { label: "Self-Employment Rate", src: "biz", key: (d) => {
          const p = d.selfEmpl?.selfEmplPct;
          return p != null && p < 35 ? p : null;
        }, fmt: (v) => v.toFixed(1) + "%", higherBetter: null }
      };
      CITY_STAT_DEFS = {
        pop: { label: "City Population", key: (c) => c.pop, fmt: (v) => fmtNum(v), higherBetter: null },
        pop_metro: { label: "Metro Population", key: (c) => c.pop_metro, fmt: (v) => fmtNum(v), higherBetter: null },
        area_km2: { label: "City Area", key: (c) => c.area_km2, fmt: (v) => fmtNum(Math.round(v)) + " km\xB2", higherBetter: null },
        density: { label: "Pop. Density", key: (c) => c.pop && c.area_km2 ? Math.round(c.pop / c.area_km2) : null, fmt: (v) => fmtNum(v) + "/km\xB2", higherBetter: null },
        elev_m: { label: "Elevation", key: (c) => c.elev_m, fmt: (v) => fmtNum(Math.round(v)) + " m", higherBetter: null },
        founded: { label: "Year Founded", key: (c) => c.founded, fmt: (v) => v < 0 ? Math.abs(v) + " BC" : String(v), higherBetter: false },
        gawc_score: {
          label: "GaWC World City Rank",
          key: (c) => S.gawcCities[c.qid]?.score ?? null,
          fmt: (v) => {
            const tier = Object.entries(GAWC_TIER_SCORE).find(([, s]) => s === v)?.[0] || "";
            return tier;
          },
          higherBetter: true
        },
        directDestinations: {
          label: "Direct Air Destinations",
          key: (c) => S.airportData[c.qid]?.directDestinations ?? null,
          fmt: (v) => fmtNum(v) + " airports",
          higherBetter: true
        },
        who_pm25: {
          label: "PM2.5 Air Quality (WHO)",
          key: (c) => S.airQualityData[c.qid]?.pm25 ?? null,
          fmt: (v) => v.toFixed(1) + " \u03BCg/m\xB3",
          higherBetter: false
        },
        fbi_violentPer100k: {
          label: "Violent Crime Rate (FBI)",
          key: (c) => S.fbiCrimeData[c.qid]?.violentPer100k ?? null,
          fmt: (v) => v.toFixed(0) + "/100k",
          higherBetter: false
        },
        fbi_propertyPer100k: {
          label: "Property Crime Rate (FBI)",
          key: (c) => S.fbiCrimeData[c.qid]?.propertyPer100k ?? null,
          fmt: (v) => v.toFixed(0) + "/100k",
          higherBetter: false
        },
        zhvi: {
          label: "Home Value (Zillow ZHVI)",
          key: (c) => S.zillowData[c.qid]?.zhvi ?? null,
          fmt: (v) => "$" + fmtNum(Math.round(v)),
          higherBetter: null
        },
        zori: {
          label: "Rent Index (Zillow ZORI)",
          key: (c) => S.zillowData[c.qid]?.zori ?? null,
          fmt: (v) => "$" + fmtNum(Math.round(v)) + "/mo",
          higherBetter: null
        },
        annualAvgTemp: {
          label: "Annual Avg Temperature",
          key: (c) => {
            const a = climateAnnual(getCityClimate(c));
            return a ? a.avgTemp : null;
          },
          fmt: (v) => v.toFixed(1) + "\xB0C",
          higherBetter: null
        },
        annualPrecipMm: {
          label: "Annual Precipitation",
          key: (c) => {
            const a = climateAnnual(getCityClimate(c));
            return a ? a.precipMm : null;
          },
          fmt: (v) => fmtNum(Math.round(v)) + " mm",
          higherBetter: null
        },
        annualSunHours: {
          label: "Annual Sunshine Hours",
          key: (c) => {
            const a = climateAnnual(getCityClimate(c));
            return a?.sunHours ?? null;
          },
          fmt: (v) => fmtNum(Math.round(v)) + " hrs",
          higherBetter: null
        },
        hottestMonthTemp: {
          label: "Hottest Month Avg \xB0C",
          key: (c) => {
            const a = climateAnnual(getCityClimate(c));
            return a ? a.hottestTemp : null;
          },
          fmt: (v) => v.toFixed(1) + "\xB0C",
          higherBetter: null
        },
        coldestMonthTemp: {
          label: "Coldest Month Avg \xB0C",
          key: (c) => {
            const a = climateAnnual(getCityClimate(c));
            return a ? a.coldestTemp : null;
          },
          fmt: (v) => v.toFixed(1) + "\xB0C",
          higherBetter: null
        },
        metroStations: {
          label: "Metro Stations",
          key: (c) => S.metroTransitData[c.qid]?.stations ?? null,
          fmt: (v) => fmtNum(v) + " stations",
          higherBetter: true
        },
        nobelLaureates: {
          label: "Nobel Laureates",
          key: (c) => S.nobelCitiesData[c.qid]?.total ?? null,
          fmt: (v) => String(v),
          higherBetter: true
        },
        port_teu: {
          label: "Port TEU (millions)",
          key: (c) => S.portData[c.qid]?.teu_millions ?? null,
          fmt: (v) => v + "M TEU",
          higherBetter: true
        },
        tourism_visitors: {
          label: "Tourism Visitors (millions)",
          key: (c) => S.tourismData[c.qid]?.visitors_millions ?? null,
          fmt: (v) => v + "M visitors",
          higherBetter: true
        },
        patents_annual: {
          label: "Patents per Year",
          key: (c) => S.patentData[c.qid]?.patents_annual ?? null,
          fmt: (v) => fmtNum(v) + " patents",
          higherBetter: true
        },
        metro_ridership: {
          label: "Metro Ridership (millions)",
          key: (c) => S.metroData[c.qid]?.ridership_millions ?? null,
          fmt: (v) => fmtNum(v) + "M riders/yr",
          higherBetter: true
        },
        col_index: {
          label: "Cost of Living Index",
          key: (c) => S.colData[c.qid]?.col_index ?? null,
          fmt: (v) => v + " (NYC=100)",
          higherBetter: null
        },
        startup_unicorns: {
          label: "Unicorn Startups",
          key: (c) => S.startupData[c.qid]?.unicorns ?? null,
          fmt: (v) => v + " unicorns",
          higherBetter: true
        },
        startup_funding: {
          label: "VC Funding ($B)",
          key: (c) => S.startupData[c.qid]?.total_funding_bn ?? null,
          fmt: (v) => "$" + v + "B",
          higherBetter: true
        }
      };
      WB_STAT_DEFS = {
        wb_gdp_per_capita: { label: "GDP per Capita", key: "gdp_per_capita", fmt: (v) => "$" + Math.round(v).toLocaleString(), higherBetter: true },
        wb_life_expectancy: { label: "Life Expectancy", key: "life_expectancy", fmt: (v) => v.toFixed(1) + " yrs", higherBetter: true },
        wb_urban_pct: { label: "Urban Population", key: "urban_pct", fmt: (v) => v.toFixed(1) + "%", higherBetter: null },
        wb_internet_pct: { label: "Internet Access", key: "internet_pct", fmt: (v) => v.toFixed(1) + "%", higherBetter: true },
        wb_gini: { label: "Gini Coefficient", key: "gini", fmt: (v) => v.toFixed(1), higherBetter: false },
        wb_literacy_rate: { label: "Literacy Rate", key: "literacy_rate", fmt: (v) => v.toFixed(1) + "%", higherBetter: true },
        wb_child_mortality: { label: "Child Mortality", key: "child_mortality", fmt: (v) => v.toFixed(1) + "/1k", higherBetter: false },
        wb_electricity_pct: { label: "Electricity Access", key: "electricity_pct", fmt: (v) => v.toFixed(1) + "%", higherBetter: true },
        wb_pm25: { label: "PM2.5 Air Pollution", key: "pm25", fmt: (v) => v.toFixed(1) + " \u03BCg/m\xB3", higherBetter: false },
        wb_forest_pct: { label: "Forest Cover", key: "forest_pct", fmt: (v) => v.toFixed(1) + "%", higherBetter: null },
        wb_air_death_rate: { label: "Air Pollution Mortality", key: "air_death_rate", fmt: (v) => v.toFixed(1) + "/100k", higherBetter: false },
        wb_road_death_rate: { label: "Road Traffic Mortality", key: "road_death_rate", fmt: (v) => v.toFixed(1) + "/100k", higherBetter: false },
        wb_govt_debt_gdp: { label: "Govt Debt (% GDP)", key: "govt_debt_gdp", fmt: (v) => v.toFixed(1) + "%", higherBetter: false },
        wb_fiscal_balance_gdp: { label: "Fiscal Balance (% GDP)", key: "fiscal_balance_gdp", fmt: (v) => v.toFixed(1) + "%", higherBetter: true },
        wb_cpi_inflation: { label: "CPI Inflation", key: "cpi_inflation", fmt: (v) => v.toFixed(1) + "%", higherBetter: false },
        wb_unemployment_rate: { label: "Unemployment Rate", key: "unemployment_rate", fmt: (v) => v.toFixed(1) + "%", higherBetter: false },
        wb_bond_yield_10y: { label: "10-Year Bond Yield", key: "bond_yield_10y", fmt: (v) => v.toFixed(2) + "%", higherBetter: null },
        // Human Development
        wb_hdi: { label: "Human Development Index", key: "hdi", fmt: (v) => v.toFixed(3), higherBetter: true },
        wb_renewable_energy_pct: { label: "Renewable Energy (%)", key: "renewable_energy_pct", fmt: (v) => v.toFixed(1) + "%", higherBetter: true },
        wb_health_spend_gdp: { label: "Healthcare Spending (% GDP)", key: "health_spend_gdp", fmt: (v) => v.toFixed(1) + "%", higherBetter: null },
        wb_education_spend_gdp: { label: "Education Spending (% GDP)", key: "education_spend_gdp", fmt: (v) => v.toFixed(1) + "%", higherBetter: null },
        // Governance & Transparency (WGI: raw -2.5 to +2.5, stored as-is)
        wb_wgi_rule_of_law: { label: "Rule of Law", key: "wgi_rule_of_law", fmt: (v) => v.toFixed(2), higherBetter: true },
        wb_wgi_corruption: { label: "Control of Corruption", key: "wgi_corruption", fmt: (v) => v.toFixed(2), higherBetter: true },
        wb_wgi_govt_effectiveness: { label: "Govt Effectiveness", key: "wgi_govt_effectiveness", fmt: (v) => v.toFixed(2), higherBetter: true },
        wb_wgi_voice_accountability: { label: "Voice & Accountability", key: "wgi_voice_accountability", fmt: (v) => v.toFixed(2), higherBetter: true },
        wb_wgi_political_stability: { label: "Political Stability", key: "wgi_political_stability", fmt: (v) => v.toFixed(2), higherBetter: true },
        wb_wgi_regulatory_quality: { label: "Regulatory Quality", key: "wgi_regulatory_quality", fmt: (v) => v.toFixed(2), higherBetter: true },
        // Transparency & Freedom (TI CPI / Freedom House)
        wb_ti_cpi: { label: "Corruption Index (TI CPI)", key: "ti_cpi_score", fmt: (v) => v.toFixed(0) + "/100", higherBetter: true },
        wb_fh_score: { label: "Freedom Score (FH)", key: "fh_score", fmt: (v) => v.toFixed(0) + "/100", higherBetter: true },
        // Happiness (WHR 2024)
        wb_whr_score: { label: "Happiness Score (WHR)", key: "whr_score", fmt: (v) => v.toFixed(3), higherBetter: true },
        wb_whr_gdp: { label: "GDP Contribution (WHR)", key: "whr_gdp", fmt: (v) => v.toFixed(3), higherBetter: true },
        wb_whr_social: { label: "Social Support (WHR)", key: "whr_social", fmt: (v) => v.toFixed(3), higherBetter: true },
        wb_whr_health: { label: "Life Expectancy (WHR)", key: "whr_health", fmt: (v) => v.toFixed(3), higherBetter: true },
        wb_whr_freedom: { label: "Freedom (WHR)", key: "whr_freedom", fmt: (v) => v.toFixed(3), higherBetter: true },
        wb_whr_generosity: { label: "Generosity (WHR)", key: "whr_generosity", fmt: (v) => v.toFixed(3), higherBetter: true },
        wb_whr_corruption: { label: "Low Corruption (WHR)", key: "whr_corruption", fmt: (v) => v.toFixed(3), higherBetter: true },
        // Central Bank
        wb_cb_rate: { label: "Central Bank Policy Rate", key: "cb_rate", fmt: (v) => v.toFixed(2) + "%", higherBetter: null },
        // Credit Ratings (numeric equivalents: AAA=21 ... D=0)
        wb_credit_sp: { label: "S&P Credit Rating", key: "credit_sp_num", fmt: function(v) {
          return S._numToCredit.sp[v] || v.toFixed(0);
        }, higherBetter: true },
        wb_credit_moodys: { label: "Moody's Credit Rating", key: "credit_moodys_num", fmt: function(v) {
          return S._numToCredit.moodys[v] || v.toFixed(0);
        }, higherBetter: true },
        wb_credit_fitch: { label: "Fitch Credit Rating", key: "credit_fitch_num", fmt: function(v) {
          return S._numToCredit.fitch[v] || v.toFixed(0);
        }, higherBetter: true },
        // Energy Mix (Ember / OWID)
        wb_energy_wind_solar_pct: { label: "Wind & Solar (%)", key: "energy_wind_solar_pct", fmt: (v) => v.toFixed(1) + "%", higherBetter: true },
        wb_energy_hydro_pct: { label: "Hydro (%)", key: "energy_hydro_pct", fmt: (v) => v.toFixed(1) + "%", higherBetter: null },
        wb_energy_nuclear_pct: { label: "Nuclear (%)", key: "energy_nuclear_pct", fmt: (v) => v.toFixed(1) + "%", higherBetter: null },
        wb_energy_gas_pct: { label: "Gas (%)", key: "energy_gas_pct", fmt: (v) => v.toFixed(1) + "%", higherBetter: false },
        wb_energy_coal_pct: { label: "Coal (%)", key: "energy_coal_pct", fmt: (v) => v.toFixed(1) + "%", higherBetter: false },
        eci: { label: "Economic Complexity Index", key: "eci", fmt: (v) => (v > 0 ? "+" : "") + v.toFixed(2), higherBetter: true, src: "eci" },
        wb_rd_spend_pct: { label: "R&D Spending", key: "rd_spend_pct", fmt: (v) => v.toFixed(1) + "%", higherBetter: true, src: "oecd" },
        wb_tax_revenue_pct: { label: "Tax Revenue (central)", key: "tax_revenue_pct", fmt: (v) => v.toFixed(1) + "%", higherBetter: null, src: "oecd" },
        wb_hours_worked: { label: "Hours Worked/Year", key: "hours_worked", fmt: (v) => Math.round(v) + " hrs", higherBetter: null, src: "oecd" },
        wb_tertiary_pct: { label: "Tertiary Education", key: "tertiary_pct", fmt: (v) => v.toFixed(1) + "%", higherBetter: true, src: "oecd" },
        wb_pisa_reading: { label: "PISA Reading Score", key: "pisa_reading", fmt: (v) => Math.round(v) + " pts", higherBetter: true, src: "oecd" },
        wb_min_wage_usd_ppp: { label: "Min Wage ($/hr PPP)", key: "min_wage_usd_ppp", fmt: (v) => "$" + v.toFixed(2) + "/hr", higherBetter: true, src: "oecd" },
        wb_avg_wage_usd: { label: "Average Wage ($/yr PPP)", key: "avg_wage_usd", fmt: (v) => "$" + Math.round(v).toLocaleString(), higherBetter: true, src: "oecd" },
        wb_labour_prod: { label: "Labour Productivity ($/hr)", key: "labour_productivity", fmt: (v) => "$" + v.toFixed(1) + "/hr", higherBetter: true, src: "oecd" },
        wb_gender_pay_gap: { label: "Gender Pay Gap (%)", key: "gender_pay_gap", fmt: (v) => v.toFixed(1) + "%", higherBetter: false, src: "oecd" },
        wb_social_spend_gdp: { label: "Social Spending (% GDP)", key: "social_spend_gdp", fmt: (v) => v.toFixed(1) + "%", higherBetter: null, src: "oecd" },
        wb_youth_unemployment: { label: "Youth Unemployment 15-24", key: "youth_unemployment", fmt: (v) => v.toFixed(1) + "%", higherBetter: false, src: "oecd" },
        wb_poverty_rate_oecd: { label: "Poverty Rate (50% median)", key: "poverty_rate_oecd", fmt: (v) => v.toFixed(1) + "%", higherBetter: false, src: "oecd" },
        oecd_house_price_income: { label: "House Price/Income Ratio", key: "house_price_income", fmt: (v) => v.toFixed(1), higherBetter: false, src: "oecd" },
        oecd_broadband_per100: { label: "Broadband per 100", key: "broadband_per100", fmt: (v) => v.toFixed(1) + "/100", higherBetter: true, src: "oecd" },
        oecd_employment_rate: { label: "Employment Rate 15-64", key: "employment_rate", fmt: (v) => v.toFixed(1) + "%", higherBetter: true, src: "oecd" },
        oecd_life_satisfaction: { label: "Life Satisfaction (0-10)", key: "life_satisfaction", fmt: (v) => v.toFixed(1), higherBetter: true, src: "oecd" },
        oecd_gini: { label: "Gini Coefficient (OECD)", key: "gini_oecd", fmt: (v) => v.toFixed(3), higherBetter: false, src: "oecd" },
        oecd_pension_spend: { label: "Pension Spend (% GDP)", key: "pension_spend_gdp", fmt: (v) => v.toFixed(1) + "%", higherBetter: null, src: "oecd" },
        // Trade & Investment (World Bank)
        wb_trade_pct_gdp: { label: "Trade (% GDP)", key: "trade_pct_gdp", fmt: (v) => v.toFixed(1) + "%", higherBetter: null },
        wb_current_account: { label: "Current Account (% GDP)", key: "current_account_gdp", fmt: (v) => (v >= 0 ? "+" : "") + v.toFixed(1) + "%", higherBetter: null },
        wb_fdi_inflow: { label: "FDI Inflows (% GDP)", key: "fdi_inflow_gdp", fmt: (v) => v.toFixed(1) + "%", higherBetter: true },
        wb_exports_pct_gdp: { label: "Exports (% GDP)", key: "exports_pct_gdp", fmt: (v) => v.toFixed(1) + "%", higherBetter: true },
        wb_imports_pct_gdp: { label: "Imports (% GDP)", key: "imports_pct_gdp", fmt: (v) => v.toFixed(1) + "%", higherBetter: null },
        // Health (WHO GHO)
        wb_who_physicians: { label: "Physicians per 10k", key: "who_physicians", fmt: (v) => v.toFixed(1) + "/10k", higherBetter: true },
        wb_who_nurses: { label: "Nurses per 10k", key: "who_nurses", fmt: (v) => v.toFixed(1) + "/10k", higherBetter: true },
        wb_who_hospital_beds: { label: "Hospital Beds per 10k", key: "who_hospital_beds", fmt: (v) => v.toFixed(1) + "/10k", higherBetter: true },
        wb_who_immunization: { label: "DPT3 Immunization (%)", key: "who_immunization", fmt: (v) => v.toFixed(0) + "%", higherBetter: true },
        wb_who_maternal_mort: { label: "Maternal Mortality /100k", key: "who_maternal_mort", fmt: (v) => v.toFixed(0) + "/100k", higherBetter: false },
        wb_who_ncd_mortality: { label: "NCD Mortality 30-70 (%)", key: "who_ncd_mortality", fmt: (v) => v.toFixed(1) + "%", higherBetter: false },
        // Health System extended (WHO GHO)
        wb_who_uhc_index: { label: "UHC Coverage Index", key: "who_uhc_index", fmt: (v) => v.toFixed(0), higherBetter: true },
        wb_who_hale: { label: "Healthy Life Expectancy", key: "who_hale", fmt: (v) => v.toFixed(1) + " yrs", higherBetter: true },
        wb_who_health_spend_pc: { label: "Health Spend per Capita", key: "who_health_spend_pc", fmt: (v) => "$" + fmtNum(Math.round(v)), higherBetter: null },
        wb_who_oop_spend: { label: "Out-of-Pocket Health %", key: "who_oop_spend", fmt: (v) => v.toFixed(1) + "%", higherBetter: false },
        // Disease Burden (WHO GHO)
        wb_who_tb_incidence: { label: "TB Incidence /100k", key: "who_tb_incidence", fmt: (v) => v.toFixed(0) + "/100k", higherBetter: false },
        wb_who_hiv_prevalence: { label: "HIV Prevalence 15-49 (%)", key: "who_hiv_prevalence", fmt: (v) => v.toFixed(2) + "%", higherBetter: false },
        wb_who_malaria_incidence: { label: "Malaria Incidence /1k", key: "who_malaria_incidence", fmt: (v) => v.toFixed(1) + "/1k", higherBetter: false },
        wb_who_hepb_prevalence: { label: "Hepatitis B (%)", key: "who_hepb_prevalence", fmt: (v) => v.toFixed(2) + "%", higherBetter: false },
        // Lifestyle (WHO GHO)
        wb_who_obesity: { label: "Obesity Prevalence (%)", key: "who_obesity", fmt: (v) => v.toFixed(1) + "%", higherBetter: false },
        wb_who_tobacco: { label: "Tobacco Use 15+ (%)", key: "who_tobacco", fmt: (v) => v.toFixed(1) + "%", higherBetter: false },
        wb_who_alcohol: { label: "Alcohol Consumption (L/cap)", key: "who_alcohol", fmt: (v) => v.toFixed(1) + " L", higherBetter: null },
        wb_who_physical_inactivity: { label: "Physical Inactivity (%)", key: "who_physical_inactivity", fmt: (v) => v.toFixed(1) + "%", higherBetter: false },
        // CO₂ Emissions (Global Carbon Project)
        wb_co2_total: { label: "CO\u2082 Emissions (Mt)", key: "co2_total_mt", fmt: (v) => v.toLocaleString() + " Mt", higherBetter: false },
        wb_co2_per_capita: { label: "CO\u2082 per Capita (t)", key: "co2_per_capita", fmt: (v) => v.toFixed(1) + " t", higherBetter: false },
        wb_co2_coal_pct: { label: "CO\u2082 from Coal (%)", key: "co2_coal_pct", fmt: (v) => v + "%", higherBetter: false },
        wb_co2_oil_pct: { label: "CO\u2082 from Oil (%)", key: "co2_oil_pct", fmt: (v) => v + "%", higherBetter: null },
        wb_co2_gas_pct: { label: "CO\u2082 from Gas (%)", key: "co2_gas_pct", fmt: (v) => v + "%", higherBetter: null },
        wb_co2_cement_pct: { label: "CO\u2082 from Cement (%)", key: "co2_cement_pct", fmt: (v) => v + "%", higherBetter: false },
        // UNESCO
        wb_unesco_total: { label: "UNESCO WH Sites", key: "unesco_total", fmt: (v) => v + " sites", higherBetter: true },
        // INFORM Risk
        wb_inform_risk: { label: "INFORM Risk Index", key: "inform_risk", fmt: (v) => v.toFixed(1) + "/10", higherBetter: false },
        wb_inform_hazard: { label: "Hazard & Exposure", key: "inform_hazard", fmt: (v) => v.toFixed(1) + "/10", higherBetter: false },
        wb_inform_vulnerability: { label: "Vulnerability", key: "inform_vulnerability", fmt: (v) => v.toFixed(1) + "/10", higherBetter: false },
        wb_inform_coping: { label: "Lack of Coping Capacity", key: "inform_coping", fmt: (v) => v.toFixed(1) + "/10", higherBetter: false },
        // Peace & Security
        wb_military_spend_gdp: { label: "Military Spend (% GDP)", key: "military_spend_gdp", fmt: (v) => v.toFixed(1) + "%", higherBetter: null },
        wb_gpi_score: { label: "Global Peace Index", key: "gpi_score", fmt: (v) => v.toFixed(2), higherBetter: false },
        wb_press_freedom: { label: "Press Freedom Score", key: "press_freedom_score", fmt: (v) => v.toFixed(1), higherBetter: false },
        // Digital Infrastructure
        wb_inet_download: { label: "Download Speed", key: "inet_download_mbps", fmt: (v) => v.toFixed(0) + " Mbps", higherBetter: true },
        wb_inet_upload: { label: "Upload Speed", key: "inet_upload_mbps", fmt: (v) => v.toFixed(0) + " Mbps", higherBetter: true },
        wb_inet_mobile: { label: "Mobile Speed", key: "inet_mobile_mbps", fmt: (v) => v.toFixed(0) + " Mbps", higherBetter: true },
        // Demographics & Environment
        wb_pop_growth: { label: "Population Growth", key: "pop_growth", fmt: (v) => (v >= 0 ? "+" : "") + v.toFixed(2) + "%", higherBetter: null },
        wb_net_migration: { label: "Net Migration (5yr)", key: "net_migration", fmt: (v) => (v > 0 ? "+" : "") + Math.round(v).toLocaleString(), higherBetter: null },
        wb_migrant_stock: { label: "Migrant Stock", key: "migrant_stock", fmt: (v) => v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? (v / 1e3).toFixed(0) + "k" : String(v), higherBetter: null },
        wb_female_labor: { label: "Female Labor Force", key: "female_labor_pct", fmt: (v) => v.toFixed(1) + "%", higherBetter: true },
        wb_safe_water: { label: "Safe Drinking Water", key: "safe_water_pct", fmt: (v) => v.toFixed(1) + "%", higherBetter: true },
        wb_research_articles: { label: "Research Articles", key: "research_articles", fmt: (v) => Math.round(v).toLocaleString(), higherBetter: true },
        // Nuclear Energy
        wb_nuclear_reactors: { label: "Nuclear Reactors", key: "nuclear_reactors", fmt: (v) => v + " reactors", higherBetter: null },
        wb_nuclear_capacity: { label: "Nuclear Capacity", key: "nuclear_capacity_gw", fmt: (v) => v.toFixed(1) + " GW", higherBetter: null },
        wb_nuclear_generation: { label: "Nuclear Generation", key: "nuclear_generation_twh", fmt: (v) => v.toFixed(1) + " TWh", higherBetter: null },
        // Research Output (OpenAlex)
        wb_research_papers: { label: "Research Papers", key: "research_papers", fmt: (v) => v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? (v / 1e3).toFixed(0) + "k" : String(v), higherBetter: true },
        wb_research_citations: { label: "Research Citations", key: "research_citations", fmt: (v) => v >= 1e9 ? (v / 1e9).toFixed(1) + "B" : v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? (v / 1e3).toFixed(0) + "k" : String(v), higherBetter: true },
        wb_research_cites_per_paper: { label: "Citations per Paper", key: "research_citations_per_paper", fmt: (v) => v.toFixed(1), higherBetter: true }
      };
      CORP_STAT_DEFS = {
        corp_revenue: {
          label: "Revenue (USD equiv.)",
          fmt: (v) => "$" + fmtRevenue(v),
          higherBetter: true,
          key: (co) => {
            const v = toUSD(co.revenue, co.revenue_currency);
            return v > 0 ? v : null;
          }
        },
        corp_market_cap: {
          label: "Market Cap (USD equiv.)",
          fmt: (v) => "$" + fmtRevenue(v),
          higherBetter: true,
          key: (co) => {
            const v = toUSD(co.market_cap, co.market_cap_currency);
            return v > 0 ? v : null;
          }
        },
        corp_net_income: {
          label: "Net Income (USD equiv.)",
          fmt: (v) => "$" + fmtRevenue(v),
          higherBetter: true,
          key: (co) => {
            const v = toUSD(co.net_income, co.net_income_currency);
            return v > 0 ? v : null;
          }
        },
        corp_employees: {
          label: "Employees",
          fmt: (v) => fmtEmployees(v),
          higherBetter: true,
          key: (co) => co.employees > 0 ? co.employees : null
        }
      };
      EUROSTAT_STAT_DEFS = {
        // Labour market & living conditions (original 7)
        eurostat_unemploymentPct: { label: "Unemployment Rate", key: "unemploymentPct", histKey: "unemploymentHistory", fmt: (v) => v.toFixed(1) + "%", higherBetter: false },
        eurostat_activityRate: { label: "Activity Rate", key: "activityRate", histKey: "activityHistory", fmt: (v) => v.toFixed(1) + "%", higherBetter: true },
        eurostat_medianIncome: { label: "Median Income (\u20AC)", key: "medianIncome", histKey: "medianIncomeHistory", fmt: (v) => "\u20AC" + Math.round(v).toLocaleString(), higherBetter: true },
        eurostat_povertyPct: { label: "At-Risk Poverty", key: "povertyPct", histKey: "povertyHistory", fmt: (v) => v.toFixed(1) + "%", higherBetter: false },
        eurostat_homeownershipPct: { label: "Homeownership Rate", key: "homeownershipPct", histKey: "homeownershipHistory", fmt: (v) => v.toFixed(1) + "%", higherBetter: null },
        eurostat_rentPerSqm: { label: "Avg Rent / m\xB2", key: "rentPerSqm", histKey: "rentHistory", fmt: (v) => "\u20AC" + v.toFixed(1), higherBetter: null },
        eurostat_totalCompanies: { label: "Total Companies", key: "totalCompanies", histKey: "companiesHistory", fmt: (v) => fmtNum(Math.round(v)), higherBetter: null },
        // Air quality & environment (new from urb_cenv)
        eurostat_pm10: { label: "PM10 Air Pollution", key: "pm10", histKey: "pm10History", fmt: (v) => v.toFixed(1) + " \u03BCg/m\xB3", higherBetter: false },
        eurostat_no2: { label: "NO\u2082 Concentration", key: "no2", histKey: "no2History", fmt: (v) => v.toFixed(1) + " \u03BCg/m\xB3", higherBetter: false },
        eurostat_greenSpacePct: { label: "Green Space %", key: "greenSpacePct", histKey: "greenSpacePctHistory", fmt: (v) => v.toFixed(1) + "%", higherBetter: true },
        eurostat_roadNoisePct: { label: "Road Noise >65dB", key: "roadNoisePct", histKey: "roadNoisePctHistory", fmt: (v) => v.toFixed(1) + "%", higherBetter: false },
        // Climate (new from urb_cenv)
        eurostat_tempWarmest: { label: "Warmest Month Avg \xB0C", key: "tempWarmest", histKey: "tempWarmestHistory", fmt: (v) => v.toFixed(1) + "\xB0C", higherBetter: null },
        eurostat_tempColdest: { label: "Coldest Month Avg \xB0C", key: "tempColdest", histKey: "tempColdestHistory", fmt: (v) => v.toFixed(1) + "\xB0C", higherBetter: null },
        eurostat_rainfallMm: { label: "Annual Rainfall (mm)", key: "rainfallMm", histKey: "rainfallMmHistory", fmt: (v) => fmtNum(Math.round(v)) + " mm", higherBetter: null },
        eurostat_sunshineHours: { label: "Sunshine (hrs/day)", key: "sunshineHours", histKey: "sunshineHoursHistory", fmt: (v) => v.toFixed(1) + " hr/day", higherBetter: null },
        // Tourism & culture (new from urb_ctour)
        eurostat_touristNights: { label: "Tourist Overnight Stays", key: "touristNights", histKey: "touristNightsHistory", fmt: (v) => fmtNum(Math.round(v)), higherBetter: null },
        eurostat_museumVisitors: { label: "Museum Visitors/yr", key: "museumVisitors", histKey: "museumVisitorsHistory", fmt: (v) => fmtNum(Math.round(v)), higherBetter: null },
        eurostat_libraries: { label: "Public Libraries", key: "libraries", histKey: "librariesHistory", fmt: (v) => fmtNum(Math.round(v)), higherBetter: null },
        // Demographics (new from urb_cpopstr)
        eurostat_medianAge: { label: "Median Age", key: "medianAge", histKey: "medianAgeHistory", fmt: (v) => v.toFixed(1) + " yrs", higherBetter: null },
        eurostat_popChangePct: { label: "Population Change/yr", key: "popChangePct", histKey: "popChangePctHistory", fmt: (v) => (v >= 0 ? "+" : "") + v.toFixed(2) + "%", higherBetter: null },
        eurostat_ageDependency: { label: "Age Dependency Ratio", key: "ageDependency", histKey: "ageDependencyHistory", fmt: (v) => v.toFixed(1) + "%", higherBetter: null }
      };
      JAPAN_PREF_STAT_DEFS = {
        japan_perCapitaIncome: {
          label: "Per-Capita Prefecture Income",
          key: "perCapitaIncomeJpy",
          fmt: (v) => "\xA5" + fmtNum(Math.round(v)),
          higherBetter: true
        },
        japan_gdp: {
          label: "Prefectural GDP",
          key: "gdpJpy",
          fmt: (v) => "\xA5" + fmtRevenue(v),
          higherBetter: true
        }
      };
      ADMIN_TO_NUTS2 = {
        // ── Germany ── (Regierungsbezirke and Bundesländer → NUTS-2)
        DE: {
          "Stuttgart Government Region": "DE11",
          "Karlsruhe Government Region": "DE12",
          "Freiburg Government Region": "DE13",
          "T\xFCbingen Government Region": "DE14",
          "Upper Bavaria": "DE21",
          "Lower Bavaria": "DE22",
          "Upper Palatinate": "DE23",
          "Upper Franconia": "DE24",
          "Middle Franconia": "DE25",
          "Lower Franconia": "DE26",
          "Swabia": "DE27",
          "Munich": "DE21",
          "Berlin": "DE30",
          "Brandenburg": "DE40",
          "Bremen": "DE50",
          "Hamburg": "DE60",
          "Darmstadt Government Region": "DE71",
          "Gie\xDFen": "DE72",
          "Kassel Government Region": "DE73",
          "Mecklenburg-Vorpommern": "DE80",
          "Braunschweig Government Region": "DE91",
          "Hannover Region": "DE92",
          "L\xFCneburg": "DE93",
          "Weser-Ems": "DE94",
          "D\xFCsseldorf Government Region": "DEA1",
          "Cologne Government Region": "DEA2",
          "Aachen cities region": "DEA2",
          "M\xFCnster Government Region": "DEA3",
          "Detmold Government Region": "DEA4",
          "Arnsberg Government Region": "DEA5",
          "Koblenz": "DEB1",
          "Trier": "DEB2",
          "Rheinhessen-Pfalz": "DEB3",
          "Regionalverband Saarbr\xFCcken": "DEC0",
          "Saarland": "DEC0",
          "Dresden": "DED2",
          "Chemnitz": "DED4",
          "Leipzig": "DED5",
          "Saxony-Anhalt": "DEE0",
          "Schleswig-Holstein": "DEF0",
          "Thuringia": "DEG0",
          // Districts/cities mapping to enclosing NUTS-2
          "Neuk\xF6lln": "DE30",
          "Spandau": "DE30",
          // Berlin districts
          "Paderborn District": "DEA4",
          // Detmold region
          "Rhein-Kreis Neuss": "DEA1",
          // Düsseldorf region
          "Recklinghausen": "DEA5",
          "Wesel": "DEA5",
          "Unna": "DEA5",
          // Arnsberg adjacent
          "G\xFCtersloh": "DEA4",
          "Lippe": "DEA4",
          "Minden-L\xFCbbecke District": "DEA4",
          "Siegen-Wittgenstein": "DEA5",
          "Ennepe-Ruhr-Kreis": "DEA5",
          "M\xE4rkischer Kreis": "DEA5",
          "Rhein-Sieg District": "DEA2",
          "Rhein-Erft District": "DEA2",
          "D\xFCren district": "DEA2",
          "Esslingen District": "DE11",
          "Ludwigsburg District": "DE11",
          "B\xF6blingen district": "DE11",
          "Reutlingen": "DE14",
          "T\xFCbingen District": "DE14",
          "Zollernalbkreis": "DE14",
          "Schwarzwald-Baar district": "DE13",
          "Ortenau": "DE13",
          "L\xF6rrach VVG": "DE13",
          "Konstanz": "DE12",
          "G\xF6ttingen district": "DE91",
          "Hildesheim": "DE91",
          "Stade District": "DE93",
          "Cuxhaven district": "DE94",
          "County of Bentheim": "DE94",
          "Hochsauerlandkreis": "DEA5",
          "District of Freising": "DE21",
          // Upper Bavaria
          "district Heidenheim": "DE11",
          // Stuttgart region
          "Mecklenburgische Seenplatte District": "DE80",
          "Marburg-Biedenkopf": "DE72"
          // Gießen area
        },
        // ── France ── (département → NUTS-2 historical region)
        FR: {
          "Grand Paris": "FR10",
          "Seine-Saint-Denis": "FR10",
          "Val-de-Marne": "FR10",
          "Hauts-de-Seine": "FR10",
          "Val-d'Oise": "FR10",
          "arrondissement of Boulogne-Billancourt": "FR10",
          "arrondissement of Nanterre": "FR10",
          "Centre-Val de Loire": "FRB0",
          "Indre-et-Loire": "FRB0",
          "Loiret": "FRB0",
          "Loir-et-Cher": "FRB0",
          "C\xF4te-d'Or": "FRC1",
          "Bourgogne-Franche-Comt\xE9": "FRC1",
          "Doubs": "FRC2",
          "Franche-Comt\xE9": "FRC2",
          "Calvados": "FRD1",
          "Basse-Normandie": "FRD1",
          "Seine-Maritime": "FRD2",
          "Haute-Normandie": "FRD2",
          "Nord": "FRE1",
          "Pas-de-Calais": "FRE1",
          "arrondissement of Lille": "FRE1",
          "Somme": "FRE2",
          "Picardie": "FRE2",
          "Bas-Rhin": "FRF1",
          "Haut-Rhin": "FRF1",
          "Alsace": "FRF1",
          "Marne": "FRF2",
          "Champagne-Ardenne": "FRF2",
          "Moselle": "FRF3",
          "Meurthe-et-Moselle": "FRF3",
          "Lorraine": "FRF3",
          "Loire-Atlantique": "FRG0",
          "Sarthe": "FRG0",
          "Maine-et-Loire": "FRG0",
          "Ille-et-Vilaine": "FRH0",
          "Finist\xE8re": "FRH0",
          "Bretagne": "FRH0",
          "Gironde": "FRI1",
          "Aquitaine": "FRI1",
          "Haute-Vienne": "FRI2",
          "Limousin": "FRI2",
          "Vienne": "FRI3",
          "Charente-Maritime": "FRI3",
          "Poitou-Charentes": "FRI3",
          "H\xE9rault": "FRJ1",
          "Pyr\xE9n\xE9es-Orientales": "FRJ1",
          "Languedoc-Roussillon": "FRJ1",
          "Haute-Garonne": "FRJ2",
          "Midi-Pyr\xE9n\xE9es": "FRJ2",
          "arrondissement of Pau": "FRJ2",
          "Puy-de-D\xF4me": "FRK1",
          "Auvergne": "FRK1",
          "Is\xE8re": "FRK2",
          "Haute-Savoie": "FRK2",
          "Savoie": "FRK2",
          "Loire": "FRK2",
          "Metropolis of Lyon": "FRK2",
          "Urban Community of Lyon": "FRK2",
          "Auvergne-Rh\xF4ne-Alpes": "FRK2",
          "Bouches-du-Rh\xF4ne": "FRL0",
          "Alpes-Maritimes": "FRL0",
          "Var": "FRL0",
          "Vaucluse": "FRL0",
          "Provence-Alpes-C\xF4te d'Azur": "FRL0",
          "Corse-du-Sud": "FRM0",
          "Corse": "FRM0",
          "Martinique": "FRY2",
          "French Guiana": "FRY3",
          "R\xE9union": "FRY4"
        },
        // ── Italy ── (Province/Metropolitan City → NUTS-2 region)
        IT: {
          "Metropolitan City of Turin": "ITC1",
          "Province of Novara": "ITC1",
          "Province of Alessandria": "ITC1",
          "Province of Cuneo": "ITC1",
          "Province of Asti": "ITC1",
          "Piemonte": "ITC1",
          "Liguria": "ITC3",
          "Metropolitan City of Genoa": "ITC3",
          "Province of Savona": "ITC3",
          "Province of Imperia": "ITC3",
          "Lombardia": "ITC4",
          "Metropolitan City of Milan": "ITC4",
          "Province of Brescia": "ITC4",
          "Province of Monza and Brianza": "ITC4",
          "Province of Bergamo": "ITC4",
          "Province of Como": "ITC4",
          "Province of Varese": "ITC4",
          "Province of Cremona": "ITC4",
          "Abruzzo": "ITF1",
          "Province of Pescara": "ITF1",
          "Province of L'Aquila": "ITF1",
          "Campania": "ITF3",
          "Metropolitan City of Naples": "ITF3",
          "Province of Salerno": "ITF3",
          "Province of Caserta": "ITF3",
          "Avellino": "ITF3",
          "Puglia": "ITF4",
          "Metropolitan City of Bari": "ITF4",
          "Province of Taranto": "ITF4",
          "Province of Foggia": "ITF4",
          "Province of Barletta-Andria-Trani": "ITF4",
          "province of Lecce": "ITF4",
          "Province of Brindisi": "ITF4",
          "Basilicata": "ITF5",
          "province of Potenza": "ITF5",
          "Calabria": "ITF6",
          "Metropolitan City of Reggio Calabria": "ITF6",
          "Province of Catanzaro": "ITF6",
          "Province of Crotone": "ITF6",
          "Sicilia": "ITG1",
          "Metropolitan City of Palermo": "ITG1",
          "Metropolitan City of Catania": "ITG1",
          "Metropolitan City of Messina": "ITG1",
          "Free Municipal Consortium of Syracuse": "ITG1",
          "Free municipal consortium of Agrigento": "ITG1",
          "Sardegna": "ITG2",
          "Province of Sassari": "ITG2",
          "South Tyrol": "ITH1",
          "Veneto": "ITH3",
          "Metropolitan City of Venice": "ITH3",
          "Province of Verona": "ITH3",
          "Province of Padua": "ITH3",
          "Province of Vicenza": "ITH3",
          "Province of Treviso": "ITH3",
          "Friuli-Venezia Giulia": "ITH4",
          "regional decentralization entity of Trieste": "ITH4",
          "regional decentralization entity of Udine": "ITH4",
          "Emilia-Romagna": "ITH5",
          "Metropolitan City of Bologna": "ITH5",
          "Province of Parma": "ITH5",
          "Province of Modena": "ITH5",
          "Province of Reggio Emilia": "ITH5",
          "Province of Ravenna": "ITH5",
          "Province of Rimini": "ITH5",
          "Province of Ferrara": "ITH5",
          "Province of Forl\xEC-Cesena": "ITH5",
          "Province of Piacenza": "ITH5",
          "Toscana": "ITI1",
          "Metropolitan City of Florence": "ITI1",
          "Province of Prato": "ITI1",
          "Province of Livorno": "ITI1",
          "Province of Lucca": "ITI1",
          "Province of Pisa": "ITI1",
          "Province of Massa-Carrara": "ITI1",
          "Province of Siena": "ITI1",
          "Umbria": "ITI2",
          "province of Perugia": "ITI2",
          "province of Terni": "ITI2",
          "Marche": "ITI3",
          "Province of Ancona": "ITI3",
          "Lazio": "ITI4",
          "Metropolitan City of Rome": "ITI4",
          "Province of Latina": "ITI4"
        },
        // ── Spain ── (autonomous community / province → NUTS-2)
        ES: {
          "Galicia": "ES11",
          "Principado de Asturias": "ES12",
          "Xix\xF3n": "ES12",
          "Uvi\xE9u": "ES12",
          "Cantabria": "ES13",
          "Santander": "ES13",
          "Pa\xEDs Vasco": "ES21",
          "Greater Bilbao": "ES21",
          "Comunidad Foral de Navarra": "ES22",
          "La Rioja": "ES23",
          "Logro\xF1o": "ES23",
          "Arag\xF3n": "ES24",
          "Zaragoza": "ES24",
          "Huesca": "ES24",
          "Community of Madrid": "ES30",
          "Madrid": "ES30",
          "Alcal\xE1 de Henares": "ES30",
          "Getafe": "ES30",
          "Pinto": "ES30",
          "Mairena del Aljarafe": "ES30",
          "Castile and Le\xF3n": "ES41",
          "Valladolid": "ES41",
          "Salamanca": "ES41",
          "Le\xF3n": "ES41",
          "Palencia": "ES41",
          "Zamora": "ES41",
          "Segovia Province": "ES41",
          "Province of \xC1vila": "ES41",
          "Castile\u2013La Mancha": "ES42",
          "Guadalajara": "ES42",
          "Ciudad Real": "ES42",
          "Cuenca": "ES42",
          "Albacete": "ES42",
          "Talavera de la Reina": "ES42",
          "Extremadura": "ES43",
          "Province of Badajoz": "ES43",
          "Badajoz": "ES43",
          "C\xE1ceres": "ES43",
          "M\xE9rida": "ES43",
          "Catalu\xF1a": "ES51",
          "Barcelon\xE8s": "ES51",
          "Girona": "ES51",
          "Tarragona": "ES51",
          "Vall\xE8s Occidental": "ES51",
          "Baix Llobregat": "ES51",
          "Vic": "ES51",
          "Comunitat Valenciana": "ES52",
          "Valencia": "ES52",
          "Province of Alicante": "ES52",
          "Castell\xF3n": "ES52",
          "Horta Sud": "ES52",
          "Torrevieja": "ES52",
          "Gandia": "ES52",
          "Elche": "ES52",
          "Elda": "ES52",
          "Illes Balears": "ES53",
          "Mallorca": "ES53",
          "Ibiza": "ES53",
          "Andaluc\xEDa": "ES61",
          "Seville": "ES61",
          "Seville Province": "ES61",
          "M\xE1laga": "ES61",
          "C\xF3rdoba": "ES61",
          "Almer\xEDa": "ES61",
          "C\xE1diz": "ES61",
          "Ja\xE9n": "ES61",
          "Fuengirola": "ES61",
          "Torremolinos": "ES61",
          "Chiclana de la Frontera": "ES61",
          "Estepona": "ES61",
          "Utrera": "ES61",
          "Regi\xF3n de Murcia": "ES62",
          "Murcia": "ES62",
          "Canary Islands": "ES70",
          "Santa Cruz de Tenerife Province": "ES70",
          "Santa Cruz de Tenerife": "ES70",
          "Las Palmas": "ES70",
          "Ourense": "ES11"
        },
        // ── Poland ── (voivodeship → NUTS-2)
        PL: {
          "Lesser Poland Voivodeship": "PL21",
          "Silesian Voivodeship": "PL22",
          "Greater Poland Voivodeship": "PL41",
          "West Pomeranian Voivodeship": "PL42",
          "Lubusz Voivodeship": "PL43",
          "Lower Silesian Voivodeship": "PL51",
          "Opole Voivodeship": "PL52",
          "Kuyavian-Pomeranian Voivodeship": "PL61",
          "Warmian-Masurian Voivodeship": "PL62",
          "Pomeranian Voivodeship": "PL63",
          "\u0141\xF3d\u017A Voivodeship": "PL71",
          "\u015Awi\u0119tokrzyskie Voivodeship": "PL72",
          "Lublin Voivodeship": "PL81",
          "Podkarpackie Voivodeship": "PL82",
          "Podlaskie Voivodeship": "PL84",
          "Masovian Voivodeship": "PL91"
          // Warsaw metro; rest is PL92 but PL91 is close enough
        },
        // ── Austria ── (Bundesland → NUTS-2)
        AT: {
          "Burgenland": "AT11",
          "Lower Austria": "AT12",
          "Vienna": "AT13",
          "Carinthia": "AT21",
          "Styria": "AT22",
          "Upper Austria": "AT31",
          "Salzburg": "AT32",
          "Tyrol": "AT33",
          "Vorarlberg": "AT34",
          "Dornbirn District": "AT34"
        },
        // ── Netherlands ── (Dutch & English province names → NUTS-2; iso=null in cities data)
        NL: {
          "Groningen": "NL11",
          "Friesland": "NL12",
          "Drenthe": "NL13",
          "Overijssel": "NL21",
          "Gelderland": "NL22",
          "Flevoland": "NL23",
          "Utrecht": "NL31",
          "Noord-Holland": "NL32",
          "Zuid-Holland": "NL33",
          "Zeeland": "NL34",
          "Noord-Brabant": "NL41",
          "Limburg": "NL42",
          // English names used in cities data
          "North Holland": "NL32",
          "South Holland": "NL33",
          "North Brabant": "NL41",
          "Amsterdam": "NL32",
          "Rotterdam": "NL33",
          "Breda": "NL41",
          "The Hague": "NL33",
          "Scheveningen": "NL33"
        },
        // ── Belgium ── (arrondissement → NUTS-2 province)
        BE: {
          "Arrondissement of Brussels-Capital": "BE10",
          "Arrondissement of Antwerp": "BE21",
          "Arrondissement of Ghent": "BE23",
          "Arrondissement of Bruges": "BE25",
          "Arrondissement of Li\xE8ge": "BE33",
          "Belgium": "BE10"
          // fallback for Brussels
        },
        // ── Sweden ── (county and municipality → NUTS-2)
        SE: {
          "Stockholm": "SE11",
          "Stockholm County": "SE11",
          "Uppsala Municipality": "SE12",
          "Uppsala County": "SE12",
          "\xD6stra Mellansverige": "SE12",
          "\xD6sterg\xF6tland County": "SE12",
          "S\xF6dermanland County": "SE12",
          "J\xF6nk\xF6ping County": "SE21",
          "Kronoberg County": "SE21",
          "Kalmar County": "SE21",
          "Gotland County": "SE21",
          "Sk\xE5ne County": "SE22",
          "Halland County": "SE22",
          "Blekinge County": "SE22",
          "Sydsverige": "SE22",
          "Gothenburg Municipality": "SE23",
          "V\xE4stra G\xF6taland County": "SE23",
          "V\xE4rmland County": "SE31",
          "G\xF6teborg": "SE23",
          "Gothenburg": "SE23",
          "Norra Mellansverige": "SE31",
          "G\xE4vleborg County": "SE31",
          "\xD6rebro County": "SE12"
        },
        // ── Finland ── (sub-region → NUTS-2)
        FI: {
          "Uusimaa": "FI1B",
          "Helsinki-Uusimaa": "FI1B",
          "Porvoo": "FI1B",
          "Southwest Finland": "FI19",
          "Pirkanmaa": "FI19",
          "Central Finland": "FI19",
          "Satakunta": "FI19",
          "Kanta-H\xE4me": "FI19",
          "Ostrobothnia": "FI19",
          "South Ostrobothnia": "FI19",
          "Central Ostrobothnia": "FI19",
          "P\xE4ij\xE4t-H\xE4me": "FI1C",
          "Kymenlaakso": "FI1C",
          "South Karelia": "FI1C",
          "South Savo": "FI1C",
          "Etel\xE4-Suomi": "FI1C",
          "North Ostrobothnia": "FI1D",
          "North Savo": "FI1D",
          "North Karelia": "FI1D",
          "Lapland": "FI1D",
          "Kainuu": "FI1D",
          "Pohjois- ja It\xE4-Suomi": "FI1D"
        },
        // ── Romania ── (county → NUTS-2 development region)
        RO: {
          "Cluj County": "RO11",
          "Bihor County": "RO11",
          "Maramure\u0219 County": "RO11",
          "Bra\u0219ov County": "RO12",
          "Sibiu County": "RO12",
          "Mure\u0219 County": "RO12",
          "Alba County": "RO12",
          "Ia\u0219i County": "RO21",
          "Bac\u0103u County": "RO21",
          "Suceava County": "RO21",
          "Neam\u021B County": "RO21",
          "Constan\u021Ba County": "RO22",
          "Gala\u021Bi County": "RO22",
          "Br\u0103ila County": "RO22",
          "Buz\u0103u County": "RO22",
          "Prahova County": "RO31",
          "Arge\u0219 County": "RO31",
          "D\xE2mbovi\u021Ba County": "RO31",
          "Dolj County": "RO41",
          "Gorj County": "RO41",
          "Mehedin\u021Bi County": "RO41",
          "Timi\u0219 County": "RO42",
          "Arad County": "RO42",
          "Cara\u0219-Severin County": "RO42",
          "Romania": "RO32",
          // Bucharest-Ilfov region fallback
          "Oradea": "RO11"
          // city admin
        },
        // ── Hungary ──
        HU: {
          "Csongr\xE1d-Csan\xE1d County": "HU33",
          "D\xE9l-Alf\xF6ld": "HU33",
          "Miskolc District": "HU31",
          "\xC9szak-Magyarorsz\xE1g": "HU31",
          "P\xE9cs District": "HU23",
          "D\xE9l-Dun\xE1nt\xFAl": "HU23",
          "Ny\xEDregyh\xE1za District": "HU32",
          "\xC9szak-Alf\xF6ld": "HU32",
          "Kecskem\xE9t District": "HU33",
          "Sz\xE9kesfeh\xE9rv\xE1r District": "HU21",
          "K\xF6z\xE9p-Dun\xE1nt\xFAl": "HU21"
        },
        // ── Czech Republic ──
        CZ: {
          "Czech Republic": "CZ01",
          // Prague (CZ01 = Praha) as fallback
          "Brno-City District": "CZ06",
          "Ostrava-City District": "CZ08",
          "Plze\u0148-City District": "CZ03",
          "Liberec District": "CZ05",
          "Olomouc District": "CZ07",
          "Pardubice District": "CZ05",
          "\xDAst\xED nad Labem District": "CZ04",
          "Kladno District": "CZ02",
          "Chomutov District": "CZ04",
          "D\u011B\u010D\xEDn District": "CZ04",
          "Teplice District": "CZ04",
          "Karlovy Vary District": "CZ04",
          "Mlad\xE1 Boleslav District": "CZ02"
        },
        // ── Slovakia ──
        SK: {
          "Bratislava Region": "SK01",
          "Ko\u0161ice Region": "SK04",
          "Pre\u0161ov Region": "SK04",
          "\u017Dilina District": "SK03",
          "Nitra District": "SK02",
          "Bansk\xE1 Bystrica District": "SK03"
        },
        // ── Denmark ── (municipality → NUTS-2 region)
        DK: {
          "Capital Region of Denmark": "DK01",
          "Helsing\xF8r Municipality": "DK01",
          "Roskilde Municipality": "DK02",
          "N\xE6stved Municipality": "DK02",
          "Odense Municipality": "DK03",
          "Esbjerg Municipality": "DK03",
          "Kolding Municipality": "DK03",
          "Vejle Municipality": "DK03",
          "Aarhus Municipality": "DK04",
          "Horsens Municipality": "DK04",
          "Randers Municipality": "DK04",
          "Silkeborg Municipality": "DK04",
          "Herning Municipality": "DK04",
          "Aalborg Municipality": "DK05",
          "Frederiksberg Municipality": "DK01"
        },
        // ── Portugal ──
        PT: {
          "Porto": "PT11",
          "Braga": "PT11"
        },
        // ── Greece ──
        EL: {
          "Athens Municipality": "EL30",
          "Piraeus Municipality": "EL30",
          "Piraeus Regional Unit": "EL30",
          "Thessaloniki Municipality": "EL52",
          "Municipality of Patras": "EL65",
          "Larissa Municipality": "EL61"
        },
        // ── Croatia ──
        HR: {
          "Split-Dalmatia County": "HR03",
          "Primorje-Gorski Kotar County": "HR03",
          "Zadar County": "HR03",
          "Osijek-Baranja County": "HR04"
        },
        // ── Lithuania ──
        LT: {
          "Vilnius City Municipality": "LT01",
          "Kaunas City Municipality": "LT02",
          "Klaipeda City Municipality": "LT02",
          "\u0160iauliai City Municipality": "LT01",
          "Panev\u0117\u017Eys City Municipality": "LT01",
          "Alytus City Municipality": "LT02"
        },
        // ── Ireland ──
        IE: {
          "Dublin City": "IE06",
          "County Cork": "IE05",
          "Galway City": "IE04",
          "County Limerick": "IE05",
          "County Waterford": "IE05"
        },
        // ── Norway ── (municipality → NUTS-2 statistical region)
        NO: {
          "Oslo Municipality": "NO08",
          "Oslo": "NO08",
          "Akershus": "NO08",
          "Bergen": "NO0A",
          "Bergen Municipality": "NO0A",
          "Vestlandet": "NO0A",
          "Trondheim": "NO06",
          "Trondheim Municipality": "NO06",
          "Tr\xF8ndelag": "NO06",
          "Stavanger": "NO09",
          "Stavanger Municipality": "NO09",
          "Rogaland": "NO09",
          "Kristiansand Municipality": "NO09",
          "Troms\xF8 Municipality": "NO07",
          "Troms\xF8": "NO07"
        },
        // ── Bulgaria ──
        BG: {
          "Stolichna Municipality": "BG41",
          "Sofia City Province": "BG41",
          "Plovdiv Province": "BG42",
          "Stara Zagora Province": "BG42",
          "Varna Province": "BG33",
          "Burgas Province": "BG34",
          "Ruse Province": "BG32",
          "Pleven Province": "BG31",
          "Sliven Province": "BG34",
          "Burgas": "BG34",
          "Stara Zagora": "BG42",
          "Ruse": "BG32",
          "Pleven": "BG31",
          "Sliven": "BG34"
        },
        // ── Slovenia ──
        SI: {
          "Ljubljana City Municipality": "SI04",
          "Maribor City Municipality": "SI03"
        }
      };
      SINGLE_NUTS2 = { CY: "CY00", EE: "EE00", LU: "LU00", LV: "LV00", MT: "MT00", IS: "IS00" };
      document.addEventListener("keydown", function(e) {
        if (e.key === "Escape" && !document.getElementById("wiki-lightbox").classList.contains("open")) {
          closeWikiSidebar();
          closeGlobalCorpPanel();
        }
      });
      _errorTileDataUrl = "data:image/svg+xml," + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect fill="#e8e8e8" width="256" height="256"/><path d="M0 128h256M128 0v256" stroke="#d0d0d0" stroke-width="1"/></svg>'
      );
      _terrainFallbackActive = false;
      _hashUpdateTimer = null;
      (function() {
        var rangeEl = document.getElementById("choro-year-range");
        if (!rangeEl) return;
        var pending = null;
        rangeEl.addEventListener("input", function() {
          if (pending) return;
          pending = requestAnimationFrame(function() {
            pending = null;
            _onChoroYearChange();
          });
        });
      })();
      S._creditToNum = /* @__PURE__ */ (function() {
        var sp = {
          "AAA": 21,
          "AA+": 20,
          "AA": 19,
          "AA-": 18,
          "A+": 17,
          "A": 16,
          "A-": 15,
          "BBB+": 14,
          "BBB": 13,
          "BBB-": 12,
          "BB+": 11,
          "BB": 10,
          "BB-": 9,
          "B+": 8,
          "B": 7,
          "B-": 6,
          "CCC+": 5,
          "CCC": 4,
          "CCC-": 3,
          "CC": 2,
          "C": 1,
          "D": 0
        };
        var moodys = {
          "Aaa": 21,
          "Aa1": 20,
          "Aa2": 19,
          "Aa3": 18,
          "A1": 17,
          "A2": 16,
          "A3": 15,
          "Baa1": 14,
          "Baa2": 13,
          "Baa3": 12,
          "Ba1": 11,
          "Ba2": 10,
          "Ba3": 9,
          "B1": 8,
          "B2": 7,
          "B3": 6,
          "Caa1": 5,
          "Caa2": 4,
          "Caa3": 3,
          "Ca": 2,
          "C": 1
        };
        return { sp, moodys, fitch: sp };
      })();
      S._numToCredit = (function() {
        function invert(obj) {
          var r = {};
          for (var k in obj) r[obj[k]] = k;
          return r;
        }
        return { sp: invert(S._creditToNum.sp), moodys: invert(S._creditToNum.moodys), fitch: invert(S._creditToNum.fitch) };
      })();
      ISO2_TO_BEA = {
        AU: "Australia",
        AT: "Austria",
        BE: "Belgium",
        BR: "Brazil",
        CA: "Canada",
        CL: "Chile",
        CN: "China",
        CO: "Colombia",
        CZ: "Czech Republic",
        DK: "Denmark",
        EG: "Egypt",
        FI: "Finland",
        FR: "France",
        DE: "Germany",
        GR: "Greece",
        HK: "Hong Kong",
        HU: "Hungary",
        IN: "India",
        ID: "Indonesia",
        IE: "Ireland",
        IL: "Israel",
        IT: "Italy",
        JP: "Japan",
        JO: "Jordan",
        KE: "Kenya",
        KW: "Kuwait",
        MY: "Malaysia",
        MX: "Mexico",
        MA: "Morocco",
        NL: "Netherlands",
        NZ: "New Zealand",
        NG: "Nigeria",
        NO: "Norway",
        OM: "Oman",
        PK: "Pakistan",
        PE: "Peru",
        PH: "Philippines",
        PL: "Poland",
        PT: "Portugal",
        QA: "Qatar",
        RU: "Russia",
        SA: "Saudi Arabia",
        ZA: "South Africa",
        KR: "South Korea",
        ES: "Spain",
        SE: "Sweden",
        CH: "Switzerland",
        TW: "Taiwan",
        TH: "Thailand",
        TR: "Turkey",
        AE: "United Arab Emirates",
        GB: "United Kingdom",
        VN: "Vietnam",
        BD: "Bangladesh",
        AR: "Argentina",
        UA: "Ukraine",
        RO: "Romania",
        SK: "Slovak Republic",
        DZ: "Algeria",
        GT: "Guatemala",
        HN: "Honduras",
        CR: "Costa Rica",
        PA: "Panama",
        DO: "Dominican Republic",
        CU: "Cuba",
        TT: "Trinidad and Tobago",
        KZ: "Kazakhstan",
        UZ: "Uzbekistan",
        AZ: "Azerbaijan",
        GE: "Georgia",
        AM: "Armenia",
        LB: "Lebanon",
        IQ: "Iraq",
        LK: "Sri Lanka",
        MM: "Burma",
        KH: "Cambodia",
        MN: "Mongolia",
        ET: "Ethiopia",
        GH: "Ghana",
        TZ: "Tanzania",
        AO: "Angola",
        ZM: "Zambia",
        MZ: "Mozambique",
        BW: "Botswana",
        MU: "Mauritius",
        EC: "Ecuador",
        VE: "Venezuela",
        UY: "Uruguay",
        BO: "Bolivia",
        PY: "Paraguay",
        SV: "El Salvador",
        NI: "Nicaragua",
        BZ: "Belize",
        JM: "Jamaica",
        AF: "Afghanistan",
        NP: "Nepal",
        FJ: "Fiji",
        PG: "Papua New Guinea",
        BG: "Bulgaria",
        HR: "Croatia",
        RS: "Serbia",
        SI: "Slovenia",
        LU: "Luxembourg",
        CY: "Cyprus",
        MT: "Malta",
        LT: "Lithuania",
        LV: "Latvia",
        EE: "Estonia",
        MD: "Moldova",
        BA: "Bosnia and Herzegovina",
        AL: "Albania",
        MK: "North Macedonia",
        LY: "Libya",
        SD: "Sudan",
        YE: "Yemen",
        SY: "Syria",
        TN: "Tunisia",
        CM: "Cameroon",
        SN: "Senegal",
        CD: "Democratic Republic of the Congo",
        CI: "Cote d'Ivoire",
        MG: "Madagascar",
        RW: "Rwanda",
        UG: "Uganda"
      };
      LS_TRADE_PREFIX = "bea_trade_v1_";
      LS_TRADE_TTL = 7 * 24 * 60 * 60 * 1e3;
      _nationsPanelOpen = false;
      _PLATE_NAMES = {
        AF: "African",
        AN: "Antarctic",
        SO: "South American",
        NA: "North American",
        PA: "Pacific",
        AU: "Australian",
        EU: "Eurasian",
        IN: "Indian",
        AR: "Arabian",
        CO: "Cocos",
        NZ: "Nazca",
        PH: "Philippine",
        CA: "Caribbean",
        JF: "Juan de Fuca",
        OK: "Okhotsk",
        AM: "Amur",
        SM: "Somalia",
        NB: "Nubia",
        SC: "Scotia"
      };
      _aircraftMoveHandler = null;
      _wildfireMoveHandler = null;
      GCORP_PAGE = 100;
      document.addEventListener("click", (e) => {
        const trigger = e.target.closest(".count-dropdown-trigger");
        if (trigger) {
          const dd = trigger.parentElement;
          document.querySelectorAll(".count-dropdown.open").forEach((d) => {
            if (d !== dd) d.classList.remove("open");
          });
          dd.classList.toggle("open");
          return;
        }
        document.querySelectorAll(".count-dropdown.open").forEach((d) => d.classList.remove("open"));
      });
      (function initCompareSearch() {
        const input = document.getElementById("compare-search-input");
        const results = document.getElementById("compare-search-results");
        function search(q) {
          results.innerHTML = "";
          if (!q || q.length < 1) return;
          const ql = q.toLowerCase();
          const ranked = S.allCities.filter((c) => c.name.toLowerCase().includes(ql)).sort((a, b) => {
            const an = a.name.toLowerCase(), bn = b.name.toLowerCase();
            const sa = an === ql ? 0 : an.startsWith(ql) ? 1 : 2;
            const sb = bn === ql ? 0 : bn.startsWith(ql) ? 1 : 2;
            return sa !== sb ? sa - sb : (b.pop || 0) - (a.pop || 0);
          }).slice(0, 8);
          ranked.forEach((city) => {
            const li = document.createElement("li");
            li.className = "csr-item";
            li.innerHTML = `<span class="csr-name">${escHtml(city.name)}</span><span class="csr-country"> \xB7 ${escHtml(city.country || city.iso || "")}</span>`;
            li.addEventListener("mousedown", (e) => {
              e.preventDefault();
              selectCity(city);
            });
            results.appendChild(li);
          });
        }
        function selectCity(city) {
          S._cmpCityB = city;
          input.value = city.name;
          results.innerHTML = "";
          _renderComparison();
        }
        input.addEventListener("input", () => search(input.value.trim()));
        input.addEventListener("blur", () => setTimeout(() => {
          results.innerHTML = "";
        }, 150));
      })();
      (function initCitySearch() {
        const box = document.getElementById("city-search-box");
        const input = document.getElementById("city-search-input");
        const results = document.getElementById("city-search-results");
        const clearBtn = document.getElementById("city-search-clear");
        if (!box || !input) return;
        let _selIdx = -1;
        function fmtPop2(p) {
          if (!p) return "";
          if (p >= 1e6) return (p / 1e6).toFixed(1) + "M";
          if (p >= 1e3) return Math.round(p / 1e3) + "K";
          return String(p);
        }
        function highlight(name, q) {
          const i = name.toLowerCase().indexOf(q.toLowerCase());
          if (i < 0) return escHtml(name);
          return escHtml(name.slice(0, i)) + "<em>" + escHtml(name.slice(i, i + q.length)) + "</em>" + escHtml(name.slice(i + q.length));
        }
        function search(q) {
          q = q.trim();
          clearBtn.style.display = q ? "" : "none";
          if (q.length < 1) {
            close();
            return;
          }
          const ql = q.toLowerCase();
          const scored = [];
          for (const c of S.allCities) {
            const nl = (c.name || "").toLowerCase();
            if (!nl.includes(ql)) continue;
            const score = nl === ql ? 0 : nl.startsWith(ql) ? 1 : nl.includes(" " + ql) ? 2 : 3;
            scored.push({ c, score });
          }
          scored.sort((a, b) => a.score - b.score || (b.c.pop || 0) - (a.c.pop || 0));
          const hits = scored.slice(0, 8);
          const countryHits = [];
          if (ql.length >= 2) {
            for (const iso in S.countryData) {
              const cd = S.countryData[iso];
              if (!cd || !cd.name) continue;
              const cnl = cd.name.toLowerCase();
              if (!cnl.includes(ql)) continue;
              const score = cnl === ql ? 0 : cnl.startsWith(ql) ? 1 : 2;
              countryHits.push({ iso, name: cd.name, score });
            }
            countryHits.sort((a, b) => a.score - b.score);
          }
          if (!hits.length && !countryHits.length) {
            close();
            return;
          }
          _selIdx = -1;
          const cityItems = hits.map(
            ({ c }, i) => `<li data-idx="${i}" data-qid="${escAttr(c.qid)}"
           data-lat="${c.lat}" data-lng="${c.lng}"
           data-name="${escAttr(c.name)}">
         <span class="csr-name">${highlight(c.name, q)}</span>
         <span class="csr-meta">${escHtml(c.country || "")}${c.pop ? " \xB7 " + fmtPop2(c.pop) : ""}</span>
       </li>`
          ).join("");
          const countryItems = countryHits.slice(0, 4).map(
            (ch, i) => `<li data-idx="${hits.length + i}" data-iso2="${escAttr(ch.iso)}"
           data-name="${escAttr(ch.name)}" class="csr-country">
         <span class="csr-name">\u{1F3F3} ${highlight(ch.name, q)}</span>
         <span class="csr-meta">${ch.iso} \xB7 country</span>
       </li>`
          ).join("");
          results.innerHTML = cityItems + countryItems;
          results.style.display = "";
          results.querySelectorAll("li").forEach((li) => {
            li.addEventListener("mousedown", (e) => {
              e.preventDefault();
              selectResult(li);
            });
          });
        }
        function selectResult(li) {
          const name = li.dataset.name;
          input.value = name;
          clearBtn.style.display = "";
          close();
          if (li.dataset.iso2) {
            openCountryPanel(li.dataset.iso2);
            return;
          }
          const qid = li.dataset.qid;
          const lat = parseFloat(li.dataset.lat);
          const lng = parseFloat(li.dataset.lng);
          S.map.flyTo([lat, lng], Math.max(S.map.getZoom(), 8), { duration: 1.2 });
          if (qid) openWikiSidebar(qid, name);
        }
        function close() {
          results.style.display = "none";
          results.innerHTML = "";
          _selIdx = -1;
        }
        function moveSelection(dir) {
          const items = results.querySelectorAll("li");
          if (!items.length) return;
          items[_selIdx]?.classList.remove("selected");
          _selIdx = Math.max(0, Math.min(items.length - 1, _selIdx + dir));
          items[_selIdx].classList.add("selected");
          items[_selIdx].scrollIntoView({ block: "nearest" });
        }
        input.addEventListener("input", () => search(input.value));
        input.addEventListener("focus", () => {
          if (input.value.trim()) search(input.value);
        });
        input.addEventListener("keydown", (e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            moveSelection(1);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            moveSelection(-1);
          } else if (e.key === "Enter") {
            e.preventDefault();
            const sel = results.querySelector("li.selected") || results.querySelector("li");
            if (sel) selectResult(sel);
          } else if (e.key === "Escape") {
            close();
            input.blur();
          }
        });
        clearBtn.addEventListener("click", () => {
          input.value = "";
          clearBtn.style.display = "none";
          close();
          input.focus();
        });
        document.addEventListener("mousedown", (e) => {
          if (!box.contains(e.target)) close();
        });
      })();
      S._bookmarks = new Set(JSON.parse(localStorage.getItem("wdm_bookmarks") || "[]"));
      (function() {
        var fab = document.getElementById("bookmarks-fab");
        if (fab && S._bookmarks.size) fab.textContent = "\u2605 Saved (" + S._bookmarks.size + ")";
      })();
      (function initCountryCompareSearch() {
        const input = document.getElementById("cc-search-input");
        const results = document.getElementById("cc-search-results");
        if (!input) return;
        function search(q) {
          results.innerHTML = "";
          if (!q || q.length < 1) return;
          const ql = q.toLowerCase();
          const hits = [];
          for (const iso in S.countryData) {
            const cd = S.countryData[iso];
            if (!cd || !cd.name) continue;
            const cnl = cd.name.toLowerCase();
            if (!cnl.includes(ql)) continue;
            const score = cnl === ql ? 0 : cnl.startsWith(ql) ? 1 : 2;
            hits.push({ iso, name: cd.name, score });
          }
          hits.sort((a, b) => a.score - b.score);
          hits.slice(0, 8).forEach((h) => {
            const li = document.createElement("li");
            li.className = "csr-item";
            li.innerHTML = '<span class="csr-name">' + isoToFlag(h.iso) + " " + escHtml(h.name) + '</span><span class="csr-meta">' + h.iso + "</span>";
            li.addEventListener("mousedown", (e) => {
              e.preventDefault();
              selectCountry(h.iso);
            });
            results.appendChild(li);
          });
        }
        function selectCountry(iso) {
          S._ccIsoB = iso;
          const cd = S.countryData[iso];
          input.value = cd ? cd.name : iso;
          results.innerHTML = "";
          _renderCountryComparison();
        }
        input.addEventListener("input", () => search(input.value.trim()));
        input.addEventListener("blur", () => setTimeout(() => {
          results.innerHTML = "";
        }, 150));
      })();
    }
  });

  // src/main.js
  var require_main = __commonJS({
    "src/main.js"() {
      init_app_legacy();
      Object.assign(window, {
        buildEconLayer,
        clearAllFilters,
        closeComparePanel,
        closeCorpPanel,
        closeCountryCompare,
        closeFilterPanel,
        closeLightbox,
        closeModal,
        closeStatsPanel,
        closeTradePanelFn,
        closeWikiSidebar,
        closeGlobalCorpPanel,
        deleteCity,
        fxFetchRates,
        fxResetDefaults,
        gcorpCountryChanged,
        gcorpIndustryChanged,
        gcorpQueryChanged,
        gcorpShowMore,
        gcorpSortChanged,
        lightboxNav,
        openStatsPanel,
        renderCorpList,
        resetAll,
        resetAllLayers,
        saveEdit,
        setCensusColorMetric,
        setCityDotMode,
        setHeatBlur,
        setHeatIntensity,
        setHeatPalette,
        setHeatRadius,
        setHeatmapMetric,
        setMatchedColorMode,
        setMatchedVis,
        setOtherColorMode,
        setOtherVis,
        setStatsScope,
        setValueFilter,
        switchWikiTab,
        toggleAdmin1Global,
        toggleAirRouteLayer,
        toggleAqMode,
        toggleAvailFilter,
        toggleBookmarksPanel,
        toggleCableLayer,
        toggleChoroPlay,
        toggleChoropleth,
        toggleDrawMode,
        setBasemap,
        resetPopRange,
        toggleCities,
        toggleEarthquakeLayer,
        toggleEconLayer,
        toggleEezLayer,
        toggleFilterAqColor,
        toggleFilterPanel,
        toggleFxSidebar,
        toggleGtdLayer,
        toggleIssTracker,
        toggleAircraftLayer,
        toggleWildfireLayer,
        toggleLaunchSiteLayer,
        toggleMoreLayers,
        togglePeeringdbLayer,
        toggleProtectedAreasLayer,
        toggleSatelliteLayer,
        toggleTectonicLayer,
        toggleUnescoIchLayer,
        toggleVesselPortsLayer,
        toggleVolcanoLayer,
        toggleWaqiLayer,
        toggleWeatherLayer,
        toggleCryptoLayer,
        toggleSpaceWeatherLayer,
        toggleOceanLayer,
        toggleFlightAwareLayer,
        toggleMarineTrafficLayer,
        toggleTheme,
        toggleUnescoLayer,
        toggleEonetLayer,
        _switchRadarTab,
        _switchTrendTab,
        _renderCountryPanel,
        carGo,
        carJump,
        carResume,
        carStop,
        clearRegionSelection,
        closeCountryPanel,
        closeRegionPanel,
        corpRowClick,
        flyTo,
        fxInputChanged,
        gcorpRowClick,
        openCarouselLightbox,
        openComparePanel,
        openCorpPanel,
        openCountryCompare,
        openCountryPanel,
        openLightbox,
        openModal,
        openWikiSidebar,
        statsExpandDown,
        statsExpandUp,
        statsGoToCity,
        statsGoToCountry,
        toggleBookmark,
        toggleExtract,
        switchListTab,
        toggleNationsPanel,
        closeAllMobileSheets,
        toggleMobileTopbar
      });
      init();
    }
  });
  require_main();
})();
//# sourceMappingURL=app.js.map
