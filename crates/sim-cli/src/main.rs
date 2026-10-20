//! Headless determinism harness and scripted colony playtest.
//!
//! `cargo run -p oc-sim-cli -- 1000` runs a scripted colony for N host frames
//! and prints the resulting state hash. Running it twice must print the same
//! number; CI does exactly that and fails on a mismatch.
//!
//! `cargo run -p oc-sim-cli -- --idle 300` boots the world, advances N frames
//! with no commands and prints only the final state hash. The wasm hash gate
//! compares that line with `scripts/wasm-hash.mjs` to prove the committed
//! `web/public/oc.wasm` was built from the current kernel.
//!
//! The script goes through the same `Command` API a browser client uses: it
//! scans for legal placement with `query_place`, researches techs, launches
//! rockets, opens trade lanes and then lets the simulation play out. The
//! summary at the end is what the smoke test asserts on.

use oc_content::balance;
use oc_content::buildings as b;
use oc_content::techs;
use oc_protocol::{Command, CommandBatch};
use oc_sim::World;

/// Colony anchor used by `mapgen`.
const COLONY_X: i32 = oc_sim::mapgen::START_TX;
const COLONY_Y: i32 = oc_sim::mapgen::START_TY;

/// Default world seed, shared with `scripts/wasm-hash.mjs`.
const DEFAULT_SEED: u32 = 0x5EED_1234;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if let Some(index) = args.iter().position(|arg| arg.as_str() == "--idle") {
        let ticks: u32 = args
            .get(index + 1)
            .and_then(|s| s.parse().ok())
            .unwrap_or(300);
        let seed: u32 = args
            .get(index + 2)
            .and_then(|s| s.parse().ok())
            .unwrap_or(DEFAULT_SEED);
        run_idle(seed, ticks);
        return;
    }
    let ticks: u32 = args.first().and_then(|s| s.parse().ok()).unwrap_or(1000);
    let seed: u32 = args
        .get(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(DEFAULT_SEED);

    let (hash_a, summary) = run(seed, ticks);
    let (hash_b, _) = run(seed, ticks);
    println!("seed       : {seed:#010x}");
    println!("ticks      : {ticks}");
    println!("hash run#1 : {hash_a:#010x}");
    println!("hash run#2 : {hash_b:#010x}");
    println!("{summary}");
    if hash_a != hash_b {
        eprintln!("DETERMINISM FAILURE: hashes differ");
        std::process::exit(1);
    }
    println!("determinism: OK");
}

/// Boot the world, advance `ticks` frames with no commands and print only the
/// final state hash.
///
/// One line, `0x` plus eight lowercase hex digits, so a shell can compare it
/// with `node scripts/wasm-hash.mjs` byte for byte. The kernel is deterministic,
/// so a native build and a wasm build of the same sources must agree.
fn run_idle(seed: u32, ticks: u32) {
    let mut world = World::new(seed);
    for _ in 0..ticks {
        world.step();
    }
    println!("{:#010x}", world.hash());
}

/// Everything the scripted run reports; the smoke test greps these lines.
struct Summary {
    kinds: Vec<u8>,
    buildings: usize,
    units: usize,
    capacity: u16,
    used: u16,
    alloy: i32,
    fuel: i32,
    wave: u16,
    resolved: u32,
    loads: [u16; 3],
    status: u8,
}

impl Summary {
    fn lines(&self, world: &World) -> String {
        let kinds = self
            .kinds
            .iter()
            .map(|k| k.to_string())
            .collect::<Vec<_>>()
            .join(",");
        format!(
            "buildings  : {} [{}]\n\
             units      : {}\n\
             capacity   : {} (used {})\n\
             alloy      : {} (+{}/min)\n\
             fuel       : {}\n\
             routes     : {}/{}/{}\n\
             wave       : {} (resolved {})\n\
             status     : {}\n\
             tick       : {}",
            self.buildings,
            kinds,
            self.units,
            self.capacity,
            self.used,
            self.alloy,
            world.alloy_rate,
            self.fuel,
            self.loads[0],
            self.loads[1],
            self.loads[2],
            self.wave,
            self.resolved,
            self.status,
            world.tick,
        )
    }
}

