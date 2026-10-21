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
import { toWorldTile, type Camera } from '../render/iso';
import { injectTheme } from '../style/inject-theme';
import { WasmTransport } from '../net/wasm-transport';
import type { Transport } from '../net/transport';
import { HudLayer } from '../ui/hud';
import type { HudActions, HudView } from '../ui/hud-api';
import { CameraRig } from './camera-rig';
import { startDemo } from './demo';
import { Input, bindKeys } from './input';
import { handleKey } from './keys';
import { Store } from './store';

/** Offset from a tile's corner to its centre, in tiles. */
const TILE_OFFSET = 0.5;

/** Debug hook used by the screenshot harness and by support. */
declare global {
  interface Window {
    /** Exposed only with `?debug=1`. */
    __ocCamera?: () => Camera;
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

  /** Boot the transport and the render loop. */
  public async start(): Promise<void> {
    this.resize();
    if (this.debug) window.__ocCamera = () => this.rig.camera;
    await this.transport.start({
      onBoot: (boot) => {
        this.store.boot = boot;
        this.renderer.setBoot(boot);
        this.rig.setWorld(boot.map.w, boot.map.h);
        this.rig.resize(window.innerWidth, window.innerHeight);
        this.rig.frameColony();
        this.framed = true;
        this.hud = new HudLayer(this.actions(), this.debug);
        document.getElementById('boot-veil')?.classList.add('gone');
        if (new URLSearchParams(location.search).get('demo') === '1') {
          startDemo({
            send: (commands) => this.send(commands),
            canPlace: (kind, tx, ty) => this.transport.queryPlace?.(kind, tx, ty).ok ?? false,
            snapshot: () => this.store.current,
            buildings: boot.catalog.buildings,
          });
        }
      },
      onSnapshot: (snapshot) => {
        this.lastSnapshotAt = performance.now();
        this.store.pushSnapshot(snapshot);
        this.store.validateSelection();
        const stats = this.stats();
        this.store.stepMs = stats.stepMs;
        this.store.snapshotBytes = stats.snapshotBytes;
        this.store.banner = stats.banner;
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
    const tile = toWorldTile(this.rig.camera, screenX, screenY);
    const tx = Math.floor(tile.x);
    const ty = Math.floor(tile.y);
    const previous = this.store.hover;
    if (previous && previous.tx === tx && previous.ty === ty) return;
    this.store.hover = { tx, ty };
    if (this.placing >= 0) {
      const q = this.transport.queryPlace?.(this.placing, tx, ty);
      this.store.placementOk = q?.ok ?? false;
    }
  }

  private pick(screenX: number, screenY: number, additive: boolean): void {
    const tile = toWorldTile(this.rig.camera, screenX, screenY);
    const tx = Math.floor(tile.x);
    const ty = Math.floor(tile.y);
    if (this.placing >= 0) {
      const q = this.transport.queryPlace?.(this.placing, tx, ty);
      if (q?.ok) {
        this.send([{ place: { kind: this.placing, tx, ty } }]);
        this.placing = -1;
      }
      return;
    }
    if (!additive) this.store.clearSelection();
    const snap = this.store.current;
    if (!snap) return;
    const building = snap.buildings.find((b) => {
      const size = this.store.boot?.catalog.buildings[b.kind]?.footprint ?? 1;
      return tx >= b.tx && tx < b.tx + size && ty >= b.ty && ty < b.ty + size;
    });
    if (building) {
      this.store.selected = building.id;
      this.store.selectedKind = 'building';
      return;
    }
    const unit = snap.units.find(
      (u) =>
        Math.abs(u.x / 1024 - (tx + TILE_OFFSET)) < 0.9 &&
        Math.abs(u.y / 1024 - (ty + TILE_OFFSET)) < 0.9,
    );
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
    return {
      snapshot,
      boot,
      selection: { id: this.store.selected, kind: this.store.selectedKind },
      placing: this.placing,
      debug: this.debug
        ? {
            fps: this.store.fps,
            stepMs: this.store.stepMs,
            snapshotBytes: this.store.snapshotBytes,
            banner: `${this.store.banner}  ZOOM ${this.rig.zoomPercent}%`,
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
