/**
 * Fine surface detail helpers: speckle fields and hatched fills.
 *
 * Split out of `primitives.ts` to keep that file inside the 400-line budget.
 * Both helpers are deterministic (seeded integer PRNG), so a baked terrain chunk
 * looks identical on every reload.
 */

/** Deterministic tiny speckles inside a screen rect (baked terrain only). */
export function speckle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  count: number,
  seed: number,
): void {
  ctx.fillStyle = color;
  let s = seed | 1;
  for (let i = 0; i < count; i += 1) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const px = x + (s % Math.max(1, Math.floor(w)));
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const py = y + (s % Math.max(1, Math.floor(h)));
    ctx.fillRect(px, py, 1, 1);
  }
}

/** Fill a screen-space rect with a fine 1px diagonal hatch. */
export function hatch(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  gap = 4,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (let i = -h; i < w; i += gap) {
    ctx.beginPath();
    ctx.moveTo(x + i, y + h);
    ctx.lineTo(x + i + h, y);
    ctx.stroke();
  }
  ctx.restore();
}

/** Vertical 1px strands, used for moss tufts and regolith grass. */
export function strands(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  count: number,
  seed: number,
): void {
  ctx.fillStyle = color;
  let s = seed | 7;
  for (let i = 0; i < count; i += 1) {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    const px = x + (s % Math.max(1, Math.floor(w)));
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    const py = y + (s % Math.max(1, Math.floor(h)));
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    ctx.fillRect(px, py, 1, 1 + (s % 2));
  }
}

/** Rivet row: evenly spaced 1px dots along a straight run. */
export function rivets(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dx: number,
  dy: number,
  count: number,
  color: string,
): void {
  ctx.fillStyle = color;
  for (let i = 0; i < count; i += 1) {
    ctx.fillRect(Math.round(x + dx * i), Math.round(y + dy * i), 1, 1);
  }
}
