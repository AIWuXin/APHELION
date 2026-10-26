/**
 * Application shell.
 *
 * Owns the single direction of data flow:
 *   input → Command[] → transport.send → sim.step() → Snapshot → renderer + HUD
 *
 * No game rule lives here: the app only converts gestures into commands and
 * turns snapshots into a `Frame` / `HudView`. Camera framing lives in
 * `CameraRig`, key intents in `keys.ts`.
 */

import type { Command } from '../generated/Command';
import type { Snapshot } from '../generated/Snapshot';
import { Renderer } from '../render/renderer';
import type { Frame, Interaction } from '../render/frame';
import type { Camera } from '../render/iso';
import { injectTheme } from '../style/inject-theme';
import { WasmTransport } from '../net/wasm-transport';
import type { Transport } from '../net/transport';
import { HudLayer } from '../ui/hud';
import type { HudActions, HudView, TerrainLookup } from '../ui/hud-api';
import { CameraRig } from './camera-rig';
import { startDemo } from './demo';
import { Input, bindKeys } from './input';
import { handleKey } from './keys';
import { updatePlacementQuery } from './placement';
import { buildingAt, tileAt, unitAt } from './picking';
import { Store } from './store';

/** Debug hook used by the screenshot harness and by support. */
declare global {
  interface Window {
    /** Exposed only with `?debug=1`. */
    __ocCamera?: () => Camera;
    /** Centre the camera on a wrapped tile (`?debug=1` only). */
    __ocFocus?: (tx: number, ty: number) => void;
    /** One-line terrain streaming summary (`?debug=1` only). */
    __ocTerrain?: () => string;
    /** Effective terrain material at a wrapped tile (`?debug=1` only). */
    __ocProbe?: (tx: number, ty: number) => number;
    /** Latest simulation snapshot for visual acceptance (`?debug=1` only). */
    __ocSnapshot?: () => Snapshot | null;
    /** Diagnostic dump of one streamed chunk (`?debug=1` only). */
    __ocChunk?: (cx: number, cy: number) => unknown;
  }
}

/** Top level controller. */
export class App {
  private readonly store = new Store();
  private readonly renderer: Renderer;
  private readonly transport: Transport;
  private readonly input: Input;
  private readonly rig = new CameraRig();
  private hud: HudLayer | null = null;
  private placing = -1;
  private frames = 0;
  private fpsTimer = 0;
  private lastFrame = 0;
  /** Wall clock of the last snapshot, used to interpolate between sim ticks. */
  private lastSnapshotAt = 0;
  /** True once the camera has been framed on the colony. */
  private framed = false;
  private raf = 0;
  /** True once a fatal transport error has torn the app down. */
  private fatalOccurred = false;
  private readonly debug: boolean;
  private readonly unbindKeys: () => void;
  /** Errors already reported, so a per-frame throw does not flood the console. */
  private readonly reportedErrors = new Set<string>();

  public constructor(canvas: HTMLCanvasElement) {
    injectTheme();
    const params = new URLSearchParams(location.search);
    this.debug = params.get('debug') === '1';
    this.renderer = new Renderer(canvas);
    this.transport = new WasmTransport();
    this.input = new Input(canvas, {
      onHover: (x, y) => this.hover(x, y),
      onPick: (x, y, additive) => this.pick(x, y, additive),
      onCancel: () => this.cancel(),
      onPan: (dx, dy) => this.rig.pan(dx, dy),
      onKey: (code) => this.key(code),
      onWheel: (direction, x, y) => this.rig.zoomStep(direction, x, y),
    });
    this.unbindKeys = bindKeys({
      onHover: () => undefined,
      onPick: () => undefined,
      onCancel: () => this.cancel(),
      onPan: () => undefined,
      onKey: (code) => this.key(code),
      onWheel: (direction) => this.rig.zoomStep(direction),
    });
    window.addEventListener('resize', () => this.resize());
  }

