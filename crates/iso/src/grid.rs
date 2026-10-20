//! The tile grid: dimensions, footprint tests and the canonical 2:1 dimetric
//! mapping shared (in spirit) by the renderer.

use crate::fixed::{Fp, FP, FP_BITS};

/// Map dimensions in tiles. Chosen so a 2:1 plane reads as a wide "crater
/// basin" while still fitting comfortably inside a 1920px viewport.
pub const MAP_W: i32 = 44;
/// See [`MAP_W`].
pub const MAP_H: i32 = 44;

/// Tile width in screen pixels (2:1 dimetric).
pub const TILE_PX_W: i32 = 64;
/// Tile height in screen pixels.
pub const TILE_PX_H: i32 = 32;

/// Integer tile coordinate.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Tile {
    /// Column along the +x screen axis.
    pub x: i32,
    /// Row along the +y screen axis.
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

/// The playable map.
#[derive(Clone, Debug)]
pub struct Grid {
    width: i32,
    height: i32,
    /// `1` when a tile is buildable terrain (not water, not a cliff).
    buildable: Vec<u8>,
}

impl Grid {
    /// Create a grid where every tile is buildable.
    #[must_use]
    pub fn new(width: i32, height: i32) -> Self {
        Self {
            width,
            height,
            buildable: vec![1; (width * height) as usize],
        }
    }

    /// Map width in tiles.
    #[must_use]
    pub const fn width(&self) -> i32 {
        self.width
    }

    /// Map height in tiles.
    #[must_use]
    pub const fn height(&self) -> i32 {
        self.height
    }

    /// Is the coordinate inside the map?
    #[must_use]
    pub const fn contains(&self, t: Tile) -> bool {
        t.x >= 0 && t.y >= 0 && t.x < self.width && t.y < self.height
    }

    fn index(&self, t: Tile) -> Option<usize> {
        if self.contains(t) {
            Some((t.y * self.width + t.x) as usize)
        } else {
            None
        }
    }

    /// Mark a tile as unbuildable (water, cliffs, deposits reserved for pads).
    pub fn set_buildable(&mut self, t: Tile, value: bool) {
        if let Some(i) = self.index(t) {
            self.buildable[i] = u8::from(value);
        }
    }

    /// Can a building stand on this tile?
    #[must_use]
    pub fn is_buildable(&self, t: Tile) -> bool {
        self.index(t).is_some_and(|i| self.buildable[i] == 1)
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
