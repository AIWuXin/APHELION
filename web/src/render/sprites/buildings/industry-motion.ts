import type { BuildingPainter } from '../../sprite-contract';
import { line } from '../../primitives';
import { rgba } from '../../../style/tokens';
import { COAL, GLOW, HULL } from '../../world-palette';
import { beacon, strip } from '../detail';
import { padTop } from './faces';

export const coalMineMotion: BuildingPainter = (env, cx, cy) => {
  const { ctx, time } = env;
  const y = padTop(cy, 2);
  const wx = cx - 27;
  const wy = y - 5;
  const spin = time / 760;
  ctx.beginPath();
  ctx.arc(wx, wy, 20, 0, Math.PI * 2);
  ctx.fillStyle = COAL.recess;
  ctx.fill();
  ctx.strokeStyle = HULL.mid;
  ctx.lineWidth = 2;
  ctx.stroke();
  for (let i = 0; i < 10; i += 1) {
    const angle = spin + i * Math.PI / 5;
    const bx = Math.round(wx + Math.cos(angle) * 20);
    const by = Math.round(wy + Math.sin(angle) * 20);
    ctx.fillStyle = i % 2 === 0 ? HULL.plate : HULL.dark;
    ctx.fillRect(bx - 2, by - 2, 5, 5);
    ctx.fillStyle = COAL.recess;
    ctx.fillRect(bx - 1, by + 2, 3, 1);
  }
  for (let i = 0; i < 4; i += 1) {
    const angle = spin + i * Math.PI / 2;
    line(ctx, [wx, wy], [wx + Math.cos(angle) * 16, wy + Math.sin(angle) * 16], HULL.dark, 2);
  }
  ctx.beginPath();
  ctx.ellipse(wx, wy + 9, 22, 7, 0, 0, Math.PI);
  ctx.fillStyle = COAL.recess;
  ctx.fill();
  for (let i = 0; i < 5; i += 1) {
    const t = (time / 1050 + i / 5) % 1;
    ctx.fillStyle = i % 2 === 0 ? COAL.sheen : COAL.lump;
    ctx.fillRect(Math.round(wx + 10 + (cx + 4 - wx - 10) * t), Math.round(wy - 14 - 25 * t), 3, 2);
  }
  for (let i = 0; i < 2; i += 1) {
    const t = (time / 1900 + i * 0.5) % 1;
    ctx.fillStyle = rgba(COAL.dust, 0.45 * (1 - t));
    ctx.fillRect(Math.round(wx - 9 + t * 12), Math.round(wy + 6 - t * 9), 2, 2);
  }
  beacon(ctx, cx + 37, y - 32, time, GLOW.primary);
  strip(ctx, cx + 7, y - 10, 10, 1, rgba(GLOW.function, 0.55));
};

export const coalPlantMotion: BuildingPainter = (env, cx, cy) => {
  const { ctx, time } = env;
  const y = padTop(cy, 2);
  const burn = 0.55 + Math.sin(time / 440) * 0.45;
  strip(ctx, cx - 27, y - 12, 14, 3, rgba(GLOW.primary, 0.5 + burn * 0.4));
  strip(ctx, cx - 24, y - 7, 9, 1, rgba(GLOW.primary, 0.3 + burn * 0.3));
  const sx = cx + 29;
  for (let i = 0; i < 4; i += 1) {
    const t = (time / 3100 + i / 4) % 1;
    const size = 2 + Math.floor(t * 3);
    ctx.fillStyle = rgba(HULL.mid, 0.4 * (1 - t));
    ctx.fillRect(Math.round(sx + t * 13), Math.round(y - 78 - t * 29), size, size);
  }
  for (let i = 0; i < 3; i += 1) {
    const t = (time / 1000 + i / 3) % 1;
    ctx.fillStyle = COAL.sheen;
    ctx.fillRect(Math.round(cx - 46 + 13 * t), Math.round(y + 6 - 16 * t), 2, 1);
  }
  beacon(ctx, sx + 5, y - 72, time, GLOW.primary);
  strip(ctx, cx - 6, y - 5, 9, 1, rgba(GLOW.function, 0.35 + burn * 0.3));
};
