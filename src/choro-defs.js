// ── Choropleth indicator definitions ────────────────────────────────────────
// Pure data: indicator configurations for the choropleth layer.
// Each indicator defines: key, label, formatter, and color gradient endpoints.

export const CHORO_INDICATORS = [
  {
    key: 'gdp_per_capita', label: 'GDP per capita (USD)', fmt: v => '$' + Math.round(v).toLocaleString(),
    c0: [40, 30, 100], c1: [60, 210, 100], histKey: 'gdp_per_capita_history'
  },
  {
    key: 'life_expectancy', label: 'Life expectancy (years)', fmt: v => v.toFixed(1) + ' yrs',
    c0: [210, 50, 50], c1: [50, 185, 110], histKey: 'life_expectancy_history'
  },
  {
    key: 'internet_pct', label: 'Internet users (%)', fmt: v => v.toFixed(1) + '%',
    c0: [35, 35, 80], c1: [20, 200, 240]
  },
  {
    key: 'urban_pct', label: 'Urban population (%)', fmt: v => v.toFixed(1) + '%',
    c0: [150, 130, 70], c1: [30, 120, 210]
  },
  {
    key: 'literacy_rate', label: 'Literacy rate (%)', fmt: v => v.toFixed(1) + '%',
    c0: [200, 80, 40], c1: [50, 100, 220]
  },
  {
    key: 'electricity_pct', label: 'Electricity access (%)', fmt: v => v.toFixed(1) + '%',
    c0: [60, 40, 20], c1: [240, 200, 50]
  },
  {
    key: 'gini', label: 'Income inequality (Gini)', fmt: v => v.toFixed(1) + ' / 100',
    c0: [50, 180, 100], c1: [220, 50, 50]
  },   // low Gini = more equal = good (green)
  {
    key: 'child_mortality', label: 'Child mortality (/ 1k births)', fmt: v => v.toFixed(1) + ' / 1k',
    c0: [50, 180, 100], c1: [220, 50, 50]
  },
  {
    key: 'co2_per_capita', label: 'CO₂ per capita (tonnes)', fmt: v => v.toFixed(1) + ' t',
    c0: [50, 180, 100], c1: [220, 50, 50]
  },
  {
    key: 'inform_risk', label: 'Disaster Risk (INFORM)', fmt: v => v.toFixed(1) + ' / 10',
    c0: [50, 180, 100], c1: [220, 50, 50]
  },
  {
    key: 'unesco_total', label: 'UNESCO World Heritage Sites', fmt: v => v + ' sites',
    c0: [40, 30, 80], c1: [230, 168, 23]
  },
  {
    key: 'hdi', label: 'Human Development Index', fmt: v => v.toFixed(3),
    c0: [210, 50, 50], c1: [50, 185, 110]
  },
  {
    key: 'who_obesity', label: 'Obesity prevalence (%)', fmt: v => v.toFixed(1) + '%',
    c0: [50, 180, 100], c1: [220, 50, 50]
  },
  {
    key: 'co2_total_mt', label: 'Total CO₂ emissions (Mt)', fmt: v => Math.round(v).toLocaleString() + ' Mt',
    c0: [40, 60, 80], c1: [220, 50, 50]
  },
  {
    key: 'who_hale', label: 'Healthy Life Expectancy (years)', fmt: v => v.toFixed(1) + ' yrs',
    c0: [210, 50, 50], c1: [50, 185, 110]
  },
];

// World Bank country name → URL slug overrides
// WB API names that don't convert cleanly to the portal slug
export const WB_SLUG_OVERRIDES = {
  'Bahamas, The': 'bahamas',
  'Gambia, The': 'gambia',
  "Cote d'Ivoire": 'cote-divoire',
  'Congo, Dem. Rep.': 'congo-democratic-republic',
  'Congo, Rep.': 'congo-republic',
  'Egypt, Arab Rep.': 'egypt-arab-republic',
  'Iran, Islamic Rep.': 'iran-islamic-republic',
  'Korea, Rep.': 'korea-republic',
  "Korea, Dem. People's Rep.": 'korea-democratic-peoples-republic',
  'Lao PDR': 'lao-pdr',
  'Micronesia, Fed. Sts.': 'micronesia',
  'Syrian Arab Republic': 'syrian-arab-republic',
  'Venezuela, RB': 'venezuela',
  'Yemen, Rep.': 'yemen-republic',
  'Hong Kong SAR, China': 'hong-kong-sar-china',
  'Macao SAR, China': 'macao-sar-china',
  'St. Kitts and Nevis': 'st-kitts-and-nevis',
  'St. Lucia': 'st-lucia',
  'St. Vincent and the Grenadines': 'st-vincent-and-the-grenadines',
  'Puerto Rico (US)': 'puerto-rico',
  'Somalia, Fed. Rep.': 'somalia',
};