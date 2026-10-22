//! Economy: power balance, refinery income, the no-power stall and repairs.

mod common;

use oc_content::buildings as b;
use oc_sim::{World, TICK_MS};

const SEED: u32 = 0x5EED_1234;
/// One simulated minute at 30 Hz.
const MINUTE_TICKS: u32 = 1_800;

fn new_world() -> World {
    World::new(SEED)
}

/// First live deposit footprint where a refinery could stand.
fn deposit_2x2(world: &World) -> (i32, i32) {
    for (tx, ty) in common::tiles(world) {
        if world.map.footprint_deposit(tx, ty, 2) > 0
            && world.query_place(b::B_REFINERY, tx, ty).placement_ok
        {
            return (tx, ty);
        }
    }
    panic!("no deposit footprint near the colony");
}

#[test]
fn hq_and_solar_cover_the_colony_power_demand() {
    let mut world = new_world();
    world.step();
    assert!(world.energy_out > 0, "the command hub must generate power");
    assert!(
        world.energy_out >= world.energy_in,
        "HQ + solar ({}) should cover the seeded refinery demand ({})",
        world.energy_out,
        world.energy_in
    );
    let solar = world
        .buildings
        .iter()
        .find(|x| x.kind == b::B_SOLAR)
        .expect("seeded solar array");
    assert_ne!(solar.flags & 1, 0, "powered flag is set");
}

#[test]
fn starting_colony_has_a_refinery_on_a_deposit() {
    let world = new_world();
    let refinery = world
        .buildings
        .iter()
        .find(|x| x.kind == b::B_REFINERY)
        .expect("the opening colony must ship a refinery");
    assert!(
        world.map.footprint_deposit(refinery.tx, refinery.ty, 2) > 0,
        "the seeded refinery must sit on a deposit or the opening has no income"
    );
}

#[test]
fn refinery_on_a_deposit_raises_alloy_over_a_minute() {
    let mut world = new_world();
    let (tx, ty) = deposit_2x2(&world);
    world.place_now(b::B_REFINERY, tx, ty, true);
    let refinery = world.buildings.last().expect("refinery").id;
    let start = world.res.alloy;
    for _ in 0..MINUTE_TICKS {
        world.step();
    }
    assert!(world.alloy_rate > 0, "refinery should report a rate");
    assert!(
        world.res.alloy > start + 20,
        "one minute on a deposit should pay for itself: {} -> {}",
        start,
        world.res.alloy
    );
    let refinery = world
        .buildings
        .iter()
        .find(|x| x.id == refinery)
        .expect("refinery still standing");
    assert_ne!(refinery.flags & 2, 0, "deposit flag is set");
    assert_eq!(refinery.state, oc_protocol::B_STATE_WORKING);
}

#[test]
fn refinery_without_power_produces_nothing() {
    let mut world = new_world();
    // Drop the solar array, then overload the grid with refineries so demand
    // exceeds the command hub alone.
    world.buildings.retain(|x| x.kind == b::B_HQ);
    let (tx, ty) = deposit_2x2(&world);
    for _ in 0..6 {
        world.place_now(b::B_REFINERY, tx, ty, true);
    }
    world.step();
    assert!(
        world.energy_in > world.energy_out,
        "test setup must create a power deficit"
    );
    let start = world.res.alloy;
    for _ in 0..MINUTE_TICKS {
        world.step();
    }
    assert_eq!(
        world.res.alloy, start,
        "unpowered refineries must not produce alloy"
    );
    assert_eq!(world.alloy_rate, 0);
}

#[test]
fn repair_bay_heals_a_damaged_building() {
    let mut world = new_world();
    // Place the repair bay and its patient far from the seeded colony.
    world.place_now(b::B_REPAIR, 3, 3, true);
    let solar = world.place_now(b::B_SOLAR, 5, 3, true);
    let index = world
        .buildings
        .iter()
        .position(|x| x.id == solar)
        .expect("solar");
    world.buildings[index].hp = 40;
    for _ in 0..(2 * TICK_MS) {
        world.step();
    }
    let hp = world.buildings[index].hp;
    assert!(
        hp > 40,
        "repair bay should heal nearby damage, hp stayed at {hp}"
    );
    assert!(hp <= world.buildings[index].hp_max);
}

/// Refinery rate with and without the materials tech, same seed and same site.
fn refinery_rate(techs: u32) -> i32 {
    let mut world = new_world();
    world.techs = techs;
    let (tx, ty) = deposit_2x2(&world);
    world.place_now(b::B_REFINERY, tx, ty, true);
    world.step();
    world.alloy_rate
}

#[test]
fn materials_tech_boosts_refinery_output_by_25_percent() {
    let base = refinery_rate(0);
    let boosted = refinery_rate(1 << (oc_content::techs::T_MATERIALS & 31));
    assert!(base > 0 && boosted > base);
    // +25% with integer truncation: within one unit of the exact ratio.
    assert!(
        (boosted - base * 5 / 4).abs() <= 1,
        "materials tech should add 25%: {base} -> {boosted}"
    );
}

#[test]
fn reactor_tech_adds_twelve_hub_energy() {
    let mut base = new_world();
    base.step();
    let mut tech = new_world();
    tech.techs = 1 << (oc_content::techs::T_REACTOR & 31);
    tech.step();
    assert_eq!(tech.energy_out, base.energy_out + 12);
}
