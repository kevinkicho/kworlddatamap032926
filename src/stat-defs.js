// ── Stat and metric definitions for various data panels ────────────────────────────
// Pure data configurations with color scales, formatters, and metadata.
// No external dependencies - only uses inline functions and literal values.

// Air Quality color stops for city dots (PM2.5 thresholds)
export const AQ_STOPS = [
  { min: 50, color: '#bc8cff', label: 'Severe'    },
  { min: 25, color: '#f85149', label: 'Very Poor' },
  { min: 15, color: '#ffa657', label: 'Poor'      },
  { min: 10, color: '#f0a500', label: 'Moderate'  },
  { min:  5, color: '#58a6ff', label: 'Acceptable'},
  { min:  0, color: '#3fb950', label: 'Good'      },
];

// Census income bracket labels and colors for city visualization
export const CENSUS_BRACKET_LABELS = ['< $15k','$15–25k','$25–50k','$50–75k','$75–100k','$100–150k','$150–200k','$200k+'];
export const CENSUS_BRACKET_COLORS = ['#8b949e','#58a6ff','#2a8ee8','#3fb950','#56d364','#ffa657','#f0a500','#e05c2e'];

// Color scale config per metric: { lo, hi, stops: [[r,g,b],…] }
export const CENSUS_METRICS = {
  medianIncome:    { label: 'Median Income',    lo: '$30k', hi: '$150k+', min: 30000,  max: 150000, stops: [[31,102,235],[63,185,80],[240,165,0]] },
  povertyPct:      { label: 'Poverty Rate',     lo: '0%',   hi: '40%+',  min: 0,      max: 40,     stops: [[63,185,80],[255,166,87],[248,81,73]] },
  unemploymentPct: { label: 'Unemployment',     lo: '0%',   hi: '15%+',  min: 0,      max: 15,     stops: [[63,185,80],[255,166,87],[248,81,73]] },
  rentBurdenedPct: { label: 'Rent-Burdened',    lo: '10%',  hi: '60%+',  min: 10,     max: 60,     stops: [[63,185,80],[255,166,87],[248,81,73]] },
  gini:            { label: 'Gini Index',       lo: '0.30', hi: '0.60+', min: 0.30,   max: 0.60,   stops: [[63,185,80],[255,166,87],[248,81,73]] },
  bachelorPlusPct: { label: 'College-Educated', lo: '10%',  hi: '70%+',  min: 10,     max: 70,     stops: [[31,102,235],[88,166,255],[224,240,255]] },
  snapPct:         { label: 'SNAP Receipt',     lo: '0%',   hi: '30%+',  min: 0,      max: 30,     stops: [[63,185,80],[255,166,87],[248,81,73]] },
  transitPct:      { label: 'Transit Use',      lo: '0%',   hi: '40%+',  min: 0,      max: 40,     stops: [[224,240,255],[88,166,255],[31,102,235]] },
  medianAge:       { label: 'Median Age',       lo: '25',   hi: '45+',   min: 25,     max: 45,     stops: [[88,166,255],[31,102,235],[111,66,193]] },
  ownerOccPct:     { label: 'Homeownership',    lo: '20%',  hi: '80%+',  min: 20,     max: 80,     stops: [[224,240,255],[63,185,80],[31,102,235]] },
};

// Note: CORP_STAT_DEFS uses toUSD() which is defined in app-legacy.js and cannot be cleanly extracted