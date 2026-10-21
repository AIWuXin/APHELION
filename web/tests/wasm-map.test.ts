/**
 * Integration test: the map the client paints must be the map the simulation
 * rules over.
 *
 * `BootBlob.map.material` drives the terrain painter; `oc_query_place` drives
 * placement legality. If those two ever disagree, buildings appear to float on
 * water. This test loads the real wasm build and cross-checks every tile.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { decodeBootBlob } from '../../web/src/net/decode';
import type { BootBlob } from '../../web/src/generated/BootBlob';

/** The subset of the bridge ABI this test needs. */
interface OcExports {
  readonly memory: WebAssembly.Memory;
  readonly oc_init: (seed: number) => number;
  readonly oc_boot_ptr: () => number;
  readonly oc_boot_len: () => number;
  readonly oc_query_place: (kind: number, tx: number, ty: number) => number;
}

/** Building table index of the 1x1 bulwark: cheapest legal proxy for "can build here?". */
const BULWARK = 10;
/** Terrain material indices that must reject construction (`oc-content`). */
const UNBUILDABLE = new Set([4, 7]); // brine, crystal field

async function bootWorld(): Promise<{ exports: OcExports; boot: BootBlob }> {
  const bytes = readFileSync(join(process.cwd(), 'web', 'public', 'oc.wasm'));
  const { instance } = await WebAssembly.instantiate(bytes, {});
  const exports = instance.exports as unknown as OcExports;
  exports.oc_init(0x5eed_1234);
  const view = new Uint8Array(
    exports.memory.buffer,
    exports.oc_boot_ptr(),
    exports.oc_boot_len(),
  );
  return { exports, boot: decodeBootBlob(view.slice()) };
}

describe('wasm map / rules agreement', () => {
  it('refuses placement on exactly the tiles it paints as unbuildable', async () => {
    const { exports, boot } = await bootWorld();
    const { map } = boot;
    const mismatches: string[] = [];

    for (let ty = 0; ty < map.h; ty += 1) {
      for (let tx = 0; tx < map.w; tx += 1) {
        const material = map.material[ty * map.w + tx] ?? 0;
        const packed = exports.oc_query_place(BULWARK, tx, ty);
        const placementOk = (packed & 8) !== 0;
        if (UNBUILDABLE.has(material) && placementOk) {
          mismatches.push(`(${tx},${ty}) painted as material ${material} but reported buildable`);
        }
      }
    }
    expect(mismatches.slice(0, 8)).toEqual([]);
  });

  it('has a dry, buildable starting area', async () => {
    const { exports, boot } = await bootWorld();
    const { map } = boot;
    // The colony is seeded around tile (19,19); its 8x8 neighbourhood must be
    // land (and must allow construction) or the opening looks like it is
    // floating on a lake.
    let wet = 0;
    let blocked = 0;
    for (let ty = 16; ty < 26; ty += 1) {
      for (let tx = 16; tx < 26; tx += 1) {
        const material = map.material[ty * map.w + tx] ?? 0;
        if (UNBUILDABLE.has(material)) wet += 1;
        const packed = exports.oc_query_place(BULWARK, tx, ty);
        if ((packed & 8) === 0) blocked += 1;
      }
    }
    expect(wet).toBe(0);
    // Only the tiles already occupied by the three seeded structures (the 3x3
    // command hub plus two 2x2 pads: 9 + 4 + 4 tiles) may be blocked in that
    // window.
    expect(blocked).toBeLessThanOrEqual(17);
    expect(blocked).toBeGreaterThan(0);
  });
});