  /**
   * Boot the transport, frame the colony and start the render loop.
   *
   * The camera is anchored on the colony's start tile (not on a scroll offset)
   * and the planet wraps, so there is nothing to clamp: the view can pan off into
   * 10239 -> 0 forever.
   */
  public async start(): Promise<void> {
    this.resize();
    await this.transport.start({
      onBoot: (boot) => {
        const map = boot.map;
        this.store.boot = boot;
        this.renderer.setBoot(boot, this.chunkSource());
        // Frame the command hub, whose 3x3 footprint starts at the anchor tile.
        const hub = boot.catalog.buildings[0]?.footprint ?? 3;
        this.rig.setWorld(map.width, map.height, map.start_tx + hub / 2, map.start_ty + hub / 2);
        this.rig.resize(window.innerWidth, window.innerHeight);
        this.rig.frameColony();
        if (this.debug) {
          window.__ocCamera = () => this.rig.camera;
          window.__ocFocus = (tx, ty) => this.rig.focusTile(tx, ty);
          window.__ocTerrain = () => this.terrainLine();
          window.__ocProbe = (tx, ty) => this.renderer.tileMaterial(tx, ty);
          window.__ocSnapshot = () => this.store.current;
          window.__ocChunk = (cx, cy) => this.renderer.debugChunk(cx, cy);
        }
        // Bake the opening view behind the loading veil: the first frame the
        // player sees must not be a grid of placeholder blocks.
        this.renderer.warm(this.rig.camera);
        this.framed = true;
        this.hud = new HudLayer(this.actions(), this.debug, this.terrainLookup());
        document.getElementById('boot-veil')?.classList.add('gone');
        if (new URLSearchParams(location.search).get('demo') === '1') {
          startDemo({
            send: (commands) => this.send(commands),
            canPlace: (kind, tx, ty) => this.transport.queryPlace?.(kind, tx, ty).ok ?? false,
            snapshot: () => this.store.current,
            buildings: boot.catalog.buildings,
            anchor: { tx: map.start_tx, ty: map.start_ty },
          });
        }
      },
      onSnapshot: (snapshot) => {
        this.lastSnapshotAt = performance.now();
        this.store.pushSnapshot(snapshot);
        updatePlacementQuery(this.store, this.transport, this.placing);
        this.store.validateSelection();
        const stats = this.stats();
        this.store.stepMs = stats.stepMs;
        this.store.snapshotBytes = stats.snapshotBytes;
        this.store.banner = stats.banner;
        this.hud?.consumeEvents(this.hudView(snapshot));
      },
      onError: (message) => this.fatal(message),
    });
    // `onError` can fire synchronously while `start` is still awaited (e.g. a
    // corrupt boot blob); do not leave a render loop running after `fatal`.
    if (this.fatalOccurred) return;
    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame((t) => this.loop(t));
  }

  private stats(): { stepMs: number; snapshotBytes: number; banner: string } {
    if (this.transport instanceof WasmTransport) {
      const s = this.transport.stats();
      return { stepMs: s.stepMs, snapshotBytes: s.snapshotBytes, banner: s.banner };
    }
    return { stepMs: 0, snapshotBytes: 0, banner: '' };
  }

  /** Terrain source handed to the renderer: `oc_chunk` when the transport has it. */
  private chunkSource(): { chunk: (cx: number, cy: number) => ReturnType<WasmTransport['chunk']> } | null {
    if (typeof this.transport.chunk !== 'function') return null;
    return { chunk: (cx, cy) => this.transport.chunk?.(cx, cy) ?? null };
  }

  /** Read-only terrain probe the tactical scan samples. */
  private terrainLookup(): TerrainLookup {
    return {
      material: (tx, ty) => this.renderer.tileMaterial(tx, ty),
      ensure: (tx, ty) => this.renderer.prefetchTile(tx, ty),
    };
  }

