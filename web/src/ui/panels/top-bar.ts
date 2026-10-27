/**
 * Top status bar (~34px).
 *
 * Status LED → 星历 clock → resources with per-minute deltas → contextual
 * one-line hint → pause + 1×/2×/4× speed. Every value is re-derived from the
 * snapshot each update; the bar keeps no simulation state.
 *
 * Resource readouts are era-gated: era 1 has no fuel cell or research source,
 * so those two would only ever read `0` and teach the player a phantom
 * mechanic. They come back the moment the snapshot reports a later era.
 */

import { BUILDING_KEYS } from '../../generated/content-keys';
import type { HudActions, HudView } from '../hud-api';
import { clockText } from '../format';
import { h, setClass, setDisabled, setHtml, setText, signed } from '../dom';
import {
  ICON_ALLOY,
  ICON_COAL,
  ICON_ENERGY,
  ICON_FUEL,
  ICON_PAUSE,
  ICON_PLAY,
  ICON_RESEARCH,
  ICON_OIL,
} from '../icons';

const PAD = BUILDING_KEYS.indexOf('launch-pad');
const RADAR = BUILDING_KEYS.indexOf('radar-array');
const COAL_MINE = BUILDING_KEYS.indexOf('coal-mine');
const COAL_PLANT = BUILDING_KEYS.indexOf('coal-plant');
const OIL_WELL = BUILDING_KEYS.indexOf('oil-well');
const FUEL_SYNTH = BUILDING_KEYS.indexOf('fuel-synth');

/** Speeds published as `snapshot.speed` indices 1..3 (0 = paused). */
const SPEEDS: readonly (readonly [number, string])[] = [
  [1, '1×'],
  [2, '2×'],
  [3, '4×'],
];

/** The status bar. */
export class TopBar {
  public readonly element: HTMLElement;

  private readonly led: HTMLElement;
  private readonly ledText: HTMLElement;
  private readonly era: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly allow: HTMLElement;
  private readonly alloyDelta: HTMLElement;
  private readonly energy: HTMLElement;
  private readonly energyOut: HTMLElement;
  private readonly energyIn: HTMLElement;
  private readonly energyDelta: HTMLElement;
  private readonly fuel: HTMLElement;
  private readonly fuelDelta: HTMLElement;
  private readonly fuelItem: HTMLElement;
  private readonly research: HTMLElement;
  private readonly researchDelta: HTMLElement;
  private readonly researchItem: HTMLElement;
  private readonly coal: HTMLElement;
  private readonly coalDelta: HTMLElement;
  private readonly oil: HTMLElement;
  private readonly oilDelta: HTMLElement;
  private readonly oilItem: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly pause: HTMLButtonElement;
  private readonly pauseIcon: HTMLElement;
  private readonly pauseLabel: HTMLElement;
  private readonly speedChips: HTMLButtonElement[] = [];

  private view: HudView | null = null;

  public constructor(private readonly actions: HudActions) {
    this.ledText = h('span', { text: '在线' });
    this.led = h('div', { class: 'oc-led' }, [h('i'), this.ledText]);
    this.era = h('span', { class: 'oc-topbar__label', text: 'T1' });
    this.clock = h('b', { class: 'oc-num', text: '00:00:00' });

    this.allow = h('b', { class: 'oc-res__value', text: '0' });
    this.alloyDelta = h('span', { class: 'oc-res__delta', text: '+0' });
    const alloy = this.resItem('合金', ICON_ALLOY, 'oc-res--alloy', [this.allow, this.alloyDelta]);

    this.energyOut = h('b', { class: 'oc-res__value', text: '0' });
    this.energyIn = h('b', { class: 'oc-res__load', text: '0' });
    this.energyDelta = h('span', { class: 'oc-res__delta', text: '+0' });
    this.energy = this.resItem(
      '能源',
      ICON_ENERGY,
      'oc-res--energy',
      [
        h('span', { class: 'oc-res__role', text: '产/负' }),
        this.energyOut,
        h('span', { class: 'oc-res__slash', text: '/' }),
        this.energyIn,
        this.energyDelta,
      ],
    );

    this.fuel = h('b', { class: 'oc-res__value', text: '0' });
    this.fuelDelta = h('span', { class: 'oc-res__delta', text: '+0' });
    this.fuelItem = this.resItem('燃料', ICON_FUEL, 'oc-res--fuel', [this.fuel, this.fuelDelta]);

    this.coal = h('b', { class: 'oc-res__value', text: '0' });
    this.coalDelta = h('span', { class: 'oc-res__delta', text: '+0' });
    const coal = this.resItem('煤', ICON_COAL, 'oc-res--coal', [this.coal, this.coalDelta]);

    this.oil = h('b', { class: 'oc-res__value', text: '0' });
    this.oilDelta = h('span', { class: 'oc-res__delta', text: '+0' });
    this.oilItem = this.resItem('原油', ICON_OIL, 'oc-res--oil', [this.oil, this.oilDelta]);

    this.research = h('b', { class: 'oc-res__value', text: '0' });
    this.researchDelta = h('span', { class: 'oc-res__delta', text: '+0' });
    this.researchItem = this.resItem('研究', ICON_RESEARCH, 'oc-res--research', [
      this.research,
      this.researchDelta,
    ]);

    this.hint = h('div', { class: 'oc-hint', text: '左键 建造 · 右键 取消 · 空格 暂停 · F3 沙盒' });

    this.pauseIcon = h('span', { class: 'oc-pause__icon', html: ICON_PAUSE });
    this.pauseLabel = h('span', { class: 'oc-pause__label', text: '暂停' });
    this.pause = h('button', { class: 'oc-pause', title: '暂停 / 继续 (Space)' }, [
      this.pauseIcon,
      this.pauseLabel,
    ]);
    this.pause.addEventListener('click', () => {
      const speed = this.view?.snapshot.speed ?? 1;
      this.actions.setPaused(speed !== 0);
    });

    const chips = h('div', { class: 'oc-speed' });
    for (const [index, label] of SPEEDS) {
      const chip = h('button', { class: 'oc-speed__chip', text: label, title: `速度 ${label}` });
      chip.addEventListener('click', () => this.actions.setSpeed(index));
      this.speedChips.push(chip);
      chips.append(chip);
    }

    this.element = h('div', { class: 'oc-topbar' }, [
      h('div', { class: 'oc-topbar__cell' }, [this.led]),
      h('div', { class: 'oc-topbar__cell' }, [
        this.era,
        h('span', { class: 'oc-topbar__label', text: '星历' }),
        this.clock,
      ]),
      h('div', { class: 'oc-resbar' }, [
        alloy,
        this.energy,
        coal,
        this.oilItem,
        this.fuelItem,
        this.researchItem,
      ]),
      this.hint,
      h('div', { class: 'oc-topbar__end' }, [
        this.pause,
        h('span', { class: 'oc-topbar__rule' }),
        chips,
      ]),
    ]);
  }

