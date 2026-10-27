import { describe, expect, it } from 'vitest';

import { BUILDING_KEYS, UNIT_KEYS } from '../../web/src/generated/content-keys';
import { isoBox } from '../../web/src/ui/icon-kit';
import { BUILDING_ICONS, UNIT_ICONS } from '../../web/src/ui/icons';
import { buildingCentre } from '../../web/src/ui/radar-layout';

describe('aerospace command HUD assets', () => {
  it('maps every building to a distinct filled isometric thumbnail in generated order', () => {
    expect(BUILDING_ICONS).toHaveLength(17);
    expect(new Set(BUILDING_ICONS).size).toBe(17);
    BUILDING_KEYS.forEach((key, index) => {
      const icon = BUILDING_ICONS[index] ?? '';
      expect(icon).toContain(`data-asset="${key}"`);
      expect(icon).toContain('viewBox="0 0 48 36"');
      expect(icon).toContain('fill=');
    });
  });

  it('maps all eight unit silhouettes without substituting generic glyphs', () => {
    expect(UNIT_ICONS).toHaveLength(8);
    expect(new Set(UNIT_ICONS).size).toBe(8);
    UNIT_KEYS.forEach((key, index) => {
      expect(UNIT_ICONS[index]).toContain(`data-asset="${key}"`);
      expect(UNIT_ICONS[index]).toContain('viewBox="0 0 48 36"');
    });
  });

  it('uses each building footprint centre for radar contact and selection placement', () => {
    expect(buildingCentre(10, 20, 3)).toEqual([11.5, 21.5]);
    expect(buildingCentre(10, 20, 2)).toEqual([11, 21]);
    expect(buildingCentre(-1, 0, 1)).toEqual([-0.5, 0.5]);
  });

  it('drops both isometric box side faces by exactly their height', () => {
    const art = isoBox(24, 12, 13, 3, 3);
    expect(art).toContain('M24 9L37 15.5L24 22L11 15.5Z');
    expect(art).toContain('M11 15.5L24 22L24 25L11 18.5Z');
    expect(art).toContain('M24 22L37 15.5L37 18.5L24 25Z');
  });
});
