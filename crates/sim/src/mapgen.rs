//! Deterministic planet generation.
//!
//! The planet is a shallow impact basin on a mineral-rich world: brine in the
//! low centre, basalt shelves, regolith drifts, silica ridges, crystal fields on
//! the rim, and a poured concrete colony apron crossed by haul roads. All of it
//! comes from one 32-bit seed and integer noise, so a replay rebuilds the exact
//! same surface.

use oc_content::terrain::{
    T_APRON, T_BASALT, T_BRINE, T_CRYSTAL, T_MOSS, T_REGOLITH, T_ROAD, T_SAND,
};

use crate::state::Map;

/// Tile that the colony is centred on.
pub const START_TX: i32 = 19;
/// Tile that the colony is centred on.
pub const START_TY: i32 = 19;

/// Hash a lattice point.
#[must_use]
pub fn hash2(seed: u32, x: i32, y: i32) -> u32 {
    let mut h = seed ^ (x as u32).wrapping_mul(0x9E37_79B1) ^ (y as u32).wrapping_mul(0x85EB_CA77);
    h ^= h >> 15;
    h = h.wrapping_mul(0x2C1B_3C6D);
    h ^= h >> 12;
    h = h.wrapping_mul(0x297A_2D39);
    h ^= h >> 15;
    h
}

/// Smooth value noise in `0..=1024` on a lattice of `scale` tiles.
#[must_use]
pub fn noise(seed: u32, x: i32, y: i32, scale: i32) -> i32 {
    let s = scale.max(1);
    let gx = x.div_euclid(s);
    let gy = y.div_euclid(s);
    let fx = x.rem_euclid(s) * 1024 / s;
    let fy = y.rem_euclid(s) * 1024 / s;
    let c00 = (hash2(seed, gx, gy) & 1023) as i32;
    let c10 = (hash2(seed, gx + 1, gy) & 1023) as i32;
    let c01 = (hash2(seed, gx, gy + 1) & 1023) as i32;
    let c11 = (hash2(seed, gx + 1, gy + 1) & 1023) as i32;
    // smoothstep on the fractional part to avoid lattice banding
    let sx = (fx as i64 * fx as i64 * (3072 - 2 * fx) as i64 / 1_048_576) as i32;
    let sy = (fy as i64 * fy as i64 * (3072 - 2 * fy) as i64 / 1_048_576) as i32;
    let top = c00 + (c10 - c00) * sx / 1024;
    let bot = c01 + (c11 - c01) * sx / 1024;
    top + (bot - top) * sy / 1024
}

/// Three octave fractal noise in `0..=1024`.
#[must_use]
pub fn fbm(seed: u32, x: i32, y: i32) -> i32 {
    let a = noise(seed, x, y, 11);
    let b = noise(seed ^ 0x51_7C_C1_B7, x, y, 5);
    let c = noise(seed ^ 0x9E_37_79, x, y, 2);
    (a * 48 + b * 30 + c * 22) / 100
}

/// Rounded basin falloff: pushes the middle of the map down so brine collects.
fn basin(w: i32, h: i32, x: i32, y: i32) -> i32 {
    let cx = (w / 2).max(1);
    let cy = (h / 2).max(1);
    let dx = (x - cx).abs();
    let dy = (y - cy).abs();
    let d = (dx * dx + dy * dy) * 1024 / (cx * cx + cy * cy).max(1);
    d.min(1024)
}

/// Result of generation: the map plus the colony anchor.
pub struct Generated {
    /// Tile data.
    pub map: Map,
    /// Colony anchor tile.
    pub start: (i32, i32),
}

/// Generate the whole planet from a seed.
#[must_use]
pub fn generate(seed: u32, w: i32, h: i32) -> Generated {
    let mut map = Map::new(w, h);
    for y in 0..h {
        for x in 0..w {
            let i = (y * w + x) as usize;
            let n = fbm(seed, x, y);
            let b = basin(w, h, x, y);
            // elevation rises away from the basin floor
            let elevation = (n * 45 + b * 55) / 100;
            let (material, height) = classify(seed, x, y, elevation);
            map.material[i] = material;
            map.height[i] = height;
        }
    }
    carve_roads(&mut map);
    carve_apron(&mut map, START_TX, START_TY);
    seed_deposits(seed, &mut map);
    seed_decor(seed, &mut map);
    Generated {
        map,
        start: (START_TX, START_TY),
    }
}

