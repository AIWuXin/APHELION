//! Native tests for the raw bridge ABI: allocation hygiene, query packing, the
//! out-of-range kind guard and the chunk streaming export.

use oc_bridge_wasm::{
    oc_alloc, oc_apply, oc_chunk, oc_chunk_len, oc_free, oc_init, oc_query_place, oc_tick,
};
use oc_content::buildings;
use oc_protocol::{BuildQuery, ChunkView};
use oc_sim::World;

/// Unpack the fields `oc_query_place` carries in its bit layout.
fn unpack(packed: u32) -> (bool, bool, bool, bool, u8, i16) {
    (
        packed & 1 != 0,
        packed & 2 != 0,
        packed & 4 != 0,
        packed & 8 != 0,
        ((packed >> 8) & 0xFF) as u8,
        (packed >> 16) as u16 as i16,
    )
}

/// Deterministic local window of anchors around the colony (the planet is too
/// big to scan exhaustively).
fn local_anchors(world: &World) -> Vec<(i32, i32)> {
    let (cx, cy) = world.map.start;
    let mut out = Vec::new();
    for dy in -20..=20 {
        for dx in -20..=20 {
            out.push((
                oc_iso::torus::wrap_x(cx + dx),
                oc_iso::torus::wrap_y(cy + dy),
            ));
        }
    }
    out
}

#[test]
fn query_place_rejects_kinds_outside_the_table() {
    assert_eq!(oc_init(1), u32::from(oc_protocol::PROTOCOL_VERSION));
    assert_eq!(
        oc_query_place(u32::from(buildings::B_COUNT), 20, 20),
        0,
        "out-of-range kinds must not answer like a clamped content row"
    );
    assert_eq!(oc_query_place(256, 20, 20), 0);
}

#[test]
fn query_place_packing_matches_the_query_struct() {
    const SEED: u32 = 0x5EED_1234;
    oc_init(SEED);
    let world = World::new(SEED);
    let kind = buildings::B_SOLAR;
    let (tx, ty) = local_anchors(&world)
        .into_iter()
        .find(|&(tx, ty)| world.query_place(kind, tx, ty).placement_ok)
        .expect("at least one legal solar anchor");
    let q: BuildQuery = world.query_place(kind, tx, ty);
    let (ok, affordable, unlocked, placement_ok, reason, cost_alloy) =
        unpack(oc_query_place(u32::from(kind), tx as u32, ty as u32));
    assert_eq!(
        (ok, affordable, unlocked, placement_ok, reason, cost_alloy),
        (
            q.ok,
            q.affordable,
            q.unlocked,
            q.placement_ok,
            q.reason,
            q.cost_alloy as i16,
        )
    );
}

#[test]
fn chunk_export_streams_wrapped_chunks() {
    const SEED: u32 = 0x5EED_1234;
    oc_init(SEED);
    let world = World::new(SEED);
    let ptr = oc_chunk(2, 3);
    let len = oc_chunk_len();
    assert!(!ptr.is_null() && len > 0, "oc_chunk must encode a chunk");
    let bytes = unsafe { core::slice::from_raw_parts(ptr, len) }.to_vec();
    let view: ChunkView = postcard::from_bytes(&bytes).expect("decode chunk");
    assert_eq!((view.cx, view.cy), (2, 3));
    assert_eq!(view.terrain.len(), 1024);
    assert_eq!(view.elev.len(), 1024);
    assert_eq!(view.terrain, world.chunk_view(2, 3).terrain);

    // Negative coordinates wrap to the far side of the torus.
    let ptr = oc_chunk(-1, -1);
    let len = oc_chunk_len();
    let bytes = unsafe { core::slice::from_raw_parts(ptr, len) }.to_vec();
    let wrapped: ChunkView = postcard::from_bytes(&bytes).expect("decode wrapped chunk");
    assert_eq!(
        (wrapped.cx, wrapped.cy),
        (oc_iso::torus::CHUNKS - 1, oc_iso::torus::CHUNKS - 1)
    );
    assert_eq!(wrapped.terrain, world.chunk_view(-1, -1).terrain);
}

#[test]
fn null_byte_paths_are_ignored() {
    oc_init(2);
    let tick = oc_tick();
    unsafe {
        oc_apply(core::ptr::null(), 0);
        oc_apply(core::ptr::null(), 16);
    }
    assert_eq!(oc_tick(), tick);
}

#[test]
fn alloc_rejects_zero_and_impossible_sizes() {
    assert!(unsafe { oc_alloc(0) }.is_null());
    assert!(unsafe { oc_alloc(usize::MAX) }.is_null());
}

#[test]
fn alloc_free_round_trip_keeps_alignment() {
    let ptr = unsafe { oc_alloc(64) };
    assert!(!ptr.is_null());
    assert!((ptr as usize).is_multiple_of(8));
    unsafe {
        core::ptr::write_bytes(ptr, 0xAB, 64);
        assert_eq!(ptr.read(), 0xAB);
        assert_eq!(ptr.add(63).read(), 0xAB);
        oc_free(ptr, 64);
        oc_free(ptr, 0);
        oc_free(core::ptr::null_mut(), 16);
    }
}
