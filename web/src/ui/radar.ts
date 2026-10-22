/**
 * Tactical scan minimap -- **local**, radius {@link RADAR_RADIUS} tiles.
 *
 * There is no whole-planet radar any more: 10240 x 10240 tiles cannot be scanned
 * per frame, and "the whole map at once" stopped meaning anything once the world
 * became a torus. The instrument now paints the ground within 96 tiles of the
 * colony by sampling the streamed chunk store, and every blip is placed from a
 * **wrapped** offset -- a raider two tiles across the x = 0/10239 seam shows up
 * two tiles to the west of the colony, not on the far rim of the ellipse.
 *
 * Painted on a 2D canvas rather than as DOM so the sweep, orbital rings and blips
 * stay crisp and cheap. Colour discipline applies here too: the ground is status
 * green, water is a dim steel tone, lane traces / sweep / haulers are function
 * cyan, the colony is amber, and red is reserved for hostiles.
 *
 * Everything drawn is derived from the latest snapshot (plus static boot data and
 * the terrain lookup) -- the radar keeps no simulation state, only its own sweep
 * phase. The instrument chrome lives in `radar-chrome.ts`.
 */

import type { BootBlob } from '../generated/BootBlob';
import type { BuildingView } from '../generated/BuildingView';
import { BUILDING_KEYS } from '../generated/content-keys';
import type { HudView, TerrainLookup } from './hud-api';
import { PALETTE, rgba } from '../style/tokens';
import { deltaSpan } from '../render/torus';
import { RADAR_RADIUS, drawFrame, drawGrid, drawOrbits, drawSweep } from './radar-chrome';

export { RADAR_RADIUS };

const TAU = Math.PI * 2;

/** Chunks requested per frame while the scan area is still cold. */
const PREFETCH_PER_FRAME = 6;
/** Frames between repaints of the cached ground layer (it barely changes). */
const GROUND_REFRESH_FRAMES = 12;

/** Terrain materials that read as open water on a monochrome instrument. */
const WATER = new Set([4, 8, 9]);
/** Unbuildable, non-water ground that still belongs on the scan. */
const CRYSTAL = 7;

/** Building table index of the 3x3 command hub (`oc-content`). */
const HUB = BUILDING_KEYS.indexOf('command-hub');

/** The radar instrument. */
export class Radar {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly canvas: HTMLCanvasElement;
  private readonly worldW: number;
  private readonly worldH: number;
  private sweep = 0;
  private band = 0;
  private w = 0;
  private h = 0;
  /** Scan centre in wrapped tiles. `-1` until the first snapshot arrives. */
  private centreX = -1;
  private centreY = -1;
  /** Cursor over the chunk-grid steps of the scan disc. */
  private prefetchCursor = 0;
  /** Cached ground layer plus the frame it was painted on. */
  private ground: HTMLCanvasElement | null = null;
  private groundFrame = -1_000_000;
  private frames = 0;

  public constructor(
    private readonly boot: BootBlob,
    private readonly terrain: TerrainLookup | null,
  ) {
    this.worldW = boot.map.width;
    this.worldH = boot.map.height;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'oc-radar';
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('radar: no 2d context');
    this.ctx = ctx;
  }

  /** The element to mount. */
  public get element(): HTMLCanvasElement {
    return this.canvas;
  }

