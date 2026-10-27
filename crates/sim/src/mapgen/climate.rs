//! Climate-driven biomes for the planet surface.
//!
//! Three fields drive everything, all of them seamless on the torus:
//!
//! - **elevation**: a low-frequency continental octave plus hills and detail,
//!   contrast-stretched. Below [`SEA_LEVEL`] the tile is water (deep past
//!   [`DEEP_SEA_MARGIN`]), above it the biome comes from the climate table.
//! - **temperature**: a smooth *cyclic* latitude gradient (hot at the equator,
//!   cold at both poles, no seam at y = 0), minus altitude cooling, plus noise.
//! - **humidity**: its own noise field, nudged upwards near sea level.
//!
//! `temperature band x humidity band` indexes [`BIOMES`], which is deliberately a
//! readable constant table rather than a chain of thresholds. Minerals have two
//! layers: affinity-weighted rich seams, plus a sparse scattered layer that puts
//! a small speck on every dry land biome. All of it is a pure function of
//! `(seed, tile)`, which is what lets the chunk cache evict and regenerate freely.

use oc_content::terrain::{
    T_BASALT, T_BRINE, T_CRYSTAL, T_DEEP, T_DESERT, T_HIGHLAND, T_MOSS, T_MOSSY_TUNDRA, T_REGOLITH,
    T_SAND, T_SHALLOW, T_SNOW, T_TUNDRA,
};
use oc_iso::grid::MAP_H;
use oc_iso::trig;

use super::noise;

mod axes;
mod minerals;
mod oil;

pub use axes::{Axes, ChunkAxes};
pub use minerals::{
    coal_affinity, minerals, ore_affinity, rich_minerals, scatter, COAL_FIELD_FREQ,
    COAL_RICHNESS_SCALE, COAL_SCATTER_FREQ, COAL_SCATTER_THRESHOLD, COAL_THRESHOLD, ORE_FIELD_FREQ,
    ORE_RICHNESS_SCALE, ORE_SCATTER_FREQ, ORE_SCATTER_THRESHOLD, ORE_THRESHOLD,
    SCATTER_RICHNESS_MAX, SCATTER_RICHNESS_MIN,
};
pub use oil::{oil_affinity, OIL_FIELD_FREQ, OIL_RICHNESS_SCALE, OIL_THRESHOLD};

use minerals::minerals_of;

// ---------------------------------------------------------------- elevation --

/// Elevation units per field: `0..=1024`, sea level at 512.
pub const SEA_LEVEL: i32 = 512;
/// How far below sea level a tile must sit to count as deep ocean.
pub const DEEP_SEA_MARGIN: i32 = 90;
/// Contrast stretch applied to the raw octave stack.
pub const ELEVATION_GAIN: i32 = 1550;
/// Features around the planet at the continental octave.
pub const ELEV_CONTINENT_FREQ: i32 = 3;
/// Hill octave frequency.
pub const ELEV_HILL_FREQ: i32 = 8;
/// Detail octave frequency.
pub const ELEV_DETAIL_FREQ: i32 = 23;
/// Octave weights (permille, they sum to 1000).
pub const ELEV_WEIGHTS: [i32; 3] = [600, 270, 130];

// -------------------------------------------------------------- temperature --

/// Below this the surface is frozen (band 0).
pub const TEMP_FROZEN: i32 = 240;
/// Below this it is cold (band 1).
pub const TEMP_COLD: i32 = 430;
/// Below this it is temperate (band 2); at or above it, hot (band 3).
pub const TEMP_TEMPERATE: i32 = 720;
/// Latitude gradient amplitude, applied to the cyclic `cos` curve.
pub const TEMP_LATITUDE_GAIN: i32 = 760;
/// Base temperature added before the latitude term (poles never hit zero).
pub const TEMP_BASE: i32 = 120;
/// Maximum cooling from sea level to the highest peak.
pub const TEMP_ALTITUDE_COOLING: i32 = 300;
/// Wobble gain applied to the temperature noise field (permille of 512).
pub const TEMP_NOISE_GAIN: i32 = 180;
/// Temperature noise frequency.
pub const TEMP_NOISE_FREQ: i32 = 6;

// ----------------------------------------------------------------- humidity --

/// Humidity below this is arid (band 0).
pub const HUMID_ARID: i32 = 300;
/// Below this it is dry (band 1).
pub const HUMID_DRY: i32 = 540;
/// Below this it is moist (band 2); at or above it, wet (band 3).
pub const HUMID_MOIST: i32 = 760;
/// Contrast stretch applied to the humidity octaves.
pub const HUMIDITY_GAIN: i32 = 1600;
/// Base humidity frequency.
pub const HUMIDITY_FREQ: i32 = 4;
/// Fine humidity octave: the base frequency quadrupled.
pub const HUMIDITY_FINE_FREQ: i32 = HUMIDITY_FREQ * 4;

// -------------------------------------------------------------- biome table --