  /** One-line stream summary for `?debug=1` and the screenshot harness. */
  private terrainLine(): string {
    const s = this.renderer.terrainStats();
    if (!s) return '--';
    const mb = (s.pixels * 4) / (1024 * 1024);
    return `V${s.visible} S${s.surfaces} P${s.pending} C${s.cold} R${s.records} F${s.fetches} ${mb.toFixed(0)}MB`;
  }

  // ---------------------------------------------------------------- actions

  private actions(): HudActions {
    return {
      selectBuilding: (kind) => this.beginPlacing(kind),
      demolishSelected: () => this.send([{ demolish: { id: this.store.selected } }]),
      launchSelected: () => this.send([{ launch: { id: this.store.selected } }]),
      toggleRoute: (route) => this.send([{ toggleRoute: { route } }]),
      research: (tech) => this.send([{ research: { tech } }]),
      setSandbox: (flags) => this.send([{ setSandbox: { flags } }]),
      setAiPhase: (phase) =>
        this.send([{ setAi: { phase, strength: this.store.current?.policy.ai_strength ?? 1 } }]),
      setAiStrength: (strength) =>
        this.send([{ setAi: { phase: this.store.current?.policy.ai_phase ?? 0, strength } }]),
      setSpeed: (speed) => this.send([{ setSpeed: { speed } }]),
      setPaused: (paused) => this.send([{ pause: { paused } }]),
      focusTile: (tx, ty) => this.rig.focusTile(tx, ty),
    };
  }

  private send(commands: Command[]): void {
    this.transport.send(commands);
  }

  private beginPlacing(kind: number): void {
    this.placing = this.placing === kind ? -1 : kind;
    if (this.placing >= 0) this.store.clearSelection();
    updatePlacementQuery(this.store, this.transport, this.placing);
  }

  private cancel(): void {
    if (this.placing >= 0) {
      this.placing = -1;
      return;
    }
    this.store.clearSelection();
  }

  // ------------------------------------------------------------------ input

  private key(code: string): void {
    handleKey(code, {
      pan: (dx, dy) => this.rig.pan(dx, dy),
      zoom: (direction) => this.rig.zoomStep(direction),
      resetCamera: () => this.rig.reset(),
      pause: () => this.send([{ pause: { paused: (this.store.current?.speed ?? 1) !== 0 } }]),
      speed: (index) => this.send([{ setSpeed: { speed: index } }]),
      cancel: () => this.cancel(),
      toggleSandbox: () => this.hud?.toggleSandbox(),
      nextRoute: () => {
        const routes = this.store.current?.orbital.routes ?? [];
        const index = routes.findIndex((route) => !route.active);
        this.send([{ toggleRoute: { route: index < 0 ? 0 : index } }]);
      },
    });
  }

  private hover(screenX: number, screenY: number): void {
    const tile = tileAt(this.rig.camera, screenX, screenY);
    const previous = this.store.hover;
    if (previous && previous.tx === tile.tx && previous.ty === tile.ty) return;
    this.store.hover = { tx: tile.tx, ty: tile.ty };
    updatePlacementQuery(this.store, this.transport, this.placing);
  }

  private pick(screenX: number, screenY: number, additive: boolean): void {
    const tile = tileAt(this.rig.camera, screenX, screenY);
    if (this.placing >= 0) {
      const q = this.transport.queryPlace?.(this.placing, tile.tx, tile.ty);
      if (q?.ok) {
        this.send([{ place: { kind: this.placing, tx: tile.tx, ty: tile.ty } }]);
        this.placing = -1;
      }
      return;
    }
    if (!additive) this.store.clearSelection();
    const snap = this.store.current;
    if (!snap) return;
    // Footprints and units are tested through the torus, so a click on the tile
    // just past the seam still hits a structure anchored on the other side.
    const catalogs = this.store.boot?.catalog.buildings ?? [];
    const building = buildingAt(snap.buildings, tile, (kind) => catalogs[kind]?.footprint ?? 1);
    if (building) {
      this.store.selected = building.id;
      this.store.selectedKind = 'building';
      return;
    }
    const unit = unitAt(snap.units, tile);
    if (unit) {
      this.store.selected = unit.id;
      this.store.selectedKind = 'unit';
    }
  }

