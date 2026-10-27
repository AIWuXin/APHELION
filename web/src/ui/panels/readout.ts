/**
 * 单位情报 / READOUT.
 *
 * Selected structure or unit: art, names, health, state line and the two
 * verbs the HUD may issue (发射 / 拆除). The empty state is a single hairline
 * row -- it gives its height back to the fabricator when nothing is selected.
 */

import { BUILDING_KEYS, UNIT_KEYS } from '../../generated/content-keys';
import type { BuildingDef } from '../../generated/BuildingDef';
import type { BuildingView } from '../../generated/BuildingView';
import type { UnitDef } from '../../generated/UnitDef';
import type { UnitView } from '../../generated/UnitView';
import type { HudActions, HudView } from '../hud-api';
import { clamp01, h, setClass, setDisabled, setHtml, setText, setTitle, setWidth, signed } from '../dom';
import { BUILDING_ICONS, ICON_CRAFT, ICON_DEMOLISH, ICON_LAUNCH, UNIT_ICONS } from '../icons';
import { createPanel } from '../panel';

const HUB = BUILDING_KEYS.indexOf('command-hub');
const PAD = BUILDING_KEYS.indexOf('launch-pad');
const OIL_WELL = BUILDING_KEYS.indexOf('oil-well');
const FREIGHT_TRAIN = UNIT_KEYS.indexOf('freight-train');

const B_STATE = ['建造中', '待机', '运转', '缺料'] as const;
const U_STATE = ['待命', '机动', '交战', '损毁', '驻留'] as const;

/** The unit / structure readout panel. */
export class ReadoutPanel {
  public readonly element: HTMLElement;
  private readonly empty: HTMLElement;
  private readonly detail: HTMLElement;
  private readonly art: HTMLElement;
  private readonly name: HTMLElement;
  private readonly sub: HTMLElement;
  private readonly state: HTMLElement;
  private readonly hpBar: HTMLElement;
  private readonly hpFill: HTMLElement;
  private readonly progress: HTMLElement;
  private readonly progressFill: HTMLElement;
  private readonly hpText: HTMLElement;
  private readonly info: HTMLElement;
  private readonly launch: HTMLButtonElement;
  private readonly demolish: HTMLButtonElement;

  public constructor(private readonly actions: HudActions) {
    const parts = createPanel('单位情报', 'READOUT', 'oc-panel--readout');

    this.empty = h('div', { class: 'oc-readout__empty', text: '未选择 · 点击建筑或单位查看情报' });

    this.art = h('div', { class: 'oc-readout__art', html: ICON_CRAFT });
    this.name = h('div', { class: 'oc-readout__name', text: '未选择' });
    this.sub = h('div', { class: 'oc-readout__sub', text: 'NO SELECTION' });
    this.state = h('div', { class: 'oc-readout__state', text: '' });
    this.hpFill = h('i');
    this.hpBar = h('div', { class: 'oc-bar oc-readout__hp' }, [this.hpFill]);
    this.progressFill = h('i');
    this.progress = h('div', { class: 'oc-bar oc-readout__prog' }, [this.progressFill]);
    this.hpText = h('span', { class: 'oc-num', text: 'HP --' });
    this.info = h('span', { class: 'oc-num', text: '--' });

    this.launch = h('button', { class: 'oc-btn oc-btn--accent oc-readout__act', title: '从选中发射台发射载荷' });
    this.launch.innerHTML = `${ICON_LAUNCH}<span>发射</span>`;
    this.launch.addEventListener('click', () => this.actions.launchSelected());
    this.demolish = h('button', { class: 'oc-btn oc-readout__act', title: '拆除选中建筑' });
    this.demolish.innerHTML = `${ICON_DEMOLISH}<span>拆除</span>`;
    this.demolish.addEventListener('click', () => this.actions.demolishSelected());

    this.detail = h('div', { class: 'oc-readout__detail' }, [
      h('div', { class: 'oc-readout__head' }, [
        this.art,
        h('div', { class: 'oc-readout__id' }, [this.name, this.sub]),
        this.state,
      ]),
      this.hpBar,
      this.progress,
      h('div', { class: 'oc-readout__meta' }, [this.hpText, this.info]),
      h('div', { class: 'oc-readout__actions' }, [this.launch, this.demolish]),
    ]);

    parts.body.append(this.empty, this.detail);
    this.element = parts.root;
  }

