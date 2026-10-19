/**
 * 时刻表引擎单测：全部为手工计算的期望值（分钟粒度）。
 * 矩阵节点：0 = 起点，1 = A，2 = B，3 = C。
 */

import { describe, expect, it } from 'vitest';
import { buildSchedule } from '../src/solver/schedule';
import { resolveStopConstraints } from '../src/constraints';
import { visitIndexByStopId } from '../src/model/visitOrder';
import { makeMatrix, makePlan, makeStop, makeWindow } from './fixtures';
import type { Plan } from '../src/model/types';

/** 手工矩阵（分钟）：不对称，含 3->0 返程 */
const D = [
  [0, 10, 20, 30],
  [10, 0, 5, 25],
  [20, 5, 0, 10],
  [30, 25, 10, 0],
];

function run(plan: Plan, order: number[]) {
  const matrix = makeMatrix(D);
  const { evaluators } = resolveStopConstraints(plan);
  return buildSchedule({ plan, matrix, order, evaluators, solver: 'manual' });
}

function basePlan(overrides: Partial<Plan> = {}): Plan {
  return makePlan({
    stops: [
      makeStop({ id: 'a', name: 'A' }),
      makeStop({ id: 'b', name: 'B' }),
      makeStop({ id: 'c', name: 'C' }),
    ],
    ...overrides,
  });
}

describe('buildSchedule', () => {
  it('无窗口：到达/离开时间戳与统计正确', () => {
    const r = run(basePlan(), [1, 2, 3]);

    expect(r.schedule.map((s) => [s.arriveMin, s.waitMin, s.departMin])).toEqual([
      [490, 0, 520], // A 08:10 到 → 08:40 离
      [525, 0, 555], // B 08:45 到 → 09:15 离
      [565, 0, 595], // C 09:25 到 → 09:55 离
    ]);
    expect(r.conflicts).toHaveLength(0);
    expect(r.stats.totalTravelMin).toBe(25);
    expect(r.stats.totalWaitMin).toBe(0);
    expect(r.stats.finishMin).toBe(595);
    expect(r.stats.totalElapsedMin).toBe(115);
    expect(r.stats.totalDistanceM).toBe(25 * 80);
    expect(r.objectiveCost).toBe(115);
  });

  it('早到自动等待到窗口开始', () => {
    const plan = basePlan();
    plan.stops[1].windows = [makeWindow({ startMin: 550, endMin: 600, hardness: 'hard' })];
    const r = run(plan, [1, 2, 3]);

    const b = r.schedule[1];
    expect(b.arriveMin).toBe(525);
    expect(b.waitMin).toBe(25);
    expect(b.startMin).toBe(550);
    expect(b.departMin).toBe(580);
    expect(r.stats.totalWaitMin).toBe(25);
    expect(r.stats.finishMin).toBe(620);
    expect(r.conflicts).toHaveLength(0);
  });

  it('硬窗晚到 → 冲突（含迟到分钟与建议）', () => {
    const plan = basePlan();
    plan.stops[1].windows = [makeWindow({ startMin: 480, endMin: 520, hardness: 'hard' })];
    const r = run(plan, [1, 2, 3]);

    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0].stopId).toBe('b');
    expect(r.conflicts[0].lateMin).toBe(5);
    expect(r.conflicts[0].suggestion).toContain('提前');
    expect(r.schedule[1].waitMin).toBe(0); // 迟到不等待
  });

  it('软窗晚到 → 罚分且不产生冲突', () => {
    const plan = basePlan();
    plan.stops[1].windows = [
      makeWindow({ startMin: 480, endMin: 520, hardness: 'soft', penaltyPerMin: 3 }),
    ];
    const r = run(plan, [1, 2, 3]);

    expect(r.conflicts).toHaveLength(0);
    const b = r.schedule[1];
    expect(b.arriveMin).toBe(525);
    expect(b.penaltyMin).toBe(15); // 迟到 5 分钟 × 3
    expect(r.objectiveCost).toBe(115 + 15);
  });

  it('回到起点：追加返程段并计入统计', () => {
    const r = run(basePlan({ returnToStart: true }), [1, 2, 3]);

    expect(r.returnLeg).toBeDefined();
    expect(r.returnLeg!.fromIdx).toBe(3);
    expect(r.returnLeg!.toIdx).toBe(0);
    expect(r.returnLeg!.arriveMin).toBe(625);
    expect(r.stats.finishMin).toBe(625);
    expect(r.stats.totalTravelMin).toBe(25 + 30);
  });

  it('空顺序：无腿无时刻表，立即收工', () => {
    const r = run(basePlan(), []);
    expect(r.legs).toHaveLength(0);
    expect(r.schedule).toHaveLength(0);
    expect(r.stats.finishMin).toBe(480);
  });

  it('智能混合：逐段使用矩阵记录的出行方式（含返程段）', () => {
    const plan = basePlan({ returnToStart: true });
    const matrix = makeMatrix(D);
    matrix.legModes = [
      ['walking', 'walking', 'transit', 'walking'],
      ['walking', 'walking', 'transit', 'walking'],
      ['transit', 'walking', 'walking', 'walking'],
      ['transit', 'walking', 'walking', 'walking'],
    ];
    const { evaluators } = resolveStopConstraints(plan);
    const r = buildSchedule({ plan, matrix, order: [1, 2, 3], evaluators, solver: 'manual' });

    // 0→1 walking、1→2 transit、2→3 walking、3→0（返程）transit
    expect(r.legs.map((l) => l.mode)).toEqual(['walking', 'transit', 'walking']);
    expect(r.returnLeg?.mode).toBe('transit');
  });

  it('visitIndexByStopId：按访问顺序编号（返程段不影响编号）', () => {
    const r = run(basePlan({ returnToStart: true }), [3, 1, 2]);
    const m = visitIndexByStopId(r)!;
    expect(m.get('c')).toBe(1); // 节点 3 先访问
    expect(m.get('a')).toBe(2);
    expect(m.get('b')).toBe(3);
    expect(visitIndexByStopId(null)).toBeNull();
  });
});
