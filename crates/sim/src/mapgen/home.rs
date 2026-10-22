//! Home picking: a bounded deterministic spiral from the planet centre that
//! only accepts dry, habitable, buildable, ore-bearing *continental* sites.
//!
//! A candidate qualifies when at least [`HOME_INLAND_MIN_RAYS`] of eight
//! compass rays stay dry for [`HOME_INLAND_RAY_LEN`] tiles, so the colony
//! always has an inland to grow into: a coast on a continent qualifies, a
//! small island never does. Everything here is a pure function of the seed.

use oc_content::terrain::terrain_buildable;
use oc_iso::grid::{MAP_H, MAP_W};
use oc_iso::torus;

use super::{climate, hq_size};

/// Spiral step between candidate home tiles.
pub const HOME_SEARCH_STEP: i32 = 4;
/// Bounded number of rings the spiral may visit (96 * 4 = 384 tiles radius).
/// Wide enough that a continent candidate exists even when the planet centre
/// sits in the middle of an ocean basin.
pub const HOME_SEARCH_RINGS: i32 = 96;
/// Ore probes needed inside [`HOME_ORE_RADIUS`] for a candidate to qualify.
pub const HOME_MIN_ORE_SAMPLES: usize = 2;
/// Radius checked for ore potential around a candidate home.
pub const HOME_ORE_RADIUS: i32 = 8;
/// How far each inland probe ray reaches from a candidate home tile.
pub const HOME_INLAND_RAY_LEN: i32 = 128;
/// Step between probes on an inland ray.
pub const HOME_INLAND_RAY_STEP: i32 = 8;
/// Land samples (of 16) a ray needs to count as open inland.
pub const HOME_INLAND_RAY_MIN_LAND: usize = 14;
/// Solid inland rays (of 8) a continent home must have. Five means a coast on
/// a continent still qualifies -- the inland half is open -- while an island
/// narrow enough to wet every ray within 128 tiles never does.
pub const HOME_INLAND_MIN_RAYS: usize = 5;

/// Deterministic probe offsets (a ring plus a cheaper diagonal lattice).
const ORE_PROBES: [(i32, i32); 12] = [
    (0, -8),
    (0, 8),
    (-8, 0),
    (8, 0),
    (-6, -6),
    (6, -6),
    (-6, 6),
    (6, 6),
    (-4, 4),
    (4, -4),
    (-4, -4),
    (4, 4),
];

/// Is this candidate a dry, non-frozen, buildable landing site?
fn habitable(base: &climate::BaseTile) -> bool {
    terrain_buildable(base.material)
        && base.temperature >= climate::TEMP_COLD
        && base.temperature <= climate::TEMP_TEMPERATE + 180
}

/// Is the hub footprint plus a one-tile margin buildable land?
fn flats_ok(seed: u32, x: i32, y: i32) -> bool {
    let span = hq_size() + 2;
    for dy in 0..=span {
        for dx in 0..=span {
            let tile = climate::base_tile(seed, torus::wrap_x(x + dx), torus::wrap_y(y + dy));
            if !terrain_buildable(tile.material) {
                return false;
            }
        }
    }
    true
}

/// How many ore probe points around a candidate carry a *rich* ore seam?
///
/// The scattered specks are ignored on purpose: every land tile now has a
/// speck within reach, so counting them would make this probe meaningless and
/// move the colony to a barren site on seeds that used to wait for a seam.
fn ore_samples(seed: u32, x: i32, y: i32) -> usize {
    ORE_PROBES
        .iter()
        .filter(|(dx, dy)| {
            let x = torus::wrap_x(x + dx);
            let y = torus::wrap_y(y + dy);
            let tile = climate::base_tile(seed, x, y);
            climate::rich_minerals(seed, x, y, tile.material).0 > 0
        })
        .count()
}

