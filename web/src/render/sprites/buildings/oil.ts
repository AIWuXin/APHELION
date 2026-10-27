import type { BuildingArt, BuildingBodyPainter, BuildingPainter } from '../../sprite-contract';
import { box, cylinder, dome, line } from '../../primitives';
import { rgba } from '../../../style/tokens';
import { COAL, GLOW, HULL } from '../../world-palette';
import { beacon, plinth, strip } from '../detail';
import { padTop } from './faces';

const wellBody: BuildingBodyPainter = (env, cx, cy) => {
  const { ctx } = env;
  const y = padTop(cy, 2);
  plinth(ctx, cx, cy, 2);

  box(ctx, cx - 14, y - 7, 26, 13, 6, { base: HULL.dark });
  line(ctx, [cx - 30, y + 2], [cx - 13, y - 40], HULL.dark, 4);
  line(ctx, [cx + 1, y + 2], [cx - 13, y - 40], HULL.mid, 4);
  line(ctx, [cx - 25, y - 11], [cx - 4, y - 11], HULL.mid, 3);
  box(ctx, cx - 13, y - 42, 5, 2.5, 5, { base: HULL.plate });
  line(ctx, [cx - 29, y - 27], [cx - 29, y + 4], HULL.recess, 2);

  cylinder(ctx, cx + 23, y - 21, 13, 6.5, 22, { base: HULL.mid });
  dome(ctx, cx + 23, y - 21, 12.5, 6, 8, { base: HULL.plate });
  strip(ctx, cx + 9, y - 23, 27, 3, HULL.accent);
  strip(ctx, cx + 11, y - 10, 23, 2, COAL.recess);
  line(ctx, [cx - 1, y - 30], [cx + 12, y - 27], HULL.dark, 3);
  line(ctx, [cx + 23, y - 8], [cx + 23, y + 5], HULL.dark, 2);
};

const wellMotion: BuildingPainter = (env, cx, cy) => {
  const { ctx, time } = env;
  const y = padTop(cy, 2);
  const swing = Math.sin(time / 680) * 5;
  const left = cx - 32;
  const right = cx + 1;
  line(ctx, [left, y - 39 + swing], [right, y - 43 - swing], HULL.accent, 4);
  line(ctx, [left, y - 39 + swing], [left - 4, y - 34 + swing], HULL.dark, 3);
  line(ctx, [left - 4, y - 34 + swing], [left - 4, y - 17], HULL.dark, 2);
  strip(ctx, cx + 13, y - 9, 18, 1, rgba(GLOW.function, 0.45 + Math.sin(time / 900) * 0.2));
  beacon(ctx, cx + 34, y - 27, time, GLOW.primary);
};

export const OIL_WELL_ART = {
  body: wellBody,
  motion: wellMotion,
  bounds: { left: -76, top: -86, right: 76, bottom: 56 },
  healthY: -72,
} as const satisfies BuildingArt;
