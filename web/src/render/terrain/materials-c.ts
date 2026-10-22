/**
 * Surface texture painters, part three: the planet-scale biomes.
 *
 * Same contract as `materials-a.ts` / `materials-b.ts`: hard-edged, deterministic,
 * 1px detail, drawn inside a tile rhombus the caller has already clipped and
 * filled. Everything stays on the low-saturation mineral palette (D-03) -- the
 * saturated inks belong to ore, cyan links, health and hostiles, never to
 * ground.
 *
 * The seven rows:
 *  - `shallow` / `deep`: the far ocean. Deep is dark water with wandering
 *    swell lines and rare whitecaps; shallow lets the seabed show through and
 *    carries the crests. (Deep was nearly black once; players read it as
 *    empty void, so it now stays visibly water.)
 *  - `snow` / `tundra`: the cold bands, cold white-grey and frozen ground.
 *  - `desert`: dry and warm, wind-streaked plates.
 *  - `highland`: the bright, broken rock of the mineral belt.
 *  - `mossy-tundra`: tundra with the tufts packed in tight.
 */

import { mix } from '../../style/tokens';
import { STONE } from '../world-palette';
import { dot, fillIsoRect, isoLine, isoPoint, rand01, rand2 } from './noise';
import type { MaterialTexture, TileInfo } from './tile';

/** A long 1px sine streak along the tile's `a` axis. */
function streak(t: TileInfo, b: number, amp: number, phase: number, color: string, step = 1): void {
  for (let i = 0; i <= 32; i += step) {
    const a = i / 32;
    const bb = b + Math.sin(a * 5.6 + phase) * amp;
    const p = isoPoint(t.cx, t.cy, t.rx, t.ry, a, bb);
    dot(t.ctx, p[0], p[1], color);
  }
}

/** A short jagged crack between two iso-local points. */
function fracture(
  t: TileInfo,
  a0: number,
  b0: number,
  a1: number,
  b1: number,
  salt: number,
  color: string,
  steps = 9,
): void {
  for (let i = 0; i <= steps; i += 1) {
    const s = i / steps;
    const j = (rand2(t.tx * 5 + i, t.ty * 7, salt) - 0.5) * 0.06;
    const p = isoPoint(t.cx, t.cy, t.rx, t.ry, a0 + (a1 - a0) * s + j, b0 + (b1 - b0) * s - j);
    dot(t.ctx, p[0], p[1], color);
  }
}

/** A handful of small stones: dark seat, lit face. */
function chips(t: TileInfo, count: number, salt: number): void {
  const light = mix(STONE.light, t.paint.hi, 0.42);
  const dark = mix(STONE.dark, t.paint.lo, 0.42);
  for (let i = 0; i < count; i += 1) {
    const a = 0.12 + rand2(t.tx, t.ty, salt + i * 3) * 0.74;
    const b = 0.12 + rand2(t.tx, t.ty, salt + i * 3 + 1) * 0.74;
    const p = isoPoint(t.cx, t.cy, t.rx, t.ry, a, b);
    const x = Math.round(p[0]);
    const y = Math.round(p[1]);
    t.ctx.fillStyle = dark;
    t.ctx.fillRect(x, y, 2, 1);
    t.ctx.fillStyle = light;
    t.ctx.fillRect(x, y - 1, 2, 1);
  }
}

/** Shallow water: seabed showing through, crests on top. */
const shallow: MaterialTexture = (t) => {
  const p = t.paint;
  const { ctx, cx, cy, rx, ry } = t;
  // Seabed: a hard-edged sand shelf in the lower half, a dark trough above it.
  const shelf = rand01(t.tx, t.ty, 0x33);
  fillIsoRect(ctx, cx, cy, rx, ry, 0.1 + shelf * 0.3, 0.52, 0.92, 0.96, mix(p.lo, p.base, 0.55));
  fillIsoRect(ctx, cx, cy, rx, ry, 0.0, 0.06, 0.62, 0.4, mix(p.base, p.hi, 0.34));
  // Two long crest lines, thinner and softer than brine's scallops, and only on
  // some tiles: a crest on every tile of an ocean lines them up into comb teeth.
  if (rand01(t.tx, t.ty, 0x51) > 0.34) {
    streak(
      t,
      0.26 + rand2(t.tx, t.ty, 0x52) * 0.18,
      0.02,
      rand01(t.tx, t.ty, 0x53) * 6.28,
      p.hi,
    );
  }
  if (rand01(t.tx, t.ty, 0x61) > 0.62) {
    streak(
      t,
      0.6 + rand2(t.tx, t.ty, 0x62) * 0.2,
      0.02,
      rand01(t.tx, t.ty, 0x63) * 6.28,
      mix(p.hi, p.shine, 0.4),
    );
  }
  // A couple of bright points: sunlight through the water, not a glow.
  for (let i = 0; i < 2; i += 1) {
    const q = isoPoint(cx, cy, rx, ry, 0.2 + rand2(t.tx, t.ty, 0x71 + i) * 0.6, 0.2 + rand2(t.tx, t.ty, 0x81 + i) * 0.6);
    ctx.fillStyle = mix(p.shine, p.hi, 0.45);
    ctx.fillRect(Math.round(q[0]), Math.round(q[1]), 2, 1);
  }
  chips(t, 1, 0x91);
};

