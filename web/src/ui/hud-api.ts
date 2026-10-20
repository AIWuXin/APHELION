/**
 * HUD boundary.
 *
 * The DOM layer owns its own markup and styling; the app only speaks this
 * interface. Swapping the HUD (or moving to React/Solid later) means
 * re-implementing this file's counterpart and nothing else.
 */

import type { BootBlob } from '../generated/BootBlob';
import type { Snapshot } from '../generated/Snapshot';

/** Player intent the HUD is allowed to express. The app turns each of these
 * into a `Command`; the HUD never touches simulation state. */
export interface HudActions {
  /** Queue a building from the build rail. */
  readonly selectBuilding: (kind: number) => void;
  /** Delete the currently selected structure. */
  readonly demolishSelected: () => void;
  /** Launch from the selected pad. */
  readonly launchSelected: () => void;
  /** Open or close a trade lane. */
  readonly toggleRoute: (route: number) => void;
  /** Spend research on a technology. */
  readonly research: (tech: number) => void;
  /** Toggle the sandbox bits. */
  readonly setSandbox: (flags: number) => void;
  /** Set the AI phase preset (0 opening, 1 mid, 2 late). */
  readonly setAiPhase: (phase: number) => void;
  /** Set the AI strength preset (0 peaceful, 1 normal, 2 fierce). */
  readonly setAiStrength: (strength: number) => void;
  /** Set simulation speed (0 = pause). */
  readonly setSpeed: (speed: number) => void;
  /** Pause toggle from the top bar. */
  readonly setPaused: (paused: boolean) => void;
  /** Centre the camera on a tile (used by alert pings). */
  readonly focusTile: (tx: number, ty: number) => void;
}

/** What the world layer tells the HUD about the pointer. */
export interface HudSelection {
  /** Selected entity id, or 0. */
  readonly id: number;
  /** `building` for structures, `unit` for mobile entities. */
  readonly kind: 'building' | 'unit' | 'none';
}

/** Read-only view into the running session that the HUD renders. */
export interface HudView {
  /** Latest snapshot. */
  readonly snapshot: Snapshot;
  /** Static content. */
  readonly boot: BootBlob;
  /** Current selection. */
  readonly selection: HudSelection;
  /** Building table index currently being placed, or -1. */
  readonly placing: number;
  /** Diagnostics, `?debug=1` only. */
  readonly debug: {
    readonly fps: number;
    readonly stepMs: number;
    readonly snapshotBytes: number;
    readonly banner: string;
  } | null;
}

/** The mounted HUD. */
export interface Hud {
  /** Replace the rendered model. Must not touch simulation state. */
  update(view: HudView): void;
  /** Advance presentation-only animation timers. */
  tick(dtMs: number): void;
  /** Show a one-shot alert strip. */
  alert(text: string, tone: number): void;
  /** Release listeners. */
  destroy(): void;
}
