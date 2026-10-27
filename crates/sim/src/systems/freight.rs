//! Ground petroleum freight. Wells own local tanks; only a train arrival at the
//! command hub delivers crude to the chemical stockpile.

use oc_content::{balance, buildings, units};
use oc_iso::fixed::FP;
use oc_protocol::{B_STATE_SITE, UNIT_STATE_DOCKED, UNIT_STATE_MOVE};

use crate::state::Unit;
use crate::systems::targeting::{centre, facing_from, speed_per_tick, step_torus};
use crate::world::{World, SANDBOX_INFINITE};

/// Persistent ownership bit: the first train was included in the well's price.
pub const FLAG_TRAIN_STARTED: u8 = 16;

/// Replace missing trains, then advance every active train by one fixed tick.
pub fn update(world: &mut World, dt_ms: u32) {
    remove_orphan_trains(world);
    ensure_trains(world, dt_ms);
    let delivered = move_trains(world, dt_ms);
    let instant = delivered * 60_000 / dt_ms.max(1) as i32;
    world.oil_rate = (world.oil_rate * 255 + instant) / 256;
}

/// A dismantled/destroyed well never leaves a phantom source or a cargo refund.
fn remove_orphan_trains(world: &mut World) {
    world.units.retain(|unit| {
        if unit.kind != units::U_FREIGHT_TRAIN || unit.hp <= 0 {
            return true;
        }
        world.buildings.iter().any(|b| {
            b.id == unit.home
                && b.kind == buildings::B_OIL_WELL
                && b.state != B_STATE_SITE
                && b.hp > 0
        })
    });
}

/// One active train per finished well. The first is included; later ones use a
/// visible cooldown and a normal alloy cost, with no per-tick spending loop.
fn ensure_trains(world: &mut World, dt_ms: u32) {
    let mut spawns = Vec::new();
    let infinite = world.sandbox(SANDBOX_INFINITE);
    let available_alloy = world.res.alloy;
    let mut reserved_alloy = 0;
    for (index, building) in world.buildings.iter_mut().enumerate() {
        if building.kind != buildings::B_OIL_WELL || building.state == B_STATE_SITE {
            continue;
        }
        let active = world.units.iter().any(|unit| {
            unit.kind == units::U_FREIGHT_TRAIN && unit.home == building.id && unit.hp > 0
        });
        if active {
            continue;
        }
        if building.flags & FLAG_TRAIN_STARTED == 0 {
            building.flags |= FLAG_TRAIN_STARTED;
            spawns.push((index, true));
            continue;
        }
        if building.charge == 0 {
            building.charge = balance::TRAIN_REBUILD_MS;
        }
        building.charge = building.charge.saturating_sub(dt_ms as u16);
        if building.charge == 0 {
            let price = balance::TRAIN_REBUILD_ALLOY;
            let affordable = infinite || available_alloy >= reserved_alloy + price;
            if affordable {
                reserved_alloy += price;
                spawns.push((index, false));
            } else {
                building.charge = 1000;
            }
        }
    }
    for (index, included) in spawns {
        if !included {
            world.take_alloy(balance::TRAIN_REBUILD_ALLOY);
        }
        spawn_train(world, index);
    }
}

/// Spawn an empty train waiting at its home tank.
fn spawn_train(world: &mut World, well_index: usize) {
    let (home, tx, ty) = {
        let well = &world.buildings[well_index];
        (well.id, well.tx, well.ty)
    };
    let (x, y) = centre(tx, ty, buildings::B_OIL_WELL);
    let id = world.alloc_id();
    let def = World::unit_def(units::U_FREIGHT_TRAIN);
    world.units.push(Unit {
        id,
        kind: units::U_FREIGHT_TRAIN,
        x,
        y,
        z: 0,
        gx: x,
        gy: y,
        hp: def.hp,
        hp_max: def.hp,
        state: UNIT_STATE_DOCKED,
        facing: 0,
        owner: 0,
        target: home,
        cooldown: 0,
        home,
        cargo: 0,
    });
}

/// Load at wells, move over the shortest toroidal path, and unload only at the
/// hub. Full 30-unit loads use the tank efficiently; 10-unit partial loads make
/// the first chemical input arrive in time for the normal campaign.
fn move_trains(world: &mut World, dt_ms: u32) -> i32 {
    let hub = world
        .buildings
        .iter()
        .find(|b| b.kind == buildings::B_HQ && b.state != B_STATE_SITE && b.hp > 0)
        .map(|b| (b.id, b.tx, b.ty));
    let Some((hub_id, hub_tx, hub_ty)) = hub else {
        return 0;
    };
    let (hub_x, hub_y) = centre(hub_tx, hub_ty, buildings::B_HQ);
    let mut delivered = 0;
    for index in 0..world.units.len() {
        let unit = &world.units[index];
        if unit.kind != units::U_FREIGHT_TRAIN || unit.hp <= 0 {
            continue;
        }
        let (state, home, target, cargo, x, y) = (
            unit.state,
            unit.home,
            unit.target,
            unit.cargo,
            unit.x,
            unit.y,
        );
        let Some(well_index) = world.buildings.iter().position(|b| {
            b.id == home && b.kind == buildings::B_OIL_WELL && b.state != B_STATE_SITE
        }) else {
            continue;
        };
        let (well_tx, well_ty) = {
            let well = &world.buildings[well_index];
            (well.tx, well.ty)
        };
        let (well_x, well_y) = centre(well_tx, well_ty, buildings::B_OIL_WELL);
        if state == UNIT_STATE_DOCKED {
            if target == home {
                let stock = world.buildings[well_index].aux;
                if cargo == 0 && stock >= balance::TRAIN_MIN_LOAD {
                    let load = stock.min(balance::TRAIN_CAPACITY);
                    world.buildings[well_index].aux -= load;
                    let unit = &mut world.units[index];
                    unit.cargo = load;
                    unit.target = hub_id;
                    unit.gx = hub_x;
                    unit.gy = hub_y;
                    unit.state = UNIT_STATE_MOVE;
                }
            } else {
                delivered += cargo as i32;
                world.add_oil(cargo as i32);
                let unit = &mut world.units[index];
                unit.cargo = 0;
                unit.target = home;
                unit.gx = well_x;
                unit.gy = well_y;
                unit.state = UNIT_STATE_MOVE;
            }
            continue;
        }
        let (goal_x, goal_y) = if target == home {
            (well_x, well_y)
        } else {
            (hub_x, hub_y)
        };
        let mut next_x = x;
        let mut next_y = y;
        let arrived = step_torus(
            &mut next_x,
            &mut next_y,
            goal_x,
            goal_y,
            speed_per_tick(World::unit_def(units::U_FREIGHT_TRAIN).speed, dt_ms),
        );
        let unit = &mut world.units[index];
        unit.x = next_x;
        unit.y = next_y;
        unit.gx = goal_x;
        unit.gy = goal_y;
        unit.facing = facing_from(
            oc_iso::torus::delta_x(goal_x / FP, next_x / FP),
            oc_iso::torus::delta_y(goal_y / FP, next_y / FP),
        );
        if arrived {
            unit.state = UNIT_STATE_DOCKED;
        }
    }
    delivered
}
