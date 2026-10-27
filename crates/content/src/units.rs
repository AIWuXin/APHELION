//! Unit, interceptor and orbital craft table. **Append** rows only.

/// One row of the unit table.
pub struct UnitRow {
    /// Stable kebab-case key.
    pub key: &'static str,
    /// Chinese name.
    pub zh: &'static str,
    /// English subtitle.
    pub en: &'static str,
    /// Hit points.
    pub hp: i32,
    /// Tiles per second, in 1/16 tile units to stay integer.
    pub speed: i32,
    /// Damage per shot.
    pub damage: i32,
    /// Range in tiles.
    pub range: u16,
    /// Shot interval in ms.
    pub cooldown_ms: u32,
    /// 0 ground, 1 air, 2 orbital.
    pub layer: u8,
}

/// Ground layer.
pub const LAYER_GROUND: u8 = 0;
/// Low air layer (dropships, interceptors).
pub const LAYER_AIR: u8 = 1;
/// Orbital layer (haulers, warships).
pub const LAYER_ORBIT: u8 = 2;

/// Hostile raider squad.
pub const U_RAIDER: u8 = 0;
/// Hostile siege walker.
pub const U_SIEGE: u8 = 1;
/// Hostile drop ship.
pub const U_DROPSHIP: u8 = 2;
/// Player interceptor.
pub const U_INTERCEPTOR: u8 = 3;
/// Player cargo shuttle.
pub const U_HAULER: u8 = 4;
/// Hostile orbital warship.
pub const U_WARSHIP: u8 = 5;
/// Player survey drone (cosmetic + radar range).
pub const U_DRONE: u8 = 6;
/// Player ground freight train (oil well to command hub).
pub const U_FREIGHT_TRAIN: u8 = 7;
/// Number of unit kinds.
pub const U_COUNT: u8 = 8;

/// The table.
pub static UNITS: &[UnitRow] = &[
    UnitRow {
        key: "raider",
        zh: "掠夺者",
        en: "RAIDER",
        hp: 130,
        speed: 22,
        damage: 13,
        range: 1,
        cooldown_ms: 900,
        layer: LAYER_GROUND,
    },
    UnitRow {
        key: "siege-walker",
        zh: "破城者",
        en: "SIEGE WALKER",
        hp: 340,
        speed: 14,
        damage: 44,
        range: 1,
        cooldown_ms: 1500,
        layer: LAYER_GROUND,
    },
    UnitRow {
        key: "dropship",
        zh: "登陆艇",
        en: "DROPSHIP",
        hp: 190,
        speed: 40,
        damage: 0,
        range: 0,
        cooldown_ms: 0,
        layer: LAYER_AIR,
    },
    UnitRow {
        key: "interceptor",
        zh: "截击机",
        en: "INTERCEPTOR",
        hp: 95,
        speed: 62,
        damage: 11,
        range: 3,
        cooldown_ms: 420,
        layer: LAYER_AIR,
    },
    UnitRow {
        key: "hauler",
        zh: "货运穿梭机",
        en: "HAULER",
        hp: 60,
        speed: 52,
        damage: 0,
        range: 0,
        cooldown_ms: 0,
        layer: LAYER_ORBIT,
    },
    UnitRow {
        key: "warship",
        zh: "敌方巡洋舰",
        en: "CRUISER",
        hp: 420,
        speed: 10,
        damage: 26,
        range: 5,
        cooldown_ms: 1700,
        layer: LAYER_ORBIT,
    },
    UnitRow {
        key: "survey-drone",
        zh: "勘测无人机",
        en: "SURVEY DRONE",
        hp: 40,
        speed: 30,
        damage: 0,
        range: 0,
        cooldown_ms: 0,
        layer: LAYER_AIR,
    },
    UnitRow {
        key: "freight-train",
        zh: "货运列车",
        en: "FREIGHT TRAIN",
        hp: 120,
        speed: 48,
        damage: 0,
        range: 0,
        cooldown_ms: 0,
        layer: LAYER_GROUND,
    },
];

/// Convert a row to the wire definition.
#[must_use]
pub fn to_def(r: &UnitRow) -> oc_protocol::UnitDef {
    oc_protocol::UnitDef {
        key: r.key.to_owned(),
        name_zh: r.zh.to_owned(),
        name_en: r.en.to_owned(),
        hp: r.hp,
        speed: r.speed,
        damage: r.damage,
        range: r.range,
        cooldown_ms: r.cooldown_ms,
        layer: r.layer,
    }
}
