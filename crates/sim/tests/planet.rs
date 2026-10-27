//! Planet-scale contract tests: wrap geometry, chunk purity, climate statistics
//! and the "no map edge" guarantees.
//!
//! These are the tests that would have been impossible on the old 44x44 array:
//! footprints that straddle x = 10239/0, a terrain function that may be evicted
//! and regenerated, and a whole-planet climate census.

mod common;

use oc_content::buildings as b;
use oc_content::terrain::{
    terrain_buildable, T_BASALT, T_BRINE, T_CRYSTAL, T_DEEP, T_DESERT, T_HIGHLAND, T_MOSS,
    T_MOSSY_TUNDRA, T_REGOLITH, T_SAND, T_SHALLOW, T_SNOW, T_TUNDRA,
};
use oc_iso::torus;
use oc_protocol::EFFECT_EXPLODE;
use oc_sim::mapgen::{self, climate};
use oc_sim::World;

const SEED: u32 = 0x5EED_1234;

fn new_world() -> World {
    World::new(SEED)
}

#[test]
fn a_footprint_anchored_on_the_seam_wraps_its_occupancy() {
    let mut world = new_world();
    world.speed = 0;
    let (tx, ty) = (torus::MAP_W - 1, torus::MAP_H - 1);
    let id = world.place_now(b::B_SOLAR, tx, ty, true);
    assert_eq!(id, world.map.occupant(tx, ty));
    assert_eq!(world.map.occupant(0, ty), id);
    assert_eq!(world.map.occupant(tx, 0), id);
    assert_eq!(world.map.occupant(0, 0), id);
    assert!(world.map.footprint_taken(tx, ty, 2));
    // Placement queries agree through the seam.
    assert!(
        !world.query_place(b::B_SOLAR, 0, 0).placement_ok,
        "the wrapped corner is occupied"
    );
    assert!(
        !world
            .query_place(b::B_SOLAR, tx - torus::MAP_W, ty - torus::MAP_H)
            .placement_ok,
        "out-of-range anchors wrap onto the same occupied footprint"
    );
    // Resource sums wrap the footprint too.
    assert_eq!(
        world.map.footprint_deposit(tx, ty, 2),
        i32::from(world.map.deposit_at(tx, ty))
            + i32::from(world.map.deposit_at(0, ty))
            + i32::from(world.map.deposit_at(tx, 0))
            + i32::from(world.map.deposit_at(0, 0))
    );
    assert_eq!(
        world.map.footprint_coal(tx, ty, 2),
        i32::from(world.map.coal_at(tx, ty))
            + i32::from(world.map.coal_at(0, ty))
            + i32::from(world.map.coal_at(tx, 0))
            + i32::from(world.map.coal_at(0, 0))
    );
}

#[test]
fn tile_queries_wrap_on_both_axes() {
    let world = new_world();
    assert_eq!(
        world.map.material_at(-1, -1),
        world.map.material_at(torus::MAP_W - 1, torus::MAP_H - 1)
    );
    assert_eq!(
        world.map.height_at(torus::MAP_W + 7, 3),
        world.map.height_at(7, 3)
    );
    assert_eq!(
        world.map.decor_at(-3, 5),
        world.map.decor_at(torus::MAP_W - 3, 5)
    );
}

#[test]
fn an_explosion_at_the_seam_reports_wrapped_coordinates() {
    let mut world = new_world();
    world.speed = 1;
    let id = world.place_now(b::B_SOLAR, torus::MAP_W - 1, 7, true);
    let index = world
        .buildings
        .iter()
        .position(|x| x.id == id)
        .expect("seeded solar");
    world.buildings[index].hp = 0;
    world.step();
    let boom = world
        .effects
        .iter()
        .find(|e| e.kind == EFFECT_EXPLODE)
        .expect("wrecked building must explode");
    assert!(
        (0..torus::MAP_W * oc_iso::FP).contains(&boom.x),
        "explosion x must be a wrapped world position, got {}",
        boom.x
    );
    assert!(
        (0..torus::MAP_H * oc_iso::FP).contains(&boom.y),
        "explosion y must be a wrapped world position, got {}",
        boom.y
    );
}

#[test]
fn a_chunk_is_a_pure_function_of_seed_and_chunk() {
    let home = mapgen::find_home(SEED);
    let oil_home = mapgen::oil_site(SEED, home);
    let a = mapgen::chunk(SEED, home, oil_home, 7, 11);
    let b = mapgen::chunk(SEED, home, oil_home, 7, 11);
    for i in 0..a.material.len() {
        assert_eq!(a.material[i], b.material[i], "terrain differs at {i}");
        assert_eq!(a.height[i], b.height[i], "elevation differs at {i}");
        assert_eq!(a.decor[i], b.decor[i], "decor differs at {i}");
        assert_eq!(a.deposit[i], b.deposit[i], "ore differs at {i}");
        assert_eq!(a.coal[i], b.coal[i], "coal differs at {i}");
        assert_eq!(a.oil[i], b.oil[i], "oil differs at {i}");
    }
    let other = mapgen::chunk(SEED ^ 1, home, mapgen::oil_site(SEED ^ 1, home), 7, 11);
    assert_ne!(a.material, other.material, "seeds must diverge");
}

