//! Hostile ground AI: raiders and siege walkers march on the colony and shoot.
//! Structures remain the objective, but nearby freight trains are also valid
//! targets, so a petroleum supply line is something the player must defend.

use oc_content::units;
use oc_protocol::{BEAM_LANCE, EFFECT_IMPACT, EVENT_DAMAGE, UNIT_STATE_ATTACK, UNIT_STATE_MOVE};

use crate::systems::targeting::{centre, facing_from, speed_per_tick, step_torus, step_xy};
use crate::world::World;

/// Every structure a raider will march on (all building kinds; the table order
/// is the wire order, so this stays stable).
const STRUCTURES: [u8; 17] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
/// Freight within this distance can distract a raider from a farther structure.
const FREIGHT_AGGRO_TILES: u64 = 6;

#[derive(Clone, Copy)]
enum RaidTarget {
    Building(usize),
    Train(usize),
}

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
        let Some((target, d2)) = choose_target(world, ui, ux, uy) else {
            continue;
        };
        let (bx, by) = match target {
            RaidTarget::Building(bi) => {
                let b = &world.buildings[bi];
                centre(b.tx, b.ty, b.kind)
            }
            RaidTarget::Train(ti) => (world.units[ti].x, world.units[ti].y),
        };
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
                match target {
                    RaidTarget::Building(bi) => {
                        let b = &world.buildings[bi];
                        let (id, hp, hp_max, tx, ty) = (b.id, b.hp, b.hp_max, b.tx, b.ty);
                        world.buildings[bi].hp -= damage;
                        let after = world.buildings[bi].hp;
                        if hp >= hp_max && after < hp_max {
                            world.event(EVENT_DAMAGE, id, damage as u32, tx as i16, ty as i16);
                        }
                    }
                    RaidTarget::Train(ti) => world.units[ti].hp -= damage,
                }
                world.beam(BEAM_LANCE, (ux, uy, 140), (bx, by, 60), 5);
                world.effect(EFFECT_IMPACT, bx, by, 60, 8, damage);
            }
        } else {
            state = UNIT_STATE_MOVE;
            let step = speed_per_tick(def.speed, dt_ms);
            if matches!(target, RaidTarget::Train(_)) {
                step_torus(&mut x, &mut y, bx, by, step);
                facing = facing_from(
                    oc_iso::torus::delta_x(bx / oc_iso::FP, x / oc_iso::FP),
                    oc_iso::torus::delta_y(by / oc_iso::FP, y / oc_iso::FP),
                );
            } else {
                step_xy(&mut x, &mut y, bx, by, step);
                facing = facing_from(bx - x, by - y);
            }
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

/// Prefer the nearest structure, unless a freight train is both nearby and
/// closer. Distances and ties use the same stable entity order as combat.
fn choose_target(world: &World, self_index: usize, x: i32, y: i32) -> Option<(RaidTarget, u64)> {
    let mut best = world
        .nearest_building(&STRUCTURES, x, y)
        .map(|(index, d2)| (RaidTarget::Building(index), d2));
    for (index, unit) in world.units.iter().enumerate() {
        if index == self_index
            || unit.kind != units::U_FREIGHT_TRAIN
            || unit.owner != 0
            || unit.hp <= 0
        {
            continue;
        }
        let d2 = oc_iso::torus::dist2_fp(x, y, unit.x, unit.y);
        if d2 > FREIGHT_AGGRO_TILES * FREIGHT_AGGRO_TILES {
            continue;
        }
        if best.is_none_or(|(_, best_d2)| d2 < best_d2) {
            best = Some((RaidTarget::Train(index), d2));
        }
    }
    best
}
