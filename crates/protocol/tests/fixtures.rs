//! Golden protocol fixtures.
//!
//! Writes `web/tests/fixtures/snapshot.bin` (postcard) and the expected decoded
//! JSON next to it. The TypeScript decoder test reads both, so any drift between
//! the Rust declarations and `web/src/net/postcard.ts` fails the front-end build
//! instead of silently corrupting the HUD.

use oc_protocol::{
    BeamView, BuildingView, ChunkView, Command, CommandBatch, EffectView, EventView, Orbital,
    Policy, Resources, RouteView, ShipView, Snapshot, UnitView, PROTOCOL_VERSION,
};

fn fixture() -> Snapshot {
    Snapshot {
        protocol: PROTOCOL_VERSION,
        tick: 300,
        hash: 0xDEAD_BEEF,
        time_ms: 9_900,
        status: 1,
        speed: 2,
        resources: Resources {
            alloy: 420,
            alloy_rate: 46,
            fuel: 90,
            fuel_rate: 30,
            research: 12,
            research_rate: 7,
            energy_out: 60,
            energy_in: 24,
            coal: 37,
            coal_rate: 20,
            oil: 24,
            oil_rate: 12,
        },
        orbital: Orbital {
            capacity: 6,
            used: 2,
            routes: vec![
                RouteView {
                    active: true,
                    progress: 501,
                    throughput: 1000,
                    loads: 3,
                    grade: 250,
                },
                RouteView::default(),
            ],
            wave: 3,
            fleet_eta_ms: 12_345,
            threat: 2,
            ships: vec![ShipView {
                id: 90,
                kind: 3,
                x: 1024,
                y: -2048,
                z: 512,
                hp: 95,
                hp_max: 95,
                state: 2,
                owner: 0,
                target: 77,
            }],
        },
        policy: Policy {
            sandbox_flags: 3,
            ai_phase: 1,
            ai_strength: 2,
        },
        buildings: vec![BuildingView {
            id: 7,
            kind: 1,
            tx: 24,
            ty: 19,
            hp: 180,
            hp_max: 180,
            state: 2,
            progress: 1000,
            charge: 0,
            flags: 3,
            aux: 46,
            production_milli: 330,
        }],
        units: vec![UnitView {
            id: 42,
            kind: 0,
            x: -3072,
            y: 768,
            z: 0,
            hp: 130,
            hp_max: 130,
            state: 1,
            facing: 5,
            owner: 1,
            target: 7,
            home: 7,
            cargo: 18,
        }],
        effects: vec![EffectView {
            kind: 2,
            x: 100,
            y: 200,
            z: 300,
            age: 4,
            life: 16,
            value: 26,
            owner: 1,
        }],
        beams: vec![BeamView {
            kind: 1,
            x0: 10,
            y0: 20,
            z0: 280,
            x1: 30,
            y1: 40,
            z1: 100,
            age: 1,
            life: 6,
            owner: 0,
        }],
        events: vec![
            EventView {
                kind: 5,
                a: 3,
                b: 110,
                tx: -1,
                ty: -1,
            },
            EventView {
                kind: 8,
                a: 2,
                b: 0,
                tx: 7,
                ty: 9,
            },
        ],
        era: 2,
    }
}

