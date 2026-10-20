/**
 * Surface texture painters, part one: the four dry natural materials.
 *
 * Each material must be identifiable from its *texture* with the hue ignored:
 * basalt = cracked cooling plates, regolith = wind-blown speckle drifts,
 * moss = tufted 1px strands, sand = wavy ripple arcs. All drawing is hard
 * edged; there are no gradients and no filters anywhere.
 */

import { mix } from '../../style/tokens';
import { FLORA, STONE } from '../world-palette';
import { dot, fillIsoRect, isoPoint, rand01, rand2 } from './noise';
import type { MaterialTexture, TileInfo } from './tile';

/** Scatter 1px specks in iso-local space, deterministic per tile and salt. */
function scatter(t: TileInfo, count: number, color: string, salt: number): void {
  for (let i = 0; i < count; i += 1) {
    const a = rand2(t.tx, t.ty, salt + i * 5);
    const b = rand2(t.tx, t.ty, salt + i * 5 + 1);
    const p = isoPoint(t.cx, t.cy, t.rx, t.ry, a, b);
    dot(t.ctx, p[0], p[1], color);
  }
}

/** A handful of 2px stones: dark seat, lit top. */
function pebbles(t: TileInfo, count: number, salt: number): void {
  for (let i = 0; i < count; i += 1) {
    const a = 0.15 + rand2(t.tx, t.ty, salt + i * 3) * 0.7;
    const b = 0.15 + rand2(t.tx, t.ty, salt + i * 3 + 2) * 0.7;
    const p = isoPoint(t.cx, t.cy, t.rx, t.ry, a, b);
    const x = Math.round(p[0]);
    const y = Math.round(p[1]);
    t.ctx.fillStyle = t.paint.ink;
    t.ctx.fillRect(x, y, 2, 1);
    t.ctx.fillStyle = t.paint.hi;
    t.ctx.fillRect(x, y - 1, 2, 1);
    t.ctx.fillStyle = t.paint.grain;
    t.ctx.fillRect(x, y - 2, 1, 1);
  }
}

/** A jagged crack across the tile, with a lit lip on its north side. */
function crack(
  t: TileInfo,
  a0: number,
  b0: number,
  a1: number,
  b1: number,
  salt: number,
  kink = 0.07,
): void {
  const steps = 20;
  const { ctx, cx, cy, rx, ry } = t;
  for (let i = 0; i <= steps; i += 1) {
    const s = i / steps;
    const j = (rand2(t.tx * 7 + i, t.ty * 11, salt) - 0.5) * kink;
    const p = isoPoint(cx, cy, rx, ry, a0 + (a1 - a0) * s + j, b0 + (b1 - b0) * s - j * 0.7);
    const x = Math.round(p[0]);
    const y = Math.round(p[1]);
    ctx.fillStyle = t.paint.ink;
    ctx.fillRect(x, y, 1, 1);
    if (i % 4 === 0) {
      ctx.fillStyle = t.paint.hi;
      ctx.fillRect(x, y - 1, 1, 1);
    }
  }
}

/** Basalt: dark cooling plates split by 1px cracks. */
const basalt: MaterialTexture = (t) => {
  const p = t.paint;
  const plateHi = mix(p.base, p.hi, 0.55);
  const plateLo = mix(p.base, p.lo, 0.5);
  // Plate faces: a slightly lighter hard-edged slab, then a darker shelf.
  fillIsoRect(t.ctx, t.cx, t.cy, t.rx, t.ry, 0.02, 0.0, 0.46, 0.5, plateHi);
  fillIsoRect(t.ctx, t.cx, t.cy, t.rx, t.ry, 0.5, 0.46, 1.0, 1.0, plateLo);
  // The crack network walks the plate boundaries.
  const seed = 0x3f11;
  crack(t, 0.02, 0.34 + rand01(t.tx, t.ty, seed) * 0.16, 0.98, 0.62, seed);
  crack(t, 0.34, 0.0, 0.62, 0.98, seed + 7, 0.05);
  if ((t.tx + t.ty) % 2 === 0) crack(t, 0.5, 0.5, 1.02, 0.24, seed + 13, 0.04);
  // Frosted grus in the cracks and a few pebbles.
  scatter(t, p.specks, p.grain, 0x2a);
  scatter(t, 3, p.ink, 0x77);
  pebbles(t, 2, seed);
};

