//! Building table. **Append** rows; never reorder -- the index is the wire id.

/// One row of the building table (all `&'static` so it can live in `const`).
pub struct BuildingRow {
    /// Stable kebab-case render-registry key.
    pub key: &'static str,
    /// Chinese name.
    pub zh: &'static str,
    /// English subtitle.
    pub en: &'static str,
    /// Role description.
    pub desc: &'static str,
    /// Alloy cost.
    pub cost_alloy: i32,
    /// Fuel cell cost.
    pub cost_fuel: i32,
    /// Net energy.
    pub energy: i32,
    /// Footprint edge length.
    pub footprint: u8,
    /// Build time in ms.
    pub build_ms: u32,
    /// 0 build, 1 orbital, 2 defence, 3 support.
    pub category: u8,
    /// Hit points.
    pub hp: i32,
    /// Required tech (`NO_TECH` for always).
    pub tech: u8,
    /// Effect radius in tiles.
    pub range: u16,
    /// Role specific capacity.
    pub capacity: i32,
    /// Era tier: the building may only be placed once `World::era` is at least
    /// this value. Independent from the tech gate.
    pub tier: u8,
}

/// Category: infrastructure.
pub const CAT_BUILD: u8 = 0;
/// Category: orbital.
pub const CAT_ORBITAL: u8 = 1;
/// Category: defence.
pub const CAT_DEFENCE: u8 = 2;
/// Category: support.
pub const CAT_SUPPORT: u8 = 3;

/// Nothing required.
pub const NO_TECH: u8 = 255;

/* ---- kind indices (wire ids) ------------------------------------------- */
/// Command hub.
pub const B_HQ: u8 = 0;
/// Solar array.
pub const B_SOLAR: u8 = 1;
/// Ore refinery.
pub const B_REFINERY: u8 = 2;
/// Fuel synthesis plant.
pub const B_FUEL: u8 = 3;
/// Research laboratory.
pub const B_LAB: u8 = 4;
/// Launch pad.
pub const B_PAD: u8 = 5;
/// Freight dock.
pub const B_DOCK: u8 = 6;
/// Relay mast.
pub const B_RELAY: u8 = 7;
/// Rail turret.
pub const B_TURRET: u8 = 8;
/// Flak battery.
pub const B_FLAK: u8 = 9;
/// Bulwark.
pub const B_BULWARK: u8 = 10;
/// Hangar.
pub const B_HANGAR: u8 = 11;
/// Radar array.
pub const B_RADAR: u8 = 12;
/// Repair bay.
pub const B_REPAIR: u8 = 13;
/// Coal extractor (T1, must sit on a coal seam).
pub const B_COAL_MINE: u8 = 14;
/// Thermal power plant (T1, burns coal for high output).
pub const B_COAL_PLANT: u8 = 15;
/// Number of building kinds.
pub const B_COUNT: u8 = 16;

