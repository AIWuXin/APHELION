/**
 * Building art registry.
 *
 * The 14 painters live in three sibling modules (structures / orbital /
 * defence) so no file turns into a dumping ground. Every painter is wrapped by
 * `withStates`, which adds the shared build-site scaffold and damaged overlays,
 * so state feedback can never diverge between structure types.
 *
 * `BuildingKey` is generated from the Rust table: appending a building without
 * adding a painter is a TypeScript error, not a runtime surprise.
 */

import type { BuildingKey } from '../../generated/content-keys';
import type { BuildingPainter } from '../sprite-contract';
import { DEFENCE } from './buildings/defence';
import { ORBITAL } from './buildings/orbital';
import { STRUCTURES } from './buildings/structures';
import { plinth, withStates } from './detail';

const RAW: Readonly<Record<string, BuildingPainter>> = {
  ...STRUCTURES,
  ...ORBITAL,
  ...DEFENCE,
};

/** Empty pad used if a painter is missing; keeps the registry total. */
const FALLBACK: BuildingPainter = (env, cx, cy) => plinth(env.ctx, cx, cy, 1);

function painterOf(key: BuildingKey): BuildingPainter {
  return withStates(RAW[key] ?? FALLBACK);
}

/** Complete painter registry, keyed by the generated content key. */
export const BUILDING_PAINTERS: Readonly<Record<BuildingKey, BuildingPainter>> = {
  'command-hub': painterOf('command-hub'),
  'solar-array': painterOf('solar-array'),
  refinery: painterOf('refinery'),
  'fuel-synth': painterOf('fuel-synth'),
  'research-lab': painterOf('research-lab'),
  'launch-pad': painterOf('launch-pad'),
  'freight-dock': painterOf('freight-dock'),
  'relay-mast': painterOf('relay-mast'),
  'rail-turret': painterOf('rail-turret'),
  'flak-battery': painterOf('flak-battery'),
  bulwark: painterOf('bulwark'),
  hangar: painterOf('hangar'),
  'radar-array': painterOf('radar-array'),
  'repair-bay': painterOf('repair-bay'),
};
