//! Mutable simulation state.
//!
//! Every field here is part of the deterministic state: no floats, no
//! wall-clock, no hash maps with non-deterministic iteration order.

use std::cell::RefCell;
use std::collections::BTreeMap;

use oc_iso::fixed::Fp;
use oc_iso::torus;
use oc_protocol::ChunkView;

use crate::chunk::{ChunkCache, TileData};

/// Tile key used by the sparse occupancy table: `y << 16 | x`.
const fn tile_key(x: i32, y: i32) -> u32 {
    ((y as u32) << 16) | x as u32
}

/// The planet surface plus build occupancy.
///
/// Terrain is **not** stored per tile: [`ChunkCache`] regenerates a 32x32 block
/// from `(seed, home, chunk)` on demand and keeps the hot ones resident, so a
/// 10240 x 10240 planet costs about a megabyte instead of a gigabyte. Only
/// building occupancy is materialised, and only for the tiles a structure
/// actually owns, so occupancy stays proportional to the colony, not the planet.
///
/// Coordinates wrap on both axes: every query below accepts any `i32` and folds
/// it into `0..MAP_W` / `0..MAP_H`, which is why a footprint anchored on the
/// seam is a normal placement rather than a special case.
#[derive(Clone, Debug)]
pub struct Map {
    /// Planet circumference along x, in tiles.
    pub w: i32,
    /// Planet circumference along y, in tiles.
    pub h: i32,
    /// World seed the surface is generated from.
    pub seed: u32,
    /// Colony anchor tile (north-west corner of the hub footprint).
    pub start: (i32, i32),
    /// Building id occupying a tile (`0`/absent = free), sparse.
    pub occupied: BTreeMap<u32, u32>,
    /// Resident chunk cache, generated on demand.
    cache: RefCell<ChunkCache>,
}

impl Map {
    /// Allocate the planet surface for a seed and its colony anchor.
    #[must_use]
    pub fn new(seed: u32, start: (i32, i32)) -> Self {
        Self {
            w: oc_iso::grid::MAP_W,
            h: oc_iso::grid::MAP_H,
            seed,
            start,
            occupied: BTreeMap::new(),
            cache: RefCell::new(ChunkCache::new(seed, start)),
        }
    }

    /// Full tile data at a wrapped coordinate.
    #[must_use]
    pub fn tile(&self, x: i32, y: i32) -> TileData {
        self.cache.borrow_mut().tile(x, y)
    }

    /// Terrain material at a tile.
    #[must_use]
    pub fn material_at(&self, x: i32, y: i32) -> u8 {
        self.tile(x, y).material
    }

    /// Elevation step at a tile: `-2` deep water, `-1` shallow water, `0..=3`.
    #[must_use]
    pub fn height_at(&self, x: i32, y: i32) -> i8 {
        self.tile(x, y).height
    }

    /// Decoration index at a tile.
    #[must_use]
    pub fn decor_at(&self, x: i32, y: i32) -> u8 {
        self.tile(x, y).decor
    }

    /// Mineral richness at a tile.
    #[must_use]
    pub fn deposit_at(&self, x: i32, y: i32) -> u8 {
        self.tile(x, y).deposit
    }

    /// Coal seam richness at a tile.
    #[must_use]
    pub fn coal_at(&self, x: i32, y: i32) -> u8 {
        self.tile(x, y).coal
    }

    /// Building id owning a tile, or `0` when free.
    #[must_use]
    pub fn occupant(&self, x: i32, y: i32) -> u32 {
        let (x, y) = torus::wrap(x, y);
        self.occupied.get(&tile_key(x, y)).copied().unwrap_or(0)
    }

    /// Is the tile free of buildings?
    #[must_use]
    pub fn is_free(&self, x: i32, y: i32) -> bool {
        self.occupant(x, y) == 0
    }

