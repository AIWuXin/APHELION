//! Shared targeting and damage helpers for the combat systems.
//!
//! Everything here is integer-only and scanning order is fixed (units first,
//! then ships, ties to the earlier entity) so replays resolve identically.

use oc_content::units;
use oc_iso::fixed::{dist2, FP};
use oc_protocol::UNIT_STATE_DYING;

use crate::world::World;

/// A hostile entity a player weapon can hit.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Target {
    /// Index into `World::units`.
    Unit(usize),
    /// Index into `World::ships`.
    Ship(usize),
}

/// One resolved target contact.
#[derive(Clone, Copy, Debug)]
pub struct Contact {
    /// What to shoot.
    pub target: Target,
    /// Target position in fixed point units.
    pub x: i32,
    /// Target position in fixed point units.
    pub y: i32,
    /// Target altitude in fixed point units.
    pub z: i32,
    /// Target entity id.
    pub id: u32,
    /// Squared distance in tile^2 (used for "nearest" ordering).
    pub d2: u64,
}

/// Nearest hostile in weapon range.
///
/// `air = false` is a ground gun: it sees ground-layer units only.
/// `air = true` is flak: it sees air-layer units and air-layer ships
/// (dropships), which is what makes the two defensive buildings complementary.
#[must_use]
pub fn nearest_hostile(
    world: &World,
    x: i32,
    y: i32,
    range_tiles: i32,
    air: bool,
) -> Option<Contact> {
    let range2 = (range_tiles.max(0) as u64) * (range_tiles.max(0) as u64);
    let want_layer = if air {
        units::LAYER_AIR
    } else {
        units::LAYER_GROUND
    };
    let mut best: Option<Contact> = None;
    for (i, u) in world.units.iter().enumerate() {
        if u.owner != 1 || u.hp <= 0 || World::unit_def(u.kind).layer != want_layer {
            continue;
        }
        let d2 = dist2(u.x, u.y, x, y);
        if d2 > range2 {
            continue;
        }
        if best.is_none_or(|b| d2 < b.d2) {
            best = Some(Contact {
                target: Target::Unit(i),
                x: u.x,
                y: u.y,
                z: u.z,
                id: u.id,
                d2,
            });
        }
    }
    if air {
        for (i, s) in world.ships.iter().enumerate() {
            if s.owner != 1 || s.hp <= 0 || World::unit_def(s.kind).layer != units::LAYER_AIR {
                continue;
            }
            let d2 = dist2(s.x, s.y, x, y);
            if d2 > range2 {
                continue;
            }
            if best.is_none_or(|b| d2 < b.d2) {
                best = Some(Contact {
                    target: Target::Ship(i),
                    x: s.x,
                    y: s.y,
                    z: s.z,
                    id: s.id,
                    d2,
                });
            }
        }
    }
    best
}

/// Nearest hostile of any layer a player interceptor can chase (ground units,
/// air units and dropships). `range_tiles == 0` means "unlimited".
#[must_use]
pub fn nearest_hostile_any(world: &World, x: i32, y: i32, range_tiles: i32) -> Option<Contact> {
    let range2 = if range_tiles <= 0 {
        u64::MAX
    } else {
        (range_tiles as u64) * (range_tiles as u64)
    };
    let mut best: Option<Contact> = None;
    for (i, u) in world.units.iter().enumerate() {
        if u.owner != 1 || u.hp <= 0 {
            continue;
        }
        let d2 = dist2(u.x, u.y, x, y);
        if d2 > range2 {
            continue;
        }
        if best.is_none_or(|b| d2 < b.d2) {
            best = Some(Contact {
                target: Target::Unit(i),
                x: u.x,
                y: u.y,
                z: u.z,
                id: u.id,
                d2,
            });
        }
    }
    for (i, s) in world.ships.iter().enumerate() {
        if s.owner != 1 || s.hp <= 0 || World::unit_def(s.kind).layer != units::LAYER_AIR {
            continue;
        }
        let d2 = dist2(s.x, s.y, x, y);
        if d2 > range2 {
            continue;
        }
        if best.is_none_or(|b| d2 < b.d2) {
            best = Some(Contact {
                target: Target::Ship(i),
                x: s.x,
                y: s.y,
                z: s.z,
                id: s.id,
                d2,
            });
        }
    }
    best
}

