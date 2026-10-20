//! Tech tree. Four short branches that gate the orbital and defensive layer.

/// One row of the tech table.
pub struct TechRow {
    /// Stable kebab-case key.
    pub key: &'static str,
    /// Chinese name.
    pub zh: &'static str,
    /// English subtitle.
    pub en: &'static str,
    /// Research cost.
    pub cost: i32,
    /// Effect line shown in the HUD.
    pub effect_zh: &'static str,
    /// Prerequisite (`NO_TECH` for none).
    pub requires: u8,
}

/// Nothing required.
pub const NO_TECH: u8 = 255;

/// Materials: +25% refinery output.
pub const T_MATERIALS: u8 = 0;
/// Ballistics: +30% turret damage.
pub const T_BALLISTICS: u8 = 1;
/// Orbital engineering: relay mast, +1 lift per rocket.
pub const T_ORBITAL: u8 = 2;
/// Reactor miniaturisation: +12 energy from the command hub.
pub const T_REACTOR: u8 = 3;

/// The table.
pub static TECHS: &[TechRow] = &[
    TechRow {
        key: "materials",
        zh: "材料学",
        en: "MATERIALS",
        cost: 40,
        effect_zh: "精炼产出 +25%",
        requires: NO_TECH,
    },
    TechRow {
        key: "ballistics",
        zh: "弹道学",
        en: "BALLISTICS",
        cost: 55,
        effect_zh: "炮塔伤害 +30%",
        requires: NO_TECH,
    },
    TechRow {
        key: "orbital-eng",
        zh: "轨道工程",
        en: "ORBITAL ENG.",
        cost: 70,
        effect_zh: "解锁中继天线，运力 +1",
        requires: NO_TECH,
    },
    TechRow {
        key: "reactor",
        zh: "反应堆小型化",
        en: "REACTOR",
        cost: 90,
        effect_zh: "指挥中枢输出 +12",
        requires: T_MATERIALS,
    },
];

/// Convert a row to the wire definition.
#[must_use]
pub fn to_def(r: &TechRow) -> oc_protocol::TechDef {
    oc_protocol::TechDef {
        key: r.key.to_owned(),
        name_zh: r.zh.to_owned(),
        name_en: r.en.to_owned(),
        cost: r.cost,
        effect_zh: r.effect_zh.to_owned(),
        requires: r.requires,
    }
}