/// How many of the eight compass rays from a candidate stay dry for
/// [`HOME_INLAND_RAY_LEN`] tiles? A ray is "solid" when at least
/// [`HOME_INLAND_RAY_MIN_LAND`] of its samples are land; five solid rays mean
/// there is always an inland to grow into. Cheap early exit: once four rays
/// have failed, five can no longer be reached.
fn inland_rays(seed: u32, x: i32, y: i32) -> usize {
    const DIRECTIONS: [(i32, i32); 8] = [
        (0, -1),
        (1, -1),
        (1, 0),
        (1, 1),
        (0, 1),
        (-1, 1),
        (-1, 0),
        (-1, -1),
    ];
    let samples = HOME_INLAND_RAY_LEN / HOME_INLAND_RAY_STEP;
    let mut solid = 0;
    let mut failed = 0;
    for (dx, dy) in DIRECTIONS {
        let mut land = 0;
        for step in 1..=samples {
            let tile = climate::base_tile(
                seed,
                torus::wrap_x(x + dx * step * HOME_INLAND_RAY_STEP),
                torus::wrap_y(y + dy * step * HOME_INLAND_RAY_STEP),
            );
            if climate::is_land(tile.material) {
                land += 1;
            }
        }
        if land >= HOME_INLAND_RAY_MIN_LAND {
            solid += 1;
        } else {
            failed += 1;
            if failed > DIRECTIONS.len() - HOME_INLAND_MIN_RAYS {
                break;
            }
        }
    }
    solid
}

/// Candidate offsets on the square ring of radius `r`, sampled every
/// [`HOME_SEARCH_STEP`] tiles in a fixed order.
fn ring_candidates(r: i32) -> Vec<(i32, i32)> {
    if r == 0 {
        return vec![(0, 0)];
    }
    let mut out = Vec::new();
    let mut dx = -r;
    while dx <= r {
        out.push((dx, -r));
        out.push((dx, r));
        dx += HOME_SEARCH_STEP;
    }
    let mut dy = -r + HOME_SEARCH_STEP;
    while dy < r {
        out.push((-r, dy));
        out.push((r, dy));
        dy += HOME_SEARCH_STEP;
    }
    out
}

/// Pick the colony anchor: a deterministic spiral out from the planet centre.
///
/// The first candidate that is dry, habitable, has a buildable hub pad, sits
/// on a continent (at least [`HOME_INLAND_MIN_RAYS`] of eight inland rays stay
/// dry for [`HOME_INLAND_RAY_LEN`] tiles) *and* has ore potential within
/// [`HOME_ORE_RADIUS`] tiles wins: a coast on a continent qualifies, an island
/// never does. If the bounded spiral finds no site with ore, the first
/// continental site is used (the guaranteed ore body still feeds the opening);
/// failing that, the first dry tile it saw (the landing carve raises and
/// drains it); if the spiral saw no land at all, the planet centre is used and
/// carved. The result is a pure function of the seed.
#[must_use]
pub fn find_home(seed: u32) -> (i32, i32) {
    let (cx, cy) = (MAP_W / 2, MAP_H / 2);
    let mut fallback: Option<(i32, i32)> = None;
    let mut legacy: Option<(i32, i32)> = None;
    for ring in 0..=HOME_SEARCH_RINGS {
        for (dx, dy) in ring_candidates(ring * HOME_SEARCH_STEP) {
            let (x, y) = torus::wrap(cx + dx, cy + dy);
            let base = climate::base_tile(seed, x, y);
            if !climate::is_land(base.material) {
                continue;
            }
            if fallback.is_none() {
                fallback = Some((x, y));
            }
            if !habitable(&base) || !flats_ok(seed, x, y) {
                continue;
            }
            // Continent first: the ray walk is plain base_tile noise and early
            // exits on the fourth failed ray, while the ore probes call the
            // pricier rich-mineral fields -- spend those only on real inland.
            if inland_rays(seed, x, y) < HOME_INLAND_MIN_RAYS {
                continue;
            }
            if ore_samples(seed, x, y) < HOME_MIN_ORE_SAMPLES {
                if legacy.is_none() {
                    legacy = Some((x, y));
                }
                continue;
            }
            return (x, y);
        }
    }
    legacy.or(fallback).unwrap_or((cx, cy))
}
