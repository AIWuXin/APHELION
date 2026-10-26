import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { EVENT_KEYS } from '../../web/src/generated/content-keys';
import type { Command } from '../../web/src/generated/Command';
import { decodeBootBlob, decodeSnapshot } from '../../web/src/net/decode';
import { encodeCommandBatch } from '../../web/src/net/encode';
import type { HudView } from '../../web/src/ui/hud-api';
import { EventLogPanel } from '../../web/src/ui/panels/event-log';

interface OcExports {
  readonly memory: WebAssembly.Memory;
  readonly oc_init: (seed: number) => number;
  readonly oc_boot_ptr: () => number;
  readonly oc_boot_len: () => number;
  readonly oc_alloc: (len: number) => number;
  readonly oc_free: (ptr: number, len: number) => void;
  readonly oc_apply: (ptr: number, len: number) => void;
  readonly oc_step: () => void;
  readonly oc_snapshot_ptr: () => number;
  readonly oc_snapshot_len: () => number;
  readonly oc_query_place: (kind: number, tx: number, ty: number) => number;
}

function bytes(exports: OcExports, ptr: number, len: number): Uint8Array {
  return new Uint8Array(exports.memory.buffer, ptr, len).slice();
}

function send(exports: OcExports, commands: readonly Command[]): void {
  const payload = encodeCommandBatch(commands);
  const ptr = exports.oc_alloc(payload.byteLength);
  if (ptr === 0) throw new Error('wasm allocation failed');
  new Uint8Array(exports.memory.buffer, ptr, payload.byteLength).set(payload);
  exports.oc_apply(ptr, payload.byteLength);
  exports.oc_free(ptr, payload.byteLength);
}

describe('wasm paused events through the HUD consumer', () => {
  it('delivers an instant build event without advancing the tick', async () => {
    const wasm = readFileSync(join(process.cwd(), 'web', 'public', 'oc.wasm'));
    const { instance } = await WebAssembly.instantiate(wasm, {});
    const exports = instance.exports as unknown as OcExports;
    exports.oc_init(0x5eed_1234);
    const boot = decodeBootBlob(bytes(exports, exports.oc_boot_ptr(), exports.oc_boot_len()));

    let anchor: { tx: number; ty: number } | null = null;
    for (let dy = -10; dy <= 10 && !anchor; dy += 1) {
      for (let dx = -10; dx <= 10; dx += 1) {
        const tx = boot.map.start_tx + dx;
        const ty = boot.map.start_ty + dy;
        if ((exports.oc_query_place(1, tx, ty) & 1) !== 0) {
          anchor = { tx, ty };
          break;
        }
      }
    }
    if (!anchor) throw new Error('no solar anchor near the colony');

    send(exports, [
      { setSandbox: { flags: 3 } },
      { pause: { paused: true } },
      { place: { kind: 1, ...anchor } },
    ]);
    exports.oc_step();
    const snapshot = decodeSnapshot(bytes(exports, exports.oc_snapshot_ptr(), exports.oc_snapshot_len()));
    expect(snapshot.tick).toBe(0);
    expect(snapshot.events.some((event) => event.kind === EVENT_KEYS.indexOf('build-done'))).toBe(true);

    const panel = Object.create(EventLogPanel.prototype) as EventLogPanel;
    Object.assign(panel, { boot, buffer: [], keys: new Set(), lastSnapshot: null });
    Object.defineProperty(panel, 'render', { value: () => undefined });
    const view: HudView = {
      snapshot,
      boot,
      selection: { id: 0, kind: 'none' },
      placing: -1,
      placementReason: null,
      debug: null,
    };
    expect(panel.consume(view)).toHaveLength(1);
    expect(panel.consume(view)).toHaveLength(0);

    exports.oc_step();
    const next = decodeSnapshot(bytes(exports, exports.oc_snapshot_ptr(), exports.oc_snapshot_len()));
    expect(next.tick).toBe(0);
    expect(panel.consume({ ...view, snapshot: next })).toHaveLength(0);
  });
});
