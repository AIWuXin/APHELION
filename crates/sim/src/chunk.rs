//! Chunked terrain storage: one 32x32 block of generated tiles, and the bounded
//! LRU cache the simulation queries through.
//!
//! The whole point of the chunk contract is that a chunk is a **pure function of
//! `(seed, home, cx, cy)`**: it may be generated, evicted, and generated again at
//! any later moment and must come back byte for byte. No generation order, no
//! neighbour lookups, no floats. That is what makes a 10240 x 10240 planet
//! affordable: only the ~256 chunks a colony actually touches are resident
//! (~1.3 MB), and the other 102144 chunks are virtual.

use std::collections::BTreeMap;

use oc_iso::torus::{self, CHUNK, CHUNKS, CHUNK_TILES};
use oc_protocol::ChunkView;

use crate::mapgen;

/// Resident chunk budget: 256 chunks = 262144 tiles, about 1.3 MB of tile data.
///
/// The colony's build radius plus the renderer's viewport ring stay well inside
/// this; a larger value only postpones regeneration for long camera sweeps.
pub const CHUNK_CACHE_CAPACITY: usize = 256;

/// One tile as the rest of the simulation sees it.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct TileData {
    /// Terrain material index (`T_*`).
    pub material: u8,
    /// Height step: `-2` deep water, `-1` shallow water, `0..=3` land.
    pub height: i8,
    /// Decoration index (`D_*`), `0` = bare.
    pub decor: u8,
    /// Mineral richness, `0` = none.
    pub deposit: u8,
    /// Coal seam richness, `0` = none.
    pub coal: u8,
}

/// A generated 32x32 tile block, row-major.
#[derive(Clone, Debug)]
pub struct Chunk {
    /// Chunk column, `0..CHUNKS`.
    pub cx: i32,
    /// Chunk row, `0..CHUNKS`.
    pub cy: i32,
    /// Terrain material per tile.
    pub material: Vec<u8>,
    /// Elevation step per tile.
    pub height: Vec<i8>,
    /// Decoration per tile.
    pub decor: Vec<u8>,
    /// Mineral richness per tile.
    pub deposit: Vec<u8>,
    /// Coal seam richness per tile.
    pub coal: Vec<u8>,
}

impl Chunk {
    /// Allocate a blank chunk.
    #[must_use]
    pub fn new(cx: i32, cy: i32) -> Self {
        Self {
            cx,
            cy,
            material: vec![0; CHUNK_TILES],
            height: vec![0; CHUNK_TILES],
            decor: vec![0; CHUNK_TILES],
            deposit: vec![0; CHUNK_TILES],
            coal: vec![0; CHUNK_TILES],
        }
    }

    /// Row-major index of a local tile.
    #[must_use]
    pub const fn index(lx: i32, ly: i32) -> usize {
        (ly * CHUNK + lx) as usize
    }

    /// Read one local tile.
    #[must_use]
    pub fn tile(&self, lx: i32, ly: i32) -> TileData {
        let i = Self::index(lx, ly);
        TileData {
            material: self.material[i],
            height: self.height[i],
            decor: self.decor[i],
            deposit: self.deposit[i],
            coal: self.coal[i],
        }
    }

    /// Wire view of this chunk (five 1024-tile arrays plus its coordinates).
    #[must_use]
    pub fn view(&self) -> ChunkView {
        ChunkView {
            cx: self.cx,
            cy: self.cy,
            terrain: self.material.clone(),
            decor: self.decor.clone(),
            elev: self.height.clone(),
            ore: self.deposit.clone(),
            coal: self.coal.clone(),
        }
    }
}

#[derive(Clone, Debug)]
struct CachedChunk {
    chunk: Chunk,
    stamp: u64,
}

/// Bounded LRU cache over generated chunks.
///
/// Iteration is never used for gameplay decisions -- the cache only answers
/// "which tile is here" -- so the deterministic state never depends on cache
/// contents. BTreeMap still gives a stable eviction tie-break.
#[derive(Clone, Debug)]
pub struct ChunkCache {
    seed: u32,
    home: (i32, i32),
    capacity: usize,
    clock: u64,
    entries: BTreeMap<u32, CachedChunk>,
}

impl ChunkCache {
    /// A cache holding up to [`CHUNK_CACHE_CAPACITY`] chunks.
    #[must_use]
    pub fn new(seed: u32, home: (i32, i32)) -> Self {
        Self::with_capacity(seed, home, CHUNK_CACHE_CAPACITY)
    }

    /// A cache with an explicit budget (tests exercise eviction with a tiny one).
    #[must_use]
    pub fn with_capacity(seed: u32, home: (i32, i32), capacity: usize) -> Self {
        Self {
            seed,
            home,
            capacity: capacity.max(1),
            clock: 0,
            entries: BTreeMap::new(),
        }
    }

