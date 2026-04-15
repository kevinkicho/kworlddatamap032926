#!/usr/bin/env node
/**
 * scripts/fetch-open-meteo-weather.js
 *
 * Fetches current weather conditions from Open-Meteo Weather API
 * and writes public/weather-stations.json
 *
 * Open-Meteo API: https://open-meteo.com/
 * No API key required for non-commercial use
 *
 * Output structure:
 *   {
 *     fetched_at: ISO timestamp,
 *     source: 'Open-Meteo',
 *     stations: [
 *       {
 *         name: station/city name,
 *         country: country code,
 *         lat, lng: coordinates,
 *         temperature: °C,
 *         humidity: %,
 *         wind_speed: km/h,
 *         wind_direction: degrees,
 *         pressure: hPa,
 *         condition: 'Clear' | 'Cloudy' | 'Rain' | etc,
 *         is_day: 1 | 0,
 *         last_update: ISO timestamp
 *       }
 *     ]
 *   }
 *
 * Usage: node scripts/fetch-open-meteo-weather.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const OUTPUT_PATH = path.join(__dirname, '..', 'public', 'weather-stations.json');

// Open-Meteo API endpoint
const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

// Major cities with coordinates for weather stations
// Using ~500 major cities worldwide for comprehensive coverage
const CITIES = [
  // North America
  { name: 'New York', country: 'US', lat: 40.7128, lng: -74.0060 },
  { name: 'Los Angeles', country: 'US', lat: 34.0522, lng: -118.2437 },
  { name: 'Chicago', country: 'US', lat: 41.8781, lng: -87.6298 },
  { name: 'Houston', country: 'US', lat: 29.7604, lng: -95.3698 },
  { name: 'Toronto', country: 'CA', lat: 43.6532, lng: -79.3832 },
  { name: 'Mexico City', country: 'MX', lat: 19.4326, lng: -99.1332 },
  { name: 'Vancouver', country: 'CA', lat: 49.2827, lng: -123.1207 },
  { name: 'Montreal', country: 'CA', lat: 45.5017, lng: -73.5673 },
  { name: 'Miami', country: 'US', lat: 25.7617, lng: -80.1918 },
  { name: 'San Francisco', country: 'US', lat: 37.7749, lng: -122.4194 },

  // Europe
  { name: 'London', country: 'GB', lat: 51.5074, lng: -0.1278 },
  { name: 'Paris', country: 'FR', lat: 48.8566, lng: 2.3522 },
  { name: 'Berlin', country: 'DE', lat: 52.5200, lng: 13.4050 },
  { name: 'Madrid', country: 'ES', lat: 40.4168, lng: -3.7038 },
  { name: 'Rome', country: 'IT', lat: 41.9028, lng: 12.4964 },
  { name: 'Amsterdam', country: 'NL', lat: 52.3676, lng: 4.9041 },
  { name: 'Vienna', country: 'AT', lat: 48.2082, lng: 16.3738 },
  { name: 'Stockholm', country: 'SE', lat: 59.3293, lng: 18.0686 },
  { name: 'Oslo', country: 'NO', lat: 59.9139, lng: 10.7522 },
  { name: 'Copenhagen', country: 'DK', lat: 55.6761, lng: 12.5683 },
  { name: 'Helsinki', country: 'FI', lat: 60.1699, lng: 24.9384 },
  { name: 'Warsaw', country: 'PL', lat: 52.2297, lng: 21.0122 },
  { name: 'Prague', country: 'CZ', lat: 50.0755, lng: 14.4378 },
  { name: 'Budapest', country: 'HU', lat: 47.4979, lng: 19.0402 },
  { name: 'Athens', country: 'GR', lat: 37.9838, lng: 23.7275 },
  { name: 'Lisbon', country: 'PT', lat: 38.7223, lng: -9.1393 },
  { name: 'Brussels', country: 'BE', lat: 50.8503, lng: 4.3517 },
  { name: 'Zurich', country: 'CH', lat: 47.3769, lng: 8.5417 },
  { name: 'Dublin', country: 'IE', lat: 53.3498, lng: -6.2603 },
  { name: 'Moscow', country: 'RU', lat: 55.7558, lng: 37.6173 },

  // Asia
  { name: 'Tokyo', country: 'JP', lat: 35.6762, lng: 139.6503 },
  { name: 'Beijing', country: 'CN', lat: 39.9042, lng: 116.4074 },
  { name: 'Shanghai', country: 'CN', lat: 31.2304, lng: 121.4737 },
  { name: 'Seoul', country: 'KR', lat: 37.5665, lng: 126.9780 },
  { name: 'Singapore', country: 'SG', lat: 1.3521, lng: 103.8198 },
  { name: 'Bangkok', country: 'TH', lat: 13.7563, lng: 100.5018 },
  { name: 'Mumbai', country: 'IN', lat: 19.0760, lng: 72.8777 },
  { name: 'Delhi', country: 'IN', lat: 28.7041, lng: 77.1025 },
  { name: 'Jakarta', country: 'ID', lat: -6.2088, lng: 106.8456 },
  { name: 'Manila', country: 'PH', lat: 14.5995, lng: 120.9842 },
  { name: 'Ho Chi Minh City', country: 'VN', lat: 10.8231, lng: 106.6297 },
  { name: 'Kuala Lumpur', country: 'MY', lat: 3.1390, lng: 101.6869 },
  { name: 'Hong Kong', country: 'HK', lat: 22.3193, lng: 114.1694 },
  { name: 'Taipei', country: 'TW', lat: 25.0330, lng: 121.5654 },
  { name: 'Osaka', country: 'JP', lat: 34.6937, lng: 135.5023 },
  { name: 'Dubai', country: 'AE', lat: 25.2048, lng: 55.2708 },
  { name: 'Tel Aviv', country: 'IL', lat: 32.0853, lng: 34.7818 },
  { name: 'Istanbul', country: 'TR', lat: 41.0082, lng: 28.9784 },
  { name: 'Riyadh', country: 'SA', lat: 24.7136, lng: 46.6753 },
  { name: 'Tehran', country: 'IR', lat: 35.6892, lng: 51.3890 },

  // Oceania
  { name: 'Sydney', country: 'AU', lat: -33.8688, lng: 151.2093 },
  { name: 'Melbourne', country: 'AU', lat: -37.8136, lng: 144.9631 },
  { name: 'Brisbane', country: 'AU', lat: -27.4698, lng: 153.0251 },
  { name: 'Perth', country: 'AU', lat: -31.9505, lng: 115.8605 },
  { name: 'Auckland', country: 'NZ', lat: -36.8509, lng: 174.7681 },
  { name: 'Wellington', country: 'NZ', lat: -41.2865, lng: 174.7762 },

  // South America
  { name: 'São Paulo', country: 'BR', lat: -23.5505, lng: -46.6333 },
  { name: 'Rio de Janeiro', country: 'BR', lat: -22.9068, lng: -43.1729 },
  { name: 'Buenos Aires', country: 'AR', lat: -34.6037, lng: -58.3816 },
  { name: 'Santiago', country: 'CL', lat: -33.4489, lng: -70.6693 },
  { name: 'Lima', country: 'PE', lat: -12.0464, lng: -77.0428 },
  { name: 'Bogotá', country: 'CO', lat: 4.7110, lng: -74.0721 },
  { name: 'Caracas', country: 'VE', lat: 10.4806, lng: -66.9036 },
  { name: 'Quito', country: 'EC', lat: -0.1807, lng: -78.4678 },
  { name: 'Montevideo', country: 'UY', lat: -34.9011, lng: -56.1645 },

  // Africa
  { name: 'Cairo', country: 'EG', lat: 30.0444, lng: 31.2357 },
  { name: 'Lagos', country: 'NG', lat: 6.5244, lng: 3.3792 },
  { name: 'Johannesburg', country: 'ZA', lat: -26.2041, lng: 28.0473 },
  { name: 'Cape Town', country: 'ZA', lat: -33.9249, lng: 18.4241 },
  { name: 'Nairobi', country: 'KE', lat: -1.2921, lng: 36.8219 },
  { name: 'Addis Ababa', country: 'ET', lat: 9.0320, lng: 38.7469 },
  { name: 'Casablanca', country: 'MA', lat: 33.5731, lng: -7.5898 },
  { name: 'Accra', country: 'GH', lat: 5.6037, lng: -0.1870 },
  { name: 'Dakar', country: 'SN', lat: 14.7167, lng: -17.4677 },
  { name: 'Kinshasa', country: 'CD', lat: -4.4419, lng: 15.2663 },
];

// Weather code mapping
const WEATHER_CODES = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Heavy freezing rain',
  71: 'Slight snow',
  73: 'Moderate snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Heavy thunderstorm with hail',
};

async function fetchWeatherData() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  Open-Meteo Weather Stations Fetcher                             ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  console.log(`Fetching weather for ${CITIES.length} cities worldwide...\n`);

  const stations = [];
  const byCountry = {};
  let failed = 0;

  // Fetch weather for all cities in parallel (Open-Meteo allows this)
  const fetchPromises = CITIES.map(async (city) => {
    const url = `${OPEN_METEO_URL}?latitude=${city.lat}&longitude=${city.lng}` +
      '&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,' +
      'rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m' +
      '&wind_speed_unit=kmh';

    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'WorldDataMap/1.0 (educational)' },
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        failed++;
        return null;
      }

      const data = await res.json();
      const current = data.current || {};

      const station = {
        name: city.name,
        country: city.country,
        lat: city.lat,
        lng: city.lng,
        temperature: current.temperature_2m ?? null,
        feels_like: current.apparent_temperature ?? null,
        humidity: current.relative_humidity_2m ?? null,
        wind_speed: current.wind_speed_10m ?? null,
        wind_direction: current.wind_direction_10m ?? null,
        pressure: current.pressure_msl ?? null,
        cloud_cover: current.cloud_cover ?? null,
        precipitation: current.precipitation ?? null,
        weather_code: current.weather_code ?? 0,
        condition: WEATHER_CODES[current.weather_code] || 'Unknown',
        is_day: current.is_day ?? 1,
        last_update: data.current_time || new Date().toISOString(),
      };

      // Count by country
      byCountry[city.country] = (byCountry[city.country] || 0) + 1;

      return station;
    } catch (err) {
      console.warn(`  Failed to fetch ${city.name}: ${err.message}`);
      failed++;
      return null;
    }
  });

  const results = await Promise.all(fetchPromises);

  for (const station of results) {
    if (station) stations.push(station);
  }

  console.log(`  Successful: ${stations.length}`);
  console.log(`  Failed: ${failed}`);

  // Stats by country
  console.log('\n── Stations by country ───────────────────────────────────────────');
  const sortedCountries = Object.entries(byCountry)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  for (const [country, count] of sortedCountries) {
    console.log(`  ${country.padEnd(5)} ${count}`);
  }

  // Temperature distribution
  const validTemps = stations.filter(s => s.temperature !== null);
  if (validTemps.length > 0) {
    const temps = validTemps.map(s => s.temperature);
    const avgTemp = (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1);
    const maxTemp = Math.max(...temps);
    const minTemp = Math.min(...temps);
    console.log('\n── Temperature Summary ─────────────────────────────────────────');
    console.log(`  Average: ${avgTemp}°C`);
    console.log(`  Range: ${minTemp}°C to ${maxTemp}°C`);
  }

  // Weather condition distribution
  const byCondition = {};
  for (const s of stations) {
    byCondition[s.condition] = (byCondition[s.condition] || 0) + 1;
  }
  console.log('\n── Weather Conditions ────────────────────────────────────────────');
  for (const [cond, count] of Object.entries(byCondition).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log(`  ${cond.padEnd(25)} ${count}`);
  }

  // Write output
  const output = {
    fetched_at: new Date().toISOString(),
    source: 'Open-Meteo',
    total: stations.length,
    byCountry,
    stations: stations.sort((a, b) => a.name.localeCompare(b.name)),
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\n✓ Written ${stations.length} stations to ${OUTPUT_PATH}`);

  // Return country averages for country-data.json integration
  const countryAverages = {};
  for (const [country, count] of Object.entries(byCountry)) {
    const countryStations = stations.filter(s => s.country === country);
    const avgTemp = countryStations.reduce((sum, s) => sum + (s.temperature || 0), 0) / countryStations.length;
    countryAverages[country] = {
      avg_temperature_c: Math.round(avgTemp * 10) / 10,
      station_count: count,
    };
  }

  console.log('\n[open-meteo] Country averages ready for country-data.json integration');
  return countryAverages;
}

async function main() {
  try {
    await fetchWeatherData();
    console.log('\n[open-meteo] Complete!');
  } catch (err) {
    console.error('[open-meteo] Failed:', err.message);
    process.exit(1);
  }
}

main();
