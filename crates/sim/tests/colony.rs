//! Seeded colony layout: the guaranteed extraction sites and the starting trio.
//!
//! These assertions are the mapgen contract with the opening economy, so they
//! live apart from the T1 content tests: a 6x6 ore body east of the command hub,
//! a 6x6 coal seam west of it, a second 6x6 seam south, and a starting layout
//! that never buries either resource under the 3x3 hub. The home tile itself is
//! chosen by `find_home`, so it is asserted to be legal and deterministic too.

use oc_content::buildings as b;
use oc_content::terrain::terrain_buildable;
use oc_iso::torus;
use oc_sim::mapgen::{self, climate};
use oc_sim::World;

const SEED: u32 = 0x5EED_1234;

fn new_world() -> World {
    World::new(SEED)
}

/// Guaranteed ore body east of the hub: `dx = hq..hq+5`, `dy = 1..=6`.
fn guaranteed_ore_rect(hq: (i32, i32)) -> Vec<(i32, i32)> {
    let size = mapgen::hq_size();
    let mut out = Vec::new();
    for dy in 1..=mapgen::GUARANTEE_SPAN {
        for dx in size..size + mapgen::GUARANTEE_SPAN {
            out.push((hq.0 + dx, hq.1 + dy));
        }
    }
    out
}

#[test]
fn home_is_a_legal_deterministic_landing_site() {
    let world = new_world();
    let home = world.map.start;
    assert_eq!(
        home,
        mapgen::find_home(SEED),
        "find_home must be a pure function"
    );
    let base = climate::base_tile(SEED, home.0, home.1);
    assert!(
        climate::is_land(base.material) && terrain_buildable(base.material),
        "the colony anchor must be dry buildable land, got material {}",
        base.material
    );
    assert!(
        base.temperature >= climate::TEMP_COLD && base.temperature <= climate::TEMP_TEMPERATE + 180,
        "the colony anchor must sit in a non-extreme temperature band, got {}",
        base.temperature
    );
    // The landing pad is carved, so the hub footprint is buildable ground.
    let hq = mapgen::hq_size();
    for dy in 0..hq {
        for dx in 0..hq {
            assert!(
                terrain_buildable(world.map.material_at(home.0 + dx, home.1 + dy)),
                "hub pad at ({dx},{dy}) is not buildable"
            );
        }
    }
}

#[test]
fn map_guarantees_an_ore_body_and_coal_seams_near_the_colony() {
    let world = new_world();
    let hq = world.map.start;
    for (x, y) in guaranteed_ore_rect(hq) {
        assert!(
            world.map.deposit_at(x, y) > 0,
            "guaranteed ore body has a hole at ({x},{y})"
        );
    }
    // Coal west of the hub (x < start), deliberately offset from the ore body so
    // the two T1 extraction sites never compete for a footprint.
    for dy in 1..=mapgen::GUARANTEE_SPAN {
        for dx in -mapgen::GUARANTEE_SPAN..=-1 {
            assert!(
                world.map.coal_at(hq.0 + dx, hq.1 + dy) > 0,
                "guaranteed west coal seam has a hole at ({dx},{dy})"
            );
        }
    }
    // A second guaranteed seam south of the hub, clear of both other sites.
    for dy in 7..=12 {
        for dx in -1..=4 {
            assert!(
                world.map.coal_at(hq.0 + dx, hq.1 + dy) > 0,
                "guaranteed south coal seam has a hole at ({dx},{dy})"
            );
        }
    }
    // The hub owns its 3x3 outright: scenario-placed, so it must not bury ore
    // or coal it can never mine.
    let hub = world
        .buildings
        .iter()
        .find(|x| x.kind == b::B_HQ)
        .expect("command hub");
    let size = i32::from(World::def(b::B_HQ).footprint);
    assert_eq!(size, 3, "the hub is the colony's 3x3 landmark");
    assert_eq!((hub.tx, hub.ty), hq, "the hub sits on the chosen home tile");
    for y in hub.ty..hub.ty + size {
        for x in hub.tx..hub.tx + size {
            assert_eq!(world.map.deposit_at(x, y), 0, "ore under the hub ({x},{y})");
            assert_eq!(world.map.coal_at(x, y), 0, "coal under the hub ({x},{y})");
        }
    }
    // Both layers must offer a real, buildable 2x2 site for their extractor.
    assert!(
        world.map.footprint_coal(hq.0 - 2, hq.1 + 1, 2) > 0,
        "the guaranteed west seam has no 2x2 footprint"
    );
    assert!(
        world.map.footprint_deposit(hq.0 + 3, hq.1 + 1, 2) > 0,
        "the guaranteed ore body has no 2x2 footprint"
    );
}

