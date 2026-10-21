/**
 * Tactical scan minimap.
 *
 * Painted on a 2D canvas rather than as DOM so the sweep, orbital rings and
 * blips stay crisp and cheap. Colour discipline applies here too: the ground
 * grid is status green, lane traces / sweep / haulers are function cyan, the
 * colony is amber, and red is reserved for hostiles.
 *
 * Everything drawn is derived from the latest snapshot (plus static boot data)
 * -- the radar keeps no simulation state, only its own sweep phase.
 */

import type { BootBlob } from '../generated/BootBlob';
import type { HudView } from './hud-api';
import { FONT, PALETTE, rgba } from '../style/tokens';

const TAU = Math.PI * 2;

/** The radar instrument. */
export class Radar {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly canvas: HTMLCanvasElement;
  private readonly routes: number;
  private sweep = 0;
  private band = 0;
  private w = 0;
  private h = 0;

  public constructor(private readonly boot: BootBlob) {
    this.routes = boot.catalog.routes.length;
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
  }

  /** Repaint from the latest snapshot. */
  public draw(view: HudView, dtMs: number): void {
    if (this.w === 0) this.resize();
    const { ctx, w, h } = this;
    this.sweep = (this.sweep + dtMs * 0.00042) % TAU;
    this.band = (this.band + dtMs * 0.018) % (h + 40);

    const cx = w / 2;
    const cy = h * 0.53;
    const rx = w * 0.44;
    const ry = h * 0.37;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(0, 0, w, h);

    this.drawGrid(cx, cy, rx, ry);

    // Sweep band: a soft horizontal scan cross-section, echoing the reference
    // oscilloscope read without becoming a neon effect.
    const bandY = ((this.band % (h + 40)) - 20) / h;
    ctx.fillStyle = rgba(PALETTE.status, 0.035);
    ctx.fillRect(0, bandY * h, w, 2);
    ctx.fillStyle = rgba(PALETTE.status, 0.05);
    ctx.fillRect(0, bandY * h - 2, w, 1);

    this.drawTerrain(cx, cy, rx, ry);
    this.drawOrbits(cx, cy, rx, ry, view);
    this.drawSweep(cx, cy, rx, ry);
    this.drawShips(cx, cy, rx, ry, view);
    this.drawBuildings(cx, cy, rx, ry, view);
    this.drawHostiles(cx, cy, rx, ry, view);
    this.drawFrame(w, h);
  }

  // ------------------------------------------------------------------ layers

