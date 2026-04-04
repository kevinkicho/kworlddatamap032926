// scripts/enrich-freedom-scores.js
// Adds Transparency International CPI 2023 and Freedom House 2024 scores
// to public/country-data.json.
//
// Fields added:
//   ti_cpi_score   — Transparency Intl Corruption Perceptions Index 0–100 (100=clean)
//   ti_cpi_rank    — Global rank (1=least corrupt)
//   ti_cpi_year    — 2023
//   fh_score       — Freedom House "Freedom in the World" aggregate score 0–100
//   fh_status      — "Free" | "Partly Free" | "Not Free"
//   fh_year        — 2024
//
// Sources:
//   TI CPI 2023: https://www.transparency.org/en/cpi/2023
//   Freedom House 2024: https://freedomhouse.org/report/freedom-world
//
// Update procedure (annual): replace DATA arrays below, increment year fields.
// Run: node scripts/enrich-freedom-scores.js
'use strict';
const fs   = require('fs');
const path = require('path');

const OUT_FILE = path.join(__dirname, '..', 'public', 'country-data.json');

// ── Transparency International CPI 2023 ──────────────────────────────────────
// score: 0–100 (higher = less corrupt / cleaner)
// Top 50 + major economies + notable cases. ~120 countries total.
// Sorted by score descending for readability.
const TI_CPI_2023 = [
  // Score 90+
  { iso2:'DK', score:90 }, { iso2:'FI', score:87 }, { iso2:'NZ', score:85 },
  { iso2:'NO', score:84 }, { iso2:'SG', score:83 }, { iso2:'SE', score:82 },
  { iso2:'CH', score:82 }, { iso2:'NL', score:79 }, { iso2:'LU', score:78 },
  { iso2:'DE', score:78 }, { iso2:'IS', score:77 }, { iso2:'AU', score:75 },
  { iso2:'AT', score:74 }, { iso2:'CA', score:74 }, { iso2:'HK', score:75 },
  { iso2:'GB', score:71 }, { iso2:'IE', score:77 }, { iso2:'BE', score:73 },
  { iso2:'EE', score:76 }, { iso2:'JP', score:73 }, { iso2:'FR', score:71 },
  { iso2:'US', score:69 }, { iso2:'AE', score:68 }, { iso2:'UY', score:73 },
  { iso2:'BH', score:56 }, { iso2:'CL', score:66 }, { iso2:'QA', score:58 },
  // Score 60–69
  { iso2:'CY', score:53 }, { iso2:'PT', score:61 }, { iso2:'ES', score:60 },
  { iso2:'CZ', score:56 }, { iso2:'GE', score:53 }, { iso2:'IT', score:56 },
  { iso2:'LT', score:60 }, { iso2:'LV', score:59 }, { iso2:'PL', score:54 },
  { iso2:'KR', score:63 }, { iso2:'MT', score:51 }, { iso2:'SK', score:52 },
  { iso2:'TW', score:67 }, { iso2:'BW', score:59 }, { iso2:'HR', score:51 },
  { iso2:'IL', score:62 }, { iso2:'SA', score:52 }, { iso2:'SI', score:59 },
  // Score 50–59
  { iso2:'GH', score:43 }, { iso2:'HU', score:42 }, { iso2:'CN', score:42 },
  { iso2:'MX', score:31 }, { iso2:'IN', score:39 }, { iso2:'JO', score:48 },
  { iso2:'GR', score:49 }, { iso2:'KW', score:46 }, { iso2:'RO', score:46 },
  { iso2:'MU', score:52 }, { iso2:'BG', score:45 }, { iso2:'OM', score:55 },
  { iso2:'RS', score:36 }, { iso2:'TN', score:40 }, { iso2:'AL', score:37 },
  { iso2:'AM', score:46 }, { iso2:'AR', score:37 }, { iso2:'BR', score:36 },
  { iso2:'CI', score:37 }, { iso2:'CO', score:39 }, { iso2:'CR', score:55 },
  { iso2:'DO', score:30 }, { iso2:'EC', score:35 }, { iso2:'EG', score:35 },
  { iso2:'ET', score:37 }, { iso2:'ID', score:34 }, { iso2:'KE', score:31 },
  { iso2:'MA', score:38 }, { iso2:'MN', score:38 }, { iso2:'PE', score:33 },
  { iso2:'PH', score:34 }, { iso2:'RW', score:53 }, { iso2:'SN', score:43 },
  { iso2:'TH', score:35 }, { iso2:'TR', score:34 }, { iso2:'UA', score:36 },
  { iso2:'VN', score:41 }, { iso2:'ZA', score:41 }, { iso2:'ZW', score:24 },
  // Score 30–49
  { iso2:'AZ', score:23 }, { iso2:'BA', score:35 }, { iso2:'BD', score:25 },
  { iso2:'BO', score:26 }, { iso2:'BY', score:25 }, { iso2:'DZ', score:36 },
  { iso2:'GT', score:24 }, { iso2:'HN', score:23 }, { iso2:'IQ', score:23 },
  { iso2:'IR', score:24 }, { iso2:'KH', score:22 }, { iso2:'KZ', score:35 },
  { iso2:'LB', score:24 }, { iso2:'LY', score:18 }, { iso2:'MM', score:20 },
  { iso2:'MZ', score:26 }, { iso2:'NE', score:33 }, { iso2:'NG', score:25 },
  { iso2:'NI', score:17 }, { iso2:'PK', score:29 }, { iso2:'RU', score:26 },
  { iso2:'SD', score:20 }, { iso2:'SY', score:13 }, { iso2:'TJ', score:21 },
  { iso2:'TM', score:18 }, { iso2:'TZ', score:36 }, { iso2:'UZ', score:27 },
  { iso2:'VE', score:13 }, { iso2:'YE', score:16 }, { iso2:'CM', score:27 },
  { iso2:'CD', score:20 }, { iso2:'CG', score:21 }, { iso2:'CF', score:20 },
  { iso2:'AF', score:20 }, { iso2:'SO', score:11 }, { iso2:'SS', score:13 },
  // Additional mid-range countries
  { iso2:'MY', score:50 }, { iso2:'PA', score:35 }, { iso2:'PY', score:28 },
  { iso2:'SV', score:31 }, { iso2:'TT', score:44 }, { iso2:'NA', score:49 },
  { iso2:'GA', score:31 }, { iso2:'MW', score:34 }, { iso2:'UG', score:26 },
  { iso2:'ZM', score:33 }, { iso2:'MK', score:42 }, { iso2:'MG', score:28 },
  { iso2:'LK', score:34 }, { iso2:'XK', score:41 }, { iso2:'GY', score:40 },
  { iso2:'SB', score:43 }, { iso2:'VU', score:42 }, { iso2:'FM', score:55 },
];

