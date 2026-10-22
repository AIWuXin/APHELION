/**
 * Streaming terrain layer.
 *
 * The planet surface is 10240 x 10240 tiles: 102400 chunks, none of which can be
 * baked up front (the old `TerrainLayer` painted all 1936 tiles of a 44x44 island
 * into one canvas at boot). This layer streams instead:
 *
 *   1. **visible set** -- the chunks whose 32x32 diamond touches the viewport,
 *      derived from the camera's torus-relative corners. Recomputed only when
 *      the camera leaves the current chunk rect or the viewport changes.
 *      {@link planViewport} owns that geometry, plus the look-ahead ring: one
 *      chunk out, and one more on the leading edge of a pan.
 *   2. **data** -- {@link ChunkStore} fetches `oc_chunk` records within a
 *      per-frame budget, screen first, then the 3x3 neighbourhood a
 *      companion-mask halo needs, then the ring.
 *   3. **bake** -- {@link ChunkSurface} canvases are started before the frame's
 *      paint budget is spent, so a chunk entering the viewport never shows as a
 *      flat placeholder diamond, and the rest of the bake is sliced by time.
 *   4. **evict** -- {@link SurfaceCache} keeps total canvas pixels bounded and
 *      never drops a chunk that is on screen this frame.
 *
 * Chunks are drawn in ascending `(x + y)` order (the same painter's order the
 * tile lattice uses), so a prop rising out of a chunk's northern edge is never
 * covered by the chunk behind it, and a cliff lip whose canvas bleed reaches
 * into the southern chunk is re-painted there after that chunk's own tops.
 */

import type { ChunkSource } from './terrain/chunk-store';
import { ChunkStore } from './terrain/chunk-store';
import { ChunkSurface, chunkGeometry } from './terrain/chunk-baker';
import { BAKE_PIXEL_BUDGET, SurfaceCache } from './terrain/chunk-cache';
import { TilePainter } from './terrain/paint';
import type { VisibleChunk } from './terrain/viewport';
import { planViewport } from './terrain/viewport';
import type { MapView } from '../generated/MapView';
import { PALETTE, TILE } from '../style/tokens';
import type { Camera } from './iso';
import { wrapIndex } from './torus';

const HALF_W = TILE.w / 2;
const HALF_H = TILE.h / 2;

/** `oc_chunk` calls allowed per frame (each is a postcard decode of ~5 KB). */
const FETCH_PER_FRAME = 4;
/** Wall-clock budget for chunk painting, in milliseconds per frame. */
const BAKE_MS_PER_FRAME = 4;
/** New canvases a frame may create for chunks that are already on screen. */
const BAKE_STARTS_ON_SCREEN = 2;
/** New canvases a frame may create for the look-ahead ring. */
const BAKE_STARTS_LOOKAHEAD = 1;
/** Pan, in tiles, below which no direction is trusted. */
const LEAD_MIN_TILES = 1;
/** One-frame move, in tiles, past which the camera jumped rather than panned. */
const TELEPORT_TILES = 96;

/** Terrain counters for the debug overlay. */
export interface TerrainStats {
  /** Chunks touching the viewport this frame. */
  readonly visible: number;
  /** Resident canvases. */
  readonly surfaces: number;
  /** Resident canvas pixels. */
  readonly pixels: number;
  /** Chunks still mid-bake. */
  readonly pending: number;
  /** Chunks on screen with no canvas at all: these draw as placeholder diamonds. */
  readonly cold: number;
  /** `oc_chunk` calls so far. */
  readonly fetches: number;
  /** Resident decoded chunk records. */
  readonly records: number;
}

/** The streamed planet surface. */
export class TerrainLayer {
  private readonly store: ChunkStore;
  private readonly painter: TilePainter;
  private readonly cache: SurfaceCache;
  private readonly edge: number;
  private readonly geo: ReturnType<typeof chunkGeometry>;
  private visible: VisibleChunk[] = [];
  private ring: VisibleChunk[] = [];
  private keep = new Set<number>();
  /** Camera signature of the last visible-set rebuild. */
  private signature = '';
  /** Camera position last frame, in tiles, or `null` before the first frame. */
  private lastCentre: { x: number; y: number } | null = null;
  /** Unit step of the current pan per chunk axis: `-1`, `0` or `1`. */
  private lead = { x: 0, y: 0 };

  public constructor(map: MapView, source: ChunkSource | null) {
    this.store = new ChunkStore(map, source);
    this.painter = new TilePainter(this.store);
    this.cache = new SurfaceCache(this.store.chunksX, this.store.chunksY);
    this.edge = this.store.chunkEdge;
    this.geo = chunkGeometry(this.edge);
  }

  /** Effective terrain material at a wrapped tile, or `-1` when not resident. */
  public material(tx: number, ty: number): number {
    return this.store.material(tx, ty);
  }

