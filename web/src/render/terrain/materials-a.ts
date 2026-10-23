import { paintNatural } from './surface-paint';
import type { MaterialTexture } from './tile';

const basalt: MaterialTexture = (t) => paintNatural(t, 'basalt');
const regolith: MaterialTexture = (t) => paintNatural(t, 'dust');
const moss: MaterialTexture = (t) => paintNatural(t, 'moss');
const sand: MaterialTexture = (t) => paintNatural(t, 'sand');

/** Dry surfaces share continuous world-space strata rather than tile stamps. */
export const DRY_TEXTURES = { basalt, regolith, moss, sand } as const;
