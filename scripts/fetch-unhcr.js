/**
 * Fetch refugee data from UNHCR Global Data Service
 *
 * UNHCR provides public API access to refugee statistics without requiring an API key.
 * Documentation: https://www.unhcr.org/what-we-do/reports-and-publications/data-and-statistics/global-public-api
 *
 * Endpoints:
 * - Population data: https://api.unhcr.org/pop/v1/population
 * - Countries: https://api.unhcr.org/rs/countries
 */

const fs = require('fs');
const path = require('path');

const OUTPUT = path.join(__dirname, '..', 'public', 'unhcr-refugees.json');
const COUNTRY_DATA = path.join(__dirname, '..', 'public', 'country-data.json');

// UNHCR API endpoints
const UNHCR_POP_URL = 'https://api.unhcr.org/pop/v1/population';

/**
 * Fetch refugee population data from UNHCR
 *
 * The API supports filtering by:
 * - year: 1951-present
 * - country_of_origin: ISO3 country code
 * - country_of_asylum: ISO3 country code
 * - population_type: REF, IDP, AS, etc.
 */
async function fetchRefugeeData() {
  console.log('[unhcr] Fetching refugee data from UNHCR...');

  try {
    // Fetch population data for all countries, most recent year
    // We'll get data for refugees (REF) and internally displaced persons (IDP)
    const currentYear = new Date().getFullYear();

    // Try multiple years to get data (API might not have current year data yet)
    let data = null;
    let year = currentYear - 1; // Start with last year

    while (!data && year >= 2020) {
      console.log(`[unhcr] Trying year ${year}...`);
      try {
        const url = `${UNHCR_POP_URL}?year=${year}&population_type=REF`;
        const res = await fetch(url);

        if (res.ok) {
          const items = await res.json();
          if (items && items.items && items.items.length > 0) {
            data = { year, items: items.items };
            console.log(`[unhcr] Found ${items.items.length} records for year ${year}`);
          }
        }
      } catch (e) {
        console.log(`[unhcr] Year ${year} failed: ${e.message}`);
      }
      year--;
    }

    if (!data) {
      // Use static fallback data if API fails
      console.log('[unhcr] API unavailable, using static fallback data');
      return generateFallbackData();
    }

    // Process the data into country-level aggregates
    return processRefugeeData(data);

  } catch (err) {
    console.error('[unhcr] Error:', err.message);
    console.log('[unhcr] Using fallback data');
    return generateFallbackData();
  }
}

/**
 * Process raw UNHCR data into country-level statistics
 */
function processRefugeeData(data) {
  const byOrigin = {};      // Refugees FROM each country
  const byAsylum = {};      // Refugees IN each country

  for (const item of data.items) {
    const originIso3 = item.country_of_origin;
    const asylumIso3 = item.country_of_asylum;
    const count = parseInt(item.population) || 0;

    // Convert ISO3 to ISO2 (we'll need a mapping)
    // For now, store with ISO3 and convert later

    // Refugees by origin (people fleeing FROM this country)
    if (originIso3) {
      if (!byOrigin[originIso3]) {
        byOrigin[originIso3] = { total: 0, year: data.year };
      }
      byOrigin[originIso3].total += count;
    }

    // Refugees by asylum (refugees hosted BY this country)
    if (asylumIso3) {
      if (!byAsylum[asylumIso3]) {
        byAsylum[asylumIso3] = { total: 0, year: data.year };
      }
      byAsylum[asylumIso3].total += count;
    }
  }

  console.log(`[unhcr] Processed ${Object.keys(byOrigin).length} origin countries, ${Object.keys(byAsylum).length} asylum countries`);

  return {
    year: data.year,
    by_origin: byOrigin,
    by_asylum: byAsylum,
    source: 'UNHCR Global Data Service'
  };
}

/**
 * Generate fallback data from known major refugee situations
 */
