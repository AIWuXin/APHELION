/**
 * Per-tile painting for the chunk bake.
 *
 * The surface language (invariant #3): every tile is a hard-edged rhombus with
 * correlated tone and a sparse dithered fringe only where two materials meet.
 * Only manufactured roads and aprons retain a regular expansion-joint rim. Neighbour
 * probes go through the wrapping {@link ChunkStore}, so dither, foam and cliff
 * lips stay continuous across chunk borders and across the 10239/0 seam.
 *
 * Bake order inside a chunk: all tile tops (screen-depth order), then every
 * cliff lip and foam line, then the props. Nothing here runs per frame -- a
 * chunk is painted once and blitted until it is evicted.
 */

import { TILE, shade } from '../../style/tokens';
import { paintCliff, paintShore } from './cliff';
import { paintDecorTile } from './decor';
import { paintGroundMark } from './ground-marks';
import { clipDiamond, diamondPath, rand01, valueNoise } from './noise';
import { hasTileSeam } from './surface-rules';
import { TINT_STEPS, buildBlendTints, buildBlends, buildTextures, buildTints, paintOf } from './setup';
import { paintCrystalClusters, SURFACE_INDEX } from './materials-b';
import type { MaterialTexture, TileInfo } from './tile';
import type { ChunkStore } from './chunk-store';
import type { MaterialPaint } from '../world-palette';
import { crisp } from '../primitives';
import { mix } from '../../style/tokens';

const HALF_W = TILE.w / 2;
const HALF_H = TILE.h / 2;

/** Tables shared by every chunk: pure functions of the static palette. */
export interface PaintTables {
  /** Per-material, per-jitter-step fill colours. */
  readonly tints: string[][];
  /** Host/companion colour blends, indexed `[self][effective]`. */
  readonly blends: readonly (readonly MaterialPaint[])[];
  /** Fill tints of the blended faces, indexed `[self][effective][step]`. */
  readonly blendTints: readonly (readonly (readonly string[])[])[];
  /** Texture painter per material index. */
  readonly textures: readonly MaterialTexture[];
}

let cachedTables: PaintTables | null = null;

/** Build (once) the shared paint tables. */
export function paintTables(): PaintTables {
  if (!cachedTables) {
    cachedTables = {
      tints: buildTints(),
      blends: buildBlends(),
      blendTints: buildBlendTints(),
      textures: buildTextures(),
    };
  }
  return cachedTables;
}

/** Paints single tiles into a chunk canvas. */
export class TilePainter {
  private readonly tables: PaintTables;

  public constructor(private readonly store: ChunkStore) {
    this.tables = paintTables();
  }

  /** Screen geometry of a tile centre inside a chunk canvas. */
  public static halfWidth(): number {
    return HALF_W;
  }

  /** Half-height of the tile rhombus, for canvas layout maths. */
  public static halfHeight(): number {
    return HALF_H;
  }

  /** Paint one tile's face, texture, ground mark, dither and seams. */
  public top(ctx: CanvasRenderingContext2D, tx: number, ty: number, cx: number, cy: number): void {
    const info = this.info(ctx, tx, ty, cx, cy);
    if (!info) return;
    const tile = this.store.tile(tx, ty);
    if (!tile) return;
    const fill = this.tintFor(tile.source, tile.material, tx, ty);

    ctx.save();
    clipDiamond(ctx, cx, cy, HALF_W, HALF_H);
    ctx.fillStyle = fill;
    diamondPath(ctx, cx, cy, HALF_W, HALF_H);
    ctx.fill();
    const texture = this.tables.textures[tile.material];
    if (texture) texture(info);
    // A seam or vein owns the whole tile: no competing ground marks under it.
    const bare = tile.decor === 0 && tile.ore === 0 && tile.coal === 0 && tile.oil === 0;
    if (bare) paintGroundMark(info);
    this.dither(ctx, info, tile.material);
    ctx.restore();

    if (hasTileSeam(tile.material)) this.seams(ctx, info, info.paint);
  }

  /** Cliff lips and foam after every top in this chunk is down. */
  public edges(ctx: CanvasRenderingContext2D, tx: number, ty: number, cx: number, cy: number): void {
    const info = this.info(ctx, tx, ty, cx, cy);
    if (!info) return;
    const h = this.store.elev(tx, ty);
    const dropSouth = Math.max(0, h - this.store.elev(tx, ty + 1));
    const dropEast = Math.max(0, h - this.store.elev(tx + 1, ty));
    if (dropSouth > 0 || dropEast > 0) paintCliff(ctx, info, dropSouth, dropEast);
    paintShore(ctx, info);
  }

