/**
 * 规划编排：矩阵 → 求解（或手动顺序）→ 时刻表 →（公交）实际时刻复核。
 * UI 与求解核心之间的唯一胶水层。
 */

import type { LegResult, Matrix, Plan, RouteResult, SolverKind } from '../model/types';
import { getMatrix, getLegRoute, getLegTimes } from './amapTravel';
import { hasSoftWindows, resolveStopConstraints } from '../constraints';
import { solveTspTw } from '../solver/tspTw';
import { buildSchedule } from '../solver/schedule';
import { mapLimit } from '../utils/concurrency';

export interface RunOutcome {
  result: RouteResult;
  warnings: string[];
  matrixSource: Matrix['source'];
}

export async function runPlan(
  plan: Plan,
  kind: 'manual' | 'auto',
  onProgress?: (done: number, total: number) => void,
): Promise<RunOutcome> {
  const points = [
    { lng: plan.start.lng, lat: plan.start.lat },
    ...plan.stops.map((s) => ({ lng: s.lng, lat: s.lat })),
  ];

  const matrix = await getMatrix(
    points,
    plan.mode,
    { refDepartMin: plan.departMin, dateStr: plan.date },
    onProgress,
  );

  const resolved = resolveStopConstraints(plan);

  let order: number[];
  let solver: SolverKind;
  let infeasible = false;
  if (kind === 'manual') {
    order = plan.stops.map((_, i) => i + 1);
    solver = 'manual';
  } else {
    const sol = solveTspTw({
      plan,
      matrix,
      evaluators: resolved.evaluators,
      hasSoft: hasSoftWindows(plan),
    });
    order = sol.order;
    solver = sol.kind;
    infeasible = !sol.feasible;
  }

  let result = buildSchedule({ plan, matrix, order, evaluators: resolved.evaluators, solver });
  let finalMatrix = matrix;

  // 公交/地铁耗时随出发时刻变化：排完序后按每段实际出发时刻复核一轮（方案 §4.5）
  // 混合模式下仅复核被选为「公交地铁」的段
  if ((plan.mode === 'transit' || plan.mode === 'mixed') && order.length >= 1) {
    const refined = await refineTransitLegs(plan, matrix, result);
    finalMatrix = refined.matrix;
    result = refined.result;
  }

  // 拉取公交段的换乘明细（步行多远到哪个站 → 坐几站到哪 → …），供时间轴与导出展示；
  // 明细同时进入几何缓存，地图渲染时零额外接口调用
  await attachTransitLegDetails(plan, result);

  const warnings = [...resolved.warnings];
  if (infeasible) {
    warnings.push('未找到满足全部硬窗的访问顺序，已给出「最少违规」建议方案（冲突点见列表）');
  }
  if (finalMatrix.source === 'mixed') {
    warnings.push(`有 ${finalMatrix.estimatedPairCount} 对路段使用估算耗时（接口失败或超配额），仅供参考`);
  } else if (finalMatrix.source === 'estimate') {
    warnings.push('所有路段均为估算耗时（接口不可用），仅供参考');
  }
  const hasTransitLegs =
    result.legs.some((l) => l.mode === 'transit') || result.returnLeg?.mode === 'transit';
  if (hasTransitLegs) {
    warnings.push('公交/地铁耗时为参考时刻的近似值，出发前请以实时查询为准');
  }

  return { result, warnings, matrixSource: finalMatrix.source };
}

const TRANSIT_RECHECK_THRESHOLD_MIN = 2;

/**
 * 为公交段附加换乘分段明细（含「步行N米到达XX站」「乘坐X号线 途径N站到达XX」等指引）。
 * 复用 getLegRoute（几何缓存），失败时静默跳过，不影响主结果。
 */
