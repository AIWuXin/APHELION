import type { BuildingArt, BuildingBodyPainter } from '../../sprite-contract';
import { box, cylinder, dome, line, prism } from '../../primitives';
import { rgba } from '../../../style/tokens';
import { GLOW, HULL } from '../../world-palette';
import { cable, plateSeams, plinth, strip } from '../detail';
import { LAB_ART_SCALE, padTop } from './faces';
import { fuelMotion, labMotion, solarMotion } from './structures-motion';

const solarBody: BuildingBodyPainter = (env, cx, cy) => {
  const { ctx } = env;
  const y = padTop(cy, 2);
  plinth(ctx, cx, cy, 2);
  for (const [dx, dy] of [[-26, -7], [26, -7], [-26, 22], [26, 22]] as const) {
    const px = cx + dx;
    const py = y + dy;
    for (const leg of [-16, 16]) {
      line(ctx, [px + leg, py - 2], [px + leg, py + 9], HULL.dark, 2);
      line(ctx, [px + leg, py - 2], [px + leg * 0.7, py + 7], HULL.plate);
    }
    const top = py - 9;
    box(ctx, px, py, 23, 11.5, 3, { base: HULL.dark, rim: false });
    const face = [[px, top - 13], [px + 23, top - 2], [px, top + 9], [px - 23, top - 2]] as const;
    ctx.beginPath();
    ctx.moveTo(face[0][0], face[0][1]);
    for (let i = 1; i < face.length; i += 1) ctx.lineTo(face[i]?.[0] ?? 0, face[i]?.[1] ?? 0);
    ctx.closePath();
    ctx.fillStyle = HULL.cell;
    ctx.fill();
    ctx.strokeStyle = HULL.mid;
    ctx.lineWidth = 1;
    ctx.stroke();
    for (let i = 1; i < 4; i += 1) {
      const t = i / 4;
      line(ctx, [px - 23 + 46 * t, top - 2], [px - 23 + 46 * t, top - 2 + (t < 0.5 ? -11 * t * 2 : -11 * (1 - t) * 2)], rgba(GLOW.function, 0.24));
      line(ctx, [px - 23 * (1 - t), top - 2 - 11 * (1 - t)], [px + 23 * t, top - 2 - 11 * t], rgba(GLOW.function, 0.18));
    }
    line(ctx, [px - 23, top - 2], [px, top - 13], rgba(GLOW.function, 0.5));
  }
  box(ctx, cx, y + 14, 9, 4.5, 10, { base: HULL.plate });
  cable(ctx, [[cx, y + 14], [cx, y - 2], [cx - 26, y - 9]]);
  cable(ctx, [[cx, y + 14], [cx, y - 2], [cx + 26, y - 9]]);
  strip(ctx, cx - 4, y + 10, 8, 2, HULL.recess);
};

const fuelBody: BuildingBodyPainter = (env, cx, cy) => {
  const { ctx } = env;
  const y = padTop(cy, 2);
  plinth(ctx, cx, cy, 2);
  for (const [dx, radius] of [[-24, 16], [23, 14]] as const) {
    const px = cx + dx;
    cylinder(ctx, px, y - 18, radius * 0.84, radius * 0.5, 15, { base: HULL.mid });
    dome(ctx, px, y - 19, radius, radius * 0.7, radius, { base: HULL.plate });
    cylinder(ctx, px, y - 5, radius * 0.68, radius * 0.35, 6, { base: HULL.dark });
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(px, y - 18, radius, radius * 0.7, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = HULL.accent;
    ctx.fillRect(px - radius, y - 16, radius * 2, 3);
    ctx.restore();
    box(ctx, px, y - 31, 3, 1.5, 5, { base: HULL.dark });
    cable(ctx, [[px, y - 5], [px, y + 5], [cx + 3, y + 7]]);
  }
  cylinder(ctx, cx + 3, y - 55, 6.5, 3.3, 49, { base: HULL.plate });
  for (let i = 0; i < 4; i += 1) {
    strip(ctx, cx - 3, y - 17 - i * 10, 12, 1, rgba(HULL.recess, 0.32));
  }
  strip(ctx, cx - 3, y - 50, 12, 3, HULL.accent);
  cylinder(ctx, cx + 3, y - 59, 8, 4, 4, { base: HULL.dark });
  box(ctx, cx - 3, y + 7, 12, 6, 7, { base: HULL.dark });
};

const labBody: BuildingBodyPainter = (env, cx, cy) => {
  const { ctx } = env;
  plinth(ctx, cx, cy, 1);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(LAB_ART_SCALE, LAB_ART_SCALE);
  ctx.translate(-cx, -cy);
  const y = padTop(cy, 1);
  box(ctx, cx - 8, y - 17, 29, 14.5, 16, { base: HULL.plate });
  plateSeams(ctx, cx - 8, y - 17, 29, 14.5, rgba(HULL.recess, 0.2), 3);
  dome(ctx, cx - 11, y - 23, 20, 10, 16, { base: HULL.plate });
  ctx.strokeStyle = rgba(HULL.dark, 0.35);
  ctx.beginPath();
  ctx.ellipse(cx - 11, y - 23, 16, 8, 0, Math.PI, 0);
  ctx.stroke();
  box(ctx, cx + 13, y - 13, 12, 6, 9, { base: HULL.dark });
  box(ctx, cx + 26, y - 22, 13, 6.5, 13, { base: HULL.mid });
  strip(ctx, cx + 14, y - 20, 10, 4, HULL.recess);
  line(ctx, [cx + 28, y - 29], [cx + 38, y - 42], HULL.dark, 5);
  line(ctx, [cx + 28, y - 30], [cx + 38, y - 43], HULL.plate, 2);
  prism(ctx, cx + 39, y - 42, 4, 2, 4, 1, { base: HULL.plate });
  strip(ctx, cx - 30, y - 15, 11, 2, HULL.recess);
  strip(ctx, cx - 4, y - 6, 17, 2, HULL.accent);
  ctx.restore();
};

export const SOLAR_ART = {
  body: solarBody, motion: solarMotion,
  bounds: { left: -80, top: -68, right: 80, bottom: 54 }, healthY: -60,
} as const satisfies BuildingArt;
export const FUEL_ART = {
  body: fuelBody, motion: fuelMotion,
  bounds: { left: -76, top: -96, right: 76, bottom: 54 }, healthY: -88,
} as const satisfies BuildingArt;
export const LAB_ART = {
  body: labBody, motion: labMotion,
  bounds: { left: -48, top: -62, right: 48, bottom: 38 }, healthY: -52,
} as const satisfies BuildingArt;