  /** Decoration, ore veins and coal seams, painted over every lip. */
  public props(ctx: CanvasRenderingContext2D, tx: number, ty: number, cx: number, cy: number): void {
    const tile = this.store.tile(tx, ty);
    if (!tile) return;
    const info = this.info(ctx, tx, ty, cx, cy);
    if (!info) return;
    if (tile.source === SURFACE_INDEX.crystal) paintCrystalClusters(info);
    const golden = rand01(tx, ty, 0xb7) > 0.74;
    if (tile.decor > 0) paintDecorTile(info, tile.decor, tile.ore, golden, tile.coal, tile.oil);
    else if (tile.ore > 0 || tile.coal > 0 || tile.oil > 0) {
      paintDecorTile(info, 0, tile.ore, golden, tile.coal, tile.oil);
    }
  }

  // ------------------------------------------------------------------ helpers

  private info(
    ctx: CanvasRenderingContext2D,
    tx: number,
    ty: number,
    cx: number,
    cy: number,
  ): TileInfo | null {
    const tile = this.store.tile(tx, ty);
    if (!tile) return null;
    return {
      ctx,
      cx,
      cy,
      rx: HALF_W,
      ry: HALF_H,
      tx,
      ty,
      paint: this.paintAt(tile.source, tile.material),
      source: tile.source,
      materialAt: (dx, dy) => this.store.material(tx + dx, ty + dy),
    };
  }

  /** The paint of a tile: the host recipe, or its blend with the companion. */
  private paintAt(source: number, effective: number): MaterialPaint {
    if (effective !== source) {
      const row = this.tables.blends[source];
      const blend = row?.[effective];
      if (blend) return blend;
    }
    return paintOf(effective);
  }

  /** Correlated value step: neighbouring tiles mostly share a tone. */
  private tintFor(source: number, effective: number, tx: number, ty: number): string {
    const row =
      effective === source
        ? (this.tables.tints[effective] ?? this.tables.tints[0] ?? [])
        : (this.tables.blendTints[source]?.[effective] ?? this.tables.tints[effective] ?? []);
    const band = valueNoise(tx, ty, 3, 0x4f1) / 1024;
    const wobble = (rand01(tx, ty, 0x3b7) - 0.5) * 1.4;
    const level = Math.round(band * (TINT_STEPS.length - 1) + wobble);
    const clamped = Math.min(TINT_STEPS.length - 1, Math.max(0, level));
    return row[clamped] ?? '#000000';
  }

  /** Sparse checker fringe of mixed gravel along every material boundary. */
  private dither(ctx: CanvasRenderingContext2D, info: TileInfo, key: number): void {
    const { rx, ry } = info;
    // fromA, fromB, toA, toB, inwardA, inwardB, neighbour dx, neighbour dy
    const edges: readonly [number, number, number, number, number, number, number, number][] = [
      [0, 1, 1, 1, 0, -1, 0, 1],
      [1, 0, 1, 1, -1, 0, 1, 0],
      [0, 0, 1, 0, 0, 1, 0, -1],
      [0, 0, 0, 1, 1, 0, -1, 0],
    ];
    const self = info.paint;
    for (const [fa, fb, ta, tb, ia, ib, dx, dy] of edges) {
      const neighbour = info.materialAt(dx, dy);
      if (neighbour < 0 || neighbour === key) continue;
      const other = paintOf(neighbour);
      const color = shade(mix(self.base, other.base, 0.58), 0.9);
      const steps = 26;
      const depth = 2;
      for (let i = 0; i < steps; i += 1) {
        const s = (i + 0.5) / steps;
        const a = fa + (ta - fa) * s;
        const b = fb + (tb - fb) * s;
        for (let d = 1; d <= depth; d += 1) {
          if ((i + d * 2) % 3 !== 0) continue;
          const aa = a + ia * (d * 0.032);
          const bb = b + ib * (d * 0.032);
          const px = info.cx + (aa - bb) * rx;
          const py = info.cy + (aa + bb - 1) * ry;
          ctx.fillStyle = color;
          ctx.fillRect(Math.round(px), Math.round(py), 1, 1);
        }
      }
    }
  }

  /** Hard 1px seam on the two lower tile edges. */
  private seams(ctx: CanvasRenderingContext2D, info: TileInfo, paint: MaterialPaint): void {
    const { cx, cy, rx, ry } = info;
    ctx.strokeStyle = paint.seam;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(crisp(cx - rx), crisp(cy));
    ctx.lineTo(crisp(cx), crisp(cy + ry));
    ctx.lineTo(crisp(cx + rx), crisp(cy));
    ctx.stroke();
  }
}