/// Apply damage. Lethal hits switch the entity to the dying state; the cull
/// passes in [`crate::systems::combat`] remove it and pay the bounty.
pub fn apply_damage(world: &mut World, target: Target, damage: i32) {
    if damage <= 0 {
        return;
    }
    match target {
        Target::Unit(i) => {
            let Some(u) = world.units.get_mut(i) else {
                return;
            };
            if u.hp <= 0 {
                return;
            }
            u.hp -= damage;
            if u.hp <= 0 {
                u.hp = 0;
                u.state = UNIT_STATE_DYING;
            }
        }
        Target::Ship(i) => {
            let Some(s) = world.ships.get_mut(i) else {
                return;
            };
            if s.hp <= 0 {
                return;
            }
            s.hp -= damage;
            if s.hp <= 0 {
                s.hp = 0;
                s.state = UNIT_STATE_DYING;
            }
        }
    }
}

/// Fixed point movement per tick from a unit-row speed (`1/16 tile/s`).
#[must_use]
pub fn speed_per_tick(row_speed: i32, dt_ms: u32) -> i32 {
    ((row_speed * FP / 16 / 30) * (dt_ms as i32) / 33).max(1)
}

/// Move `step` fixed point units toward the target, without overshooting.
pub fn step_xy(x: &mut i32, y: &mut i32, tx: i32, ty: i32, step: i32) {
    let dx = tx - *x;
    let dy = ty - *y;
    if dx.abs() <= step && dy.abs() <= step {
        *x = tx;
        *y = ty;
        return;
    }
    let dist = oc_iso::fixed::isqrt(dist2(*x, *y, tx, ty) as u32).max(1) as i64;
    let denom = dist * i64::from(FP);
    *x += ((i64::from(dx) * i64::from(step)) / denom) as i32;
    *y += ((i64::from(dy) * i64::from(step)) / denom) as i32;
}

/// Freight-only movement over the shortest toroidal path. Existing combat
/// movement keeps its original semantics; the new supply lines handle seams.
pub fn step_torus(x: &mut i32, y: &mut i32, tx: i32, ty: i32, step: i32) -> bool {
    let dx = wrapped_delta(tx, *x, oc_iso::grid::MAP_W * FP);
    let dy = wrapped_delta(ty, *y, oc_iso::grid::MAP_H * FP);
    if dx.abs() <= step && dy.abs() <= step {
        *x = tx;
        *y = ty;
        return true;
    }
    let dist = oc_iso::fixed::isqrt(dist2(0, 0, dx, dy) as u32).max(1) as i64;
    let denom = dist * i64::from(FP);
    *x = oc_iso::torus::wrap_fp_x(*x + ((i64::from(dx) * i64::from(step)) / denom) as i32);
    *y = oc_iso::torus::wrap_fp_y(*y + ((i64::from(dy) * i64::from(step)) / denom) as i32);
    false
}

fn wrapped_delta(target: i32, current: i32, span: i32) -> i32 {
    oc_iso::torus::rem_euclid(target - current + span / 2, span) - span / 2
}

/// Facing octant from a direction vector.
#[must_use]
pub fn facing_from(dx: i32, dy: i32) -> u8 {
    if dx.abs() > dy.abs() * 2 {
        return if dx > 0 { 2 } else { 6 };
    }
    if dy.abs() > dx.abs() * 2 {
        return if dy > 0 { 4 } else { 0 };
    }
    match (dx > 0, dy > 0) {
        (true, true) => 3,
        (true, false) => 1,
        (false, true) => 5,
        (false, false) => 7,
    }
}

/// Centre of a building footprint in fixed point units.
///
/// Wrapped, so a hub anchored on the seam reports the centre the renderer draws
/// its explosions over instead of a position one planet-width away.
#[must_use]
pub fn centre(tx: i32, ty: i32, kind: u8) -> (i32, i32) {
    let size = i32::from(World::def(kind).footprint);
    (
        oc_iso::torus::wrap_fp_x(tx * FP + size * FP / 2),
        oc_iso::torus::wrap_fp_y(ty * FP + size * FP / 2),
    )
}
