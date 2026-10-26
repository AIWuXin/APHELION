//! Snapshot and boot-blob encoding plus the per-snapshot state hash.
//!
//! The hash is FNV-1a over the *encoded* snapshot frame (taken with a zero hash
//! field), which means it covers every observable field without a
//! hand-maintained list: adding a field to the protocol automatically folds it
//! into the hash.

use oc_content::buildings;
use oc_protocol::{
    BeamView, BootBlob, BuildingView, EffectView, EventView, MapView, Orbital, Resources,
    RouteView, ShipView, Snapshot, UnitView, PROTOCOL_VERSION,
};

use super::{fnv1a, World};
use crate::systems::logistics::LANE_PROGRESS_SCALE;

impl World {
    /// Does the colony have a finished radar array?
    #[must_use]
    pub fn has_radar(&self) -> bool {
        self.count_done(buildings::B_RADAR) > 0
    }

    /// Wave ETA as the HUD may report it.
    ///
    /// The director always knows the true countdown, but the colony does not:
    /// without a radar array the fleet is only detected [`RADAR_DETECT_MS`]
    /// before contact, so the snapshot reports `0` ("unknown") until then. A
    /// finished radar array publishes the exact countdown from the moment the
    /// previous wave is cleared -- that early warning is the whole point of the
    /// 105-alloy radar array.
    ///
    /// [`RADAR_DETECT_MS`]: oc_content::balance::RADAR_DETECT_MS
    #[must_use]
    pub fn visible_eta_ms(&self) -> u32 {
        if self.has_radar() || self.fleet_eta_ms <= oc_content::balance::RADAR_DETECT_MS {
            self.fleet_eta_ms
        } else {
            0
        }
    }

    /// Build the read-only snapshot.
    #[must_use]
    pub fn snapshot(&self, hash: u32) -> Snapshot {
        Snapshot {
            protocol: PROTOCOL_VERSION,
            tick: self.tick,
            hash,
            time_ms: self.time_ms(),
            status: self.status,
            speed: self.speed,
            resources: Resources {
                alloy: self.res.alloy,
                alloy_rate: self.alloy_rate,
                fuel: self.res.fuel,
                fuel_rate: self.fuel_rate,
                research: self.res.research,
                research_rate: self.research_rate,
                energy_out: self.energy_out,
                energy_in: self.energy_in,
                coal: self.res.coal,
                coal_rate: self.coal_rate,
            },
            orbital: Orbital {
                capacity: self.orbital_capacity(),
                used: self.routes_used(),
                routes: self
                    .routes
                    .iter()
                    .map(|r| RouteView {
                        active: r.active,
                        progress: lane_progress(r.progress),
                        throughput: r.throughput,
                        loads: r.loads,
                        grade: r.grade,
                    })
                    .collect(),
                wave: self.wave,
                fleet_eta_ms: self.visible_eta_ms(),
                threat: self.threat,
                ships: self
                    .ships
                    .iter()
                    .map(|s| ShipView {
                        id: s.id,
                        kind: s.kind,
                        x: s.x,
                        y: s.y,
                        z: s.z,
                        hp: s.hp,
                        hp_max: s.hp_max,
                        state: s.state,
                        owner: s.owner,
                        target: s.target,
                    })
                    .collect(),
            },
            policy: self.policy,
            buildings: self
                .buildings
                .iter()
                .map(|b| BuildingView {
                    id: b.id,
                    kind: b.kind,
                    tx: b.tx as u16,
                    ty: b.ty as u16,
                    hp: b.hp,
                    hp_max: b.hp_max,
                    state: b.state,
                    progress: b.progress,
                    charge: b.charge,
                    flags: b.flags,
                    aux: b.aux.min(u32::from(u16::MAX)) as u16,
                })
                .collect(),
            units: self
                .units
                .iter()
                .map(|u| UnitView {
                    id: u.id,
                    kind: u.kind,
                    x: u.x,
                    y: u.y,
                    z: u.z,
                    hp: u.hp,
                    hp_max: u.hp_max,
                    state: u.state,
                    facing: u.facing,
                    owner: u.owner,
                    target: u.target,
                })
                .collect(),
            effects: self
                .effects
                .iter()
                .map(|e| EffectView {
                    kind: e.kind,
                    x: e.x,
                    y: e.y,
                    z: e.z,
                    age: e.age,
                    life: e.life,
                    value: e.value,
                    owner: e.owner,
                })
                .collect(),
            beams: self
                .beams
                .iter()
                .map(|b| BeamView {
                    kind: b.kind,
                    x0: b.x0,
                    y0: b.y0,
                    z0: b.z0,
                    x1: b.x1,
                    y1: b.y1,
                    z1: b.z1,
                    age: b.age,
                    life: b.life,
                    owner: b.owner,
                })
                .collect(),
            events: self
                .events
                .iter()
                .map(|e| EventView {
                    kind: e.kind,
                    a: e.a,
                    b: e.b,
                    tx: e.tx,
                    ty: e.ty,
                })
                .collect(),
            era: self.era,
        }
    }

    pub(super) fn encode_snapshot(&mut self) {
        // Encode once with a zero hash, fold the bytes into FNV-1a, then encode
        // again with the real hash. Hashing the *encoded* frame guarantees the
        // hash covers every observable field without a hand-maintained list.
        let zero = self.snapshot(0);
        let Ok(buf) = postcard::to_allocvec(&zero) else {
            return;
        };
        let hash = fnv1a(&buf);
        self.last_hash = hash;
        let final_snap = self.snapshot(hash);
        self.snapshot_buf = postcard::to_allocvec(&final_snap).unwrap_or_default();
    }

    pub(super) fn encode_boot(&mut self) {
        let boot = BootBlob {
            protocol: PROTOCOL_VERSION,
            seed: self.seed,
            catalog: oc_content::catalog(),
            map: MapView {
                seed: self.map.seed,
                width: self.map.w as u16,
                height: self.map.h as u16,
                chunk_size: oc_iso::torus::CHUNK as u16,
                start_tx: self.map.start.0 as u16,
                start_ty: self.map.start.1 as u16,
            },
        };
        self.boot_buf = postcard::to_allocvec(&boot).unwrap_or_default();
    }

    /// Wire view of one chunk for `oc_chunk`: generated on demand, coordinates
    /// wrap, so the client can stream the planet in either direction.
    #[must_use]
    pub fn chunk_view(&self, cx: i32, cy: i32) -> oc_protocol::ChunkView {
        self.map.chunk_view(cx, cy)
    }

    /// Encoded snapshot for the most recent host step.
    #[must_use]
    pub fn snapshot_bytes(&self) -> &[u8] {
        &self.snapshot_buf
    }

    /// Encoded boot blob (catalogue + planet).
    #[must_use]
    pub fn boot_bytes(&self) -> &[u8] {
        &self.boot_buf
    }

    /// State hash of the most recent tick.
    #[must_use]
    pub const fn hash(&self) -> u32 {
        self.last_hash
    }
}

/// Convert the internal lane phase (0..30000) to the 0..1000 wire units.
fn lane_progress(internal: u16) -> u16 {
    let scale = u32::from(LANE_PROGRESS_SCALE);
    ((u32::from(internal) + scale / 2) / scale).min(1000) as u16
}
