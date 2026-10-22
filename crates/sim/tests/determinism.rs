//! Determinism: same seed + same command sequence -> same state hash.
//!
//! Two independent worlds are driven in lockstep: one receives commands through
//! `push`, the other only through postcard-encoded `CommandBatch` blobs via
//! `apply_bytes` (the exact path the wasm bridge uses). Any hidden ordering or
//! encoding dependence shows up as a hash mismatch.

mod common;

use oc_content::buildings as b;
use oc_protocol::{Command, CommandBatch};
use oc_sim::World;

const SEED: u32 = 0x5EED_1234;
const TICKS: u32 = 2000;

/// Find the nearest legal anchor for `kind` around the colony (deterministic).
///
/// The planet is 100 million tiles, so the script searches the same local window
/// the scripted CLI uses instead of walking the whole map.
fn anchor(probe: &World, kind: u8) -> (u16, u16) {
    let mut sample = None;
    for (tx, ty) in common::tiles(probe) {
        let q = probe.query_place(kind, tx, ty);
        if sample.is_none() {
            sample = Some(q);
        }
        if q.ok {
            return (tx as u16, ty as u16);
        }
    }
    panic!("no legal anchor for building {kind}: sample={sample:?}");
}

/// Build the command schedule. Placement tiles are discovered on a probe world
/// first so every `Place` in the script is legal in both replay worlds.
fn script() -> Vec<(u32, Command)> {
    let mut probe = World::new(SEED);
    probe.speed = 0; // apply commands without advancing the simulation
    probe.set_era(3); // the script builds the whole table, tiers included
    probe.policy.sandbox_flags = 1; // same infinite-resource flag the script sets
    let mut script: Vec<(u32, Command)> = Vec::new();
    script.push((0, Command::SetSandbox { flags: 1 }));
    script.push((
        1,
        Command::SetAi {
            phase: 2,
            strength: 2,
        },
    ));
    script.push((2, Command::SetSpeed { speed: 3 }));
    let order = [
        b::B_SOLAR,
        b::B_REFINERY,
        b::B_TURRET,
        b::B_FLAK,
        b::B_PAD,
        b::B_DOCK,
        b::B_FUEL,
        b::B_HANGAR,
        b::B_RADAR,
    ];
    for (i, kind) in order.iter().copied().enumerate() {
        // Discover the tile on the probe, then reserve it there too.
        let (tx, ty) = anchor(&probe, kind);
        script.push((5 + i as u32 * 4, Command::Place { kind, tx, ty }));
        probe.push(Command::Place { kind, tx, ty });
        probe.step();
    }
    let pad_id = probe
        .buildings
        .iter()
        .find(|x| x.kind == b::B_PAD)
        .map_or(0, |x| x.id);
    // Research the full tree (sandbox infinite resources makes it free).
    for (i, tech) in [0u8, 1, 2, 3].into_iter().enumerate() {
        script.push((60 + i as u32 * 3, Command::Research { tech }));
    }
    probe.techs = 0xF;
    let mut bulwark_id = 0;
    for (i, kind) in [b::B_RELAY, b::B_REPAIR, b::B_BULWARK]
        .into_iter()
        .enumerate()
    {
        let (tx, ty) = anchor(&probe, kind);
        script.push((80 + i as u32 * 3, Command::Place { kind, tx, ty }));
        probe.push(Command::Place { kind, tx, ty });
        probe.step();
        if kind == b::B_BULWARK {
            bulwark_id = probe.buildings.last().map_or(0, |x| x.id);
        }
    }
    // Rockets, lanes, a demolition and pause/speed churn.
    script.push((150, Command::Launch { id: pad_id }));
    script.push((400, Command::Launch { id: pad_id }));
    script.push((500, Command::Pause { paused: true }));
    script.push((502, Command::Pause { paused: false }));
    script.push((520, Command::SetSpeed { speed: 2 }));
    script.push((700, Command::Demolish { id: bulwark_id }));
    script.push((750, Command::ToggleRoute { route: 0 }));
    script.push((800, Command::Launch { id: pad_id }));
    script.push((900, Command::ToggleRoute { route: 1 }));
    script.push((1100, Command::ToggleRoute { route: 2 }));
    script
}

#[test]
fn push_and_apply_bytes_produce_the_same_hash() {
    let script = script();
    let mut world_a = World::new(SEED);
    let mut world_b = World::new(SEED);
    world_a.set_era(3);
    world_b.set_era(3);
    let mut next = 0usize;
    for tick in 0..TICKS {
        let start = next;
        while next < script.len() && script[next].0 <= tick {
            next += 1;
        }
        let due: Vec<Command> = script[start..next].iter().map(|(_, c)| c.clone()).collect();
        for command in &due {
            world_a.push(command.clone());
        }
        let batch = CommandBatch {
            client_tick: tick,
            commands: due,
        };
        let bytes = postcard::to_allocvec(&batch).expect("encode batch");
        world_b.apply_bytes(&bytes);
        world_a.step();
        world_b.step();
        assert_eq!(
            world_a.hash(),
            world_b.hash(),
            "state hash diverged at host tick {tick}"
        );
    }
    assert_ne!(world_a.hash(), 0);
    assert_eq!(world_a.tick, world_b.tick);
    assert_eq!(world_a.buildings.len(), world_b.buildings.len());
    assert_eq!(world_a.units.len(), world_b.units.len());
    assert_eq!(world_a.ships.len(), world_b.ships.len());
    assert_eq!(world_a.wave, world_b.wave);
}

#[test]
fn different_seeds_diverge() {
    let mut a = World::new(1);
    let mut b = World::new(2);
    for _ in 0..100 {
        a.step();
        b.step();
    }
    assert_ne!(a.hash(), b.hash());
}
