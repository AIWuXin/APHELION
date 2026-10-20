//! Director: paces hostile waves, drops them in and tracks the threat level.
//!
//! Sensor visibility contract (also documented on [`crate::world::World::visible_eta_ms`]):
//! - with a finished radar array the next wave is announced the moment the
//!   previous one is cleared and `Orbital::fleet_eta_ms` counts down the whole
//!   time, so the HUD can plan ahead;
//! - without a radar array the colony only detects the fleet inside
//!   [`oc_content::balance::RADAR_DETECT_MS`], so the snapshot reports an
//!   unknown ETA and [`oc_protocol::EVENT_WAVE`] fires late.
//!
//! AI presets: `policy.ai_phase` scales wave size and tempo, `policy.ai_strength`
//! changes the composition (peaceful = fewer drops, fierce = extra drops and
//! earlier siege walkers).

use oc_content::balance;
use oc_content::units;
use oc_iso::fixed::FP;
use oc_protocol::{EFFECT_TRAIL, EVENT_DROP, EVENT_WAVE, STATUS_RUNNING, UNIT_STATE_MOVE};

use crate::state::{Ship, Unit};
use crate::systems::targeting::{speed_per_tick, step_xy};
use crate::world::World;

/// Advance the whole director stage.
pub fn update(world: &mut World, dt_ms: u32) {
    if world.status != STATUS_RUNNING {
        return;
    }
    update_orbital(world, dt_ms);
    update_dropships(world, dt_ms);
    wave_clock(world, dt_ms);
}

fn wave_clock(world: &mut World, dt_ms: u32) {
    let radar = world.has_radar();
    // Announce the upcoming wave: radar sees it from the previous wave being
    // cleared, everyone else only inside the terminal detection window.
    let announce_window = if radar {
        u32::MAX
    } else {
        balance::RADAR_DETECT_MS
    };
    if !world.wave_announced && world.fleet_eta_ms <= announce_window {
        world.wave_announced = true;
        let secs = (world.fleet_eta_ms / 1000).min(u32::from(u16::MAX));
        world.event(
            EVENT_WAVE,
            u32::from(world.wave).saturating_add(1),
            secs,
            -1,
            -1,
        );
    }
    if radar && world.fleet_eta_ms <= balance::RADAR_WARN_MS && world.threat == 0 {
        world.threat = 1;
    }
    if world.fleet_eta_ms > dt_ms {
        world.fleet_eta_ms -= dt_ms;
        return;
    }
    spawn_wave(world);
}

fn spawn_wave(world: &mut World) {
    world.wave = world.wave.saturating_add(1);
    let phase = u16::from(world.policy.ai_phase.min(2));
    let strength = world.policy.ai_strength.min(2);
    let base = match strength {
        0 => balance::DROPS_BASE.saturating_sub(1).max(1),
        1 => balance::DROPS_BASE,
        _ => balance::DROPS_BASE.saturating_add(balance::DROPS_FIERCE_EXTRA),
    };
    let drops = base
        .saturating_add((world.wave / 3) as u8)
        .saturating_add(phase as u8);
    let interval = balance::WAVE_INTERVAL_S
        .saturating_sub(u32::from(world.wave) * 6)
        .saturating_sub(u32::from(phase) * 8)
        .max(balance::WAVE_INTERVAL_MIN_S);
    world.fleet_eta_ms = interval * 1000;
    world.wave_announced = false;
    world.wave_in_flight = true;
    world.threat = 1;

    // Dropships enter from a random edge and descend toward the colony centre.
    let span = oc_iso::grid::MAP_W;
    for i in 0..drops {
        let roll = world.rng.director.next_u32();
        let edge = roll % 4;
        let t = ((roll >> 8) % span as u32) as i32;
        let (tx, ty) = match edge {
            0 => (t, 0),
            1 => (span - 1, t),
            2 => (t, span - 1),
            _ => (0, t),
        };
        let id = world.alloc_id();
        let def = World::unit_def(units::U_DROPSHIP);
        world.ships.push(Ship {
            id,
            kind: units::U_DROPSHIP,
            x: tx * FP + FP / 2,
            y: ty * FP + FP / 2,
            z: 2200,
            hp: def.hp,
            hp_max: def.hp,
            state: UNIT_STATE_MOVE,
            phase: (i as u16) * 64,
            owner: 1,
            target: 0,
            cooldown: 0,
        });
    }
}

