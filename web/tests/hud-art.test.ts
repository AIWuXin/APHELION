import { describe, expect, it } from 'vitest';

import { BUILDING_KEYS, UNIT_KEYS } from '../../web/src/generated/content-keys';
import { BUILDING_ICONS, UNIT_ICONS } from '../../web/src/ui/icons';
import { buildingCentre } from '../../web/src/ui/radar-layout';

describe('aerospace command HUD assets', () => {
  it('maps every building to a distinct filled isometric thumbnail in generated order', () => {
    expect(BUILDING_ICONS).toHaveLength(16);
    expect(new Set(BUILDING_ICONS).size).toBe(16);
    BUILDING_KEYS.forEach((key, index) => {
      const icon = BUILDING_ICONS[index] ?? '';
      expect(icon).toContain(`data-asset="${key}"`);
      expect(icon).toContain('viewBox="0 0 48 36"');
      expect(icon).toContain('fill=');
    });
  });

  it('maps all seven unit silhouettes without substituting generic glyphs', () => {
    expect(UNIT_ICONS).toHaveLength(7);
    expect(new Set(UNIT_ICONS).size).toBe(7);
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
});
