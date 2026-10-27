//! Regional crude-oil reservoirs. Independent from the T1 ore/coal fields.

use oc_content::terrain::{T_BASALT, T_DESERT, T_REGOLITH, T_SAND};

use super::Axes;
use crate::mapgen::noise;

/// Reservoir clusters are broad geological features, not scattered specks.
pub const OIL_FIELD_FREQ: i32 = 19;
/// Only the high tail of the field becomes a recoverable reservoir.
pub const OIL_THRESHOLD: i32 = 885;
/// Maximum richness before the guaranteed field overlay.
pub const OIL_RICHNESS_SCALE: i32 = 200;
/// Independent seed salt; changing it does not move the T1 mineral streams.
const OIL_FIELD_SALT: u32 = 0x00E7_0001;

/// Sedimentary basins and dry regolith are the productive host materials.
#[must_use]
pub const fn oil_affinity(material: u8) -> i32 {
    match material {
        T_DESERT => 1000,
        T_SAND => 850,
        T_REGOLITH => 650,
        T_BASALT => 350,
        _ => 0,
    }
}

/// Reservoir richness for one tile, before T1 mineral precedence is applied.
pub(super) fn oil_of(axes: &Axes, seed: u32, x: i32, y: i32, material: u8) -> u8 {
    let affinity = oil_affinity(material);
    if affinity == 0 {
        return 0;
    }
    let field = noise::stretch(
        noise::torus_noise_axes(
            seed ^ OIL_FIELD_SALT,
            axes.axis_x(OIL_FIELD_FREQ, x),
            axes.axis_y(OIL_FIELD_FREQ, y),
        ),
        1400,
    );
    if field <= OIL_THRESHOLD {
        return 0;
    }
    let score = (field - OIL_THRESHOLD) * 1000 / (1024 - OIL_THRESHOLD);
    (score * affinity / 1000 * OIL_RICHNESS_SCALE / 1000).clamp(1, 255) as u8
}