  /** Refresh from the current selection. */
  public update(view: HudView): void {
    const s = view.snapshot;
    const sel = view.selection;
    const building =
      sel.kind === 'building' ? s.buildings.find((b) => b.id === sel.id) : undefined;
    const unit = sel.kind === 'unit' ? s.units.find((u) => u.id === sel.id) : undefined;
    const hasTarget = building !== undefined || unit !== undefined;
    this.empty.hidden = hasTarget;
    this.detail.hidden = !hasTarget;
    if (!hasTarget) return;

    if (building) {
      const def = view.boot.catalog.buildings[building.kind];
      this.renderBuilding(building, def);
      return;
    }
    if (unit) this.renderUnit(unit, view.boot.catalog.units[unit.kind]);
  }

  // ------------------------------------------------------------------ helpers

  private renderBuilding(building: BuildingView, def: BuildingDef | undefined): void {
    setHtml(this.art, BUILDING_ICONS[building.kind] ?? ICON_CRAFT);
    setText(this.name, def?.name_zh ?? '结构');
    setText(this.sub, (def?.name_en ?? '').toUpperCase());
    const ratio = clamp01(building.hp / Math.max(1, building.hp_max));
    setWidth(this.hpFill, ratio);
    setClass(this.hpBar, 'is-low', ratio < 0.3);
    setText(this.hpText, `HP ${Math.max(0, building.hp)}/${building.hp_max}`);

    const site = building.state === 0;
    this.progress.hidden = !site;
    setWidth(this.progressFill, clamp01(building.progress / 1000));
    setText(this.state, B_STATE[building.state] ?? '—');
    setClass(this.state, 'is-busy', building.state === 2);
    setClass(this.state, 'is-warn', building.state === 3);

    const energy = def?.energy ?? 0;
    const unpowered = (building.flags & 1) === 0 && energy < 0;
    const stock = building.kind === OIL_WELL ? `库存 ${building.aux}/60 · ` : '';
    setText(this.info, `${stock}${unpowered ? `${signed(energy)} 能源 · 断电` : `${signed(energy)} 能源`}`);
    setClass(this.info, 'is-danger', unpowered);
    setTitle(this.art, def ? this.buildingTitle(def) : '');

    const ready = building.state === 1 && building.aux === 0 && building.progress >= 1000;
    setDisabled(this.launch, building.kind !== PAD || !ready);
    setDisabled(this.demolish, building.kind === HUB);
  }

  private renderUnit(unit: UnitView, def: UnitDef | undefined): void {
    setHtml(this.art, UNIT_ICONS[unit.kind] ?? ICON_CRAFT);
    setText(this.name, def?.name_zh ?? '单位');
    setText(this.sub, (def?.name_en ?? '').toUpperCase());
    const ratio = clamp01(unit.hp / Math.max(1, unit.hp_max));
    setWidth(this.hpFill, ratio);
    setClass(this.hpBar, 'is-low', ratio < 0.3);
    setText(this.hpText, `HP ${Math.max(0, unit.hp)}/${unit.hp_max}`);
    this.progress.hidden = true;
    setText(this.state, U_STATE[unit.state] ?? '—');
    setClass(this.state, 'is-busy', unit.state === 2);
    setClass(this.state, 'is-danger', unit.owner === 1);
    const hostile = unit.owner === 1;
    const cargo = unit.kind === FREIGHT_TRAIN
      ? unit.cargo > 0 ? `原油 ${unit.cargo}/30 · 在途` : '空车 · 友军'
      : null;
    setText(this.info, cargo ?? (hostile ? '敌方 · HOSTILE' : '友军 · FRIENDLY'));
    setClass(this.info, 'is-danger', hostile);
    setTitle(this.art, def ? `${def.name_zh} · 射程 ${def.range} · 伤害 ${def.damage} · 冷却 ${def.cooldown_ms}ms` : '');
    setDisabled(this.launch, true);
    setDisabled(this.demolish, true);
  }

  private buildingTitle(def: BuildingDef): string {
    const parts = [def.desc, `占地 ${def.footprint}×${def.footprint}`, `HP ${def.hp}`];
    if (def.range > 0) parts.push(`射程/半径 ${def.range}`);
    if (def.energy !== 0) parts.push(`能源 ${signed(def.energy)}`);
    return parts.join(' · ');
  }
}