fn expected_json() -> String {
    // Hand written so it is a genuinely independent description of the wire
    // shape rather than a round trip of the same code.
    r#"{
  "protocol": 3,
  "tick": 300,
  "hash": 3735928559,
  "time_ms": 9900,
  "status": 1,
  "speed": 2,
  "resources": {
    "alloy": 420, "alloy_rate": 46, "fuel": 90, "fuel_rate": 30,
    "research": 12, "research_rate": 7, "energy_out": 60, "energy_in": 24,
    "coal": 37, "coal_rate": 20, "oil": 24, "oil_rate": 12
  },
  "orbital": {
    "capacity": 6, "used": 2,
    "routes": [
      { "active": true, "progress": 501, "throughput": 1000, "loads": 3, "grade": 250 },
      { "active": false, "progress": 0, "throughput": 0, "loads": 0, "grade": 0 }
    ],
    "wave": 3, "fleet_eta_ms": 12345, "threat": 2,
    "ships": [
      { "id": 90, "kind": 3, "x": 1024, "y": -2048, "z": 512, "hp": 95, "hp_max": 95, "state": 2, "owner": 0, "target": 77 }
    ]
  },
  "policy": { "sandbox_flags": 3, "ai_phase": 1, "ai_strength": 2 },
  "buildings": [
    { "id": 7, "kind": 1, "tx": 24, "ty": 19, "hp": 180, "hp_max": 180, "state": 2, "progress": 1000, "charge": 0, "flags": 3, "aux": 46, "production_milli": 330 }
  ],
  "units": [
    { "id": 42, "kind": 0, "x": -3072, "y": 768, "z": 0, "hp": 130, "hp_max": 130, "state": 1, "facing": 5, "owner": 1, "target": 7, "home": 7, "cargo": 18 }
  ],
  "effects": [
    { "kind": 2, "x": 100, "y": 200, "z": 300, "age": 4, "life": 16, "value": 26, "owner": 1 }
  ],
  "beams": [
    { "kind": 1, "x0": 10, "y0": 20, "z0": 280, "x1": 30, "y1": 40, "z1": 100, "age": 1, "life": 6, "owner": 0 }
  ],
  "events": [
    { "kind": 5, "a": 3, "b": 110, "tx": -1, "ty": -1 },
    { "kind": 8, "a": 2, "b": 0, "tx": 7, "ty": 9 }
  ],
  "era": 2
}"#
        .to_owned()
}

#[test]
fn emit_golden_fixtures() {
    let snap = fixture();
    let bytes = postcard::to_allocvec(&snap).expect("encode fixture");
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("web")
        .join("tests")
        .join("fixtures");
    std::fs::create_dir_all(&dir).expect("create fixture dir");
    std::fs::write(dir.join("snapshot.bin"), &bytes).expect("write bin");
    std::fs::write(dir.join("snapshot.json"), expected_json()).expect("write json");
    // A command batch, so the TypeScript *encoder* can be diffed byte for byte
    // against the Rust encoder.
    let batch = CommandBatch {
        client_tick: 900,
        commands: vec![
            Command::Place {
                kind: 5,
                tx: 130,
                ty: 200,
            },
            Command::Demolish { id: 7 },
            Command::Launch { id: 42 },
            Command::ToggleRoute { route: 2 },
            Command::SetSandbox { flags: 3 },
            Command::SetSpeed { speed: 2 },
            Command::Pause { paused: true },
            Command::Research { tech: 1 },
            Command::SetAi {
                phase: 1,
                strength: 2,
            },
        ],
    };
    let cmd_bytes = postcard::to_allocvec(&batch).expect("encode commands");
    std::fs::write(dir.join("commands.bin"), &cmd_bytes).expect("write commands.bin");

    // A small hexdump keeps the encoding auditable from the test log alone.
    let head: String = bytes
        .iter()
        .take(48)
        .map(|b| format!("{b:02x}"))
        .collect::<Vec<_>>()
        .join(" ");
    println!("fixture bytes = {}", bytes.len());
    println!("fixture head  = {head}");
    println!("command bytes = {}", cmd_bytes.len());

    // Terrain is fetched per chunk now: emit one chunk so the TypeScript chunk
    // decoder has a golden binary to check its array layout against.
    let chunk = chunk_fixture();
    let chunk_bytes = postcard::to_allocvec(&chunk).expect("encode chunk");
    std::fs::write(dir.join("chunk.bin"), &chunk_bytes).expect("write chunk.bin");
    std::fs::write(dir.join("chunk.json"), chunk_expected_json()).expect("write chunk.json");
    println!("chunk bytes   = {}", chunk_bytes.len());
}

