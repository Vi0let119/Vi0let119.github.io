/**
 * TSP-TW 精确求解（Held-Karp 变体，n ≤ maxExactN 时精确）。
 *
 * 状态：dp[mask][i] = 已访问点位集合 mask、最后离开点位 i 时的「最早完成时刻」。
 * 转移：t' = t + travel(i, j)；硬窗检查（evalArrive 不可行）直接剪枝；
 *       完成时刻 = max(到达, 窗口开始等待) + 停留时长。
 *
 * 支配性（精确性的依据）：早到允许等待 ⇒ 更早到达永不吃亏——到达越早，
 * 后续可行性越宽松、完成时刻越早（均为单调），故每状态保留最早完成时刻即最优。
 *
 * 软窗：软窗罚分随到达时刻单调不减，支配需 (完成时刻, 罚分) 双指标 →
 * 每状态维护 Pareto 前沿（时刻升序、罚分严格递减去支配）。软窗较少时前沿长度为 1，
 * 性能与单值版一致；纯硬窗/无窗场景走 Float64Array 快路径，零额外开销。
 *
 * 无解（硬窗剪枝全域不可行）→ 退回启发式「最少违规」方案（见 heuristics.ts）。
 */

import type { Matrix, Plan } from '../model/types';
import type { FastEvaluator } from '../constraints/types';
import { solveHeuristic } from './heuristics';

export interface TspTwInput {
  plan: Plan;
  matrix: Matrix;
  /** 按矩阵节点序号索引的约束评估器（0 = 起点占位） */
  evaluators: FastEvaluator[];
  /** 计划中是否存在软窗（由调用方基于已解析约束计算） */
  hasSoft: boolean;
  /** 精确 DP 的点位上限，默认 16；超过自动切启发式 */
  maxExactN?: number;
}

export interface TspTwSolution {
  kind: 'exact-dp' | 'heuristic';
  feasible: boolean;
  /** 矩阵节点序号（1..n）的访问顺序 */
  order: number[];
  /** 目标代价 = (收工时刻 - 出发时刻) + 软窗罚分（分钟等效） */
  objectiveCost: number;
}

export function solveTspTw(input: TspTwInput): TspTwSolution {
  const n = input.plan.stops.length;

  if (n === 0) {
    return { kind: 'exact-dp', feasible: true, order: [], objectiveCost: 0 };
  }

  const maxExact = input.maxExactN ?? 16;
  if (n <= maxExact) {
    const exact = input.hasSoft ? solveExactPareto(input, n) : solveExactFast(input, n);
    if (exact) {
      return { kind: 'exact-dp', feasible: true, order: exact.order, objectiveCost: exact.cost };
    }
  }

  return solveHeuristic(input);
}

// ---------------------------------------------------------------------------
// 快路径：纯硬窗 / 无窗（单值支配，TypedArray 实现）
// ---------------------------------------------------------------------------

function solveExactFast(
  input: TspTwInput,
  n: number,
): { order: number[]; cost: number } | null {
  const { plan, matrix, evaluators } = input;
  const dur = matrix.durationMin;
  const states = 1 << n;

  const dp = new Float64Array(states * n).fill(Infinity);
  /** 前驱点位索引；-2 = 起点 */
  const parent = new Int8Array(states * n).fill(-1);

  for (let i = 0; i < n; i++) {
    const node = i + 1;
    const arriveMin = plan.departMin + dur[0][node];
    const v = evaluators[node](arriveMin);
    if (!v.feasible) continue;
    const leave = arriveMin + v.waitUntilMin + plan.stops[i].dwellMin;
    const idx = (1 << i) * n + i;
    dp[idx] = leave;
    parent[idx] = -2;
  }

  for (let mask = 1; mask < states; mask++) {
    let m = mask;
    while (m !== 0) {
      const bit = m & -m;
      const last = 31 - Math.clz32(bit);
      m ^= bit;

      const t = dp[mask * n + last];
      if (t === Infinity) continue;

      let rest = (~mask) & (states - 1);
      while (rest !== 0) {
        const nbit = rest & -rest;
        const next = 31 - Math.clz32(nbit);
        rest ^= nbit;

        const arriveMin = t + dur[last + 1][next + 1];
        const v = evaluators[next + 1](arriveMin);
        if (!v.feasible) continue;

        const leave = arriveMin + v.waitUntilMin + plan.stops[next].dwellMin;
        const nidx = (mask | nbit) * n + next;
        if (leave < dp[nidx]) {
          dp[nidx] = leave;
          parent[nidx] = last;
        }
      }
    }
  }

  const full = states - 1;
  let bestLast = -1;
  let bestFinish = Infinity;
  for (let last = 0; last < n; last++) {
    const t = dp[full * n + last];
    if (t === Infinity) continue;
    const finish = plan.returnToStart ? t + dur[last + 1][0] : t;
    if (finish < bestFinish) {
      bestFinish = finish;
      bestLast = last;
    }
  }
  if (bestLast === -1) return null;

  const order: number[] = [];
  let mask = full;
  let last: number = bestLast;
  while (last !== -2) {
    order.push(last + 1);
    const p: number = parent[mask * n + last];
    mask ^= 1 << last;
    last = p;
  }
  order.reverse();

  return { order, cost: bestFinish - plan.departMin };
}

