/**
 * Camera rig: pan, zoom and the torus anchor for the isometric view.
 *
 * The projection stays strictly orthographic (invariant #1) -- zoom is a pure
 * magnification of that projection, never a perspective change. There is no
 * edge to clamp against any more: the planet wraps on both axes, so panning
 * simply moves the camera's anchor tile around the loop and `10239` sits next
 * to `0` on screen. The old "keep the diamond inside the viewport" clamp is
 * gone with the map edge it existed for.
 *
 * Screen transform: `screen = project(world - centre) + (ox, oy)`, all in
 * drawing-space pixels; the renderer applies `zoom` once.
 */

import type { Camera } from '../render/iso';
import { project, unproject } from '../render/iso';
import { wrapSpan } from '../render/torus';
import { METRICS } from '../style/tokens';

/** Smallest magnification: a bit wider than native. */
export const ZOOM_MIN = 0.75;
/** Largest magnification. */
export const ZOOM_MAX = 2.5;
/** Multiplier per wheel notch / key press. */
const ZOOM_STEP = 1.12;

/** Owns the camera; the renderer and the pointer code only read `camera`. */
export class CameraRig {
  private centreX = 0;
  private centreY = 0;
  private zoom = 1;
  private viewW = 1;
  private viewH = 1;
  private worldW = 1;
  private worldH = 1;
  private homeX = 0;
  private homeY = 0;

  /** Current camera, in the shape the renderer expects. */
  public get camera(): Camera {
    // The colony is framed in the free area left of the command rail rather
    // than dead centre, so the HUD never covers it.
    const freeCss = Math.max(320, this.viewW - METRICS.railW);
    const biasCss = (freeCss - this.viewW) / 2;
    const ox = (this.viewW / 2 + biasCss) / this.zoom;
    const oy = this.viewH / 2 / this.zoom;
    const centre = project(this.centreX, this.centreY, 0);
    return {
      x: ox - centre.x,
      y: oy - centre.y,
      ox,
      oy,
      centreX: this.centreX,
      centreY: this.centreY,
      width: this.viewW,
      height: this.viewH,
      zoom: this.zoom,
      worldW: this.worldW,
      worldH: this.worldH,
    };
  }

  /** Magnification as a whole percentage, for the debug overlay. */
  public get zoomPercent(): number {
    return Math.round(this.zoom * 100);
  }

  /** Camera anchor tile, wrapped: what the debug readout prints. */
  public get anchor(): { readonly tx: number; readonly ty: number } {
    return { tx: Math.floor(this.centreX), ty: Math.floor(this.centreY) };
  }

  /** Register the planet size plus the home tile the camera starts on. */
  public setWorld(width: number, height: number, homeX: number, homeY: number): void {
    this.worldW = Math.max(1, width);
    this.worldH = Math.max(1, height);
    this.homeX = wrapSpan(homeX, this.worldW);
    this.homeY = wrapSpan(homeY, this.worldH);
    this.centreX = this.homeX;
    this.centreY = this.homeY;
  }

  /** Viewport changed (window resize). */
  public resize(cssWidth: number, cssHeight: number): void {
    this.viewW = Math.max(1, cssWidth);
    this.viewH = Math.max(1, cssHeight);
  }

  /** Frame the colony anchor tile. */
  public frameColony(): void {
    this.centreX = this.homeX;
    this.centreY = this.homeY;
  }

  /** Pan by a CSS-pixel delta (mouse drag or keyboard). */
  public pan(dx: number, dy: number): void {
    const d = unproject(-dx / this.zoom, -dy / this.zoom);
    this.centreX = wrapSpan(this.centreX + d.x, this.worldW);
    this.centreY = wrapSpan(this.centreY + d.y, this.worldH);
  }

  /** Multiply the zoom, keeping the projected point under `(ax, ay)` fixed. */
  public zoomBy(factor: number, ax = this.viewW / 2, ay = this.viewH / 2): void {
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.zoom * factor));
    if (Math.abs(next - this.zoom) < 1e-4) return;
    // World point under the anchor, unwrapped relative to the current centre.
    const under = unproject(ax / this.zoom - this.camera.ox, ay / this.zoom - this.camera.oy);
    const wx = this.centreX + under.x;
    const wy = this.centreY + under.y;
    this.zoom = next;
    const freeCss = Math.max(320, this.viewW - METRICS.railW);
    const biasCss = (freeCss - this.viewW) / 2;
    const ox = (this.viewW / 2 + biasCss) / this.zoom;
    const oy = this.viewH / 2 / this.zoom;
    const back = unproject(ax / this.zoom - ox, ay / this.zoom - oy);
    this.centreX = wrapSpan(wx - back.x, this.worldW);
    this.centreY = wrapSpan(wy - back.y, this.worldH);
  }

  /** One wheel notch in (`+1`) or out (`-1`). */
  public zoomStep(direction: number, ax?: number, ay?: number): void {
    this.zoomBy(direction > 0 ? ZOOM_STEP : 1 / ZOOM_STEP, ax, ay);
  }

  /** Centre on a tile (wrapped, so a seam-crossing focus just works). */
  public focusTile(tx: number, ty: number): void {
    this.centreX = wrapSpan(tx, this.worldW);
    this.centreY = wrapSpan(ty, this.worldH);
  }

  /** Back to the colonial overview. */
  public reset(): void {
    this.zoom = 1;
    this.frameColony();
  }
}
