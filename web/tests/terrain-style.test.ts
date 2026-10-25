import { describe, expect, it } from 'vitest';

import { companionMask, rand01, valueNoise } from '../../web/src/render/terrain/noise';
import { hasTileSeam } from '../../web/src/render/terrain/surface-rules';
import { wrapSpan } from '../../web/src/render/torus';

function referenceMask(tx: number, ty: number, mix: number): boolean {
  const x = wrapSpan(tx, 10240);
  const y = wrapSpan(ty, 10240);
  const v =
    valueNoise(x, y, 10, 0x51e7) * 0.76 +
    valueNoise(x, y, 5, 0x9e37) * 0.24 +
    (rand01(x, y, 0x77a1) - 0.5) * 48;
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

  it('keeps companion patches continuous across the 10240-tile torus', () => {
    const points: readonly (readonly [number, number])[] = [
      [0, 0], [1, 7], [-1, -33], [10239, 10239], [17, -10239], [-10237, 10247],
    ];
    for (const [tx, ty] of points) {
      for (const mix of [170, 240]) {
        expect(companionMask(tx, ty, mix)).toBe(companionMask(tx + 10240, ty - 10240, mix));
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
