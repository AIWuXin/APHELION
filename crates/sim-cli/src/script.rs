//! Scripted colony playtest: the workload the determinism gate and the tick
//! throughput benchmark both run.
//!
//! The script goes through the same `Command` API a browser client uses: it
//! scans for legal placement with `query_place`, researches techs, launches
//! rockets, opens trade lanes and then lets the simulation play out. The
//! summary at the end is what the smoke test asserts on.

use oc_content::balance;
use oc_content::buildings as b;
use oc_content::techs;
use oc_content::terrain::T_COUNT;
use oc_protocol::{Command, CommandBatch};
use oc_sim::World;

/// Radius of the local window the scripted colony scans for build sites.
///
/// The planet is 10240x10240: an exhaustive scan is 100 million `query_place`
/// calls per build attempt. The script only ever builds around its colony, so a
/// 65x65 window around the home tile is both sufficient and fast.
const PLACE_SCAN_RADIUS: i32 = 32;

/// Run the scripted colony for `ticks` host frames and report its hash and the
/// human-readable summary the smoke test greps.
pub fn run(seed: u32, ticks: u32) -> (u32, String) {
    let (world, resolved) = play(seed, ticks);
    let summary = Summary {
        kinds: world.buildings.iter().map(|build| build.kind).collect(),
        buildings: world.buildings.len(),
        units: world.units.len(),
        capacity: world.orbital_capacity(),
        used: world.routes_used(),
        alloy: world.res.alloy,
        fuel: world.res.fuel,
        coal: world.res.coal,
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

/// Drive the scripted colony and hand the live world back, so a caller can
/// measure something about the state it produced (the bench encodes snapshots
/// of a populated world, not of an empty one).
pub fn play(seed: u32, ticks: u32) -> (World, u32) {
    let mut world = World::new(seed);
    // The scripted colony predates the tier gate; it exercises every building
    // the game has, so put the world at the last era instead of teaching the
    // script the whole campaign progression.
    world.set_era(4);
    let mut queue: Vec<u8> = vec![
        // Opening: power, ore, one ground gun -- then the orbital/logistics
        // chain, which is what turns the colony from a static base into an
        // economy. The T1 coal loop follows right after: a solar array is only a
        // trickle now, so a thermal plant takes over the base load. The extra
        // solar arrays keep the grid afloat until the first plant is burning.
        b::B_SOLAR,
        b::B_REFINERY,
        b::B_TURRET,
        b::B_PAD,
        b::B_DOCK,
        b::B_FUEL,
        b::B_SOLAR,
        b::B_COAL_MINE,
        b::B_COAL_PLANT,
        b::B_FLAK,
        b::B_TURRET,
        b::B_HANGAR,
        b::B_SOLAR,
        b::B_REFINERY,
        b::B_COAL_PLANT,
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
    (world, resolved)
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
    coal: i32,
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
        let (sx, sy) = world.map.start;
        format!(
            "planet     : {}x{} torus, {}x{} chunks\n\
             start      : ({}, {})\n\
             biome      : {}\n\
             buildings  : {} [{}]\n\
             units      : {}\n\
             capacity   : {} (used {})\n\
             alloy      : {} (+{}/min)\n\
             fuel       : {}\n\
             coal       : {} (+{}/min)\n\
             routes     : {}/{}/{}\n\
             wave       : {} (resolved {})\n\
             status     : {}\n\
             tick       : {}",
            world.map.w,
            world.map.h,
            oc_iso::torus::CHUNKS,
            oc_iso::torus::CHUNKS,
            sx,
            sy,
            biome_sample(world),
            self.buildings,
            kinds,
            self.units,
            self.capacity,
            self.used,
            self.alloy,
            world.alloy_rate,
            self.fuel,
            self.coal,
            world.coal_rate,
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

/// Coarse biome census around the colony (top three materials, in permille).
///
/// It is a sample, not a full census: the planet is too big to walk, and the
/// point is to see at a glance which climate bands landed next to the colony.
fn biome_sample(world: &World) -> String {
    const RADIUS: i32 = 32;
    const STEP: i32 = 4;
    let mut counts = [0u32; T_COUNT as usize];
    let mut total = 0u32;
    let (sx, sy) = world.map.start;
    let mut dy = -RADIUS;
    while dy <= RADIUS {
        let mut dx = -RADIUS;
        while dx <= RADIUS {
            let material = world.map.material_at(sx + dx, sy + dy) as usize;
            if let Some(slot) = counts.get_mut(material) {
                *slot += 1;
            }
            total += 1;
            dx += STEP;
        }
        dy += STEP;
    }
    let mut order: Vec<usize> = (0..counts.len()).collect();
    order.sort_by_key(|&i| std::cmp::Reverse(counts[i]));
    let total = total.max(1);
    order
        .iter()
        .take(3)
        .filter(|&&i| counts[i] > 0)
        .map(|&i| {
            format!(
                "{} {}‰",
                oc_content::terrain::terrain_name(i as u8),
                counts[i] * 1000 / total
            )
        })
        .collect::<Vec<_>>()
        .join(" · ")
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

/// Nearest tile where `kind` could stand, searched around the colony: `None`
/// when the kind is unplaceable nearby at all (tech-locked, footprint too large
/// or no legal ground), in which case the caller drops it. Affordability is
/// checked by the caller.
///
/// Most kinds are ranked by distance to the colony. A coal extractor is ranked
/// by seam richness first: the guaranteed seam can be a few tiles further than
/// a thin random cluster, and a starved thermal plant would brick the scripted
/// economy for the rest of the run.
fn find_place(world: &World, kind: u8) -> Option<(i32, i32)> {
    let size = i32::from(World::def(kind).footprint);
    let (cx, cy) = world.map.start;
    let mut best: Option<(i64, i64, i32, i32)> = None;
    for dy in -PLACE_SCAN_RADIUS..=PLACE_SCAN_RADIUS {
        for dx in -PLACE_SCAN_RADIUS..=PLACE_SCAN_RADIUS {
            let tx = oc_iso::torus::wrap_x(cx + dx);
            let ty = oc_iso::torus::wrap_y(cy + dy);
            let query = world.query_place(kind, tx, ty);
            if !query.placement_ok || !query.unlocked {
                continue;
            }
            let rank = if kind == b::B_COAL_MINE {
                -i64::from(world.map.footprint_coal(tx, ty, size))
            } else {
                0
            };
            let key = (rank, i64::from(dx * dx + dy * dy), ty, tx);
            if best.is_none_or(|b| key < b) {
                best = Some(key);
            }
        }
    }
    let (_, _, ty, tx) = best?;
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
