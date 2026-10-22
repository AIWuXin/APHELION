//! Orbital lift: rockets raise capacity, relay masts add lift, lanes spend it.

mod common;

use oc_content::balance;
use oc_content::buildings as b;
use oc_content::routes::ROUTES;
use oc_content::techs;
use oc_content::units;
use oc_protocol::Command;
use oc_sim::{World, TICK_MS};

const SEED: u32 = 0x5EED_1234;

fn new_world() -> World {
    World::new(SEED)
}

/// First legal 2x2 anchor for a pad or dock.
fn free_2x2(world: &World) -> (i32, i32) {
    for (tx, ty) in common::tiles(world) {
        if world.query_place(b::B_SOLAR, tx, ty).placement_ok {
            return (tx, ty);
        }
    }
    panic!("no free 2x2 anchor");
}

fn place_done(world: &mut World, kind: u8) -> u32 {
    let (tx, ty) = free_2x2(world);
    world.place_now(kind, tx, ty, true)
}

/// Step until the condition holds or `limit` ticks have passed.
fn step_until(world: &mut World, limit: u32, mut done: impl FnMut(&World) -> bool) -> bool {
    for _ in 0..limit {
        if done(world) {
            return true;
        }
        world.step();
    }
    done(world)
}

#[test]
fn launch_raises_capacity_after_ascent() {
    let mut world = new_world();
    let pad = place_done(&mut world, b::B_PAD);
    world.res.fuel = 500;
    let start = world.capacity;
    world.push(Command::Launch { id: pad });
    let limit = balance::LAUNCH_ASCENT_MS / TICK_MS + 40;
    assert!(
        step_until(&mut world, limit, |w| w.capacity > start),
        "rocket never reached orbit within {limit} ticks"
    );
    assert_eq!(world.capacity, start + balance::LAUNCH_CAPACITY);
    assert_eq!(world.orbital_capacity(), world.capacity);
}

#[test]
fn orbital_engineering_adds_lift_per_rocket_and_relay_lift() {
    let mut world = new_world();
    world.techs = 1 << (techs::T_ORBITAL & 31);
    let pad = place_done(&mut world, b::B_PAD);
    world.res.fuel = 500;
    world.push(Command::Launch { id: pad });
    let limit = balance::LAUNCH_ASCENT_MS / TICK_MS + 40;
    assert!(step_until(&mut world, limit, |w| w.capacity > 0));
    assert_eq!(
        world.capacity,
        balance::LAUNCH_CAPACITY + balance::LAUNCH_ORBITAL_BONUS
    );
    // Relay masts add their table capacity on top of the rockets.
    let lift_before = world.orbital_capacity();
    place_done(&mut world, b::B_RELAY);
    assert_eq!(
        world.orbital_capacity(),
        lift_before + u16::try_from(World::def(b::B_RELAY).capacity).unwrap()
    );
}

#[test]
fn lanes_need_a_dock_a_pad_and_spare_capacity() {
    let mut world = new_world();
    world.speed = 0; // commands apply instantly, every tick counts
    world.capacity = 3; // pretend one rocket is already in orbit
    world.push(Command::ToggleRoute { route: 0 });
    world.step();
    assert!(!world.routes[0].active, "no dock/pad -> lane stays closed");

    place_done(&mut world, b::B_DOCK);
    world.push(Command::ToggleRoute { route: 0 });
    world.step();
    assert!(!world.routes[0].active, "lane needs a launch pad too");

    place_done(&mut world, b::B_PAD);
    world.push(Command::ToggleRoute { route: 0 });
    world.step();
    assert!(world.routes[0].active, "dock + pad + lift -> lane opens");
    assert_eq!(world.routes_used(), 2);

    // The second lane needs 3 more capacity than is left.
    world.push(Command::ToggleRoute { route: 1 });
    world.step();
    assert!(!world.routes[1].active, "capacity is short -> refused");

    // A relay mast adds lift and makes the lane fit.
    place_done(&mut world, b::B_RELAY);
    assert_eq!(world.orbital_capacity(), 5);
    world.push(Command::ToggleRoute { route: 1 });
    world.step();
    assert!(world.routes[1].active);
    assert_eq!(world.routes_used(), 5);
    assert_eq!(world.orbital_capacity(), world.routes_used());
}

#[test]
fn lane_throughput_reflects_capacity() {
    let mut world = new_world();
    world.capacity = 2; // enough for the first lane, not for a second
    place_done(&mut world, b::B_DOCK);
    place_done(&mut world, b::B_PAD);
    world.push(Command::ToggleRoute { route: 0 });
    world.step();
    for _ in 0..90 {
        world.step();
    }
    assert_eq!(world.routes[0].grade, 1000, "lane 0 gets all its lift");
    assert!(world.routes[0].throughput > 0);
    assert_eq!(world.routes[1].grade, 0, "closed lane reports no grade");
}

#[test]
fn lanes_deliver_cargo_and_fly_haulers() {
    let mut world = new_world();
    let pad = place_done(&mut world, b::B_PAD);
    let dock = place_done(&mut world, b::B_DOCK);
    // Keep only the lane infrastructure: then alloy changes only because of
    // route deliveries, so the income assertion is exact.
    world
        .buildings
        .retain(|x| x.kind == b::B_HQ || x.id == pad || x.id == dock);
    world.capacity = 2;
    world.push(Command::ToggleRoute { route: 0 });
    world.step();
    assert!(world.routes[0].active);
    let start = world.res.alloy;
    let mut delivered = false;
    for _ in 0..900 {
        world.step();
        if world.routes[0].loads > 0 {
            delivered = true;
            break;
        }
    }
    assert!(
        delivered,
        "lane should deliver a load within one 24 s round trip"
    );
    assert_eq!(world.routes[0].grade, 1000);
    let loads = i32::from(world.routes[0].loads);
    assert_eq!(
        world.res.alloy - start,
        ROUTES[0].alloy * loads,
        "route cargo is the colony's only income in this test"
    );
    assert!(
        world.ships.iter().any(|s| s.kind == units::U_HAULER),
        "a hauler craft should be flying its cargo to orbit"
    );
}
