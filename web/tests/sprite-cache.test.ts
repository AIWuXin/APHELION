import { describe, expect, it } from 'vitest';

import { BUILDING_KEYS } from '../../web/src/generated/content-keys';
import { BUILDING_ART } from '../../web/src/render/sprites/buildings';
import { PixelLru } from '../../web/src/render/sprites/pixel-lru';
import { buildingSpriteKey, rasterScale } from '../../web/src/render/sprites/sprite-cache';

describe('building sprite cache', () => {
  it('quantises finite raster scales and falls back safely on invalid input', () => {
    expect(rasterScale(1, 1)).toBe(1);
    expect(rasterScale(1, 1.1)).toBe(1.5);
    expect(rasterScale(2, 1.25)).toBe(2.5);
    expect(rasterScale(4, 2)).toBe(3);
    expect(rasterScale(1, 0.2)).toBe(1);
    for (const [dpr, zoom] of [[NaN, 1], [Infinity, 1], [1, NaN], [0, 1], [-1, 1], [1, -1]] as const) {
      expect(rasterScale(dpr, zoom)).toBe(1);
    }
  });

  it('refreshes LRU order on hits and evicts the oldest entry within its pixel budget', () => {
    const cache = new PixelLru<string>(10);
    cache.put('a', 'A', 4);
    cache.put('b', 'B', 3);
    expect(cache.get('a')).toBe('A');
    cache.put('c', 'C', 4);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe('A');
    expect(cache.get('c')).toBe('C');
    expect(cache.pixelCount).toBe(8);
    expect(cache.size).toBe(2);
    expect(cache.get('missing')).toBeUndefined();
  });

  it('subtracts replaced pixels and never retains an oversize item', () => {
    const cache = new PixelLru<string>(10);
    cache.put('a', 'A', 6);
    cache.put('a', 'AA', 2);
    expect(cache.pixelCount).toBe(2);
    cache.put('large', 'too large', 11);
    expect(cache.get('large')).toBeUndefined();
    expect(cache.get('a')).toBe('AA');
    cache.put('invalid', 'invalid', -1);
    expect(cache.size).toBe(1);
  });

  it('keys bodies only by building identity and scale', () => {
    expect(buildingSpriteKey('solar-array', 2)).toBe('solar-array@2');
    expect(buildingSpriteKey('solar-array', 2.5)).not.toBe(buildingSpriteKey('solar-array', 2));
  });

  it('provides bounded legacy art for all sixteen buildings', () => {
    expect(Object.keys(BUILDING_ART)).toHaveLength(16);
    for (const key of BUILDING_KEYS) {
      const art = BUILDING_ART[key];
      expect(art.body).toBeNull();
      expect(art.motion).toBeTypeOf('function');
      expect(art.bounds.left).toBeLessThan(art.bounds.right);
      expect(art.bounds.top).toBeLessThan(art.bounds.bottom);
      expect(art.healthY).toBeLessThan(0);
      expect(art.healthY).toBeGreaterThanOrEqual(art.bounds.top);
    }
  });
});
