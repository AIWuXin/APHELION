/**
 * Orbital-side structures: launch pad, freight dock, hangar and radar array.
 * These are the 2x2 "loud" silhouettes -- a rocket, a crane, a big door and a
 * dish -- so they read instantly even among a dense colony.
 */

import type { BuildingPainter } from '../../sprite-contract';
import { box, cylinder, line, prism } from '../../primitives';
import { PALETTE, rgba } from '../../../style/tokens';
import { GLOW, HULL, darken } from '../../world-palette';
import { beacon, grating, plateSeams, plinth, rivets, strip, vent } from '../detail';

const padTop = (cy: number): number => cy - 10;

const paintPad: BuildingPainter = (env, cx, cy, view) => {
  const { ctx, time } = env;
  const y = padTop(cy);
  // Octagonal poured pad, no plinth box: the pad *is* the structure.
  plinth(ctx, cx, cy, 2, '#474d4f');
  ctx.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const px = cx + Math.cos(a) * 58;
    const py = y + Math.sin(a) * 29;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = '#424849';
  ctx.fill();
  ctx.strokeStyle = '#1d2324';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Hazard chevrons around the rim + scorched centre.
  ctx.strokeStyle = rgba(GLOW.primary, 0.45);
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    const a2 = ((i + 0.5) / 8) * Math.PI * 2;
    line(
      ctx,
      [cx + Math.cos(a) * 50, y + Math.sin(a) * 25],
      [cx + Math.cos(a2) * 50, y + Math.sin(a2) * 25],
      rgba(GLOW.primary, 0.45),
    );
  }
  ctx.fillStyle = rgba('#000000', 0.28);
  ctx.beginPath();
  ctx.ellipse(cx, y + 6, 20, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  // Service gantry on the left.
  box(ctx, cx - 50, y - 14, 11, 6, 40, { base: HULL.dark });
  grating(ctx, cx - 50, y - 14, 11, 6, rgba('#000000', 0.35));
  box(ctx, cx - 50, y - 56, 14, 7, 5, { base: HULL.plate });
  ctx.strokeStyle = HULL.plate;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 42, y - 28);
  ctx.lineTo(cx - 18, y - 42);
  ctx.stroke();
  rivets(ctx, cx - 50, y - 56, 14, 7, 0.1, 0.5, 0.9, 0.5, 4, rgba('#000000', 0.4));
  beacon(ctx, cx - 50, y - 62, time);
  // Rocket on the pad: down at idle, climbing while working (state 2).
  const launching = view.state === 2;
  const ascent = launching ? Math.min(1, view.progress / 1000) : 0;
  const lift = ascent * 150;
  const baseY = y - 10 - lift;
  if (launching) {
    for (let i = 1; i <= 6; i += 1) {
      const t = i / 6;
      ctx.fillStyle = rgba(GLOW.primary, 0.5 * (1 - t) + 0.12);
      const w = 7 - i * 0.7;
      ctx.fillRect(Math.round(cx - w / 2), Math.round(baseY + 12 + t * 34), Math.round(w), 3);
    }
  }
  cylinder(ctx, cx, baseY - 2, 9, 4.5, 22, { base: '#b8bcbb' });
  cylinder(ctx, cx, baseY - 26, 9, 4.5, 8, { base: '#cdd2d0' });
  prism(ctx, cx, baseY - 30, 9, 4.5, 14, 0, { base: '#d7dbd9' });
  strip(ctx, cx - 6, baseY - 18, 5, 1, rgba(GLOW.function, 0.45));
  box(ctx, cx, baseY + 20, 6, 3, 3, { base: HULL.dark, rim: false });
  strip(ctx, cx - 3, baseY + 21, 6, 2, rgba(GLOW.primary, 0.9));
  ctx.fillStyle = '#8f9695';
  ctx.fillRect(Math.round(cx - 14), Math.round(baseY + 4), 5, 12);
  ctx.fillRect(Math.round(cx + 9), Math.round(baseY + 4), 5, 12);
  // Floodlights at the rim.
  strip(ctx, cx + 30, y + 10, 10, 2, rgba(GLOW.primary, 0.5));
  strip(ctx, cx - 20, y + 16, 8, 2, rgba(GLOW.primary, 0.35));
};

