import { describe, expect, it } from 'vitest';

import { companionMask, rand01, valueNoise } from '../../web/src/render/terrain/noise';
import { hasTileSeam } from '../../web/src/render/terrain/surface-rules';

function referenceMask(tx: number, ty: number, mix: number): boolean {
  const v =
    valueNoise(tx, ty, 12, 0x51e7) * 0.76 +
    valueNoise(tx, ty, 5, 0x9e37) * 0.24 +
    (rand01(tx, ty, 0x77a1) - 0.5) * 48;
  return mix > 0 && v > 700 - mix * 0.5;
}

describe('continuous terrain rules', () => {
  it('draws tile seams only on manufactured surfaces', () => {
    const natural = [0, 1, 2, 3, 4, 7, 8, 9, 10, 11, 12, 13, 14];
    expect(natural.filter(hasTileSeam)).toEqual([]);
    expect(hasTileSeam(5)).toBe(true);
    expect(hasTileSeam(6)).toBe(true);
    expect(hasTileSeam(-1)).toBe(false);
    expect(hasTileSeam(15)).toBe(false);
  });

  it('uses the continuous companion recipe at local and chunk boundaries', () => {
    const points: readonly (readonly [number, number])[] = [
      [0, 0], [-1, -33], [31, 31], [31, 32], [32, 31], [32, 32],
      [10239, 0], [10239, 10239], [0, 10239], [10238, 1],
    ];
    for (const [tx, ty] of points) {
      for (const mix of [1, 170, 240, 500]) {
        expect(companionMask(tx, ty, mix)).toBe(referenceMask(tx, ty, mix));
      }
    }
  });

  it('is repeatable and disables companions at zero mix', () => {
    const points: readonly (readonly [number, number])[] = [[0, 0], [-33, 18], [32, 31], [10239, 10239]];
    for (const [tx, ty] of points) {
      expect(companionMask(tx, ty, 240)).toBe(companionMask(tx, ty, 240));
      expect(companionMask(tx, ty, 0)).toBe(false);
    }
  });
});
