//! Systems: the ordered, stateless simulation stages.
//!
//! The public contract is [`System`]: a name plus `update(world, dt_ms)`. The
//! order in [`run_all`] is part of the deterministic contract -- reordering it
//! changes replays.

pub mod air;
pub mod build;
pub mod combat;
pub mod director;
pub mod economy;
pub mod hangar;
pub mod launch;
pub mod logistics;
pub mod raiders;
pub mod repair;
pub mod targeting;

use crate::world::World;

/// A simulation stage.
pub trait System {
    /// Stable name, used by the debug overlay and tests.
    fn name(&self) -> &'static str;
    /// Advance the world by `dt_ms` of simulated time.
    fn update(&mut self, world: &mut World, dt_ms: u32);
}

/// Economy stage: energy balance, extraction, refuelling, research.
pub struct Economy;
/// Construction stage: build sites, repairs, power flags.
pub struct Build;
/// Orbital stage: rocket ascent and lift capacity.
pub struct Launch;
/// Trade stage: lane timers, cargo delivery, hauler craft.
pub struct Logistics;
/// Combat stage: turrets, raiders, damage resolution.
pub struct Combat;
/// Director stage: wave pacing and difficulty.
pub struct Director;

impl System for Economy {
    fn name(&self) -> &'static str {
        "economy"
    }
    fn update(&mut self, world: &mut World, dt_ms: u32) {
        economy::update(world, dt_ms);
    }
}

impl System for Build {
    fn name(&self) -> &'static str {
        "build"
    }
    fn update(&mut self, world: &mut World, dt_ms: u32) {
        build::update(world, dt_ms);
    }
}

impl System for Launch {
    fn name(&self) -> &'static str {
        "launch"
    }
    fn update(&mut self, world: &mut World, dt_ms: u32) {
        launch::update(world, dt_ms);
    }
}

impl System for Logistics {
    fn name(&self) -> &'static str {
        "logistics"
    }
    fn update(&mut self, world: &mut World, dt_ms: u32) {
        logistics::update(world, dt_ms);
    }
}

impl System for Combat {
    fn name(&self) -> &'static str {
        "combat"
    }
    fn update(&mut self, world: &mut World, dt_ms: u32) {
        combat::update(world, dt_ms);
    }
}

impl System for Director {
    fn name(&self) -> &'static str {
        "director"
    }
    fn update(&mut self, world: &mut World, dt_ms: u32) {
        director::update(world, dt_ms);
    }
}

/// Run every stage once, in the canonical order.
pub fn run_all(world: &mut World, dt_ms: u32) {
    Economy.update(world, dt_ms);
    Build.update(world, dt_ms);
    Launch.update(world, dt_ms);
    Logistics.update(world, dt_ms);
    Combat.update(world, dt_ms);
    Director.update(world, dt_ms);
}

/// Names of the stages in execution order (used by the debug overlay).
#[must_use]
pub fn names() -> [&'static str; 6] {
    [
        "economy",
        "build",
        "launch",
        "logistics",
        "combat",
        "director",
    ]
}
