#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const SCRIPTS = path.join(__dirname);

const PHASES = [
  {
    name: 'Phase 1: Base data (country-data.json rebuild)',
    parallel: false,
    scripts: ['fetch-country-data.js'],
  },
  {
    name: 'Phase 2a: Merge into country-data.json (clear-then-write)',
    parallel: false,
    scripts: [
      'fetch-fred.js',
      'fetch-imf.js',
      'fetch-whr.js',
      'fetch-ember.js',
      'fetch-wgi.js',
    ],
  },
  {
    name: 'Phase 2b: Merge into country-data.json (additive)',
    parallel: false,
    scripts: [
      'fetch-nuclear-energy.js',
      'fetch-internet-speed.js',
      'fetch-peace-index.js',
      'fetch-press-freedom.js',
      'fetch-hdi.js',
      'enrich-freedom-scores.js',
    ],
  },
  {
    name: 'Phase 2c: More country-data.json merges',
    parallel: false,
    scripts: [
      'fetch-trade.js',
      'fetch-who.js',
      'fetch-who-extended.js',
      'fetch-who-airquality.js',
      'fetch-oecd.js',
      'fetch-oecd-extended.js',
      'fetch-oecd-extended2.js',
      'fetch-oecd-social.js',
      'fetch-ember.js',
      'fetch-disaster-risk.js',
      'fetch-carbon.js',
      'fetch-carbon-extended.js',
      'enrich-country-central-banks.js',
    ],
  },
  {
    name: 'Phase 3: Independent datasets (different output files)',
    parallel: true,
    scripts: [
      'fetch-cities.js',
      'fetch-companies.js',
      'fetch-comtrade.js',
      'fetch-openflights.js',
      'fetch-climate.js',
      'fetch-zillow.js',
      'fetch-census-data.js',
      'fetch-census-business.js',
      'fetch-census-fips.js',
      'fetch-subnational-hdi.js',
      'fetch-eurostat.js',
      'fetch-eurostat-extended.js',
      'fetch-eurostat-regions.js',
      'fetch-eci.js',
      'fetch-japan-stats.js',
      'fetch-noaa-climate.js',
      'fetch-bea-trade.js',
      'fetch-ecb.js',
      'fetch-ecb-bonds.js',
      'fetch-ecb-rates-history.js',
      'fetch-boj.js',
      'fetch-fbi-crime.js',
      'fetch-cost-of-living.js',
      'fetch-tourism.js',
      'fetch-ports.js',
      'fetch-metro-ridership.js',
      'fetch-metro-transit.js',
      'fetch-patents.js',
      'fetch-uni-rankings.js',
      'fetch-startups.js',
      'fetch-air-routes.js',
      'fetch-submarine-cables.js',
      'fetch-unesco.js',
      'fetch-nobel-cities.js',
      'fetch-wikidata-universities.js',
      'fetch-peeringdb.js',
      'fetch-protected-planet.js',
      'fetch-vesselapi-ports.js',
      'fetch-us-states.js',
      'fetch-germany-states.js',
      'fetch-uk-regions.js',
      'fetch-france-regions.js',
      'fetch-spain-regions.js',
      'fetch-italy-regions.js',
      'fetch-india-states.js',
      'fetch-china-provinces.js',
      'fetch-korea-provinces.js',
      'fetch-indonesia-provinces.js',
      'fetch-mexico-states.js',
      'fetch-admin1-geo.js',
      'fetch-tectonic-plates.js',
      'fetch-opensky.js',
      'fetch-celestrak.js',
      'fetch-firms.js',
      'fetch-eonet.js',
      'fetch-waqi.js',
      'fetch-open-meteo-weather.js',
      'fetch-gtd.js',
      'fetch-gfp.js',
      'fetch-passport-index.js',
      'fetch-coingecko.js',
      'fetch-openalex.js',
      'fetch-gfw.js',
      'fetch-unhcr.js',
      'fetch-migrants.js',
      'fetch-carbon-extended.js',
      'fetch-pboc.js',
      'fetch-cbrt.js',
      'fetch-rbi.js',
      'fetch-ocean-data.js',
      'fetch-space-weather.js',
      'fetch-marinetraffic.js',
      'fetch-flightaware.js',
      'fetch-unesco-ich.js',
      'fetch-oecd-history.js',
    ],
  },
  {
    name: 'Phase 4: Dependent scripts (need prior outputs)',
    parallel: false,
    scripts: [
      'enrich-companies-wikidata.js',
      'generate-companies-split.js',
    ],
  },
  {
    name: 'Phase 5: Build (consolidate all data)',
    parallel: false,
    scripts: ['build-kdb.js', 'write-manifest.js'],
  },
];

