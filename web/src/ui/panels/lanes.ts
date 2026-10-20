/**
 * 星际航线 / SHIPPING LANES.
 *
 * One chip row per interplanetary lane: name, loads delivered, a 1px toggle
 * and a hairline throughput bar. Rows share the panel's border grid (no
 * floating cards) so the block reads as one instrument, matching the
 * directive rows above it.
 *
 * The toggle is optimistic: the sim owns the real state (a lane can refuse to
 * open without a dock, a pad or spare lift) and the next snapshot snaps the row
 * back if the command was rejected.
 */

import type { HudActions, HudView } from '../hud-api';
import { h, setClass, setText, setWidth } from '../dom';
import { seconds } from '../format';
import { createBar, createPanel } from '../panel';

interface LaneRefs {
  readonly root: HTMLElement;
  readonly name: HTMLElement;
  readonly en: HTMLElement;
  readonly loads: HTMLElement;
  readonly toggle: HTMLButtonElement;
  readonly fill: HTMLElement;
}

/** The shipping lanes panel. */
export class LanesPanel {
  public readonly element: HTMLElement;
  private readonly lanes: LaneRefs[] = [];

  public constructor(
    private readonly actions: HudActions,
    boot: HudView['boot'],
  ) {
    const parts = createPanel('星际航线', 'SHIPPING LANES', 'oc-panel--lanes');
    boot.catalog.routes.forEach((def, index) => {
      const name = h('span', { class: 'oc-lane__name', text: def.name_zh });
      const en = h('span', { class: 'oc-lane__en', text: def.name_en });
      const loads = h('span', { class: 'oc-lane__loads oc-num', text: 'L 0' });
      const toggle = h('button', {
        class: 'oc-btn oc-lane__toggle',
        text: '启用',
        title: `切换航线 ${def.name_zh}`,
      });
      toggle.addEventListener('click', () => this.actions.toggleRoute(index));
      const bar = createBar();
      const root = h(
        'div',
        {
          class: 'oc-lane',
          title: `${def.flavour} · 往返 ${seconds(def.period_ms)} · 运力 ${def.capacity} · 每趟 合金 ${def.alloy}${
            def.research > 0 ? ` / 研究 ${def.research}` : ''
          }`,
        },
        [
          h('div', { class: 'oc-lane__id' }, [name, en]),
          loads,
          toggle,
          bar.root,
        ],
      );
      this.lanes.push({ root, name, en, loads, toggle, fill: bar.fill });
      parts.body.append(root);
    });
    this.element = parts.root;
  }

  /** Refresh lane state, loads and throughput. */
  public update(view: HudView): void {
    const states = view.snapshot.orbital.routes;
    this.lanes.forEach((lane, index) => {
      const state = states[index];
      const active = state?.active === true;
      setClass(lane.root, 'is-on', active);
      setClass(lane.root, 'is-off', !active);
      setText(lane.toggle, active ? '启用中' : '启用');
      setClass(lane.toggle, 'is-on', active);
      setText(lane.loads, `L ${state?.loads ?? 0}`);
      setWidth(lane.fill, state ? state.throughput / 1000 : 0);
      setClass(lane.root, 'is-stalled', active && (state?.throughput ?? 0) < 30);
    });
  }
}