/** Regolith: hard-edged dust drifts over a coarse speckled field. */
const regolith: MaterialTexture = (t) => {
  const p = t.paint;
  const r = rand01(t.tx, t.ty, 0x1d3);
  const sheet = mix(p.base, p.hi, 0.55);
  const drift = mix(p.base, p.lo, 0.5);
  // Two hard-edged dust sheets, each with a 1px shadow beneath.
  fillIsoRect(t.ctx, t.cx, t.cy, t.rx, t.ry, 0.0, 0.1 + r * 0.2, 0.7, 0.46 + r * 0.2, sheet);
  fillIsoRect(t.ctx, t.cx, t.cy, t.rx, t.ry, 0.42, 0.5 + r * 0.2, 1.0, 0.92, drift);
  // The drift sheet's lower lip: a single hard dark line.
  const lipA = isoPoint(t.cx, t.cy, t.rx, t.ry, 0.0, 0.46 + r * 0.2);
  const lipB = isoPoint(t.cx, t.cy, t.rx, t.ry, 0.7, 0.46 + r * 0.2);
  t.ctx.fillStyle = p.ink;
  t.ctx.fillRect(Math.round(lipA[0]), Math.round(lipA[1]), Math.round(lipB[0] - lipA[0]), 1);
  // Wind-blown fine grain plus short horizontal streaks.
  scatter(t, p.specks + 7, p.grain, 0x5c);
  scatter(t, 5, p.ink, 0x9e);
  for (let i = 0; i < 3; i += 1) {
    const a = 0.2 + rand2(t.tx, t.ty, i * 9 + 2) * 0.6;
    const b = 0.2 + rand2(t.tx, t.ty, i * 9 + 4) * 0.6;
    const q = isoPoint(t.cx, t.cy, t.rx, t.ry, a, b);
    t.ctx.fillStyle = p.shine;
    t.ctx.fillRect(Math.round(q[0]) - 2, Math.round(q[1]), 4, 1);
  }
  // A dry stalk or two.
  for (let i = 0; i < 2; i += 1) {
    const a = 0.3 + rand2(t.tx, t.ty, i * 13 + 3) * 0.5;
    const b = 0.3 + rand2(t.tx, t.ty, i * 13 + 7) * 0.4;
    const q = isoPoint(t.cx, t.cy, t.rx, t.ry, a, b);
    t.ctx.fillStyle = FLORA.dry;
    t.ctx.fillRect(Math.round(q[0]), Math.round(q[1]) - 2, 1, 2);
  }
  pebbles(t, 3, 0x44);
};

/** Moss: hard 1px vertical strands bunched into tufts. */
const moss: MaterialTexture = (t) => {
  const p = t.paint;
  const { ctx } = t;
  // Darker peat patches under the grass, broken into two or three slabs.
  const peat = mix(p.base, p.lo, 0.55);
  fillIsoRect(ctx, t.cx, t.cy, t.rx, t.ry, 0.05, 0.2, 0.5, 0.55, peat);
  fillIsoRect(ctx, t.cx, t.cy, t.rx, t.ry, 0.55, 0.45, 1.0, 0.9, peat);
  // Tufts: 9 clusters of 3-5 strands; strand tips catch the key light.
  const clusters = 7;
  for (let c = 0; c < clusters; c += 1) {
    const a = 0.1 + rand2(t.tx, t.ty, 0x11 + c * 3) * 0.8;
    const b = 0.1 + rand2(t.tx, t.ty, 0x22 + c * 5) * 0.8;
    const base = isoPoint(t.cx, t.cy, t.rx, t.ry, a, b);
    const strands = 3 + (c & 1);
    for (let s = 0; s < strands; s += 1) {
      const tall = rand2(t.tx + c, t.ty + s, 0x33) > 0.62;
      const h = (tall ? 4 : 2) + ((c + s) & 1);
      const x = Math.round(base[0]) + s * 1 - 1;
      const y = Math.round(base[1]) - (s & 1);
      ctx.fillStyle = s === 0 ? p.hi : mix(p.hi, p.base, 0.35);
      ctx.fillRect(x, y - h, 1, h);
      ctx.fillStyle = p.grain;
      ctx.fillRect(x, y - h - 1, 1, 1);
    }
  }
  // Loose blades and a little bright seed head once in a while.
  scatter(t, 6, p.hi, 0x71);
  scatter(t, 3, p.ink, 0xb3);
  if (rand01(t.tx, t.ty, 0x99) > 0.66) {
    const q = isoPoint(t.cx, t.cy, t.rx, t.ry, 0.3, 0.6);
    ctx.fillStyle = p.shine;
    ctx.fillRect(Math.round(q[0]), Math.round(q[1]) - 2, 1, 3);
  }
  // A stone or two so grass is not a flat blanket.
  if (rand01(t.tx, t.ty, 0x41) > 0.72) {
    const q = isoPoint(t.cx, t.cy, t.rx, t.ry, 0.26 + 0.4 * rand01(t.tx, t.ty, 0x42), 0.3);
    ctx.fillStyle = STONE.ink;
    ctx.fillRect(Math.round(q[0]), Math.round(q[1]), 3, 1);
    ctx.fillStyle = STONE.mid;
    ctx.fillRect(Math.round(q[0]), Math.round(q[1]) - 1, 2, 1);
  }
};