/// Biome lookup: row = temperature band (0 frozen, 1 cold, 2 temperate, 3 hot),
/// column = humidity band (0 arid, 1 dry, 2 moist, 3 wet).
pub const BIOMES: [[u8; 4]; 4] = [
    [T_TUNDRA, T_TUNDRA, T_SNOW, T_SNOW],
    [T_REGOLITH, T_TUNDRA, T_MOSSY_TUNDRA, T_SNOW],
    [T_SAND, T_BASALT, T_MOSS, T_MOSSY_TUNDRA],
    [T_DESERT, T_SAND, T_MOSS, T_MOSS],
];

/// Elevation above which the surface is bare highland rock.
pub const HIGHLAND_ELEVATION: i32 = 790;
/// Crystal fields: cold, high, and this far above the crystal noise threshold.
pub const CRYSTAL_ELEVATION: i32 = 700;
pub const CRYSTAL_THRESHOLD: i32 = 620;
/// Crystal noise frequency.
pub const CRYSTAL_FREQ: i32 = 9;
/// Brine pans: hot, dry, just above sea level.
pub const BRINE_TEMP: i32 = 720;
pub const BRINE_HUMIDITY: i32 = 360;
pub const BRINE_ELEVATION_BAND: i32 = 110;

// ------------------------------------------------------------------ result ---

/// One generated tile before colony overlays.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct BaseTile {
    /// Terrain material index (`T_*`).
    pub material: u8,
    /// Height step: `-2` deep water, `-1` shallow water, `0..=3` land.
    pub height: i8,
    /// Mineral richness, `0` = none.
    pub deposit: u8,
    /// Coal seam richness, `0` = none.
    pub coal: u8,
    /// Oil reservoir richness, `0` = none.
    pub oil: u8,
    /// Elevation field value, `0..=1024`.
    pub elevation: i32,
    /// Temperature field value, `0..=1024`.
    pub temperature: i32,
    /// Humidity field value, `0..=1024`.
    pub humidity: i32,
}

/// Is this material dry land (buildable or merely scenic, but not water)?
#[must_use]
pub const fn is_land(material: u8) -> bool {
    !matches!(material, T_DEEP | T_SHALLOW)
}

/// Is this material water?
#[must_use]
pub const fn is_water(material: u8) -> bool {
    matches!(material, T_DEEP | T_SHALLOW)
}

/// Temperature band index used by [`BIOMES`].
#[must_use]
pub const fn temp_band(t: i32) -> usize {
    if t < TEMP_FROZEN {
        0
    } else if t < TEMP_COLD {
        1
    } else if t < TEMP_TEMPERATE {
        2
    } else {
        3
    }
}

/// Humidity band index used by [`BIOMES`].
#[must_use]
pub const fn humidity_band(h: i32) -> usize {
    if h < HUMID_ARID {
        0
    } else if h < HUMID_DRY {
        1
    } else if h < HUMID_MOIST {
        2
    } else {
        3
    }
}

/// Seamless elevation field, `0..=1024`.
#[must_use]
pub fn elevation(seed: u32, x: i32, y: i32) -> i32 {
    elevation_of(&Axes::Direct, seed, x, y)
}

/// Seamless elevation field, `0..=1024`, from a caller-supplied axis source.
#[must_use]
fn elevation_of(axes: &Axes, seed: u32, x: i32, y: i32) -> i32 {
    let continental = noise::torus_noise_axes(
        seed ^ 0x00E1_0001,
        axes.axis_x(ELEV_CONTINENT_FREQ, x),
        axes.axis_y(ELEV_CONTINENT_FREQ, y),
    );
    let hills = noise::torus_noise_axes(
        seed ^ 0x00E1_0002,
        axes.axis_x(ELEV_HILL_FREQ, x),
        axes.axis_y(ELEV_HILL_FREQ, y),
    );
    let detail = noise::torus_noise_axes(
        seed ^ 0x00E1_0003,
        axes.axis_x(ELEV_DETAIL_FREQ, x),
        axes.axis_y(ELEV_DETAIL_FREQ, y),
    );
    let raw =
        (continental * ELEV_WEIGHTS[0] + hills * ELEV_WEIGHTS[1] + detail * ELEV_WEIGHTS[2]) / 1000;
    noise::stretch(raw, ELEVATION_GAIN)
}

/// Temperature field: cyclic latitude gradient - altitude cooling + noise.
#[must_use]
pub fn temperature(seed: u32, x: i32, y: i32, elevation: i32) -> i32 {
    temperature_of(&Axes::Direct, seed, x, y, elevation)
}