  /** Resize the backing store to the measured CSS box. */
  public resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.w = Math.max(120, Math.round(rect.width));
    this.h = Math.max(72, Math.round(rect.height));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // The ground layer is cached at the panel's device resolution; a resize
    // invalidates it.
    this.ground = null;
  }

  /** Repaint from the latest snapshot. */
  public draw(view: HudView, dtMs: number): void {
    if (this.w === 0) this.resize();
    const { ctx, w, h } = this;
    this.sweep = (this.sweep + dtMs * 0.00042) % TAU;
    this.band = (this.band + dtMs * 0.018) % (h + 40);
    this.frames += 1;

    const cx = w / 2;
    const cy = h * 0.53;
    const rx = w * 0.44;
    const ry = h * 0.37;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(0, 0, w, h);

    // Ground first, then the graticule over it: the range rings have to stay
    // readable on top of a fully loaded scan.
    this.trackCentre(view);
    this.drawGround(cx, cy, rx, ry);
    drawGrid(ctx, cx, cy, rx, ry);

    // Sweep band: a soft horizontal scan cross-section, echoing the reference
    // oscilloscope read without becoming a neon effect.
    const bandY = ((this.band % (h + 40)) - 20) / h;
    ctx.fillStyle = rgba(PALETTE.status, 0.035);
    ctx.fillRect(0, bandY * h, w, 2);
    ctx.fillStyle = rgba(PALETTE.status, 0.05);
    ctx.fillRect(0, bandY * h - 2, w, 1);

    drawOrbits(ctx, cx, cy, rx, ry, view);
    drawSweep(ctx, cx, cy, rx, ry, this.sweep);
    this.drawShips(cx, cy, rx, ry, view);
    this.drawBuildings(cx, cy, rx, ry, view);
    this.drawHostiles(cx, cy, rx, ry, view);
    drawFrame(ctx, w, h);
  }

  // ------------------------------------------------------------------ layers

  /**
   * Centre the scan on the command hub (or the planet's start tile).
   *
   * A change of centre asks the terrain store for the chunks covering the disc,
   * a few per frame, so the instrument fills in instead of stalling the frame.
   */
  private trackCentre(view: HudView): void {
    const hub = view.snapshot.buildings.find((b) => b.kind === HUB);
    const tx = hub ? hub.tx + 1 : this.boot.map.start_tx;
    const ty = hub ? hub.ty + 1 : this.boot.map.start_ty;
    if (tx !== this.centreX || ty !== this.centreY) {
      this.centreX = tx;
      this.centreY = ty;
      this.prefetchCursor = 0;
    }
    this.prefetchStep();
  }

  /** Ask the terrain store for the chunks covering the scan disc, a few a frame. */
  private prefetchStep(): void {
    const terrain = this.terrain;
    if (!terrain || this.centreX < 0) return;
    const edge = Math.max(1, this.boot.map.chunk_size);
    const span = RADAR_RADIUS * 2;
    const stepsX = Math.floor(span / edge) * 2 + 1;
    const total = stepsX * stepsX;
    for (let n = 0; n < PREFETCH_PER_FRAME; n += 1) {
      const i = this.prefetchCursor % total;
      this.prefetchCursor = (this.prefetchCursor + 1) % total;
      const ox = -span + (i % stepsX) * edge;
      const oy = -span + Math.floor(i / stepsX) * edge;
      terrain.ensure(this.centreX + ox, this.centreY + oy);
    }
  }

  /**
   * Blit the cached ground layer, repainting it only when it can have changed.
   *
   * The scan disc is ~900 fills of 1px dots. That is affordable once, but not 60
   * times a second: the ground only changes when the scan centre moves or the
   * world streamer delivers a chunk, so it is baked into its own canvas and
   * refreshed on a slow tick.
   */
  private drawGround(cx: number, cy: number, rx: number, ry: number): void {
    const stale = !this.ground || this.centreX < 0 || this.frames - this.groundFrame > GROUND_REFRESH_FRAMES;
    if (stale) {
      this.paintGround(cx, cy, rx, ry);
      this.groundFrame = this.frames;
    }
    if (this.ground) this.ctx.drawImage(this.ground, 0, 0, this.w, this.h);
  }

  /** Repaint the offscreen ground layer. */
  private paintGround(cx: number, cy: number, rx: number, ry: number): void {
    let canvas = this.ground;
    if (!canvas || canvas.width !== this.canvas.width || canvas.height !== this.canvas.height) {
      canvas = document.createElement('canvas');
      canvas.width = this.canvas.width;
      canvas.height = this.canvas.height;
      this.ground = canvas;
    }
    const g = canvas.getContext('2d');
    if (!g) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawTerrain(g, cx, cy, rx, ry);
  }

  /**
   * Top-down sample of the local ground from the chunk store.
   *
   * Sampled in **panel space** (a 3px dot lattice clipped to the range ellipse)
   * rather than in tile space: a tile-space lattice stretches with the iso
   * aspect and turns the scan into vertical dotted columns.
   */
  private drawTerrain(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    rx: number,
    ry: number,
  ): void {
    const terrain = this.terrain;
    if (!terrain || this.centreX < 0) return;
    const land = rgba(PALETTE.status, 0.3);
    const coast = rgba(PALETTE.status, 0.16);
    const sea = rgba(PALETTE.lineBright, 0.2);
    const crystal = rgba(PALETTE.function, 0.22);
    for (let py = Math.ceil(cy - ry); py <= cy + ry; py += 3) {
      const ny = (py - cy) / ry;
      for (let px = Math.ceil(cx - rx); px <= cx + rx; px += 3) {
        const nx = (px - cx) / rx;
        if (nx * nx + ny * ny > 1) continue;
        // One panel radius is one scan radius, so the ellipse is the range ring.
        const tx = Math.round(this.centreX + nx * RADAR_RADIUS);
        const ty = Math.round(this.centreY + ny * RADAR_RADIUS);
        const m = terrain.material(tx, ty);
        if (m < 0) continue;
        if (WATER.has(m)) ctx.fillStyle = m === 9 ? sea : coast;
        else if (m === CRYSTAL) ctx.fillStyle = crystal;
        else ctx.fillStyle = land;
        ctx.fillRect(px, py, 1, 1);
      }
    }
  }

  /**
   * Wrapped offset of a world position from the scan centre, in tiles.
   *
   * Everything on this instrument goes through here, which is the whole point of
   * the local scan: a blip always appears on the side of the ellipse the world
   * actually wraps towards.
   */
  private offset(tx: number, ty: number): { readonly dx: number; readonly dy: number } {
    return {
      dx: deltaSpan(this.centreX, tx, this.worldW),
      dy: deltaSpan(this.centreY, ty, this.worldH),
    };
  }

  /** Project a wrapped world position onto the disc, or `null` when out of range. */
  private blip(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    tx: number,
    ty: number,
  ): readonly [number, number] | null {
    const { dx, dy } = this.offset(tx, ty);
    if (Math.abs(dx) > RADAR_RADIUS || Math.abs(dy) > RADAR_RADIUS) return null;
    return [
      Math.round(cx + (dx / RADAR_RADIUS) * rx),
      Math.round(cy + (dy / RADAR_RADIUS) * ry),
    ] as const;
  }

  private drawShips(cx: number, cy: number, rx: number, ry: number, view: HudView): void {
    const { ctx } = this;
    for (const s of view.snapshot.orbital.ships) {
      if (s.owner !== 1) continue;
      // High-altitude contacts sit on the orbital shells; descending dropships
      // are projected onto the ground footprint.
      if (s.z > 1400) {
        const angle = (s.id * 1.7 + view.snapshot.tick * 0.0009) % TAU;
        const k = 0.6 + Math.min(1, s.z / 4200) * 0.3;
        const px = cx + Math.cos(angle) * rx * k;
        const py = cy - ry * 0.34 + Math.sin(angle) * ry * k * 0.55;
        ctx.fillStyle = PALETTE.danger;
        ctx.fillRect(Math.round(px) - 1, Math.round(py) - 1, 2, 2);
      } else {
        const p = this.blip(cx, cy, rx, ry, s.x / 1024, s.y / 1024);
        if (!p) continue;
        ctx.fillStyle = PALETTE.danger;
        ctx.fillRect(p[0], p[1], 2, 2);
      }
    }
  }

  private drawBuildings(cx: number, cy: number, rx: number, ry: number, view: HudView): void {
    const { ctx } = this;
    const selected = view.selection.id;
    const size = (b: BuildingView): number => this.boot.catalog.buildings[b.kind]?.footprint ?? 1;
    const at = (b: BuildingView): readonly [number, number] | null =>
      this.blip(cx, cy, rx, ry, b.tx + size(b) / 2, b.ty + size(b) / 2);
    const hub = view.snapshot.buildings.find((b) => b.kind === HUB);
    const home = hub ? at(hub) : null;
    // Colony footprint: faint amber spokes from the hub plus an amber cluster
    // of structure blips, so "where is home" reads at a glance.
    for (const b of view.snapshot.buildings) {
      if (b.kind === HUB || !home) continue;
      const p = at(b);
      if (!p) continue;
      ctx.strokeStyle = rgba(PALETTE.primary, 0.12);
      ctx.beginPath();
      ctx.moveTo(home[0], home[1]);
      ctx.lineTo(p[0], p[1]);
      ctx.stroke();
    }
    for (const b of view.snapshot.buildings) {
      const p = at(b);
      if (!p) continue;
      if (b.kind === HUB) {
        ctx.fillStyle = PALETTE.primary;
        ctx.fillRect(p[0] - 2, p[1] - 2, 5, 5);
      } else {
        ctx.fillStyle = rgba(PALETTE.primary, 0.82);
        ctx.fillRect(p[0] - 1, p[1] - 1, 3, 3);
      }
      if (b.id === selected) {
        ctx.strokeStyle = PALETTE.primary;
        ctx.strokeRect(p[0] - 4.5, p[1] - 4.5, 9, 9);
        ctx.strokeStyle = rgba(PALETTE.primary, 0.45);
        ctx.strokeRect(p[0] - 6.5, p[1] - 6.5, 13, 13);
      }
    }
  }

  private drawHostiles(cx: number, cy: number, rx: number, ry: number, view: HudView): void {
    const { ctx } = this;
    for (const u of view.snapshot.units) {
      if (u.owner !== 1) continue;
      const p = this.blip(cx, cy, rx, ry, u.x / 1024, u.y / 1024);
      if (!p) continue;
      ctx.fillStyle = PALETTE.danger;
      ctx.fillRect(p[0] - 1, p[1] - 1, 3, 3);
    }
  }
}
