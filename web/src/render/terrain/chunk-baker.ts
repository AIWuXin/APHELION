/**
 * One baked chunk canvas.
 *
 * A chunk is 32x32 tiles, i.e. a 2112x1000 pixel diamond, and the bake is the
 * expensive part: ~1000 tiles x a texture, a dither pass and a seam each. So the
 * bake is a **state machine** that the terrain layer advances every frame with a
 * millisecond budget (`cook`). It always paints in the same order -- every tile
 * top, then every cliff lip and foam line, then every prop -- because a cliff
 * must land on top of the tiles in front of it and props on top of both. Those
 * three passes are what the frame budget slices; a chunk that is mid-bake is
 * still drawable (the tops land in screen-depth order, so it reads as a
 * progressive reveal, never as a black block).
 *
 * Each canvas also bleeds one tile to the north and west. Without that bleed the
 * cliff lip of a tile on a chunk border would be clipped by the canvas and then
 * painted over by the next chunk's tops, leaving a straight line of missing
 * relief every 32 tiles. With it, the southern chunk re-paints its northern
 * neighbour's lip itself, in its own canvas, after its own tops.
 */

import { mix, TILE } from '../../style/tokens';
import type { TilePainter } from './paint';
import type { ChunkStore } from './chunk-store';
import { paintOf } from './setup';

const HALF_W = TILE.w / 2;
const HALF_H = TILE.h / 2;

/** Tiles of north/west bleed, so a neighbouring cliff lip is never clipped. */
export const CHUNK_BLEED = 1;
/** Padding around the diamond: props rise ~30px, lips fall ~22px. */
const PAD_X = 8;
const PAD_TOP = 30;
const PAD_BOTTOM = 8;

/** How often the bake re-checks the frame budget, in tiles. */
const CHECK_EVERY = 24;

/** Paint passes of one chunk. */
const PASS_TOPS = 0;
const PASS_EDGES = 1;
const PASS_PROPS = 2;
const PASS_DONE = 3;

/** Local canvas geometry of a chunk: shared by every surface. */
export interface ChunkGeometry {
  /** Canvas size in pixels. */
  readonly w: number;
  readonly h: number;
  /** Canvas pixel of tile `(lx, ly)`'s centre (tile indices may be negative). */
  readonly ox: number;
  readonly oy: number;
}

/** Derive the canvas geometry for a chunk edge of `edge` tiles. */
export function chunkGeometry(edge: number): ChunkGeometry {
  return {
    w: 2 * HALF_W * (edge + CHUNK_BLEED) + PAD_X * 2,
    h: PAD_TOP + (2 * edge + 2 * CHUNK_BLEED - 1) * HALF_H + PAD_BOTTOM,
    ox: PAD_X + HALF_W * (edge + CHUNK_BLEED),
    oy: PAD_TOP + HALF_H * (1 + 2 * CHUNK_BLEED),
  };
}

/** A chunk canvas plus its bake state. */
export class ChunkSurface {
  /** Baked pixels. */
  public readonly canvas: HTMLCanvasElement;
  /** Chunk coordinates this surface belongs to (wrapped). */
  public readonly cx: number;
  public readonly cy: number;
  /** Canvas memory this surface holds, in pixels. */
  public readonly pixels: number;

  private readonly ctx: CanvasRenderingContext2D;
  private readonly geo: ChunkGeometry;
  /** Tiles in paint order, packed `(lx + BLEED) | (ly + BLEED) << 8`. */
  private readonly order: Int32Array;
  private pass = PASS_TOPS;
  private cursor = 0;
  private baked = 0;

  public constructor(
    cx: number,
    cy: number,
    private readonly edgeSize: number,
    private readonly store: ChunkStore,
    private readonly painter: TilePainter,
    dominant: string | null,
  ) {
    this.cx = cx;
    this.cy = cy;
    this.geo = chunkGeometry(edgeSize);
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.geo.w;
    this.canvas.height = this.geo.h;
    this.pixels = this.geo.w * this.geo.h;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('terrain: no 2d context');
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;
    this.order = buildOrder(edgeSize);
    this.paintPlaceholder(dominant);
  }

  /** Is the whole chunk painted? */
  public get ready(): boolean {
    return this.pass >= PASS_DONE;
  }

  /** Painted fraction, 0..1 (debug readout). */
  public get progress(): number {
    const total = this.order.length * 3;
    const done = (this.pass === PASS_DONE ? 3 : this.pass) * this.order.length + this.cursor;
    return Math.min(1, done / Math.max(1, total));
  }

  /** Tile count baked so far. */
  public get tiles(): number {
    return this.baked;
  }

