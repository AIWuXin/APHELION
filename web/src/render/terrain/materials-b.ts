import { mix } from '../../style/tokens';
import { TERRAIN_KEYS } from '../../generated/content-keys';
import { contactShadow, prism } from '../primitives';
import { CRYSTAL_INK, GLOW } from '../world-palette';
import { dot, isoLine, isoPoint, rand01, rand2 } from './noise';
import { paintCrystalFloor, paintWater } from './surface-paint';
import type { MaterialTexture, TileInfo } from './tile';

const ROAD = TERRAIN_KEYS.indexOf('road');
const APRON = TERRAIN_KEYS.indexOf('apron');
const CRYSTAL = TERRAIN_KEYS.indexOf('crystal');

function same(t: TileInfo, dx: number, dy: number, material: number): boolean {
  return t.materialAt(dx, dy) === material;
}

const brine: MaterialTexture = (t) => paintWater(t, false);

/** Manufactured surfaces keep expansion joints and restrained use marks. */
const apron: MaterialTexture = (t) => {
  const { ctx, cx, cy, rx, ry } = t;
  const p = t.paint;
  isoLine(ctx, cx, cy, rx, ry, 0.5, 0, 0.5, 1, p.ink);
  isoLine(ctx, cx, cy, rx, ry, 0, 0.5, 1, 0.5, p.ink);
  isoLine(ctx, cx, cy, rx, ry, 0.5, 0, 0.5, 1, mix(p.base, p.hi, 0.5));
  for (let i = 0; i < 6; i += 1) {
    const a = rand2(t.tx, t.ty, 0x90 + i);
    const b = rand2(t.tx, t.ty, 0xa0 + i);
    const q = isoPoint(cx, cy, rx, ry, a, b);
    dot(ctx, q[0], q[1], p.grain);
  }
  if (same(t, 1, 0, APRON) && rand01(t.tx, t.ty, 0x62) > 0.58) {
    isoLine(ctx, cx, cy, rx, ry, 0.12, 0.6, 0.8, 0.76, p.lo);
    isoLine(ctx, cx, cy, rx, ry, 0.1, 0.66, 0.78, 0.82, p.lo);
  }
};

const road: MaterialTexture = (t) => {
  const { ctx, cx, cy, rx, ry } = t;
  const p = t.paint;
  const alongX = same(t, 1, 0, ROAD) || same(t, -1, 0, ROAD);
  const alongY = same(t, 0, 1, ROAD) || same(t, 0, -1, ROAD);
  if (alongX) {
    isoLine(ctx, cx, cy, rx, ry, 0.12, 0.28, 0.88, 0.28, p.lo);
    isoLine(ctx, cx, cy, rx, ry, 0.12, 0.72, 0.88, 0.72, p.lo);
  }
  if (alongY) {
    isoLine(ctx, cx, cy, rx, ry, 0.28, 0.12, 0.28, 0.88, p.lo);
    isoLine(ctx, cx, cy, rx, ry, 0.72, 0.12, 0.72, 0.88, p.lo);
  }
  const mark = mix(p.shine, p.base, 0.45);
  for (let i = 0; i < 4; i += 1) {
    const a = alongY && !alongX ? 0.5 : 0.22 + i * 0.17;
    const b = alongY && !alongX ? 0.22 + i * 0.17 : 0.5;
    const q = isoPoint(cx, cy, rx, ry, a, b);
    ctx.fillStyle = mark;
    ctx.fillRect(Math.round(q[0]) - 2, Math.round(q[1]), 5, 1);
  }
  if (rand01(t.tx, t.ty, 0x31) > 0.74) {
    const q = isoPoint(cx, cy, rx, ry, 0.12, 0.86);
    ctx.fillStyle = mix(GLOW.primary, p.base, 0.55);
    ctx.fillRect(Math.round(q[0]), Math.round(q[1]), 4, 1);
  }
};

const crystal: MaterialTexture = paintCrystalFloor;

/** Smoky mineral facets with a stone root; no violet ground glow. */
export function paintCrystalClusters(t: TileInfo): void {
  const { ctx, cx, cy, tx, ty } = t;
  const a = 0.32 + rand2(tx, ty, 0x71) * 0.34;
  const b = 0.32 + rand2(tx, ty, 0x81) * 0.34;
  const p = isoPoint(cx, cy, t.rx, t.ry, a, b);
  const x = Math.round(p[0]);
  const y = Math.round(p[1]);
  contactShadow(ctx, x + 1, y + 1, 8, 3, 0.22);
  prism(ctx, x, y, 3, 1.8, 9 + Math.round(rand01(tx, ty, 0x91) * 6), -2, { base: CRYSTAL_INK.mid });
  prism(ctx, x - 5, y + 2, 2, 1.2, 6, -1, { base: CRYSTAL_INK.deep });
  ctx.fillStyle = CRYSTAL_INK.light;
  ctx.fillRect(x - 2, y - 7, 1, 3);
  if (rand01(tx, ty, 0x6b) > 0.7) {
    prism(ctx, x + 5, y + 2, 2, 1.2, 5, 1, { base: CRYSTAL_INK.mid });
  }
}

export const SURFACE_TEXTURES = { brine, apron, road, crystal } as const;
export const SURFACE_INDEX = { road: ROAD, apron: APRON, crystal: CRYSTAL } as const;
