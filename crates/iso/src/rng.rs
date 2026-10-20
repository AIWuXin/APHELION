//! Deterministic, splittable RNG.
//!
//! The simulation is forbidden from touching `rand` or wall-clock entropy: every
//! draw comes from a named stream so that adding a new consumer in one system
//! cannot shift the numbers seen by another.

/// Named RNG streams. Adding a variant is fine, **removing or reordering** one
/// changes every existing replay.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum Stream {
    /// Terrain / decoration generation (only used at world creation).
    Terrain = 0,
    /// Economy jitter: output swings, minor upsets.
    Economy = 1,
    /// Combat resolution: damage rolls, hit spread.
    Combat = 2,
    /// Enemy director: wave composition and timing.
    Director = 3,
    /// Cosmetic-only draws (renderer requests). Never touches sim state.
    Cosmetic = 4,
}

/// PCG-ish xorshift* generator: tiny, deterministic and stable across targets.
#[derive(Clone, Debug)]
pub struct Rng {
    state: u64,
}

impl Rng {
    /// Create a stream from a seed and a stream tag.
    #[must_use]
    pub const fn new(seed: u64, stream: Stream) -> Self {
        // SplitMix64 finaliser over (seed, stream) gives well separated states.
        let mut z = seed.wrapping_add((stream as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15));
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^= z >> 31;
        Self { state: z | 1 }
    }

    /// Next `u32`.
    pub fn next_u32(&mut self) -> u32 {
        let mut x = self.state;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.state = x;
        (x.wrapping_mul(0x2545_F491_4F6C_DD1D) >> 32) as u32
    }

    /// Uniform in `0..n` (`n == 0` yields `0`).
    pub fn below(&mut self, n: u32) -> u32 {
        if n == 0 {
            0
        } else {
            self.next_u32() % n
        }
    }

    /// Uniform in `lo..=hi`.
    pub fn range(&mut self, lo: i32, hi: i32) -> i32 {
        if hi <= lo {
            return lo;
        }
        lo + self.below((hi - lo + 1) as u32) as i32
    }

    /// Roll `permille` out of 1000.
    pub fn chance(&mut self, permille: u32) -> bool {
        self.below(1000) < permille
    }

    /// Pick an element from a slice (empty slice yields `None`).
    pub fn pick<'a, T>(&mut self, items: &'a [T]) -> Option<&'a T> {
        if items.is_empty() {
            return None;
        }
        items.get(self.below(items.len() as u32) as usize)
    }

    /// Derive an independent child stream (used to keep systems isolated).
    #[must_use]
    pub fn fork(&self, salt: u64) -> Self {
        Self::new(self.state ^ salt, Stream::Cosmetic)
    }

    /// Current internal state, for hashing and replay headers.
    #[must_use]
    pub const fn state(&self) -> u64 {
        self.state
    }
}

/// One RNG per stream, owned by the world.
#[derive(Clone, Debug)]
pub struct RngStreams {
    /// Terrain / decoration.
    pub terrain: Rng,
    /// Economy jitter.
    pub economy: Rng,
    /// Combat rolls.
    pub combat: Rng,
    /// Enemy director.
    pub director: Rng,
    /// Presentation-only.
    pub cosmetic: Rng,
}

impl RngStreams {
    /// Build every stream from the world seed.
    #[must_use]
    pub fn new(seed: u64) -> Self {
        Self {
            terrain: Rng::new(seed, Stream::Terrain),
            economy: Rng::new(seed, Stream::Economy),
            combat: Rng::new(seed, Stream::Combat),
            director: Rng::new(seed, Stream::Director),
            cosmetic: Rng::new(seed, Stream::Cosmetic),
        }
    }

    /// Fold all stream states into one value for the state hash.
    #[must_use]
    pub fn hash_mix(&self) -> u64 {
        let mut h = 0xCBF2_9CE4_8422_2325u64;
        for s in [
            self.terrain.state(),
            self.economy.state(),
            self.combat.state(),
            self.director.state(),
            self.cosmetic.state(),
        ] {
            h ^= s;
            h = h.wrapping_mul(0x100_0000_01B3);
        }
        h
    }
}
