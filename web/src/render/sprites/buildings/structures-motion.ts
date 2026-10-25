import type { BuildingPainter } from '../../sprite-contract';
import { line, polygon } from '../../primitives';
import { rgba } from '../../../style/tokens';
import { GLOW } from '../../world-palette';
import { beacon, strip } from '../detail';
import { LAB_ART_SCALE, padTop } from './faces';

export const solarMotion: BuildingPainter = (env, cx, cy) => {
  const { ctx, time } = env;
  const y = padTop(cy, 2);
  const offsets = [[-26, -7], [26, -7], [-26, 22], [26, 22]] as const;
  for (let i = 0; i < offsets.length; i += 1) {
    const [dx, dy] = offsets[i] ?? [0, 0];
    const px = cx + dx;
    const top = y + dy - 9;
    const glint = (time / 35 + i * 17) % 60 - 30;
    ctx.save();
    polygon(ctx, [[px, top - 13], [px + 23, top - 2], [px, top + 9], [px - 23, top - 2]]);
    ctx.clip();
    line(ctx, [px + glint, top - 15], [px + glint, top + 11], rgba(GLOW.function, 0.35), 2);
    ctx.restore();
  }
  const pulse = 0.55 + Math.sin(time / 600) * 0.35;
  strip(ctx, cx - 4, y + 10, 8, 2, rgba(GLOW.status, pulse));
  beacon(ctx, cx + 18, y + 22, time, GLOW.status);
};

export const fuelMotion: BuildingPainter = (env, cx, cy) => {
  const { ctx, time } = env;
  const y = padTop(cy, 2);
  const pulse = 0.5 + Math.sin(time / 700) * 0.5;
  for (const [dx, phase] of [[-24, 0], [23, 500]] as const) {
    const angle = time / 1700 + phase;
    line(ctx, [cx + dx - Math.cos(angle) * 4, y - 34], [cx + dx + Math.cos(angle) * 4, y - 34], GLOW.function);
    beacon(ctx, cx + dx, y - 38, time + phase, GLOW.function);
  }
  strip(ctx, cx - 1, y - 44, 7, 2, rgba(GLOW.primary, 0.4 + pulse * 0.45));
  beacon(ctx, cx + 3, y - 76, time, GLOW.primary);
};

export const labMotion: BuildingPainter = (env, cx, cy) => {
  const { ctx, time } = env;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(LAB_ART_SCALE, LAB_ART_SCALE);
  ctx.translate(-cx, -cy);
  const y = padTop(cy, 1);
  const phase = time / 1400;
  ctx.strokeStyle = rgba(GLOW.function, 0.48);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(cx - 11, y - 23, 19, 9.5, 0, phase, phase + 0.75);
  ctx.stroke();
  const pulse = 0.55 + Math.sin(time / 850) * 0.35;
  strip(ctx, cx - 30, y - 15, 11, 2, rgba(GLOW.status, pulse));
  strip(ctx, cx + 18, y - 20, 8, 2, rgba(GLOW.function, pulse));
  beacon(ctx, cx + 38, y - 46, time, GLOW.status);
  ctx.restore();
};
