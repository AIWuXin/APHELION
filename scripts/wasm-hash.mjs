#!/usr/bin/env node
/**
 * Prints the idle state hash of a wasm build of the simulation kernel.
 *
 * This is the wasm half of the committed-binary staleness gate. The kernel is
 * deterministic, so `web/public/oc.wasm` must report the same hash as a native
 * `oc-sim-cli` built from the current sources for the same seed and tick count.
 * A byte comparison cannot work: rustc embeds host-specific source paths in the
 * binary, so a Windows build and a Linux build never match byte for byte.
 *
 * Usage: node scripts/wasm-hash.mjs [wasm path] [ticks=300]
 *
 * Prints exactly one line, e.g. `0x9c12e413`, so a shell can compare it with
 * `cargo run -q -p oc-sim-cli -- --idle 300` as plain strings.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
/** Must match `DEFAULT_SEED` in crates/sim-cli/src/main.rs. */
const DEFAULT_SEED = 0x5eed_1234;
const DEFAULT_TICKS = 300;

const wasmPath = process.argv[2]
  ? resolve(process.argv[2])
  : join(root, 'web', 'public', 'oc.wasm');
const ticksArg = process.argv[3] ?? String(DEFAULT_TICKS);
const ticks = Number(ticksArg);

if (!/^\d+$/.test(ticksArg) || !Number.isSafeInteger(ticks)) {
  console.error(`[wasm-hash] ticks must be a non-negative integer, got '${ticksArg}'`);
  process.exit(1);
}

let bytes;
try {
  bytes = readFileSync(wasmPath);
} catch (error) {
  console.error(`[wasm-hash] cannot read ${wasmPath}: ${error.message}`);
  process.exit(1);
}

let instance;
try {
  ({ instance } = await WebAssembly.instantiate(bytes, {}));
} catch (error) {
  console.error(`[wasm-hash] ${wasmPath} is not a valid wasm module: ${error.message}`);
  process.exit(1);
}

const exports = instance.exports;

if (typeof exports.oc_init !== 'function' || typeof exports.oc_step !== 'function') {
  console.error(`[wasm-hash] ${wasmPath} does not expose oc_init/oc_step: not an oc bridge build`);
  process.exit(1);
}

if (typeof exports.oc_state_hash !== 'function') {
  console.error(`[wasm-hash] ${wasmPath} has no oc_state_hash export: it predates the state-hash ABI.`);
  console.error("[wasm-hash] Rebuild and commit it with 'pnpm run wasm'.");
  process.exit(1);
}

exports.oc_init(DEFAULT_SEED);
for (let tick = 0; tick < ticks; tick += 1) {
  exports.oc_step();
}

// wasm i32 results surface as signed JS numbers; fold back to u32.
const hash = exports.oc_state_hash() >>> 0;
console.log(`0x${hash.toString(16).padStart(8, '0')}`);
