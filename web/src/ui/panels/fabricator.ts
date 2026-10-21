/**
 * 建造序列 / FABRICATOR.
 *
 * 2×2 category tabs (amber fill on the active one) over a scrolling grid of
 * build cards. The card list is rebuilt only when the category or the era
 * changes; per frame the panel only flips the affordability / placement
 * classes. Cards whose `def.tier` is above `snapshot.era` are not rendered at
 * all -- a greyed card the kernel would refuse is noise, not information.
 *
 * This is the rail's only flexible region: it absorbs the leftover height and
 * the card grid scrolls internally (see `panels.css`).
 */

import { CATEGORY_KEYS, CATEGORY_LABELS_ZH } from '../../generated/content-keys';
import type { BuildingDef } from '../../generated/BuildingDef';
import { buildableKinds } from '../../content/era';
import type { HudActions, HudView } from '../hud-api';
import { h, setClass, setText, signed } from '../dom';
import { seconds } from '../format';
import { CATEGORY_ICONS, BUILDING_ICONS, ICON_STRUCTURE } from '../icons';
import { createPanel } from '../panel';

/** Buildable def paired with its wire index. */
interface Entry {
  readonly kind: number;
  readonly def: BuildingDef;
}

interface CardRefs {
  readonly root: HTMLElement;
  readonly kind: number;
}

/** The fabricator panel. */
export class FabricatorPanel {
  public readonly element: HTMLElement;
  private readonly tabs: HTMLButtonElement[] = [];
  private readonly cards: HTMLElement;
  private readonly placeLine: HTMLElement;
  private readonly placeName: HTMLElement;
  private cardNodes: CardRefs[] = [];
  private signature = '';
  private tab = 0;
  private readonly defs: readonly BuildingDef[];

  public constructor(
    private readonly actions: HudActions,
    boot: HudView['boot'],
  ) {
    this.defs = boot.catalog.buildings;
    const parts = createPanel('建造序列', 'FABRICATOR', 'oc-panel--fab');

    const tabBox = h('div', { class: 'oc-fab__tabs' });
    CATEGORY_KEYS.forEach((key, index) => {
      const btn = h('button', { class: 'oc-fab__tab', title: key });
      btn.innerHTML = `${CATEGORY_ICONS[index] ?? ICON_STRUCTURE}<span>${CATEGORY_LABELS_ZH[index] ?? key}</span>`;
      btn.addEventListener('click', () => {
        this.tab = index;
      });
      this.tabs.push(btn);
      tabBox.append(btn);
    });

    this.cards = h('div', { class: 'oc-fab__cards oc-scroll' });
    this.placeName = h('span', { text: '' });
    this.placeLine = h('div', { class: 'oc-fab__place' }, [
      h('span', { class: 'oc-fab__place-tag', text: 'PLACING' }),
      this.placeName,
      h('span', { class: 'oc-fab__place-hint', text: '右键取消' }),
    ]);

    parts.body.append(tabBox, this.cards, this.placeLine);
    this.element = parts.root;
  }

  /** Refresh tabs, placement state and card affordability. */
  public update(view: HudView): void {
    this.tabs.forEach((btn, index) => setClass(btn, 'is-active', index === this.tab));
    this.renderCards(view);
    const alloy = view.snapshot.resources.alloy;
    const fuel = view.snapshot.resources.fuel;
    const sandbox = (view.snapshot.policy.sandbox_flags & 1) !== 0;
    for (const card of this.cardNodes) {
      const def = this.defs[card.kind];
      if (!def) continue;
      const affordable = sandbox || (alloy >= def.cost_alloy && fuel >= def.cost_fuel);
      setClass(card.root, 'is-locked', !affordable);
      setClass(card.root, 'is-placing', view.placing === card.kind);
    }
    const placing = view.placing;
    const placingDef = placing >= 0 ? this.defs[placing] : undefined;
    this.placeLine.hidden = !placingDef;
    if (placingDef) setText(this.placeName, `${placingDef.name_zh} · 左键放置`);
  }

  // ------------------------------------------------------------------ helpers

  private renderCards(view: HudView): void {
    const category = this.tab;
    const era = view.snapshot.era;
    // The era is part of the signature: crossing into T2 must redraw the rail.
    const signature = `${category}:${era}:${view.boot.catalog.protocol}`;
    if (signature === this.signature) return;
    this.signature = signature;

    const list: Entry[] = [];
    for (const kind of buildableKinds(this.defs, category, era)) {
      const def = this.defs[kind];
      if (def) list.push({ kind, def });
    }

    this.cards.textContent = '';
    // A whole category can be era-locked (orbital and support in era 1): say so
    // instead of leaving a blank grid that reads as a rendering bug.
    if (list.length === 0) {
      this.cards.append(h('div', { class: 'oc-fab__empty', text: '本时代暂无此类建筑' }));
    }
    this.cardNodes = list.map((entry) => {
      const art = h('div', { class: 'oc-card__art', html: BUILDING_ICONS[entry.kind] ?? ICON_STRUCTURE });
      const name = h('div', { class: 'oc-card__name', text: entry.def.name_zh });
      const cost = h('div', { class: 'oc-card__cost' }, [
        h('span', { class: 'oc-card__price oc-num', text: String(entry.def.cost_alloy) }),
        h('span', { class: 'oc-card__unit', text: '合金' }),
        entry.def.cost_fuel > 0
          ? h('span', { class: 'oc-card__fuel oc-num', text: `${entry.def.cost_fuel} 燃料` })
          : h('span'),
      ]);
      const root = h('button', {
        class: 'oc-card',
        title: this.tooltip(entry.def),
      }, [art, name, cost]);
      root.addEventListener('click', () => this.actions.selectBuilding(entry.kind));
      this.cards.append(root);
      return { root, kind: entry.kind };
    });
  }

  private tooltip(def: BuildingDef): string {
    const parts = [
      def.desc,
      `造价 ${def.cost_alloy} 合金${def.cost_fuel > 0 ? ` + ${def.cost_fuel} 燃料` : ''}`,
      `建造 ${seconds(def.build_time_ms)}`,
      `占地 ${def.footprint}×${def.footprint}`,
    ];
    if (def.energy !== 0) parts.push(`能源 ${signed(def.energy)}`);
    if (def.range > 0) parts.push(`射程/半径 ${def.range}`);
    if (def.tech !== 255) parts.push('需要前置科技');
    return parts.join(' · ');
  }
}