    /// Chunks currently resident.
    #[must_use]
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// Is the cache empty?
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// Cache budget.
    #[must_use]
    pub const fn capacity(&self) -> usize {
        self.capacity
    }

    /// Tile at a wrapped world coordinate.
    pub fn tile(&mut self, x: i32, y: i32) -> TileData {
        let (cx, cy) = torus::chunk_xy(x, y);
        let lx = torus::rem_euclid(x, CHUNK);
        let ly = torus::rem_euclid(y, CHUNK);
        self.chunk(cx, cy).tile(lx, ly)
    }

    /// Chunk at wrapped chunk coordinates, generating it on a miss.
    pub fn chunk(&mut self, cx: i32, cy: i32) -> &Chunk {
        let cx = torus::rem_euclid(cx, CHUNKS);
        let cy = torus::rem_euclid(cy, CHUNKS);
        let key = torus::chunk_key(cx, cy);
        self.clock = self.clock.wrapping_add(1);
        let stamp = self.clock;
        if !self.entries.contains_key(&key) {
            if self.entries.len() >= self.capacity {
                self.evict();
            }
            let chunk = mapgen::chunk(self.seed, self.home, cx, cy);
            self.entries.insert(key, CachedChunk { chunk, stamp });
        }
        let entry = self.entries.get_mut(&key).expect("chunk just inserted");
        entry.stamp = stamp;
        &entry.chunk
    }

    /// Wire view of a chunk, generating it on a miss.
    pub fn chunk_view(&mut self, cx: i32, cy: i32) -> ChunkView {
        self.chunk(cx, cy).view()
    }

    /// Drop the least recently used chunk.
    fn evict(&mut self) {
        let victim = self
            .entries
            .iter()
            .min_by_key(|(key, cached)| (cached.stamp, **key))
            .map(|(key, _)| *key);
        if let Some(key) = victim {
            self.entries.remove(&key);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mapgen::find_home;

    const SEED: u32 = 0x5EED_1234;

    #[test]
    fn chunk_arrays_have_one_entry_per_tile() {
        let chunk = Chunk::new(2, 3);
        assert_eq!(chunk.material.len(), CHUNK_TILES);
        assert_eq!(Chunk::index(CHUNK - 1, CHUNK - 1), CHUNK_TILES - 1);
        assert_eq!(chunk.tile(0, 0), TileData::default());
    }

    #[test]
    fn the_cache_evicts_the_least_recently_used_chunk() {
        let home = find_home(SEED);
        let mut cache = ChunkCache::with_capacity(SEED, home, 2);
        cache.chunk(10, 10);
        cache.chunk(11, 10);
        cache.chunk(10, 10); // 10 is now newer than 11
        cache.chunk(12, 10); // must evict 11, not 10
        assert_eq!(cache.len(), 2);
        let resident: Vec<u32> = cache.entries.keys().copied().collect();
        assert!(!resident.contains(&torus::chunk_key(11, 10)));
        assert!(resident.contains(&torus::chunk_key(10, 10)));
        assert!(resident.contains(&torus::chunk_key(12, 10)));
    }

    #[test]
    fn regenerating_an_evicted_chunk_is_byte_identical() {
        let home = find_home(SEED);
        let fresh = mapgen::chunk(SEED, home, 4, 7);
        let mut cache = ChunkCache::with_capacity(SEED, home, 1);
        let cached = cache.chunk(4, 7).clone();
        assert_eq!(cached.material, fresh.material);
        // Push it out of a one-slot cache, then pull the same chunk back in.
        cache.chunk(5, 7);
        let again = cache.chunk(4, 7).clone();
        assert_eq!(
            again.material, fresh.material,
            "material differs after eviction"
        );
        assert_eq!(again.height, fresh.height, "height differs after eviction");
        assert_eq!(again.decor, fresh.decor, "decor differs after eviction");
        assert_eq!(again.deposit, fresh.deposit, "ore differs after eviction");
        assert_eq!(again.coal, fresh.coal, "coal differs after eviction");
        assert_eq!(again.cx, 4);
        assert_eq!(again.cy, 7);
    }

    #[test]
    fn chunk_coordinates_wrap() {
        let home = find_home(SEED);
        let mut cache = ChunkCache::with_capacity(SEED, home, 4);
        let a = cache.chunk(CHUNKS, 0).clone();
        let b = cache.chunk(0, 0).clone();
        assert_eq!(a.cx, 0);
        assert_eq!(a.material, b.material);
        let c = cache.chunk(-1, -1).clone();
        assert_eq!((c.cx, c.cy), (CHUNKS - 1, CHUNKS - 1));
    }
}
