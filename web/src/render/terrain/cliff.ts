/**
 * Cliff lips and the island rim.
 *
 * A tile whose south or east neighbour is one elevation step lower shows a
 * 3-4px rock face on that edge: lit face (0.86) on the screen-left side,
 * shadow face (0.68) on the screen-right side, a 1px bright rim on the top lip
 * and a 1px dark seam at the base. This is what gives the flat grid real relief
 * without moving any tile off the lattice.
 *
 * The same helper draws the dark rock slab the whole map sits on, so the
 * rectangular cut of the world edge reads as deliberate.
 */

import { LIGHT, mix, rgba, shade, PALETTE } from '../../style/tokens';
import { CRUST, TERRAIN_PAINT } from '../world-palette';
import { TERRAIN_KEYS } from '../../generated/content-keys';
import { dot, rand01, rand2 } from './noise';
import type { TileInfo } from './tile';

const BRINE = TERRAIN_KEYS.indexOf('brine');

/** One vertical rock face hanging below a tile edge. */
function face(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  height: number,
  base: string,
  mult: number,
  seed: number,
): void {
  // A vertical rock face is a broken slab of stone, not a black gap: lift the
  // material towards the shared stone ink so even dark basalt shows a lit face.
  const stone = mix(base, '#79807d', 0.62);
  const top = shade(stone, mult);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x1, y1 + height);
  ctx.lineTo(x0, y0 + height);
  ctx.closePath();
  ctx.fillStyle = top;
  ctx.fill();
  ctx.save();
  ctx.clip();
  const minX = Math.min(x0, x1) - 1;
  const maxX = Math.max(x0, x1) + 1;
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1) + height;
  // Strata: every 3px, one shade darker than the face.
  const strata = shade(stone, mult * 0.62);
  for (let y = Math.round(minY) + 2; y < maxY; y += 3) {
    ctx.fillStyle = strata;
    ctx.fillRect(minX, y, maxX - minX, 1);
  }
  // A couple of vertical cracks.
  const cracks = 1 + (seed & 1);
  for (let i = 0; i < cracks; i += 1) {
    const t = 0.2 + rand2(seed, i, 0x11) * 0.6;
    const x = Math.round(minX + (maxX - minX) * t);
    ctx.fillStyle = shade(stone, mult * 0.48);
    ctx.fillRect(x, minY, 1, maxY - minY);
  }
  // A 1px darker band at the very bottom keeps the lip grounded.
  ctx.fillStyle = rgba('#000000', 0.3);
  ctx.fillRect(minX, Math.round(maxY) - 2, maxX - minX, 2);
  ctx.restore();
  // 1px bright rim on the lit lip (weaker on the shadow side).
  ctx.strokeStyle = mix(top, '#ffffff', mult > 0.78 ? 0.3 : 0.16);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(Math.round(x0) + 0.5, Math.round(y0) + 0.5);
  ctx.lineTo(Math.round(x1) + 0.5, Math.round(y1) + 0.5);
  ctx.stroke();
  // Short contact shadow on the lower tile at the base of the face.
  ctx.fillStyle = rgba('#000000', 0.32);
  ctx.fillRect(minX, Math.round(maxY) - 1, maxX - minX, 1);
}

/** Foam dashes on the water side of a land/brine boundary. */
function foam(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, seed: number): void {
  const shine = TERRAIN_PAINT.brine.shine;
  const steps = 8;
  for (let i = 0; i < steps; i += 1) {
    if (rand2(seed, i, 0x2c) < 0.35) continue;
    const t = (i + 0.5) / steps;
    const x = Math.round(x0 + (x1 - x0) * t);
    const y = Math.round(y0 + (y1 - y0) * t);
    dot(ctx, x, y, rgba(shine, 0.55), 2);
    if (i % 3 === 0) dot(ctx, x + 1, y - 1, rgba(shine, 0.3));
  }
}

