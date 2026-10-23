/**
 * Injects the palette into CSS custom properties.
 *
 * The HUD is plain DOM; it must not hard-code colours. Every rule reads a
 * `--oc-*` variable that is generated from {@link PALETTE} at boot, so the CSS
 * and the Canvas always describe the same world.
 */

import { FONT, METRICS, PALETTE, SIGNAL, TYPE } from './tokens';

const VARS: ReadonlyArray<readonly [string, string]> = [
  ['void', PALETTE.void],
  ['panel', PALETTE.panel],
  ['panel-2', PALETTE.panel2],
  ['panel-3', PALETTE.panel3],
  ['line', PALETTE.line],
  ['line-bright', PALETTE.lineBright],
  ['ink', PALETTE.ink],
  ['ink-2', PALETTE.ink2],
  ['ink-3', PALETTE.ink3],
  ['ink-inverse', PALETTE.inkInverse],
  ['primary', PALETTE.primary],
  ['primary-fill', PALETTE.primaryFill],
  ['primary-dim', PALETTE.primaryDim],
  ['function', PALETTE.function],
  ['function-dim', PALETTE.functionDim],
  ['status', PALETTE.status],
  ['status-dim', PALETTE.statusDim],
  ['danger', PALETTE.danger],
  ['danger-dim', PALETTE.dangerDim],
  ['signal-primary', SIGNAL.primary],
  ['signal-function', SIGNAL.function],
  ['signal-status', SIGNAL.status],
  ['signal-danger', SIGNAL.danger],
  ['topbar-h', `${METRICS.topbarH}px`],
  ['rail-w', `${METRICS.railW}px`],
  ['subtitle-h', `${METRICS.subtitleH}px`],
  ['sandbox-w', `${METRICS.sandboxW}px`],
  ['fs-sm', `${TYPE.sm}px`],
  ['fs-md', `${TYPE.md}px`],
  ['fs-lg', `${TYPE.lg}px`],
  ['fs-xl', `${TYPE.xl}px`],
  ['font-sans', FONT.sans],
  ['font-mono', FONT.mono],
];

/** Apply every token to `:root`. Called once, before the first paint. */
export function injectTheme(target: HTMLElement = document.documentElement): void {
  for (const [name, value] of VARS) {
    target.style.setProperty(`--oc-${name}`, value);
  }
}
