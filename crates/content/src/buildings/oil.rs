//! T2 petroleum extraction. Kept separate so the append-only wire table stays small.

use super::{BuildingRow, CAT_BUILD, NO_TECH};

/// Pumpjack with a local tank and one automatic freight train.
pub const WELL: BuildingRow = BuildingRow {
    key: "oil-well",
    zh: "油井",
    en: "OIL WELL",
    desc: "开采原油并就地储存，由货运列车送入中枢",
    cost_alloy: 120,
    cost_fuel: 0,
    energy: -8,
    footprint: 2,
    build_ms: 9000,
    category: CAT_BUILD,
    hp: 240,
    tech: NO_TECH,
    range: 0,
    capacity: 24,
    tier: 2,
};
