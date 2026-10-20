/**
 * World renderer.
 *
 * Draw order (painter's algorithm, single pass per layer):
 *   1. baked terrain blit
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
 */

import type { BootBlob } from '../generated/BootBlob';
import type { ShipView } from '../generated/ShipView';
import type { UnitView } from '../generated/UnitView';
import { BUILDING_KEYS, UNIT_KEYS } from '../generated/content-keys';
import { METRICS, PALETTE, TILE, rgba } from '../style/tokens';
import type { Frame } from './frame';
import { toScreen, type Camera } from './iso';
import { line } from './primitives';
import { drawAirShadows, drawInteraction, drawRouteTraces } from './overlays';
import { BUILDING_PAINTERS } from './sprites/buildings';
import { SHIP_PAINTERS, UNIT_PAINTERS } from './sprites/units';
import { TerrainLayer } from './terrain-layer';
import { GLOW } from './world-palette';

const HW = TILE.w / 2;
const HH = TILE.h / 2;

/** One thing to draw, with its sort key. */
interface Drawable {
  /** Larger draws later (in front). */
  readonly depth: number;
  readonly draw: () => void;
}

/** Index a snapshot array by entity id for interpolation lookups. */
function indexById<T extends { readonly id: number }>(items: readonly T[]): Map<number, T> {
  const map = new Map<number, T>();
  for (const item of items) map.set(item.id, item);
  return map;
}

/** Linear blend between the previous and current world position. */
function blend(
  prev: UnitView | ShipView | undefined,
  cur: UnitView | ShipView,
  alpha: number,
): { x: number; y: number; z: number } {
  if (!prev) return { x: cur.x, y: cur.y, z: cur.z };
  const t = Math.max(0, Math.min(1, alpha));
  return {
    x: prev.x + (cur.x - prev.x) * t,
    y: prev.y + (cur.y - prev.y) * t,
    z: prev.z + (cur.z - prev.z) * t,
  };
}

/** The Canvas world layer. */
export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private terrain: TerrainLayer | null = null;
  private dpr = 1;
  private width = 0;
  private height = 0;

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

  /** Bake the planet once the boot blob arrives. */
  public setBoot(boot: BootBlob): void {
    this.terrain = new TerrainLayer(boot.map);
  }

  /** Centre the camera so the colony (map centre) sits in the middle of the viewport. */
  public static initialCamera(boot: BootBlob, width: number, height: number): Camera {
    // The command rail covers the right edge, so frame the colony inside the
    // free (world) part of the viewport. The projection puts the map centre
    // diamond at ((cx-cy)*HW, (cx+cy)*HH) -- not at half the diamond's bbox.
    const freeWidth = Math.max(320, width - METRICS.railW);
    const colX = boot.map.w / 2;
    const colY = boot.map.h / 2;
    const sx = (colX - colY) * HW;
    const sy = (colX + colY) * HH;
    return { x: Math.round(freeWidth / 2 - sx), y: Math.round(height / 2 - sy - 30), width, height };
  }

  /** Render one frame. */
  public draw(frame: Frame): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = PALETTE.void;
    ctx.fillRect(0, 0, this.width, this.height);
    if (!this.terrain) return;

    const cam = frame.camera;
    const alpha = frame.alpha;
    this.terrain.draw(ctx, cam.x, cam.y);

    // Ground-plane guides go under every object so structures occlude them.
    drawRouteTraces(ctx, frame);

    const ground: Drawable[] = [];
    const air: Drawable[] = [];
    const sky: Drawable[] = [];
    const env = { ctx, time: frame.time, tile: TILE.w };
    const prevUnits = indexById(frame.previous.units);
    const prevShips = indexById(frame.previous.orbital.ships);

    // ---- buildings (static) -------------------------------------------
    for (const b of frame.snapshot.buildings) {
      const def = frame.boot.catalog.buildings[b.kind];
      if (!def) continue;
      const size = def.footprint;
      const anchor = toScreen(cam, b.tx + size / 2, b.ty + size / 2, 0);
      const painter = BUILDING_PAINTERS[BUILDING_KEYS[b.kind] ?? 'command-hub'];
      ground.push({
        depth: (b.tx + b.ty + size) * 2,
        draw: () => {
          painter(env, anchor.x, anchor.y, b, def);
          if (b.hp < b.hp_max) this.health(anchor.x, anchor.y - (size === 2 ? 92 : 76), b.hp, b.hp_max);
        },
      });
    }

    // ---- ground and low-air units (interpolated) ------------------------
    for (const u of frame.snapshot.units) {
      const def = frame.boot.catalog.units[u.kind];
      if (!def) continue;
      const painter = UNIT_PAINTERS[UNIT_KEYS[u.kind] ?? 'raider'];
      const p = blend(prevUnits.get(u.id), u, alpha);
      const screen = toScreen(cam, p.x / 1024, p.y / 1024, p.z / 1024);
      const depth = p.x / 1024 + p.y / 1024 + (p.z > 140 ? 0.5 : 0);
      const target = p.z > 140 ? air : ground;
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
      const p = blend(prevShips.get(s.id), s, alpha);
      const screen = toScreen(cam, p.x / 1024, p.y / 1024, p.z / 1024);
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
      const a = toScreen(cam, b.x0 / 1024, b.y0 / 1024, b.z0 / 1024);
      const c = toScreen(cam, b.x1 / 1024, b.y1 / 1024, b.z1 / 1024);
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
      const p = toScreen(cam, e.x / 1024, e.y / 1024, e.z / 1024);
      const t = e.life > 0 ? Math.min(1, e.age / e.life) : 1;
      const fade = 1 - t;
      if (e.kind === 2) {
        // Explosion: expanding hard-edged diamonds.
        const r = 6 + t * 22;
        ctx.globalAlpha = fade * 0.9;
        for (let i = 0; i < 3; i += 1) {
          const rr = r * (1 - i * 0.22);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y - rr);
          ctx.lineTo(p.x + rr, p.y);
          ctx.lineTo(p.x, p.y + rr);
          ctx.lineTo(p.x - rr, p.y);
          ctx.closePath();
          ctx.fillStyle = i === 0 ? rgba(GLOW.primary, 0.5) : rgba('#ffffff', 0.18);
          ctx.fill();
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
