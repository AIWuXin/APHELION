declare module '*.css' {
  const css: string;
  export default css;
}

/** Build identity injected by `vite.config.ts`, e.g. `0.1.0a1 · 1022-1120`. */
declare const __OC_BUILD_STAMP__: string;

interface ImportMeta {
  readonly env: { readonly DEV: boolean };
}
