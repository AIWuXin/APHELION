/**
 * Defence and support structures: rail turret, flak battery, bulwark, relay
 * mast and repair bay. Compact 1x1 mass with one loud animated element each, so
 * the defensive line reads at 1x zoom.
 */

import type { BuildingPainter } from '../../sprite-contract';
import { box, cylinder, line, prism } from '../../primitives';
import { rgba } from '../../../style/tokens';
import { GLOW, HULL, darken } from '../../world-palette';
import { beacon, cable, grating, hazard, plateSeams, plinth, rivets, strip } from '../detail';

const padTop = (cy: number): number => cy - 8;

const paintRelay: BuildingPainter = (env, cx, cy) => {
  const { ctx, time } = env;
  const y = padTop(cy);
  plinth(ctx, cx, cy, 1, '#474d4f');
  box(ctx, cx, y - 10, 20, 10, 10, { base: HULL.dark });
  grating(ctx, cx, y - 10, 20, 10, rgba('#000000', 0.3));
  // Tapered lattice mast: two vertical 1px edges with cross braces.
  const top = y - 62;
  ctx.strokeStyle = HULL.plate;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 6, y - 10);
  ctx.lineTo(cx - 3, top);
  ctx.moveTo(cx + 6, y - 10);
  ctx.lineTo(cx + 3, top);
  ctx.stroke();
  ctx.strokeStyle = rgba('#000000', 0.4);
  for (let i = 0; i < 9; i += 1) {
    const yy = y - 12 - i * 5.5;
    const w = 6 - i * 0.36;
    ctx.beginPath();
    ctx.moveTo(cx - w, yy);
    ctx.lineTo(cx + w, yy - 5);
    ctx.stroke();
  }
  // Dish on the mast, slowly tracking.
  const spin = time / 1600;
  const tilt = Math.cos(spin);
  const dx = cx + 12;
  const dy = top + 2;
  line(ctx, [cx, top + 2], [dx - 4, dy - 4], HULL.dark, 2);
  ctx.beginPath();
  ctx.ellipse(dx, dy, Math.abs(tilt) * 13 + 3, 7, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#7b8584';
  ctx.fill();
  ctx.strokeStyle = rgba('#ffffff', 0.18);
  ctx.lineWidth = 1;
  ctx.stroke();
  line(ctx, [dx, dy], [dx + tilt * 6, dy - 5], HULL.recess);
  // Signal arcs: cyan function ink expanding every ~1.2s.
  const phase = (time % 1200) / 1200;
  for (let i = 0; i < 3; i += 1) {
    const r = 8 + i * 7 + phase * 6;
    ctx.strokeStyle = rgba(GLOW.function, 0.3 - i * 0.08);
    ctx.beginPath();
    ctx.ellipse(cx, top - 4, r, r * 0.5, 0, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
  }
  strip(ctx, cx - 8, y - 6, 8, 1, rgba(GLOW.function, 0.6));
  beacon(ctx, cx, top - 6, time, GLOW.function);
};

const paintTurret: BuildingPainter = (env, cx, cy, view) => {
  const { ctx, time } = env;
  const y = padTop(cy);
  plinth(ctx, cx, cy, 1, '#44494b');
  cylinder(ctx, cx, y - 10, 16, 8, 9, { base: HULL.mid });
  // Rotating housing: the barrel sweep is driven by charge + time.
  const aim = time / 900;
  box(ctx, cx, y - 22, 12, 6.5, 9, { base: darken(HULL.plate, 0.92) });
  plateSeams(ctx, cx, y - 22, 12, 6.5, rgba('#000000', 0.35), 2);
  const cos = Math.cos(aim);
  const sin = Math.sin(aim) * 0.5;
  const muzzleX = cx + cos * 24;
  const muzzleY = y - 24 + sin * 24;
  // Twin barrels with a 1px lit edge.
  for (let i = 0; i < 2; i += 1) {
    const oy = i * 2;
    ctx.strokeStyle = HULL.recess;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx + cos * 6, y - 24 + sin * 6 + oy);
    ctx.lineTo(muzzleX, muzzleY + oy);
    ctx.stroke();
    ctx.strokeStyle = HULL.dark;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx + cos * 6, y - 24 + sin * 6 + oy);
    ctx.lineTo(muzzleX, muzzleY + oy);
    ctx.stroke();
  }
  // Muzzle brake + charge coil.
  ctx.fillStyle = HULL.plate;
  ctx.fillRect(Math.round(muzzleX) - 2, Math.round(muzzleY) - 2, 4, 4);
  const charge = Math.max(0, Math.min(1, view.charge / 1000));
  if (charge > 0.05) {
    strip(ctx, cx + cos * 10 - 2, y - 26 + sin * 10, 4, 2, rgba(GLOW.primary, 0.35 + charge * 0.55));
  }
  strip(ctx, cx - 9, y - 16, 8, 2, rgba(GLOW.status, 0.5));
  beacon(ctx, cx - 12, y - 12, time, GLOW.status);
};

