/**
 * Application shell.
 *
 * Owns the single direction of data flow:
 *   input → Command[] → transport.send → sim.step() → Snapshot → renderer + HUD
 *
 * No game rule lives here: the app only converts gestures into commands and
 * turns snapshots into a `Frame` / `HudView`.
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
import { startDemo } from './demo';
import { Input, bindKeys } from './input';
import { Store } from './store';

/** Debounce for pointer hover queries against the simulation. */
const TILE_OFFSET = 0.5;

/** Top level controller. */
export class App {
  private readonly store = new Store();
  private readonly renderer: Renderer;
  private readonly transport: Transport;
  private readonly input: Input;
  private hud: HudLayer | null = null;
  private camera: Camera = { x: 0, y: 0, width: 1, height: 1 };
  private placing = -1;
  private frames = 0;
  private fpsTimer = 0;
  private lastFrame = 0;
  /** Wall clock of the last snapshot, used to interpolate between sim ticks. */
  private lastSnapshotAt = 0;
  private raf = 0;
  private readonly debug: boolean;
  private readonly unbindKeys: () => void;
  /** Errors already reported, so a per-frame throw does not flood the console. */
  private readonly reportedErrors = new Set<string>();

  public constructor(canvas: HTMLCanvasElement) {
    injectTheme();
    this.debug = new URLSearchParams(location.search).get('debug') === '1';
    this.renderer = new Renderer(canvas);
    this.transport = new WasmTransport();
    this.input = new Input(canvas, {
      onHover: (x, y) => this.hover(x, y),
      onPick: (x, y, additive) => this.pick(x, y, additive),
      onCancel: () => this.cancel(),
      onPan: (dx, dy) => this.pan(dx, dy),
      onKey: (code, shift) => this.key(code, shift),
      onWheel: () => undefined,
    });
    this.unbindKeys = bindKeys({
      onHover: () => undefined,
      onPick: () => undefined,
      onCancel: () => this.cancel(),
      onPan: () => undefined,
      onKey: (code, shift) => this.key(code, shift),
      onWheel: () => undefined,
    });
    window.addEventListener('resize', () => this.resize());
  }

  /** Boot the transport and the render loop. */
  public async start(): Promise<void> {
    this.resize();
    await this.transport.start({
      onBoot: (boot) => {
        this.store.boot = boot;
        this.renderer.setBoot(boot);
        this.camera = Renderer.initialCamera(boot, this.camera.width, this.camera.height);
        this.hud = new HudLayer(this.actions(), this.debug);
        document.getElementById('boot-veil')?.classList.add('gone');
        if (new URLSearchParams(location.search).get('demo') === '1') {
          startDemo({
            send: (commands) => this.send(commands),
            canPlace: (kind, tx, ty) => this.transport.queryPlace?.(kind, tx, ty).ok ?? false,
            snapshot: () => this.store.current,
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
        this.send([
          { setAi: { phase, strength: this.store.current?.policy.ai_strength ?? 1 } },
        ]),
      setAiStrength: (strength) =>
        this.send([{ setAi: { phase: this.store.current?.policy.ai_phase ?? 0, strength } }]),
      setSpeed: (speed) => this.send([{ setSpeed: { speed } }]),
      setPaused: (paused) => this.send([{ pause: { paused } }]),
      focusTile: (tx, ty) => this.focus(tx, ty),
    };
  }

  private send(commands: Command[]): void {
    this.transport.send(commands);
  }

  private beginPlacing(kind: number): void {
    if (this.placing === kind) {
      this.placing = -1;
      return;
    }
    this.placing = kind;
    this.store.clearSelection();
  }

  private cancel(): void {
    if (this.placing >= 0) {
      this.placing = -1;
      return;
    }
    this.store.clearSelection();
  }

  // ------------------------------------------------------------------ input

  private hover(screenX: number, screenY: number): void {
    const tile = toWorldTile(this.camera, screenX, screenY);
    const tx = Math.floor(tile.x);
    const ty = Math.floor(tile.y);
    const previous = this.store.hover;
    if (previous && previous.tx === tx && previous.ty === ty) return;
    this.store.hover = { tx, ty };
    if (this.placing >= 0 && this.transport.queryPlace) {
      const kind = this.placing;
      const q = this.transport.queryPlace(kind, tx, ty);
      this.store.placementOk = q.ok;
    }
  }

  private pick(screenX: number, screenY: number, additive: boolean): void {
    const tile = toWorldTile(this.camera, screenX, screenY);
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
      (u) => Math.abs(u.x / 1024 - (tx + TILE_OFFSET)) < 0.9 && Math.abs(u.y / 1024 - (ty + TILE_OFFSET)) < 0.9,
    );
    if (unit) {
      this.store.selected = unit.id;
      this.store.selectedKind = 'unit';
    }
  }

  private key(code: string, shift: boolean): void {
    void shift;
    switch (code) {
      case 'Space':
        this.send([{ pause: { paused: (this.store.current?.speed ?? 1) !== 0 } }]);
        break;
      case 'Digit1':
        this.send([{ setSpeed: { speed: 1 } }]);
        break;
      case 'Digit2':
        this.send([{ setSpeed: { speed: 2 } }]);
        break;
      case 'Digit3':
        this.send([{ setSpeed: { speed: 3 } }]);
        break;
      case 'Escape':
        this.cancel();
        break;
      case 'F3':
        this.hud?.toggleSandbox();
        break;
      case 'KeyT':
        this.transport.send([{ toggleRoute: { route: (this.store.current?.orbital.routes.findIndex((r) => !r.active) ?? 0) % 3 } }]);
        break;
      case 'ArrowLeft':
      case 'KeyA':
        this.pan(40, 0);
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.pan(-40, 0);
        break;
      case 'ArrowUp':
      case 'KeyW':
        this.pan(0, 30);
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.pan(0, -30);
        break;
      default:
        break;
    }
  }

  private pan(dx: number, dy: number): void {
    this.camera = {
      ...this.camera,
      x: this.camera.x + dx,
      y: this.camera.y + dy,
    };
    this.clampCamera();
  }

  private clampCamera(): void {
    const boot = this.store.boot;
    if (!boot) return;
    const worldWidth = (boot.map.w + boot.map.h) * 32;
    const worldHeight = (boot.map.w + boot.map.h) * 16;
    const marginX = 220;
    const marginY = 160;
    this.camera.x = Math.min(marginX, Math.max(this.camera.width - worldWidth - marginX, this.camera.x));
    this.camera.y = Math.min(marginY, Math.max(this.camera.height - worldHeight - marginY, this.camera.y));
  }

  private focus(tx: number, ty: number): void {
    // Screen position of the tile centre before the camera translate.
    const sx = (tx - ty) * 32;
    const sy = (tx + ty) * 16;
    this.camera = {
      ...this.camera,
      x: this.camera.width / 2 - sx,
      y: this.camera.height / 2 - sy,
    };
    this.clampCamera();
  }

  private resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera = { ...this.camera, width, height };
    this.renderer.resize(width, height, window.devicePixelRatio || 1);
    if (this.store.boot && this.camera.x === 0 && this.camera.y === 0) {
      this.camera = Renderer.initialCamera(this.store.boot, width, height);
    }
    this.clampCamera();
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
      camera: this.camera,
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
            banner: this.store.banner,
          }
        : null,
    };
  }

  private fatal(message: string): void {
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

/** Simulation tick length in milliseconds (30 Hz), mirroring crates/sim. */
const TICK_MS = 1000 / 30;

