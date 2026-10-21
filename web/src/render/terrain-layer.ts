/**
 * Terrain baking.
 *
 * The planet never changes after boot, so it is painted once into an offscreen
 * canvas and blitted every frame. That is what buys the 60fps budget: the world
 * layer only redraws moving things.
 *
 * Surface language (invariant #3): every tile is a hard-edged rhombus of one
 * material with a 1px darker seam on its two lower edges, a small per-tile
 * value jitter, and a sparse dithered fringe only where two materials meet.
 * The generated map is low frequency, so a companion mask (majority-filtered
 * so it only ever produces 2-4 tile patches) breaks the big regions into a
 * hard-edged patchwork instead of camouflage blobs.
 *
 * Bake order: all tile tops (screen-depth order), then every cliff lip and the
 * island crust, then the props. No per-frame work happens here.
 */

import type { MapView } from '../generated/MapView';
import { TERRAIN_KEYS } from '../generated/content-keys';
import { PALETTE, TILE, mix, shade } from '../style/tokens';
import { crisp } from './primitives';
import { paintCrystalClusters, SURFACE_INDEX } from './terrain/materials-b';
import { paintCliff, paintMapRim, paintShore } from './terrain/cliff';
import { paintDecorTile, paintGroundMark } from './terrain/decor';
import { clipDiamond, diamondPath, isoPoint, rand01, rand2, valueNoise } from './terrain/noise';
import {
  buildBlends,
  buildMaterials,
  buildTextures,
  buildTints,
  TINT_STEPS,
} from './terrain/setup';
import type { MaterialTexture, TileInfo } from './terrain/tile';
import { TERRAIN_PAINT, type MaterialPaint } from './world-palette';

const HALF_W = TILE.w / 2;
const HALF_H = TILE.h / 2;
/** Baked-image padding so tall props and the crust are not clipped. */
const PAD_X = 8;
const PAD_TOP = 30;
const PAD_BOTTOM = 18;

/** A pre-baked planet surface. */
export class TerrainLayer {
  /** Screen-space bounds of the baked image. */
  public readonly originX: number;
  /** Screen-space bounds of the baked image. */
  public readonly originY: number;
  /** Baked image width in pixels. */
  public readonly width: number;
  /** Baked image height in pixels. */
  public readonly height: number;

  private readonly canvas: HTMLCanvasElement;
  /** Effective material index per tile, after the companion mask. */
  private readonly material: Int16Array;
  /** Source material index per tile, straight from the generated map. */
  private readonly source: Int16Array;
  /** Per-material, per-jitter-step fill colours. */
  private readonly tints: string[][];
  /** Host/companion colour blends for masked tiles. */
  private readonly blends: readonly (readonly MaterialPaint[])[];
  private readonly textures: readonly MaterialTexture[];

  public constructor(map: MapView) {
    this.width = (map.w + map.h) * HALF_W + PAD_X * 2;
    this.height = (map.w + map.h) * HALF_H + PAD_TOP + PAD_BOTTOM;
    this.originX = map.h * HALF_W + PAD_X;
    this.originY = PAD_TOP;

    const built = buildMaterials(map);
    this.source = built.source;
    this.material = built.material;
    this.tints = buildTints();
    this.blends = buildBlends();
    this.textures = buildTextures();

    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.ceil(this.width);
    this.canvas.height = Math.ceil(this.height);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('terrain: no 2d context');
    ctx.imageSmoothingEnabled = false;
    this.bake(ctx, map);
  }

