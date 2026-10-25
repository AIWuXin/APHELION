import { describe, expect, it } from 'vitest';

import { spriteAnchor, spriteTransform } from '../../web/src/render/sprites/sprite-cache';

describe('building sprite anchor', () => {
  it('rounds body and motion to the same logical pixel', () => {
    expect(spriteAnchor(12.49, 31.51)).toEqual({ x: 12, y: 32 });
    expect(spriteAnchor(-8.51, -0.49)).toEqual({ x: -9, y: 0 });
  });

  it('translates a negative sprite origin into the offscreen canvas', () => {
    const bounds = { left: -20, top: -40, right: 30, bottom: 10 };
    expect(spriteTransform(bounds, 2)).toEqual([2, 0, 0, 2, 40, 80]);
  });
});
