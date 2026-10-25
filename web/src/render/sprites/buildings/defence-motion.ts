import type { BuildingPainter } from '../../sprite-contract';
import { box, line } from '../../primitives';
import { rgba } from '../../../style/tokens';
import { GLOW, HULL } from '../../world-palette';
import { beacon, cable, strip } from '../detail';
import { padTop } from './faces';

export const relayMotion: BuildingPainter = (env, cx, cy) => {
  const { ctx, time } = env;
  const y = padTop(cy, 1);
  const top = y - 65;
  const spin = time / 1700;
  const tilt = Math.cos(spin);
  const dx = cx + 13;
  const dy = top + 1;
  line(ctx, [cx, top + 2], [dx - 4, dy - 4], HULL.dark, 2);
  ctx.beginPath();
  ctx.ellipse(dx, dy, Math.abs(tilt) * 14 + 3, 8, 0, 0, Math.PI * 2);
  ctx.fillStyle = HULL.plate;
  ctx.fill();
  ctx.strokeStyle = HULL.rib;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(dx, dy, Math.max(3, Math.abs(tilt) * 9), 5, 0, 0, Math.PI * 2);
  ctx.fillStyle = HULL.dark;
  ctx.fill();
  line(ctx, [dx, dy], [dx + tilt * 6, dy - 6], HULL.recess);
  const phase = (time % 1300) / 1300;
  for (let i = 0; i < 3; i += 1) {
    const radius = 8 + i * 7 + phase * 6;
    ctx.strokeStyle = rgba(GLOW.function, 0.3 - i * 0.07);
    ctx.beginPath();
    ctx.ellipse(cx, top - 5, radius, radius * 0.5, 0, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
  }
  beacon(ctx, cx, top - 8, time, GLOW.function);
};

export const turretMotion: BuildingPainter = (env, cx, cy, view) => {
  const { ctx, time } = env;
  const y = padTop(cy, 1);
  const aim = time / 1050;
  const cos = Math.cos(aim);
  const sin = Math.sin(aim) * 0.5;
  box(ctx, cx, y - 23, 11, 5.5, 9, { base: HULL.plate });
  for (let i = 0; i < 2; i += 1) {
    const offset = i * 2 - 1;
    line(ctx, [cx + cos * 5, y - 25 + sin * 5 + offset], [cx + cos * 28, y - 25 + sin * 28 + offset], HULL.recess, 3);
    line(ctx, [cx + cos * 6, y - 26 + sin * 6 + offset], [cx + cos * 28, y - 26 + sin * 28 + offset], HULL.mid);
  }
  const charge = Math.max(0, Math.min(1, view.charge / 1000));
  if (charge > 0.05) {
    strip(ctx, cx + cos * 11 - 2, y - 28 + sin * 11, 5, 2, rgba(GLOW.primary, 0.3 + charge * 0.65));
  }
  strip(ctx, cx - 9, y - 15, 8, 1, rgba(GLOW.status, 0.65));
  beacon(ctx, cx - 12, y - 12, time, GLOW.status);
};

export const flakMotion: BuildingPainter = (env, cx, cy, view) => {
  const { ctx, time } = env;
  const y = padTop(cy, 1);
  box(ctx, cx, y - 20, 12, 6, 8, { base: HULL.plate });
  const kick = Math.max(0, 1 - view.charge / 1000) * 3;
  for (let i = 0; i < 4; i += 1) {
    const angle = -0.85 + i * 0.55;
    const bx = cx - 6 + i * 4;
    const by = y - 23;
    const ex = bx + Math.cos(angle) * 18;
    const ey = by - 18 + kick;
    line(ctx, [bx, by], [ex, ey], HULL.recess, 3);
    line(ctx, [bx, by - 1], [ex, ey - 1], HULL.dark);
    strip(ctx, ex - 1, ey - 1, 2, 2, HULL.mid);
  }
  beacon(ctx, cx + 11, y - 18, time, GLOW.primary);
};

export const bulwarkMotion: BuildingPainter = (env, cx, cy) => {
  const { ctx, time } = env;
  const y = padTop(cy, 1);
  strip(ctx, cx - 5, y - 21, 10, 1, rgba(GLOW.status, 0.55));
  beacon(ctx, cx + 20, y - 13, time, GLOW.status);
};

export const repairMotion: BuildingPainter = (env, cx, cy) => {
  const { ctx, time } = env;
  const y = padTop(cy, 1);
  const bob = Math.round(Math.sin(time / 600) * 2);
  box(ctx, cx, y - 49 + bob, 5, 2.5, 4, { base: HULL.plate, rim: false });
  for (const side of [-1, 1]) {
    line(ctx, [cx + side * 4, y - 48 + bob], [cx + side * 9, y - 46 + bob], HULL.dark, 2);
  }
  strip(ctx, cx - 4, y - 47 + bob, 3, 1, rgba(GLOW.function, 0.8));
  cable(ctx, [[cx - 18, y - 34], [cx - 7, y - 41 + bob]]);
  const pulse = 0.45 + Math.sin(time / 520) * 0.3;
  ctx.strokeStyle = rgba(GLOW.status, pulse);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(cx, y - 30, 11, 5, 0, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 3; i += 1) {
    const angle = time / 400 + i * 2.1;
    ctx.fillStyle = rgba(GLOW.status, 0.85);
    ctx.fillRect(Math.round(cx + Math.cos(angle) * 11), Math.round(y - 30 + Math.sin(angle) * 5), 1, 1);
  }
  beacon(ctx, cx + 9, y - 39, time, GLOW.status);
};
