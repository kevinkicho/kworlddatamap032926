'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

function wrapIdx(idx, dir, len) {
  return (idx + dir + len) % len;
}

describe('carousel index wrapping', () => {
  it('wraps forward from last to first', () => {
    assert.equal(wrapIdx(2, 1, 3), 0);
  });

  it('wraps backward from first to last', () => {
    assert.equal(wrapIdx(0, -1, 3), 2);
  });

  it('advances normally in bounds', () => {
    assert.equal(wrapIdx(0, 1, 3), 1);
    assert.equal(wrapIdx(1, 1, 3), 2);
  });

  it('retreats normally in bounds', () => {
    assert.equal(wrapIdx(2, -1, 3), 1);
    assert.equal(wrapIdx(1, -1, 3), 0);
  });

  it('handles single-element array (always 0)', () => {
    assert.equal(wrapIdx(0, 1, 1), 0);
    assert.equal(wrapIdx(0, -1, 1), 0);
  });

  it('handles 2-element array at boundary', () => {
    assert.equal(wrapIdx(1, 1, 2), 0);
    assert.equal(wrapIdx(0, -1, 2), 1);
  });
});