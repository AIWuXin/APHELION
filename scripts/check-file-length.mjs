#!/usr/bin/env node
/**
 * Enforces the "no single file turns into a dumping ground" rule from the brief.
 *
 * Scans the hand-written source trees (Rust crates, web sources, scripts, docs
 * scripts excluded) and fails if any file exceeds the limit.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const LIMIT = 400;
const ROOTS = ['crates', 'web/src', 'web/tests', 'scripts'];
const EXTENSIONS = new Set(['.rs', '.ts', '.mjs', '.css', '.toml']);
const SKIP_DIRS = new Set(['node_modules', 'target', 'dist', 'fixtures', 'generated', '.git']);

const offenders = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full);
      continue;
    }
    const dot = entry.lastIndexOf('.');
    if (dot < 0) continue;
    if (!EXTENSIONS.has(entry.slice(dot))) continue;
    const lines = readFileSync(full, 'utf8').split('\n').length;
    if (lines > LIMIT) offenders.push({ file: full, lines });
  }
}

for (const root of ROOTS) walk(root);

if (offenders.length > 0) {
  console.error(`[file-length] ${offenders.length} file(s) exceed ${LIMIT} lines:`);
  for (const o of offenders) console.error(`  ${relative(process.cwd(), o.file)}  ${o.lines} lines`);
  process.exit(1);
}
console.log(`[file-length] all source files <= ${LIMIT} lines`);
