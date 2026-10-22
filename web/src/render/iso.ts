/**
 * Isometric projection for the presentation layer.
 *
 * Pure maths only -- this file must never learn a game rule. It mirrors
 * `crates/iso` so that the snapshot's fixed point world coordinates land on the
 * same 64×32 lattice the simulation used.
 *
 * The planet is a torus, so the camera is anchored on a tile and every world
 * point is first re-expressed as the copy of itself **nearest the camera
 * centre** ([`toRel`]). That is what makes tile 10239 sit next to tile 0 on
 * screen with no seam: the renderer never computes a raw `world - camera`
 * subtraction. `toWorldTile` goes the other way and always returns wrapped
 * tile coordinates.
 */

import { TILE } from '../style/tokens';
import { deltaSpan, wrapSpan } from './torus';

/** Screen-space point in CSS pixels. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** World-space position: tile units, `z` in the same unit as `x`/`y`. */
export interface World {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Camera: what portion of the torus is on screen.
 *
 * The camera is anchored on a **tile** (`centreX`, `centreY`, wrapped into the
 * world), never on a scroll offset, so panning forever never accumulates
 * floating point drift and there is no edge to clamp against.
 *
 * Transform chain, in drawing-space pixels (the renderer applies `zoom` once
 * with `setTransform`): `screen = project(world - centre) + (ox, oy)`, where
 * `(ox, oy)` is where the camera centre lands in the viewport. `x`/`y` are the
 * equivalent plain translate (`ox - project(centre)`), kept for the painter
 * code that offsets a pre-projected point.
 */
export interface Camera {
  /** Pan offset in projected pixels: `ox - project(centre).x`. */
  x: number;
  /** Pan offset in projected pixels: `oy - project(centre).y`. */
  y: number;
  /** Drawing-space position of the camera centre (`ox, oy`). */
  ox: number;
  /** Drawing-space position of the camera centre (`ox, oy`). */
  oy: number;
  /** Camera centre tile (wrapped into the world). */
  centreX: number;
  /** Camera centre tile (wrapped into the world). */
  centreY: number;
  /** Viewport size in CSS pixels. */
  width: number;
  /** Viewport size in CSS pixels. */
  height: number;
  /** Magnification, 1 = native 64×32 tiles. Orthographic always: zoom never
   * introduces perspective, it only reframes. */
  zoom: number;
  /** Planet circumference along x, in tiles. */
  worldW: number;
  /** Planet circumference along y, in tiles. */
  worldH: number;
}

/** Project a world point to screen pixels (before the camera translate). */
export function project(x: number, y: number, z: number): Point {
  return {
    x: (x - y) * (TILE.w / 2),
    y: (x + y) * (TILE.h / 2) - z * TILE.z,
  };
}

/**
 * Unwrap a world point to the copy of itself nearest the camera centre.
 *
 * `x`/`y` may be any (even fractional) world coordinate; the result is in the
 * camera's local, seam-free frame.
 */
export function toRel(cam: Camera, x: number, y: number): World {
  return {
    x: cam.centreX + deltaSpan(cam.centreX, x, cam.worldW),
    y: cam.centreY + deltaSpan(cam.centreY, y, cam.worldH),
    z: 0,
  };
}

/**
 * Project and translate into the renderer's **drawing space**.
 *
 * Zoom is deliberately *not* applied here: `Renderer.draw` sets
 * `setTransform(dpr·zoom, …)` once, so the whole frame -- baked terrain, solids,
 * effects, overlays -- is magnified in one place. Multiplying here as well would
 * apply the magnification twice and make buildings drift off their tiles
 * whenever `zoom ≠ 1`.
 */
export function toScreen(cam: Camera, x: number, y: number, z: number): Point {
  const r = toRel(cam, x, y);
  const p = project(r.x - cam.centreX, r.y - cam.centreY, z);
  return { x: p.x + cam.ox, y: p.y + cam.oy };
}

/** Inverse of {@link project} on the ground plane. */
export function unproject(sx: number, sy: number): { x: number; y: number } {
  const a = sx / (TILE.w / 2);
  const b = sy / (TILE.h / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/**
 * Drawing-space offset of a screen point from the camera centre, in tiles.
 *
 * Unwrapped: callers may add it to `centreX/centreY` themselves, which is what
 * the chunk streamer does when it derives the visible chunk range.
 */
export function screenToRel(cam: Camera, sx: number, sy: number): { x: number; y: number } {
  return unproject(sx / cam.zoom - cam.ox, sy / cam.zoom - cam.oy);
}

/** CSS screen point to **wrapped** world tile coordinates (ground plane, z = 0). */
export function toWorldTile(cam: Camera, sx: number, sy: number): { x: number; y: number } {
  const r = screenToRel(cam, sx, sy);
  return {
    x: wrapSpan(cam.centreX + r.x, cam.worldW),
    y: wrapSpan(cam.centreY + r.y, cam.worldH),
  };
}

/**
 * Depth key used to sort everything the world draws.
 *
 * Painter's algorithm: objects further along +x+y are "in front"; among equal
 * ground positions, higher z draws later so a rocket occludes the pad below it.
 */
export function depthKey(x: number, y: number, z: number): number {
  return (x + y) * 1000 + (z > 0 ? 1 : 0);
}

/**
 * Is a point of the renderer's drawing space inside the viewport?
 *
 * `p` is in drawing space (as returned by {@link toScreen}), so it is magnified
 * by `zoom` before being compared with the CSS viewport.
 */
export function visible(cam: Camera, p: Point, margin = 96): boolean {
  const sx = p.x * cam.zoom;
  const sy = p.y * cam.zoom;
  return sx > -margin && sy > -margin && sx < cam.width + margin && sy < cam.height + margin;
}
