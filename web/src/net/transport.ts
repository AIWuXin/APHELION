/**
 * The transport contract.
 *
 * Two implementations exist and are interchangeable:
 *  - {@link WasmTransport} runs the Rust simulation in a Web Worker for the
 *    single-player demo;
 *  - `WebSocketTransport` (docs/architecture.md, optional P4) talks to
 *    `crates/server` with the same binary frames.
 *
 * Presentation code depends only on this interface, so swapping the source of
 * truth never touches the renderer or the HUD.
 */

import type { BuildQuery } from '../generated/BuildQuery';
import type { BootBlob } from '../generated/BootBlob';
import type { ChunkView } from '../generated/ChunkView';
import type { Command } from '../generated/Command';
import type { Snapshot } from '../generated/Snapshot';

/** Callbacks a transport drives. */
export interface TransportHandlers {
  /** Static content + planet, delivered once before the first snapshot. */
  readonly onBoot: (boot: BootBlob) => void;
  /** One frame of world state. */
  readonly onSnapshot: (snapshot: Snapshot) => void;
  /** Fatal transport error; the UI shows the message and stops the loop. */
  readonly onError: (message: string) => void;
}

/** Where the world state comes from. */
export interface Transport {
  /** Stable identifier for the debug overlay. */
  readonly kind: 'wasm' | 'websocket';

  /** Bring the transport up and start delivering snapshots. */
  start(handlers: TransportHandlers): Promise<void>;

  /** Queue player commands; flushed on the next tick. */
  send(commands: readonly Command[]): void;

  /** Stop and release resources. */
  close(): void;

  /**
   * Optional synchronous placement query. Wasm answers it directly; a remote
   * transport may omit it, in which case the UI shows an optimistic ghost.
   */
  queryPlace?: (kind: number, tx: number, ty: number) => BuildQuery;

  /**
   * Optional synchronous terrain fetch for one 32x32 chunk.
   *
   * The planet is 10240 x 10240 tiles, so terrain is streamed per chunk rather
   * than shipped at boot. Coordinates wrap: `(-1, -1)` is the chunk before
   * `(0, 0)`. Returns `null` when no terrain source is available (a transport
   * that cannot stream chunks simply renders void).
   */
  chunk?: (cx: number, cy: number) => ChunkView | null;
}
