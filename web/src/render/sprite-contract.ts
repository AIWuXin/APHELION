/**
 * Sprite contract.
 *
 * Asset painters are pure functions of (canvas, screen anchor, view data). They
 * never read the snapshot structure beyond the view record they are handed, and
 * they never compute game rules -- only geometry.
 *
 * Anchor convention: `cx, cy` is the screen position of the **centre of the
 * footprint on the ground**. A painter draws its base diamond around that point
 * and everything else upward (negative y) from it.
 */

import type { BuildingDef } from '../generated/BuildingDef';
import type { BuildingView } from '../generated/BuildingView';
import type { EffectView } from '../generated/EffectView';
import type { UnitDef } from '../generated/UnitDef';
import type { UnitView } from '../generated/UnitView';

/** Shared drawing environment. */
export interface SpriteEnv {
  /** Target canvas. */
  readonly ctx: CanvasRenderingContext2D;
  /** Milliseconds since boot, for idle animations. */
  readonly time: number;
  /** Tile size in pixels (always 64×32 today). */
  readonly tile: number;
}

/** Paints a placed building. */
export type BuildingPainter = (
  env: SpriteEnv,
  cx: number,
  cy: number,
  view: BuildingView,
  def: BuildingDef,
) => void;

export interface SpriteBox {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface BuildingBodyEnv {
  readonly ctx: CanvasRenderingContext2D;
  readonly tile: number;
}

export type BuildingBodyPainter = (
  env: BuildingBodyEnv,
  cx: number,
  cy: number,
  def: BuildingDef,
) => void;

export interface BuildingArt {
  readonly body: BuildingBodyPainter;
  readonly motion: BuildingPainter | null;
  readonly bounds: SpriteBox;
  readonly healthY: number;
}

/**
 * The fields every craft painter may read. Ground units and orbital contacts
 * share these, so one painter can serve both. `facing` is optional because
 * orbital contacts do not carry it.
 */
export type CraftView = Pick<
  UnitView,
  'id' | 'kind' | 'x' | 'y' | 'z' | 'hp' | 'hp_max' | 'state' | 'owner' | 'target'
> & { readonly facing?: number; readonly cargo?: number; readonly home?: number };

/** Paints a ground or low-air unit. */
export type UnitPainter = (
  env: SpriteEnv,
  cx: number,
  cy: number,
  view: CraftView,
  def: UnitDef,
) => void;

/** Paints an orbital contact. */
export type ShipPainter = UnitPainter;

/** Paints one transient effect at a screen position. */
export type EffectPainter = (
  env: SpriteEnv,
  cx: number,
  cy: number,
  view: EffectView,
) => void;

/** Everything the world layer can draw that is not terrain. */
export type DrawableKind = 'building' | 'unit' | 'ship' | 'effect';
