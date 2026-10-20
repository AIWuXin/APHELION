/**
 * Surface texture painters, part two: the water, the poured concrete, the haul
 * roads and the crystal fields.
 *
 * Same contract as `materials-a.ts`: hard-edged, deterministic, 1px detail,
 * drawn inside a tile rhombus that the caller has already clipped and filled.
 * Crystal spikes are the only thing that deliberately escapes the tile clip --
 * see {@link paintCrystalClusters}, which the bake calls unclipped.
 */

import type { Pt } from '../primitives';
import { prism } from '../primitives';
import { mix } from '../../style/tokens';
import { TERRAIN_KEYS } from '../../generated/content-keys';
import { CRYSTAL_INK, GLOW, type MaterialPaint } from '../world-palette';
import { dot, fillIsoRect, isoPoint, rand01, rand2 } from './noise';
import type { MaterialTexture, TileInfo } from './tile';

const BRINE = TERRAIN_KEYS.indexOf('brine');
const ROAD = TERRAIN_KEYS.indexOf('road');
const APRON = TERRAIN_KEYS.indexOf('apron');
const CRYSTAL = TERRAIN_KEYS.indexOf('crystal');
const BRINE_INDEX = BRINE >= 0 ? BRINE : 4;

/** Is the neighbour at `dx,dy` part of the same material? */
function same(t: TileInfo, dx: number, dy: number, material: number): boolean {
  return t.materialAt(dx, dy) === material;
}

/** Brine: two rows of hard 1px scallop crests over dark water. */
const brine: MaterialTexture = (t) => {
  const p = t.paint;
  const { ctx, cx, cy } = t;
  const deep = rand01(t.tx, t.ty, 0x41);
  fillIsoRect(ctx, cx, cy, t.rx, t.ry, -0.1, 0.15, 0.62, 0.62, p.lo);
  fillIsoRect(ctx, cx, cy, t.rx, t.ry, 0.45, 0.55, 1.1, 1.1, deep > 0.5 ? p.hi : p.lo);
  // Long wavy crest lines: a continuous swell instead of a string of beads.
  const gloss = rand01(t.tx, t.ty, 0x91);
  for (let row = 0; row < 1; row += 1) {
    const baseY = Math.round(cy) + (((t.tx + t.ty) & 1) === 0 ? -3 : 6);
    const phase = rand01(t.tx, t.ty, 0x61 + row) * 6.28;
    for (let i = 0; i <= 64; i += 1) {
      const x = Math.round(cx) - 32 + i;
      const y = baseY + Math.round(Math.sin(i * 0.26 + phase) * 1.4);
      ctx.fillStyle = p.hi;
      ctx.fillRect(x, y, 1, 1);
      if (i % 22 === 5 && gloss > 0.62) {
        ctx.fillStyle = mix(p.shine, p.hi, 0.62);
        ctx.fillRect(x, y - 1, 2, 1);
      }
    }
  }
  // One short crest dash, only on a third of the tiles.
  for (let i = 0; i < (gloss > 0.66 ? 1 : 0); i += 1) {
    const a = 0.2 + rand2(t.tx, t.ty, 0x51 + i * 2) * 0.6;
    const b = 0.2 + rand2(t.tx, t.ty, 0x61 + i * 2) * 0.6;
    const q = isoPoint(cx, cy, t.rx, t.ry, a, b);
    ctx.fillStyle = mix(p.shine, p.hi, 0.6);
    ctx.fillRect(Math.round(q[0]), Math.round(q[1]), 2, 1);
  }
  // Trough lines and a couple of deep glints.
  for (let i = 0; i < 3; i += 1) {
    const a = 0.1 + rand2(t.tx, t.ty, i * 5 + 1) * 0.8;
    const q = isoPoint(cx, cy, t.rx, t.ry, a, 0.9 - a);
    ctx.fillStyle = p.ink;
    ctx.fillRect(Math.round(q[0]), Math.round(q[1]) + 3, 12, 1);
  }
  dot(ctx, cx + rand2(t.tx, t.ty, 9) * 44 - 22, cy + rand2(t.tx, t.ty, 11) * 14 - 7, p.shine);
};

