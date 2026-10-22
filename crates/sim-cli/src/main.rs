//! Headless determinism harness, scripted colony playtest and kernel benchmark.
//!
//! `cargo run -p oc-sim-cli -- 1000` runs the scripted colony for N host frames
//! and prints the resulting state hash. Running it twice must print the same
//! number; CI does exactly that and fails on a mismatch.
//!
//! `cargo run -p oc-sim-cli -- --idle 300` boots the world, advances N frames
//! with no commands and prints only the final state hash. The wasm hash gate
//! compares that line with `scripts/wasm-hash.mjs` to prove the committed
//! `web/public/oc.wasm` was built from the current kernel.
//!
//! `cargo run -p oc-sim-cli --release -- --bench` measures chunk generation,
//! tick throughput and snapshot encoding (see [`bench`]); the scripted playtest
//! itself lives in [`script`].

mod bench;
mod script;

use oc_sim::World;

/// Default world seed, shared with `scripts/wasm-hash.mjs`.
const DEFAULT_SEED: u32 = 0x5EED_1234;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.iter().any(|arg| arg.as_str() == "--bench") {
        bench::run();
        return;
    }
    if let Some(index) = args.iter().position(|arg| arg.as_str() == "--idle") {
        let ticks: u32 = args
            .get(index + 1)
            .and_then(|s| s.parse().ok())
            .unwrap_or(300);
        let seed: u32 = args
            .get(index + 2)
            .and_then(|s| s.parse().ok())
            .unwrap_or(DEFAULT_SEED);
        run_idle(seed, ticks);
        return;
    }
    let ticks: u32 = args.first().and_then(|s| s.parse().ok()).unwrap_or(1000);
    let seed: u32 = args
        .get(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(DEFAULT_SEED);

    let (hash_a, summary) = script::run(seed, ticks);
    let (hash_b, _) = script::run(seed, ticks);
    println!("seed       : {seed:#010x}");
    println!("ticks      : {ticks}");
    println!("hash run#1 : {hash_a:#010x}");
    println!("hash run#2 : {hash_b:#010x}");
    println!("{summary}");
    if hash_a != hash_b {
        eprintln!("DETERMINISM FAILURE: hashes differ");
        std::process::exit(1);
    }
    println!("determinism: OK");
}

/// Boot the world, advance `ticks` frames with no commands and print only the
/// final state hash.
///
/// One line, `0x` plus eight lowercase hex digits, so a shell can compare it
/// with `node scripts/wasm-hash.mjs` byte for byte. The kernel is deterministic,
/// so a native build and a wasm build of the same sources must agree.
fn run_idle(seed: u32, ticks: u32) {
    let mut world = World::new(seed);
    for _ in 0..ticks {
        world.step();
    }
    println!("{:#010x}", world.hash());
}
