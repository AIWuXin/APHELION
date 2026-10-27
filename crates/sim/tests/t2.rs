//! T2 petroleum, era milestones and physical freight contracts.

mod common;

use oc_content::{balance, buildings as b, units};
use oc_iso::{fixed::FP, grid};
use oc_protocol::{BootBlob, REASON_ERA, REASON_LINK, UNIT_STATE_DOCKED, UNIT_STATE_MOVE};
use oc_sim::{systems::targeting::step_torus, World};

fn world_t2() -> World {
    let mut world = World::new(common::SEED);
    world.set_era(2);
    world.res.alloy = 10_000;
    world
}

fn anchor(world: &World, kind: u8) -> (i32, i32) {
    let (cx, cy) = world.map.start;
    common::tiles(world)
        .into_iter()
        .filter(|&(tx, ty)| world.query_place(kind, tx, ty).ok)
        .min_by_key(|&(tx, ty)| {
            let distance = (tx - cx) * (tx - cx) + (ty - cy) * (ty - cy);
            (distance, ty, tx)
        })
        .unwrap_or_else(|| panic!("no legal anchor for building {kind}"))
}

fn oil_well(world: &mut World) -> u32 {
    let (tx, ty) = world.map.oil_home;
    assert!(world.query_place(b::B_OIL_WELL, tx, ty).ok);
    world.place_now(b::B_OIL_WELL, tx, ty, true)
}

fn ticks(world: &mut World, count: u32) {
    for _ in 0..count {
        world.step();
    }
}

fn train(world: &World) -> &oc_sim::state::Unit {
    world
        .units
        .iter()
        .find(|unit| unit.kind == units::U_FREIGHT_TRAIN && unit.hp > 0)
        .expect("a live freight train")
}

#[test]
fn oilfield_is_guided_buildable_and_era_gated() {
    let mut world = World::new(common::SEED);
    let (tx, ty) = world.map.oil_home;
    let (hx, hy) = world.map.start;
    assert!(world.map.footprint_buildable(tx, ty, 2));
    assert!(world.map.footprint_oil(tx, ty, 2) > 0);
    assert_eq!(world.map.footprint_deposit(tx, ty, 2), 0);
    assert_eq!(world.map.footprint_coal(tx, ty, 2), 0);
    assert!(tx.abs_diff(hx) >= 48 || ty.abs_diff(hy) >= 48);
    assert!(tx.abs_diff(hx) <= 128 && ty.abs_diff(hy) <= 128);
    assert_eq!(world.query_place(b::B_OIL_WELL, tx, ty).reason, REASON_ERA);
    world.set_era(2);
    assert!(world.query_place(b::B_OIL_WELL, tx, ty).ok);
    let boot: BootBlob = postcard::from_bytes(world.boot_bytes()).expect("boot");
    assert_eq!((boot.map.oil_tx, boot.map.oil_ty), (tx as u16, ty as u16));

    world.res.alloy = 10_000;
    let (fx, fy) = anchor(&world, b::B_SOLAR);
    assert_eq!(world.map.footprint_oil(fx, fy, 2), 0);
    assert_eq!(world.query_place(b::B_OIL_WELL, fx, fy).reason, REASON_LINK);
}

#[test]
fn well_stores_production_locally_before_a_full_load() {
    let mut world = world_t2();
    oil_well(&mut world);
    ticks(&mut world, 600);
    let well = world
        .buildings
        .iter()
        .find(|building| building.kind == b::B_OIL_WELL)
        .expect("oil well");
    assert!(well.aux > 0 && well.aux < balance::TRAIN_CAPACITY);
    assert!(well.production_milli < 1000);
    assert_eq!(world.res.oil, 0, "local production is not colony stock");
    assert_eq!(train(&world).cargo, 0);
}

