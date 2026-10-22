//! Frozen chunk-generation contract.
//!
//! Performance work on the generator is only ever allowed to make it *faster*.
//! This file pins the bytes: a deterministic sample of 64 chunks is folded into
//! one FNV digest, and the digest is compared against the value the generator
//! produced before the axis tables were hoisted out of the tile loop.
//!
//! It also cross-checks the two live paths against each other -- the one-off
//! `mapgen::tile` query (trig per tile) and the chunk generator (per-chunk axis
//! table) -- so a future change to either one cannot drift away from the other
//! unnoticed.

use oc_iso::torus::{CHUNKS, CHUNK_TILES};
use oc_sim::mapgen;
use oc_sim::Chunk;

const SEED: u32 = 0x5EED_1234;

/// Digest the generator currently produces for the sampled chunks.
///
/// Regenerating any sampled chunk differently is a behaviour change, not an
/// optimisation: bumping this constant means the planet moved and every
/// committed world, screenshot and save is stale.
///
/// History:
/// - `0x3EB0_C004` -- the pre-scatter planet (rich seams only).
/// - `0xC8A3_9F72` -- 2026-10-22, the scattered T1 layer landed. The new
///   high-frequency speck fields write `deposit`/`coal` bytes on rich-free
///   land in every sampled chunk, so the planet moved by design. The home tile
///   and every rich seam stayed put; only the sparse specks are new.
/// - `0xD8CE_688B` -- 2026-10-22, mineral density settled at 9% of the planet
///   (ore + coal, ~14% of the land). The player read the previous 13% as "ore
///   too dense", so `ORE_THRESHOLD`/`COAL_THRESHOLD` moved 830 -> 870/885 and
///   the speck thresholds 850/845 -> 875/865. The home tile, the guaranteed
///   6x6 bodies and the overlay are untouched; only the thresholded field
///   bytes moved.
/// - `0xBAEE_0655` -- 2026-10-22, home picking gained the continent rule: a
///   candidate now needs five of eight 128-tile inland rays, so the home tile
///   (and with it the landing pad, road grid and guaranteed bodies baked into
///   the sampled home chunk) moved on seeds whose old home was an island or a
///   bare coast. Away from the home overlay the planet itself is unchanged.
const FROZEN_DIGEST: u32 = 0xBAEE_0655;

/// splitmix64 finaliser; the same walk `crates/sim-cli`'s benchmark uses.
const fn mix64(mut z: u64) -> u64 {
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

/// 64 chunks: the corners and centre of the planet, the colony's own chunk, and
/// a deterministic spread over everything else.
fn sample_chunks(home: (i32, i32)) -> Vec<(i32, i32)> {
    let span = CHUNKS as u32;
    let mut out = vec![
        (0, 0),
        (CHUNKS - 1, CHUNKS - 1),
        (CHUNKS / 2, CHUNKS / 2),
        (home.0 / 32, home.1 / 32),
    ];
    let mut state = 0x1234_5678_9ABC_DEF0u64;
    while out.len() < 64 {
        state = mix64(state);
        let cx = ((state >> 32) as u32 % span) as i32;
        state = mix64(state);
        let cy = ((state >> 32) as u32 % span) as i32;
        out.push((cx, cy));
    }
    out
}

/// Every byte the generator publishes for one chunk.
fn planes(chunk: &Chunk) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(CHUNK_TILES * 5 + 8);
    bytes.extend_from_slice(&chunk.cx.to_le_bytes());
    bytes.extend_from_slice(&chunk.cy.to_le_bytes());
    for plane in [&chunk.material, &chunk.decor, &chunk.deposit, &chunk.coal] {
        bytes.extend_from_slice(plane);
    }
    bytes.extend(chunk.height.iter().map(|h| *h as u8));
    bytes
}

#[test]
fn sampled_chunks_match_the_frozen_digest() {
    let home = mapgen::find_home(SEED);
    let mut bytes = Vec::new();
    for (cx, cy) in sample_chunks(home) {
        bytes.extend_from_slice(&planes(&mapgen::chunk(SEED, home, cx, cy)));
    }
    let digest = oc_sim::fnv1a(&bytes);
    assert_eq!(
        digest, FROZEN_DIGEST,
        "the generator changed: {digest:#010x} != {FROZEN_DIGEST:#010x}. \
         Regenerating a chunk differently is a behaviour change, not an optimisation."
    );
}

#[test]
fn the_chunk_path_and_the_one_tile_path_agree() {
    let home = mapgen::find_home(SEED);
    for (cx, cy) in sample_chunks(home).into_iter().take(8) {
        let chunk = mapgen::chunk(SEED, home, cx, cy);
        for ly in 0..32 {
            for lx in 0..32 {
                let tile = mapgen::tile(SEED, home, cx * 32 + lx, cy * 32 + ly);
                let i = Chunk::index(lx, ly);
                let at = format!("chunk ({cx},{cy}) tile ({lx},{ly})");
                assert_eq!(chunk.material[i], tile.material, "material at {at}");
                assert_eq!(chunk.height[i], tile.height, "height at {at}");
                assert_eq!(chunk.decor[i], tile.decor, "decor at {at}");
                assert_eq!(chunk.deposit[i], tile.deposit, "ore at {at}");
                assert_eq!(chunk.coal[i], tile.coal, "coal at {at}");
            }
        }
    }
}

#[test]
fn home_always_sits_on_a_continent() {
    use mapgen::climate;
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
    // A spread of seeds, including the ones the economy and raid suites use.
    for seed in [
        SEED,
        SEED ^ 0x00C0_FFEE,
        0xDEAD_BEEF,
        0x0000_0001,
        0xCAFE_F00D,
    ] {
        let home = mapgen::find_home(seed);
        let mut solid = 0;
        for (dx, dy) in DIRECTIONS {
            let mut land = 0;
            let mut step = 1;
            while step <= mapgen::HOME_INLAND_RAY_LEN / mapgen::HOME_INLAND_RAY_STEP {
                let tile = climate::base_tile(
                    seed,
                    home.0 + dx * step * mapgen::HOME_INLAND_RAY_STEP,
                    home.1 + dy * step * mapgen::HOME_INLAND_RAY_STEP,
                );
                if climate::is_land(tile.material) {
                    land += 1;
                }
                step += 1;
            }
            if land >= mapgen::HOME_INLAND_RAY_MIN_LAND {
                solid += 1;
            }
        }
        assert!(
            solid >= mapgen::HOME_INLAND_MIN_RAYS,
            "seed {seed:#010x}: home {home:?} has only {solid} solid inland rays, \
             needs {need} -- the colony would be stranded on an island",
            need = mapgen::HOME_INLAND_MIN_RAYS
        );
    }
}
