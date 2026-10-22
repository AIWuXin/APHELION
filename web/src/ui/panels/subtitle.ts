/**
 * Bottom subtitle bar.
 *
 * Inverted speaker tag (status green fill, near-black mono text) plus one line
 * of dialogue, exactly the reference's construction. Driven by events that
 * carry a `speaker`; the line fades out ~4.5s after it lands and is replaced by
 * the next one. The opening line is presentation chrome, not game state.
 */

import type { HudView } from '../hud-api';
import { h, setClass, setText } from '../dom';

/** Milliseconds before the current line fades. */
const HOLD_MS = 4500;

/** The subtitle bar. */
export class SubtitlePanel {
  public readonly element: HTMLElement;
  private readonly who: HTMLElement;
  private readonly line: HTMLElement;
  private timer = -1;

  public constructor(boot: HudView['boot']) {
    this.who = h('span', { class: 'oc-subtitle__who', text: 'COMMAND' });
    this.line = h('span', { class: 'oc-subtitle__line', text: '' });
    this.element = h('div', { class: 'oc-subtitle' }, [
      this.who,
      this.line,
      h('span', { class: 'oc-subtitle__seed oc-num', text: `SEED ${(boot.seed >>> 0).toString(16).toUpperCase()}` }),
      // Build identity (`0.1.0a1 · 1022-1120`): the running client says which
      // build it is, so a stale bundle can never masquerade as a fresh one.
      h('span', { class: 'oc-subtitle__stamp oc-num', text: __OC_BUILD_STAMP__ }),
    ]);
  }

  /** Show a new speaker line and restart the hold timer. */
  public say(speaker: string, text: string): void {
    setText(this.who, speaker);
    setText(this.line, text);
    setClass(this.element, 'is-faded', false);
    this.timer = 0;
  }

  /** Advance the presentation-only fade timer. */
  public tick(dtMs: number): void {
    if (this.timer < 0) return;
    this.timer += dtMs;
    if (this.timer >= HOLD_MS) {
      this.timer = -1;
      setClass(this.element, 'is-faded', true);
    }
  }
}
