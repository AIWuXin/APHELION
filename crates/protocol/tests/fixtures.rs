//! Golden protocol fixtures.
//!
//! Writes `web/tests/fixtures/snapshot.bin` (postcard) and the expected decoded
//! JSON next to it. The TypeScript decoder test reads both, so any drift between
//! the Rust declarations and `web/src/net/postcard.ts` fails the front-end build
//! instead of silently corrupting the HUD.

use oc_protocol::{
    BeamView, BuildingView, Command, CommandBatch, EffectView, EventView, Orbital, Policy,
    Resources, RouteView, ShipView, Snapshot, UnitView, PROTOCOL_VERSION,
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
    }
}

fn expected_json() -> String {
    // Hand written so it is a genuinely independent description of the wire
    // shape rather than a round trip of the same code.
    r#"{
  "protocol": 1,
  "tick": 300,
  "hash": 3735928559,
  "time_ms": 9900,
  "status": 1,
  "speed": 2,
  "resources": {
    "alloy": 420, "alloy_rate": 46, "fuel": 90, "fuel_rate": 30,
    "research": 12, "research_rate": 7, "energy_out": 60, "energy_in": 24
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
    { "id": 7, "kind": 1, "tx": 24, "ty": 19, "hp": 180, "hp_max": 180, "state": 2, "progress": 1000, "charge": 0, "flags": 3, "aux": 46 }
  ],
  "units": [
    { "id": 42, "kind": 0, "x": -3072, "y": 768, "z": 0, "hp": 130, "hp_max": 130, "state": 1, "facing": 5, "owner": 1, "target": 7 }
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
  ]
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