#[test]
fn freight_loads_moves_delivers_and_returns() {
    let mut world = world_t2();
    let home = oil_well(&mut world);
    world.step();
    world
        .buildings
        .iter_mut()
        .find(|b| b.id == home)
        .unwrap()
        .aux = balance::TRAIN_CAPACITY;
    world.step();
    assert_eq!(
        world.buildings.iter().find(|b| b.id == home).unwrap().aux,
        0
    );
    assert_eq!(train(&world).cargo, balance::TRAIN_CAPACITY);
    assert_eq!(train(&world).state, UNIT_STATE_MOVE);
    assert_eq!(world.res.oil, 0, "cargo in transit must not be usable");

    let mut arrivals = 0;
    for _ in 0..10_000 {
        world.step();
        if world.res.oil > 0 {
            break;
        }
        arrivals += 1;
    }
    assert!(arrivals < 10_000, "the train must reach the hub");
    assert_eq!(world.res.oil, balance::TRAIN_CAPACITY as i32);
    assert_eq!(train(&world).cargo, 0);
    assert_eq!(train(&world).home, home);
    assert!(world.oil_rate > 0);
    for _ in 0..10_000 {
        world.step();
        let unit = train(&world);
        if unit.target == home && unit.state == UNIT_STATE_DOCKED {
            return;
        }
    }
    panic!("the empty train must return to its well");
}

#[test]
fn fuel_synth_consumes_only_delivered_oil() {
    let mut world = world_t2();
    world.buildings.retain(|b| b.kind == b::B_HQ);
    world.res.alloy = 500;
    let (tx, ty) = anchor(&world, b::B_FUEL);
    let fuel = world.place_now(b::B_FUEL, tx, ty, true);
    world.res.oil = 0;
    world.step();
    assert_eq!(
        world.buildings.iter().find(|b| b.id == fuel).unwrap().state,
        3
    );
    assert_eq!(world.res.alloy, 500, "alloy is no longer a fuel input");

    world.res.oil = 40;
    ticks(&mut world, 1_800);
    assert!(
        (27..=30).contains(&world.res.fuel),
        "fuel={}",
        world.res.fuel
    );
    assert!((28..=30).contains(&world.res.oil), "oil={}", world.res.oil);
    assert_eq!(world.res.alloy, 500);
}

#[test]
fn milestones_unlock_t2_and_t3_but_not_t4() {
    let mut world = World::new(common::SEED);
    world.res.alloy = 10_000;
    world.wave = 1;
    world.wave_in_flight = false;
    world.step();
    assert_eq!(world.era, 1, "coal infrastructure is required");
    let (mx, my) = anchor(&world, b::B_COAL_MINE);
    world.place_now(b::B_COAL_MINE, mx, my, true);
    let (px, py) = anchor(&world, b::B_COAL_PLANT);
    world.place_now(b::B_COAL_PLANT, px, py, true);
    world.step();
    assert_eq!(world.era, 2);
    assert!(world.events.iter().any(|event| {
        event.kind == oc_protocol::EVENT_ERA
            && event.a == 2
            && (event.tx, event.ty) == (world.map.oil_home.0 as i16, world.map.oil_home.1 as i16)
    }));

    oil_well(&mut world);
    world.step();
    assert_eq!(world.era, 2, "the chemical plant is also required");
    let (fx, fy) = anchor(&world, b::B_FUEL);
    world.place_now(b::B_FUEL, fx, fy, true);
    world.step();
    assert_eq!(world.era, 3);
    assert!(world.query_place(b::B_PAD, fx, fy).reason != REASON_ERA);
}

