export const CERAMIC = 'var(--oc-ink-inverse)';
export const FUNCTION = 'var(--oc-signal-function)';
export const ORANGE = 'var(--oc-signal-primary)';

export const wrap = (body: string): string =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;

/** A large, filled isometric thumbnail, identified by its generated content key. */
export const asset = (key: string, body: string): string =>
  `<svg viewBox="0 0 48 36" data-asset="${key}" aria-hidden="true" focusable="false"><g stroke="currentColor" stroke-width="1" stroke-linejoin="round" stroke-linecap="round">${body}</g></svg>`;

export function poly(points: readonly (readonly [number, number])[], fill = 'none'): string {
  const d = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join('');
  return `<path d="${d}Z" fill="${fill}"/>`;
}

/** Three solid faces with a consistent upper-left light, for the icon display. */
export function isoBox(x: number, y: number, w: number, h: number, z: number): string {
  const a = y - z;
  const b = a + w / 2;
  const base = a + w;
  return [
    poly([[x, a], [x + w, b], [x, a + w], [x - w, b]], CERAMIC),
    poly([[x - w, b], [x, a + w], [x, base + h], [x - w, b + h]], 'currentColor'),
    poly([[x, a + w], [x + w, b], [x + w, b + h], [x, base + h]], 'currentColor'),
  ].join('').replaceAll('fill="currentColor"', 'fill="currentColor" fill-opacity=".28"');
}
