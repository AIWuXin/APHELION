/**
 * Entry point: mount the app on the single canvas.
 */

import './style/base.css';
import { App } from './app/app';

const canvas = document.getElementById('world');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('missing #world canvas');
}

const app = new App(canvas);
void app.start();
