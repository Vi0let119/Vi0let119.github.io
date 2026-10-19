/**
 * 时刻表引擎 —— 「到达 / 离开时间戳」的唯一事实源。
 *
 * 手动模式（拖拽定序）与自动模式（DP/启发式求解出的顺序）都汇入本引擎，
 * 保证两条路径的结果结构、地图渲染、导出内容完全一致。
 *
 * 规则：
 *   arrive = 前一站 depart + travel
 *   wait   = 早到等待（窗口未开）
 *   start  = arrive + wait
 *   depart = start + dwell
 *   硬窗晚到 -> 冲突；软窗晚到 -> 罚分
 */

import type {
  Conflict,
  LegResult,
  Matrix,
  Plan,
  RouteResult,
  ScheduleEntry,
  ScheduleStats,
  SolverKind,
  TravelMode,
} from '../model/types';
import type { FastEvaluator } from '../constraints/types';
import { annotateConflicts } from './feasibility';

export interface BuildScheduleInput {
  plan: Plan;
  matrix: Matrix;
  /** 矩阵节点序号（1..n）的访问顺序 */
  order: number[];
  /** 按矩阵节点序号索引的约束评估器（0 = 起点占位） */
  evaluators: FastEvaluator[];
  solver: SolverKind;
}

export function buildSchedule(input: BuildScheduleInput): RouteResult {
  const { plan, matrix, order, evaluators, solver } = input;

  /** 智能混合模式下逐段取矩阵记录的出行方式；其他模式即计划模式 */
  const legModeFor = (from: number, to: number): TravelMode =>
    matrix.legModes?.[from]?.[to] ?? plan.mode;

  const schedule: ScheduleEntry[] = [];
  const legs: LegResult[] = [];
  const conflicts: Conflict[] = [];

  let t = plan.departMin;
  let prev = 0;
  let penaltySum = 0;
  let totalWaitMin = 0;

  for (const nodeIdx of order) {
    const stop = plan.stops[nodeIdx - 1];
    const durationMin = matrix.durationMin[prev][nodeIdx];
    const distanceM = matrix.distanceM[prev][nodeIdx];
    const arriveMin = t + durationMin;

    const verdict = evaluators[nodeIdx](arriveMin);
    const waitMin = verdict.waitUntilMin;
    const startMin = arriveMin + waitMin;
    const departMin = startMin + stop.dwellMin;
    penaltySum += verdict.penaltyMin;
    totalWaitMin += waitMin;

    schedule.push({
      stopId: stop.id,
      nodeIdx,
      name: stop.name,
      arriveMin,
      waitMin,
      startMin,
      departMin,
      penaltyMin: verdict.penaltyMin,
    });

    if (!verdict.feasible) {
      conflicts.push({
        stopId: stop.id,
        stopName: stop.name,
        lateMin: verdict.lateMin ?? 0,
        arriveMin,
        windowEndMin: verdict.windowEndMin ?? NaN,
        suggestion: '',
      });
    }

    legs.push({
      fromIdx: prev,
      toIdx: nodeIdx,
      mode: legModeFor(prev, nodeIdx),
      distanceM,
      durationMin,
      departMin: t,
      arriveMin,
    });

    t = departMin;
    prev = nodeIdx;
  }

  let returnLeg: LegResult | undefined;
  let finishMin = t;
  if (plan.returnToStart && order.length > 0) {
    const durationMin = matrix.durationMin[prev][0];
    const distanceM = matrix.distanceM[prev][0];
    returnLeg = {
      fromIdx: prev,
      toIdx: 0,
      mode: legModeFor(prev, 0),
      distanceM,
      durationMin,
      departMin: t,
      arriveMin: t + durationMin,
    };
    finishMin = t + durationMin;
  }

  const totalDistanceM =
    legs.reduce((s, l) => s + l.distanceM, 0) + (returnLeg ? returnLeg.distanceM : 0);
  const totalTravelMin =
    legs.reduce((s, l) => s + l.durationMin, 0) + (returnLeg ? returnLeg.durationMin : 0);

  const stats: ScheduleStats = {
    totalDistanceM,
    totalTravelMin,
    totalWaitMin,
    finishMin,
    totalElapsedMin: finishMin - plan.departMin,
  };

  return {
    planId: plan.id,
    mode: plan.mode,
    departMin: plan.departMin,
    returnToStart: plan.returnToStart,
    order: [...order],
    schedule,
    legs,
    returnLeg,
    stats,
    conflicts: annotateConflicts(conflicts, plan),
    solver,
    objectiveCost: stats.totalElapsedMin + penaltySum,
    generatedAt: Date.now(),
  };
}
