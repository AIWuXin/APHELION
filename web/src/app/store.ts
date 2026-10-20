/**
 * Session store.
 *
 * The only mutable presentation-side state. It never mirrors simulation values
 * for longer than one frame: snapshots are replaced wholesale.
 */

import type { BootBlob } from '../generated/BootBlob';
import type { Snapshot } from '../generated/Snapshot';

/** A map ping used to draw attention to an alert location. */
export interface Ping {
  readonly tx: number;
  readonly ty: number;
  /** Milliseconds since the ping was created. */
  age: number;
}

/** Everything the app needs between frames. */
export class Store {
  public boot: BootBlob | null = null;
  public previous: Snapshot | null = null;
  public current: Snapshot | null = null;
  public selected = 0;
  public selectedKind: 'building' | 'unit' | 'none' = 'none';
  public placing = -1;
  public placementOk = false;
  public hover: { tx: number; ty: number } | null = null;
  public pings: Ping[] = [];
  public fps = 0;
  public stepMs = 0;
  public snapshotBytes = 0;
  public banner = '';

  /** Push a new snapshot, keeping one behind for interpolation. */
  public pushSnapshot(snapshot: Snapshot): void {
    this.previous = this.current;
    this.current = snapshot;
  }

  /** Advance presentation-only timers. */
  public tickPings(dtMs: number): void {
    for (const p of this.pings) p.age += dtMs;
    this.pings = this.pings.filter((p) => p.age < 1400);
  }

  /** Add a ping, coalescing duplicates within 300ms. */
  public ping(tx: number, ty: number): void {
    const near = this.pings.some((p) => p.tx === tx && p.ty === ty && p.age < 300);
    if (!near) this.pings.push({ tx, ty, age: 0 });
  }

  /** Drop selection if the entity disappeared. */
  public validateSelection(): void {
    const snap = this.current;
    if (!snap || this.selected === 0) return;
    if (this.selectedKind === 'building') {
      if (!snap.buildings.some((b) => b.id === this.selected)) this.clearSelection();
    } else if (!snap.units.some((u) => u.id === this.selected)) {
      this.clearSelection();
    }
  }

  /** Clear the current selection. */
  public clearSelection(): void {
    this.selected = 0;
    this.selectedKind = 'none';
  }
}