async function attachTransitLegDetails(plan: Plan, result: RouteResult): Promise<void> {
  const points = [plan.start, ...plan.stops];
  const transitLegs: Array<{ leg: LegResult; fromIdx: number; toIdx: number; departMin: number }> = [];
  result.legs.forEach((leg) => {
    if (leg.mode === 'transit') {
      transitLegs.push({ leg, fromIdx: leg.fromIdx, toIdx: leg.toIdx, departMin: leg.departMin });
    }
  });
  if (result.returnLeg && result.returnLeg.mode === 'transit') {
    transitLegs.push({
      leg: result.returnLeg,
      fromIdx: result.returnLeg.fromIdx,
      toIdx: result.returnLeg.toIdx,
      departMin: result.returnLeg.departMin,
    });
  }
  if (transitLegs.length === 0) return;

  await mapLimit(transitLegs, 1, async ({ leg, fromIdx, toIdx, departMin }) => {
    const a = points[fromIdx];
    const b = points[toIdx];
    if (!a || !b) return;
    const route = await getLegRoute(
      { lng: a.lng, lat: a.lat },
      { lng: b.lng, lat: b.lat },
      'transit',
      { refDepartMin: Math.round(departMin), dateStr: plan.date },
    );
    if (!route.estimated && route.transitSegments && route.transitSegments.length > 0) {
      leg.transitSegments = route.transitSegments;
    }
    await new Promise((resolve) => setTimeout(resolve, 320)); // 与公交矩阵同款的 QPS 间隔
  });
}

async function refineTransitLegs(
  plan: Plan,
  matrix: Matrix,
  result: RouteResult,
): Promise<{ matrix: Matrix; result: RouteResult }> {
  const points = [plan.start, ...plan.stops];
  const dur = matrix.durationMin.map((r) => [...r]);
  const dist = matrix.distanceM.map((r) => [...r]);

  const legs = [
    ...result.legs.map((l, i) => ({
      fromIdx: l.fromIdx,
      toIdx: l.toIdx,
      departMin: l.departMin,
      legIndex: i,
      mode: l.mode,
    })),
    ...(result.returnLeg
      ? [
          {
            fromIdx: result.returnLeg.fromIdx,
            toIdx: result.returnLeg.toIdx,
            departMin: result.returnLeg.departMin,
            legIndex: -1,
            mode: result.returnLeg.mode,
          },
        ]
      : []),
  ].filter((l) => l.mode === 'transit');

  if (legs.length === 0) return { matrix, result };

  let changed = false;
  let estimatedLegs = 0;
  const estimatedByLeg = new Map<number, boolean>();

  // 公交复核同样受 QPS 限制：串行 + 间隔
  await mapLimit(legs, 1, async (leg) => {
    const a = points[leg.fromIdx];
    const b = points[leg.toIdx];
    const t = await getLegTimes(
      { lng: a.lng, lat: a.lat },
      { lng: b.lng, lat: b.lat },
      'transit',
      { refDepartMin: Math.round(leg.departMin), dateStr: plan.date },
    );
    if (Math.abs(t.durationMin - dur[leg.fromIdx][leg.toIdx]) > TRANSIT_RECHECK_THRESHOLD_MIN) {
      dur[leg.fromIdx][leg.toIdx] = t.durationMin;
      dist[leg.fromIdx][leg.toIdx] = t.distanceM;
      changed = true;
    }
    if (t.source === 'estimate') {
      estimatedLegs++;
      if (leg.legIndex >= 0) estimatedByLeg.set(leg.legIndex, true);
    }
    await new Promise((resolve) => setTimeout(resolve, 320));
  });

  if (!changed && estimatedLegs === 0) return { matrix, result };

  const refinedMatrix: Matrix = {
    ...matrix,
    durationMin: dur,
    distanceM: dist,
    source:
      estimatedLegs === 0 ? 'amap' : estimatedLegs === legs.length ? 'estimate' : 'mixed',
    estimatedPairCount: Math.max(matrix.estimatedPairCount, estimatedLegs),
  };

  const resolved = resolveStopConstraints(plan);
  const rebuilt = buildSchedule({
    plan,
    matrix: refinedMatrix,
    order: result.order,
    evaluators: resolved.evaluators,
    solver: result.solver,
  });
  rebuilt.legs.forEach((l, i) => {
    if (estimatedByLeg.get(i)) l.estimated = true;
  });
  if (rebuilt.returnLeg && estimatedByLeg.size > 0) rebuilt.returnLeg.estimated = true;

  return { matrix: refinedMatrix, result: rebuilt };
}
