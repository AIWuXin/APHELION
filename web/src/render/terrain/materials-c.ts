import { paintNatural, paintWater } from './surface-paint';
import type { MaterialTexture } from './tile';

const shallow: MaterialTexture = (t) => paintWater(t, true);
const deep: MaterialTexture = (t) => paintWater(t, false);
const snow: MaterialTexture = (t) => paintNatural(t, 'frost');
const tundra: MaterialTexture = (t) => paintNatural(t, 'tundra');
const desert: MaterialTexture = (t) => paintNatural(t, 'sand');
const highland: MaterialTexture = (t) => paintNatural(t, 'highland');
const mossyTundra: MaterialTexture = (t) => paintNatural(t, 'moss');

export const DEEP_TEXTURES = { shallow, deep } as const;
export const COLD_TEXTURES = { snow, tundra, desert, highland, mossyTundra } as const;
