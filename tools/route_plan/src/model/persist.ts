/** 计划存档（JSON 导出/导入）与 localStorage 自动保存 */

import type { Plan, PlanArchive, RouteResult } from '../model/types';
import { DEFAULT_START, LEGACY_DEFAULT_START } from './defaults';

const STATE_KEY = 'ssp.state.v1';

/**
 * 旧默认起点迁移：起点名称与坐标都还是历史默认（人民广场）时，替换为新默认（华师大）。
 * 用户改过名称或坐标（哪怕只改其一）则不动。
 */
function migratePlan(plan: Plan): Plan {
  const s = plan.start;
  if (!s) return plan;
  const legacyCoords =
    Math.abs(s.lng - LEGACY_DEFAULT_START.lng) < 0.001 && Math.abs(s.lat - LEGACY_DEFAULT_START.lat) < 0.001;
  if (legacyCoords && s.name === LEGACY_DEFAULT_START.name) {
    return { ...plan, start: { ...DEFAULT_START } };
  }
  return plan;
}

export function buildArchive(plan: Plan, result: RouteResult | null): string {
  const archive: PlanArchive = { version: 1, plan, ...(result ? { result } : {}) };
  return JSON.stringify(archive, null, 2);
}

export function parseArchive(text: string): PlanArchive {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error('JSON 解析失败');
  }
  const a = obj as Partial<PlanArchive>;
  if (!a || a.version !== 1 || !a.plan) throw new Error('存档格式不正确（缺少 version/plan）');
  const plan = a.plan as Plan;
  if (!Array.isArray(plan.stops) || typeof plan.departMin !== 'number' || !plan.start) {
    throw new Error('存档中的计划数据不完整');
  }
  return { version: 1, plan, result: a.result };
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleSaveState(plan: Plan, result: RouteResult | null): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      localStorage.setItem(STATE_KEY, buildArchive(plan, result));
    } catch {
      // 超配额时静默放弃（工程数据可用 JSON 导出备份）
    }
  }, 500);
}

export function loadState(): { plan: Plan; result: RouteResult | null } | null {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const a = parseArchive(raw);
    return { plan: migratePlan(a.plan), result: a.result ?? null };
  } catch {
    return null;
  }
}
