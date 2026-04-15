/**
 * Fetch live aircraft data from OpenSky Network
 *
 * OpenSky Network provides free access to real-time flight tracking data:
 * - Live aircraft positions (state vectors)
 * - ICAO24 transponder IDs, callsigns, altitude, velocity, heading
 *
 * API: https://opensky-network.org/api/states/all
 * No API key required for basic access (anonymous).
 * Rate limit: ~400 requests/day for anonymous users.
 */

const fs = require('fs');
const path = require('path');

const OUTPUT = path.join(__dirname, '..', 'public', 'aircraft-live.json');

// OpenSky Network API endpoint for all state vectors
const OPENSKY_STATES_URL = 'https://opensky-network.org/api/states/all';

/**
 * Fetch all current aircraft state vectors from OpenSky Network
 *
 * Returns array of state vectors:
 * [icao24, callsign, origin_country, time_position, last_contact,
 *  longitude, latitude, baro_altitude, on_ground, velocity,
 *  true_track, vertical_rate, sensors, geo_altitude, squawk, spi, position_source]
 */
async function fetchAircraftStates() {
  console.log('[opensky] Fetching live aircraft data...');

  try {
    const res = await fetch(OPENSKY_STATES_URL);

    if (!res.ok) {
      throw new Error(`OpenSky API error: ${res.status}`);
    }

    const data = await res.json();

    if (!data.states || !Array.isArray(data.states)) {
      console.log('[opensky] No aircraft states returned');
      return [];
    }

    console.log(`[opensky] Fetched ${data.states.length} aircraft states`);
    console.log(`[opensky] Data timestamp: ${new Date(data.time * 1000).toISOString()}`);

    // Transform state vectors into a cleaner format
    const aircraft = data.states.map(state => {
      const [
        icao24,           // ICAO 24-bit hex transponder ID
        callsign,         // Flight callsign (e.g., "UAL123")
        origin_country,   // Country of origin
        time_position,    // Unix timestamp of position
        last_contact,     // Unix timestamp of last contact
        longitude,         // Longitude in degrees
        latitude,         // Latitude in degrees
        baro_altitude,    // Barometric altitude in meters
        on_ground,        // Boolean: aircraft is on ground
        velocity,         // Velocity in m/s
        true_track,       // True track in degrees (heading)
        vertical_rate,   // Vertical rate in m/s
        sensors,          // IDs of receivers
        geo_altitude,     // Geometric altitude in meters
        squawk,           // Squawk code (4 octal digits)
        spi,              // Special purpose indicator
        position_source   // Position source (0=ADS-B, 1=ASTERIX, 2=MLAT)
      ] = state;

      return {
        icao24: icao24?.trim() || null,
        callsign: callsign?.trim() || null,
        origin_country: origin_country?.trim() || null,
        longitude: typeof longitude === 'number' ? longitude : null,
        latitude: typeof latitude === 'number' ? latitude : null,
        baro_altitude: typeof baro_altitude === 'number' ? Math.round(baro_altitude) : null,
        geo_altitude: typeof geo_altitude === 'number' ? Math.round(geo_altitude) : null,
        on_ground: !!on_ground,
        velocity: typeof velocity === 'number' ? Math.round(velocity) : null,
        true_track: typeof true_track === 'number' ? Math.round(true_track) : null,
        vertical_rate: typeof vertical_rate === 'number' ? Math.round(vertical_rate) : null,
        squawk: squawk?.trim() || null,
        time_position: time_position || null,
        last_contact: last_contact || null
      };
    });

    // Filter to only aircraft with valid positions
    const withPosition = aircraft.filter(a =>
      a.latitude !== null &&
      a.longitude !== null &&
      Number.isFinite(a.latitude) &&
      Number.isFinite(a.longitude)
    );

    console.log(`[opensky] ${withPosition.length} aircraft with valid positions`);

    return {
      fetched_at: new Date().toISOString(),
      opensky_time: data.time,
      total_states: data.states.length,
      aircraft: withPosition
    };

  } catch (err) {
    console.error('[opensky] Error:', err.message);
    throw err;
  }
}

/**
 * Generate summary statistics
 */
function generateStats(data) {
  const byCountry = {};
  const byAltitude = { ground: 0, low: 0, medium: 0, high: 0 };

  for (const a of data.aircraft) {
    // Count by origin country
    if (a.origin_country) {
      byCountry[a.origin_country] = (byCountry[a.origin_country] || 0) + 1;
    }

    // Altitude bands (in meters)
    if (a.on_ground) {
      byAltitude.ground++;
    } else if (a.baro_altitude < 3000) {
      byAltitude.low++;
    } else if (a.baro_altitude < 10000) {
      byAltitude.medium++;
    } else {
      byAltitude.high++;
    }
  }

  // Top 20 countries
  const topCountries = Object.entries(byCountry)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  console.log('\n[opensky] === Summary ===');
  console.log(`Total aircraft: ${data.aircraft.length}`);
  console.log(`On ground: ${byAltitude.ground} (${Math.round(byAltitude.ground / data.aircraft.length * 100)}%)`);
  console.log(`Low altitude (<3km): ${byAltitude.low}`);
  console.log(`Medium altitude (3-10km): ${byAltitude.medium}`);
  console.log(`High altitude (>10km): ${byAltitude.high}`);
  console.log('\nTop countries:');
  topCountries.forEach(([country, count]) => {
    console.log(`  ${country}: ${count}`);
  });

  return { byCountry, byAltitude, topCountries };
}

async function main() {
  try {
    const data = await fetchAircraftStates();
    const stats = generateStats(data);

    // Write full data
    fs.writeFileSync(OUTPUT, JSON.stringify(data, null, 2));
    console.log(`\n[opensky] Wrote ${data.aircraft.length} aircraft to ${OUTPUT}`);

    // Also write a lightweight version for the app (only aircraft with positions)
    const lightweight = {
      fetched_at: data.fetched_at,
      opensky_time: data.opensky_time,
      total: data.aircraft.length,
      aircraft: data.aircraft.map(a => ({
        i: a.icao24,        // Minified keys for smaller file
        c: a.callsign,
        n: a.origin_country,
        lo: a.longitude,
        la: a.latitude,
        a: a.baro_altitude,
        g: a.on_ground ? 1 : 0,
        v: a.velocity,
        t: a.true_track
      }))
    };

    const lightOutput = path.join(__dirname, '..', 'public', 'aircraft-live-lite.json');
    fs.writeFileSync(lightOutput, JSON.stringify(lightweight));
    console.log(`[opensky] Wrote lightweight version to ${lightOutput}`);

  } catch (err) {
    console.error('[opensky] Error:', err.message);
    process.exit(1);
  }
}

main();