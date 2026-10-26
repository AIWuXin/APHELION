/** Chinese labels for `REASON_*`; indices are part of the wire contract. */
export const PLACEMENT_REASON_ZH = [
  '可以放置',
  '合金不足',
  '燃料不足',
  '超出可建造区域',
  '地形不适合建造',
  '地块已被占用',
  '需要前置科技',
  '缺少资源点或设施连接',
  '电力不足',
  '当前时代尚未解锁',
] as const;

/** Translate a kernel placement reason without reimplementing placement rules. */
export function placementReasonText(reason: number): string {
  return PLACEMENT_REASON_ZH[reason] ?? '无法放置';
}
