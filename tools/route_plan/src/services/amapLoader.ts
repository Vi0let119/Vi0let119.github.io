/**
 * 高德 JS API 加载器：Key/安全密钥的注入与插件装载。
 *
 * 重要（方案 §1 事实一）：纯前端环境不能直接 fetch restapi.amap.com（CORS + Referer 校验），
 * 因此所有地图数据（POI 搜索、地理编码、路线/矩阵）都必须经由 JS API 插件完成。
 *
 * Key 来源优先级：环境变量（开发模式读根 .env.local；发布构建读 env-build/ 的空值，
 * 即发布产物不含内联 Key）> localStorage（界面填写，公开站访客的填法）。
 */

import AMapLoader from '@amap/amap-jsapi-loader';

export const AMAP_PLUGINS = [
  'AMap.PlaceSearch',
  'AMap.AutoComplete',
  'AMap.Geocoder',
  'AMap.Walking',
  'AMap.Riding',
  'AMap.Driving',
  'AMap.Transfer',
];

const KEY_LS = 'ssp.amap.key';
const CODE_LS = 'ssp.amap.jscode';

export function getAmapKey(): string {
  const env = String(import.meta.env.VITE_AMAP_KEY ?? '').trim();
  return env || (localStorage.getItem(KEY_LS) ?? '').trim();
}

export function getAmapSecurityCode(): string {
  const env = String(import.meta.env.VITE_AMAP_SECURITY_JS_CODE ?? '').trim();
  return env || (localStorage.getItem(CODE_LS) ?? '').trim();
}

export function hasAmapKey(): boolean {
  return getAmapKey().length > 0;
}

export function saveAmapConfig(key: string, securityJsCode: string): void {
  localStorage.setItem(KEY_LS, key.trim());
  localStorage.setItem(CODE_LS, securityJsCode.trim());
}

let loaderPromise: Promise<unknown> | null = null;

/** 加载高德 JS API（单例）。未配置 Key 时以 NO_AMAP_KEY 拒绝。 */
export function loadAmap(): Promise<unknown> {
  if (loaderPromise) return loaderPromise;
  const key = getAmapKey();
  if (!key) return Promise.reject(new Error('NO_AMAP_KEY'));
  const securityJsCode = getAmapSecurityCode();
  if (securityJsCode) {
    (window as unknown as { _AMapSecurityConfig?: { securityJsCode: string } })._AMapSecurityConfig = {
      securityJsCode,
    };
  }
  loaderPromise = AMapLoader.load({ key, version: '2.0', plugins: AMAP_PLUGINS });
  return loaderPromise;
}
