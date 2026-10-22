/**
 * Torus maths for the presentation layer.
 *
 * The planet wraps on both axes (there is no map edge), so every distance the
 * renderer, the picker and the radar compute has to go through these helpers
 * instead of a raw subtraction. Mirrors `crates/iso/src/torus.rs`; the spans
 * themselves arrive on the boot blob (`MapView.width` / `height`), so nothing
 * here hard-codes 10240.
 *
 * Pure maths only -- this file must never learn a game rule.
 */

/** Euclidean modulo for any finite number (negative input included). */
export function wrapSpan(value: number, span: number): number {
  if (span <= 0) return 0;
  const r = value % span;
  return r < 0 ? r + span : r;
}

/** Integer wrap, for tile and chunk indices. */
export function wrapIndex(value: number, span: number): number {
  const s = Math.max(1, Math.trunc(span));
  return ((Math.trunc(value) % s) + s) % s;
}

/** Shortest signed offset from `a` to `b` on a loop of `span` cells. */
export function deltaSpan(a: number, b: number, span: number): number {
  const d = wrapSpan(b - a, span);
  return d > span / 2 ? d - span : d;
}

/** `b` re-expressed as the copy of itself closest to `a` (no wrap). */
export function unwrapNear(a: number, b: number, span: number): number {
  return a + deltaSpan(a, b, span);
}

/** Shortest sign per axis: `[dx, dy]` from tile a to tile b, both wrapped. */
export function deltaTile(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  worldW: number,
  worldH: number,
): [number, number] {
  return [deltaSpan(ax, bx, worldW), deltaSpan(ay, by, worldH)];
}

/** Squared shortest tile distance. */
export function dist2Tile(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  worldW: number,
  worldH: number,
): number {
  const [dx, dy] = deltaTile(ax, ay, bx, by, worldW, worldH);
  return dx * dx + dy * dy;
}

/** Chunks per axis on a planet of `size` tiles and `chunk`-tile chunks. */
export function chunksPerAxis(size: number, chunk: number): number {
  return Math.max(1, Math.trunc(size / Math.max(1, chunk)));
}
