//! `--bench`: wall-clock numbers for the three things performance work is
//! judged on.
//!
//! Chunk generation, tick throughput and snapshot encoding, measured on the same
//! kernel the game ships. Wall clock only: nothing here touches the deterministic
//! state, which is why the two hash lines at the bottom exist -- they are the
//! contract that the code being timed still computes exactly what it used to.
//!
//! Usage: `cargo run -q -p oc-sim-cli --release -- --bench`
//!
//! `scripts/wasm-bench.mjs` runs the same three measurements inside
//! `web/public/oc.wasm` with the same seed and the same chunk coordinates, so
//! native and wasm numbers can be read side by side.

use std::time::Instant;

use oc_iso::torus::CHUNKS;
use oc_sim::mapgen;
use oc_sim::World;

use crate::script;

/// Default world seed, shared with `main` and `scripts/wasm-hash.mjs`.
const SEED: u32 = 0x5EED_1234;
/// Chunks sampled for the generation benchmark.
const CHUNK_SAMPLES: usize = 256;
/// Ticks timed per throughput case (matches the CI determinism run).
const TICK_SAMPLES: u32 = 3000;
/// Snapshot encodes timed.
const SNAPSHOT_SAMPLES: u32 = 300;

/// splitmix64 finaliser, so the sampled chunk coordinates are identical on every
/// run and identical to the ones `scripts/wasm-bench.mjs` picks.
const fn mix64(mut z: u64) -> u64 {
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

/// The chunk coordinates both benches walk, in order: a deterministic spread
/// over the whole planet rather than the colony's neighbourhood.
fn sample_chunks() -> Vec<(i32, i32)> {
    let mut state = 0x1234_5678_9ABC_DEF0u64;
    let span = CHUNKS as u32;
    let mut out = Vec::with_capacity(CHUNK_SAMPLES);
    for _ in 0..CHUNK_SAMPLES {
        state = mix64(state);
        let cx = ((state >> 32) as u32 % span) as i32;
        state = mix64(state);
        let cy = ((state >> 32) as u32 % span) as i32;
        out.push((cx, cy));
    }
    out
}

/// Mean / median / p95 / max of one measurement, in microseconds.
struct Stats {
    count: usize,
    mean: f64,
    p50: f64,
    p95: f64,
    max: f64,
}

impl Stats {
    fn new(mut micros: Vec<f64>) -> Self {
        micros.sort_by(f64::total_cmp);
        let count = micros.len();
        let pick = |percent: f64| -> f64 {
            if count == 0 {
                return 0.0;
            }
            let rank = (percent / 100.0 * count as f64).ceil().max(1.0) as usize;
            micros[rank.min(count) - 1]
        };
        let total: f64 = micros.iter().sum();
        Self {
            count,
            mean: if count == 0 {
                0.0
            } else {
                total / count as f64
            },
            p50: pick(50.0),
            p95: pick(95.0),
            max: micros.last().copied().unwrap_or(0.0),
        }
    }

    fn line(&self) -> String {
        format!(
            "n={} mean {:.3}ms p50 {:.3}ms p95 {:.3}ms max {:.3}ms",
            self.count,
            self.mean / 1000.0,
            self.p50 / 1000.0,
            self.p95 / 1000.0,
            self.max / 1000.0,
        )
    }
}

/// Time one chunk generation pass over [`sample_chunks`].
fn bench_chunks() -> Stats {
    let home = mapgen::find_home(SEED);
    let oil_home = mapgen::oil_site(SEED, home);
    let chunks = sample_chunks();
    // Warm-up: the first chunks pay for cold instruction/data caches, which is
    // not what a streaming camera sees.
    for &(cx, cy) in chunks.iter().take(16) {
        std::hint::black_box(mapgen::chunk(SEED, home, oil_home, cx, cy));
    }
    let mut micros = Vec::with_capacity(chunks.len());
    for &(cx, cy) in &chunks {
        let started = Instant::now();
        let chunk = mapgen::chunk(SEED, home, oil_home, cx, cy);
        micros.push(started.elapsed().as_secs_f64() * 1e6);
        std::hint::black_box(chunk);
    }
    Stats::new(micros)
}

/// Time `ticks` steps of an untouched world.
fn bench_idle_ticks(ticks: u32) -> (f64, u32) {
    let mut world = World::new(SEED);
    let started = Instant::now();
    for _ in 0..ticks {
        world.step();
    }
    let millis = started.elapsed().as_secs_f64() * 1e3;
    (millis, world.hash())
}

/// Time the scripted colony for `ticks` steps (the CI determinism workload) and
/// hand the live world back, so the snapshot benchmark measures a populated
/// frame rather than a three-building boot state.
fn bench_script_ticks(ticks: u32) -> (f64, World) {
    let started = Instant::now();
    let (world, _) = script::play(SEED, ticks);
    let millis = started.elapsed().as_secs_f64() * 1e3;
    (millis, world)
}

/// Time one snapshot encode pass and report the encoded frame size.
///
/// The kernel does two passes plus an FNV over the first one per tick, so the
/// per-tick figure quoted in the output is `2 * encode + fnv`.
fn bench_snapshot(world: &World) -> (Stats, f64, usize) {
    let mut micros = Vec::with_capacity(SNAPSHOT_SAMPLES as usize);
    let mut bytes = 0usize;
    let mut fnv_micros = 0.0f64;
    for _ in 0..SNAPSHOT_SAMPLES {
        let started = Instant::now();
        let frame = postcard::to_allocvec(&world.snapshot(0)).unwrap_or_default();
        micros.push(started.elapsed().as_secs_f64() * 1e6);
        bytes = frame.len();
        let started = Instant::now();
        std::hint::black_box(oc_sim::fnv1a(&frame));
        fnv_micros += started.elapsed().as_secs_f64() * 1e6;
    }
    let stats = Stats::new(micros);
    (stats, fnv_micros / f64::from(SNAPSHOT_SAMPLES), bytes)
}

/// Run every measurement and print the report.
pub fn run() {
    println!("bench      : native (oc-sim-cli --bench)");
    println!("seed       : {SEED:#010x}");

    let chunks = bench_chunks();
    println!("chunk gen  : {}", chunks.line());

    let (idle_ms, idle_hash) = bench_idle_ticks(TICK_SAMPLES);
    println!(
        "tick idle  : {TICK_SAMPLES} ticks {idle_ms:.1}ms total {:.3}ms/tick",
        idle_ms / f64::from(TICK_SAMPLES)
    );

    let (script_ms, world) = bench_script_ticks(TICK_SAMPLES);
    let script_hash = world.hash();
    println!(
        "tick script: {TICK_SAMPLES} ticks {script_ms:.1}ms total {:.3}ms/tick",
        script_ms / f64::from(TICK_SAMPLES)
    );

    let (snapshot, fnv_us, bytes) = bench_snapshot(&world);
    println!(
        "snapshot   : {} bytes {bytes} | fnv {fnv_us:.2}us | per tick ~{:.2}us",
        snapshot.line(),
        snapshot.mean * 2.0 + fnv_us
    );

    println!("hash idle  : {idle_hash:#010x}");
    println!("hash script: {script_hash:#010x}");
}
