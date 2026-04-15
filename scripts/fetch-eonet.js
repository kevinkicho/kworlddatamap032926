#!/usr/bin/env node
/**
 * scripts/fetch-eonet.js
 *
 * Fetches natural hazard events from NASA EONET (Earth Observatory Natural Event Tracker)
 * and writes public/eonet-events.json.
 *
 * Output structure:
 *   {
 *     fetched_at: ISO timestamp,
 *     source: 'NASA EONET',
 *     events: [
 *       {
 *         id, title, type, severity,
 *         lat, lng,
 *         date: event date,
 *         updated: last update,
 *         link: EONET URL
 *       }
 *     ]
 *   }
 *
 * Event categories:
 *   - Wildfires
 *   - Volcanoes
 *   - Severe Storms
 *   - Dust Storms
 *   - Landslides
 *   - Sea/Lake Ice
 *   - Sea/Lake Water Temperature
 *   - Smoke
 *   - Snow Cover
 *   - Ocean Color
 *
 * Source: https://eonet.gsfc.nasa.gov/api/v3/events
 * No API key required.
 *
 * Usage: node scripts/fetch-eonet.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const OUTPUT_PATH = path.join(__dirname, '..', 'public', 'eonet-events.json');
const EONET_API = 'https://eonet.gsfc.nasa.gov/api/v3/events';

// Category mapping for display
const CATEGORY_NAMES = {
  'Wildfires': '🔥 Wildfire',
  'Volcanoes': '🌋 Volcano',
  'Severe Storms': '🌀 Severe Storm',
  'Dust Storms': '💨 Dust Storm',
  'Landslides': '🏔️ Landslide',
  'Sea and Lake Ice': '🧊 Ice',
  'Sea and Lake Water Temperature': '🌡️ Water Temp',
  'Smoke': '💨 Smoke',
  'Snow Cover': '❄️ Snow',
  'Ocean Color': '🌊 Ocean Color',
  'Tropical Cyclone': '🌀 Cyclone',
  'Floods': '🌊 Flood',
  'Drought': '🏜️ Drought',
  'Severe Weather': '⛈️ Severe Weather',
  'Tsunami': '🌊 Tsunami',
};

async function fetchEonetEvents() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  NASA EONET Natural Events Fetcher                               ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  console.log('Fetching natural events from NASA EONET...');

  try {
    const res = await fetch(EONET_API, {
      headers: { 'User-Agent': 'WorldDataMap/1.0 (educational)' },
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      throw new Error(`EONET API error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    console.log(`  Raw events received: ${data.events?.length || 0}`);

    // Process events - only keep last 30 days for relevance
    const events = [];
    const byCategory = {};
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30); // Only last 30 days

    for (const event of data.events || []) {
      // Get geometry (first available)
      const geometry = event.geometry?.[0];
      if (!geometry || !geometry.coordinates) continue;

      const [lng, lat] = geometry.coordinates;

      // Get primary category
      const category = event.categories?.[0]?.title || 'Unknown';

      // Parse date and filter old events
      const eventDate = geometry.date || event.startDate || new Date().toISOString();
      const eventTime = new Date(eventDate).getTime();
      if (eventTime < cutoffDate.getTime()) continue; // Skip events older than 30 days

      // Count by category
      byCategory[category] = (byCategory[category] || 0) + 1;

      // Determine severity based on event characteristics
      let severity = 'normal';
      const title = event.title || 'Unknown Event';
      if (title.toLowerCase().includes('extreme') || title.toLowerCase().includes('major')) {
        severity = 'high';
      } else if (title.toLowerCase().includes('moderate')) {
        severity = 'medium';
      }

      const updated = event.updated || eventDate;

      events.push({
        id: event.id,
        title: title,
        type: category,
        severity,
        lat: +lat.toFixed(4),
        lng: +lng.toFixed(4),
        date: eventDate.split('T')[0],
        updated: updated.split('T')[0],
        link: `https://eonet.gsfc.nasa.gov/event/${event.id}`,
        _closed: event.closed || false,
      });
    }

    console.log(`  Total valid events (last 30 days): ${events.length}`);
    console.log(`  Filtered out: ${data.events?.length - events.length} old events`);

    // Stats by category
    console.log('\n── Events by category ─────────────────────────────────────────────');
    for (const [cat, count] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
      const displayName = CATEGORY_NAMES[cat] || cat;
      console.log(`  ${displayName.padEnd(25)} ${count}`);
    }

    // Write full output
    const output = {
      fetched_at: new Date().toISOString(),
      source: 'NASA EONET',
      total: events.length,
      byCategory,
      events,
    };

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
    console.log(`\n✓ Written ${events.length} events to ${OUTPUT_PATH}`);

    // Also write lightweight version for map display
    const lightweight = {
      fetched_at: output.fetched_at,
      source: output.source,
      total: output.total,
      events: events.map(e => ({
        i: e.id,
        t: e.title.substring(0, 50),
        c: e.type,
        la: e.lat,
        lo: e.lng,
        d: e.date,
        s: e.severity === 'high' ? 2 : e.severity === 'medium' ? 1 : 0,
      })),
    };

    const lightPath = path.join(__dirname, '..', 'public', 'eonet-events-lite.json');
    fs.writeFileSync(lightPath, JSON.stringify(lightweight));
    console.log(`✓ Written lightweight version to ${lightPath}`);

    // Recent events spot-check
    console.log('\n── Recent events (last 10) ────────────────────────────────────────');
    events.slice(-10).forEach(e => {
      console.log(`  [${e.type.padEnd(20)}] ${e.title.substring(0, 40)}...`);
    });

  } catch (err) {
    console.error('[eonet] Error:', err.message);
    throw err;
  }
}

async function main() {
  try {
    await fetchEonetEvents();
    console.log('\n[eonet] Complete!');
  } catch (err) {
    console.error('[eonet] Failed:', err.message);
    process.exit(1);
  }
}

main();
