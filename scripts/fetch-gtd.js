#!/usr/bin/env node
/**
 * scripts/fetch-gtd.js
 *
 * Global Terrorism Database (GTD) incident data fetcher
 * Writes public/terrorism-incidents.json
 *
 * Source: START Global Terrorism Database
 * https://www.start.umd.edu/gtd/
 *
 * Note: GTD requires free registration for full data access.
 * This script uses a curated subset of representative incidents
 * for demonstration purposes. For full data, register at:
 * https://www.start.umd.edu/gtd/contact/
 *
 * Output structure:
 *   {
 *     fetched_at: ISO timestamp,
 *     source: 'Global Terrorism Database (START)',
 *     total_incidents: number,
 *     byCountry: { country_code: { incidents, fatalities, years_active } },
 *     incidents: [
 *       {
 *         id: event_id,
 *         date: YYYY-MM-DD,
 *         country: country_name,
 *         country_code: ISO2,
 *         region: geographic_region,
 *         lat, lng: coordinates,
 *         attack_type: string,
 *         weapon_type: string,
 *         target_type: string,
 *         fatalities: number,
 *         wounded: number,
 *         perpetrator: string (if known)
 *       }
 *     ],
 *     stats: { by_attack_type, by_weapon, by_region, by_year }
 *   }
 *
 * Usage: node scripts/fetch-gtd.js
 */
'use strict';

const fs = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');

const OUTPUT_PATH = path.join(__dirname, '..', 'public', 'terrorism-incidents.json');

// Country name to ISO2 mapping
const COUNTRY_ISO2 = {
  'Afghanistan': 'AF', 'Algeria': 'DZ', 'Argentina': 'AR', 'Australia': 'AU',
  'Austria': 'AT', 'Bangladesh': 'BD', 'Belgium': 'BE', 'Brazil': 'BR',
  'Burkina Faso': 'BF', 'Cameroon': 'CM', 'Canada': 'CA', 'Central African Republic': 'CF',
  'Chad': 'TD', 'China': 'CN', 'Colombia': 'CO', 'Congo': 'CG',
  'Democratic Republic of the Congo': 'CD', 'Egypt': 'EG', 'Ethiopia': 'ET',
  'France': 'FR', 'Germany': 'DE', 'Greece': 'GR', 'India': 'IN',
  'Indonesia': 'ID', 'Iran': 'IR', 'Iraq': 'IQ', 'Israel': 'IL',
  'Italy': 'IT', 'Japan': 'JP', 'Kenya': 'KE', 'Lebanon': 'LB',
  'Libya': 'LY', 'Mali': 'ML', 'Mexico': 'MX', 'Morocco': 'MA',
  'Myanmar': 'MM', 'Niger': 'NE', 'Nigeria': 'NG', 'Pakistan': 'PK',
  'Palestine': 'PS', 'Peru': 'PE', 'Philippines': 'PH', 'Russia': 'RU',
  'Saudi Arabia': 'SA', 'Somalia': 'SO', 'South Africa': 'ZA', 'South Sudan': 'SS',
  'Spain': 'ES', 'Sri Lanka': 'LK', 'Sudan': 'SD', 'Syria': 'SY',
  'Thailand': 'TH', 'Tunisia': 'TN', 'Turkey': 'TR', 'Ukraine': 'UA',
  'United Kingdom': 'GB', 'United States': 'US', 'Yemen': 'YE',
  'Venezuela': 'VE', 'Myanmar (Burma)': 'MM', 'Burma': 'MM',
};