/// The opening promise in one line: whichever home `find_home` picks, a player
/// who lands there has a mineable ore body and a coal seam within 500 tiles.
///
/// The guarantee is carried by the authored 6x6 bodies (ore east of the hub,
/// coal west and south), which sit inside a 12-tile ring -- the 500-tile radius
/// is held with a factor of forty to spare. The test is written against the
/// finished tile, so a future overlay rework that erased the guarantee (hub
/// carve, plot sweep) would fail here rather than in play.
#[test]
fn every_home_holds_ore_and_coal_within_500_tiles() {
    const RADIUS: i32 = 500;
    for seed in [SEED, SEED ^ 0x00C0_FFEE, 0xDEAD_BEEF] {
        let home = mapgen::find_home(seed);
        let oil_home = mapgen::oil_site(seed, home);
        let (mut ore, mut coal) = (None, None);
        'rings: for r in 0..=RADIUS {
            for dy in -r..=r {
                for dx in -r..=r {
                    // Ring shell only: the cube around the home is a waste of
                    // samples once the inner rings have been checked.
                    if dx.abs() != r && dy.abs() != r {
                        continue;
                    }
                    let x = torus::wrap_x(home.0 + dx);
                    let y = torus::wrap_y(home.1 + dy);
                    let tile = mapgen::tile(seed, home, oil_home, x, y);
                    if ore.is_none() && tile.deposit > 0 {
                        ore = Some((dx, dy));
                    }
                    if coal.is_none() && tile.coal > 0 {
                        coal = Some((dx, dy));
                    }
                    if ore.is_some() && coal.is_some() {
                        break 'rings;
                    }
                }
            }
        }
        assert!(
            ore.is_some(),
            "seed {seed:#010x}: no ore inside {RADIUS} tiles of home {home:?}"
        );
        assert!(
            coal.is_some(),
            "seed {seed:#010x}: no coal inside {RADIUS} tiles of home {home:?}"
        );
        for (name, at) in [("ore", ore), ("coal", coal)] {
            let (dx, dy) = at.expect("checked above");
            assert!(
                dx.abs() <= RADIUS && dy.abs() <= RADIUS,
                "seed {seed:#010x}: {name} at ({dx},{dy}) is outside the {RADIUS} tile radius"
            );
        }
    }
}

/// Inclusive-anchor, exclusive-edge footprint rectangle of a building.
fn rect(b: &oc_sim::state::Building) -> (i32, i32, i32, i32) {
    let size = i32::from(World::def(b.kind).footprint);
    (b.tx, b.ty, b.tx + size, b.ty + size)
}

/// Disjoint when one rectangle ends before the other starts on either axis.
fn disjoint(a: (i32, i32, i32, i32), b: (i32, i32, i32, i32)) -> bool {
    a.2 <= b.0 || b.2 <= a.0 || a.3 <= b.1 || b.3 <= a.1
}

#[test]
fn seeded_colony_fits_around_the_three_by_three_hub() {
    let world = new_world();
    let find = |kind: u8| {
        world
            .buildings
            .iter()
            .find(|x| x.kind == kind)
            .cloned()
            .expect("seeded building")
    };
    let hq = find(b::B_HQ);
    let solar = find(b::B_SOLAR);
    let refinery = find(b::B_REFINERY);
    assert!(
        disjoint(rect(&hq), rect(&solar)),
        "the solar array overlaps the hub"
    );
    assert!(
        disjoint(rect(&hq), rect(&refinery)),
        "the refinery overlaps the hub"
    );
    assert!(
        disjoint(rect(&solar), rect(&refinery)),
        "the seeded pair overlaps"
    );

    let rsize = i32::from(World::def(b::B_REFINERY).footprint);
    assert!(
        world.map.footprint_deposit(refinery.tx, refinery.ty, rsize) > 0,
        "the seeded refinery sits on the guaranteed ore body"
    );
    let ssize = i32::from(World::def(b::B_SOLAR).footprint);
    assert_eq!(
        world.map.footprint_deposit(solar.tx, solar.ty, ssize),
        0,
        "the seeded solar array sterilises no ore"
    );
    assert_eq!(
        world.map.footprint_coal(solar.tx, solar.ty, ssize),
        0,
        "the seeded solar array sterilises no coal"
    );
}
