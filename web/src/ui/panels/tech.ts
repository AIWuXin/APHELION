/**
 * 科技树 / RESEARCH.
 *
 * Four short branches, one chip row each: name, cost (amber mono), effect line
 * with its prerequisite, and a 1px 研究 button.
 *
 * KNOWN COMPROMISE — the snapshot has no "tech unlocked" bit (`World::techs`
 * stays inside the sim), so the HUD cannot know whether a branch is already
 * researched or whether a prerequisite is met. The rule implemented here is:
 *
 *   - the button is disabled only when the stockpile cannot pay (`research < cost`);
 *   - a tech whose `requires` is not `255` stays enabled even though the HUD
 *     cannot verify the prerequisite -- the sim refuses the command and the
 *     next snapshot leaves the cost untouched;
 *   - `requires === 255` is always satisfiable, so those branches need no caveat.
 *
 * The prerequisite's *name* is knowable from the catalogue and is printed on
 * the effect line, which is enough for the player to self-order the tree.
 */

import type { TechDef } from '../../generated/TechDef';
import type { HudActions, HudView } from '../hud-api';
import { h, setClass, setDisabled, setText } from '../dom';
import { createPanel } from '../panel';

interface TechRefs {
  readonly root: HTMLElement;
  readonly btn: HTMLButtonElement;
  readonly effect: HTMLElement;
  readonly cost: number;
}

/** The research panel. */
export class TechPanel {
  public readonly element: HTMLElement;
  private readonly rows: TechRefs[] = [];
  private readonly stock: HTMLElement;

  public constructor(
    private readonly actions: HudActions,
    boot: HudView['boot'],
  ) {
    this.stock = h('span', { class: 'oc-tech__stock oc-num', text: 'RP 0' });
    const parts = createPanel('科技树', 'RESEARCH', 'oc-panel--tech', this.stock);

    boot.catalog.techs.forEach((def, index) => {
      const cost = h('span', { class: 'oc-tech__cost oc-num', text: String(def.cost) });
      const effect = h('span', { class: 'oc-tech__effect', text: this.effectText(def, boot.catalog.techs) });
      const btn = h('button', { class: 'oc-btn oc-tech__btn', text: '研究', title: `研究 ${def.name_zh}` });
      btn.addEventListener('click', () => this.actions.research(index));
      const root = h('div', { class: 'oc-tech' }, [
        h('div', { class: 'oc-tech__main' }, [
          h('span', { class: 'oc-tech__name', text: def.name_zh }),
          h('span', { class: 'oc-tech__en', text: def.name_en }),
        ]),
        cost,
        btn,
        effect,
      ]);
      this.rows.push({ root, btn, effect, cost: def.cost });
      parts.body.append(root);
    });
    this.element = parts.root;
  }

  /** Refresh affordability and the research stock chip. */
  public update(view: HudView): void {
    const research = view.snapshot.resources.research;
    setText(this.stock, `RP ${research}`);
    for (const row of this.rows) {
      const affordable = research >= row.cost;
      setDisabled(row.btn, !affordable);
      setClass(row.btn, 'oc-btn--accent', affordable);
      setClass(row.root, 'is-affordable', affordable);
    }
  }

  // ------------------------------------------------------------------ helpers

  private effectText(def: TechDef, techs: readonly TechDef[]): string {
    if (def.requires === 255) return def.effect_zh;
    const parent = techs[def.requires];
    return parent ? `${def.effect_zh} · 前置 ${parent.name_zh}` : def.effect_zh;
  }
}
