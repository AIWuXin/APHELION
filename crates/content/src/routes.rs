//! Interplanetary trade lanes. Three fixed lanes; opening one costs orbital
//! capacity and returns cargo every `period_ms`.

/// One row of the route table.
pub struct RouteRow {
    /// Stable kebab-case key.
    pub key: &'static str,
    /// Chinese name.
    pub zh: &'static str,
    /// English subtitle.
    pub en: &'static str,
    /// Orbital capacity consumed.
    pub capacity: u16,
    /// Round trip in ms.
    pub period_ms: u32,
    /// Alloy per load.
    pub alloy: i32,
    /// Research per load.
    pub research: i32,
    /// World-building line shown when the lane opens.
    pub flavour: &'static str,
}

/// Near asteroid belt lane.
pub const R_BELT: u8 = 0;
/// Moon relay lane.
pub const R_MOON: u8 = 1;
/// Inner ring yard lane.
pub const R_RING: u8 = 2;
/// Number of routes.
pub const R_COUNT: u8 = 3;

/// The table.
pub static ROUTES: &[RouteRow] = &[
    RouteRow {
        key: "aphelion-belt",
        zh: "远日点矿带",
        en: "APHELION BELT",
        capacity: 2,
        period_ms: 24000,
        alloy: 62,
        research: 0,
        flavour: "矿车已经排进窗口，等我们签收。",
    },
    RouteRow {
        key: "selene-relay",
        zh: "月面中继",
        en: "SELENE RELAY",
        capacity: 3,
        period_ms: 38000,
        alloy: 20,
        research: 9,
        flavour: "中继站愿意用数据换燃料。",
    },
    RouteRow {
        key: "inner-ring",
        zh: "内环船坞",
        en: "INNER RING YARD",
        capacity: 4,
        period_ms: 30000,
        alloy: 44,
        research: 4,
        flavour: "船坞的排期表上还留着我们的位置。",
    },
];

/// Convert a row to the wire definition.
#[must_use]
pub fn to_def(r: &RouteRow) -> oc_protocol::RouteDef {
    oc_protocol::RouteDef {
        key: r.key.to_owned(),
        name_zh: r.zh.to_owned(),
        name_en: r.en.to_owned(),
        capacity: r.capacity,
        period_ms: r.period_ms,
        alloy: r.alloy,
        research: r.research,
        flavour: r.flavour.to_owned(),
    }
}
