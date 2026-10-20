//! Deterministic simulation core for APHELION.
//!
//! No I/O, no threads, no wall clock, no floating point in state. The same seed
//! plus the same command sequence always produces the same state hash.

pub mod commands;
pub mod mapgen;
pub mod state;
pub mod systems;
pub mod world;

pub use world::{fnv1a, World, TICKS_PER_SEC, TICK_MS};
