//! Protocol version and wire limits.

/// Bumped whenever the binary layout changes in a way that older clients cannot
/// read. The client refuses snapshots from a different version instead of
/// rendering garbage.
pub const PROTOCOL_VERSION: u16 = 1;

/// Human facing product version: shown by the launcher, the debug overlay and
/// the README. Cargo and npm need the semver form `0.1.0-a0`; this is the display
/// form used in prose and in the UI.
pub const PRODUCT_VERSION: &str = "0.1.0a0";

/// Hard cap on entities in a snapshot, used to size client-side scratch buffers.
pub const MAX_ENTITIES: usize = 1024;

/// Hard cap on effects per snapshot.
pub const MAX_EFFECTS: usize = 256;

/// Hard cap on events per snapshot.
pub const MAX_EVENTS: usize = 64;

/// Build the protocol banner shown in the debug overlay.
#[must_use]
pub fn banner() -> &'static str {
    "ORBITAL COMMAND 0.1.0a0 :: sim/proto-1"
}
