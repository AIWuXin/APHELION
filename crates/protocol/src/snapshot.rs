//! Read-only world state handed to the presentation layer once per tick.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::EntityId;

/// Global match status. Mirrors `STATUS_*` constants on the TS side.
pub const STATUS_RUNNING: u8 = 0;
/// Enemy wave is inbound or on the ground.
pub const STATUS_ALERT: u8 = 1;
/// Colony command centre lost.
pub const STATUS_DEFEAT: u8 = 2;
/// Wave quota cleared.
pub const STATUS_VICTORY: u8 = 3;

/// Building animation / logic state.
pub const B_STATE_SITE: u8 = 0;
/// Finished and idle.
pub const B_STATE_IDLE: u8 = 1;
/// Finished and producing.
pub const B_STATE_WORKING: u8 = 2;
/// Finished but starved of an input.
pub const B_STATE_BLOCKED: u8 = 3;

/// Unit state machine.
pub const UNIT_STATE_IDLE: u8 = 0;
/// Moving towards a target.
pub const UNIT_STATE_MOVE: u8 = 1;
/// Attacking.
pub const UNIT_STATE_ATTACK: u8 = 2;
/// Burning / dying animation.
pub const UNIT_STATE_DYING: u8 = 3;
/// Docked inside a hangar or shipyard.
pub const UNIT_STATE_DOCKED: u8 = 4;

/// Visual effect kind. Mirrors `EFFECT_NAMES` in the generated content keys.
pub const EFFECT_MUZZLE: u8 = 0;
/// Ground impact puff.
pub const EFFECT_IMPACT: u8 = 1;
/// Unit / building explosion.
pub const EFFECT_EXPLODE: u8 = 2;
/// Rocket exhaust trail.
pub const EFFECT_TRAIL: u8 = 3;
/// Shield / dome flare.
pub const EFFECT_FLARE: u8 = 4;
/// Damage text pop.
pub const EFFECT_POP: u8 = 5;
/// Construction spark.
pub const EFFECT_SPARK: u8 = 6;

/// Beam kinds. Mirrors `BEAM_NAMES` on the TS side.
pub const BEAM_RAIL: u8 = 0;
/// Flak tracer.
pub const BEAM_FLAK: u8 = 1;
/// Interceptor cannon.
pub const BEAM_CANNON: u8 = 2;
/// Orbital lance (hostile).
pub const BEAM_LANCE: u8 = 3;
/// Tractor / docking beam.
pub const BEAM_TRACTOR: u8 = 4;
/// Repair beam.
pub const BEAM_REPAIR: u8 = 5;

/// Event kinds (HUD log + subtitle + alert bar).
pub const EVENT_BUILD_DONE: u8 = 0;
/// A production line started or finished a batch.
pub const EVENT_PRODUCED: u8 = 1;
/// Rocket left the pad.
pub const EVENT_LAUNCH: u8 = 2;
/// Orbit insertion succeeded.
pub const EVENT_ORBIT: u8 = 3;
/// Trade route delivered cargo.
pub const EVENT_ROUTE: u8 = 4;
/// Wave announcement.
pub const EVENT_WAVE: u8 = 5;
/// Hostile drop pods inbound.
pub const EVENT_DROP: u8 = 6;
/// A building took damage.
pub const EVENT_DAMAGE: u8 = 7;
/// A hostile was destroyed.
pub const EVENT_KILL: u8 = 8;
/// Research finished.
pub const EVENT_RESEARCH: u8 = 9;
/// Power deficit.
pub const EVENT_POWER: u8 = 10;
/// Resource shortage.
pub const EVENT_SHORTAGE: u8 = 11;
/// Victory / defeat.
pub const EVENT_END: u8 = 12;
/// A ground-only raid entered the map from the edge (era 1 director).
pub const EVENT_RAID: u8 = 13;