// Geographic region mapping
const REGION_MAP = {
  'Middle East': ['Afghanistan', 'Iran', 'Iraq', 'Israel', 'Lebanon', 'Palestine', 'Saudi Arabia', 'Syria', 'Turkey', 'Yemen'],
  'South Asia': ['Afghanistan', 'Bangladesh', 'India', 'Pakistan', 'Sri Lanka'],
  'Southeast Asia': ['Indonesia', 'Myanmar', 'Philippines', 'Thailand'],
  'East Asia': ['China', 'Japan'],
  'Sub-Saharan Africa': ['Burkina Faso', 'Cameroon', 'Central African Republic', 'Chad', 'Congo', 'Democratic Republic of the Congo', 'Ethiopia', 'Kenya', 'Mali', 'Morocco', 'Niger', 'Nigeria', 'Somalia', 'South Africa', 'South Sudan', 'Sudan'],
  'North Africa': ['Algeria', 'Egypt', 'Libya', 'Morocco', 'Tunisia'],
  'Europe': ['Austria', 'Belgium', 'France', 'Germany', 'Greece', 'Italy', 'Russia', 'Spain', 'Ukraine', 'United Kingdom'],
  'North America': ['Canada', 'Mexico', 'United States'],
  'South America': ['Argentina', 'Brazil', 'Colombia', 'Peru', 'Venezuela'],
};

function getRegion(country) {
  for (const [region, countries] of Object.entries(REGION_MAP)) {
    if (countries.includes(country)) return region;
  }
  return 'Other';
}

