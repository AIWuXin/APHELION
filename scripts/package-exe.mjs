#!/usr/bin/env node
/**
 * Packages the game as two self-contained Windows executables.
 *
 *   node scripts/package-exe.mjs [--debug]
 *
 * Steps: wasm build → vite build → cargo build -p oc-desktop → copy to
 * `dist-exe/APHELION-<version>.exe` (the desktop build, primary product) →
 * cargo build -p oc-launcher → copy to `dist-exe/APHELION-<version>-browser.exe`
 * (the browser fallback).
 *
 * Both binaries embed every file of `dist/` via `include_bytes!`, so each exe is
 * the whole game. The desktop exe opens a native WebView2 window (no browser, no
 * port); the browser exe is the fallback for machines without WebView2 and
 * serves the identical bytes over loopback HTTP.
 */

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const debug = process.argv.includes('--debug');
const profile = debug ? 'debug' : 'release';
const windows = process.platform === 'win32';

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

/** Build one crate and copy its binary into `dist-exe/`. */
function buildExe({ crate, bin, name, label }) {
  const args = ['build', '-p', crate];
  if (!debug) args.push('--release');
  run('cargo', args, `build ${label} (${profile})`);

  const built = join(root, 'target', profile, windows ? `${bin}.exe` : bin);
  if (!existsSync(built)) {
    console.error(`[package-exe] ${label} 二进制缺失：${built}`);
    process.exit(1);
  }

  const target = join(outDir, windows ? `${name}.exe` : name);
  copyFileSync(built, target);
  const size = statSync(target).size;
  if (size === 0) {
    console.error(`[package-exe] ${label} 产物为空：${target}`);
    process.exit(1);
  }
  return { path: target, name: windows ? `${name}.exe` : name, size };
}

run('node', ['scripts/build-wasm.mjs'], 'build wasm');
run('npx', ['vite', 'build'], 'build web bundle');

const dist = join(root, 'dist');
if (!existsSync(join(dist, 'index.html')) || !existsSync(join(dist, 'oc.wasm'))) {
  console.error('[package-exe] dist/ 不完整；两个 exe 都会缺少前端资源');
  process.exit(1);
}

const version = displayVersion();
const outDir = join(root, 'dist-exe');
mkdirSync(outDir, { recursive: true });

// Desktop first: it is the product users are pointed at. The browser launcher is
// built second so a broken fallback cannot block the primary deliverable.
const desktop = buildExe({
  crate: 'oc-desktop',
  bin: 'aphelion-desktop',
  name: `APHELION-${version}`,
  label: 'desktop（tao 窗口 + WebView2）',
});
const browser = buildExe({
  crate: 'oc-launcher',
  bin: 'aphelion',
  name: `APHELION-${version}-browser`,
  label: 'launcher（浏览器兜底）',
});

const mib = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MiB`;

console.log(`\n[package-exe] 构建完成（${debug ? 'debug' : 'release'} profile）`);
console.log(`  ${desktop.name}  ${mib(desktop.size)}   桌面版（主产物）`);
console.log(`  ${browser.name}  ${mib(browser.size)}   浏览器兜底版`);
console.log('');
console.log('[package-exe] 桌面版：双击即开原生窗口，不启动浏览器、不监听端口，关窗即退出。');
console.log('[package-exe] 浏览器版：给缺少 WebView2 的老机器兜底（自动选空闲端口并打开默认浏览器）。');
if (debug) {
  console.log('[package-exe] 注意：debug 版保留控制台窗口与 DevTools，仅供本机调试，分发请用 release。');
}
console.log('[package-exe] 两个 exe 都未做代码签名：首次运行若出现 SmartScreen「Windows 已保护你的电脑」，');
console.log('[package-exe]   点「更多信息 → 仍要运行」即可；自己本地构建的 exe 没有下载标记，通常不会触发。');
console.log('[package-exe] 命令行：桌面版 --seed N / --debug / --browser；浏览器版 --port N / --no-open / --help');
