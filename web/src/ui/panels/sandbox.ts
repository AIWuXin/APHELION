/**
 * 沙盒 / SANDBOX (F3).
 *
 * Mirrors the reference construction exactly: full-width amber-filled toggle
 * rows for the two policy bits and three-segment selectors for the AI presets,
 * with a tracked footnote underneath. All state is read back from
 * `snapshot.policy`, so the panel stays stateless between frames.
 */

import type { HudActions, HudView } from '../hud-api';
import { h, setClass, setText } from '../dom';
import { ICON_BOLT, ICON_INFINITE } from '../icons';
import { createPanel } from '../panel';

const PHASE_LABELS = ['开局', '中期', '后期'] as const;
const STRENGTH_LABELS = ['和平', '普通', '凶悍'] as const;

/** The sandbox panel. */
export class SandboxPanel {
  public readonly element: HTMLElement;
  private readonly fund: HTMLButtonElement;
  private readonly fundState: HTMLElement;
  private readonly fast: HTMLButtonElement;
  private readonly fastState: HTMLElement;
  private readonly phaseChips: HTMLButtonElement[] = [];
  private readonly strengthChips: HTMLButtonElement[] = [];
  private view: HudView | null = null;
  private open = true;

  public constructor(private readonly actions: HudActions) {
    const key = h('span', { class: 'oc-sandbox__key', text: 'F3' });
    const parts = createPanel('沙盒', 'SANDBOX', 'oc-sandbox oc-panel--sandbox', key);

    this.fundState = h('span', { class: 'oc-toggle__state', text: '关' });
    this.fund = h('button', { class: 'oc-toggle', title: '无限资金（策略位 0）' }, [
      h('span', { class: 'oc-toggle__icon', html: ICON_INFINITE }),
      h('span', { class: 'oc-toggle__label', text: '资金' }),
      this.fundState,
    ]);
    this.fund.addEventListener('click', () => this.flip(1));

    this.fastState = h('span', { class: 'oc-toggle__state', text: '关' });
    this.fast = h('button', { class: 'oc-toggle', title: '即时建造（策略位 1）' }, [
      h('span', { class: 'oc-toggle__icon', html: ICON_BOLT }),
      h('span', { class: 'oc-toggle__label', text: '快速建造' }),
      this.fastState,
    ]);
    this.fast.addEventListener('click', () => this.flip(2));

    const phase = this.segment('AI 进度', PHASE_LABELS, (index) => this.actions.setAiPhase(index), this.phaseChips);
    const strength = this.segment(
      'AI 强度',
      STRENGTH_LABELS,
      (index) => this.actions.setAiStrength(index),
      this.strengthChips,
    );

    parts.body.append(
      this.fund,
      this.fast,
      phase,
      strength,
      h('div', { class: 'oc-footnote', text: '无限资源 & 即时建造；敌军 AI 与波次逻辑保持。' }),
    );
    this.element = parts.root;
  }

  /** Refresh policy mirrors. */
  public update(view: HudView): void {
    this.view = view;
    const p = view.snapshot.policy;
    const fund = (p.sandbox_flags & 1) !== 0;
    const fast = (p.sandbox_flags & 2) !== 0;
    setClass(this.fund, 'is-on', fund);
    setClass(this.fast, 'is-on', fast);
    setText(this.fundState, fund ? '开' : '关');
    setText(this.fastState, fast ? '开' : '关');
    this.phaseChips.forEach((chip, index) => setClass(chip, 'is-active', index === p.ai_phase));
    this.strengthChips.forEach((chip, index) => setClass(chip, 'is-active', index === p.ai_strength));
  }

  /** F3 hides / reveals the panel without touching the simulation. */
  public toggle(): void {
    this.open = !this.open;
    this.element.hidden = !this.open;
  }

  // ------------------------------------------------------------------ helpers

  private flip(bit: number): void {
    const flags = this.view?.snapshot.policy.sandbox_flags ?? 0;
    this.actions.setSandbox(flags ^ bit);
  }

  private segment(
    label: string,
    labels: readonly string[],
    onPick: (index: number) => void,
    chips: HTMLButtonElement[],
  ): HTMLElement {
    const row = h('div', { class: 'oc-seg' }, [h('span', { class: 'oc-seg__label', text: label })]);
    labels.forEach((text, index) => {
      const chip = h('button', { text });
      chip.addEventListener('click', () => onPick(index));
      chips.push(chip);
      row.append(chip);
    });
    return row;
  }
}
