//! Deterministic integer noise for the planet surface.
//!
//! Two properties matter and nothing else does:
//!
//! 1. **Pure function of (seed, tile)**. Chunks are generated on demand and
//!    evicted from the cache, so the same tile must be produced byte for byte at
//!    any later time, without reference to generation order or neighbours.
//! 2. **Seamless on the torus**. Each axis is sampled as a *circle*: the tile
//!    coordinate becomes `(cos, sin)` of its turn angle, and a 4D value noise is
//!    evaluated at `(cos x, sin x, cos y, sin y) * frequency`. x = 10239 and
//!    x = 0 therefore share the same neighbourhood, so a continent crossing the
//!    seam joins itself instead of ending in a cliff.
//!
//! The trig is [`oc_iso::trig`]'s integer approximation (no libm), so a native
//! build and the wasm build hash identical planets.

use oc_iso::grid::{MAP_H, MAP_W};
use oc_iso::trig;

/// Fractional bits inside one noise lattice cell.
const FRAC: i32 = 256;

/// splitmix64 finaliser.
const fn mix64(mut z: u64) -> u64 {
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

/// Hash a lattice point. The old 32-bit `hash2` is kept because decor and
/// placement jitter key off it; the field noise uses [`hash4`].
#[must_use]
pub const fn hash2(seed: u32, x: i32, y: i32) -> u32 {
    let mut h = seed ^ (x as u32).wrapping_mul(0x9E37_79B1) ^ (y as u32).wrapping_mul(0x85EB_CA77);
    h ^= h >> 15;
    h = h.wrapping_mul(0x2C1B_3C6D);
    h ^= h >> 12;
    h = h.wrapping_mul(0x297A_2D39);
    h ^= h >> 15;
    h
}

/// Hash a 4D lattice point (one corner of a noise cell).
#[must_use]
pub const fn hash4(seed: u32, a: i32, b: i32, c: i32, d: i32) -> u32 {
    let mut z = 0x9E37_79B9_7F4A_7C15u64 ^ seed as u64;
    z ^= (a as i64 as u64).wrapping_mul(0xD1B5_4A32_D192_ED03);
    z ^= (b as i64 as u64).wrapping_mul(0x9E37_79B1_85EB_CA87);
    z ^= (c as i64 as u64).wrapping_mul(0xC2B2_AE3D_27D4_EB4F);
    z ^= (d as i64 as u64).wrapping_mul(0x1656_67B1_9E37_79F9);
    (mix64(z) >> 32) as u32
}

/// Smoothstep on a `0..=FRAC` fraction (`t^2 (3 - 2t)`).
const fn smooth(t: i32) -> i32 {
    t * t * (3 * FRAC - 2 * t) / (FRAC * FRAC)
}

/// Split a Q8 lattice coordinate into (cell index, fraction).
const fn split(v: i32) -> (i32, i32) {
    let q = v / FRAC;
    let r = v % FRAC;
    if r < 0 {
        (q - 1, r + FRAC)
    } else {
        (q, r)
    }
}

/// One axis of the torus as a scaled circle coordinate, in Q8 lattice units.
fn circle(tile: i32, span: i32, freq: i32, sine: bool) -> i32 {
    let turn = trig::turn_of(tile, span);
    let q12 = if sine {
        trig::sin(turn)
    } else {
        trig::cos(turn)
    };
    // Q12 +/-4096 -> Q8 lattice units: a unit circle of radius `freq`.
    q12 * freq / (trig::ONE / FRAC)
}

/// One axis of the torus sampled at one tile coordinate for a fixed frequency.
///
/// [`torus_noise`] needs, per axis, two lattice cells and two smoothed
/// fractions: the cos circle and the sin circle. Both depend on `(tile, freq)`
/// alone, so a caller that walks a whole chunk can pay for them once per column
/// and once per row instead of once per tile. [`torus_noise_axes`] then runs
/// exactly the arithmetic [`torus_noise`] always ran, which is what makes the
/// hoist a pure speed change: the field values come out bit-identical.
#[derive(Clone, Copy, Debug, Default)]
pub struct Axis {
    /// Lattice cell of the cos circle.
    cos_cell: i32,
    /// Smoothed fraction inside that cell.
    cos_frac: i32,
    /// Lattice cell of the sin circle.
    sin_cell: i32,
    /// Smoothed fraction inside that cell.
    sin_frac: i32,
}

impl Axis {
    /// Sample one axis of the torus at a tile coordinate.
    #[must_use]
    pub fn at(tile: i32, span: i32, freq: i32) -> Self {
        let f = freq.max(1);
        let (cos_cell, raw_cos) = split(circle(tile, span, f, false));
        let (sin_cell, raw_sin) = split(circle(tile, span, f, true));
        Self {
            cos_cell,
            cos_frac: smooth(raw_cos),
            sin_cell,
            sin_frac: smooth(raw_sin),
        }
    }
}

/// Seamless 4D value noise in `0..=1024` from two precomputed axes.
#[must_use]
pub fn torus_noise_axes(seed: u32, x: Axis, y: Axis) -> i32 {
    let mut total: i64 = 0;
    for i in 0..2 {
        let wx = if i == 0 {
            FRAC - x.cos_frac
        } else {
            x.cos_frac
        };
        for j in 0..2 {
            let wy = if j == 0 {
                FRAC - x.sin_frac
            } else {
                x.sin_frac
            };
            for k in 0..2 {
                let wz = if k == 0 {
                    FRAC - y.cos_frac
                } else {
                    y.cos_frac
                };
                for l in 0..2 {
                    let ww = if l == 0 {
                        FRAC - y.sin_frac
                    } else {
                        y.sin_frac
                    };
                    let hash = i64::from(
                        hash4(
                            seed,
                            x.cos_cell + i,
                            x.sin_cell + j,
                            y.cos_cell + k,
                            y.sin_cell + l,
                        ) & 1023,
                    );
                    total += hash * i64::from(wx) * i64::from(wy) * i64::from(wz) * i64::from(ww);
                }
            }
        }
    }
    (total / i64::from(FRAC).pow(4)) as i32
}

/// Seamless 4D value noise in `0..=1024` for a tile, with `freq` features around
/// the planet at the base octave.
#[must_use]
pub fn torus_noise(seed: u32, x: i32, y: i32, freq: i32) -> i32 {
    torus_noise_axes(seed, Axis::at(x, MAP_W, freq), Axis::at(y, MAP_H, freq))
}

/// A single octave is already smooth; a small fixed octave stack gives the
/// fields enough structure to read as terrain rather than as blobs.
#[must_use]
pub fn torus_fbm(seed: u32, x: i32, y: i32, freq: i32, octaves: u32) -> i32 {
    let mut total: i64 = 0;
    let mut weight: i64 = 1;
    let mut scale: i64 = 0;
    let mut f = freq.max(1);
    for octave in 0..octaves {
        let value = i64::from(torus_noise(
            seed.wrapping_add(octave.wrapping_mul(0x9E37_79B1)),
            x,
            y,
            f,
        ));
        total += value * weight;
        scale += 1024 * weight;
        weight *= 2;
        f = (f * 2).min(128);
    }
    (total * 1024 / scale.max(1)) as i32
}

/// Contrast-stretch a `0..=1024` field around its mean.
///
/// Multilinear value noise only reaches roughly `mean +- 3 sigma` with
/// `sigma ~ 130`, so raw fields never hit the extreme thresholds the biome table
/// wants. The stretch is integer and clamped, hence still pure.
#[must_use]
pub fn stretch(value: i32, gain_permille: i32) -> i32 {
    (512 + (value - 512) * gain_permille / 1000).clamp(0, 1024)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn noise_is_a_pure_function_of_the_coordinates() {
        for (x, y) in [(0, 0), (17, 91), (5119, 5119), (10239, 10239), (-3, 10241)] {
            let a = torus_noise(0x5EED_1234, x, y, 7);
            let b = torus_noise(0x5EED_1234, x, y, 7);
            assert_eq!(a, b);
            assert!((0..=1024).contains(&a));
        }
        assert_ne!(
            torus_noise(1, 100, 100, 7),
            torus_noise(2, 100, 100, 7),
            "different seeds must produce different fields"
        );
    }

    #[test]
    fn noise_is_seamless_across_the_wrap() {
        for freq in [1, 3, 7, 21] {
            assert_eq!(
                torus_noise(0xA5A5, 0, 40, freq),
                torus_noise(0xA5A5, MAP_W, 40, freq)
            );
            assert_eq!(
                torus_noise(0xA5A5, 40, 0, freq),
                torus_noise(0xA5A5, 40, MAP_H, freq)
            );
            // The step across the seam is the same size as any other tile step,
            // so a continent does not end in a cliff at x = 0.
            let seam =
                (torus_noise(0xA5A5, MAP_W - 1, 40, freq) - torus_noise(0xA5A5, 0, 40, freq)).abs();
            assert!(seam <= 40, "freq {freq}: seam step {seam} is a cliff");
        }
    }

    #[test]
    fn fbm_stays_in_range_and_varies_by_octave() {
        let one = torus_fbm(7, 123, 456, 3, 1);
        let three = torus_fbm(7, 123, 456, 3, 3);
        assert!((0..=1024).contains(&one));
        assert!((0..=1024).contains(&three));
        assert_ne!(one, three);
    }

    #[test]
    fn stretch_amplifies_around_the_centre() {
        assert_eq!(stretch(512, 1500), 512);
        assert_eq!(stretch(612, 1500), 662);
        assert_eq!(stretch(0, 1500), 0);
        assert_eq!(stretch(1024, 1500), 1024);
    }
}
