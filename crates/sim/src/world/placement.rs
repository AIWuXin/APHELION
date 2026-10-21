//! Placement rules, orbital capacity maths and cheap spatial queries.
//!
//! The renderer asks [`World::query_place`] for the ghost preview and the
//! command path re-runs exactly the same function, so what the player sees is
//! always what the simulation enforces.

use oc_content::buildings;
use oc_content::terrain::terrain_buildable;
use oc_iso::fixed::{dist2, FP};
use oc_protocol::{
    BuildQuery, REASON_ALLOY, REASON_BOUNDS, REASON_ERA, REASON_FUEL, REASON_LINK, REASON_LOCKED,
    REASON_OCCUPIED, REASON_OK, REASON_TERRAIN,
};

use super::{World, SANDBOX_INFINITE};

/// What the starting colony needs under a candidate site.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SiteRule {
    /// Any free, buildable footprint.
    Free,
    /// A footprint sitting on a mineral deposit (the opening refinery).
    Deposit,
    /// A footprint that sterilises neither ore nor coal: a solar array must not
    /// sit on an extraction site that it can never mine.
    Barren,
}

impl World {
    /// Can a building of this kind be placed with its anchor at `tx, ty`?
    #[must_use]
    pub fn query_place(&self, kind: u8, tx: i32, ty: i32) -> BuildQuery {
        let def = Self::def(kind);
        let size = i32::from(def.footprint);
        let era_ok = def.tier <= self.era;
        let mut q = BuildQuery {
            ok: false,
            affordable: self.sandbox(SANDBOX_INFINITE)
                || (self.res.alloy >= def.cost_alloy && self.res.fuel >= def.cost_fuel),
            unlocked: self.has_tech(def.tech),
            reason: REASON_OK,
            cost_alloy: def.cost_alloy,
            cost_fuel: def.cost_fuel,
            placement_ok: false,
        };
        let mut placement_ok = true;
        let mut reason = REASON_OK;
        'footprint: for y in ty..ty + size {
            for x in tx..tx + size {
                let Some(i) = self.map.index(x, y) else {
                    placement_ok = false;
                    reason = REASON_BOUNDS;
                    break 'footprint;
                };
                if !terrain_buildable(self.map.material[i]) {
                    placement_ok = false;
                    reason = REASON_TERRAIN;
                    break 'footprint;
                }
                if self.map.occupied[i] != 0 {
                    placement_ok = false;
                    reason = REASON_OCCUPIED;
                    break 'footprint;
                }
            }
        }
        // A refinery has to sit on a deposit or it would be a dead 90-alloy box.
        if placement_ok
            && kind == buildings::B_REFINERY
            && self.map.footprint_deposit(tx, ty, size) <= 0
        {
            placement_ok = false;
            reason = REASON_LINK;
        }
        // The coal extractor has the same rule against its own seam layer.
        if placement_ok
            && kind == buildings::B_COAL_MINE
            && self.map.footprint_coal(tx, ty, size) <= 0
        {
            placement_ok = false;
            reason = REASON_LINK;
        }
        q.placement_ok = placement_ok;
        // Tech and era gating are unconditional: sandbox modes may make things
        // instant or free, but they never bypass the research tree or the era.
        q.ok = placement_ok && q.affordable && q.unlocked && era_ok;
        if !q.unlocked {
            q.reason = REASON_LOCKED;
        } else if !era_ok {
            q.reason = REASON_ERA;
        } else if !q.affordable {
            q.reason = if self.res.alloy < def.cost_alloy {
                REASON_ALLOY
            } else {
                REASON_FUEL
            };
        } else if !placement_ok {
            q.reason = reason;
        }
        q
    }

    /// Create a building immediately (used for the starting colony and by the
    /// normal placement path once validation passed).
    pub fn place_now(&mut self, kind: u8, tx: i32, ty: i32, finished: bool) -> u32 {
        let def = Self::def(kind);
        let size = i32::from(def.footprint);
        let id = self.alloc_id();
        self.map.fill(tx, ty, size, id);
        let hp = if finished {
            def.hp
        } else {
            (def.hp / 4).max(1)
        };
        let state = if finished {
            oc_protocol::B_STATE_IDLE
        } else {
            oc_protocol::B_STATE_SITE
        };
        self.buildings.push(crate::state::Building {
            id,
            kind,
            tx,
            ty,
            hp,
            hp_max: def.hp,
            state,
            progress: if finished { 1000 } else { 0 },
            charge: 0,
            flags: 0,
            aux: 0,
        });
        id
    }

    /// Orbital capacity currently committed to open lanes.
    #[must_use]
    pub fn routes_used(&self) -> u16 {
        self.routes
            .iter()
            .enumerate()
            .filter(|(_, r)| r.active)
            .map(|(i, _)| oc_content::routes::ROUTES.get(i).map_or(0, |d| d.capacity))
            .sum()
    }

    /// Lift added by finished relay masts (their table capacity).
    #[must_use]
    pub fn relay_lift(&self) -> u16 {
        let per_mast = u16::try_from(Self::def(buildings::B_RELAY).capacity).unwrap_or(0);
        (self.count_done(buildings::B_RELAY) as u16).saturating_mul(per_mast)
    }

    /// Total orbital lift: rockets plus relay-mast lift.
    #[must_use]
    pub fn orbital_capacity(&self) -> u16 {
        self.capacity.saturating_add(self.relay_lift())
    }

    /// How many buildings of a kind exist, finished or under construction.
    #[must_use]
    pub fn count_kind(&self, kind: u8) -> usize {
        self.buildings.iter().filter(|b| b.kind == kind).count()
    }

    /// How many *finished* buildings of a kind exist.
    #[must_use]
    pub fn count_done(&self, kind: u8) -> usize {
        self.buildings
            .iter()
            .filter(|b| b.kind == kind && b.state != oc_protocol::B_STATE_SITE)
            .count()
    }

    /// Nearest completed building of a kind to a fixed point position.
    #[must_use]
    pub fn nearest_building(&self, kinds: &[u8], x: i32, y: i32) -> Option<(usize, u64)> {
        let mut best: Option<(usize, u64)> = None;
        for (i, b) in self.buildings.iter().enumerate() {
            if !kinds.contains(&b.kind) || b.state == oc_protocol::B_STATE_SITE {
                continue;
            }
            let size = i32::from(Self::def(b.kind).footprint);
            let cx = b.tx * FP + size * FP / 2;
            let cy = b.ty * FP + size * FP / 2;
            let d = dist2(cx, cy, x, y);
            if best.is_none_or(|(_, bd)| d < bd) {
                best = Some((i, d));
            }
        }
        best
    }

    /// Nearest free footprint of `size` to `(cx, cy)` that also satisfies
    /// `rule`. Ties break row-major, so it is deterministic. Used by the
    /// starting colony; players place via [`World::query_place`].
    #[must_use]
    pub fn find_free_site(
        &self,
        size: i32,
        cx: i32,
        cy: i32,
        rule: SiteRule,
    ) -> Option<(i32, i32)> {
        let (pcx, pcy) = (cx * FP + FP / 2, cy * FP + FP / 2);
        let mut best: Option<(u64, i32, i32)> = None;
        for ty in 0..=self.map.h - size {
            for tx in 0..=self.map.w - size {
                let mut free = true;
                'footprint: for y in ty..ty + size {
                    for x in tx..tx + size {
                        let Some(i) = self.map.index(x, y) else {
                            free = false;
                            break 'footprint;
                        };
                        if !terrain_buildable(self.map.material[i]) || self.map.occupied[i] != 0 {
                            free = false;
                            break 'footprint;
                        }
                    }
                }
                let fits = match rule {
                    SiteRule::Free => true,
                    SiteRule::Deposit => self.map.footprint_deposit(tx, ty, size) > 0,
                    SiteRule::Barren => {
                        self.map.footprint_deposit(tx, ty, size) == 0
                            && self.map.footprint_coal(tx, ty, size) == 0
                    }
                };
                if !free || !fits {
                    continue;
                }
                let key = (dist2(tx * FP + FP / 2, ty * FP + FP / 2, pcx, pcy), ty, tx);
                if best.is_none_or(|b| key < b) {
                    best = Some(key);
                }
            }
        }
        best.map(|(_, ty, tx)| (tx, ty))
    }
}
