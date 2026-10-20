//! Combat: guns vs ground, flak vs air, hangar interceptors and HQ loss.

use oc_content::balance;
use oc_content::buildings as b;
use oc_content::terrain::T_ROAD;
use oc_content::units;
use oc_iso::fixed::FP;
use oc_protocol::{EVENT_WAVE, STATUS_DEFEAT, STATUS_RUNNING, UNIT_STATE_MOVE};
use oc_sim::state::{Ship, Unit};
use oc_sim::World;

const SEED: u32 = 0x5EED_1234;

fn new_world() -> World {
    World::new(SEED)
}

/// First free tile of a material (road tiles are buildable everywhere on the
/// generated map, so they make stable test anchors).
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

/// Free 1x1 anchor near the map centre (for air-defence tests).
fn near_centre(world: &World, kind: u8) -> (i32, i32) {
    let mut best: Option<(i32, i32, i32)> = None;
    for ty in 0..world.map.h {
        for tx in 0..world.map.w {
            if !world.query_place(kind, tx, ty).placement_ok {
                continue;
            }
            let key = ((tx - 22).abs() + (ty - 22).abs(), ty, tx);
            if best.is_none_or(|(bd, by, bx)| key < (bd, by, bx)) {
                best = Some(key);
            }
        }
    }
    let (_, ty, tx) = best.expect("free centre anchor");
    (tx, ty)
}

fn spawn_raider(world: &mut World, x: i32, y: i32) -> u32 {
    let def = World::unit_def(units::U_RAIDER);
    let id = world.alloc_id();
    world.units.push(Unit {
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
        facing: 4,
        owner: 1,
        target: 0,
        cooldown: 0,
        home: 0,
    });
    id
}

fn spawn_dropship(world: &mut World, x: i32, y: i32, z: i32) -> u32 {
    let def = World::unit_def(units::U_DROPSHIP);
    let id = world.alloc_id();
    world.ships.push(Ship {
        id,
        kind: units::U_DROPSHIP,
        x,
        y,
        z,
        hp: def.hp,
        hp_max: def.hp,
        state: UNIT_STATE_MOVE,
        phase: 0,
        owner: 1,
        target: 0,
        cooldown: 0,
    });
    id
}

fn hostile_units(world: &World) -> usize {
    world.units.iter().filter(|u| u.owner == 1).count()
}

#[test]
fn turret_kills_a_raider_in_range() {
    let mut world = new_world();
    let (tx, ty) = tile_of(&world, T_ROAD);
    let turret = world.place_now(b::B_TURRET, tx, ty, true);
    let (cx, cy) = (tx * FP + FP / 2, ty * FP + FP / 2);
    spawn_raider(&mut world, cx + 2 * FP, cy);
    let mut killed = false;
    for _ in 0..400 {
        world.step();
        if hostile_units(&world) == 0 {
            killed = true;
            break;
        }
    }
    assert!(killed, "rail turret failed to kill a raider in range");
    assert!(world.buildings.iter().any(|x| x.id == turret));
}

#[test]
fn raider_damages_a_building() {
    let mut world = new_world();
    let solar = world.place_now(b::B_SOLAR, 2, 2, true);
    spawn_raider(&mut world, 3 * FP, 3 * FP);
    let index = world
        .buildings
        .iter()
        .position(|x| x.id == solar)
        .expect("solar");
    let hp_max = world.buildings[index].hp_max;
    for _ in 0..40 {
        world.step();
    }
    assert!(
        world.buildings[index].hp < hp_max,
        "raider should be chewing on the solar array"
    );
}

#[test]
fn hq_destruction_ends_the_campaign() {
    let mut world = new_world();
    assert_eq!(world.status, STATUS_RUNNING);
    let index = world
        .buildings
        .iter()
        .position(|x| x.kind == b::B_HQ)
        .expect("command hub");
    world.buildings[index].hp = 1;
    let (cx, cy) = {
        let hq = &world.buildings[index];
        (hq.tx * FP + FP, hq.ty * FP + FP)
    };
    spawn_raider(&mut world, cx, cy);
    for _ in 0..20 {
        world.step();
        if world.status == STATUS_DEFEAT {
            break;
        }
    }
    assert_eq!(world.status, STATUS_DEFEAT);
    assert!(world.buildings.iter().all(|x| x.kind != b::B_HQ));
}

#[test]
fn turret_cannot_hit_air_but_flak_can() {
    let mut world = new_world();
    let (tx, ty) = near_centre(&world, b::B_TURRET);
    world.place_now(b::B_TURRET, tx, ty, true);
    let id = spawn_dropship(&mut world, tx * FP + FP / 2, ty * FP + FP / 2, 2200);
    for _ in 0..60 {
        world.step();
    }
    let ship = world
        .ships
        .iter()
        .find(|s| s.id == id)
        .expect("dropship still descending");
    assert_eq!(ship.hp, ship.hp_max, "the rail turret cannot target air");
    let (fx, fy) = near_centre(&world, b::B_FLAK);
    world.place_now(b::B_FLAK, fx, fy, true);
    for _ in 0..60 {
        world.step();
    }
    let hp = world.ships.iter().find(|s| s.id == id).map_or(0, |s| s.hp);
    assert!(hp < 190, "flak battery should be shooting the dropship");
}

