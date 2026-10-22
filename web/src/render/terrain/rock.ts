/**
 * Rock tones that belong to the ground they sit on.
 *
 * Every boulder, pillar and scree chip is a *stone on a surface*: the same
 * granite on a snowfield and on a dune field reads as a paste-up. So each rock
 * tint is the shared {@link STONE} ramp pulled towards the tile's own paint --
 * cold grey on the frozen bands, warm tan in the desert, brighter on the
 * highland. Nothing here is per-frame; it is called from the chunk bake.
 */

import { mix } from '../../style/tokens';
import { STONE } from '../world-palette';
import type { TileInfo } from './tile';

/** Stone ramp for one tile. */
export interface RockTint {
  /** Lit top face. */
  readonly light: string;
  /** Mid body colour. */
  readonly mid: string;
  /** Shadowed body colour. */
  readonly dark: string;
  /** Cracks and seams. */
  readonly ink: string;
}

/** Stone tones pulled towards the tile's own material. */
export function rockOf(t: TileInfo): RockTint {
  return {
    light: mix(STONE.light, t.paint.hi, 0.28),
    mid: mix(STONE.mid, t.paint.base, 0.3),
    dark: mix(STONE.dark, t.paint.lo, 0.36),
    ink: t.paint.ink,
  };
}