/// The table.
pub static BUILDINGS: &[BuildingRow] = &[
    BuildingRow {
        key: "command-hub",
        zh: "指挥中枢",
        en: "COMMAND HUB",
        desc: "殖民地核心，失守即战役终止",
        cost_alloy: 0,
        cost_fuel: 0,
        energy: 42,
        footprint: 3,
        build_ms: 0,
        category: CAT_BUILD,
        hp: 1400,
        tech: NO_TECH,
        range: 0,
        capacity: 0,
        tier: 1,
    },
    BuildingRow {
        key: "solar-array",
        zh: "光伏阵列",
        en: "SOLAR ARRAY",
        desc: "低维护电力，晨昏线附近效率衰减",
        cost_alloy: 60,
        cost_fuel: 0,
        energy: 6,
        footprint: 2,
        build_ms: 6000,
        category: CAT_BUILD,
        hp: 180,
        tech: NO_TECH,
        range: 0,
        capacity: 0,
        tier: 1,
    },
    BuildingRow {
        key: "refinery",
        zh: "精炼厂",
        en: "REFINERY",
        desc: "必须建在矿脉上，产出合金",
        cost_alloy: 90,
        cost_fuel: 0,
        energy: -9,
        footprint: 2,
        build_ms: 8000,
        category: CAT_BUILD,
        hp: 240,
        tech: NO_TECH,
        range: 0,
        capacity: 46,
        tier: 1,
    },
    BuildingRow {
        key: "fuel-synth",
        zh: "燃料合成站",
        en: "FUEL SYNTH",
        desc: "把电力与合金压制成燃料电池",
        cost_alloy: 120,
        cost_fuel: 0,
        energy: -15,
        footprint: 2,
        build_ms: 9000,
        category: CAT_BUILD,
        hp: 220,
        tech: NO_TECH,
        range: 0,
        capacity: 30,
        tier: 2,
    },
    BuildingRow {
        key: "research-lab",
        zh: "研究实验室",
        en: "RESEARCH LAB",
        desc: "产出研究点，解锁轨道与武器技术",
        cost_alloy: 150,
        cost_fuel: 0,
        energy: -11,
        footprint: 1,
        build_ms: 10000,
        category: CAT_BUILD,
        hp: 160,
        tech: NO_TECH,
        range: 0,
        capacity: 7,
        tier: 2,
    },
    BuildingRow {
        key: "launch-pad",
        zh: "发射台",
        en: "LAUNCH PAD",
        desc: "消耗燃料电池把载荷送入轨道",
        cost_alloy: 170,
        cost_fuel: 20,
        energy: -6,
        footprint: 2,
        build_ms: 11000,
        category: CAT_ORBITAL,
        hp: 260,
        tech: NO_TECH,
        range: 0,
        capacity: 0,
        tier: 3,
    },
    BuildingRow {
        key: "freight-dock",
        zh: "货运坪",
        en: "FREIGHT DOCK",
        desc: "开放星际航线，需配发射台使用",
        cost_alloy: 110,
        cost_fuel: 0,
        energy: -7,
        footprint: 2,
        build_ms: 8000,
        category: CAT_ORBITAL,
        hp: 240,
        tech: NO_TECH,
        range: 9,
        capacity: 160,
        tier: 3,
    },
    BuildingRow {
        key: "relay-mast",
        zh: "中继天线",
        en: "RELAY MAST",
        desc: "扩展轨道运力，提升航线等级",
        cost_alloy: 130,
        cost_fuel: 0,
        energy: -4,
        footprint: 1,
        build_ms: 7000,
        category: CAT_ORBITAL,
        hp: 140,
        tech: 2,
        range: 0,
        capacity: 2,
        tier: 3,
    },
    BuildingRow {
        key: "rail-turret",
        zh: "电磁炮塔",
        en: "RAIL TURRET",
        desc: "对地高伤单体，射界内自动交战",
        cost_alloy: 85,
        cost_fuel: 0,
        energy: -8,
        footprint: 1,
        build_ms: 5000,
        category: CAT_DEFENCE,
        hp: 200,
        tech: NO_TECH,
        range: 7,
        capacity: 0,
        tier: 1,
    },
    BuildingRow {
        key: "flak-battery",
        zh: "防空阵列",
        en: "FLAK BATTERY",
        desc: "专打空投艇与登陆艇，覆盖低空",
        cost_alloy: 95,
        cost_fuel: 0,
        energy: -9,
        footprint: 1,
        build_ms: 5500,
        category: CAT_DEFENCE,
        hp: 170,
        tech: NO_TECH,
        range: 9,
        capacity: 0,
        tier: 2,
    },
    BuildingRow {
        key: "bulwark",
        zh: "掩体工事",
        en: "BULWARK",
        desc: "高血量墙体，用于拖住地面部队",
        cost_alloy: 70,
        cost_fuel: 0,
        energy: 0,
        footprint: 1,
        build_ms: 3500,
        category: CAT_DEFENCE,
        hp: 760,
        tech: NO_TECH,
        range: 0,
        capacity: 0,
        tier: 1,
    },
    BuildingRow {
        key: "hangar",
        zh: "机库",
        en: "HANGAR",
        desc: "持续建造截击机，争夺制空权",
        cost_alloy: 155,
        cost_fuel: 10,
        energy: -13,
        footprint: 2,
        build_ms: 12000,
        category: CAT_SUPPORT,
        hp: 300,
        tech: NO_TECH,
        range: 0,
        capacity: 0,
        tier: 3,
    },
    BuildingRow {
        key: "radar-array",
        zh: "搜索阵列",
        en: "RADAR ARRAY",
        desc: "提前预警来袭舰队，标注落点",
        cost_alloy: 105,
        cost_fuel: 0,
        energy: -6,
        footprint: 2,
        build_ms: 7000,
        category: CAT_SUPPORT,
        hp: 190,
        tech: NO_TECH,
        range: 14,
        capacity: 0,
        tier: 2,
    },
    BuildingRow {
        key: "repair-bay",
        zh: "维修坞",
        en: "REPAIR BAY",
        desc: "缓慢修复范围内的建筑与单位",
        cost_alloy: 90,
        cost_fuel: 0,
        energy: -8,
        footprint: 1,
        build_ms: 6000,
        category: CAT_SUPPORT,
        hp: 210,
        tech: 1,
        range: 4,
        capacity: 0,
        tier: 2,
    },
    BuildingRow {
        key: "coal-mine",
        zh: "采煤机",
        en: "COAL EXTRACTOR",
        desc: "必须建在煤层上，产出煤炭",
        cost_alloy: 85,
        cost_fuel: 0,
        energy: -6,
        footprint: 2,
        build_ms: 7000,
        category: CAT_BUILD,
        hp: 220,
        tech: NO_TECH,
        range: 0,
        capacity: 20,
        tier: 1,
    },
    BuildingRow {
        key: "coal-plant",
        zh: "火电站",
        en: "THERMAL PLANT",
        desc: "持续燃烧煤炭，输出高功率电力",
        cost_alloy: 110,
        cost_fuel: 0,
        energy: 40,
        footprint: 2,
        build_ms: 8000,
        category: CAT_BUILD,
        hp: 260,
        tech: NO_TECH,
        range: 0,
        capacity: 10,
        tier: 1,
    },
];

/// Convert a row to the wire definition.
#[must_use]
pub fn to_def(r: &BuildingRow) -> oc_protocol::BuildingDef {
    oc_protocol::BuildingDef {
        key: r.key.to_owned(),
        name_zh: r.zh.to_owned(),
        name_en: r.en.to_owned(),
        desc: r.desc.to_owned(),
        cost_alloy: r.cost_alloy,
        cost_fuel: r.cost_fuel,
        energy: r.energy,
        footprint: r.footprint,
        build_time_ms: r.build_ms,
        category: r.category,
        hp: r.hp,
        tech: r.tech,
        range: r.range,
        capacity: r.capacity,
        tier: r.tier,
    }
}
