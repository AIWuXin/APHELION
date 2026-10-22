/**
 * Entry point: mount the app on the single canvas.
 */

import './style/base.css';
import { App } from './app/app';

const canvas = document.getElementById('world');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('missing #world canvas');
}

// Tab identity for the browser build: `APHELION 0.1.0a1 · 1022-1120`.
document.title = `APHELION ${__OC_BUILD_STAMP__}`;

const app = new App(canvas);
void app.start();
