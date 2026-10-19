/**
 * 目标函数接口。v1 仅实现 min-total-elapsed（最短总耗时：出发 → 最后一点离开，含在途与等待）。
 * 二期可在此扩展 min-travel-time（最短在途）/ min-distance（最短里程，需 Pareto）。
 */

export type ObjectiveId = 'min-total-elapsed';

export const OBJECTIVE_LABEL: Record<ObjectiveId, string> = {
  'min-total-elapsed': '最短总耗时',
};

export const DEFAULT_OBJECTIVE: ObjectiveId = 'min-total-elapsed';