#[test]
fn destroyed_train_loses_cargo_and_rebuilds_after_cooldown() {
    let mut world = world_t2();
    let home = oil_well(&mut world);
    world
        .buildings
        .retain(|b| b.kind == b::B_HQ || b.kind == b::B_OIL_WELL);
    world.step();
    let old_id = train(&world).id;
    train_mut(&mut world).cargo = 20;
    train_mut(&mut world).hp = 0;
    world.res.alloy = 1_000;
    world.step();
    assert!(world.units.iter().all(|unit| unit.id != old_id));
    assert_eq!(world.res.oil, 0, "destroyed cargo must not be refunded");
    assert!(world
        .events
        .iter()
        .any(|event| event.kind == oc_protocol::EVENT_FREIGHT && event.a == 20));
    let charge = world
        .buildings
        .iter()
        .find(|b| b.id == home)
        .unwrap()
        .charge;
    assert!(charge > 0, "replacement has a real cooldown");

    ticks(&mut world, u32::from(balance::TRAIN_REBUILD_MS) / 33 + 20);
    assert_ne!(train(&world).id, old_id);
    assert_eq!(train(&world).cargo, 0);
    assert_eq!(world.res.alloy, 1_000 - balance::TRAIN_REBUILD_ALLOY);
}

fn train_mut(world: &mut World) -> &mut oc_sim::state::Unit {
    world
        .units
        .iter_mut()
        .find(|unit| unit.kind == units::U_FREIGHT_TRAIN && unit.hp > 0)
        .expect("a live freight train")
}

#[test]
fn raiders_can_attack_a_nearby_train() {
    let mut world = world_t2();
    oil_well(&mut world);
    world.step();
    let index = world
        .units
        .iter()
        .position(|unit| unit.kind == units::U_FREIGHT_TRAIN)
        .unwrap();
    let (x, y) = (world.units[index].x + 6 * FP, world.units[index].y);
    world.units[index].x = x;
    world.units[index].y = y;
    let hp = world.units[index].hp;
    let id = world.alloc_id();
    let def = World::unit_def(units::U_RAIDER);
    world.units.push(oc_sim::state::Unit {
        id,
        kind: units::U_RAIDER,
        x,
        y,
        z: 0,
        gx: 0,
        gy: 0,
        hp: def.hp,
        hp_max: def.hp,
        state: UNIT_STATE_MOVE,
        facing: 0,
        owner: 1,
        target: 0,
        cooldown: 0,
        home: 0,
        cargo: 0,
    });
    world.step();
    assert!(train(&world).hp < hp, "the raider must damage the train");
}

#[test]
fn freight_movement_wraps_instead_of_crossing_the_whole_planet() {
    let mut x = (grid::MAP_W - 1) * FP;
    let mut y = FP;
    assert!(!step_torus(&mut x, &mut y, FP, FP, FP));
    assert_eq!(x, 0, "the short path crosses the seam, not the whole map");
    assert!(step_torus(&mut x, &mut y, FP, FP, FP));
    assert_eq!(x, FP);
}

#[test]
fn simultaneous_rebuilds_cannot_overspend_shared_alloy() {
    let mut world = world_t2();
    oil_well(&mut world);
    let (tx, ty) = (world.map.oil_home.0 + 2, world.map.oil_home.1);
    assert!(world.query_place(b::B_OIL_WELL, tx, ty).ok);
    world.place_now(b::B_OIL_WELL, tx, ty, true);
    world
        .buildings
        .retain(|b| b.kind == b::B_HQ || b.kind == b::B_OIL_WELL);
    world.step();
    let trains = |world: &World| {
        world
            .units
            .iter()
            .filter(|u| u.kind == units::U_FREIGHT_TRAIN && u.hp > 0)
            .count()
    };
    assert_eq!(trains(&world), 2);
    for unit in world
        .units
        .iter_mut()
        .filter(|u| u.kind == units::U_FREIGHT_TRAIN)
    {
        unit.cargo = 10;
        unit.hp = 0;
    }
    world.res.alloy = balance::TRAIN_REBUILD_ALLOY;
    world.step();
    ticks(&mut world, u32::from(balance::TRAIN_REBUILD_MS) / 33 + 20);
    assert_eq!(
        trains(&world),
        1,
        "only one affordable replacement may spawn"
    );
    assert_eq!(world.res.alloy, 0);
    ticks(&mut world, 40);
    assert_eq!(
        trains(&world),
        1,
        "the second well must wait for real alloy"
    );
    assert_eq!(world.res.alloy, 0);
}
