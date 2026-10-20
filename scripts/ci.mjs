#!/usr/bin/env node
/**
 * One command CI. Everything the brief asks for, in the order that fails fastest.
 *
 *   node scripts/ci.mjs            full run
 *   node scripts/ci.mjs --web      skip the Rust half
 *   node scripts/ci.mjs --rust     skip the web half
 */

import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const onlyWeb = process.argv.includes('--web');
const onlyRust = process.argv.includes('--rust');

const results = [];

function run(label, command, args, check, capture = false) {
  process.stdout.write(`\n=== ${label} ===\n`);
  const started = Date.now();
  const wantStdout = capture || typeof check === 'function';
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: wantStdout ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    encoding: wantStdout ? 'utf8' : undefined,
    shell: process.platform === 'win32',
    env: { ...process.env, RUSTFLAGS: '-D warnings' },
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const stdout = wantStdout ? (result.stdout ?? '').trim() : '';
  let ok = result.status === 0;
  if (ok && stdout) console.log(`[ci] ${stdout}`);
  if (ok && typeof check === 'function') {
    const problem = check(stdout);
    if (problem) {
      console.error(`[ci] ${problem}`);
      ok = false;
    }
  }
  results.push({ label, ok, seconds });
  if (!ok) {
    console.error(`\n[ci] FAILED: ${label} (${seconds}s)`);
    summarise();
    process.exit(1);
  }
  return stdout;
}

function summarise() {
  console.log('\n=== ci summary ===');
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.seconds.padStart(6)}s  ${r.label}`);
  }
}

if (!onlyWeb) {
  run('rust: cargo fmt --check', 'cargo', ['fmt', '--all', '--', '--check']);
  run('rust: cargo clippy -D warnings', 'cargo', ['clippy', '--all-targets', '--all-features', '--', '-D', 'warnings']);
  run('rust: cargo test', 'cargo', ['test', '--all-features']);
  run('rust: headless determinism (3000 ticks)', 'cargo', ['run', '-q', '-p', 'oc-sim-cli', '--', '3000']);
  // Staleness gate for the binary that would be committed. It has to run
  // *before* the release build below: that build overwrites web/public/oc.wasm,
  // so comparing afterwards would just be the fresh binary against itself.
  const nativeHash = run(
    'rust: native idle hash (300 ticks)',
    'cargo',
    ['run', '-q', '-p', 'oc-sim-cli', '--', '--idle', '300'],
    undefined,
    true,
  );
  run(
    'rust: committed wasm behaves like the kernel sources',
    'node',
    ['scripts/wasm-hash.mjs', 'web/public/oc.wasm', '300'],
    (wasmHash) =>
      wasmHash === nativeHash
        ? null
        : `committed web/public/oc.wasm is stale (native ${nativeHash} vs wasm ${wasmHash}). Run 'pnpm run wasm' and commit the rebuilt binary.`,
  );
  run('rust: wasm32 release build', 'node', ['scripts/build-wasm.mjs']);
}

if (!onlyRust) {
  run('web: typecheck', 'npx', ['tsc', '--noEmit']);
  run('web: eslint', 'npx', ['eslint', '.']);
  run('web: unit tests', 'npx', ['vitest', 'run']);
  run('web: vite build', 'npx', ['vite', 'build']);
  run('web: file length guard', 'node', ['scripts/check-file-length.mjs']);
  run('web: no bitmap / emoji assets', 'node', ['scripts/check-assets.mjs']);
  run('web: text files are BOM-free', 'node', ['scripts/strip-bom.mjs', '--check']);
  run('package: single-file exe', 'node', ['scripts/package-exe.mjs']);
}

summarise();
console.log('\n[ci] all green');
