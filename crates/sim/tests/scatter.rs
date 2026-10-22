//! Contract tests for the scattered T1 mineral layer.
//!
//! The rich affinity clusters decide where a seam is *worth the trip*; the
//! scatter layer exists so any dry land -- down to snowfields and deserts --
//! still has a few 1-4 tile specks that keep a lone extractor alive. These
//! tests pin the three promises that make it a distinct layer rather than a
//! second carpet: it is present planet-wide, its richness stays well below the
//! guaranteed seam, and the rich layers always win when the fields overlap.

use oc_content::terrain::{
    T_APRON, T_BRINE, T_DEEP, T_DESERT, T_ROAD, T_SAND, T_SHALLOW, T_SNOW, T_TUNDRA,
};
use oc_iso::grid::{MAP_H, MAP_W};
use oc_sim::mapgen::{self, climate};

const SEED: u32 = 0x5EED_1234;
/// Planet sampling stride: 640x640 samples, enough for a stable permission
/// reading without turning a unit test into a chunk benchmark.
const STRIDE: i32 = 16;

/// A deterministic lattice over the whole torus, row-major.
fn lattice(stride: i32) -> Vec<(i32, i32)> {
    let mut out = Vec::new();
    let mut y = 0;
    while y < MAP_H {
        let mut x = 0;
        while x < MAP_W {
            out.push((x, y));
            x += stride;
        }
        y += stride;
    }
    out
}

#[test]
fn scatter_is_not_placed_on_water_brine_roads_or_aprons() {
    // Same exclusion habit as the rich seams: no field sample for materials
    // that are not dry, buildable land. The hub footprint is cleared by the
    // overlay, exactly like the rich seams.
    for material in [T_DEEP, T_SHALLOW, T_BRINE, T_ROAD, T_APRON] {
        for (x, y) in [(0, 0), (5119, 5119), (1234, 9001)] {
            assert_eq!(
                climate::scatter(SEED, x, y, material),
                (0, 0),
                "scatter on material {material} at ({x},{y})"
            );
        }
    }
}

#[test]
fn scatter_reaches_every_land_biome_including_the_poor_ones() {
    // The user-facing promise: the whole planet is prospectable. Bucket the
    // hits by coarse 1024x1024 region and by material so a layer that only
    // lives near the colony cannot pass.
    let mut regions = std::collections::BTreeSet::new();
    let mut ore = 0usize;
    let mut coal = 0usize;
    let mut snow = 0usize;
    let mut desert = 0usize;
    let mut sand = 0usize;
    let mut tundra = 0usize;
    for (x, y) in lattice(STRIDE) {
        let base = climate::base_tile(SEED, x, y);
        if !climate::is_land(base.material) {
            continue;
        }
        let rich = climate::rich_minerals(SEED, x, y, base.material);
        if rich != (0, 0) {
            continue;
        }
        let sc = climate::scatter(SEED, x, y, base.material);
        if sc.0 > 0 {
            ore += 1;
        }
        if sc.1 > 0 {
            coal += 1;
        }
        if sc == (0, 0) {
            continue;
        }
        regions.insert((x.div_euclid(1024), y.div_euclid(1024)));
        match base.material {
            T_SNOW => snow += 1,
            T_DESERT => desert += 1,
            T_SAND => sand += 1,
            T_TUNDRA => tundra += 1,
            _ => {}
        }
    }
    assert!(
        ore > 0 && coal > 0,
        "both speck layers must occur: {ore}/{coal}"
    );
    assert!(
        regions.len() >= 16,
        "scatter only reached {} coarse regions; it is meant to be planet-wide",
        regions.len()
    );
    assert!(snow > 0, "snowfields must carry scattered specks");
    assert!(desert > 0, "deserts must carry scattered specks");
    assert!(sand > 0, "sand must carry scattered specks");
    assert!(tundra > 0, "tundra must carry scattered specks");
}

