//! Placement rules: terrain, occupancy, deposits, affordability and tech gates.

use oc_content::buildings as b;
use oc_content::terrain::{T_APRON, T_BRINE, T_CRYSTAL, T_ROAD};
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
    for ty in 0..=world.map.h - 2 {
        for tx in 0..=world.map.w - 2 {
            if world.query_place(b::B_SOLAR, tx, ty).ok
                && world.map.footprint_deposit(tx, ty, 2) == 0
            {
                return (tx, ty);
            }
        }
    }
    panic!("no free 2x2 anchor without a deposit");
}

/// First legal 2x2 anchor sitting on a mineral deposit.
fn deposit_2x2(world: &World) -> (i32, i32) {
    for ty in 0..=world.map.h - 2 {
        for tx in 0..=world.map.w - 2 {
            if world.map.footprint_deposit(tx, ty, 2) > 0
                && world.query_place(b::B_REFINERY, tx, ty).placement_ok
            {
                return (tx, ty);
            }
        }
    }
    panic!("no free deposit footprint");
}

/// First free tile of a given material.
fn tile_of(world: &World, material: u8) -> (i32, i32) {
    for ty in 0..world.map.h {
        for tx in 0..world.map.w {
            let Some(i) = world.map.index(tx, ty) else {
                continue;
            };
            if world.map.material[i] == material && world.map.occupied[i] == 0 {
                return (tx, ty);
            }
        }
    }
    panic!("no free tile of material {material}");
}

fn set_material(world: &mut World, tx: i32, ty: i32, size: i32, material: u8) {
    for y in ty..ty + size {
        for x in tx..tx + size {
            if let Some(i) = world.map.index(x, y) {
                world.map.material[i] = material;
            }
        }
    }
}

#[test]
fn cannot_build_on_brine_or_crystal() {
    let mut world = new_world();
    let (tx, ty) = free_2x2_no_deposit(&world);
    set_material(&mut world, tx, ty, 2, T_BRINE);
    let q = world.query_place(b::B_SOLAR, tx, ty);
    assert!(!q.ok);
    assert!(!q.placement_ok);
    assert_eq!(q.reason, REASON_TERRAIN);

    set_material(&mut world, tx, ty, 2, T_CRYSTAL);
    let q = world.query_place(b::B_SOLAR, tx, ty);
    assert_eq!(q.reason, REASON_TERRAIN);
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
    assert_ne!(world.map.occupied[world.map.index(rx, ry).unwrap()], 0);

    world.push(Command::Demolish { id: built.id });
    world.step();
    assert!(!world.buildings.iter().any(|x| x.id == built.id));
    assert_eq!(world.map.occupied[world.map.index(rx, ry).unwrap()], 0);
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
