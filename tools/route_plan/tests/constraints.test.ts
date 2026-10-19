/** 约束框架单测：evalArrive 语义、日照时刻、日落相对窗解析 */

import { describe, expect, it } from 'vitest';
import { evalArrive } from '../src/constraints/timeWindow';
import { resolveStopConstraints } from '../src/constraints';
import { getSunTimes, describeSunTimes } from '../src/constraints/sunTimes';
import { makePlan, makeStop, makeWindow } from './fixtures';
import type { AbsWindow } from '../src/constraints/types';

const HARD: AbsWindow = { startMin: 540, endMin: 600, hardness: 'hard', penaltyPerMin: 3 };
const SOFT: AbsWindow = { startMin: 540, endMin: 600, hardness: 'soft', penaltyPerMin: 3 };

describe('evalArrive', () => {
  it('无窗口：恒可行、无等待无罚分', () => {
    const v = evalArrive([], 0);
    expect(v).toMatchObject({ feasible: true, waitUntilMin: 0, penaltyMin: 0 });
  });

  it('早到：等待到窗口开始', () => {
    const v = evalArrive([HARD], 500);
    expect(v.feasible).toBe(true);
    expect(v.waitUntilMin).toBe(40);
  });

  it('窗口内：无等待', () => {
    const v = evalArrive([HARD], 560);
    expect(v).toMatchObject({ feasible: true, waitUntilMin: 0, penaltyMin: 0 });
  });

  it('踩线（arrive = end）：可行', () => {
    const v = evalArrive([HARD], 600);
    expect(v.feasible).toBe(true);
    expect(v.penaltyMin).toBe(0);
  });

  it('硬窗晚到：不可行并报告迟到', () => {
    const v = evalArrive([HARD], 615);
    expect(v.feasible).toBe(false);
    expect(v.lateMin).toBe(15);
    expect(v.windowEndMin).toBe(600);
  });

  it('软窗晚到：可行但计罚分', () => {
    const v = evalArrive([SOFT], 610);
    expect(v.feasible).toBe(true);
    expect(v.penaltyMin).toBe(30);
    expect(v.lateMin).toBe(10);
  });

  it('多窗口：迟到时对「截止最晚」的窗口计迟到', () => {
    const w2: AbsWindow = { startMin: 660, endMin: 720, hardness: 'hard', penaltyPerMin: 3 };
    const v = evalArrive([HARD, w2], 700);
    expect(v.feasible).toBe(true); // 命中第二个窗口
    expect(v.waitUntilMin).toBe(0);

    const v2 = evalArrive([HARD, w2], 730);
    expect(v2.feasible).toBe(false);
    expect(v2.lateMin).toBe(10); // 相对 720 而非 600
  });

  it('多窗口：落在两窗之间时等待下一个窗口', () => {
    const w2: AbsWindow = { startMin: 660, endMin: 720, hardness: 'hard', penaltyPerMin: 3 };
    const v = evalArrive([HARD, w2], 630);
    expect(v.feasible).toBe(true);
    expect(v.waitUntilMin).toBe(30); // 等到 660
  });
});

describe('sunTimes', () => {
  it('上海 2026-10-18 的日落落在合理区间', () => {
    const t = getSunTimes(31.23, 121.47, '2026-10-18');
    expect(t).not.toBeNull();
    expect(t!.sunsetMin).toBeGreaterThan(16 * 60 + 30);
    expect(t!.sunsetMin).toBeLessThan(18 * 60);
    expect(t!.duskMin).toBeGreaterThan(t!.sunsetMin); // 蓝调：日落后到暮光结束
    expect(t!.goldenEveningStartMin).toBeLessThan(t!.sunsetMin);
    expect(describeSunTimes(t!)).toContain('日落');
  });
});

describe('resolveStopConstraints（日落相对窗）', () => {
  it('日落 ±30 分钟解析为绝对窗口', () => {
    const sun = getSunTimes(31.23, 121.47, '2026-10-18')!;
    const plan = makePlan({
      stops: [
        makeStop({
          id: 'x',
          name: '江边机位',
          lat: 31.23,
          lng: 121.47,
          windows: [
            makeWindow({
              kind: 'sunset-relative',
              offsetStartMin: -30,
              offsetEndMin: 30,
              hardness: 'hard',
            }),
          ],
        }),
      ],
    });

    const { byNode } = resolveStopConstraints(plan);
    const w = byNode[1]!.windows;
    expect(w).toHaveLength(1);
    expect(w[0].startMin).toBe(sun.sunsetMin - 30);
    expect(w[0].endMin).toBe(sun.sunsetMin + 30);
  });
});