// ── Freedom House "Freedom in the World" 2024 ─────────────────────────────────
// score: 0–100 aggregate (PR + CL subscores, scaled)
// status: "Free" (70–100), "Partly Free" (36–69), "Not Free" (0–35)
const FH_2024 = [
  // Free
  { iso2:'FI', score:100, status:'Free' }, { iso2:'NO', score:100, status:'Free' },
  { iso2:'SE', score:100, status:'Free' }, { iso2:'IS', score:100, status:'Free' },
  { iso2:'NZ', score:99, status:'Free'  }, { iso2:'DK', score:97, status:'Free'  },
  { iso2:'CH', score:96, status:'Free'  }, { iso2:'IE', score:97, status:'Free'  },
  { iso2:'CA', score:98, status:'Free'  }, { iso2:'LU', score:98, status:'Free'  },
  { iso2:'NL', score:98, status:'Free'  }, { iso2:'AU', score:97, status:'Free'  },
  { iso2:'AT', score:93, status:'Free'  }, { iso2:'BE', score:95, status:'Free'  },
  { iso2:'DE', score:94, status:'Free'  }, { iso2:'PT', score:95, status:'Free'  },
  { iso2:'GB', score:93, status:'Free'  }, { iso2:'FR', score:90, status:'Free'  },
  { iso2:'JP', score:96, status:'Free'  }, { iso2:'US', score:83, status:'Free'  },
  { iso2:'KR', score:83, status:'Free'  }, { iso2:'CL', score:93, status:'Free'  },
  { iso2:'CZ', score:93, status:'Free'  }, { iso2:'EE', score:94, status:'Free'  },
  { iso2:'GR', score:84, status:'Free'  }, { iso2:'IL', score:76, status:'Free'  },
  { iso2:'IT', score:90, status:'Free'  }, { iso2:'LT', score:90, status:'Free'  },
  { iso2:'LV', score:87, status:'Free'  }, { iso2:'ES', score:90, status:'Free'  },
  { iso2:'TW', score:94, status:'Free'  }, { iso2:'UY', score:98, status:'Free'  },
  { iso2:'SK', score:85, status:'Free'  }, { iso2:'SI', score:93, status:'Free'  },
  { iso2:'GH', score:82, status:'Free'  }, { iso2:'NA', score:79, status:'Free'  },
  { iso2:'MU', score:89, status:'Free'  }, { iso2:'BW', score:72, status:'Free'  },
  { iso2:'AR', score:84, status:'Free'  }, { iso2:'BR', score:73, status:'Free'  },
  { iso2:'CO', score:66, status:'Partly Free' }, // borderline
  { iso2:'ZA', score:79, status:'Free'  },
  // Partly Free
  { iso2:'IN', score:66, status:'Partly Free' }, { iso2:'ID', score:59, status:'Partly Free' },
  { iso2:'MY', score:51, status:'Partly Free' }, { iso2:'MX', score:60, status:'Partly Free' },
  { iso2:'NG', score:43, status:'Partly Free' }, { iso2:'PK', score:37, status:'Partly Free' },
  { iso2:'PH', score:56, status:'Partly Free' }, { iso2:'KE', score:48, status:'Partly Free' },
  { iso2:'TH', score:30, status:'Not Free'    }, { iso2:'TR', score:32, status:'Not Free'    },
  { iso2:'UA', score:61, status:'Partly Free' }, { iso2:'HU', score:66, status:'Partly Free' },
  { iso2:'TN', score:40, status:'Partly Free' }, { iso2:'MA', score:37, status:'Partly Free' },
  { iso2:'LB', score:44, status:'Partly Free' }, { iso2:'BD', score:40, status:'Partly Free' },
  { iso2:'AM', score:42, status:'Partly Free' }, { iso2:'GE', score:61, status:'Partly Free' },
  { iso2:'AL', score:66, status:'Partly Free' }, { iso2:'BA', score:53, status:'Partly Free' },
  { iso2:'RS', score:57, status:'Partly Free' }, { iso2:'KH', score:22, status:'Not Free'    },
  { iso2:'ET', score:28, status:'Not Free'    }, { iso2:'TZ', score:42, status:'Partly Free' },
  { iso2:'MZ', score:43, status:'Partly Free' }, { iso2:'ZM', score:55, status:'Partly Free' },
  { iso2:'EC', score:64, status:'Partly Free' }, { iso2:'BO', score:65, status:'Partly Free' },
  { iso2:'PE', score:67, status:'Partly Free' }, { iso2:'DO', score:66, status:'Partly Free' },
  { iso2:'GT', score:46, status:'Partly Free' }, { iso2:'HN', score:37, status:'Partly Free' },
  { iso2:'SN', score:72, status:'Free'        }, { iso2:'RW', score:22, status:'Not Free'    },
  { iso2:'KZ', score:23, status:'Not Free'    }, { iso2:'UZ', score:11, status:'Not Free'    },
  { iso2:'MN', score:64, status:'Partly Free' }, { iso2:'MK', score:60, status:'Partly Free' },
  { iso2:'LK', score:55, status:'Partly Free' }, { iso2:'VN', score:19, status:'Not Free'    },
  { iso2:'MM', score:9,  status:'Not Free'    }, { iso2:'SG', score:47, status:'Partly Free' },
  // Not Free
  { iso2:'CN', score:9,  status:'Not Free'    }, { iso2:'RU', score:16, status:'Not Free'    },
  { iso2:'SA', score:8,  status:'Not Free'    }, { iso2:'AE', score:17, status:'Not Free'    },
  { iso2:'IR', score:14, status:'Not Free'    }, { iso2:'IQ', score:29, status:'Not Free'    },
  { iso2:'EG', score:23, status:'Not Free'    }, { iso2:'DZ', score:27, status:'Not Free'    },
  { iso2:'SD', score:7,  status:'Not Free'    }, { iso2:'AF', score:5,  status:'Not Free'    },
  { iso2:'SY', score:1,  status:'Not Free'    }, { iso2:'YE', score:10, status:'Not Free'    },
  { iso2:'VE', score:16, status:'Not Free'    }, { iso2:'NI', score:11, status:'Not Free'    },
  { iso2:'BY', score:9,  status:'Not Free'    }, { iso2:'AZ', score:10, status:'Not Free'    },
  { iso2:'TJ', score:6,  status:'Not Free'    }, { iso2:'TM', score:2,  status:'Not Free'    },
  { iso2:'LY', score:8,  status:'Not Free'    }, { iso2:'SS', score:5,  status:'Not Free'    },
  { iso2:'SO', score:8,  status:'Not Free'    }, { iso2:'CF', score:12, status:'Not Free'    },
  { iso2:'CD', score:20, status:'Not Free'    }, { iso2:'ZW', score:26, status:'Not Free'    },
  { iso2:'CM', score:24, status:'Not Free'    }, { iso2:'NG', score:43, status:'Partly Free' },
  { iso2:'QA', score:25, status:'Not Free'    }, { iso2:'KW', score:35, status:'Not Free'    },
  { iso2:'BH', score:10, status:'Not Free'    }, { iso2:'OM', score:23, status:'Not Free'    },
  { iso2:'PA', score:58, status:'Partly Free' }, { iso2:'PY', score:64, status:'Partly Free' },
  { iso2:'SV', score:44, status:'Partly Free' }, { iso2:'UG', score:30, status:'Not Free'    },
  { iso2:'HK', score:43, status:'Partly Free' }, { iso2:'CI', score:50, status:'Partly Free' },
  { iso2:'NE', score:37, status:'Partly Free' },
];

const out = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));

// TI CPI: sort by score desc to compute ranks
const tiSorted = [...TI_CPI_2023].sort((a, b) => b.score - a.score);
tiSorted.forEach(({ iso2, score }, i) => {
  if (!out[iso2]) out[iso2] = {};
  out[iso2].ti_cpi_score = score;
  out[iso2].ti_cpi_rank  = i + 1;
  out[iso2].ti_cpi_year  = 2023;
});

// Freedom House
for (const { iso2, score, status } of FH_2024) {
  if (!out[iso2]) out[iso2] = {};
  out[iso2].fh_score  = score;
  out[iso2].fh_status = status;
  out[iso2].fh_year   = 2024;
}

fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), 'utf8');
console.log(`TI CPI 2023: ${TI_CPI_2023.length} countries`);
console.log(`Freedom House 2024: ${FH_2024.length} countries`);
console.log(`Written to ${OUT_FILE}`);