function generateFallbackData() {
  // Based on UNHCR 2023 data for major refugee populations
  // This is a simplified dataset for key countries
  const byOrigin = {
    'SYR': { total: 13530000, year: 2023 },  // Syria
    'AFG': { total: 10840000, year: 2023 },  // Afghanistan
    'SSD': { total: 4360000, year: 2023 },   // South Sudan
    'MMR': { total: 2730000, year: 2023 },   // Myanmar
    'SOM': { total: 2620000, year: 2023 },   // Somalia
    'SDN': { total: 2350000, year: 2023 },   // Sudan
    'COD': { total: 2280000, year: 2023 },   // DRC
    'UKR': { total: 1960000, year: 2023 },   // Ukraine
    'VEN': { total: 1910000, year: 2023 },   // Venezuela
    'IRQ': { total: 1390000, year: 2023 },   // Iraq
    'COL': { total: 1250000, year: 2023 },   // Colombia
    'PAK': { total: 1020000, year: 2023 },   // Pakistan
    'YEM': { total: 980000, year: 2023 },    // Yemen
    'ERI': { total: 880000, year: 2023 },    // Eritrea
    'CMR': { total: 790000, year: 2023 },   // Cameroon
    'ETH': { total: 750000, year: 2023 },    // Ethiopia
    'NGA': { total: 690000, year: 2023 },    // Nigeria
    'CAF': { total: 650000, year: 2023 },   // CAR
    'BGD': { total: 620000, year: 2023 },    // Bangladesh (Rohingya)
    'IRQ': { total: 580000, year: 2023 },    // Iraq
  };

  const byAsylum = {
    'TUR': { total: 3520000, year: 2023 },    // Turkey
    'IRN': { total: 3200000, year: 2023 },   // Iran
    'COL': { total: 2520000, year: 2023 },   // Colombia
    'PAK': { total: 2190000, year: 2023 },   // Pakistan
    'UGA': { total: 1590000, year: 2023 },   // Uganda
    'DEU': { total: 1530000, year: 2023 },   // Germany
    'POL': { total: 1500000, year: 2023 },   // Poland (Ukrainian)
    'RUS': { total: 1290000, year: 2023 },   // Russia
    'BGD': { total: 960000, year: 2023 },    // Bangladesh
    'ETH': { total: 930000, year: 2023 },    // Ethiopia
    'JOR': { total: 760000, year: 2023 },   // Jordan
    'KEN': { total: 540000, year: 2023 },    // Kenya
    'SDN': { total: 510000, year: 2023 },    // Sudan
    'LBN': { total: 480000, year: 2023 },    // Lebanon
    'IND': { total: 460000, year: 2023 },    // India
    'TZA': { total: 420000, year: 2023 },    // Tanzania
    'ZWE': { total: 390000, year: 2023 },   // Zimbabwe
    'EGY': { total: 370000, year: 2023 },    // Egypt
    'YEM': { total: 350000, year: 2023 },    // Yemen
    'CHN': { total: 320000, year: 2023 },    // China
  };

  return {
    year: 2023,
    by_origin: byOrigin,
    by_asylum: byAsylum,
    source: 'UNHCR 2023 Estimates (fallback data)'
  };
}

/**
 * Merge refugee data into country-data.json
 */
