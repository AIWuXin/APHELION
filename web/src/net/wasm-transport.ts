/**
 * A hand written `extern "C"` ABI instead of wasm-bindgen glue.
 *
 * The module exports a dozen functions over linear memory; the protocol is
 * already binary, so the whole bridge is "write bytes, call, read bytes". This
 * keeps the build to one `cargo build --target wasm32-unknown-unknown` and
 * removes wasm-pack from the toolchain entirely.
 */

import type { BuildQuery } from '../generated/BuildQuery';
import type { BootBlob } from '../generated/BootBlob';
import type { ChunkView } from '../generated/ChunkView';
import type { Command } from '../generated/Command';
import type { Snapshot } from '../generated/Snapshot';
import { decodeBootBlob, decodeChunkView, decodeSnapshot } from './decode';
import { encodeCommandBatch } from './encode';
import { Reader } from './postcard';
import { CLIENT_PROTOCOL } from './protocol';
import type { Transport, TransportHandlers } from './transport';

/** Exports declared by `crates/bridge-wasm/src/lib.rs`. */
interface OcExports {
  readonly memory: WebAssembly.Memory;
  readonly oc_init: (seed: number) => number;
  readonly oc_version: () => number;
  readonly oc_alloc: (len: number) => number;
  readonly oc_free: (ptr: number, len: number) => void;
  readonly oc_apply: (ptr: number, len: number) => void;
  readonly oc_step: () => void;
  readonly oc_snapshot_ptr: () => number;
  readonly oc_snapshot_len: () => number;
  readonly oc_boot_ptr: () => number;
  readonly oc_boot_len: () => number;
  readonly oc_chunk: (cx: number, cy: number) => number;
  readonly oc_chunk_len: () => number;
  readonly oc_query_place: (kind: number, tx: number, ty: number) => number;
  readonly oc_banner_ptr: () => number;
  readonly oc_banner_len: () => number;
}

/** What the debug overlay wants to know. */
export interface WasmStats {
  /** Wall clock milliseconds spent inside `oc_step` over the last second. */
  readonly stepMs: number;
  /** Snapshot payload size in bytes. */
  readonly snapshotBytes: number;
  /** Module build tag. */
  readonly banner: string;
}

/** Options for {@link WasmTransport}. */
export interface WasmTransportOptions {
  /** Where `oc.wasm` is served from. */
  readonly url?: string;
  /** World seed; `0` picks a fresh one from the URL or clock. */
  readonly seed?: number;
  /** Fixed host frames per second (defaults to the 30 Hz simulation rate). */
  readonly hz?: number;
}

const DEFAULT_URL = new URL('oc.wasm', document.baseURI).href;

/** Single player transport backed by the Rust simulation compiled to wasm. */
export class WasmTransport implements Transport {
  public readonly kind = 'wasm' as const;

  private module: OcExports | null = null;
  private handlers: TransportHandlers | null = null;
  private timer: number | null = null;
  /** Set once a loop failure has been reported, so `onError` fires only once. */
  private failed = false;
  private seed: number;
  private readonly url: string;
  private readonly hz: number;
  private stepMsAcc = 0;
  private stepSamples = 0;
  private lastStats: WasmStats = { stepMs: 0, snapshotBytes: 0, banner: '' };

  public constructor(options: WasmTransportOptions = {}) {
    this.url = options.url ?? DEFAULT_URL;
    this.seed = options.seed ?? 0;
    this.hz = options.hz ?? 30;
  }

