'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { mergeWikidataIntoCompany } = require('../scripts/enrich-companies-wikidata');

describe('mergeWikidataIntoCompany', () => {
  it('fills null string field (ceo)', () => {
    const co = { qid: 'Q1', name: 'Acme', ceo: null };
    mergeWikidataIntoCompany(co, { ceo: 'Jane Doe' });
    assert.equal(co.ceo, 'Jane Doe');
  });

  it('does not overwrite existing string field', () => {
    const co = { qid: 'Q1', name: 'Acme', ceo: 'Existing CEO' };
    mergeWikidataIntoCompany(co, { ceo: 'Jane Doe' });
    assert.equal(co.ceo, 'Existing CEO');
  });

  it('fills empty array field (founders)', () => {
    const co = { qid: 'Q1', name: 'Acme', founders: [] };
    mergeWikidataIntoCompany(co, { founders: ['Alice', 'Bob'] });
    assert.deepEqual(co.founders, ['Alice', 'Bob']);
  });

  it('fills null array field (products)', () => {
    const co = { qid: 'Q1', name: 'Acme', products: null };
    mergeWikidataIntoCompany(co, { products: ['Widget'] });
    assert.deepEqual(co.products, ['Widget']);
  });

  it('does not overwrite non-empty array field', () => {
    const co = { qid: 'Q1', name: 'Acme', founders: ['Original'] };
    mergeWikidataIntoCompany(co, { founders: ['New'] });
    assert.deepEqual(co.founders, ['Original']);
  });

  it('fills null numeric field (employees)', () => {
    const co = { qid: 'Q1', name: 'Acme', employees: null };
    mergeWikidataIntoCompany(co, { employees: 5000 });
    assert.equal(co.employees, 5000);
  });

  it('does not overwrite existing numeric field', () => {
    const co = { qid: 'Q1', name: 'Acme', employees: 3000 };
    mergeWikidataIntoCompany(co, { employees: 5000 });
    assert.equal(co.employees, 3000);
  });

  it('fills multiple fields in one call', () => {
    const co = { qid: 'Q1', name: 'Acme', ceo: null, parent_org: null, employees: 100 };
    mergeWikidataIntoCompany(co, { ceo: 'Boss', parent_org: 'MegaCorp', employees: 9999 });
    assert.equal(co.ceo, 'Boss');
    assert.equal(co.parent_org, 'MegaCorp');
    assert.equal(co.employees, 100);
  });

  it('ignores null values from wikidata', () => {
    const co = { qid: 'Q1', name: 'Acme', ceo: null };
    mergeWikidataIntoCompany(co, { ceo: null });
    assert.equal(co.ceo, null);
  });

  it('deduplicates array values', () => {
    const co = { qid: 'Q1', name: 'Acme', products: null };
    mergeWikidataIntoCompany(co, { products: ['Cars', 'Cars', 'Bikes'] });
    assert.deepEqual(co.products, ['Cars', 'Bikes']);
  });
});
