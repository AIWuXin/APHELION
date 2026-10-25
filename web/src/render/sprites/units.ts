/**
 * Unit and craft art.
 *
 * Every painter first lays down a near-black silhouette pass and then paints
 * the lit body on top: that 1px dark outline is what makes a 20px craft pop
 * against a loud patchwork terrain. Silhouettes are deliberately distinct
 * (squat walker, tall siege frame, wide lifting body, delta wing, boxy shuttle,
 * long hostile hull, tiny drone). Ceramic/cyan player markers and dark-red
 * hostile markers identify faction without filling the screen with glow.
 */

import type { UnitKey } from '../../generated/content-keys';
import type { CraftView, ShipPainter, UnitPainter } from '../sprite-contract';
import { box, contactShadow } from '../primitives';
import { rgba } from '../../style/tokens';
import { ENEMY, GLOW, HULL, darken } from '../world-palette';

/** Near-black used for the 1px outline pass. */
const INK = '#0a0e0f';

/** A box with a 1px dark outline around its silhouette. */
function outlinedBox(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  height: number,
  base: string,
  rim = true,
): void {
  box(ctx, cx, cy + 0.5, rx + 0.65, ry + 0.45, height + 0.7, {
    base: INK,
    rim: false,
    seam: false,
  });
  box(ctx, cx, cy, rx, ry, height, { base, rim, seam: true });
}

