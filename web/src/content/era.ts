/**
 * Era gates over the content table.
 *
 * `BuildingDef.tier` is the era the kernel demands before it accepts a
 * placement; `Snapshot.era` is the era the campaign is currently in. The build
 * rail, demo script and era-gated HUD panels share this comparison so they
 * never disagree with each other or re-derive it from raw numbers.
 *
 * Hand written: everything under `generated/` is regenerated from Rust.
 */

import type { BuildingDef } from '../generated/BuildingDef';

/** Wire index of the command hub: seeded by the scenario, never on the rail. */
const HUB_KIND = 0;

/**
 * Is this definition placeable in `era`?
 *
 * An unknown kind (catalogue shorter than the index) reads as not placeable:
 * the kernel would refuse the command anyway, so sending it only costs a tick.
 */
export function eraAllows(def: BuildingDef | undefined, era: number): boolean {
  return def !== undefined && def.tier <= era;
}

/** Resolve a stable content key before applying the same era gate. */
export function eraAllowsKey(defs: readonly BuildingDef[], key: string, era: number): boolean {
  return eraAllows(defs.find((def) => def.key === key), era);
}

/**
 * Build-rail card indices for one category, ascending wire order.
 *
 * The hub is excluded (scenario-seeded), and any def whose tier is above the
 * era is omitted entirely -- no placeholder and no greyed-out card: a card the
 * player cannot place this era only teaches its rule by failing.
 */
export function buildableKinds(
  defs: readonly BuildingDef[],
  category: number,
  era: number,
): number[] {
  const kinds: number[] = [];
  for (let kind = 0; kind < defs.length; kind += 1) {
    const def = defs[kind];
    if (!def || kind === HUB_KIND) continue;
    if (def.category !== category) continue;
    if (!eraAllows(def, era)) continue;
    kinds.push(kind);
  }
  return kinds;
}
