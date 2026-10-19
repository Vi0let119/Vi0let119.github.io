/** 精简版纯文本导出（含逐段交通与公交换乘明细，可复制到微信/笔记） */

import type { LegResult, Plan, RouteResult } from '../model/types';
import { TRAVEL_MODE_LABEL } from '../model/types';
import { transitSegmentsDetailed, transitSplitSums, transitSplitText } from '../model/transitText';
import { formatDistance, formatDuration, formatMin } from '../utils/time';
import { weekdayName } from './markdown';

export function buildPlaintext(plan: Plan, result: RouteResult): string {
  const lines: string[] = [];

  lines.push(
    `${plan.name} ${plan.date}（${weekdayName(plan.date)}）· ${TRAVEL_MODE_LABEL[plan.mode]} · ${formatMin(result.departMin)} 出发`,
  );
  lines.push('');

  const emitLeg = (leg: LegResult, prefix = '') => {
    const est = leg.estimated ? '（估算）' : '';
    let line = `  ↳ ${prefix}${TRAVEL_MODE_LABEL[leg.mode]} ${formatDistance(leg.distanceM)} · ${formatDuration(leg.durationMin)}`;
    if (leg.transitSegments && leg.transitSegments.length > 0) {
      const split = transitSplitText(transitSplitSums(leg.transitSegments));
      if (split) line += `（${split}）`;
    }
    lines.push(line + est);
    // 换乘分步：步行与乘车各自的距离/时长/目的地
    for (const d of transitSegmentsDetailed(leg.transitSegments ?? [])) {
      lines.push(`      ${d.icon} ${d.text}`);
    }
  };

  lines.push(`起点·${plan.start.name ?? '起点'} ${formatMin(result.departMin)} 出发`);
  if (result.legs[0]) emitLeg(result.legs[0]);

  result.schedule.forEach((e, i) => {
    let tail = '';
    if (e.waitMin > 0) tail += `（等待 ${formatDuration(e.waitMin)}）`;
    if (result.conflicts.some((c) => c.stopId === e.stopId)) tail += ' ⚠️时间窗冲突';
    lines.push(`${i + 1}. ${e.name} ${formatMin(e.arriveMin)} → ${formatMin(e.departMin)}${tail}`);
    const nextLeg = result.legs[i + 1];
    if (nextLeg) emitLeg(nextLeg);
  });

  if (result.returnLeg) emitLeg(result.returnLeg, '回起点 ');

  lines.push('');
  lines.push(
    `总里程 ${formatDistance(result.stats.totalDistanceM)} · 总耗时 ${formatDuration(result.stats.totalElapsedMin)} · 收工 ${formatMin(result.stats.finishMin)}`,
  );

  return lines.join('\n') + '\n';
}