/// Every resource the top bar shows, plus the rates used for the deltas.
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../web/src/generated/")]
pub struct Resources {
    /// Construction material.
    pub alloy: i32,
    /// Alloy per minute (already scaled to whole units).
    pub alloy_rate: i32,
    /// Rocket fuel cells.
    pub fuel: i32,
    /// Fuel cells per minute.
    pub fuel_rate: i32,
    /// Research points.
    pub research: i32,
    /// Research per minute.
    pub research_rate: i32,
    /// Produced energy.
    pub energy_out: i32,
    /// Consumed energy.
    pub energy_in: i32,
    /// Coal stockpile (T1 thermal power fuel).
    pub coal: i32,
    /// Coal per minute.
    pub coal_rate: i32,
}

/// A single orbital trade route.
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../web/src/generated/")]
pub struct RouteView {
    /// Whether the player has the lane switched on.
    pub active: bool,
    /// 0..1000 progress of the current hauler run.
    pub progress: u16,
    /// 0..1000 recent throughput (smoothed), drives the HUD sparkline.
    pub throughput: u16,
    /// Total delivered loads, shown under the route name.
    pub loads: u16,
    /// 0..1000 strength of the orbital lane (logistics tech).
    pub grade: u16,
}

/// Orbital sector summary: capacity, lanes and the incoming fleet timer.
#[derive(Clone, Debug, Default, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../web/src/generated/")]
pub struct Orbital {
    /// Total orbital lift capacity granted by launched rockets.
    pub capacity: u16,
    /// Capacity currently consumed by active lanes.
    pub used: u16,
    /// Three fixed trade lanes.
    pub routes: Vec<RouteView>,
    /// Wave counter (1-based, 0 before the first).
    pub wave: u16,
    /// Milliseconds until the next hostile wave.
    pub fleet_eta_ms: u32,
    /// 0 calm, 1 inbound, 2 engaged, 3 breached.
    pub threat: u8,
    /// Orbital contacts (interceptors, haulers, hostile ships).
    pub ships: Vec<ShipView>,
}

/// Player-facing policy switches mirrored back so the HUD stays stateless.
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../web/src/generated/")]
pub struct Policy {
    /// Bit 0 infinite resources, bit 1 instant build, bit 2 show debug aids.
    pub sandbox_flags: u16,
    /// 0 opening, 1 mid, 2 late.
    pub ai_phase: u8,
    /// 0 peaceful, 1 normal, 2 fierce.
    pub ai_strength: u8,
}

/// A placed building.
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../web/src/generated/")]
pub struct BuildingView {
    /// Entity id.
    pub id: EntityId,
    /// Index into the content building table.
    pub kind: u8,
    /// Anchor tile.
    pub tx: u16,
    /// Anchor tile.
    pub ty: u16,
    /// Current hit points.
    pub hp: i32,
    /// Maximum hit points.
    pub hp_max: i32,
    /// One of `B_STATE_*`.
    pub state: u8,
    /// 0..1000 build or production progress.
    pub progress: u16,
    /// 0..1000 charge / cooldown for turrets and pads.
    pub charge: u16,
    /// Bit flags: 1 powered, 2 on a deposit, 4 damaged, 8 selectable.
    pub flags: u8,
    /// Free-form auxiliary value (queue length, target id, ...).
    pub aux: u16,
}

/// A ground or low-air unit.
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../web/src/generated/")]
pub struct UnitView {
    /// Entity id.
    pub id: EntityId,
    /// Index into the content unit table.
    pub kind: u8,
    /// World x in 1/1024 tile units.
    pub x: i32,
    /// World y in 1/1024 tile units.
    pub y: i32,
    /// Altitude in 1/1024 tile units.
    pub z: i32,
    /// Current hit points.
    pub hp: i32,
    /// Maximum hit points.
    pub hp_max: i32,
    /// One of `UNIT_STATE_*`.
    pub state: u8,
    /// Facing in 8 iso octants.
    pub facing: u8,
    /// 0 player, 1 hostile.
    pub owner: u8,
    /// Current target entity id, or 0.
    pub target: EntityId,
}

