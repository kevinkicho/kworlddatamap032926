#!/usr/bin/env node
/**
 * scripts/fix-company-data.js
 *
 * One-time post-processing pass over companies.json to clean up data quality issues
 * caused by Wikipedia infobox parsing bugs that are now fixed in fetch-infoboxes.js.
 *
 * Problems fixed:
 *   1. key_people entries with {{small|...}} template residue in name/role
 *   2. key_people entries with leading * from wiki bullet syntax
 *   3. key_people entries that are just }}  (template closure residue)
 *   4. key_people roles ending with | or other markup
 *   5. products/subsidiaries entries with | pipe-separated values (not split)
 *   6. Very long (>100 char) garbage entries in any list field
 *
 * Usage:
 *   node scripts/fix-company-data.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'public', 'companies.json');

// ── helpers ───────────────────────────────────────────────────────────────────

// Strip residual wiki markup from a string
function stripMarkup(s) {
  if (!s) return s;
  return s
    .replace(/\{\{[^|}]*\|([^}|]*)\}\}/g, '$1')   // {{template|val}} → val
    .replace(/\{\{[^}]*\}\}/g, '')                  // {{template}} → ''
    .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, '$1')   // [[Link|Text]] → Text
    .replace(/\[\[([^\]|]+)\]\]/g, '$1')            // [[Link]] → Link
    .replace(/'{2,3}/g, '')                          // bold/italic markers
    .replace(/<[^>]+>/g, '')                         // HTML tags
    .replace(/&nbsp;?/g, ' ')                        // HTML entities
    .replace(/&amp;/g, '&')
    .replace(/[|,]\s*$/, '')                         // trailing pipe or comma
    .replace(/^\s*[*#•|]\s*/, '')                    // leading bullet/pipe
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// True if a string looks like garbage (template residue, too short, too long)
function isGarbage(s) {
  if (!s) return true;
  if (/^[}\]|{]+$/.test(s)) return true;          // just }}, }}, etc.
  if (s.startsWith('{{') || s.includes('}}')) return true;
  if (s.includes('{{')) return true;
  if (s.length > 100) return true;
  if (s.length < 2) return true;
  return false;
}

// Looks like an infobox field line (e.g. "products =", "num_employees = 5000")
function isInlineFieldName(s) {
  return /^\w[\w\s]* =/.test(s);
}

// Parse a single "Name (Role)" or "Role: Name" or "Name, Role" string into {name, role}
function parsePerson(s) {
  s = s.trim();
  if (!s || isGarbage(s) || isInlineFieldName(s)) return null;

  // Strip leading (Role) orphan prefix separated by | e.g. "(Co-chairman)|Ferdinand Sia"
  // → role = "Co-chairman", name = "Ferdinand Sia"
  const orphanRolePrefix = s.match(/^\(([^)]+)\)\s*\|(.+)$/);
  if (orphanRolePrefix) {
    const name = stripMarkup(orphanRolePrefix[2]);
    const role = stripMarkup(orphanRolePrefix[1]);
    if (!isGarbage(name)) return { name, role: isGarbage(role) ? null : role };
  }

  // "Role: Name" format (e.g. "Co-Chairman: Guo Guangchang")
  const colonRole = s.match(/^([^:]{3,30}):\s*(.{2,})$/);
  if (colonRole) {
    const role = stripMarkup(colonRole[1]);
    const name = stripMarkup(colonRole[2]);
    if (!isGarbage(name) && !isGarbage(role)) return { name, role };
  }

  // class= attribute residue: "class=nowrap|Real Name" → "Real Name"
  const classResid = s.match(/^class=\w+\|(.+)$/i);
  if (classResid) {
    const name = stripMarkup(classResid[1]);
    if (!isGarbage(name)) return { name, role: null };
  }

  // "Director)|Real Name" → "(Director)" orphan prefix
  const bareOrphanRole = s.match(/^([A-Z][^|)]{2,25}\))\s*\|(.+)$/);
  if (bareOrphanRole) {
    const role = stripMarkup('(' + bareOrphanRole[1].replace(/\)+$/, ''));
    const name = stripMarkup(bareOrphanRole[2]);
    if (!isGarbage(name)) return { name, role: isGarbage(role) ? null : role.replace(/^\(|\)$/g,'') };
  }

  // Standard "Name (Role)" or "Name, Role"
  const cleaned = stripMarkup(s);
  if (!cleaned || isGarbage(cleaned)) return null;

  const m = cleaned.match(/^(.+?)\s*[\(,]\s*(.+?)\s*\)?$/);
  if (m) {
    const name = m[1].replace(/[|,]\s*$/, '').trim();
    const role = m[2].replace(/\)+$/, '').replace(/[|,]\s*$/, '').trim();
    if (!isGarbage(name)) return { name, role: isGarbage(role) ? null : role };
  }

  if (!isGarbage(cleaned)) return { name: cleaned, role: null };
  return null;
}

