/**
 * Interaction overlays and ground-plane guides.
 *
 * Everything here is presentation-only and reads straight off `Frame`: the
 * orbital lane traces painted on the ground, the 1px diagonal selection
 * brackets, hover/placement ghosts, alert pings and the soft shadows that tie
 * airborne craft to the surface.
 */

import type { BuildingView } from '../generated/BuildingView';
import { BUILDING_KEYS } from '../generated/content-keys';
import { PALETTE, TILE, rgba } from '../style/tokens';
import type { Frame } from './frame';
import { toScreen } from './iso';
import type { Camera } from './iso';
import { GLOW } from './world-palette';

const HW = TILE.w / 2;
const HH = TILE.h / 2;

/** Lanes leave the dock along three fixed world directions (one per route). */
const LANE_DIRS: readonly (readonly [number, number])[] = [
  [1, 0.12],
  [0.12, 1],
  [-0.72, -0.72],
];

/** Draw a 1px crisp segment without allocating a tuple array. */
function seg(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(Math.round(x0) + 0.5, Math.round(y0) + 0.5);
  ctx.lineTo(Math.round(x1) + 0.5, Math.round(y1) + 0.5);
  ctx.stroke();
}

/** Marching cyan dashes with an amber underlay: an active orbital lane. */
function drawLane(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  ox: number,
  oy: number,
  dir: readonly [number, number],
  time: number,
  progress: number,
): void {
  const length = 13;
  const dx = dir[0];
  const dy = dir[1];
  // Every lane point is projected through `toScreen`, which unwraps it next to
  // the camera: a dock sitting on the x = 0/10239 seam still draws its lane on
  // screen instead of teleporting half a planet away.
  const start = toScreen(cam, ox + dx * 1.1, oy + dy * 1.1, 0);
  const end = toScreen(cam, ox + dx * length, oy + dy * length, 0);
  // Amber underlay: the lane is wired at all times.
  seg(ctx, start.x, start.y, end.x, end.y, rgba(GLOW.primary, 0.2));
  seg(ctx, start.x, start.y + 1, end.x, end.y + 1, rgba('#000000', 0.25));
  // Cyan dashes marching out along the lane.
  const dash = 0.42;
  const gap = 0.34;
  const offset = ((time / 140) % 1) * (dash + gap);
  const pulse = 0.55 + 0.35 * Math.sin(time / 240 + progress * 0.006);
  ctx.fillStyle = rgba(GLOW.function, pulse);
  for (let s = 0; s < length; s += 1) {
    const a = s * (dash + gap) + offset;
    const b = Math.min(length, a + dash);
    if (a >= length) break;
    for (let k = 0; k < 7; k += 1) {
      const t = a + ((b - a) * k) / 7;
      const p = toScreen(cam, ox + dx * t, oy + dy * t, 0);
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 1);
    }
  }
  // Chevrons every ~3 tiles point the way the lane runs.
  ctx.fillStyle = rgba(GLOW.function, 0.5 + pulse * 0.3);
  for (let t = 2.2; t < length; t += 3.1) {
    const p = toScreen(cam, ox + dx * t, oy + dy * t, 0);
    const sx = p.x;
    const sy = p.y;
    ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - 1, 1, 1);
    ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
    ctx.fillRect(Math.round(sx) - 1, Math.round(sy) + 1, 1, 1);
  }
  // A pulsing end marker so a running lane is unmistakable.
  ctx.strokeStyle = rgba(GLOW.function, 0.35 + pulse * 0.35);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(Math.round(end.x), Math.round(end.y) - 3);
  ctx.lineTo(Math.round(end.x) + 3, Math.round(end.y));
  ctx.lineTo(Math.round(end.x), Math.round(end.y) + 3);
  ctx.lineTo(Math.round(end.x) - 3, Math.round(end.y));
  ctx.closePath();
  ctx.stroke();
}

/** Route traces for every active orbital lane, anchored on a freight dock. */
export function drawRouteTraces(ctx: CanvasRenderingContext2D, frame: Frame): void {
  const routes = frame.snapshot.orbital.routes;
  if (routes.length === 0) return;
  let dock: BuildingView | null = null;
  for (const b of frame.snapshot.buildings) {
    if (BUILDING_KEYS[b.kind] === 'freight-dock' && b.state !== 0) {
      dock = b;
      break;
    }
  }
  if (!dock) return;
  const size = frame.boot.catalog.buildings[dock.kind]?.footprint ?? 2;
  const ox = dock.tx + size / 2;
  const oy = dock.ty + size / 2;
  const cam = frame.camera;
  for (let i = 0; i < routes.length; i += 1) {
    const route = routes[i];
    const dir = LANE_DIRS[i];
    if (!route || !dir || !route.active) continue;
    drawLane(ctx, cam, ox, oy, dir, frame.time, route.progress);
  }
}