  /** Refresh every readout from the latest view. */
  public update(view: HudView): void {
    this.view = view;
    const s = view.snapshot;
    const r = s.resources;

    // Status lamp: green nominal, red when the sector is under threat.
    const threat = s.orbital.threat;
    const alerting = threat >= 1 || s.status === 2;
    setClass(this.led, 'is-alert', alerting);
    setText(
      this.ledText,
      s.status === 2
        ? '失守'
        : s.status === 3
          ? '达成'
          : threat >= 2
            ? '交战'
            : threat === 1
              ? '警戒'
              : '在线',
    );
    setText(this.era, `T${s.era}`);
    setText(this.clock, clockText(s.time_ms));

    setText(this.allow, String(r.alloy));
    setText(this.alloyDelta, signed(r.alloy_rate));
    setText(this.energyOut, String(r.energy_out));
    setText(this.energyIn, String(r.energy_in));
    setText(this.energyDelta, signed(r.energy_out - r.energy_in));
    setClass(this.energy, 'is-deficit', r.energy_in > r.energy_out);
    setText(this.fuel, String(r.fuel));
    setText(this.fuelDelta, signed(r.fuel_rate));
    setText(this.research, String(r.research));
    setText(this.researchDelta, signed(r.research_rate));
    setText(this.coal, String(r.coal));
    setText(this.coalDelta, signed(r.coal_rate));
    setText(this.oil, String(r.oil));
    setText(this.oilDelta, signed(r.oil_rate));

    // Era 1 has no petroleum, fuel cells or research production to display.
    const t1 = s.era <= 1;
    this.fuelItem.hidden = t1;
    this.researchItem.hidden = t1;
    this.oilItem.hidden = t1;

    setText(this.hint, this.hintFor(view));

    const paused = s.speed === 0;
    const ended = s.status !== 0;
    setClass(this.pause, 'is-active', paused);
    setText(this.pauseLabel, paused ? '运行' : '暂停');
    setHtml(this.pauseIcon, paused ? ICON_PLAY : ICON_PAUSE);
    setDisabled(this.pause, ended);
    this.speedChips.forEach((chip, i) => {
      setClass(chip, 'is-active', s.speed === i + 1);
      setDisabled(chip, ended);
    });
  }

  // ------------------------------------------------------------------ helpers

  private resItem(
    label: string,
    icon: string,
    modifier: string,
    parts: readonly HTMLElement[],
  ): HTMLElement {
    return h('div', { class: `oc-res ${modifier}` }, [
      h('span', { class: 'oc-res__icon', html: icon }),
      h('span', { class: 'oc-res__label', text: label }),
      ...parts,
    ]);
  }

  /** One short line of the next useful action; critical states win. */
  private hintFor(view: HudView): string {
    const s = view.snapshot;
    if (s.status === 2) return '指挥中枢失守 · 战役结束';
    if (s.status === 3) return '全部波次清空 · 殖民地方案达成';
    if (s.orbital.threat >= 2) {
      return s.era <= 1 ? '地面交战中 · 补建电磁炮塔与掩体' : '地面交战中 · 部署拦截机与炮塔';
    }
    if (s.orbital.threat === 1) {
      return s.era <= 1 ? '地面掠袭在即 · 检查炮塔射界' : '舰队接触在即 · 检查防务序列';
    }
    const has = (kind: number): boolean => s.buildings.some((b) => b.kind === kind);
    // Era 1 has no search array and no launch pad, so those two lines would nag
    // forever; point the opening at its own loop (seam → extractor → plant).
    if (s.era <= 1) {
      if (!has(COAL_MINE)) return '缺少采煤机 · 需建在煤层上';
      if (!has(COAL_PLANT)) return '建造火电站 · 补足晨昏线电力缺口';
      return '左键 建造 · 右键 取消 · 空格 暂停 · F3 沙盒';
    }
    if (s.era === 2) {
      if (!has(OIL_WELL)) return '勘探油田 · 建造油井并接通货运';
      if (!has(FUEL_SYNTH)) return '建造燃料合成站 · 将原油转为火箭燃料';
    }
    if (!has(RADAR)) return '缺少搜索阵列 · 敌袭倒计时不可见';
    if (s.era >= 3 && !has(PAD)) return '建造发射台才能进入轨道';
    return '左键 建造 · 右键 取消 · 空格 暂停 · F3 沙盒';
  }
}
