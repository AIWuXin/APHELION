import type { BuildingKey } from '../../generated/content-keys';
import type { BuildingArt, BuildingPainter, SpriteBox } from '../sprite-contract';
import { DEFENCE } from './buildings/defence';
import { HQ_ART } from './buildings/hq';
import { INDUSTRY } from './buildings/industry';
import { ORBITAL } from './buildings/orbital';
import { REFINERY_ART } from './buildings/refinery';
import { FUEL_ART, LAB_ART, SOLAR_ART } from './buildings/structures';
import { plinth } from './detail';

const RAW: Readonly<Record<string, BuildingPainter>> = {
  ...INDUSTRY, ...ORBITAL, ...DEFENCE,
};
const FALLBACK: BuildingPainter = (env, cx, cy) => plinth(env.ctx, cx, cy, 1);

function bounds(size: number): SpriteBox {
  const healthY = size >= 3 ? -146 : size === 2 ? -92 : -76;
  return { left: -size * 48 - 16, top: healthY - 16, right: size * 48 + 16, bottom: size * 20 + 20 };
}

/** Compatibility adapter: state is handled once by BuildingRenderer, not here. */
function legacy(key: BuildingKey, size: number) {
  return { body: null, motion: RAW[key] ?? FALLBACK, bounds: bounds(size), healthY: size >= 3 ? -146 : size === 2 ? -92 : -76 } as const;
}

export const BUILDING_ART = {
  'command-hub': HQ_ART,
  'solar-array': SOLAR_ART,
  refinery: REFINERY_ART,
  'fuel-synth': FUEL_ART,
  'research-lab': LAB_ART,
  'launch-pad': legacy('launch-pad', 2),
  'freight-dock': legacy('freight-dock', 2),
  'relay-mast': legacy('relay-mast', 1),
  'rail-turret': legacy('rail-turret', 1),
  'flak-battery': legacy('flak-battery', 1),
  bulwark: legacy('bulwark', 1),
  hangar: legacy('hangar', 2),
  'radar-array': legacy('radar-array', 2),
  'repair-bay': legacy('repair-bay', 1),
  'coal-mine': legacy('coal-mine', 2),
  'coal-plant': legacy('coal-plant', 2),
} as const satisfies Readonly<Record<BuildingKey, BuildingArt>>;
