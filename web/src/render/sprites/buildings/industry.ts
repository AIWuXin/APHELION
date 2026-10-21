/**
 * T1 coal industry: the coal extractor and the thermal plant.
 *
 * Both are era-1 structures that have to read as *carbon* machinery at 1x: the
 * extractor is a bucket wheel chewing a black pit, the plant is a boiler drum
 * feeding a tall stack. They use the same vocabulary as the rest of the colony
 * (plinth, plate seams, rivets, amber strips, beacon) and the shared {@link COAL}
 * paint, so they sit in the existing palette family without a new hue.
 */

import type { BuildingPainter } from '../../sprite-contract';
import { box, cylinder, dome } from '../../primitives';
import { rgba } from '../../../style/tokens';
import { COAL, GLOW, HULL } from '../../world-palette';
import { beacon, cable, plateSeams, plinth, rivets, strip, vent } from '../detail';
import { padTop } from './faces';

const paintCoalMine: BuildingPainter = (env, cx, cy) => {
  const { ctx, time } = env;
  const y = padTop(cy, 2);
  plinth(ctx, cx, cy, 2, '#3d4240');

  // ---- bucket wheel, half sunk in its own pit -------------------------
  const wx = cx - 25;
  const wy = y - 2;
  const r = 16;
  // The pit is a hard black bite out of the pad: no soft shadow, no gradient.
  ctx.beginPath();
  ctx.ellipse(wx, wy + 5, r + 8, 10, 0, 0, Math.PI * 2);
  ctx.fillStyle = COAL.recess;
  ctx.fill();
  ctx.strokeStyle = rgba(COAL.dust, 0.9);
  ctx.lineWidth = 1;
  ctx.stroke();

  // Rotating wheel: eight buckets on the rim are the teeth that chew the seam.
  const spin = time / 700;
  ctx.beginPath();
  ctx.arc(wx, wy, r, 0, Math.PI * 2);
  ctx.fillStyle = HULL.dark;
  ctx.fill();
  // 2px lit rim keeps a near-black wheel readable on a near-black pad.
  ctx.strokeStyle = rgba('#ffffff', 0.16);
  ctx.lineWidth = 2;
  ctx.stroke();
  for (let i = 0; i < 8; i += 1) {
    const a = spin + (i * Math.PI) / 4;
    const bx = Math.round(wx + Math.cos(a) * r);
    const by = Math.round(wy + Math.sin(a) * r);
    ctx.fillStyle = i % 2 === 0 ? HULL.plate : HULL.mid;
    ctx.fillRect(bx - 2, by - 2, 5, 5);
    ctx.fillStyle = COAL.recess;
    ctx.fillRect(bx - 1, by + 2, 3, 1);
  }
  // Two crossed spokes and a lit hub.
  ctx.strokeStyle = HULL.recess;
  ctx.lineWidth = 2;
  for (let i = 0; i < 2; i += 1) {
    const a = spin * 0.4 + (i * Math.PI) / 2;
    ctx.beginPath();
    ctx.moveTo(wx - Math.cos(a) * (r - 4), wy - Math.sin(a) * (r - 4));
    ctx.lineTo(wx + Math.cos(a) * (r - 4), wy + Math.sin(a) * (r - 4));
    ctx.stroke();
  }
  cylinder(ctx, wx, wy - 4, 6, 3, 6, { base: HULL.plate });
  // Sunk half: a black crescent over the lower rim sells "into the ground".
  ctx.beginPath();
  ctx.ellipse(wx, wy + 7, r - 1, 5, 0, 0, Math.PI);
  ctx.fillStyle = rgba(COAL.lump, 0.9);
  ctx.fill();

  // ---- conveyor from the wheel up into the hopper ---------------------
  const fromX = wx + 9;
  const fromY = wy - 12;
  const toX = cx + 2;
  const toY = y - 34;
  for (const [width, color] of [
    [7, HULL.recess],
    [4, HULL.dark],
  ] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();
  }
  // Lit top edge: the boom has to read as a solid member, not a hairline.
  ctx.strokeStyle = rgba(HULL.plate, 0.5);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY - 3);
  ctx.lineTo(toX, toY - 3);
  ctx.stroke();
  // Ribs crawling up the belt show the coal actually moving.
  for (let i = 0; i < 5; i += 1) {
    const t = (time / 900 + i / 5) % 1;
    const px = fromX + (toX - fromX) * t;
    const py = fromY + (toY - fromY) * t;
    ctx.fillStyle = rgba(COAL.sheen, 0.55);
    ctx.fillRect(Math.round(px), Math.round(py), 3, 1);
  }

  // ---- hopper: the one solid mass that anchors the silhouette ---------
  box(ctx, cx + 16, y - 18, 24, 13, 18, { base: COAL.hull });
  plateSeams(ctx, cx + 16, y - 18, 24, 13, rgba('#000000', 0.34), 3);
  rivets(ctx, cx + 16, y - 18, 24, 13, 0.1, 0.5, 0.9, 0.5, 7, rgba('#ffffff', 0.12));
  box(ctx, cx + 16, y - 25, 15, 8, 8, { base: HULL.mid });
  vent(ctx, cx + 8, y - 31, 12, time);
  strip(ctx, cx + 10, y - 14, 14, 2, rgba(GLOW.primary, 0.55));
  strip(ctx, cx + 10, y - 9, 8, 1, rgba(GLOW.function, 0.4));
  beacon(ctx, cx + 35, y - 27, time);

  // ---- stockpile: black heaps with a cold sheen ------------------------
  for (let i = 0; i < 2; i += 1) {
    const hx = cx + 28 - i * 13;
    const hy = y + 11 - i * 3;
    box(ctx, hx, hy, 7 - i, 3.6 - i * 0.6, 5 - i, { base: COAL.lump, rim: false, seam: false });
    ctx.fillStyle = COAL.sheen;
    ctx.fillRect(Math.round(hx) - 4, Math.round(hy) - 2, 3, 1);
  }
  ctx.fillStyle = COAL.dust;
  ctx.fillRect(cx + 12, y + 16, 6, 1);
  ctx.fillRect(cx + 21, y + 13, 4, 1);
};

