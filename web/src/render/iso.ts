/**
 * Isometric projection for the presentation layer.
 *
 * Pure maths only -- this file must never learn a game rule. It mirrors
 * `crates/iso` so that the snapshot's fixed point world coordinates land on the
 * same 64×32 lattice the simulation used.
 */

import { TILE } from '../style/tokens';

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
 * Camera: what portion of the diamond is on screen.
 *
 * Transform chain: `screen = (project(world) + translate) * zoom`. The renderer
 * applies `zoom` as a canvas scale, so painters keep drawing in unscaled
 * "projected" pixels and the whole solid magnifies uniformly.
 */
export interface Camera {
  /** Pan offset in projected pixels. */
  x: number;
  /** Pan offset in projected pixels. */
  y: number;
  /** Viewport size in CSS pixels. */
  width: number;
  /** Viewport size in CSS pixels. */
  height: number;
  /** Magnification, 1 = native 64×32 tiles. Orthographic always: zoom never
   * introduces perspective, it only reframes. */
  zoom: number;
}

/** Project a world point to screen pixels (before the camera translate). */
export function project(x: number, y: number, z: number): Point {
  return {
    x: (x - y) * (TILE.w / 2),
    y: (x + y) * (TILE.h / 2) - z * TILE.z,
  };
}

/** Project and apply the camera transform, in the renderer's zoomed space. */
export function toScreen(cam: Camera, x: number, y: number, z: number): Point {
  const p = project(x, y, z);
  const zoom = cam.zoom;
  return { x: (p.x + cam.x) * zoom, y: (p.y + cam.y) * zoom };
}

/** Project into the renderer's own (pre-zoom) drawing space. */
export function toProjected(cam: Camera, x: number, y: number, z: number): Point {
  const p = project(x, y, z);
  return { x: p.x + cam.x, y: p.y + cam.y };
}

/** Inverse of {@link project} on the ground plane. */
export function unproject(sx: number, sy: number): { x: number; y: number } {
  const a = sx / (TILE.w / 2);
  const b = sy / (TILE.h / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/** CSS screen point to world tile coordinates (ground plane, z = 0). */
export function toWorldTile(cam: Camera, sx: number, sy: number): { x: number; y: number } {
  return unproject(sx / cam.zoom - cam.x, sy / cam.zoom - cam.y);
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

/** Is a projected point inside the viewport (with a margin), in CSS px? */
export function visible(cam: Camera, p: Point, margin = 96): boolean {
  const sx = (p.x + cam.x) * cam.zoom;
  const sy = (p.y + cam.y) * cam.zoom;
  return (
    sx > -margin &&
    sy > -margin &&
    sx < cam.width + margin &&
    sy < cam.height + margin
  );
}
