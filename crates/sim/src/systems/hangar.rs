//! Hangar: builds interceptors on a fixed cadence and frees them when destroyed.
//!
//! `BuildingView.progress` is the interceptor assembly progress (0..1000 over
//! [`oc_content::balance::HANGAR_INTERVAL_MS`]), `BuildingView.charge` is the
//! elaborate tick counter behind it (0..425, inside the documented charge
//! range) and `BuildingView.aux` is the live aircraft count, so the HUD can
//! show "2/3 airframes" without any new protocol field.

use oc_content::balance;
use oc_content::buildings;
use oc_content::units;
use oc_iso::fixed::FP;
use oc_protocol::{
    B_STATE_IDLE, B_STATE_SITE, B_STATE_WORKING, EFFECT_EXPLODE, EVENT_PRODUCED, UNIT_STATE_IDLE,
};

use crate::state::Unit;
use crate::world::World;

/// Advance every finished hangar one tick.
pub fn update(world: &mut World, dt_ms: u32) {
    release_orphans(world);
    // Exact tick cadence: 33 ms ticks would otherwise round a 14 s interval to
    // 16.5 s if progress were kept in whole permille.
    let interval_ticks = u16::try_from(
        (u64::from(balance::HANGAR_INTERVAL_MS) + u64::from(dt_ms) - 1) / u64::from(dt_ms.max(1)),
    )
    .unwrap_or(u16::MAX)
    .max(1);
    let mut spawns: Vec<usize> = Vec::new();
    for bi in 0..world.buildings.len() {
        let b = &world.buildings[bi];
        if b.kind != buildings::B_HANGAR || b.state == B_STATE_SITE {
            continue;
        }
        let id = b.id;
        let alive = world
            .units
            .iter()
            .filter(|u| u.home == id && u.hp > 0)
            .count();
        let powered = b.flags & 1 != 0;
        let full = alive >= usize::from(balance::HANGAR_MAX_INTERCEPTORS);
        let b = &mut world.buildings[bi];
        b.aux = alive.min(usize::from(u16::MAX)) as u32;
        if full {
            b.progress = 1000;
            b.charge = 0;
            b.state = B_STATE_IDLE;
            continue;
        }
        if !powered {
            // No power, no airframes: the line holds its progress.
            b.state = B_STATE_IDLE;
            continue;
        }
        b.charge = b.charge.saturating_add(1);
        b.progress = (u32::from(b.charge) * 1000 / u32::from(interval_ticks)).min(1000) as u16;
        b.state = B_STATE_WORKING;
        if b.charge >= interval_ticks {
            b.charge = 0;
            b.progress = 0;
            spawns.push(bi);
        }
    }
    for bi in spawns {
        let (tx, ty, home, size) = {
            let b = &world.buildings[bi];
            (b.tx, b.ty, b.id, i32::from(World::def(b.kind).footprint))
        };
        let x = tx * FP + size * FP / 2;
        let y = ty * FP + size * FP / 2;
        world.buildings[bi].aux = world.buildings[bi].aux.saturating_add(1);
        let id = world.alloc_id();
        let def = World::unit_def(units::U_INTERCEPTOR);
        world.units.push(Unit {
            id,
            kind: units::U_INTERCEPTOR,
            x,
            y,
            z: balance::INTERCEPTOR_ALT_FP,
            gx: x,
            gy: y,
            hp: def.hp,
            hp_max: def.hp,
            state: UNIT_STATE_IDLE,
            facing: 2,
            owner: 0,
            target: 0,
            cooldown: 0,
            home,
        });
        world.event(
            EVENT_PRODUCED,
            1,
            u32::from(units::U_INTERCEPTOR),
            tx as i16,
            ty as i16,
        );
        world.effect(
            oc_protocol::EFFECT_SPARK,
            x,
            y,
            balance::INTERCEPTOR_ALT_FP,
            14,
            id as i32,
        );
    }
}

/// "Free" the aircraft of a destroyed/demolished hangar: they lose their deck,
/// so they go down with it instead of turning into orphaned free-floating units.
fn release_orphans(world: &mut World) {
    let hangars: Vec<u32> = world
        .buildings
        .iter()
        .filter(|b| b.kind == buildings::B_HANGAR)
        .map(|b| b.id)
        .collect();
    let mut doomed: Vec<usize> = Vec::new();
    for (i, u) in world.units.iter().enumerate() {
        if u.home != 0 && !hangars.contains(&u.home) {
            doomed.push(i);
        }
    }
    for i in doomed.into_iter().rev() {
        let u = world.units.remove(i);
        world.effect(EFFECT_EXPLODE, u.x, u.y, u.z, 18, 0);
    }
}
