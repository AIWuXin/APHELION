/**
 * Torus projection unit tests.
 *
 * The whole point of the planet being a torus is that `10239` is one tile to the
 * left of `0`. These tests pin that: the camera-relative projection has to place
 * the far side of the seam next to the near side, the pointer picker has to
 * return wrapped tile ids, and the interpolation between two snapshots must never
 * take the long way round.
 */

import { describe, expect, it } from 'vitest';

import { toScreen, toWorldTile } from '../../web/src/render/iso';
import type { Camera } from '../../web/src/render/iso';
import { deltaSpan, unwrapNear, wrapSpan } from '../../web/src/render/torus';
import { TILE } from '../../web/src/style/tokens';

const WORLD = 10_240;

/** A camera centred on a tile, at native zoom, in a 1280x720 viewport. */
function cameraAt(centreX: number, centreY: number): Camera {
  return {
    x: 0,
    y: 0,
    ox: 640,
    oy: 360,
    centreX,
    centreY,
    width: 1280,
    height: 720,
    zoom: 1,
    worldW: WORLD,
    worldH: WORLD,
  };
}

describe('torus helpers', () => {
  it('wraps both ways', () => {
    expect(wrapSpan(WORLD, WORLD)).toBe(0);
    expect(wrapSpan(-1, WORLD)).toBe(WORLD - 1);
    expect(wrapSpan(WORLD + 7, WORLD)).toBe(7);
    expect(wrapSpan(-WORLD - 1, WORLD)).toBe(WORLD - 1);
  });

  it('measures the short way across the seam', () => {
    expect(deltaSpan(0, WORLD - 1, WORLD)).toBe(-1);
    expect(deltaSpan(WORLD - 1, 0, WORLD)).toBe(1);
    expect(deltaSpan(10, 14, WORLD)).toBe(4);
    // Half a loop is the furthest a point can be; it resolves positive.
    expect(deltaSpan(0, WORLD / 2, WORLD)).toBe(WORLD / 2);
    // Fractions survive: this is what the renderer uses for unit positions.
    expect(deltaSpan(10239.75, 0.25, WORLD)).toBeCloseTo(0.5);
  });

  it('unwraps a target next to the viewer', () => {
    expect(unwrapNear(1, WORLD - 1, WORLD)).toBe(-1);
    expect(unwrapNear(WORLD - 1, 1, WORLD)).toBe(WORLD + 1);
    expect(unwrapNear(10, 10, WORLD)).toBe(10);
  });
});

describe('camera-relative projection', () => {
  it('places 10239 one tile left of 0 when the camera sits on the seam', () => {
    const cam = cameraAt(0.5, 0.5);
    const here = toScreen(cam, 0.5, 0.5, 0);
    const across = toScreen(cam, WORLD - 0.5, 0.5, 0);
    expect(here.x).toBeCloseTo(640);
    expect(here.y).toBeCloseTo(360);
    // One tile to the west is one half-tile-width left and one half-height up.
    expect(across.x).toBeCloseTo(640 - TILE.w / 2);
    expect(across.y).toBeCloseTo(360 - TILE.h / 2);
  });

  it('places 0 one tile right of 10239 from the other side', () => {
    const cam = cameraAt(WORLD - 0.5, 0.5);
    const here = toScreen(cam, WORLD - 0.5, 0.5, 0);
    const across = toScreen(cam, 0.5, 0.5, 0);
    // +x is down-and-right in this projection, so crossing the seam forward is
    // half a tile right and half a tile down.
    expect(across.x - here.x).toBeCloseTo(TILE.w / 2);
    expect(across.y - here.y).toBeCloseTo(TILE.h / 2);
  });

  it('keeps a footprint anchored on the seam contiguous', () => {
    // A 3x3 building anchored at 10238 with the camera on the seam: its nine
    // tiles must project to nine adjacent diamonds, not to two clusters.
    const cam = cameraAt(0.5, 0.5);
    const xs: number[] = [];
    for (let dy = 0; dy < 3; dy += 1) {
      for (let dx = 0; dx < 3; dx += 1) {
        const p = toScreen(cam, 10238 + dx + 0.5, 0.5 + dy, 0);
        xs.push(p.x);
      }
    }
    const spread = Math.max(...xs) - Math.min(...xs);
    // Three tiles across the seam span exactly two tile widths.
    expect(spread).toBeCloseTo(TILE.w * 2);
  });

  it('picks wrapped tile ids from the pointer', () => {
    const cam = cameraAt(0.5, 0.5);
    // One tile west of the camera centre is tile 10239, not -1.
    const left = toWorldTile(cam, 640 - TILE.w / 2, 360 - TILE.h / 2);
    expect(Math.floor(left.x)).toBe(WORLD - 1);
    expect(Math.floor(left.y)).toBe(0);
    // And the tile the centre lands on is 0,0.
    const centre = toWorldTile(cam, 640, 360);
    expect(Math.floor(centre.x)).toBe(0);
    expect(Math.floor(centre.y)).toBe(0);
  });
});