  /** Make sure the chunk containing a tile is resident (for the scan panel). */
  public prefetch(tx: number, ty: number): void {
    this.store.ensure(
      Math.floor(wrapIndex(tx, this.store.chunksX * this.edge) / this.edge),
      Math.floor(wrapIndex(ty, this.store.chunksY * this.edge) / this.edge),
    );
  }

  /** Diagnostic dump of one chunk (`?debug=1` support hook). */
  public debugChunk(cx: number, cy: number): ReturnType<ChunkStore['debugChunk']> {
    return this.store.debugChunk(cx, cy);
  }

  /** Counters for the debug overlay. */
  public stats(): TerrainStats {
    let pending = 0;
    let cold = 0;
    for (const ref of this.visible) {
      const surface = this.cache.get(ref.cx, ref.cy);
      if (!surface) cold += 1;
      else if (!surface.ready) pending += 1;
    }
    return {
      visible: this.visible.length,
      surfaces: this.cache.size,
      pixels: this.cache.pixelCount,
      pending,
      cold,
      fetches: this.store.fetches,
      records: this.store.resident,
    };
  }

  /**
   * Advance streaming for this frame: visible set, data fetch, bake slices and
   * eviction. Cheap when the camera has not moved into a new chunk.
   */
  public update(cam: Camera): void {
    this.trackPan(cam);
    this.refreshVisible(cam);
    this.fetchData();
    this.advanceBakes();
    this.cache.trim(this.keep);
  }

  /**
   * Bake every visible chunk synchronously.
   *
   * Used once at boot behind the loading veil: the first frame the player sees
   * has a complete surface under the colony, so there are no placeholder blocks
   * in the opening shot.
   */
  public warm(cam: Camera): void {
    this.refreshVisible(cam);
    for (const ref of this.visible) {
      this.store.ensure(ref.cx, ref.cy);
      this.store.ensureRing(ref.cx, ref.cy);
    }
    for (const ref of this.visible) {
      const surface = this.ensureSurface(ref);
      if (!surface) continue;
      let guard = 0;
      while (!surface.ready && guard < 16) {
        surface.cook(1000);
        guard += 1;
      }
    }
    this.cache.trim(this.keep);
  }

  /** Draw every visible chunk, back to front. */
  public draw(ctx: CanvasRenderingContext2D, cam: Camera): void {
    const ordered = [...this.visible].sort((a, b) => a.wx + a.wy - (b.wx + b.wy));
    const viewW = cam.width / cam.zoom;
    const viewH = cam.height / cam.zoom;
    ctx.imageSmoothingEnabled = false;
    for (const ref of ordered) {
      const rx = ref.wx * this.edge - cam.centreX;
      const ry = ref.wy * this.edge - cam.centreY;
      const px = (rx - ry) * HALF_W - this.geo.ox + cam.ox;
      const py = (rx + ry + 1) * HALF_H - this.geo.oy + cam.oy;
      const surface = this.cache.get(ref.cx, ref.cy);
      if (surface) surface.blitTo(ctx, px, py, viewW, viewH);
      else this.placeholder(ctx, px, py, ref);
    }
  }

  // ------------------------------------------------------------------ streaming

  /**
   * Remember which way the camera is going.
   *
   * A pan is what turns the look-ahead ring into a decision: the chunk the
   * camera is about to reach is worth a ring slot of its own, while the ring
   * behind it is only insurance. A jump is not a pan -- after a radar teleport
   * the camera is standing still, so the plain nearest-first order (centre of the
   * screen first) is the right one, and it has to not be mistaken for a
   * hundred-chunk-per-frame pan.
   */
  private trackPan(cam: Camera): void {
    const last = this.lastCentre;
    this.lastCentre = { x: cam.centreX, y: cam.centreY };
    if (!last) return;
    const dx = cam.centreX - last.x;
    const dy = cam.centreY - last.y;
    if (Math.abs(dx) > TELEPORT_TILES || Math.abs(dy) > TELEPORT_TILES) {
      this.lead = { x: 0, y: 0 };
      return;
    }
    this.lead = {
      x: Math.abs(dx) >= LEAD_MIN_TILES ? Math.sign(dx) : 0,
      y: Math.abs(dy) >= LEAD_MIN_TILES ? Math.sign(dy) : 0,
    };
  }

