import type { BuildingDef } from '../../generated/BuildingDef';
import type { BuildingView } from '../../generated/BuildingView';
import type { BuildingKey } from '../../generated/content-keys';
import type { SpriteEnv } from '../sprite-contract';
import { BUILDING_ART } from './buildings';
import { paintDamage, paintScaffold } from './detail';
import { BuildingSpriteCache } from './sprite-cache';

/** Draw order shared by legacy and migrated art: state, body, motion, damage. */
export class BuildingRenderer {
  private readonly sprites = new BuildingSpriteCache();

  public drawBuilding(
    env: SpriteEnv,
    cx: number,
    cy: number,
    key: BuildingKey,
    view: BuildingView,
    def: BuildingDef,
    scale: number,
  ): void {
    if (view.state === 0) {
      paintScaffold(env.ctx, cx, cy, def.footprint, view.progress, env.time);
      return;
    }
    const art = BUILDING_ART[key];
    if (art.body) {
      this.sprites.draw(env.ctx, key, def, art.body, art.bounds, scale, cx, cy);
    } else {
      art.motion?.(env, cx, cy, view, def);
    }
    if (art.body && art.motion) art.motion(env, cx, cy, view, def);
    if ((view.flags & 4) !== 0) paintDamage(env.ctx, cx, cy, def.footprint, env.time);
  }

  public healthY(key: BuildingKey): number {
    return BUILDING_ART[key].healthY;
  }
}
