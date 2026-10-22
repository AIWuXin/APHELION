//! Director contract: era-1 raids arrive on a ring around the colony (there is
//! no map edge on a torus), era-2 keeps the orbital drop, and the threat readout
//! follows the distance to the colony.

mod common;

use oc_content::balance;
use oc_content::buildings as b;
use oc_content::terrain::{T_DEEP, T_SHALLOW};
use oc_content::units;
use oc_iso::fixed::FP;
use oc_iso::torus;
use oc_protocol::{EVENT_RAID, UNIT_STATE_MOVE};
use oc_sim::{World, TICKS_PER_SEC};

const SEED: u32 = 0x5EED_1234;

fn new_world() -> World {
    World::new(SEED)
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

/// Centre of the command hub, in wrapped tile coordinates.
fn home_centre(world: &World) -> (i32, i32) {
    let hq = world
        .buildings
        .iter()
        .find(|x| x.kind == b::B_HQ)
        .expect("command hub");
    let size = i32::from(World::def(b::B_HQ).footprint);
    (
        torus::wrap_x(hq.tx + size / 2),
        torus::wrap_y(hq.ty + size / 2),
    )
}

/// Shortest tile distance from a hostile unit to the colony centre.
fn distance_to_colony(world: &World, u: &oc_sim::state::Unit) -> u64 {
    let (cx, cy) = home_centre(world);
    let ux = torus::wrap_x(u.x / FP);
    let uy = torus::wrap_y(u.y / FP);
    torus::dist2_tiles(ux, uy, cx, cy)
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
    // Spawned on the raid ring and walking in: inbound, not yet engaged.
    world.step();
    assert_eq!(world.threat, 1);
}

#[test]
fn era_one_raids_spawn_on_the_ring_and_close_in() {
    let mut world = new_world();
    world.set_era(1);
    spawn_first_wave(&mut world);
    // The raid event carries the chosen ring tile: that is the tile the
    // director promised the HUD and the one the squad is deployed around.
    let targets: Vec<(i32, i32)> = world
        .events
        .iter()
        .filter(|e| e.kind == EVENT_RAID)
        .map(|e| (i32::from(e.tx), i32::from(e.ty)))
        .collect();
    assert!(!targets.is_empty(), "the wave must fire raid events");
    for (x, y) in &targets {
        assert!(
            !matches!(world.map.material_at(*x, *y), T_DEEP | T_SHALLOW),
            "era-1 raid ring picked water at ({x},{y})"
        );
    }
    let raiders = hostile_units(&world);
    assert!(!raiders.is_empty());
    let ring = u64::from(balance::RAID_RING_TILES as u32);
    let (near, far) = ((ring - 3) * (ring - 3), (ring + 3) * (ring + 3));
    for raider in &raiders {
        let (ux, uy) = (torus::wrap_x(raider.x / FP), torus::wrap_y(raider.y / FP));
        assert!(
            world.map.material_at(ux, uy) != T_DEEP,
            "era-1 raiders must not be deployed into open ocean at ({ux},{uy})"
        );
        let d2 = distance_to_colony(&world, raider);
        assert!(
            (near..=far).contains(&d2),
            "raider spawned at {d2} tiles^2, outside the {ring}-tile ring"
        );
    }
    // The old edge semantics are gone; the ring is only useful if the raid
    // actually marches on the colony.
    let before = distance_to_colony(&world, raiders[0]);
    for _ in 0..(3 * TICKS_PER_SEC) {
        world.step();
    }
    let remaining: Vec<&oc_sim::state::Unit> =
        world.units.iter().filter(|u| u.owner == 1).collect();
    assert!(
        !remaining.is_empty(),
        "raiders must still be alive after 3 s"
    );
    let after = distance_to_colony(&world, remaining[0]);
    assert!(
        after < before,
        "raiders must close on the colony: {before} -> {after} tiles^2"
    );
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
    assert_eq!(world.threat, 1, "raiders on the raid ring are inbound");
    let (hx, hy) = home_centre(&world);
    world.units[0].x = hx * FP + FP * 2;
    world.units[0].y = hy * FP;
    world.units[0].state = UNIT_STATE_MOVE;
    world.step();
    assert_eq!(world.threat, 2, "contact with the colony reads as engaged");
}

#[test]
fn era_two_restores_the_orbital_assault_without_a_map_edge() {
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
    // Dropships enter on a wide insertion ring around the colony, not on a map
    // edge (there is none any more).
    let (cx, cy) = home_centre(&world);
    let insert = u64::from(balance::DROPSHIP_INSERT_RADIUS_TILES as u32);
    for ship in world
        .ships
        .iter()
        .filter(|s| s.owner == 1 && s.kind == units::U_DROPSHIP)
    {
        let (sx, sy) = (torus::wrap_x(ship.x / FP), torus::wrap_y(ship.y / FP));
        let d2 = torus::dist2_tiles(sx, sy, cx, cy);
        assert!(
            d2 <= (insert + 4) * (insert + 4) && d2 >= (insert - 4) * (insert - 4),
            "dropship inserted at {d2} tiles^2 from the colony"
        );
    }
}
