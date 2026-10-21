//! Wire protocol shared by the Rust simulation and the TypeScript client.
//!
//! This crate is the single source of truth for everything that crosses the
//! bridge. TypeScript types under `web/src/generated/` are produced by `ts-rs`
//! from the structs declared here -- they are never written by hand.
//!
//! Encoding is **postcard** (varint + little endian, no field names). The
//! TypeScript reader in `web/src/net/postcard.ts` implements exactly the subset
//! of the format these declarations use; `cargo test -p oc-protocol` emits
//! golden fixtures that the front-end test suite decodes, so the two sides can
//! never silently drift.

pub mod catalog;
pub mod command;
pub mod query;
pub mod snapshot;
pub mod version;
pub mod world;

pub use catalog::{BuildingDef, Catalog, EventDef, RouteDef, TechDef, UnitDef};
pub use command::{Command, CommandBatch};
pub use query::{
    BuildQuery, REASON_ALLOY, REASON_BOUNDS, REASON_ERA, REASON_FUEL, REASON_LINK, REASON_LOCKED,
    REASON_OCCUPIED, REASON_OK, REASON_POWER, REASON_TERRAIN,
};
pub use snapshot::{
    BeamView, BuildingView, EffectView, EventView, Orbital, Policy, Resources, RouteView, ShipView,
    Snapshot, UnitView, BEAM_CANNON, BEAM_FLAK, BEAM_LANCE, BEAM_RAIL, BEAM_REPAIR, BEAM_TRACTOR,
    B_STATE_BLOCKED, B_STATE_IDLE, B_STATE_SITE, B_STATE_WORKING, EFFECT_EXPLODE, EFFECT_FLARE,
    EFFECT_IMPACT, EFFECT_MUZZLE, EFFECT_POP, EFFECT_SPARK, EFFECT_TRAIL, EVENT_BUILD_DONE,
    EVENT_DAMAGE, EVENT_DROP, EVENT_END, EVENT_KILL, EVENT_LAUNCH, EVENT_ORBIT, EVENT_POWER,
    EVENT_PRODUCED, EVENT_RAID, EVENT_RESEARCH, EVENT_ROUTE, EVENT_SHORTAGE, EVENT_WAVE,
    STATUS_ALERT, STATUS_DEFEAT, STATUS_RUNNING, STATUS_VICTORY, UNIT_STATE_ATTACK,
    UNIT_STATE_DOCKED, UNIT_STATE_DYING, UNIT_STATE_IDLE, UNIT_STATE_MOVE,
};
pub use version::{banner, PRODUCT_VERSION, PROTOCOL_VERSION};
pub use world::{BootBlob, MapView};

/// Entity identifier. Monotonic within a session, never reused.
pub type EntityId = u32;
