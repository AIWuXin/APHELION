//! Director: paces hostile waves, delivers them and tracks the threat level.
//!
//! Delivery depends on the era: era 1 has no air layer and no anti-air, so waves
//! are ground raids that appear on a deterministic **ring** around the colony
//! hub; era 2+ keeps the orbital drop ships (and with them siege walkers and
//! orbital escorts).
//!
//! The planet has no edge to walk in from (it is a torus), which is why the T1
//! raid is placed by angle rather than by border tile: the ring keeps the same
//! "threat approaches from off-screen" pacing the old map edge provided, without
//! reintroducing an edge concept into the kernel.
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
use oc_content::buildings;
use oc_content::terrain::{T_DEEP, T_SHALLOW};
use oc_content::units;
use oc_iso::fixed::FP;
use oc_iso::torus;
use oc_iso::trig;
use oc_protocol::{
    EFFECT_TRAIL, EVENT_DROP, EVENT_RAID, EVENT_WAVE, STATUS_RUNNING, UNIT_STATE_MOVE,
};

use crate::mapgen;
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

    // Era 1 has no air layer (and no anti-air), so the same troop budget appears
    // on the raid ring; era 2+ keeps the original orbital drop.
    if world.era >= 2 {
        spawn_dropships(world, drops);
    } else {
        spawn_ground_raid(world, drops);
    }
}

/// Centre of the colony hub in tile coordinates (wrapped).
///
/// Everything offensive is aimed at this point: the raid ring, the dropship
/// descent and the orbital escort formation. Falls back to the map's home tile
/// if the hub has already been destroyed.
fn colony_centre(world: &World) -> (i32, i32) {
    if let Some(hq) = world
        .buildings
        .iter()
        .find(|b| b.kind == buildings::B_HQ && b.hp > 0)
    {
        let size = i32::from(World::def(hq.kind).footprint);
        return (
            torus::wrap_x(hq.tx + size / 2),
            torus::wrap_y(hq.ty + size / 2),
        );
    }
    let hq = mapgen::hq_size();
    (
        torus::wrap_x(world.map.start.0 + hq / 2),
        torus::wrap_y(world.map.start.1 + hq / 2),
    )
}

/// A tile on the circle of `radius` around `(cx, cy)` at a turn angle.
fn ring_point(cx: i32, cy: i32, angle: i32, radius: i32) -> (i32, i32) {
    let dx = trig::cos(angle) * radius / trig::ONE;
    let dy = trig::sin(angle) * radius / trig::ONE;
    (torus::wrap_x(cx + dx), torus::wrap_y(cy + dy))
}

/// Pick a land tile on the raid ring, rotating in fixed steps while the first
/// choice is deep water. Bounded: after [`balance::RAID_ANGLE_TRIES`] the best
/// shallow-water tile wins (raiders can wade); if even that never came up, the
/// last angle is used as-is. Deterministic for a given roll.
fn raid_ring_tile(world: &World, roll: u32) -> (i32, i32) {
    let (cx, cy) = colony_centre(world);
    let mut angle = (roll % trig::TURN as u32) as i32;
    let mut shallow: Option<(i32, i32)> = None;
    for _ in 0..balance::RAID_ANGLE_TRIES {
        let (x, y) = ring_point(cx, cy, angle, balance::RAID_RING_TILES);
        match world.map.material_at(x, y) {
            T_DEEP => {}
            T_SHALLOW => shallow = shallow.or(Some((x, y))),
            _ => return (x, y),
        }
        angle = (angle + balance::RAID_ANGLE_STEP_TURNS) % trig::TURN;
    }
    shallow.unwrap_or_else(|| ring_point(cx, cy, angle, balance::RAID_RING_TILES))
}

