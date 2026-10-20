import { defineConfig } from 'vite';

// Vite root is `web/`; the wasm module is copied into `web/public/` by
// `scripts/build-wasm.mjs` before every dev/build.
export default defineConfig({
  root: 'web',
  base: './',
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
