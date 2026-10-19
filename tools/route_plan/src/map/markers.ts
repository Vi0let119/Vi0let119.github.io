/** 点位标记：序号徽标 + 到达时间气泡 + 拖拽改坐标 */

import type { Plan, RouteResult } from '../model/types';
import { visitIndexByStopId } from '../model/visitOrder';
import { formatMin } from '../utils/time';

export interface MarkerHandlers {
  onDragEnd(stopId: string, lng: number, lat: number): void;
  onClick(stopId: string): void;
}

/**
 * 从事件中提取坐标。
 * 注意：高德 JS API 2.0 的 marker 拖拽事件坐标在 e.target.getPosition()，
 * 不一定带 e.lnglat（1.4 时代的字段），必须逐级兜底，否则拖拽不会写回状态。
 */
function eventLngLat(e: any): { lng: number; lat: number } | null {
  const candidates: unknown[] = [e?.lnglat, e?.target?.getPosition?.()];
  for (const l of candidates) {
    if (!l || typeof l !== 'object') continue;
    const o = l as Record<string, unknown> & { getLng?: () => number; getLat?: () => number };
    const lng = Number(o.lng ?? o.getLng?.());
    const lat = Number(o.lat ?? o.getLat?.());
    if (Number.isFinite(lng) && Number.isFinite(lat)) return { lng, lat };
  }
  return null;
}

export class MarkerManager {
  private AMap: any;
  private map: any;
  private markers = new Map<string, any>();

  constructor(AMap: any, map: any) {
    this.AMap = AMap;
    this.map = map;
  }

  getOverlays(): any[] {
    return [...this.markers.values()];
  }

  sync(
    plan: Plan,
    result: RouteResult | null,
    handlers: MarkerHandlers,
    selectedStopId: string | null,
    /** true 时徽标号 = 访问顺序（与时间轴一致）；false（无结果/待重算）回退为列表序号 */
    useVisitOrder: boolean,
  ): void {
    const seen = new Set<string>();
    const visitIdx = useVisitOrder ? visitIndexByStopId(result) : null;

    seen.add('start');
    this.upsert('start', plan.start.lng, plan.start.lat, startContent(plan), false, null, handlers);

    const scheduleByStop = new Map((result?.schedule ?? []).map((e) => [e.stopId, e]));
    plan.stops.forEach((stop, i) => {
      seen.add(stop.id);
      const entry = scheduleByStop.get(stop.id);
      const conflict = result?.conflicts.some((c) => c.stopId === stop.id) ?? false;
      let label = '';
      if (entry) {
        label = formatMin(entry.arriveMin);
        if (entry.waitMin > 0) label += ' ⏳';
        if (conflict) label = `⚠ ${label}`;
      }
      const displayIdx = visitIdx?.get(stop.id) ?? i + 1;
      const content = stopContent(displayIdx, label, conflict, selectedStopId === stop.id);
      this.upsert(stop.id, stop.lng, stop.lat, content, true, stop.id, handlers);
    });

    for (const [key, marker] of [...this.markers]) {
      if (!seen.has(key)) {
        try {
          this.map.remove(marker);
        } catch {
          // 忽略移除异常
        }
        this.markers.delete(key);
      }
    }
  }

  private upsert(
    key: string,
    lng: number,
    lat: number,
    content: string,
    draggable: boolean,
    stopId: string | null,
    handlers: MarkerHandlers,
  ): void {
    const existing = this.markers.get(key);
    if (existing) {
      existing.setPosition([lng, lat]);
      existing.setContent(content);
      return;
    }
    const marker = new this.AMap.Marker({
      position: [lng, lat],
      content,
      anchor: 'bottom-center',
      draggable,
      zIndex: 150,
    });
    if (stopId) {
      marker.on('dragend', (e: any) => {
        const ll = eventLngLat(e);
        if (ll) handlers.onDragEnd(stopId, ll.lng, ll.lat);
      });
      marker.on('click', () => handlers.onClick(stopId));
    }
    marker.setMap(this.map);
    this.markers.set(key, marker);
  }

  destroy(): void {
    try {
      this.map.remove(this.getOverlays());
    } catch {
      // 忽略
    }
    this.markers.clear();
  }
}

function startContent(plan: Plan): string {
  const name = (plan.start.name ?? '起点').slice(0, 12);
  return `<div class="mk mk-start" title="${escapeHtml(name)}"><div class="mk-eta mk-eta-start">${escapeHtml(name)}</div><div class="mk-badge">起</div></div>`;
}

function stopContent(idx: number, label: string, conflict: boolean, selected: boolean): string {
  const cls = `mk${conflict ? ' mk-conflict' : ''}${selected ? ' mk-selected' : ''}`;
  const eta = label ? `<div class="mk-eta">${escapeHtml(label)}</div>` : '';
  return `<div class="${cls}">${eta}<div class="mk-badge">${idx}</div></div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}