function runScript(script, timeout) {
  const fp = path.join(SCRIPTS, script);
  if (!fs.existsSync(fp)) {
    console.log(`  SKIP ${script} (not found)`);
    return 'skip';
  }
  const label = script.replace(/\.js$/, '');
  const start = Date.now();
  try {
    execSync(`node "${fp}"`, {
      stdio: 'inherit',
      timeout: timeout || 600_000,
      windowsHide: true,
    });
    const sec = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`  OK   ${label} (${sec}s)`);
    return 'ok';
  } catch (e) {
    const sec = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`  FAIL ${label} (${sec}s) — ${e.message?.split('\n')[0] || 'error'}`);
    return 'fail';
  }
}

async function main() {
  const only = process.argv[2];
  let totalOk = 0, totalFail = 0, totalSkip = 0;

  if (only) {
    const phaseNum = parseInt(only, 10);
    if (isNaN(phaseNum) || phaseNum < 1 || phaseNum > PHASES.length) {
      console.error(`Usage: node fetch-all.js [1-${PHASES.length}]`);
      process.exit(1);
    }
    const phase = PHASES[phaseNum - 1];
    console.log(`\n${'='.repeat(60)}`);
    console.log(`${phase.name}`);
    console.log('='.repeat(60));
    for (const script of phase.scripts) {
      const result = runScript(script);
      if (result === 'ok') totalOk++;
      else if (result === 'fail') totalFail++;
      else totalSkip++;
    }
    console.log(`\nPhase ${phaseNum} complete: ${totalOk} OK, ${totalFail} FAIL, ${totalSkip} SKIP`);
    if (totalFail > 0) process.exit(1);
    return;
  }

  for (let i = 0; i < PHASES.length; i++) {
    const phase = PHASES[i];
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Phase ${i + 1}/${PHASES.length}: ${phase.name}`);
    console.log('='.repeat(60));

    if (phase.parallel && phase.scripts.length > 1) {
      console.log(`  (running ${phase.scripts.length} scripts in parallel)\n`);
      const results = await Promise.all(
        phase.scripts.map(script =>
          new Promise(resolve => {
            const child = require('child_process').fork(path.join(SCRIPTS, script), [], {
              silent: true,
              timeout: 600_000,
            });
            let output = '';
            child.stdout?.on('data', d => { output += d; });
            child.stderr?.on('data', d => { output += d; });
            child.on('exit', code => {
              const label = script.replace(/\.js$/, '');
              if (code === 0) {
                console.log(`  OK   ${label}`);
                totalOk++;
              } else if (!fs.existsSync(path.join(SCRIPTS, script))) {
                console.log(`  SKIP ${label} (not found)`);
                totalSkip++;
              } else {
                console.log(`  FAIL ${label}`);
                totalFail++;
              }
              resolve(code);
            });
            child.on('error', () => {
              console.log(`  SKIP ${script.replace(/\.js$/, '')}`);
              totalSkip++;
              resolve(-1);
            });
          })
        )
      );
    } else {
      for (const script of phase.scripts) {
        const result = runScript(script);
        if (result === 'ok') totalOk++;
        else if (result === 'fail') totalFail++;
        else totalSkip++;
      }
    }

    if (totalFail > 0 && i < PHASES.length - 1) {
      console.log(`\nWARNING: ${totalFail} script(s) failed. Continuing to next phase...`);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`ALL DONE: ${totalOk} OK, ${totalFail} FAIL, ${totalSkip} SKIP`);
  if (totalFail > 0) process.exit(1);
}

main();