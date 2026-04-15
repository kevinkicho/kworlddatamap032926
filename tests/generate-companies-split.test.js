'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { buildIndex, buildDetail, INDEX_FIELDS } = require('../scripts/generate-companies-split');

const SAMPLE_DATA = {
  'Q1490': [
    {
      qid: 'Q9584', name: 'Honda', industry: 'automotive',
      revenue: 14950000000000, revenue_currency: 'JPY', revenue_year: 2022,
      net_income: 707000000000, net_income_currency: 'JPY',
      employees: 194993, market_cap: null, market_cap_currency: null,
      founded: 1948, exchange: 'TSE', ticker: '7267', company_type: 'Public',
      wikipedia: 'https://en.wikipedia.org/wiki/Honda',
      description: 'manufacturer of automobiles',
      website: 'https://global.honda', ceo: 'Toshihiro Mibe',
      founders: ['Soichiro Honda'], parent_org: null,
      products: ['Automobiles', 'Motorcycles'],
      subsidiaries: [], traded_as: 'HMC', key_people: [],
      revenue_history: [[2022, 14950000000000]],
      employees_history: [[2024, 194993]],
      net_income_history: [[2022, 707000000000]],
      operating_income: 871200000000, operating_income_currency: 'JPY',
      operating_income_history: [[2022, 871200000000]],
      total_assets: 23970000000000, total_assets_currency: 'JPY',
      total_assets_history: [[2022, 23970000000000]],
      total_equity: 10770000000000, total_equity_currency: 'JPY',
      total_equity_history: [[2022, 10770000000000]],
    }
  ]
};

describe('buildIndex', () => {
  it('keeps only INDEX_FIELDS per company', () => {
    const idx = buildIndex(SAMPLE_DATA);
    const co = idx['Q1490'][0];
    assert.equal(co.name, 'Honda');
    assert.equal(co.revenue, 14950000000000);
    assert.equal(co.qid, 'Q9584');
    assert.equal(co.description, undefined);
    assert.equal(co.website, undefined);
    assert.equal(co.ceo, undefined);
    assert.equal(co.founders, undefined);
    assert.equal(co.revenue_history, undefined);
  });

  it('preserves city QID keys', () => {
    const idx = buildIndex(SAMPLE_DATA);
    assert.ok(idx['Q1490']);
    assert.equal(idx['Q1490'].length, 1);
  });
});

describe('buildDetail', () => {
  it('keys by company QID, not city QID', () => {
    const det = buildDetail(SAMPLE_DATA);
    assert.ok(det['Q9584']);
    assert.equal(det['Q1490'], undefined);
  });

  it('includes detail fields', () => {
    const det = buildDetail(SAMPLE_DATA);
    const co = det['Q9584'];
    assert.equal(co.description, 'manufacturer of automobiles');
    assert.equal(co.ceo, 'Toshihiro Mibe');
    assert.deepEqual(co.founders, ['Soichiro Honda']);
    assert.deepEqual(co.revenue_history, [[2022, 14950000000000]]);
  });

  it('excludes index-only fields from detail', () => {
    const det = buildDetail(SAMPLE_DATA);
    const co = det['Q9584'];
    assert.equal(co.name, undefined);
    assert.equal(co.revenue, undefined);
    assert.equal(co.industry, undefined);
  });
});

describe('split file consistency (integration)', () => {
  const fs = require('fs');
  const indexPath = path.join(__dirname, '..', 'public', 'companies-index.json');
  const detailPath = path.join(__dirname, '..', 'public', 'companies-detail.json');

  const indexExists = fs.existsSync(indexPath);
  const detailExists = fs.existsSync(detailPath);

  if (indexExists && detailExists) {
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    const detail = JSON.parse(fs.readFileSync(detailPath, 'utf8'));

    it('every company in index has a qid', () => {
      for (const coList of Object.values(index)) {
        for (const co of coList) {
          assert.ok(co.qid, `Company ${co.name} missing qid`);
        }
      }
    });

    it('every company with a qid in index has a detail entry', () => {
      let missing = 0;
      for (const coList of Object.values(index)) {
        for (const co of coList) {
          if (co.qid && !detail[co.qid]) missing++;
        }
      }
      assert.ok(missing < 100, `${missing} companies in index have no detail entry`);
    });

    it('index does not contain detail-only fields', () => {
      const detailOnlyFields = ['description', 'website', 'ceo', 'founders',
        'products', 'subsidiaries', 'revenue_history', 'employees_history'];
      for (const coList of Object.values(index)) {
        for (const co of coList) {
          for (const f of detailOnlyFields) {
            assert.equal(co[f], undefined, `Index company ${co.name} has detail field ${f}`);
          }
        }
      }
    });
  }
});
