//! Integer trigonometry on a wrap-around turn circle.
//!
//! Two kernel users need an angle: the climate sampler walks the torus as a pair
//! of circles (`cos`, `sin` of the tile coordinate) so that x = 10239 and x = 0
//! join without a seam, and the era-1 raid ring scatters squads around the
//! colony. Both feed the deterministic state, so neither may call `f64::sin`:
//! the native build links the platform libm while `wasm32-unknown-unknown` links
//! `compiler-builtins`, and a one-ULP difference would flip a biome right on a
//! threshold and change the state hash. Everything here is integer, hence
//! bit-identical on every target.
//!
//! Angles are measured in *turns*: [`TURN`] units per full revolution, values in
//! Q12 ([`ONE`] = 4096). The approximation is Bhaskara I's, which is periodic by
//! construction and monotone enough for sampling; its ~2% amplitude error is
//! irrelevant because it only shapes pseudo-random fields.

/// Units per full turn. Finer than the planet's 10240-tile circumference, so
/// adjacent tiles never share an angle.
pub const TURN: i32 = 1 << 16;
/// Q12 unit: `sin`/`cos` return `-4096..=4096`.
pub const ONE: i32 = 4096;
/// Quarter turn, the natural offset between `sin` and `cos`.
pub const QUARTER: i32 = TURN / 4;

/// Euclidean modulo (a `const fn`, unlike the libcore method on some releases).
const fn rem_euclid(a: i32, m: i32) -> i32 {
    let r = a % m;
    if r < 0 {
        r + m
    } else {
        r
    }
}

/// Bhaskara I's sine approximation on a half turn, scaled to Q12.
fn bhaskara(x: i32) -> i32 {
    let p = TURN / 2;
    let t = i64::from(x) * i64::from(p - x);
    let num = 16 * t;
    let den = 5 * i64::from(p) * i64::from(p) - 4 * t;
    (num * i64::from(ONE) / den) as i32
}

/// Sine of an angle given in turn units, Q12 in `-4096..=4096`.
#[must_use]
pub fn sin(turn: i32) -> i32 {
    let t = rem_euclid(turn, TURN);
    let half = TURN / 2;
    if t <= half {
        bhaskara(t)
    } else {
        -bhaskara(TURN - t)
    }
}

/// Cosine of an angle given in turn units, Q12 in `-4096..=4096`.
#[must_use]
pub fn cos(turn: i32) -> i32 {
    sin(turn + QUARTER)
}

/// Turn units for a tile coordinate on a loop of `span` tiles.
///
/// The mapping is exact at the seam: `span - 1` is one step short of `TURN`,
/// which is the same angle as `0`.
#[must_use]
pub const fn turn_of(tile: i32, span: i32) -> i32 {
    ((rem_euclid(tile, span) as i64 * TURN as i64) / span as i64) as i32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cardinal_angles_are_exact() {
        assert_eq!(sin(0), 0);
        assert_eq!(sin(QUARTER), ONE);
        assert_eq!(sin(TURN / 2), 0);
        assert_eq!(sin(-QUARTER), -ONE);
        assert_eq!(cos(0), ONE);
        assert_eq!(cos(TURN / 2), -ONE);
    }

    #[test]
    fn every_value_stays_inside_the_q12_unit() {
        for turn in (-2 * TURN..2 * TURN).step_by(7) {
            let s = sin(turn);
            assert!(s.abs() <= ONE, "sin({turn}) = {s}");
            let c = cos(turn);
            assert!(c.abs() <= ONE, "cos({turn}) = {c}");
        }
    }

    #[test]
    fn the_curve_is_periodic_and_symmetric() {
        for turn in (0..TURN).step_by(13) {
            assert_eq!(sin(turn), sin(turn + TURN));
            assert_eq!(sin(turn), -sin(-turn), "sin is odd");
            assert_eq!(sin(turn), -sin(TURN - turn), "sin has period 2π, not π");
            assert_eq!(cos(turn), cos(-turn), "cos is even");
        }
    }

    #[test]
    fn a_quarter_wave_is_monotone() {
        let mut previous = sin(0);
        for turn in (0..=QUARTER).step_by(64) {
            let value = sin(turn);
            assert!(value >= previous, "sin dipped at turn {turn}");
            previous = value;
        }
        assert_eq!(previous, ONE);
    }

    #[test]
    fn tile_turns_close_the_loop() {
        let span = 10240;
        assert_eq!(turn_of(0, span), 0);
        assert_eq!(turn_of(span, span), 0);
        assert_eq!(turn_of(-1, span), turn_of(span - 1, span));
        // One tile is 6.4 turn units at this circumference: strictly increasing
        // inside a turn, so no two neighbouring tiles share an angle.
        assert!(turn_of(7, span) > turn_of(6, span));
        let wrap_gap = TURN - turn_of(span - 1, span);
        assert!(
            wrap_gap <= 7,
            "seam step {wrap_gap} should match the tile step"
        );
    }
}
