/**
 * Shared building detail helpers.
 *
 * Every structure is built from the same vocabulary: a dark plinth, a poured
 * pad, panel seams, rivet rows, vents, hazard paint, cable runs and hard
 * emissive strips. This module owns that vocabulary plus the two state
 * overlays that every building shares -- the construction scaffold (state 0)
 * and the damaged scorch (flags bit 4).
 */

import type { BuildingDef } from '../../generated/BuildingDef';
import type { BuildingView } from '../../generated/BuildingView';
import type { SpriteEnv, BuildingPainter } from '../sprite-contract';
import { box, contactShadow, fillPoly, line, type Pt } from '../primitives';
import { PALETTE, rgba } from '../../style/tokens';
import { GLOW, HULL } from '../world-palette';

/** Half-width and half-height of one tile's rhombus. */
export const HW = 32;
/** Half-width and half-height of one tile's rhombus. */
export const HH = 16;

/** A point in a face's local iso space (0,0 = north, 1,1 = south). */
export function iso(cx: number, cy: number, rx: number, ry: number, a: number, b: number): Pt {
  return [cx + (a - b) * rx, cy + (a + b - 1) * ry];
}

/** A short glowing strip: the only saturated pixels on a structure. */
export function strip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  ctx.fillStyle = rgba('#ffffff', 0.22);
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), 1);
}

/** A blinking beacon: amber by default, driven by the frame clock. */
export function beacon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  time: number,
  color: string = GLOW.primary,
): void {
  const on = Math.sin(time / 380) > 0.2;
  ctx.fillStyle = on ? color : rgba(color, 0.32);
  ctx.fillRect(Math.round(x) - 1, Math.round(y) - 3, 3, 3);
  if (on) {
    ctx.fillStyle = rgba(color, 0.18);
    ctx.fillRect(Math.round(x) - 3, Math.round(y) - 5, 7, 7);
  }
}

/** Hard 1px seams across a top face, half width and half height. */
export function plateSeams(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string,
  divisions = 3,
): void {
  for (let i = 1; i < divisions; i += 1) {
    const t = i / divisions;
    line(ctx, iso(cx, cy, rx, ry, t, 0), iso(cx, cy, rx, ry, t, 1), color);
    line(ctx, iso(cx, cy, rx, ry, 0, t), iso(cx, cy, rx, ry, 1, t), color);
  }
}

/** A row of 1px rivets along a top-face iso line. */
export function rivets(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  a0: number,
  b0: number,
  a1: number,
  b1: number,
  count: number,
  color: string,
): void {
  ctx.fillStyle = color;
  for (let i = 0; i < count; i += 1) {
    const t = (i + 0.5) / count;
    const p = iso(cx, cy, rx, ry, a0 + (a1 - a0) * t, b0 + (b1 - b0) * t);
    ctx.fillRect(Math.round(p[0]), Math.round(p[1]), 1, 1);
  }
}

/** A recessed vent: dark slot plus three lit slats. */
export function vent(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  time: number,
): void {
  ctx.fillStyle = HULL.recess;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), 5);
  const hot = 0.35 + 0.35 * Math.sin(time / 640);
  ctx.fillStyle = rgba(GLOW.primary, hot);
  for (let i = 0; i < 3; i += 1) ctx.fillRect(Math.round(x) + 1, Math.round(y) + 1 + i * 2, w - 2, 1);
  ctx.fillStyle = rgba('#000000', 0.4);
  ctx.fillRect(Math.round(x), Math.round(y) + 5, Math.round(w), 1);
}

/** Hazard chevrons clipped to a rectangle. */
export function hazard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string = rgba(GLOW.primary, 0.55),
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  ctx.clip();
  ctx.fillStyle = color;
  for (let i = -h; i < w; i += 6) {
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + i, Math.round(y) + h);
    ctx.lineTo(Math.round(x) + i + h, Math.round(y));
    ctx.lineTo(Math.round(x) + i + h + 3, Math.round(y));
    ctx.lineTo(Math.round(x) + i + 3, Math.round(y) + h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** A 2px cable run with a 1px lit top, drawn as a polyline. */
export function cable(ctx: CanvasRenderingContext2D, pts: readonly Pt[]): void {
  ctx.strokeStyle = HULL.recess;
  ctx.lineWidth = 3;
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
  ctx.stroke();
  ctx.strokeStyle = HULL.dark;
  ctx.lineWidth = 1;
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1] - 1) : ctx.lineTo(p[0], p[1] - 1)));
  ctx.stroke();
}