// ---------------------------------------------------------------------------
// Pareto 路径：存在软窗（保留 (完成时刻, 罚分) 双双不被支配的候选）
// ---------------------------------------------------------------------------

interface Entry {
  /** 离开该点的完成时刻 */
  t: number;
  /** 累计软窗罚分 */
  p: number;
  /** 前驱点位索引；-2 = 起点 */
  pj: number;
  /** 前驱槽位内 entry 下标 */
  pk: number;
}

function solveExactPareto(
  input: TspTwInput,
  n: number,
): { order: number[]; cost: number } | null {
  const { plan, matrix, evaluators } = input;
  const dur = matrix.durationMin;
  const states = 1 << n;

  const dp: (Entry[] | null)[] = new Array(states * n).fill(null);

  const insert = (slot: number, e: Entry): void => {
    const list = dp[slot];
    if (!list) {
      dp[slot] = [e];
      return;
    }
    for (const f of list) {
      if (f.t <= e.t && f.p <= e.p) return; // 被支配
    }
    const kept: Entry[] = [];
    for (const f of list) {
      if (!(e.t <= f.t && e.p <= f.p)) kept.push(f);
    }
    kept.push(e);
    dp[slot] = kept;
  };

  for (let i = 0; i < n; i++) {
    const node = i + 1;
    const arriveMin = plan.departMin + dur[0][node];
    const v = evaluators[node](arriveMin);
    if (!v.feasible) continue;
    const leave = arriveMin + v.waitUntilMin + plan.stops[i].dwellMin;
    insert((1 << i) * n + i, { t: leave, p: v.penaltyMin, pj: -2, pk: 0 });
  }

  for (let mask = 1; mask < states; mask++) {
    let m = mask;
    while (m !== 0) {
      const bit = m & -m;
      const last = 31 - Math.clz32(bit);
      m ^= bit;

      const list = dp[mask * n + last];
      if (!list) continue;

      let rest = (~mask) & (states - 1);
      while (rest !== 0) {
        const nbit = rest & -rest;
        const next = 31 - Math.clz32(nbit);
        rest ^= nbit;

        const d = dur[last + 1][next + 1];
        for (let k = 0; k < list.length; k++) {
          const f = list[k];
          const arriveMin = f.t + d;
          const v = evaluators[next + 1](arriveMin);
          if (!v.feasible) continue;
          const leave = arriveMin + v.waitUntilMin + plan.stops[next].dwellMin;
          insert((mask | nbit) * n + next, { t: leave, p: f.p + v.penaltyMin, pj: last, pk: k });
        }
      }
    }
  }

  const full = states - 1;
  let bestCost = Infinity;
  let bestSlot = -1;
  let bestK = -1;
  let bestLast = -1;
  for (let last = 0; last < n; last++) {
    const list = dp[full * n + last];
    if (!list) continue;
    const extra = plan.returnToStart ? dur[last + 1][0] : 0;
    for (let k = 0; k < list.length; k++) {
      const e = list[k];
      const cost = e.t + extra - plan.departMin + e.p;
      if (cost < bestCost) {
        bestCost = cost;
        bestSlot = full * n + last;
        bestK = k;
        bestLast = last;
      }
    }
  }
  if (bestSlot === -1) return null;

  const order: number[] = [];
  let slot = bestSlot;
  let k = bestK;
  let last = bestLast;
  for (;;) {
    order.push(last + 1);
    const e = dp[slot]![k];
    if (e.pj === -2) break;
    const mask = Math.floor(slot / n);
    slot = (mask ^ (1 << last)) * n + e.pj;
    k = e.pk;
    last = e.pj;
  }
  order.reverse();

  return { order, cost: bestCost };
}
