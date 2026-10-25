/**
 * Integer noise and iso-local geometry helpers for the one-time terrain bake.
 *
 * Everything here is deterministic from tile coordinates and a salt, so a
 * rebuild of the same map produces exactly the same pixels. Nothing in this
 * module is called per frame.
 */

import type { Pt } from '../primitives';
import { wrapSpan } from '../torus';

/** 32-bit hash of two integers. */
export function hash32(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Deterministic 0..1 value for a tile and salt. */
export function rand01(x: number, y: number, salt: number): number {
  return (hash32(x + salt, y - salt) & 0xffff) / 65535;
}

/** Deterministic 0..1 value for a sub-tile variant index. */
export function rand2(x: number, y: number, salt: number): number {
  return (hash32(x * 31 + salt * 7, y * 17 - salt * 13) & 0xffff) / 65535;
}

/** Smooth value noise in `0..=1024` on a lattice of `scale` tiles. */
export function valueNoise(x: number, y: number, scale: number, seed: number): number {
  const s = scale < 1 ? 1 : scale;
  const gx = Math.floor(x / s);
  const gy = Math.floor(y / s);
  const fx = ((x % s) + s) % s;
  const fy = ((y % s) + s) % s;
  const ux = fx / s;
  const uy = fy / s;
  const sx = ux * ux * (3 - 2 * ux);
  const sy = uy * uy * (3 - 2 * uy);
  const c00 = hash32(gx + seed, gy - seed) & 1023;
  const c10 = hash32(gx + 1 + seed, gy - seed) & 1023;
  const c01 = hash32(gx + seed, gy + 1 - seed) & 1023;
  const c11 = hash32(gx + 1 + seed, gy + 1 - seed) & 1023;
  const top = c00 + (c10 - c00) * sx;
  const bot = c01 + (c11 - c01) * sx;
  return top + (bot - top) * sy;
}

/**
 * Continuous companion patches on 10/5-tile lattices. Both scales divide the
 * 10240-tile world span, so value-noise cells meet exactly across the torus.
 * The bake's majority filter removes isolated pixels; `mix` is companionMix.
 */
export function companionMask(tx: number, ty: number, mix: number): boolean {
  if (mix <= 0) return false;
  const x = wrapSpan(tx, 10240);
  const y = wrapSpan(ty, 10240);
  const v =
    valueNoise(x, y, 10, 0x51e7) * 0.76 +
    valueNoise(x, y, 5, 0x9e37) * 0.24 +
    (rand01(x, y, 0x77a1) - 0.5) * 48;
  return v > 700 - mix * 0.5;
}

/** A point in tile-local iso space: `a` runs along +x, `b` along +y. */
export function isoPoint(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  a: number,
  b: number,
): Pt {
  return [cx + (a - b) * rx, cy + (a + b - 1) * ry];
}

/** Fill the iso-space rectangle `[a0,a1] x [b0,b1]` (a parallelogram on screen). */
export function fillIsoRect(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  a0: number,
  b0: number,
  a1: number,
  b1: number,
  color: string,
): void {
  const p0 = isoPoint(cx, cy, rx, ry, a0, b0);
  const p1 = isoPoint(cx, cy, rx, ry, a1, b0);
  const p2 = isoPoint(cx, cy, rx, ry, a1, b1);
  const p3 = isoPoint(cx, cy, rx, ry, a0, b1);
  ctx.beginPath();
  ctx.moveTo(p0[0], p0[1]);
  ctx.lineTo(p1[0], p1[1]);
  ctx.lineTo(p2[0], p2[1]);
  ctx.lineTo(p3[0], p3[1]);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/** A crisp 1px line between two iso-space points. */
export function isoLine(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  a0: number,
  b0: number,
  a1: number,
  b1: number,
  color: string,
): void {
  const p0 = isoPoint(cx, cy, rx, ry, a0, b0);
  const p1 = isoPoint(cx, cy, rx, ry, a1, b1);
  ctx.beginPath();
  ctx.moveTo(Math.round(p0[0]) + 0.5, Math.round(p0[1]) + 0.5);
  ctx.lineTo(Math.round(p1[0]) + 0.5, Math.round(p1[1]) + 0.5);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** 1px dot, snapped to the pixel grid. */
export function dot(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, w = 1): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, 1);
}

/** Build the rhombus path of a tile (does not fill or clip). */
export function diamondPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - ry);
  ctx.lineTo(cx + rx, cy);
  ctx.lineTo(cx, cy + ry);
  ctx.lineTo(cx - rx, cy);
  ctx.closePath();
}

/** Clip to the tile rhombus; caller must have saved the context. */
export function clipDiamond(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): void {
  diamondPath(ctx, cx, cy, rx, ry);
  ctx.clip();
}

/** The four rim corners of a tile, clockwise from north. */
export function tileCorners(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): [Pt, Pt, Pt, Pt] {
  return [
    [cx, cy - ry],
    [cx + rx, cy],
    [cx, cy + ry],
    [cx - rx, cy],
  ];
}