  private drawGrid(cx: number, cy: number, rx: number, ry: number): void {
    const { ctx } = this;
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i += 1) {
      const k = i / 3;
      ctx.strokeStyle = rgba(PALETTE.status, 0.08 + i * 0.03);
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx * k, ry * k, 0, 0, TAU);
      ctx.stroke();
    }
    // Radial spokes.
    ctx.strokeStyle = rgba(PALETTE.status, 0.06);
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * TAU;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * rx * 0.12, cy + Math.sin(a) * ry * 0.12);
      ctx.lineTo(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
      ctx.stroke();
    }
    // Crosshair on the major axes.
    ctx.strokeStyle = rgba(PALETTE.status, 0.12);
    ctx.beginPath();
    ctx.moveTo(cx - rx, cy);
    ctx.lineTo(cx + rx, cy);
    ctx.moveTo(cx, cy - ry);
    ctx.lineTo(cx, cy + ry);
    ctx.stroke();

    // Range ticks around the outer ellipse, every 15 degrees.
    ctx.strokeStyle = rgba(PALETTE.lineBright, 0.26);
    for (let i = 0; i < 18; i += 1) {
      const a = (i / 18) * TAU;
      const len = i % 3 === 0 ? 4 : 2;
      const x0 = cx + Math.cos(a) * rx;
      const y0 = cy + Math.sin(a) * ry;
      const x1 = cx + Math.cos(a) * (rx - len);
      const y1 = cy + Math.sin(a) * (ry - len * 0.6);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }

    // Range ring labels (2 / 4 / 6 km) along the upper-left diagonal, where
    // there is room and the sweep does not wash over them every revolution.
    ctx.font = `8px ${FONT.mono}`;
    ctx.fillStyle = rgba(PALETTE.ink3, 0.95);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    for (let i = 1; i <= 3; i += 1) {
      const k = i / 3;
      const px = cx - Math.cos(Math.PI / 4) * rx * k;
      const py = cy - Math.sin(Math.PI / 4) * ry * k;
      ctx.fillStyle = rgba(PALETTE.lineBright, 0.7);
      ctx.fillRect(Math.round(px), Math.round(py), 3, 1);
      ctx.fillStyle = rgba(PALETTE.ink3, 0.95);
      ctx.fillText(`${i * 2}KM`, Math.round(px) - 3, Math.round(py) - 1);
    }
  }

  private drawTerrain(cx: number, cy: number, rx: number, ry: number): void {
    const { ctx } = this;
    const map = this.boot.map;
    const step = Math.max(1, Math.floor(map.w / 46));
    ctx.fillStyle = rgba(PALETTE.status, 0.3);
    for (let ty = 0; ty < map.h; ty += step) {
      for (let tx = 0; tx < map.w; tx += step) {
        const m = map.material[ty * map.w + tx] ?? 0;
        if (m === 4 || m === 7) continue;
        const nx = (tx + 0.5) / map.w - 0.5;
        const ny = (ty + 0.5) / map.h - 0.5;
        const px = cx + nx * rx * 1.82;
        const py = cy + ny * ry * 1.82;
        ctx.fillRect(Math.round(px), Math.round(py), 1, 1);
      }
    }
    // Colony reticle at the world centre.
    ctx.strokeStyle = rgba(PALETTE.primary, 0.5);
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy);
    ctx.lineTo(cx - 1, cy);
    ctx.moveTo(cx + 1, cy);
    ctx.lineTo(cx + 4, cy);
    ctx.moveTo(cx, cy - 4);
    ctx.lineTo(cx, cy - 1);
    ctx.moveTo(cx, cy + 1);
    ctx.lineTo(cx, cy + 4);
    ctx.stroke();
  }

  private drawOrbits(cx: number, cy: number, rx: number, ry: number, view: HudView): void {
    const { ctx } = this;
    const oy = cy - ry * 0.34;
    ctx.setLineDash([2, 3]);
    ctx.lineWidth = 1;
    for (let i = 0; i < 2; i += 1) {
      const rx2 = rx * (0.6 + i * 0.26);
      const ry2 = ry * (0.19 + i * 0.1);
      ctx.strokeStyle = rgba(PALETTE.function, 0.16 + i * 0.05);
      ctx.beginPath();
      ctx.ellipse(cx, oy, rx2, ry2, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // One hauler node per lane, positioned by the snapshot's run progress.
    for (let i = 0; i < this.routes; i += 1) {
      const state = view.snapshot.orbital.routes[i];
      if (!state) continue;
      const ring = i % 2;
      const rx2 = rx * (0.6 + ring * 0.26);
      const ry2 = ry * (0.19 + ring * 0.1);
      const angle = (state.progress / 1000) * TAU + i * 2.1 + view.snapshot.tick * 0.0002;
      const px = cx + Math.cos(angle) * rx2;
      const py = oy + Math.sin(angle) * ry2;
      ctx.fillStyle = state.active ? PALETTE.function : rgba(PALETTE.ink3, 0.8);
      ctx.fillRect(Math.round(px) - 1, Math.round(py) - 1, 2, 2);
      if (state.active) {
        ctx.strokeStyle = rgba(PALETTE.function, 0.25);
        ctx.beginPath();
        ctx.moveTo(cx, oy);
        ctx.lineTo(px, py);
        ctx.stroke();
      }
    }
  }

  private drawSweep(cx: number, cy: number, rx: number, ry: number): void {
    const { ctx } = this;
    const lead = this.sweep;
    for (let i = 2; i >= 0; i -= 1) {
      const a0 = lead - i * 0.16;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
      grad.addColorStop(0, rgba(PALETTE.function, 0));
      grad.addColorStop(0.45, rgba(PALETTE.function, 0.1 + (2 - i) * 0.08));
      grad.addColorStop(1, rgba(PALETTE.function, 0.24 + (2 - i) * 0.16));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.ellipse(cx, cy, rx, ry, 0, a0, a0 + 0.24);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = rgba(PALETTE.function, 0.8);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(lead) * rx, cy + Math.sin(lead) * ry);
    ctx.stroke();
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
        const nx = s.x / 1024 / this.boot.map.w - 0.5;
        const ny = s.y / 1024 / this.boot.map.h - 0.5;
        ctx.fillStyle = PALETTE.danger;
        ctx.fillRect(Math.round(cx + nx * rx * 1.82), Math.round(cy + ny * ry * 1.82), 2, 2);
      }
    }
  }

  private drawBuildings(cx: number, cy: number, rx: number, ry: number, view: HudView): void {
    const { ctx } = this;
    const map = this.boot.map;
    const selected = view.selection.id;
    const project = (tx: number, ty: number, size = 1): readonly [number, number] => {
      const nx = (tx + size / 2) / map.w - 0.5;
      const ny = (ty + size / 2) / map.h - 0.5;
      return [Math.round(cx + nx * rx * 1.82), Math.round(cy + ny * ry * 1.82)];
    };
    // Footprints differ (the 3x3 command hub next to 1x1 guns and 2x2 pads), so
    // every blip is projected from the centre of its own footprint.
    const at = (tx: number, ty: number, kind: number): readonly [number, number] =>
      project(tx, ty, this.boot.catalog.buildings[kind]?.footprint ?? 1);
    const hq = view.snapshot.buildings.find((b) => b.kind === 0);
    const home = hq ? at(hq.tx, hq.ty, hq.kind) : [cx, cy] as const;
    // Colony footprint: faint amber spokes from the hub plus an amber cluster
    // of structure blips, so "where is home" reads at a glance.
    for (const b of view.snapshot.buildings) {
      if (b.kind === 0) continue;
      const [px, py] = at(b.tx, b.ty, b.kind);
      ctx.strokeStyle = rgba(PALETTE.primary, 0.12);
      ctx.beginPath();
      ctx.moveTo(home[0], home[1]);
      ctx.lineTo(px, py);
      ctx.stroke();
    }
    for (const b of view.snapshot.buildings) {
      const [px, py] = at(b.tx, b.ty, b.kind);
      if (b.kind === 0) {
        ctx.fillStyle = PALETTE.primary;
        ctx.fillRect(px - 2, py - 2, 5, 5);
      } else {
        ctx.fillStyle = rgba(PALETTE.primary, 0.82);
        ctx.fillRect(px - 1, py - 1, 3, 3);
      }
      if (b.id === selected) {
        ctx.strokeStyle = PALETTE.primary;
        ctx.strokeRect(px - 4.5, py - 4.5, 9, 9);
        ctx.strokeStyle = rgba(PALETTE.primary, 0.45);
        ctx.strokeRect(px - 6.5, py - 6.5, 13, 13);
      }
    }
  }

  private drawHostiles(cx: number, cy: number, rx: number, ry: number, view: HudView): void {
    const { ctx } = this;
    for (const u of view.snapshot.units) {
      if (u.owner !== 1) continue;
      const nx = u.x / 1024 / this.boot.map.w - 0.5;
      const ny = u.y / 1024 / this.boot.map.h - 0.5;
      ctx.fillStyle = PALETTE.danger;
      ctx.fillRect(Math.round(cx + nx * rx * 1.82) - 1, Math.round(cy + ny * ry * 1.82) - 1, 3, 3);
    }
  }

  private drawFrame(w: number, h: number): void {
    const { ctx } = this;
    ctx.strokeStyle = rgba(PALETTE.lineBright, 0.55);
    ctx.lineWidth = 1;
    const c = 7;
    ctx.beginPath();
    ctx.moveTo(0.5, c);
    ctx.lineTo(0.5, 0.5);
    ctx.lineTo(c, 0.5);
    ctx.moveTo(w - c, 0.5);
    ctx.lineTo(w - 0.5, 0.5);
    ctx.lineTo(w - 0.5, c);
    ctx.moveTo(w - 0.5, h - c);
    ctx.lineTo(w - 0.5, h - 0.5);
    ctx.lineTo(w - c, h - 0.5);
    ctx.moveTo(c, h - 0.5);
    ctx.lineTo(0.5, h - 0.5);
    ctx.lineTo(0.5, h - c);
    ctx.stroke();
  }
}
