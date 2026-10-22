//! Toroidal planet geometry: the single definition of the world size and the
//! wrap / shortest-distance / footprint helpers every layer shares.
//!
//! The planet is a **torus**: x and y both wrap modulo [`MAP_W`] / [`MAP_H`], so
//! there is no edge to clamp against and a 2x2 building anchored at x = 10239
//! owns the tiles 10239 and 0. That seam is invisible to gameplay but not to
//! geometry, which is why every distance helper here returns a *shortest signed*
//! offset rather than a raw subtraction: "nearest building" and "explosion
//! centre" stay correct on both sides of the seam.
//!
//! Tile arrays are never allocated for the whole planet; terrain lives in
//! [`CHUNK`]-sized blocks generated on demand (see `oc-sim`'s chunk cache). These
//! constants are the one place that block layout is written down.

use crate::fixed::{Fp, FP, FP_BITS};
pub use crate::grid::{MAP_H, MAP_W};

/// Chunk edge in tiles.
pub const CHUNK: i32 = 32;
/// Chunks per axis: the world is `CHUNKS x CHUNKS` chunks.
pub const CHUNKS: i32 = MAP_W / CHUNK;
/// Tiles in one chunk.
pub const CHUNK_TILES: usize = (CHUNK * CHUNK) as usize;
/// Chunks on the planet.
pub const CHUNK_COUNT: usize = (CHUNKS * CHUNKS) as usize;
/// Planet area in tiles. Not a buffer size -- nothing allocates this many tiles.
pub const MAP_TILES: usize = (MAP_W as usize) * (MAP_H as usize);

/// Euclidean modulo that accepts negative input (`i32::rem_euclid` is not
/// `const` on every supported toolchain).
#[must_use]
pub const fn rem_euclid(a: i32, m: i32) -> i32 {
    let r = a % m;
    if r < 0 {
        r + m
    } else {
        r
    }
}

/// Wrap a tile column into `0..MAP_W`.
#[must_use]
pub const fn wrap_x(x: i32) -> i32 {
    rem_euclid(x, MAP_W)
}

/// Wrap a tile row into `0..MAP_H`.
#[must_use]
pub const fn wrap_y(y: i32) -> i32 {
    rem_euclid(y, MAP_H)
}

/// Wrap both tile axes.
#[must_use]
pub const fn wrap(x: i32, y: i32) -> (i32, i32) {
    (wrap_x(x), wrap_y(y))
}

/// Shortest signed offset from `a` to `b` on a loop of `span` cells.
///
/// The result is in `-span/2..=span/2`; a tie (`span/2`) resolves towards the
/// positive side, which is deterministic and only reachable on even spans.
#[must_use]
pub const fn delta_wrapped(a: i32, b: i32, span: i32) -> i32 {
    let d = rem_euclid(b - a, span);
    if d > span / 2 {
        d - span
    } else {
        d
    }
}

/// Shortest signed x offset in tiles.
#[must_use]
pub const fn delta_x(a: i32, b: i32) -> i32 {
    delta_wrapped(a, b, MAP_W)
}

/// Shortest signed y offset in tiles.
#[must_use]
pub const fn delta_y(a: i32, b: i32) -> i32 {
    delta_wrapped(a, b, MAP_H)
}

/// Squared shortest tile distance (tiles^2).
#[must_use]
pub const fn dist2_tiles(ax: i32, ay: i32, bx: i32, by: i32) -> u64 {
    let dx = delta_x(ax, bx) as i64;
    let dy = delta_y(ay, by) as i64;
    (dx * dx + dy * dy) as u64
}

/// Squared shortest distance between two fixed point positions, in tiles^2.
///
/// Mirrors [`crate::fixed::dist2`] but takes the seam into account, so a weapon
/// at x = 10239.5 still sees a target at x = 0.5 as one tile away.
#[must_use]
pub const fn dist2_fp(ax: Fp, ay: Fp, bx: Fp, by: Fp) -> u64 {
    let dx = delta_wrapped(ax, bx, MAP_W * FP) as i64;
    let dy = delta_wrapped(ay, by, MAP_H * FP) as i64;
    ((dx * dx + dy * dy) >> (FP_BITS * 2)) as u64
}

/// Re-express `b` as the copy of itself closest to `a` (same loop, no wrap).
///
/// Movement code targets an absolute position; near the seam the short way round
/// is through 0, so the target has to be unwrapped before stepping towards it.
#[must_use]
pub const fn unwrap_near(a: i32, b: i32, span: i32) -> i32 {
    a + delta_wrapped(a, b, span)
}

/// Wrap a fixed point world x coordinate into `0..MAP_W * FP`.
#[must_use]
pub const fn wrap_fp_x(x: Fp) -> Fp {
    rem_euclid(x, MAP_W * FP)
}

/// Wrap a fixed point world y coordinate into `0..MAP_H * FP`.
#[must_use]
pub const fn wrap_fp_y(y: Fp) -> Fp {
    rem_euclid(y, MAP_H * FP)
}

/// Wrap both fixed point world axes.
#[must_use]
pub const fn wrap_fp(x: Fp, y: Fp) -> (Fp, Fp) {
    (wrap_fp_x(x), wrap_fp_y(y))
}

/// Chunk column containing a tile.
#[must_use]
pub const fn chunk_of_x(x: i32) -> i32 {
    rem_euclid(x, MAP_W) / CHUNK
}

/// Chunk row containing a tile.
#[must_use]
pub const fn chunk_of_y(y: i32) -> i32 {
    rem_euclid(y, MAP_H) / CHUNK
}

