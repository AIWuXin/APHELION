/**
 * Which chunks a camera can see, and which ring to have ready around it.
 *
 * Pure geometry: given the camera, the chunk edge and the pan direction, this
 * returns the visible set (touching the viewport, nearest-first), the look-ahead
 * ring (one chunk out, plus one more on the leading edge of a pan, ahead of the
 * camera first) and the `keep` set the surface cache may not evict.
 *
 * Nothing here touches pixels, canvases or the chunk store, so the order the
 * streamer works in can be reasoned about -- and changed -- without going near
 * the bake.
 */

import type { Camera } from '../iso';
import { screenToRel } from '../iso';
import { wrapIndex } from '../torus';

/** Chunk rings of look-ahead kept ready around the viewport. */
export const PREFETCH_RING = 1;
/** Extra look-ahead ring on the leading edge of a pan. */
export const PREFETCH_LEAD = 1;

/** One chunk the camera can see, with its unwrapped position. */
export interface VisibleChunk {
  /** Wrapped chunk coordinates (the cache key). */
  readonly cx: number;
  /** Wrapped chunk coordinates (the cache key). */
  readonly cy: number;
  /** Unwrapped chunk coordinates (screen placement + depth order). */
  readonly wx: number;
  /** Unwrapped chunk coordinates (screen placement + depth order). */
  readonly wy: number;
}

/** Pan direction, one step per chunk axis: `-1`, `0` or `1`. */
export interface Pan {
  readonly x: number;
  readonly y: number;
}

/** What the streamer should have resident this frame. */
export interface ViewportPlan {
  /** Chunks touching the viewport, nearest to the camera first. */
  readonly visible: VisibleChunk[];
  /** Look-ahead chunks outside the viewport, ahead of the pan first. */
  readonly ring: VisibleChunk[];
  /** Keys that must not be evicted this frame. */
  readonly keep: Set<number>;
}

/** No pan: plain nearest-first, which is what a teleport wants. */
export const NO_PAN: Pan = { x: 0, y: 0 };

/**
 * Plan one frame of streaming.
 *
 * `key` is the surface cache's key function; the plan needs it because the keep
 * set has to name chunks the same way the cache does. `chunksX/Y` wrap chunk
 * coordinates, so the plan works the same on either side of the 0/10239 seam.
 */
export function planViewport(
  cam: Camera,
  edge: number,
  chunksX: number,
  chunksY: number,
  pan: Pan,
  key: (cx: number, cy: number) => number,
): ViewportPlan {
  const rels = [
    screenToRel(cam, 0, 0),
    screenToRel(cam, cam.width, 0),
    screenToRel(cam, 0, cam.height),
    screenToRel(cam, cam.width, cam.height),
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rels) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x);
    maxY = Math.max(maxY, r.y);
  }
  // Chunks whose 32x32 tile square intersects the viewport. `floor` already
  // includes the chunk whose origin sits before the first visible tile, so no
  // extra pad is needed -- padding here would double the canvas count.
  const c0x = Math.floor((cam.centreX + minX) / edge);
  const c1x = Math.floor((cam.centreX + maxX) / edge);
  const c0y = Math.floor((cam.centreY + minY) / edge);
  const c1y = Math.floor((cam.centreY + maxY) / edge);

  const refAt = (wx: number, wy: number): VisibleChunk => ({
    cx: wrapIndex(wx, chunksX),
    cy: wrapIndex(wy, chunksY),
    wx,
    wy,
  });
  // Chebyshev distance from the camera chunk, for bake prioritisation.
  const distance = (ref: VisibleChunk): number =>
    Math.max(
      Math.abs(ref.wx + 0.5 - cam.centreX / edge),
      Math.abs(ref.wy + 0.5 - cam.centreY / edge),
    );

  const visible: VisibleChunk[] = [];
  for (let wy = c0y; wy <= c1y; wy += 1) {
    for (let wx = c0x; wx <= c1x; wx += 1) visible.push(refAt(wx, wy));
  }
  // Nearest-first, so the centre of the screen bakes first.
  visible.sort((a, b) => distance(a) - distance(b));
  const keep = new Set<number>();
  for (const ref of visible) keep.add(key(ref.cx, ref.cy));

  // A one-chunk ring of look-ahead, plus one more chunk on the leading edge of a
  // pan: the chunk the camera is heading into is the one that would otherwise
  // arrive on screen with no canvas at all.
  const rx0 = c0x - PREFETCH_RING - (pan.x < 0 ? PREFETCH_LEAD : 0);
  const rx1 = c1x + PREFETCH_RING + (pan.x > 0 ? PREFETCH_LEAD : 0);
  const ry0 = c0y - PREFETCH_RING - (pan.y < 0 ? PREFETCH_LEAD : 0);
  const ry1 = c1y + PREFETCH_RING + (pan.y > 0 ? PREFETCH_LEAD : 0);
  const seen = new Set(keep);
  const ring: { ref: VisibleChunk; ahead: boolean }[] = [];
  for (let wy = ry0; wy <= ry1; wy += 1) {
    for (let wx = rx0; wx <= rx1; wx += 1) {
      const ref = refAt(wx, wy);
      const k = key(ref.cx, ref.cy);
      if (seen.has(k)) continue;
      seen.add(k);
      const ahead =
        (pan.x > 0 && wx > c1x) ||
        (pan.x < 0 && wx < c0x) ||
        (pan.y > 0 && wy > c1y) ||
        (pan.y < 0 && wy < c0y);
      ring.push({ ref, ahead });
    }
  }
  // Chunks ahead of the pan are baked before the ring trailing behind it, and
  // each group stays nearest-first.
  ring.sort(
    (a, b) => Number(b.ahead) - Number(a.ahead) || distance(a.ref) - distance(b.ref),
  );
  return { visible, ring: ring.map((entry) => entry.ref), keep };
}
