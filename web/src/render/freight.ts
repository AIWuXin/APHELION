/**
 * Petroleum guideways. Each line is derived from the authoritative home well
 * and the command hub, never from a second transport model or a tile-long loop.
 */

import { BUILDING_KEYS, UNIT_KEYS } from '../generated/content-keys';
import { rgba } from '../style/tokens';
import type { Frame } from './frame';
import { toRel, toScreen } from './iso';
import type { Camera } from './iso';
import { GLOW } from './world-palette';

const TRAIN = UNIT_KEYS.indexOf('freight-train');
const HUB = BUILDING_KEYS.indexOf('command-hub');
const MAX_POSTS = 24;

interface Point {
  readonly x: number;
  readonly y: number;
}

function segment(ctx: CanvasRenderingContext2D, a: Point, b: Point, color: string, width: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5);
  ctx.lineTo(Math.round(b.x) + 0.5, Math.round(b.y) + 0.5);
  ctx.stroke();
}

function guideway(ctx: CanvasRenderingContext2D, cam: Camera, from: Point, to: Point): void {
  const start = toRel(cam, from.x, from.y);
  const end = toRel(cam, to.x, to.y);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const at = (t: number): Point => toScreen(cam, start.x + dx * t, start.y + dy * t, 0);
  const a = at(0);
  const b = at(1);
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length < 1) return;
  const ox = (-(b.y - a.y) / length) * 2;
  const oy = ((b.x - a.x) / length) * 2;
  segment(ctx, { x: a.x + ox, y: a.y + oy }, { x: b.x + ox, y: b.y + oy }, rgba('#000000', 0.4), 3);
  segment(ctx, { x: a.x - ox, y: a.y - oy }, { x: b.x - ox, y: b.y - oy }, rgba('#000000', 0.4), 3);
  segment(ctx, { x: a.x + ox, y: a.y + oy }, { x: b.x + ox, y: b.y + oy }, rgba(GLOW.function, 0.35), 1);
  segment(ctx, { x: a.x - ox, y: a.y - oy }, { x: b.x - ox, y: b.y - oy }, rgba(GLOW.function, 0.35), 1);

  ctx.fillStyle = rgba(GLOW.primary, 0.42);
  const posts = Math.min(MAX_POSTS, Math.max(2, Math.ceil(Math.hypot(dx, dy) / 8)));
  for (let i = 0; i <= posts; i += 1) {
    const p = at(i / posts);
    ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 5);
  }
}

/** Draw every live well-to-hub link under buildings and trains. */
export function drawFreightLines(ctx: CanvasRenderingContext2D, frame: Frame): void {
  const hub = frame.snapshot.buildings.find((b) => b.kind === HUB && b.state !== 0);
  if (!hub) return;
  const hubSize = frame.boot.catalog.buildings[hub.kind]?.footprint ?? 3;
  const to = { x: hub.tx + hubSize / 2, y: hub.ty + hubSize / 2 };
  for (const unit of frame.snapshot.units) {
    if (unit.kind !== TRAIN || unit.home === 0) continue;
    const well = frame.snapshot.buildings.find((b) => b.id === unit.home && b.state !== 0);
    if (!well) continue;
    const size = frame.boot.catalog.buildings[well.kind]?.footprint ?? 2;
    guideway(ctx, frame.camera, { x: well.tx + size / 2, y: well.ty + size / 2 }, to);
  }
}