/// First tile column of a chunk.
#[must_use]
pub const fn chunk_origin(c: i32) -> i32 {
    c * CHUNK
}

/// Packed cache key of a chunk, in `0..CHUNK_COUNT`.
#[must_use]
pub const fn chunk_key(cx: i32, cy: i32) -> u32 {
    ((rem_euclid(cy, CHUNKS) as u32) << 16) | rem_euclid(cx, CHUNKS) as u32
}

/// Chunk coordinates of a tile.
#[must_use]
pub const fn chunk_xy(x: i32, y: i32) -> (i32, i32) {
    (chunk_of_x(x), chunk_of_y(y))
}

/// Iterator over the tiles a `size x size` footprint covers, wrapping the seam.
///
/// A footprint anchored at x = [`MAP_W`] - 1 with `size = 2` yields the columns
/// `MAP_W - 1` and `0`, in that order.
#[derive(Clone, Debug)]
pub struct Footprint {
    tx: i32,
    ty: i32,
    size: i32,
    x: i32,
    y: i32,
}

impl Iterator for Footprint {
    type Item = (i32, i32);

    fn next(&mut self) -> Option<(i32, i32)> {
        if self.y >= self.size {
            return None;
        }
        let tile = (wrap_x(self.tx + self.x), wrap_y(self.ty + self.y));
        self.x += 1;
        if self.x >= self.size {
            self.x = 0;
            self.y += 1;
        }
        Some(tile)
    }
}

/// Row-major wrapped footprint enumeration.
#[must_use]
pub fn footprint(tx: i32, ty: i32, size: i32) -> Footprint {
    Footprint {
        tx,
        ty,
        size: size.max(0),
        x: 0,
        y: 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tiles_wrap_on_both_axes() {
        assert_eq!(wrap_x(MAP_W), 0);
        assert_eq!(wrap_x(MAP_W + 7), 7);
        assert_eq!(wrap_x(-1), MAP_W - 1);
        assert_eq!(wrap_x(-MAP_W - 1), MAP_W - 1);
        assert_eq!(wrap_y(-1), MAP_H - 1);
        assert_eq!(wrap(-1, MAP_H), (MAP_W - 1, 0));
    }

    #[test]
    fn shortest_offsets_cross_the_seam() {
        // One tile apart across the seam, not MAP_W - 2 tiles apart.
        assert_eq!(delta_x(0, MAP_W - 1), -1);
        assert_eq!(delta_x(MAP_W - 1, 0), 1);
        assert_eq!(delta_y(0, MAP_H - 1), -1);
        assert_eq!(delta_x(10, 14), 4);
        assert_eq!(delta_x(14, 10), -4);
        // Half a loop is the furthest a point can be; it resolves positive.
        assert_eq!(delta_x(0, MAP_W / 2), MAP_W / 2);
        assert_eq!(delta_x(MAP_W / 2, 0), MAP_W / 2);
        assert_eq!(dist2_tiles(0, 0, MAP_W - 1, MAP_H - 1), 2);
        // x = 1 and x = MAP_W - 1 are two tiles apart through the seam.
        assert_eq!(dist2_fp(FP, FP, (MAP_W - 1) * FP, FP), 4);
        assert_eq!(dist2_fp(FP / 2, FP / 2, (MAP_W * FP) - FP / 2, FP / 2), 1);
    }

    #[test]
    fn unwrap_near_picks_the_short_side() {
        assert_eq!(unwrap_near(1, MAP_W - 1, MAP_W), -1);
        assert_eq!(unwrap_near(MAP_W - 1, 1, MAP_W), MAP_W + 1);
        assert_eq!(unwrap_near(10, 10, MAP_W), 10);
        assert_eq!(wrap_fp_x(MAP_W * FP), 0);
        assert_eq!(wrap_fp_x(-FP), (MAP_W - 1) * FP);
        assert_eq!(wrap_fp(0, -1), (0, MAP_H * FP - 1));
    }

    #[test]
    fn chunks_cover_the_planet_exactly_once() {
        assert_eq!(CHUNKS, MAP_W / CHUNK);
        assert_eq!(CHUNK_COUNT * CHUNK_TILES, MAP_TILES);
        assert_eq!(chunk_xy(0, 0), (0, 0));
        assert_eq!(chunk_xy(MAP_W - 1, MAP_H - 1), (CHUNKS - 1, CHUNKS - 1));
        assert_eq!(chunk_xy(MAP_W, 0), (0, 0));
        assert_eq!(chunk_xy(-1, -1), (CHUNKS - 1, CHUNKS - 1));
        assert_eq!(chunk_key(3, 5), (5 << 16) | 3);
    }

    #[test]
    fn footprints_wrap_across_the_seam() {
        let corner: Vec<(i32, i32)> = footprint(MAP_W - 1, MAP_H - 1, 2).collect();
        assert_eq!(
            corner,
            vec![
                (MAP_W - 1, MAP_H - 1),
                (0, MAP_H - 1),
                (MAP_W - 1, 0),
                (0, 0)
            ]
        );
        let mid: Vec<(i32, i32)> = footprint(MAP_W - 2, 5, 2).collect();
        assert_eq!(
            mid,
            vec![
                (MAP_W - 2, 5),
                (MAP_W - 1, 5),
                (MAP_W - 2, 6),
                (MAP_W - 1, 6)
            ]
        );
        assert_eq!(footprint(0, 0, 0).count(), 0);
        assert_eq!(footprint(0, 0, 3).count(), 9);
    }
}