  public async start(handlers: TransportHandlers): Promise<void> {
    this.handlers = handlers;
    this.failed = false;
    try {
      const response = await fetch(this.url);
      if (!response.ok) throw new Error(`oc.wasm: HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      const { instance } = await WebAssembly.instantiate(bytes, {});
      const exports = instance.exports as unknown as OcExports;
      if (typeof exports.oc_init !== 'function') {
        throw new Error('oc.wasm: missing oc_init export');
      }
      this.module = exports;
      const seed = this.seed || readSeedFromUrl();
      this.seed = seed;
      const version = exports.oc_init(seed);
      if (version !== CLIENT_PROTOCOL) {
        throw new Error(`oc.wasm: protocol ${version}, client expects ${CLIENT_PROTOCOL}`);
      }

      const boot = this.readBlob(exports.oc_boot_ptr(), exports.oc_boot_len());
      const bootBlob: BootBlob = decodeBootBlob(boot);
      handlers.onBoot(bootBlob);
      this.pushSnapshot();
      this.startLoop();
    } catch (error) {
      handlers.onError(error instanceof Error ? error.message : String(error));
    }
  }

  public send(commands: readonly Command[]): void {
    if (commands.length === 0) return;
    this.withModule((exports) => {
      const payload = encodeCommandBatch(commands);
      const ptr = exports.oc_alloc(payload.byteLength);
      if (ptr === 0) return;
      new Uint8Array(exports.memory.buffer, ptr, payload.byteLength).set(payload);
      exports.oc_apply(ptr, payload.byteLength);
      exports.oc_free(ptr, payload.byteLength);
    });
  }

  public queryPlace(kind: number, tx: number, ty: number): BuildQuery {
    let packed = 0;
    this.withModule((exports) => {
      packed = exports.oc_query_place(kind, tx, ty);
    });
    return {
      ok: (packed & 1) !== 0,
      affordable: (packed & 2) !== 0,
      unlocked: (packed & 4) !== 0,
      placement_ok: (packed & 8) !== 0,
      reason: (packed >>> 8) & 0xff,
      cost_alloy: (packed >>> 16) & 0xffff,
      cost_fuel: 0,
    };
  }

  /**
   * Stream one 32x32 terrain chunk.
   *
   * `oc_chunk` reuses one encoding buffer, so the bytes are copied out before
   * anything else touches the module. Chunk coordinates wrap on the planet.
   */
  public chunk(cx: number, cy: number): ChunkView | null {
    const exports = this.module;
    if (!exports || typeof exports.oc_chunk !== 'function') return null;
    const ptr = exports.oc_chunk(cx, cy);
    const len = exports.oc_chunk_len();
    const bytes = this.readBlob(ptr, len);
    if (bytes.byteLength === 0) return null;
    try {
      return decodeChunkView(new Reader(bytes));
    } catch {
      return null;
    }
  }

  /** Latest timing figures for the debug overlay. */
  public stats(): WasmStats {
    return this.lastStats;
  }

  public close(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    this.module = null;
    this.handlers = null;
  }

  private startLoop(): void {
    const period = Math.max(4, Math.round(1000 / this.hz));
    this.timer = window.setInterval(() => {
      const exports = this.module;
      if (!exports) return;
      try {
        const t0 = performance.now();
        exports.oc_step();
        this.stepMsAcc += performance.now() - t0;
        this.stepSamples += 1;
        this.pushSnapshot();
        if (this.stepSamples >= this.hz) {
          this.lastStats = {
            stepMs: this.stepMsAcc / this.stepSamples,
            snapshotBytes: exports.oc_snapshot_len(),
            banner: this.readBanner(exports),
          };
          this.stepMsAcc = 0;
          this.stepSamples = 0;
        }
      } catch (error) {
        // A broken tick must tear the loop down, not throw every period forever.
        this.fail(error);
      }
    }, period);
  }

  /** Stop the loop and report a fatal tick failure exactly once. */
  private fail(error: unknown): void {
    if (this.failed) return;
    this.failed = true;
    const handlers = this.handlers;
    this.close();
    handlers?.onError(error instanceof Error ? error.message : String(error));
  }

  private readBanner(exports: OcExports): string {
    const ptr = exports.oc_banner_ptr();
    const len = exports.oc_banner_len();
    return new TextDecoder().decode(new Uint8Array(exports.memory.buffer, ptr, len));
  }

  private pushSnapshot(): void {
    const exports = this.module;
    const handlers = this.handlers;
    if (!exports || !handlers) return;
    const view = this.readBlob(exports.oc_snapshot_ptr(), exports.oc_snapshot_len());
    const snapshot: Snapshot = decodeSnapshot(view);
    handlers.onSnapshot(snapshot);
  }

  /** Copy a (ptr, len) pair out of wasm memory immediately. */
  private readBlob(ptr: number, len: number): Uint8Array {
    const exports = this.module;
    if (!exports || ptr === 0 || len === 0) return new Uint8Array(0);
    return new Uint8Array(exports.memory.buffer, ptr, len).slice();
  }

  private withModule(fn: (exports: OcExports) => void): void {
    if (this.module) fn(this.module);
  }
}

/** Read `?seed=` or derive a stable seed from the clock. */
function readSeedFromUrl(): number {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('seed');
  if (raw !== null) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) return parsed >>> 0;
  }
  return (Date.now() & 0x7fffffff) >>> 0;
}
