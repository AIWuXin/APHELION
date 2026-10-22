//! Ore and coal seams.
//!
//! Two layers share these fields:
//!
//! - **rich seams** -- affinity-weighted clusters: ore prefers rock and
//!   highlands, coal prefers temperate, humid lowlands;
//! - **scattered specks** -- two independent high-frequency fields that put a
//!   1-4 tile speck on *any* dry land, so snowfields and deserts are worth
//!   prospecting even though no rich cluster forms there. Scatter is only
//!   considered where the rich layers are empty, so a tile never carries both.
//!
//! Everything here is a pure function of `(seed, tile, material)`, and a tile
//! holds at most one of the two materials so an extractor and a refinery never
//! compete for the same footprint.

use oc_content::terrain::{
    T_APRON, T_BASALT, T_BRINE, T_CRYSTAL, T_DESERT, T_HIGHLAND, T_MOSS, T_MOSSY_TUNDRA,
    T_REGOLITH, T_ROAD, T_SAND, T_SNOW, T_TUNDRA,
};

use crate::mapgen::noise;

use super::Axes;

/// Ore cluster frequency (features around the planet).
pub const ORE_FIELD_FREQ: i32 = 29;
/// Ore noise threshold; below it a tile carries no ore at all.
///
/// The stretched field is centred on 512 with a spread of roughly 180, so 870
/// keeps rich ore on about 3.9% of the planet (6.3% of the land) -- clusters
/// worth finding, not a carpet that makes the refinery site meaningless. The
/// density is budgeted as a pair with [`ORE_SCATTER_THRESHOLD`]: rich clusters
/// plus specks must leave ore on ~7% of the land, and both materials together
/// on ~9% of the planet.
pub const ORE_THRESHOLD: i32 = 870;
/// Maximum ore richness a perfect highland cluster can reach.
pub const ORE_RICHNESS_SCALE: i32 = 210;
/// Coal cluster frequency.
pub const COAL_FIELD_FREQ: i32 = 17;
/// Coal noise threshold: the same budget as ore, nudged up because the coal
/// field reads a little richer.
///
/// Ore is resolved first and a tile holds at most one seam, which is why coal
/// reads thinner than its own field. The measured pair (870 ore / 885 coal)
/// lands within a permille or two of each other, so neither material is the
/// rare one. The guaranteed seams next to the colony are written at
/// [`crate::mapgen::GUARANTEED_RICHNESS`], so this threshold cannot starve them.
pub const COAL_THRESHOLD: i32 = 885;
/// Maximum coal richness a perfect lowland cluster can reach.
pub const COAL_RICHNESS_SCALE: i32 = 190;

/// Ore speck frequency: high enough that a crossing is a 1-4 tile speck.
///
/// The scatter fields are not stretched: value noise already reaches the high
/// tail a sparse layer needs, and stretching would clamp the peaks into wide
/// plateaus instead of specks.
pub const ORE_SCATTER_FREQ: i32 = 907;
/// Ore speck threshold, measured against the raw field.
///
/// This lands on roughly 1% of the land (about 0.6% of the planet), so together
/// with the rich layer it is about 7% of the land: the specks stay a sparse
/// find, a little under one seventh of the ore total, and never compete with a
/// cluster for the "worth finding" role.
pub const ORE_SCATTER_THRESHOLD: i32 = 875;
/// Coal speck frequency.
pub const COAL_SCATTER_FREQ: i32 = 811;
/// Coal speck threshold: the same budget as the ore specks, a touch lower
/// because the high-frequency coal field reaches its tail less often.
pub const COAL_SCATTER_THRESHOLD: i32 = 865;
/// Lowest richness a scattered speck can carry: half of
/// [`crate::mapgen::GUARANTEED_RICHNESS`] or less, so a speck "lives but does
/// not fill" compared with the seams the colony opens on.
pub const SCATTER_RICHNESS_MIN: u8 = 30;
/// Highest richness a scattered speck can carry.
pub const SCATTER_RICHNESS_MAX: u8 = 60;

/// Salt of the ore speck field.
const ORE_SCATTER_SALT: u32 = 0x00E5_0011;
/// Salt of the coal speck field.
const COAL_SCATTER_SALT: u32 = 0x00E5_0012;
/// Salt of the ore speck richness jitter.
const ORE_SCATTER_JITTER_SALT: u32 = 0x00E5_0013;
/// Salt of the coal speck richness jitter.
const COAL_SCATTER_JITTER_SALT: u32 = 0x00E5_0014;

/// Ore affinity per material (0 = never), permille of the richest case.
#[must_use]
pub const fn ore_affinity(material: u8) -> i32 {
    match material {
        T_HIGHLAND => 950,
        T_CRYSTAL => 700,
        T_REGOLITH => 560,
        T_BASALT => 520,
        T_TUNDRA => 300,
        T_SAND => 260,
        T_DESERT => 200,
        T_SNOW => 180,
        T_MOSS | T_MOSSY_TUNDRA => 120,
        _ => 0,
    }
}

/// Coal affinity per material (0 = never): temperate, humid lowlands.
#[must_use]
pub const fn coal_affinity(material: u8) -> i32 {
    match material {
        T_MOSS => 900,
        T_MOSSY_TUNDRA => 860,
        T_REGOLITH => 620,
        T_BASALT => 460,
        T_TUNDRA => 340,
        T_SAND => 240,
        T_DESERT => 180,
        T_CRYSTAL => 160,
        T_HIGHLAND => 120,
        T_SNOW => 100,
        _ => 0,
    }
}

