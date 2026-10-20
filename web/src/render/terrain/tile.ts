/**
 * Shared types for the tile texture painters.
 *
 * A texture receives the tile's screen centre, its local iso basis (rx, ry) and
 * a neighbour probe so materials like road and brine can read connectivity.
 * The caller has already clipped to the tile rhombus and filled the base tone.
 */

import type { MaterialPaint } from '../world-palette';

/** Everything one material texture needs. */
export interface TileInfo {
  /** Target canvas. */
  readonly ctx: CanvasRenderingContext2D;
  /** Screen centre of the tile rhombus. */
  readonly cx: number;
  /** Screen centre of the tile rhombus. */
  readonly cy: number;
  /** Half-width of the tile rhombus (32). */
  readonly rx: number;
  /** Half-height of the tile rhombus (16). */
  readonly ry: number;
  /** Tile x coordinate (for deterministic noise). */
  readonly tx: number;
  /** Tile y coordinate (for deterministic noise). */
  readonly ty: number;
  /** The material recipe actually being painted. */
  readonly paint: MaterialPaint;
  /** The material index from the generated map (before companion mixing). */
  readonly source: number;
  /** Effective material index at a neighbour offset, or -1 off-map. */
  readonly materialAt: (dx: number, dy: number) => number;
}

/** A material's surface texture. Draws inside the already-clipped tile. */
export type MaterialTexture = (t: TileInfo) => void;
