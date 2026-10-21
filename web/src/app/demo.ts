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
} as const;

/** Find the first legal anchor near the colony for a building kind. */
function findSpot(api: DemoApi, kind: number, fromRing = 3): { tx: number; ty: number } | null {
  const snap = api.snapshot();
  if (!snap) return null;
  const cx = 20;
  const cy = 20;
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

/** A queued construction step with a delay in ms from the previous step. */
interface Step {
  readonly after: number;
  readonly run: (api: DemoApi) => void;
}

/** The full build order; steps above the current era are skipped at run time. */
const ORDER: readonly (readonly [number, number])[] = [
  [K.solar, 0],
  [K.solar, 220],
  [K.turret, 380],
  [K.refinery, 520],
  [K.coalMine, 300],
  [K.coalPlant, 300],
  [K.fuel, 760],
  [K.dock, 980],
  [K.pad, 1100],
  [K.lab, 1320],
  [K.flak, 1500],
  [K.turret, 1640],
  [K.hangar, 1800],
  [K.radar, 2000],
  [K.relay, 2160],
  [K.repair, 2300],
];

/** Build the demo script. */
export function demoScript(): Step[] {
  const steps: Step[] = [
    {
      after: 400,
      run: (api) => {
        api.send([{ setSandbox: { flags: 3 } }, { setSpeed: { speed: 2 } }]);
      },
    },
  ];
  for (const [kind, after] of ORDER) {
    steps.push({
      after,
      run: (api) => {
        const snap = api.snapshot();
        // Skipping silently is the point: a refused tier must not spam the log.
        if (!snap || !eraAllows(api.buildings[kind], snap.era)) return;
        const spot = findSpot(api, kind);
        if (spot) api.send([{ place: { kind, tx: spot.tx, ty: spot.ty } }]);
      },
    });
  }
  // Launch twice once the pads exist, then open two lanes and let them run.
  steps.push({
    after: 2600,
    run: (api) => {
      const snap = api.snapshot();
      const pads = snap?.buildings.filter((b) => b.kind === K.pad) ?? [];
      if (pads.length === 0) return;
      api.send(pads.map((p) => ({ launch: { id: p.id } })));
    },
  });
  steps.push({
    after: 8200,
    run: (api) => {
      api.send([{ toggleRoute: { route: 0 } }, { toggleRoute: { route: 1 } }]);
      api.send([{ research: { tech: 0 } }]);
    },
  });
  steps.push({
    after: 6000,
    run: (api) => {
      // ?rush=1 keeps the demo at 4x so the screenshot harness can reach the
      // first hostile wave (~135 s of sim time) in under a minute of wall clock.
      const rush = new URLSearchParams(location.search).get('rush') === '1';
      api.send([{ setSpeed: { speed: rush ? 3 : 1 } }]);
    },
  });
  return steps;
}

/** Start the demo; returns a cancel function. */
export function startDemo(api: DemoApi): () => void {
  const timers: number[] = [];
  let clock = 0;
  for (const step of demoScript()) {
    clock += step.after;
    timers.push(
      window.setTimeout(() => {
        step.run(api);
      }, clock),
    );
  }
  return () => {
    for (const id of timers) window.clearTimeout(id);
  };
}
