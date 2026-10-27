//! Bounded regional-oil prospecting. The anchor is computed once per world and
//! then passed through the pure chunk-generation context.

use oc_content::terrain::terrain_buildable;
use oc_iso::torus;

use super::climate;

/// Guided oilfields normally sit outside the opening road grid.
pub const OIL_ANCHOR_MIN: i32 = 48;
/// Normal upper bound; a final land fallback may extend to 128 tiles.
pub const OIL_ANCHOR_MAX: i32 = 96;
/// Guaranteed reservoir half-width around the selected anchor.
pub const OIL_PATCH_RADIUS: i32 = 4;
/// Richness used only for the guided field, never to replace T1 ore or coal.
pub const OIL_PATCH_RICHNESS: u8 = 120;

/// Pick a deterministic, buildable oilfield without changing the home anchor.
#[must_use]
pub fn oil_site(seed: u32, home: (i32, i32)) -> (i32, i32) {
    scan(seed, home, true, OIL_ANCHOR_MAX)
        .or_else(|| scan(seed, home, false, OIL_ANCHOR_MAX))
        .or_else(|| scan(seed, home, false, 128))
        .unwrap_or_else(|| (torus::wrap_x(home.0 + OIL_ANCHOR_MIN), home.1))
}

/// Search natural reservoirs first, then barren buildable ground for the
/// guaranteed overlay. The final overlay can drain a small sediment patch if a
/// pathological seed has no dry candidate at all.
fn scan(seed: u32, home: (i32, i32), natural: bool, max_radius: i32) -> Option<(i32, i32)> {
    let mut radius = OIL_ANCHOR_MIN;
    while radius <= max_radius {
        let mut dy = -radius;
        while dy <= radius {
            let mut dx = -radius;
            while dx <= radius {
                if dx.abs().max(dy.abs()) == radius {
                    let (tx, ty) = (torus::wrap_x(home.0 + dx), torus::wrap_y(home.1 + dy));
                    let mut richness = 0;
                    let mut suitable = true;
                    for oy in 0..2 {
                        for ox in 0..2 {
                            let tile = climate::base_tile(seed, tx + ox, ty + oy);
                            if !terrain_buildable(tile.material)
                                || tile.deposit > 0
                                || tile.coal > 0
                            {
                                suitable = false;
                            }
                            richness += i32::from(tile.oil);
                        }
                    }
                    if suitable && (!natural || richness > 0) {
                        return Some((tx, ty));
                    }
                }
                dx += 4;
            }
            dy += 4;
        }
        radius += 8;
    }
    None
}
