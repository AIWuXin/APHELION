/**
 * Surface decoration: the props that sit on top of the baked tiles.
 *
 * The generated map only decorates ~8% of tiles with one prop, which reads as
 * an empty field. Each decorated tile therefore draws a small *cluster* of
 * props at sub-tile offsets, and bare tiles get quiet ground marks (cracks,
 * rubble, dry tufts) so no tile is ever truly empty. Everything here is baked
 * once into the terrain canvas.
 */

import { box, contactShadow, prism } from '../primitives';
import { DEPOSIT, FLORA, GLOW, STONE, TERRAIN_PAINT } from '../world-palette';
import { TERRAIN_KEYS } from '../../generated/content-keys';
import { dot, isoPoint, rand01, rand2 } from './noise';
import type { TileInfo } from './tile';

const MOSS = TERRAIN_KEYS.indexOf('moss');
const SAND = TERRAIN_KEYS.indexOf('sand');

/** A 1px hard shadow seat under a prop. */
function seat(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void {
  contactShadow(ctx, x, y, rx, ry, 0.3);
}

/** A chunky boulder: three faces, a lit facet line and a crack. */
function boulder(t: TileInfo, x: number, y: number, r: number, h: number, salt: number): void {
  const { ctx } = t;
  seat(ctx, x, y + 2, r * 1.25, r * 0.6);
  box(ctx, x, y - 1, r, r * 0.55, h, { base: STONE.mid });
  // A second, smaller lump so the silhouette is not a clean prism.
  box(ctx, x + r * 0.55, y + r * 0.3, r * 0.6, r * 0.35, h * 0.6, { base: STONE.dark });
  // Lit facet + crack.
  ctx.fillStyle = STONE.light;
  ctx.fillRect(Math.round(x - r * 0.5), Math.round(y - h - 1), Math.round(r * 0.8), 1);
  const c = rand01(t.tx, t.ty, salt);
  for (let i = 0; i < 4; i += 1) {
    ctx.fillStyle = STONE.ink;
    ctx.fillRect(Math.round(x - r * 0.2 + i * 1.5), Math.round(y - h * 0.7 + i + c * 2), 1, 1);
  }
}

/** A small hard-edged tree: dark trunk, two-tone canopy, lit tips. */
function tree(t: TileInfo, x: number, y: number, size: number, golden: boolean): void {
  const { ctx } = t;
  seat(ctx, x + 1, y + 1, size * 0.55, size * 0.25);
  const trunkH = Math.round(size * 0.7);
  ctx.fillStyle = FLORA.bark;
  ctx.fillRect(Math.round(x) - 1, Math.round(y) - trunkH, 2, trunkH);
  ctx.fillStyle = FLORA.barkHi;
  ctx.fillRect(Math.round(x) - 1, Math.round(y) - trunkH, 1, trunkH);
  const leaf = golden ? FLORA.dry : FLORA.leaf;
  const leafHi = golden ? FLORA.leafTip : FLORA.leafHi;
  const cy = y - trunkH - size * 0.35;
  // Three overlapping hard ellipses read as a canopy at 1x.
  ctx.beginPath();
  ctx.ellipse(x, cy, size, size * 0.78, 0, 0, Math.PI * 2);
  ctx.fillStyle = leaf;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x - size * 0.2, cy - size * 0.22, size * 0.68, size * 0.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = leafHi;
  ctx.fill();
  // Dark underside and two lit tips.
  ctx.fillStyle = FLORA.bark;
  ctx.fillRect(Math.round(x - size * 0.5), Math.round(cy + size * 0.5), Math.round(size), 1);
  ctx.fillStyle = golden ? FLORA.leafTip : FLORA.leafTip;
  ctx.fillRect(Math.round(x - size * 0.6), Math.round(cy - size * 0.3), 1, 1);
  ctx.fillRect(Math.round(x + size * 0.4), Math.round(cy - size * 0.1), 1, 1);
  ctx.fillRect(Math.round(x - size * 0.1), Math.round(cy - size * 0.7), 1, 1);
}

/** A violet outcrop: glow wash plus three prisms. */
function outcrop(t: TileInfo, x: number, y: number): void {
  const { ctx } = t;
  ctx.save();
  ctx.globalAlpha = 0.1;
  ctx.beginPath();
  ctx.ellipse(x, y + 1, 15, 7, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#6b5a92';
  ctx.fill();
  ctx.restore();
  prism(ctx, x, y + 2, 4, 2.4, 14, -1, { base: '#63527f' });
  prism(ctx, x - 5, y + 3, 3, 1.8, 9, -2, { base: '#3b2f52' });
  prism(ctx, x + 5, y + 1, 2.5, 1.5, 7, 1, { base: '#6b5a92' });
  ctx.fillStyle = '#c7b6e8';
  ctx.fillRect(Math.round(x) - 1, Math.round(y) - 12, 1, 1);
  ctx.fillRect(Math.round(x) - 6, Math.round(y) - 6, 1, 1);
}

/** A broken stone pillar with a rubble collar. */
function pillar(t: TileInfo, x: number, y: number, height: number): void {
  const { ctx } = t;
  seat(ctx, x, y + 2, 9, 4);
  box(ctx, x, y, 7, 3.5, 4, { base: STONE.dark });
  box(ctx, x, y - 8, 4, 2, height, { base: STONE.mid });
  // Fluting: three vertical 1px seams with a lit face.
  ctx.fillStyle = STONE.ink;
  ctx.fillRect(Math.round(x) - 2, Math.round(y) - 6, 1, height - 2);
  ctx.fillRect(Math.round(x) + 1, Math.round(y) - 6, 1, height - 2);
  ctx.fillStyle = STONE.light;
  ctx.fillRect(Math.round(x) - 3, Math.round(y) - 6, 1, height - 4);
  // Snapped top block, tilted off the shaft.
  box(ctx, x + 2, y - 8 - height, 4, 2, 3, { base: STONE.light });
  ctx.fillStyle = STONE.ink;
  ctx.fillRect(Math.round(x) - 2, Math.round(y) - 8 - height, 5, 1);
}

/** An impact crater: hard rim, dark bowl, rubble on the lip. */
function crater(t: TileInfo, x: number, y: number): void {
  const { ctx } = t;
  ctx.beginPath();
  ctx.ellipse(x, y, 17, 8, 0, 0, Math.PI * 2);
  ctx.fillStyle = t.paint.hi;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x, y + 1, 14, 6.2, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#1c2325';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x - 1, y + 1, 9, 3.8, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#0f1416';
  ctx.fill();
  // Lit north-west lip.
  ctx.strokeStyle = STONE.light;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(x, y, 17, 8, 0, Math.PI * 0.95, Math.PI * 1.55);
  ctx.stroke();
  boulder(t, x - 11, y - 2, 3, 4, 0x12);
  boulder(t, x + 9, y + 3, 2.5, 3, 0x34);
}

/** A stack of cargo crates. */
function crates(t: TileInfo, x: number, y: number, count: number): void {
  const { ctx } = t;
  seat(ctx, x, y + 2, 11, 5);
  for (let i = 0; i < count; i += 1) {
    const ox = i === 0 ? 0 : i === 1 ? 9 : -5;
    const oy = i === 0 ? 0 : i === 1 ? 2 : -7;
    box(ctx, x + ox, y + oy - 2, 6, 3, 5, { base: '#7a6a48' });
    ctx.fillStyle = '#3a3222';
    ctx.fillRect(Math.round(x + ox) - 5, Math.round(y + oy) - 1, 10, 1);
    ctx.fillStyle = '#a89468';
    ctx.fillRect(Math.round(x + ox) - 4, Math.round(y + oy) - 7, 7, 1);
  }
}

/** Rich mineral vein: amber tufts and flecks, never a glow. */
function deposit(t: TileInfo, richness: number): void {
  const { ctx, cx, cy, rx, ry } = t;
  // A faint amber ground wash, well below 10% alpha.
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 2, 26, 12, 0, 0, Math.PI * 2);
  ctx.fillStyle = GLOW.primary;
  ctx.fill();
  ctx.globalAlpha = 0.035;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 2, 38, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Vein line: tufts march along a broken iso diagonal.
  const dir = rand01(t.tx, t.ty, 0xd1) > 0.5 ? 1 : -1;
  const tufts = 3 + Math.min(6, Math.round(richness / 30));
  for (let i = 0; i < tufts; i += 1) {
    const s = 0.18 + rand2(t.tx, t.ty, 0xa1 + i * 3) * 0.64;
    const b = 0.3 + rand2(t.tx, t.ty, 0xb1 + i * 3) * 0.4;
    const p = isoPoint(cx, cy, rx, ry, s, b + dir * (s - 0.5) * 0.25);
    const x = Math.round(p[0]);
    const y = Math.round(p[1]);
    // Amber tuft: two 1px strands over a dark root.
    ctx.fillStyle = DEPOSIT.dark;
    ctx.fillRect(x - 1, y + 1, 3, 1);
    ctx.fillStyle = i % 3 === 0 ? DEPOSIT.fleck : DEPOSIT.warm;
    ctx.fillRect(x, y - 2, 1, 3);
    ctx.fillRect(x + 1, y - 1, 1, 2);
    if (i % 2 === 0) {
      ctx.fillStyle = DEPOSIT.fleck;
      ctx.fillRect(x - 1, y - 1, 1, 2);
    }
  }
  // Loose flecks between the tufts.
  for (let i = 0; i < 4; i += 1) {
    const a = 0.2 + rand2(t.tx, t.ty, 0xc1 + i) * 0.6;
    const b = 0.2 + rand2(t.tx, t.ty, 0xe1 + i) * 0.6;
    const q = isoPoint(cx, cy, rx, ry, a, b);
    dot(ctx, q[0], q[1], i % 3 === 0 ? DEPOSIT.dark : DEPOSIT.warm);
  }
  if (richness > 110) {
    prism(ctx, cx + 6, cy + 4, 2.5, 1.5, 6, 1, { base: DEPOSIT.warm });
    prism(ctx, cx - 7, cy + 1, 2, 1.2, 4, -1, { base: DEPOSIT.dark });
  }
}

/** Quiet ground marks so bare tiles are never empty. */
export function paintGroundMark(t: TileInfo): void {
  const r = rand01(t.tx, t.ty, 0x3a1);
  if (r < 0.1) {
    // Hairline crack.
    for (let i = 0; i < 5; i += 1) {
      const a = 0.3 + i * 0.05 + rand2(t.tx, t.ty, 0x2b) * 0.1;
      const b = 0.4 + i * 0.02;
      const q = isoPoint(t.cx, t.cy, t.rx, t.ry, a, b);
      dot(t.ctx, q[0], q[1], t.paint.ink);
    }
  } else if (r < 0.17) {
    // A little rubble.
    for (let i = 0; i < 2; i += 1) {
      const a = 0.25 + rand2(t.tx, t.ty, 0x3c + i) * 0.5;
      const b = 0.25 + rand2(t.tx, t.ty, 0x4d + i) * 0.5;
      const q = isoPoint(t.cx, t.cy, t.rx, t.ry, a, b);
      dot(t.ctx, q[0], q[1], STONE.ink);
      dot(t.ctx, q[0], q[1] - 1, STONE.light);
    }
  } else if (r < 0.24) {
    // Dry tufts on the organic materials.
    const m = t.materialAt(0, 0);
    if (m === MOSS || m === SAND) {
      const a = 0.25 + rand2(t.tx, t.ty, 0x5e) * 0.5;
      const b = 0.3 + rand2(t.tx, t.ty, 0x6f) * 0.4;
      const q = isoPoint(t.cx, t.cy, t.rx, t.ry, a, b);
      const x = Math.round(q[0]);
      const y = Math.round(q[1]);
      t.ctx.fillStyle = FLORA.dry;
      t.ctx.fillRect(x, y - 2, 1, 3);
      t.ctx.fillRect(x + 1, y - 1, 1, 2);
      t.ctx.fillStyle = TERRAIN_PAINT.moss.shine;
      t.ctx.fillRect(x, y - 3, 1, 1);
    }
  }
}

/** Paint the props of one decorated tile. */
export function paintDecorTile(
  t: TileInfo,
  decor: number,
  richness: number,
  golden: boolean,
): void {
  const { cx, cy, tx, ty } = t;
  const variant = rand01(tx, ty, 0x8a);
  const extra = Math.floor(rand2(tx, ty, 0x9b) * 3);
  if (decor === 1) {
    // Rock field: one big boulder plus two or three smaller ones.
    boulder(t, cx + (variant - 0.5) * 18, cy + (variant - 0.5) * 6, 8, 8, 1);
    boulder(t, cx - 13 + variant * 6, cy + 6, 4, 5, 2);
    if (extra > 0) boulder(t, cx + 12 - variant * 5, cy - 2, 3, 3.5, 3);
    if (extra > 1) boulder(t, cx - 2, cy + 10, 2.5, 2.5, 4);
  } else if (decor === 2) {
    outcrop(t, cx + (variant - 0.5) * 10, cy + 2);
    if (extra > 0) outcrop(t, cx - 12 + variant * 6, cy + 7);
  } else if (decor === 3) {
    // Tree cluster: a tall tree plus two shorter neighbours.
    const size = 7 + Math.round(variant * 3);
    tree(t, cx + (variant - 0.5) * 8, cy + 3, size, golden);
    tree(t, cx - 11 + variant * 4, cy + 8, size * 0.75, golden);
    if (extra > 0) tree(t, cx + 11 - variant * 4, cy + 9, size * 0.65, !golden);
    if (extra > 1) tree(t, cx - 2 + variant * 8, cy - 1, size * 0.55, golden);
  } else if (decor === 4) {
    pillar(t, cx + (variant - 0.5) * 8, cy + 5, 16 + Math.round(variant * 10));
    if (extra > 0) {
      boulder(t, cx - 12 + variant * 4, cy + 8, 3.5, 4, 7);
      boulder(t, cx + 10, cy + 6, 2.5, 3, 8);
    }
  } else if (decor === 5) {
    crater(t, cx + (variant - 0.5) * 6, cy + 3);
    if (extra > 0) boulder(t, cx - 14 + variant * 4, cy + 6, 3, 3.5, 9);
  } else if (decor === 6) {
    crates(t, cx + (variant - 0.5) * 6, cy + 6, 2 + (extra > 0 ? 1 : 0));
  }
  if (richness > 0) deposit(t, richness);
}
