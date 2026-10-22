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
/// Shallow water just off the coast: unbuildable, wadable (T1 simplification).
pub const T_SHALLOW: u8 = 8;
/// Deep ocean: unbuildable, and no raid ever lands here.
pub const T_DEEP: u8 = 9;
/// Snow field of the frozen bands.
pub const T_SNOW: u8 = 10;
/// Permafrost of the cold bands.
pub const T_TUNDRA: u8 = 11;
/// Arid desert of the hot dry bands.
pub const T_DESERT: u8 = 12;
/// Highland rock: the mineral-bearing biome.
pub const T_HIGHLAND: u8 = 13;
/// Dense moss tundra: the wet cold/temperate coastal bands.
pub const T_MOSSY_TUNDRA: u8 = 14;
/// Number of terrain materials.
pub const T_COUNT: u8 = 15;

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
    TerrainRow {
        key: "shallow",
        zh: "浅水",
        buildable: false,
    },
    TerrainRow {
        key: "deep",
        zh: "深水",
        buildable: false,
    },
    TerrainRow {
        key: "snow",
        zh: "雪原",
        buildable: true,
    },
    TerrainRow {
        key: "tundra",
        zh: "冻土",
        buildable: true,
    },
    TerrainRow {
        key: "desert",
        zh: "干旱砂漠",
        buildable: true,
    },
    TerrainRow {
        key: "highland",
        zh: "高地岩",
        buildable: true,
    },
    TerrainRow {
        key: "mossy-tundra",
        zh: "茂密苔原",
        buildable: true,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_original_rows_keep_their_wire_indices() {
        // Append-only contract: the renderer's material painter and every saved
        // replay key off these numbers, so new biomes go on the end.
        assert_eq!(TERRAIN.len(), T_COUNT as usize);
        assert_eq!(TERRAIN[T_BASALT as usize].key, "basalt");
        assert_eq!(TERRAIN[T_REGOLITH as usize].key, "regolith");
        assert_eq!(TERRAIN[T_MOSS as usize].key, "moss");
        assert_eq!(TERRAIN[T_SAND as usize].key, "sand");
        assert_eq!(TERRAIN[T_BRINE as usize].key, "brine");
        assert_eq!(TERRAIN[T_APRON as usize].key, "apron");
        assert_eq!(TERRAIN[T_ROAD as usize].key, "road");
        assert_eq!(TERRAIN[T_CRYSTAL as usize].key, "crystal");
    }

    #[test]
    fn water_cannot_be_built_on_but_every_land_biome_can() {
        for row in TERRAIN.iter() {
            let buildable = matches!(
                row.key,
                "basalt"
                    | "regolith"
                    | "moss"
                    | "sand"
                    | "apron"
                    | "road"
                    | "snow"
                    | "tundra"
                    | "desert"
                    | "highland"
                    | "mossy-tundra"
            );
            assert_eq!(row.buildable, buildable, "{} buildable flag", row.key);
        }
        assert!(!terrain_buildable(T_SHALLOW));
        assert!(!terrain_buildable(T_DEEP));
    }
}
