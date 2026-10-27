//! Emits `web/tests/fixtures/boot.bin`: a real catalogue plus the planet's
//! dimensions. The planet is chunked, so the boot blob no longer carries a tile
//! array -- terrain is fetched per 32x32 chunk through `oc_chunk`.

use oc_protocol::{BootBlob, MapView, PROTOCOL_VERSION};

/// Planet circumference used by the wire fixture (must match `oc_iso::grid`).
const PLANET: u16 = 10_240;
/// Chunk edge used by the wire fixture (must match `oc_iso::torus`).
const CHUNK: u16 = 32;

fn map_meta() -> MapView {
    // A plausible run: the colony anchor sits near the planet centre, where
    // `find_home` starts its spiral.
    MapView {
        seed: 0x5EED_1234,
        width: PLANET,
        height: PLANET,
        chunk_size: CHUNK,
        start_tx: 5_122,
        start_ty: 5_126,
        oil_tx: 5_080,
        oil_ty: 5_040,
    }
}

#[test]
fn emit_boot_fixture() {
    let map = map_meta();
    assert_eq!(map.width % map.chunk_size, 0, "chunks must tile the planet");
    let boot = BootBlob {
        protocol: PROTOCOL_VERSION,
        seed: 0x5EED_1234,
        catalog: oc_content::catalog(),
        map,
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
