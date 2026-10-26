//! Protocol version and wire limits.

/// Bumped whenever the binary layout changes in a way that older clients cannot
/// read. The client refuses snapshots from a different version instead of
/// rendering garbage.
///
/// 2: the planet went chunked -- `MapView` carries dimensions instead of tile
/// arrays, and terrain arrives as `ChunkView` records from `oc_chunk`.
pub const PROTOCOL_VERSION: u16 = 2;

/// Human facing product version: shown by the launcher, the debug overlay and
/// the README. Cargo and npm need the semver form `0.1.0-a2`; this is the display
/// form used in prose and in the UI.
pub const PRODUCT_VERSION: &str = "0.1.0a2";

/// Hard cap on entities in a snapshot, used to size client-side scratch buffers.
pub const MAX_ENTITIES: usize = 1024;

/// Hard cap on effects per snapshot.
pub const MAX_EFFECTS: usize = 256;

/// Hard cap on events per snapshot.
pub const MAX_EVENTS: usize = 64;

/// Build the protocol banner shown in the debug overlay.
#[must_use]
pub fn banner() -> &'static str {
    "APHELION 0.1.0a2 :: sim/proto-2"
}
