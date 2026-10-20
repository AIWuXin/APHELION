//! Orbital launch: a pad charges its ascent, then converts fuel into lift.

use oc_content::balance;
use oc_content::buildings;
use oc_content::techs;
use oc_protocol::{B_STATE_IDLE, B_STATE_WORKING, EFFECT_TRAIL, EVENT_ORBIT};

use crate::world::World;

/// Advance ascending rockets and pad reloads.
pub fn update(world: &mut World, dt_ms: u32) {
    // Orbital engineering makes every rocket deliver one more unit of lift.
    let bonus = if world.has_tech(techs::T_ORBITAL) {
        balance::LAUNCH_ORBITAL_BONUS
    } else {
        0
    };
    let mut orbs: Vec<(i32, i32)> = Vec::new();
    let mut trails: Vec<(i32, i32, i32)> = Vec::new();
    for b in &mut world.buildings {
        if b.kind != buildings::B_PAD {
            continue;
        }
        if b.state == B_STATE_WORKING {
            let step = (dt_ms * 1000 / balance::LAUNCH_ASCENT_MS.max(1)).max(1);
            b.charge = (b.charge + step as u16).min(1000);
            b.progress = b.charge;
            // Exhaust trail: a new puff every few ticks keeps the list small.
            if b.charge >= 1000 {
                b.state = B_STATE_IDLE;
                b.charge = 0;
                b.progress = 1000;
                b.aux = balance::PAD_RELOAD_MS;
                orbs.push((b.tx, b.ty));
            } else if b.charge % 90 < step as u16 {
                trails.push((b.tx, b.ty, b.charge as i32 * 8));
            }
        } else if b.aux > 0 {
            b.aux = b.aux.saturating_sub(dt_ms);
        }
    }
    for (tx, ty, z) in trails {
        world.effect(
            EFFECT_TRAIL,
            tx * oc_iso::FP + oc_iso::FP,
            ty * oc_iso::FP + oc_iso::FP,
            z,
            26,
            0,
        );
    }
    for (tx, ty) in orbs {
        let gain = balance::LAUNCH_CAPACITY.saturating_add(bonus);
        world.capacity = world.capacity.saturating_add(gain);
        world.event(EVENT_ORBIT, u32::from(gain), 0, tx as i16, ty as i16);
        world.effect(
            oc_protocol::EFFECT_FLARE,
            tx * oc_iso::FP + oc_iso::FP,
            ty * oc_iso::FP + oc_iso::FP,
            1400,
            40,
            0,
        );
    }
}
