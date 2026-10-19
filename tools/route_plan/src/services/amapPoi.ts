/** POI 搜索 / 逆地理编码（全部走 JS API 插件，规避浏览器直连 REST 的 CORS 限制） */

import { loadAmap } from './amapLoader';
import type { LngLat } from '../utils/geo';

export interface PoiItem {
  id: string;
  name: string;
  address: string;
  lng: number;
  lat: number;
}

export interface RegeoResult {
  name: string;
  citycode: string;
}

function promisifySearch(invoke: (cb: (status: string, result: unknown) => void) => void, what: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    try {
      invoke((status: string, result: unknown) => {
        if (status === 'complete' && result) resolve(result);
        else reject(new Error(`${what}返回 ${status}`));
      });
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function lngLatOf(loc: unknown): { lng: number; lat: number } | null {
  if (!loc || typeof loc !== 'object') return null;
  const o = loc as Record<string, unknown> & { getLng?: () => number; getLat?: () => number };
  const lng = toNum(o.lng ?? o.getLng?.());
  const lat = toNum(o.lat ?? o.getLat?.());
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return { lng, lat };
}

/** 关键字搜点；给 city 时限定城市（中文城市名或 citycode 均可） */
export async function searchPoi(keyword: string, opts: { city?: string; near?: LngLat } = {}): Promise<PoiItem[]> {
  const AMap = (await loadAmap()) as any;
  const ps = new AMap.PlaceSearch({
    pageSize: 10,
    pageIndex: 1,
    city: opts.city ?? '全国',
    citylimit: !!opts.city,
    extensions: 'base',
  });

  // 有 near 时优先周边搜索，更符合「在附近找机位」的场景
  const result = opts.near
    ? await promisifySearch(
        (cb) => ps.searchNearBy(keyword, [opts.near!.lng, opts.near!.lat], 5000, cb),
        'POI 周边搜索',
      )
    : await promisifySearch((cb) => ps.search(keyword, cb), 'POI 搜索');

  const pois: unknown[] = ((result as any)?.poiList?.pois ?? []) as unknown[];
  const items: PoiItem[] = [];
  for (const p of pois) {
    const poi = p as any;
    const loc = lngLatOf(poi?.location);
    if (!loc) continue;
    items.push({
      id: String(poi?.id ?? ''),
      name: String(poi?.name ?? ''),
      address: String(poi?.address ?? ''),
      lng: loc.lng,
      lat: loc.lat,
    });
  }
  return items;
}

/** 高德 Geocoder 有 QPS 限制（公交矩阵开算时会并发取多个 citycode）：全部串行化 */
let geocodeChain: Promise<unknown> = Promise.resolve();

function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = geocodeChain.then(fn, fn);
  geocodeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** 逆地理编码：坐标 → 地址名 + citycode（公交路径规划需要 citycode） */
export async function regeo(lng: number, lat: number): Promise<RegeoResult> {
  return serialize(async () => {
    const AMap = (await loadAmap()) as any;
    const geocoder = new AMap.Geocoder({});
    const result = (await promisifySearch((cb) => geocoder.getAddress([lng, lat], cb), '逆地理编码')) as any;
    const rc = result?.regeocode ?? {};
    const citycode =
      String(rc?.addressComponent?.citycode ?? '').trim() || String(rc?.addressComponent?.adcode ?? '').trim();
    return { name: String(rc?.formattedAddress ?? ''), citycode };
  });
}

const citycodeCache = new Map<string, string>();

export async function getCitycode(lng: number, lat: number): Promise<string> {
  const k = `${lng.toFixed(4)},${lat.toFixed(4)}`;
  const hit = citycodeCache.get(k);
  if (hit !== undefined) return hit;
  try {
    const { citycode } = await regeo(lng, lat);
    citycodeCache.set(k, citycode);
    return citycode;
  } catch {
    citycodeCache.set(k, '');
    return '';
  }
}