#[test]
fn scattered_specks_stay_well_below_the_guaranteed_seam() {
    // 30..=60 is deliberately below half of GUARANTEED_RICHNESS (120): a speck
    // is worth mining, but it cannot replace the opening body.
    assert!(
        u16::from(climate::SCATTER_RICHNESS_MAX) * 2 <= u16::from(mapgen::GUARANTEED_RICHNESS),
        "scatter ceiling {} is over half the guaranteed seam {}",
        climate::SCATTER_RICHNESS_MAX,
        mapgen::GUARANTEED_RICHNESS
    );
    let mut checked = 0usize;
    for (x, y) in lattice(STRIDE) {
        let base = climate::base_tile(SEED, x, y);
        let sc = climate::scatter(SEED, x, y, base.material);
        for (layer, value) in [("ore", sc.0), ("coal", sc.1)] {
            assert!(
                (climate::SCATTER_RICHNESS_MIN..=climate::SCATTER_RICHNESS_MAX).contains(&value)
                    || value == 0,
                "{layer} speck at ({x},{y}) has richness {value}, outside {}..={}",
                climate::SCATTER_RICHNESS_MIN,
                climate::SCATTER_RICHNESS_MAX
            );
            if value > 0 {
                checked += 1;
            }
        }
    }
    assert!(checked > 0, "the scatter layer must carry some richness");
}

#[test]
fn rich_seams_win_when_a_speck_field_crosses_the_same_tile() {
    // The scatter fields are independent, so a crossing can land on a rich
    // tile. The merge must keep the rich identity there: no tile carries both
    // layers, and no tile carries both materials.
    let mut rich_tiles = 0usize;
    let mut ignored = 0usize;
    for (x, y) in lattice(STRIDE) {
        let base = climate::base_tile(SEED, x, y);
        let material = base.material;
        let rich = climate::rich_minerals(SEED, x, y, material);
        let sc = climate::scatter(SEED, x, y, material);
        let merged = climate::minerals(SEED, x, y, material);
        assert_eq!(
            merged,
            (base.deposit, base.coal),
            "minerals and tile disagree"
        );
        assert!(
            !(merged.0 > 0 && merged.1 > 0),
            "tile ({x},{y}) carries both ore and coal"
        );
        if rich != (0, 0) {
            rich_tiles += 1;
            assert_eq!(merged, rich, "scatter leaked onto a rich tile at ({x},{y})");
            if sc != (0, 0) {
                ignored += 1;
            }
        } else {
            assert_eq!(merged, sc, "rich-free tile ({x},{y}) lost its speck");
        }
    }
    assert!(rich_tiles > 0, "the sample must contain rich seams");
    let _ = ignored; // overlap is rare and seed-dependent; not asserted.
}

#[test]
fn the_scatter_layer_covers_about_one_percent_of_the_land() {
    // The brief's density budget, measured separately from the rich layer: with
    // ore + coal at ~14% of the land, each speck layer holds ~1% and so stays
    // close to one seventh of its material's total. A sparse find, not a second
    // carpet.
    let mut land = 0usize;
    let mut ore = 0usize;
    let mut coal = 0usize;
    for (x, y) in lattice(STRIDE) {
        let base = climate::base_tile(SEED, x, y);
        if !climate::is_land(base.material) {
            continue;
        }
        land += 1;
        let rich = climate::rich_minerals(SEED, x, y, base.material);
        if rich != (0, 0) {
            continue;
        }
        let sc = climate::scatter(SEED, x, y, base.material);
        if sc.0 > 0 {
            ore += 1;
        }
        if sc.1 > 0 {
            coal += 1;
        }
    }
    let ore_permille = ore * 1000 / land.max(1);
    let coal_permille = coal * 1000 / land.max(1);
    assert!(
        (6..=18).contains(&ore_permille),
        "scatter ore covers {ore_permille} permille of land: outside the 0.6%..1.8% budget"
    );
    assert!(
        (6..=18).contains(&coal_permille),
        "scatter coal covers {coal_permille} permille of land: outside the 0.6%..1.8% budget"
    );
}
