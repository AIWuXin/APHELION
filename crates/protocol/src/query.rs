//! Cheap synchronous queries.
//!
//! The renderer needs to know whether a ghost placement is legal *before* the
//! command is sent. Rather than duplicating placement rules in TypeScript, the
//! bridge exposes a single packed query answered by the simulation.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Reason a build request is not legal right now.
pub const REASON_OK: u8 = 0;
/// Not enough alloy.
pub const REASON_ALLOY: u8 = 1;
/// Not enough fuel cells.
pub const REASON_FUEL: u8 = 2;
/// Reserved: the planet is a torus, so no tile is outside the map. Kept in the
/// wire enum so older clients do not see the following codes shift.
pub const REASON_BOUNDS: u8 = 3;
/// Tile is water / cliff / reserved.
pub const REASON_TERRAIN: u8 = 4;
/// Another building already occupies the footprint.
pub const REASON_OCCUPIED: u8 = 5;
/// The technology is not researched yet.
pub const REASON_LOCKED: u8 = 6;
/// A placement prerequisite (deposit, adjacent road, ...) is missing.
pub const REASON_LINK: u8 = 7;
/// Energy budget would go negative.
pub const REASON_POWER: u8 = 8;
/// The building's tier is above the colony's current era.
pub const REASON_ERA: u8 = 9;

/// Packed answer to "can I place this here?".
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../web/src/generated/")]
pub struct BuildQuery {
    /// Legal to issue the command.
    pub ok: bool,
    /// Affordable with the current stockpile.
    pub affordable: bool,
    /// Unlocked by research.
    pub unlocked: bool,
    /// One of `REASON_*`.
    pub reason: u8,
    /// Alloy that would be spent.
    pub cost_alloy: i32,
    /// Fuel cells that would be spent.
    pub cost_fuel: i32,
    /// Whether the anchor tile can host the footprint.
    pub placement_ok: bool,
}