  /** Advance the bake for at most `budgetMs`; returns true when complete. */
  public cook(budgetMs: number): boolean {
    if (this.pass === PASS_DONE) return true;
    const deadline = performance.now() + budgetMs;
    for (;;) {
      const sliceEnd = Math.min(this.order.length, this.cursor + CHECK_EVERY);
      for (; this.cursor < sliceEnd; this.cursor += 1) {
        const packed = this.order[this.cursor] ?? 0;
        const lx = (packed & 0xff) - CHUNK_BLEED;
        const ly = ((packed >> 8) & 0xff) - CHUNK_BLEED;
        this.paintTile(lx, ly);
        if (this.pass === PASS_TOPS) this.baked += 1;
      }
      if (this.cursor >= this.order.length) {
        this.pass += 1;
        this.cursor = 0;
        if (this.pass >= PASS_DONE) return true;
      }
      if (performance.now() >= deadline) return false;
    }
  }

  /**
   * Blit this chunk at a drawing-space position.
   *
   * The source rectangle is clipped to the viewport, so a 2.3 megapixel canvas
   * that only pokes 40 px into the frame costs 40 px of fill, not 2.3 MP. With
   * 6-9 chunks on screen that clipping is what keeps the composite under the
   * frame budget.
   */
  public blitTo(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    viewW: number,
    viewH: number,
  ): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    const sx0 = Math.max(0, -ix);
    const sy0 = Math.max(0, -iy);
    const sx1 = Math.min(this.canvas.width, Math.ceil(viewW) - ix);
    const sy1 = Math.min(this.canvas.height, Math.ceil(viewH) - iy);
    if (sx1 <= sx0 || sy1 <= sy0) return;
    ctx.drawImage(
      this.canvas,
      sx0,
      sy0,
      sx1 - sx0,
      sy1 - sy0,
      ix + sx0,
      iy + sy0,
      sx1 - sx0,
      sy1 - sy0,
    );
  }

  // ------------------------------------------------------------------ internals

  private paintTile(lx: number, ly: number): void {
    const tx = this.cx * this.edgeSize + lx;
    const ty = this.cy * this.edgeSize + ly;
    const cx = this.geo.ox + (lx - ly) * HALF_W;
    const cy = this.geo.oy + (lx + ly) * HALF_H;
    if (this.pass === PASS_TOPS) this.painter.top(this.ctx, tx, ty, cx, cy);
    else if (this.pass === PASS_EDGES) this.painter.edges(this.ctx, tx, ty, cx, cy);
    else if (this.pass === PASS_PROPS) this.painter.props(this.ctx, tx, ty, cx, cy);
  }

  /**
   * Cheap flat placeholder so an unbaked chunk never shows as a hole.
   *
   * Four by four blocky diamonds, each filled with the dominant colour of the
   * block: it reads as terrain arriving, not as a rendering bug.
   */
  private paintPlaceholder(dominant: string | null): void {
    const { ctx } = this;
    const cells = 4;
    const step = Math.max(1, Math.round(this.edgeSize / cells));
    for (let by = 0; by < this.edgeSize; by += step) {
      for (let bx = 0; bx < this.edgeSize; bx += step) {
        const tile = this.store.tile(this.cx * this.edgeSize + bx, this.cy * this.edgeSize + by);
        const paint = tile ? paintOf(tile.material) : null;
        const tone = !paint
          ? (dominant ?? '#0b1113')
          : tile && tile.elev < 0
            ? mix(paint.base, '#05090a', 0.35)
            : paint.base;
        const mx = bx + step / 2;
        const my = by + step / 2;
        const px = this.geo.ox + (mx - my) * HALF_W;
        const py = this.geo.oy + (mx + my) * HALF_H;
        const rx = step * HALF_W;
        const ry = step * HALF_H;
        ctx.beginPath();
        ctx.moveTo(px, py - ry);
        ctx.lineTo(px + rx, py);
        ctx.lineTo(px, py + ry);
        ctx.lineTo(px - rx, py);
        ctx.closePath();
        ctx.fillStyle = tone;
        ctx.fill();
      }
    }
  }
}

/** Tiles of a chunk in painter order: increasing screen depth (lx + ly). */
function buildOrder(edge: number): Int32Array {
  const lo = -CHUNK_BLEED;
  const hi = edge - 1;
  const out: number[] = [];
  for (let sum = lo + lo; sum <= hi + hi; sum += 1) {
    for (let lx = Math.max(lo, sum - hi); lx <= Math.min(hi, sum - lo); lx += 1) {
      const ly = sum - lx;
      out.push((lx + CHUNK_BLEED) | ((ly + CHUNK_BLEED) << 8));
    }
  }
  return Int32Array.from(out);
}
