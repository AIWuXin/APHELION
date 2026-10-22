/**
 * Protocol version the client speaks.
 *
 * Mirrors `crates/protocol/src/version.rs::PROTOCOL_VERSION`; the generated type
 * files carry no constants, so this single number is the one hand-written copy.
 * The wasm bridge reports its own version from `oc_init`/`oc_version` and the
 * client refuses a mismatch instead of rendering garbage.
 *
 * History:
 *  - 2: the planet went chunked -- `MapView` carries `{seed, width, height,
 *    chunk_size, start_tx, start_ty}` instead of a tile array, and terrain
 *    arrives per 32x32 `ChunkView` through `oc_chunk`.
 */
export const CLIENT_PROTOCOL = 2;
