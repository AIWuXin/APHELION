/**
 * Tactical scan instrument chrome: the grid, the range rings, the sweep, the
 * orbital shells and the bezel.
 *
 * Split out of `radar.ts` so the blip logic stays one screenful. Everything here
 * is stateless: the radar passes its own sweep phase and measured geometry in,
 * which keeps the animation clock owned by a single class.
 *
 * Colour discipline applies on the instrument too: the grid is status green, the
 * sweep and the lane traces are function cyan, and neutrals come from the ink
 * ramp.
 */

import type { HudView } from './hud-api';
import { FONT, rgba } from '../style/tokens';
import { RADAR_PALETTE as PALETTE } from './radar-palette';

const TAU = Math.PI * 2;

/** Scan radius in tiles. Local by design: see `radar.ts`. */
export const RADAR_RADIUS = 96;

/** Range rings, radial spokes, crosshair, ticks and the range labels. */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): void {
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

  // Range ring labels along the upper-left diagonal, where there is room and
  // the sweep does not wash over them every revolution. The local scan is
  // measured in tiles now, not in the old full-map kilometres.
  ctx.font = `8px ${FONT.mono}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  for (let i = 1; i <= 3; i += 1) {
    const k = i / 3;
    const px = cx - Math.cos(Math.PI / 4) * rx * k;
    const py = cy - Math.sin(Math.PI / 4) * ry * k;
    ctx.fillStyle = rgba(PALETTE.lineBright, 0.7);
    ctx.fillRect(Math.round(px), Math.round(py), 3, 1);
    ctx.fillStyle = rgba(PALETTE.ink3, 0.95);
    ctx.fillText(`${Math.round((RADAR_RADIUS * i) / 3)}T`, Math.round(px) - 3, Math.round(py) - 1);
  }
}

/** The two dashed orbital shells plus one hauler node per lane. */
export function drawOrbits(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  view: HudView,
): void {
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

  const routes = view.snapshot.orbital.routes.length;
  for (let i = 0; i < routes; i += 1) {
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

/** The radar sweep: three trailing wedges plus the leading line. */
export function drawSweep(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  lead: number,
): void {
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

/** Corner brackets of the instrument bezel. */
export function drawFrame(ctx: CanvasRenderingContext2D, w: number, h: number): void {
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
