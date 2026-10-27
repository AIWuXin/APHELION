/**
 * Decoded chunk store: the presentation side's cache of 32x32 terrain blocks.
 *
 * The planet is 10240 x 10240 tiles, generated as a pure function of
 * `(seed, chunk)`, so nothing ever holds the whole surface. This module mirrors
 * the kernel's `ChunkCache` contract: a bounded LRU over decoded `ChunkView`
 * records, with tile lookups that **wrap on both axes**. A chunk may be evicted
 * and fetched again at any time and must come back identical.
 *
 * On top of the raw tile data it derives the *effective* material of every tile
 * (the source material after the companion-patch mask). That mask is a
 * 5-neighbour majority filter, so it needs a two-tile halo: it is built over a
 * `CHUNK + 4` square and the inner 32x32 is what the painter sees. Doing it
 * here instead of inside the bake keeps companion patches continuous across
 * chunk borders -- otherwise a straight line of patches would end along every
 * 32-tile seam. The halo can arrive after the chunk itself, so a table derived
 * from a partial neighbourhood is provisional; {@link ChunkStore.ensureRing}
 * re-derives it once the cardinals are resident.
 */

import type { ChunkView } from '../../generated/ChunkView';
import type { MapView } from '../../generated/MapView';
import { TERRAIN_KEYS } from '../../generated/content-keys';
import { shade } from '../../style/tokens';
import { TERRAIN_PAINT } from '../world-palette';
import { chunksPerAxis, wrapIndex } from '../torus';
import { companionMask } from './noise';

/** Resident chunk budget, mirroring `oc-sim`'s `CHUNK_CACHE_CAPACITY`. */
export const CHUNK_DATA_CAPACITY = 256;

/** Halo tiles the companion mask needs (two 5-neighbour smoothing passes). */
const HALO = 2;

/** Terrain material indices that read as open water. */
const WATER = new Set([4, 8, 9]);

/** One tile as the painter sees it. */
export interface TileData {
  /** Material after the companion mask (what is painted). */
  readonly material: number;
  /** Material straight from the generator (before the companion mask). */
  readonly source: number;
  /** Elevation step: `-2` deep water, `-1` shallow, `0..=3` land. */
  readonly elev: number;
  /** Decoration index, `0` = bare. */
  readonly decor: number;
  /** Mineral richness. */
  readonly ore: number;
  /** Coal seam richness. */
  readonly coal: number;
  /** Oil reservoir richness. */
  readonly oil: number;
}

/** Where chunk records come from (`oc_chunk` on the wasm bridge). */
export interface ChunkSource {
  /** Fetch one chunk, or `null` when the transport cannot serve terrain. */
  readonly chunk: (cx: number, cy: number) => ChunkView | null;
}

/** A resident chunk plus its derived per-tile materials. */
interface LoadedChunk {
  readonly cx: number;
  readonly cy: number;
  readonly view: ChunkView;
  /**
   * Effective material per local tile, row-major. Replaced in place once if the
   * first derivation ran without its halo (see {@link ensureRing}).
   */
  material: Int16Array;
  /** True when the four cardinal neighbours were resident for `material`. */
  halo: boolean;
  /** Flat colour used while this chunk is still baking. */
  readonly dominant: string;
}

/** Bounded, wrapping chunk data store. */
export class ChunkStore {
  private readonly cache = new Map<number, LoadedChunk>();
  private readonly cw: number;
  private readonly ch: number;
  private readonly edge: number;
  private readonly spanX: number;
  private readonly spanY: number;
  private fetched = 0;

  public constructor(
    map: MapView,
    private readonly source: ChunkSource | null,
  ) {
    this.edge = Math.max(1, map.chunk_size);
    this.cw = chunksPerAxis(map.width, this.edge);
    this.ch = chunksPerAxis(map.height, this.edge);
    this.spanX = this.cw * this.edge;
    this.spanY = this.ch * this.edge;
  }

