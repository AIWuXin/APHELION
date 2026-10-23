import { TERRAIN_KEYS } from '../../generated/content-keys';

/** Manufactured slabs retain expansion joints; natural terrain stays continuous. */
export function hasTileSeam(material: number): boolean {
  const key = TERRAIN_KEYS[material];
  return key === 'apron' || key === 'road';
}
