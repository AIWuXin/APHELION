import { TERRAIN_KEYS } from '../../generated/content-keys';
import { hash32, rand2 } from './noise';
import { wrapIndex, wrapSpan } from '../torus';

/** Manufactured slabs retain expansion joints; natural terrain stays continuous. */
export function hasTileSeam(material: number): boolean {
  const key = TERRAIN_KEYS[material];
  return key === 'apron' || key === 'road';
}

const WORLD_TILES = 10240;

/** Smooth noise on a wrapped world lattice, including fractional tile positions. */
export function surfaceField(tx: number, ty: number, scale: number, seed: number): number {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 8;
  const x = wrapSpan(tx, WORLD_TILES);
  const y = wrapSpan(ty, WORLD_TILES);
  const gx = Math.floor(x / s);
  const gy = Math.floor(y / s);
  const ux = (x - gx * s) / s;
  const uy = (y - gy * s) / s;
  const sx = ux * ux * (3 - 2 * ux);
  const sy = uy * uy * (3 - 2 * uy);
  const period = WORLD_TILES / s;
  const corner = (dx: number, dy: number): number =>
    (hash32(Math.round(wrapSpan(gx + dx, period)) + seed, Math.round(wrapSpan(gy + dy, period)) - seed) & 1023) / 1024;
  const top = corner(0, 0) + (corner(1, 0) - corner(0, 0)) * sx;
  const bottom = corner(0, 1) + (corner(1, 1) - corner(0, 1)) * sx;
  return top + (bottom - top) * sy;
}

/** Sparse interior samples; the same world tile always receives the same grain. */
export function speckPoints(tx: number, ty: number, count: number, salt: number): [number, number][] {
  const x = wrapIndex(tx, WORLD_TILES);
  const y = wrapIndex(ty, WORLD_TILES);
  const points: [number, number][] = [];
  for (let i = 0; i < Math.max(0, Math.floor(count)); i += 1) {
    points.push([
      0.08 + rand2(x, y, salt + i * 7) * 0.84,
      0.08 + rand2(x, y, salt + i * 7 + 3) * 0.84,
    ]);
  }
  return points;
}

/** A horizontal iso contour sampled in one tile's local a/b coordinates. */
export function contourLocal(
  tx: number, ty: number, a: number, spacing: number, amplitude: number, salt: number,
): [number, number] {
  const step = spacing > 0 ? spacing : 16;
  const band = Math.round((tx + ty) / step) * step;
  const u = band + Math.sin(((tx - ty + a * 2) / 128) * Math.PI * 2 + salt) * amplitude;
  return [a, u - a - tx - ty];
}

/** Traces are sparse; meaningful deposits always retain their readable root. */
export function oreTraceVisible(richness: number, roll: number): boolean {
  return richness >= 40 || (richness > 0 && roll >= 0.82);
}

/** Only genuinely rich deposits grow tall, multi-face mineral shards. */
export function oreFacets(richness: number): { shards: number; height: number } {
  if (richness < 40) return { shards: 0, height: 0 };
  const grade = Math.min(1, Math.max(0, richness) / 120);
  return { shards: 1 + Math.floor(grade * 3), height: 2 + Math.round(grade * 7) };
}
