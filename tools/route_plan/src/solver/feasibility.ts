/**
 * 可行性报告：把时刻表引擎产生的原始冲突补充成可执行的建议文案。
 */

import type { Conflict, Plan } from '../model/types';
import { formatMin } from '../utils/time';

export function annotateConflicts(conflicts: Conflict[], _plan: Plan): Conflict[] {
  return conflicts.map((c) => ({
    ...c,
    suggestion: buildSuggestion(c),
  }));
}

function buildSuggestion(c: Conflict): string {
  const late = Math.max(1, Math.round(c.lateMin));
  return (
    `最早到达 ${formatMin(c.arriveMin)}，晚于窗口截止 ${formatMin(c.windowEndMin)} 约 ${late} 分钟。` +
    `可选：① 出发时间提前约 ${late} 分钟；② 放宽该点窗口以容纳 ${formatMin(c.arriveMin)}；③ 将该点改为软窗（仅提示不拦截）。`
  );
}
