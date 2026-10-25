/**
 * The drawing vocabulary of the project.
 *
 * Everything volumetric in the world is composed from these four solids --
 * box, cylinder, dome, prism -- shaded with the fixed three-tone ramp and
 * finished with a 1px bright rim on the lit silhouette and a 1px dark seam on
 * the shadowed one. Asset files (sprites/buildings.ts, sprites/props.ts) call
 * these; they never touch `LIGHT` or raw palette values themselves.
 *
 * Conventions:
 *  - All coordinates are screen pixels in the canvas' own space.
 *  - `cx, cy` is the **centre of the top face** of a solid. That makes stacking
 *    solids trivial: `cy + height` is where the next solid's base sits.
 *  - 1px lines are snapped with {@link crisp} so they never blur.
 */

import { LIGHT, mix, rgba, shade } from '../style/tokens';

/** Round a coordinate so a 1px stroke lands on a pixel centre. */
export function crisp(v: number): number {
  return Math.round(v) + 0.5;
}

/** A point in screen space. */
export type Pt = readonly [number, number];

/** Build a closed path from points. */
export function polygon(ctx: CanvasRenderingContext2D, pts: readonly Pt[]): void {
  const first = pts[0];
  if (!first) return;
  ctx.beginPath();
  ctx.moveTo(first[0], first[1]);
  for (let i = 1; i < pts.length; i += 1) {
    const p = pts[i];
    if (p) ctx.lineTo(p[0], p[1]);
  }
  ctx.closePath();
}

/** Fill a polygon. */
export function fillPoly(ctx: CanvasRenderingContext2D, pts: readonly Pt[], color: string): void {
  polygon(ctx, pts);
  ctx.fillStyle = color;
  ctx.fill();
}

/** Stroke a polygon with a crisp hairline. */
export function strokePoly(
  ctx: CanvasRenderingContext2D,
  pts: readonly Pt[],
  color: string,
  width = 1,
): void {
  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = crisp(p[0]);
    const y = crisp(p[1]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.stroke();
}

/** Stroke a single crisp segment. */
export function line(
  ctx: CanvasRenderingContext2D,
  a: Pt,
  b: Pt,
  color: string,
  width = 1,
): void {
  ctx.beginPath();
  ctx.moveTo(crisp(a[0]), crisp(a[1]));
  ctx.lineTo(crisp(b[0]), crisp(b[1]));
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.stroke();
}

/** The four corners of an iso diamond centred on `cx, cy`. */
export function diamond(cx: number, cy: number, rx: number, ry: number): [Pt, Pt, Pt, Pt] {
  // north, east, south, west
  return [
    [cx, cy - ry],
    [cx + rx, cy],
    [cx, cy + ry],
    [cx - rx, cy],
  ];
}

/** Ellipse points, useful for cylinder caps and dome rims. */
export function ellipsePts(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  segments = 20,
  from = 0,
  to = Math.PI * 2,
): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = from + ((to - from) * i) / segments;
    out.push([cx + Math.cos(t) * rx, cy + Math.sin(t) * ry]);
  }
  return out;
}

/** Options for the basic solids. */
export interface SolidOptions {
  /** Base colour; the tonal ramp is derived from it. */
  readonly base: string;
  /** Bright 1px rim on the lit silhouette (default true). */
  readonly rim?: boolean;
  /** Dark 1px seam on the shadowed silhouette (default true). */
  readonly seam?: boolean;
  /** Draw the three faces at these multipliers instead of the default ramp. */
  readonly ramp?: { readonly top: number; readonly left: number; readonly right: number };
}

/**
 * An isometric box.
 *
 * `cx, cy` is the centre of the **top** face; the box rises `height` pixels
 * *downwards* on screen (because +z is up-screen, the top face is the highest).
 */
