//! Terrain materials and surface decoration. The renderer keys its tile
//! painters off these indices, the simulation keys buildability off them.

/// One row of the terrain material table.
pub struct TerrainRow {
    /// Stable kebab-case key used by the TS tile painter.
    pub key: &'static str,
    /// Chinese material name (shown in the debug readout).
    pub zh: &'static str,
    /// `false` means nothing can be built here.
    pub buildable: bool,
}

/// Basalt plain: the default surface.
pub const T_BASALT: u8 = 0;
/// Weathered regolith, warmer and lighter.
pub const T_REGOLITH: u8 = 1;
/// Moss blanket in the damp basins.
pub const T_MOSS: u8 = 2;
/// Silica dunes.
pub const T_SAND: u8 = 3;
/// Brine pools; unbuildable.
pub const T_BRINE: u8 = 4;
/// Poured concrete apron generated around the colony.
pub const T_APRON: u8 = 5;
/// Compacted haul road.
pub const T_ROAD: u8 = 6;
/// Crystal field; unbuildable but pretty.
pub const T_CRYSTAL: u8 = 7;
/// Number of terrain materials.
pub const T_COUNT: u8 = 8;

/// The table.
pub static TERRAIN: &[TerrainRow] = &[
    TerrainRow {
        key: "basalt",
        zh: "玄武岩",
        buildable: true,
    },
    TerrainRow {
        key: "regolith",
        zh: "风化表土",
        buildable: true,
    },
    TerrainRow {
        key: "moss",
        zh: "苔原毯",
        buildable: true,
    },
    TerrainRow {
        key: "sand",
        zh: "硅砂丘",
        buildable: true,
    },
    TerrainRow {
        key: "brine",
        zh: "卤水",
        buildable: false,
    },
    TerrainRow {
        key: "apron",
        zh: "混凝土坪",
        buildable: true,
    },
    TerrainRow {
        key: "road",
        zh: "运输带",
        buildable: true,
    },
    TerrainRow {
        key: "crystal",
        zh: "晶簇地",
        buildable: false,
    },
];

/// Surface decoration placed on top of a tile. `0` means bare ground.
pub struct DecorRow {
    /// Stable kebab-case key used by the TS decor painter.
    pub key: &'static str,
    /// Chinese name.
    pub zh: &'static str,
}

/// No decoration.
pub const D_NONE: u8 = 0;
/// Stacked rock cluster.
pub const D_ROCK: u8 = 1;
/// Crystal shard cluster.
pub const D_CRYSTAL: u8 = 2;
/// Alien tree analogue.
pub const D_TREE: u8 = 3;
/// Basalt pillar.
pub const D_PILLAR: u8 = 4;
/// Impact crater.
pub const D_CRATER: u8 = 5;
/// Abandoned cargo crate.
pub const D_CRATE: u8 = 6;
/// Number of decoration kinds.
pub const D_COUNT: u8 = 7;

/// The table.
pub static DECOR: &[DecorRow] = &[
    DecorRow {
        key: "none",
        zh: "无",
    },
    DecorRow {
        key: "rock",
        zh: "岩簇",
    },
    DecorRow {
        key: "crystal",
        zh: "晶簇",
    },
    DecorRow {
        key: "tree",
        zh: "异星乔木",
    },
    DecorRow {
        key: "pillar",
        zh: "玄武岩柱",
    },
    DecorRow {
        key: "crater",
        zh: "撞击坑",
    },
    DecorRow {
        key: "crate",
        zh: "遗弃货箱",
    },
];

/// Buildability lookup.
#[must_use]
pub fn terrain_buildable(t: u8) -> bool {
    TERRAIN.get(t as usize).is_some_and(|r| r.buildable)
}

/// Chinese name lookup (debug overlay / tooltips).
#[must_use]
pub fn terrain_name(t: u8) -> &'static str {
    TERRAIN.get(t as usize).map_or("未知", |r| r.zh)
}
