/** 访问顺序辅助：从规划结果中提取「stopId → 访问序号（1 起）」，用于统一地图徽标/侧栏卡片/时间轴的编号含义 */

import type { RouteResult } from './types';

/**
 * 返回 stopId → 访问序号的映射；无结果或结果为空时返回 null。
 * 注意：当计划已被修改（stale）时，展示层应回退到列表序号（调用方自行判断）。
 */
export function visitIndexByStopId(result: RouteResult | null): Map<string, number> | null {
  if (!result || result.schedule.length === 0) return null;
  const map = new Map<string, number>();
  result.schedule.forEach((e, i) => map.set(e.stopId, i + 1));
  return map;
}
