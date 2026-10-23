/** The shared footprint centre for radar centre tracking and contact placement. */
export function buildingCentre(tx: number, ty: number, footprint: number): [number, number] {
  return [tx + footprint / 2, ty + footprint / 2];
}
