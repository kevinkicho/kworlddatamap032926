// ── Constants: FX rates, coordinate mappings, region lookups ─────────────────────
// These are pure data definitions with no dependencies on app state or DOM.

// Currency labels shown in the FX sidebar
export const FX_LABELS = {
  USD:'US Dollar', EUR:'Euro', GBP:'British Pound', JPY:'Japanese Yen',
  CNY:'Chinese Yuan', KRW:'South Korean Won', INR:'Indian Rupee',
  BRL:'Brazilian Real', CAD:'Canadian Dollar', AUD:'Australian Dollar',
  CHF:'Swiss Franc', SEK:'Swedish Krona', NOK:'Norwegian Krone',
  DKK:'Danish Krone', PLN:'Polish Złoty', HKD:'Hong Kong Dollar',
  SGD:'Singapore Dollar', TWD:'New Taiwan Dollar', MXN:'Mexican Peso',
  ZAR:'South African Rand', TRY:'Turkish Lira', RUB:'Russian Ruble',
  IDR:'Indonesian Rupiah', MYR:'Malaysian Ringgit', PHP:'Philippine Peso',
  THB:'Thai Baht', NGN:'Nigerian Naira', AED:'UAE Dirham',
  SAR:'Saudi Riyal', EGP:'Egyptian Pound', QAR:'Qatari Riyal',
  KWD:'Kuwaiti Dinar', BHD:'Bahraini Dinar', OMR:'Omani Rial',
  CZK:'Czech Koruna', HUF:'Hungarian Forint', RON:'Romanian Leu',
  BGN:'Bulgarian Lev', HRK:'Croatian Kuna', RSD:'Serbian Dinar',
  UAH:'Ukrainian Hryvnia', KZT:'Kazakhstani Tenge', DZD:'Algerian Dinar',
  MAD:'Moroccan Dirham', TND:'Tunisian Dinar', GHS:'Ghanaian Cedi',
  KES:'Kenyan Shilling', ETB:'Ethiopian Birr', COP:'Colombian Peso',
  PEN:'Peruvian Sol', CLP:'Chilean Peso', ARS:'Argentine Peso',
  ILS:'Israeli Shekel', JOD:'Jordanian Dinar', PKR:'Pakistani Rupee',
  BDT:'Bangladeshi Taka', LKR:'Sri Lankan Rupee', VND:'Vietnamese Dong',
  MNT:'Mongolian Tögrög', NZD:'New Zealand Dollar',
  IQD:'Iraqi Dinar', SYP:'Syrian Pound', UZS:'Uzbekistani Som',
  XAF:'Central African CFA Franc', XOF:'West African CFA Franc', GNF:'Guinean Franc',
  CRC:'Costa Rican Colon', ZWG:'Zimbabwe Gold', GEL:'Georgian Lari',
  BTC:'Bitcoin', ETH:'Ethereum',
};

// Approximate 2026 FX rates to USD (used only for relative dot sizing, not financial reporting)
export const FX_TO_USD = {
  USD: 1, EUR: 1.08, GBP: 1.27, JPY: 0.0067, CNY: 0.138, KRW: 0.00075,
  INR: 0.012, BRL: 0.196, CAD: 0.737, AUD: 0.648, CHF: 1.13, SEK: 0.096,
  NOK: 0.092, DKK: 0.145, PLN: 0.249, HKD: 0.128, SGD: 0.740, TWD: 0.031,
  MXN: 0.052, ZAR: 0.055, TRY: 0.029, RUB: 0.011, IDR: 6.3e-5, MYR: 0.224,
  PHP: 0.0173, THB: 0.028, NGN: 0.00063, AED: 0.272, SAR: 0.267, EGP: 0.020,
  QAR: 0.274, KWD: 3.25, BHD: 2.65, OMR: 2.60, CZK: 0.044, HUF: 0.0028,
  RON: 0.218, BGN: 0.555, HRK: 0.145, RSD: 0.0093, UAH: 0.024, KZT: 0.0021,
  DZD: 0.0075, MAD: 0.10, TND: 0.32, GHS: 0.067, KES: 0.0077, ETB: 0.0083,
  COP: 0.00024, PEN: 0.27, CLP: 0.00107, ARS: 0.00098, ILS: 0.27, JOD: 1.41,
  PKR: 0.0036, BDT: 0.0091, LKR: 0.0034, VND: 0.000039, MNT: 0.00029,
  IQD: 0.00077, SYP: 0.0000075, UZS: 0.000079,
  XAF: 0.0017, XOF: 0.0017, GNF: 0.000115,
  CRC: 0.0019, ZWG: 0.000055, GEL: 0.37,
  BTC: 65000, ETH: 3200,
};