  private resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.resize(width, height, window.devicePixelRatio || 1);
    this.rig.resize(width, height);
    if (!this.framed && this.store.boot) {
      this.rig.frameColony();
      this.framed = true;
    }
  }

  // ------------------------------------------------------------------- loop

  private loop(now: number): void {
    const dt = Math.min(120, now - this.lastFrame);
    this.lastFrame = now;
    this.frames += 1;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 500) {
      this.store.fps = (this.frames * 1000) / this.fpsTimer;
      this.frames = 0;
      this.fpsTimer = 0;
    }
    this.store.tickPings(dt);
    this.hud?.tick(dt);

    const snapshot = this.store.current;
    const boot = this.store.boot;
    if (snapshot && boot) {
      this.store.validateSelection();
      try {
        this.renderer.draw(this.frame(snapshot, boot, now));
        this.hud?.update(this.hudView(snapshot));
      } catch (error) {
        // A presentation bug must never stop the world from rendering; report
        // each unique failure once so it still shows up in the console harness.
        const message = error instanceof Error ? error.message : String(error);
        if (!this.reportedErrors.has(message)) {
          this.reportedErrors.add(message);
          console.error(`[frame] ${message}`);
        }
      }
    }
    this.raf = requestAnimationFrame((t) => this.loop(t));
  }

  private frame(
    snapshot: Snapshot,
    boot: NonNullable<Store['boot']>,
    now: number,
  ): Frame {
    const interaction: Interaction = {
      selected: this.store.selected,
      hover: this.store.hover,
      placing: this.placing,
      placementOk: this.store.placementOk,
      pings: this.store.pings,
    };
    // The simulation steps at 30 Hz; blend from the previous snapshot towards
    // the current one so motion stays smooth at 60 fps. Clamped so a stalled
    // transport never extrapolates past the truth.
    const sinceSnapshot = this.lastSnapshotAt > 0 ? now - this.lastSnapshotAt : TICK_MS;
    const alpha = Math.max(0, Math.min(1, sinceSnapshot / TICK_MS));
    return {
      boot,
      previous: this.store.previous ?? snapshot,
      snapshot,
      alpha,
      camera: this.rig.camera,
      interaction,
      time: now,
      debug: this.debug,
    };
  }

  private hudView(snapshot: Snapshot): HudView {
    const boot = this.store.boot;
    if (!boot) throw new Error('hud view before boot');
    const anchor = this.rig.anchor;
    const hover = this.store.hover;
    return {
      snapshot,
      boot,
      selection: { id: this.store.selected, kind: this.store.selectedKind },
      placing: this.placing,
      placementReason: this.store.placementReason,
      debug: this.debug
        ? {
            fps: this.store.fps,
            stepMs: this.store.stepMs,
            snapshotBytes: this.store.snapshotBytes,
            banner: `${this.store.banner}  ZOOM ${this.rig.zoomPercent}%`,
            anchor: `${anchor.tx},${anchor.ty}`,
            hover: hover ? `${hover.tx},${hover.ty}` : '--',
            terrain: this.terrainLine(),
          }
        : null,
    };
  }

  private fatal(message: string): void {
    this.fatalOccurred = true;
    const veil = document.getElementById('boot-veil');
    if (veil) {
      veil.classList.remove('gone');
      veil.innerHTML = `<div class="boot-line">接入失败</div><div class="boot-sub">${message}</div>`;
    }
    cancelAnimationFrame(this.raf);
    this.input.dispose();
    this.unbindKeys();
  }
}

/** Simulation tick length in milliseconds (30 Hz), mirroring `crates/sim`. */
const TICK_MS = 1000 / 30;
