//! Economy: energy balance, extraction, coal burn, fuel synthesis and research.
//!
//! Power is an all-or-nothing budget: when demand exceeds supply every
//! consumer stops (that is what makes an extra solar array matter). Fuel
//! synthesis is explicitly alloy-gated so it can never create fuel for free;
//! thermal plants are coal-gated for the same reason.

use oc_content::balance;
use oc_content::buildings;
use oc_protocol::{B_STATE_BLOCKED, B_STATE_IDLE, B_STATE_SITE, B_STATE_WORKING, EVENT_POWER};

use crate::world::{World, MAX_COAL, MAX_FUEL, MAX_RESEARCH, SANDBOX_INFINITE};

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
    // Thermal plants burn from the coal stockpile as it stood at the start of
    // the tick; this tick's mine output is committed afterwards. That ordering
    // is deliberate: a cold colony has to boot on solar and mined coal before a
    // thermal plant can take over the base load.
    let infinite = world.sandbox(SANDBOX_INFINITE);
    let mut coal_budget = if infinite {
        i32::MAX
    } else {
        world.res.coal.max(0) * 1000 + world.res.a_coal
    };
    let mut coal_burn = 0;
    let plants = plan_thermal_plants(world, &mut coal_budget, &mut coal_burn, dt_ms);
    let powered = energy_balance(world, &plants);

    let materials = if world.has_tech(oc_content::techs::T_MATERIALS) {
        1000 + balance::MATERIALS_BONUS
    } else {
        1000
    };
    let mut alloy_milli = 0;
    let mut fuel_milli = 0;
    let mut research_milli = 0;
    let mut coal_milli = 0;
    let mut rate_alloy = 0;
    let mut rate_fuel = 0;
    let mut rate_research = 0;
    let mut rate_coal = 0;

    // ---- extraction and research -----------------------------------------
    // Only production buildings own their `state` here: pads, hangars and guns
    // are driven by their own systems and must not be reset to idle.
    for (i, b) in world.buildings.iter_mut().enumerate() {
        if b.state == B_STATE_SITE {
            continue;
        }
        let mut working = false;
        match b.kind {
            buildings::B_REFINERY => {
                let size = i32::from(World::def(b.kind).footprint);
                let richness = world.map.footprint_deposit(b.tx, b.ty, size);
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
            buildings::B_COAL_MINE => {
                let size = i32::from(World::def(b.kind).footprint);
                let seam = world.map.footprint_coal(b.tx, b.ty, size);
                b.aux = seam.clamp(0, i32::from(u16::MAX)) as u32;
                if powered && seam > 0 {
                    // Full seam = 1000 permille; the guaranteed seam by the
                    // colony is exactly saturated, wild seams scale down.
                    let permille = (seam * 1000 / balance::COAL_SEAM_FULL.max(1)).min(1000);
                    let amount = balance::COAL_MINE_PER_MIN * permille / 1000;
                    coal_milli += milli_per_tick(amount, dt_ms);
                    rate_coal += amount;
                    working = true;
                }
                b.state = if working {
                    B_STATE_WORKING
                } else {
                    B_STATE_IDLE
                };
            }
            buildings::B_COAL_PLANT => {
                b.state = if plants.get(i).copied().unwrap_or(false) {
                    B_STATE_WORKING
                } else {
                    B_STATE_BLOCKED
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

    // ---- coal: mined this tick minus what the thermal plants burned -------
    if infinite {
        // Sandbox coal never runs out, so the burn is not debited (the plants
        // already counted their output in `energy_balance`).
        world.res.coal = world.res.coal.max(balance::SANDBOX_RESOURCE_FLOOR);
    } else {
        world.res.a_coal += coal_milli - coal_burn;
        let coal_units = world.res.a_coal.div_euclid(1000);
        world.res.a_coal = world.res.a_coal.rem_euclid(1000);
        world.res.coal = (world.res.coal + coal_units).clamp(0, MAX_COAL);
    }

    if world.sandbox(SANDBOX_INFINITE) {
        world.res.alloy = world.res.alloy.max(balance::SANDBOX_RESOURCE_FLOOR);
        world.res.fuel = world.res.fuel.max(9_000);
        world.res.research = world.res.research.max(balance::SANDBOX_RESOURCE_FLOOR);
    }

    apply_flags(world, powered);
    world.alloy_rate = rate_alloy;
    world.fuel_rate = rate_fuel;
    world.research_rate = rate_research;
    world.coal_rate = rate_coal;
}

/// Decide which thermal plants can burn this tick.
///
/// One entry per building index. Burning spends from `budget` in building order
/// (the placement order is part of the deterministic state), so two plants on a
/// starved stockpile run the older one first instead of flipping a coin.
fn plan_thermal_plants(world: &World, budget: &mut i32, burn: &mut i32, dt_ms: u32) -> Vec<bool> {
    let cost = milli_per_tick(balance::COAL_BURN_PER_MIN, dt_ms);
    let mut running = vec![false; world.buildings.len()];
    for (i, b) in world.buildings.iter().enumerate() {
        if b.state == B_STATE_SITE || b.kind != buildings::B_COAL_PLANT {
            continue;
        }
        if *budget >= cost {
            *budget -= cost;
            *burn += cost;
            running[i] = true;
        }
    }
    running
}

/// Recompute energy output/demand and report the "everything powered" verdict.
///
/// Thermal plants only contribute their +40 when `plants[i]` says they got
/// their coal this tick; a starved plant is a dead weight, not a generator.
fn energy_balance(world: &mut World, plants: &[bool]) -> bool {
    let mut out = 0;
    let mut consumed = 0;
    for (i, b) in world.buildings.iter().enumerate() {
        if b.state == B_STATE_SITE {
            continue;
        }
        let def = World::def(b.kind);
        let mut energy = def.energy;
        if b.kind == buildings::B_HQ && world.has_tech(oc_content::techs::T_REACTOR) {
            energy += 12;
        }
        if b.kind == buildings::B_COAL_PLANT && !plants.get(i).copied().unwrap_or(false) {
            energy = 0;
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
        if map.footprint_deposit(b.tx, b.ty, size) > 0 || map.footprint_coal(b.tx, b.ty, size) > 0 {
            flags |= FLAG_DEPOSIT;
        }
        if b.hp < b.hp_max {
            flags |= FLAG_DAMAGED;
        }
        b.flags = flags;
    }
}
