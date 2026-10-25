/**
 * World renderer.
 *
 * Draw order (painter's algorithm, single pass per layer):
 *   1. streamed terrain chunk canvases
 *   2. ground-plane guides (active orbital lane traces)
 *   3. ground drawables sorted by (x + y) -- buildings, units
 *   4. drop shadows for everything airborne
 *   5. air drawables sorted by altitude bucket
 *   6. orbital contacts
 *   7. beams and effects
 *   8. interaction overlays (hover, selection, ghost, pings)
 *
 * The renderer holds no game state: everything it needs arrives in `Frame`.
 * Positions are interpolated between `frame.previous` and `frame.snapshot` by
 * `frame.alpha`, so 60fps rendering stays smooth against the 30Hz simulation.
 *
 * Every world position is unwrapped **relative to the camera** before it is
 * projected (`toRel`), and the depth key is built from that unwrapped copy -- a
 * unit at x = 10239.5 next to a unit at x = 0.5 therefore sorts and draws as the
 * two neighbours they are, instead of standing on opposite ends of the planet.
 */

import type { BootBlob } from '../generated/BootBlob';
import type { ShipView } from '../generated/ShipView';
import type { UnitView } from '../generated/UnitView';
import { BUILDING_KEYS, UNIT_KEYS } from '../generated/content-keys';
import { PALETTE, TILE, rgba } from '../style/tokens';
import type { ChunkSource } from './terrain/chunk-store';
import type { Frame } from './frame';
import { project, toRel, toScreen } from './iso';
import type { Camera } from './iso';
import { deltaSpan } from './torus';
import { line } from './primitives';
import { drawAirShadows, drawInteraction, drawRouteTraces } from './overlays';
import { BuildingRenderer } from './sprites/building-renderer';
import { rasterScale } from './sprites/sprite-cache';
import { SHIP_PAINTERS, UNIT_PAINTERS } from './sprites/units';
import { TerrainLayer } from './terrain-layer';
import type { TerrainStats } from './terrain-layer';
import { GLOW, HULL } from './world-palette';

/** One thing to draw, with its sort key. */
interface Drawable {
  /** Larger draws later (in front). */
  readonly depth: number;
  readonly draw: () => void;
}

/** Fixed point scale of snapshot positions (tiles × 1024). */
const FP = 1024;

/** Index a snapshot array by entity id for interpolation lookups. */
function indexById<T extends { readonly id: number }>(items: readonly T[]): Map<number, T> {
  const map = new Map<number, T>();
  for (const item of items) map.set(item.id, item);
  return map;
}

/**
 * Linear blend between the previous and current position, **through the seam**.
 *
 * Interpolating raw coordinates would send a unit that stepped from x = 10239.9
 * to x = 0.1 on a 10240-tile sweep across the whole planet; unwrapping the
 * target next to the source keeps that a one-tile step.
 */
function blend(
  prev: UnitView | ShipView | undefined,
  cur: UnitView | ShipView,
  alpha: number,
  world: { readonly w: number; readonly h: number },
): { x: number; y: number; z: number } {
  const t = Math.max(0, Math.min(1, alpha));
  const px = cur.x / FP;
  const py = cur.y / FP;
  if (!prev) return { x: px, y: py, z: cur.z / FP };
  const ax = prev.x / FP;
  const ay = prev.y / FP;
  return {
    x: ax + deltaSpan(ax, px, world.w) * t,
    y: ay + deltaSpan(ay, py, world.h) * t,
    z: (prev.z + (cur.z - prev.z) * t) / FP,
  };
}