fn classify(seed: u32, x: i32, y: i32, elevation: i32) -> (u8, i8) {
    let crystal = noise(seed ^ 0x1234_5678, x, y, 6);
    if elevation < 240 {
        return (T_BRINE, -1);
    }
    let damp = noise(seed ^ 0x00C0_FFEE, x, y, 7);
    let height = ((elevation - 240) * 4 / 784).clamp(0, 3) as i8;
    if elevation > 820 && crystal > 620 {
        return (T_CRYSTAL, height.max(2));
    }
    if elevation > 760 {
        return (T_SAND, height);
    }
    if elevation < 360 && damp > 470 {
        return (T_MOSS, height);
    }
    if elevation > 520 || crystal > 700 {
        return (T_REGOLITH, height);
    }
    (T_BASALT, height)
}

fn carve_roads(map: &mut Map) {
    const STEP: i32 = 9;
    const OFFSET: i32 = 4;
    const MARGIN: i32 = 3;
    for y in MARGIN..map.h - MARGIN {
        for x in MARGIN..map.w - MARGIN {
            let on_v = x.rem_euclid(STEP) == OFFSET && (7..map.h - 7).contains(&y);
            let on_h = y.rem_euclid(STEP) == OFFSET && (7..map.w - 7).contains(&x);
            if !on_v && !on_h {
                continue;
            }
            let i = (y * map.w + x) as usize;
            if map.material[i] == T_BRINE || map.material[i] == T_CRYSTAL {
                continue;
            }
            map.material[i] = T_ROAD;
        }
    }
}

fn carve_apron(map: &mut Map, cx: i32, cy: i32) {
    for y in cy - 2..cy + 4 {
        for x in cx - 2..cx + 4 {
            if let Some(i) = map.index(x, y) {
                if map.material[i] != T_BRINE {
                    map.material[i] = T_APRON;
                }
            }
        }
    }
}

fn seed_deposits(seed: u32, map: &mut Map) {
    // Cluster centres, then richness falls off around each.
    for k in 0..18u32 {
        let hx = hash2(seed ^ 0xA5A5_1234 ^ k, map.w, map.h) as i32;
        let hy = hash2(seed ^ 0x5A5A_4321 ^ k, map.h, map.w) as i32;
        let cx = 5 + hx.rem_euclid(map.w - 10);
        let cy = 5 + hy.rem_euclid(map.h - 10);
        let rich = 40 + (hash2(seed, cx, cy) % 90) as i32;
        for y in cy - 1..=cy + 1 {
            for x in cx - 1..=cx + 1 {
                if let Some(i) = map.index(x, y) {
                    if map.material[i] == T_BRINE || map.material[i] == T_CRYSTAL {
                        continue;
                    }
                    let d = (x - cx).abs() + (y - cy).abs();
                    let v = rich - d * 12;
                    if v > 0 {
                        map.deposit[i] = v.clamp(1, 255) as u8;
                    }
                }
            }
        }
    }
}

fn seed_decor(seed: u32, map: &mut Map) {
    for y in 0..map.h {
        for x in 0..map.w {
            let i = (y * map.w + x) as usize;
            if map.material[i] == T_ROAD || map.material[i] == T_APRON {
                continue;
            }
            if map.deposit[i] > 0 {
                continue;
            }
            let r = hash2(seed ^ 0x7777_1111, x, y) % 1000;
            let decor = if map.material[i] == T_BRINE {
                0
            } else if map.material[i] == T_CRYSTAL && r < 320 {
                2
            } else if r < 24 {
                1
            } else if r < 52 {
                3
            } else if r < 66 {
                4
            } else if r < 78 {
                5
            } else if r < 82 {
                6
            } else {
                0
            };
            map.decor[i] = decor;
        }
    }
}

#[must_use]
/// Is this material type buildable at all?
pub fn material_buildable(m: u8) -> bool {
    oc_content::terrain::terrain_buildable(m)
}
