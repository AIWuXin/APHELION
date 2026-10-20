/**
 * Pointer and keyboard input.
 *
 * Input produces **intent events only**; it never mutates the world. The app
 * turns intents into `Command` objects, which the transport ships to the
 * simulation. That keeps the "player input is a command" invariant honest.
 */

/** Callbacks the app supplies. */
export interface InputEvents {
  /** Pointer moved over the world. */
  readonly onHover: (screenX: number, screenY: number) => void;
  /** Left click resolved to a world tile. */
  readonly onPick: (screenX: number, screenY: number, additive: boolean) => void;
  /** Right click / escape. */
  readonly onCancel: () => void;
  /** Camera pan in screen pixels. */
  readonly onPan: (dx: number, dy: number) => void;
  /** Key press, already normalised to `KeyboardEvent.code`. */
  readonly onKey: (code: string, shift: boolean) => void;
  /** Wheel zoom request (`+1` in, `-1` out). */
  readonly onWheel: (direction: number, x: number, y: number) => void;
}

/** Pointer state machine: click vs drag. */
export class Input {
  private down = false;
  private dragged = false;
  private lastX = 0;
  private lastY = 0;
  private downX = 0;
  private downY = 0;
  private readonly disposers: (() => void)[] = [];

  public constructor(
    private readonly target: HTMLCanvasElement,
    private readonly events: InputEvents,
  ) {
    this.bind();
  }

  public dispose(): void {
    for (const fn of this.disposers) fn();
    this.disposers.length = 0;
  }

  private bind(): void {
    const on = <K extends keyof HTMLElementEventMap>(
      name: K,
      fn: (ev: HTMLElementEventMap[K]) => void,
      opts?: AddEventListenerOptions,
    ): void => {
      const handler = (ev: Event): void => fn(ev as HTMLElementEventMap[K]);
      this.target.addEventListener(name, handler, opts);
      this.disposers.push(() => this.target.removeEventListener(name, handler, opts));
    };

    on('pointerdown', (ev) => {
      if (ev.button === 2) {
        this.events.onCancel();
        return;
      }
      if (ev.button !== 0) return;
      this.down = true;
      this.dragged = false;
      this.lastX = ev.clientX;
      this.lastY = ev.clientY;
      this.downX = ev.clientX;
      this.downY = ev.clientY;
      this.target.setPointerCapture(ev.pointerId);
    });

    on('pointermove', (ev) => {
      if (this.down) {
        const dx = ev.clientX - this.lastX;
        const dy = ev.clientY - this.lastY;
        if (!this.dragged && Math.abs(ev.clientX - this.downX) + Math.abs(ev.clientY - this.downY) > 5) {
          this.dragged = true;
        }
        if (this.dragged) this.events.onPan(dx, dy);
        this.lastX = ev.clientX;
        this.lastY = ev.clientY;
      }
      const rect = this.target.getBoundingClientRect();
      this.events.onHover(ev.clientX - rect.left, ev.clientY - rect.top);
    });

    on('pointerup', (ev) => {
      if (ev.button === 2) return;
      const rect = this.target.getBoundingClientRect();
      if (!this.dragged) {
        this.events.onPick(ev.clientX - rect.left, ev.clientY - rect.top, ev.shiftKey);
      }
      this.down = false;
      this.dragged = false;
      if (this.target.hasPointerCapture(ev.pointerId)) {
        this.target.releasePointerCapture(ev.pointerId);
      }
    });

    on('pointerleave', () => {
      this.down = false;
      this.dragged = false;
    });

    on('contextmenu', (ev) => ev.preventDefault());

    on('wheel', (ev) => {
      ev.preventDefault();
      const rect = this.target.getBoundingClientRect();
      this.events.onWheel(ev.deltaY > 0 ? -1 : 1, ev.clientX - rect.left, ev.clientY - rect.top);
    }, { passive: false });
  }
}

/** Global keyboard listener; separate because it is not canvas scoped. */
export function bindKeys(events: InputEvents): () => void {
  const handler = (ev: KeyboardEvent): void => {
    // Never steal keys from a focused text field.
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
    const codes = [
      'Space',
      'Escape',
      'KeyX',
      'Digit0',
      'Digit1',
      'Digit2',
      'Digit3',
      'Digit4',
      'Equal',
      'Minus',
      'NumpadAdd',
      'NumpadSubtract',
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'KeyR',
      'F3',
      'KeyT',
      'KeyO',
      'KeyP',
    ];
    if (codes.includes(ev.code)) ev.preventDefault();
    events.onKey(ev.code, ev.shiftKey);
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}
