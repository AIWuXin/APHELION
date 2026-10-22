//! Combat: defensive guns, interceptors, hostile raiders and damage resolution.
//!
//! Execution order inside the stage is fixed: guns fire, interceptors fly,
//! raiders act, then the dead are culled and the campaign is checked. Culling
//! after every weapon pass keeps entity indices stable while shots resolve.

use oc_content::balance;
use oc_content::buildings;
use oc_iso::fixed::FP;
use oc_protocol::{EFFECT_EXPLODE, EVENT_KILL, STATUS_RUNNING, UNIT_STATE_DYING};

use crate::systems::{air, raiders};
use crate::world::World;

/// Run the whole combat stage.
pub fn update(world: &mut World, dt_ms: u32) {
    air::turrets(world, dt_ms);
    air::interceptors(world, dt_ms);
    raiders::update(world, dt_ms);
    cull_units(world);
    cull_ships(world);
    demolish_wrecked(world);
    check_defeat(world);
}

/// Remove dead ground units and pay the bounty for hostile kills only.
fn cull_units(world: &mut World) {
    let mut killed = 0u32;
    let mut first: Option<(i32, i32)> = None;
    let mut i = 0;
    while i < world.units.len() {
        if world.units[i].hp > 0 {
            i += 1;
            continue;
        }
        let u = world.units.remove(i);
        world.effect(EFFECT_EXPLODE, u.x, u.y, u.z, 16, 0);
        if u.owner == 1 {
            killed += 1;
            if first.is_none() {
                first = Some((u.x, u.y));
            }
        }
    }
    if killed > 0 {
        let (tx, ty) = first.map_or((-1, -1), |(x, y)| (x / FP, y / FP));
        world.event(EVENT_KILL, killed, 0, tx as i16, ty as i16);
        world.add_alloy(killed as i32 * balance::KILL_ALLOY_UNIT);
    }
}

/// Remove destroyed hostile ships (dropships shot down mid-descent).
fn cull_ships(world: &mut World) {
    let mut killed = 0u32;
    let mut first: Option<(i32, i32)> = None;
    let mut i = 0;
    while i < world.ships.len() {
        let dead = world.ships[i].owner == 1
            && (world.ships[i].hp <= 0 || world.ships[i].state == UNIT_STATE_DYING);
        if !dead {
            i += 1;
            continue;
        }
        let s = world.ships.remove(i);
        world.effect(EFFECT_EXPLODE, s.x, s.y, s.z, 22, 0);
        killed += 1;
        if first.is_none() {
            first = Some((s.x, s.y));
        }
    }
    if killed > 0 {
        let (tx, ty) = first.map_or((-1, -1), |(x, y)| (x / FP, y / FP));
        world.event(EVENT_KILL, killed, 1, tx as i16, ty as i16);
        world.add_alloy(killed as i32 * balance::KILL_ALLOY_SHIP);
    }
}

/// Structures at zero hit points explode and free their tiles.
fn demolish_wrecked(world: &mut World) {
    let mut wrecked: Vec<(i32, i32, u8, i32)> = Vec::new();
    for b in &world.buildings {
        if b.hp <= 0 {
            wrecked.push((b.tx, b.ty, b.kind, i32::from(World::def(b.kind).footprint)));
        }
    }
    for (tx, ty, kind, size) in wrecked {
        // Centre of the footprint, not of its anchor tile: the hub is 3x3, so
        // its wreck must bloom over the tower rather than its north-west tile.
        // Wrapped, so a footprint straddling the seam still explodes where it
        // stands instead of one planet-width away.
        world.effect(
            EFFECT_EXPLODE,
            oc_iso::torus::wrap_fp_x(tx * FP + size * FP / 2),
            oc_iso::torus::wrap_fp_y(ty * FP + size * FP / 2),
            40,
            22,
            i32::from(kind),
        );
        for y in ty..ty + size {
            for x in tx..tx + size {
                world.map.set_occupied(x, y, 0);
            }
        }
    }
    world.buildings.retain(|b| b.hp > 0);
}

/// Losing the command hub ends the campaign.
fn check_defeat(world: &mut World) {
    if world.count_kind(buildings::B_HQ) == 0 && world.status == STATUS_RUNNING {
        world.finish(false);
    }
}
