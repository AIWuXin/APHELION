//! Planet generation: a 10240 x 10240 torus, generated per chunk, climate first.
//!
//! Everything here is a pure function of `(seed, home, tile)`. The colony is the
//! only "authored" feature -- a landing pad, a local haul-road grid, a guaranteed
//! ore body east of the hub and coal seams west and south of it -- and even that
//! is expressed as a per-tile overlay so it can be regenerated after a cache
//! eviction without remembering anything.
//!
//! The home tile is chosen by [`find_home`], a bounded deterministic spiral from
//! the planet centre. It has to be dry, in a non-frozen climate band, have rich
//! ore potential within [`HOME_ORE_RADIUS`] tiles, and sit on a continent: at
//! least five of eight compass rays must stay dry for [`HOME_INLAND_RAY_LEN`]
//! tiles, so the colony always has an inland to grow into (a coast qualifies, a
//! small island does not). The scattered specks are deliberately not counted:
//! they are everywhere, and would make the ore probe meaningless.

pub mod climate;
mod decor;
pub mod home;
pub mod noise;

use oc_content::terrain::{
    terrain_buildable, T_APRON, T_BASALT, T_BRINE, T_CRYSTAL, T_DEEP, T_REGOLITH, T_ROAD, T_SAND,
    T_SHALLOW,
};
use oc_iso::torus::{self, CHUNK, CHUNKS};

use crate::chunk::{Chunk, TileData};
use crate::state::Map;

use decor::decor_for;

pub use home::{
    find_home, HOME_INLAND_MIN_RAYS, HOME_INLAND_RAY_LEN, HOME_INLAND_RAY_MIN_LAND,
    HOME_INLAND_RAY_STEP, HOME_MIN_ORE_SAMPLES, HOME_ORE_RADIUS, HOME_SEARCH_RINGS,
    HOME_SEARCH_STEP,
};

// ------------------------------------------------------------ colony layout --

/// Landing radius converted to prepared land around the home tile.
pub const COLONY_LAND_RADIUS: i32 = 9;
/// Haul roads are cut on a local grid inside this radius of the home tile.
pub const ROAD_RADIUS: i32 = 22;
/// Haul road grid pitch in tiles.
pub const ROAD_STEP: i32 = 9;
/// Haul road grid offset inside a pitch.
pub const ROAD_OFFSET: i32 = 4;
/// Half-width of the poured concrete apron around the hub footprint.
pub const APRON_RADIUS: i32 = 5;
/// Edge of the guaranteed ore body / coal seams.
pub const GUARANTEE_SPAN: i32 = 6;
/// Feature count of the low-frequency field behind the prepared-ground split.
/// Slow on purpose: the old per-tile modulo drew a one-tile chequerboard.
pub const COLONY_FILL_FREQ: i32 = 128;
/// How far above the field value at the home tile the fill turns to dust, so a
/// boundary crosses the plot whichever side the colony sits on.
pub const COLONY_FILL_DRIFT: i32 = 32;
/// Salt of the landing-fill field.
pub const COLONY_FILL_SALT: u32 = 0x00C0_1001;
/// Richness the guaranteed seams are raised to (saturates a 2x2 mine).
pub const GUARANTEED_RICHNESS: u8 = 120;

// -------------------------------------------------------------- home search --

// Home picking (spiral candidates, habitability, ore and continent probes)
// lives in `mapgen::home`; the public constants and `find_home` are
// re-exported above so `mapgen::find_home` keeps working.

/// Result of whole-planet setup: the (empty) chunk-backed map plus the anchor.
pub struct Generated {
    /// Tile data, generated on demand.
    pub map: Map,
    /// Colony anchor tile (north-west corner of the hub footprint).
    pub start: (i32, i32),
}

/// Footprint edge of the command hub, read from the content table.
#[must_use]
pub fn hq_size() -> i32 {
    i32::from(oc_content::buildings::BUILDINGS[oc_content::buildings::B_HQ as usize].footprint)
}

/// Boot the planet: pick the home tile, then hand back an empty chunk map.
#[must_use]
pub fn generate(seed: u32) -> Generated {
    let start = find_home(seed);
    Generated {
        map: Map::new(seed, start),
        start,
    }
}

// ------------------------------------------------------------------ overlay --

/// Inclusive rectangle test on the signed home-relative offsets.
const fn in_rect(dx: i32, dy: i32, x0: i32, y0: i32, x1: i32, y1: i32) -> bool {
    dx >= x0 && dx <= x1 && dy >= y0 && dy <= y1
}

/// Materials the landing pad replaces with prepared colony ground.
fn needs_landing_fill(material: u8) -> bool {
    !terrain_buildable(material) || material == T_SAND
}

/// Material for one tile of prepared colony ground: basalt with low-frequency
/// dust drifts, never a per-tile pattern.
fn colony_fill(seed: u32, home: (i32, i32), x: i32, y: i32) -> u8 {
    let field = noise::torus_noise(seed ^ COLONY_FILL_SALT, x, y, COLONY_FILL_FREQ);
    let anchor = noise::torus_noise(seed ^ COLONY_FILL_SALT, home.0, home.1, COLONY_FILL_FREQ);
    if field > anchor + COLONY_FILL_DRIFT {
        T_REGOLITH
    } else {
        T_BASALT
    }
}