export function box(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  height: number,
  opts: SolidOptions,
): void {
  const ramp = opts.ramp ?? LIGHT;
  const [n, e, s, w] = diamond(cx, cy, rx, ry);
  const drop = (p: Pt): Pt => [p[0], p[1] + height];
  const wb = drop(w);
  const sb = drop(s);
  const eb = drop(e);

  // Warm overhead light, a neutral lit face and a cool ambient shadow face.
  fillPoly(ctx, [w, s, sb, wb], shade(opts.base, ramp.left));
  fillPoly(ctx, [s, e, eb, sb], mix(shade(opts.base, ramp.right), '#425e6c', 0.12));
  fillPoly(ctx, [n, e, s, w], mix(shade(opts.base, ramp.top), '#fff2dc', 0.04));

  if (opts.rim !== false) {
    const hi = rgba('#ffffff', LIGHT.rimLight);
    line(ctx, n, w, hi);
    line(ctx, n, e, hi);
    line(ctx, w, wb, hi);
  }
  if (opts.seam !== false) {
    const dk = rgba('#000000', LIGHT.rimDark);
    line(ctx, wb, sb, dk);
    line(ctx, sb, eb, dk);
    line(ctx, sb, s, dk);
  }
}

/**
 * An isometric cylinder (tanks, silos, barrels).
 *
 * The body is filled with four hard tonal bands rather than a gradient: that is
 * what keeps the surface language "hard-edged patchwork" instead of soft 3D.
 */
export function cylinder(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  height: number,
  opts: SolidOptions,
): void {
  const left = cx - rx;
  const right = cx + rx;
  const bottom = cy + height;
  // Body silhouette.
  ctx.beginPath();
  ctx.moveTo(left, cy);
  ctx.lineTo(left, bottom);
  ctx.ellipse(cx, bottom, rx, ry, 0, Math.PI, 0, true);
  ctx.lineTo(right, cy);
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI, false);
  ctx.closePath();
  ctx.fillStyle = mix(shade(opts.base, LIGHT.right), '#425e6c', 0.12);
  ctx.fill();

  // Four vertical bands: 0.68 | 0.86 | 1.00 | 0.72 across the body.
  const bands: ReadonlyArray<readonly [number, number, number]> = [
    [0.0, 0.22, 0.68],
    [0.22, 0.5, 0.86],
    [0.5, 0.78, 1.0],
    [0.78, 1.0, 0.72],
  ];
  for (const [a, b, m] of bands) {
    const x0 = left + (right - left) * a;
    const x1 = left + (right - left) * b;
    // Clip each band to the ellipse silhouette at the top and bottom.
    const t0 = (x0 - cx) / rx;
    const t1 = (x1 - cx) / rx;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x0, bottom - ry * Math.sqrt(Math.max(0, 1 - t0 * t0)));
    ctx.lineTo(x0, bottom + ry * Math.sqrt(Math.max(0, 1 - t0 * t0)));
    ctx.lineTo(x1, bottom + ry * Math.sqrt(Math.max(0, 1 - t1 * t1)));
    ctx.lineTo(x1, bottom - ry * Math.sqrt(Math.max(0, 1 - t1 * t1)));
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = m < 0.8 ? mix(shade(opts.base, m), '#425e6c', 0.08) : shade(opts.base, m);
    ctx.fillRect(x0, cy - ry - 1, x1 - x0 + 1, height + ry * 2 + 2);
    ctx.restore();
  }

  // Top cap.
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = mix(shade(opts.base, 1.06), '#fff2dc', 0.04);
  ctx.fill();
  if (opts.rim !== false) {
    ctx.strokeStyle = rgba('#ffffff', LIGHT.rimLight * 1.4);
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  // 1px seam line under the cap.
  if (opts.seam !== false) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI);
    ctx.strokeStyle = rgba('#000000', LIGHT.rimDark);
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

