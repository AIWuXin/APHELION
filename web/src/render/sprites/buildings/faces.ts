/**
 * Shared face geometry for the building painters.
 *
 * `primitives.ts` draws solids and `detail.ts` draws the vocabulary on top of
 * them; this module holds the small helpers that need to know where a box's
 * *side faces* are, which those two deliberately do not. Every painter that
 * stacks tall boxes (the hub's tower, the refinery's hall and tank) uses the
 * same joint and window placement so the whole colony shares one construction
 * language.
 */

import { line } from '../../primitives';
import { padPlate, strip } from '../detail';

/** Top of the poured pad for a footprint size (matches `detail.ts#plinth`). */
export function padTop(cy: number, size: number): number {
  return padPlate(cy, size).top - 2;
}

/**
 * Vertical construction joints down both visible faces of a box.
 *
 * The solids already draw their own lit rim and shadow seam, but a tall mass
 * needs a few panel joints or it reads as a flat column. Coordinates follow
 * `box`: `cx, top` is the centre of the top face.
 */
export function faceSeams(
  ctx: CanvasRenderingContext2D,
  cx: number,
  top: number,
  rx: number,
  ry: number,
  height: number,
  color: string,
  divisions = 3,
): void {
  for (let i = 1; i < divisions; i += 1) {
    const t = i / divisions;
    // Screen-left face runs west corner -> south corner.
    const lx = cx - rx + rx * t;
    line(ctx, [lx, top + ry * t], [lx, top + ry * t + height], color);
    // Screen-right face runs south corner -> east corner.
    const rx2 = cx + rx * t;
    line(ctx, [rx2, top + ry * (1 - t)], [rx2, top + ry * (1 - t) + height], color);
  }
}

/**
 * A row of lit window slits along a face's top edge, from `x0, y0` towards
 * `+dx, +dy` (the same direction `box` uses for its face edges).
 */
export function faceWindows(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  dx: number,
  dy: number,
  count: number,
  color: string,
): void {
  for (let i = 0; i < count; i += 1) {
    const t = (i + 0.5) / count;
    strip(ctx, x0 + dx * t - 3, y0 + dy * t + 4, 7, 2, color);
  }
}
