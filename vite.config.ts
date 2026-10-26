import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

/** `0.1.0-a2` (semver) → `0.1.0a2` (display, matches `oc_protocol::PRODUCT_VERSION`). */
function displayVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
    version: string;
  };
  return pkg.version.replace('-', '');
}

/**
 * Build identity baked into the bundle: `0.1.0a2 · 1022-1120` (local time, like
 * the exe's stamp and the file timestamps in Explorer).
 */
function buildStamp(): string {
  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, '0');
  const day = `${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const clock = `${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `${displayVersion()} · ${day}-${clock}`;
}

// Vite root is `web/`; the wasm module is copied into `web/public/` by
// `scripts/build-wasm.mjs` before every dev/build.
export default defineConfig({
  root: 'web',
  base: './',
  define: {
    // Same purpose as `crates/desktop/build.rs`'s `OC_BUILD_STAMP`: make the
    // running bundle identifiable. Refreshes on every vite run.
    __OC_BUILD_STAMP__: JSON.stringify(buildStamp()),
  },
  server: {
    port: 5178,
    strictPort: true,
    fs: { strict: true },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: 0,
  },
});