/** Sand: wavy 1px ripple arcs, lit crest over a dark trough. */
const sand: MaterialTexture = (t) => {
  const p = t.paint;
  const { ctx, cx, cy, rx, ry } = t;
  const crest = mix(p.base, p.hi, 0.55);
  const trough = mix(p.base, p.lo, 0.55);
  // A broad hard-edged drift band first, so dunes read as coherent sand sheets.
  const drift = rand01(t.tx, t.ty, 0x1e);
  fillIsoRect(ctx, cx, cy, rx, ry, 0.0, 0.1 + drift * 0.25, 0.95, 0.42 + drift * 0.25, mix(p.base, p.hi, 0.28));
  const ripples = 3;
  for (let k = 0; k < ripples; k += 1) {
    const b0 = 0.14 + k * 0.22 + rand01(t.tx, t.ty, 0x51 + k) * 0.05;
    const phase = rand01(t.tx, t.ty, 0x76 + k) * 6.28;
    const wobble = 0.03 + rand01(t.tx, t.ty, 0x9a + k) * 0.02;
    for (let i = 0; i <= 34; i += 1) {
      const a = i / 34;
      const b = b0 + Math.sin(a * 3.4 + phase) * wobble;
      const pt = isoPoint(cx, cy, rx, ry, a, b);
      const x = Math.round(pt[0]);
      const y = Math.round(pt[1]);
      if (i % 2 === 0) {
        ctx.fillStyle = crest;
        ctx.fillRect(x, y, 2, 1);
      }
      if (i % 6 === 0) {
        ctx.fillStyle = trough;
        ctx.fillRect(x, y + 1, 1, 1);
      }
      if (i % 8 === 0) {
        ctx.fillStyle = p.shine;
        ctx.fillRect(x, y - 1, 1, 1);
      }
    }
  }
  scatter(t, p.specks + 6, p.grain, 0x3d);
  scatter(t, 3, p.ink, 0x8f);
  // A dry grass tuft or two keeps dunes from reading as smooth cloth.
  for (let i = 0; i < 2; i += 1) {
    const a = 0.2 + rand2(t.tx, t.ty, i * 7 + 3) * 0.6;
    const b = 0.25 + rand2(t.tx, t.ty, i * 7 + 5) * 0.5;
    const q = isoPoint(t.cx, t.cy, t.rx, t.ry, a, b);
    const x = Math.round(q[0]);
    const y = Math.round(q[1]);
    ctx.fillStyle = p.grain;
    ctx.fillRect(x, y - 2, 1, 3);
    ctx.fillRect(x + 1, y - 1, 1, 2);
    ctx.fillStyle = p.shine;
    ctx.fillRect(x, y - 3, 1, 1);
  }
};

/** Dry natural materials keyed by the generated content key. */
export const DRY_TEXTURES = {
  basalt,
  regolith,
  moss,
  sand,
} as const;
