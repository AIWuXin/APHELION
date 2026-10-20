/**
 * 作战序列 / DIRECTIVES.
 *
 * Three instrument rows (name + mono value + 2px hairline bar), sharing one
 * 1px border grid rather than floating as separate cards:
 *   来袭舰队  - the wave countdown, or 情报缺失 without radar coverage,
 *   轨道运力  - lift consumed / lift granted,
 *   航线吞吐  - rated alloy per minute of the open lanes.
 */

import type { RouteDef } from '../../generated/RouteDef';
import type { HudView } from '../hud-api';
import { clamp01, h, setClass, setText, setWidth, signed } from '../dom';
import { mmss, perMinute } from '../format';
import { createBar, createPanel } from '../panel';

/** Full-scale countdown for the fleet bar (first wave window). */
const ETA_SCALE_MS = 135_000;

interface RowRefs {
  readonly root: HTMLElement;
  readonly value: HTMLElement;
  readonly fill: HTMLElement;
}

/** The directives panel. */
export class DirectivesPanel {
  public readonly element: HTMLElement;
  private readonly fleet: RowRefs;
  private readonly lift: RowRefs;
  private readonly flow: RowRefs;
  private readonly routes: readonly RouteDef[];

  public constructor(boot: HudView['boot']) {
    this.routes = boot.catalog.routes;
    this.fleet = this.row('来袭舰队', 'FLEET ETA');
    this.lift = this.row('轨道运力', 'ORBITAL LIFT');
    this.flow = this.row('航线吞吐', 'RATED ALLOY');
    const parts = createPanel('作战序列', 'DIRECTIVES', 'oc-panel--rows');
    parts.body.append(this.fleet.root, this.lift.root, this.flow.root);
    this.element = parts.root;
  }

  /** Refresh the three rows. */
  public update(view: HudView): void {
    const o = view.snapshot.orbital;

    // 1. Fleet ETA. Zero means the colony lacks the sensors to know (or the
    //    wave is resolving); reporting 0 would be a lie, so say so.
    const known = o.fleet_eta_ms > 0;
    setClass(this.fleet.root, 'is-missing', !known);
    setClass(this.fleet.root, 'is-alert', known && o.fleet_eta_ms <= 25_000);
    setText(this.fleet.value, known ? mmss(o.fleet_eta_ms) : '情报缺失');
    setWidth(this.fleet.fill, known ? clamp01(o.fleet_eta_ms / ETA_SCALE_MS) : 0);

    // 2. Orbital lift.
    setText(this.lift.value, `${o.used} / ${o.capacity}`);
    setWidth(this.lift.fill, o.capacity > 0 ? clamp01(o.used / o.capacity) : 0);
    setClass(this.lift.root, 'is-alert', o.capacity > 0 && o.used > o.capacity);

    // 3. Rated lane throughput: content table x open lanes. The bar shows the
    //    smoothed real throughput so a stalled lane is visible even when open.
    let rated = 0;
    let throughput = 0;
    let open = 0;
    for (let i = 0; i < this.routes.length; i += 1) {
      const def = this.routes[i];
      const state = o.routes[i];
      if (!def || !state?.active) continue;
      rated += perMinute(def.alloy, def.period_ms);
      throughput += state.throughput;
      open += 1;
    }
    setClass(this.flow.root, 'is-muted', open === 0);
    setText(this.flow.value, open === 0 ? '—' : `${signed(Math.round(rated))}`);
    setWidth(this.flow.fill, open > 0 ? clamp01(throughput / open / 1000) : 0);
  }

  // ------------------------------------------------------------------ helpers

  private row(zh: string, en: string): RowRefs {
    const value = h('span', { class: 'oc-row__value oc-num', text: '--' });
    const bar = createBar();
    const root = h('div', { class: 'oc-row' }, [
      h('span', { class: 'oc-row__name', text: zh }),
      h('span', { class: 'oc-row__sub', text: en }),
      value,
      bar.root,
    ]);
    return { root, value, fill: bar.fill };
  }
}
