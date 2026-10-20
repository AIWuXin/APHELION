/**
 * The DOM HUD.
 *
 * A thin composition root: twelve panel modules own their own markup and
 * in-place updates, this file only mounts them, routes the snapshot view once
 * per frame, and feeds the presentation-side event pipeline (log → subtitle →
 * alert strip).
 *
 * Material contract (see `hud.css`): matte near-black steel plates, 1px cold
 * steel borders with a brighter top edge, right angles only, no blur / glow /
 * gradient washes. Three type tiers, numeric readouts in tabular monospace.
 */

import { h } from './dom';
import type { Hud, HudActions, HudView } from './hud-api';
import { AlertStrip } from './panels/alert';
import { DebugOverlay } from './panels/debug-overlay';
import { DirectivesPanel } from './panels/directives';
import { EventLogPanel } from './panels/event-log';
import { FabricatorPanel } from './panels/fabricator';
import { LanesPanel } from './panels/lanes';
import { ReadoutPanel } from './panels/readout';
import { SandboxPanel } from './panels/sandbox';
import { ScanPanel } from './panels/scan';
import { SubtitlePanel } from './panels/subtitle';
import { TechPanel } from './panels/tech';
import { TopBar } from './panels/top-bar';
import './hud.css';
import './topbar.css';
import './overlays.css';
import './panels.css';
import './intel.css';

/** Everything mounted once the first view arrives. */
interface Parts {
  readonly topbar: TopBar;
  readonly scan: ScanPanel;
  readonly directives: DirectivesPanel;
  readonly lanes: LanesPanel;
  readonly fabricator: FabricatorPanel;
  readonly readout: ReadoutPanel;
  readonly tech: TechPanel;
  readonly log: EventLogPanel;
  readonly sandbox: SandboxPanel;
  readonly subtitle: SubtitlePanel;
  readonly alert: AlertStrip;
  readonly debug: DebugOverlay;
}

/** Mounted HUD instance. */
export class HudLayer implements Hud {
  private parts: Parts | null = null;
  private root: HTMLElement | null = null;
  private dtMs = 16;
  private readonly onResize = (): void => {
    this.parts?.scan.resize();
  };

  public constructor(
    private readonly actions: HudActions,
    private readonly debugEnabled: boolean,
  ) {}

  public update(view: HudView): void {
    const parts = this.parts ?? this.mount(view);

    parts.topbar.update(view);
    parts.scan.update(view, this.dtMs);
    parts.directives.update(view);
    parts.lanes.update(view);
    parts.fabricator.update(view);
    parts.readout.update(view);
    parts.tech.update(view);
    parts.sandbox.update(view);
    parts.debug.update(view);

    // Only ticks that carry a new event batch move the log / subtitle / alert.
    for (const entry of parts.log.consume(view)) {
      if (entry.speaker.length > 0) parts.subtitle.say(entry.speaker, entry.text);
      if (entry.tone === 2) parts.alert.show(entry.text, 2, entry.tx, entry.ty);
    }
  }

  public tick(dtMs: number): void {
    this.dtMs = dtMs;
    this.parts?.subtitle.tick(dtMs);
    this.parts?.alert.tick(dtMs);
  }

  public alert(text: string, tone: number): void {
    this.parts?.alert.show(text, tone);
  }

  /** F3: show or hide the sandbox panel. */
  public toggleSandbox(): void {
    this.parts?.sandbox.toggle();
  }

  public destroy(): void {
    window.removeEventListener('resize', this.onResize);
    this.root?.remove();
    this.root = null;
    this.parts = null;
  }

  // ------------------------------------------------------------------- mount

  private mount(view: HudView): Parts {
    const topbar = new TopBar(this.actions);
    const scan = new ScanPanel(view.boot);
    const directives = new DirectivesPanel(view.boot);
    const lanes = new LanesPanel(this.actions, view.boot);
    const fabricator = new FabricatorPanel(this.actions, view.boot);
    const readout = new ReadoutPanel(this.actions);
    const tech = new TechPanel(this.actions, view.boot);
    const log = new EventLogPanel(this.actions, view.boot);
    const sandbox = new SandboxPanel(this.actions);
    const subtitle = new SubtitlePanel(view.boot);
    const alert = new AlertStrip(this.actions);
    const debug = new DebugOverlay();

    const rail = h('div', { class: 'oc-rail' }, [
      scan.element,
      directives.element,
      lanes.element,
      fabricator.element,
      readout.element,
      tech.element,
      log.element,
    ]);
    const root = h('div', { class: `oc-hud${this.debugEnabled ? ' is-debug' : ''}` }, [
      topbar.element,
      alert.element,
      rail,
      sandbox.element,
      subtitle.element,
      debug.element,
    ]);
    const host = document.getElementById('hud') ?? document.body;
    host.append(root);
    this.root = root;
    window.addEventListener('resize', this.onResize);

    const parts: Parts = {
      topbar,
      scan,
      directives,
      lanes,
      fabricator,
      readout,
      tech,
      log,
      sandbox,
      subtitle,
      alert,
      debug,
    };
    this.parts = parts;
    // The radar canvas can only measure itself once it is in the document.
    scan.resize();
    subtitle.say('EVA', '准备工作，指挥官。');
    return parts;
  }
}
