/**
 * 事件日志 / EVENT LOG.
 *
 * The snapshot only carries the events of the current tick, so the HUD owns a
 * small presentation-side ring buffer (latest first, six entries). Entries are
 * deduplicated by `(kind, a, b)` while they sit in the buffer: a structure
 * under sustained fire produces one log line, not one per tick.
 *
 * This module is also the feed for the subtitle line and the alert strip; the
 * caller reads the entries returned by {@link EventLogPanel.consume}.
 */

import { EVENT_KEYS } from '../../generated/content-keys';
import type { HudActions, HudView } from '../hud-api';
import { h, setClass } from '../dom';
import { mmss } from '../format';
import { createPanel } from '../panel';

const MAX_ENTRIES = 6;
const BUILD_DONE = EVENT_KEYS.indexOf('build-done');
const RESEARCH = EVENT_KEYS.indexOf('research');

/** Tone → row modifier, matching the event table's 0..3 contract. */
const TONE_CLASS: readonly string[] = ['is-info', 'is-warn', 'is-danger', 'is-good'];

/** One buffered log line. */
export interface LogEntry {
  readonly key: string;
  readonly kind: number;
  readonly text: string;
  readonly tone: number;
  readonly timeMs: number;
  readonly tx: number;
  readonly ty: number;
  readonly speaker: string;
}

/** The event log panel. */
export class EventLogPanel {
  public readonly element: HTMLElement;
  private readonly list: HTMLElement;
  private readonly empty: HTMLElement;
  private readonly buffer: LogEntry[] = [];
  private readonly keys = new Set<string>();
  private lastTick = -1;

  public constructor(
    private readonly actions: HudActions,
    private readonly boot: HudView['boot'],
  ) {
    const parts = createPanel('事件日志', 'EVENT LOG', 'oc-panel--log');
    this.list = h('div', { class: 'oc-log__list oc-scroll' });
    this.empty = h('div', { class: 'oc-log__empty', text: '等待遥测…' });
    parts.body.append(this.list, this.empty);
    this.element = parts.root;
  }

  /**
   * Ingest one snapshot. Returns the entries added by this tick, oldest first,
   * so the caller can drive the subtitle and the alert strip in order.
   */
  public consume(view: HudView): readonly LogEntry[] {
    const tick = view.snapshot.tick;
    if (tick === this.lastTick) return [];
    this.lastTick = tick;

    const added: LogEntry[] = [];
    for (const ev of view.snapshot.events) {
      const def = this.boot.catalog.events[ev.kind];
      if (!def) continue;
      const key = `${ev.kind}:${ev.a}:${ev.b}`;
      if (this.keys.has(key)) continue;
      const entry: LogEntry = {
        key,
        kind: ev.kind,
        text: this.substitute(ev.kind, ev.a, ev.b, def.text_zh),
        tone: def.tone,
        timeMs: view.snapshot.time_ms,
        tx: ev.tx,
        ty: ev.ty,
        speaker: def.speaker,
      };
      this.buffer.unshift(entry);
      this.keys.add(key);
      added.push(entry);
    }
    if (added.length > 0) this.trim();
    if (added.length > 0) this.render();
    return added;
  }

  // ------------------------------------------------------------------ helpers

  /** Numeric `{a}`/`{b}` substitution, refined to a display name for the two
   * events whose first argument is a content-table index (build / research). */
  private substitute(kind: number, a: number, b: number, template: string): string {
    let aText = String(a);
    if (kind === BUILD_DONE) aText = this.boot.catalog.buildings[a]?.name_zh ?? aText;
    if (kind === RESEARCH) aText = this.boot.catalog.techs[a]?.name_zh ?? aText;
    return template.split('{a}').join(aText).split('{b}').join(String(b));
  }

  private trim(): void {
    while (this.buffer.length > MAX_ENTRIES) {
      const dropped = this.buffer.pop();
      if (dropped) this.keys.delete(dropped.key);
    }
  }

  /** Rebuild the six-row list only when a new event actually landed. */
  private render(): void {
    this.list.textContent = '';
    this.empty.hidden = this.buffer.length > 0;
    for (const entry of this.buffer) {
      const pinned = entry.tx >= 0 && entry.ty >= 0;
      const row = h('div', {
        class: `oc-log__row ${TONE_CLASS[entry.tone] ?? 'is-info'}${pinned ? ' is-pinned' : ''}`,
        title: pinned ? `${entry.text} · 点击定位` : entry.text,
      }, [
        h('span', { class: 'oc-log__time oc-num', text: mmss(entry.timeMs) }),
        h('span', { class: 'oc-log__text', text: entry.text }),
      ]);
      if (pinned) {
        row.addEventListener('click', () => this.actions.focusTile(entry.tx, entry.ty));
      }
      this.list.append(row);
    }
    setClass(this.list, 'is-empty', this.buffer.length === 0);
  }
}