const paintFlak: BuildingPainter = (env, cx, cy, view) => {
  const { ctx, time } = env;
  const y = padTop(cy);
  plinth(ctx, cx, cy, 1, '#454a4b');
  cylinder(ctx, cx, y - 8, 15, 7.5, 8, { base: HULL.dark });
  box(ctx, cx, y - 18, 11, 5.5, 7, { base: HULL.mid });
  // Ammo drum.
  cylinder(ctx, cx - 15, y - 12, 5, 2.5, 7, { base: darken(HULL.plate, 0.85) });
  // Four flak barrels fanned upward; a slow recoil breathes with the cooldown.
  const kick = Math.max(0, 1 - view.charge / 1000) * 3;
  for (let i = 0; i < 4; i += 1) {
    const a = -0.75 + i * 0.5;
    const bx = cx - 5 + i * 3;
    const by = y - 22;
    const ex = bx + Math.cos(a) * 17;
    const ey = by - 17 + kick;
    ctx.strokeStyle = HULL.recess;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.strokeStyle = HULL.dark;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.fillStyle = HULL.plate;
    ctx.fillRect(Math.round(ex) - 1, Math.round(ey) - 1, 2, 2);
  }
  hazard(ctx, cx - 12, y - 2, 24, 3, rgba(GLOW.primary, 0.45));
  strip(ctx, cx - 8, y - 12, 7, 2, rgba(GLOW.function, 0.55));
  beacon(ctx, cx + 10, y - 16, time, GLOW.primary);
};

const paintBulwark: BuildingPainter = (env, cx, cy) => {
  const { ctx, time } = env;
  const y = padTop(cy);
  plinth(ctx, cx, cy, 1, '#3f4446');
  // Heavy low wall with a sloped parapet.
  box(ctx, cx, y - 16, 27, 13, 16, { base: '#5a6163' });
  box(ctx, cx, y - 22, 20, 9, 6, { base: '#4c5355' });
  plateSeams(ctx, cx, y - 16, 27, 13, rgba('#000000', 0.3), 3);
  rivets(ctx, cx, y - 16, 27, 13, 0.08, 0.92, 0.92, 0.08, 7, rgba('#ffffff', 0.14));
  // Firing slits: hard black notches with a lit lower lip.
  for (let i = 0; i < 3; i += 1) {
    ctx.fillStyle = '#0b0f10';
    ctx.fillRect(Math.round(cx - 17 + i * 12), Math.round(y - 15), 7, 3);
    ctx.fillStyle = rgba('#ffffff', 0.1);
    ctx.fillRect(Math.round(cx - 17 + i * 12), Math.round(y - 12), 7, 1);
  }
  // Hazard chevrons on the skirt + a ready light.
  hazard(ctx, cx - 18, y - 4, 36, 3, rgba(GLOW.primary, 0.4));
  strip(ctx, cx - 5, y - 21, 10, 1, rgba('#ffffff', 0.08));
  beacon(ctx, cx + 20, y - 12, time, GLOW.status);
};

const paintRepair: BuildingPainter = (env, cx, cy) => {
  const { ctx, time } = env;
  const y = padTop(cy);
  plinth(ctx, cx, cy, 1, '#464c4e');
  box(ctx, cx, y - 14, 22, 11, 14, { base: HULL.mid });
  plateSeams(ctx, cx, y - 14, 22, 11, rgba('#000000', 0.3), 2);
  // Gantry arms arching over the bay.
  for (const side of [-1, 1]) {
    ctx.strokeStyle = HULL.recess;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx + side * 19, y - 2);
    ctx.lineTo(cx + side * 19, y - 34);
    ctx.lineTo(cx + side * 3, y - 38);
    ctx.stroke();
    ctx.strokeStyle = HULL.plate;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx + side * 19, y - 2);
    ctx.lineTo(cx + side * 19, y - 34);
    ctx.lineTo(cx + side * 3, y - 38);
    ctx.stroke();
  }
  // Repair arc between the arms: green status ink.
  const pulse = 0.45 + 0.35 * Math.sin(time / 520);
  ctx.strokeStyle = rgba(GLOW.status, pulse);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(cx, y - 32, 12, 5, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Welding sparks: 1px dots crawling along the arc.
  for (let i = 0; i < 3; i += 1) {
    const a = (time / 400 + i * 2.1) % 6.283;
    ctx.fillStyle = rgba(GLOW.status, 0.7);
    ctx.fillRect(Math.round(cx + Math.cos(a) * 12), Math.round(y - 32 + Math.sin(a) * 5), 1, 1);
  }
  // Hovering repair drone bobbing above the bay.
  const bob = Math.round(Math.sin(time / 600) * 2);
  box(ctx, cx, y - 46 + bob, 5, 2.5, 4, { base: HULL.plate, rim: false });
  strip(ctx, cx - 4, y - 44 + bob, 3, 1, rgba(GLOW.function, 0.8));
  cable(ctx, [
    [cx - 19, y - 34],
    [cx - 6, y - 40 + bob],
  ]);
  beacon(ctx, cx, y - 40, time, GLOW.status);
};

/** The five defence / support structures. */
export const DEFENCE: Readonly<Record<string, BuildingPainter>> = {
  'relay-mast': paintRelay,
  'rail-turret': paintTurret,
  'flak-battery': paintFlak,
  bulwark: paintBulwark,
  'repair-bay': paintRepair,
};

/** Keeps unused imports honest for asset work. */
export const _defenceHelpers = { prism };