    /// Mark or clear the owning building for a tile.
    pub fn set_occupied(&mut self, x: i32, y: i32, id: u32) {
        let (x, y) = torus::wrap(x, y);
        let key = tile_key(x, y);
        if id == 0 {
            self.occupied.remove(&key);
        } else {
            self.occupied.insert(key, id);
        }
    }

    /// Mark a whole footprint, wrapping the seam.
    pub fn fill(&mut self, tx: i32, ty: i32, size: i32, id: u32) {
        let tiles: Vec<(i32, i32)> = torus::footprint(tx, ty, size).collect();
        for (x, y) in tiles {
            self.set_occupied(x, y, id);
        }
    }

    /// Does any tile of the footprint already have an owner?
    #[must_use]
    pub fn footprint_taken(&self, tx: i32, ty: i32, size: i32) -> bool {
        torus::footprint(tx, ty, size).any(|(x, y)| !self.is_free(x, y))
    }

    /// Total mineral richness under a footprint (refinery efficiency input).
    #[must_use]
    pub fn footprint_deposit(&self, tx: i32, ty: i32, size: i32) -> i32 {
        torus::footprint(tx, ty, size)
            .map(|(x, y)| i32::from(self.deposit_at(x, y)))
            .sum()
    }

    /// Total coal seam richness under a footprint (extractor efficiency input).
    #[must_use]
    pub fn footprint_coal(&self, tx: i32, ty: i32, size: i32) -> i32 {
        torus::footprint(tx, ty, size)
            .map(|(x, y)| i32::from(self.coal_at(x, y)))
            .sum()
    }

    /// Wire view of one chunk (generating it if needed). Coordinates wrap.
    #[must_use]
    pub fn chunk_view(&self, cx: i32, cy: i32) -> ChunkView {
        self.cache.borrow_mut().chunk_view(cx, cy)
    }

    /// Number of chunks currently resident (tests / debug overlay).
    #[must_use]
    pub fn loaded_chunks(&self) -> usize {
        self.cache.borrow().len()
    }

    /// Is a tile inside a footprint entirely buildable terrain?
    #[must_use]
    pub fn footprint_buildable(&self, tx: i32, ty: i32, size: i32) -> bool {
        torus::footprint(tx, ty, size)
            .all(|(x, y)| oc_content::terrain::terrain_buildable(self.material_at(x, y)))
    }
}

/// A placed building.
#[derive(Clone, Debug)]
pub struct Building {
    /// Entity id.
    pub id: u32,
    /// Building table index.
    pub kind: u8,
    /// Anchor tile.
    pub tx: i32,
    /// Anchor tile.
    pub ty: i32,
    /// Current hit points.
    pub hp: i32,
    /// Maximum hit points.
    pub hp_max: i32,
    /// `B_STATE_*`.
    pub state: u8,
    /// 0..1000 progress.
    pub progress: u16,
    /// 0..1000 charge / cooldown.
    pub charge: u16,
    /// Bit flags reported to the client.
    pub flags: u8,
    /// Queue length, target id or other role data.
    pub aux: u32,
}

/// A ground or low-air unit.
#[derive(Clone, Debug)]
pub struct Unit {
    /// Entity id.
    pub id: u32,
    /// Unit table index.
    pub kind: u8,
    /// World position in fixed point tile units.
    pub x: Fp,
    /// World position in fixed point tile units.
    pub y: Fp,
    /// Altitude in fixed point tile units.
    pub z: Fp,
    /// Target position in fixed point tile units.
    pub gx: Fp,
    /// Target position in fixed point tile units.
    pub gy: Fp,
    /// Current hit points.
    pub hp: i32,
    /// Maximum hit points.
    pub hp_max: i32,
    /// `UNIT_STATE_*`.
    pub state: u8,
    /// Facing octant.
    pub facing: u8,
    /// 0 player, 1 hostile.
    pub owner: u8,
    /// Current target id or 0.
    pub target: u32,
    /// Milliseconds until the next shot.
    pub cooldown: u32,
    /// Home hangar id for player interceptors, `0` for field units.
    pub home: u32,
}