  /** Chunks along x. */
  public get chunksX(): number {
    return this.cw;
  }

  /** Chunks along y. */
  public get chunksY(): number {
    return this.ch;
  }

  /** Chunk edge in tiles. */
  public get chunkEdge(): number {
    return this.edge;
  }

  /** Resident chunk count. */
  public get resident(): number {
    return this.cache.size;
  }

  /** Total `oc_chunk` calls made, for the debug readout. */
  public get fetches(): number {
    return this.fetched;
  }

  /**
   * Resident chunk, fetching it on demand. Coordinates wrap.
   *
   * A first fetch can derive materials before the halo is resident, so the
   * table is provisional until {@link ensureRing} has seen the neighbourhood.
   * Repair mutates the record in place: re-inserting it would change its LRU
   * position and make cached materials look fresher than they are.
   */
  public ensure(cx: number, cy: number): LoadedChunk | null {
    const wx = wrapIndex(cx, this.cw);
    const wy = wrapIndex(cy, this.ch);
    const key = wy * this.cw + wx;
    const hit = this.cache.get(key);
    if (hit) {
      // Refresh LRU order.
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit;
    }
    const source = this.source;
    if (!source) return null;
    this.fetched += 1;
    const view = source.chunk(wx, wy);
    if (!view || view.terrain.length === 0) return null;
    const derived = this.deriveMaterials(wx, wy, view);
    const loaded: LoadedChunk = {
      cx: wx,
      cy: wy,
      view,
      material: derived.material,
      halo: derived.halo,
      dominant: dominantColour(view),
    };
    this.cache.set(key, loaded);
    if (this.cache.size > CHUNK_DATA_CAPACITY) {
      const oldest = this.cache.keys().next();
      if (!oldest.done) this.cache.delete(oldest.value);
    }
    return loaded;
  }

