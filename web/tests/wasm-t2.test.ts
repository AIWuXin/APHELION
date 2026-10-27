/** Real WASM campaign: ordinary commands, no sandbox resources or era override. */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { BootBlob } from '../../web/src/generated/BootBlob';
import type { Command } from '../../web/src/generated/Command';
import type { Snapshot } from '../../web/src/generated/Snapshot';
import { BUILDING_KEYS, EVENT_KEYS, UNIT_KEYS } from '../../web/src/generated/content-keys';
import { decodeBootBlob, decodeSnapshot } from '../../web/src/net/decode';
import { encodeCommandBatch } from '../../web/src/net/encode';

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

const OIL_WELL = BUILDING_KEYS.indexOf('oil-well');
const FUEL_SYNTH = BUILDING_KEYS.indexOf('fuel-synth');
const TRAIN = UNIT_KEYS.indexOf('freight-train');
const ERA = EVENT_KEYS.indexOf('era');

class WasmWorld {
  public readonly boot: BootBlob;

  public constructor(public readonly exports: OcExports) {
    exports.oc_init(0x5eed_1234);
    this.boot = decodeBootBlob(this.bytes(exports.oc_boot_ptr(), exports.oc_boot_len()));
  }

  public snapshot(): Snapshot {
    return decodeSnapshot(this.bytes(this.exports.oc_snapshot_ptr(), this.exports.oc_snapshot_len()));
  }

  public send(commands: Command[]): void {
    const payload = encodeCommandBatch(commands);
    const ptr = this.exports.oc_alloc(payload.byteLength);
    if (ptr === 0) throw new Error('WASM allocation failed');
    new Uint8Array(this.exports.memory.buffer, ptr, payload.byteLength).set(payload);
    this.exports.oc_apply(ptr, payload.byteLength);
    this.exports.oc_free(ptr, payload.byteLength);
  }

  public until(test: (snapshot: Snapshot) => boolean, limit = 3_000): Snapshot {
    for (let frame = 0; frame < limit; frame += 1) {
      const snapshot = this.snapshot();
      if (test(snapshot)) return snapshot;
      if (snapshot.status === 2) throw new Error(`colony lost at tick ${snapshot.tick}`);
      this.exports.oc_step();
    }
    throw new Error(`condition not reached at tick ${this.snapshot().tick}`);
  }

  public place(kind: number, oilAnchor = false): void {
    const def = this.boot.catalog.buildings[kind];
    if (!def) throw new Error(`unknown building ${kind}`);
    this.until((s) => s.resources.alloy >= def.cost_alloy && s.resources.fuel >= def.cost_fuel);
    const { start_tx: hx, start_ty: hy, oil_tx: ox, oil_ty: oy } = this.boot.map;
    if (oilAnchor) {
      if ((this.exports.oc_query_place(kind, ox, oy) & 1) === 0) throw new Error('oil anchor is not buildable');
      this.send([{ place: { kind, tx: ox, ty: oy } }]);
    } else {
      let placed = false;
      for (let ring = 2; ring <= 20 && !placed; ring += 1) {
        for (let dy = -ring; dy <= ring && !placed; dy += 1) {
          for (let dx = -ring; dx <= ring; dx += 1) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
            const tx = hx + dx;
            const ty = hy + dy;
            if ((this.exports.oc_query_place(kind, tx, ty) & 1) === 0) continue;
            this.send([{ place: { kind, tx, ty } }]);
            placed = true;
            break;
          }
        }
      }
      if (!placed) throw new Error(`no site for ${def.key}`);
    }
    this.exports.oc_step();
    if (!this.snapshot().buildings.some((b) => b.kind === kind)) throw new Error(`${def.key} was not placed`);
  }

  private bytes(ptr: number, len: number): Uint8Array {
    return new Uint8Array(this.exports.memory.buffer, ptr, len).slice();
  }
}

describe('WASM T2 freight campaign', () => {
  it('earns T2 through coal and combat, then physically delivers crude', async () => {
    const file = readFileSync(join(process.cwd(), 'web', 'public', 'oc.wasm'));
    const { instance } = await WebAssembly.instantiate(file, {});
    const world = new WasmWorld(instance.exports as unknown as OcExports);
    world.send([{ setSpeed: { speed: 3 } }]);
    for (const key of ['coal-mine', 'coal-plant', 'rail-turret', 'rail-turret'] as const) {
      world.place(BUILDING_KEYS.indexOf(key));
    }
    const eras: Snapshot['events'] = [];
    const t2 = world.until((s) => {
      eras.push(...s.events.filter((event) => event.kind === ERA));
      return s.era === 2;
    });
    expect(t2.orbital.wave).toBe(1);
    expect(t2.policy.sandbox_flags).toBe(0);
    expect(t2.resources.fuel).toBe(0);
    expect(eras.some((event) => event.a === 2 && event.tx === world.boot.map.oil_tx && event.ty === world.boot.map.oil_ty)).toBe(true);

    world.place(OIL_WELL, true);
    world.place(FUEL_SYNTH);
    let sawLocalStock = false;
    let sawCargo = false;
    let moved = false;
    let origin: { x: number; y: number } | null = null;
    const delivered = world.until((s) => {
      const well = s.buildings.find((b) => b.kind === OIL_WELL);
      const train = s.units.find((u) => u.kind === TRAIN);
      if (well && well.aux > 0 && s.resources.oil === 0) sawLocalStock = true;
      if (train) {
        origin ??= { x: train.x, y: train.y };
        if (train.x !== origin.x || train.y !== origin.y) moved = true;
        if (train.home === well?.id && train.cargo > 0 && s.resources.oil === 0) sawCargo = true;
      }
      return s.era === 3 && s.resources.oil > 0 && s.resources.fuel > 0;
    });
    expect(delivered.era).toBe(3);
    expect(delivered.buildings.some((b) => b.kind === FUEL_SYNTH && b.state === 2)).toBe(true);
    expect(sawLocalStock).toBe(true);
    expect(sawCargo).toBe(true);
    expect(moved).toBe(true);
  }, 30_000);
});