/** Concrete apron: slab joints, stains, faint tyre arcs. */
const apron: MaterialTexture = (t) => {
  const p = t.paint;
  const { ctx, cx, cy, rx, ry } = t;
  // Expansion joints: two hard 1px lines crossing the slab.
  const a0 = isoPoint(cx, cy, rx, ry, 0.5, 0);
  const a1 = isoPoint(cx, cy, rx, ry, 0.5, 1);
  const b0 = isoPoint(cx, cy, rx, ry, 0, 0.5);
  const b1 = isoPoint(cx, cy, rx, ry, 1, 0.5);
  ctx.fillStyle = p.ink;
  for (let i = 0; i < 32; i += 1) {
    const s = i / 31;
    ctx.fillRect(Math.round(a0[0] + (a1[0] - a0[0]) * s), Math.round(a0[1] + (a1[1] - a0[1]) * s), 1, 1);
    ctx.fillRect(Math.round(b0[0] + (b1[0] - b0[0]) * s), Math.round(b0[1] + (b1[1] - b0[1]) * s), 1, 1);
  }
  // Slab corner nick: a 1px lit edge on the north side of each joint.
  ctx.fillStyle = p.shine;
  const mid = isoPoint(cx, cy, rx, ry, 0.5, 0.5);
  ctx.fillRect(Math.round(mid[0]) - 1, Math.round(mid[1]) - 1, 3, 1);
  // Oil / rubber stain: one hard-edged dark patch per few tiles.
  if (rand01(t.tx, t.ty, 0x62) > 0.45) {
    const s = rand01(t.tx, t.ty, 0x71);
    fillIsoRect(ctx, cx, cy, rx, ry, 0.04 + s * 0.3, 0.5 + s * 0.24, 0.3 + s * 0.4, 0.94, p.lo);
  }
  // Faint tyre arc: a low-contrast curve of 1px dots.
  if (rand01(t.tx, t.ty, 0x83) > 0.6) {
    const cx0 = rand2(t.tx, t.ty, 0x11) * 20 - 10;
    const cy0 = rand2(t.tx, t.ty, 0x22) * 8 - 4;
    for (let i = 0; i <= 14; i += 1) {
      const ang = -0.9 + (i / 14) * 1.8;
      dot(ctx, cx + cx0 + Math.cos(ang) * 20, cy + cy0 + Math.sin(ang) * 9, p.ink);
    }
  }
  // Fine aggregate and a little patchy wear.
  for (let i = 0; i < 10; i += 1) {
    const a = rand2(t.tx, t.ty, 0x90 + i);
    const b = rand2(t.tx, t.ty, 0xa0 + i);
    const q = isoPoint(cx, cy, rx, ry, a, b);
    dot(ctx, q[0], q[1], i % 3 === 0 ? p.shine : p.grain);
  }
  if (same(t, 1, 0, APRON) && same(t, 0, 1, APRON)) {
    // Cracks only inside big poured fields, so slab edges stay crisp.
    const s = rand01(t.tx, t.ty, 0xb4);
    if (s > 0.55) {
      for (let i = 0; i < 8; i += 1) {
        const q = isoPoint(cx, cy, rx, ry, 0.2 + i * 0.07, 0.3 + s * 0.3 + i * 0.03);
        dot(ctx, q[0], q[1], p.ink);
      }
    }
  }
};

/** Asphalt road: dashed centre line, wear bands, edge chevrons. */
const road: MaterialTexture = (t) => {
  const p = t.paint;
  const { ctx, cx, cy, rx, ry } = t;
  const alongX = same(t, 1, 0, ROAD) || same(t, -1, 0, ROAD);
  const alongY = same(t, 0, 1, ROAD) || same(t, 0, -1, ROAD);
  const mark = mix(p.shine, p.base, 0.42);
  // Lane markings: 1px dashes, 2:1 slope, drawn as snapped dots.
  const dash = (fixedA: number, from: number, to: number): void => {
    for (let i = 0; i <= 26; i += 1) {
      const s = from + ((to - from) * i) / 26;
      const q = isoPoint(cx, cy, rx, ry, fixedA, s);
      ctx.fillStyle = mark;
      ctx.fillRect(Math.round(q[0]), Math.round(q[1]), 2, 1);
      if (i % 4 === 3) ctx.fillRect(Math.round(q[0]) - 1, Math.round(q[1]) - 1, 1, 1);
    }
  };
  if (alongX && !alongY) dash(0.5, 0.06, 0.94);
  else if (alongY && !alongX) dash(0.06, 0.5, 0.94);
  else if (alongX && alongY) {
    dash(0.5, 0.6, 0.94);
    dash(0.6, 0.5, 0.94);
  } else {
    // Stub of road: a short broken centre mark.
    for (let i = 0; i < 8; i += 1) {
      const q = isoPoint(cx, cy, rx, ry, 0.5, 0.42 + i * 0.02);
      ctx.fillStyle = mark;
      ctx.fillRect(Math.round(q[0]), Math.round(q[1]), 2, 1);
    }
  }
  // Tyre wear: two darker bands running with the road.
  if (alongX) {
    fillIsoRect(ctx, cx, cy, rx, ry, 0.06, 0.28, 0.94, 0.34, p.lo);
    fillIsoRect(ctx, cx, cy, rx, ry, 0.06, 0.66, 0.94, 0.72, p.lo);
  } else if (alongY) {
    fillIsoRect(ctx, cx, cy, rx, ry, 0.28, 0.06, 0.34, 0.94, p.lo);
    fillIsoRect(ctx, cx, cy, rx, ry, 0.66, 0.06, 0.72, 0.94, p.lo);
  }
  // Edge chevrons: dull amber paint, faded, never a saturated neon.
  const chev = mix(GLOW.primary, p.base, 0.62);
  const chA = isoPoint(cx, cy, rx, ry, 0.12, 0.86);
  const chB = isoPoint(cx, cy, rx, ry, 0.2, 0.74);
  const chC = isoPoint(cx, cy, rx, ry, 0.28, 0.86);
  ctx.fillStyle = chev;
  if (rand01(t.tx, t.ty, 0x31) > 0.5) {
    ctx.fillRect(Math.round(chA[0]), Math.round(chA[1]), 1, 1);
    ctx.fillRect(Math.round(chB[0]), Math.round(chB[1]), 2, 1);
    ctx.fillRect(Math.round(chC[0]), Math.round(chC[1]), 1, 1);
  }
  // Aggregate speckle.
  for (let i = 0; i < 8; i += 1) {
    const a = rand2(t.tx, t.ty, 0x51 + i);
    const b = rand2(t.tx, t.ty, 0x61 + i);
    const q = isoPoint(cx, cy, rx, ry, a, b);
    dot(ctx, q[0], q[1], i % 4 === 0 ? p.grain : p.ink);
  }
};