/** Deep ocean: dark water with long swells and rare whitecap glints. */
const deep: MaterialTexture = (t) => {
  const p = t.paint;
  const { ctx, cx, cy, rx, ry } = t;
  // Depth drift: a darker patch whose position wanders per tile. The first take
  // painted the same hard band on every tile, and at map scale those bands
  // aligned into diagonal stripes that read as empty void -- the jitter is what
  // keeps the ocean reading as water.
  const drift = rand01(t.tx, t.ty, 0x17);
  fillIsoRect(ctx, cx, cy, rx, ry, 0.08 + drift * 0.4, 0.5, 0.35 + drift * 0.5, 0.95, mix(p.base, p.lo, 0.5));
  fillIsoRect(ctx, cx, cy, rx, ry, 0.55 - drift * 0.4, 0.04, 0.85 - drift * 0.2, 0.3, mix(p.base, p.hi, 0.3));
  // Long swells, drawn on most tiles: the ocean's own texture.
  if (rand01(t.tx, t.ty, 0x1f) > 0.3) {
    streak(t, 0.22 + rand2(t.tx, t.ty, 0x21) * 0.2, 0.02, rand01(t.tx, t.ty, 0x2f) * 6.28, mix(p.base, p.hi, 0.6));
  }
  if (rand01(t.tx, t.ty, 0x35) > 0.6) {
    streak(t, 0.62 + rand2(t.tx, t.ty, 0x37) * 0.18, 0.02, rand01(t.tx, t.ty, 0x3b) * 6.28, mix(p.hi, p.shine, 0.35));
  }
  // A rare whitecap glint: one short bright dash, never a glow.
  if (rand01(t.tx, t.ty, 0x45) > 0.72) {
    const q = isoPoint(cx, cy, rx, ry, 0.25 + rand2(t.tx, t.ty, 0x47) * 0.5, 0.25 + rand2(t.tx, t.ty, 0x49) * 0.5);
    ctx.fillStyle = mix(p.shine, p.base, 0.4);
    ctx.fillRect(Math.round(q[0]), Math.round(q[1]), 2, 1);
  }
};

/** Snow field: wind crust, sastrugi ridges and frozen gravel. */
const snow: MaterialTexture = (t) => {
  const p = t.paint;
  const { ctx, cx, cy, rx, ry } = t;
  // A hard-edged drift sheet with a 1px shadow lip, like the regolith drifts.
  const drift = rand01(t.tx, t.ty, 0x27);
  fillIsoRect(ctx, cx, cy, rx, ry, 0.0, 0.16 + drift * 0.18, 0.86, 0.5, mix(p.base, p.hi, 0.6));
  isoLine(ctx, cx, cy, rx, ry, 0.0, 0.5, 0.86, 0.5, mix(p.lo, p.ink, 0.4));
  // Wind crust: one *broken* drift edge per tile, at a random offset and span.
  // Drawing the same three lines on every tile turns a snowfield into corduroy,
  // because neighbouring tiles line their streaks up.
  if (rand01(t.tx, t.ty, 0x31) > 0.42) {
    const b = 0.12 + rand2(t.tx, t.ty, 0x33) * 0.72;
    const a0 = 0.04 + rand2(t.tx, t.ty, 0x35) * 0.34;
    const a1 = Math.min(0.98, a0 + 0.3 + rand2(t.tx, t.ty, 0x37) * 0.52);
    const wobble = (rand2(t.tx, t.ty, 0x39) - 0.5) * 0.03;
    for (let k = 0; k <= 20; k += 1) {
      const a = a0 + ((a1 - a0) * k) / 20;
      const q = isoPoint(cx, cy, rx, ry, a, b + Math.sin(a * 9) * wobble);
      dot(ctx, q[0], q[1], k % 7 === 0 ? mix(p.base, p.hi, 0.5) : p.shine);
    }
  }
  // Sastrugi: short wind-carved ridges, one per few tiles.
  if (rand01(t.tx, t.ty, 0x57) > 0.5) {
    fracture(t, 0.3, 0.5, 0.62, 0.36, 0x5a, mix(p.lo, p.ink, 0.3), 7);
    fracture(t, 0.34, 0.54, 0.66, 0.4, 0x5b, p.shine, 6);
  }
  chips(t, 2, 0x71);
};

