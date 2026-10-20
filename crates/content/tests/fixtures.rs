//! Emits `web/tests/fixtures/boot.bin`: a real catalogue plus a synthetic
//! planet, so the TypeScript boot decoder can be checked against Rust.

use oc_protocol::{BootBlob, MapView, PROTOCOL_VERSION};

/// 44×44, matching the live map size.
const W: u16 = 44;
/// See [`W`].
const H: u16 = 44;

fn synthetic_map() -> MapView {
    let count = usize::from(W) * usize::from(H);
    let mut material = Vec::with_capacity(count);
    let mut height = Vec::with_capacity(count);
    let mut decor = Vec::with_capacity(count);
    let mut deposit = Vec::with_capacity(count);
    for i in 0..count {
        let x = (i as u16) % W;
        let y = (i as u16) / W;
        // A recognisable pattern: brine in the middle, crystal on the rim.
        let material_index = if x > 18 && x < 26 && y > 18 && y < 26 {
            4
        } else if (x + y).is_multiple_of(7) {
            7
        } else {
            (i % 8) as u8
        };
        material.push(material_index);
        height.push(if material_index == 4 {
            -1
        } else {
            (i % 4) as i8
        });
        decor.push((i % 7) as u8);
        deposit.push(if i % 11 == 0 { 120 } else { 0 });
    }
    MapView {
        w: W,
        h: H,
        material,
        height,
        decor,
        deposit,
    }
}

#[test]
fn emit_boot_fixture() {
    let boot = BootBlob {
        protocol: PROTOCOL_VERSION,
        seed: 0x5EED_1234,
        catalog: oc_content::catalog(),
        map: synthetic_map(),
    };
    let bytes = postcard::to_allocvec(&boot).expect("encode boot");
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("web")
        .join("tests")
        .join("fixtures");
    std::fs::create_dir_all(&dir).expect("create fixture dir");
    std::fs::write(dir.join("boot.bin"), &bytes).expect("write boot.bin");
    println!("boot fixture bytes = {}", bytes.len());
}