/// Is this material ground for the scattered layer?
///
/// Any dry land qualifies, including the biomes the rich layers barely favour.
/// Water, brine and the overlay-only materials (road, apron) do not; the
/// command hub clears its footprint in the overlay exactly like the rich seams.
const fn scatterable(material: u8) -> bool {
    super::is_land(material) && !matches!(material, T_BRINE | T_ROAD | T_APRON)
}

/// Richness from a cluster field above its threshold, weighted by affinity.
fn richness(field: i32, threshold: i32, affinity: i32, scale: i32) -> u8 {
    if affinity <= 0 || field <= threshold {
        return 0;
    }
    let score = (field - threshold) * 1000 / (1024 - threshold);
    let value = score * affinity / 1000 * scale / 1000;
    value.clamp(1, 255) as u8
}

/// Richness of a scattered speck: 30-60, with higher-field specks a little
/// richer. The jitter keeps neighbouring specks from reading as one value.
fn scatter_richness(seed: u32, x: i32, y: i32, field: i32, threshold: i32, jitter_salt: u32) -> u8 {
    if field <= threshold {
        return 0;
    }
    let min = i32::from(SCATTER_RICHNESS_MIN);
    let span = i32::from(SCATTER_RICHNESS_MAX - SCATTER_RICHNESS_MIN);
    let strength = ((field - threshold) * span / (1024 - threshold)).clamp(0, span);
    let jitter = i32::from((noise::hash2(seed ^ jitter_salt, x, y) % 11) as u8);
    (min + strength + jitter).clamp(min, i32::from(SCATTER_RICHNESS_MAX)) as u8
}

/// Ore and coal for one tile.
#[must_use]
pub fn minerals(seed: u32, x: i32, y: i32, material: u8) -> (u8, u8) {
    minerals_of(&Axes::Direct, seed, x, y, material)
}

/// The rich cluster layers only, without the scattered specks.
///
/// Exposed so the contract tests can prove the two layers never share a tile;
/// the shipped tile goes through [`minerals`], which merges them.
#[must_use]
pub fn rich_minerals(seed: u32, x: i32, y: i32, material: u8) -> (u8, u8) {
    rich_of(&Axes::Direct, seed, x, y, material)
}

/// The scattered specks only, ignoring the rich layers.
///
/// Empty on water, brine, roads and aprons. The merge in [`minerals`] discards
/// this layer wherever a rich seam already exists.
#[must_use]
pub fn scatter(seed: u32, x: i32, y: i32, material: u8) -> (u8, u8) {
    scatter_of(&Axes::Direct, seed, x, y, material)
}

/// Ore and coal for one tile from a caller-supplied axis source.
///
/// A material with zero affinity for a seam never carries it, and the cluster
/// field is the only thing that decides otherwise, so the field is not sampled
/// at all when the affinity is zero. That is a pure win on water, brine, roads
/// and aprons -- and it cannot change a single value, because the field value
/// would have been discarded.
#[must_use]
pub(super) fn minerals_of(axes: &Axes, seed: u32, x: i32, y: i32, material: u8) -> (u8, u8) {
    let rich = rich_of(axes, seed, x, y, material);
    if rich != (0, 0) {
        return rich;
    }
    scatter_of(axes, seed, x, y, material)
}

/// The rich affinity-weighted seams for one tile.
fn rich_of(axes: &Axes, seed: u32, x: i32, y: i32, material: u8) -> (u8, u8) {
    let ore_affinity = ore_affinity(material);
    if ore_affinity > 0 {
        let ore_field = noise::stretch(
            noise::torus_noise_axes(
                seed ^ 0x00E5_0001,
                axes.axis_x(ORE_FIELD_FREQ, x),
                axes.axis_y(ORE_FIELD_FREQ, y),
            ),
            1400,
        );
        let deposit = richness(ore_field, ORE_THRESHOLD, ore_affinity, ORE_RICHNESS_SCALE);
        if deposit > 0 {
            return (deposit, 0);
        }
    }
    let coal_affinity = coal_affinity(material);
    if coal_affinity == 0 {
        return (0, 0);
    }
    let coal_field = noise::stretch(
        noise::torus_noise_axes(
            seed ^ 0x00E5_0002,
            axes.axis_x(COAL_FIELD_FREQ, x),
            axes.axis_y(COAL_FIELD_FREQ, y),
        ),
        1400,
    );
    let coal = richness(
        coal_field,
        COAL_THRESHOLD,
        coal_affinity,
        COAL_RICHNESS_SCALE,
    );
    (0, coal)
}

/// The scattered specks for one tile. Ore is resolved first so a tile still
/// carries at most one material, even in the vanishingly rare field overlap.
fn scatter_of(axes: &Axes, seed: u32, x: i32, y: i32, material: u8) -> (u8, u8) {
    if !scatterable(material) {
        return (0, 0);
    }
    let ore = scatter_richness(
        seed,
        x,
        y,
        noise::torus_noise_axes(
            seed ^ ORE_SCATTER_SALT,
            axes.axis_x(ORE_SCATTER_FREQ, x),
            axes.axis_y(ORE_SCATTER_FREQ, y),
        ),
        ORE_SCATTER_THRESHOLD,
        ORE_SCATTER_JITTER_SALT,
    );
    if ore > 0 {
        return (ore, 0);
    }
    let coal = scatter_richness(
        seed,
        x,
        y,
        noise::torus_noise_axes(
            seed ^ COAL_SCATTER_SALT,
            axes.axis_x(COAL_SCATTER_FREQ, x),
            axes.axis_y(COAL_SCATTER_FREQ, y),
        ),
        COAL_SCATTER_THRESHOLD,
        COAL_SCATTER_JITTER_SALT,
    );
    (0, coal)
}
