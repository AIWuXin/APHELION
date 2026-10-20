/**
 * The frame handed to the world renderer.
 *
 * This is a **presentation** record: it is derived from transport snapshots by
 * `app/`, and it holds no game rules. Keeping the seam here means the renderer
 * can be replaced wholesale, and the same record can be produced from a
 * WebSocket stream instead of wasm.
 */

import type { BootBlob } from '../generated/BootBlob';
import type { Snapshot } from '../generated/Snapshot';
import type { Camera } from './iso';

/** What the player currently has selected or is about to place. */
export interface Interaction {
  /** Entity id under selection, or 0. */
  readonly selected: number;
  /** Hovered tile, or `null`. */
  readonly hover: { readonly tx: number; readonly ty: number } | null;
  /** Building table index being placed, or `-1`. */
  readonly placing: number;
  /** Is the current ghost position legal? Queried from the simulation. */
  readonly placementOk: boolean;
  /** Highlighted tiles from the last alert ping. */
  readonly pings: readonly { readonly tx: number; readonly ty: number; readonly age: number }[];
}

/** Everything one rendered frame needs. */
export interface Frame {
  /** Static content and planet (already decoded). */
  readonly boot: BootBlob;
  /** Previous snapshot, for interpolation; may be the same object. */
  readonly previous: Snapshot;
  /** Latest snapshot. */
  readonly snapshot: Snapshot;
  /** 0..1 blend between `previous` and `snapshot`. */
  readonly alpha: number;
  /** Camera pan and viewport. */
  readonly camera: Camera;
  /** Selection / hover / ghost state. */
  readonly interaction: Interaction;
  /** Milliseconds since boot (animation clock, never used for rules). */
  readonly time: number;
  /** Draw debug aids (`?debug=1`). */
  readonly debug: boolean;
}
