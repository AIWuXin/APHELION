//! Repair bay: slowly heals the nearest damaged structure or unit in radius.
//!
//! `BuildingView.charge` doubles as the heal timer (0..1000 ms); when it wraps
//! the bay emits one [`oc_content::balance::REPAIR_PER_S`] tick of healing and a
//! repair beam, so the HUD can show the actual target being worked on.

use oc_content::balance;
use oc_content::buildings;
use oc_iso::fixed::{dist2, FP};
use oc_protocol::{BEAM_REPAIR, B_STATE_SITE, EFFECT_FLARE};

use crate::world::World;

/// Run every finished repair bay.
pub fn update(world: &mut World, dt_ms: u32) {
    let mut heals: Vec<(usize, i32, i32)> = Vec::new();
    for bi in 0..world.buildings.len() {
        let b = &world.buildings[bi];
        if b.kind != buildings::B_REPAIR || b.state == B_STATE_SITE {
            continue;
        }
        let (cx, cy) = centre(b.tx, b.ty, b.kind);
        let charge = world.buildings[bi].charge.saturating_add(dt_ms as u16);
        if charge < 1000 {
            world.buildings[bi].charge = charge;
            continue;
        }
        world.buildings[bi].charge = charge - 1000;
        heals.push((bi, cx, cy));
    }
    for (bi, cx, cy) in heals {
        let range = i32::from(World::def(world.buildings[bi].kind).range);
        let range2 = (range * range) as u64;
        let mut best_building: Option<(u64, usize)> = None;
        for (i, b) in world.buildings.iter().enumerate() {
            if i == bi || b.hp >= b.hp_max || b.state == B_STATE_SITE {
                continue;
            }
            let (bx, by) = centre(b.tx, b.ty, b.kind);
            let d = dist2(bx, by, cx, cy);
            if d <= range2 && best_building.is_none_or(|(bd, _)| d < bd) {
                best_building = Some((d, i));
            }
        }
        let mut best_unit: Option<(u64, usize)> = None;
        for (i, u) in world.units.iter().enumerate() {
            if u.owner != 0 || u.hp >= u.hp_max {
                continue;
            }
            let d = dist2(u.x, u.y, cx, cy);
            if d <= range2 && best_unit.is_none_or(|(bd, _)| d < bd) {
                best_unit = Some((d, i));
            }
        }
        let heal = balance::REPAIR_PER_S.max(1);
        // Prefer the closest of the two; ties go to structures.
        match (best_building, best_unit) {
            (Some((bd, i)), Some((ud, _))) if ud < bd => heal_unit(world, i, heal, cx, cy),
            (Some((_, i)), _) => {
                let b = &mut world.buildings[i];
                b.hp = (b.hp + heal).min(b.hp_max);
                let (tx, ty) = centre(b.tx, b.ty, b.kind);
                world.beam(BEAM_REPAIR, (cx, cy, 40), (tx, ty, 40), 6);
                world.effect(EFFECT_FLARE, tx, ty, 40, 8, heal);
            }
            (None, Some((_, i))) => heal_unit(world, i, heal, cx, cy),
            (None, None) => {}
        }
    }
}

fn heal_unit(world: &mut World, index: usize, heal: i32, cx: i32, cy: i32) {
    let Some(u) = world.units.get_mut(index) else {
        return;
    };
    u.hp = (u.hp + heal).min(u.hp_max);
    let (tx, ty, tz) = (u.x, u.y, u.z);
    world.beam(BEAM_REPAIR, (cx, cy, 40), (tx, ty, tz), 6);
    world.effect(EFFECT_FLARE, tx, ty, tz, 8, heal);
}

/// Centre of a building footprint in fixed point units.
fn centre(tx: i32, ty: i32, kind: u8) -> (i32, i32) {
    let size = i32::from(World::def(kind).footprint);
    (tx * FP + size * FP / 2, ty * FP + size * FP / 2)
}
