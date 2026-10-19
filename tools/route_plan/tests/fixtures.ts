/** 测试夹具：构造小规模计划 / 矩阵 / 窗口 */

import type { Matrix, Plan, Stop, TimeWindow, TravelMode } from '../src/model/types';

export function makeMatrix(durations: number[][], distances?: number[][]): Matrix {
  return {
    mode: 'walking' as TravelMode,
    generatedAt: 0,
    durationMin: durations,
    distanceM: distances ?? durations.map((row) => row.map((v) => Math.round(v * 80))),
    source: 'amap',
    estimatedPairCount: 0,
  };
}

export function makeStop(partial: Partial<Stop> & { id: string; name: string }): Stop {
  return {
    lng: 121.49,
    lat: 31.24,
    dwellMin: 30,
    windows: [],
    priority: 'must',
    ...partial,
  };
}

export function makePlan(overrides: Partial<Plan> & { stops: Stop[] }): Plan {
  return {
    id: 'p-test',
    name: '测试计划',
    date: '2026-10-18',
    mode: 'walking',
    departMin: 480, // 08:00
    start: { name: '起点', lng: 121.48, lat: 31.23 },
    returnToStart: false,
    ...overrides,
  };
}

export function makeWindow(partial: Partial<TimeWindow>): TimeWindow {
  return {
    id: `w-${Math.random().toString(36).slice(2, 8)}`,
    kind: 'absolute',
    startMin: 0,
    endMin: 0,
    hardness: 'hard',
    penaltyPerMin: 3,
    ...partial,
  };
}

/** 确定性 RNG（mulberry32），保证随机测试可复现 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function permutations(n: number): number[][] {
  const out: number[][] = [];
  const cur: number[] = [];
  const used = new Array(n).fill(false);
  const rec = () => {
    if (cur.length === n) {
      out.push([...cur]);
      return;
    }
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      used[i] = true;
      cur.push(i + 1);
      rec();
      cur.pop();
      used[i] = false;
    }
  };
  rec();
  return out;
}
