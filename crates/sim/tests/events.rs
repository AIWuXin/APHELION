//! Snapshot events cover the whole host step, including commands and every
//! accelerated sub-tick, and are cleared before the following step.

mod common;

use oc_content::{balance, buildings as b};
use oc_protocol::{Command, Snapshot, EVENT_BUILD_DONE, EVENT_RAID};
use oc_sim::{World, TICK_MS};

fn snapshot(world: &World) -> Snapshot {
    postcard::from_bytes(world.snapshot_bytes()).expect("decode snapshot")
}

fn legal_anchor(world: &World, kind: u8) -> (u16, u16) {
    for (tx, ty) in common::tiles(world) {
        if world.query_place(kind, tx, ty).ok {
            return (tx as u16, ty as u16);
        }
    }
    panic!("no legal anchor for building {kind}");
}

#[test]
fn command_events_reach_the_snapshot() {
    let mut world = World::new(common::SEED);
    world.policy.sandbox_flags = 3;
    let (tx, ty) = legal_anchor(&world, b::B_SOLAR);
    world.push(Command::Place {
        kind: b::B_SOLAR,
        tx,
        ty,
    });
    world.step();
    assert!(
        snapshot(&world)
            .events
            .iter()
            .any(|event| event.kind == EVENT_BUILD_DONE),
        "instant construction emitted before the tick must remain visible"
    );
}

#[test]
fn accelerated_step_keeps_subtick_events_and_clears_the_next_step() {
    let mut world = World::new(common::SEED);
    world.speed = 3;
    world.fleet_eta_ms = TICK_MS;
    world.step();
    assert_eq!(world.tick, 4);
    let raids = snapshot(&world)
        .events
        .iter()
        .filter(|event| event.kind == EVENT_RAID)
        .count();
    assert_eq!(
        raids,
        usize::from(balance::DROPS_BASE),
        "both first-sub-tick raid squads must reach the 4x snapshot"
    );

    world.step();
    assert!(
        snapshot(&world)
            .events
            .iter()
            .all(|event| event.kind != EVENT_RAID),
        "the following host step must not replay the previous step's events"
    );
}
