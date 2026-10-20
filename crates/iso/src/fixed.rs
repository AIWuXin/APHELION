//! Fixed point helpers.
//!
//! The simulation never uses `f32` for state: every position, timer and rate is
//! an integer. One tile is [`FP`] units. This keeps the state hash stable
//! across platforms and passes because it is pure integer arithmetic.

/// Fractional bits: 1 tile == 1024 units.
pub const FP_BITS: u32 = 10;
/// One tile expressed in fixed point units.
pub const FP: i32 = 1 << FP_BITS;
/// Half a tile in fixed point units.
pub const FP_HALF: i32 = FP / 2;
/// Reciprocal of [`FP`] as an `f32` for presentation-only conversions.
pub const FP_INV: f32 = 1.0 / FP as f32;

/// Integer millisecond timestamp of the fixed simulation step.
pub const TICK_MS: u32 = 33;
/// Simulation rate implied by [`TICK_MS`]: 30 Hz.
pub const TICKS_PER_SEC: u32 = 30;

/// A tile-sized quantity in fixed point units.
pub type Fp = i32;

/// Multiply two fixed point values without leaving `i64` range in the middle.
#[must_use]
pub const fn fp_mul(a: Fp, b: Fp) -> Fp {
    ((a as i64 * b as i64) >> FP_BITS) as Fp
}

/// Divide two fixed point values.
#[must_use]
pub const fn fp_div(a: Fp, b: Fp) -> Fp {
    if b == 0 {
        return 0;
    }
    (((a as i64) << FP_BITS) / b as i64) as Fp
}

/// Integer square root used for distance comparisons (no floats, no libm).
#[must_use]
pub const fn isqrt(v: u32) -> u32 {
    if v < 2 {
        return v;
    }
    let mut x = v;
    let mut y = x.div_ceil(2);
    while y < x {
        x = y;
        y = (x + v / x) / 2;
    }
    x
}

/// Squared distance between two fixed point points, in tile^2 (integer).
#[must_use]
pub const fn dist2(ax: Fp, ay: Fp, bx: Fp, by: Fp) -> u64 {
    let dx = (ax - bx) as i64;
    let dy = (ay - by) as i64;
    ((dx * dx + dy * dy) >> (FP_BITS * 2)) as u64
}

/// Distance in whole tiles (rounded down) between two fixed point points.
#[must_use]
pub const fn dist_tiles(ax: Fp, ay: Fp, bx: Fp, by: Fp) -> u32 {
    isqrt(dist2(ax, ay, bx, by) as u32)
}

/// Clamp helper that keeps the `const fn` flavour.
#[must_use]
pub const fn clamp_i32(v: i32, lo: i32, hi: i32) -> i32 {
    if v < lo {
        lo
    } else if v > hi {
        hi
    } else {
        v
    }
}

/// Linear step towards a target, never overshooting.
#[must_use]
pub const fn step_towards(current: Fp, target: Fp, max_delta: Fp) -> Fp {
    let d = target - current;
    if d > max_delta {
        current + max_delta
    } else if d < -max_delta {
        current - max_delta
    } else {
        target
    }
}

/// Integer percentage of `value` out of `total`, saturated to 0..=1000.
#[must_use]
pub const fn permille(value: i32, total: i32) -> u16 {
    if total <= 0 {
        return 0;
    }
    let mut p = (value as i64 * 1000 / total as i64) as i32;
    if p < 0 {
        p = 0;
    }
    if p > 1000 {
        p = 1000;
    }
    p as u16
}
