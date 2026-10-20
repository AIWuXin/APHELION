//! Air layer and defensive guns.
//!
//! Two complementary weapons keep the player honest:
//! - rail turret: ground layer only, high single-target damage;
//! - flak battery: air layer only, hits dropships while they descend and any
//!   hostile air unit. Dropships are still in the `ships` list on the way down,
//!   so flak can shoot them out of the sky before they unload raiders.
//!
//! Hangar interceptors are player units: they chase the nearest hostile of any
//! layer (air first by distance) and shoot both dropships and ground raiders.

use oc_content::balance;
use oc_content::buildings;
use oc_content::units;
use oc_iso::fixed::{dist2, step_towards};
use oc_protocol::{
    BEAM_CANNON, BEAM_FLAK, BEAM_RAIL, B_STATE_SITE, EFFECT_IMPACT, EFFECT_MUZZLE,
    UNIT_STATE_ATTACK, UNIT_STATE_IDLE, UNIT_STATE_MOVE,
};

use crate::systems::targeting::{
    apply_damage, centre, facing_from, nearest_hostile, nearest_hostile_any, speed_per_tick,
    step_xy, Contact,
};
use crate::world::World;

/// One resolved defensive shot.
struct Shot {
    building: usize,
    contact: Contact,
    cx: i32,
    cy: i32,
    damage: i32,
    beam: u8,
}

/// Charge every defensive gun and fire at the nearest legal target.
pub fn turrets(world: &mut World, dt_ms: u32) {
    let bonus = if world.has_tech(oc_content::techs::T_BALLISTICS) {
        1000 + balance::BALLISTICS_BONUS
    } else {
        1000
    };
    // 1. Reload.
    for b in &mut world.buildings {
        let reload = match b.kind {
            buildings::B_TURRET => balance::TURRET_RELOAD_MS,
            buildings::B_FLAK => balance::FLAK_RELOAD_MS,
            _ => continue,
        };
        if b.state == B_STATE_SITE {
            continue;
        }
        let step = (dt_ms * 1000 / reload.max(1)).max(1) as u16;
        b.charge = (b.charge + step).min(1000);
    }
    // 2. Acquire.
    let mut shots: Vec<Shot> = Vec::new();
    for (bi, b) in world.buildings.iter().enumerate() {
        let (air, base_damage, beam) = match b.kind {
            buildings::B_TURRET => (false, balance::TURRET_DAMAGE, BEAM_RAIL),
            buildings::B_FLAK => (true, balance::FLAK_DAMAGE, BEAM_FLAK),
            _ => continue,
        };
        if b.state == B_STATE_SITE || b.charge < 1000 || b.flags & 1 == 0 {
            continue;
        }
        let (cx, cy) = centre(b.tx, b.ty, b.kind);
        let range = i32::from(World::def(b.kind).range);
        let Some(contact) = nearest_hostile(world, cx, cy, range, air) else {
            continue;
        };
        shots.push(Shot {
            building: bi,
            contact,
            cx,
            cy,
            damage: base_damage * bonus / 1000,
            beam,
        });
    }
    // 3. Resolve.
    for shot in shots {
        world.buildings[shot.building].charge = 0;
        let c = shot.contact;
        apply_damage(world, c.target, shot.damage);
        world.beam(shot.beam, (shot.cx, shot.cy, 70), (c.x, c.y, c.z), 6);
        world.effect(EFFECT_MUZZLE, shot.cx, shot.cy, 70, 5, 0);
        world.effect(EFFECT_IMPACT, c.x, c.y, c.z, 8, shot.damage);
    }
}

/// Fly every player interceptor: pick a target, close in, shoot.
pub fn interceptors(world: &mut World, dt_ms: u32) {
    let def = World::unit_def(units::U_INTERCEPTOR);
    let range2 = u64::from(def.range) * u64::from(def.range);
    let step = speed_per_tick(def.speed, dt_ms);
    for i in 0..world.units.len() {
        let u = &world.units[i];
        if u.kind != units::U_INTERCEPTOR || u.owner != 0 || u.hp <= 0 {
            continue;
        }
        let mut x = u.x;
        let mut y = u.y;
        let mut z = u.z;
        let mut cooldown = u.cooldown.saturating_sub(dt_ms);
        let mut state = UNIT_STATE_IDLE;
        let mut target_id = 0u32;
        let mut shot: Option<Contact> = None;
        let (face_dx, face_dy);
        match nearest_hostile_any(world, x, y, 0) {
            Some(contact) => {
                target_id = contact.id;
                face_dx = contact.x - x;
                face_dy = contact.y - y;
                let d2 = dist2(x, y, contact.x, contact.y);
                if d2 <= range2 {
                    state = UNIT_STATE_ATTACK;
                    if cooldown == 0 {
                        cooldown = def.cooldown_ms;
                        shot = Some(contact);
                    }
                } else {
                    state = UNIT_STATE_MOVE;
                    step_xy(&mut x, &mut y, contact.x, contact.y, step);
                    let desired_z = contact.z.max(180);
                    z = step_towards(z, desired_z, (step / 2).max(1));
                }
            }
            None => {
                // No target: orbit the home deck until something shows up.
                let (hx, hy) = (world.units[i].gx, world.units[i].gy);
                face_dx = hx - x;
                face_dy = hy - y;
                if dist2(x, y, hx, hy) > 4 {
                    state = UNIT_STATE_MOVE;
                    step_xy(&mut x, &mut y, hx, hy, step);
                } else {
                    x = hx;
                    y = hy;
                }
                z = step_towards(z, balance::INTERCEPTOR_ALT_FP, (step / 2).max(1));
            }
        }
        let facing = facing_from(face_dx, face_dy);
        let unit = &mut world.units[i];
        unit.x = x;
        unit.y = y;
        unit.z = z;
        unit.cooldown = cooldown;
        unit.state = state;
        unit.target = target_id;
        unit.facing = facing;
        if let Some(contact) = shot {
            apply_damage(world, contact.target, def.damage);
            world.beam(BEAM_CANNON, (x, y, z), (contact.x, contact.y, contact.z), 5);
            world.effect(EFFECT_MUZZLE, x, y, z, 4, 0);
            world.effect(
                EFFECT_IMPACT,
                contact.x,
                contact.y,
                contact.z,
                7,
                def.damage,
            );
        }
    }
}
