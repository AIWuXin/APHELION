//! Hostile ground AI: raiders and siege walkers march on the colony and shoot.
//!
//! Ground hostiles only ever target structures, which is what makes the rail
//! turret (ground-only) the answer to them: flak cannot depress far enough.

use oc_content::units;
use oc_protocol::{BEAM_LANCE, EFFECT_IMPACT, EVENT_DAMAGE, UNIT_STATE_ATTACK, UNIT_STATE_MOVE};

use crate::systems::targeting::{centre, facing_from, speed_per_tick, step_xy};
use crate::world::World;

/// Every structure a raider will march on (all building kinds; the table order
/// is the wire order, so this stays stable).
const STRUCTURES: [u8; 14] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

/// Advance every hostile ground unit.
pub fn update(world: &mut World, dt_ms: u32) {
    for ui in 0..world.units.len() {
        let u = &world.units[ui];
        if u.owner != 1 || u.hp <= 0 {
            continue;
        }
        let def = World::unit_def(u.kind);
        if def.layer != units::LAYER_GROUND {
            continue;
        }
        let (ux, uy) = (u.x, u.y);
        let Some((bi, d2)) = world.nearest_building(&STRUCTURES, ux, uy) else {
            continue;
        };
        let b = &world.buildings[bi];
        let (bx, by) = centre(b.tx, b.ty, b.kind);
        let (bx_id, b_hp, b_hp_max, b_tx, b_ty) = (b.id, b.hp, b.hp_max, b.tx, b.ty);
        // A reach of 1..2 tiles: adjacent units bite, diagonal neighbours too.
        let reach = u64::from(def.range.max(1) as u32) + 1;
        let mut cooldown = u.cooldown.saturating_sub(dt_ms);
        let mut x = ux;
        let mut y = uy;
        let mut facing = u.facing;
        let state;
        if d2 <= reach * reach {
            state = UNIT_STATE_ATTACK;
            if cooldown == 0 {
                cooldown = def.cooldown_ms;
                let damage = def.damage;
                world.buildings[bi].hp -= damage;
                let after = world.buildings[bi].hp;
                world.beam(BEAM_LANCE, (ux, uy, 140), (bx, by, 60), 5);
                world.effect(EFFECT_IMPACT, bx, by, 60, 8, damage);
                if b_hp >= b_hp_max && after < b_hp_max {
                    world.event(EVENT_DAMAGE, bx_id, damage as u32, b_tx as i16, b_ty as i16);
                }
            }
        } else {
            state = UNIT_STATE_MOVE;
            let step = speed_per_tick(def.speed, dt_ms);
            step_xy(&mut x, &mut y, bx, by, step);
            facing = facing_from(bx - x, by - y);
        }
        let unit = &mut world.units[ui];
        unit.x = x;
        unit.y = y;
        unit.gx = bx;
        unit.gy = by;
        unit.cooldown = cooldown;
        unit.state = state;
        unit.facing = facing;
    }
}
