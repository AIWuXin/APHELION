//! Commands: the only way the presentation layer may influence the simulation.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::EntityId;

/// A batch of commands produced by one client frame and applied atomically at
/// the start of the next simulation tick.
#[derive(Clone, Debug, Default, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../web/src/generated/")]
pub struct CommandBatch {
    /// Client tick the batch was produced on (diagnostics only).
    pub client_tick: u32,
    /// Ordered command list. Order is part of the deterministic contract.
    pub commands: Vec<Command>,
}

/// Player intent. Extend by appending variants **at the end** so that existing
/// serialized replays keep decoding.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../web/src/generated/")]
#[serde(rename_all = "camelCase")]
pub enum Command {
    /// Queue a construction site. `kind` indexes the content building table.
    Place {
        /// Building table index.
        kind: u8,
        /// Anchor tile (top-left of the footprint).
        tx: u16,
        /// Anchor tile.
        ty: u16,
    },
    /// Demolish a finished building (refunds a fraction of the cost).
    Demolish {
        /// Building entity id.
        id: EntityId,
    },
    /// Launch a rocket from a launch pad, climbing to orbit.
    Launch {
        /// Launch pad entity id.
        id: EntityId,
    },
    /// Enable or disable an interplanetary trade route.
    ToggleRoute {
        /// Route table index.
        route: u8,
    },
    /// Sandbox switches (infinite resources, instant build).
    SetSandbox {
        /// Bit flags, see [`crate::snapshot::Policy`].
        flags: u16,
    },
    /// Simulation speed: 0 paused, 1 = 1x, 2 = 2x, 3 = 4x.
    SetSpeed {
        /// Speed index.
        speed: u8,
    },
    /// Explicit pause toggle (kept separate from speed so the top bar can flash).
    Pause {
        /// Paused state.
        paused: bool,
    },
    /// Spend research on a technology.
    Research {
        /// Tech table index.
        tech: u8,
    },
    /// Choose the hostile director preset (from the sandbox panel).
    SetAi {
        /// 0 opening, 1 mid, 2 late.
        phase: u8,
        /// 0 peaceful, 1 normal, 2 fierce.
        strength: u8,
    },
}

impl Command {
    /// Short ASCII tag used by logs and tests (never shown in the UI).
    #[must_use]
    pub const fn tag(&self) -> &'static str {
        match self {
            Self::Place { .. } => "place",
            Self::Demolish { .. } => "demolish",
            Self::Launch { .. } => "launch",
            Self::ToggleRoute { .. } => "route",
            Self::SetSandbox { .. } => "sandbox",
            Self::SetSpeed { .. } => "speed",
            Self::Pause { .. } => "pause",
            Self::Research { .. } => "research",
            Self::SetAi { .. } => "set-ai",
        }
    }
}
