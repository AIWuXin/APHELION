//! Per-tile decoration: which prop, if any, stands on a finished tile.
//!
//! Decoration is a pure function of `(seed, tile, material)` plus the two seam
//! planes, so it survives chunk eviction like everything else on the planet. It
//! lives in its own module because the material table is long and shares nothing
//! with the climate model.

use oc_content::terrain::{
    D_CRATE, D_CRATER, D_CRYSTAL, D_NONE, D_PILLAR, D_ROCK, D_TREE, T_APRON, T_BRINE, T_CRYSTAL,
    T_DEEP, T_DESERT, T_HIGHLAND, T_MOSS, T_MOSSY_TUNDRA, T_ROAD, T_SAND, T_SHALLOW, T_SNOW,
    T_TUNDRA,
};

use super::noise;

/// Decoration for one finished tile (skipped on roads, aprons, water, seams).
pub fn decor_for(seed: u32, x: i32, y: i32, material: u8, deposit: u8, coal: u8) -> u8 {
    if matches!(material, T_ROAD | T_APRON | T_DEEP | T_SHALLOW) || deposit > 0 || coal > 0 {
        return D_NONE;
    }
    let r = noise::hash2(seed ^ 0x7777_1111, x, y) % 1000;
    match material {
        T_BRINE => D_NONE,
        T_CRYSTAL => {
            if r < 320 {
                D_CRYSTAL
            } else {
                D_NONE
            }
        }
        T_SNOW => {
            if r < 90 {
                D_ROCK
            } else if r < 120 {
                D_PILLAR
            } else {
                D_NONE
            }
        }
        T_DESERT | T_SAND => {
            if r < 18 {
                D_CRATER
            } else if r < 30 {
                D_ROCK
            } else {
                D_NONE
            }
        }
        T_HIGHLAND => {
            if r < 70 {
                D_ROCK
            } else if r < 100 {
                D_PILLAR
            } else if r < 112 {
                D_CRATER
            } else {
                D_NONE
            }
        }
        T_TUNDRA | T_MOSSY_TUNDRA => {
            if r < 40 {
                D_TREE
            } else if r < 60 {
                D_ROCK
            } else {
                D_NONE
            }
        }
        T_MOSS => {
            if r < 52 {
                D_TREE
            } else if r < 70 {
                D_ROCK
            } else {
                D_NONE
            }
        }
        _ => {
            if r < 24 {
                D_ROCK
            } else if r < 52 {
                D_TREE
            } else if r < 66 {
                D_PILLAR
            } else if r < 78 {
                D_CRATER
            } else if r < 82 {
                D_CRATE
            } else {
                D_NONE
            }
        }
    }
}
