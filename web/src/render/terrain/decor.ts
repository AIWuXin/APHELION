/**
 * Surface decoration: the props that sit on top of the baked tiles.
 *
 * The generated map only decorates ~8% of tiles with one prop, which reads as
 * an empty field. Each decorated tile therefore draws a small *cluster* of
 * props at sub-tile offsets, while bare tiles get their quiet marks from
 * `ground-marks.ts`. Everything here is baked once into a chunk canvas.
 */

import { box, contactShadow, prism } from '../primitives';
import { COAL, DEPOSIT, FLORA, GLOW } from '../world-palette';
import { mix } from '../../style/tokens';
import { TERRAIN_KEYS } from '../../generated/content-keys';
import { dot, isoPoint, rand01, rand2 } from './noise';
import { rockOf } from './rock';
import type { TileInfo } from './tile';

const SNOW = TERRAIN_KEYS.indexOf('snow');
const TUNDRA = TERRAIN_KEYS.indexOf('tundra');
const MOSSY_TUNDRA = TERRAIN_KEYS.indexOf('mossy-tundra');

/** A 1px hard shadow seat under a prop. */
function seat(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void {
  contactShadow(ctx, x, y, rx, ry, 0.3);
}

/** A chunky boulder: three faces, a lit facet line and a crack. */
function boulder(t: TileInfo, x: number, y: number, r: number, h: number, salt: number): void {
  const { ctx } = t;
  const rock = rockOf(t);
  seat(ctx, x, y + 2, r * 1.25, r * 0.6);
  box(ctx, x, y - 1, r, r * 0.55, h, { base: rock.mid });
  // A second, smaller lump so the silhouette is not a clean prism.
  box(ctx, x + r * 0.55, y + r * 0.3, r * 0.6, r * 0.35, h * 0.6, { base: rock.dark });
  // Lit facet + crack.
  ctx.fillStyle = rock.light;
  ctx.fillRect(Math.round(x - r * 0.5), Math.round(y - h - 1), Math.round(r * 0.8), 1);
  const c = rand01(t.tx, t.ty, salt);
  for (let i = 0; i < 4; i += 1) {
    ctx.fillStyle = rock.ink;
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

/** A cold-band conifer: three stacked hard cones, no round canopy. */
function conifer(t: TileInfo, x: number, y: number, size: number): void {
  const { ctx } = t;
  const cold = mix(FLORA.leaf, '#5f7a7a', 0.4);
  const coldHi = mix(FLORA.leafHi, '#93a8a3', 0.45);
  seat(ctx, x + 1, y + 1, size * 0.5, size * 0.22);
  const trunkH = Math.round(size * 0.55);
  ctx.fillStyle = FLORA.bark;
  ctx.fillRect(Math.round(x) - 1, Math.round(y) - trunkH, 2, trunkH);
  for (let i = 0; i < 3; i += 1) {
    const w = size * (1 - i * 0.24);
    const h = size * 0.72;
    const cy = y - trunkH - i * size * 0.52;
    ctx.beginPath();
    ctx.moveTo(x, cy - h);
    ctx.lineTo(x + w, cy);
    ctx.lineTo(x - w, cy);
    ctx.closePath();
    ctx.fillStyle = mix(cold, coldHi, i * 0.3);
    ctx.fill();
    ctx.fillStyle = coldHi;
    ctx.fillRect(Math.round(x - w * 0.55), Math.round(cy) - 1, Math.round(w * 1.1), 1);
  }
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
  const rock = rockOf(t);
  seat(ctx, x, y + 2, 9, 4);
  box(ctx, x, y, 7, 3.5, 4, { base: rock.dark });
  box(ctx, x, y - 8, 4, 2, height, { base: rock.mid });
  // Fluting: three vertical 1px seams with a lit face.
  ctx.fillStyle = rock.ink;
  ctx.fillRect(Math.round(x) - 2, Math.round(y) - 6, 1, height - 2);
  ctx.fillRect(Math.round(x) + 1, Math.round(y) - 6, 1, height - 2);
  ctx.fillStyle = rock.light;
  ctx.fillRect(Math.round(x) - 3, Math.round(y) - 6, 1, height - 4);
  // Snapped top block, tilted off the shaft.
  box(ctx, x + 2, y - 8 - height, 4, 2, 3, { base: rock.light });
  ctx.fillStyle = rock.ink;
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
  ctx.strokeStyle = rockOf(t).light;
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
  const grade = Math.min(1, richness / 120);
  // A faint amber ground wash, well below 10% alpha.
  ctx.save();
  ctx.globalAlpha = 0.03 + 0.04 * grade;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 2, 18 + 8 * grade, 9 + 3 * grade, 0, 0, Math.PI * 2);
  ctx.fillStyle = GLOW.primary;
  ctx.fill();
  ctx.globalAlpha = 0.02 + 0.02 * grade;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 2, 30 + 8 * grade, 14 + 4 * grade, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Vein line: tufts march along a broken iso diagonal. A faint speck of ore
  // keeps a single tuft; only a real body gets the full row. The climate model
  // sprinkles plenty of low-grade traces around, and a three-tuft cluster on
  // every one of them carpets the ground in amber.
  const dir = rand01(t.tx, t.ty, 0xd1) > 0.5 ? 1 : -1;
  const tufts = richness < 24 ? 1 : 2 + Math.min(6, Math.round(grade * 7));
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

/**
 * Coal seam: a soot patch of low black lumps with a cold sheen.
 *
 * Deliberately the opposite of {@link deposit}: no amber wash, no upright
 * sparkle, no prism tip. Ore is bright and vertical; coal is matte, black and
 * flat on the ground, so the two read apart even at 1x zoom.
 *
 * A seam is a *field*, not a tile stamp. The climate generator can blanket a
 * whole temperate basin with wealth (a third of its tiles at richness 60+), so
 * the heavy ink -- soot, body lumps, the black seam line -- lands on one tile in
 * three. The rest of the field carries loose grains only, which keeps a large
 * field reading as ground with coal in it instead of as a black carpet with the
 * same blob repeated on every tile.
 */
function coalSeam(t: TileInfo, richness: number): void {
  const { ctx, cx, cy, rx, ry } = t;
  const grade = Math.min(1, richness / 110);
  const dir = rand01(t.tx, t.ty, 0x6c) > 0.5 ? 1 : -1;
  const heavy = rand01(t.tx, t.ty, 0x9e) < 0.34 && richness >= 40;

  if (heavy) {
    // Soot: the patch under the seam is darker than the tile, never a hue wash.
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx + (rand2(t.tx, t.ty, 0x7a) - 0.5) * 8, cy + 2, 10 + 9 * grade, 4.5 + 4 * grade, 0, 0, Math.PI * 2);
    ctx.globalAlpha = 0.06 + 0.2 * grade;
    ctx.fillStyle = COAL.root;
    ctx.fill();
    ctx.restore();
  }

  // Body lumps cluster on the heavy tiles of a seam worth mining.
  const lumps = heavy ? 1 + Math.min(3, Math.round(grade * 3.2)) : 0;
  for (let i = 0; i < lumps; i += 1) {
    const a = 0.2 + rand2(t.tx, t.ty, 0x1a + i * 7) * 0.58;
    const b = 0.26 + rand2(t.tx, t.ty, 0x2a + i * 7) * 0.42;
    const q = isoPoint(cx, cy, rx, ry, a, b + dir * (a - 0.5) * 0.22);
    const s = (0.6 + rand2(t.tx, t.ty, 0x3a + i * 7) * 0.4) * (0.8 + grade * 0.4);
    const x = Math.round(q[0]);
    const y = Math.round(q[1]);
    // Matte on purpose: no rim, no seam, one cold 1px sheen laid by hand.
    box(ctx, x, y, 2.8 * s, 1.6 * s, 2.2 * s, { base: COAL.lump, rim: false, seam: false });
    if (grade > 0.5) {
      ctx.fillStyle = COAL.sheen;
      ctx.fillRect(x - Math.round(2.5 * s), y - Math.round(1.6 * s), 2, 1);
    }
  }

  // Spilled grains: 1px, never a tuft. This is what every tile of a field gets.
  for (let i = 0; i < 1 + Math.round(grade * 3); i += 1) {
    const a = 0.16 + rand2(t.tx, t.ty, 0x4b + i) * 0.68;
    const b = 0.18 + rand2(t.tx, t.ty, 0x5b + i) * 0.64;
    const q = isoPoint(cx, cy, rx, ry, a, b);
    dot(ctx, q[0], q[1], i % 3 === 0 ? COAL.lump : COAL.dust);
  }
  // A broken black seam line under the lumps: one coal layer, not pebbles.
  if (heavy) {
    for (let i = 0; i < 7; i += 1) {
      const a = 0.16 + i * 0.11;
      const b = 0.5 + dir * (a - 0.5) * 0.3 + (rand2(t.tx, t.ty, 0x7d + i) - 0.5) * 0.08;
      const q = isoPoint(cx, cy, rx, ry, a, b);
      ctx.fillStyle = COAL.root;
      ctx.fillRect(Math.round(q[0]), Math.round(q[1]), 2, 1);
    }
  }

  if (richness > 110) {
    // A saturated seam carries one chunky outcrop so it reads at map scale.
    // No prism: its white tip glint would read as ore metal.
    box(ctx, cx + 7, cy + 2, 6.5, 3.4, 5, { base: COAL.lump, rim: false, seam: false });
    ctx.fillStyle = COAL.sheen;
    ctx.fillRect(cx + 3, cy - 1, 4, 1);
    ctx.fillStyle = COAL.dust;
    ctx.fillRect(cx + 12, cy + 6, 5, 1);
  }
}


/** Paint the props of one decorated tile. */
export function paintDecorTile(
  t: TileInfo,
  decor: number,
  richness: number,
  golden: boolean,
  coal: number,
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
    // Tree cluster: a tall tree plus two shorter neighbours. The frozen bands
    // and the moss tundra get cold conifers, so a "tree" still reads as flora
    // without pretending a broadleaf canopy survives permafrost.
    const size = 7 + Math.round(variant * 3);
    const m = t.materialAt(0, 0);
    const cold = m === SNOW || m === TUNDRA || m === MOSSY_TUNDRA;
    const plant = cold
      ? (x: number, y: number, s: number): void => conifer(t, x, y, s)
      : (x: number, y: number, s: number): void => tree(t, x, y, s, golden);
    plant(cx + (variant - 0.5) * 8, cy + 3, size);
    plant(cx - 11 + variant * 4, cy + 8, size * 0.75);
    if (extra > 0) plant(cx + 11 - variant * 4, cy + 9, size * 0.65);
    if (extra > 1) plant(cx - 2 + variant * 8, cy - 1, size * 0.55);
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
  if (coal > 0) coalSeam(t, coal);
}