// US state full name → 2-letter abbreviation (for city→state lookup via census placeName)
export const STATE_NAME_TO_ABBR = {
  'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA',
  'Colorado':'CO','Connecticut':'CT','Delaware':'DE','District of Columbia':'DC',
  'Florida':'FL','Georgia':'GA','Hawaii':'HI','Idaho':'ID','Illinois':'IL',
  'Indiana':'IN','Iowa':'IA','Kansas':'KS','Kentucky':'KY','Louisiana':'LA',
  'Maine':'ME','Maryland':'MD','Massachusetts':'MA','Michigan':'MI','Minnesota':'MN',
  'Mississippi':'MS','Missouri':'MO','Montana':'MT','Nebraska':'NE','Nevada':'NV',
  'New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM','New York':'NY',
  'North Carolina':'NC','North Dakota':'ND','Ohio':'OH','Oklahoma':'OK','Oregon':'OR',
  'Pennsylvania':'PA','Rhode Island':'RI','South Carolina':'SC','South Dakota':'SD',
  'Tennessee':'TN','Texas':'TX','Utah':'UT','Vermont':'VT','Virginia':'VA',
  'Washington':'WA','West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY',
};

// ISO2 country code → currency code (for FX sidebar dot sizing)
export const ISO2_TO_CURRENCY = {
  US:'USD', GB:'GBP', DE:'EUR', FR:'EUR', IT:'EUR', ES:'EUR', NL:'EUR',
  BE:'EUR', AT:'EUR', PT:'EUR', FI:'EUR', IE:'EUR', GR:'EUR', LU:'EUR',
  JP:'JPY', CN:'CNY', KR:'KRW', IN:'INR', BR:'BRL', CA:'CAD', AU:'AUD',
  CH:'CHF', SE:'SEK', NO:'NOK', DK:'DKK', PL:'PLN', HK:'HKD', SG:'SGD',
  TW:'TWD', MX:'MXN', ZA:'ZAR', TR:'TRY', RU:'RUB', ID:'IDR', MY:'MYR',
  PH:'PHP', TH:'THB', NG:'NGN', AE:'AED', SA:'SAR', EG:'EGP', QA:'QAR',
  KW:'KWD', BH:'BHD', OM:'OMR', CZ:'CZK', HU:'HUF', RO:'RON', BG:'BGN',
  HR:'HRK', RS:'RSD', UA:'UAH', KZ:'KZT', DZ:'DZD', MA:'MAD', TN:'TND',
  GH:'GHS', KE:'KES', ET:'ETB', CO:'COP', PE:'PEN', CL:'CLP', AR:'ARS',
  IL:'ILS', JO:'JOD', PK:'PKR', BD:'BDT', LK:'LKR', VN:'VND', MN:'MNT',
  NZ:'NZD', SK:'EUR', SI:'EUR', EE:'EUR', LV:'EUR', LT:'EUR',
  CY:'EUR', MT:'EUR',
  IQ:'IQD', SY:'SYP', UZ:'UZS',
  CM:'XAF', CF:'XAF', CG:'XAF', GA:'XAF', GQ:'XAF', TD:'XAF',
  BJ:'XOF', BF:'XOF', CI:'XOF', GW:'XOF', ML:'XOF', NE:'XOF', SN:'XOF', TG:'XOF',
  GN:'GNF', CR:'CRC', ZW:'ZWG', GE:'GEL',
};

