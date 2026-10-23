import { mix } from '../../style/tokens';
import { diamondPath, dot, isoPoint, rand01 } from './noise';
import { contourLocal, speckPoints, surfaceField } from './surface-rules';
import type { TileInfo } from './tile';

export type GroundKind = 'basalt' | 'dust' | 'moss' | 'sand' | 'frost' | 'tundra' | 'highland';

interface Stratum {
  spacing: number;
  amplitude: number;
  salt: number;
  color: string;
  crest?: string;
}

/** A world-space contour: neighbouring tiles evaluate the same continuous curve. */
function contour(t: TileInfo, layer: Stratum): void {
  const { ctx, tx, ty, rx, ry } = t;
  for (let i = -4; i <= 36; i += 1) {
    const a = i / 24;
    const [localA, localB] = contourLocal(tx, ty, a, layer.spacing, layer.amplitude, layer.salt);
    const p = isoPoint(t.cx, t.cy, rx, ry, localA, localB);
    const x = Math.round(p[0]);
    const y = Math.round(p[1]);
    ctx.fillStyle = layer.color;
    ctx.fillRect(x, y, 1, 1);
    if (layer.crest && i % 3 !== 1) {
      ctx.fillStyle = layer.crest;
      ctx.fillRect(x, y - 1, 1, 1);
    }
  }
}

function grain(t: TileInfo, salt: number): void {
  for (const [a, b] of speckPoints(t.tx, t.ty, t.paint.specks, salt)) {
    const p = isoPoint(t.cx, t.cy, t.rx, t.ry, a, b);
    dot(t.ctx, p[0], p[1], t.paint.grain);
  }
}

function pebbles(t: TileInfo, count: number, salt: number): void {
  for (const [a, b] of speckPoints(t.tx, t.ty, count, salt)) {
    const p = isoPoint(t.cx, t.cy, t.rx, t.ry, a, b);
    const x = Math.round(p[0]);
    const y = Math.round(p[1]);
    t.ctx.fillStyle = t.paint.lo;
    t.ctx.fillRect(x - 1, y, 4, 1);
    t.ctx.fillStyle = t.paint.hi;
    t.ctx.fillRect(x - 1, y - 1, 3, 1);
  }
}

function moss(t: TileInfo): void {
  const { ctx, tx, ty } = t;
  const patch = surfaceField(tx, ty, 32, 0x61);
  const count = patch > 0.57 ? 4 : patch > 0.43 ? 2 : 0;
  for (const [a, b] of speckPoints(tx, ty, count, 0x33)) {
    const p = isoPoint(t.cx, t.cy, t.rx, t.ry, a, b);
    const x = Math.round(p[0]);
    const y = Math.round(p[1]);
    ctx.fillStyle = t.paint.lo;
    ctx.fillRect(x - 2, y, 5, 1);
    ctx.fillStyle = t.paint.hi;
    ctx.fillRect(x - 1, y - 2, 1, 2);
    ctx.fillRect(x + 1, y - 1, 1, 1);
  }
  grain(t, 0x71);
}

/** Continuous geology, wind and clustered ground cover, not a per-tile stamp. */
export function paintNatural(t: TileInfo, kind: GroundKind): void {
  const p = t.paint;
  if (kind === 'moss') {
    moss(t);
    return;
  }
  const settings: Record<Exclude<GroundKind, 'moss'>, Stratum> = {
    basalt: { spacing: 16, amplitude: 2.4, salt: 1, color: mix(p.base, p.ink, 0.42) },
    dust: { spacing: 8, amplitude: 0.9, salt: 2, color: mix(p.base, p.lo, 0.45), crest: mix(p.base, p.hi, 0.6) },
    sand: { spacing: 16, amplitude: 2.2, salt: 3, color: mix(p.base, p.lo, 0.48), crest: mix(p.base, p.hi, 0.65) },
    frost: { spacing: 16, amplitude: 1.4, salt: 4, color: mix(p.base, p.lo, 0.35), crest: mix(p.base, p.shine, 0.55) },
    tundra: { spacing: 16, amplitude: 1.7, salt: 5, color: mix(p.base, p.ink, 0.45), crest: mix(p.base, p.hi, 0.4) },
    highland: { spacing: 32, amplitude: 4, salt: 6, color: mix(p.base, p.ink, 0.5), crest: mix(p.base, p.hi, 0.6) },
  };
  contour(t, settings[kind]);
  if (kind === 'basalt' || kind === 'highland' || kind === 'tundra') {
    contour(t, { spacing: 32, amplitude: 1.4, salt: 8, color: mix(p.base, p.hi, 0.35) });
  }
  if (kind === 'dust' && surfaceField(t.tx, t.ty, 64, 0x39) > 0.6) {
    contour(t, { spacing: 32, amplitude: 1.2, salt: 2, color: mix(p.base, p.hi, 0.3) });
  }
  grain(t, 0x71);
  const stones = kind === 'highland' ? 2 : kind === 'basalt' || kind === 'tundra' ? 1 : 0;
  if (stones > 0 && rand01(t.tx, t.ty, 0x82) > 0.76) pebbles(t, stones, 0x92);
}

/** Sparse long waves and broad depth variation over the water's real shoreline. */
export function paintWater(t: TileInfo, shallow: boolean): void {
  const { ctx, tx, ty, cx, cy } = t;
  const p = t.paint;
  const field = surfaceField(tx, ty, 64, 0x1a);
  ctx.fillStyle = mix(p.base, field > 0.5 ? p.hi : p.lo, Math.abs(field - 0.5) * 0.36);
  diamondPath(ctx, cx, cy, t.rx, t.ry);
  ctx.fill();
  for (let i = -4; i <= 32; i += 1) {
    const a = i / 24;
    const [localA, localB] = contourLocal(tx, ty, a, 8, 1.2, 0);
    const point = isoPoint(cx, cy, t.rx, t.ry, localA, localB);
    const x = Math.round(point[0]);
    const y = Math.round(point[1]);
    ctx.fillStyle = mix(p.base, p.lo, 0.4);
    ctx.fillRect(x, y + 1, 2, 1);
    if (surfaceField(tx + localA, ty + localB, 32, 0x71) > (shallow ? 0.3 : 0.44)) {
      ctx.fillStyle = mix(p.hi, p.shine, shallow ? 0.2 : 0.12);
      ctx.fillRect(x, y, 2, 1);
    }
  }
  if (shallow) grain(t, 0x93);
}

export function paintCrystalFloor(t: TileInfo): void {
  contour(t, { spacing: 16, amplitude: 1.4, salt: 4, color: t.paint.lo });
  grain(t, 0x53);
}
