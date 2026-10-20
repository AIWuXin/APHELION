/**
 * Shared panel chrome.
 *
 * Every HUD module uses the same three-part construction borrowed from the
 * reference terminal: header (中文标题 + 宽字距 English) → data rows → controls.
 * Building it here keeps the 1px language and the type scale identical across
 * twelve panels.
 */

import { h } from './dom';

/** A panel split into its header and its content slot. */
export interface PanelParts {
  readonly root: HTMLElement;
  readonly body: HTMLElement;
}

/** A hairline progress bar: 2px track plus a fill element sized 0..1. */
export interface BarParts {
  readonly root: HTMLElement;
  readonly fill: HTMLElement;
}

/** Build the panel shell. `right` lands in the header after the English tag. */
export function createPanel(
  zh: string,
  en: string,
  modifier = '',
  right: HTMLElement | null = null,
): PanelParts {
  const end = h('span', { class: 'oc-panel__end' }, [
    h('span', { class: 'oc-panel__sub', text: en }),
    ...(right ? [right] : []),
  ]);
  const head = h('header', { class: 'oc-panel__head' }, [
    h('span', { class: 'oc-panel__title', text: zh }),
    end,
  ]);
  const body = h('div', { class: 'oc-panel__body' });
  const root = h('section', { class: `oc-panel${modifier ? ` ${modifier}` : ''}` }, [head, body]);
  return { root, body };
}

/** Build a hairline bar; the fill is updated with `setWidth(fill, 0..1)`. */
export function createBar(modifier = ''): BarParts {
  const fill = h('i');
  const root = h('div', { class: `oc-bar${modifier ? ` ${modifier}` : ''}` }, [fill]);
  return { root, fill };
}

/** A 10px wide-tracked English subtitle tag. */
export function enTag(text: string): HTMLElement {
  return h('span', { class: 'oc-panel__sub', text });
}
