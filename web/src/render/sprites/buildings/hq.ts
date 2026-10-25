import type { BuildingArt, BuildingBodyPainter, BuildingPainter } from '../../sprite-contract';
import { box, fillPoly, line } from '../../primitives';
import { rgba } from '../../../style/tokens';
import { GLOW, HULL } from '../../world-palette';
import { beacon, cable, plateSeams, plinth, strip } from '../detail';
import { faceSeams, faceWindows, padTop } from './faces';

const body: BuildingBodyPainter = (env, cx, cy) => {
  const { ctx } = env;
  const y = padTop(cy, 3);
  plinth(ctx, cx, cy, 3);

  for (const [sx, sy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
    const px = cx + sx * 87;
    const py = y + 2 + sy * 43;
    box(ctx, px, py - 2, 5, 2.5, 4, { base: HULL.dark });
    strip(ctx, px - 2, py - 3, 4, 1, HULL.accent);
  }

  box(ctx, cx, y - 10, 29, 14.5, 9, { base: HULL.dark });
  box(ctx, cx - 48, y - 15, 31, 15.5, 15, { base: HULL.plate });
  box(ctx, cx + 48, y - 12, 30, 15, 12, { base: HULL.mid });
  plateSeams(ctx, cx - 48, y - 15, 31, 15.5, rgba(HULL.recess, 0.2), 3);
  plateSeams(ctx, cx + 48, y - 12, 30, 15, rgba(HULL.recess, 0.2), 2);
  faceSeams(ctx, cx - 48, y - 15, 31, 15.5, 15, rgba(HULL.recess, 0.24), 3);
  faceWindows(ctx, cx - 79, y - 15, 31, 15.5, 3, HULL.recess);
  faceWindows(ctx, cx + 48, y + 3, 30, -15, 3, HULL.recess);
  strip(ctx, cx - 63, y - 9, 15, 2, HULL.accent);
  strip(ctx, cx + 35, y - 7, 12, 2, HULL.accent);

  box(ctx, cx, y - 28, 31, 15.5, 23, { base: HULL.dark });
  box(ctx, cx, y - 34, 26, 13, 7, { base: HULL.plate });
  faceSeams(ctx, cx, y - 28, 31, 15.5, 23, rgba(HULL.mid, 0.32), 3);
  faceWindows(ctx, cx - 31, y - 28, 31, 15.5, 3, HULL.recess);
  cable(ctx, [[cx - 57, y - 17], [cx - 34, y - 20], [cx - 22, y - 30]]);
  cable(ctx, [[cx + 56, y - 14], [cx + 34, y - 18], [cx + 22, y - 30]]);

  box(ctx, cx, y - 58, 19, 9.5, 26, { base: HULL.mid });
  faceSeams(ctx, cx, y - 58, 19, 9.5, 26, rgba(HULL.recess, 0.2), 2);
  strip(ctx, cx - 16, y - 37, 10, 3, HULL.accent);
  strip(ctx, cx + 5, y - 34, 8, 3, HULL.accent);

  const deck = y - 86;
  box(ctx, cx, deck, 32, 16, 28, { base: HULL.plate });
  plateSeams(ctx, cx, deck, 32, 16, rgba(HULL.recess, 0.22), 3);
  faceWindows(ctx, cx - 32, deck, 32, 16, 4, HULL.recess);
  faceWindows(ctx, cx + 32, deck + 16, 32, -16, 4, HULL.recess);
  box(ctx, cx, deck + 26, 33, 16.5, 3, { base: HULL.dark });
  strip(ctx, cx - 16, deck + 20, 32, 2, HULL.accent);

  const ring = deck - 3;
  box(ctx, cx, ring, 23, 11.5, 4, { base: HULL.dark, rim: false });
  ctx.strokeStyle = HULL.rib;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(cx, ring, 26, 13, 0, 0, Math.PI * 2);
  ctx.stroke();
  box(ctx, cx, ring - 5, 8, 4, 5, { base: HULL.plate });
  const mastTop = ring - 40;
  cable(ctx, [[cx, ring - 9], [cx, mastTop]]);
  line(ctx, [cx - 11, ring - 27], [cx + 11, ring - 27], HULL.dark, 2);
  line(ctx, [cx - 6, ring - 17], [cx + 6, ring - 17], HULL.dark);
  for (const dx of [-11, 11]) {
    line(ctx, [cx + dx, ring - 27], [cx + dx, ring - 34], HULL.dark, 2);
    strip(ctx, cx + dx - 1, ring - 35, 2, 2, GLOW.function);
  }

  const lx = cx + 27;
  const ly = y + 19;
  fillPoly(ctx, [[lx, ly - 10], [lx + 20, ly], [lx, ly + 10], [lx - 20, ly]], HULL.dark);
  for (const dy of [0, 6]) {
    line(ctx, [lx - 7, ly - 3 + dy], [lx, ly + 1 + dy], HULL.accent);
    line(ctx, [lx + 7, ly - 3 + dy], [lx, ly + 1 + dy], HULL.accent);
  }
  box(ctx, cx, y + 28, 25, 12.5, 4, { base: HULL.dark });
  box(ctx, cx, y + 35, 21, 10.5, 3, { base: HULL.mid });
  box(ctx, cx, y + 41, 16, 8, 2, { base: HULL.plate });
  for (const side of [-1, 1]) {
    line(ctx, [cx + side * 26, y + 28], [cx + side * 17, y + 42], HULL.dark, 2);
  }
};

const motion: BuildingPainter = (env, cx, cy) => {
  const { ctx, time } = env;
  const y = padTop(cy, 3);
  const ring = y - 89;
  const pulse = 0.5 + Math.sin(time / 700) * 0.5;
  ctx.strokeStyle = rgba(GLOW.primary, 0.55 + pulse * 0.35);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(cx, ring, 26, 13, 0, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 8; i += 1) {
    const angle = time / 3600 + i * Math.PI / 4;
    ctx.fillStyle = rgba(GLOW.primary, i % 2 === 0 ? 0.95 : 0.45);
    ctx.fillRect(Math.round(cx + Math.cos(angle) * 26) - 1, Math.round(ring + Math.sin(angle) * 13) - 1, 2, 2);
  }
  beacon(ctx, cx, ring - 42, time, GLOW.primary);
  beacon(ctx, cx - 76, y - 11, time + 250, GLOW.function);
  beacon(ctx, cx + 72, y - 8, time + 700, GLOW.function);
  for (let i = 0; i < 3; i += 1) {
    strip(ctx, cx - 27 + i * 8, y - 67 + i * 4, 5, 1, rgba(GLOW.function, 0.35 + pulse * 0.4));
  }
};

export const HQ_ART = {
  body,
  motion,
  bounds: { left: -112, top: -166, right: 112, bottom: 68 },
  healthY: -154,
} as const satisfies BuildingArt;
