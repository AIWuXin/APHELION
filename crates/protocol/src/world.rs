//! Immutable world description handed to the client once, at boot.
//!
//! The planet is generated deterministically from the seed inside the
//! simulation; the client receives the resulting tile arrays and only ever
//! *paints* them. It never generates terrain itself.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::Catalog;

/// The generated planet surface.
#[derive(Clone, Debug, Default, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../web/src/generated/")]
pub struct MapView {
    /// Width in tiles.
    pub w: u16,
    /// Height in tiles.
    pub h: u16,
    /// Terrain material index per tile (`T_*` in `oc-content`), row-major.
    pub material: Vec<u8>,
    /// Elevation steps, `-1` for brine, `0..=3` for land.
    pub height: Vec<i8>,
    /// Decoration index per tile (`D_*` in `oc-content`), `0` = bare.
    pub decor: Vec<u8>,
    /// Mineral richness, `0` = none. Refineries must sit on a deposit.
    pub deposit: Vec<u8>,
}

/// Everything the client needs before the first tick.
#[derive(Clone, Debug, Default, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../web/src/generated/")]
pub struct BootBlob {
    /// Protocol version; the client refuses a mismatch.
    pub protocol: u16,
    /// World seed, echoed so the HUD can print the run id.
    pub seed: u32,
    /// Static content tables.
    pub catalog: Catalog,
    /// The generated planet.
    pub map: MapView,
}