  /** Rebuild the visible set and look-ahead ring when the camera leaves the rect. */
  private refreshVisible(cam: Camera): void {
    const sig = `${Math.floor(cam.centreX / this.edge)}:${Math.floor(cam.centreY / this.edge)}:${Math.round(cam.zoom * 100)}:${Math.round(cam.width / 32)}:${Math.round(cam.height / 32)}`;
    if (sig === this.signature) return;
    this.signature = sig;
    const plan = planViewport(
      cam,
      this.edge,
      this.store.chunksX,
      this.store.chunksY,
      this.lead,
      (cx, cy) => this.cache.key(cx, cy),
    );
    this.visible = plan.visible;
    this.ring = plan.ring;
    this.keep = plan.keep;
  }
  /**
   * Pull a few `oc_chunk` records per frame, in the order the frame needs them.
   *
   * 1. the records of the chunks on screen, nearest first -- a canvas cannot
   *    start without its own tiles;
   * 2. the two-tile halo the companion mask reads through (a missing halo only
   *    costs border detail, it clamps);
   * 3. the ring, which is where the camera is heading.
   */
  private fetchData(): void {
    let budget = FETCH_PER_FRAME;
    for (const ref of this.visible) {
      if (budget <= 0) return;
      const before = this.store.fetches;
      this.store.ensure(ref.cx, ref.cy);
      budget -= this.store.fetches - before;
    }
    for (const ref of this.visible) {
      if (budget <= 0) return;
      const before = this.store.fetches;
      // The 3x3 neighbourhood, not just the chunk: the companion mask halo and
      // the cliff/shore probes both read one tile into the neighbours.
      this.store.ensureRing(ref.cx, ref.cy);
      budget -= this.store.fetches - before;
    }
    for (const ref of this.ring) {
      if (budget <= 0) return;
      const before = this.store.fetches;
      this.store.ensure(ref.cx, ref.cy);
      budget -= this.store.fetches - before;
    }
  }

  /**
   * Advance the bake: cover what the screen needs, then look ahead, then cook.
   *
   * Creation comes first for a reason. Cooking one 32x32 chunk takes several
   * milliseconds and the cook loop stops the moment the frame budget is gone, so
   * if cooking ran first a frame could spend every millisecond it had on the
   * chunk already on screen and leave the next one a flat placeholder diamond.
   * Starting the canvas first is what makes "the chunk the camera is panning
   * into is already painted" actually hold.
   */
  private advanceBakes(): void {
    const deadline = performance.now() + BAKE_MS_PER_FRAME;
    const estimate = this.geo.w * this.geo.h;
    let onScreenStarts = 0;
    for (const ref of this.visible) {
      if (onScreenStarts >= BAKE_STARTS_ON_SCREEN) break;
      if (this.cache.get(ref.cx, ref.cy)) continue;
      if (this.ensureSurface(ref)) onScreenStarts += 1;
    }
    // Look-ahead: one canvas per frame, and only while the pixel budget has room
    // left over, so the ring never evicts a chunk that is on screen.
    let lookaheadStarts = 0;
    for (const ref of this.ring) {
      if (lookaheadStarts >= BAKE_STARTS_LOOKAHEAD) break;
      if (this.cache.get(ref.cx, ref.cy)) continue;
      if (this.cache.pixelCount + estimate > BAKE_PIXEL_BUDGET) break;
      if (this.ensureSurface(ref)) lookaheadStarts += 1;
    }
    for (const ref of [...this.visible, ...this.ring]) {
      const surface = this.cache.get(ref.cx, ref.cy);
      if (!surface || surface.ready) continue;
      surface.cook(Math.max(0.5, deadline - performance.now()));
      if (performance.now() >= deadline) break;
    }
  }

  private ensureSurface(ref: VisibleChunk): ChunkSurface | null {
    const hit = this.cache.get(ref.cx, ref.cy);
    if (hit) return hit;
    // Halo first: the companion mask reads two tiles into the neighbours, so the
    // ring has to be resident before the material table is derived.
    this.store.ensureRing(ref.cx, ref.cy);
    const loaded = this.store.ensure(ref.cx, ref.cy);
    if (!loaded) return null;
    const surface = new ChunkSurface(
      ref.cx,
      ref.cy,
      this.edge,
      this.store,
      this.painter,
      loaded.dominant,
    );
    this.cache.put(surface, this.keep);
    return surface;
  }

  /** Flat diamond shown where a chunk has no canvas yet. */
  private placeholder(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    ref: VisibleChunk,
  ): void {
    const tone = this.store.dominant(ref.cx, ref.cy) ?? PALETTE.panel2;
    const cx = px + this.geo.ox;
    const cy = py + this.geo.oy + (this.edge - 1) * HALF_H;
    const rx = this.edge * HALF_W;
    const ry = this.edge * HALF_H;
    ctx.beginPath();
    ctx.moveTo(cx, cy - ry);
    ctx.lineTo(cx + rx, cy);
    ctx.lineTo(cx, cy + ry);
    ctx.lineTo(cx - rx, cy);
    ctx.closePath();
    ctx.fillStyle = tone;
    ctx.fill();
  }
}
