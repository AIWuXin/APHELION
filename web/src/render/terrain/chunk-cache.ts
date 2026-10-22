/**
 * Bounded LRU over baked chunk canvases.
 *
 * This is the memory valve of the whole renderer. A 32x32 chunk canvas is
 * `2128 x 1094` pixels -- ~9.3 MB of RGBA -- so the cache is capped on **total
 * pixels**, not on a count: 24 Mpixel (~96 MB) holds ten chunks at native
 * resolution, which is one screenful plus one look-ahead chunk. The kernel's own
 * tile cache is a count (256) because a `TileData` block is 1.3 KB; a canvas is
 * seven thousand times heavier, so the bound has to be measured in pixels.
 *
 * Eviction never drops a chunk that is visible this frame (`keep`), even when
 * that overshoots the budget: a hole at the edge of the viewport is worse than a
 * soft memory ceiling. Everything else goes oldest-first.
 */

import type { ChunkSurface } from './chunk-baker';
import { wrapIndex } from '../torus';

/** Pixel budget for baked chunk canvases (~96 MB of RGBA at 4 bytes/px). */
export const BAKE_PIXEL_BUDGET = 24 * 1024 * 1024;

/** Hard guard: never hold more than this many canvases, whatever the budget. */
export const BAKE_MAX_SURFACES = 24;

/** LRU cache of chunk surfaces, keyed by wrapped chunk index. */
export class SurfaceCache {
  private readonly items = new Map<number, ChunkSurface>();
  private readonly chunksX: number;
  private readonly chunksY: number;
  private pixels = 0;

  public constructor(chunksX: number, chunksY: number) {
    this.chunksX = Math.max(1, chunksX);
    this.chunksY = Math.max(1, chunksY);
  }

  /** Resident canvases. */
  public get size(): number {
    return this.items.size;
  }

  /** Resident canvas pixels. */
  public get pixelCount(): number {
    return this.pixels;
  }

  /** Look up a surface, refreshing its LRU position. */
  public get(cx: number, cy: number): ChunkSurface | null {
    const key = this.key(cx, cy);
    const hit = this.items.get(key);
    if (!hit) return null;
    this.items.delete(key);
    this.items.set(key, hit);
    return hit;
  }

  /** Insert a freshly created surface, evicting others to stay inside budget. */
  public put(surface: ChunkSurface, keep: ReadonlySet<number>): void {
    const key = this.key(surface.cx, surface.cy);
    const existing = this.items.get(key);
    if (existing) {
      this.pixels -= existing.pixels;
      this.items.delete(key);
    }
    this.items.set(key, surface);
    this.pixels += surface.pixels;
    this.trim(keep);
  }

  /** Drop surfaces that are no longer needed until the budget is satisfied. */
  public trim(keep: ReadonlySet<number>): void {
    if (this.pixels <= BAKE_PIXEL_BUDGET && this.items.size <= BAKE_MAX_SURFACES) return;
    for (const [key, surface] of this.items) {
      if (this.pixels <= BAKE_PIXEL_BUDGET && this.items.size <= BAKE_MAX_SURFACES) return;
      if (keep.has(key)) continue;
      this.items.delete(key);
      this.pixels -= surface.pixels;
    }
  }

  /** Cache key of a chunk (wrapped, so 320 and 0 are distinct but 320 is 0). */
  public key(cx: number, cy: number): number {
    return wrapIndex(cy, this.chunksY) * this.chunksX + wrapIndex(cx, this.chunksX);
  }
}