fn update_orbital(world: &mut World, dt_ms: u32) {
    // Orbital escorts circle the planet; they exist to be seen on the radar.
    let hostile_ships = world
        .ships
        .iter()
        .filter(|s| s.owner == 1 && s.kind == units::U_WARSHIP)
        .count();
    let want = usize::from(world.wave / 2) + usize::from(world.policy.ai_phase.min(2));
    if hostile_ships < want {
        let id = world.alloc_id();
        let angle = world.rng.director.next_u32() % 360;
        world.ships.push(Ship {
            id,
            kind: units::U_WARSHIP,
            x: FP * 22,
            y: FP * 22,
            z: 3200,
            hp: 420,
            hp_max: 420,
            state: UNIT_STATE_MOVE,
            phase: angle as u16,
            owner: 1,
            target: 0,
            cooldown: 0,
        });
    }
    for s in &mut world.ships {
        if s.owner == 1 && s.kind == units::U_WARSHIP {
            s.phase = (s.phase + (dt_ms * 1000 / 90) as u16) % 1000;
        }
    }
}

fn update_dropships(world: &mut World, dt_ms: u32) {
    let gx = (oc_iso::grid::MAP_W / 2) * FP;
    let gy = (oc_iso::grid::MAP_H / 2) * FP;
    let descent = (balance::DROPSHIP_DESCENT_FP_S * dt_ms as i32 / 1000).max(1);
    let mut landed: Vec<(i32, i32)> = Vec::new();
    let mut gone: Vec<u32> = Vec::new();
    for s in &mut world.ships {
        if s.kind != units::U_DROPSHIP || s.owner != 1 || s.hp <= 0 {
            continue;
        }
        let speed = speed_per_tick(World::unit_def(s.kind).speed, dt_ms);
        step_xy(&mut s.x, &mut s.y, gx, gy, speed);
        if s.z > balance::DROPSHIP_LAND_ALT_FP {
            s.z = (s.z - descent).max(balance::DROPSHIP_LAND_ALT_FP);
        }
        if s.z <= balance::DROPSHIP_LAND_ALT_FP {
            let tx = (s.x / FP).clamp(0, oc_iso::grid::MAP_W - 1);
            let ty = (s.y / FP).clamp(0, oc_iso::grid::MAP_H - 1);
            landed.push((tx, ty));
            gone.push(s.id);
        }
    }
    world.ships.retain(|s| !gone.contains(&s.id));
    let if_in_flight = world.wave_in_flight;
    for (tx, ty) in landed {
        world.event(
            EVENT_DROP,
            u32::from(balance::RAIDERS_PER_DROP),
            0,
            tx as i16,
            ty as i16,
        );
        let siege = u8::from(world.policy.ai_strength >= 2) + u8::from(world.wave >= 3);
        for k in 0..balance::RAIDERS_PER_DROP {
            let kind = if k == 0 && siege > 0 {
                units::U_SIEGE
            } else {
                units::U_RAIDER
            };
            let def = World::unit_def(kind);
            let jitter = (world.rng.director.next_u32() % 256) as i32 - 128;
            let id = world.alloc_id();
            world.units.push(Unit {
                id,
                kind,
                x: tx * FP + FP / 2 + jitter,
                y: ty * FP + FP / 2 + jitter,
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
        }
        world.effect(EFFECT_TRAIL, tx * FP, ty * FP, 200, 24, 0);
    }
    // Threat display: engaged while hostiles are on the ground, inbound while
    // dropships are still descending, calm once the wave is fully resolved.
    let ground = world.units.iter().any(|u| u.owner == 1 && u.hp > 0);
    let airborne = world
        .ships
        .iter()
        .any(|s| s.owner == 1 && s.hp > 0 && s.kind == units::U_DROPSHIP);
    if ground {
        world.threat = 2;
    } else if airborne {
        if world.threat == 0 {
            world.threat = 1;
        }
    } else if if_in_flight {
        world.wave_in_flight = false;
        world.threat = 0;
        if world.wave >= balance::WAVES_TO_WIN && world.status == STATUS_RUNNING {
            world.finish(true);
        }
    }
}
