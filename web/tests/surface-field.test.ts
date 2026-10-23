import { describe, expect, it } from 'vitest';

import { hash32 } from '../../web/src/render/terrain/noise';
import { contourLocal, oreFacets, oreTraceVisible, speckPoints, surfaceField } from '../../web/src/render/terrain/surface-rules';

describe('world-space surface texture', () => {
  it('keeps long waves horizontal and continuous across a tile boundary', () => {
    expect(contourLocal(4, 6, 0.5, 16, 0, 0)).toEqual([0.5, 5.5]);
    expect(contourLocal(5, 5, 0, 16, 0, 0)).toEqual([0, 6]);
    expect(contourLocal(6, 4, 1, 16, 0, 0)).toEqual([1, 5]);
    const edgeA = contourLocal(31, 32, 1, 16, 1.5, 0);
    const edgeB = contourLocal(32, 31, 0, 16, 1.5, 0);
    expect(edgeA[0] + edgeA[1]).toBeCloseTo(1 + Math.sin(Math.PI * 2 / 128) * 1.5, 10);
    expect(edgeB[0] + edgeB[1]).toBe(edgeA[0] + edgeA[1]);
  });

  it('anchors noise at world lattice points, including negative and wrapped coordinates', () => {
    const lattice = (x: number, y: number, seed: number) => (hash32(x + seed, y - seed) & 1023) / 1024;
    expect(surfaceField(0, 0, 8, 7)).toBe(lattice(0, 0, 7));
    expect(surfaceField(-16, 32, 8, 7)).toBe(lattice(10224 / 8, 4, 7));
    expect(surfaceField(10240, 0, 8, 7)).toBe(lattice(0, 0, 7));
    expect(surfaceField(0, -10240, 8, 7)).toBe(lattice(0, 0, 7));
    const points: readonly (readonly [number, number])[] = [[31, 32], [-1, -33], [10239, 0]];
    for (const [x, y] of points) {
      expect(surfaceField(x, y, 32, 19)).toBe(surfaceField(x + 10240, y - 10240, 32, 19));
      expect(surfaceField(x, y, 32, 19)).toBe(surfaceField(x, y, 32, 19));
    }
  });

  it('interpolates continuously across tile and chunk boundaries', () => {
    const a = surfaceField(31.999, 32, 16, 41);
    const b = surfaceField(32, 32, 16, 41);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(1);
    expect(Math.abs(a - b)).toBeLessThan(0.00001);
    expect(Math.abs(surfaceField(-0.001, 0, 8, 41) - surfaceField(10239.999, 0, 8, 41))).toBeLessThan(0.00001);
  });

  it('produces deterministic in-tile grain without edge-centred stamps', () => {
    const points = speckPoints(32, 31, 4, 23);
    expect(points).toHaveLength(4);
    expect(points).toEqual(speckPoints(-10208, 10271, 4, 23));
    expect(speckPoints(2, 3, -1, 23)).toEqual([]);
    for (const [a, b] of points) {
      expect(a).toBeGreaterThanOrEqual(0.08);
      expect(a).toBeLessThanOrEqual(0.92);
      expect(b).toBeGreaterThanOrEqual(0.08);
      expect(b).toBeLessThanOrEqual(0.92);
    }
    expect(speckPoints(32, 32, 4, 23)).not.toEqual(speckPoints(33, 32, 4, 23));
  });

  it('does not carpet low-grade terrain in identical mineral clusters', () => {
    expect(oreTraceVisible(20, 0.81)).toBe(false);
    expect(oreTraceVisible(20, 0.83)).toBe(true);
    expect(oreTraceVisible(40, 0)).toBe(true);
    expect(oreTraceVisible(0, 1)).toBe(false);
  });

  it('keeps low-grade ore quiet and reserves large facets for rich veins', () => {
    expect(oreFacets(0)).toEqual({ shards: 0, height: 0 });
    expect(oreFacets(-5)).toEqual({ shards: 0, height: 0 });
    expect(oreFacets(20)).toEqual({ shards: 0, height: 0 });
    const rich = oreFacets(120);
    expect(rich.shards).toBeGreaterThanOrEqual(3);
    expect(rich.height).toBeGreaterThanOrEqual(7);
    expect(oreFacets(1000)).toEqual(oreFacets(120));
  });
});
