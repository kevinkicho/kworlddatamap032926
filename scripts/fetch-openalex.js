/**
 * Fetch OpenAlex research output data by country
 *
 * OpenAlex provides free access to bibliometric data:
 * - works_count: Total publications with authors from this country
 * - cited_by_count: Total citations received
 *
 * API: https://api.openalex.org/countries
 * No API key required.
 */

const fs = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');

const OUTPUT = path.join(__dirname, '..', 'public', 'openalex-countries.json');
const COUNTRY_DATA = path.join(__dirname, '..', 'public', 'country-data.json');

async function fetchAllCountries() {
  console.log('[openalex] Fetching country research data from OpenAlex...');

  const allCountries = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const url = `https://api.openalex.org/countries?per_page=${perPage}&page=${page}`;
    console.log(`[openalex] Fetching page ${page}...`);

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`OpenAlex API error: ${res.status}`);
    }

    const data = await res.json();

    for (const country of data.results) {
      // Map OpenAlex country_code to ISO2
      const iso2 = country.country_code;

      allCountries.push({
        iso2,
        name: country.display_name,
        works_count: country.works_count,
        cited_by_count: country.cited_by_count,
        // Calculated metrics
        citations_per_paper: country.works_count > 0
          ? Math.round((country.cited_by_count / country.works_count) * 10) / 10
          : 0,
      });
    }

    // Check if we've fetched all pages
    if (data.results.length < perPage) break;
    page++;

    // Be nice to the API
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`[openalex] Fetched ${allCountries.length} countries`);
  return allCountries;
}

async function main() {
  try {
    const countries = await fetchAllCountries();

    // Write raw data
    atomicWrite(OUTPUT, JSON.stringify(countries, null, 2));
    console.log(`[openalex] Wrote ${countries.length} countries to ${OUTPUT}`);

    // Also update country-data.json with new fields
    console.log('[openalex] Merging into country-data.json...');
    const countryData = JSON.parse(fs.readFileSync(COUNTRY_DATA, 'utf8'));

    let merged = 0;
    for (const c of countries) {
      if (countryData[c.iso2]) {
        countryData[c.iso2].research_papers = c.works_count;
        countryData[c.iso2].research_citations = c.cited_by_count;
        countryData[c.iso2].research_citations_per_paper = c.citations_per_paper;
        merged++;
      }
    }

    atomicWrite(COUNTRY_DATA, JSON.stringify(countryData, null, 2));
    console.log(`[openalex] Merged research data into ${merged} countries`);

  } catch (err) {
    console.error('[openalex] Error:', err.message);
    process.exit(1);
  }
}

main();