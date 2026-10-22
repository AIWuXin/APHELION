/**
 * Integration test: the map the client paints must be the map the simulation
 * rules over.
 *
 * Terrain no longer arrives at boot -- it streams per 32x32 `ChunkView` through
 * `oc_chunk` -- so this test walks a block of chunks around the colony, decodes
 * each one exactly the way the renderer does, and cross-checks every tile
 * against `oc_query_place`. If the two ever disagree, buildings appear to float
 * on water.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { BootBlob } from '../../web/src/generated/BootBlob';
import { decodeBootBlob, decodeChunkView } from '../../web/src/net/decode';
import { Reader } from '../../web/src/net/postcard';

/** The subset of the bridge ABI this test needs. */
interface OcExports {
  readonly memory: WebAssembly.Memory;
  readonly oc_init: (seed: number) => number;
  readonly oc_boot_ptr: () => number;
  readonly oc_boot_len: () => number;
  readonly oc_chunk: (cx: number, cy: number) => number;
  readonly oc_chunk_len: () => number;
  readonly oc_query_place: (kind: number, tx: number, ty: number) => number;
}

/** Building table index of the 1x1 bulwark: cheapest legal proxy for "can build here?". */
const BULWARK = 10;
/** Terrain materials that must reject construction (`oc-content`). */
const UNBUILDABLE = new Set([4, 7, 8, 9]); // brine, crystal field, shallow, deep
/** Chunks scanned per axis around the colony chunk. */
const SCAN_RADIUS = 4;

interface World {
  readonly exports: OcExports;
  readonly boot: BootBlob;
}

async function bootWorld(): Promise<World> {
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

/** Stream one chunk the way `WasmTransport.chunk` does and decode it. */
function readChunk(world: World, cx: number, cy: number) {
  const ptr = world.exports.oc_chunk(cx, cy);
  const len = world.exports.oc_chunk_len();
  const bytes = new Uint8Array(world.exports.memory.buffer, ptr, len).slice();
  return decodeChunkView(new Reader(bytes));
}

describe('wasm chunk / rules agreement', () => {
  it('serves every chunk as a full chunk-sized tile block', async () => {
    const world = await bootWorld();
    const { map } = world.boot;
    const chunks = map.width / map.chunk_size;
    // Coordinates wrap: the chunk before (0,0) and the chunk after the last one
    // are real chunks, not errors.
    for (const [cx, cy] of [
      [0, 0],
      [chunks - 1, chunks - 1],
      [-1, -1],
      [chunks, chunks],
    ] as const) {
      const chunk = readChunk(world, cx, cy);
      expect(chunk.terrain, `chunk ${cx},${cy}`).toHaveLength(map.chunk_size ** 2);
      expect(chunk.elev).toHaveLength(map.chunk_size ** 2);
      expect(chunk.coal).toHaveLength(map.chunk_size ** 2);
    }
    // (-1,-1) is the same chunk as (chunks-1, chunks-1): the generator wraps.
    const wrapped = readChunk(world, chunks - 1, chunks - 1);
    const before = readChunk(world, -1, -1);
    expect(before.cx).toBe(wrapped.cx);
    expect(before.cy).toBe(wrapped.cy);
    expect(before.terrain).toEqual(wrapped.terrain);
  });

  it('refuses placement on exactly the tiles it streams as unbuildable', async () => {
    const world = await bootWorld();
    const { map } = world.boot;
    const size = map.chunk_size;
    const chunks = map.width / size;
    const startCx = Math.floor(map.start_tx / size);
    const startCy = Math.floor(map.start_ty / size);
    const mismatches: string[] = [];
    let wet = 0;

    for (let dy = -SCAN_RADIUS; dy <= SCAN_RADIUS; dy += 1) {
      for (let dx = -SCAN_RADIUS; dx <= SCAN_RADIUS; dx += 1) {
        const cx = (startCx + dx + chunks) % chunks;
        const cy = (startCy + dy + chunks) % chunks;
        const chunk = readChunk(world, cx, cy);
        for (let ly = 0; ly < size; ly += 1) {
          for (let lx = 0; lx < size; lx += 1) {
            const i = ly * size + lx;
            const material = chunk.terrain[i] ?? 0;
            if (material >= 8) wet += 1;
            const packed = world.exports.oc_query_place(BULWARK, cx * size + lx, cy * size + ly);
            const placementOk = (packed & 8) !== 0;
            if (UNBUILDABLE.has(material) && placementOk) {
              mismatches.push(
                `(${cx * size + lx},${cy * size + ly}) streamed as material ${material} but reported buildable`,
              );
            }
          }
        }
      }
    }
    expect(mismatches.slice(0, 8)).toEqual([]);
    // The window has to actually contain ocean, or the water half of the
    // UNBUILDABLE set was never exercised.
    expect(wet).toBeGreaterThan(0);
  });

  it('has a dry, buildable starting area', async () => {
    const world = await bootWorld();
    const { map } = world.boot;
    const size = map.chunk_size;
    const cx = Math.floor(map.start_tx / size);
    const cy = Math.floor(map.start_ty / size);
    const chunk = readChunk(world, cx, cy);
    const local = (tx: number, ty: number): number => {
      const lx = tx - cx * size;
      const ly = ty - cy * size;
      return chunk.terrain[ly * size + lx] ?? 0;
    };
    // The colony is seeded around the anchor tile; its 10x10 neighbourhood must
    // be land (and must allow construction) or the opening looks like it is
    // floating on a lake.
    let wet = 0;
    let blocked = 0;
    for (let ty = map.start_ty - 5; ty < map.start_ty + 5; ty += 1) {
      for (let tx = map.start_tx - 5; tx < map.start_tx + 5; tx += 1) {
        if (UNBUILDABLE.has(local(tx, ty))) wet += 1;
        const packed = world.exports.oc_query_place(BULWARK, tx, ty);
        if ((packed & 8) === 0) blocked += 1;
      }
    }
    expect(wet).toBe(0);
    // Only the tiles already occupied by the seeded structures (the 3x3 command
    // hub plus two 2x2 pads: 9 + 4 + 4 tiles) may be blocked in that window.
    expect(blocked).toBeLessThanOrEqual(17);
    expect(blocked).toBeGreaterThan(0);
  });
});