  /**
   * Ensure the 3x3 chunk neighbourhood, centre first, then re-derive the centre
   * once if it was built without a halo.
   *
   * The centre goes first on purpose: the caller almost always wants *this*
   * chunk to start a canvas now, while the halo only feeds the companion mask
   * two tiles into the neighbours. Fetching the north-west corner first spent a
   * whole frame's fetch budget and still left the chunk the frame was waiting
   * for in the queue.
   *
   * That order means the first derivation clamps a missing halo to the centre's
   * own edge, which is what produced load-order-dependent borders. The repair
   * below runs after the ring is resident, so by the time a canvas can be
   * created the table is the full-halo one. It re-derives at most once per
   * resident chunk: re-deriving after each neighbour arrival would multiply the
   * mask work by nine for the same final table, and a neighbour that never
   * arrives must not cause a retry every frame (hence the `haloResident` gate,
   * which is four map lookups when the ring is still incomplete).
   */
  public ensureRing(cx: number, cy: number): void {
    const centre = this.ensure(cx, cy);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx !== 0 || dy !== 0) this.ensure(cx + dx, cy + dy);
      }
    }
    if (centre && !centre.halo && this.haloResident(centre.cx, centre.cy)) {
      const derived = this.deriveMaterials(centre.cx, centre.cy, centre.view);
      centre.material = derived.material;
      centre.halo = derived.halo;
    }
  }

  /** Tile data at a wrapped coordinate, or `null` when its chunk is missing. */
  public tile(tx: number, ty: number): TileData | null {
    const found = this.peek(tx, ty);
    if (!found) return null;
    const { chunk, index } = found;
    return {
      material: chunk.material[index] ?? 0,
      source: chunk.view.terrain[index] ?? 0,
      elev: chunk.view.elev[index] ?? 0,
      decor: chunk.view.decor[index] ?? 0,
      ore: chunk.view.ore[index] ?? 0,
      coal: chunk.view.coal[index] ?? 0,
      oil: chunk.view.oil[index] ?? 0,
    };
  }

  /** Effective material at a wrapped tile, or `-1` when not resident. */
  public material(tx: number, ty: number): number {
    const found = this.peek(tx, ty);
    if (!found) return -1;
    return found.chunk.material[found.index] ?? -1;
  }

  /** Elevation step at a wrapped tile (`0` when not resident). */
  public elev(tx: number, ty: number): number {
    const found = this.peek(tx, ty);
    if (!found) return 0;
    return found.chunk.view.elev[found.index] ?? 0;
  }

  /** Flat placeholder colour of a chunk, or `null` when not resident. */
  public dominant(cx: number, cy: number): string | null {
    const key = wrapIndex(cy, this.ch) * this.cw + wrapIndex(cx, this.cw);
    return this.cache.get(key)?.dominant ?? null;
  }

  /**
   * Diagnostic dump of one resident chunk (`?debug=1` support hook).
   *
   * Reports the *decoded* chunk coordinates next to the requested ones, so a
   * mismatch between "which chunk was asked for" and "which chunk arrived" is
   * visible instead of silent.
   */
  public debugChunk(cx: number, cy: number): {
    readonly asked: readonly [number, number];
    readonly got: readonly [number, number];
    readonly raw: readonly number[];
    readonly effective: readonly number[];
  } | null {
    const chunk = this.ensure(cx, cy);
    if (!chunk) return null;
    return {
      asked: [wrapIndex(cx, this.cw), wrapIndex(cy, this.ch)],
      got: [chunk.cx, chunk.cy],
      raw: chunk.view.terrain.slice(0, 8),
      effective: Array.from(chunk.material.subarray(0, 8)),
    };
  }

  // ------------------------------------------------------------------ internals

  /** Fetch-free lookup for one wrapped tile. */
  private peek(tx: number, ty: number): { chunk: LoadedChunk; index: number } | null {
    const wx = wrapIndex(tx, this.spanX);
    const wy = wrapIndex(ty, this.spanY);
    const cx = Math.floor(wx / this.edge);
    const cy = Math.floor(wy / this.edge);
    const chunk = this.cache.get(cy * this.cw + cx);
    if (!chunk) return null;
    const index = (wy - cy * this.edge) * this.edge + (wx - cx * this.edge);
    return { chunk, index };
  }

  /** Raw material of a wrapped tile, or `-1` when its chunk is not resident. */
  private rawAt(tx: number, ty: number): number {
    const found = this.peek(tx, ty);
    if (!found) return -1;
    return found.chunk.view.terrain[found.index] ?? -1;
  }

  /**
   * Build the effective-material table for a chunk with a wrapping halo.
   *
   * The chunk's **own** tiles are read from the freshly decoded `view`, because
   * this runs before the chunk is inserted into the cache (`peek` would miss and
   * fall back to basalt). Only the two-tile halo is read through the cache; when
   * a neighbour has not been fetched yet the halo clamps to this chunk's edge
   * tile and `halo` comes back false, so {@link ensureRing} can re-derive once
   * the neighbourhood is resident.
   */
  private deriveMaterials(
    cx: number,
    cy: number,
    view: ChunkView,
  ): { readonly material: Int16Array; readonly halo: boolean } {
    const edge = this.edge;
    const span = edge + HALO * 2;
    const raw = new Uint8Array(span * span);
    for (let ly = 0; ly < span; ly += 1) {
      for (let lx = 0; lx < span; lx += 1) {
        const ox = lx - HALO;
        const oy = ly - HALO;
        let m: number;
        if (ox >= 0 && ox < edge && oy >= 0 && oy < edge) {
          m = view.terrain[oy * edge + ox] ?? 0;
        } else {
          m = this.rawAt(cx * edge + ox, cy * edge + oy);
          if (m < 0) {
            const cxo = Math.min(edge - 1, Math.max(0, ox));
            const cyo = Math.min(edge - 1, Math.max(0, oy));
            m = view.terrain[cyo * edge + cxo] ?? 0;
          }
        }
        raw[ly * span + lx] = m;
      }
    }
    let mask: Uint8Array = new Uint8Array(span * span);
    for (let ly = 0; ly < span; ly += 1) {
      for (let lx = 0; lx < span; lx += 1) {
        const i = ly * span + lx;
        const tx = cx * edge + lx - HALO;
        const ty = cy * edge + ly - HALO;
        const paint = TERRAIN_PAINT[TERRAIN_KEYS[raw[i] ?? 0] ?? 'basalt'];
        if (paint.companion && companionMask(tx, ty, paint.companionMix)) mask[i] = 1;
      }
    }
    mask = smooth(mask, span);
    mask = smooth(mask, span);
    const out = new Int16Array(edge * edge);
    for (let ly = 0; ly < edge; ly += 1) {
      for (let lx = 0; lx < edge; lx += 1) {
        const i = (ly + HALO) * span + (lx + HALO);
        const src = raw[i] ?? 0;
        let effective = src;
        if (mask[i] === 1) {
          const paint = TERRAIN_PAINT[TERRAIN_KEYS[src] ?? 'basalt'];
          if (paint.companion) {
            const companion = TERRAIN_KEYS.indexOf(paint.companion);
            if (companion >= 0) effective = companion;
          }
        }
        out[ly * edge + lx] = effective;
      }
    }
    return { material: out, halo: this.haloResident(cx, cy) };
  }

  /**
   * Are the four cardinal neighbours resident?
   *
   * Two passes of the 4-neighbour filter reach two tiles out along each axis,
   * but never into a diagonal chunk: a halo corner sits at Manhattan distance
   * four from the inner 32x32 and cannot affect it. Diagonals are still fetched
   * by {@link ensureRing}; they are only not needed to call the table complete.
   */
  private haloResident(cx: number, cy: number): boolean {
    const key = (ox: number, oy: number): number =>
      wrapIndex(cy + oy, this.ch) * this.cw + wrapIndex(cx + ox, this.cw);
    return (
      this.cache.has(key(-1, 0)) &&
      this.cache.has(key(1, 0)) &&
      this.cache.has(key(0, -1)) &&
      this.cache.has(key(0, 1))
    );
  }
}