/** An isometric dome (reactor caps, observatory pods, habitat bubbles). */
export function dome(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  height: number,
  opts: SolidOptions,
): void {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, 0, false);
  ctx.closePath();
  ctx.fillStyle = shade(opts.base, LIGHT.left);
  ctx.fill();

  // Three hard bands across the dome to imply form without a gradient.
  const bands: ReadonlyArray<readonly [number, number]> = [
    [0.62, 0.85],
    [0.85, 1.0],
    [1.0, 1.12],
  ];
  for (const [m, w] of bands) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * (w - 0.06), ry * (w - 0.06), 0, Math.PI, 0, false);
    ctx.lineWidth = Math.max(2, height * 0.22);
    ctx.strokeStyle = m < 0.8 ? mix(shade(opts.base, m), '#425e6c', 0.12) : mix(shade(opts.base, m), '#fff2dc', 0.04);
    ctx.stroke();
    ctx.restore();
  }

  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.strokeStyle = rgba('#ffffff', LIGHT.rimLight * 1.2);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI);
  ctx.strokeStyle = rgba('#000000', LIGHT.rimDark);
  ctx.stroke();
}

/** An extruded crystal prism: an iso-friendly spike. */
export function prism(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  height: number,
  tipShift: number,
  opts: SolidOptions,
): void {
  const tip: Pt = [cx + tipShift, cy - height];
  const [n, e, s, w] = diamond(cx, cy - ry, rx, ry);
  // Two visible facets.
  fillPoly(ctx, [tip, w, n], shade(opts.base, LIGHT.left));
  fillPoly(ctx, [tip, n, e], mix(shade(opts.base, LIGHT.right), '#425e6c', 0.12));
  fillPoly(ctx, [tip, w, s, e], shade(opts.base, 0.5));
  line(ctx, tip, n, rgba('#ffffff', LIGHT.rimLight * 2));
  line(ctx, n, e, rgba('#ffffff', LIGHT.rimLight));
}

/**
 * Short, soft contact shadow, always biased to the lower-right.
 *
 * Two stacked ellipses at different alphas keep it soft without a blur filter
 * (filters are forbidden by the material contract and are slow).
 */
export function contactShadow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  alpha = 0.34,
): void {
  const ox = rx * 0.14;
  const oy = ry * 0.2;
  ctx.beginPath();
  ctx.ellipse(cx + ox, cy + oy, rx * 1.02, ry * 1.0, 0, 0, Math.PI * 2);
  ctx.fillStyle = rgba('#000000', alpha * 0.55);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + ox * 0.5, cy + oy * 0.5, rx * 0.78, ry * 0.74, 0, 0, Math.PI * 2);
  ctx.fillStyle = rgba('#000000', alpha);
  ctx.fill();
}

const patternCache = new Map<string, CanvasPattern | null>();

/** A 4×4 checkerboard pattern at ~12% alpha, cached per colour. */
export function ditherPattern(
  ctx: CanvasRenderingContext2D,
  color: string,
): CanvasPattern | null {
  const key = color;
  const hit = patternCache.get(key);
  if (hit !== undefined) return hit;
  const tile = document.createElement('canvas');
  tile.width = 4;
  tile.height = 4;
  const tctx = tile.getContext('2d');
  if (!tctx) return null;
  tctx.fillStyle = color;
  // 2 of 8 pixels lit: a fine 12.5% dither that reads as texture, not noise.
  tctx.fillRect(0, 0, 1, 1);
  tctx.fillRect(2, 2, 1, 1);
  tctx.fillRect(1, 3, 1, 1);
  const pat = ctx.createPattern(tile, 'repeat');
  patternCache.set(key, pat);
  return pat;
}

/** Fill the current path with a fine dither of `color`. */
export function ditherFill(
  ctx: CanvasRenderingContext2D,
  pts: readonly Pt[],
  color: string,
): void {
  const pat = ditherPattern(ctx, color);
  if (!pat) return;
  polygon(ctx, pts);
  ctx.fillStyle = pat;
  ctx.fill();
}

// Speckle / hatch helpers live in ./decals.ts (kept out of this file to stay under
// the 400-line per-file budget).
