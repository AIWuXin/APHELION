#!/usr/bin/env node
/**
 * Headless screenshot + console-error harness.
 *
 * Serves the built `dist/` folder with an in-process static server (so there is
 * no dependency on a preview CLI), opens the page in the locally installed
 * Chrome through playwright-core, waits for the boot veil to disappear, records
 * console errors, and writes a PNG.
 *
 * Usage:
 *   node scripts/screenshot.mjs [--out .tmp/shot.png] [--width 1920] [--height 1080]
 *                               [--wait 3500] [--seed N] [--debug] [--click x,y]
 */

import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { extname, dirname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'dist');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const value = process.argv[i + 1];
  return value && !value.startsWith('--') ? value : true;
}

if (!existsSync(join(dist, 'index.html'))) {
  console.error('[screenshot] dist/index.html missing — run `npx vite build` first');
  process.exit(1);
}

const out = resolve(root, String(arg('out', '.tmp/shot.png')));
const width = Number(arg('width', 1920));
const height = Number(arg('height', 1080));
const waitMs = Number(arg('wait', 3500));
const seed = String(arg('seed', '1602900180'));
const debug = process.argv.includes('--debug');
const demo = process.argv.includes('--demo');
const clickArg = arg('click', null);
mkdirSync(dirname(out), { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const target = normalize(join(dist, pathname));
  if (!target.startsWith(dist + sep) || !existsSync(target) || statSync(target).isDirectory()) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
    return;
  }
  const body = readFileSync(target);
  res.writeHead(200, {
    'content-type': MIME[extname(target)] ?? 'application/octet-stream',
    'content-length': body.length,
    'cache-control': 'no-store',
  });
  res.end(body);
});

await new Promise((done) => server.listen(0, '127.0.0.1', done));
const address = server.address();
const port = typeof address === 'object' && address ? address.port : 0;
const baseUrl = `http://127.0.0.1:${port}/`;

const query = new URLSearchParams();
query.set('seed', seed);
if (debug) query.set('debug', '1');
if (demo) query.set('demo', '1');
if (process.argv.includes('--rush')) query.set('rush', '1');
const url = `${baseUrl}?${query.toString()}`;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });

const errors = [];
const logs = [];
page.on('console', (msg) => {
  const text = `${msg.type()}: ${msg.text()}`;
  logs.push(text);
  if (msg.type() === 'error') errors.push(text);
});
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
page.on('requestfailed', (req) => errors.push(`requestfailed: ${req.url()} ${req.failure()?.errorText ?? ''}`));

await page.goto(url, { waitUntil: 'load' });
await page
  .waitForFunction(() => document.getElementById('boot-veil')?.classList.contains('gone') === true, {
    timeout: 25_000,
  })
  .catch(() => errors.push('boot veil never cleared'));

if (clickArg && clickArg !== true) {
  const [x, y] = String(clickArg).split(',').map(Number);
  await page.mouse.click(x ?? 0, y ?? 0);
  await page.waitForTimeout(600);
}

await page.waitForTimeout(waitMs);
await page.screenshot({ path: out });
await browser.close();
server.close();

const uniqueErrors = [...new Set(errors)];
console.log(`[screenshot] wrote ${out}`);
console.log(`[screenshot] console lines: ${logs.length}`);
if (uniqueErrors.length > 0) {
  console.error(`[screenshot] ${uniqueErrors.length} error(s):`);
  for (const e of uniqueErrors.slice(0, 20)) console.error(`  ${e}`);
  process.exitCode = 1;
} else {
  console.log('[screenshot] no console errors');
}
