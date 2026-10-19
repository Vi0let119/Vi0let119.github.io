/**
 * 全局状态（zustand）：计划编辑、规划执行、进度与错误。
 * 任何编辑都会把结果标记为 stale（待重算）——矩阵缓存命中时重算近乎零成本。
 */

import { create } from 'zustand';
import type { Matrix, Plan, RouteResult, Stop, TimeWindow, TravelMode } from './types';
import { DEFAULT_START } from './defaults';
import { todayStr } from '../utils/time';
import { runPlan } from '../services/planRunner';
import { hasAmapKey } from '../services/amapLoader';
import { loadState, scheduleSaveState } from './persist';

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createStop(partial: Partial<Stop> & { name: string; lng: number; lat: number }): Stop {
  return {
    id: newId(),
    dwellMin: 20,
    windows: [],
    priority: 'must',
    ...partial,
  };
}

export function createDefaultPlan(): Plan {
  return {
    id: newId(),
    name: '我的扫街计划',
    date: todayStr(),
    mode: 'mixed',
    departMin: 8 * 60,
    start: { ...DEFAULT_START },
    returnToStart: false,
    stops: [],
  };
}

export type PickTarget = 'stop' | 'start' | null;

interface AppState {
  plan: Plan;
  result: RouteResult | null;
  stale: boolean;
  running: boolean;
  progress: { done: number; total: number } | null;
  error: string | null;
  warnings: string[];
  matrixSource: Matrix['source'] | null;
  pickTarget: PickTarget;
  selectedStopId: string | null;
  /** 时间轴点击路段后聚焦的路线序号（null = 未聚焦） */
  focusedLegIndex: number | null;

  setName(name: string): void;
  setDate(date: string): void;
  setMode(mode: TravelMode): void;
  setDepartMin(departMin: number): void;
  setReturnToStart(v: boolean): void;
  setStart(start: Plan['start']): void;

  addStop(stop: Stop): void;
  updateStop(id: string, patch: Partial<Stop>): void;
  setStopWindow(id: string, window: TimeWindow | null): void;
  removeStop(id: string): void;
  reorderStops(from: number, to: number): void;

  selectStop(id: string | null): void;
  setPickTarget(target: PickTarget): void;
  /** 聚焦/取消聚焦某段路线（重复点击同一段 = 取消） */
  focusLeg(index: number | null): void;

  run(kind: 'manual' | 'auto'): Promise<void>;
  replaceAll(plan: Plan, result: RouteResult | null): void;
  dismissError(): void;
}

const restored = loadState();

function markStale(plan: Plan, result: RouteResult | null, stale: boolean) {
  return { plan, result, stale: result ? stale : false };
}

export const useAppStore = create<AppState>()((set, get) => ({
  plan: restored?.plan ?? createDefaultPlan(),
  result: restored?.result ?? null,
  stale: false,
  running: false,
  progress: null,
  error: null,
  warnings: [],
  matrixSource: null,
  pickTarget: null,
  selectedStopId: null,
  focusedLegIndex: null,

  setName(name) {
    const { plan, result } = get();
    set(markStale({ ...plan, name }, result, true));
  },
  setDate(date) {
    const { plan, result } = get();
    set(markStale({ ...plan, date }, result, true));
  },
  setMode(mode) {
    const { plan, result } = get();
    set(markStale({ ...plan, mode }, result, true));
  },
  setDepartMin(departMin) {
    const { plan, result } = get();
    set(markStale({ ...plan, departMin }, result, true));
  },
  setReturnToStart(v) {
    const { plan, result } = get();
    set(markStale({ ...plan, returnToStart: v }, result, true));
  },
  setStart(start) {
    const { plan, result } = get();
    set(markStale({ ...plan, start }, result, true));
  },

  addStop(stop) {
    const { plan, result } = get();
    set(markStale({ ...plan, stops: [...plan.stops, stop] }, result, true));
    set({ selectedStopId: stop.id });
  },

  updateStop(id, patch) {
    const { plan, result } = get();
    set(
      markStale(
        { ...plan, stops: plan.stops.map((s) => (s.id === id ? { ...s, ...patch, id: s.id } : s)) },
        result,
        true,
      ),
    );
  },

  setStopWindow(id, window) {
    get().updateStop(id, { windows: window ? [window] : [] });
  },

  removeStop(id) {
    const { plan, result, selectedStopId } = get();
    set(markStale({ ...plan, stops: plan.stops.filter((s) => s.id !== id) }, result, true));
    if (selectedStopId === id) set({ selectedStopId: null });
  },

  reorderStops(from, to) {
    const { plan, result } = get();
    if (from === to || from < 0 || to < 0 || from >= plan.stops.length || to >= plan.stops.length) return;
    const stops = [...plan.stops];
    const [moved] = stops.splice(from, 1);
    stops.splice(to, 0, moved);
    set(markStale({ ...plan, stops }, result, true));
  },

  selectStop(id) {
    set({ selectedStopId: id, focusedLegIndex: null });
  },

  setPickTarget(target) {
    set({ pickTarget: target });
  },

  focusLeg(index) {
    const current = get().focusedLegIndex;
    set({ focusedLegIndex: current === index ? null : index });
  },

  async run(kind) {
    const { plan, running } = get();
    if (running) return;
    if (!hasAmapKey()) {
      set({ error: 'NO_AMAP_KEY' });
      return;
    }
    if (plan.stops.length === 0) {
      set({ error: '请先添加至少一个点位' });
      return;
    }
    set({ running: true, error: null, progress: null, warnings: [] });
    try {
      const out = await runPlan(plan, kind, (done, total) => set({ progress: { done, total } }));
      set({
        result: out.result,
        stale: false,
        running: false,
        progress: null,
        warnings: out.warnings,
        matrixSource: out.matrixSource,
        focusedLegIndex: null, // 新结果产生后旧的聚焦序号失效
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({
        running: false,
        progress: null,
        error: msg === 'NO_AMAP_KEY' ? 'NO_AMAP_KEY' : `规划失败：${msg}`,
      });
    }
  },

  replaceAll(plan, result) {
    set({
      plan,
      result,
      stale: false,
      error: null,
      warnings: [],
      selectedStopId: null,
      pickTarget: null,
      focusedLegIndex: null,
    });
  },

  dismissError() {
    set({ error: null });
  },
}));

useAppStore.subscribe((s) => {
  scheduleSaveState(s.plan, s.result);
});
