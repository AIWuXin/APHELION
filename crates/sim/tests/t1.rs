//! T1 content: coal seams, the coal extractor/thermal plant pair and the era
//! gate on the building tiers, plus the era-1 ground-raid director.

use oc_content::balance;
use oc_content::buildings as b;
use oc_content::terrain::T_ROAD;
use oc_content::units;
use oc_iso::fixed::FP;
use oc_protocol::{Command, B_STATE_BLOCKED, B_STATE_WORKING, EVENT_RAID, REASON_ERA, REASON_LINK};
use oc_sim::{World, TICKS_PER_SEC};

const SEED: u32 = 0x5EED_1234;
/// One simulated minute at 30 Hz.
const MINUTE_TICKS: u32 = 1_800;

fn new_world() -> World {
    World::new(SEED)
}

/// First legal 2x2 anchor for a coal extractor (seam required).
fn seam_2x2(world: &World) -> (i32, i32) {
    for ty in 0..=world.map.h - 2 {
        for tx in 0..=world.map.w - 2 {
            if world.map.footprint_coal(tx, ty, 2) > 0
                && world.query_place(b::B_COAL_MINE, tx, ty).placement_ok
            {
                return (tx, ty);
            }
        }
    }
    panic!("no free coal seam footprint on the generated map");
}

/// First legal 2x2 anchor for a coal extractor at full seam strength.
fn full_seam_2x2(world: &World) -> (i32, i32) {
    for ty in 0..=world.map.h - 2 {
        for tx in 0..=world.map.w - 2 {
            if world.map.footprint_coal(tx, ty, 2) >= balance::COAL_SEAM_FULL
                && world.query_place(b::B_COAL_MINE, tx, ty).placement_ok
            {
                return (tx, ty);
            }
        }
    }
    panic!("no saturated coal seam near the colony");
}

/// First legal 2x2 anchor with no coal seam under it.
fn seamless_2x2(world: &World) -> (i32, i32) {
    for ty in 0..=world.map.h - 2 {
        for tx in 0..=world.map.w - 2 {
            if world.map.footprint_coal(tx, ty, 2) == 0 && world.query_place(b::B_SOLAR, tx, ty).ok
            {
                return (tx, ty);
            }
        }
    }
    panic!("every 2x2 anchor sits on coal");
}

fn free_2x2(world: &World) -> (i32, i32) {
    for ty in 0..=world.map.h - 2 {
        for tx in 0..=world.map.w - 2 {
            if world.query_place(b::B_SOLAR, tx, ty).placement_ok {
                return (tx, ty);
            }
        }
    }
    panic!("no free 2x2 anchor");
}

/// First free road tile (stable 1x1 test anchor).
fn tile_of(world: &World, material: u8) -> (i32, i32) {
    for ty in 0..world.map.h {
        for tx in 0..world.map.w {
            if let Some(i) = world.map.index(tx, ty) {
                if world.map.material[i] == material && world.map.occupied[i] == 0 {
                    return (tx, ty);
                }
            }
        }
    }
    panic!("no free tile of material {material}");
}

/// Step until the first wave has spawned (or fail after its ETA window).
fn spawn_first_wave(world: &mut World) {
    let limit = balance::FIRST_WAVE_S * TICKS_PER_SEC + 200;
    for _ in 0..limit {
        world.fleet_eta_ms = 0;
        world.step();
        if world.wave >= 1 {
            return;
        }
    }
    panic!("the director never spawned a first wave");
}

fn hostile_units(world: &World) -> Vec<&oc_sim::state::Unit> {
    world.units.iter().filter(|u| u.owner == 1).collect()
}

#[test]
fn coal_extractor_needs_a_seam() {
    let world = new_world();
    let (tx, ty) = seamless_2x2(&world);
    let q = world.query_place(b::B_COAL_MINE, tx, ty);
    assert!(!q.ok);
    assert!(q.affordable, "the extractor is cheap enough in the opening");
    assert_eq!(q.reason, REASON_LINK, "missing seam reads as a link error");

    let (sx, sy) = seam_2x2(&world);
    assert!(
        world.query_place(b::B_COAL_MINE, sx, sy).ok,
        "a seam anchor must accept the extractor"
    );
}

