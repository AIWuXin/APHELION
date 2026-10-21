/**
 * Colony landmarks: the command hub and the ore refinery.
 *
 * These two carry the read of the whole base, so they get bespoke art rather
 * than the shared 2x2 vocabulary: the hub is a 3x3 capital with the tallest
 * tower and an amber command ring, the refinery is a riveted metal-amber
 * industrial plant whose dark hopper faces the ore ground. Everything is built
 * from the same solids and palette as the rest of the colony (see
 * `world-palette.ts`); only the arrangement is unique.
 */

import type { BuildingPainter } from '../../sprite-contract';
import { box, cylinder, dome, fillPoly, line, type Pt } from '../../primitives';
import { rgba } from '../../../style/tokens';
import { DEPOSIT, GLOW, HULL, darken } from '../../world-palette';
import { beacon, cable, padPlate, plateSeams, plinth, rivets, strip, vent } from '../detail';
import { faceSeams, faceWindows, padTop } from './faces';

const paintHq: BuildingPainter = (env, cx, cy) => {
  const { ctx, time } = env;
  const y = padTop(cy, 3);
  plinth(ctx, cx, cy, 3, '#4d5456');

  // ---- armoured parade ground -----------------------------------------
  // The hub owns the only 3x3 plate on the map: a dark armour lip around the
  // poured pad, four corner nubs and hard amber guide lines on the two edges
  // that face the viewer.
  const pad = padPlate(cy, 3);
  const padY = pad.top;
  line(ctx, [cx, padY - pad.ry], [cx + pad.rx, padY], rgba('#ffffff', 0.1));
  line(ctx, [cx + pad.rx, padY], [cx, padY + pad.ry], rgba('#000000', 0.4), 2);
  line(ctx, [cx, padY + pad.ry], [cx - pad.rx, padY], rgba('#000000', 0.3), 2);
  for (const [sx, sy] of [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ] as const) {
    const px = cx + sx * pad.rx * 0.97;
    const py = padY + sy * pad.ry * 0.97;
    box(ctx, px, py - 3, 6, 3, 6, { base: HULL.dark });
    strip(ctx, px - 2, py - 4, 5, 1, rgba(GLOW.primary, 0.5));
  }

  // ---- administration ring: three staggered low blocks ------------------
  // North annex sits right behind the tower and is mostly hidden by it, which
  // is what makes the keep read as deeper than it is.
  box(ctx, cx - 2, y - 9, 30, 15, 9, { base: HULL.dark });
  plateSeams(ctx, cx - 2, y - 9, 30, 15, rgba('#000000', 0.3), 2);

  // West wing: the long civil-service bar.
  box(ctx, cx - 50, y - 15, 32, 16, 15, { base: HULL.mid });
  plateSeams(ctx, cx - 50, y - 15, 32, 16, rgba('#000000', 0.3), 3);
  rivets(ctx, cx - 50, y - 15, 32, 16, 0.05, 0.5, 0.95, 0.5, 9, rgba('#ffffff', 0.14));
  faceSeams(ctx, cx - 50, y - 15, 32, 16, 15, rgba('#000000', 0.28), 3);
  faceWindows(ctx, cx - 82, y - 15, 32, 16, 3, rgba(GLOW.function, 0.8));
  strip(ctx, cx - 60, y - 12, 10, 2, rgba(GLOW.primary, 0.45));
  beacon(ctx, cx - 78, y - 12, time + 250);

  // East wing: the short operations block, one step lower than the west bar.
  box(ctx, cx + 50, y - 12, 30, 15, 12, { base: darken(HULL.mid, 0.93) });
  plateSeams(ctx, cx + 50, y - 12, 30, 15, rgba('#000000', 0.32), 2);
  faceWindows(ctx, cx + 50, y + 3, 30, -15, 2, rgba(GLOW.function, 0.7));
  strip(ctx, cx + 40, y - 9, 12, 2, rgba(GLOW.primary, 0.4));
  beacon(ctx, cx + 74, y - 8, time + 700);

  // ---- tower keep -------------------------------------------------------
  box(ctx, cx, y - 24, 36, 18, 24, { base: HULL.dark });
  plateSeams(ctx, cx, y - 24, 36, 18, rgba('#000000', 0.34), 3);
  rivets(ctx, cx, y - 24, 36, 18, 0.05, 0.5, 0.95, 0.5, 11, rgba('#ffffff', 0.12));
  faceSeams(ctx, cx, y - 24, 36, 18, 24, rgba('#000000', 0.32), 4);
  faceWindows(ctx, cx - 36, y - 24, 36, 18, 3, rgba(GLOW.function, 0.6));
  strip(ctx, cx - 30, y - 10, 14, 2, rgba(GLOW.primary, 0.5));
  strip(ctx, cx + 12, y - 7, 12, 2, rgba(GLOW.primary, 0.32));

  // ---- command tower: the tallest vertical mass on the planet ----------
  const shaftTop = y - 66;
  box(ctx, cx, shaftTop, 22, 11, 42, { base: darken(HULL.mid, 0.95) });
  plateSeams(ctx, cx, shaftTop, 22, 11, rgba('#000000', 0.3), 2);
  faceSeams(ctx, cx, shaftTop, 22, 11, 42, rgba('#000000', 0.3), 4);
  for (let i = 0; i < 3; i += 1) {
    strip(ctx, cx - 19, y - 58 + i * 12, 14, 2, rgba(GLOW.function, 0.35 + i * 0.12));
  }
  // Rank stripe at the foot of the shaft, then the flag band under the deck.
  strip(ctx, cx - 21, shaftTop + 38, 18, 3, rgba(GLOW.primary, 0.5));
  strip(ctx, cx + 5, shaftTop + 40, 14, 2, rgba(GLOW.primary, 0.26));

  // ---- command deck: a wide crown on a narrow shaft ---------------------
  // The overhang is what makes the silhouette read as a control tower instead
  // of a stack of boxes; the deck's dark brim gives it a hard edge against the
  // sky-lit shaft.
  const deckTop = y - 92;
  box(ctx, cx, deckTop, 27, 13.5, 26, { base: HULL.plate });
  box(ctx, cx, deckTop + 24, 29, 14.5, 3, { base: HULL.dark });
  plateSeams(ctx, cx, deckTop, 27, 13.5, rgba('#000000', 0.34), 3);
  rivets(ctx, cx, deckTop, 27, 13.5, 0.05, 0.5, 0.95, 0.5, 10, rgba('#ffffff', 0.16));
  faceWindows(ctx, cx - 27, deckTop, 27, 13.5, 3, rgba(GLOW.function, 0.9));
  faceWindows(ctx, cx + 27, deckTop + 13.5, 27, -13.5, 2, rgba(GLOW.function, 0.6));
  strip(ctx, cx - 12, deckTop + 6, 24, 2, rgba(GLOW.primary, 0.55));

  // ---- amber command ring on the crown ---------------------------------
  const breathe = 0.5 + 0.5 * Math.sin(time / 640);
  // Dark lantern drum sitting on the deck, so the ring is a fixture bolted to
  // the roof rather than a floating halo.
  const ringTop = deckTop - 4;
  box(ctx, cx, ringTop, 23, 11.5, 4, { base: HULL.dark, rim: false });
  ctx.strokeStyle = rgba(GLOW.primary, 0.32 + breathe * 0.5);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, ringTop, 27, 13.5, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = rgba(GLOW.primary, 0.14 + breathe * 0.18);
  ctx.beginPath();
  ctx.ellipse(cx, ringTop, 17, 8.5, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Eight command lamps walk the ring: the one silhouette cue that survives a
  // zoom-out, even when the panel lines turn to mush.
  const spin = time / 3200;
  for (let i = 0; i < 8; i += 1) {
    const a = spin + (i * Math.PI) / 4;
    ctx.fillStyle = rgba(GLOW.primary, i % 2 === 0 ? 0.95 : 0.45);
    ctx.fillRect(
      Math.round(cx + Math.cos(a) * 27) - 1,
      Math.round(ringTop + Math.sin(a) * 13.5) - 1,
      2,
      2,
    );
  }
  // Crown lantern + omnidirectional mast.
  box(ctx, cx, ringTop - 5, 9, 4.5, 5, { base: HULL.dark });
  const mastTop = ringTop - 38;
  // A cable-style mast (dark core + 1px lit edge) holds up against the terrain
  // where a plain 2px grey line disappears.
  cable(ctx, [
    [cx, ringTop - 9],
    [cx, mastTop],
  ]);
  line(ctx, [cx - 10, ringTop - 26], [cx + 10, ringTop - 26], HULL.dark);
  line(ctx, [cx - 6, ringTop - 16], [cx + 6, ringTop - 16], rgba(GLOW.function, 0.5));
  for (const dx of [-10, 10]) {
    cable(ctx, [
      [cx + dx, ringTop - 26],
      [cx + dx, ringTop - 31],
    ]);
    ctx.fillStyle = rgba(GLOW.function, 0.85);
    ctx.fillRect(Math.round(cx + dx) - 1, Math.round(ringTop - 33), 2, 2);
  }
  // Breathing beacon: a slow halo, then the hard blink on the tip.
  ctx.fillStyle = rgba(GLOW.primary, 0.06 + breathe * 0.16);
  ctx.fillRect(Math.round(cx) - 5, Math.round(mastTop) - 6, 10, 10);
  beacon(ctx, cx, mastTop - 2, time, GLOW.primary);

  // ---- power/comm trunk from the wings up into the keep ----------------
  cable(ctx, [
    [cx - 58, y - 17],
    [cx - 34, y - 20],
    [cx - 22, y - 30],
  ]);
  cable(ctx, [
    [cx + 58, y - 13],
    [cx + 36, y - 18],
    [cx + 24, y - 30],
  ]);

  // ---- landing apron + steps, facing the player ------------------------
  const lx = cx + 26;
  const ly = y + 20;
  fillPoly(
    ctx,
    [
      [lx, ly - 10],
      [lx + 20, ly],
      [lx, ly + 10],
      [lx - 20, ly],
    ],
    rgba('#000000', 0.28),
  );
  for (const dy of [0, 6]) {
    line(ctx, [lx - 7, ly - 3 + dy], [lx, ly + 1 + dy], rgba(GLOW.primary, 0.5 - dy * 0.03));
    line(ctx, [lx + 7, ly - 3 + dy], [lx, ly + 1 + dy], rgba(GLOW.primary, 0.5 - dy * 0.03));
  }
  for (const [sx, sy] of [
    [-1, 0],
    [1, 0],
    [0, 1],
  ] as const) {
    ctx.fillStyle = rgba(GLOW.primary, 0.7);
    ctx.fillRect(Math.round(lx + sx * 18) - 1, Math.round(ly + sy * 8) - 1, 2, 2);
  }
  // Three terraced steps down to the ground plane at the front vertex, with
  // rails so they read as a processional stair rather than a floating plate.
  box(ctx, cx, y + 30, 26, 13, 4, { base: darken(HULL.pad, 0.95) });
  box(ctx, cx, y + 37, 22, 11, 3, { base: HULL.pad });
  box(ctx, cx, y + 43, 17, 8.5, 2, { base: darken(HULL.pad, 0.88) });
  for (const side of [-1, 1]) {
    line(ctx, [cx + side * 27, y + 30], [cx + side * 18, y + 44], rgba('#000000', 0.42), 2);
    line(ctx, [cx + side * 24, y + 36], [cx + side * 17, y + 44], rgba(GLOW.primary, 0.28));
  }
  strip(ctx, cx - 9, y + 36, 18, 1, rgba(GLOW.primary, 0.35));
  beacon(ctx, cx - 24, y + 42, time + 100);
  beacon(ctx, cx + 24, y + 42, time + 500);
};

const paintRefinery: BuildingPainter = (env, cx, cy) => {
  const { ctx, time } = env;
  const y = padTop(cy, 2);
  plinth(ctx, cx, cy, 2, '#4a4f4c');

  // ---- process hall, rear ---------------------------------------------
  // The hall is the lightest mass: everything the ore passes through happens
  // behind these two lit window bands.
  box(ctx, cx - 14, y - 28, 30, 15, 28, { base: HULL.mid });
  plateSeams(ctx, cx - 14, y - 28, 30, 15, rgba('#000000', 0.32), 3);
  rivets(ctx, cx - 14, y - 28, 30, 15, 0.05, 0.5, 0.95, 0.5, 9, rgba('#ffffff', 0.14));
  faceSeams(ctx, cx - 14, y - 28, 30, 15, 28, rgba('#000000', 0.26), 3);
  faceWindows(ctx, cx + 16, y - 13, 30, -15, 2, rgba(GLOW.function, 0.7));
  strip(ctx, cx - 40, y - 12, 22, 2, rgba(HULL.accent, 0.9));
  strip(ctx, cx - 36, y - 18, 12, 1, rgba(GLOW.function, 0.5));
  vent(ctx, cx - 20, y - 30, 12, time);

  // ---- riveted main processing tank, right ----------------------------
  cylinder(ctx, cx + 31, y - 36, 17, 8.5, 36, { base: HULL.plate });
  // Domed head where it holds pressure, dark skirt where it meets the plate.
  dome(ctx, cx + 31, y - 36, 16, 8, 9, { base: HULL.plate });
  cylinder(ctx, cx + 31, y - 5, 18, 9, 5, { base: HULL.recess, rim: false });
  // Hooped bands with a rivet row each: the tank is a pressure vessel, not a
  // cardboard tube.
  for (let i = 0; i < 3; i += 1) {
    strip(ctx, cx + 14, y - 26 + i * 9, 34, 1, rgba('#000000', 0.3));
    for (let k = 0; k < 7; k += 1) {
      ctx.fillStyle = rgba('#ffffff', 0.18);
      ctx.fillRect(Math.round(cx + 15 + k * 4.6), Math.round(y - 25 + i * 9), 1, 1);
    }
  }
  // Painted amber shoulder band: the "we refine metal" colour signature.
  strip(ctx, cx + 15, y - 33, 32, 3, rgba(HULL.accent, 0.72));
  // Relief valve and gauge on the dome.
  cable(ctx, [
    [cx + 31, y - 44],
    [cx + 36, y - 50],
    [cx + 45, y - 52],
  ]);
  strip(ctx, cx + 27, y - 43, 5, 1, rgba(GLOW.status, 0.55));

  // ---- exhaust stack with heat glow, front-right -----------------------
  const stackX = cx + 46;
  cylinder(ctx, stackX, y - 64, 6.5, 3.3, 64, { base: HULL.dark });
  strip(ctx, stackX - 6, y - 42, 12, 1, rgba('#000000', 0.45));
  strip(ctx, stackX - 6, y - 24, 12, 1, rgba('#000000', 0.45));
  // Dark-orange heat slots: the stack is running hot, but never a flame.
  const heat = 0.5 + 0.5 * Math.sin(time / 480);
  for (let i = 0; i < 3; i += 1) {
    strip(
      ctx,
      stackX - 5,
      y - 17 - i * 7,
      10,
      2,
      rgba(GLOW.primary, (0.2 + heat * 0.42) * (1 - i * 0.24)),
    );
  }
  // Hard 2px embers drifting off the crown (no blur, per the material contract).
  for (let i = 0; i < 3; i += 1) {
    const t = (time / 2000 + i / 3) % 1;
    ctx.fillStyle = rgba(GLOW.primary, 0.26 * (1 - t));
    ctx.fillRect(Math.round(stackX + t * 7), Math.round(y - 70 - t * 22), 2, 2);
  }
  beacon(ctx, stackX, y - 70, time, GLOW.primary);

  // ---- deep feed hopper, mouth aimed at the ore ground -----------------
  // The mouth is the darkest hole on the structure: a funnel bites out of the
  // lit face so the silhouette says "input" before any pipe does.
  const hx = cx - 30;
  box(ctx, hx, y - 24, 24, 12, 24, { base: HULL.dark, rim: false });
  // Hazard band on the hopper crown (painted amber, not a glow).
  strip(ctx, hx - 8, y - 21, 16, 2, rgba(HULL.accent, 0.85));
  const mouth: readonly Pt[] = [
    [hx - 22, y - 17],
    [hx - 4, y - 8],
    [hx - 4, y + 4],
    [hx - 22, y - 5],
  ];
  fillPoly(ctx, mouth, HULL.recess);
  // A 2px lit lip on the two near edges: the throat, not a decal.
  line(ctx, mouth[0] ?? [0, 0], mouth[3] ?? [0, 0], rgba(HULL.rib, 0.55), 2);
  line(ctx, mouth[0] ?? [0, 0], mouth[1] ?? [0, 0], rgba(HULL.rib, 0.45));
  for (let i = 0; i < 2; i += 1) {
    line(
      ctx,
      [hx - 18, y - 12 - i * 5],
      [hx - 10, y - 8 - i * 5],
      rgba(GLOW.primary, 0.45 - i * 0.16),
    );
  }
  // Spilled ore at the lip: the one place the raw material is visible.
  for (let i = 0; i < 3; i += 1) {
    ctx.fillStyle = i === 0 ? DEPOSIT.fleck : DEPOSIT.warm;
    ctx.fillRect(Math.round(hx - 25 + i * 4), Math.round(y - 2 - i), 2, 2);
  }
  ctx.fillStyle = DEPOSIT.dark;
  ctx.fillRect(Math.round(hx - 21), Math.round(y), 6, 2);
  // Hopper crown + feed chute up to the hall roof.
  box(ctx, hx, y - 29, 13, 6.5, 5, { base: HULL.plate });
  cable(ctx, [
    [hx, y - 31],
    [hx + 8, y - 33],
    [cx - 2, y - 31],
  ]);

  // ---- side conveyor ramp ---------------------------------------------
  // Ore is tipped in at the front of the pad and climbs up into the mouth.
  const rampTop = hx - 22;
  const rampTopY = y + 2;
  const rampFoot = cx - 24;
  const rampFootY = y + 17;
  for (const [width, color] of [
    [11, HULL.recess],
    [6, HULL.dark],
  ] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(rampTop, rampTopY);
    ctx.lineTo(rampFoot, rampFootY);
    ctx.stroke();
  }
  // Lit top edge + two rails: a ramp, not a wire.
  ctx.strokeStyle = rgba(HULL.plate, 0.5);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(rampTop, rampTopY - 4);
  ctx.lineTo(rampFoot, rampFootY - 4);
  ctx.stroke();
  for (const off of [-4, 4]) {
    line(
      ctx,
      [rampTop + off, rampTopY + off * 0.4],
      [rampFoot + off, rampFootY + off * 0.4],
      rgba('#000000', 0.35),
    );
  }
  // Ribs crawling up the belt show the feed actually moving.
  for (let i = 0; i < 4; i += 1) {
    const t = (time / 1100 + i / 4) % 1;
    ctx.fillStyle = rgba(DEPOSIT.fleck, 0.55);
    ctx.fillRect(
      Math.round(rampTop + (rampFoot - rampTop) * t),
      Math.round(rampTopY + (rampFootY - rampTopY) * t) - 1,
      3,
      2,
    );
  }
  // Legs + a receiving heap at the foot of the ramp.
  line(ctx, [rampTop + 5, rampTopY + 3], [rampTop + 5, rampTopY + 9], HULL.recess, 2);
  line(ctx, [rampFoot - 5, rampFootY - 3], [rampFoot - 5, rampFootY + 5], HULL.recess, 2);
  ctx.fillStyle = DEPOSIT.dark;
  ctx.fillRect(Math.round(rampFoot + 2), Math.round(rampFootY + 1), 8, 2);
  ctx.fillStyle = DEPOSIT.warm;
  ctx.fillRect(Math.round(rampFoot + 4), Math.round(rampFootY - 1), 3, 1);

  // ---- pipe bridge + process glow -------------------------------------
  cable(ctx, [
    [cx - 2, y - 30],
    [cx + 12, y - 33],
    [cx + 22, y - 36],
  ]);
  cable(ctx, [
    [cx + 20, y - 18],
    [cx + 34, y - 20],
    [stackX, y - 26],
  ]);
  const pulse = 0.5 + 0.5 * Math.sin(time / 520);
  strip(ctx, cx + 18, y - 15, 12, 2, rgba(GLOW.primary, 0.35 + pulse * 0.45));
  strip(ctx, cx + 10, y - 24, 6, 1, rgba(GLOW.function, 0.55));
};

/** The two landmark painters, registered by `sprites/buildings.ts`. */
export const LANDMARKS: Readonly<Record<string, BuildingPainter>> = {
  'command-hub': paintHq,
  refinery: paintRefinery,
};
