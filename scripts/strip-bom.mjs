#!/usr/bin/env node
/**
 * Strip the UTF-8 BOM from tracked text files.
 *
 * Windows PowerShell 5.1 writes a BOM with `Set-Content -Encoding UTF8`. Most
 * toolchains tolerate it, but strict JSON parsers (and therefore some package
 * managers) do not, so the repo keeps every text file BOM-free.
 *
 * Usage: node scripts/strip-bom.mjs [--check]
 *   --check  exit 1 if any tracked text file still starts with a BOM
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const TEXT = /\.(rs|ts|css|html|json|md|mjs|toml|yml|yaml|txt|gitignore|gitattributes|editorconfig)$/;
const check = process.argv.includes('--check');

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n')
  .map((line) => line.trim())
  .filter((file) => file.length > 0)
  .filter((file) => TEXT.test(file) || file === '.gitignore' || file === 'LICENSE');

const dirty = [];
for (const file of files) {
  const buffer = readFileSync(file);
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    dirty.push(file);
    if (!check) writeFileSync(file, buffer.subarray(3));
  }
}

if (check) {
  if (dirty.length > 0) {
    console.error(`[bom] ${dirty.length} file(s) start with a UTF-8 BOM:`);
    for (const file of dirty) console.error(`  ${file}`);
    process.exit(1);
  }
  console.log('[bom] all tracked text files are BOM-free');
} else {
  console.log(`[bom] stripped ${dirty.length} file(s)`);
  for (const file of dirty) console.log(`  ${file}`);
}