  /** Draw the baked surface with the camera offset applied. */
  public draw(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.canvas, Math.round(camX - this.originX), Math.round(camY - this.originY));
  }

  // ------------------------------------------------------------------- bake

  private bake(ctx: CanvasRenderingContext2D, map: MapView): void {
    ctx.fillStyle = PALETTE.void;
    ctx.fillRect(0, 0, this.width, this.height);
    this.bakeTops(ctx, map);
    this.bakeEdges(ctx, map);
    this.bakeProps(ctx, map);
  }

  /** Screen centre of a tile's rhombus. */
  private centre(tx: number, ty: number): [number, number] {
    return [this.originX + (tx - ty) * HALF_W, this.originY + (tx + ty + 1) * HALF_H];
  }

  private keyAt(index: number): number {
    return this.material[index] ?? 0;
  }

  /** The paint of a tile: the host recipe, or its blend with the companion. */
  private paintAt(index: number): MaterialPaint {
    const effective = this.keyAt(index);
    const self = this.source[index] ?? effective;
    if (effective !== self) {
      const row = this.blends[self] ?? this.blends[0];
      const blend = row?.[effective];
      if (blend) return blend;
    }
    return TERRAIN_PAINT[TERRAIN_KEYS[effective] ?? 'basalt'];
  }

  private tileInfo(ctx: CanvasRenderingContext2D, map: MapView, tx: number, ty: number): TileInfo {
    const index = ty * map.w + tx;
    const [cx, cy] = this.centre(tx, ty);
    return {
      ctx,
      cx,
      cy,
      rx: HALF_W,
      ry: HALF_H,
      tx,
      ty,
      paint: this.paintAt(index),
      source: this.source[index] ?? 0,
      materialAt: (dx, dy) => {
        const nx = tx + dx;
        const ny = ty + dy;
        if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) return -1;
        return this.keyAt(ny * map.w + nx);
      },
    };
  }

  /** Rim darkening: the island's edge band steps down over 3 tiles. */
  private rimFactor(tx: number, ty: number, map: MapView): number {
    const d = Math.min(tx, ty, map.w - 1 - tx, map.h - 1 - ty);
    if (d === 0) return 0.58;
    if (d === 1) return 0.73;
    if (d === 2) return 0.88;
    return 1;
  }

  /** Correlated value step: neighbouring tiles mostly share a tone. */
  private tintFor(index: number, tx: number, ty: number): string {
    const rows = this.tints;
    const row = rows[this.keyAt(index)] ?? rows[0] ?? [];
    const band = valueNoise(tx, ty, 3, 0x4f1) / 1024;
    const wobble = (rand01(tx, ty, 0x3b7) - 0.5) * 1.4;
    const level = Math.round(band * (TINT_STEPS.length - 1) + wobble);
    const clamped = Math.min(TINT_STEPS.length - 1, Math.max(0, level));
    return row[clamped] ?? '#000000';
  }

  private bakeTops(ctx: CanvasRenderingContext2D, map: MapView): void {
    for (let sum = 0; sum <= map.w + map.h - 2; sum += 1) {
      for (let ty = Math.max(0, sum - map.w + 1); ty <= Math.min(map.h - 1, sum); ty += 1) {
        this.paintTop(ctx, map, sum - ty, ty);
      }
    }
  }

  private paintTop(ctx: CanvasRenderingContext2D, map: MapView, tx: number, ty: number): void {
    const index = ty * map.w + tx;
    const key = this.keyAt(index);
    const paint = this.paintAt(index);
    const [cx, cy] = this.centre(tx, ty);
    const info = this.tileInfo(ctx, map, tx, ty);
    const fill = shade(this.tintFor(index, tx, ty), this.rimFactor(tx, ty, map));

    ctx.save();
    clipDiamond(ctx, cx, cy, HALF_W, HALF_H);
    ctx.fillStyle = fill;
    diamondPath(ctx, cx, cy, HALF_W, HALF_H);
    ctx.fill();
    const texture = this.textures[key];
    if (texture) texture(info);
    // A seam or vein owns the whole tile: no competing ground marks under it.
    const bare =
      (map.decor[index] ?? 0) === 0 &&
      (map.deposit[index] ?? 0) === 0 &&
      (map.coal[index] ?? 0) === 0;
    if (bare) paintGroundMark(info);
    this.paintDither(ctx, info, key);
    ctx.restore();

    this.paintSeams(ctx, info, paint);
  }

  /** Sparse checker fringe of mixed gravel along every material boundary. */
  private paintDither(ctx: CanvasRenderingContext2D, info: TileInfo, key: number): void {
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
      const other = TERRAIN_PAINT[TERRAIN_KEYS[neighbour] ?? 'basalt'];
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
          const p = isoPoint(info.cx, info.cy, rx, ry, aa, bb);
          ctx.fillStyle = color;
          ctx.fillRect(Math.round(p[0]), Math.round(p[1]), 1, 1);
        }
      }
    }
  }

  /** Hard 1px seam on the two lower tile edges. */
  private paintSeams(ctx: CanvasRenderingContext2D, info: TileInfo, paint: MaterialPaint): void {
    const { cx, cy, rx, ry } = info;
    ctx.strokeStyle = paint.seam;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(crisp(cx - rx), crisp(cy));
    ctx.lineTo(crisp(cx), crisp(cy + ry));
    ctx.lineTo(crisp(cx + rx), crisp(cy));
    ctx.stroke();
  }

  // ------------------------------------------------------------------ edges

  private heights(map: MapView, tx: number, ty: number): number {
    if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return 0;
    return map.height[ty * map.w + tx] ?? 0;
  }

  private bakeEdges(ctx: CanvasRenderingContext2D, map: MapView): void {
    for (let sum = 0; sum <= map.w + map.h - 2; sum += 1) {
      for (let ty = Math.max(0, sum - map.w + 1); ty <= Math.min(map.h - 1, sum); ty += 1) {
        const tx = sum - ty;
        const info = this.tileInfo(ctx, map, tx, ty);
        const h = this.heights(map, tx, ty);
        const dropSouth = ty + 1 < map.h ? Math.max(0, h - this.heights(map, tx, ty + 1)) : 0;
        const dropEast = tx + 1 < map.w ? Math.max(0, h - this.heights(map, tx + 1, ty)) : 0;
        if (dropSouth > 0 || dropEast > 0) paintCliff(ctx, info, dropSouth, dropEast);
        paintShore(ctx, info);
        paintMapRim(ctx, info, ty === map.h - 1, tx === map.w - 1, ty === 0, tx === 0);
      }
    }
  }

  // ------------------------------------------------------------------ props

  private bakeProps(ctx: CanvasRenderingContext2D, map: MapView): void {
    for (let sum = 0; sum <= map.w + map.h - 2; sum += 1) {
      for (let ty = Math.max(0, sum - map.w + 1); ty <= Math.min(map.h - 1, sum); ty += 1) {
        const tx = sum - ty;
        const index = ty * map.w + tx;
        const info = this.tileInfo(ctx, map, tx, ty);
        if (this.keyAt(index) === SURFACE_INDEX.crystal) paintCrystalClusters(info);
        const decor = map.decor[index] ?? 0;
        const deposit = map.deposit[index] ?? 0;
        // Coal seams share the prop pass with ore veins: same one-tile budget,
        // opposite palette (see `decor.coalSeam`).
        const coal = map.coal[index] ?? 0;
        const golden = rand2(tx, ty, 0xb7) > 0.74;
        if (decor > 0) paintDecorTile(info, decor, deposit, golden, coal);
        else if (deposit > 0 || coal > 0) paintDecorTile(info, 0, deposit, golden, coal);
      }
    }
  }
}
