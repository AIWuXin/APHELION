import type { BuildingArt, BuildingBodyPainter, BuildingPainter } from '../../sprite-contract';
import { box, cylinder, dome, fillPoly, line } from '../../primitives';
import { rgba } from '../../../style/tokens';
import { DEPOSIT, GLOW, HULL } from '../../world-palette';
import { beacon, cable, plateSeams, plinth, rivets, strip } from '../detail';
import { faceSeams, faceWindows, padTop } from './faces';

const body: BuildingBodyPainter = (env, cx, cy) => {
  const { ctx } = env;
  const y = padTop(cy, 2);
  plinth(ctx, cx, cy, 2);

  box(ctx, cx - 14, y - 27, 28, 14, 26, { base: HULL.plate });
  box(ctx, cx - 14, y - 32, 20, 10, 6, { base: HULL.mid });
  plateSeams(ctx, cx - 14, y - 27, 28, 14, rgba(HULL.recess, 0.22), 3);
  faceSeams(ctx, cx - 14, y - 27, 28, 14, 26, rgba(HULL.recess, 0.2), 3);
  faceWindows(ctx, cx - 42, y - 27, 28, 14, 3, HULL.recess);
  strip(ctx, cx - 36, y - 11, 18, 2, HULL.accent);

  cylinder(ctx, cx + 29, y - 42, 18, 9, 38, { base: HULL.plate });
  dome(ctx, cx + 29, y - 42, 17, 8.5, 10, { base: HULL.plate });
  cylinder(ctx, cx + 29, y - 6, 18, 9, 5, { base: HULL.dark, rim: false });
  for (let i = 0; i < 3; i += 1) {
    strip(ctx, cx + 11, y - 31 + i * 10, 36, 1, rgba(HULL.recess, 0.28));
  }
  rivets(ctx, cx + 29, y - 42, 17, 8.5, 0.08, 0.5, 0.92, 0.5, 9, rgba(HULL.recess, 0.24));
  strip(ctx, cx + 12, y - 38, 34, 3, HULL.accent);
  cable(ctx, [[cx + 29, y - 50], [cx + 35, y - 55], [cx + 43, y - 54]]);
  cable(ctx, [[cx + 12, y - 23], [cx + 25, y - 26], [cx + 47, y - 25]]);

  const sx = cx + 47;
  cylinder(ctx, sx, y - 64, 5.5, 2.8, 62, { base: HULL.dark });
  cylinder(ctx, sx, y - 66, 7, 3.5, 4, { base: HULL.recess });
  strip(ctx, sx - 5, y - 56, 10, 3, HULL.plate);
  strip(ctx, sx - 5, y - 47, 10, 2, HULL.accent);
  for (let i = 0; i < 3; i += 1) {
    strip(ctx, sx - 4, y - 16 - i * 8, 8, 3, HULL.recess);
  }

  const hx = cx - 31;
  box(ctx, hx, y - 22, 22, 11, 21, { base: HULL.dark });
  box(ctx, hx, y - 29, 14, 7, 7, { base: HULL.plate });
  strip(ctx, hx - 9, y - 22, 18, 2, HULL.accent);
  const mouth = [[hx - 20, y - 16], [hx - 4, y - 8], [hx - 4, y + 3], [hx - 20, y - 5]] as const;
  fillPoly(ctx, mouth, HULL.recess);
  line(ctx, mouth[0], mouth[3], HULL.mid, 2);
  line(ctx, mouth[0], mouth[1], HULL.mid);
  cable(ctx, [[hx, y - 31], [hx + 10, y - 34], [cx - 2, y - 31]]);
  for (let i = 0; i < 3; i += 1) {
    ctx.fillStyle = i === 0 ? DEPOSIT.fleck : DEPOSIT.dark;
    ctx.fillRect(Math.round(hx - 22 + i * 4), Math.round(y - i), 2, 2);
  }

  const ax = hx - 20;
  const ay = y + 1;
  const bx = cx - 25;
  const by = y + 17;
  line(ctx, [ax, ay], [bx, by], HULL.recess, 10);
  line(ctx, [ax, ay - 1], [bx, by - 1], HULL.dark, 5);
  for (const offset of [-5, 5]) {
    line(ctx, [ax + offset, ay + offset * 0.35], [bx + offset, by + offset * 0.35], HULL.plate);
  }
  line(ctx, [ax + 4, ay + 2], [ax + 4, ay + 10], HULL.dark, 2);
  line(ctx, [bx - 4, by - 2], [bx - 4, by + 5], HULL.dark, 2);
  box(ctx, bx + 3, by + 1, 7, 3.5, 3, { base: DEPOSIT.dark, rim: false });
};

const motion: BuildingPainter = (env, cx, cy) => {
  const { ctx, time } = env;
  const y = padTop(cy, 2);
  const hx = cx - 31;
  const ax = hx - 20;
  const ay = y + 1;
  const bx = cx - 25;
  const by = y + 17;
  for (let i = 0; i < 5; i += 1) {
    const t = (time / 1300 + i / 5) % 1;
    ctx.fillStyle = i % 2 === 0 ? DEPOSIT.fleck : DEPOSIT.warm;
    ctx.fillRect(Math.round(ax + (bx - ax) * t), Math.round(ay + (by - ay) * t) - 2, 3, 2);
  }
  const heat = 0.5 + Math.sin(time / 540) * 0.5;
  for (let i = 0; i < 3; i += 1) {
    strip(ctx, cx + 44, y - 16 - i * 8, 6, 2, rgba(GLOW.primary, (0.25 + heat * 0.5) * (1 - i * 0.2)));
  }
  for (let i = 0; i < 3; i += 1) {
    const t = (time / 2800 + i / 3) % 1;
    ctx.fillStyle = rgba(HULL.mid, 0.38 * (1 - t));
    const size = 2 + Math.floor(t * 3);
    ctx.fillRect(Math.round(cx + 47 + t * 12), Math.round(y - 71 - t * 25), size, size);
  }
  beacon(ctx, cx + 47, y - 70, time, GLOW.primary);
  strip(ctx, cx + 17, y - 21, 9, 2, rgba(GLOW.status, 0.4 + heat * 0.4));
  strip(ctx, cx - 33, y - 20, 12, 1, rgba(GLOW.function, 0.4 + heat * 0.3));
};

export const REFINERY_ART = {
  body,
  motion,
  bounds: { left: -92, top: -120, right: 88, bottom: 58 },
  healthY: -110,
} as const satisfies BuildingArt;