/** 5-neighbour majority filter; kills single-tile mask confetti. */
function smooth(mask: Uint8Array, span: number): Uint8Array {
  const out: Uint8Array = new Uint8Array(span * span);
  for (let y = 0; y < span; y += 1) {
    for (let x = 0; x < span; x += 1) {
      const i = y * span + x;
      let count = mask[i] === 1 ? 2 : 0;
      if (x > 0 && mask[i - 1] === 1) count += 1;
      if (x < span - 1 && mask[i + 1] === 1) count += 1;
      if (y > 0 && mask[i - span] === 1) count += 1;
      if (y < span - 1 && mask[i + span] === 1) count += 1;
      out[i] = count >= 3 ? 1 : 0;
    }
  }
  return out;
}

/** Flat colour a chunk shows before its first bake pass lands. */
function dominantColour(view: ChunkView): string {
  const counts = new Uint16Array(TERRAIN_KEYS.length);
  let wet = 0;
  for (let i = 0; i < view.terrain.length; i += 1) {
    const m = view.terrain[i] ?? 0;
    if (m < counts.length) counts[m] = (counts[m] ?? 0) + 1;
    if (WATER.has(m)) wet += 1;
  }
  let best = 0;
  for (let i = 1; i < counts.length; i += 1) {
    if ((counts[i] ?? 0) > (counts[best] ?? 0)) best = i;
  }
  const base = TERRAIN_PAINT[TERRAIN_KEYS[best] ?? 'basalt'].base;
  return wet > view.terrain.length / 2 ? shade(base, 0.86) : base;
}
