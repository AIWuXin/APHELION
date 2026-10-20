//! Pure isometric / grid mathematics shared by the simulation.
//!
//! This crate contains **no** game rules, no I/O and no rendering: only
//! integer helpers, the 2:1 dimetric projection used for range checks and the
//! deterministic multi-stream RNG. Everything in here is `const fn` or a pure
//! function so that the simulation stays bit-for-bit reproducible.

pub mod fixed;
pub mod grid;
pub mod rng;

pub use fixed::{Fp, FP, FP_HALF, FP_INV};
pub use grid::{Grid, Tile};
pub use rng::{Rng, RngStreams};
