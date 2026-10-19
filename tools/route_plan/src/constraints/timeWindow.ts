/**
 * v1 核心约束：时间窗（绝对 / 日落相对）。
 *
 * 语义（与方案 §4 一致）：
 * - 早到 → 等待到窗口开始（自动并入时刻表，不算违规）
 * - 硬窗晚到 → 不可行（求解器剪枝；时刻表记为冲突）
 * - 软窗晚到 → 计入惩罚（分钟等效 = 迟到分钟 × penaltyPerMin）
 * - 多窗口时选「代价最小」的一个：优先第一个 arrive ≤ end 的窗口，
 *   都比 arrive 早则对「截止最晚」的窗口计迟到。
 */

import type { Stop, TimeWindow } from '../model/types';
import type {
  AbsWindow,
  ConstraintContext,
  ConstraintVerdict,
  FastEvaluator,
  SchedConstraint,
} from './types';
import { FEASIBLE_VERDICT } from './types';

/** 纯函数：给定按 startMin 升序的绝对窗口，评估某到达时刻。求解器与时刻表共用，保证语义一致。 */
export function evalArrive(windows: AbsWindow[], arriveMin: number): ConstraintVerdict {
  if (windows.length === 0) return FEASIBLE_VERDICT;
  // NaN/Infinity 到达时刻属于调用方缺陷，按不可行暴露（避免被误判为可行而静默出错）
  if (!Number.isFinite(arriveMin)) {
    return { feasible: false, waitUntilMin: 0, penaltyMin: 0, reason: `非法的到达时刻 ${arriveMin}` };
  }

  let chosen = -1;
  for (let i = 0; i < windows.length; i++) {
    if (windows[i].endMin >= arriveMin) {
      chosen = i;
      break;
    }
  }
  if (chosen === -1) {
    let best = 0;
    for (let i = 1; i < windows.length; i++) {
      if (windows[i].endMin > windows[best].endMin) best = i;
    }
    chosen = best;
  }

  const w = windows[chosen];
  const lateMin = Math.max(0, arriveMin - w.endMin);
  const waitUntilMin = arriveMin < w.startMin ? w.startMin - arriveMin : 0;
  const hardViolation = w.hardness === 'hard' && lateMin > 0;

  return {
    feasible: !hardViolation,
    waitUntilMin,
    penaltyMin: w.hardness === 'soft' ? lateMin * w.penaltyPerMin : 0,
    lateMin: lateMin > 0 ? lateMin : undefined,
    windowEndMin: w.endMin,
    reason: hardViolation
      ? `晚于窗口截止 ${lateMin} 分钟`
      : lateMin > 0
        ? `软窗迟到 ${lateMin} 分钟`
        : undefined,
  };
}

/** 把单个时间窗解析为绝对窗口；日落相对窗在缺少日照数据（极昼夜）时返回 null 并记录警告。 */
export function resolveWindow(
  window: TimeWindow,
  stop: Stop,
  ctx: ConstraintContext,
  warnings: string[],
): AbsWindow | null {
  if (window.kind === 'absolute') {
    return {
      startMin: window.startMin,
      endMin: window.endMin,
      hardness: window.hardness,
      penaltyPerMin: window.penaltyPerMin,
    };
  }
  // sunset-relative（二期可加 sunrise-relative / golden-hour，走同一解析出口）
  const sun = ctx.sunTimesByStop.get(stop.id);
  if (!sun) {
    warnings.push(`「${stop.name || '未命名点'}」的日落相对窗口因缺少日照数据被忽略`);
    return null;
  }
  const start = sun.sunsetMin + (window.offsetStartMin ?? -30);
  const end = sun.sunsetMin + (window.offsetEndMin ?? 30);
  return {
    startMin: Math.min(start, end),
    endMin: Math.max(start, end),
    hardness: window.hardness,
    penaltyPerMin: window.penaltyPerMin,
  };
}

/** 解析某点位的全部窗口为绝对窗口（按开始时间升序） */
export function resolveTimeWindows(
  stop: Stop,
  ctx: ConstraintContext,
  warnings: string[],
): AbsWindow[] {
  const abs: AbsWindow[] = [];
  for (const w of stop.windows) {
    const r = resolveWindow(w, stop, ctx, warnings);
    if (r) abs.push(r);
  }
  abs.sort((a, b) => a.startMin - b.startMin);
  return abs;
}

export const timeWindowConstraint: SchedConstraint = {
  id: 'time-window',
  kind: 'time-window',

  resolve(stop, ctx, resolved, warnings) {
    resolved.windows = resolveTimeWindows(stop, ctx, warnings);
  },

  evaluate(arriveMin, stop, ctx) {
    const windows = resolveTimeWindows(stop, ctx, []);
    return evalArrive(windows, arriveMin);
  },

  compile(_stop, _ctx, resolved) {
    const windows = resolved.windows;
    if (windows.length === 0) return () => FEASIBLE_VERDICT;
    const evaluator: FastEvaluator = (arriveMin) => evalArrive(windows, arriveMin);
    return evaluator;
  },
};
