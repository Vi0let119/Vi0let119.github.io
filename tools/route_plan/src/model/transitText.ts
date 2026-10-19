/**
 * 公交换乘分段的展示文案与统计（时间轴 / 导出共用）。
 * 目标：把一条路线的进程拆开——步行与乘车各自的时间、距离、目的地分别呈现。
 */

import type { TransitSegment } from './types';
import { formatDistance, formatDuration } from '../utils/time';

export const TRANSIT_KIND_LABEL: Record<TransitSegment['kind'], string> = {
  walk: '步行',
  subway: '地铁',
  bus: '公交',
  rail: '铁路',
  other: '公交',
};

export const TRANSIT_KIND_ICON: Record<TransitSegment['kind'], string> = {
  walk: '🚶',
  subway: '🚇',
  bus: '🚌',
  rail: '🚄',
  other: '🚏',
};

/** 线路名去括号：「地铁10号线(基隆路--虹桥火车站)」→「地铁10号线」 */
export function shortLineName(name?: string): string | undefined {
  if (!name) return undefined;
  const short = name.replace(/[（(].*$/, '').trim();
  return short || name;
}

/** 从高德指引文本解析「……到达X」中的目的地（站点字段缺失时的兜底） */
function destFromInstruction(instruction?: string): string | undefined {
  if (!instruction) return undefined;
  const m = /到达(.+)$/.exec(instruction.trim());
  return m?.[1]?.trim() || undefined;
}

export interface TransitSegmentDisplay {
  icon: string;
  /** 结构化文案：方式/线路 · 站数 · 距离 · 时长 → 目的地 */
  text: string;
  /** 高德原始指引（悬浮提示用） */
  instruction?: string;
}

/** 逐段结构化：步行段与乘车段的距离、时长、目的地分开呈现 */
export function transitSegmentsDetailed(segs: TransitSegment[]): TransitSegmentDisplay[] {
  return segs.map((seg, i) => {
    const next = segs[i + 1];
    if (seg.kind === 'walk') {
      const dest =
        seg.offStation ??
        next?.onStation ??
        destFromInstruction(seg.instruction) ??
        (i === segs.length - 1 ? '目的地' : undefined);
      const text = `步行 ${formatDistance(seg.distanceM)} · ${formatDuration(seg.durationMin)}${dest ? ` → ${dest}` : ''}`;
      return { icon: TRANSIT_KIND_ICON.walk, text, instruction: seg.instruction };
    }
    const line = shortLineName(seg.lineName) ?? TRANSIT_KIND_LABEL[seg.kind];
    const stops = seg.viaNum !== undefined ? ` · ${seg.viaNum}站` : '';
    const dest = seg.offStation ?? destFromInstruction(seg.instruction);
    const text = `${line}${stops} · ${formatDistance(seg.distanceM)} · ${formatDuration(seg.durationMin)}${dest ? ` → ${dest}` : ''}`;
    return { icon: TRANSIT_KIND_ICON[seg.kind], text, instruction: seg.instruction };
  });
}

export interface TransitSplit {
  walkDistanceM: number;
  walkDurationMin: number;
  rideDistanceM: number;
  rideDurationMin: number;
}

/** 步行 / 乘车的距离与时间分别合计 */
export function transitSplitSums(segs: TransitSegment[]): TransitSplit {
  const split: TransitSplit = { walkDistanceM: 0, walkDurationMin: 0, rideDistanceM: 0, rideDurationMin: 0 };
  for (const s of segs) {
    if (s.kind === 'walk') {
      split.walkDistanceM += s.distanceM;
      split.walkDurationMin += s.durationMin;
    } else {
      split.rideDistanceM += s.distanceM;
      split.rideDurationMin += s.durationMin;
    }
  }
  return split;
}

/** 「步行 3.5km · 57m ｜ 乘车 3.2km · 20m」 */
export function transitSplitText(split: TransitSplit): string {
  const parts: string[] = [];
  if (split.walkDistanceM > 0 || split.walkDurationMin > 0) {
    parts.push(`步行 ${formatDistance(split.walkDistanceM)} · ${formatDuration(split.walkDurationMin)}`);
  }
  if (split.rideDistanceM > 0 || split.rideDurationMin > 0) {
    parts.push(`乘车 ${formatDistance(split.rideDistanceM)} · ${formatDuration(split.rideDurationMin)}`);
  }
  return parts.join(' ｜ ');
}