// Curated GTD incident data (representative sample 2010-2024)
// Based on publicly reported major incidents
const GTD_INCIDENTS = [
  // Middle East - Iraq/Syria (ISIS)
  { date: '2014-06-10', country: 'Iraq', city: 'Mosul', lat: 36.34, lng: 43.13, attack: 'Armed Assault', weapon: 'Firearms', target: 'Military', fatalities: 147, wounded: 400, perpetrator: 'Islamic State (ISIS)' },
  { date: '2015-11-13', country: 'France', city: 'Paris', lat: 48.8566, lng: 2.3522, attack: 'Bombing/Explosion', weapon: 'Explosives', target: 'Civilian', fatalities: 130, wounded: 400, perpetrator: 'Islamic State (ISIS)' },
  { date: '2016-07-03', country: 'Iraq', city: 'Baghdad', lat: 33.3152, lng: 44.3661, attack: 'Bombing/Explosion', weapon: 'Explosives/Vehicle', target: 'Civilian', fatalities: 324, wounded: 200, perpetrator: 'Islamic State (ISIS)' },
  { date: '2017-04-09', country: 'Syria', city: 'Damascus', lat: 33.5138, lng: 36.2765, attack: 'Bombing/Explosion', weapon: 'Explosives/Vehicle', target: 'Government', fatalities: 167, wounded: 120, perpetrator: 'Unknown' },
  { date: '2019-05-12', country: 'Afghanistan', city: 'Nangarhar', lat: 34.17, lng: 70.39, attack: 'Bombing/Explosion', weapon: 'Explosives', target: 'Civilian', fatalities: 68, wounded: 165, perpetrator: 'Islamic State (ISIS-K)' },
  { date: '2021-08-26', country: 'Afghanistan', city: 'Kabul', lat: 34.5553, lng: 69.2075, attack: 'Bombing/Explosion', weapon: 'Explosives', target: 'Military', fatalities: 183, wounded: 150, perpetrator: 'Islamic State (ISIS-K)' },
  { date: '2023-10-07', country: 'Israel', city: 'Re\'im', lat: 31.47, lng: 34.36, attack: 'Armed Assault', weapon: 'Firearms', target: 'Civilian', fatalities: 364, wounded: 200, perpetrator: 'Hamas' },
  { date: '2024-01-03', country: 'Iran', city: 'Kerman', lat: 30.2833, lng: 57.0833, attack: 'Bombing/Explosion', weapon: 'Explosives', target: 'Civilian', fatalities: 95, wounded: 280, perpetrator: 'Islamic State (ISIS-K)' },

  // Africa - Boko Haram / Al-Shabaab
  { date: '2014-04-14', country: 'Nigeria', city: 'Chibok', lat: 10.15, lng: 12.58, attack: 'Abduction', weapon: 'Firearms', target: 'Educational', fatalities: 0, wounded: 0, perpetrator: 'Boko Haram' },
  { date: '2015-01-03', country: 'Nigeria', city: 'Baga', lat: 12.73, lng: 14.13, attack: 'Armed Assault', weapon: 'Firearms', target: 'Civilian', fatalities: 150, wounded: 50, perpetrator: 'Boko Haram' },
  { date: '2017-06-15', country: 'Somalia', city: 'Mogadishu', lat: 2.0469, lng: 45.3182, attack: 'Bombing/Explosion', weapon: 'Explosives/Vehicle', target: 'Government', fatalities: 82, wounded: 100, perpetrator: 'Al-Shabaab' },
  { date: '2017-10-14', country: 'Somalia', city: 'Mogadishu', lat: 2.0469, lng: 45.3182, attack: 'Bombing/Explosion', weapon: 'Explosives/Vehicle', target: 'Civilian', fatalities: 512, wounded: 300, perpetrator: 'Al-Shabaab' },
  { date: '2019-03-03', country: 'Somalia', city: 'Mogadishu', lat: 2.0469, lng: 45.3182, attack: 'Bombing/Explosion', weapon: 'Explosives/Vehicle', target: 'Government', fatalities: 26, wounded: 56, perpetrator: 'Al-Shabaab' },
  { date: '2020-12-28', country: 'Nigeria', city: 'Kankara', lat: 11.45, lng: 7.43, attack: 'Abduction', weapon: 'Firearms', target: 'Educational', fatalities: 0, wounded: 0, perpetrator: 'Boko Haram' },
  { date: '2021-05-22', country: 'Mali', city: 'Mopti', lat: 14.48, lng: -4.18, attack: 'Armed Assault', weapon: 'Firearms', target: 'Civilian', fatalities: 31, wounded: 10, perpetrator: 'JNIM' },
  { date: '2023-01-05', country: 'Nigeria', city: 'Kano', lat: 12.00, lng: 8.52, attack: 'Bombing/Explosion', weapon: 'Explosives', target: 'Religious', fatalities: 28, wounded: 40, perpetrator: 'Boko Haram' },

  // South Asia
  { date: '2012-09-28', country: 'Pakistan', city: 'Karachi', lat: 24.8607, lng: 67.0011, attack: 'Bombing/Explosion', weapon: 'Explosives', target: 'Civilian', fatalities: 120, wounded: 200, perpetrator: 'Taliban' },
  { date: '2014-12-16', country: 'Pakistan', city: 'Peshawar', lat: 34.0151, lng: 71.5249, attack: 'Armed Assault', weapon: 'Firearms', target: 'Educational', fatalities: 145, wounded: 130, perpetrator: 'Taliban (TTP)' },
  { date: '2016-02-13', country: 'Pakistan', city: 'Lahore', lat: 31.5497, lng: 74.3436, attack: 'Bombing/Explosion', weapon: 'Explosives', target: 'Civilian', fatalities: 75, wounded: 340, perpetrator: 'Jamaat-ul-Ahrar' },
  { date: '2019-04-21', country: 'Sri Lanka', city: 'Colombo', lat: 6.9271, lng: 79.8612, attack: 'Bombing/Explosion', weapon: 'Explosives', target: 'Religious', fatalities: 269, wounded: 500, perpetrator: 'NTJ (ISIS-linked)' },
  { date: '2020-05-22', country: 'Afghanistan', city: 'Kabul', lat: 34.5553, lng: 69.2075, attack: 'Armed Assault', weapon: 'Firearms', target: 'Religious', fatalities: 24, wounded: 65, perpetrator: 'Islamic State (ISIS-K)' },
  { date: '2021-09-17', country: 'Afghanistan', city: 'Kunduz', lat: 36.72, lng: 68.86, attack: 'Bombing/Explosion', weapon: 'Explosives', target: 'Religious', fatalities: 72, wounded: 165, perpetrator: 'Islamic State (ISIS-K)' },

  // Europe
  { date: '2011-07-22', country: 'Norway', city: 'Oslo', lat: 59.9139, lng: 10.7522, attack: 'Bombing/Explosion', weapon: 'Explosives', target: 'Government', fatalities: 8, wounded: 209, perpetrator: 'Anders Behring Breivik' },
  { date: '2015-01-07', country: 'France', city: 'Paris', lat: 48.8566, lng: 2.3522, attack: 'Armed Assault', weapon: 'Firearms', target: 'Media', fatalities: 17, wounded: 11, perpetrator: 'Al-Qaeda (AQAP)' },
  { date: '2016-03-22', country: 'Belgium', city: 'Brussels', lat: 50.8503, lng: 4.3517, attack: 'Bombing/Explosion', weapon: 'Explosives', target: 'Transportation', fatalities: 32, wounded: 300, perpetrator: 'Islamic State (ISIS)' },
  { date: '2017-05-22', country: 'United Kingdom', city: 'Manchester', lat: 53.4808, lng: -2.2426, attack: 'Bombing/Explosion', weapon: 'Explosives', target: 'Civilian', fatalities: 23, wounded: 250, perpetrator: 'Salman Abedi (ISIS-inspired)' },
  { date: '2019-04-18', country: 'Sri Lanka', city: 'Negombo', lat: 7.2083, lng: 79.8358, attack: 'Bombing/Explosion', weapon: 'Explosives', target: 'Religious', fatalities: 102, wounded: 150, perpetrator: 'NTJ' },

  // Americas
  { date: '2016-06-12', country: 'United States', city: 'Orlando', lat: 28.5383, lng: -81.3792, attack: 'Armed Assault', weapon: 'Firearms', target: 'Civilian', fatalities: 50, wounded: 53, perpetrator: 'Omar Mateen (ISIS-inspired)' },
  { date: '2018-08-28', country: 'Mexico', city: 'Guadalajara', lat: 20.6597, lng: -103.3496, attack: 'Armed Assault', weapon: 'Firearms', target: 'Government', fatalities: 8, wounded: 4, perpetrator: 'Jalisco Cartel' },
  { date: '2019-04-27', country: 'United States', city: 'Poway', lat: 33.2342, lng: -117.1595, attack: 'Armed Assault', weapon: 'Firearms', target: 'Religious', fatalities: 1, wounded: 3, perpetrator: 'John Earnest' },
  { date: '2021-11-25', country: 'Mexico', city: 'Mexico City', lat: 19.4326, lng: -99.1332, attack: 'Armed Assault', weapon: 'Firearms', target: 'Government', fatalities: 2, wounded: 4, perpetrator: 'Unknown Cartel' },

  // Southeast Asia
  { date: '2016-01-14', country: 'Indonesia', city: 'Jakarta', lat: -6.2088, lng: 106.8456, attack: 'Armed Assault', weapon: 'Firearms/Explosives', target: 'Civilian', fatalities: 8, wounded: 24, perpetrator: 'Islamic State (ISIS)' },
  { date: '2017-05-23', country: 'Philippines', city: 'Marawi', lat: 8.00, lng: 124.28, attack: 'Armed Assault', weapon: 'Firearms/Explosives', target: 'Government', fatalities: 280, wounded: 500, perpetrator: 'Maute Group (ISIS-linked)' },
  { date: '2018-05-13', country: 'Indonesia', city: 'Surabaya', lat: -7.2575, lng: 112.7521, attack: 'Bombing/Explosion', weapon: 'Explosives', target: 'Religious', fatalities: 28, wounded: 57, perpetrator: 'JAD (ISIS-linked)' },
  { date: '2019-03-27', country: 'Philippines', city: 'Jolo', lat: 6.05, lng: 121.00, attack: 'Bombing/Explosion', weapon: 'Explosives', target: 'Religious', fatalities: 23, wounded: 111, perpetrator: 'Abu Sayyaf (ISIS-linked)' },
  { date: '2021-03-28', country: 'Indonesia', city: 'Makassar', lat: -5.1477, lng: 119.4327, attack: 'Bombing/Explosion', weapon: 'Explosives', target: 'Government', fatalities: 20, wounded: 85, perpetrator: 'JAD (ISIS-linked)' },

  // Other notable incidents
  { date: '2013-04-15', country: 'United States', city: 'Boston', lat: 42.3601, lng: -71.0589, attack: 'Bombing/Explosion', weapon: 'Explosives', target: 'Civilian', fatalities: 3, wounded: 264, perpetrator: 'Tsarnaev Brothers' },
  { date: '2015-09-30', country: 'Afghanistan', city: 'Kunduz', lat: 36.72, lng: 68.86, attack: 'Armed Assault', weapon: 'Firearms', target: 'Civilian', fatalities: 30, wounded: 150, perpetrator: 'Taliban' },
  { date: '2016-09-18', country: 'Afghanistan', city: 'Kabul', lat: 34.5553, lng: 69.2075, attack: 'Bombing/Explosion', weapon: 'Explosives', target: 'Government', fatalities: 63, wounded: 220, perpetrator: 'Taliban' },
  { date: '2018-09-23', country: 'Iran', city: 'Ahvaz', lat: 31.3183, lng: 48.6706, attack: 'Armed Assault', weapon: 'Firearms', target: 'Military', fatalities: 25, wounded: 70, perpetrator: 'ASMLA' },
  { date: '2019-07-01', country: 'Libya', city: 'Tripoli', lat: 32.8872, lng: 13.1913, attack: 'Bombing/Explosion', weapon: 'Explosives/Airstrike', target: 'Civilian', fatalities: 53, wounded: 130, perpetrator: 'LNA' },
  { date: '2020-01-09', country: 'Niger', city: 'Chad Basin', lat: 13.50, lng: 14.00, attack: 'Armed Assault', weapon: 'Firearms', target: 'Military', fatalities: 92, wounded: 20, perpetrator: 'Boko Haram' },
  { date: '2022-08-20', country: 'Iraq', city: 'Baghdad', lat: 33.3152, lng: 44.3661, attack: 'Bombing/Explosion', weapon: 'Explosives', target: 'Religious', fatalities: 23, wounded: 67, perpetrator: 'Islamic State (ISIS)' },
  { date: '2023-04-02', country: 'Nigeria', city: 'Kaduna', lat: 10.51, lng: 7.42, attack: 'Armed Assault', weapon: 'Firearms', target: 'Civilian', fatalities: 32, wounded: 15, perpetrator: 'Bandits' },
  { date: '2024-03-22', country: 'Russia', city: 'Moscow', lat: 55.7558, lng: 37.6173, attack: 'Armed Assault', weapon: 'Firearms/Explosives', target: 'Civilian', fatalities: 145, wounded: 550, perpetrator: 'Islamic State (ISIS-K)' },
];

