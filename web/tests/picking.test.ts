/**
 * Pointer picking unit tests.
 *
 * A picked tile is an integer index, but a footprint is a rectangle of tiles, so
 * the picker must compare the tile's *centre* against the footprint's centre.
 * These tests pin the resulting hit boxes -- above all that a 1x1 building is
 * clickable on its own tile and on no neighbour.
 */

import { describe, expect, it } from 'vitest';

import { buildingAt } from '../../web/src/app/picking';
import type { PickedTile } from '../../web/src/app/picking';
import type { BuildingView } from '../../web/src/generated/BuildingView';

const WORLD = 10_240;

function tile(tx: number, ty: number): PickedTile {
  return { tx, ty, w: WORLD, h: WORLD };
}

/** Kind doubles as the footprint edge, so each case reads as its own size. */
function footprintOf(kind: number): number {
  return kind;
}

function building(kind: number, tx: number, ty: number): BuildingView {
  return {
    id: 1,
    kind,
    tx,
    ty,
    hp: 100,
    hp_max: 100,
    state: 0,
    progress: 0,
    production_milli: 0,
    charge: 0,
    flags: 0,
    aux: 0,
  };
}

describe('buildingAt', () => {
  it('hits a 1x1 building on its own tile', () => {
    const solar = building(1, 42, 17);
    expect(buildingAt([solar], tile(42, 17), footprintOf)).toBe(solar);
  });

  it('does not hit a 1x1 building on a neighbouring tile', () => {
    const solar = building(1, 42, 17);
    for (const spot of [tile(41, 17), tile(43, 17), tile(42, 16), tile(42, 18)]) {
      expect(buildingAt([solar], spot, footprintOf)).toBeUndefined();
    }
  });

  it('hits all four tiles of a 2x2 footprint', () => {
    const pad = building(2, 100, 200);
    for (let dy = 0; dy < 2; dy += 1) {
      for (let dx = 0; dx < 2; dx += 1) {
        expect(buildingAt([pad], tile(100 + dx, 200 + dy), footprintOf)).toBe(pad);
      }
    }
  });

  it('hits all nine tiles of a 3x3 footprint', () => {
    const hub = building(3, 100, 200);
    for (let dy = 0; dy < 3; dy += 1) {
      for (let dx = 0; dx < 3; dx += 1) {
        expect(buildingAt([hub], tile(100 + dx, 200 + dy), footprintOf)).toBe(hub);
      }
    }
  });

  it('keeps a footprint contiguous across the seam', () => {
    const hub = building(3, WORLD - 2, 10);
    for (const tx of [WORLD - 2, WORLD - 1, 0]) {
      expect(buildingAt([hub], tile(tx, 10), footprintOf)).toBe(hub);
    }
  });

  it('returns nothing on empty ground', () => {
    const solar = building(1, 42, 17);
    expect(buildingAt([solar], tile(80, 90), footprintOf)).toBeUndefined();
    expect(buildingAt([], tile(42, 17), footprintOf)).toBeUndefined();
  });
});
