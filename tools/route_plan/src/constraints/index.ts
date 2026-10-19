/**
 * 约束注册表：解析（Plan -> 每个点位/节点的 ResolvedStop）与编译（-> 热路径评估器）。
 *
 * 二期预留槽位（不注册即生效于架构，实现时只加实现文件并 push 进注册表）：
 * - openingHoursConstraint：高德 POI 营业时间 → 硬/软窗
 * - weatherConstraint：Open-Meteo 预报 → 软惩罚 / 建议改期
 * - priorityConstraint：必拍/可选（无解时自动舍弃 optional，以最优子集求解）
 */

import type { Plan, Stop } from '../model/types';
import type { ConstraintContext, FastEvaluator, ResolvedStop, SchedConstraint } from './types';
import { FEASIBLE_VERDICT } from './types';
import { timeWindowConstraint } from './timeWindow';
import { getSunTimes } from './sunTimes';

export const constraintRegistry: SchedConstraint[] = [timeWindowConstraint];

export interface ResolvedConstraints {
  ctx: ConstraintContext;
  /** 按矩阵节点序号索引（0 = 起点占位），长度 n+1 */
  byNode: (ResolvedStop | null)[];
  /** 热路径评估器，按矩阵节点序号索引，长度 n+1 */
  evaluators: FastEvaluator[];
  warnings: string[];
}

export function resolveStopConstraints(plan: Plan): ResolvedConstraints {
  const ctx: ConstraintContext = { plan, sunTimesByStop: new Map() };
  const warnings: string[] = [];

  const needsSun = (stop: Stop) => stop.windows.some((w) => w.kind !== 'absolute');
  for (const stop of plan.stops) {
    if (needsSun(stop) && !ctx.sunTimesByStop.has(stop.id)) {
      ctx.sunTimesByStop.set(stop.id, getSunTimes(stop.lat, stop.lng, plan.date));
    }
  }

  const byNode: (ResolvedStop | null)[] = [null];
  const evaluators: FastEvaluator[] = [() => FEASIBLE_VERDICT];

  for (const stop of plan.stops) {
    const resolved: ResolvedStop = {
      stopId: stop.id,
      name: stop.name,
      dwellMin: stop.dwellMin,
      windows: [],
    };
    for (const c of constraintRegistry) {
      c.resolve?.(stop, ctx, resolved, warnings);
    }
    evaluators.push(compileForStop(stop, ctx, resolved));
    byNode.push(resolved);
  }

  return { ctx, byNode, evaluators, warnings };
}

function compileForStop(stop: Stop, ctx: ConstraintContext, resolved: ResolvedStop): FastEvaluator {
  const compiled: FastEvaluator[] = [];
  for (const c of constraintRegistry) {
    if (c.compile) compiled.push(c.compile(stop, ctx, resolved));
    else if (c.evaluate) compiled.push((arrive) => c.evaluate!(arrive, stop, ctx));
  }
  if (compiled.length === 0) return () => FEASIBLE_VERDICT;
  if (compiled.length === 1) return compiled[0];

  // 组合语义：任一不可行则不可行；等待取最大；惩罚求和。
  return (arriveMin) => {
    let feasible = true;
    let waitUntilMin = 0;
    let penaltyMin = 0;
    let lateMin: number | undefined;
    let windowEndMin: number | undefined;
    const reasons: string[] = [];
    for (const ev of compiled) {
      const v = ev(arriveMin);
      if (!v.feasible) feasible = false;
      waitUntilMin = Math.max(waitUntilMin, v.waitUntilMin);
      penaltyMin += v.penaltyMin;
      if (v.lateMin !== undefined) lateMin = Math.max(lateMin ?? 0, v.lateMin);
      if (v.windowEndMin !== undefined) windowEndMin = v.windowEndMin;
      if (v.reason) reasons.push(v.reason);
    }
    return {
      feasible,
      waitUntilMin,
      penaltyMin,
      lateMin,
      windowEndMin,
      reason: reasons.length ? reasons.join('；') : undefined,
    };
  };
}

/** 计划中是否存在软窗（决定 DP 是否启用 Pareto 前沿路径） */
export function hasSoftWindows(plan: Plan): boolean {
  return plan.stops.some((s) => s.windows.some((w) => w.hardness === 'soft'));
}
