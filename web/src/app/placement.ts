import type { Transport } from '../net/transport';
import type { Store } from './store';

/** Refresh the current ghost from the authoritative kernel query. */
export function updatePlacementQuery(store: Store, transport: Transport, placing: number): void {
  const hover = store.hover;
  const q = placing >= 0 && hover
    ? transport.queryPlace?.(placing, hover.tx, hover.ty)
    : undefined;
  store.placementOk = q?.ok ?? false;
  store.placementReason = q?.reason ?? null;
}