/// Drop-pod path: dropships appear on a wide insertion ring and descend toward
/// the colony centre (the planet has no edge to enter from).
fn spawn_dropships(world: &mut World, drops: u8) {
    let (cx, cy) = colony_centre(world);
    for i in 0..drops {
        let roll = world.rng.director.next_u32();
        let angle = (roll % trig::TURN as u32) as i32;
        let (tx, ty) = ring_point(cx, cy, angle, balance::DROPSHIP_INSERT_RADIUS_TILES);
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

/// Ground-raid path (era 1): squads appear on deterministic ring tiles around
/// the colony and the existing raider AI marches them in.
fn spawn_ground_raid(world: &mut World, squads: u8) {
    for _ in 0..squads {
        let roll = world.rng.director.next_u32();
        let (tx, ty) = raid_ring_tile(world, roll);
        world.event(
            EVENT_RAID,
            u32::from(balance::RAIDERS_PER_DROP),
            0,
            tx as i16,
            ty as i16,
        );
        deploy_raiders(world, tx, ty);
        world.effect(EFFECT_TRAIL, tx * FP, ty * FP, 200, 24, 0);
    }
}

/// Spawn one raider squad on a tile.
///
/// Siege walkers only exist from era 2 onwards: T1 has no answer for a 340 hp
/// walker, so the era-1 raid is pure raiders and the wave/strength siege
/// condition only applies once the orbital era has begun.
fn deploy_raiders(world: &mut World, tx: i32, ty: i32) {
    // Era 1 gates the whole siege condition: T1 has nothing that can answer a
    // 340 hp walker, so the old wave/strength rule only applies in era 2+.
    let siege = world.era >= 2 && (world.policy.ai_strength >= 2 || world.wave >= 3);
    for k in 0..balance::RAIDERS_PER_DROP {
        let kind = if k == 0 && siege {
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
            cargo: 0,
        });
    }
}

/// Hard cap on simultaneous orbital warships.
///
/// Warships sit on the orbital layer, out of reach of every player weapon, so
/// they never die. The old unbounded `wave / 2 + phase` target therefore grew
/// the snapshot (and the radar blip count) forever. Once the cap is reached the
/// director stops spawning; the existing hulls stay as background contacts.
const MAX_WARSHIPS: usize = 8;

fn update_orbital(world: &mut World, dt_ms: u32) {
    // Orbital escorts are an era-2+ threat: T1 only ever faces ground raids.
    if world.era >= 2 {
        let hostile_ships = world
            .ships
            .iter()
            .filter(|s| s.owner == 1 && s.kind == units::U_WARSHIP)
            .count();
        let want = (usize::from(world.wave / 2) + usize::from(world.policy.ai_phase.min(2)))
            .min(MAX_WARSHIPS);
        if hostile_ships < want {
            let def = World::unit_def(units::U_WARSHIP);
            let id = world.alloc_id();
            let angle = world.rng.director.next_u32() % 360;
            let (cx, cy) = colony_centre(world);
            world.ships.push(Ship {
                id,
                kind: units::U_WARSHIP,
                x: cx * FP,
                y: cy * FP,
                z: 3200,
                hp: def.hp,
                hp_max: def.hp,
                state: UNIT_STATE_MOVE,
                phase: angle as u16,
                owner: 1,
                target: 0,
                cooldown: 0,
            });
        }
    }
    for s in &mut world.ships {
        if s.owner == 1 && s.kind == units::U_WARSHIP {
            s.phase = (s.phase + (dt_ms * 1000 / 90) as u16) % 1000;
        }
    }
}

fn update_dropships(world: &mut World, dt_ms: u32) {
    let (gx, gy) = colony_centre(world);
    let (gx, gy) = (gx * FP, gy * FP);
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
            let tx = torus::wrap_x(s.x / FP);
            let ty = torus::wrap_y(s.y / FP);
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
        deploy_raiders(world, tx, ty);
        world.effect(EFFECT_TRAIL, tx * FP, ty * FP, 200, 24, 0);
    }
    // Threat display: engaged while hostiles are on the ground, inbound while
    // dropships are still descending, calm once the wave is fully resolved.
    // Era 1 has no dropships, so a ground raid reads as "inbound" until the
    // raiders close on a structure and "engaged" from there.
    let ground = world.units.iter().any(|u| u.owner == 1 && u.hp > 0);
    let airborne = world
        .ships
        .iter()
        .any(|s| s.owner == 1 && s.hp > 0 && s.kind == units::U_DROPSHIP);
    if ground {
        let engaged = world.era >= 2 || raid_in_contact(world);
        world.threat = if engaged { 2 } else { 1 };
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

/// Is any hostile ground unit close enough to a structure to count as engaged?
///
/// Era 1 reports `threat` 1 while the raid is still marching and 2 once it is
/// in weapon reach, which is the ground-only analogue of "dropships descending"
/// vs "raiders on the ground". Distances are toroidal: a raider that approached
/// over the seam is genuinely near, not a planet away.
fn raid_in_contact(world: &World) -> bool {
    let reach = balance::RAID_CONTACT_TILES.max(1) as u64;
    let reach2 = reach * reach;
    for u in &world.units {
        if u.owner != 1 || u.hp <= 0 {
            continue;
        }
        for b in &world.buildings {
            let size = i32::from(World::def(b.kind).footprint);
            let cx = b.tx * FP + size * FP / 2;
            let cy = b.ty * FP + size * FP / 2;
            if torus::dist2_fp(u.x, u.y, cx, cy) <= reach2 {
                return true;
            }
        }
    }
    false
}