/// An orbital contact.
#[derive(Clone, Debug)]
pub struct Ship {
    /// Entity id.
    pub id: u32,
    /// Unit table index.
    pub kind: u8,
    /// World position in fixed point tile units.
    pub x: Fp,
    /// World position in fixed point tile units.
    pub y: Fp,
    /// Altitude in fixed point tile units.
    pub z: Fp,
    /// Current hit points.
    pub hp: i32,
    /// Maximum hit points.
    pub hp_max: i32,
    /// `UNIT_STATE_*`.
    pub state: u8,
    /// Orbital lane phase, 0..1000.
    pub phase: u16,
    /// 0 player, 1 hostile.
    pub owner: u8,
    /// Current target id or 0.
    pub target: u32,
    /// Countdown until the next action.
    pub cooldown: u32,
}

/// A short-lived visual owned by the simulation.
#[derive(Clone, Copy, Debug)]
pub struct Effect {
    /// `EFFECT_*`.
    pub kind: u8,
    /// World position in fixed point tile units.
    pub x: Fp,
    /// World position in fixed point tile units.
    pub y: Fp,
    /// Altitude in fixed point tile units.
    pub z: Fp,
    /// Ticks elapsed.
    pub age: u16,
    /// Ticks of lifetime.
    pub life: u16,
    /// Effect specific payload.
    pub value: i32,
    /// 0 player, 1 hostile.
    pub owner: u8,
}

/// A discrete occurrence for the HUD.
#[derive(Clone, Copy, Debug)]
pub struct Event {
    /// `EVENT_*`.
    pub kind: u8,
    /// Primary argument.
    pub a: u32,
    /// Secondary argument.
    pub b: u32,
    /// Map ping tile x, or -1.
    pub tx: i16,
    /// Map ping tile y, or -1.
    pub ty: i16,
}

/// A line-shaped visual: weapon shot, tractor beam or repair arc.
#[derive(Clone, Copy, Debug)]
pub struct Beam {
    /// `BEAM_*`.
    pub kind: u8,
    /// Source position in fixed point tile units.
    pub x0: Fp,
    /// Source position in fixed point tile units.
    pub y0: Fp,
    /// Source altitude in fixed point tile units.
    pub z0: Fp,
    /// Target position in fixed point tile units.
    pub x1: Fp,
    /// Target position in fixed point tile units.
    pub y1: Fp,
    /// Target altitude in fixed point tile units.
    pub z1: Fp,
    /// Ticks elapsed.
    pub age: u16,
    /// Ticks of lifetime.
    pub life: u16,
    /// 0 player, 1 hostile.
    pub owner: u8,
}

/// A trade lane's runtime state.
#[derive(Clone, Copy, Debug, Default)]
pub struct RouteState {
    /// Lane open.
    pub active: bool,
    /// 0..1000 progress of the current run.
    pub progress: u16,
    /// Smoothed throughput, 0..1000.
    pub throughput: u16,
    /// Delivered loads.
    pub loads: u16,
    /// Lane grade, 0..1000.
    pub grade: u16,
}

/// Stockpiles in whole units and their milli-unit accumulators.
#[derive(Clone, Copy, Debug, Default)]
pub struct Res {
    /// Alloy stockpile.
    pub alloy: i32,
    /// Fuel cell stockpile.
    pub fuel: i32,
    /// Research points.
    pub research: i32,
    /// Coal stockpile.
    pub coal: i32,
    /// Alloy accumulator in milli-units.
    pub a_alloy: i32,
    /// Fuel accumulator in milli-units.
    pub a_fuel: i32,
    /// Research accumulator in milli-units.
    pub a_research: i32,
    /// Coal accumulator in milli-units.
    pub a_coal: i32,
}
