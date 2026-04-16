#!/usr/bin/env node
/**
 * scripts/audit-coverage.js
 *
 * Reads public/kdb.json, filters out Aggregates, and counts how many
 * real countries have data for each requested field. Prints results
 * sorted by coverage ascending.
 *
 * Usage:
 *   node scripts/audit-coverage.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const KDB_FILE = path.join(__dirname, '..', 'public', 'kdb.json');

const FIELDS = [
  { label: 'gdp_per_capita',       key: 'gdp_per_capita' },
  { label: 'gdp_per_capita_year',   key: 'gdp_per_capita_year' },
  { label: 'gdp_growth',            key: null },
  { label: 'gdp_nominal',           key: null },
  { label: 'gdp_ppp',               key: null },
  { label: 'inflation',             key: 'cpi_inflation' },
  { label: 'unemployment',          key: 'unemployment_rate' },
  { label: 'gov_debt',              key: 'govt_debt_gdp' },
  { label: 'gini',                  key: 'gini' },
  { label: 'hdi',                   key: 'hdi' },
  { label: 'co2_emissions',         key: 'co2_total_mt' },
  { label: 'co2_per_capita',        key: 'co2_per_capita' },
  { label: 'military_spending',     key: 'military_spend_gdp' },
  { label: 'trade_balance',         key: null },
  { label: 'current_account',       key: 'fiscal_balance_gdp' },
  { label: 'fx_rate',               key: null },
  { label: 'internet_users',        key: 'internet_pct' },
  { label: 'life_expectancy',       key: 'life_expectancy' },
  { label: 'birth_rate',            key: null },
  { label: 'death_rate',            key: null },
  { label: 'urbanization',          key: 'urban_pct' },
  { label: 'corruption_index',      key: 'ti_cpi_score' },
  { label: 'press_freedom_index',   key: 'press_freedom_score' },
  { label: 'democracy_index',       key: 'wgi_voice_accountability' },
  { label: 'population',            key: 'population' },
  { label: 'area_km2',              key: 'area_km2' },
  { label: 'credit_sp',            key: 'credit_sp' },
  { label: 'credit_fitch',         key: 'credit_fitch' },
  { label: 'credit_moodys',        key: 'credit_moodys' },
  { label: 'bond_yield_10y',       key: 'bond_yield_10y' },
  { label: 'electricity_pct',      key: 'electricity_pct' },
  { label: 'renewable_energy_pct',  key: 'renewable_energy_pct' },
  { label: 'education_spend_gdp',   key: 'education_spend_gdp' },
  { label: 'health_spend_gdp',      key: 'health_spend_gdp' },
  { label: 'migrant_stock',         key: 'migrant_stock' },
  { label: 'road_death_rate',       key: 'road_death_rate' },
  { label: 'pm25',                 key: 'pm25' },
  { label: 'safe_water_pct',       key: 'safe_water_pct' },
  { label: 'research_articles',     key: 'research_articles' },
  { label: 'child_mortality',      key: 'child_mortality' },
  { label: 'wgi_rule_of_law',      key: 'wgi_rule_of_law' },
  { label: 'wgi_govt_effectiveness', key: 'wgi_govt_effectiveness' },
  { label: 'female_labor_pct',     key: 'female_labor_pct' },
  { label: 'forest_pct',            key: 'forest_pct' },
  { label: 'pop_growth',            key: 'pop_growth' },
  { label: 'net_migration',         key: 'net_migration' },
  { label: 'whr_score',             key: 'whr_score' },
  { label: 'fh_score',             key: 'fh_score' },
  { label: 'gpi_score',            key: 'gpi_score' },
  { label: 'inform_risk',           key: 'inform_risk' },
  { label: 'exports_pct_gdp',      key: 'exports_pct_gdp' },
  { label: 'imports_pct_gdp',      key: 'imports_pct_gdp' },
  { label: 'fdi_inflow_gdp',       key: 'fdi_inflow_gdp' },
];

const kdb = JSON.parse(fs.readFileSync(KDB_FILE, 'utf8'));
const cd = kdb['country-data'];

const real = Object.entries(cd).filter(([, v]) => v.income_level !== 'Aggregates');
const total = real.length;

const results = [];
for (const f of FIELDS) {
  const actualKey = f.key;
  if (!actualKey) {
    results.push({ label: f.label, count: 0, pct: 0, note: 'no matching key' });
    continue;
  }
  const count = real.filter(([, v]) => v[actualKey] != null && v[actualKey] !== '').length;
  results.push({ label: f.label, count, pct: Math.round(count / total * 100), note: actualKey });
}

results.sort((a, b) => a.pct - b.pct || a.count - b.count);

const pad = (s, n) => String(s).padEnd(n, ' ');
console.log(pad('Field', 35) + pad('Key', 35) + pad('Count', 8) + 'Coverage');
console.log('-'.repeat(35 + 35 + 8 + 8));
for (const r of results) {
  console.log(pad(r.label, 35) + pad(r.note, 35) + pad(r.count + '/' + total, 8) + r.pct + '%');
}