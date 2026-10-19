/**
 * ★ 距离矩阵与单段路线服务（求解器的数据源，与求解完全解耦）。
 *
 * - 四种模式统一走 JS API 插件逐对调用，4 并发 + 超时 8s + 失败重试一次；
 * - 结果缓存（matrixCache）：改窗口/改目标/重排序重算时零配额消耗；
 * - 失败降级为「直线 × 绕行系数 + 速度模型」估算并明确标记；
 * - 公交（含地铁）耗时随出发时刻变化：矩阵按参考时刻计算（按 15 分钟桶缓存），
 *   时刻表复核由上层在排完序后按实际出发时刻重查（见 planRunner）。
 */

import { loadAmap } from './amapLoader';
import { getCitycode } from './amapPoi';
import { legCache, legKey, timeBucket } from './matrixCache';
import { chooseLegMode, MIXED_WALK_MAX_METERS } from './mixedRule';
import { estimateLeg, type LngLat } from '../utils/geo';
import { mapLimit, withTimeout } from '../utils/concurrency';
import { parseDateLocal } from '../utils/time';
import type { Matrix, TransitSegment, TravelMode } from '../model/types';

export interface MatrixOptions {
  /** 参考出发时刻（当天分钟数）——公交矩阵的时间桶依据 */
  refDepartMin: number;
  dateStr: string;
}

export interface LegRouteResult {
  distanceM: number;
  durationMin: number;
  /** 真实道路几何 [[lng,lat], ...]；接口失败时为起终点直线 */
  path: [number, number][];
  transitSegments?: TransitSegment[];
  estimated?: boolean;
}

const CONCURRENCY = 4;
const TIMEOUT_MS = 8000;
const RETRY_DELAY_MS = 450;
/** 公交/地铁规划 QPS 限制更严（个人 Key 约 3 次/秒）：串行 + 最小间隔，避免突发被限流后误降级 */
const TRANSIT_CONCURRENCY = 1;
const TRANSIT_PACING_MS = 320;

/** 单段查询的合法模式（'mixed' 是矩阵层的聚合概念，不做单段查询；渲染兜底按步行处理） */
type SingleMode = Exclude<TravelMode, 'mixed'>;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await withTimeout(fn(), TIMEOUT_MS, '高德接口超时');
  } catch {
    await sleep(RETRY_DELAY_MS); // 等待一个 QPS 窗口后再重试
    return await withTimeout(fn(), TIMEOUT_MS, '高德接口超时');
  }
}

