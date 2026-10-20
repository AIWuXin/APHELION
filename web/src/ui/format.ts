/**
 * Presentation-side number and time formatting.
 *
 * Pure functions only: the HUD never stores a formatted simulation value
 * between frames, it re-derives it from the latest snapshot each update.
 */

import { pad } from './dom';

/** Full stardate clock for the top bar: `HH:MM:SS`. */
export function clockText(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(s / 3600), 2)}:${pad(Math.floor(s / 60) % 60, 2)}:${pad(s % 60, 2)}`;
}

/** Short `MM:SS` used by countdowns and log timestamp prefixes. */
export function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(s / 60), 2)}:${pad(s % 60, 2)}`;
}

/** Integer percent from a 0..1000 permille field. */
export function permillePct(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value / 10)));
}

/** Round a per-minute rate to a whole number. */
export function perMinute(amount: number, periodMs: number): number {
  if (periodMs <= 0) return 0;
  return Math.round((amount * 60_000) / periodMs);
}

/** Decimal seconds from a millisecond duration, e.g. `8.0s`. */
export function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}
