import type { BuildingDef } from '../../generated/BuildingDef';
import type { BuildingKey } from '../../generated/content-keys';
import type { BuildingBodyPainter, SpriteBox } from '../sprite-contract';
import { PixelLru } from './pixel-lru';

export const BUILDING_PIXEL_BUDGET = 8_000_000;

export function rasterScale(dpr: number, zoom: number): number {
  if (!Number.isFinite(dpr) || !Number.isFinite(zoom) || dpr <= 0 || zoom <= 0) return 1;
  return Math.max(1, Math.min(3, Math.ceil(dpr * zoom * 2) / 2));
}

export function buildingSpriteKey(key: BuildingKey, scale: number): string {
  return `${key}@${scale}`;
}

export function spriteAnchor(cx: number, cy: number): { readonly x: number; readonly y: number } {
  return { x: Math.round(cx) + 0, y: Math.round(cy) + 0 };
}

export function spriteTransform(
  bounds: SpriteBox,
  scale: number,
): readonly [number, number, number, number, number, number] {
  return [scale, 0, 0, scale, -bounds.left * scale, -bounds.top * scale];
}

/** Rasterises static bodies on demand; dynamic state never enters a cache key. */
export class BuildingSpriteCache {
  private readonly cache: PixelLru<HTMLCanvasElement>;

  public constructor(budget = BUILDING_PIXEL_BUDGET) {
    this.cache = new PixelLru(budget);
  }

  public draw(
    ctx: CanvasRenderingContext2D,
    key: BuildingKey,
    def: BuildingDef,
    body: BuildingBodyPainter,
    bounds: SpriteBox,
    scale: number,
    cx: number,
    cy: number,
  ): boolean {
    const canvas = this.body(key, def, body, bounds, scale);
    if (!canvas) return false;
    const anchor = spriteAnchor(cx, cy);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.translate(anchor.x, anchor.y);
    ctx.drawImage(canvas, bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
    ctx.restore();
    return true;
  }

  private body(
    key: BuildingKey,
    def: BuildingDef,
    body: BuildingBodyPainter,
    bounds: SpriteBox,
    scale: number,
  ): HTMLCanvasElement | null {
    const cacheKey = buildingSpriteKey(key, scale);
    const hit = this.cache.get(cacheKey);
    if (hit) return hit;
    const w = bounds.right - bounds.left;
    const h = bounds.bottom - bounds.top;
    if (w <= 0 || h <= 0) return null;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(w * scale));
    canvas.height = Math.max(1, Math.ceil(h * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.save();
    ctx.setTransform(...spriteTransform(bounds, scale));
    body({ ctx, tile: 64 }, 0, 0, def);
    ctx.restore();
    this.cache.put(cacheKey, canvas, canvas.width * canvas.height);
    return canvas;
  }
}