/** A stroked line with a 1px dark outline. */
function outlinedLine(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
  color: string,
): void {
  ctx.strokeStyle = INK;
  ctx.lineWidth = width + 2;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

/** A filled polygon with a 1px dark outline. */
function outlinedPoly(
  ctx: CanvasRenderingContext2D,
  pts: readonly (readonly [number, number])[],
  color: string,
): void {
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
  ctx.closePath();
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fill();
}

/** Faction paints: hostile keys use ENEMY red, player hulls use ceramic white. */
function faction(view: CraftView): { plate: string; dark: string; glow: string } {
  const hostile =
    view.kind === 0 || view.kind === 1 || view.kind === 2 || view.kind === 5 || view.owner === 1;
  return hostile
    ? { plate: ENEMY.plate, dark: ENEMY.dark, glow: GLOW.danger }
    : { plate: HULL.plate, dark: HULL.dark, glow: GLOW.function };
}

/** Base contact shadow before the outline pass. */
function seat(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number): void {
  contactShadow(ctx, cx, cy + 2, rx * 1.15, rx * 0.5, 0.38);
}

/** Squat hostile walker: splayed legs, low hull, red visor. */
const paintRaider: UnitPainter = (env, cx, cy, view) => {
  const { ctx, time } = env;
  const f = faction(view);
  seat(ctx, cx, cy, 9);
  const step = view.state === 1 ? Math.round(Math.sin(time / 110) * 2) : 0;
  outlinedLine(ctx, cx - 6, cy - 4, cx - 9 + step, cy + 4, 2, f.dark);
  outlinedLine(ctx, cx + 6, cy - 4, cx + 9 - step, cy + 4, 2, f.dark);
  outlinedBox(ctx, cx, cy - 6, 9, 4.5, 7, f.plate);
  outlinedBox(ctx, cx + 5, cy - 12, 4, 2.2, 5, darken(f.plate, 0.86), false);
  outlinedLine(ctx, cx - 7, cy - 11, cx - 11, cy - 17, 1, f.dark);
  // Red visor + antenna tip.
  ctx.fillStyle = rgba(f.glow, 0.95);
  ctx.fillRect(Math.round(cx - 2), Math.round(cy - 11), 3, 2);
  ctx.fillStyle = rgba(f.glow, Math.sin(time / 300) > 0 ? 0.9 : 0.3);
  ctx.fillRect(Math.round(cx - 11), Math.round(cy - 18), 1, 1);
};

/** Tall hostile siege frame: long cannon, four legs, red sensor. */
const paintSiege: UnitPainter = (env, cx, cy, view) => {
  const { ctx, time } = env;
  const f = faction(view);
  seat(ctx, cx, cy, 13);
  const step = view.state === 1 ? Math.round(Math.sin(time / 160) * 2) : 0;
  for (const dx of [-8, 8]) {
    outlinedLine(ctx, cx + dx * 0.6, cy - 6, cx + dx + step, cy + 4, 2, f.dark);
  }
  outlinedBox(ctx, cx, cy - 12, 10, 5, 14, f.plate);
  outlinedBox(ctx, cx, cy - 24, 7, 3.5, 6, darken(f.plate, 0.9), false);
  // Cannon: thick outlined barrel aimed down-range.
  outlinedLine(ctx, cx + 4, cy - 22, cx + 22, cy - 28, 3, f.dark);
  ctx.fillStyle = f.dark;
  ctx.fillRect(Math.round(cx + 21), Math.round(cy - 30), 4, 4);
  const pulse = 0.5 + 0.5 * Math.sin(time / 420);
  ctx.fillStyle = rgba(f.glow, 0.35 + pulse * 0.55);
  ctx.fillRect(Math.round(cx - 3), Math.round(cy - 21), 6, 2);
  ctx.fillStyle = rgba(f.glow, sinOn(time) ? 0.9 : 0.3);
  ctx.fillRect(Math.round(cx + 22), Math.round(cy - 30), 2, 2);
};

/** Wide hostile lifting body; red belly light while dropping. */
const paintDropship: UnitPainter = (env, cx, cy, view) => {
  const { ctx, time } = env;
  const f = faction(view);
  const bob = Math.round(Math.sin(time / 520) * 1.5);
  seat(ctx, cx, cy, 15);
  outlinedBox(ctx, cx, cy - 6 + bob, 14, 7, 6, f.plate);
  outlinedBox(ctx, cx - 16, cy - 1 + bob, 5, 3, 4, f.dark, false);
  outlinedBox(ctx, cx + 16, cy - 1 + bob, 5, 3, 4, f.dark, false);
  // Cockpit notch + belly light (blinks while descending).
  ctx.fillStyle = f.dark;
  ctx.fillRect(Math.round(cx - 4), Math.round(cy - 10 + bob), 8, 2);
  const descending = view.state === 2 || view.z > 0;
  const on = descending ? Math.sin(time / 180) > 0 : Math.sin(time / 900) > -0.6;
  ctx.fillStyle = rgba(f.glow, on ? 0.95 : 0.25);
  ctx.fillRect(Math.round(cx - 5), Math.round(cy - 3 + bob), 10, 1);
  ctx.fillStyle = rgba(f.glow, 0.35);
  ctx.fillRect(Math.round(cx - 3), Math.round(cy - 1 + bob), 6, 1);
};

/** Player delta-wing interceptor: amber engine, tiny hull. */
const paintInterceptor: UnitPainter = (env, cx, cy, view) => {
  const { ctx, time } = env;
  const bob = view.z > 0 ? Math.round(Math.sin(time / 380)) : 0;
  seat(ctx, cx, cy, 11);
  outlinedPoly(
    ctx,
    [
      [cx, cy - 15 + bob],
      [cx + 14, cy + 2 + bob],
      [cx, cy - 3 + bob],
    ],
    HULL.mid,
  );
  outlinedPoly(
    ctx,
    [
      [cx, cy - 15 + bob],
      [cx - 14, cy + 2 + bob],
      [cx, cy - 3 + bob],
    ],
    HULL.plate,
  );
  outlinedBox(ctx, cx, cy - 9 + bob, 3, 2, 5, HULL.plate, false);
  ctx.fillStyle = rgba(GLOW.function, 0.85);
  ctx.fillRect(Math.round(cx - 5), Math.round(cy - 4 + bob), 2, 1);
  ctx.fillRect(Math.round(cx + 4), Math.round(cy - 4 + bob), 2, 1);
  // Amber engine: flicker + a 2px exhaust trail.
  const flick = 0.45 + Math.sin(time / 70) * 0.2 + (view.state === 1 ? 0.2 : 0);
  ctx.fillStyle = rgba(GLOW.primary, Math.min(1, flick));
  ctx.fillRect(Math.round(cx - 2), Math.round(cy + 1 + bob), 4, 3);
  ctx.fillStyle = rgba(GLOW.primary, 0.22);
  ctx.fillRect(Math.round(cx - 1), Math.round(cy + 4 + bob), 2, 4);
};

/** Player boxy cargo shuttle with cyan running lights. */
const paintHauler: UnitPainter = (env, cx, cy) => {
  const { ctx } = env;
  const f = { plate: HULL.plate, dark: HULL.dark };
  outlinedBox(ctx, cx, cy - 5, 10, 5, 6, f.plate);
  outlinedBox(ctx, cx - 2, cy - 12, 6, 3, 4, HULL.mid, false);
  outlinedBox(ctx, cx + 12, cy - 3, 4, 2.5, 3, f.dark, false);
  outlinedBox(ctx, cx - 12, cy - 3, 4, 2.5, 3, f.dark, false);
  ctx.fillStyle = rgba(GLOW.function, 0.85);
  ctx.fillRect(Math.round(cx - 8), Math.round(cy - 1), 3, 1);
  ctx.fillRect(Math.round(cx + 6), Math.round(cy - 1), 3, 1);
  ctx.fillStyle = rgba(GLOW.function, 0.3);
  ctx.fillRect(Math.round(cx - 11), Math.round(cy + 1), 3, 1);
};

/** Long hostile orbital hull with red lights and turret bumps. */
const paintWarship: UnitPainter = (env, cx, cy) => {
  const { ctx } = env;
  outlinedBox(ctx, cx, cy - 4, 20, 8, 8, ENEMY.plate);
  outlinedBox(ctx, cx - 3, cy - 13, 10, 4, 6, ENEMY.mid);
  outlinedBox(ctx, cx + 14, cy - 2, 7, 4, 5, ENEMY.dark, false);
  // Turret bumps.
  for (let i = -1; i <= 1; i += 1) {
    outlinedBox(ctx, cx + i * 9, cy - 9, 2.5, 1.6, 3, ENEMY.dark, false);
  }
  // Red running lights + engine.
  ctx.fillStyle = rgba(GLOW.danger, 0.9);
  ctx.fillRect(Math.round(cx - 16), Math.round(cy - 2), 3, 1);
  ctx.fillRect(Math.round(cx - 16), Math.round(cy + 1), 2, 1);
  ctx.fillStyle = rgba(GLOW.danger, 0.8);
  ctx.fillRect(Math.round(cx + 18), Math.round(cy - 1), 4, 2);
  ctx.fillStyle = rgba(GLOW.danger, 0.25);
  ctx.fillRect(Math.round(cx + 22), Math.round(cy - 1), 5, 2);
};

/** Player survey drone: tiny quad rotor with a cyan sensor. */
const paintDrone: UnitPainter = (env, cx, cy) => {
  const { ctx, time } = env;
  const bob = Math.round(Math.sin(time / 300) * 1.5);
  seat(ctx, cx, cy, 6);
  outlinedLine(ctx, cx - 5, cy - 3 + bob, cx - 8, cy + 1, 1, HULL.dark);
  outlinedLine(ctx, cx + 5, cy - 3 + bob, cx + 8, cy + 1, 1, HULL.dark);
  outlinedBox(ctx, cx, cy - 6 + bob, 5, 2.5, 3, HULL.plate, false);
  outlinedLine(ctx, cx, cy - 8 + bob, cx, cy - 14, 1, HULL.dark);
  ctx.fillStyle = rgba(GLOW.function, 0.9);
  ctx.fillRect(Math.round(cx - 1), Math.round(cy - 5 + bob), 2, 1);
  ctx.fillStyle = rgba(GLOW.function, sinOn(time) ? 0.9 : 0.3);
  ctx.fillRect(Math.round(cx), Math.round(cy - 15), 1, 1);
};

/** Simple square-wave blink helper. */
function sinOn(time: number): boolean {
  return Math.sin(time / 260) > -0.2;
}

/** Unit painters keyed by the generated content key. */
export const UNIT_PAINTERS: Readonly<Record<UnitKey, UnitPainter>> = {
  raider: paintRaider,
  'siege-walker': paintSiege,
  dropship: paintDropship,
  interceptor: paintInterceptor,
  hauler: paintHauler,
  warship: paintWarship,
  'survey-drone': paintDrone,
};

/** Orbital craft reuse the same painters, anchored above the surface. */
export const SHIP_PAINTERS: Readonly<Record<UnitKey, ShipPainter>> = {
  raider: paintRaider,
  'siege-walker': paintSiege,
  dropship: paintDropship,
  interceptor: paintInterceptor,
  hauler: paintHauler,
  warship: paintWarship,
  'survey-drone': paintDrone,
};
