/** 完整版 Markdown 导出（时刻表 + 交通详情 + 概览 + 备注） */

import type { LegResult, Plan, RouteResult } from '../model/types';
import { TRAVEL_MODE_LABEL } from '../model/types';
import { transitSegmentsDetailed, transitSplitSums, transitSplitText } from '../model/transitText';
import { formatDistance, formatDuration, formatMin, parseDateLocal } from '../utils/time';
import { resolveStopConstraints } from '../constraints';

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function weekdayName(dateStr: string): string {
  return WEEKDAYS[parseDateLocal(dateStr).getDay()];
}

function legText(leg: LegResult, prefix = ''): string {
  const est = leg.estimated ? '（估算）' : '';
  return `${prefix}${TRAVEL_MODE_LABEL[leg.mode]} ${formatDistance(leg.distanceM)} · ${formatDuration(leg.durationMin)}${est}`;
}

export function buildMarkdown(plan: Plan, result: RouteResult): string {
  const { byNode } = resolveStopConstraints(plan);
  const lines: string[] = [];

  lines.push(`# ${plan.name} · ${plan.date}（${weekdayName(plan.date)}）· ${TRAVEL_MODE_LABEL[plan.mode]}`);
  lines.push('');
  lines.push(
    `出发 ${formatMin(result.departMin)} · 收工 ${formatMin(result.stats.finishMin)} · ` +
      `总里程 ${formatDistance(result.stats.totalDistanceM)} · ` +
      `总耗时 ${formatDuration(result.stats.totalElapsedMin)}（含等待 ${formatDuration(result.stats.totalWaitMin)}）`,
  );
  lines.push('');
  lines.push('## 时刻表');
  lines.push('');
  lines.push('| # | 地点 | 到达 | 离开 | 停留 | 到下一段 |');
  lines.push('|---|------|------|------|------|----------|');

  // 起点行：出发时刻 + 起点到第 1 站的路程
  const startLeg = result.legs[0];
  lines.push(
    `| 起 | ${plan.start.name ?? '起点'} | — | ${formatMin(result.departMin)} | — | ${startLeg ? legText(startLeg) : '—'} |`,
  );

  result.schedule.forEach((e, i) => {
    const stop = plan.stops[e.nodeIdx - 1];
    const dwell = formatDuration(stop?.dwellMin ?? 0);
    const nextLeg = result.legs[i + 1];
    let nextCell: string;
    if (nextLeg) {
      nextCell = legText(nextLeg);
    } else if (result.returnLeg) {
      nextCell = legText(result.returnLeg, '回起点 ');
    } else {
      nextCell = '收工';
    }
    lines.push(
      `| ${i + 1} | ${e.name} | ${formatMin(e.arriveMin)} | ${formatMin(e.departMin)} | ${dwell} | ${nextCell} |`,
    );
  });

  // 公交换乘分步详情：每段独立呈现距离/时长/目的地，并给出步行与乘车的拆分合计
  const transitDetails: string[] = [];
  const stopNameAt = (i: number) => result.schedule[i]?.name ?? '';
  const pushTransitSection = (leg: LegResult, fromLabel: string, toLabel: string) => {
    if (!leg.transitSegments || leg.transitSegments.length === 0) return;
    const split = transitSplitText(transitSplitSums(leg.transitSegments));
    transitDetails.push(
      `- **${fromLabel} → ${toLabel}**（共 ${formatDistance(leg.distanceM)} · ${formatDuration(leg.durationMin)}${split ? `｜${split}` : ''}）`,
    );
    for (const d of transitSegmentsDetailed(leg.transitSegments)) {
      transitDetails.push(`  - ${d.icon} ${d.text}`);
    }
  };
  result.legs.forEach((leg, i) => {
    pushTransitSection(leg, i === 0 ? '起点' : `${i} ${stopNameAt(i - 1)}`, `${i + 1} ${stopNameAt(i)}`);
  });
  if (result.returnLeg) {
    const n = result.legs.length;
    pushTransitSection(result.returnLeg, `${n} ${stopNameAt(n - 1)}`, '起点');
  }
  if (transitDetails.length > 0) {
    lines.push('');
    lines.push('## 交通详情（公交段换乘步骤）');
    lines.push('');
    lines.push(...transitDetails);
  }

  const notes: string[] = [];
  result.schedule.forEach((e, i) => {
    const resolved = byNode[e.nodeIdx];
    const parts: string[] = [];
    if (resolved && resolved.windows.length > 0) {
      const w = resolved.windows
        .map((x) => `${formatMin(x.startMin)}–${formatMin(x.endMin)}（${x.hardness === 'hard' ? '硬窗' : '软窗'}）`)
        .join('、');
      parts.push(`窗口 ${w}`);
    }
    if (e.waitMin > 0) parts.push(`早到等待 ${formatDuration(e.waitMin)}`);
    if (e.penaltyMin > 0) parts.push(`软窗罚分 ${Math.round(e.penaltyMin)} 分钟等效`);
    if (parts.length > 0) notes.push(`- ${i + 1}. ${e.name}：${parts.join('；')}`);
  });
  for (const [i, e] of result.schedule.entries()) {
    const c = result.conflicts.find((x) => x.stopId === e.stopId);
    if (c) notes.push(`- ⚠️ ${i + 1}. ${e.name}：${c.suggestion}`);
  }

  if (notes.length > 0) {
    lines.push('');
    lines.push('## 备注');
    lines.push('');
    lines.push(...notes);
  }

  return lines.join('\n') + '\n';
}
