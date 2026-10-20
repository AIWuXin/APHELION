/**
 * `?debug=1` overlay.
 *
 * Ten-pixel monospace block, bottom-left, pointer-transparent: frame rate, sim
 * step cost, protocol / tick / state hash, entity counts, snapshot size and the
 * wasm build banner. Values are read from `HudView.debug`; when the app is not
 * in debug mode the panel stays hidden.
 */

import type { HudView } from '../hud-api';
import { h, setClass, setText } from '../dom';

/** One key/value telemetry line. */
interface TelemetryRow {
  readonly value: HTMLElement;
}

/** The debug overlay. */
export class DebugOverlay {
  public readonly element: HTMLElement;
  private readonly rows = new Map<string, TelemetryRow>();

  public constructor() {
    const grid = h('div', { class: 'oc-debug__grid' });
    const defs: readonly (readonly [string, string])[] = [
      ['fps', '--'],
      ['step', '--'],
      ['proto', '--'],
      ['tick', '--'],
      ['hash', '--'],
      ['ent', '--'],
      ['snap', '--'],
      ['build', '--'],
    ];
    for (const [key, initial] of defs) {
      const value = h('span', { class: 'oc-debug__v oc-num', text: initial });
      grid.append(h('span', { class: 'oc-debug__k', text: key.toUpperCase() }), value);
      this.rows.set(key, { value });
    }
    this.element = h('div', { class: 'oc-debug' }, [
      h('div', { class: 'oc-debug__title', text: 'OC DEBUG // ?debug=1' }),
      grid,
    ]);
    this.element.hidden = true;
  }

  /** Refresh the block, or hide it when the app is not in debug mode. */
  public update(view: HudView): void {
    const dbg = view.debug;
    this.element.hidden = dbg === null;
    if (!dbg) return;
    const s = view.snapshot;
    this.set('fps', `${dbg.fps.toFixed(1)}`);
    this.set('step', `${dbg.stepMs.toFixed(2)}ms`);
    this.set('proto', `${s.protocol}`);
    this.set('tick', `${s.tick}`);
    this.set('hash', `0x${(s.hash >>> 0).toString(16).padStart(8, '0')}`);
    this.set('ent', `B${s.buildings.length} U${s.units.length} S${s.orbital.ships.length} FX${s.effects.length} BM${s.beams.length}`);
    this.set('snap', `${dbg.snapshotBytes}B`);
    this.set('build', dbg.banner);
    const fps = this.rows.get('fps');
    if (fps) setClass(fps.value, 'is-warn', dbg.fps > 0 && dbg.fps < 50);
  }

  private set(key: string, value: string): void {
    const row = this.rows.get(key);
    if (row) setText(row.value, value);
  }
}
