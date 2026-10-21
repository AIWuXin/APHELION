//! Mutable simulation state.
//!
//! Every field here is part of the deterministic state: no floats, no
//! wall-clock, no hash maps with non-deterministic iteration order.

use oc_iso::fixed::Fp;

/// The generated planet surface plus build occupancy.
#[derive(Clone, Debug)]
pub struct Map {
    /// Width in tiles.
    pub w: i32,
    /// Height in tiles.
    pub h: i32,
    /// Terrain material per tile.
    pub material: Vec<u8>,
    /// Elevation step per tile.
    pub height: Vec<i8>,
    /// Decoration per tile.
    pub decor: Vec<u8>,
    /// Mineral richness per tile.
    pub deposit: Vec<u8>,
    /// Coal seam richness per tile.
    pub coal: Vec<u8>,
    /// Building id occupying each tile (`0` = free).
    pub occupied: Vec<u32>,
}

impl Map {
    /// Allocate an empty map of the given size.
    #[must_use]
    pub fn new(w: i32, h: i32) -> Self {
        let n = (w * h) as usize;
        Self {
            w,
            h,
            material: vec![0; n],
            height: vec![0; n],
            decor: vec![0; n],
            deposit: vec![0; n],
            coal: vec![0; n],
            occupied: vec![0; n],
        }
    }

    /// Row-major index of a tile, if inside the map.
    #[must_use]
    pub fn index(&self, x: i32, y: i32) -> Option<usize> {
        if x < 0 || y < 0 || x >= self.w || y >= self.h {
            None
        } else {
            Some((y * self.w + x) as usize)
        }
    }

    /// Terrain material at a tile (`T_BASALT` when out of bounds).
    #[must_use]
    pub fn material_at(&self, x: i32, y: i32) -> u8 {
        self.index(x, y).map_or(0, |i| self.material[i])
    }

    /// Mineral richness at a tile.
    #[must_use]
    pub fn deposit_at(&self, x: i32, y: i32) -> u8 {
        self.index(x, y).map_or(0, |i| self.deposit[i])
    }

    /// Coal seam richness at a tile.
    #[must_use]
    pub fn coal_at(&self, x: i32, y: i32) -> u8 {
        self.index(x, y).map_or(0, |i| self.coal[i])
    }

    /// Is the tile inside the map and free of buildings?
    #[must_use]
    pub fn is_free(&self, x: i32, y: i32) -> bool {
        self.index(x, y).is_some_and(|i| self.occupied[i] == 0)
    }

    /// Mark or clear the owning building for a tile.
    pub fn set_occupied(&mut self, x: i32, y: i32, id: u32) {
        if let Some(i) = self.index(x, y) {
            self.occupied[i] = id;
        }
    }

    /// Mark a whole footprint.
    pub fn fill(&mut self, tx: i32, ty: i32, size: i32, id: u32) {
        for y in ty..ty + size {
            for x in tx..tx + size {
                self.set_occupied(x, y, id);
            }
        }
    }

    /// Does any tile of the footprint already have an owner?
    #[must_use]
    pub fn footprint_taken(&self, tx: i32, ty: i32, size: i32) -> bool {
        for y in ty..ty + size {
            for x in tx..tx + size {
                if !self.is_free(x, y) {
                    return true;
                }
            }
        }
        false
    }

    /// Total mineral richness under a footprint (refinery efficiency input).
    #[must_use]
    pub fn footprint_deposit(&self, tx: i32, ty: i32, size: i32) -> i32 {
        let mut total = 0;
        for y in ty..ty + size {
            for x in tx..tx + size {
                total += i32::from(self.deposit_at(x, y));
            }
        }
        total
    }

    /// Total coal seam richness under a footprint (extractor efficiency input).
    #[must_use]
    pub fn footprint_coal(&self, tx: i32, ty: i32, size: i32) -> i32 {
        let mut total = 0;
        for y in ty..ty + size {
            for x in tx..tx + size {
                total += i32::from(self.coal_at(x, y));
            }
        }
        total
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
