//! Economy: energy balance, extraction, fuel synthesis and research.
//!
//! Power is an all-or-nothing budget: when demand exceeds supply every
//! consumer stops (that is what makes an extra solar array matter). Fuel
//! synthesis is explicitly alloy-gated so it can never create fuel for free.

use oc_content::balance;
use oc_content::buildings;
use oc_protocol::{B_STATE_BLOCKED, B_STATE_IDLE, B_STATE_SITE, B_STATE_WORKING, EVENT_POWER};

use crate::world::{World, MAX_FUEL, MAX_RESEARCH, SANDBOX_INFINITE};

/// Flags reported to the HUD (`BuildingView::flags`).
const FLAG_POWERED: u8 = 1;
const FLAG_DEPOSIT: u8 = 2;
const FLAG_DAMAGED: u8 = 4;
const FLAG_SELECTABLE: u8 = 8;

/// Rates are per minute; convert one tick of `dt_ms` into milli-units.
/// `rate * dt_ms / 1000` is units per tick, so `* 1000` for the accumulator and
/// `/ 60_000` for the minute gives `rate * dt_ms / 60`.
fn milli_per_tick(rate: i32, dt_ms: u32) -> i32 {
    rate * dt_ms as i32 / 60
}

/// Recompute energy, production flags and stockpiles.
pub fn update(world: &mut World, dt_ms: u32) {
    let powered = energy_balance(world);

    let materials = if world.has_tech(oc_content::techs::T_MATERIALS) {
        1000 + balance::MATERIALS_BONUS
    } else {
        1000
    };
    let mut alloy_milli = 0;
    let mut fuel_milli = 0;
    let mut research_milli = 0;
    let mut rate_alloy = 0;
    let mut rate_fuel = 0;
    let mut rate_research = 0;

    // ---- extraction and research -----------------------------------------
    // Only production buildings own their `state` here: pads, hangars and guns
    // are driven by their own systems and must not be reset to idle.
    for b in &mut world.buildings {
        if b.state == B_STATE_SITE {
            continue;
        }
        let mut working = false;
        match b.kind {
            buildings::B_REFINERY => {
                let richness = world.map.footprint_deposit(b.tx, b.ty, 2);
                b.aux = richness.clamp(0, i32::from(u16::MAX)) as u32;
                if powered && richness > 0 {
                    // A richer seam means a fatter ore stream: 1000 permille
                    // base, up to 1800 for a pure deposit footprint.
                    let permille = (1000 + richness * 3 / 2).min(1800);
                    let amount = balance::REFINERY_PER_MIN * permille / 1000 * materials / 1000;
                    alloy_milli += milli_per_tick(amount, dt_ms);
                    rate_alloy += amount;
                    working = true;
                }
                b.state = if working {
                    B_STATE_WORKING
                } else {
                    B_STATE_IDLE
                };
            }
            buildings::B_LAB => {
                if powered {
                    let amount = balance::LAB_PER_MIN;
                    research_milli += milli_per_tick(amount, dt_ms);
                    rate_research += amount;
                    working = true;
                }
                b.state = if working {
                    B_STATE_WORKING
                } else {
                    B_STATE_IDLE
                };
            }
            _ => {}
        }
    }

    // ---- fuel synthesis: convert alloy, never conjure fuel ---------------
    let mut alloy_drain = 0;
    let mut budget_milli = world.res.alloy.max(0) * 1000 + world.res.a_alloy + alloy_milli;
    for b in &mut world.buildings {
        if b.state == B_STATE_SITE || b.kind != buildings::B_FUEL {
            continue;
        }
        let cost = milli_per_tick(balance::FUEL_ALLOY_PER_MIN, dt_ms);
        if powered && budget_milli >= cost {
            budget_milli -= cost;
            alloy_drain += cost;
            let amount = balance::FUEL_PER_MIN;
            fuel_milli += milli_per_tick(amount, dt_ms);
            rate_fuel += amount;
            b.state = B_STATE_WORKING;
        } else if powered {
            b.state = B_STATE_BLOCKED;
        } else {
            b.state = B_STATE_IDLE;
        }
    }

    // ---- commit the milli-unit accumulators ------------------------------
    world.res.a_alloy += alloy_milli - alloy_drain;
    world.res.a_fuel += fuel_milli;
    world.res.a_research += research_milli;

    let alloy_units = world.res.a_alloy.div_euclid(1000);
    world.res.a_alloy = world.res.a_alloy.rem_euclid(1000);
    world.add_alloy(alloy_units);

    let fuel_units = world.res.a_fuel.div_euclid(1000);
    world.res.a_fuel = world.res.a_fuel.rem_euclid(1000);
    if !world.sandbox(SANDBOX_INFINITE) {
        world.res.fuel = (world.res.fuel + fuel_units).clamp(0, MAX_FUEL);
    }

    let research_units = world.res.a_research.div_euclid(1000);
    world.res.a_research = world.res.a_research.rem_euclid(1000);
    world.res.research = (world.res.research + research_units).clamp(0, MAX_RESEARCH);

    if world.sandbox(SANDBOX_INFINITE) {
        world.res.alloy = world.res.alloy.max(balance::SANDBOX_RESOURCE_FLOOR);
        world.res.fuel = world.res.fuel.max(9_000);
        world.res.research = world.res.research.max(balance::SANDBOX_RESOURCE_FLOOR);
    }

    apply_flags(world, powered);
    world.alloy_rate = rate_alloy;
    world.fuel_rate = rate_fuel;
    world.research_rate = rate_research;
}

/// Recompute energy output/demand and report the "everything powered" verdict.
fn energy_balance(world: &mut World) -> bool {
    let mut out = 0;
    let mut consumed = 0;
    for b in &world.buildings {
        if b.state == B_STATE_SITE {
            continue;
        }
        let def = World::def(b.kind);
        let mut energy = def.energy;
        if b.kind == buildings::B_HQ && world.has_tech(oc_content::techs::T_REACTOR) {
            energy += 12;
        }
        if energy >= 0 {
            out += energy;
        } else {
            consumed += -energy;
        }
    }
    let deficit = (consumed - out).max(0);
    if deficit > 0 && world.tick.is_multiple_of(60) {
        world.event(EVENT_POWER, deficit as u32, 0, -1, -1);
    }
    world.energy_out = out;
    world.energy_in = consumed;
    consumed <= out
}

/// HUD flags: powered / sitting on a deposit / damaged / selectable.
fn apply_flags(world: &mut World, powered: bool) {
    let map = &world.map;
    for b in &mut world.buildings {
        if b.state == B_STATE_SITE {
            b.flags = 0;
            continue;
        }
        let size = i32::from(World::def(b.kind).footprint);
        let mut flags = FLAG_SELECTABLE;
        if powered {
            flags |= FLAG_POWERED;
        }
        if map.footprint_deposit(b.tx, b.ty, size) > 0 {
            flags |= FLAG_DEPOSIT;
        }
        if b.hp < b.hp_max {
            flags |= FLAG_DAMAGED;
        }
        b.flags = flags;
    }
}
