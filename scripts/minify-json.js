#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const dryRun = process.argv.includes('--dry-run');

const files = fs.readdirSync(PUBLIC_DIR).filter(f => f.endsWith('.json'));
let totalSaved = 0;

for (const file of files) {
  const fp = path.join(PUBLIC_DIR, file);
  const raw = fs.readFileSync(fp, 'utf8');
  const before = Buffer.byteLength(raw, 'utf8');

  const first200 = raw.slice(0, 200);
  if (!first200.includes('\n')) {
    console.log(`  skip ${file} (already minified)`);
    continue;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.warn(`  WARN ${file}: invalid JSON — ${e.message}`);
    continue;
  }

  const minified = JSON.stringify(parsed);
  const after = Buffer.byteLength(minified, 'utf8');
  const saved = before - after;
  const pct = ((saved / before) * 100).toFixed(1);

  if (saved <= 0) {
    console.log(`  skip ${file} (no savings)`);
    continue;
  }

  if (!dryRun) {
    fs.writeFileSync(fp, minified);
  }

  console.log(`  ${dryRun ? '[dry] ' : ''}${file}: ${(before / 1024 / 1024).toFixed(2)} MB -> ${(after / 1024 / 1024).toFixed(2)} MB (saved ${pct}%)`);
  totalSaved += saved;
}

console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Total saved: ${(totalSaved / 1024 / 1024).toFixed(2)} MB`);