async function queryLegRaw(
  AMap: any,
  from: LngLat,
  to: LngLat,
  mode: SingleMode,
  opts: MatrixOptions,
): Promise<any> {
  const origin: [number, number] = [from.lng, from.lat];
  const dest: [number, number] = [to.lng, to.lat];

  return new Promise((resolve, reject) => {
    const cb = (status: string, result: unknown) => {
      if (status === 'complete' && result) resolve(result);
      else reject(new Error(`高德 ${mode} 路径规划返回 ${status}`));
    };
    try {
      if (mode === 'walking') {
        new AMap.Walking({ hideMarkers: true }).search(origin, dest, cb);
      } else if (mode === 'riding') {
        new AMap.Riding({ hideMarkers: true }).search(origin, dest, cb);
      } else if (mode === 'driving') {
        new AMap.Driving({ hideMarkers: true, policy: AMap.DrivingPolicy?.LEAST_TIME ?? 0 }).search(
          origin,
          dest,
          cb,
        );
      } else {
        void (async () => {
          const [city, cityd] = await Promise.all([
            getCitycode(from.lng, from.lat),
            getCitycode(to.lng, to.lat),
          ]);
          // departureTime：部分版本支持；不支持时接口按当前时刻近似，上层会标注估算
          const departureTime = new Date(parseDateLocal(opts.dateStr).getTime() + opts.refDepartMin * 60000);
          const searcher = new AMap.Transfer({ city, cityd, nightflag: 0, departureTime });
          searcher.search(origin, dest, cb);
        })().catch(reject);
      }
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

interface ParsedLeg {
  distanceM: number;
  durationMin: number;
  raw: any;
}

function parseLegResult(result: any): ParsedLeg | null {
  const routes = result?.routes;
  if (Array.isArray(routes) && routes.length > 0) {
    const r = routes[0];
    const distanceM = toNum(r?.distance);
    const durationMin = toNum(r?.time) / 60;
    if (distanceM > 0 || durationMin > 0) return { distanceM, durationMin, raw: r };
  }
  const plan = result?.plans?.[0];
  if (plan) {
    const distanceM = toNum(plan.distance);
    const durationMin = toNum(plan.time) / 60;
    if (distanceM > 0 || durationMin > 0) return { distanceM, durationMin, raw: plan };
  }
  return null;
}

// ---------------------------------------------------------------------------
// 几何 / 公交分段解析（对高德返回结构做防御式解析）
// ---------------------------------------------------------------------------

function lngLatPair(p: unknown): [number, number] | null {
  if (!p) return null;
  if (Array.isArray(p) && p.length >= 2) {
    const lng = Number(p[0]);
    const lat = Number(p[1]);
    return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
  }
  if (typeof p === 'object') {
    const o = p as Record<string, unknown> & { getLng?: () => number; getLat?: () => number };
    const lng = Number(o.lng ?? o.getLng?.());
    const lat = Number(o.lat ?? o.getLat?.());
    if (Number.isFinite(lng) && Number.isFinite(lat)) return [lng, lat];
  }
  return null;
}

function extractLngLatArray(arr: unknown): [number, number][] {
  if (!Array.isArray(arr)) return [];
  const out: [number, number][] = [];
  for (const p of arr) {
    const pair = lngLatPair(p);
    if (pair) out.push(pair);
  }
  return out;
}

function extractRoutePath(raw: any): [number, number][] {
  const out: [number, number][] = [];
  if (Array.isArray(raw?.steps)) {
    for (const s of raw.steps) out.push(...extractLngLatArray(s?.path));
  }
  return out;
}

function transitKind(lineName: string, typeStr: string): TransitSegment['kind'] {
  const s = `${lineName} ${typeStr}`;
  if (/地铁|subway/i.test(s)) return 'subway';
  if (/铁路|高铁|动车|城际|rail/i.test(s)) return 'rail';
  if (/步行|walk/i.test(s)) return 'walk';
  return 'bus';
}

/** 站点字段可能是字符串或 { name } 对象，防御式解析 */
function stationName(v: unknown): string | undefined {
  if (!v) return undefined;
  if (typeof v === 'string') return v.trim() || undefined;
  if (typeof v === 'object') {
    const name = (v as { name?: unknown }).name;
    if (typeof name === 'string' && name.trim()) return name.trim();
  }
  return undefined;
}

function parseTransitSegments(plan: any): { segments: TransitSegment[]; path: [number, number][] } {
  const segments: TransitSegment[] = [];
  const path: [number, number][] = [];
  const segs = plan?.segments;
  if (!Array.isArray(segs)) return { segments, path };

  // AMap JS API 2.0 公交段结构：
  //   seg = { transit_mode: 'WALK'|'SUBWAY'|'BUS'|'RAILWAY', distance, time, instruction,
  //           transit: { path, steps }                 // 步行段
  //           transit: { path, lines: [{name,type}], on_station, off_station, via_stops } } // 乘车段
  for (const seg of segs) {
    const mode = String(seg?.transit_mode ?? '').toUpperCase();
    const block = seg?.transit ?? seg?.bus ?? seg?.railway ?? seg?.walking ?? {};
    const segPath = extractLngLatArray(block?.path);
    const distanceM = toNum(seg?.distance ?? block?.distance);
    const durationMin = toNum(seg?.time ?? block?.time) / 60;
    const instruction = typeof seg?.instruction === 'string' && seg.instruction ? seg.instruction : undefined;
    const isWalk = mode === 'WALK' || (!mode && !!seg?.walking);

    if (isWalk) {
      segments.push({
        kind: 'walk',
        distanceM,
        durationMin,
        instruction,
        path: segPath.length > 1 ? segPath : undefined,
      });
    } else {
      const lines = block?.lines ?? block?.buslines ?? [];
      const line = Array.isArray(lines) && lines.length > 0 ? lines[0] : undefined;
      const lineName = String(line?.name ?? '公交');
      const kind: TransitSegment['kind'] =
        mode === 'SUBWAY'
          ? 'subway'
          : mode === 'RAILWAY'
            ? 'rail'
            : mode === 'BUS'
              ? 'bus'
              : transitKind(lineName, String(line?.type ?? ''));
      const via = Number(block?.via_num);
      segments.push({
        kind,
        lineName,
        distanceM,
        durationMin,
        onStation: stationName(block?.on_station),
        offStation: stationName(block?.off_station),
        viaNum: Number.isFinite(via) ? via : undefined,
        instruction,
        path: segPath.length > 1 ? segPath : undefined,
      });
    }
    path.push(...segPath);
  }
  return { segments: segments.filter((s) => s.durationMin > 0 || s.distanceM > 0), path };
}

// ---------------------------------------------------------------------------
// 对外接口
// ---------------------------------------------------------------------------

/** 内存中的几何缓存（localStorage 只存数字矩阵，不存路径几何） */
const geometryCache = new Map<string, LegRouteResult>();

/** 单段耗时/距离（带缓存）；供时刻表的公交复核使用 */
export async function getLegTimes(
  from: LngLat,
  to: LngLat,
  mode: TravelMode,
  opts: MatrixOptions,
): Promise<{ durationMin: number; distanceM: number; source: 'amap' | 'estimate' }> {
  const singleMode: SingleMode = mode === 'mixed' ? 'walking' : mode;
  const bucket = singleMode === 'transit' ? timeBucket(opts.refDepartMin) : undefined;
  const key = legKey(singleMode, from, to, bucket);
  const hit = legCache.get(key);
  if (hit) return { durationMin: hit.durationMin, distanceM: hit.distanceM, source: hit.source };

  const AMap = await loadAmap();
  try {
    const parsed = parseLegResult(await withRetry(() => queryLegRaw(AMap, from, to, singleMode, opts)));
    if (!parsed) throw new Error('空路线结果');
    const entry = {
      durationMin: parsed.durationMin,
      distanceM: parsed.distanceM,
      source: 'amap' as const,
      at: Date.now(),
    };
    legCache.set(key, entry);
    return entry;
  } catch {
    const est = estimateLeg(from, to, singleMode);
    return { durationMin: est.durationMin, distanceM: est.distanceM, source: 'estimate' };
  }
}

export async function getLegRoute(
  from: LngLat,
  to: LngLat,
  mode: TravelMode,
  opts: MatrixOptions,
): Promise<LegRouteResult> {
  // 混合模式在渲染时使用逐段实际方式（'walking'/'transit'），不会传 'mixed'；此处兜底按步行
  const singleMode: SingleMode = mode === 'mixed' ? 'walking' : mode;
  const geomKey = legKey(singleMode, from, to, singleMode === 'transit' ? timeBucket(opts.refDepartMin) : undefined);
  const cached = geometryCache.get(geomKey);
  if (cached) return cached;

  const AMap = await loadAmap();
  let result: LegRouteResult;
  try {
    const parsed = parseLegResult(await withRetry(() => queryLegRaw(AMap, from, to, singleMode, opts)));
    if (!parsed) throw new Error('空路线结果');

    let path: [number, number][] = [];
    let transitSegments: TransitSegment[] | undefined;
    if (singleMode === 'transit') {
      const t = parseTransitSegments(parsed.raw);
      transitSegments = t.segments;
      path = t.path;
    } else {
      path = extractRoutePath(parsed.raw);
    }
    if (path.length === 0) path = [[from.lng, from.lat], [to.lng, to.lat]];

    result = {
      distanceM: parsed.distanceM,
      durationMin: parsed.durationMin,
      path,
      transitSegments,
    };
  } catch {
    const est = estimateLeg(from, to, singleMode);
    result = {
      distanceM: est.distanceM,
      durationMin: est.durationMin,
      path: [[from.lng, from.lat], [to.lng, to.lat]],
      estimated: true,
    };
  }
  geometryCache.set(geomKey, result);
  return result;
}

export function clearGeometryCache(): void {
  geometryCache.clear();
}

/**
 * 计算 (n)×(n) 距离矩阵；points[0] 为起点、points[k] 为第 k 个点位（与矩阵下标一一对应）。
 * mode = 'mixed'（智能混合）时走两阶段：先步行矩阵，再对 ≥2km 的路对查公交做逐段选择。
 */
export async function getMatrix(
  points: LngLat[],
  mode: TravelMode,
  opts: MatrixOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<Matrix> {
  if (mode === 'mixed') return getMixedMatrix(points, opts, onProgress);

  const AMap = await loadAmap();
  const n = points.length;
  const durationMin: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const distanceM: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));

  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j) pairs.push([i, j]);
    }
  }

  const bucket = mode === 'transit' ? timeBucket(opts.refDepartMin) : undefined;
  const concurrency = mode === 'transit' ? TRANSIT_CONCURRENCY : CONCURRENCY;
  let done = 0;
  let estimatedPairs = 0;

  await mapLimit(pairs, concurrency, async ([i, j]) => {
    const a = points[i];
    const b = points[j];
    const key = legKey(mode, a, b, bucket);
    let entry = legCache.get(key);
    if (!entry) {
      try {
        const parsed = parseLegResult(await withRetry(() => queryLegRaw(AMap, a, b, mode, opts)));
        if (!parsed) throw new Error('空路线结果');
        entry = { durationMin: parsed.durationMin, distanceM: parsed.distanceM, source: 'amap', at: Date.now() };
        legCache.set(key, entry);
      } catch {
        const est = estimateLeg(a, b, mode);
        // 估算结果不入持久缓存：避免把临时故障固化
        entry = { durationMin: est.durationMin, distanceM: est.distanceM, source: 'estimate', at: Date.now() };
      }
    }
    durationMin[i][j] = entry.durationMin;
    distanceM[i][j] = entry.distanceM;
    if (entry.source === 'estimate') estimatedPairs++;
    done++;
    onProgress?.(done, pairs.length);
    if (mode === 'transit') await sleep(TRANSIT_PACING_MS);
  });

  return {
    mode,
    generatedAt: Date.now(),
    durationMin,
    distanceM,
    source: estimatedPairs === 0 ? 'amap' : estimatedPairs === pairs.length ? 'estimate' : 'mixed',
    estimatedPairCount: estimatedPairs,
  };
}

