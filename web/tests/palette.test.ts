import { describe, expect, it } from 'vitest';

import { PALETTE, SIGNAL } from '../../web/src/style/tokens';

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
}

function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
}

describe('aerospace palette accessibility', () => {
  it('keeps text readable on light engineering panels', () => {
    const pairs = [
      [PALETTE.ink, PALETTE.panel],
      [PALETTE.ink2, PALETTE.panel],
      [PALETTE.ink3, PALETTE.panel],
      [PALETTE.primary, PALETTE.panel],
      [PALETTE.function, PALETTE.panel],
      [PALETTE.status, PALETTE.panel],
      [PALETTE.danger, PALETTE.panel],
    ] as const;
    for (const [text, background] of pairs) {
      expect(contrast(text, background), `${text} on ${background}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps active and status badge text readable', () => {
    const pairs = [
      [PALETTE.void, PALETTE.primaryFill],
      [PALETTE.inkInverse, PALETTE.status],
      [PALETTE.inkInverse, PALETTE.danger],
    ] as const;
    for (const [text, background] of pairs) {
      expect(contrast(text, background), `${text} on ${background}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps signal colors readable on dark data displays', () => {
    for (const signal of Object.values(SIGNAL)) {
      expect(contrast(signal, PALETTE.void), `${signal} on ${PALETTE.void}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
