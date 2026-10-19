/** 日照时刻计算（suncalc 封装）：日出/日落/晨昏（蓝调时段）/黄金时段。 */

import SunCalc from 'suncalc';
import type { SunTimes } from './types';
import { parseDateLocal, formatMin } from '../utils/time';

function toMin(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

function valid(d: Date | undefined): d is Date {
  return !!d && Number.isFinite(d.getTime());
}

/**
 * 返回当天（本地日期）的日照时刻；极昼/极夜等无法计算的场景返回 null。
 * 蓝调时段 ≈ 日落到民用暮光结束（dusk）；黄金时段取 suncalc 的日落前段/日出后段。
 */
export function getSunTimes(lat: number, lng: number, dateStr: string): SunTimes | null {
  let times: ReturnType<typeof SunCalc.getTimes>;
  try {
    times = SunCalc.getTimes(parseDateLocal(dateStr), lat, lng);
  } catch {
    return null;
  }
  const { sunrise, sunset, dawn, dusk, sunsetStart, sunriseEnd } = times;
  if (!valid(sunrise) || !valid(sunset) || !valid(dawn) || !valid(dusk)) return null;
  return {
    sunriseMin: toMin(sunrise),
    sunsetMin: toMin(sunset),
    dawnMin: toMin(dawn),
    duskMin: toMin(dusk),
    goldenEveningStartMin: valid(sunsetStart) ? toMin(sunsetStart) : toMin(sunset),
    goldenMorningEndMin: valid(sunriseEnd) ? toMin(sunriseEnd) : toMin(sunrise),
  };
}

/** UI 展示用摘要："日出 05:58 · 日落 17:42 · 蓝调 17:42–18:12" */
export function describeSunTimes(t: SunTimes): string {
  return `日出 ${formatMin(t.sunriseMin)} · 日落 ${formatMin(t.sunsetMin)} · 蓝调 ${formatMin(
    t.sunsetMin,
  )}–${formatMin(t.duskMin)}`;
}
