/**
 * 启发式求解：最近邻（硬窗/紧迫度感知）+ Or-opt / 2-opt 局部搜索。
 * 两个用途：
 *  1. n > maxExactN 时的兜底求解；
 *  2. 精确 DP 判定无解时的「最少违规」方案（避免用户面对空白结果）。
 * 目标代价 = (收工时刻 - 出发时刻) + 软窗罚分 + 硬窗迟到 × BIG_M（最少违规）。
 */

import type { TspTwInput, TspTwSolution } from './tspTw';

const BIG_M = 1e6;
const MAX_IMPROVE_PASSES = 40;

interface OrderEval {
  feasible: boolean;
  cost: number;
  hardLateMin: number;
  penaltyMin: number;
  finishMin: number;
}

export function solveHeuristic(input: TspTwInput): TspTwSolution {
  const { plan, matrix, evaluators } = input;
  const departMin = plan.departMin;
  const returnToStart = plan.returnToStart;
  const n = plan.stops.length;

  if (n === 0) {
    return { kind: 'heuristic', feasible: true, order: [], objectiveCost: 0 };
  }

  const evaluate = (order: number[]): OrderEval => {
    let t = departMin;
    let prev = 0;
    let hardLateMin = 0;
    let penaltyMin = 0;
    for (const node of order) {
      const arriveMin = t + matrix.durationMin[prev][node];
      const v = evaluators[node](arriveMin);
      if (!v.feasible) hardLateMin += v.lateMin ?? 0;
      penaltyMin += v.penaltyMin;
      t = arriveMin + v.waitUntilMin + plan.stops[node - 1].dwellMin;
      prev = node;
    }
    let finishMin = t;
    if (returnToStart) finishMin += matrix.durationMin[prev][0];
    return {
      feasible: hardLateMin === 0,
      cost: finishMin - departMin + penaltyMin + hardLateMin * BIG_M,
      hardLateMin,
      penaltyMin,
      finishMin,
    };
  };

  // —— 最近邻构造：优先避免硬窗迟到 > 软窗罚分 > 少走路 ——
  const remaining = new Set<number>();
  for (let i = 1; i <= n; i++) remaining.add(i);
  const order: number[] = [];
  {
    let t = departMin;
    let prev = 0;
    while (remaining.size > 0) {
      let bestNode = -1;
      let bestKey = Infinity;
      for (const node of remaining) {
        const arriveMin = t + matrix.durationMin[prev][node];
        const v = evaluators[node](arriveMin);
        const key =
          (v.feasible ? 0 : BIG_M / 100 + (v.lateMin ?? 0) * 100) +
          v.penaltyMin * 10 +
          matrix.durationMin[prev][node];
        if (key < bestKey) {
          bestKey = key;
          bestNode = node;
        }
      }
      order.push(bestNode);
      remaining.delete(bestNode);
      const arriveMin = t + matrix.durationMin[prev][bestNode];
      const v = evaluators[bestNode](arriveMin);
      t = arriveMin + v.waitUntilMin + plan.stops[bestNode - 1].dwellMin;
      prev = bestNode;
    }
  }

  // —— 局部搜索：Or-opt（单点搬迁）+ 2-opt（区间反转） ——
  let best = order;
  let bestEval = evaluate(best);
  for (let pass = 0; pass < MAX_IMPROVE_PASSES; pass++) {
    let improved = false;

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const cand = moveElement(best, i, j);
        const ev = evaluate(cand);
        if (ev.cost < bestEval.cost - 1e-9) {
          best = cand;
          bestEval = ev;
          improved = true;
        }
      }
    }

    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const cand = reverseSegment(best, i, j);
        const ev = evaluate(cand);
        if (ev.cost < bestEval.cost - 1e-9) {
          best = cand;
          bestEval = ev;
          improved = true;
        }
      }
    }

    if (!improved) break;
  }

  return {
    kind: 'heuristic',
    feasible: bestEval.feasible,
    order: best,
    objectiveCost: bestEval.cost,
  };
}

function moveElement(arr: number[], from: number, to: number): number[] {
  const out = arr.slice();
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x);
  return out;
}

function reverseSegment(arr: number[], i: number, j: number): number[] {
  const out = arr.slice();
  let a = i;
  let b = j;
  while (a < b) {
    [out[a], out[b]] = [out[b], out[a]];
    a++;
    b--;
  }
  return out;
}
