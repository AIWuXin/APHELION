import type { BuildingKey } from '../../generated/content-keys';
import type { BuildingArt } from '../sprite-contract';
import { BULWARK_ART, FLAK_ART, RELAY_ART, REPAIR_ART, TURRET_ART } from './buildings/defence';
import { HQ_ART } from './buildings/hq';
import { COAL_MINE_ART, COAL_PLANT_ART } from './buildings/industry';
import { DOCK_ART, HANGAR_ART, LAUNCH_ART, RADAR_ART } from './buildings/orbital';
import { REFINERY_ART } from './buildings/refinery';
import { FUEL_ART, LAB_ART, SOLAR_ART } from './buildings/structures';

export const BUILDING_ART = {
  'command-hub': HQ_ART,
  'solar-array': SOLAR_ART,
  refinery: REFINERY_ART,
  'fuel-synth': FUEL_ART,
  'research-lab': LAB_ART,
  'launch-pad': LAUNCH_ART,
  'freight-dock': DOCK_ART,
  'relay-mast': RELAY_ART,
  'rail-turret': TURRET_ART,
  'flak-battery': FLAK_ART,
  bulwark: BULWARK_ART,
  hangar: HANGAR_ART,
  'radar-array': RADAR_ART,
  'repair-bay': REPAIR_ART,
  'coal-mine': COAL_MINE_ART,
  'coal-plant': COAL_PLANT_ART,
} as const satisfies Readonly<Record<BuildingKey, BuildingArt>>;
