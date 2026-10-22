/**
 * Chunk material derivation tests.
 *
 * The companion mask reads a two-tile halo, so a chunk's border materials are a
 * function of its neighbours. Streaming fetches the centre before its ring,
 * which used to freeze a clamped border into the first derivation and leave a
 * 32-tile seam. These tests pin the load-order independence: a cold centre that
 * gets its neighbours later must end up byte-identical to a centre loaded after
 * its neighbourhood, and the repair must happen once, not on every arrival.
 */

import { describe, expect, it } from 'vitest';

import type { ChunkView } from '../../web/src/generated/ChunkView';
import type { MapView } from '../../web/src/generated/MapView';
import type { ChunkSource } from '../../web/src/render/terrain/chunk-store';
import { ChunkStore } from '../../web/src/render/terrain/chunk-store';

const EDGE = 32;
const CENTRE = 1;
const ROAD = 6;

const MAP: MapView = {
  seed: 1,
  width: EDGE * 3,
  height: EDGE * 3,
  chunk_size: EDGE,
  start_tx: EDGE,
  start_ty: EDGE,
};

/** Centre chunk is basalt (companion: regolith); every neighbour is road. */
function viewOf(cx: number, cy: number): ChunkView {
  const material = cx === CENTRE && cy === CENTRE ? 0 : ROAD;
  const tiles = new Array<number>(EDGE * EDGE).fill(material);
  return {
    cx,
    cy,
    terrain: tiles,
    decor: new Array<number>(EDGE * EDGE).fill(0),
    elev: new Array<number>(EDGE * EDGE).fill(0),
    ore: new Array<number>(EDGE * EDGE).fill(0),
    coal: new Array<number>(EDGE * EDGE).fill(0),
  };
}

const SOURCE: ChunkSource = { chunk: viewOf };

/** Effective materials of the centre chunk, row-major. */
function centreMaterials(store: ChunkStore): number[] {
  const out: number[] = [];
  for (let ly = 0; ly < EDGE; ly += 1) {
    for (let lx = 0; lx < EDGE; lx += 1) {
      out.push(store.material(CENTRE * EDGE + lx, CENTRE * EDGE + ly));
    }
  }
  return out;
}

/** Indices where two tables differ. */
function differences(a: readonly number[], b: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) out.push(i);
  return out;
}

/** Tiles within two of the chunk border, the only ones the halo can reach. */
function nearBorder(index: number): boolean {
  const x = index % EDGE;
  const y = Math.floor(index / EDGE);
  return x <= 1 || x >= EDGE - 2 || y <= 1 || y >= EDGE - 2;
}

describe('chunk material halo', () => {
  it('converges to the halo-first table when neighbours arrive after the centre', () => {
    const cold = new ChunkStore(MAP, SOURCE);
    cold.ensure(CENTRE, CENTRE);
    const before = centreMaterials(cold);

    cold.ensureRing(CENTRE, CENTRE);
    const after = centreMaterials(cold);

    const haloFirst = new ChunkStore(MAP, SOURCE);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx !== 0 || dy !== 0) haloFirst.ensure(CENTRE + dx, CENTRE + dy);
      }
    }
    haloFirst.ensure(CENTRE, CENTRE);
    const reference = centreMaterials(haloFirst);

    // The clamped first pass really did paint a different border ...
    const changed = differences(before, after);
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.every(nearBorder)).toBe(true);
    // ... and the repaired table is the one the neighbours always implied.
    expect(after).toEqual(reference);
  });

  it('re-derives at most once and never refetches for an unchanged ring', () => {
    const store = new ChunkStore(MAP, SOURCE);
    store.ensure(CENTRE, CENTRE);
    store.ensureRing(CENTRE, CENTRE);

    const repaired = store.ensure(CENTRE, CENTRE);
    expect(repaired).not.toBeNull();
    const table = repaired?.material;
    const fetches = store.fetches;

    store.ensureRing(CENTRE, CENTRE);
    expect(store.fetches).toBe(fetches);
    expect(store.ensure(CENTRE, CENTRE)?.material).toBe(table);
  });
});
