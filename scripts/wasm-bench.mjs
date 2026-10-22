#!/usr/bin/env node
/**
 * Prints the same three performance numbers as `oc-sim-cli --bench`, but for the
 * wasm build the browser actually runs.
 *
 * Same harness shape as `scripts/wasm-hash.mjs`: instantiate the module, call
 * the raw `extern "C"` ABI, no wasm-bindgen. Same seed and the same chunk
 * coordinates as the native bench, so the two outputs can be read side by side.
 *
 * Usage: node scripts/wasm-bench.mjs [wasm path]
 *
 * Prints one line per measurement, plus the idle state hash as a determinism
 * cross-check against `cargo run -q -p oc-sim-cli -- --idle 3000`.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
/** Must match `SEED` in crates/sim-cli/src/bench.rs. */
const SEED = 0x5eed_1234;
const CHUNK_SAMPLES = 256;
const TICK_SAMPLES = 3000;
/** Must match `CHUNKS` in crates/iso/src/torus.rs. */
const CHUNKS = 320;

const wasmPath = process.argv[2]
  ? resolve(process.argv[2])
  : join(root, 'web', 'public', 'oc.wasm');

const bytes = readFileSync(wasmPath);
const { instance } = await WebAssembly.instantiate(bytes, {});
const wasm = instance.exports;

for (const name of ['oc_init', 'oc_step', 'oc_chunk', 'oc_chunk_len', 'oc_state_hash']) {
  if (typeof wasm[name] !== 'function') {
    console.error(`[wasm-bench] ${wasmPath} has no ${name} export`);
    process.exit(1);
  }
}

/** splitmix64, mirrored from the native bench. */
const MASK = (1n << 64n) - 1n;
function mix64(z) {
  z = ((z ^ (z >> 30n)) * 0xbf58_476d_1ce4_e5b9n) & MASK;
  z = ((z ^ (z >> 27n)) * 0x94d0_49bb_1331_11ebn) & MASK;
  return (z ^ (z >> 31n)) & MASK;
}

function sampleChunks() {
  let state = 0x1234_5678_9abc_def0n;
  const out = [];
  for (let i = 0; i < CHUNK_SAMPLES; i += 1) {
    state = mix64(state);
    const cx = Number((state >> 32n) % BigInt(CHUNKS));
    state = mix64(state);
    const cy = Number((state >> 32n) % BigInt(CHUNKS));
    out.push([cx, cy]);
  }
  return out;
}

function stats(micros) {
  const sorted = [...micros].sort((a, b) => a - b);
  const pick = (percent) => sorted[Math.min(sorted.length - 1, Math.ceil((percent / 100) * sorted.length) - 1)];
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const ms = (v) => (v / 1000).toFixed(3);
  return `n=${sorted.length} mean ${ms(mean)}ms p50 ${ms(pick(50))}ms p95 ${ms(pick(95))}ms max ${ms(sorted[sorted.length - 1])}ms`;
}

wasm.oc_init(SEED);
console.log('bench      : wasm (web/public/oc.wasm)');
console.log(`seed       : 0x${SEED.toString(16).padStart(8, '0')}`);

const chunks = sampleChunks();
for (let i = 0; i < 16; i += 1) wasm.oc_chunk(chunks[i][0], chunks[i][1]);
const chunkMicros = [];
for (const [cx, cy] of chunks) {
  const started = performance.now();
  const ptr = wasm.oc_chunk(cx, cy);
  const len = wasm.oc_chunk_len();
  chunkMicros.push((performance.now() - started) * 1000);
  if (ptr === 0 || len === 0) throw new Error(`oc_chunk(${cx}, ${cy}) encoded nothing`);
}
console.log(`chunk gen  : ${stats(chunkMicros)} (oc_chunk: generation + postcard encode)`);

wasm.oc_init(SEED);
const tickStarted = performance.now();
for (let tick = 0; tick < TICK_SAMPLES; tick += 1) wasm.oc_step();
const tickMs = performance.now() - tickStarted;
console.log(
  `tick idle  : ${TICK_SAMPLES} ticks ${tickMs.toFixed(1)}ms total ${(tickMs / TICK_SAMPLES).toFixed(3)}ms/tick`,
);

const snapshotBytes = wasm.oc_snapshot_len();
const hash = wasm.oc_state_hash() >>> 0;
console.log(`snapshot   : ${snapshotBytes} bytes (oc_snapshot_len after ${TICK_SAMPLES} idle ticks)`);
console.log(`hash idle  : 0x${hash.toString(16).padStart(8, '0')}`);
