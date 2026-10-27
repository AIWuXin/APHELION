import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { startDemo } from '../../web/src/app/demo';
import type { Command } from '../../web/src/generated/Command';
import { decodeBootBlob, decodeSnapshot } from '../../web/src/net/decode';

function bytes(name: string): Uint8Array {
  const file = readFileSync(join(process.cwd(), 'web', 'tests', 'fixtures', name));
  return new Uint8Array(file.buffer, file.byteOffset, file.byteLength);
}

afterEach(() => vi.unstubAllGlobals());

describe('milestone-driven demo', () => {
  it('researches through tech locks, launches twice and opens routes', () => {
    let attempt: (() => void) | null = null;
    vi.stubGlobal('window', {
      setTimeout: () => 1,
      setInterval: (fn: () => void) => { attempt = fn; return 1; },
      clearTimeout: () => undefined,
      clearInterval: () => undefined,
    });
    vi.stubGlobal('location', { search: '?demo=1&rush=1' });
    const boot = decodeBootBlob(bytes('boot.bin'));
    const base = decodeSnapshot(bytes('snapshot.bin'));
    const source = base.buildings[0];
    if (!source) throw new Error('fixture has no building');
    const structures = [4, 5, 6].map((kind, index) => ({
      ...source, id: 51 + index, kind, state: 1, progress: 1000, aux: 0,
    }));
    const snapshot = {
      ...base,
      status: 0,
      era: 3,
      buildings: structures,
      orbital: { ...base.orbital, capacity: 6, used: 0 },
    };
    const researched = new Set<number>();
    const sent: Command[] = [];
    let nextId = 100;
    const stop = startDemo({
      send: (commands) => {
        sent.push(...commands);
        for (const command of commands) {
          if ('research' in command) researched.add(command.research.tech);
          if ('place' in command) {
            structures.push({ ...source, ...command.place, id: nextId, state: 1, progress: 1000, aux: 0 });
            nextId += 1;
          }
        }
      },
      canPlace: (kind, tx, ty) => {
        const tech = boot.catalog.buildings[kind]?.tech;
        const unlocked = tech === undefined || tech === 255 || researched.has(tech);
        return unlocked && structures.every((b) => b.tx !== tx || b.ty !== ty);
      },
      snapshot: () => snapshot,
      buildings: boot.catalog.buildings,
      anchor: { tx: 20, ty: 20 },
      oilAnchor: { tx: 60, ty: 60 },
    });
    const run = attempt as (() => void) | null;
    let demolished = false;
    for (let i = 0; i < 48; i += 1) {
      if (i === 14) {
        const index = structures.findIndex((b) => b.kind === 15);
        if (index >= 0) structures.splice(index, 1);
        demolished = true;
      }
      run?.();
    }
    stop();

    expect(demolished).toBe(true);
    expect(sent.filter((c) => 'place' in c && c.place.kind === 15)).toHaveLength(2);
    expect(sent.filter((c) => 'research' in c).map((c) => c.research.tech)).toEqual([0, 1, 2, 3]);
    expect(sent.filter((c) => 'launch' in c)).toHaveLength(2);
    expect(sent.filter((c) => 'toggleRoute' in c).map((c) => c.toggleRoute.route)).toEqual([0, 1]);
    expect(sent.some((c) => 'place' in c && c.place.kind === 16)).toBe(true);
    expect(sent.some((c) => 'place' in c && c.place.kind === 7)).toBe(true);
  });
});
