//! Thin wasm bridge.
//!
//! Deliberately **raw**: a dozen `extern "C"` functions over linear memory
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
}

/// Allocate `len` bytes in wasm linear memory.
///
/// # Safety
/// The caller must free the pointer with [`oc_free`] using the same length.
#[no_mangle]
pub unsafe extern "C" fn oc_alloc(len: usize) -> *mut u8 {
    if len == 0 {
        return core::ptr::null_mut();
    }
    let layout = Layout::from_size_align_unchecked(len, 8);
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
    let layout = Layout::from_size_align_unchecked(len, 8);
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

/// Ask the simulation whether a placement is legal.
///
/// Packed as: `ok<<0 | affordable<<1 | unlocked<<2 | placement_ok<<3 |
/// reason<<8 | cost_alloy<<16` (signed cost is stored as two's complement in
/// the high half).
#[no_mangle]
pub extern "C" fn oc_query_place(kind: u32, tx: u32, ty: u32) -> u32 {
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
#[no_mangle]
pub extern "C" fn oc_hash() -> u32 {
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
