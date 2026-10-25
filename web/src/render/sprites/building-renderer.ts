import type { BuildingDef } from '../../generated/BuildingDef';
import type { BuildingView } from '../../generated/BuildingView';
import type { BuildingKey } from '../../generated/content-keys';
import type { SpriteEnv } from '../sprite-contract';
import { BUILDING_ART } from './buildings';
import { paintDamage, paintScaffold } from './detail';
import { BuildingSpriteCache, spriteAnchor } from './sprite-cache';

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
    const anchor = spriteAnchor(cx, cy);
    if (view.state === 0) {
      paintScaffold(env.ctx, anchor.x, anchor.y, def.footprint, view.progress, env.time);
      return;
    }
    const art = BUILDING_ART[key];
    if (art.body) {
      this.sprites.draw(env.ctx, key, def, art.body, art.bounds, scale, anchor.x, anchor.y);
    } else {
      art.motion?.(env, anchor.x, anchor.y, view, def);
    }
    if (art.body && art.motion) art.motion(env, anchor.x, anchor.y, view, def);
    if ((view.flags & 4) !== 0) paintDamage(env.ctx, anchor.x, anchor.y, def.footprint, env.time);
  }

  public healthY(key: BuildingKey): number {
    return BUILDING_ART[key].healthY;
  }
}
