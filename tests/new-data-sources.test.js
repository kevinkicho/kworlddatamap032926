'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const cdPath = path.join(__dirname, '../public/country-data.json');
let cd;
try { cd = JSON.parse(fs.readFileSync(cdPath, 'utf8')); }
catch { cd = null; }

// ── World Bank new indicators ──────────────────────────────────────────────

describe('World Bank new indicators', { skip: !cd }, () => {
  it('US has military_spend_gdp', () => {
    assert.ok(typeof cd['US'].military_spend_gdp === 'number');
    assert.ok(cd['US'].military_spend_gdp > 0 && cd['US'].military_spend_gdp < 20);
  });

  it('US has net_migration', () => {
    assert.ok(typeof cd['US'].net_migration === 'number');
  });

  it('US has research_articles', () => {
    assert.ok(typeof cd['US'].research_articles === 'number');
    assert.ok(cd['US'].research_articles > 100000);
  });

  it('US has forest_pct', () => {
    assert.ok(typeof cd['US'].forest_pct === 'number');
    assert.ok(cd['US'].forest_pct > 0 && cd['US'].forest_pct <= 100);
  });

  it('US has pop_growth', () => {
    assert.ok(typeof cd['US'].pop_growth === 'number');
  });

  it('US has female_labor_pct', () => {
    assert.ok(typeof cd['US'].female_labor_pct === 'number');
    assert.ok(cd['US'].female_labor_pct > 0 && cd['US'].female_labor_pct <= 100);
  });

  it('covers at least 150 countries with military_spend_gdp', () => {
    const count = Object.values(cd).filter(c => typeof c.military_spend_gdp === 'number').length;
    assert.ok(count >= 150, `only ${count} countries have military_spend_gdp`);
  });

  it('covers at least 200 countries with pop_growth', () => {
    const count = Object.values(cd).filter(c => typeof c.pop_growth === 'number').length;
    assert.ok(count >= 200, `only ${count} countries have pop_growth`);
  });
});

// ── Press Freedom Index ────────────────────────────────────────────────────

describe('Press Freedom Index (RSF)', { skip: !cd }, () => {
  it('US has press_freedom_score in range 0-100', () => {
    const s = cd['US'].press_freedom_score;
    assert.ok(typeof s === 'number');
    assert.ok(s >= 0 && s <= 100, `score ${s} out of range`);
  });

  it('Norway is #1 ranked', () => {
    assert.strictEqual(cd['NO'].press_freedom_rank, 1);
  });

  it('score range is valid across all countries', () => {
    for (const [iso, c] of Object.entries(cd)) {
      if (c.press_freedom_score != null) {
        assert.ok(c.press_freedom_score >= 0 && c.press_freedom_score <= 100,
          `${iso}: score ${c.press_freedom_score} out of range`);
      }
    }
  });

  it('covers at least 150 countries', () => {
    const count = Object.values(cd).filter(c => c.press_freedom_score != null).length;
    assert.ok(count >= 150, `only ${count} countries`);
  });
});

// ── Global Peace Index ─────────────────────────────────────────────────────

describe('Global Peace Index (GPI)', { skip: !cd }, () => {
  it('Iceland is #1 ranked', () => {
    assert.strictEqual(cd['IS'].gpi_rank, 1);
  });

  it('GPI score range is 1.0-4.0', () => {
    for (const [iso, c] of Object.entries(cd)) {
      if (c.gpi_score != null) {
        assert.ok(c.gpi_score >= 1.0 && c.gpi_score <= 4.0,
          `${iso}: GPI score ${c.gpi_score} out of range`);
      }
    }
  });

  it('covers at least 140 countries', () => {
    const count = Object.values(cd).filter(c => c.gpi_score != null).length;
    assert.ok(count >= 140, `only ${count} countries`);
  });
});

// ── Internet Speed ─────────────────────────────────────────────────────────

describe('Internet Speed (Ookla)', { skip: !cd }, () => {
  it('US has download, upload, and mobile speeds', () => {
    assert.ok(typeof cd['US'].inet_download_mbps === 'number');
    assert.ok(typeof cd['US'].inet_upload_mbps === 'number');
    assert.ok(typeof cd['US'].inet_mobile_mbps === 'number');
  });

  it('all speeds are positive', () => {
    for (const [iso, c] of Object.entries(cd)) {
      if (c.inet_download_mbps != null) {
        assert.ok(c.inet_download_mbps > 0, `${iso}: download ${c.inet_download_mbps}`);
        assert.ok(c.inet_upload_mbps > 0, `${iso}: upload ${c.inet_upload_mbps}`);
        assert.ok(c.inet_mobile_mbps > 0, `${iso}: mobile ${c.inet_mobile_mbps}`);
      }
    }
  });

  it('covers at least 100 countries', () => {
    const count = Object.values(cd).filter(c => c.inet_download_mbps != null).length;
    assert.ok(count >= 100, `only ${count} countries`);
  });
});

// ── Nuclear Energy ─────────────────────────────────────────────────────────

describe('Nuclear Energy (IAEA)', { skip: !cd }, () => {
  it('US has nuclear data', () => {
    assert.ok(cd['US'].nuclear_reactors > 0);
    assert.ok(cd['US'].nuclear_capacity_gw > 0);
    assert.ok(cd['US'].nuclear_generation_twh > 0);
  });

  it('France has 50+ reactors', () => {
    assert.ok(cd['FR'].nuclear_reactors >= 50);
  });

  it('covers at least 25 countries', () => {
    const count = Object.values(cd).filter(c => c.nuclear_reactors != null && c.nuclear_reactors > 0).length;
    assert.ok(count >= 25, `only ${count} countries`);
  });
});

// ── Cross-source completeness ──────────────────────────────────────────────

describe('Data completeness spot checks', { skip: !cd }, () => {
  it('Japan has all new sources', () => {
    const jp = cd['JP'];
    assert.ok(jp.military_spend_gdp != null, 'missing military');
    assert.ok(jp.gpi_score != null, 'missing GPI');
    assert.ok(jp.press_freedom_score != null, 'missing press freedom');
    assert.ok(jp.inet_download_mbps != null, 'missing internet speed');
    assert.ok(jp.nuclear_reactors != null, 'missing nuclear');
  });

  it('Nigeria has WB indicators even without OECD/nuclear', () => {
    const ng = cd['NG'];
    assert.ok(ng.pop_growth != null, 'missing pop_growth');
    assert.ok(ng.female_labor_pct != null, 'missing female_labor');
    assert.ok(ng.press_freedom_score != null, 'missing press freedom');
    assert.ok(ng.gpi_score != null, 'missing GPI');
  });

  it('all year fields are reasonable (2020-2026)', () => {
    const yearKeys = ['press_freedom_year', 'gpi_year', 'inet_speed_year', 'nuclear_year'];
    for (const [iso, c] of Object.entries(cd)) {
      for (const yk of yearKeys) {
        if (c[yk] != null) {
          const y = Number(c[yk]);
          assert.ok(y >= 2020 && y <= 2026, `${iso}.${yk} = ${c[yk]} is out of range`);
        }
      }
    }
  });
});
