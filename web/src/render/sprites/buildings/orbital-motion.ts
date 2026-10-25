import type { BuildingPainter } from '../../sprite-contract';
import { box, cylinder, fillPoly, line, prism } from '../../primitives';
import { rgba } from '../../../style/tokens';
import { GLOW, HULL } from '../../world-palette';
import { beacon, strip } from '../detail';
import { padTop } from './faces';

export const launchMotion: BuildingPainter = (env, cx, cy, view) => {
  const { ctx, time } = env;
  const y = padTop(cy, 2);
  const launching = view.state === 2;
  const ascent = launching ? Math.max(0, Math.min(1, view.progress / 1000)) : 0;
  const baseY = y - 10 - ascent * 150;
  if (launching) {
    for (let i = 1; i <= 6; i += 1) {
      const t = i / 6;
      const width = 7 - i * 0.7 + Math.sin(time / 65 + i) * 0.4;
      ctx.fillStyle = rgba(GLOW.primary, 0.55 * (1 - t) + 0.12);
      ctx.fillRect(Math.round(cx - width / 2), Math.round(baseY + 13 + t * 34), Math.max(1, Math.round(width)), 3);
    }
  }
  cylinder(ctx, cx, baseY - 3, 9, 4.5, 24, { base: HULL.plate });
  cylinder(ctx, cx, baseY - 27, 9, 4.5, 8, { base: HULL.plate });
  prism(ctx, cx, baseY - 31, 9, 4.5, 14, 0, { base: HULL.rib });
  fillPoly(ctx, [[cx - 8, baseY + 2], [cx - 16, baseY + 16], [cx - 6, baseY + 12]], HULL.dark);
  fillPoly(ctx, [[cx + 8, baseY + 2], [cx + 16, baseY + 16], [cx + 6, baseY + 12]], HULL.mid);
  strip(ctx, cx - 8, baseY - 16, 16, 3, HULL.accent);
  box(ctx, cx, baseY + 20, 6, 3, 3, { base: HULL.recess, rim: false });
  strip(ctx, cx - 3, baseY + 21, 6, 2, rgba(GLOW.primary, 0.85));
  beacon(ctx, cx - 50, y - 64, time, GLOW.primary);
  for (const [dx, dy] of [[31, 11], [-22, 16]] as const) {
    strip(ctx, cx + dx, y + dy, 9, 2, rgba(GLOW.primary, 0.4 + Math.sin(time / 500 + dx) * 0.2));
  }
};

export const dockMotion: BuildingPainter = (env, cx, cy) => {
  const { ctx, time } = env;
  const y = padTop(cy, 2);
  const trolley = 28 + Math.sin(time / 2500) * 20;
  box(ctx, cx + trolley, y - 48, 5, 2.5, 4, { base: HULL.accent, rim: false });
  line(ctx, [cx + trolley, y - 44], [cx + trolley, y - 27], HULL.recess);
  line(ctx, [cx + trolley - 3, y - 27], [cx + trolley, y - 23], HULL.dark);
  line(ctx, [cx + trolley + 3, y - 27], [cx + trolley, y - 23], HULL.dark);
  for (let i = 0; i < 5; i += 1) {
    const on = Math.sin(time / 480 + i * 1.2) > 0;
    ctx.fillStyle = rgba(GLOW.function, on ? 0.85 : 0.2);
    ctx.fillRect(Math.round(cx + 5 + i * 11), Math.round(y - 47 + i * 0.55), 2, 1);
  }
  const pulse = 0.5 + Math.sin(time / 650) * 0.4;
  for (let i = 0; i < 6; i += 1) {
    strip(ctx, cx - 34 + i * 12, y + 16, 5, 1, rgba(GLOW.function, 0.25 + pulse * 0.4));
  }
  beacon(ctx, cx + 51, y - 50, time, GLOW.function);
};

export const hangarMotion: BuildingPainter = (env, cx, cy) => {
  const { ctx, time } = env;
  const y = padTop(cy, 2);
  const pulse = 0.4 + Math.sin(time / 850) * 0.3;
  strip(ctx, cx - 42, y - 27, 38, 2, rgba(time % 1800 > 900 ? GLOW.primary : GLOW.function, pulse + 0.25));
  strip(ctx, cx - 42, y - 6, 38, 2, rgba(GLOW.function, 0.15 + pulse * 0.35));
  for (let i = 0; i < 3; i += 1) {
    strip(ctx, cx + 6 + i * 13, y - 39, 6, 1, rgba(GLOW.function, 0.2 + pulse * 0.4));
  }
  beacon(ctx, cx + 46, y - 36, time, GLOW.primary);
};

export const radarMotion: BuildingPainter = (env, cx, cy) => {
  const { ctx, time } = env;
  const y = padTop(cy, 2);
  const spin = time / 1700;
  const tilt = Math.cos(spin);
  const dx = cx + 24;
  const dy = y - 62;
  const rx = Math.abs(tilt) * 23 + 4;
  ctx.beginPath();
  ctx.ellipse(dx, dy, rx, 12, 0, 0, Math.PI * 2);
  ctx.fillStyle = HULL.plate;
  ctx.fill();
  ctx.strokeStyle = HULL.rib;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(dx, dy, Math.max(3, rx * 0.72), 8, 0, 0, Math.PI * 2);
  ctx.fillStyle = HULL.dark;
  ctx.fill();
  for (const side of [-1, 1]) {
    line(ctx, [dx + side * rx * 0.75, dy + 3], [dx + tilt * 8, dy - 10], HULL.mid);
  }
  line(ctx, [dx, dy], [dx + tilt * 8, dy - 11], HULL.recess, 2);
  box(ctx, dx + tilt * 8, dy - 12, 3, 1.5, 3, { base: HULL.accent, rim: false });
  for (const [radius, alpha] of [[37, 0.35], [28, 0.16]] as const) {
    ctx.strokeStyle = rgba(GLOW.function, alpha);
    ctx.beginPath();
    ctx.ellipse(cx + 20, y + 7, radius, radius * 0.43, 0, spin, spin + 0.62);
    ctx.stroke();
  }
  strip(ctx, cx - 33, y - 17, 10, 2, rgba(GLOW.status, 0.65));
  beacon(ctx, dx, dy - 15, time, GLOW.status);
};
