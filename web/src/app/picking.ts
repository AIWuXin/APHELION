/**
 * Pointer picking on a torus.
 *
 * Split out of `app.ts` so the shell stays a wiring layer. Everything here is a
 * pure function of the camera and the snapshot: a screen point becomes a
 * **wrapped** tile, and a click is matched against footprints and unit positions
 * through the shortest signed offset -- so a click on the tile just past the
 * x = 10239/0 seam still hits a 2x2 pad anchored on the other side.
 */

import type { BuildingView } from '../generated/BuildingView';
import type { UnitView } from '../generated/UnitView';
import type { Camera } from '../render/iso';
import { toWorldTile } from '../render/iso';
import { deltaSpan, wrapSpan } from '../render/torus';

/** Offset from a tile's corner to its centre, in tiles. */
const TILE_OFFSET = 0.5;

/** A world tile plus the planet size it was wrapped into. */
export interface PickedTile {
  /** Tile column, `0..w-1`. */
  readonly tx: number;
  /** Tile row, `0..h-1`. */
  readonly ty: number;
  /** Planet circumference along x, in tiles. */
  readonly w: number;
  /** Planet circumference along y, in tiles. */
  readonly h: number;
}

/**
 * Screen point to a wrapped tile.
 *
 * `toWorldTile` already unwraps the point near the camera; the floor + wrap here
 * keeps the index inside `0..world-1` so a hover just left of the seam is tile
 * 10239 rather than -1.
 */
export function tileAt(cam: Camera, screenX: number, screenY: number): PickedTile {
  const tile = toWorldTile(cam, screenX, screenY);
  return {
    tx: wrapSpan(Math.floor(tile.x), cam.worldW),
    ty: wrapSpan(Math.floor(tile.y), cam.worldH),
    w: cam.worldW,
    h: cam.worldH,
  };
}

/** The building whose wrapped footprint contains a tile, if any. */
export function buildingAt(
  buildings: readonly BuildingView[],
  tile: PickedTile,
  footprintOf: (kind: number) => number,
): BuildingView | undefined {
  return buildings.find((b) => {
    const size = footprintOf(b.kind);
    const dx = deltaSpan(tile.tx + TILE_OFFSET, b.tx + size / 2, tile.w);
    const dy = deltaSpan(tile.ty + TILE_OFFSET, b.ty + size / 2, tile.h);
    return Math.abs(dx) <= size / 2 - 0.01 && Math.abs(dy) <= size / 2 - 0.01;
  });
}

/** The unit standing on (or flying over) a tile, if any. */
export function unitAt(units: readonly UnitView[], tile: PickedTile): UnitView | undefined {
  return units.find(
    (u) =>
      Math.abs(deltaSpan(tile.tx + TILE_OFFSET, u.x / 1024, tile.w)) < 0.9 &&
      Math.abs(deltaSpan(tile.ty + TILE_OFFSET, u.y / 1024, tile.h)) < 0.9,
  );
}
