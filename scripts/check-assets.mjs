#!/usr/bin/env node
/**
 * Asset discipline guard.
 *
 * The brief bans bitmaps, emoji and icon fonts in the product. This script fails
 * the build if:
 *  - a raster or font asset appears under `web/` (the style reference lives in
 *    `docs/` and is documentation, never shipped),
 *  - a hand written source file under `web/src` contains emoji or a private-use
 *    icon glyph,
 *  - a web source requests an absolute external URL (the demo runs offline; the
 *    only network call allowed is fetching our own `oc.wasm`),
 *  - `Math.random` appears in the web sources (randomness belongs to the
 *    deterministic simulation streams).
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const FORBIDDEN_EXT = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.ico',
  '.ttf',
  '.otf',
  '.woff',
  '.woff2',
  '.eot',
]);

/** Emoji-ish ranges plus the private use area (icon fonts). */
const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F2FF}\u{2600}-\u{27BF}\u{E000}-\u{F8FF}\u{FE0F}]/u;

/** Absolute external URLs used as runtime requests. */
const EXTERNAL_RE = /(?:fetch|WebSocket|EventSource|importScripts)\s*\(\s*['"`]https?:\/\//;

const problems = [];

function walk(dir, onFile) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, onFile);
    else onFile(full);
  }
}

walk('web', (file) => {
  const rel = relative(process.cwd(), file);
  const dot = file.lastIndexOf('.');
  const ext = dot < 0 ? '' : file.slice(dot).toLowerCase();

  if (FORBIDDEN_EXT.has(ext)) {
    problems.push(`bitmap/font asset shipped: ${rel}`);
    return;
  }
  if (ext !== '.ts' && ext !== '.css' && ext !== '.html') return;

  const text = readFileSync(file, 'utf8');
  // Generated protocol types are tool output; their header carries a doc URL.
  const isGenerated = rel.includes('generated');
  if (!isGenerated && EMOJI_RE.test(text)) {
    problems.push(`emoji or private-use glyph in: ${rel}`);
  }
  if (text.includes('Math.random')) {
    problems.push(`Math.random in: ${rel}`);
  }
  if (!isGenerated && EXTERNAL_RE.test(text)) {
    problems.push(`external request in: ${rel}`);
  }
});

if (problems.length > 0) {
  console.error(`[assets] ${problems.length} violation(s):`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log('[assets] no bitmaps, no emoji, no icon fonts, no external requests, no Math.random');
