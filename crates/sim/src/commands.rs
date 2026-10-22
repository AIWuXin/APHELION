//! Command handling. Every player intent lands here; nothing else may mutate
//! the world on behalf of the client.

use oc_content::balance;
use oc_content::buildings::{self, NO_TECH};
use oc_content::routes as route_defs;
use oc_content::techs;
use oc_protocol::{
    Command, B_STATE_IDLE, B_STATE_WORKING, EVENT_BUILD_DONE, EVENT_LAUNCH, EVENT_RESEARCH,
    EVENT_SHORTAGE,
};

use crate::world::{World, SANDBOX_INFINITE, SANDBOX_INSTANT};

/// Apply one command.
pub fn apply(world: &mut World, command: Command) {
    match command {
        Command::Place { kind, tx, ty } => place(world, kind, i32::from(tx), i32::from(ty)),
        Command::Demolish { id } => demolish(world, id),
        Command::Launch { id } => launch(world, id),
        Command::ToggleRoute { route } => toggle_route(world, route),
        Command::SetSandbox { flags } => world.policy.sandbox_flags = flags,
        Command::SetAi { phase, strength } => {
            world.policy.ai_phase = phase.min(2);
            world.policy.ai_strength = strength.min(2);
        }
        Command::SetSpeed { speed } => {
            world.prev_speed = world.speed.max(1);
            world.speed = speed.min(3);
        }
        Command::Pause { paused } => {
            if paused {
                if world.speed != 0 {
                    world.prev_speed = world.speed;
                    world.speed = 0;
                }
            } else if world.speed == 0 {
                world.speed = world.prev_speed.max(1);
            }
        }
        Command::Research { tech } => research(world, tech),
    }
}

fn place(world: &mut World, kind: u8, tx: i32, ty: i32) {
    if kind >= buildings::B_COUNT {
        return;
    }
    let query = world.query_place(kind, tx, ty);
    if !query.ok {
        if !query.affordable {
            world.event(EVENT_SHORTAGE, 0, 0, tx as i16, ty as i16);
        }
        return;
    }
    let def = World::def(kind);
    world.take_alloy(def.cost_alloy);
    world.take_fuel(def.cost_fuel);
    let instant = world.sandbox(SANDBOX_INSTANT) && balance::SANDBOX_INSTANT_BUILD;
    let id = world.place_now(kind, tx, ty, instant);
    let (tx, ty) = oc_iso::torus::wrap(tx, ty);
    if instant {
        world.event(EVENT_BUILD_DONE, u32::from(kind), 0, tx as i16, ty as i16);
    }
    world.effect(
        oc_protocol::EFFECT_SPARK,
        oc_iso::torus::wrap_fp_x(tx * oc_iso::FP + oc_iso::FP),
        oc_iso::torus::wrap_fp_y(ty * oc_iso::FP + oc_iso::FP),
        0,
        18,
        id as i32,
    );
}

fn demolish(world: &mut World, id: u32) {
    let Some(pos) = world.buildings.iter().position(|b| b.id == id) else {
        return;
    };
    let building = world.buildings[pos].clone();
    if building.kind == buildings::B_HQ {
        return;
    }
    let def = World::def(building.kind);
    let refund = def.cost_alloy * balance::DEMOLISH_REFUND / 1000;
    world.add_alloy(refund);
    let size = i32::from(def.footprint);
    world.map.fill(building.tx, building.ty, size, 0);
    world.buildings.remove(pos);
    world.effect(
        oc_protocol::EFFECT_EXPLODE,
        oc_iso::torus::wrap_fp_x(building.tx * oc_iso::FP + size * oc_iso::FP / 2),
        oc_iso::torus::wrap_fp_y(building.ty * oc_iso::FP + size * oc_iso::FP / 2),
        0,
        14,
        refund,
    );
}

fn launch(world: &mut World, id: u32) {
    let Some(pos) = world.buildings.iter().position(|b| b.id == id) else {
        return;
    };
    let ready = {
        let b = &world.buildings[pos];
        b.kind == buildings::B_PAD && b.state == B_STATE_IDLE && b.aux == 0 && b.progress >= 1000
    };
    if !ready {
        return;
    }
    if !world.take_fuel(balance::LAUNCH_FUEL) {
        world.event(EVENT_SHORTAGE, 0, 1, -1, -1);
        return;
    }
    world.take_alloy(balance::LAUNCH_ALLOY);
    let b = &mut world.buildings[pos];
    b.state = B_STATE_WORKING;
    b.charge = 0;
    b.progress = 0;
    world.event(EVENT_LAUNCH, id, 0, -1, -1);
}

fn toggle_route(world: &mut World, route: u8) {
    let idx = route as usize;
    let Some(def) = route_defs::ROUTES.get(idx) else {
        return;
    };
    if world.routes[idx].active {
        world.routes[idx].active = false;
        world.routes[idx].progress = 0;
        world.routes[idx].grade = 0;
        world.routes[idx].throughput = 0;
        return;
    }
    // A lane needs a freight dock to load, a launch pad to lift the cargo and
    // spare orbital capacity (rockets + relay masts) to keep it open.
    // `EVENT_SHORTAGE` b = 2 means "no dock/pad", b = 1 means "no lift".
    if world.count_done(buildings::B_DOCK) == 0 || world.count_done(buildings::B_PAD) == 0 {
        world.event(EVENT_SHORTAGE, u32::from(route), 2, -1, -1);
        return;
    }
    if world.routes_used() + def.capacity > world.orbital_capacity() {
        world.event(EVENT_SHORTAGE, u32::from(route), 1, -1, -1);
        return;
    }
    world.routes[idx].active = true;
    world.routes[idx].progress = 0;
    world.routes[idx].throughput = 0;
}

fn research(world: &mut World, tech: u8) {
    let idx = tech as usize;
    let Some(def) = techs::TECHS.get(idx) else {
        return;
    };
    if world.has_tech(tech) {
        return;
    }
    if def.requires != NO_TECH && !world.has_tech(def.requires) {
        return;
    }
    if world.sandbox(SANDBOX_INFINITE) {
        world.res.research = world.res.research.max(balance::SANDBOX_RESOURCE_FLOOR);
    }
    if world.res.research < def.cost {
        return;
    }
    world.res.research -= def.cost;
    world.techs |= 1 << (tech & 31);
    world.event(EVENT_RESEARCH, u32::from(tech), 0, -1, -1);
}
