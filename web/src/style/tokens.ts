/**
 * The single source of colour, type and layout truth.
 *
 * Both renderers read from here: the Canvas world layer imports the palette
 * object directly, and the DOM HUD receives the same values as CSS custom
 * properties (see `inject-theme.ts`). There is no second colour list anywhere
 * in the project -- that is invariant #8 ("同一套色板 token").
 *
 * Colour discipline (invariant #5): four roles, never a fifth.
 *   - primary  : values, active state, the one action worth looking at
 *   - function : progress, data flow, connections
 *   - status   : radar sweep, nominal health
 *   - danger   : alarms and hostiles only
 */

/** Palette. All values are `#rrggbb`; alpha variants are built with {@link rgba}. */
export const PALETTE = {
  /** Deepest black, behind everything. */
  void: '#05090a',
  /** Panel body. */
  panel: '#0a1113',
  /** Raised chip inside a panel. */
  panel2: '#0f191c',
  /** Hover / pressed chip. */
  panel3: '#16252a',
  /** 1px separator inside panels. */
  line: '#233338',
  /** 1px panel border, cold steel. */
  lineBright: '#4e6066',
  /** Primary text. */
  ink: '#c9d6d6',
  /** Secondary text. */
  ink2: '#8a9a9c',
  /** Tertiary text, wide-tracked English subtitles. */
  ink3: '#5d6d70',
  /** Primary emphasis: amber. Numbers, active tabs, the key verb. */
  primary: '#f0c050',
  /** Solid amber fill for a selected control (text goes near-black). */
  primaryFill: '#e8bc4e',
  /** Amber at rest / disabled. */
  primaryDim: '#8c6f27',
  /** Function: cyan. Progress bars, data links, connections. */
  function: '#88d8e8',
  /** Cyan at rest. */
  functionDim: '#3c7684',
  /** Status: green. Radar sweep, nominal state, health. */
  status: '#90c0a0',
  /** Green at rest. */
  statusDim: '#4a6d58',
  /** Danger: red. Alerts and hostiles only -- never decoration. */
  danger: '#c24a3a',
  /** Danger at rest. */
  dangerDim: '#6e2a22',
} as const;

/** Named colour roles, so draw code never invents a semantic. */
export type ColorRole = keyof typeof PALETTE;

/** Layout metrics in CSS pixels. */
export const METRICS = {
  /** Top status bar height (≈3% of a 1080p viewport). */
  topbarH: 34,
  /** Right command rail width. */
  railW: 336,
  /** Rail goes fluid below this viewport width. */
  railWMin: 300,
  /** Subtitle bar height. */
  subtitleH: 30,
  /** Sandbox panel width. */
  sandboxW: 322,
  /** 1px hairline, used for every border in the HUD. */
  hair: 1,
} as const;

/** Type scale: exactly three tiers plus a display size for numbers. */
export const TYPE = {
  /** Smallest tier: English subtitles, footnotes (10px, tracked wide). */
  sm: 10,
  /** Body tier: labels and values (12px). */
  md: 12,
  /** Strong tier: panel titles and row names (14px). */
  lg: 14,
  /** Display: the big resource readout. */
  xl: 26,
} as const;

/** Font stacks. No webfont is downloaded -- see docs/decisions.md. */
export const FONT = {
  sans: '"Noto Sans SC", "Source Han Sans SC", "Noto Sans CJK SC", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif',
  mono: '"JetBrains Mono", "Cascadia Mono", "Consolas", "SF Mono", "DejaVu Sans Mono", monospace',
} as const;

/** Tile geometry: 2:1 dimetric, 64×32, elevated by 32px per world unit. */
export const TILE = {
  w: 64,
  h: 32,
  /** Screen pixels per world height unit. */
  z: 32,
} as const;

/** Convert a hex colour plus alpha into a canvas/CSS colour string. */
export function rgba(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Multiply a hex colour by a brightness factor, clamped to 0..255. */
export function shade(hex: string, factor: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 0xff) * factor)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 0xff) * factor)));
  const b = Math.min(255, Math.max(0, Math.round((n & 0xff) * factor)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Blend two hex colours; `t` of 0 returns `a`, 1 returns `b`. */
export function mix(a: string, b: string, t: number): string {
  const na = Number.parseInt(a.slice(1), 16);
  const nb = Number.parseInt(b.slice(1), 16);
  const ch = (shift: number): number => {
    const ca = (na >> shift) & 0xff;
    const cb = (nb >> shift) & 0xff;
    return Math.round(ca + (cb - ca) * t);
  };
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

/**
 * The three face-brightness multipliers of invariant #2.
 *
 * `left` is the face whose normal points towards screen-left, `right` towards
 * screen-right. The key light sits upper-left, so the screen-left face catches
 * it; the contact shadow therefore falls to the lower-right. See
 * `docs/decisions.md` for why the literal order in the brief is resolved this
 * way.
 */
export const LIGHT = {
  /** Top faces. */
  top: 1.0,
  /** Screen-left vertical faces (lit side). */
  left: 0.86,
  /** Screen-right vertical faces (shadow side). */
  right: 0.68,
  /** Extra ramp for a 1px bright edge along the top-left silhouette. */
  rimLight: 0.14,
  /** 1px dark seam along the bottom-right silhouette. */
  rimDark: 0.38,
} as const;
