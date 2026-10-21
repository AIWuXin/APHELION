/**
 * Protocol conformance tests.
 *
 * The Rust side writes golden fixtures (`cargo test -p oc-protocol`). These
 * tests decode them with the hand-written postcard reader and compare field by
 * field against an independently written JSON description, then re-encode a
 * command batch and compare the bytes with what Rust produced. If either side
 * drifts, the front-end build fails.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { Command } from '../../web/src/generated/Command';
import { decodeBootBlob, decodeSnapshot } from '../../web/src/net/decode';
import { encodeCommandBatch } from '../../web/src/net/encode';

const fixtures = join(process.cwd(), 'web', 'tests', 'fixtures');

function readBytes(name: string): Uint8Array {
  const buf = readFileSync(join(fixtures, name));
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

describe('postcard snapshot decoding', () => {
  it('matches the Rust golden JSON exactly', () => {
    const bytes = readBytes('snapshot.bin');
    const expected = JSON.parse(readFileSync(join(fixtures, 'snapshot.json'), 'utf8')) as unknown;
    const snapshot = decodeSnapshot(bytes);
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(expected);
  });

  it('reads every numeric field with the right sign', () => {
    const snapshot = decodeSnapshot(readBytes('snapshot.bin'));
    expect(snapshot.hash).toBe(3735928559);
    expect(snapshot.era).toBe(2);
    expect(snapshot.resources.coal).toBe(37);
    expect(snapshot.resources.coal_rate).toBe(20);
    expect(snapshot.orbital.ships[0]?.y).toBe(-2048);
    expect(snapshot.units[0]?.x).toBe(-3072);
    expect(snapshot.events[0]?.tx).toBe(-1);
    expect(snapshot.events[1]?.ty).toBe(9);
    expect(snapshot.orbital.routes).toHaveLength(2);
    expect(snapshot.beams[0]?.z0).toBe(280);
  });
});

describe('postcard command encoding', () => {
  it('produces exactly the bytes Rust serializes', () => {
    const reference = readBytes('commands.bin');
    const commands: Command[] = [
      { place: { kind: 5, tx: 130, ty: 200 } },
      { demolish: { id: 7 } },
      { launch: { id: 42 } },
      { toggleRoute: { route: 2 } },
      { setSandbox: { flags: 3 } },
      { setSpeed: { speed: 2 } },
      { pause: { paused: true } },
      { research: { tech: 1 } },
      { setAi: { phase: 1, strength: 2 } },
    ];
    const encoded = encodeCommandBatch(commands, 900);
    expect(Array.from(encoded)).toEqual(Array.from(reference));
  });
});

describe('boot blob', () => {
  it('decodes a catalogue with stable key order', () => {
    const bytes = readBytes('boot.bin');
    const boot = decodeBootBlob(bytes);
    expect(boot.protocol).toBe(1);
    expect(boot.catalog.buildings).toHaveLength(16);
    expect(boot.catalog.buildings[0]?.key).toBe('command-hub');
    // The hub is the colony's 3x3 landmark. A 2 here means the fixture is stale:
    // regenerate it with `cargo test -p oc-content` (emit_boot_fixture).
    expect(boot.catalog.buildings[0]?.footprint).toBe(3);
    expect(boot.catalog.buildings[14]?.key).toBe('coal-mine');
    expect(boot.catalog.buildings[14]?.tier).toBe(1);
    expect(boot.catalog.buildings[5]?.tier).toBe(3);
    expect(boot.catalog.routes).toHaveLength(3);
    expect(boot.catalog.techs).toHaveLength(4);
    // The era-1 ground raid needs no HUD code of its own: the event log reads
    // this row, so the row being present is the whole feature.
    const raid = boot.catalog.events[13];
    expect(raid?.key).toBe('raid');
    expect(raid?.speaker).toBe('TACTICAL');
    expect(raid?.tone).toBe(2);
    expect(raid?.text_zh).toContain('掠袭');
    expect(boot.map.w).toBe(44);
    expect(boot.map.material).toHaveLength(44 * 44);
    expect(boot.map.height).toHaveLength(44 * 44);
    expect(boot.map.coal).toHaveLength(44 * 44);
    // Height uses i8: brine tiles are -1, land is 0..3.
    expect(Math.min(...boot.map.height)).toBeGreaterThanOrEqual(-1);
    expect(Math.max(...boot.map.height)).toBeLessThanOrEqual(3);
  });
});