/** Crystal field floor: violet glow, shards and rock rubble. */
const crystal: MaterialTexture = (t) => {
  const p = t.paint;
  const { ctx, cx, cy, rx, ry } = t;
  // A faint violet ground glow: hard ellipses at 8% and 5% alpha only.
  ctx.save();
  ctx.globalAlpha = 0.09;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 2, 24, 11, 0, 0, Math.PI * 2);
  ctx.fillStyle = CRYSTAL_INK.mid;
  ctx.fill();
  ctx.globalAlpha = 0.05;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 2, 34, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Broken rock between the outcrops.
  const s = rand01(t.tx, t.ty, 0x1c);
  fillIsoRect(ctx, cx, cy, rx, ry, 0.05 + s * 0.3, 0.6, 0.4 + s * 0.3, 0.98, p.lo);
  for (let i = 0; i < 7; i += 1) {
    const a = rand2(t.tx, t.ty, 0x27 + i);
    const b = rand2(t.tx, t.ty, 0x37 + i);
    const q = isoPoint(cx, cy, rx, ry, a, b);
    const x = Math.round(q[0]);
    const y = Math.round(q[1]);
    ctx.fillStyle = p.ink;
    ctx.fillRect(x, y, 2, 1);
    ctx.fillStyle = p.hi;
    ctx.fillRect(x, y - 1, 1, 1);
  }
  // 1px shards catching light.
  for (let i = 0; i < 4; i += 1) {
    const a = rand2(t.tx, t.ty, 0x47 + i);
    const b = rand2(t.tx, t.ty, 0x57 + i);
    const q = isoPoint(cx, cy, rx, ry, a, b);
    const x = Math.round(q[0]);
    const y = Math.round(q[1]);
    ctx.fillStyle = CRYSTAL_INK.light;
    ctx.fillRect(x, y - 3, 1, 3);
    ctx.fillStyle = CRYSTAL_INK.tip;
    ctx.fillRect(x, y - 4, 1, 1);
  }
};

/** The crystal spikes, drawn unclipped in painter order by the decor pass. */
export function paintCrystalClusters(t: TileInfo): void {
  const { ctx, cx, cy, tx, ty } = t;
  const clusters = rand01(tx, ty, 0x6b) > 0.42 ? 2 : 1;
  for (let c = 0; c < clusters; c += 1) {
    const a = 0.25 + rand2(tx, ty, 0x71 + c * 3) * 0.5;
    const b = 0.25 + rand2(tx, ty, 0x81 + c * 5) * 0.5;
    const p: Pt = isoPoint(cx, cy, t.rx, t.ry, a, b);
    const bx = Math.round(p[0]);
    const by = Math.round(p[1]);
    const count = 2 + (c & 1);
    for (let k = 0; k < count; k += 1) {
      const h = 6 + Math.round(rand2(tx + k, ty + c, 0x91) * 9);
      const w = 2 + (k % 2);
      const base: string = k === 0 ? CRYSTAL_INK.mid : CRYSTAL_INK.deep;
      prism(ctx, bx + (k - 1) * 3, by + (k % 2 === 0 ? 0 : 2), w, w * 0.6, h, (k - 1) * 1.5, {
        base,
        rim: true,
        seam: true,
      });
      ctx.fillStyle = CRYSTAL_INK.tip;
      ctx.fillRect(bx + (k - 1) * 3 + (k - 1), by - h + (k % 2 === 0 ? 0 : 2) - 1, 1, 1);
    }
  }
}

/** Wet and constructed materials. */
export const SURFACE_TEXTURES = {
  brine,
  apron,
  road,
  crystal,
} as const;

/** Re-exported indices so the bake can key its passes without magic numbers. */
export const SURFACE_INDEX = { brine: BRINE_INDEX, road: ROAD, apron: APRON, crystal: CRYSTAL } as const;

/** A helper the bake uses to tint a material's crest line. */
export function crestInk(paint: MaterialPaint): string {
  return paint.shine;
}
