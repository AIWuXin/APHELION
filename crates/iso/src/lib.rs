//! Pure isometric / toroidal planet mathematics shared by the simulation.
//!
//! This crate contains **no** game rules, no I/O and no rendering: only integer
//! helpers, the 2:1 dimetric projection used for range checks, the wrap
//! geometry of the planet, integer trigonometry and the deterministic
//! multi-stream RNG. Everything in here is `const fn` or a pure function so that
//! the simulation stays bit-for-bit reproducible -- and, for the trig, so that a
//! native build and a wasm build agree to the bit without linking the same libm.

pub mod fixed;
pub mod grid;
pub mod rng;
pub mod torus;
pub mod trig;

pub use fixed::{Fp, FP, FP_HALF, FP_INV};
pub use grid::{Tile, MAP_H, MAP_W};
pub use rng::{Rng, RngStreams};
