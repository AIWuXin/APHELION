//! The static content catalogue shipped to the client once per session.
//!
//! Everything the HUD needs to render a build card (names, costs, categories)
//! comes from here, so adding a building touches **two** places only: the Rust
//! content table and the TS render registry.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// All static content, sent as a single postcard blob on start-up.
#[derive(Clone, Debug, Default, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../web/src/generated/")]
pub struct Catalog {
    /// Protocol version the catalogue was built for.
    pub protocol: u16,
    /// Buildable structures, indexed by `BuildingView::kind`.
    pub buildings: Vec<BuildingDef>,
    /// Units and orbital craft, indexed by `UnitView::kind` / `ShipView::kind`.
    pub units: Vec<UnitDef>,
    /// Trade lanes, indexed by `Command::ToggleRoute::route`.
    pub routes: Vec<RouteDef>,
    /// Event presentation strings, indexed by `EventView::kind`.
    pub events: Vec<EventDef>,
    /// Technologies, indexed by `Command::Research::tech`.
    pub techs: Vec<TechDef>,
}

/// One buildable structure.
#[derive(Clone, Debug, Default, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../web/src/generated/")]
pub struct BuildingDef {
    /// Stable kebab-case key; also the render-registry key on the TS side.
    pub key: String,
    /// Chinese display name (primary information layer).
    pub name_zh: String,
    /// Wide-tracked English subtitle.
    pub name_en: String,
    /// One-line role description for the HUD tooltip row.
    pub desc: String,
    /// Alloy cost.
    pub cost_alloy: i32,
    /// Fuel cell cost.
    pub cost_fuel: i32,
    /// Net energy contribution (negative consumes).
    pub energy: i32,
    /// Footprint edge length in tiles (1 or 2).
    pub footprint: u8,
    /// Construction time in milliseconds at 1x.
    pub build_time_ms: u32,
    /// 0 build, 1 orbital, 2 defence, 3 ships.
    pub category: u8,
    /// Hit points.
    pub hp: i32,
    /// Tech index required before the card unlocks, `255` = always available.
    pub tech: u8,
    /// Effect radius in tiles (turrets, radar, docks).
    pub range: u16,
    /// Maximum alloy stored, production per minute, or another role-specific cap.
    pub capacity: i32,
}

/// One unit, interceptor or orbital craft.
#[derive(Clone, Debug, Default, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../web/src/generated/")]
pub struct UnitDef {
    /// Stable kebab-case key.
    pub key: String,
    /// Chinese display name.
    pub name_zh: String,
    /// English subtitle.
    pub name_en: String,
    /// Hit points.
    pub hp: i32,
    /// Movement speed in tiles per second.
    pub speed: i32,
    /// Damage per shot.
    pub damage: i32,
    /// Weapon range in tiles.
    pub range: u16,
    /// Milliseconds between shots.
    pub cooldown_ms: u32,
    /// 0 ground, 1 air, 2 orbital.
    pub layer: u8,
}

/// One interplanetary trade lane.
#[derive(Clone, Debug, Default, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../web/src/generated/")]
pub struct RouteDef {
    /// Stable kebab-case key.
    pub key: String,
    /// Chinese lane name.
    pub name_zh: String,
    /// English subtitle.
    pub name_en: String,
    /// Orbital capacity consumed while the lane is open.
    pub capacity: u16,
    /// Round trip duration in milliseconds.
    pub period_ms: u32,
    /// Alloy delivered per load.
    pub alloy: i32,
    /// Research delivered per load.
    pub research: i32,
    /// Short world-building line shown when the lane opens.
    pub flavour: String,
}

/// Presentation strings for one event kind.
#[derive(Clone, Debug, Default, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../web/src/generated/")]
pub struct EventDef {
    /// Stable kebab-case key.
    pub key: String,
    /// Log line template; `{a}` / `{b}` are substituted with the event args.
    pub text_zh: String,
    /// Speaker tag shown in the subtitle bar, empty for none.
    pub speaker: String,
    /// 0 info, 1 warn, 2 danger, 3 good.
    pub tone: u8,
}

/// One researchable technology.
#[derive(Clone, Debug, Default, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../web/src/generated/")]
pub struct TechDef {
    /// Stable kebab-case key.
    pub key: String,
    /// Chinese name.
    pub name_zh: String,
    /// English subtitle.
    pub name_en: String,
    /// Research point cost.
    pub cost: i32,
    /// One-line effect description.
    pub effect_zh: String,
    /// Tech that must be researched first (`255` = none).
    pub requires: u8,
}
