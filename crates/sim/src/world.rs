//! The simulation world: state, command intake, tick loop and snapshot export.
//!
//! `step()` is the only mutating entry point and its canonical order is fixed:
//! apply pending commands, run the systems in [`crate::systems::run_all`] order,
//! age transient effects, then advance the tick counter. Snapshot encoding and
//! spatial queries live in the [`placement`] and [`encode`] submodules.

use oc_content::balance;
use oc_content::buildings::{self, BuildingRow};
use oc_content::units;
use oc_iso::rng::RngStreams;
use oc_protocol::{Command, Policy, STATUS_DEFEAT, STATUS_RUNNING, STATUS_VICTORY};

use crate::mapgen;
use crate::state::{Beam, Building, Effect, Event, Map, Res, RouteState, Ship, Unit};

mod encode;
mod placement;
mod resources;

/// Ticks of simulation per second.
pub const TICKS_PER_SEC: u32 = 30;
/// Simulation milliseconds per tick.
pub const TICK_MS: u32 = 1000 / TICKS_PER_SEC;

/// Maximum alloy the colony may stockpile.
pub const MAX_ALLOY: i32 = 99_999;
/// Maximum fuel cells.
pub const MAX_FUEL: i32 = 9_999;
/// Maximum research points.
pub const MAX_RESEARCH: i32 = 999_999;

/// Sandbox flag: infinite resources (`Policy::sandbox_flags` bit 0).
pub const SANDBOX_INFINITE: u16 = 1;
/// Sandbox flag: instant construction (bit 1).
pub const SANDBOX_INSTANT: u16 = 2;
/// Sandbox flag: debug overlays only (bit 2).
pub const SANDBOX_DEBUG: u16 = 4;

/// The whole mutable simulation.
pub struct World {
    /// World seed.
    pub seed: u32,
    /// Tick counter.
    pub tick: u32,
    /// `STATUS_*`.
    pub status: u8,
    /// 0 paused, 1..3 speed.
    pub speed: u8,
    /// Speed restored when un-pausing.
    pub prev_speed: u8,
    /// Player policy mirrors.
    pub policy: Policy,
    /// Deterministic RNG streams.
    pub rng: RngStreams,
    /// Planet surface.
    pub map: Map,
    /// Stockpiles.
    pub res: Res,
    /// Produced energy.
    pub energy_out: i32,
    /// Consumed energy.
    pub energy_in: i32,
    /// Commands received since the last tick.
    pub pending: Vec<Command>,
    /// Placed buildings.
    pub buildings: Vec<Building>,
    /// Ground and low-air units.
    pub units: Vec<Unit>,
    /// Orbital contacts.
    pub ships: Vec<Ship>,
    /// Transient effects.
    pub effects: Vec<Effect>,
    /// Transient line effects.
    pub beams: Vec<Beam>,
    /// Events for this tick only.
    pub events: Vec<Event>,
    /// Next entity id.
    pub next_id: u32,
    /// Orbital lift capacity granted by rockets (relay masts add more, see
    /// [`World::orbital_capacity`]).
    pub capacity: u16,
    /// Runtime state for every row of [`oc_content::routes::ROUTES`].
    ///
    /// The length comes from the content table at compile time, so appending a
    /// route cannot leave this array short: indexing by table index in
    /// `commands` and `logistics` stays in bounds by construction.
    pub routes: [RouteState; oc_content::routes::ROUTES.len()],
    /// Researched techs, bit per tech index.
    pub techs: u32,
    /// Current wave number.
    pub wave: u16,
    /// Milliseconds until the next wave (the true clock; the snapshot only
    /// publishes it when the colony has the sensors to know, see
    /// [`World::visible_eta_ms`]).
    pub fleet_eta_ms: u32,
    /// Set once the upcoming wave has been announced to the HUD.
    pub wave_announced: bool,
    /// A wave is currently inbound or on the ground (used for wave resolution).
    pub wave_in_flight: bool,
    /// 0 calm, 1 inbound, 2 engaged, 3 breached.
    pub threat: u8,
    /// Smoothed rates for the HUD (per minute).
    pub alloy_rate: i32,
    /// Smoothed rates for the HUD (per minute).
    pub fuel_rate: i32,
    /// Smoothed rates for the HUD (per minute).
    pub research_rate: i32,
    /// Cached encoded snapshot.
    snapshot_buf: Vec<u8>,
    /// Cached encoded boot blob.
    boot_buf: Vec<u8>,
    /// Last state hash.
    last_hash: u32,
}

impl World {
    /// Create a world from a seed.
    #[must_use]
    pub fn new(seed: u32) -> Self {
        let generated = mapgen::generate(seed, oc_iso::grid::MAP_W, oc_iso::grid::MAP_H);
        let mut world = Self {
            seed,
            tick: 0,
            status: STATUS_RUNNING,
            speed: 1,
            prev_speed: 1,
            policy: Policy {
                sandbox_flags: 0,
                ai_phase: 0,
                ai_strength: 1,
            },
            rng: RngStreams::new(u64::from(seed)),
            map: generated.map,
            res: Res {
                alloy: balance::START_ALLOY,
                fuel: balance::START_FUEL,
                research: balance::START_RESEARCH,
                ..Res::default()
            },
            energy_out: 0,
            energy_in: 0,
            pending: Vec::new(),
            buildings: Vec::new(),
            units: Vec::new(),
            ships: Vec::new(),
            effects: Vec::new(),
            beams: Vec::new(),
            events: Vec::new(),
            next_id: 1,
            capacity: 0,
            routes: [RouteState::default(); oc_content::routes::ROUTES.len()],
            techs: 0,
            wave: 0,
            fleet_eta_ms: balance::FIRST_WAVE_S * 1000,
            wave_announced: false,
            wave_in_flight: false,
            threat: 0,
            alloy_rate: 0,
            fuel_rate: 0,
            research_rate: 0,
            snapshot_buf: Vec::new(),
            boot_buf: Vec::new(),
            last_hash: 0,
        };
        world.seed_colony(generated.start);
        world.encode_boot();
        world.encode_snapshot();
        world
    }

