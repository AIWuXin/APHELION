/**
 * Quiet ground marks: the light, per-biome details that keep bare tiles from
 * reading as empty.
 *
 * Split out of `decor.ts` so the prop painters stay one screenful. The budget is
 * unchanged (one mark on roughly a quarter of bare tiles), but *which* mark
 * depends on the biome: snow keeps wind crust and frozen gravel, the desert keeps
 * wind ripples, the frozen ground shows frost wedges, the highland is strewn with
 * scree and the dense moss tundra stays tufted. The temperate rows keep the
 * original crack / rubble / dry-tuft set.
 */

import { TERRAIN_KEYS } from '../../generated/content-keys';
import { FLORA } from '../world-palette';
import { TERRAIN_PAINT } from '../world-palette';
import { dot, isoPoint, rand01, rand2 } from './noise';
import type { TileInfo } from './tile';
import { rockOf } from './rock';

const MOSS = TERRAIN_KEYS.indexOf('moss');
const SAND = TERRAIN_KEYS.indexOf('sand');
const SNOW = TERRAIN_KEYS.indexOf('snow');
const TUNDRA = TERRAIN_KEYS.indexOf('tundra');
const DESERT = TERRAIN_KEYS.indexOf('desert');
const HIGHLAND = TERRAIN_KEYS.indexOf('highland');
const MOSSY_TUNDRA = TERRAIN_KEYS.indexOf('mossy-tundra');

/** Quiet ground mark for one bare tile. */
export function paintGroundMark(t: TileInfo): void {
  const r = rand01(t.tx, t.ty, 0x3a1);
  const m = t.materialAt(0, 0);
  if (m === SNOW || m === TUNDRA || m === DESERT || m === HIGHLAND || m === MOSSY_TUNDRA) {
    if (r < 0.26) biomeMark(t, m, r);
    return;
  }
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
      dot(t.ctx, q[0], q[1], t.paint.ink);
      dot(t.ctx, q[0], q[1] - 1, t.paint.hi);
    }
  } else if (r < 0.24) {
    // Dry tufts on the organic materials.
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

/** One biome's quiet mark. `r` is the same deterministic roll as the caller's. */
function biomeMark(t: TileInfo, material: number, r: number): void {
  const { ctx, cx, cy, rx, ry } = t;
  const rock = rockOf(t);
  if (material === SNOW) {
    // Wind crust: one long 1px bank with a frozen pebble on it.
    const a0 = 0.18 + rand2(t.tx, t.ty, 0x21) * 0.2;
    const b = 0.3 + rand2(t.tx, t.ty, 0x23) * 0.4;
    const p0 = isoPoint(cx, cy, rx, ry, a0, b);
    const p1 = isoPoint(cx, cy, rx, ry, a0 + 0.44, b + 0.02);
    ctx.fillStyle = t.paint.shine;
    ctx.fillRect(Math.round(p0[0]), Math.round(p0[1]), Math.round(p1[0] - p0[0]), 1);
    if (r > 0.14) {
      const q = isoPoint(cx, cy, rx, ry, a0 + 0.2, b + 0.18);
      dot(ctx, q[0], q[1], rock.dark);
      dot(ctx, q[0], q[1] - 1, rock.light);
    }
  } else if (material === DESERT) {
    // Wind ripple: two 1px arcs of drifted sand.
    for (let i = 0; i < 2; i += 1) {
      const b0 = 0.34 + i * 0.22;
      for (let k = 0; k <= 10; k += 1) {
        const a = 0.16 + k * 0.06;
        const q = isoPoint(cx, cy, rx, ry, a, b0 + Math.sin(a * 7 + i) * 0.03);
        dot(ctx, q[0], q[1], i === 0 ? t.paint.shine : t.paint.ink);
      }
    }
  } else if (material === TUNDRA) {
    // Frost wedge: a short pale crack with a dark root.
    const p0 = isoPoint(cx, cy, rx, ry, 0.24, 0.7);
    const p1 = isoPoint(cx, cy, rx, ry, 0.5, 0.44);
    const p2 = isoPoint(cx, cy, rx, ry, 0.72, 0.52);
    ctx.fillStyle = t.paint.shine;
    ctx.fillRect(Math.round(p0[0]), Math.round(p0[1]), 6, 1);
    ctx.fillStyle = t.paint.ink;
    ctx.fillRect(Math.round(p1[0]), Math.round(p1[1]), 5, 1);
    dot(ctx, p2[0], p2[1], t.paint.hi);
  } else if (material === HIGHLAND) {
    // Scree: three chipped stones, lit top / dark seat.
    for (let i = 0; i < 3; i += 1) {
      const a = 0.18 + rand2(t.tx, t.ty, 0x31 + i) * 0.6;
      const b = 0.2 + rand2(t.tx, t.ty, 0x41 + i) * 0.6;
      const q = isoPoint(cx, cy, rx, ry, a, b);
      dot(ctx, q[0], q[1], rock.dark);
      dot(ctx, q[0] - 1, q[1] - 1, rock.light);
    }
  } else {
    // Dense moss tundra: a third tuft cluster so the blanket reads as packed.
    const a = 0.2 + rand2(t.tx, t.ty, 0x51) * 0.6;
    const b = 0.25 + rand2(t.tx, t.ty, 0x61) * 0.5;
    const q = isoPoint(cx, cy, rx, ry, a, b);
    const x = Math.round(q[0]);
    const y = Math.round(q[1]);
    ctx.fillStyle = t.paint.hi;
    ctx.fillRect(x, y - 2, 1, 3);
    ctx.fillRect(x + 1, y - 1, 1, 2);
    ctx.fillStyle = t.paint.shine;
    ctx.fillRect(x - 1, y - 3, 1, 1);
  }
}