const paintDock: BuildingPainter = (env, cx, cy) => {
  const { ctx, time } = env;
  const y = padTop(cy);
  plinth(ctx, cx, cy, 2, '#4b5052');
  // Loading bay floor.
  box(ctx, cx - 8, y - 4, 38, 19, 4, { base: HULL.dark, rim: false });
  grating(ctx, cx - 8, y - 4, 38, 19, rgba('#000000', 0.35));
  // Container stacks: three hard-edged colours, 1px ribs.
  const colors = ['#7a6a48', '#54656b', '#6a5a4a', '#4f5f66'];
  let i = 0;
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      if (row === 1 && col === 1) continue;
      const px = cx - 30 + col * 20 + row * 6;
      const py = y - 12 - row * 11 + col * 4;
      const color = colors[i % colors.length] ?? '#54656b';
      box(ctx, px, py, 9, 4.5, 9, { base: color });
      // Container ribs: three 1px vertical lines plus a lit top edge.
      for (let r = 0; r < 3; r += 1) {
        ctx.fillStyle = rgba('#000000', 0.22);
        ctx.fillRect(Math.round(px - 8 + r * 6), Math.round(py - 8), 1, 8);
      }
      ctx.fillStyle = rgba('#ffffff', 0.12);
      ctx.fillRect(Math.round(px - 8), Math.round(py - 12), 14, 1);
      i += 1;
    }
  }
  // Gantry crane: two legs, top beam, trolley and hook line.
  ctx.strokeStyle = HULL.recess;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx + 26, y + 8);
  ctx.lineTo(cx + 26, y - 40);
  ctx.moveTo(cx + 44, y + 2);
  ctx.lineTo(cx + 44, y - 38);
  ctx.moveTo(cx + 18, y - 40);
  ctx.lineTo(cx + 50, y - 38);
  ctx.stroke();
  ctx.strokeStyle = HULL.plate;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx + 26, y + 8);
  ctx.lineTo(cx + 26, y - 40);
  ctx.moveTo(cx + 44, y + 2);
  ctx.lineTo(cx + 44, y - 38);
  ctx.moveTo(cx + 18, y - 40);
  ctx.lineTo(cx + 50, y - 38);
  ctx.stroke();
  // Trolley crawls very slowly.
  const trolley = 22 + Math.sin(time / 2600) * 10;
  box(ctx, cx + trolley, y - 42, 5, 2.5, 4, { base: HULL.mid, rim: false });
  ctx.strokeStyle = rgba('#000000', 0.55);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx + trolley, y - 38);
  ctx.lineTo(cx + trolley, y - 26);
  ctx.stroke();
  box(ctx, cx + trolley, y - 22, 5, 2.5, 3, { base: '#7a6a48' });
  // Running lights + the route-trace origin marker.
  for (let k = 0; k < 4; k += 1) {
    const on = Math.sin(time / 500 + k * 1.4) > 0;
    ctx.fillStyle = on ? GLOW.function : rgba(GLOW.function, 0.25);
    ctx.fillRect(Math.round(cx + 18 + k * 9), Math.round(y - 39), 2, 1);
  }
  const pulse = 0.5 + 0.5 * Math.sin(time / 620);
  for (let k = 0; k < 6; k += 1) {
    ctx.fillStyle = rgba(GLOW.function, 0.25 + pulse * 0.35);
    ctx.fillRect(Math.round(cx - 34 + k * 12), Math.round(y + 16), 5, 1);
  }
  beacon(ctx, cx + 44, y - 44, time, GLOW.function);
  strip(ctx, cx - 34, y - 2, 12, 2, rgba(GLOW.function, 0.7));
};

