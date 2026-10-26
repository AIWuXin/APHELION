import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { eraAllowsKey } from '../../web/src/content/era';
import { PLACEMENT_REASON_ZH, placementReasonText } from '../../web/src/content/placement';
import { EVENT_KEYS } from '../../web/src/generated/content-keys';
import { decodeBootBlob } from '../../web/src/net/decode';
import { eventDedupKey } from '../../web/src/ui/panels/event-log';

const fixture = readFileSync(join(process.cwd(), 'web', 'tests', 'fixtures', 'boot.bin'));
const bytes = new Uint8Array(fixture.buffer, fixture.byteOffset, fixture.byteLength);
const defs = decodeBootBlob(bytes).catalog.buildings;

describe('T1 HUD feedback', () => {
  it('reveals gated panels with the building that makes them useful', () => {
    for (const key of ['radar-array', 'research-lab', 'freight-dock']) {
      expect(eraAllowsKey(defs, key, 1)).toBe(false);
    }
    expect(eraAllowsKey(defs, 'radar-array', 2)).toBe(true);
    expect(eraAllowsKey(defs, 'research-lab', 2)).toBe(true);
    expect(eraAllowsKey(defs, 'freight-dock', 2)).toBe(false);
    expect(eraAllowsKey(defs, 'freight-dock', 3)).toBe(true);
    expect(eraAllowsKey(defs, 'missing-building', 3)).toBe(false);
  });

  it('translates every wire placement reason without changing its index', () => {
    expect(PLACEMENT_REASON_ZH).toEqual([
      '可以放置',
      '合金不足',
      '燃料不足',
      '超出可建造区域',
      '地形不适合建造',
      '地块已被占用',
      '需要前置科技',
      '缺少资源点或设施连接',
      '电力不足',
      '当前时代尚未解锁',
    ]);
    PLACEMENT_REASON_ZH.forEach((text, reason) => {
      expect(placementReasonText(reason)).toBe(text);
    });
    expect(placementReasonText(255)).toBe('无法放置');
  });

  it('keeps simultaneous raid squads distinct but dedupes repeated events at one site', () => {
    const raid = { kind: EVENT_KEYS.indexOf('raid'), a: 4, b: 0, tx: 10, ty: 20 };
    expect(eventDedupKey(raid)).toBe(eventDedupKey({ ...raid }));
    expect(eventDedupKey(raid)).not.toBe(eventDedupKey({ ...raid, tx: 11 }));
    expect(eventDedupKey(raid)).not.toBe(eventDedupKey({ ...raid, ty: 21 }));
  });
});
