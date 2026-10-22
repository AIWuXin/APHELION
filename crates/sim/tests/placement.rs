//! Placement rules: terrain, occupancy, deposits, affordability and tech gates.

mod common;

use oc_content::buildings as b;
use oc_content::terrain::{
    terrain_buildable, T_APRON, T_BRINE, T_CRYSTAL, T_DEEP, T_ROAD, T_SHALLOW,
};
use oc_protocol::{
    Command, REASON_ALLOY, REASON_LINK, REASON_LOCKED, REASON_OCCUPIED, REASON_TERRAIN,
};
use oc_sim::World;

const SEED: u32 = 0x5EED_1234;

fn new_world() -> World {
    World::new(SEED)
}

/// First legal 2x2 anchor with no mineral deposit under it.
fn free_2x2_no_deposit(world: &World) -> (i32, i32) {
    for (tx, ty) in common::tiles(world) {
        if world.query_place(b::B_SOLAR, tx, ty).ok && world.map.footprint_deposit(tx, ty, 2) == 0 {
            return (tx, ty);
        }
    }
    panic!("no free 2x2 anchor without a deposit");
}

/// First legal 2x2 anchor sitting on a mineral deposit.
fn deposit_2x2(world: &World) -> (i32, i32) {
    for (tx, ty) in common::tiles(world) {
        if world.map.footprint_deposit(tx, ty, 2) > 0
            && world.query_place(b::B_REFINERY, tx, ty).placement_ok
        {
            return (tx, ty);
        }
    }
    panic!("no free deposit footprint");
}

/// First free tile of a given material.
fn tile_of(world: &World, material: u8) -> (i32, i32) {
    common::tile_of(world, material)
}

#[test]
fn cannot_build_on_water_brine_or_crystal() {
    let world = new_world();
    // Terrain is generated now, not injected: find a real ocean tile through the
    // pure climate function, then ask the world about it. The landing pad keeps
    // the colony dry, so this has to look outside the colony.
    let (wx, wy) = common::find_base_material(16, 1024, |m| matches!(m, T_SHALLOW | T_DEEP))
        .expect("a planet with 35..75% ocean must expose a water tile");
    assert!(
        matches!(world.map.material_at(wx, wy), T_SHALLOW | T_DEEP),
        "the world must agree with the climate function about water"
    );
    let q = world.query_place(b::B_SOLAR, wx, wy);
    assert!(!q.ok);
    assert!(!q.placement_ok);
    assert_eq!(q.reason, REASON_TERRAIN);

    // Brine pans and crystal fields are unbuildable rows too. They are rarer, so
    // the world check is best-effort on this seed -- the shared
    // `terrain_buildable` path is asserted unconditionally.
    assert!(!terrain_buildable(T_BRINE));
    assert!(!terrain_buildable(T_CRYSTAL));
    for material in [T_BRINE, T_CRYSTAL] {
        if let Some((x, y)) = common::find_base_material(8, 2048, |m| m == material) {
            assert_eq!(
                world.query_place(b::B_SOLAR, x, y).reason,
                REASON_TERRAIN,
                "material {material} at ({x},{y}) must reject construction"
            );
        }
    }
}

#[test]
fn cannot_build_on_occupied_tiles() {
    let world = new_world();
    let hq = world
        .buildings
        .iter()
        .find(|x| x.kind == b::B_HQ)
        .expect("seeded command hub");
    let q = world.query_place(b::B_TURRET, hq.tx, hq.ty);
    assert!(!q.ok);
    assert_eq!(q.reason, REASON_OCCUPIED);
}

#[test]
fn refinery_needs_a_deposit() {
    let world = new_world();
    let (tx, ty) = free_2x2_no_deposit(&world);
    let q = world.query_place(b::B_REFINERY, tx, ty);
    assert!(!q.ok);
    assert!(q.affordable);
    assert_eq!(q.reason, REASON_LINK);
}

#[test]
fn placement_needs_alloy() {
    let mut world = new_world();
    let (tx, ty) = deposit_2x2(&world);
    world.res.alloy = 0;
    let q = world.query_place(b::B_REFINERY, tx, ty);
    assert!(!q.ok);
    assert!(!q.affordable);
    assert_eq!(q.reason, REASON_ALLOY);
}

#[test]
fn can_build_on_road_and_apron() {
    let world = new_world();
    let (rx, ry) = tile_of(&world, T_ROAD);
    assert!(
        world.query_place(b::B_TURRET, rx, ry).ok,
        "road is buildable"
    );
    let (ax, ay) = tile_of(&world, T_APRON);
    assert!(
        world.query_place(b::B_TURRET, ax, ay).ok,
        "apron is buildable"
    );
}

#[test]
fn demolition_frees_the_tiles_and_refunds_alloy() {
    let mut world = new_world();
    world.speed = 0; // apply commands without advancing the simulation
    world.res.alloy = 1_000;
    let (rx, ry) = tile_of(&world, T_ROAD);
    world.push(Command::Place {
        kind: b::B_TURRET,
        tx: rx as u16,
        ty: ry as u16,
    });
    world.step();
    let built = world.buildings.last().expect("turret placed").clone();
    assert_eq!(built.kind, b::B_TURRET);
    assert_eq!(world.res.alloy, 1_000 - World::def(b::B_TURRET).cost_alloy);
    assert_ne!(world.map.occupant(rx, ry), 0);

    world.push(Command::Demolish { id: built.id });
    world.step();
    assert!(!world.buildings.iter().any(|x| x.id == built.id));
    assert_eq!(world.map.occupant(rx, ry), 0);
    // 40% of the 85-alloy cost is refunded.
    assert_eq!(world.res.alloy, 1_000 - 85 + 34);
    assert!(world.query_place(b::B_TURRET, rx, ry).ok);
}

#[test]
fn tech_gates_are_enforced_by_query_place() {
    let mut world = new_world();
    world.speed = 0;
    world.set_era(3); // relay mast and repair bay are tier 3 / tier 2
    world.res.alloy = 10_000;
    world.res.research = 10_000;
    let (tx, ty) = tile_of(&world, T_ROAD);
    // Relay mast needs orbital engineering; the repair bay needs ballistics.
    let relay = world.query_place(b::B_RELAY, tx, ty);
    assert!(!relay.ok);
    assert!(!relay.unlocked);
    assert_eq!(relay.reason, REASON_LOCKED);
    let repair = world.query_place(b::B_REPAIR, tx, ty);
    assert_eq!(repair.reason, REASON_LOCKED);

    world.push(Command::Research {
        tech: oc_content::techs::T_ORBITAL,
    });
    world.push(Command::Research {
        tech: oc_content::techs::T_BALLISTICS,
    });
    world.step();
    assert!(world.query_place(b::B_RELAY, tx, ty).unlocked);
    let repair = world.query_place(b::B_REPAIR, tx, ty);
    assert!(repair.unlocked);
    assert!(repair.ok, "unlocked and affordable -> buildable");
}