#[test]
fn coal_extractor_mines_twenty_per_minute_on_a_full_seam() {
    let mut world = new_world();
    let (tx, ty) = full_seam_2x2(&world);
    let mine = world.place_now(b::B_COAL_MINE, tx, ty, true);
    assert_eq!(world.res.coal, 0, "T1 opens with no coal stockpile");
    for _ in 0..MINUTE_TICKS {
        world.step();
    }
    assert_eq!(world.coal_rate, balance::COAL_MINE_PER_MIN);
    assert!(
        (18..=21).contains(&world.res.coal),
        "one minute on a full seam should bank ~20 coal, got {}",
        world.res.coal
    );
    let mine = world
        .buildings
        .iter()
        .find(|x| x.id == mine)
        .expect("extractor still standing");
    assert_eq!(mine.state, B_STATE_WORKING);
    assert_ne!(mine.flags & 2, 0, "seam flag is set");
}

#[test]
fn thermal_plant_burns_coal_for_forty_energy() {
    let mut world = new_world();
    world.res.coal = 60;
    world.step(); // settle the seeded grid before reading its output
                  // The seeded colony is HQ 42 + solar 6; the plant adds its 40 on top.
    let baseline = world.energy_out + 40;
    let (tx, ty) = free_2x2(&world);
    let plant = world.place_now(b::B_COAL_PLANT, tx, ty, true);
    world.step();
    assert_eq!(world.energy_out, baseline, "thermal plant output is +40");
    assert_eq!(world.coal_rate, 0, "burning is not a coal income rate");
    for _ in 0..MINUTE_TICKS {
        world.step();
    }
    assert!(
        (49..=51).contains(&world.res.coal),
        "one minute of burning should cost ~10 coal, got {}",
        world.res.coal
    );
    let plant = world
        .buildings
        .iter()
        .find(|x| x.id == plant)
        .expect("plant still standing");
    assert_eq!(plant.state, B_STATE_WORKING);
}

#[test]
fn thermal_plant_without_coal_adds_nothing() {
    let mut world = new_world();
    world.res.coal = 0;
    world.step();
    let baseline = world.energy_out;
    let (tx, ty) = free_2x2(&world);
    let plant = world.place_now(b::B_COAL_PLANT, tx, ty, true);
    world.step();
    assert_eq!(world.energy_out, baseline, "no coal, no thermal output");
    assert!(
        world.energy_in <= world.energy_out,
        "the seeded grid still covers its own demand"
    );
    let plant = world
        .buildings
        .iter()
        .find(|x| x.id == plant)
        .expect("plant still standing");
    assert_eq!(plant.state, B_STATE_BLOCKED, "a starved plant is blocked");
}

#[test]
fn era_blocks_building_tiers_above_it() {
    let mut world = new_world();
    world.speed = 0;
    world.res.alloy = 10_000;
    let (tx, ty) = tile_of(&world, T_ROAD);
    assert_eq!(world.era, 1, "a new campaign starts in the T1 era");

    let lab = world.query_place(b::B_LAB, tx, ty);
    assert!(!lab.ok);
    assert!(
        lab.affordable && lab.unlocked,
        "only the era blocks the lab"
    );
    assert_eq!(lab.reason, REASON_ERA);
    assert_eq!(world.query_place(b::B_PAD, tx, ty).reason, REASON_ERA);
    assert!(
        world.query_place(b::B_SOLAR, tx, ty).ok,
        "T1 buildings stay placeable"
    );

    world.set_era(2);
    assert!(world.query_place(b::B_LAB, tx, ty).ok, "era 2 unlocks T2");
    assert_eq!(world.query_place(b::B_PAD, tx, ty).reason, REASON_ERA);
    world.set_era(3);
    assert!(world.query_place(b::B_PAD, tx, ty).ok, "era 3 unlocks T3");

    // The command path enforces the same gate.
    world.set_era(1);
    world.push(Command::Place {
        kind: b::B_LAB,
        tx: tx as u16,
        ty: ty as u16,
    });
    world.step();
    assert!(
        !world.buildings.iter().any(|x| x.kind == b::B_LAB),
        "a tier-2 building must never be placed in era 1"
    );
}

