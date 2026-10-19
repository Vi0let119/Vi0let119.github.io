/** 地理工具：直线距离与降级估算 */

export interface LngLat {
  lng: number;
  lat: number;
}

const EARTH_R = 6371000;

export function haversineM(a: LngLat, b: LngLat): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(s));
}

/**
 * 接口失败时的降级估算：直线距离 × 绕行系数 + 速度模型。
 * 结果会标记 estimated，UI 必须明确提示「估算」。
 */
export const FALLBACK_PARAMS = {
  walking: { detourFactor: 1.3, speedMPerMin: 75 },
  riding: { detourFactor: 1.25, speedMPerMin: 250 },
  driving: { detourFactor: 1.4, speedMPerMin: 400 },
  transit: { detourFactor: 1.5, speedMPerMin: 350 },
} as const;

export function estimateLeg(
  from: LngLat,
  to: LngLat,
  mode: keyof typeof FALLBACK_PARAMS,
): { distanceM: number; durationMin: number } {
  const p = FALLBACK_PARAMS[mode];
  const distanceM = haversineM(from, to) * p.detourFactor;
  return { distanceM, durationMin: distanceM / p.speedMPerMin };
}

/**
 * 路径平行偏移：沿行进方向向右偏移约 offsetMeters 米。
 * 用途：来回路线（A→B 与 B→A）的路径会自然分居道路两侧，解决重叠不可辨认的问题；
 * 与导航类应用「路线靠道路右侧绘制」的惯例一致。经纬度按当地纬度近似换算。
 */
export function offsetPathRight(path: [number, number][], offsetMeters: number): [number, number][] {
  if (path.length < 2 || offsetMeters === 0) return path;
  const out: [number, number][] = [];
  for (let i = 0; i < path.length; i++) {
    const prev = path[Math.max(0, i - 1)];
    const next = path[Math.min(path.length - 1, i + 1)];
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-12) {
      out.push([path[i][0], path[i][1]]);
      continue;
    }
    // 行进方向右侧法线（lng=x, lat=y 平面内的顺时针 90°）
    const nx = dy / len;
    const ny = -dx / len;
    const mPerDegLat = 111320;
    const mPerDegLng = 111320 * Math.cos((path[i][1] * Math.PI) / 180);
    out.push([
      path[i][0] + (nx * offsetMeters) / Math.max(mPerDegLng, 1),
      path[i][1] + (ny * offsetMeters) / mPerDegLat,
    ]);
  }
  return out;
}