async function fetchGTDData() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  Global Terrorism Database Fetcher                               ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  console.log('Processing curated GTD incident data...\n');

  // Process incidents with ISO2 codes and IDs
  const incidents = GTD_INCIDENTS.map((e, idx) => ({
    id: idx + 1,
    event_id: `GTD-${2010 + Math.floor(idx / 3)}-${String(idx + 1).padStart(5, '0')}`,
    date: e.date,
    year: parseInt(e.date.substring(0, 4)),
    country: e.country,
    country_code: COUNTRY_ISO2[e.country] || 'XX',
    city: e.city,
    region: getRegion(e.country),
    lat: e.lat,
    lng: e.lng,
    attack_type: e.attack,
    weapon_type: e.weapon,
    target_type: e.target,
    fatalities: e.fatalities,
    wounded: e.wounded,
    perpetrator: e.perpetrator,
  }));

  // Count by country
  const byCountry = {};
  for (const inc of incidents) {
    if (!byCountry[inc.country_code]) {
      byCountry[inc.country_code] = { incidents: 0, fatalities: 0, years: new Set() };
    }
    byCountry[inc.country_code].incidents++;
    byCountry[inc.country_code].fatalities += inc.fatalities;
    byCountry[inc.country_code].years.add(inc.year);
  }

  // Convert sets to counts
  for (const code of Object.keys(byCountry)) {
    byCountry[code].years_active = byCountry[code].years.size;
    delete byCountry[code].years;
  }

  // Stats by attack type
  const byAttackType = {};
  for (const inc of incidents) {
    byAttackType[inc.attack_type] = (byAttackType[inc.attack_type] || 0) + 1;
  }

  // Stats by weapon type
  const byWeapon = {};
  for (const inc of incidents) {
    byWeapon[inc.weapon_type] = (byWeapon[inc.weapon_type] || 0) + 1;
  }

  // Stats by region
  const byRegion = {};
  for (const inc of incidents) {
    byRegion[inc.region] = (byRegion[inc.region] || 0) + 1;
  }

  // Stats by year
  const byYear = {};
  for (const inc of incidents) {
    byYear[inc.year] = (byYear[inc.year] || 0) + 1;
  }

  // Total fatalities and wounded
  const totalFatalities = incidents.reduce((sum, i) => sum + i.fatalities, 0);
  const totalWounded = incidents.reduce((sum, i) => sum + i.wounded, 0);

  console.log('── Top 15 countries by incidents ─────────────────────────────────');
  const sortedCountries = Object.entries(byCountry)
    .sort((a, b) => b[1].incidents - a[1].incidents)
    .slice(0, 15);
  for (const [code, data] of sortedCountries) {
    console.log(`  ${code.padEnd(5)} ${String(data.incidents).padStart(3)} incidents, ${data.fatalities} fatalities`);
  }

  console.log('\n── By attack type ──────────────────────────────────────────────');
  for (const [type, count] of Object.entries(byAttackType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type.padEnd(25)} ${count}`);
  }

  console.log('\n── By region ───────────────────────────────────────────────────');
  for (const [region, count] of Object.entries(byRegion).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${region.padEnd(25)} ${count}`);
  }

  console.log('\n── Summary ─────────────────────────────────────────────────────');
  console.log(`  Total incidents: ${incidents.length}`);
  console.log(`  Total fatalities: ${totalFatalities}`);
  console.log(`  Total wounded: ${totalWounded}`);

  // Write output
  const output = {
    fetched_at: new Date().toISOString(),
    source: 'Global Terrorism Database (START) - Curated Sample',
    total_incidents: incidents.length,
    byCountry,
    incidents: incidents,
    stats: {
      by_attack_type: byAttackType,
      by_weapon: byWeapon,
      by_region: byRegion,
      by_year: byYear,
      totalFatalities,
      totalWounded,
    },
  };

  atomicWrite(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\n✓ Written ${incidents.length} incidents to ${OUTPUT_PATH}`);

  // Write lightweight version (include incidents for map layer, exclude perpetrator for brevity)
  const lightOutput = path.join(__dirname, '..', 'public', 'terrorism-incidents-lite.json');
  const liteIncidents = incidents.map(i => ({
    id: i.id,
    date: i.date,
    country: i.country,
    country_code: i.country_code,
    region: i.region,
    lat: i.lat,
    lng: i.lng,
    attack_type: i.attack_type,
    fatalities: i.fatalities,
    wounded: i.wounded,
  }));
  atomicWrite(lightOutput, JSON.stringify({
    fetched_at: output.fetched_at,
    source: output.source,
    total_incidents: output.total_incidents,
    byCountry: output.byCountry,
    incidents: liteIncidents,
    stats: output.stats,
  }));
  console.log(`✓ Written lightweight version to ${lightOutput}`);

  console.log('\n[gtd] Complete!');
}

async function main() {
  try {
    await fetchGTDData();
    console.log('\n[gtd] Complete!');
  } catch (err) {
    console.error('[gtd] Failed:', err.message);
    process.exit(1);
  }
}

main();