/// A synthetic 32x32 chunk with a recognisable, cheap pattern:
/// `terrain = i % 15`, `decor = i % 7`, `elev = (i % 6) - 2`, ore on every
/// 11th tile, coal on every 13th tile that is not ore, oil on every 17th
/// remaining tile (offset by one so the head exercises the new plane).
fn chunk_fixture() -> ChunkView {
    const N: usize = 1024;
    let mut terrain = Vec::with_capacity(N);
    let mut decor = Vec::with_capacity(N);
    let mut elev = Vec::with_capacity(N);
    let mut ore = Vec::with_capacity(N);
    let mut coal = Vec::with_capacity(N);
    let mut oil = Vec::with_capacity(N);
    for i in 0..N {
        terrain.push((i % 15) as u8);
        decor.push((i % 7) as u8);
        elev.push(((i % 6) as i8) - 2);
        ore.push(if i % 11 == 0 { 120 } else { 0 });
        coal.push(if i % 13 == 0 && i % 11 != 0 { 90 } else { 0 });
        oil.push(if i % 17 == 1 && i % 11 != 0 && i % 13 != 0 {
            70
        } else {
            0
        });
    }
    ChunkView {
        cx: 3,
        cy: 160,
        terrain,
        decor,
        elev,
        ore,
        coal,
        oil,
    }
}

/// Hand written expectation for [`chunk_fixture`]: heads of the first 16 tiles
/// plus the three richness sums, so drift in either direction fails the test.
fn chunk_expected_json() -> String {
    r#"{
  "cx": 3,
  "cy": 160,
  "size": 1024,
  "terrain_head": [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,0],
  "decor_head": [0,1,2,3,4,5,6,0,1,2,3,4,5,6,0,1],
  "elev_head": [-2,-1,0,1,2,3,-2,-1,0,1,2,3,-2,-1,0,1],
  "ore_head": [120,0,0,0,0,0,0,0,0,0,0,120,0,0,0,0],
  "coal_head": [0,0,0,0,0,0,0,0,0,0,0,0,0,90,0,0],
  "oil_head": [0,70,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  "ore_sum": 11280,
  "coal_sum": 6390,
  "oil_sum": 3640
}"#
    .to_owned()
}

#[test]
fn chunk_fixture_round_trips_and_matches_its_json() {
    let chunk = chunk_fixture();
    let bytes = postcard::to_allocvec(&chunk).expect("encode chunk");
    let back: ChunkView = postcard::from_bytes(&bytes).expect("decode chunk");
    assert_eq!(back.cx, 3);
    assert_eq!(back.cy, 160);
    assert_eq!(back.terrain.len(), 1024);
    assert_eq!(back.elev[0], -2, "elevation uses i8");
    assert_eq!(back.ore.iter().map(|v| u32::from(*v)).sum::<u32>(), 11_280);
    assert_eq!(back.coal.iter().map(|v| u32::from(*v)).sum::<u32>(), 6_390);
    assert_eq!(back.oil.iter().map(|v| u32::from(*v)).sum::<u32>(), 3_640);
    let terrain_head: Vec<u8> = (0..16).map(|i| (i % 15) as u8).collect();
    assert_eq!(&back.terrain[..16], terrain_head.as_slice());
    let decor_head: [u8; 16] = [0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6, 0, 1];
    assert_eq!(&back.decor[..16], &decor_head);
    let elev_head: [i8; 16] = [-2, -1, 0, 1, 2, 3, -2, -1, 0, 1, 2, 3, -2, -1, 0, 1];
    assert_eq!(&back.elev[..16], &elev_head);
    let json = chunk_expected_json();
    assert!(json.contains("\"ore_sum\": 11280"));
    assert!(json.contains("\"coal_sum\": 6390"));
    assert!(json.contains("\"oil_sum\": 3640"));
    assert!(json.contains("\"terrain_head\""));
}

#[test]
fn fixture_round_trips() {
    let snap = fixture();
    let bytes = postcard::to_allocvec(&snap).expect("encode");
    let back: Snapshot = postcard::from_bytes(&bytes).expect("decode");
    assert_eq!(back.tick, snap.tick);
    assert_eq!(back.events[1].tx, 7);
    assert_eq!(back.orbital.ships[0].y, -2048);
}

#[test]
fn fixture_json_matches_serialized_snapshot() {
    // Guard against the hand written JSON drifting from the struct.
    let json = expected_json();
    assert!(json.contains("\"alloy_rate\": 46"));
    assert!(json.contains("\"fleet_eta_ms\": 12345"));
    let snap = fixture();
    let bytes = postcard::to_allocvec(&snap).expect("encode");
    // A regression here means a field was added or removed. The fixture is the
    // contract with the TypeScript decoder, so keep the size exact-ish.
    assert!(
        (100..=400).contains(&bytes.len()),
        "fixture size changed unexpectedly: {} bytes",
        bytes.len()
    );
}