// Capital city coordinates for country centering (used for choropleth, trade arrows, etc.)
export const CAPITAL_COORDS = {
  US:[38.91,-77.04],  AU:[-35.28,149.13], AT:[48.21,16.37],  BE:[50.85,4.35],
  BR:[-15.78,-47.93], CA:[45.42,-75.69],  CL:[-33.46,-70.65],CN:[39.91,116.39],
  CO:[4.71,-74.07],   CZ:[50.08,14.44],   DK:[55.68,12.57],  EG:[30.06,31.25],
  FI:[60.17,24.94],   FR:[48.86,2.35],    DE:[52.52,13.41],  GR:[37.98,23.73],
  HK:[22.32,114.17],  HU:[47.50,19.04],   IN:[28.61,77.21],  ID:[-6.21,106.85],
  IE:[53.33,-6.25],   IL:[31.78,35.22],   IT:[41.90,12.50],  JP:[35.69,139.69],
  JO:[31.96,35.95],   KE:[-1.29,36.82],   KW:[29.37,47.98],  MY:[3.14,101.69],
  MX:[19.43,-99.13],  MA:[34.02,-6.85],   NL:[52.37,4.89],   NZ:[-41.29,174.78],
  NG:[9.07,7.40],     NO:[59.91,10.75],   OM:[23.61,58.59],  PK:[33.72,73.04],
  PE:[-12.04,-77.03], PH:[14.60,120.98],  PL:[52.23,21.01],  PT:[38.72,-9.14],
  QA:[25.29,51.53],   RU:[55.75,37.62],   SA:[24.69,46.72],  ZA:[-25.74,28.19],
  KR:[37.57,126.98],  ES:[40.42,-3.70],   SE:[59.33,18.07],  CH:[46.95,7.45],
  TW:[25.04,121.56],  TH:[13.75,100.52],  TR:[39.92,32.85],  AE:[24.47,54.37],
  GB:[51.51,-0.13],   VN:[21.03,105.83],  BD:[23.72,90.41],  AR:[-34.61,-58.38],
  UA:[50.45,30.52],   RO:[44.44,26.10],   SK:[48.15,17.11],  DZ:[36.74,3.06],
  GT:[14.64,-90.51],  HN:[14.10,-87.21],  CR:[9.93,-84.08],  PA:[8.99,-79.52],
  DO:[18.48,-69.90],  CU:[23.13,-82.38],  TT:[10.65,-61.52], KZ:[51.18,71.45],
  UZ:[41.30,69.24],   AZ:[40.41,49.87],   GE:[41.69,44.83],  AM:[40.18,44.51],
  LB:[33.89,35.50],   IQ:[33.34,44.40],   LK:[6.93,79.85],   MM:[16.87,96.19],
  KH:[11.55,104.92],  MN:[47.91,106.89],  ET:[9.03,38.74],   GH:[5.56,-0.20],
  TZ:[-6.80,39.27],   AO:[-8.84,13.23],   ZM:[-15.42,28.28], MZ:[-25.97,32.57],
  BW:[-24.65,25.91],  MU:[-20.16,57.50],  EC:[-0.22,-78.51], VE:[10.50,-66.92],
  UY:[-34.90,-56.19], BO:[-16.50,-68.15], PY:[-25.28,-57.64],SV:[13.69,-89.19],
  NI:[12.14,-86.28],  BZ:[17.25,-88.77],  JM:[17.99,-76.79], AF:[34.53,69.17],
  NP:[27.70,85.32],   FJ:[-18.14,178.44], PG:[-9.44,147.18], BG:[42.70,23.32],
  HR:[45.81,15.97],   RS:[44.82,20.46],   SI:[46.05,14.51],  LU:[49.61,6.13],
  CY:[35.17,33.36],   MT:[35.90,14.51],   LT:[54.69,25.28],  LV:[56.95,24.11],
  EE:[59.44,24.75],   MD:[47.00,28.86],   BA:[43.85,18.40],  AL:[41.33,19.82],
  MK:[41.99,21.43],   LY:[32.90,13.18],   SD:[15.55,32.53],  TN:[36.82,10.17],
  CM:[3.87,11.52],    SN:[14.69,-17.44],  CD:[-4.32,15.32],  MG:[-18.91,47.54],
  RW:[-1.94,30.06],   UG:[0.32,32.58],    CI:[5.36,-4.01],
  // Small countries / microstates missing from world GeoJSON centroids
  MC:[43.74,7.43],   SM:[43.94,12.46],   LI:[47.14,9.52],   AD:[42.51,1.52],
  VA:[41.90,12.45],  SG:[1.35,103.82],   IS:[64.14,-21.90], BH:[26.21,50.59],
  MV:[4.18,73.51],   BN:[4.94,114.95],   SC:[-4.62,55.45],  MO:[22.20,113.54],
  XK:[42.67,21.17],  PS:[31.95,35.23],   KP:[39.02,125.76],  KI:[1.33,172.98],
  TV:[-8.52,179.20], NR:[-0.53,166.92], PW:[7.50,134.62],   MH:[7.11,171.18],
  FM:[6.92,158.16],  WS:[-13.82,-172.14],TO:[-21.14,-175.20],VU:[-17.73,168.32],
  SB:[-9.43,160.04], FO:[62.01,-6.77],  GL:[64.18,-51.74],  NC:[-22.27,166.46],
  PF:[-17.53,-149.57],KG:[42.87,74.59],  TJ:[38.56,68.77],   TM:[37.95,58.38],
  TL:[-8.56,125.57], GN:[9.54,-13.68],   GM:[13.45,-16.58],  GW:[11.86,-15.60],
  SL:[8.49,-13.23],  LR:[6.30,-10.80],   ML:[12.65,-8.00],   BF:[12.37,-1.52],
  NE:[13.51,2.12],   TD:[12.11,15.04],   CF:[4.36,18.55],    CG:[-4.27,15.29],
  GQ:[3.75,8.78],    GA:[0.39,9.45],     DJ:[11.59,43.15],   ER:[15.34,38.93],
  SO:[2.05,45.34],   SS:[4.86,31.57],    LS:[-29.32,27.48],  SZ:[-26.32,31.14],
  MW:[-13.97,33.79], MR:[18.08,-15.97],  ST:[0.34,6.73],     CV:[14.93,-23.51],
  KM:[-11.70,43.26], GD:[12.06,-61.74],  DM:[15.30,-61.39],  LC:[13.91,-60.98],
  KN:[17.30,-62.72], VC:[13.16,-61.23],  AG:[17.12,-61.85],  BB:[13.10,-59.62],
  BS:[25.08,-77.35], HT:[18.54,-72.34],  GI:[36.14,-5.35],   IM:[54.15,-4.49],
};

