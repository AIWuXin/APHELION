/**
 * Tiny DOM builder. No framework, no virtual DOM -- just typed element
 * construction with cached references.
 *
 * The HUD is rebuilt rarely (panel chrome is built once, event log rows only
 * when a new event lands) and updated in place every frame with dirt-cheap
 * text / width assignments that no-op when the value did not change.
 */

/** Attributes accepted by {@link h}. */
export type Attrs = {
  readonly class?: string;
  readonly id?: string;
  readonly text?: string;
  readonly title?: string;
  readonly html?: string;
  readonly hidden?: boolean;
  readonly data?: Readonly<Record<string, string>>;
  readonly style?: Readonly<Record<string, string>>;
  readonly on?: Readonly<Record<string, (ev: Event) => void>>;
};

/** Create an element with attributes and children. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: readonly (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs.class) el.className = attrs.class;
  if (attrs.id) el.id = attrs.id;
  if (attrs.title) el.title = attrs.title;
  if (attrs.text !== undefined) el.textContent = attrs.text;
  if (attrs.html !== undefined) el.innerHTML = attrs.html;
  if (attrs.hidden !== undefined) el.hidden = attrs.hidden;
  if (attrs.data) for (const [k, v] of Object.entries(attrs.data)) el.dataset[k] = v;
  if (attrs.style) {
    for (const [k, v] of Object.entries(attrs.style)) el.style.setProperty(k, v);
  }
  if (attrs.on) {
    for (const [name, fn] of Object.entries(attrs.on)) el.addEventListener(name, fn);
  }
  for (const child of children) el.append(child);
  return el;
}

/** Set text only when it changed, to avoid needless layout work. */
export function setText(el: Element, value: string): void {
  if (el.textContent !== value) el.textContent = value;
}

/** Set markup only when it changed (icons only -- never per-frame text). */
export function setHtml(el: Element, value: string): void {
  if (el.innerHTML !== value) el.innerHTML = value;
}

/** Set a CSS percentage width only when it changed. */
export function setWidth(el: HTMLElement, ratio: number): void {
  const pct = `${Math.max(0, Math.min(100, ratio * 100)).toFixed(1)}%`;
  if (el.style.width !== pct) el.style.width = pct;
}

/** Toggle a class idempotently. */
export function setClass(el: Element, name: string, on: boolean): void {
  if (el.classList.contains(name) !== on) el.classList.toggle(name, on);
}

/** Toggle `disabled` only when it changed. */
export function setDisabled(el: HTMLButtonElement, value: boolean): void {
  if (el.disabled !== value) el.disabled = value;
}

/** Set a tooltip only when it changed. */
export function setTitle(el: HTMLElement, value: string): void {
  if (el.title !== value) el.title = value;
}

/** Clamp a ratio into 0..1. */
export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Zero-pad a number for monospace readouts. */
export function pad(value: number, width: number): string {
  return String(Math.max(0, Math.trunc(value))).padStart(width, '0');
}

/** Format a signed rate, e.g. `+46`. */
export function signed(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

/** Insert a stylesheet once. */
export function injectStyle(id: string, css: string): void {
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.append(style);
}
