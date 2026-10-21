/**
 * Colony structures: solar array, fuel synthesis and the research lab.
 *
 * The two landmarks the colony is built around -- the command hub and the ore
 * refinery -- live in `landmarks.ts`: they are the only 3x3 / hero 2x2 pieces of
 * art, and moving them out keeps every painter module under the file-length
 * guard. State overlays live in `sprites/detail.ts`.
 */

import type { BuildingPainter } from '../../sprite-contract';
import { box, cylinder, dome, line, prism } from '../../primitives';
import { rgba } from '../../../style/tokens';
import { GLOW, HULL } from '../../world-palette';
import { beacon, cable, plateSeams, plinth, strip } from '../detail';
import { padTop } from './faces';

const paintSolar: BuildingPainter = (env, cx, cy) => {
  const { ctx, time } = env;
  const y = padTop(cy, 2);
  plinth(ctx, cx, cy, 2, '#41484a');
  // Four tilted panel banks filling the footprint.
  const offsets: readonly [number, number][] = [
    [-26, -6],
    [26, -6],
    [-26, 24],
    [26, 24],
  ];
  for (let i = 0; i < offsets.length; i += 1) {
    const off = offsets[i];
    if (!off) continue;
    const px = cx + off[0];
    const py = y + off[1];
    // Support legs.
    ctx.strokeStyle = HULL.recess;
    ctx.lineWidth = 2;
    for (const dx of [-16, 16]) {
      ctx.beginPath();
      ctx.moveTo(px + dx, py + 2);
      ctx.lineTo(px + dx, py + 8);
      ctx.stroke();
    }
    // Tilted panel: a dark frame plate plus a cell face raised off it.
    const top = py - 6;
    box(ctx, px, py, 22, 11, 3, { base: HULL.dark, rim: false });
    const face = [
      [px, top - 10],
      [px + 21, top - 3],
      [px, top + 4],
      [px - 21, top - 3],
    ] as const;
    ctx.beginPath();
    ctx.moveTo(face[0][0], face[0][1]);
    for (let k = 1; k < 4; k += 1) ctx.lineTo(face[k]?.[0] ?? 0, face[k]?.[1] ?? 0);
    ctx.closePath();
    ctx.fillStyle = HULL.cell;
    ctx.fill();
    ctx.strokeStyle = rgba('#000000', 0.55);
    ctx.lineWidth = 1;
    ctx.stroke();
    // Hard cyan cell grid, 1px.
    for (let k = 1; k < 4; k += 1) {
      const t = k / 4;
      line(
        ctx,
        [px - 21 * t, top - 3 - 3 * (1 - t)],
        [px + 21 * (1 - t), top - 3 + 3 * (1 - t) - 7],
        rgba(GLOW.function, 0.2),
      );
      line(ctx, [px - 21 + 42 * t, top - 3], [px - 21 + 42 * t, top - 10], rgba(GLOW.function, 0.16));
    }
    line(ctx, [px - 21, top - 3], [px, top - 10], rgba(GLOW.function, 0.55));
    line(ctx, [px, top - 10], [px + 21, top - 3], rgba('#ffffff', 0.1));
    // Slow glint crawling across the panel.
    const glint = ((time / 24 + i * 13) % 48) - 24;
    ctx.fillStyle = rgba(GLOW.function, 0.25);
    ctx.fillRect(Math.round(px + glint), Math.round(top - 8), 2, 1);
  }
  // Inverter box in the middle with a cable to each bank.
  box(ctx, cx, y + 14, 9, 4.5, 8, { base: HULL.mid });
  cable(ctx, [
    [cx, y + 14],
    [cx, y - 2],
    [cx - 26, y - 8],
  ]);
  cable(ctx, [
    [cx, y + 14],
    [cx, y - 2],
    [cx + 26, y - 8],
  ]);
  strip(ctx, cx - 4, y + 10, 8, 2, rgba(GLOW.primary, 0.75));
  beacon(ctx, cx + 18, y + 20, time);
};

