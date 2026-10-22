//! Thin wasm bridge.
//!
//! Deliberately **raw**: eighteen `extern "C"` functions over linear memory
//! instead of `wasm-bindgen` glue. The protocol is already binary, so the whole
//! bridge is "write bytes here, call this, read bytes there". That keeps the
//! build to a single `cargo build --target wasm32-unknown-unknown`, removes a
//! whole toolchain (wasm-bindgen / wasm-pack) from CI, and makes the boundary
//! auditable in one screen.
//!
//! Ownership rule: pointers returned from here stay valid only until the next
//! call that mutates the world. The TypeScript side copies immediately.

use core::cell::RefCell;
use std::alloc::{alloc, dealloc, Layout};

use oc_protocol::BuildQuery;
use oc_sim::World;

thread_local! {
    static WORLD: RefCell<Option<World>> = const { RefCell::new(None) };
    /// Reusable encoding buffer for [`oc_chunk`]; a 32x32 chunk is ~5 KB of
    /// postcard, so reallocating per chunk would churn the wasm heap.
    static CHUNK_BUF: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

/// Allocate `len` bytes in wasm linear memory.
///
/// Returns null for zero-length requests and for sizes that cannot form a valid
/// layout (the caller controls `len`, so an unchecked layout would be UB once it
/// exceeds `isize::MAX`).
///
/// # Safety
/// A non-null result must be freed with [`oc_free`] using the same length.
#[no_mangle]
pub unsafe extern "C" fn oc_alloc(len: usize) -> *mut u8 {
    if len == 0 {
        return core::ptr::null_mut();
    }
    let Ok(layout) = Layout::from_size_align(len, 8) else {
        return core::ptr::null_mut();
    };
    alloc(layout)
}

/// Release memory obtained from [`oc_alloc`].
///
/// # Safety
/// `ptr` must come from [`oc_alloc`] with the same `len`.
#[no_mangle]
pub unsafe extern "C" fn oc_free(ptr: *mut u8, len: usize) {
    if ptr.is_null() || len == 0 {
        return;
    }
    let Ok(layout) = Layout::from_size_align(len, 8) else {
        return;
    };
    dealloc(ptr, layout);
}

/// Create a world from a seed and cache its boot blob.
///
/// Returns the protocol version so the client can abort on a mismatch.
#[no_mangle]
pub extern "C" fn oc_init(seed: u32) -> u32 {
    let world = World::new(seed);
    let version = u32::from(oc_protocol::PROTOCOL_VERSION);
    WORLD.with(|w| {
        *w.borrow_mut() = Some(world);
    });
    version
}

/// Apply a postcard-encoded `CommandBatch` prepared by the client.
///
/// # Safety
/// `ptr` must point to `len` readable bytes in wasm linear memory.
#[no_mangle]
pub unsafe extern "C" fn oc_apply(ptr: *const u8, len: usize) {
    if ptr.is_null() || len == 0 {
        return;
    }
    let bytes = core::slice::from_raw_parts(ptr, len);
    WORLD.with(|w| {
        if let Some(world) = w.borrow_mut().as_mut() {
            world.apply_bytes(bytes);
        }
    });
}

/// Advance one host frame (which may run several fixed ticks at high speed).
#[no_mangle]
pub extern "C" fn oc_step() {
    WORLD.with(|w| {
        if let Some(world) = w.borrow_mut().as_mut() {
            world.step();
        }
    });
}

/// Pointer to the most recent snapshot bytes.
#[no_mangle]
pub extern "C" fn oc_snapshot_ptr() -> *const u8 {
    WORLD.with(|w| {
        w.borrow()
            .as_ref()
            .map_or(core::ptr::null(), |world| world.snapshot_bytes().as_ptr())
    })
}

/// Length of the most recent snapshot.
#[no_mangle]
pub extern "C" fn oc_snapshot_len() -> usize {
    WORLD.with(|w| {
        w.borrow()
            .as_ref()
            .map_or(0, |world| world.snapshot_bytes().len())
    })
}

/// Pointer to the boot blob (catalogue + planet), encoded once.
#[no_mangle]
pub extern "C" fn oc_boot_ptr() -> *const u8 {
    WORLD.with(|w| {
        w.borrow()
            .as_ref()
            .map_or(core::ptr::null(), |world| world.boot_bytes().as_ptr())
    })
}

/// Length of the boot blob.
#[no_mangle]
pub extern "C" fn oc_boot_len() -> usize {
    WORLD.with(|w| {
        w.borrow()
            .as_ref()
            .map_or(0, |world| world.boot_bytes().len())
    })
}

/// Encode one 32x32 terrain chunk and return a pointer to its bytes.
///
/// The planet is not shipped as a tile array; the client streams chunks through
/// this call and decodes each as a postcard `ChunkView`. Coordinates wrap, so
/// `(-1, -1)` is the chunk before `(0, 0)`.
///
/// The returned pointer is valid until the next `oc_chunk` (the buffer is
/// reused) -- copy the bytes first. Use [`oc_chunk_len`] for the length.
#[no_mangle]
pub extern "C" fn oc_chunk(cx: i32, cy: i32) -> *const u8 {
    CHUNK_BUF.with(|cell| {
        let mut buf = cell.borrow_mut();
        let encoded = WORLD.with(|w| {
            let guard = w.borrow();
            guard
                .as_ref()
                .and_then(|world| postcard::to_allocvec(&world.chunk_view(cx, cy)).ok())
        });
        *buf = encoded.unwrap_or_default();
        if buf.is_empty() {
            core::ptr::null()
        } else {
            buf.as_ptr()
        }
    })
}

/// Length of the bytes returned by the last [`oc_chunk`] call.
#[no_mangle]
pub extern "C" fn oc_chunk_len() -> usize {
    CHUNK_BUF.with(|b| b.borrow().len())
}

/// Ask the simulation whether a placement is legal.
///
/// Packed as: `ok<<0 | affordable<<1 | unlocked<<2 | placement_ok<<3 |
/// reason<<8 | cost_alloy<<16` (signed cost is stored as two's complement in
/// the high half).
#[no_mangle]
pub extern "C" fn oc_query_place(kind: u32, tx: u32, ty: u32) -> u32 {
    // `Command::Place` silently rejects `kind >= B_COUNT`; reject it here too,
    // otherwise `kind as u8` would truncate (e.g. 256 -> 0) and the ghost
    // preview would answer for a different building than the one it would build.
    if kind >= u32::from(oc_content::buildings::B_COUNT) {
        return 0;
    }
    WORLD.with(|w| {
        let guard = w.borrow();
        let Some(world) = guard.as_ref() else {
            return 0;
        };
        let q: BuildQuery = world.query_place(kind as u8, tx as i32, ty as i32);
        (u32::from(q.ok) & 1)
            | ((u32::from(q.affordable) & 1) << 1)
            | ((u32::from(q.unlocked) & 1) << 2)
            | ((u32::from(q.placement_ok) & 1) << 3)
            | ((u32::from(q.reason) & 0xFF) << 8)
            | (((q.cost_alloy as u32) & 0xFFFF) << 16)
    })
}

/// Protocol version this module was built with.
#[no_mangle]
pub extern "C" fn oc_version() -> u32 {
    u32::from(oc_protocol::PROTOCOL_VERSION)
}

/// Simulation tick counter of the live world.
#[no_mangle]
pub extern "C" fn oc_tick() -> u32 {
    WORLD.with(|w| w.borrow().as_ref().map_or(0, |world| world.tick))
}

/// State hash of the most recent tick.
///
/// Kept for ABI compatibility: it is the same value as [`oc_state_hash`].
#[no_mangle]
pub extern "C" fn oc_hash() -> u32 {
    oc_state_hash()
}

/// Deterministic state hash of the live world.
///
/// Same algorithm and value as `oc-sim-cli --idle` prints: FNV-1a over the
/// postcard-encoded snapshot frame taken with a zero hash field. A wasm build
/// and a native build of the same sources must therefore report the same
/// number for the same seed and tick count -- that is what CI's wasm staleness
/// gate compares.
///
/// Returns 0 when no world exists yet (before [`oc_init`]); a real frame never
/// hashes to 0 in practice, and the gate always calls this after `oc_init`.
#[no_mangle]
pub extern "C" fn oc_state_hash() -> u32 {
    WORLD.with(|w| w.borrow().as_ref().map_or(0, |world| world.hash()))
}

/// Static banner string, exposed as (ptr, len) through two calls for symmetry
/// with the blob accessors.
#[no_mangle]
pub extern "C" fn oc_banner_ptr() -> *const u8 {
    oc_protocol::banner().as_ptr()
}

/// Length of the banner.
#[no_mangle]
pub extern "C" fn oc_banner_len() -> usize {
    oc_protocol::banner().len()
}
