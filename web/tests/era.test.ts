/**
 * Era gate over the real content table.
 *
 * The catalogue is decoded from the Rust golden boot blob, so this test fails if
 * a tier changes in `oc-content` without the build rail (and the demo script,
 * which shares `eraAllows`) following.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildableKinds, eraAllows } from '../../web/src/content/era';
import { decodeBootBlob } from '../../web/src/net/decode';

const fixtures = join(process.cwd(), 'web', 'tests', 'fixtures');

function bootCatalogue() {
  const buf = readFileSync(join(fixtures, 'boot.bin'));
  const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  return decodeBootBlob(bytes).catalog.buildings;
}

const defs = bootCatalogue();

/** Category indices from `oc-content` (`CAT_BUILD` … `CAT_SUPPORT`). */
const CAT_BUILD = 0;
const CAT_ORBITAL = 1;
const CAT_DEFENCE = 2;
const CAT_SUPPORT = 3;

describe('era gate on the build rail', () => {
  it('shows the whole T1 kit and nothing above it', () => {
    // The T1 build-category kit: solar, refinery, coal-mine, coal-plant.
    expect(buildableKinds(defs, CAT_BUILD, 1)).toEqual([1, 2, 14, 15]);
    expect(buildableKinds(defs, CAT_DEFENCE, 1)).toEqual([8, 10]);
    expect(buildableKinds(defs, CAT_ORBITAL, 1)).toEqual([]);
    expect(buildableKinds(defs, CAT_SUPPORT, 1)).toEqual([]);
  });

  it('leaves exactly six cards in era 1', () => {
    // Six, not seven: the command hub is scenario-seeded and never on the rail.
    const categories = [CAT_BUILD, CAT_ORBITAL, CAT_DEFENCE, CAT_SUPPORT];
    const total = categories.flatMap((category) => buildableKinds(defs, category, 1)).length;
    expect(total).toBe(6);
  });

  it('unlocks one tier at a time', () => {
    expect(buildableKinds(defs, CAT_BUILD, 2)).toEqual([1, 2, 3, 4, 14, 15, 16]);
    expect(buildableKinds(defs, CAT_DEFENCE, 2)).toEqual([8, 9, 10]);
    expect(buildableKinds(defs, CAT_SUPPORT, 2)).toEqual([12, 13]);
    expect(buildableKinds(defs, CAT_ORBITAL, 2)).toEqual([]);
    expect(buildableKinds(defs, CAT_ORBITAL, 3)).toEqual([5, 6, 7]);
    expect(buildableKinds(defs, CAT_SUPPORT, 3)).toEqual([11, 12, 13]);
  });

  it('never offers the scenario-seeded command hub', () => {
    for (const era of [1, 2, 3]) {
      for (const category of [CAT_BUILD, CAT_ORBITAL, CAT_DEFENCE, CAT_SUPPORT]) {
        expect(buildableKinds(defs, category, era)).not.toContain(0);
      }
    }
  });

  it('keeps demo steps honest about the tier', () => {
    const lab = defs[4];
    const solar = defs[1];
    expect(lab?.tier).toBe(2);
    expect(eraAllows(lab, 1)).toBe(false);
    expect(eraAllows(lab, 2)).toBe(true);
    expect(eraAllows(solar, 1)).toBe(true);
    // Unknown kinds are never sent to the kernel.
    expect(eraAllows(undefined, 3)).toBe(false);
  });
});
