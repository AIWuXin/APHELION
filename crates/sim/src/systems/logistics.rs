//! Logistics: orbital lanes draw on lift capacity, deliver cargo, spawn haulers.
//!
//! A lane is only supplied as far as spare capacity allows: capacity is
//! allocated to lanes in table order, so destroying a relay mast starves the
//! later lanes first. `RouteView.grade` is that supply ratio in permille and
//! `RouteView.throughput` is its smoothed HUD value; deliveries scale with the
//! grade, so opening a third lane before building enough lift visibly pays less.
//! Ground petroleum freight runs last in this stage, preserving the six original
//! system positions; normal era milestones run separately after the director.

use oc_content::buildings;
use oc_content::routes::ROUTES;
use oc_content::units;
use oc_iso::fixed::FP;
use oc_protocol::{EFFECT_TRAIL, EVENT_ROUTE, UNIT_STATE_MOVE};

use crate::state::Ship;
use crate::world::{World, MAX_RESEARCH, TICK_MS};

/// Internal lane progress scale: 1000 snapshot units x 30 sub-steps. A 24 s
/// lane is 727 ticks, so whole permille would round the period by up to 27%.
pub const LANE_PROGRESS_SCALE: u16 = 30;
/// Internal lane progress at which one load is delivered.
const LANE_PROGRESS_MAX: u32 = 1000 * LANE_PROGRESS_SCALE as u32;

/// Advance every open lane and fly the haulers.
pub fn update(world: &mut World, dt_ms: u32) {
    let dock = world.count_done(buildings::B_DOCK) > 0;
    let pad = world.count_done(buildings::B_PAD) > 0;
    let mut remaining = world.orbital_capacity();
    let mut deliveries = 0u32;
    for (idx, def) in ROUTES.iter().enumerate() {
        if !world.routes[idx].active {
            world.routes[idx].progress = 0;
            world.routes[idx].grade = 0;
            world.routes[idx].throughput = decay(world.routes[idx].throughput);
            continue;
        }
        let alloc = def.capacity.min(remaining);
        remaining = remaining.saturating_sub(alloc);
        let grade = permille(alloc, def.capacity);
        world.routes[idx].grade = grade;
        let prev = i32::from(world.routes[idx].throughput);
        let target = i32::from(grade);
        world.routes[idx].throughput = (prev + (target - prev) / 4).clamp(0, 1000) as u16;
        if !dock || !pad || grade == 0 {
            // Docked or starved: the lane holds its phase but delivers nothing.
            continue;
        }
        let step = (dt_ms * LANE_PROGRESS_MAX / def.period_ms.max(1)).max(1);
        let progress = u32::from(world.routes[idx].progress) + step;
        if progress < LANE_PROGRESS_MAX {
            world.routes[idx].progress = progress as u16;
            continue;
        }
        world.routes[idx].progress = (progress - LANE_PROGRESS_MAX) as u16;
        world.routes[idx].loads = world.routes[idx].loads.saturating_add(1);
        let alloy = def.alloy * i32::from(grade) / 1000;
        let research = def.research * i32::from(grade) / 1000;
        world.add_alloy(alloy);
        world.res.research = (world.res.research + research).clamp(0, MAX_RESEARCH);
        world.event(EVENT_ROUTE, alloy as u32, research as u32, -1, -1);
        deliveries += 1;
    }
    for _ in 0..deliveries {
        spawn_hauler(world);
    }
    fly_haulers(world, dt_ms);
    crate::systems::freight::update(world, dt_ms);
}

fn permille(part: u16, whole: u16) -> u16 {
    if whole == 0 {
        return 0;
    }
    ((u32::from(part) * 1000 / u32::from(whole)).min(1000)) as u16
}

fn decay(value: u16) -> u16 {
    value.saturating_sub((value / 4).max(1))
}

fn spawn_hauler(world: &mut World) {
    let Some((tx, ty)) = world
        .buildings
        .iter()
        .find(|b| b.kind == buildings::B_DOCK && b.state != oc_protocol::B_STATE_SITE)
        .map(|b| (b.tx, b.ty))
    else {
        return;
    };
    let x = tx * FP + FP;
    let y = ty * FP + FP;
    let id = world.alloc_id();
    world.ships.push(Ship {
        id,
        kind: units::U_HAULER,
        x,
        y,
        z: 220,
        hp: 60,
        hp_max: 60,
        state: UNIT_STATE_MOVE,
        phase: 0,
        owner: 0,
        target: 0,
        cooldown: 0,
    });
    world.effect(EFFECT_TRAIL, x, y, 120, 22, 0);
}

/// Haulers fly a short arc up toward the orbital ring and despawn at the top.
fn fly_haulers(world: &mut World, dt_ms: u32) {
    let mut remove: Vec<usize> = Vec::new();
    for (i, s) in world.ships.iter_mut().enumerate() {
        if s.kind != units::U_HAULER {
            continue;
        }
        s.z += 26 * (dt_ms as i32) / i32::from(TICK_MS as u16);
        s.phase = s.phase.saturating_add(4);
        if s.z > 2400 {
            remove.push(i);
        }
    }
    for i in remove.into_iter().rev() {
        world.ships.remove(i);
    }
}