#[test]
fn snapshot_reports_the_era() {
    let mut world = new_world();
    assert_eq!(world.snapshot(0).era, 1);
    world.set_era(3);
    assert_eq!(world.snapshot(0).era, 3);
    world.set_era(0); // clamped, never "era zero"
    assert_eq!(world.snapshot(0).era, 1);
}

#[test]
fn era_one_director_sends_ground_raids() {
    let mut world = new_world();
    world.set_era(1);
    let mut raid_event = false;
    let limit = balance::FIRST_WAVE_S * TICKS_PER_SEC + 200;
    for _ in 0..limit {
        world.fleet_eta_ms = 0;
        world.step();
        if world.events.iter().any(|e| e.kind == EVENT_RAID) {
            raid_event = true;
        }
        if world.wave >= 1 {
            break;
        }
    }
    assert_eq!(world.wave, 1);
    assert!(raid_event, "the HUD is told about the incoming raid");
    assert!(
        world.ships.is_empty(),
        "T1 waves must not put anything in the orbital/air layer"
    );
    let raiders = hostile_units(&world);
    assert_eq!(
        raiders.len(),
        usize::from(balance::DROPS_BASE) * usize::from(balance::RAIDERS_PER_DROP),
        "era 1 keeps the drop-pod troop budget, delivered on foot"
    );
    assert!(
        raiders.iter().all(|u| u.kind == units::U_RAIDER),
        "era 1 must not field siege walkers"
    );
    // Spawned on the edge and walking in: inbound, not yet engaged.
    world.step();
    assert_eq!(world.threat, 1);
}

#[test]
fn era_one_raids_never_include_siege_walkers() {
    let mut world = new_world();
    world.set_era(1);
    world.policy.ai_strength = 2;
    world.wave = 6;
    world.fleet_eta_ms = 0;
    world.step();
    let raiders = hostile_units(&world);
    assert!(!raiders.is_empty(), "a late era-1 wave must still spawn");
    assert!(
        raiders.iter().all(|u| u.kind == units::U_RAIDER),
        "siege walkers are an era-2 threat"
    );
}

#[test]
fn threat_reads_engaged_once_raiders_reach_the_colony() {
    let mut world = new_world();
    world.set_era(1);
    spawn_first_wave(&mut world);
    world.step();
    assert_eq!(world.threat, 1, "raiders on the map edge are inbound");
    let hq = world
        .buildings
        .iter()
        .find(|x| x.kind == b::B_HQ)
        .expect("command hub");
    let size = i32::from(World::def(b::B_HQ).footprint);
    let (hx, hy) = (hq.tx * FP + size * FP / 2, hq.ty * FP + size * FP / 2);
    world.units[0].x = hx + FP * 2;
    world.units[0].y = hy;
    world.step();
    assert_eq!(world.threat, 2, "contact with the colony reads as engaged");
}

#[test]
fn era_two_restores_the_orbital_assault() {
    let mut world = new_world();
    world.set_era(2);
    world.policy.ai_phase = 2; // orbital escorts are on the radar immediately
    world.fleet_eta_ms = 0;
    world.step();
    assert!(
        world
            .ships
            .iter()
            .any(|s| s.owner == 1 && s.kind == units::U_DROPSHIP),
        "era 2 waves arrive by dropship again"
    );
    assert!(
        world
            .ships
            .iter()
            .any(|s| s.owner == 1 && s.kind == units::U_WARSHIP),
        "orbital escorts return in era 2"
    );
    assert!(
        hostile_units(&world).is_empty(),
        "no ground units before the dropships land"
    );
}