    /// Place the starting command hub plus a solar array and a refinery that
    /// actually sits on a deposit: without ore income the opening is dead.
    fn seed_colony(&mut self, start: (i32, i32)) {
        let (sx, sy) = start;
        let _ = self.place_now(buildings::B_HQ, sx, sy, true);
        if let Some((x, y)) = self.find_free_site(2, sx, sy, false) {
            let _ = self.place_now(buildings::B_SOLAR, x, y, true);
        }
        if let Some((x, y)) = self.find_free_site(2, sx, sy, true) {
            let _ = self.place_now(buildings::B_REFINERY, x, y, true);
        }
    }

    /// Allocate an entity id.
    pub fn alloc_id(&mut self) -> u32 {
        let id = self.next_id;
        self.next_id = self.next_id.wrapping_add(1).max(1);
        id
    }

    /// Look up a building row.
    #[must_use]
    pub fn def(kind: u8) -> &'static BuildingRow {
        let idx = (kind as usize).min(buildings::BUILDINGS.len() - 1);
        &buildings::BUILDINGS[idx]
    }

    /// Look up a unit row.
    #[must_use]
    pub fn unit_def(kind: u8) -> &'static units::UnitRow {
        let idx = (kind as usize).min(units::UNITS.len() - 1);
        &units::UNITS[idx]
    }

    /// Emit a transient effect.
    pub fn effect(&mut self, kind: u8, x: i32, y: i32, z: i32, life: u16, value: i32) {
        if self.effects.len() >= oc_protocol::version::MAX_EFFECTS {
            return;
        }
        self.effects.push(Effect {
            kind,
            x,
            y,
            z,
            age: 0,
            life,
            value,
            owner: 0,
        });
    }

    /// Emit a transient line effect.
    #[allow(clippy::too_many_arguments)]
    pub fn beam(&mut self, kind: u8, from: (i32, i32, i32), to: (i32, i32, i32), life: u16) {
        if self.beams.len() >= oc_protocol::version::MAX_EFFECTS {
            return;
        }
        self.beams.push(Beam {
            kind,
            x0: from.0,
            y0: from.1,
            z0: from.2,
            x1: to.0,
            y1: to.1,
            z1: to.2,
            age: 0,
            life,
            owner: 0,
        });
    }

    /// Emit an event for the HUD.
    pub fn event(&mut self, kind: u8, a: u32, b: u32, tx: i16, ty: i16) {
        if self.events.len() >= oc_protocol::version::MAX_EVENTS {
            return;
        }
        self.events.push(Event { kind, a, b, tx, ty });
    }

    /// Decode and queue a command batch. Malformed bytes are ignored: a broken
    /// client must never be able to poison the deterministic state.
    pub fn apply_bytes(&mut self, bytes: &[u8]) {
        if let Ok(batch) = postcard::from_bytes::<oc_protocol::CommandBatch>(bytes) {
            self.pending.extend(batch.commands);
        }
    }

    /// Queue a single command directly (tests, headless CLI).
    pub fn push(&mut self, command: Command) {
        self.pending.push(command);
    }

    /// Advance the simulation by one host frame.
    pub fn step(&mut self) {
        self.apply_pending();
        let mult = match self.speed {
            0 => 0,
            1 => 1,
            2 => 2,
            _ => 4,
        };
        if mult == 0 {
            self.encode_snapshot();
            return;
        }
        for _ in 0..mult {
            self.advance();
        }
        self.encode_snapshot();
    }

    fn apply_pending(&mut self) {
        if self.pending.is_empty() {
            return;
        }
        let commands = core::mem::take(&mut self.pending);
        for command in commands {
            crate::commands::apply(self, command);
        }
    }

    fn advance(&mut self) {
        self.events.clear();
        let dt = TICK_MS;
        crate::systems::run_all(self, dt);
        self.age_effects();
        self.tick = self.tick.wrapping_add(1);
    }

    fn age_effects(&mut self) {
        for e in &mut self.effects {
            e.age = e.age.saturating_add(1);
        }
        self.effects.retain(|e| e.age < e.life);
        for b in &mut self.beams {
            b.age = b.age.saturating_add(1);
        }
        self.beams.retain(|b| b.age < b.life);
    }

    /// Milliseconds of simulated time.
    #[must_use]
    pub const fn time_ms(&self) -> u32 {
        self.tick.wrapping_mul(TICK_MS)
    }

    /// End the campaign.
    pub fn finish(&mut self, victory: bool) {
        self.status = if victory {
            STATUS_VICTORY
        } else {
            STATUS_DEFEAT
        };
        self.speed = 0;
        self.event(oc_protocol::EVENT_END, u32::from(victory), 0, -1, -1);
    }
}

/// FNV-1a over a byte slice.
#[must_use]
pub fn fnv1a(bytes: &[u8]) -> u32 {
    let mut h: u32 = 0x811C_9DC5;
    for b in bytes {
        h ^= u32::from(*b);
        h = h.wrapping_mul(0x0100_0193);
    }
    h
}