/**
 * 智能混合矩阵：两阶段
 * 1) 步行矩阵（4 并发）——步行距离 < 2km 的路对直接定为步行，不再查公交（省配额）；
 * 2) 步行距离 ≥ 2km 的路对查公交时间（串行 + 间隔），按 chooseLegMode 规则逐段决定；
 *    公交无方案/查询失败 → 退回真实步行值（不是估算）。
 * 记录 legModes[][] 供时刻表、渲染、导出按段使用。
 */
async function getMixedMatrix(
  points: LngLat[],
  opts: MatrixOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<Matrix> {
  const n = points.length;
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j) pairs.push([i, j]);
    }
  }
  const total = pairs.length * 2; // 进度条分两阶段，总量固定不跳动

  // 阶段 1：步行矩阵（复用单模式路径与缓存）
  const walk = await getMatrix(points, 'walking', opts, (done) =>
    onProgress?.(Math.min(done, pairs.length), total),
  );

  const durationMin = walk.durationMin.map((r) => [...r]);
  const distanceM = walk.distanceM.map((r) => [...r]);
  const legModes: Array<Array<'walking' | 'transit'>> = Array.from({ length: n }, () =>
    new Array<'walking' | 'transit'>(n).fill('walking'),
  );

  // 阶段 2：仅对 ≥2km 的路对查公交（串行 + QPS 间隔）
  const transitPairs = pairs.filter(([i, j]) => walk.distanceM[i][j] >= MIXED_WALK_MAX_METERS);
  const AMap = await loadAmap();
  const bucket = timeBucket(opts.refDepartMin);
  let done = 0;

  await mapLimit(transitPairs, TRANSIT_CONCURRENCY, async ([i, j]) => {
    const a = points[i];
    const b = points[j];
    const key = legKey('transit', a, b, bucket);
    let transit: { durationMin: number; distanceM: number } | null = null;

    const hit = legCache.get(key);
    if (hit) {
      transit = { durationMin: hit.durationMin, distanceM: hit.distanceM };
    } else {
      try {
        const parsed = parseLegResult(await withRetry(() => queryLegRaw(AMap, a, b, 'transit', opts)));
        if (!parsed) throw new Error('空路线结果');
        transit = { durationMin: parsed.durationMin, distanceM: parsed.distanceM };
        legCache.set(key, { ...transit, source: 'amap', at: Date.now() });
      } catch {
        transit = null; // 公交无方案或接口失败：退回真实步行值
      }
    }

    const chosen = chooseLegMode(
      walk.distanceM[i][j],
      walk.durationMin[i][j],
      transit ? transit.durationMin : null,
    );
    legModes[i][j] = chosen;
    if (chosen === 'transit' && transit) {
      durationMin[i][j] = transit.durationMin;
      distanceM[i][j] = transit.distanceM;
    }

    done++;
    onProgress?.(Math.min(pairs.length + done, total), total);
    await sleep(TRANSIT_PACING_MS);
  });
  onProgress?.(total, total);

  return {
    mode: 'mixed',
    generatedAt: Date.now(),
    durationMin,
    distanceM,
    legModes,
    source: walk.source,
    estimatedPairCount: walk.estimatedPairCount,
  };
}
