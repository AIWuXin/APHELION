#!/usr/bin/env node
/**
 * Builds the Rust bridge to wasm and copies it next to the web assets.
 *
 * Deliberately dependency-free: one `cargo build` plus a file copy. There is no
 * wasm-pack / wasm-bindgen step because the bridge is a raw `extern "C"` ABI
 * (see crates/bridge-wasm/src/lib.rs).
 *
 * Usage: node scripts/build-wasm.mjs [--release|--debug]
 */

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const release = !process.argv.includes('--debug');
const profile = release ? 'release' : 'debug';
const targetDir = join(root, 'target', 'wasm32-unknown-unknown', profile);
const outDir = join(root, 'web', 'public');
const outFile = join(outDir, 'oc.wasm');

function run(args) {
  const result = spawnSync('cargo', args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    console.error(`\n[build-wasm] cargo exited with ${result.status ?? 'signal'}`);
    process.exit(result.status ?? 1);
  }
}

const args = ['build', '-p', 'oc-bridge-wasm', '--target', 'wasm32-unknown-unknown'];
if (release) args.push('--release');
run(args);

const candidates = [
  join(targetDir, 'oc_bridge_wasm.wasm'),
  join(targetDir, 'oc-bridge-wasm.wasm'),
];
const source = candidates.find((p) => existsSync(p));
if (!source) {
  console.error(`[build-wasm] no wasm artifact in ${targetDir}`);
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
copyFileSync(source, outFile);
const kb = (statSync(outFile).size / 1024).toFixed(1);
console.log(`[build-wasm] ${profile} oc.wasm ${kb} KiB -> web/public/oc.wasm`);
