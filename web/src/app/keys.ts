/**
 * Keyboard intents.
 *
 * Kept out of `app.ts` so the shell stays under the per-file budget and so the
 * key map has exactly one home. This module produces intents only: it may pan or
 * zoom the *camera*, but it never touches game state -- anything that changes the
 * simulation goes through `Command`s in the app layer.
 */

/** What a key press is allowed to do. */
export interface KeyContext {
  /** Pan the camera by a CSS-pixel delta. */
  readonly pan: (dx: number, dy: number) => void;
  /** One zoom notch in (`+1`) or out (`-1`). */
  readonly zoom: (direction: number) => void;
  /** Back to the colonial overview. */
  readonly resetCamera: () => void;
  /** Toggle pause. */
  readonly pause: () => void;
  /** Set simulation speed index (1..3). */
  readonly speed: (index: number) => void;
  /** Leave placement mode / clear selection. */
  readonly cancel: () => void;
  /** Show or hide the sandbox panel. */
  readonly toggleSandbox: () => void;
  /** Open or close the next closed trade lane. */
  readonly nextRoute: () => void;
}

/** Pan step in CSS pixels for one key press. */
const PAN_STEP = 48;
/** Vertical pan step (isometric: vertical moves feel shorter). */
const PAN_STEP_Y = 32;

/**
 * Handle one `KeyboardEvent.code`.
 *
 * Returns `true` when the key was consumed (the caller may then stop this key
 * from doing anything else).
 */
export function handleKey(code: string, ctx: KeyContext): boolean {
  switch (code) {
    case 'ArrowLeft':
    case 'KeyA':
      ctx.pan(PAN_STEP, 0);
      return true;
    case 'ArrowRight':
    case 'KeyD':
      ctx.pan(-PAN_STEP, 0);
      return true;
    case 'ArrowUp':
    case 'KeyW':
      ctx.pan(0, PAN_STEP_Y);
      return true;
    case 'ArrowDown':
    case 'KeyS':
      ctx.pan(0, -PAN_STEP_Y);
      return true;
    case 'Equal':
    case 'NumpadAdd':
      ctx.zoom(1);
      return true;
    case 'Minus':
    case 'NumpadSubtract':
      ctx.zoom(-1);
      return true;
    case 'Digit0':
      ctx.resetCamera();
      return true;
    case 'Space':
      ctx.pause();
      return true;
    case 'Digit1':
      ctx.speed(1);
      return true;
    case 'Digit2':
      ctx.speed(2);
      return true;
    case 'Digit3':
      ctx.speed(3);
      return true;
    case 'Escape':
      ctx.cancel();
      return true;
    case 'F3':
      ctx.toggleSandbox();
      return true;
    case 'KeyT':
      ctx.nextRoute();
      return true;
    default:
      return false;
  }
}