/// An orbital contact rendered above the colony.
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../web/src/generated/")]
pub struct ShipView {
    /// Entity id.
    pub id: EntityId,
    /// Index into the content unit table (shared with ground units).
    pub kind: u8,
    /// World x in 1/1024 tile units.
    pub x: i32,
    /// World y in 1/1024 tile units.
    pub y: i32,
    /// Altitude in 1/1024 tile units.
    pub z: i32,
    /// Current hit points.
    pub hp: i32,
    /// Maximum hit points.
    pub hp_max: i32,
    /// One of `UNIT_STATE_*`.
    pub state: u8,
    /// 0 player, 1 hostile.
    pub owner: u8,
    /// Current target entity id, or 0.
    pub target: EntityId,
}

/// A short-lived visual. The simulation owns the lifetime; the renderer only
/// draws it, which keeps effects out of the presentation rules.
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../web/src/generated/")]
pub struct EffectView {
    /// One of `EFFECT_*`.
    pub kind: u8,
    /// World x in 1/1024 tile units.
    pub x: i32,
    /// World y in 1/1024 tile units.
    pub y: i32,
    /// Altitude in 1/1024 tile units.
    pub z: i32,
    /// Ticks elapsed.
    pub age: u16,
    /// Total lifetime in ticks.
    pub life: u16,
    /// Effect-specific value (damage, radius, ...).
    pub value: i32,
    /// 0 player, 1 hostile.
    pub owner: u8,
}

/// A line-shaped effect such as a rail slug, flak burst trail or drop beam.
///
/// Beams carry both ends so the renderer never has to re-derive a weapon's
/// geometry from game rules.
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../web/src/generated/")]
pub struct BeamView {
    /// One of `BEAM_*`.
    pub kind: u8,
    /// Source world x in 1/1024 tile units.
    pub x0: i32,
    /// Source world y in 1/1024 tile units.
    pub y0: i32,
    /// Source altitude in 1/1024 tile units.
    pub z0: i32,
    /// Target world x in 1/1024 tile units.
    pub x1: i32,
    /// Target world y in 1/1024 tile units.
    pub y1: i32,
    /// Target altitude in 1/1024 tile units.
    pub z1: i32,
    /// Ticks elapsed.
    pub age: u16,
    /// Total lifetime in ticks.
    pub life: u16,
    /// 0 player, 1 hostile.
    pub owner: u8,
}

/// A discrete occurrence for the HUD log, alerts and subtitles.
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../web/src/generated/")]
pub struct EventView {
    /// One of `EVENT_*`.
    pub kind: u8,
    /// Primary argument (entity id, amount, ...).
    pub a: u32,
    /// Secondary argument.
    pub b: u32,
    /// Tile x for map pings, or -1.
    pub tx: i16,
    /// Tile y for map pings, or -1.
    pub ty: i16,
}

/// The whole observable world for one tick.
#[derive(Clone, Debug, Default, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../web/src/generated/")]
pub struct Snapshot {
    /// Protocol version, checked by the client.
    pub protocol: u16,
    /// Simulation tick index.
    pub tick: u32,
    /// FNV-1a state hash (low 32 bits) for replay verification.
    pub hash: u32,
    /// Elapsed simulation milliseconds.
    pub time_ms: u32,
    /// One of `STATUS_*`.
    pub status: u8,
    /// 0 paused, 1..3 speed multiplier index.
    pub speed: u8,
    /// Resources and rates.
    pub resources: Resources,
    /// Orbital sector summary.
    pub orbital: Orbital,
    /// Policy mirrors.
    pub policy: Policy,
    /// Placed buildings.
    pub buildings: Vec<BuildingView>,
    /// Ground and low-air units.
    pub units: Vec<UnitView>,
    /// Transient effects.
    pub effects: Vec<EffectView>,
    /// Line-shaped effects (shots, tractor beams).
    pub beams: Vec<BeamView>,
    /// Events emitted this tick.
    pub events: Vec<EventView>,
    /// Current era (1 = mother-planet T1). Building tiers above it are locked.
    pub era: u8,
}