/** A 1px metal grating lattice inside a top-face rect. */
export function grating(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string = rgba('#000000', 0.3),
): void {
  const n = 4;
  for (let i = 1; i < n; i += 1) {
    const t = i / n;
    line(ctx, iso(cx, cy, rx, ry, t, 0), iso(cx, cy, rx, ry, t, 1), color);
    line(ctx, iso(cx, cy, rx, ry, 0, t), iso(cx, cy, rx, ry, 1, t), color);
  }
}

/**
 * The concrete plinth every structure sits on: a dark recessed skirt, a poured
 * pad with a lit lip, corner hazard nubs and expansion joints. A large, dark
 * base is what makes a 2x2 structure read at 1x zoom.
 */
export function plinth(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  tint: string = HULL.pad,
): void {
  const rx = size * HW * 0.98;
  const ry = size * HH * 0.98;
  contactShadow(ctx, cx, cy, rx * 1.05, ry * 1.12, 0.46);
  // Recessed skirt.
  box(ctx, cx, cy - 1, rx, ry, size === 2 ? 7 : 5, { base: HULL.recess, rim: false, seam: false });
  // Poured pad, inset by a 1px dark reveal.
  const padY = cy - (size === 2 ? 8 : 6);
  box(ctx, cx, padY, rx * 0.95, ry * 0.95, 2, { base: tint, rim: true, seam: true });
  // Expansion joints + corner hazard nubs.
  plateSeams(ctx, cx, padY, rx * 0.95, ry * 0.95, HULL.dark, 3);
  const t = 0.06;
  const corners: readonly [number, number][] = [
    [t, t],
    [1 - t, t],
    [t, 1 - t],
    [1 - t, 1 - t],
  ];
  for (const [a, b] of corners) {
    const p = iso(cx, padY, rx * 0.95, ry * 0.95, a, b);
    ctx.fillStyle = rgba(GLOW.primary, 0.5);
    ctx.fillRect(Math.round(p[0]) - 1, Math.round(p[1]), 3, 1);
  }
}

/** Height of the construction scaffold for a 0..1000 progress value. */
function scaffoldHeight(size: number, progress: number): number {
  const max = size === 2 ? 64 : 40;
  return Math.max(6, Math.round(max * Math.max(0, Math.min(1000, progress)) / 1000));
}

/**
 * Build site: only the base plate, wireframe girders and the amber scan line at
 * the current build height. This is the main build-progress feedback.
 */
