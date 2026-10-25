import type { BuildingArt, BuildingBodyPainter } from '../../sprite-contract';
import { box, cylinder, dome, line } from '../../primitives';
import { rgba } from '../../../style/tokens';
import { COAL, HULL } from '../../world-palette';
import { cable, plateSeams, plinth, strip } from '../detail';
import { padTop } from './faces';
import { coalMineMotion, coalPlantMotion } from './industry-motion';

const mineBody: BuildingBodyPainter = (env, cx, cy) => {
  const { ctx } = env;
  const y = padTop(cy, 2);
  plinth(ctx, cx, cy, 2);
  const wx = cx - 27;
  const wy = y - 5;
  ctx.beginPath();
  ctx.ellipse(wx, wy + 7, 29, 12, 0, 0, Math.PI * 2);
  ctx.fillStyle = COAL.recess;
  ctx.fill();
  ctx.strokeStyle = COAL.dust;
  ctx.lineWidth = 2;
  ctx.stroke();
  line(ctx, [wx - 13, wy + 22], [wx, wy], HULL.dark, 5);
  line(ctx, [wx + 15, wy + 20], [wx, wy], HULL.dark, 5);
  cylinder(ctx, wx, wy - 4, 6, 3, 6, { base: HULL.plate });

  const ax = wx + 10;
  const ay = wy - 14;
  const bx = cx + 4;
  const by = y - 39;
  line(ctx, [ax, ay], [bx, by], HULL.recess, 9);
  line(ctx, [ax, ay - 1], [bx, by - 1], HULL.dark, 5);
  line(ctx, [ax, ay - 4], [bx, by - 4], HULL.plate);
  line(ctx, [cx - 4, y - 28], [cx - 4, y + 5], HULL.dark, 3);

  box(ctx, cx + 20, y - 23, 23, 11.5, 22, { base: COAL.hull });
  plateSeams(ctx, cx + 20, y - 23, 23, 11.5, rgba(HULL.recess, 0.32), 3);
  box(ctx, cx + 20, y - 30, 18, 9, 7, { base: HULL.mid });
  box(ctx, cx + 20, y - 32, 14, 7, 2, { base: HULL.recess, rim: false });
  strip(ctx, cx + 4, y - 18, 16, 3, HULL.accent);
  for (const [dx, dy, size] of [[28, 13, 7], [15, 16, 5]] as const) {
    box(ctx, cx + dx, y + dy, size, size * 0.45, 3, { base: COAL.lump, rim: false });
    strip(ctx, cx + dx - 3, y + dy - 1, 4, 1, COAL.sheen);
  }
};

const plantBody: BuildingBodyPainter = (env, cx, cy) => {
  const { ctx } = env;
  const y = padTop(cy, 2);
  plinth(ctx, cx, cy, 2);
  cylinder(ctx, cx - 17, y - 35, 22, 11, 34, { base: HULL.mid });
  dome(ctx, cx - 17, y - 35, 21, 10.5, 12, { base: HULL.plate });
  for (let i = 0; i < 3; i += 1) {
    strip(ctx, cx - 38, y - 26 + i * 10, 42, 1, rgba(HULL.recess, 0.32));
  }
  box(ctx, cx - 18, y - 15, 13, 6.5, 10, { base: HULL.recess });
  strip(ctx, cx - 29, y - 13, 18, 5, COAL.recess);
  strip(ctx, cx - 32, y - 34, 30, 3, HULL.accent);
  cylinder(ctx, cx - 17, y - 38, 7, 3.5, 5, { base: HULL.dark });

  const sx = cx + 29;
  cylinder(ctx, sx, y - 68, 7, 3.5, 66, { base: HULL.dark });
  for (let i = 0; i < 3; i += 1) {
    strip(ctx, sx - 7, y - 19 - i * 15, 14, 3, HULL.mid);
  }
  strip(ctx, sx - 7, y - 59, 14, 3, HULL.accent);
  cylinder(ctx, sx, y - 72, 8, 4, 4, { base: HULL.recess });
  cable(ctx, [[cx - 8, y - 39], [cx + 12, y - 43], [sx, y - 46]]);

  box(ctx, cx + 1, y - 15, 14, 7, 14, { base: HULL.plate });
  for (let i = 0; i < 4; i += 1) {
    strip(ctx, cx - 10 + i * 4, y - 13, 2, 9, HULL.recess);
  }
  line(ctx, [cx - 46, y + 8], [cx - 33, y - 8], HULL.recess, 8);
  line(ctx, [cx - 46, y + 6], [cx - 33, y - 10], HULL.dark, 3);
  box(ctx, cx - 42, y + 10, 7, 3.5, 3, { base: COAL.lump, rim: false });
};

export const COAL_MINE_ART = {
  body: mineBody, motion: coalMineMotion,
  bounds: { left: -82, top: -88, right: 82, bottom: 58 }, healthY: -78,
} as const satisfies BuildingArt;
export const COAL_PLANT_ART = {
  body: plantBody, motion: coalPlantMotion,
  bounds: { left: -82, top: -126, right: 82, bottom: 58 }, healthY: -112,
} as const satisfies BuildingArt;
