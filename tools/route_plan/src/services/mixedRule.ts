/**
 * 「智能混合」模式的纯规则（与地图接口无关，便于单测）。
 * 规划时逐段决定：两点间步行还是公交地铁。
 */

export const MIXED_WALK_MAX_METERS = 2000;

/**
 * 两点间的交通方式选择：
 * - 步行距离 < 2km → 步行（无论公交多快）
 * - 公交无方案 / 查询失败（null）→ 步行降级（用真实步行耗时，而不是估算）
 * - 否则：步行时间 ≤ 公交时间 → 步行；否则公交地铁
 */
export function chooseLegMode(
  walkDistanceM: number,
  walkDurationMin: number,
  transitDurationMin: number | null,
): 'walking' | 'transit' {
  if (walkDistanceM < MIXED_WALK_MAX_METERS) return 'walking';
  if (transitDurationMin === null) return 'walking';
  return walkDurationMin <= transitDurationMin ? 'walking' : 'transit';
}
