import type { BuildingArt, BuildingBodyPainter } from '../../sprite-contract';
import { box, cylinder, dome, line } from '../../primitives';
import { rgba } from '../../../style/tokens';
import { HULL } from '../../world-palette';
import { grating, plateSeams, plinth, rivets, strip } from '../detail';
import { padTop } from './faces';
import { dockMotion, hangarMotion, launchMotion, radarMotion } from './orbital-motion';

const launchBody: BuildingBodyPainter = (env, cx, cy) => {
  const { ctx } = env;
  const y = padTop(cy, 2);
  plinth(ctx, cx, cy, 2);
  ctx.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const angle = i * Math.PI / 4 + Math.PI / 8;
    const px = cx + Math.cos(angle) * 58;
    const py = y + Math.sin(angle) * 29;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = HULL.dark;
  ctx.fill();
  ctx.strokeStyle = HULL.recess;
  ctx.lineWidth = 1;
  ctx.stroke();
  for (let i = 0; i < 8; i += 1) {
    const a = i * Math.PI / 4;
    const b = a + Math.PI / 8;
    line(ctx, [cx + Math.cos(a) * 51, y + Math.sin(a) * 25], [cx + Math.cos(b) * 51, y + Math.sin(b) * 25], HULL.accent, 2);
  }
  ctx.fillStyle = HULL.recess;
  ctx.beginPath();
  ctx.ellipse(cx, y + 5, 20, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  line(ctx, [cx - 11, y + 2], [cx + 11, y + 2], HULL.mid, 2);
  line(ctx, [cx, y - 5], [cx, y + 10], HULL.mid, 2);

  box(ctx, cx - 50, y - 54, 10, 5, 40, { base: HULL.dark });
  grating(ctx, cx - 50, y - 54, 10, 5, rgba(HULL.recess, 0.35));
  box(ctx, cx - 50, y - 58, 14, 7, 5, { base: HULL.plate });
  line(ctx, [cx - 43, y - 32], [cx - 16, y - 43], HULL.plate, 3);
  line(ctx, [cx - 43, y - 30], [cx - 16, y - 41], HULL.dark);
  rivets(ctx, cx - 50, y - 58, 14, 7, 0.1, 0.5, 0.9, 0.5, 4, rgba(HULL.recess, 0.35));
};

const dockBody: BuildingBodyPainter = (env, cx, cy) => {
  const { ctx } = env;
  const y = padTop(cy, 2);
  plinth(ctx, cx, cy, 2);
  box(ctx, cx - 8, y - 4, 39, 19.5, 4, { base: HULL.dark, rim: false });
  grating(ctx, cx - 8, y - 4, 39, 19.5, rgba(HULL.recess, 0.32));
  const colors = [HULL.mid, HULL.dark, HULL.plate, HULL.dark, HULL.mid] as const;
  let index = 0;
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      if (row === 1 && col === 1) continue;
      const px = cx - 31 + col * 20 + row * 6;
      const py = y - 12 - row * 11 + col * 4;
      box(ctx, px, py, 9, 4.5, 9, { base: colors[index] ?? HULL.mid });
      for (let rib = 0; rib < 3; rib += 1) {
        strip(ctx, px - 8 + rib * 6, py - 8, 1, 8, rgba(HULL.recess, 0.25));
      }
      index += 1;
    }
  }
  for (const [x, floor] of [[8, 10], [51, 1]] as const) {
    line(ctx, [cx + x, y + floor], [cx + x, y - 46], HULL.recess, 6);
    line(ctx, [cx + x, y + floor], [cx + x, y - 46], HULL.plate, 2);
    box(ctx, cx + x, y + floor, 6, 3, 4, { base: HULL.dark });
  }
  line(ctx, [cx - 1, y - 47], [cx + 57, y - 44], HULL.recess, 7);
  line(ctx, [cx - 1, y - 48], [cx + 57, y - 45], HULL.plate, 2);
  for (let i = 0; i < 5; i += 1) {
    line(ctx, [cx + 3 + i * 11, y - 47], [cx + 12 + i * 11, y - 40], HULL.dark);
  }
  strip(ctx, cx - 35, y - 2, 13, 2, HULL.accent);
};

const hangarBody: BuildingBodyPainter = (env, cx, cy) => {
  const { ctx } = env;
  const y = padTop(cy, 2);
  plinth(ctx, cx, cy, 2);
  box(ctx, cx, y - 24, 48, 24, 24, { base: HULL.mid });
  dome(ctx, cx, y - 29, 45, 17, 22, { base: HULL.plate });
  plateSeams(ctx, cx, y - 24, 48, 24, rgba(HULL.recess, 0.2), 4);
  ctx.fillStyle = HULL.recess;
  ctx.fillRect(cx - 44, y - 23, 42, 25);
  for (let i = 0; i < 4; i += 1) {
    ctx.fillStyle = rgba(HULL.mid, 0.3);
    ctx.fillRect(cx - 44, y - 23 + i * 6, 42, 1);
  }
  ctx.strokeStyle = HULL.accent;
  ctx.lineWidth = 2;
  ctx.strokeRect(cx - 46, y - 25, 46, 29);
  for (let i = 0; i < 3; i += 1) {
    cylinder(ctx, cx + 9 + i * 13, y - 38, 5, 2.5, 5, { base: HULL.dark });
  }
  line(ctx, [cx - 42, y - 31], [cx + 43, y - 31], HULL.dark, 2);
  strip(ctx, cx + 3, y - 8, 19, 3, HULL.recess);
};

const radarBody: BuildingBodyPainter = (env, cx, cy) => {
  const { ctx } = env;
  const y = padTop(cy, 2);
  plinth(ctx, cx, cy, 2);
  box(ctx, cx - 13, y - 23, 29, 14.5, 22, { base: HULL.plate });
  plateSeams(ctx, cx - 13, y - 23, 29, 14.5, rgba(HULL.recess, 0.22), 3);
  box(ctx, cx - 13, y - 33, 20, 10, 10, { base: HULL.mid });
  strip(ctx, cx - 34, y - 18, 14, 5, HULL.recess);
  for (let i = 0; i < 3; i += 1) {
    strip(ctx, cx - 25 + i * 5, y - 29, 2, 6, HULL.recess);
  }
  line(ctx, [cx + 24, y - 20], [cx + 24, y - 60], HULL.dark, 5);
  line(ctx, [cx + 24, y - 20], [cx + 24, y - 60], HULL.plate);
  for (let i = 0; i < 5; i += 1) {
    line(ctx, [cx + 20, y - 24 - i * 6], [cx + 27, y - 24 - i * 6], HULL.dark);
  }
  box(ctx, cx + 24, y - 20, 7, 3.5, 5, { base: HULL.dark });
};

export const LAUNCH_ART = {
  body: launchBody, motion: launchMotion,
  bounds: { left: -82, top: -94, right: 82, bottom: 58 }, healthY: -84,
} as const satisfies BuildingArt;
export const DOCK_ART = {
  body: dockBody, motion: dockMotion,
  bounds: { left: -82, top: -88, right: 82, bottom: 58 }, healthY: -78,
} as const satisfies BuildingArt;
export const HANGAR_ART = {
  body: hangarBody, motion: hangarMotion,
  bounds: { left: -82, top: -86, right: 82, bottom: 58 }, healthY: -76,
} as const satisfies BuildingArt;
export const RADAR_ART = {
  body: radarBody, motion: radarMotion,
  bounds: { left: -82, top: -100, right: 82, bottom: 58 }, healthY: -90,
} as const satisfies BuildingArt;