export function paintScaffold(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  progress: number,
  time: number,
): void {
  const rx = size * HW * 0.94;
  const ry = size * HH * 0.94;
  // Dark base plate with an amber wash.
  contactShadow(ctx, cx, cy, rx * 1.04, ry * 1.1, 0.36);
  fillPoly(
    ctx,
    [
      [cx, cy - ry],
      [cx + rx, cy],
      [cx, cy + ry],
      [cx - rx, cy],
    ],
    rgba(GLOW.primary, 0.08),
  );
  ctx.strokeStyle = rgba(GLOW.primary, 0.55);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, cy - ry);
  ctx.lineTo(cx + rx, cy);
  ctx.lineTo(cx, cy + ry);
  ctx.lineTo(cx - rx, cy);
  ctx.closePath();
  ctx.stroke();
  const h = scaffoldHeight(size, progress);
  const wire = rgba(HULL.plate, 0.85);
  const wireDark = rgba('#000000', 0.35);
  // Four corner posts + intermediate posts.
  const posts = 3;
  for (let i = 0; i < posts; i += 1) {
    const s = i / (posts - 1);
    const left = iso(cx, cy - h, rx, ry, 0.5 - s * 0.5, 0.5 + s * 0.5);
    const right = iso(cx, cy - h, rx, ry, 0.5 + s * 0.5, 0.5 - s * 0.5);
    for (const p of [left, right]) {
      ctx.strokeStyle = wireDark;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p[0], p[1]);
      ctx.lineTo(p[0], p[1] + h);
      ctx.stroke();
      ctx.strokeStyle = wire;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p[0], p[1]);
      ctx.lineTo(p[0], p[1] + h);
      ctx.stroke();
    }
  }
  // Horizontal ring braces + one diagonal per level.
  for (let y = 8; y <= h; y += 12) {
    const ring = y === h ? 0.9 : 0.5;
    ctx.strokeStyle = rgba(HULL.plate, ring);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy - y - ry);
    ctx.lineTo(cx + rx, cy - y);
    ctx.lineTo(cx, cy - y + ry);
    ctx.lineTo(cx - rx, cy - y);
    ctx.closePath();
    ctx.stroke();
    if (y + 12 <= h) {
      line(ctx, [cx - rx, cy - y], [cx, cy - y - ry + 2], rgba(HULL.plate, 0.3));
      line(ctx, [cx, cy - y - ry], [cx + rx, cy - y - 2], rgba(HULL.plate, 0.3));
    }
  }
  // The amber scan line at the current build height, with a pulse.
  const pulse = 0.55 + 0.45 * Math.sin(time / 260);
  ctx.strokeStyle = rgba(GLOW.primary, 0.85);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, cy - h - ry);
  ctx.lineTo(cx + rx, cy - h);
  ctx.lineTo(cx, cy - h + ry);
  ctx.lineTo(cx - rx, cy - h);
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = rgba(GLOW.primary, 0.16 * pulse);
  ctx.fillRect(Math.round(cx - rx), Math.round(cy - h - 1), Math.round(rx * 2), 2);
  // Material stacks at the base.
  box(ctx, cx - rx * 0.72, cy + ry * 0.25, 6, 3, 5, { base: HULL.dark });
  box(ctx, cx + rx * 0.6, cy + ry * 0.35, 5, 2.5, 4, { base: HULL.mid });
  // Blinking corner beacon.
  beacon(ctx, cx + rx * 0.9, cy - 2, time, GLOW.primary);
}

/**
 * Damaged overlay: a dark scorch patch, hairline cracks and one or two live
 * embers. Always drawn on top of the structure art.
 */
export function paintDamage(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  time: number,
): void {
  const r = size * 14;
  // Irregular hard-edged scorch.
  ctx.save();
  ctx.globalAlpha = 0.42;
  ctx.fillStyle = '#0c0f10';
  ctx.beginPath();
  ctx.moveTo(cx - r, cy + r * 0.4);
  ctx.lineTo(cx - r * 0.5, cy - r * 0.3);
  ctx.lineTo(cx + r * 0.2, cy - r * 0.5);
  ctx.lineTo(cx + r, cy - r * 0.1);
  ctx.lineTo(cx + r * 0.6, cy + r * 0.5);
  ctx.lineTo(cx - r * 0.2, cy + r * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
  // Cracks.
  for (let i = 0; i < 3; i += 1) {
    const a = -0.8 + i * 0.7;
    for (let s = 0; s < 6; s += 1) {
      ctx.fillStyle = rgba('#000000', 0.5);
      ctx.fillRect(
        Math.round(cx + Math.cos(a) * s * 2.2),
        Math.round(cy + Math.sin(a) * s * 1.2),
        1,
        1,
      );
    }
  }
  // Embers: 1px dots that blink out of phase.
  for (let i = 0; i < 3; i += 1) {
    const on = Math.sin(time / 300 + i * 2.1) > 0;
    if (!on) continue;
    const ex = cx + Math.cos(i * 2.4) * r * 0.7;
    const ey = cy + Math.sin(i * 1.7) * r * 0.35;
    ctx.fillStyle = i === 0 ? GLOW.primary : GLOW.danger;
    ctx.fillRect(Math.round(ex), Math.round(ey), 1, 1);
  }
}

/**
 * Wrap a painter with the two state overlays every structure shares: the build
 * site scaffold and the damaged scorch. Keeps the 14 painters free of state
 * plumbing and guarantees consistent feedback.
 */
export function withStates(painter: BuildingPainter): BuildingPainter {
  return (env: SpriteEnv, cx: number, cy: number, view: BuildingView, def: BuildingDef) => {
    if (view.state === 0) {
      paintScaffold(env.ctx, cx, cy, def.footprint, view.progress, env.time);
      return;
    }
    painter(env, cx, cy, view, def);
    if ((view.flags & 4) !== 0) paintDamage(env.ctx, cx, cy, def.footprint, env.time);
  };
}

/** Re-exported palette used by the painter modules. */
export { GLOW, HULL, PALETTE };
