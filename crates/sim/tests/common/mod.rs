//! Shared helpers for the simulation integration tests.
//!
//! The planet is 10240x10240 (100 million tiles), so tests never scan the whole
//! map: every helper here searches a deterministic window around the colony
//! anchor, which is where gameplay happens anyway. Anything that needs the raw
//! climate elsewhere (ocean fraction, biome census) goes through
//! `oc_sim::mapgen::climate` directly instead of through a `World`.
#![allow(dead_code)]

use oc_sim::mapgen::climate;
use oc_sim::World;

/// Default test seed, shared with the headless CLI and `scripts/wasm-hash.mjs`.
pub const SEED: u32 = 0x5EED_1234;
/// Radius of the test scan window around the colony anchor.
pub const SCAN_RADIUS: i32 = 30;

/// Every tile of the wrapped test window around the colony, row-major.
pub fn tiles(world: &World) -> Vec<(i32, i32)> {
    let (cx, cy) = world.map.start;
    let mut out = Vec::with_capacity(((2 * SCAN_RADIUS + 1) * (2 * SCAN_RADIUS + 1)) as usize);
    for dy in -SCAN_RADIUS..=SCAN_RADIUS {
        for dx in -SCAN_RADIUS..=SCAN_RADIUS {
            out.push((
                oc_iso::torus::wrap_x(cx + dx),
                oc_iso::torus::wrap_y(cy + dy),
            ));
        }
    }
    out
}

/// First free tile carrying `material` in the test window.
///
/// Panics when the seed does not place that material near the colony -- which is
/// itself a mapgen failure worth failing on.
pub fn tile_of(world: &World, material: u8) -> (i32, i32) {
    for (x, y) in tiles(world) {
        if world.map.material_at(x, y) == material && world.map.is_free(x, y) {
            return (x, y);
        }
    }
    panic!("no free {material} tile within {SCAN_RADIUS} tiles of the colony");
}

/// First tile (searching outward from the planet centre) whose *base* climate
/// material satisfies `predicate`, sampled every `step` tiles.
///
/// This deliberately bypasses the `World` chunk cache: it walks the pure climate
/// function, so finding a far-away ocean tile costs a few hundred climate
/// evaluations instead of generating every chunk on the way. The colony's
/// landing pad carves dry land around the home tile, which is why a test that
/// needs an unbuildable tile has to look outside the colony.
pub fn find_base_material(
    step: i32,
    limit: i32,
    predicate: impl Fn(u8) -> bool,
) -> Option<(i32, i32)> {
    let (cx, cy) = (oc_iso::grid::MAP_W / 2, oc_iso::grid::MAP_H / 2);
    let limit = limit.min(oc_iso::grid::MAP_W / 2);
    let step = step.max(1);
    let mut radius = 0;
    while radius <= limit {
        let mut offset = -radius;
        while offset <= radius {
            let candidates = [
                (cx + offset, cy - radius),
                (cx + offset, cy + radius),
                (cx - radius, cy + offset),
                (cx + radius, cy + offset),
            ];
            for (x, y) in candidates {
                let (x, y) = (oc_iso::torus::wrap_x(x), oc_iso::torus::wrap_y(y));
                if predicate(climate::base_tile(SEED, x, y).material) {
                    return Some((x, y));
                }
            }
            offset += step;
        }
        radius += step;
    }
    None
}