/** Draw the rock face on any edge where this tile steps down. */
export function paintCliff(
  ctx: CanvasRenderingContext2D,
  t: TileInfo,
  dropSouth: number,
  dropEast: number,
): void {
  const { cx, cy, rx, ry } = t;
  const base = t.paint.base;
  const w = [cx - rx, cy] as const;
  const s = [cx, cy + ry] as const;
  const e = [cx + rx, cy] as const;
  if (dropSouth > 0) {
    const h = Math.min(22, Math.max(6, dropSouth * 6));
    face(ctx, w[0], w[1], s[0], s[1], h, base, LIGHT.left, t.tx + t.ty * 3);
  }
  if (dropEast > 0) {
    const h = Math.min(22, Math.max(6, dropEast * 6));
    face(ctx, s[0], s[1], e[0], e[1], h, base, LIGHT.right, t.tx * 5 + t.ty);
  }
}

/** Draw the foam line on every edge shared with brine. */
export function paintShore(ctx: CanvasRenderingContext2D, t: TileInfo): void {
  const { cx, cy, rx, ry, materialAt } = t;
  const seed = t.tx * 13 + t.ty * 7;
  const n = [cx, cy - ry] as const;
  const e = [cx + rx, cy] as const;
  const s = [cx, cy + ry] as const;
  const w = [cx - rx, cy] as const;
  if (materialAt(0, -1) === BRINE) foam(ctx, n[0], n[1], e[0], e[1], seed + 0);
  if (materialAt(1, 0) === BRINE) foam(ctx, e[0], e[1], s[0], s[1], seed + 1);
  if (materialAt(0, 1) === BRINE) foam(ctx, s[0], s[1], w[0], w[1], seed + 2);
  if (materialAt(-1, 0) === BRINE) foam(ctx, w[0], w[1], n[0], n[1], seed + 3);
}

/** The dark rock slab the island sits on, plus a steel top boundary. */
export function paintMapRim(
  ctx: CanvasRenderingContext2D,
  t: TileInfo,
  atSouthEdge: boolean,
  atEastEdge: boolean,
  atNorthEdge: boolean,
  atWestEdge: boolean,
): void {
  const { cx, cy, rx, ry } = t;
  const n = [cx, cy - ry] as const;
  const e = [cx + rx, cy] as const;
  const s = [cx, cy + ry] as const;
  const w = [cx - rx, cy] as const;
  if (atSouthEdge) face(ctx, w[0], w[1], s[0], s[1], 16, CRUST.left, 1.0, 0x51);
  if (atEastEdge) face(ctx, s[0], s[1], e[0], e[1], 16, CRUST.right, 1.0, 0x77);
  // A 1px steel line along the two upper cut sides, so the boundary reads as
  // a deliberate edge rather than a missing texture.
  ctx.strokeStyle = rgba(PALETTE.lineBright, 0.85);
  ctx.lineWidth = 1;
  if (atNorthEdge) {
    ctx.beginPath();
    ctx.moveTo(Math.round(n[0]) + 0.5, Math.round(n[1]) + 0.5);
    ctx.lineTo(Math.round(e[0]) + 0.5, Math.round(e[1]) + 0.5);
    ctx.stroke();
  }
  if (atWestEdge) {
    ctx.beginPath();
    ctx.moveTo(Math.round(w[0]) + 0.5, Math.round(w[1]) + 0.5);
    ctx.lineTo(Math.round(n[0]) + 0.5, Math.round(n[1]) + 0.5);
    ctx.stroke();
  }
  // A 2px dark step just under the steel line keeps the cut from glowing.
  ctx.fillStyle = rgba('#000000', 0.22);
  if (atNorthEdge) {
    ctx.beginPath();
    ctx.moveTo(n[0], n[1]);
    ctx.lineTo(e[0], e[1]);
    ctx.lineTo(e[0], e[1] + 2);
    ctx.lineTo(n[0], n[1] + 2);
    ctx.closePath();
    ctx.fill();
  }
  if (atWestEdge) {
    ctx.beginPath();
    ctx.moveTo(w[0], w[1]);
    ctx.lineTo(n[0], n[1]);
    ctx.lineTo(n[0], n[1] + 2);
    ctx.lineTo(w[0], w[1] + 2);
    ctx.closePath();
    ctx.fill();
  }
  void rand01;
}
