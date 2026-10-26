import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { EVENT_KEYS } from '../../web/src/generated/content-keys';
import type { Snapshot } from '../../web/src/generated/Snapshot';
import { decodeBootBlob, decodeSnapshot } from '../../web/src/net/decode';
import type { HudView } from '../../web/src/ui/hud-api';
import { EventLogPanel } from '../../web/src/ui/panels/event-log';

function readBytes(name: string): Uint8Array {
  const file = readFileSync(join(process.cwd(), 'web', 'tests', 'fixtures', name));
  return new Uint8Array(file.buffer, file.byteOffset, file.byteLength);
}

const boot = decodeBootBlob(readBytes('boot.bin'));
const baseSnapshot = decodeSnapshot(readBytes('snapshot.bin'));
const RAID = EVENT_KEYS.indexOf('raid');

function view(snapshot: Snapshot): HudView {
  return {
    snapshot,
    boot,
    selection: { id: 0, kind: 'none' },
    placing: -1,
    placementReason: null,
    debug: null,
  };
}

function panelWithoutDom(): EventLogPanel {
  const panel = Object.create(EventLogPanel.prototype) as EventLogPanel;
  Object.assign(panel, { boot, buffer: [], keys: new Set(), lastSnapshot: null });
  Object.defineProperty(panel, 'render', { value: () => undefined });
  return panel;
}

function raid(tx: number, ty: number) {
  return { kind: RAID, a: 4, b: 0, tx, ty };
}

describe('event log snapshot consumption', () => {
  it('accepts a new snapshot at the same tick but not the same object twice', () => {
    const panel = panelWithoutDom();
    const first = view({
      ...baseSnapshot,
      tick: 42,
      time_ms: 1_386,
      events: [raid(10, 20), raid(11, 21)],
    });
    expect(panel.consume(first)).toHaveLength(2);
    expect(panel.consume(first)).toHaveLength(0);

    const pausedNext = view({
      ...baseSnapshot,
      tick: 42,
      time_ms: 1_386,
      events: [raid(12, 22)],
    });
    expect(panel.consume(pausedNext)).toHaveLength(1);
    expect(panel.consume(pausedNext)).toHaveLength(0);
  });
});
