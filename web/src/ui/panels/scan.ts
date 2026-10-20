/**
 * 星区态势 / TACTICAL SCAN.
 *
 * Wraps the canvas radar in the shared panel chrome and adds the instrument
 * strip underneath: sector id, sensor state, orbital shell. The strip is where
 * the "no radar = no ETA" gameplay rule becomes visible in words.
 */

import { BUILDING_KEYS } from '../../generated/content-keys';
import type { HudView } from '../hud-api';
import { h, setClass, setText } from '../dom';
import { createPanel } from '../panel';
import { Radar } from '../radar';

const RADAR = BUILDING_KEYS.indexOf('radar-array');

/** The scan panel. */
export class ScanPanel {
  public readonly element: HTMLElement;
  private readonly radar: Radar;
  private readonly wave: HTMLElement;
  private readonly intel: HTMLElement;
  private readonly intelText: HTMLElement;

  public constructor(boot: HudView['boot']) {
    this.radar = new Radar(boot);

    this.wave = h('span', { class: 'oc-scan__wave oc-num', text: 'WAVE 00' });
    const parts = createPanel('星区态势', 'TACTICAL SCAN', 'oc-panel--scan', this.wave);

    this.intelText = h('span', { text: '雷达在线' });
    this.intel = h('span', { class: 'oc-scan__intel' }, [h('i'), this.intelText]);
    const foot = h('div', { class: 'oc-scan__foot' }, [
      h('span', { class: 'oc-scan__tag', text: 'SECTOR 07' }),
      this.intel,
      h('span', { class: 'oc-scan__tag', text: 'ORBITAL SHELL' }),
    ]);

    parts.body.append(this.radar.element, foot);
    this.element = parts.root;
  }

  /** Repaint the radar and refresh the strip. */
  public update(view: HudView, dtMs: number): void {
    this.radar.draw(view, dtMs);
    const s = view.snapshot;
    setText(this.wave, `WAVE ${String(s.orbital.wave).padStart(2, '0')}`);
    setClass(this.wave, 'is-hot', s.orbital.threat >= 1);
    const hasRadar = s.buildings.some((b) => b.kind === RADAR);
    setClass(this.intel, 'is-off', !hasRadar);
    setText(this.intelText, hasRadar ? '雷达在线' : '无雷达 · 情报缺失');
  }

  /** Re-measure after a viewport change. */
  public resize(): void {
    this.radar.resize();
  }
}
