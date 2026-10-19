/**
 * TSP-TW 精确 DP 的正确性对照测试：
 * 对随机小规模算例，用「全排列暴力枚举 + 时刻表引擎评估」得到最优值，
 * 与 DP 的结果比较（可行性与最优值必须一致）。
 */

import { describe, expect, it } from 'vitest';
import { solveTspTw } from '../src/solver/tspTw';
import { buildSchedule } from '../src/solver/schedule';
import { hasSoftWindows, resolveStopConstraints } from '../src/constraints';
import { makeMatrix, makePlan, makeRng, makeStop, makeWindow, permutations } from './fixtures';
import type { Matrix, Plan } from '../src/model/types';

/** 暴力最优：返回 { feasible, cost, order } */
function solveBrute(plan: Plan, matrix: Matrix) {
  const { evaluators } = resolveStopConstraints(plan);
  const n = plan.stops.length;
  let bestCost = Infinity;
  let bestOrder: number[] | null = null;
  for (const perm of permutations(n)) {
    const r = buildSchedule({ plan, matrix, order: perm, evaluators, solver: 'manual' });
    if (r.conflicts.length > 0) continue;
    const cost = r.stats.totalElapsedMin + r.schedule.reduce((s, e) => s + e.penaltyMin, 0);
    if (cost < bestCost) {
      bestCost = cost;
      bestOrder = perm;
    }
  }
  return { feasible: bestOrder !== null, cost: bestCost, order: bestOrder };
}

function evalCost(plan: Plan, matrix: Matrix, order: number[]): number {
  const { evaluators } = resolveStopConstraints(plan);
  const r = buildSchedule({ plan, matrix, order, evaluators, solver: 'manual' });
  return r.stats.totalElapsedMin + r.schedule.reduce((s, e) => s + e.penaltyMin, 0);
}

function randomCase(seed: number) {
  const rng = makeRng(seed);
  const n = 3 + Math.floor(rng() * 5); // 3..7

  const durations: number[][] = [];
  for (let i = 0; i <= n; i++) {
    const row: number[] = [];
    for (let j = 0; j <= n; j++) row.push(i === j ? 0 : 1 + Math.floor(rng() * 25));
    durations.push(row);
  }
  const matrix = makeMatrix(durations);

  const stops = Array.from({ length: n }, (_, i) => {
    const stop = makeStop({ id: `s${i}`, name: `S${i}`, dwellMin: 5 + Math.floor(rng() * 40) });
    if (rng() < 0.45) {
      const start = 480 + Math.floor(rng() * 180); // 08:00 - 11:00
      const len = 20 + Math.floor(rng() * 100);
      stop.windows = [
        makeWindow({
          startMin: start,
          endMin: start + len,
          hardness: rng() < 0.65 ? 'hard' : 'soft',
        }),
      ];
    }
    return stop;
  });

  const plan = makePlan({
    stops,
    departMin: 480,
    returnToStart: rng() < 0.4,
  });
  return { plan, matrix };
}

