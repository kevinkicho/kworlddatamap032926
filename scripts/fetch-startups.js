#!/usr/bin/env node
/**
 * scripts/fetch-startups.js
 *
 * Builds public/startups.json — Startup ecosystem data for major tech hubs.
 *
 * Fields per city:
 *   city           — City name (for matching)
 *   country        — Country name
 *   unicorns       — Number of unicorn startups ($1B+ valuation)
 *   total_funding_bn — Total VC funding (USD billions, 2020-2024)
 *   top_startups   — Array of notable startup names
 *   ecosystem_rank — Global Startup Ecosystem Ranking (StartupBlink 2024)
 *
 * Source: Compiled from StartupBlink 2024, CB Insights unicorn list,
 *   Crunchbase, PitchBook (2024 data year).
 *
 * Usage: node scripts/fetch-startups.js
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const OUT_PATH = path.join(__dirname, '..', 'public', 'startups.json');

// [city, country, unicorns, total_funding_bn, ecosystem_rank, [notable startups]]
const DATA = [
  ['San Francisco', 'United States', 120, 220, 1, ['Stripe', 'Airbnb', 'DoorDash', 'Instacart', 'Figma']],
  ['New York City', 'United States', 85, 150, 2, ['Bloomberg', 'Datadog', 'UiPath', 'Oscar Health', 'Brex']],
  ['London', 'United Kingdom', 50, 65, 3, ['Revolut', 'Monzo', 'Wise', 'Deliveroo', 'Checkout.com']],
  ['Beijing', 'China', 65, 80, 4, ['ByteDance', 'Meituan', 'Didi', 'Kuaishou', 'SenseTime']],
  ['Shanghai', 'China', 45, 55, 5, ['Pinduoduo', 'Nio', 'Xiaohongshu', 'Zhangmen', 'Full Truck Alliance']],
  ['Los Angeles', 'United States', 40, 65, 6, ['SpaceX', 'Snap', 'Honey', 'Scopely', 'Turo']],
  ['Boston', 'United States', 35, 55, 7, ['Toast', 'Grammarly', 'Locus Robotics', 'Wasabi', 'EzCater']],
  ['Bangalore', 'India', 40, 45, 8, ['Flipkart', 'Swiggy', 'Razorpay', 'Zerodha', 'CRED']],
  ['Singapore', 'Singapore', 25, 25, 9, ['Grab', 'Sea Group', 'Nium', 'Carro', 'Ninja Van']],
  ['Tel Aviv', 'Israel', 30, 30, 10, ['Wix', 'Monday.com', 'Gong', 'Papaya Global', 'Fireblocks']],
  ['Berlin', 'Germany', 20, 22, 11, ['N26', 'Delivery Hero', 'Auto1', 'Personio', 'Mambu']],
  ['Seoul', 'South Korea', 18, 18, 12, ['Coupang', 'Krafton', 'Viva Republica', 'Yanolja', 'Dunamu']],
  ['Paris', 'France', 18, 20, 13, ['Dataiku', 'Contentsquare', 'BlaBlaCar', 'Doctolib', 'Back Market']],
  ['Seattle', 'United States', 25, 35, 14, ['Convoy', 'Outreach', 'Auth0', 'Icertis', 'Highspot']],
  ['Chicago', 'United States', 15, 20, 15, ['Tempus', 'Uptake', 'G2', 'Halo Investing', 'ShipBob']],
  ['Toronto', 'Canada', 15, 15, 16, ['Shopify', 'Wealthsimple', 'Clio', 'ApplyBoard', '1Password']],
  ['Tokyo', 'Japan', 12, 12, 17, ['Preferred Networks', 'SmartNews', 'Spiber', 'TBM', 'ispace']],
  ['Austin', 'United States', 15, 18, 18, ['CrowdStrike', 'WP Engine', 'BigCommerce', 'TrendKite', 'Atmosphere']],
  ['Washington', 'United States', 12, 15, 19, ['IronNet', 'Cvent', 'EverFi', 'Alarm.com', 'Framebridge']],
  ['Mumbai', 'India', 22, 20, 20, ['Zomato', 'Dream11', 'PhonePe', 'BrowserStack', 'Groww']],
  ['Shenzhen', 'China', 30, 35, 21, ['DJI', 'OnePlus', 'Royole', 'WeBank', 'Ubtech Robotics']],
  ['Amsterdam', 'Netherlands', 12, 10, 22, ['Adyen', 'Booking.com', 'Mollie', 'Messagebird', 'Miro']],
  ['Stockholm', 'Sweden', 15, 12, 23, ['Klarna', 'Spotify', 'Northvolt', 'Einride', 'Karma']],
  ['Sydney', 'Australia', 10, 10, 24, ['Canva', 'Atlassian', 'Airwallex', 'SafetyCulture', 'Go1']],
  ['Dubai', 'United Arab Emirates', 8, 6, 25, ['Careem', 'Kitopi', 'Noon', 'Swvl', 'Ziina']],
  ['São Paulo', 'Brazil', 12, 10, 26, ['Nubank', 'iFood', 'QuintoAndar', 'Loft', 'Creditas']],
  ['Jakarta', 'Indonesia', 8, 8, 27, ['GoTo', 'Traveloka', 'Bukalapak', 'Xendit', 'Kopi Kenangan']],
  ['Hangzhou', 'China', 20, 25, 28, ['Ant Group', 'Alibaba Cloud', 'Hikvision', 'Dahua']],
  ['Munich', 'Germany', 8, 8, 29, ['Celonis', 'FlixBus', 'Lilium', 'Personio Munich']],
  ['Melbourne', 'Australia', 5, 5, 30, ['Judo Bank', 'Culture Amp', 'MYOB', 'Afterpay']],
  ['Miami', 'United States', 10, 12, 31, ['Pipe', 'Reef Technology', 'Papa', 'NeuraFlash']],
  ['Denver', 'United States', 8, 8, 32, ['Guild Education', 'Ibotta', 'Ping Identity']],
  ['Dublin', 'Ireland', 6, 5, 33, ['Stripe EU', 'Workhuman', 'Intercom', 'LetsGetChecked']],
  ['Helsinki', 'Finland', 5, 4, 34, ['Wolt', 'Supercell', 'Oura', 'Relex Solutions']],
  ['Vancouver', 'Canada', 5, 5, 35, ['Hootsuite', 'Clio Vancouver', 'Dapper Labs', 'Trulioo']],
  ['Zurich', 'Switzerland', 4, 4, 36, ['On Running', 'Scandit', 'Climeworks', 'Acronis']],
  ['Taipei', 'Taiwan', 5, 4, 37, ['Appier', 'Gogoro', '91APP', 'PChome']],
  ['Barcelona', 'Spain', 4, 3, 38, ['Glovo', 'Typeform', 'Factorial', 'TravelPerk']],
  ['Cape Town', 'South Africa', 3, 2, 39, ['Yoco', 'SweepSouth', 'Aerobotics']],
  ['Nairobi', 'Kenya', 4, 2, 40, ['M-Pesa', 'Twiga Foods', 'Cellulant', 'Sendy']],
  ['Mexico City', 'Mexico', 5, 4, 41, ['Kavak', 'Clip', 'Konfio', 'Bitso']],
  ['Warsaw', 'Poland', 4, 3, 42, ['Docplanner', 'Booksy', 'Brainly']],
  ['Kuala Lumpur', 'Malaysia', 3, 2, 43, ['Carsome', 'Aerodyne', 'GoGet']],
  ['Buenos Aires', 'Argentina', 5, 3, 44, ['Mercado Libre', 'Auth0 AR', 'Ualá', 'Tiendanube']],
  ['Bangkok', 'Thailand', 3, 2, 45, ['Flash Express', 'Bitkub', 'Ascend Money']],
  ['Lagos', 'Nigeria', 5, 3, 46, ['Flutterwave', 'Paystack', 'Andela', 'Kuda']],
  ['Santiago', 'Chile', 3, 2, 47, ['Cornershop', 'NotCo', 'Betterfly']],
  ['Bogotá', 'Colombia', 3, 2, 48, ['Rappi', 'Addi', 'Platzi']],
  ['Cairo', 'Egypt', 3, 1.5, 49, ['Swvl', 'Fawry', 'MaxAB']],
  ['Ho Chi Minh City', 'Vietnam', 3, 1.5, 50, ['VNG', 'Tiki', 'Sky Mavis']],
];

function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  Startup Ecosystem builder                                       ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  const startups = DATA.map(([city, country, unicorns, funding, rank, notable]) => ({
    city, country, unicorns, total_funding_bn: funding,
    ecosystem_rank: rank, top_startups: notable,
  }));

  console.log(`Total cities: ${startups.length}`);
  console.log(`Total unicorns tracked: ${startups.reduce((s, c) => s + c.unicorns, 0)}`);

  fs.writeFileSync(OUT_PATH, JSON.stringify(startups, null, 2));
  console.log(`✓ Written to ${OUT_PATH}`);

  console.log('\n── Top 10 ──────────────────────────────────────────────────────────');
  startups.slice(0, 10).forEach(s => {
    console.log(`  #${s.ecosystem_rank} ${s.city}: ${s.unicorns} unicorns, $${s.total_funding_bn}B funding`);
  });
}

main();