#[test]
fn chunk_views_are_wrapped_and_match_the_generator() {
    let world = new_world();
    let view = world.chunk_view(-1, 0);
    assert_eq!(view.cx, torus::CHUNKS - 1);
    assert_eq!(view.cy, 0);
    assert_eq!(view.terrain.len(), torus::CHUNK_TILES);
    let direct = mapgen::chunk(
        SEED,
        world.map.start,
        world.map.oil_home,
        torus::CHUNKS - 1,
        0,
    );
    assert_eq!(view.terrain, direct.material);
    assert_eq!(view.elev, direct.height);
    assert_eq!(view.decor, direct.decor);
    assert_eq!(view.ore, direct.deposit);
    assert_eq!(view.coal, direct.coal);
    assert_eq!(view.oil, direct.oil);
    assert!(world.map.loaded_chunks() <= oc_sim::CHUNK_CACHE_CAPACITY);
}

/// Sample the pure climate function on a lattice; returns (ocean fraction,
/// per-material counts).
fn census(stride: i32) -> (i32, Vec<usize>) {
    let mut counts = vec![0usize; usize::from(oc_content::terrain::T_COUNT)];
    let mut ocean = 0i32;
    let mut samples = 0i32;
    let mut y = 0;
    while y < torus::MAP_H {
        let mut x = 0;
        while x < torus::MAP_W {
            let base = climate::base_tile(SEED, x, y);
            if climate::is_water(base.material) {
                ocean += 1;
            }
            counts[usize::from(base.material)] += 1;
            samples += 1;
            x += stride;
        }
        y += stride;
    }
    (ocean * 1000 / samples.max(1), counts)
}

#[test]
fn the_planet_is_roughly_half_ocean() {
    let (ocean_permille, counts) = census(40);
    assert!(
        (350..=750).contains(&ocean_permille),
        "ocean fraction {ocean_permille} permille is outside 35%..75%"
    );
    assert!(
        counts[usize::from(T_DEEP)] > 0 && counts[usize::from(T_SHALLOW)] > 0,
        "both deep and shallow water must occur"
    );
}

#[test]
fn every_biome_including_the_original_materials_occurs() {
    let (_, counts) = census(40);
    let check = |material: u8, name: &str| {
        assert!(
            counts[usize::from(material)] > 0,
            "{name} (material {material}) never occurred on the planet"
        );
    };
    // Original specials: none of them may disappear because the generator was
    // rewritten.
    check(T_BASALT, "basalt");
    check(T_REGOLITH, "regolith");
    check(T_MOSS, "moss");
    check(T_SAND, "sand");
    check(T_BRINE, "brine");
    check(T_CRYSTAL, "crystal");
    // New climate bands.
    check(T_SNOW, "snow");
    check(T_TUNDRA, "tundra");
    check(T_DESERT, "desert");
    check(T_HIGHLAND, "highland");
    check(T_MOSSY_TUNDRA, "mossy tundra");
}

#[test]
fn minerals_prefer_their_biomes_and_stay_sparse() {
    let (_, counts) = census(40);
    // Ore on highland and rock, coal on moss/tundra lowlands: both layers must
    // exist in quantity, and neither may carpet the planet.
    let mut ore = 0usize;
    let mut coal = 0usize;
    let mut highland_ore = 0usize;
    let mut highland = 0usize;
    let mut temperate_coal = 0usize;
    let mut temperate = 0usize;
    let mut y = 0;
    while y < torus::MAP_H {
        let mut x = 0;
        while x < torus::MAP_W {
            let base = climate::base_tile(SEED, x, y);
            if base.deposit > 0 {
                ore += 1;
            }
            if base.coal > 0 {
                coal += 1;
            }
            if base.material == T_HIGHLAND {
                highland += 1;
                if base.deposit > 0 {
                    highland_ore += 1;
                }
            }
            if base.material == T_MOSS || base.material == T_MOSSY_TUNDRA {
                temperate += 1;
                if base.coal > 0 {
                    temperate_coal += 1;
                }
            }
            x += 40;
        }
        y += 40;
    }
    let total: usize = counts.iter().sum();
    assert!(ore > 0 && coal > 0, "both mineral layers must occur");
    assert!(
        ore * 100 / total.max(1) < 20,
        "ore covers too much of the planet"
    );
    assert!(
        coal * 100 / total.max(1) < 20,
        "coal covers too much of the planet"
    );
    assert!(highland > 0 && highland_ore > 0, "highlands must carry ore");
    assert!(
        temperate > 0 && temperate_coal > 0,
        "lowlands must carry coal"
    );
}