const paintCoalPlant: BuildingPainter = (env, cx, cy) => {
  const { ctx, time } = env;
  const y = padTop(cy, 2);
  plinth(ctx, cx, cy, 2, '#43443f');

  // ---- boiler drum -----------------------------------------------------
  cylinder(ctx, cx - 18, y - 30, 18, 9, 30, { base: COAL.hull });
  dome(ctx, cx - 18, y - 30, 18, 9, 10, { base: '#4a4f4b' });
  for (let i = 0; i < 3; i += 1) {
    strip(ctx, cx - 34, y - 24 + i * 8, 32, 1, rgba('#000000', 0.3));
  }
  rivets(ctx, cx - 18, y - 8, 14, 6.5, 0.15, 0.5, 0.85, 0.5, 6, rgba('#ffffff', 0.1));
  // Furnace door: the one hot element, breathing with the burn.
  const burn = 0.55 + 0.45 * Math.sin(time / 420);
  strip(ctx, cx - 27, y - 14, 15, 3, rgba(GLOW.primary, 0.4 + burn * 0.5));
  strip(ctx, cx - 27, y - 8, 10, 2, rgba(GLOW.primary, 0.3 + burn * 0.3));
  box(ctx, cx - 18, y - 30, 7, 3.5, 3, { base: HULL.plate });
  vent(ctx, cx - 26, y - 40, 12, time);

  // ---- chimney: tall, banded and unmistakable --------------------------
  const chx = cx + 27;
  // Charcoal stack: the plant is carbon machinery, not a steel silo.
  cylinder(ctx, chx, y - 52, 7, 3.6, 52, { base: '#4a4e48' });
  for (let i = 0; i < 4; i += 1) {
    strip(ctx, chx - 7, y - 12 - i * 10, 14, 1, rgba('#000000', 0.32));
  }
  // Hazard band near the crown, then the dark flue collar.
  strip(ctx, chx - 7, y - 46, 14, 2, rgba(GLOW.primary, 0.7));
  cylinder(ctx, chx, y - 56, 8, 4.2, 4, { base: COAL.recess });
  // Smoke: hard 3px puffs drifting up-right, faded by age. No blur.
  for (let i = 0; i < 3; i += 1) {
    const t = (time / 2600 + i / 3) % 1;
    const size = 2 + Math.round(t * 2);
    ctx.fillStyle = rgba('#9aa5a4', 0.3 * (1 - t));
    ctx.fillRect(Math.round(chx + t * 12), Math.round(y - 60 - t * 26), size, size);
  }

  // ---- turbine hall, steam pipe and coal feed --------------------------
  box(ctx, cx - 2, y - 12, 13, 7, 12, { base: HULL.mid });
  plateSeams(ctx, cx - 2, y - 12, 13, 7, rgba('#000000', 0.32), 2);
  strip(ctx, cx - 11, y - 6, 10, 2, rgba(GLOW.function, 0.5));
  strip(ctx, cx + 3, y - 8, 5, 1, rgba(GLOW.primary, 0.6));
  cable(ctx, [
    [cx - 6, y - 34],
    [cx + 12, y - 40],
    [cx + 24, y - 44],
  ]);
  // Coal feed: a chute and a heap at the boiler's left shoulder.
  box(ctx, cx - 38, y - 2, 9, 4.5, 4, { base: COAL.recess });
  box(ctx, cx - 44, y + 8, 6, 3, 4, { base: COAL.lump, rim: false, seam: false });
  ctx.fillStyle = COAL.sheen;
  ctx.fillRect(cx - 47, y + 4, 3, 1);
  ctx.fillStyle = COAL.dust;
  ctx.fillRect(cx - 33, y + 6, 5, 1);
  beacon(ctx, cx + 34, y - 58, time);
};

/** The two T1 coal-industry structures. */
export const INDUSTRY: Readonly<Record<string, BuildingPainter>> = {
  'coal-mine': paintCoalMine,
  'coal-plant': paintCoalPlant,
};