const paintFuel: BuildingPainter = (env, cx, cy) => {
  const { ctx, time } = env;
  const y = padTop(cy, 2);
  plinth(ctx, cx, cy, 2, '#454b4d');
  // Two spherical fuel tanks on skirts.
  for (let i = 0; i < 2; i += 1) {
    const px = cx + (i === 0 ? -24 : 22);
    const r = i === 0 ? 16 : 14;
    cylinder(ctx, px, y - 8, r * 0.8, r * 0.4, 10, { base: HULL.dark });
    dome(ctx, px, y - 18, r, r * 0.72, r * 1.05, { base: '#818b88' });
    // Hazard band across the belly.
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(px, y - 18, r, r * 0.72, 0, 0, Math.PI);
    ctx.clip();
    for (let s = -r; s < r; s += 7) {
      ctx.fillStyle = rgba(GLOW.primary, 0.5);
      ctx.fillRect(Math.round(px + s), Math.round(y - 18), 3, Math.round(r * 0.7));
    }
    ctx.restore();
    // Rib line + valve.
    ctx.strokeStyle = rgba('#000000', 0.3);
    ctx.beginPath();
    ctx.ellipse(px, y - 18, r * 0.55, r * 0.4, 0, Math.PI, 0, false);
    ctx.stroke();
    ctx.fillStyle = HULL.recess;
    ctx.fillRect(px - 1, y - 18 - Math.round(r), 3, 4);
    beacon(ctx, px, y - (i === 0 ? 34 : 32), i === 0 ? time : time + 500, GLOW.function);
  }
  // Distillation column.
  cylinder(ctx, cx + 2, y - 40, 7, 3.5, 30, { base: HULL.plate });
  for (let i = 0; i < 4; i += 1) {
    strip(ctx, cx - 8, y - 14 - i * 8, 20, 1, rgba('#000000', 0.26));
  }
  const pulse = 0.5 + 0.5 * Math.sin(time / 700);
  strip(ctx, cx - 1, y - 32, 6, 2, rgba(GLOW.primary, 0.35 + pulse * 0.45));
  // Manifold pipes.
  for (let i = 0; i < 3; i += 1) {
    cable(ctx, [
      [cx - 40 + i * 3, y + 4],
      [cx - 10 + i * 2, y - 2],
      [cx + 4 + i * 2, y + 2],
    ]);
  }
  beacon(ctx, cx + 2, y - 72, time, GLOW.primary);
};

const paintLab: BuildingPainter = (env, cx, cy) => {
  const { ctx, time } = env;
  const y = padTop(cy, 1);
  plinth(ctx, cx, cy, 1, '#4a5050');
  box(ctx, cx, y - 14, 22, 11, 14, { base: HULL.mid });
  plateSeams(ctx, cx, y - 14, 22, 11, rgba('#000000', 0.3), 2);
  dome(ctx, cx, y - 16, 13, 6.5, 12, { base: '#77817e' });
  dome(ctx, cx + 11, y - 10, 7, 3.5, 7, { base: '#67716f' });
  // Green life-support glow + cyan data link.
  const pulse = 0.6 + 0.4 * Math.sin(time / 900);
  strip(ctx, cx - 10, y - 10, 9, 2, rgba(GLOW.status, 0.55 + pulse * 0.35));
  strip(ctx, cx - 10, y - 6, 5, 1, rgba(GLOW.status, 0.4));
  strip(ctx, cx + 2, y - 12, 6, 1, rgba(GLOW.function, 0.55));
  // Little telescope prism + dish.
  prism(ctx, cx - 18, y - 2, 3, 2, 9, 1, { base: '#6f7a78' });
  beacon(ctx, cx + 14, y - 22, time, GLOW.status);
};

/** The three non-landmark colony structures. */
export const STRUCTURES: Readonly<Record<string, BuildingPainter>> = {
  'solar-array': paintSolar,
  'fuel-synth': paintFuel,
  'research-lab': paintLab,
};
