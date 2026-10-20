#!/usr/bin/env node
/**
 * One-shot brand rename: ORBITAL COMMAND -> APHELION.
 *
 * Only touches *brand* tokens, never the word "orbital" (which is a real
 * game-design term used all over the protocol: orbital lanes, orbital layer,
 * Orbital struct, etc.), and never the internal `oc-` / `--oc-` / `.oc-`
 * prefixes (documented as stable internal identifiers in decisions.md N-08).
 *
 * The two original prompt documents in docs/ are kept verbatim: they are the
 * specification of record, not product copy.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const PROTECTED = new Set(['docs/master-prompt.md', 'docs/sci-fi-style-prompt.md']);

/** Longest first so `ORBITAL-COMMAND-x` is not half-matched by the space rule. */
const REPLACEMENTS = [
  ['ORBITAL-COMMAND', 'APHELION'],
  ['ORBITAL COMMAND', 'APHELION'],
  ['Orbital Command', 'Aphelion'],
  ['orbital-command', 'aphelion'],
  ['星区指挥终端', '远日点指挥终端'],
];

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n')
  .map((line) => line.trim())
  .filter((file) => /\.(rs|ts|css|html|json|md|mjs|toml|yml|yaml)$/.test(file))
  .filter((file) => !PROTECTED.has(file));

let changed = 0;
let occurrences = 0;
for (const file of files) {
  const before = readFileSync(file, 'utf8');
  let after = before;
  let hits = 0;
  for (const [from, to] of REPLACEMENTS) {
    const parts = after.split(from);
    if (parts.length > 1) {
      hits += parts.length - 1;
      after = parts.join(to);
    }
  }
  if (after !== before) {
    writeFileSync(file, after, 'utf8');
    changed += 1;
    occurrences += hits;
    console.log(`  ${file}  (${hits})`);
  }
}
console.log(`\nrenamed ${occurrences} occurrence(s) in ${changed} file(s)`);
