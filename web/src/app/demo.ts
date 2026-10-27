/**
 * Attract mode / demo script.
 *
 * `?demo=1` runs a fixed opening so the title screen and the screenshot harness
 * always show a colony that is actually operating: power, ore, coal, a turret
 * line and whatever orbital kit the era has unlocked. Everything here goes
 * through the normal `Command` path -- the demo has no privileged access to the
 * simulation.
 *
 * Steps are era-gated: the kernel refuses a tier above `snapshot.era`, so a
 * step whose def is still locked is skipped outright instead of firing a
 * command that can only be dropped.
 */

import { eraAllows } from '../content/era';
import type { BuildingDef } from '../generated/BuildingDef';
import type { Command } from '../generated/Command';
import type { Snapshot } from '../generated/Snapshot';

/** The slice of the app the demo is allowed to use. */
export interface DemoApi {
  /** Send commands through the transport. */
  readonly send: (commands: Command[]) => void;
  /** Ask the simulation whether a placement is legal right now. */
  readonly canPlace: (kind: number, tx: number, ty: number) => boolean;
  /** Latest snapshot, or null before boot. */
  readonly snapshot: () => Snapshot | null;
  /** Static building table, so a step can honour its era tier. */
  readonly buildings: readonly BuildingDef[];
  /** Colony anchor tile from the boot blob; the build spiral walks out from it. */
  readonly anchor: { readonly tx: number; readonly ty: number };
  /** Regional oilfield anchor from the same boot blob. */
  readonly oilAnchor: { readonly tx: number; readonly ty: number };
}

/** Building table indices used by the script (mirrors `oc-content`). */
const K = {
  solar: 1,
  refinery: 2,
  fuel: 3,
  lab: 4,
  pad: 5,
  dock: 6,
  relay: 7,
  turret: 8,
  flak: 9,
  bulwark: 10,
  hangar: 11,
  radar: 12,
  repair: 13,
  coalMine: 14,
  coalPlant: 15,
  oilWell: 16,
} as const;

/** Find the first legal anchor around a colony or a resource anchor. */
function findSpot(
  api: DemoApi,
  kind: number,
  fromRing = 3,
  centre = api.anchor,
): { tx: number; ty: number } | null {
  const snap = api.snapshot();
  if (!snap) return null;
  // Spiral out from the authoritative anchor, not from a hard-coded home tile.
  const cx = centre.tx;
  const cy = centre.ty;
  for (let ring = fromRing; ring < 14; ring += 1) {
    for (let dy = -ring; dy <= ring; dy += 1) {
      for (let dx = -ring; dx <= ring; dx += 1) {
        // Walk the perimeter of the ring so the colony grows outwards.
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const tx = cx + dx;
        const ty = cy + dy;
        if (api.canPlace(kind, tx, ty)) return { tx, ty };
      }
    }
  }
  return null;
}

/** Ordered construction requests; later eras wait instead of being skipped. */
const ORDER: readonly (readonly [number, number])[] = [
  [K.solar, 2],
  [K.turret, 2],
  [K.refinery, 1],
  [K.coalMine, 1],
  [K.coalPlant, 1],
  [K.oilWell, 1],
  [K.fuel, 1],
  [K.flak, 1],
  [K.lab, 1],
  [K.radar, 1],
  [K.bulwark, 2],
  [K.pad, 1],
  [K.dock, 1],
  [K.hangar, 1],
  [K.relay, 1],
  [K.repair, 1],
];

interface BuildStep {
  readonly kind: number;
  remaining: number;
  sites: { tx: number; ty: number }[];
}

/** Start a milestone-driven demo; returns a cancel function. */
export function startDemo(api: DemoApi): () => void {
  const steps: BuildStep[] = ORDER.map(([kind, count]) => ({ kind, remaining: count, sites: [] }));
  let started = false;
  let launches = 0;
  let routesOpened = false;
  let nextTech = 0;

  const attempt = (): void => {
    if (!started) {
      started = true;
      const rush = new URLSearchParams(location.search).get('rush') === '1';
      api.send([{ setSandbox: { flags: 3 } }, { setSpeed: { speed: rush ? 3 : 2 } }]);
      return;
    }
    const snap = api.snapshot();
    if (!snap) return;
    for (const step of steps) {
      step.sites = step.sites.filter((site) => {
        const present = snap.buildings.some((b) => b.kind === step.kind && b.tx === site.tx && b.ty === site.ty);
        if (!present) step.remaining += 1;
        return present;
      });
    }
    if (nextTech < 4 && snap.buildings.some((b) => b.kind === K.lab && b.state !== 0)) {
      api.send([{ research: { tech: nextTech } }]);
      nextTech += 1;
      return;
    }
    const next = steps.find((step) => step.remaining > 0 && eraAllows(api.buildings[step.kind], snap.era));
    if (next) {
      const oil = next.kind === K.oilWell;
      const spot = findSpot(api, next.kind, oil ? 0 : 3, oil ? api.oilAnchor : api.anchor);
      if (spot) {
        next.remaining -= 1;
        next.sites.push(spot);
        api.send([{ place: { kind: next.kind, tx: spot.tx, ty: spot.ty } }]);
      }
      return;
    }

    if (launches < 2) {
      const pad = snap.buildings.find((b) => b.kind === K.pad && b.state === 1 && b.aux === 0 && b.progress >= 1000);
      if (pad) {
        launches += 1;
        api.send([{ launch: { id: pad.id } }]);
      }
      return;
    }
    if (!routesOpened && snap.orbital.capacity >= 4) {
      api.send([{ toggleRoute: { route: 0 } }, { toggleRoute: { route: 1 } }]);
      routesOpened = true;
    }
  };

  const kickoff = window.setTimeout(attempt, 400);
  const timer = window.setInterval(attempt, 600);
  return () => {
    window.clearTimeout(kickoff);
    window.clearInterval(timer);
  };
}