// Map ISO-2 country code → Wikipedia language subdomain
// Used to prefer the local-language Wikipedia article over English
export const ISO_TO_WIKI_LANG = {
  JP: 'ja', CN: 'zh', KR: 'ko', TW: 'zh', HK: 'zh',
  DE: 'de', AT: 'de', CH: 'de',
  FR: 'fr', BE: 'fr',
  ES: 'es', MX: 'es', AR: 'es', CO: 'es', CL: 'es', PE: 'es', VE: 'es',
  PT: 'pt', BR: 'pt',
  IT: 'it',
  RU: 'ru', BY: 'be', UA: 'uk',
  NL: 'nl',
  PL: 'pl', CZ: 'cs', SK: 'sk', HU: 'hu', RO: 'ro', BG: 'bg', HR: 'hr',
  SE: 'sv', NO: 'no', DK: 'da', FI: 'fi',
  TR: 'tr', GR: 'el', IL: 'he', SA: 'ar', AE: 'ar', EG: 'ar',
  IN: 'hi', ID: 'id', TH: 'th', VN: 'vi', MY: 'ms',
};

// Canadian province name → abbreviation
export const CA_PROV_TO_ABBR = {
  'Alberta':'AB','British Columbia':'BC','Manitoba':'MB','New Brunswick':'NB',
  'Newfoundland and Labrador':'NL','Northwest Territories':'NT','Nova Scotia':'NS',
  'Nunavut':'NU','Ontario':'ON','Prince Edward Island':'PE','Quebec':'QC',
  'Saskatchewan':'SK','Yukon':'YT',
};

// Australian state name → abbreviation
export const AU_STATE_TO_ABBR = {
  'New South Wales':'NSW','Victoria':'VIC','Queensland':'QLD','Western Australia':'WA',
  'South Australia':'SA','Tasmania':'TAS','Australian Capital Territory':'ACT',
  'Northern Territory':'NT',
};