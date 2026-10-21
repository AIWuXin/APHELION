//! Seeded colony layout: the guaranteed extraction sites and the starting trio.
//!
//! These assertions are the mapgen contract with the opening economy, so they
//! live apart from the T1 content tests: a 6x6 ore body east of the command hub,
//! a 6x6 coal seam west of it, and a starting layout that never buries either
//! resource under the 3x3 hub.

use oc_content::buildings as b;
use oc_sim::World;

const SEED: u32 = 0x5EED_1234;

fn new_world() -> World {
    World::new(SEED)
}

#[test]
fn map_guarantees_an_ore_body_and_a_coal_seam_near_the_colony() {
    let world = new_world();
    // The seeded pads: a 6x6 ore body east of the 3x3 hub (x >= start+3, so no
    // tile is buried under the hub) and a 6x6 coal seam west of it (x <=
    // start-1), so the two T1 extraction sites never compete for the same
    // footprint.
    for y in 21..=24 {
        for x in 23..=26 {
            assert!(
                world.map.deposit_at(x, y) > 0,
                "guaranteed ore body has a hole at ({x},{y})"
            );
        }
    }
    for y in 21..=24 {
        for x in 14..=17 {
            assert!(
                world.map.coal_at(x, y) > 0,
                "guaranteed coal seam has a hole at ({x},{y})"
            );
        }
    }
    // The hub owns its 3x3 outright: scenario-placed, so it must not bury ore
    // or coal it can never mine.
    let hq = world
        .buildings
        .iter()
        .find(|x| x.kind == b::B_HQ)
        .expect("command hub");
    let size = i32::from(World::def(b::B_HQ).footprint);
    assert_eq!(size, 3, "the hub is the colony's 3x3 landmark");
    for y in hq.ty..hq.ty + size {
        for x in hq.tx..hq.tx + size {
            assert_eq!(world.map.deposit_at(x, y), 0, "ore under the hub ({x},{y})");
            assert_eq!(world.map.coal_at(x, y), 0, "coal under the hub ({x},{y})");
        }
    }
    // Both layers must offer a real, buildable 2x2 site for their extractor.
    assert!(
        world.map.footprint_coal(17, 20, 2) > 0,
        "the guaranteed seam has no 2x2 footprint"
    );
    assert!(
        world.map.footprint_deposit(23, 20, 2) > 0,
        "the guaranteed ore body has no 2x2 footprint"
    );
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
