/**
 * Terrain bake setup: material tables, companion-mask smoothing and the
 * host/companion colour blends. Split out of `terrain-layer.ts` to keep that
 * orchestrator under the file-length limit.
 */

import type { MapView } from '../../generated/MapView';
import { TERRAIN_KEYS } from '../../generated/content-keys';
import { mix, shade } from '../../style/tokens';
import { DRY_TEXTURES } from './materials-a';
import { SURFACE_TEXTURES } from './materials-b';
import { companionMask } from './noise';
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

/** 5-neighbour majority filter; kills single-tile mask confetti. */
function smoothMask(mask: Uint8Array, w: number, h: number) {
  const out = new Uint8Array(w * h);
  for (let ty = 0; ty < h; ty += 1) {
    for (let tx = 0; tx < w; tx += 1) {
      const i = ty * w + tx;
      let count = mask[i] === 1 ? 2 : 0;
      if (tx > 0 && mask[i - 1] === 1) count += 1;
      if (tx < w - 1 && mask[i + 1] === 1) count += 1;
      if (ty > 0 && mask[i - w] === 1) count += 1;
      if (ty < h - 1 && mask[i + w] === 1) count += 1;
      out[i] = count >= 3 ? 1 : 0;
    }
  }
  return out;
}

/** Assign every tile its source material and its companion-masked material. */
export function buildMaterials(map: MapView): { source: Int16Array; material: Int16Array } {
  const n = map.w * map.h;
  const source = new Int16Array(n);
  let mask = new Uint8Array(n);
  for (let ty = 0; ty < map.h; ty += 1) {
    for (let tx = 0; tx < map.w; tx += 1) {
      const i = ty * map.w + tx;
      const material = map.material[i] ?? 0;
      source[i] = material;
      const paint = TERRAIN_PAINT[TERRAIN_KEYS[material] ?? 'basalt'];
      if (paint.companion && companionMask(tx, ty, paint.companionMix)) mask[i] = 1;
    }
  }
  // Two smoothing passes turn scattered speckle into 2-4 tile patches.
  mask = smoothMask(mask, map.w, map.h);
  mask = smoothMask(mask, map.w, map.h);
  const material = new Int16Array(n);
  for (let i = 0; i < n; i += 1) {
    const self = source[i] ?? 0;
    const paint = TERRAIN_PAINT[TERRAIN_KEYS[self] ?? 'basalt'];
    let effective = self;
    if (mask[i] === 1 && paint.companion) {
      const companion = TERRAIN_KEYS.indexOf(paint.companion);
      if (companion >= 0) effective = companion;
    }
    material[i] = effective;
  }
  return { source, material };
}

/** Per-material fill tints. */
export function buildTints(): string[][] {
  return TERRAIN_KEYS.map((key) => {
    const base = TERRAIN_PAINT[key].base;
    return TINT_STEPS.map((f) => shade(base, f));
  });
}

/** Host/companion colour blend table, indexed [self][companion]. */
export function buildBlends(): MaterialPaint[][] {
  return TERRAIN_KEYS.map((selfKey) =>
    TERRAIN_KEYS.map((companionKey) =>
      blendPaint(TERRAIN_PAINT[selfKey], TERRAIN_PAINT[companionKey], 0.32),
    ),
  );
}

/** Material texture dispatch, indexed by `TERRAIN_KEYS`. */
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
  ];
}