#[test]
fn hangar_builds_interceptors_that_hunt_hostiles() {
    let mut world = new_world();
    let hangar = world.place_now(b::B_HANGAR, 24, 24, true);
    let mut spawned = false;
    for _ in 0..(balance::HANGAR_INTERVAL_MS / 33 + 10) {
        world.step();
        if world
            .units
            .iter()
            .any(|u| u.kind == units::U_INTERCEPTOR && u.owner == 0)
        {
            spawned = true;
            break;
        }
    }
    assert!(spawned, "hangar should build an interceptor");
    let interceptor = world
        .units
        .iter()
        .find(|u| u.kind == units::U_INTERCEPTOR)
        .expect("interceptor");
    assert_eq!(interceptor.home, hangar);
    spawn_raider(&mut world, 22 * FP, 22 * FP);
    let mut killed = false;
    for _ in 0..600 {
        world.step();
        if hostile_units(&world) == 0 {
            killed = true;
            break;
        }
    }
    assert!(killed, "interceptor should shoot the ground raider");
}

#[test]
fn interceptors_are_freed_when_the_hangar_dies() {
    let mut world = new_world();
    let hangar = world.place_now(b::B_HANGAR, 24, 24, true);
    for _ in 0..(balance::HANGAR_INTERVAL_MS / 33 + 10) {
        world.step();
        if world.units.iter().any(|u| u.home == hangar) {
            break;
        }
    }
    assert!(world.units.iter().any(|u| u.home == hangar));
    let index = world
        .buildings
        .iter()
        .position(|x| x.id == hangar)
        .expect("hangar");
    world.buildings[index].hp = 0;
    for _ in 0..3 {
        world.step();
    }
    assert!(
        !world.units.iter().any(|u| u.home == hangar),
        "a destroyed hangar must not leave orphaned aircraft flying"
    );
}

/// Damage the first turret volley deals to a tough dummy raider.
fn first_turret_volley(techs: u32) -> i32 {
    let mut world = new_world();
    world.techs = techs;
    let (tx, ty) = tile_of(&world, T_ROAD);
    world.place_now(b::B_TURRET, tx, ty, true);
    let (cx, cy) = (tx * FP + FP / 2, ty * FP + FP / 2);
    let id = spawn_raider(&mut world, cx + 2 * FP, cy);
    let index = world
        .units
        .iter()
        .position(|u| u.id == id)
        .expect("dummy raider");
    world.units[index].hp = 10_000;
    world.units[index].hp_max = 10_000;
    for _ in 0..200 {
        world.step();
        let hp = world.units.iter().find(|u| u.id == id).map_or(0, |u| u.hp);
        if hp < 10_000 {
            return 10_000 - hp;
        }
    }
    panic!("turret never fired");
}

#[test]
fn ballistics_tech_boosts_turret_damage_by_30_percent() {
    let base = first_turret_volley(0);
    let boosted = first_turret_volley(1 << (oc_content::techs::T_BALLISTICS & 31));
    assert!(base > 0 && boosted > base);
    assert!(
        (boosted - base * 13 / 10).abs() <= 1,
        "ballistics tech should add 30%: {base} -> {boosted}"
    );
}

#[test]
fn clearing_the_final_wave_wins_the_campaign() {
    let mut world = new_world();
    world.wave = balance::WAVES_TO_WIN;
    world.wave_in_flight = true;
    world.step();
    assert_eq!(world.status, oc_protocol::STATUS_VICTORY);
    assert_eq!(world.speed, 0, "the campaign ends paused");
}

#[test]
fn hangar_respects_its_airframe_cap() {
    let mut world = new_world();
    let hangar = world.place_now(b::B_HANGAR, 24, 24, true);
    for _ in 0..(4 * balance::HANGAR_INTERVAL_MS / 33) {
        world.step();
    }
    let alive = world
        .units
        .iter()
        .filter(|u| u.home == hangar && u.hp > 0)
        .count();
    assert_eq!(alive, usize::from(balance::HANGAR_MAX_INTERCEPTORS));
}

#[test]
fn radar_publishes_the_wave_eta_early() {
    let mut world = new_world();
    world.step();
    assert_eq!(
        world.visible_eta_ms(),
        0,
        "without a radar array the ETA is unknown this far out"
    );
    assert!(!world.events.iter().any(|e| e.kind == EVENT_WAVE));
    let _ = world.place_now(b::B_RADAR, 2, 2, true);
    world.step();
    assert_eq!(world.visible_eta_ms(), world.fleet_eta_ms);
    assert!(
        world.events.iter().any(|e| e.kind == EVENT_WAVE),
        "radar should announce the incoming wave early"
    );
}