const paintHangar: BuildingPainter = (env, cx, cy) => {
  const { ctx, time } = env;
  const y = padTop(cy);
  plinth(ctx, cx, cy, 2, '#4a5052');
  // Main shed with a big open door on the front face.
  box(ctx, cx, y - 26, 50, 25, 26, { base: HULL.mid });
  plateSeams(ctx, cx, y - 26, 50, 25, rgba('#000000', 0.32), 4);
  box(ctx, cx, y - 36, 36, 18, 9, { base: HULL.plate });
  plateSeams(ctx, cx, y - 36, 36, 18, rgba('#000000', 0.3), 3);
  // Recessed door: near-black interior, 2 hard glow bands, door frame.
  ctx.fillStyle = HULL.recess;
  ctx.fillRect(Math.round(cx - 46), Math.round(y - 24), 40, 24);
  ctx.fillStyle = rgba(GLOW.function, 0.16);
  ctx.fillRect(Math.round(cx - 46), Math.round(y - 8), 40, 4);
  ctx.fillStyle = rgba(GLOW.function, 0.3);
  ctx.fillRect(Math.round(cx - 46), Math.round(y - 4), 40, 1);
  for (let i = 0; i < 4; i += 1) {
    ctx.fillStyle = rgba('#000000', 0.5);
    ctx.fillRect(Math.round(cx - 46), Math.round(y - 24 + i * 6), 40, 1);
  }
  ctx.strokeStyle = HULL.plate;
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(cx - 47), Math.round(y - 25), 42, 26);
  // Door status light: amber while working, cyan otherwise.
  const open = time / 900;
  const lit = 0.35 + 0.4 * Math.sin(open);
  strip(
    ctx,
    cx - 44,
    y - 27,
    36,
    2,
    rgba(time % 1800 > 900 ? GLOW.primary : GLOW.function, 0.3 + lit),
  );
  // Roof vents + crane rail.
  for (let i = 0; i < 3; i += 1) cylinder(ctx, cx + 8 + i * 13, y - 38, 5, 2.5, 4, { base: HULL.dark });
  ctx.strokeStyle = HULL.recess;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 44, y - 30);
  ctx.lineTo(cx + 44, y - 30);
  ctx.stroke();
  vent(ctx, cx + 14, y - 44, 12, time);
  rivets(ctx, cx, y - 36, 36, 18, 0.05, 0.95, 0.95, 0.05, 9, rgba('#000000', 0.3));
  beacon(ctx, cx + 46, y - 40, time);
};

const paintRadar: BuildingPainter = (env, cx, cy) => {
  const { ctx, time } = env;
  const y = padTop(cy);
  plinth(ctx, cx, cy, 2, '#484e50');
  // Equipment block.
  box(ctx, cx - 10, y - 22, 32, 16, 22, { base: HULL.mid });
  plateSeams(ctx, cx - 10, y - 22, 32, 16, rgba('#000000', 0.32), 3);
  box(ctx, cx - 10, y - 32, 20, 10, 10, { base: HULL.plate });
  vent(ctx, cx - 22, y - 28, 10, time);
  // Mast + rotating dish.
  const spin = time / 1400;
  const tilt = Math.cos(spin);
  const dishY = y - 52;
  ctx.strokeStyle = HULL.dark;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx + 24, y - 22);
  ctx.lineTo(cx + 24, dishY + 6);
  ctx.stroke();
  const rx = 17;
  const ry = 9;
  ctx.beginPath();
  ctx.ellipse(cx + 24, dishY, Math.abs(tilt) * rx + 3, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#7d8785';
  ctx.fill();
  ctx.strokeStyle = rgba('#ffffff', 0.18);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx + 24, dishY, Math.max(4, Math.abs(tilt) * rx * 0.55), ry * 0.55, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#5d6766';
  ctx.fill();
  // Feed horn + support.
  line(ctx, [cx + 24, dishY], [cx + 24 + tilt * 7, dishY - 7], HULL.recess);
  // Sweep: a cyan 1px arc that tracks the dish.
  const sweep = Math.atan2(Math.sin(spin), Math.cos(spin));
  ctx.strokeStyle = rgba(GLOW.function, 0.3);
  ctx.beginPath();
  ctx.ellipse(cx + 24, y + 6, 34, 14, 0, sweep, sweep + 0.55);
  ctx.stroke();
  ctx.strokeStyle = rgba(GLOW.function, 0.12);
  ctx.beginPath();
  ctx.ellipse(cx + 24, y + 6, 26, 10, 0, sweep, sweep + 0.7);
  ctx.stroke();
  // Status strips: green nominal, cyan data.
  strip(ctx, cx - 34, y - 16, 14, 2, rgba(GLOW.status, 0.6));
  strip(ctx, cx - 34, y - 10, 9, 1, rgba(GLOW.function, 0.5));
  beacon(ctx, cx + 24, dishY - 12, time, GLOW.status);
};

/** The four orbital-side structures. */
export const ORBITAL: Readonly<Record<string, BuildingPainter>> = {
  'launch-pad': paintPad,
  'freight-dock': paintDock,
  hangar: paintHangar,
  'radar-array': paintRadar,
};

/** Keeps unused imports honest for asset work. */
export const _orbitalHelpers = { PALETTE, darken };