function mergeIntoCountryData(refugeeData, countryData) {
  // ISO3 to ISO2 mapping (partial)
  const iso3to2 = {
    'AFG': 'AF', 'ALB': 'AL', 'DZA': 'DZ', 'ASM': 'AS', 'AND': 'AD', 'AGO': 'AO',
    'AIA': 'AI', 'ATA': 'AQ', 'ATG': 'AG', 'ARG': 'AR', 'ARM': 'AM', 'ABW': 'AW',
    'AUS': 'AU', 'AUT': 'AT', 'AZE': 'AZ', 'BHS': 'BS', 'BHR': 'BH', 'BGD': 'BD',
    'BRB': 'BB', 'BLR': 'BY', 'BEL': 'BE', 'BLZ': 'BZ', 'BEN': 'BJ', 'BMU': 'BM',
    'BTN': 'BT', 'BOL': 'BO', 'BIH': 'BA', 'BWA': 'BW', 'BRA': 'BR', 'BRN': 'BN',
    'BGR': 'BG', 'BFA': 'BF', 'BDI': 'BI', 'CPV': 'CV', 'KHM': 'KH', 'CMR': 'CM',
    'CAN': 'CA', 'CYM': 'KY', 'CAF': 'CF', 'TCD': 'TD', 'CHL': 'CL', 'CHN': 'CN',
    'COL': 'CO', 'COM': 'KM', 'COG': 'CG', 'COD': 'CD', 'COK': 'CK', 'CRI': 'CR',
    'HRV': 'HR', 'CUB': 'CU', 'CYP': 'CY', 'CZE': 'CZ', 'DNK': 'DK', 'DJI': 'DJ',
    'DMA': 'DM', 'DOM': 'DO', 'TLS': 'TL', 'ECU': 'EC', 'EGY': 'EG', 'SLV': 'SV',
    'GNQ': 'GQ', 'ERI': 'ER', 'EST': 'EE', 'ETH': 'ET', 'FRO': 'FO', 'FJI': 'FJ',
    'FIN': 'FI', 'FRA': 'FR', 'GUF': 'GF', 'PYF': 'PF', 'GAB': 'GA', 'GMB': 'GM',
    'GEO': 'GE', 'DEU': 'DE', 'GHA': 'GH', 'GIB': 'GI', 'GRC': 'GR', 'GRL': 'GL',
    'GRD': 'GD', 'GLP': 'GP', 'GUM': 'GU', 'GTM': 'GT', 'GIN': 'GN', 'GNB': 'GW',
    'GUY': 'GY', 'HTI': 'HT', 'HND': 'HN', 'HKG': 'HK', 'HUN': 'HU', 'ISL': 'IS',
    'IND': 'IN', 'IDN': 'ID', 'IRN': 'IR', 'IRQ': 'IQ', 'IRL': 'IE', 'ISR': 'IL',
    'ITA': 'IT', 'CIV': 'CI', 'JAM': 'JM', 'JPN': 'JP', 'JOR': 'JO', 'KAZ': 'KZ',
    'KEN': 'KE', 'KIR': 'KI', 'PRK': 'KP', 'KOR': 'KR', 'KWT': 'KW', 'KGZ': 'KG',
    'LAO': 'LA', 'LVA': 'LV', 'LBN': 'LB', 'LSO': 'LS', 'LBR': 'LR', 'LBY': 'LY',
    'LIE': 'LI', 'LTU': 'LT', 'LUX': 'LU', 'MAC': 'MO', 'MKD': 'MK', 'MDG': 'MG',
    'MWI': 'MW', 'MYS': 'MY', 'MDV': 'MV', 'MLI': 'ML', 'MLT': 'MT', 'MHL': 'MH',
    'MRT': 'MR', 'MUS': 'MU', 'MEX': 'MX', 'FSM': 'FM', 'MDA': 'MD', 'MCO': 'MC',
    'MNG': 'MN', 'MNE': 'ME', 'MSR': 'MS', 'MAR': 'MA', 'MOZ': 'MZ', 'MMR': 'MM',
    'NAM': 'NA', 'NRU': 'NR', 'NPL': 'NP', 'NLD': 'NL', 'NCL': 'NC', 'NZL': 'NZ',
    'NIC': 'NI', 'NER': 'NE', 'NGA': 'NG', 'NIU': 'NU', 'NFK': 'NF', 'NOR': 'NO',
    'OMN': 'OM', 'PAK': 'PK', 'PLW': 'PW', 'PSE': 'PS', 'PAN': 'PA', 'PNG': 'PG',
    'PRY': 'PY', 'PER': 'PE', 'PHL': 'PH', 'PCN': 'PN', 'POL': 'PL', 'PRT': 'PT',
    'PRI': 'PR', 'QAT': 'QA', 'REU': 'RE', 'ROU': 'RO', 'RUS': 'RU', 'RWA': 'RW',
    'SHN': 'SH', 'KNA': 'KN', 'LCA': 'LC', 'SPM': 'PM', 'VCT': 'VC', 'WSM': 'WS',
    'SMR': 'SM', 'STP': 'ST', 'SAU': 'SA', 'SEN': 'SN', 'SRB': 'RS', 'SYC': 'SC',
    'SLE': 'SL', 'SGP': 'SG', 'SVK': 'SK', 'SVN': 'SI', 'SLB': 'SB', 'SOM': 'SO',
    'ZAF': 'ZA', 'SSD': 'SS', 'ESP': 'ES', 'LKA': 'LK', 'SDN': 'SD', 'SUR': 'SR',
    'SJM': 'SJ', 'SWZ': 'SZ', 'SWE': 'SE', 'CHE': 'CH', 'SYR': 'SY', 'TWN': 'TW',
    'TJK': 'TJ', 'TZA': 'TZ', 'THA': 'TH', 'TGO': 'TG', 'TKL': 'TK', 'TON': 'TO',
    'TTO': 'TT', 'TUN': 'TN', 'TUR': 'TR', 'TKM': 'TM', 'TCA': 'TC', 'TUV': 'TV',
    'UGA': 'UG', 'UKR': 'UA', 'ARE': 'AE', 'GBR': 'GB', 'USA': 'US', 'URY': 'UY',
    'UZB': 'UZ', 'VUT': 'VU', 'VAT': 'VA', 'VEN': 'VE', 'VNM': 'VN', 'VGB': 'VG',
    'VIR': 'VI', 'WLF': 'WF', 'ESH': 'EH', 'YEM': 'YE', 'ZMB': 'ZM', 'ZWE': 'ZW',
  };

  let merged = 0;

  for (const [iso3, data] of Object.entries(refugeeData.by_origin)) {
    const iso2 = iso3to2[iso3];
    if (iso2 && countryData[iso2]) {
      countryData[iso2].refugees_by_origin = data.total;
      countryData[iso2].refugees_by_origin_year = data.year;
      merged++;
    }
  }

  for (const [iso3, data] of Object.entries(refugeeData.by_asylum)) {
    const iso2 = iso3to2[iso3];
    if (iso2 && countryData[iso2]) {
      countryData[iso2].refugees_by_asylum = data.total;
      countryData[iso2].refugees_by_asylum_year = data.year;
      merged++;
    }
  }

  console.log(`[unhcr] Merged refugee data into ${merged} countries`);
}

async function main() {
  try {
    const refugeeData = await fetchRefugeeData();

    // Write raw data
    fs.writeFileSync(OUTPUT, JSON.stringify(refugeeData, null, 2));
    console.log(`[unhcr] Wrote refugee data to ${OUTPUT}`);

    // Merge into country-data.json
    const countryData = JSON.parse(fs.readFileSync(COUNTRY_DATA, 'utf8'));
    mergeIntoCountryData(refugeeData, countryData);
    fs.writeFileSync(COUNTRY_DATA, JSON.stringify(countryData, null, 2));
    console.log('[unhcr] Updated country-data.json');

  } catch (err) {
    console.error('[unhcr] Error:', err.message);
    process.exit(1);
  }
}

main();