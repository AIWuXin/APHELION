//! The tile grid: dimensions and the canonical 2:1 dimetric mapping shared (in
//! spirit) by the renderer.
//!
//! The planet is a **torus**, not a rectangle with edges: [`MAP_W`] and
//! [`MAP_H`] describe the circumference of the wrap, and every coordinate is
//! taken modulo them (see [`crate::torus`]). Nothing allocates a full-planet
//! tile buffer; terrain is generated per chunk on demand.

use crate::fixed::{Fp, FP, FP_BITS};

/// Planet circumference along x, in tiles.
///
/// 10240 = 320 chunks of 32 tiles, so the wrap is chunk-aligned and the
/// dimension stays a power-of-two friendly number for the renderer's culling.
pub const MAP_W: i32 = 10_240;
/// Planet circumference along y, in tiles. See [`MAP_W`].
pub const MAP_H: i32 = 10_240;

/// Tile width in screen pixels (2:1 dimetric).
pub const TILE_PX_W: i32 = 64;
/// Tile height in screen pixels.
pub const TILE_PX_H: i32 = 32;

/// Integer tile coordinate.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Tile {
    /// Column along the +x screen axis.
    pub x: i32,
    /// Column along the +y screen axis.
    pub y: i32,
}

impl Tile {
    /// Construct a tile coordinate.
    #[must_use]
    pub const fn new(x: i32, y: i32) -> Self {
        Self { x, y }
    }

    /// Centre of the tile in fixed point world units.
    #[must_use]
    pub const fn center_fp(self) -> (Fp, Fp) {
        (self.x * FP + FP / 2, self.y * FP + FP / 2)
    }

    /// Convert to a packed `u32` key (used by occupancy maps).
    #[must_use]
    pub const fn key(self) -> u32 {
        ((self.y as u32) << 16) | (self.x as u32 & 0xFFFF)
    }
}

/// North-west screen delta of one world +x step: `(32, 16)`.
pub const DX_SCREEN: i32 = TILE_PX_W / 2;
/// Screen delta of one world +y step: `(-32, 16)`.
pub const DY_SCREEN: i32 = -TILE_PX_W / 2;

/// Project fixed point world coordinates to screen pixels.
///
/// `sx = (x - y) * 32`, `sy = (x + y) * 16 - z * 32`. Kept in integer maths so
/// it can be used for cheap sorting keys inside the simulation if needed.
#[must_use]
pub const fn project(x: Fp, y: Fp, z: Fp) -> (i32, i32) {
    let sx = ((x - y) as i64 * DX_SCREEN as i64) >> FP_BITS;
    let sy = (((x + y) as i64 * (TILE_PX_H as i64 / 2)) >> FP_BITS) - ((z as i64) >> (FP_BITS - 5));
    (sx as i32, sy as i32)
}

/// Inverse of [`project`] on the ground plane (z assumed 0), returning tile
/// coordinates expressed in fixed point units.
#[must_use]
pub const fn unproject(sx: i32, sy: i32) -> (Fp, Fp) {
    // sx = 32 (x - y) ; sy = 16 (x + y)  -- all in pixel space.
    let u = (sx as i64) << FP_BITS >> 5; // (x - y) in fp units
    let v = (sy as i64) << FP_BITS >> 4; // (x + y) in fp units
    (((u + v) / 2) as Fp, ((v - u) / 2) as Fp)
}