/// Mineral coverage at the tuned thresholds, in permille of the sampled planet.
fn mineral_permille(stride: i32) -> (i32, i32) {
    let mut ore = 0i32;
    let mut coal = 0i32;
    let mut samples = 0i32;
    let mut y = 0;
    while y < torus::MAP_H {
        let mut x = 0;
        while x < torus::MAP_W {
            let base = climate::base_tile(SEED, x, y);
            if base.deposit > 0 {
                ore += 1;
            }
            if base.coal > 0 {
                coal += 1;
            }
            samples += 1;
            x += stride;
        }
        y += stride;
    }
    (ore * 1000 / samples.max(1), coal * 1000 / samples.max(1))
}

#[test]
fn the_mineral_fields_are_clusters_not_a_carpet() {
    // Density is budgeted planet-wide: ore plus coal on 8%..10% of the surface
    // (9% +-1%), roughly half each. The scattered layer is part of the budget --
    // a speck is mineral ground a player can mine -- so the measurement uses the
    // merged tile and not the rich fields alone.
    //
    // History: the rich-only thresholds (755 / 735) measured 94 / 117 permille;
    // 830 / 830 with 850 / 845 specks measured 65 / 66 (13% of the planet,
    // ~21% of the land), which the player read as "too dense". The 870 / 885
    // rich pair with 875 / 865 specks measures ~46 / 44 permille of the planet
    // (~7% of the land each, ~14% of the land in total) at stride 8 and 20.
    let (ore, coal) = mineral_permille(40);
    assert!(
        (38..=56).contains(&ore),
        "ore covers {ore} permille of the planet: outside the 3.8%..5.6% budget"
    );
    assert!(
        (38..=56).contains(&coal),
        "coal covers {coal} permille of the planet: outside the 3.8%..5.6% budget"
    );
    let total = ore + coal;
    assert!(
        (80..=100).contains(&total),
        "ore and coal cover {total} permille of the planet: outside the 8%..10% budget"
    );
}

#[test]
fn the_prepared_colony_plot_is_buildable_ground_not_a_chequerboard() {
    // Every plot tile is buildable, both fill materials occur, and the boundary
    // is a slow patch edge rather than the old per-tile chequerboard.
    let home = mapgen::find_home(SEED);
    let oil_home = mapgen::oil_site(SEED, home);
    let radius = mapgen::COLONY_LAND_RADIUS;
    let width = (2 * radius + 1) as usize;
    let mut materials = Vec::with_capacity(width * width);
    for dy in -radius..=radius {
        for dx in -radius..=radius {
            let tile = mapgen::tile(SEED, home, oil_home, home.0 + dx, home.1 + dy);
            assert!(
                terrain_buildable(tile.material),
                "prepared ground at ({dx},{dy}) is not buildable"
            );
            materials.push(tile.material);
        }
    }
    let is_fill = |m: u8| matches!(m, T_BASALT | T_REGOLITH);
    let basalt = materials.iter().filter(|&&m| m == T_BASALT).count();
    let dust = materials.iter().filter(|&&m| m == T_REGOLITH).count();
    assert!(
        basalt > 0 && dust > 0,
        "the fill must show both basalt and dust, got {basalt}/{dust}"
    );
    // Count how many north/east neighbour pairs of fill tiles disagree. A
    // chequerboard disagrees on every one of them; a slow field on a few.
    let mut pairs = 0usize;
    let mut splits = 0usize;
    for row in 0..width {
        for col in 0..width {
            let m = materials[row * width + col];
            if !is_fill(m) {
                continue;
            }
            for (dr, dc) in [(0usize, 1usize), (1, 0)] {
                if row + dr < width && col + dc < width {
                    let n = materials[(row + dr) * width + col + dc];
                    if is_fill(n) {
                        pairs += 1;
                        if n != m {
                            splits += 1;
                        }
                    }
                }
            }
        }
    }
    assert!(
        splits * 4 <= pairs,
        "the fill changes material on {splits} of {pairs} neighbour pairs: that is a pattern, not a patch"
    );
}

#[test]
fn the_colony_can_actually_be_built() {
    // The landing carve guarantees buildable ground around the hub even when the
    // home tile sits on a coast: the opening trio must have been placed.
    let world = new_world();
    let kinds: Vec<u8> = world.buildings.iter().map(|b| b.kind).collect();
    for kind in [b::B_HQ, b::B_SOLAR, b::B_REFINERY] {
        assert!(
            kinds.contains(&kind),
            "the opening colony is missing building kind {kind}"
        );
    }
    assert!(
        world.buildings.iter().filter(|b| b.kind == b::B_HQ).count() == 1,
        "exactly one command hub"
    );
    let hq = world.buildings.iter().find(|x| x.kind == b::B_HQ).unwrap();
    assert_eq!((hq.tx, hq.ty), world.map.start);
}
