import { TERRAIN_KEYS } from '../../generated/content-keys';
import { isoPoint } from './noise';
import { speckPoints, surfaceField } from './surface-rules';
import { rockOf } from './rock';
import type { TileInfo } from './tile';

const MOSS = TERRAIN_KEYS.indexOf('moss');
const MOSSY_TUNDRA = TERRAIN_KEYS.indexOf('mossy-tundra');
const SAND = TERRAIN_KEYS.indexOf('sand');
const DESERT = TERRAIN_KEYS.indexOf('desert');
const SNOW = TERRAIN_KEYS.indexOf('snow');
const BRINE = TERRAIN_KEYS.indexOf('brine');
const SHALLOW = TERRAIN_KEYS.indexOf('shallow');
const DEEP = TERRAIN_KEYS.indexOf('deep');

/** A sparse ground accent; the continuous material already carries the texture. */
export function paintGroundMark(t: TileInfo): void {
  const material = t.materialAt(0, 0);
  if (material === BRINE || material === SHALLOW || material === DEEP) return;
  if (material === SAND || material === DESERT || material === SNOW) return;
  if (surfaceField(t.tx, t.ty, 8, 0x3a1) < 0.65) return;
  const point = speckPoints(t.tx, t.ty, 1, 0x72)[0];
  if (!point) return;
  const [x, y] = isoPoint(t.cx, t.cy, t.rx, t.ry, point[0], point[1]);
  if (material === MOSS || material === MOSSY_TUNDRA) {
    t.ctx.fillStyle = t.paint.lo;
    t.ctx.fillRect(Math.round(x) - 1, Math.round(y), 4, 1);
    t.ctx.fillStyle = t.paint.hi;
    t.ctx.fillRect(Math.round(x), Math.round(y) - 2, 1, 2);
    return;
  }
  const rock = rockOf(t);
  t.ctx.fillStyle = rock.dark;
  t.ctx.fillRect(Math.round(x) - 1, Math.round(y), 4, 1);
  t.ctx.fillStyle = rock.light;
  t.ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 1);
}
