import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { eraAllowsKey } from '../../web/src/content/era';
import type { Snapshot } from '../../web/src/generated/Snapshot';
import { decodeBootBlob, decodeSnapshot } from '../../web/src/net/decode';
import type { HudSelection, HudView } from '../../web/src/ui/hud-api';
import { ReadoutPanel } from '../../web/src/ui/panels/readout';
import { TopBar } from '../../web/src/ui/panels/top-bar';

function bytes(name: string): Uint8Array {
  const file = readFileSync(join(process.cwd(), 'web', 'tests', 'fixtures', name));
  return new Uint8Array(file.buffer, file.byteOffset, file.byteLength);
}

const boot = decodeBootBlob(bytes('boot.bin'));
const base = decodeSnapshot(bytes('snapshot.bin'));
const wellKind = boot.catalog.buildings.findIndex((def) => def.key === 'oil-well');
const trainKind = boot.catalog.units.findIndex((def) => def.key === 'freight-train');

function view(snapshot: Snapshot, selection: HudSelection = { id: 0, kind: 'none' }): HudView {
  return { snapshot, boot, selection, placing: -1, placementReason: null, debug: null };
}

/** Minimal element probe; the production DOM helpers only touch these properties. */
function node(): HTMLElement {
  const classes = new Set<string>();
  return {
    textContent: '',
    innerHTML: '',
    title: '',
    hidden: false,
    disabled: false,
    style: { width: '' },
    classList: {
      contains: (name: string) => classes.has(name),
      toggle: (name: string, on: boolean) => {
        if (on) classes.add(name);
        else classes.delete(name);
      },
    },
  } as unknown as HTMLElement;
}

function readout(): ReadoutPanel {
  return Object.assign(Object.create(ReadoutPanel.prototype) as ReadoutPanel, {
    empty: node(), detail: node(), art: node(), name: node(), sub: node(), state: node(),
    hpBar: node(), hpFill: node(), progress: node(), progressFill: node(), hpText: node(),
    info: node(), launch: node(), demolish: node(),
  });
}

function elementOf(object: object, field: string): HTMLElement {
  return Reflect.get(object, field) as HTMLElement;
}

function textOf(panel: ReadoutPanel, field: 'info' | 'name' | 'state'): string {
  return elementOf(panel, field).textContent ?? '';
}

describe('T2 petroleum HUD', () => {
  it('gates the well and chemical plant at T2 and the launch pad at T3', () => {
    for (const key of ['oil-well', 'fuel-synth']) {
      expect(eraAllowsKey(boot.catalog.buildings, key, 1)).toBe(false);
      expect(eraAllowsKey(boot.catalog.buildings, key, 2)).toBe(true);
    }
    expect(eraAllowsKey(boot.catalog.buildings, 'launch-pad', 2)).toBe(false);
    expect(eraAllowsKey(boot.catalog.buildings, 'launch-pad', 3)).toBe(true);
  });

  it('hides crude in T1 and shows its delivered stock and rate in T2', () => {
    const bar = Object.create(TopBar.prototype) as TopBar;
    Object.assign(bar, {
      led: node(), ledText: node(), era: node(), clock: node(), allow: node(), alloyDelta: node(),
      energy: node(), energyOut: node(), energyIn: node(), energyDelta: node(), fuel: node(),
      fuelDelta: node(), fuelItem: node(), research: node(), researchDelta: node(),
      researchItem: node(), coal: node(), coalDelta: node(), oil: node(), oilDelta: node(),
      oilItem: node(), hint: node(), pause: node(), pauseIcon: node(), pauseLabel: node(),
      speedChips: [node(), node(), node()],
    });
    const calm = { ...base, status: 0, orbital: { ...base.orbital, threat: 0 } };
    bar.update(view({ ...calm, era: 1 }));
    expect(elementOf(bar, 'oilItem').hidden).toBe(true);
    bar.update(view({ ...calm, era: 2 }));
    expect(elementOf(bar, 'oilItem').hidden).toBe(false);
    expect(elementOf(bar, 'era').textContent).toBe('T2');
    expect(elementOf(bar, 'oil').textContent).toBe('24');
    expect(elementOf(bar, 'oilDelta').textContent).toBe('+12');
    expect(elementOf(bar, 'hint').textContent).toContain('勘探油田');
  });

  it('distinguishes local well inventory from cargo actually on a train', () => {
    const solar = base.buildings[0];
    if (!solar) throw new Error('fixture has no building');
    const panel = readout();
    panel.update(view({ ...base, era: 2, buildings: [{ ...solar, id: 71, kind: wellKind, aux: 26, flags: 1 }] }, { id: 71, kind: 'building' }));
    expect(textOf(panel, 'name')).toBe('油井');
    expect(textOf(panel, 'info')).toBe('库存 26/60 · -8 能源');

    const raider = base.units[0];
    if (!raider) throw new Error('fixture has no unit');
    const train = { ...raider, id: 72, kind: trainKind, owner: 0, home: 71, cargo: 18 };
    panel.update(view({ ...base, era: 2, units: [train] }, { id: 72, kind: 'unit' }));
    expect(textOf(panel, 'name')).toBe('货运列车');
    expect(textOf(panel, 'info')).toBe('原油 18/30 · 在途');
  });
});
