/**
 * Alert strip.
 *
 * Slides down directly under the top bar for a danger-tone event, red bottom
 * border and an inverted `ALERT` mono tag, then retires itself. If the event
 * carried a map tile the strip doubles as a locator: click to centre the
 * camera (explicit player intent, never an automatic camera hijack).
 */

import type { HudActions } from '../hud-api';
import { h, setClass, setText } from '../dom';

/** Milliseconds the strip stays out. */
const HOLD_MS = 4000;

/** The alert strip. */
export class AlertStrip {
  public readonly element: HTMLElement;
  private readonly text: HTMLElement;
  private readonly go: HTMLElement;
  private timer = 0;
  private tx = -1;
  private ty = -1;

  public constructor(private readonly actions: HudActions) {
    this.text = h('span', { class: 'oc-alert__text', text: '' });
    this.go = h('span', { class: 'oc-alert__go', text: '定位' });
    this.element = h('div', { class: 'oc-alert' }, [
      h('span', { class: 'oc-alert__tag', text: 'ALERT' }),
      this.text,
      this.go,
    ]);
    this.element.addEventListener('click', () => {
      if (this.tx < 0 || this.ty < 0) return;
      this.actions.focusTile(this.tx, this.ty);
    });
  }

  /** Show a one-shot line. `tone` 2 uses the danger skin, anything else warns. */
  public show(text: string, tone: number, tx = -1, ty = -1): void {
    setText(this.text, text);
    setClass(this.element, 'is-warn', tone !== 2);
    setClass(this.element, 'is-shown', true);
    this.tx = tx;
    this.ty = ty;
    this.go.hidden = tx < 0 || ty < 0;
    this.timer = HOLD_MS;
  }

  /** Advance the auto-hide timer. */
  public tick(dtMs: number): void {
    if (this.timer <= 0) return;
    this.timer -= dtMs;
    if (this.timer <= 0) setClass(this.element, 'is-shown', false);
  }
}
