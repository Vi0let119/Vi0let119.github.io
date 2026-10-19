/** HH:mm ↔ 当天分钟数 的互转与格式化 */

export function parseTimeToMin(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) throw new Error(`时间格式应为 HH:mm，收到 "${hhmm}"`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error(`非法时间 "${hhmm}"`);
  return h * 60 + min;
}

export function tryParseTimeToMin(hhmm: string): number | null {
  try {
    return parseTimeToMin(hhmm);
  } catch {
    return null;
  }
}

/** 1045 -> "17:25"；超出 24h 时按 24h 取模展示（跨午夜的规划不支持，仅兜底） */
export function formatMin(min: number): string {
  if (!Number.isFinite(min)) return '--:--';
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** 时长展示：95 -> "1h35m"；40 -> "40m" */
export function formatDuration(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h}h` : `${h}h${r}m`;
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

/** "2026-10-18" -> Date（本地时区，避免 UTC 偏移） */
export function parseDateLocal(dateStr: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) throw new Error(`日期格式应为 YYYY-MM-DD，收到 "${dateStr}"`);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
