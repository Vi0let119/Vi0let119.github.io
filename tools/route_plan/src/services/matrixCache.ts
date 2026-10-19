/**
 * 路线耗时/距离的本地缓存（localStorage LRU）。
 * 价值：改时间窗 / 改目标 / 重排序后重算，全部命中缓存 —— 零高德配额消耗。
 * 只缓存真实接口结果；降级估算不入缓存（避免把临时故障固化）。
 */

import type { TravelMode } from '../model/types';
import type { LngLat } from '../utils/geo';

export interface LegCacheEntry {
  durationMin: number;
  distanceM: number;
  source: 'amap' | 'estimate';
  at: number;
}

const STORE_KEY = 'ssp.legcache.v1';
const MAX_ENTRIES = 5000;
const SAVE_DEBOUNCE_MS = 400;

const mem = new Map<string, LegCacheEntry>();
let loaded = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function legKey(mode: TravelMode, a: LngLat, b: LngLat, bucket?: number): string {
  const f = (p: LngLat) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`;
  return `${mode}|${f(a)}|${f(b)}${bucket === undefined ? '' : `|t${bucket}`}`;
}

/** 公交耗时随出发时刻变化 → 按 15 分钟桶缓存 */
export const TRANSIT_BUCKET_MINUTES = 15;

export function timeBucket(departMin: number): number {
  return Math.floor(departMin / TRANSIT_BUCKET_MINUTES);
}

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw) as Record<string, LegCacheEntry>;
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v?.durationMin === 'number') mem.set(k, v);
    }
  } catch {
    // 缓存损坏时静默重建
  }
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      const obj: Record<string, LegCacheEntry> = {};
      for (const [k, v] of mem) obj[k] = v;
      localStorage.setItem(STORE_KEY, JSON.stringify(obj));
    } catch {
      // 超配额：丢弃一半旧条目后重试一次
      try {
        const keys = [...mem.keys()];
        for (const k of keys.slice(0, Math.floor(keys.length / 2))) mem.delete(k);
        const obj: Record<string, LegCacheEntry> = {};
        for (const [k, v] of mem) obj[k] = v;
        localStorage.setItem(STORE_KEY, JSON.stringify(obj));
      } catch {
        // 放弃持久化，仅保留内存缓存
      }
    }
  }, SAVE_DEBOUNCE_MS);
}

export const legCache = {
  get(key: string): LegCacheEntry | undefined {
    ensureLoaded();
    return mem.get(key);
  },

  set(key: string, entry: LegCacheEntry): void {
    ensureLoaded();
    mem.delete(key);
    mem.set(key, entry);
    while (mem.size > MAX_ENTRIES) {
      const oldest = mem.keys().next().value;
      if (oldest === undefined) break;
      mem.delete(oldest);
    }
    scheduleSave();
  },

  size(): number {
    ensureLoaded();
    return mem.size;
  },

  clear(): void {
    ensureLoaded();
    mem.clear();
    scheduleSave();
  },
};