describe('solveTspTw（精确 DP vs 暴力枚举）', () => {
  it('随机算例 200 组：可行性与最优值一致', () => {
    let feasibleCount = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const { plan, matrix } = randomCase(seed);
      const brute = solveBrute(plan, matrix);
      const { evaluators } = resolveStopConstraints(plan);
      const dp = solveTspTw({
        plan,
        matrix,
        evaluators,
        hasSoft: hasSoftWindows(plan),
      });

      if (brute.feasible) {
        feasibleCount++;
        expect(dp.feasible, `seed=${seed} 应可行`).toBe(true);
        expect(dp.kind, `seed=${seed} 应走精确路径`).toBe('exact-dp');
        const dpCost = evalCost(plan, matrix, dp.order);
        expect(dpCost, `seed=${seed} 最优值不一致`).toBeCloseTo(brute.cost, 6);
      } else {
        // 无可行解：DP 应退回启发式（最少违规），且不会误报可行
        expect(dp.feasible, `seed=${seed} 不应可行`).toBe(false);
        expect(dp.order).toHaveLength(plan.stops.length);
      }
    }
    // 随机空间覆盖了相当比例的可行算例，保证上面的分支确实被测试到
    expect(feasibleCount).toBeGreaterThan(30);
  });

  it('无窗口即经典 TSP：DP 顺序代价等于暴力最优', () => {
    const { plan, matrix } = randomCase(42);
    for (const s of plan.stops) s.windows = [];
    const brute = solveBrute(plan, matrix);
    const { evaluators } = resolveStopConstraints(plan);
    const dp = solveTspTw({ plan, matrix, evaluators, hasSoft: false });
    expect(dp.kind).toBe('exact-dp');
    expect(evalCost(plan, matrix, dp.order)).toBeCloseTo(brute.cost, 6);
  });

  it('硬窗冲突算例：DP 不可行，启发式给出最少违规方案', () => {
    const plan = makePlan({
      stops: [
        makeStop({ id: 'a', name: 'A' }),
        makeStop({
          id: 'b',
          name: 'B',
          windows: [makeWindow({ startMin: 480, endMin: 482, hardness: 'hard' })],
        }),
      ],
    });
    // B 最早也要 08:20 才能到（起点至少走 20 分钟），窗口 08:00-08:02 必错过
    const matrix = makeMatrix([
      [0, 20, 20],
      [20, 0, 5],
      [20, 5, 0],
    ]);
    const { evaluators } = resolveStopConstraints(plan);
    const dp = solveTspTw({ plan, matrix, evaluators, hasSoft: false });
    expect(dp.feasible).toBe(false);
    expect(dp.kind).toBe('heuristic');
    expect(dp.order).toHaveLength(2);
  });

  it('超过精确上限（n=17）：自动切换启发式且不崩溃', () => {
    const n = 17;
    const durations = Array.from({ length: n + 1 }, (_, i) =>
      Array.from({ length: n + 1 }, (_, j) => (i === j ? 0 : 1 + ((i * 7 + j * 13) % 20))),
    );
    const plan = makePlan({
      stops: Array.from({ length: n }, (_, i) => makeStop({ id: `s${i}`, name: `S${i}` })),
    });
    const matrix = makeMatrix(durations);
    const { evaluators } = resolveStopConstraints(plan);
    const dp = solveTspTw({ plan, matrix, evaluators, hasSoft: false });
    expect(dp.kind).toBe('heuristic');
    expect(dp.order).toHaveLength(n);
    expect(new Set(dp.order).size).toBe(n);
  });

  it('软窗 Pareto：更晚出发但少罚分的方案会被正确选择', () => {
    // S1 窗口 08:00-08:10 软：先到 S1 会迟到 15 分钟（罚 45）；
    // 先去 S2 再到 S1 会迟到 20 分钟（罚 60）但总耗时更短 —— 直觉上要去 S1 先。
    // 这里构造相反情形：先去 S2（代价高时间）反而罚分归零且总代价更低。
    const plan = makePlan({
      stops: [
        makeStop({ id: 'a', name: 'A', dwellMin: 10 }),
        makeStop({
          id: 'b',
          name: 'B',
          dwellMin: 10,
          windows: [makeWindow({ startMin: 500, endMin: 505, hardness: 'soft', penaltyPerMin: 10 })],
        }),
      ],
    });
    // 0->A=5, 0->B=15, A->B=5, B->A=5
    const matrix = makeMatrix([
      [0, 5, 15],
      [5, 0, 5],
      [15, 5, 0],
    ]);
    // 顺序 A->B：A 到 485 离 495，B 到 500（正好进窗）→ 无罚分，收工 510，代价 30
    // 顺序 B->A：B 到 495（早到等 5，500 开始）离 510，A 到 515 离 525 → 收工 525，代价 45
    const { evaluators } = resolveStopConstraints(plan);
    const dp = solveTspTw({ plan, matrix, evaluators, hasSoft: true });
    expect(dp.order).toEqual([1, 2]);
    expect(dp.objectiveCost).toBeCloseTo(30, 6);
  });
});
