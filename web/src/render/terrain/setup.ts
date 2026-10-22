/**
 * Terrain bake setup: material tables, tint ramps and the host/companion
 * colour blends. Split out of `terrain-layer.ts` to keep that orchestrator
 * under the file-length limit.
 *
 * Everything here is chunk independent and built once, so a chunk bake is pure
 * tile work: the tables are shared by every 32x32 block on the planet.
 */

import { TERRAIN_KEYS } from '../../generated/content-keys';
import { mix, shade } from '../../style/tokens';
import { DRY_TEXTURES } from './materials-a';
import { SURFACE_TEXTURES } from './materials-b';
import { COLD_TEXTURES, DEEP_TEXTURES } from './materials-c';
import type { MaterialTexture } from './tile';
import { TERRAIN_PAINT, type MaterialPaint } from '../world-palette';

/** Value jitter: correlated by a 3-tile noise band, max +/-4%. */
export const TINT_STEPS = [0.96, 0.97, 0.98, 0.99, 1.0, 1.01, 1.02, 1.03, 1.04] as const;

/** Aspects of a paint recipe that get blended when two materials mix. */
const PAINT_KEYS = ['base', 'hi', 'lo', 'seam', 'grain', 'ink', 'shine'] as const;

/** Blend a companion material towards the host so patches step, not shout. */
function blendPaint(self: MaterialPaint, companion: MaterialPaint, t: number): MaterialPaint {
  const out: Record<(typeof PAINT_KEYS)[number], string> = {
    base: self.base,
    hi: self.hi,
    lo: self.lo,
    seam: self.seam,
    grain: self.grain,
    ink: self.ink,
    shine: self.shine,
  };
  for (const key of PAINT_KEYS) out[key] = mix(self[key], companion[key], t);
  return {
    base: out.base,
    hi: out.hi,
    lo: out.lo,
    seam: out.seam,
    grain: out.grain,
    ink: out.ink,
    shine: out.shine,
    companion: null,
    companionMix: 0,
    specks: companion.specks,
  };
}

/** Per-material fill tints, indexed like `TERRAIN_KEYS`. */
export function buildTints(): string[][] {
  return TERRAIN_KEYS.map((key) => {
    const base = TERRAIN_PAINT[key].base;
    return TINT_STEPS.map((f) => shade(base, f));
  });
}

/** Host/companion colour blend table, indexed `[self][companion]`. */
export function buildBlends(): MaterialPaint[][] {
  return TERRAIN_KEYS.map((selfKey) =>
    TERRAIN_KEYS.map((companionKey) =>
      blendPaint(TERRAIN_PAINT[selfKey], TERRAIN_PAINT[companionKey], 0.32),
    ),
  );
}

/**
 * Fill tints of the blended (companion) faces, indexed `[self][companion][step]`.
 *
 * A companion patch must *step*, not shout: the face colour has to come from the
 * same 32% blend its texture is painted with. Using the companion's own tint here
 * (the obvious shortcut) paints a full-strength patch under a blended texture,
 * which is what turned the cold bands into a chessboard.
 */
export function buildBlendTints(): string[][][] {
  const blends = buildBlends();
  return blends.map((row) => row.map((paint) => TINT_STEPS.map((f) => shade(paint.base, f))));
}

/**
 * Material texture dispatch, indexed by `TERRAIN_KEYS`.
 *
 * Every row must have a painter: a missing entry leaves a flat colour, which
 * reads as an unfinished biome at map scale.
 */
export function buildTextures(): readonly MaterialTexture[] {
  return [
    DRY_TEXTURES.basalt,
    DRY_TEXTURES.regolith,
    DRY_TEXTURES.moss,
    DRY_TEXTURES.sand,
    SURFACE_TEXTURES.brine,
    SURFACE_TEXTURES.apron,
    SURFACE_TEXTURES.road,
    SURFACE_TEXTURES.crystal,
    DEEP_TEXTURES.shallow,
    DEEP_TEXTURES.deep,
    COLD_TEXTURES.snow,
    COLD_TEXTURES.tundra,
    COLD_TEXTURES.desert,
    COLD_TEXTURES.highland,
    COLD_TEXTURES.mossyTundra,
  ];
}

/** Look a paint recipe up by material index, falling back to basalt. */
export function paintOf(material: number): MaterialPaint {
  return TERRAIN_PAINT[TERRAIN_KEYS[material] ?? 'basalt'];
}

/** Look a texture painter up by material index. */
export function textureOf(
  textures: readonly MaterialTexture[],
  material: number,
): MaterialTexture | undefined {
  return textures[material];
}
