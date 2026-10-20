/**
 * Camera rig: pan, zoom and clamping for the isometric view.
 *
 * The projection stays strictly orthographic (invariant #1) -- zoom is a pure
 * magnification of that projection, never a perspective change. Clamping keeps
 * the planet filling the viewport: the map's *projected diamond* bounds are
 * `x in [-(h-1)·32, (w-1)·32]`, `y in [0, (w+h-2)·16]`, which is why the old
 * "0..width" clamp made the left half of the map unreachable.
 *
 * Screen transform: `screen = (project(world) + translate) * zoom`.
 */

import type { Camera } from '../render/iso';
import { METRICS, TILE } from '../style/tokens';

/** Smallest magnification: a bit wider than native. */
export const ZOOM_MIN = 0.75;
/** Largest magnification. */
export const ZOOM_MAX = 2.5;
/** Multiplier per wheel notch / key press. */
const ZOOM_STEP = 1.12;

const HALF_W = TILE.w / 2;
const HALF_H = TILE.h / 2;

/** Projected-diamond bounds of the playable map, in projected pixels. */
interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Owns the camera; the renderer and the pointer code only read `camera`. */
export class CameraRig {
  private x = 0;
  private y = 0;
  private zoom = 1;
  private viewW = 1;
  private viewH = 1;
  private bounds: Bounds = { minX: -1, maxX: 1, minY: -1, maxY: 1 };
  private hasWorld = false;

  /** Current camera, in the shape the renderer expects. */
  public get camera(): Camera {
    return { x: this.x, y: this.y, width: this.viewW, height: this.viewH, zoom: this.zoom };
  }

  /** Magnification as a whole percentage, for the debug overlay. */
  public get zoomPercent(): number {
    return Math.round(this.zoom * 100);
  }

  /** Register the map size and derive its projected bounds. */
  public setWorld(width: number, height: number): void {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    this.bounds = {
      minX: -(h - 1) * HALF_W - HALF_W,
      maxX: (w - 1) * HALF_W + HALF_W,
      minY: -HALF_H,
      maxY: (w - 1 + h - 1) * HALF_H + HALF_H,
    };
    this.hasWorld = true;
  }

  /** Viewport changed (window resize). */
  public resize(cssWidth: number, cssHeight: number): void {
    this.viewW = Math.max(1, cssWidth);
    this.viewH = Math.max(1, cssHeight);
    this.clamp();
  }

  /** Frame the colony (map centre) in the free area left of the command rail. */
  public frameColony(): void {
    const sx = 0;
    const sy = (this.bounds.maxY + this.bounds.minY) / 2;
    const freeCss = Math.max(320, this.viewW - METRICS.railW);
    this.x = freeCss / 2 / this.zoom - sx;
    this.y = this.viewH / 2 / this.zoom - sy;
    this.clamp();
  }

  /** Pan by a CSS-pixel delta (mouse drag or keyboard). */
  public pan(dx: number, dy: number): void {
    this.x += dx / this.zoom;
    this.y += dy / this.zoom;
    this.clamp();
  }

  /** Multiply the zoom, keeping the projected point under `(ax, ay)` fixed. */
  public zoomBy(factor: number, ax = this.viewW / 2, ay = this.viewH / 2): void {
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.zoom * factor));
    if (Math.abs(next - this.zoom) < 1e-4) return;
    const px = ax / this.zoom - this.x;
    const py = ay / this.zoom - this.y;
    this.zoom = next;
    this.x = ax / this.zoom - px;
    this.y = ay / this.zoom - py;
    this.clamp();
  }

  /** One wheel notch in (`+1`) or out (`-1`). */
  public zoomStep(direction: number, ax?: number, ay?: number): void {
    this.zoomBy(direction > 0 ? ZOOM_STEP : 1 / ZOOM_STEP, ax, ay);
  }

  /** Centre on a tile. */
  public focusTile(tx: number, ty: number): void {
    const sx = (tx - ty) * HALF_W;
    const sy = (tx + ty) * HALF_H;
    this.x = this.viewW / 2 / this.zoom - sx;
    this.y = this.viewH / 2 / this.zoom - sy;
    this.clamp();
  }

  /** Back to the colonial overview. */
  public reset(): void {
    this.zoom = 1;
    this.frameColony();
  }

  /**
   * Keep the map covering the viewport.
   *
   * Visible projected range is `[-x, -x + viewW/zoom]`; when the map is smaller
   * than the viewport on an axis, centre it instead of pinning an edge.
   */
  private clamp(): void {
    if (!this.hasWorld) return;
    const viewW = this.viewW / this.zoom;
    const viewH = this.viewH / this.zoom;
    const { minX, maxX, minY, maxY } = this.bounds;
    const spanX = maxX - minX;
    const spanY = maxY - minY;

    this.x =
      spanX <= viewW
        ? (viewW - spanX) / 2 - minX
        : Math.min(-minX, Math.max(viewW - maxX, this.x));

    this.y =
      spanY <= viewH
        ? (viewH - spanY) / 2 - minY
        : Math.min(-minY, Math.max(viewH - maxY, this.y));
  }
}