/** Permafrost: frost veins, polygonal cracks and cold gravel. */
const tundra: MaterialTexture = (t) => {
  const p = t.paint;
  const { ctx, cx, cy, rx, ry } = t;
  const patch = rand01(t.tx, t.ty, 0x13);
  fillIsoRect(ctx, cx, cy, rx, ry, 0.04, 0.2 + patch * 0.2, 0.6, 0.62, mix(p.base, p.lo, 0.45));
  fillIsoRect(ctx, cx, cy, rx, ry, 0.46, 0.3 + patch * 0.2, 1.0, 0.94, mix(p.base, p.hi, 0.3));
  // Polygon cracks: two angular frost veins plus one dark seam.
  fracture(t, 0.12, 0.42, 0.5, 0.3, 0x21, p.shine);
  fracture(t, 0.5, 0.3, 0.82, 0.62, 0x22, mix(p.hi, p.shine, 0.5));
  fracture(t, 0.46, 0.34, 0.6, 0.86, 0x23, p.ink, 7);
  // Frost bloom in the cracks of every other tile.
  if (rand01(t.tx, t.ty, 0x33) > 0.55) {
    const q = isoPoint(cx, cy, rx, ry, 0.2 + rand2(t.tx, t.ty, 0x35) * 0.5, 0.56);
    ctx.fillStyle = mix(p.shine, p.hi, 0.4);
    ctx.fillRect(Math.round(q[0]), Math.round(q[1]), 3, 1);
  }
  // Dry stalk and cold gravel: tundra is not bare rock.
  for (let i = 0; i < 2; i += 1) {
    const q = isoPoint(cx, cy, rx, ry, 0.2 + rand2(t.tx, t.ty, 0x51 + i) * 0.6, 0.3 + rand2(t.tx, t.ty, 0x61 + i) * 0.4);
    ctx.fillStyle = mix(p.grain, p.shine, 0.35);
    ctx.fillRect(Math.round(q[0]), Math.round(q[1]) - 2, 1, 2);
  }
  chips(t, 2, 0x81);
};

/** Arid desert: wind-streaked plates, cracked playa and pebble fields. */
const desert: MaterialTexture = (t) => {
  const p = t.paint;
  const { ctx, cx, cy, rx, ry } = t;
  const plate = rand01(t.tx, t.ty, 0x1b);
  fillIsoRect(ctx, cx, cy, rx, ry, 0.0, 0.1 + plate * 0.22, 0.92, 0.46 + plate * 0.2, mix(p.base, p.hi, 0.28));
  // Wind streaks: three long thin lines run with the dunes.
  for (let i = 0; i < 3; i += 1) {
    streak(
      t,
      0.16 + i * 0.26 + rand01(t.tx, t.ty, 0x2b + i) * 0.05,
      0.018,
      rand01(t.tx, t.ty, 0x3b + i) * 6.28,
      i === 1 ? mix(p.shine, p.hi, 0.45) : mix(p.base, p.lo, 0.5),
      2,
    );
  }
  // Dried playa plate: a hard-edged depression with a lit rim on its north side.
  if (rand01(t.tx, t.ty, 0x4d) > 0.42) {
    fillIsoRect(ctx, cx, cy, rx, ry, 0.24, 0.58, 0.78, 0.94, mix(p.base, p.lo, 0.6));
    const rim = isoPoint(cx, cy, rx, ry, 0.24, 0.58);
    ctx.fillStyle = mix(p.hi, p.shine, 0.3);
    ctx.fillRect(Math.round(rim[0]), Math.round(rim[1]), 20, 1);
  }
  // A dry shrub, one tile in three: two 1px twigs, never a tuft.
  if (rand01(t.tx, t.ty, 0x5f) > 0.66) {
    const q = isoPoint(cx, cy, rx, ry, 0.2 + rand2(t.tx, t.ty, 0x61) * 0.5, 0.4 + rand2(t.tx, t.ty, 0x63) * 0.2);
    ctx.fillStyle = mix(p.ink, p.lo, 0.35);
    ctx.fillRect(Math.round(q[0]), Math.round(q[1]) - 2, 1, 3);
    ctx.fillRect(Math.round(q[0]) + 1, Math.round(q[1]) - 1, 1, 2);
  }
  chips(t, 3, 0x9d);
};

