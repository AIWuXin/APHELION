import type { BuildingArt, BuildingBodyPainter } from '../../sprite-contract';
import { box, cylinder, line } from '../../primitives';
import { rgba } from '../../../style/tokens';
import { HULL } from '../../world-palette';
import { grating, hazard, plateSeams, plinth, strip } from '../detail';
import { padTop } from './faces';
import { bulwarkMotion, flakMotion, relayMotion, repairMotion, turretMotion } from './defence-motion';

const relayBody: BuildingBodyPainter = (env, cx, cy) => {
  const { ctx } = env;
  const y = padTop(cy, 1);
  plinth(ctx, cx, cy, 1);
  box(ctx, cx, y - 10, 19, 9.5, 10, { base: HULL.plate });
  grating(ctx, cx, y - 10, 19, 9.5, rgba(HULL.recess, 0.25));
  const top = y - 65;
  for (const side of [-1, 1]) {
    line(ctx, [cx + side * 8, y - 10], [cx + side * 3, top], HULL.dark, 2);
  }
  for (let i = 0; i < 10; i += 1) {
    const yy = y - 13 - i * 5.2;
    const w = 7.5 - i * 0.45;
    line(ctx, [cx - w, yy], [cx + w - 0.8, yy - 4.6], i % 2 === 0 ? HULL.mid : HULL.dark);
  }
  box(ctx, cx, y - 13, 9, 4.5, 4, { base: HULL.dark });
};

const turretBody: BuildingBodyPainter = (env, cx, cy) => {
  const { ctx } = env;
  const y = padTop(cy, 1);
  plinth(ctx, cx, cy, 1);
  cylinder(ctx, cx, y - 6, 17, 8.5, 6, { base: HULL.dark });
  cylinder(ctx, cx, y - 11, 15, 7.5, 7, { base: HULL.mid });
  box(ctx, cx - 11, y - 9, 6, 3, 7, { base: HULL.dark });
  strip(ctx, cx - 9, y - 15, 8, 2, HULL.recess);
};

const flakBody: BuildingBodyPainter = (env, cx, cy) => {
  const { ctx } = env;
  const y = padTop(cy, 1);
  plinth(ctx, cx, cy, 1);
  cylinder(ctx, cx, y - 8, 17, 8.5, 8, { base: HULL.dark });
  box(ctx, cx, y - 14, 13, 6.5, 6, { base: HULL.mid });
  for (const side of [-1, 1]) {
    cylinder(ctx, cx + side * 14, y - 12, 5, 2.5, 7, { base: HULL.plate });
    strip(ctx, cx + side * 14 - 4, y - 10, 8, 1, HULL.accent);
  }
  hazard(ctx, cx - 12, y - 2, 24, 3, HULL.accent);
};

const bulwarkBody: BuildingBodyPainter = (env, cx, cy) => {
  const { ctx } = env;
  const y = padTop(cy, 1);
  plinth(ctx, cx, cy, 1);
  box(ctx, cx, y - 14, 27, 13, 14, { base: HULL.dark });
  box(ctx, cx, y - 21, 21, 10, 7, { base: HULL.mid });
  plateSeams(ctx, cx, y - 14, 27, 13, rgba(HULL.recess, 0.25), 3);
  for (let i = 0; i < 3; i += 1) {
    ctx.fillStyle = HULL.recess;
    ctx.fillRect(cx - 17 + i * 12, y - 14, 7, 4);
    ctx.fillStyle = HULL.plate;
    ctx.fillRect(cx - 17 + i * 12, y - 10, 7, 1);
  }
  strip(ctx, cx - 5, y - 21, 10, 1, HULL.recess);
};

const repairBody: BuildingBodyPainter = (env, cx, cy) => {
  const { ctx } = env;
  const y = padTop(cy, 1);
  plinth(ctx, cx, cy, 1);
  box(ctx, cx, y - 4, 22, 11, 4, { base: HULL.dark, rim: false });
  grating(ctx, cx, y - 4, 22, 11, rgba(HULL.recess, 0.4));
  cylinder(ctx, cx, y - 7, 10, 5, 3, { base: HULL.mid });
  for (const side of [-1, 1]) {
    line(ctx, [cx + side * 19, y + 2], [cx + side * 19, y - 34], HULL.recess, 5);
    line(ctx, [cx + side * 19, y + 2], [cx + side * 19, y - 34], HULL.plate, 2);
    line(ctx, [cx + side * 19, y - 34], [cx + side * 3, y - 39], HULL.recess, 5);
    line(ctx, [cx + side * 19, y - 35], [cx + side * 3, y - 40], HULL.plate, 2);
    box(ctx, cx + side * 7, y - 40, 7, 3, 3, { base: HULL.mid });
    box(ctx, cx + side * 19, y + 1, 5, 2.5, 4, { base: HULL.dark });
  }
};

export const RELAY_ART = {
  body: relayBody, motion: relayMotion,
  bounds: { left: -50, top: -94, right: 52, bottom: 38 }, healthY: -84,
} as const satisfies BuildingArt;
export const TURRET_ART = {
  body: turretBody, motion: turretMotion,
  bounds: { left: -48, top: -64, right: 48, bottom: 38 }, healthY: -56,
} as const satisfies BuildingArt;
export const FLAK_ART = {
  body: flakBody, motion: flakMotion,
  bounds: { left: -48, top: -70, right: 48, bottom: 38 }, healthY: -60,
} as const satisfies BuildingArt;
export const BULWARK_ART = {
  body: bulwarkBody, motion: bulwarkMotion,
  bounds: { left: -48, top: -56, right: 48, bottom: 38 }, healthY: -48,
} as const satisfies BuildingArt;
export const REPAIR_ART = {
  body: repairBody, motion: repairMotion,
  bounds: { left: -48, top: -80, right: 48, bottom: 38 }, healthY: -70,
} as const satisfies BuildingArt;
