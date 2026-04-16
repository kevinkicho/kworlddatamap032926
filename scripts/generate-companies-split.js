#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');

const COMPANIES_FILE = path.join(__dirname, '..', 'public', 'companies.json');
const INDEX_OUT      = path.join(__dirname, '..', 'public', 'companies-index.json');
const DETAIL_OUT     = path.join(__dirname, '..', 'public', 'companies-detail.json');

const INDEX_FIELDS = [
  'qid', 'name', 'industry',
  'revenue', 'revenue_currency', 'revenue_year', 'revenue_date',
  'net_income', 'net_income_currency', 'net_income_date',
  'employees', 'employees_date',
  'market_cap', 'market_cap_currency', 'market_cap_year',
  'founded', 'exchange', 'ticker', 'company_type', 'wikipedia',
];

const INDEX_SET = new Set(INDEX_FIELDS);

function buildIndex(companies) {
  const index = {};
  for (const [cityQid, coList] of Object.entries(companies)) {
    index[cityQid] = coList.map(co => {
      const slim = {};
      for (const key of INDEX_FIELDS) {
        if (co[key] !== undefined) slim[key] = co[key];
      }
      return slim;
    });
  }
  return index;
}

function buildDetail(companies) {
  const detail = {};
  for (const coList of Object.values(companies)) {
    for (const co of coList) {
      if (!co.qid) continue;
      if (detail[co.qid]) continue;
      const full = {};
      for (const [key, val] of Object.entries(co)) {
        if (!INDEX_SET.has(key) && key !== 'qid') {
          full[key] = val;
        }
      }
      if (Object.keys(full).length > 0) {
        detail[co.qid] = full;
      }
    }
  }
  return detail;
}

function main() {
  console.log('Loading companies.json...');
  const companies = JSON.parse(fs.readFileSync(COMPANIES_FILE, 'utf8'));

  const index = buildIndex(companies);
  const detail = buildDetail(companies);

  const indexJson = JSON.stringify(index);
  const detailJson = JSON.stringify(detail);

  atomicWrite(INDEX_OUT, indexJson);
  atomicWrite(DETAIL_OUT, detailJson);

  const totalCos = Object.values(companies).flat().length;
  console.log(`Index:  ${(indexJson.length / 1024 / 1024).toFixed(1)} MB — ${Object.keys(index).length} cities, ${Object.values(index).flat().length} companies`);
  console.log(`Detail: ${(detailJson.length / 1024 / 1024).toFixed(1)} MB — ${Object.keys(detail).length} unique companies`);
  console.log(`  (master had ${totalCos} company entries across ${Object.keys(companies).length} cities)`);
}

module.exports = { buildIndex, buildDetail, INDEX_FIELDS };

if (require.main === module) {
  main();
}