/** Ground-plane shadows that tie airborne craft to the map. */
export function drawAirShadows(ctx: CanvasRenderingContext2D, frame: Frame): void {
  const cam = frame.camera;
  ctx.fillStyle = rgba('#000000', 0.26);
  for (const u of frame.snapshot.units) {
    if (u.z <= 140) continue;
    const p = toScreen(cam, u.x / 1024, u.y / 1024, 0);
    const lift = Math.min(2.4, u.z / 1024);
    const rx = 8 + lift * 4;
    ctx.beginPath();
    ctx.ellipse(p.x + 2, p.y + 1, rx, rx * 0.46, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const s of frame.snapshot.orbital.ships) {
    const p = toScreen(cam, s.x / 1024, s.y / 1024, 0);
    // Orbital contacts keep the ring marker: the shadow is far below them.
    ctx.strokeStyle = rgba(PALETTE.function, 0.16);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 2, 15, 6, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = rgba('#000000', 0.18);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 2, 9, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A 1px diagonal corner bracket at each diamond point. */
function brackets(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string,
  arm: number,
): void {
  const n: readonly [number, number] = [cx, cy - ry];
  const e: readonly [number, number] = [cx + rx, cy];
  const s: readonly [number, number] = [cx, cy + ry];
  const w: readonly [number, number] = [cx - rx, cy];
  const corners: readonly (readonly [readonly [number, number], readonly [number, number], readonly [number, number]])[] = [
    [n, e, w],
    [e, s, n],
    [s, w, e],
    [w, n, s],
  ];
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (const [p, a, b] of corners) {
    const ax = p[0] + ((a[0] - p[0]) / Math.hypot(a[0] - p[0], a[1] - p[1])) * arm;
    const ay = p[1] + ((a[1] - p[1]) / Math.hypot(a[0] - p[0], a[1] - p[1])) * arm;
    const bx = p[0] + ((b[0] - p[0]) / Math.hypot(b[0] - p[0], b[1] - p[1])) * arm;
    const by = p[1] + ((b[1] - p[1]) / Math.hypot(b[0] - p[0], b[1] - p[1])) * arm;
    ctx.beginPath();
    ctx.moveTo(Math.round(ax) + 0.5, Math.round(ay) + 0.5);
    ctx.lineTo(Math.round(p[0]) + 0.5, Math.round(p[1]) + 0.5);
    ctx.lineTo(Math.round(bx) + 0.5, Math.round(by) + 0.5);
    ctx.stroke();
  }
}

/** Footprint / unit selection, hover and placement ghost. */
export function drawInteraction(ctx: CanvasRenderingContext2D, frame: Frame): void {
  const cam = frame.camera;
  const { interaction } = frame;
  const pulse = 0.72 + 0.28 * Math.sin(frame.time / 320);

  // Hover tile.
  if (interaction.hover) {
    const p = toScreen(cam, interaction.hover.tx + 0.5, interaction.hover.ty + 0.5, 0);
    brackets(ctx, p.x, p.y, HW, HH, rgba(PALETTE.primary, 0.4), 6);
  }

  // Placement ghost: footprint diamond, per-tile grid, legality tint.
  if (interaction.placing >= 0) {
    const def = frame.boot.catalog.buildings[interaction.placing];
    const hover = interaction.hover;
    if (def && hover) {
      const size = def.footprint;
      const tint = interaction.placementOk ? PALETTE.status : PALETTE.danger;
      const p = toScreen(cam, hover.tx + size / 2, hover.ty + size / 2, 0);
      ctx.fillStyle = rgba(tint, 0.07);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - size * HH);
      ctx.lineTo(p.x + size * HW, p.y);
      ctx.lineTo(p.x, p.y + size * HH);
      ctx.lineTo(p.x - size * HW, p.y);
      ctx.closePath();
      ctx.fill();
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const q = toScreen(cam, hover.tx + x + 0.5, hover.ty + y + 0.5, 0);
          ctx.strokeStyle = rgba(tint, 0.22);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(q.x, q.y - HH);
          ctx.lineTo(q.x + HW, q.y);
          ctx.lineTo(q.x, q.y + HH);
          ctx.lineTo(q.x - HW, q.y);
          ctx.closePath();
          ctx.stroke();
        }
      }
      ctx.strokeStyle = rgba(tint, 0.85);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - size * HH);
      ctx.lineTo(p.x + size * HW, p.y);
      ctx.lineTo(p.x, p.y + size * HH);
      ctx.lineTo(p.x - size * HW, p.y);
      ctx.closePath();
      ctx.stroke();
      brackets(ctx, p.x, p.y, size * HW, size * HH, rgba(tint, 0.95), 9);
    }
  }

  // Selection brackets.
  if (interaction.selected !== 0) {
    const b = frame.snapshot.buildings.find((x) => x.id === interaction.selected);
    if (b) {
      const size = frame.boot.catalog.buildings[b.kind]?.footprint ?? 1;
      const p = toScreen(cam, b.tx + size / 2, b.ty + size / 2, 0);
      brackets(ctx, p.x, p.y, size * HW, size * HH, rgba(PALETTE.primary, pulse), 10);
      ctx.fillStyle = rgba(PALETTE.primary, 0.8);
      ctx.fillRect(Math.round(p.x), Math.round(p.y) - 1, 1, 1);
    } else {
      const u = frame.snapshot.units.find((x) => x.id === interaction.selected);
      if (u) {
        const p = toScreen(cam, u.x / 1024, u.y / 1024, 0);
        brackets(ctx, p.x, p.y, 15, 7, rgba(PALETTE.primary, pulse), 5);
        const size = 3;
        ctx.strokeStyle = rgba(PALETTE.primary, 0.5);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - size);
        ctx.lineTo(p.x, p.y + size);
        ctx.moveTo(p.x - size, p.y);
        ctx.lineTo(p.x + size, p.y);
        ctx.stroke();
      }
    }
  }

  // Alert pings: an expanding hard diamond ring.
  for (const ping of interaction.pings) {
    const p = toScreen(cam, ping.tx + 0.5, ping.ty + 0.5, 0);
    const t = Math.min(1, ping.age / 1400);
    const r = 10 + t * 30;
    ctx.strokeStyle = rgba(PALETTE.danger, (1 - t) * 0.8);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - r * 0.6);
    ctx.lineTo(p.x + r, p.y);
    ctx.lineTo(p.x, p.y + r * 0.6);
    ctx.lineTo(p.x - r, p.y);
    ctx.closePath();
    ctx.stroke();
  }
}
