import { rgba } from '../../style/tokens';
import { COAL, DEPOSIT } from '../world-palette';
import { fillPoly, line } from '../primitives';
import { isoPoint, rand2 } from './noise';
import type { TileInfo } from './tile';

/** Flat petroleum seep: an amber-edged slick, not a coal lump or an ore prism. */
export function paintOilSeam(t: TileInfo, richness: number): void {
  const { ctx, cx, cy, rx, ry } = t;
  const heavy = richness >= 40 && rand2(t.tx, t.ty, 0x51) > 0.66;
  const dir = rand2(t.tx, t.ty, 0x52) > 0.5 ? 1 : -1;
  if (heavy) {
    const x = cx + Math.round((rand2(t.tx, t.ty, 0x53) - 0.5) * 10);
    const y = cy + Math.round((rand2(t.tx, t.ty, 0x54) - 0.5) * 4);
    fillPoly(ctx, [
      [x - 19, y + dir * 2], [x - 4, y - 5], [x + 19, y + 1],
      [x + 11, y + 7], [x - 9, y + 6],
    ], rgba(COAL.root, 0.64));
    line(ctx, [x - 17, y + dir * 2], [x - 4, y - 5], rgba(DEPOSIT.warm, 0.7), 1);
    line(ctx, [x - 4, y - 5], [x + 18, y + 1], rgba(DEPOSIT.dark, 0.7), 1);
  }
  const count = heavy ? 1 + Math.min(3, Math.floor(richness / 70)) : 1;
  for (let i = 0; i < count; i += 1) {
    const a = 0.22 + rand2(t.tx, t.ty, 0x71 + i) * 0.48;
    const b = 0.34 + rand2(t.tx, t.ty, 0x91 + i) * 0.28;
    const p = isoPoint(cx, cy, rx, ry, a, b);
    const colour = heavy ? rgba(COAL.sheen, 0.7) : rgba(DEPOSIT.dark, 0.75);
    line(ctx, [p[0] - 4, p[1]], [p[0] + 4, p[1] + 1], colour, 1);
  }
}
