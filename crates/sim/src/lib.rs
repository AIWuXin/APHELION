//! Deterministic simulation core for APHELION.
//!
//! No I/O, no threads, no wall clock, no floating point in state. The same seed
//! plus the same command sequence always produces the same state hash.
//!
//! The planet is a 10240 x 10240 **torus**; terrain is generated per 32x32 chunk
//! from `(seed, chunk)` and only the resident chunks are kept (see [`chunk`]).
//! `web/public/oc.wasm` is a thin ABI over this crate, so anything added here
//! must stay integer-only and deterministic across native and wasm targets.

pub mod chunk;
pub mod commands;
pub mod mapgen;
pub mod state;
pub mod systems;
pub mod world;

pub use chunk::{Chunk, ChunkCache, TileData, CHUNK_CACHE_CAPACITY};
pub use world::{fnv1a, World, TICKS_PER_SEC, TICK_MS};