/** The Canvas world layer. */
export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private terrain: TerrainLayer | null = null;
  private dpr = 1;
  private width = 0;
  private height = 0;
  private readonly buildingRenderer = new BuildingRenderer();

  public constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('renderer: no 2d context');
    this.ctx = ctx;
  }

  /** Resize the backing store to the CSS size times the device pixel ratio. */
  public resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = Math.max(1, Math.min(3, dpr));
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

  /** Start streaming the planet once the boot blob arrives. */
  public setBoot(boot: BootBlob, source: ChunkSource | null): void {
    this.terrain = new TerrainLayer(boot.map, source);
  }

  /** Streamed-terrain counters for the debug overlay. */
  public terrainStats(): TerrainStats | null {
    return this.terrain?.stats() ?? null;
  }

  /** Effective terrain material of a wrapped tile (`-1` when not streamed yet). */
  public tileMaterial(tx: number, ty: number): number {
    return this.terrain?.material(tx, ty) ?? -1;
  }

  /** Ask the streamer for the chunk containing a wrapped tile. */
  public prefetchTile(tx: number, ty: number): void {
    this.terrain?.prefetch(tx, ty);
  }

  /** Diagnostic dump of one chunk (`?debug=1` support hook). */
  public debugChunk(
    cx: number,
    cy: number,
  ): { asked: readonly [number, number]; got: readonly [number, number]; raw: readonly number[]; effective: readonly number[] } | null {
    return this.terrain?.debugChunk(cx, cy) ?? null;
  }

  /** Bake the chunks the camera currently sees (boot, behind the veil). */
  public warm(camera: Camera): void {
    this.terrain?.warm(camera);
  }

  /** Render one frame. */
  public draw(frame: Frame): void {
    const ctx = this.ctx;
    const cam = frame.camera;
    const zoom = cam.zoom;
    // Zoom is a canvas scale on top of the orthographic projection: painters keep
    // drawing in projected pixels, so geometry magnifies uniformly. Hairline
    // weight scales with it (a 1px rim becomes 1.5px at 150%); at the default
    // 100% the 1px language is exact. See docs/decisions.md N-06.
    ctx.setTransform(this.dpr * zoom, 0, 0, this.dpr * zoom, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = PALETTE.void;
    ctx.fillRect(0, 0, this.width / zoom + 1, this.height / zoom + 1);
    if (!this.terrain) return;

    // Stream first, then paint: the update is what fetches and bakes chunks, and
    // it is budgeted so a fast pan never blocks the frame on a full rebuild.
    this.terrain.update(cam);
    const alpha = frame.alpha;
    this.terrain.draw(ctx, cam);

    // Ground-plane guides go under every object so structures occlude them.
    drawRouteTraces(ctx, frame);

    const ground: Drawable[] = [];
    const air: Drawable[] = [];
    const sky: Drawable[] = [];
    const env = { ctx, time: frame.time, tile: TILE.w };
    const prevUnits = indexById(frame.previous.units);
    const prevShips = indexById(frame.previous.orbital.ships);
    const world = { w: cam.worldW, h: cam.worldH };

    // ---- buildings (static) -------------------------------------------
    const scale = rasterScale(this.dpr, zoom);
    for (const b of frame.snapshot.buildings) {
      const def = frame.boot.catalog.buildings[b.kind];
      if (!def) continue;
      const size = def.footprint;
      const key = BUILDING_KEYS[b.kind] ?? 'command-hub';
      const rel = toRel(cam, b.tx + size / 2, b.ty + size / 2);
      const anchor = toScreen(cam, b.tx + size / 2, b.ty + size / 2, 0);
      ground.push({
        depth: (rel.x + rel.y) * 2,
        draw: () => {
          this.buildingRenderer.drawBuilding(env, anchor.x, anchor.y, key, b, def, scale);
          if (b.hp < b.hp_max) {
            this.health(anchor.x, anchor.y + this.buildingRenderer.healthY(key), b.hp, b.hp_max);
          }
        },
      });
    }

    // ---- ground and low-air units (interpolated) ------------------------
    for (const u of frame.snapshot.units) {
      const def = frame.boot.catalog.units[u.kind];
      if (!def) continue;
      const painter = UNIT_PAINTERS[UNIT_KEYS[u.kind] ?? 'raider'];
      const p = blend(prevUnits.get(u.id), u, alpha, world);
      const rel = toRel(cam, p.x, p.y);
      const screen = toScreen(cam, p.x, p.y, p.z);
      const depth = rel.x + rel.y + (p.z > 0.14 ? 0.5 : 0);
      const target = p.z > 0.14 ? air : ground;
      target.push({
        depth,
        draw: () => {
          painter(env, screen.x, screen.y, u, def);
          if (u.hp < u.hp_max) this.health(screen.x, screen.y - 26, u.hp, u.hp_max);
        },
      });
    }

    // ---- orbital contacts (interpolated) -------------------------------
    for (const s of frame.snapshot.orbital.ships) {
      const def = frame.boot.catalog.units[s.kind];
      if (!def) continue;
      const painter = SHIP_PAINTERS[UNIT_KEYS[s.kind] ?? 'hauler'];
      const p = blend(prevShips.get(s.id), s, alpha, world);
      const screen = toScreen(cam, p.x, p.y, p.z);
      sky.push({
        depth: -p.z,
        draw: () => {
          painter(env, screen.x, screen.y, s, def);
        },
      });
    }

    ground.sort((a, b) => a.depth - b.depth);
    air.sort((a, b) => a.depth - b.depth);
    sky.sort((a, b) => a.depth - b.depth);
    for (const d of ground) d.draw();
    drawAirShadows(ctx, frame);
    for (const d of air) d.draw();
    for (const d of sky) d.draw();

    this.drawBeams(frame);
    this.drawEffects(frame);
    drawInteraction(ctx, frame);
  }

  /** A compact HP chip above a structure or unit. */
  private health(cx: number, cy: number, hp: number, hpMax: number): void {
    const ctx = this.ctx;
    const w = 24;
    const ratio = Math.max(0, Math.min(1, hp / Math.max(1, hpMax)));
    const x = Math.round(cx - w / 2);
    ctx.fillStyle = rgba('#000000', 0.72);
    ctx.fillRect(x - 1, Math.round(cy) - 1, w + 2, 5);
    ctx.fillStyle = rgba('#ffffff', 0.16);
    ctx.fillRect(x, Math.round(cy), w, 3);
    ctx.fillStyle = ratio > 0.5 ? GLOW.status : ratio > 0.25 ? GLOW.primary : GLOW.danger;
    ctx.fillRect(x, Math.round(cy), Math.round(w * ratio), 3);
  }

  private drawBeams(frame: Frame): void {
    const ctx = this.ctx;
    const cam = frame.camera;
    for (const b of frame.snapshot.beams) {
      // Unwrap the far end near the near end, so a beam fired across the seam
      // stays a short beam instead of a planet-long line.
      const x0 = b.x0 / FP;
      const y0 = b.y0 / FP;
      const x1 = x0 + deltaSpan(x0, b.x1 / FP, cam.worldW);
      const y1 = y0 + deltaSpan(y0, b.y1 / FP, cam.worldH);
      const a = toScreen(cam, x0, y0, b.z0 / FP);
      const c = toScreen(cam, x1, y1, b.z1 / FP);
      const t = b.life > 0 ? b.age / b.life : 1;
      const color = b.kind === 3 ? GLOW.danger : b.kind === 5 ? GLOW.status : GLOW.function;
      ctx.globalAlpha = Math.max(0, 1 - t);
      line(ctx, [a.x, a.y], [c.x, c.y], rgba(color, 0.16), 3);
      line(ctx, [a.x, a.y], [c.x, c.y], rgba(color, 0.9), 1);
      ctx.globalAlpha = 1;
    }
  }

  private drawEffects(frame: Frame): void {
    const ctx = this.ctx;
    const cam = frame.camera;
    for (const e of frame.snapshot.effects) {
      const p = toScreen(cam, e.x / FP, e.y / FP, e.z / FP);
      const t = e.life > 0 ? Math.min(1, e.age / e.life) : 1;
      const fade = 1 - t;
      if (e.kind === 2) {
        const r = 4 + t * 18;
        ctx.globalAlpha = fade;
        if (t < 0.45) {
          ctx.fillStyle = rgba(GLOW.primary, 0.8 * (1 - t / 0.45));
          ctx.beginPath();
          ctx.moveTo(p.x, p.y - r);
          ctx.lineTo(p.x + r, p.y);
          ctx.lineTo(p.x, p.y + r);
          ctx.lineTo(p.x - r, p.y);
          ctx.closePath();
          ctx.fill();
        }
        for (let i = 0; i < 4; i += 1) {
          const angle = i * Math.PI / 2 + 0.35;
          const distance = 3 + t * 17;
          const x = p.x + Math.cos(angle) * distance;
          const y = p.y + Math.sin(angle) * distance * 0.65;
          line(ctx, [x, y], [x + Math.cos(angle) * 3, y + Math.sin(angle) * 2], rgba(GLOW.primary, 0.7));
        }
        for (const side of [-1, 1]) {
          ctx.fillStyle = rgba(HULL.mid, 0.25 * fade);
          ctx.fillRect(Math.round(p.x + side * (3 + t * 8)), Math.round(p.y - 4 - t * 10), 3, 3);
        }
        ctx.globalAlpha = 1;
      } else if (e.kind === 1) {
        ctx.fillStyle = rgba(GLOW.primary, fade * 0.8);
        ctx.fillRect(Math.round(p.x - 1), Math.round(p.y - 1), 3, 3);
      } else if (e.kind === 3) {
        ctx.fillStyle = rgba(GLOW.primary, fade * 0.5);
        ctx.fillRect(Math.round(p.x - 2), Math.round(p.y - 2), 4, 4);
      } else if (e.kind === 4) {
        ctx.strokeStyle = rgba(GLOW.function, fade * 0.5);
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 12 + t * 20, 6 + t * 10, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (e.kind === 5) {
        ctx.fillStyle = rgba(GLOW.danger, fade);
        ctx.fillRect(Math.round(p.x), Math.round(p.y - t * 14), 2, 2);
      } else {
        ctx.fillStyle = rgba(GLOW.primary, fade * 0.9);
        ctx.fillRect(Math.round(p.x - 1), Math.round(p.y - 1), 2, 2);
      }
    }
  }
}

/** Projected position of a camera-relative tile offset (shared by overlays). */
export function screenOf(cam: Camera, dx: number, dy: number): { x: number; y: number } {
  const p = project(dx, dy, 0);
  return { x: p.x + cam.ox, y: p.y + cam.oy };
}
