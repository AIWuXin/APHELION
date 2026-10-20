#!/usr/bin/env node
/**
 * Packages the game as a single self-contained Windows executable.
 *
 *   node scripts/package-exe.mjs [--debug]
 *
 * Steps: wasm build → vite build → cargo build -p oc-launcher --release →
 * copy the binary to `dist-exe/APHELION-<version>.exe`.
 *
 * The launcher embeds every file of `dist/` via `include_bytes!`, so the exe is
 * the whole game: double-click it and the default browser opens on the served
 * client. No Node.js, no WebView2, no installer.
 */

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const debug = process.argv.includes('--debug');
const profile = debug ? 'debug' : 'release';

function run(command, args, label) {
  process.stdout.write(`\n=== ${label} ===\n`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    console.error(`[package-exe] ${label} failed`);
    process.exit(result.status ?? 1);
  }
}

/** `0.1.0-a0` (semver) → `0.1.0a0` (display, matches oc_protocol::PRODUCT_VERSION). */
function displayVersion() {
  const cargo = readFileSync(join(root, 'Cargo.toml'), 'utf8');
  const match = cargo.match(/^version\s*=\s*"([^"]+)"/m);
  const semver = match?.[1] ?? '0.0.0';
  return semver.replace('-', '');
}

run('node', ['scripts/build-wasm.mjs'], 'build wasm');
run('npx', ['vite', 'build'], 'build web bundle');

const dist = join(root, 'dist');
if (!existsSync(join(dist, 'index.html')) || !existsSync(join(dist, 'oc.wasm'))) {
  console.error('[package-exe] dist/ is incomplete; the exe would ship without the client');
  process.exit(1);
}

const cargoArgs = ['build', '-p', 'oc-launcher'];
if (!debug) cargoArgs.push('--release');
run('cargo', cargoArgs, `build launcher (${profile})`);

const exeName = process.platform === 'win32' ? 'aphelion.exe' : 'aphelion';
const built = join(root, 'target', profile, exeName);
if (!existsSync(built)) {
  console.error(`[package-exe] launcher binary missing: ${built}`);
  process.exit(1);
}

const version = displayVersion();
const outDir = join(root, 'dist-exe');
mkdirSync(outDir, { recursive: true });
const outName = process.platform === 'win32' ? `APHELION-${version}.exe` : `APHELION-${version}`;
const target = join(outDir, outName);
copyFileSync(built, target);

const size = statSync(target).size;
console.log(`\n[package-exe] ${outName}  ${(size / 1024 / 1024).toFixed(2)} MiB`);
console.log('[package-exe] 双击即可启动（自动选择空闲端口并用默认浏览器打开）');
console.log('[package-exe] 命令行选项：--port N  --no-open  --help');