// Clean a single key_people entry; returns array of {name, role} (may be 0 or more)
function cleanPerson(p) {
  const rawName = (p.name || '').trim();
  const rawRole = (p.role || '').trim();

  // If name contains pipe(s) it's multiple people jammed into one entry.
  // Also the role field may hold yet another person (truncated) — include it.
  if (rawName.includes('|')) {
    // Check for simple "(Role)|Name" whole-string pattern first
    const orphanPrefix = rawName.match(/^\(([^)]+)\)\s*\|(.+)$/);
    if (orphanPrefix && !orphanPrefix[2].includes('|')) {
      const name = stripMarkup(orphanPrefix[2]);
      const role = stripMarkup(orphanPrefix[1]);
      const results = isGarbage(name) ? [] : [{ name, role: isGarbage(role) ? null : role }];
      // Also try to parse the role field as an additional person
      if (rawRole) {
        const extra = parsePerson(rawRole + (rawRole.includes('(') ? '' : ''));
        if (extra) results.push(extra);
      }
      return results;
    }

    // General pipe-split: split name field, then also parse role as one more person
    const parts = rawName.split('|').map(s => s.trim()).filter(Boolean);
    const results = [];
    for (const part of parts) {
      const person = parsePerson(part);
      if (person) results.push(person);
    }
    // The role field often holds a truncated extra person (e.g. "Nobuyuki Koga (Chairman")
    if (rawRole) {
      // Close unclosed paren if needed
      const extraStr = rawRole.endsWith(')') ? rawRole : rawRole + ')';
      const extra = parsePerson(extraStr);
      if (extra) results.push(extra);
    }
    return results;
  }

  // Simple case: name may have "Name|(role)" - a bare role suffix
  const bareRoleSuffix = rawName.match(/^(.+?)\s*\|\s*\(([^)]+)\)$/);
  if (bareRoleSuffix) {
    const name = stripMarkup(bareRoleSuffix[1]);
    const role = stripMarkup(bareRoleSuffix[2]);
    if (!isGarbage(name)) return [{ name, role: isGarbage(role) ? null : role }];
  }

  // Reconstruct full string from name + role for standard parsing
  const full = rawName + (rawRole ? ` (${rawRole})` : '');
  const person = parsePerson(full);
  return person ? [person] : [];
}

// Split a product/subsidiary entry that was incorrectly stored pipe-joined
function splitEntry(s) {
  if (!s) return [];
  // Split on pipe, then on slash-separated alternatives that look like separate items
  return s.split('|')
    .map(x => x.replace(/^\s*[*#•]\s*/, '').trim())
    .filter(x => x.length > 1 && x.length < 100 && !isGarbage(x));
}

// ── main ──────────────────────────────────────────────────────────────────────

const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));

let totalCities = 0;
let patchedCompanies = 0;
let fixedPeopleEntries = 0;
let fixedListEntries = 0;

for (const [qid, companies] of Object.entries(data)) {
  totalCities++;
  for (const co of companies) {
    let changed = false;

    // ── key_people ─────────────────────────────────────────────────────────
    if (Array.isArray(co.key_people) && co.key_people.length) {
      const cleaned = [];
      for (const p of co.key_people) {
        const results = cleanPerson(p);
        if (results.length === 0) {
          fixedPeopleEntries++;
          changed = true;
        } else {
          // Check if anything actually changed
          if (results.length !== 1 || results[0].name !== p.name || results[0].role !== p.role) {
            changed = true;
          }
          cleaned.push(...results);
        }
      }
      // Pair orphan "(Role)" entries with preceding roleless person
      const paired = [];
      for (const p of cleaned) {
        const isOrphan = /^\([^)]+\)$/.test(p.name) && !p.role;
        if (isOrphan && paired.length && !paired[paired.length - 1].role) {
          paired[paired.length - 1] = { ...paired[paired.length - 1], role: p.name.slice(1, -1) };
        } else if (isOrphan && paired.length && paired[paired.length - 1].role) {
          // Skip — can't pair, no place to attach
        } else {
          paired.push(p);
        }
      }

      // Deduplicate by name
      const seen = new Set();
      const deduped = paired.filter(p => {
        if (isGarbage(p.name) || isInlineFieldName(p.name)) return false;
        if (seen.has(p.name)) return false;
        seen.add(p.name);
        return true;
      });
      if (changed || deduped.length !== co.key_people.length) {
        co.key_people = deduped.length ? deduped : undefined;
        if (co.key_people === undefined) delete co.key_people;
        changed = true;
      }
    }

    // ── products ───────────────────────────────────────────────────────────
    for (const field of ['products', 'subsidiaries']) {
      if (!Array.isArray(co[field])) continue;
      const expanded = [];
      let needsExpansion = false;
      for (const entry of co[field]) {
        if (typeof entry === 'string' && entry.includes('|')) {
          needsExpansion = true;
          const parts = splitEntry(entry);
          expanded.push(...parts);
          fixedListEntries += parts.length > 1 ? parts.length - 1 : 0;
        } else if (typeof entry === 'string' && !isGarbage(entry)) {
          expanded.push(entry.trim());
        } else {
          needsExpansion = true;
          fixedListEntries++;
        }
      }
      if (needsExpansion) {
        const deduped = [...new Set(expanded)].slice(0, 25);
        co[field] = deduped.length ? deduped : undefined;
        if (co[field] === undefined) delete co[field];
        changed = true;
      }
    }

    if (changed) patchedCompanies++;
  }
}

fs.writeFileSync(FILE, JSON.stringify(data), 'utf8');

console.log(`✓ Processed ${totalCities} cities`);
console.log(`✓ Patched    ${patchedCompanies} company records`);
console.log(`✓ Removed/fixed ${fixedPeopleEntries} bad key_people entries`);
console.log(`✓ Split/fixed   ${fixedListEntries} bad product/subsidiary entries`);
console.log(`✓ Wrote ${FILE}`);