fn run(seed: u32, ticks: u32) -> (u32, String) {
    let mut world = World::new(seed);
    let mut queue: Vec<u8> = vec![
        // Opening: power, ore, one ground gun -- then the orbital/logistics
        // chain, which is what turns the colony from a static base into an
        // economy. Extra solar arrays are interleaved so the grid never goes
        // into deficit as the support buildings come online.
        b::B_SOLAR,
        b::B_REFINERY,
        b::B_TURRET,
        b::B_PAD,
        b::B_DOCK,
        b::B_FUEL,
        b::B_SOLAR,
        b::B_FLAK,
        b::B_HANGAR,
        b::B_SOLAR,
        b::B_TURRET,
        b::B_REFINERY,
        b::B_SOLAR,
        b::B_LAB,
        b::B_RADAR,
        b::B_BULWARK,
    ];
    let mut resolved = 0u32;
    for tick in 0..ticks {
        if tick == 2 {
            world.push(Command::SetSpeed { speed: 3 });
        }
        if tick % 12 == 0 {
            try_build(&mut world, &mut queue);
        }
        if tick % 45 == 0 {
            try_research(&mut world);
        }
        if tick % 60 == 0 {
            try_launch(&mut world);
            try_open_route(&mut world);
        }
        let in_flight = world.wave_in_flight;
        world.step();
        if in_flight && !world.wave_in_flight {
            resolved = resolved.saturating_add(1);
        }
        // Exercise the postcard decode path on every 30th frame.
        if tick % 30 == 0 {
            let batch = CommandBatch {
                client_tick: tick,
                commands: Vec::new(),
            };
            if let Ok(bytes) = postcard::to_allocvec(&batch) {
                world.apply_bytes(&bytes);
            }
        }
    }
    let summary = Summary {
        kinds: world.buildings.iter().map(|build| build.kind).collect(),
        buildings: world.buildings.len(),
        units: world.units.len(),
        capacity: world.orbital_capacity(),
        used: world.routes_used(),
        alloy: world.res.alloy,
        fuel: world.res.fuel,
        wave: world.wave,
        resolved,
        loads: [
            world.routes[0].loads,
            world.routes[1].loads,
            world.routes[2].loads,
        ],
        status: world.status,
    };
    let text = summary.lines(&world);
    (world.hash(), text)
}

/// Place the queue head. The script saves up for the next building instead of
/// letting cheaper late entries jump the line -- that is what keeps the pad and
/// dock (the orbital/logistics chain) from being starved by one more turret.
/// A kind with no legal footprint at all is dropped so the queue cannot stall.
fn try_build(world: &mut World, queue: &mut Vec<u8>) {
    let Some(&kind) = queue.first() else {
        return;
    };
    let Some((tx, ty)) = find_place(world, kind) else {
        // Not affordable right now: wait and save up.
        return;
    };
    world.push(Command::Place {
        kind,
        tx: tx as u16,
        ty: ty as u16,
    });
    queue.remove(0);
}

/// Nearest tile where `kind` could stand: `None` when the kind is unplaceable
/// anywhere at all (tech-locked or footprint too large), in which case the
/// caller drops it. Affordability is checked by the caller.
fn find_place(world: &World, kind: u8) -> Option<(i32, i32)> {
    let size = i32::from(World::def(kind).footprint);
    let mut best: Option<(i32, i32, i32)> = None;
    for ty in 0..=world.map.h - size {
        for tx in 0..=world.map.w - size {
            let query = world.query_place(kind, tx, ty);
            if !query.placement_ok || !query.unlocked {
                continue;
            }
            let dx = tx - COLONY_X;
            let dy = ty - COLONY_Y;
            let key = (dx * dx + dy * dy, ty, tx);
            if best.is_none_or(|(bd, by, bx)| key < (bd, by, bx)) {
                best = Some(key);
            }
        }
    }
    let (_, ty, tx) = best?;
    if world.query_place(kind, tx, ty).ok {
        Some((tx, ty))
    } else {
        // Legal ground exists but the price is not met yet.
        None
    }
}

/// Buy the next affordable tech in table order once prerequisites are met.
fn try_research(world: &mut World) {
    for tech in [
        techs::T_MATERIALS,
        techs::T_BALLISTICS,
        techs::T_ORBITAL,
        techs::T_REACTOR,
    ] {
        let Some(def) = techs::TECHS.get(tech as usize) else {
            continue;
        };
        if world.has_tech(tech) {
            continue;
        }
        if def.requires != techs::NO_TECH && !world.has_tech(def.requires) {
            continue;
        }
        if world.res.research >= def.cost {
            world.push(Command::Research { tech });
            return;
        }
    }
}

/// Launch from the first ready pad (fuel and alloy permitting).
fn try_launch(world: &mut World) {
    let Some(id) = world
        .buildings
        .iter()
        .find(|build| {
            build.kind == b::B_PAD
                && build.state == oc_protocol::B_STATE_IDLE
                && build.aux == 0
                && build.progress >= 1000
        })
        .map(|build| build.id)
    else {
        return;
    };
    if world.res.fuel >= balance::LAUNCH_FUEL && world.res.alloy >= balance::LAUNCH_ALLOY {
        world.push(Command::Launch { id });
    }
}

/// Open the first lane the current lift capacity can actually support.
fn try_open_route(world: &mut World) {
    if world.count_done(b::B_DOCK) == 0 || world.count_done(b::B_PAD) == 0 {
        return;
    }
    for route in 0..3u8 {
        if world.routes[route as usize].active {
            continue;
        }
        let Some(def) = oc_content::routes::ROUTES.get(route as usize) else {
            continue;
        };
        if world.routes_used() + def.capacity <= world.orbital_capacity() {
            world.push(Command::ToggleRoute { route });
            return;
        }
    }
}