/** Highland rock: brighter, more fractured, strewn with scree. */
const highland: MaterialTexture = (t) => {
  const p = t.paint;
  const { ctx, cx, cy, rx, ry } = t;
  // Two broken facets: a lit upper plate and a shadowed lower shelf.
  const f = rand01(t.tx, t.ty, 0x1d);
  fillIsoRect(ctx, cx, cy, rx, ry, 0.0, 0.0, 0.5 + f * 0.2, 0.44, mix(p.base, p.hi, 0.62));
  fillIsoRect(ctx, cx, cy, rx, ry, 0.42, 0.5, 1.0, 1.0, mix(p.base, p.lo, 0.55));
  // Four short fractures, the way a hard rock shatters.
  fracture(t, 0.08, 0.3, 0.46, 0.16, 0x31, p.ink, 7);
  fracture(t, 0.3, 0.1, 0.66, 0.42, 0x32, mix(p.ink, p.lo, 0.4), 8);
  fracture(t, 0.56, 0.46, 0.94, 0.72, 0x33, p.ink, 7);
  fracture(t, 0.2, 0.62, 0.52, 0.96, 0x34, mix(p.hi, p.shine, 0.4), 6);
  // Bright crest along the lit facet edge.
  const crest = isoPoint(cx, cy, rx, ry, 0.5 + f * 0.2, 0.44);
  ctx.fillStyle = mix(p.shine, p.hi, 0.4);
  ctx.fillRect(Math.round(crest[0]) - 14, Math.round(crest[1]), 14, 1);
  chips(t, 4, 0x41);
};

/** Dense moss tundra: permafrost underneath, tufts packed in tight. */
const mossyTundra: MaterialTexture = (t) => {
  const p = t.paint;
  const { ctx, cx, cy, rx, ry } = t;
  fillIsoRect(ctx, cx, cy, rx, ry, 0.04, 0.24, 0.52, 0.66, mix(p.base, p.lo, 0.5));
  fillIsoRect(ctx, cx, cy, rx, ry, 0.5, 0.4, 1.0, 0.9, mix(p.base, p.hi, 0.22));
  // Frost vein: the tundra underneath is still frozen.
  fracture(t, 0.14, 0.68, 0.52, 0.5, 0x51, mix(p.hi, p.shine, 0.45));
  // Tufts: twice the cluster count of plain moss, each one shorter.
  const clusters = 13;
  for (let c = 0; c < clusters; c += 1) {
    const a = 0.06 + rand2(t.tx, t.ty, 0x11 + c * 3) * 0.88;
    const b = 0.06 + rand2(t.tx, t.ty, 0x22 + c * 5) * 0.88;
    const base = isoPoint(cx, cy, rx, ry, a, b);
    const strands = 2 + (c & 1);
    for (let s = 0; s < strands; s += 1) {
      const h = 2 + ((c + s) & 1);
      const x = Math.round(base[0]) + s - 1;
      const y = Math.round(base[1]) - (s & 1);
      ctx.fillStyle = s === 0 ? p.hi : mix(p.hi, p.base, 0.4);
      ctx.fillRect(x, y - h, 1, h);
    }
    ctx.fillStyle = p.grain;
    ctx.fillRect(Math.round(base[0]) - 1, Math.round(base[1]) - 4, 1, 1);
  }
  chips(t, 1, 0x71);
};

/** The water pair. */
export const DEEP_TEXTURES = { shallow, deep } as const;

/** The four planet-scale land biomes plus the wet cold band. */
export const COLD_TEXTURES = { snow, tundra, desert, highland, mossyTundra } as const;