/// Temperature field from a caller-supplied axis source.
#[must_use]
fn temperature_of(axes: &Axes, seed: u32, x: i32, y: i32, elevation: i32) -> i32 {
    let turn = trig::turn_of(y, MAP_H);
    // 0 at both poles, 1024 at the equator, continuous across the seam.
    let latitude = 512 - trig::cos(turn) * 512 / trig::ONE;
    let wobble = noise::torus_noise_axes(
        seed ^ 0x00E2_0001,
        axes.axis_x(TEMP_NOISE_FREQ, x),
        axes.axis_y(TEMP_NOISE_FREQ, y),
    ) - 512;
    let cooling = (elevation - SEA_LEVEL).max(0) * TEMP_ALTITUDE_COOLING / (1024 - SEA_LEVEL);
    (TEMP_BASE + latitude * TEMP_LATITUDE_GAIN / 1024 + wobble * TEMP_NOISE_GAIN / 512 - cooling)
        .clamp(0, 1024)
}

/// Humidity field: its own noise, wetter near sea level.
#[must_use]
pub fn humidity(seed: u32, x: i32, y: i32, elevation: i32) -> i32 {
    humidity_of(&Axes::Direct, seed, x, y, elevation)
}

/// Humidity field from a caller-supplied axis source.
#[must_use]
fn humidity_of(axes: &Axes, seed: u32, x: i32, y: i32, elevation: i32) -> i32 {
    let coarse = noise::torus_noise_axes(
        seed ^ 0x00E3_0001,
        axes.axis_x(HUMIDITY_FREQ, x),
        axes.axis_y(HUMIDITY_FREQ, y),
    );
    let fine = noise::torus_noise_axes(
        seed ^ 0x00E3_0002,
        axes.axis_x(HUMIDITY_FINE_FREQ, x),
        axes.axis_y(HUMIDITY_FINE_FREQ, y),
    );
    let raw = (coarse * 3 + fine) / 4;
    let lowland = (SEA_LEVEL + 120 - elevation).max(0) * 80 / 120;
    (noise::stretch(raw, HUMIDITY_GAIN) + lowland).clamp(0, 1024)
}

/// Classify one tile from its climate.
#[must_use]
pub fn classify(
    seed: u32,
    x: i32,
    y: i32,
    elevation: i32,
    temperature: i32,
    humidity: i32,
) -> (u8, i8) {
    classify_of(&Axes::Direct, seed, x, y, elevation, temperature, humidity)
}

/// Classify one tile from its climate, reading the crystal field only when the
/// tile is cold and high enough for the field to matter.
#[must_use]
fn classify_of(
    axes: &Axes,
    seed: u32,
    x: i32,
    y: i32,
    elevation: i32,
    temperature: i32,
    humidity: i32,
) -> (u8, i8) {
    if elevation < SEA_LEVEL - DEEP_SEA_MARGIN {
        return (T_DEEP, -2);
    }
    if elevation < SEA_LEVEL {
        return (T_SHALLOW, -1);
    }
    let height = ((elevation - SEA_LEVEL) * 3 / (1024 - SEA_LEVEL)).clamp(0, 3) as i8;
    if elevation > CRYSTAL_ELEVATION && temperature < TEMP_COLD {
        let crystal = noise::torus_noise_axes(
            seed ^ 0x00E4_0001,
            axes.axis_x(CRYSTAL_FREQ, x),
            axes.axis_y(CRYSTAL_FREQ, y),
        );
        if crystal > CRYSTAL_THRESHOLD {
            return (T_CRYSTAL, height.max(2));
        }
    }
    if temperature > BRINE_TEMP
        && humidity < BRINE_HUMIDITY
        && elevation < SEA_LEVEL + BRINE_ELEVATION_BAND
    {
        return (T_BRINE, 0);
    }
    if elevation > HIGHLAND_ELEVATION {
        let material = if temperature < TEMP_FROZEN {
            T_SNOW
        } else {
            T_HIGHLAND
        };
        return (material, height.max(2));
    }
    (
        BIOMES[temp_band(temperature)][humidity_band(humidity)],
        height,
    )
}

/// Generate one tile from the climate model alone (no colony overlay).
#[must_use]
pub fn base_tile(seed: u32, x: i32, y: i32) -> BaseTile {
    base_tile_of(&Axes::Direct, seed, x, y)
}

/// Generate one tile from the climate model alone, reading its torus axes from
/// `axes`.
#[must_use]
pub fn base_tile_of(axes: &Axes, seed: u32, x: i32, y: i32) -> BaseTile {
    let elevation = elevation_of(axes, seed, x, y);
    let temperature = temperature_of(axes, seed, x, y, elevation);
    let humidity = humidity_of(axes, seed, x, y, elevation);
    let (material, height) = classify_of(axes, seed, x, y, elevation, temperature, humidity);
    let (deposit, coal) = minerals_of(axes, seed, x, y, material);
    // T1 minerals keep precedence: adding oil never moves an existing seam.
    let oil = if deposit == 0 && coal == 0 {
        oil::oil_of(axes, seed, x, y, material)
    } else {
        0
    };
    BaseTile {
        material,
        height,
        deposit,
        coal,
        oil,
        elevation,
        temperature,
        humidity,
    }
}