/// One finished tile: climate biome plus the colony overlay plus decoration.
#[must_use]
pub fn tile(seed: u32, home: (i32, i32), x: i32, y: i32) -> TileData {
    tile_with(&climate::Axes::Direct, seed, home, x, y)
}

/// One finished tile whose climate axes come from a caller-supplied source: the
/// chunk generator hands in a per-chunk table so the torus trig is paid once per
/// column and row instead of once per tile.
#[must_use]
fn tile_with(axes: &climate::Axes, seed: u32, home: (i32, i32), x: i32, y: i32) -> TileData {
    let (x, y) = torus::wrap(x, y);
    let base = climate::base_tile_of(axes, seed, x, y);
    let dx = torus::delta_x(home.0, x);
    let dy = torus::delta_y(home.1, y);
    let hq = hq_size();
    let mut material = base.material;
    let mut height = base.height;

    // 1. Landing pad: raise and drain the colony plot so the hub, apron and
    //    haul roads sit on buildable ground. The basalt/dust split is a slow
    //    field: material variation without the old period-11 chequerboard.
    if dx.abs() <= COLONY_LAND_RADIUS
        && dy.abs() <= COLONY_LAND_RADIUS
        && needs_landing_fill(material)
    {
        material = colony_fill(seed, home, x, y);
        height = 1;
    }

    // 2. Guaranteed extraction sites: ore east of the hub, coal west and south.
    let mut deposit = base.deposit;
    let mut coal = base.coal;
    let guaranteed_ore = in_rect(dx, dy, hq, 1, hq + GUARANTEE_SPAN - 1, GUARANTEE_SPAN);
    let guaranteed_coal =
        in_rect(dx, dy, -GUARANTEE_SPAN, 1, -1, GUARANTEE_SPAN) || in_rect(dx, dy, -1, 7, 4, 12);
    if guaranteed_ore {
        deposit = deposit.max(GUARANTEED_RICHNESS);
    }
    if guaranteed_coal {
        coal = coal.max(GUARANTEED_RICHNESS);
    }
    // 3. The hub owns its footprint outright: scenario-placed ore it could never
    //    mine would be dead weight forever.
    let hub = in_rect(dx, dy, 0, 0, hq - 1, hq - 1);
    if hub {
        deposit = 0;
        coal = 0;
    }
    // 3b. Sweep stray veins off the prepared landing plot. Climate ore is dense
    //     enough that a one-tile speck two steps from the hub would otherwise
    //     become "the nearest deposit", and the opening refinery would sit on a
    //     near-worthless footprint instead of the guaranteed body. The plant
    //     does not remove the guaranteed bodies -- those are the opening sites.
    if !hub
        && dx.abs() <= COLONY_LAND_RADIUS
        && dy.abs() <= COLONY_LAND_RADIUS
        && !(guaranteed_ore || guaranteed_coal)
    {
        deposit = 0;
        coal = 0;
    }

    // 4. Local haul-road grid, kept off water and crystal fields.
    if dx.abs() <= ROAD_RADIUS
        && dy.abs() <= ROAD_RADIUS
        && (torus::rem_euclid(dx, ROAD_STEP) == ROAD_OFFSET
            || torus::rem_euclid(dy, ROAD_STEP) == ROAD_OFFSET)
        && !matches!(material, T_DEEP | T_SHALLOW | T_BRINE | T_CRYSTAL)
    {
        material = T_ROAD;
    }

    // 5. Poured concrete apron centred on the hub footprint (10x10).
    let acx = dx - hq / 2;
    let acy = dy - hq / 2;
    if (-APRON_RADIUS..APRON_RADIUS).contains(&acx) && (-APRON_RADIUS..APRON_RADIUS).contains(&acy)
    {
        material = T_APRON;
        height = height.max(1);
    }

    let decor = decor_for(seed, x, y, material, deposit, coal);
    TileData {
        material,
        height,
        decor,
        deposit,
        coal,
    }
}

/// Generate one 32x32 chunk. Pure: no cache, no order dependence.
///
/// The torus trig the climate model needs depends only on `(tile, frequency)`,
/// so it is hoisted into a per-chunk table of 32 columns by 32 rows. The field
/// arithmetic that consumes those axes is unchanged, which is what the frozen
/// digest in `tests/mapgen_contract.rs` pins down.
#[must_use]
pub fn chunk(seed: u32, home: (i32, i32), cx: i32, cy: i32) -> Chunk {
    let cx = torus::rem_euclid(cx, CHUNKS);
    let cy = torus::rem_euclid(cy, CHUNKS);
    let mut chunk = Chunk::new(cx, cy);
    let ox = torus::chunk_origin(cx);
    let oy = torus::chunk_origin(cy);
    let table = climate::ChunkAxes::new(ox, oy);
    let axes = climate::Axes::Chunk(&table);
    for ly in 0..CHUNK {
        for lx in 0..CHUNK {
            let tile = tile_with(&axes, seed, home, ox + lx, oy + ly);
            let i = Chunk::index(lx, ly);
            chunk.material[i] = tile.material;
            chunk.height[i] = tile.height;
            chunk.decor[i] = tile.decor;
            chunk.deposit[i] = tile.deposit;
            chunk.coal[i] = tile.coal;
        }
    }
    chunk
}
