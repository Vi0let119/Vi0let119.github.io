/**
 * 路线渲染：逐段绘制真实道路几何 + 段中点信息标签。
 * - 每条路线唯一颜色（legStyles.legColor），时间轴圆点同色；
 * - 线型只由方式决定：步行/接驳步行=虚线，公交-地铁-骑行-驾车=实线（估算不改线型，只降低不透明度并在标签标注）；
 * - 公交车辆段层级永远高于步行类线条，重叠不被覆盖；
 * - 接口失败的段：直线 + 「估算」标签（绝不空白）。
 */

import type { LegResult, Plan, RouteResult } from '../model/types';
import { TRAVEL_MODE_LABEL } from '../model/types';
import { getLegRoute, type LegRouteResult } from '../services/amapTravel';
import { offsetPathRight } from '../utils/geo';
import { formatDistance, formatDuration } from '../utils/time';
import {
  legColor,
  LEG_OFFSET_METERS,
  SINGLE_LEG_STYLE,
  TRANSIT_WALK_STYLE,
  transitVehicleWeight,
  Z_LEG_LABEL,
  Z_SINGLE_LEG,
  Z_TRANSIT_VEHICLE,
  Z_TRANSIT_WALK,
} from './legStyles';

export class RouteRenderer {
  private AMap: any;
  private map: any;
  private overlays: any[] = [];
  /** 每个图层的归属与基础样式，供聚焦高亮/恢复使用 */
  private overlayMeta: Array<{
    overlay: any;
    legIndex: number;
    weight?: number;
    opacity?: number;
    zIndex?: number;
    isMarker?: boolean;
  }> = [];
  private generation = 0;

  constructor(AMap: any, map: any) {
    this.AMap = AMap;
    this.map = map;
  }

  getOverlays(): any[] {
    return [...this.overlays];
  }

  /** 某段路线的全部图层（用于聚焦时 fitView） */
  getLegOverlays(legIndex: number): any[] {
    return this.overlayMeta.filter((m) => m.legIndex === legIndex).map((m) => m.overlay);
  }

  /**
   * 聚焦/取消聚焦某段路线：聚焦段加粗提亮，其余段变暗；null = 全部恢复。
   * 时间轴点击路段时由 MapView 调用。
   */
  highlightLeg(focus: number | null): void {
    for (const m of this.overlayMeta) {
      try {
        if (m.isMarker) {
          m.overlay.setOpacity?.(focus === null || m.legIndex === focus ? 1 : 0.25);
          continue;
        }
        const baseWeight = m.weight ?? 5;
        const baseOpacity = m.opacity ?? 1;
        const baseZ = m.zIndex ?? 60;
        if (focus === null) {
          m.overlay.setOptions?.({ strokeWeight: baseWeight, strokeOpacity: baseOpacity, zIndex: baseZ });
        } else if (m.legIndex === focus) {
          m.overlay.setOptions?.({
            strokeWeight: baseWeight + 3,
            strokeOpacity: Math.min(1, baseOpacity + 0.15),
            zIndex: 200,
          });
        } else {
          m.overlay.setOptions?.({ strokeWeight: baseWeight, strokeOpacity: 0.25, zIndex: baseZ });
        }
      } catch {
        // 高亮失败不影响主流程
      }
    }
  }

  clear(): void {
    try {
      if (this.overlays.length > 0) this.map.remove(this.overlays);
    } catch {
      // 忽略清理异常
    }
    this.overlays = [];
    this.overlayMeta = [];
  }

  async render(plan: Plan, result: RouteResult | null): Promise<void> {
    const gen = ++this.generation;
    this.clear();
    if (!result || result.schedule.length === 0) return;

    const points = [plan.start, ...plan.stops];
    const legs: LegResult[] = [...result.legs, ...(result.returnLeg ? [result.returnLeg] : [])];

    for (let legIndex = 0; legIndex < legs.length; legIndex++) {
      const leg = legs[legIndex];
      const from = points[leg.fromIdx];
      const to = points[leg.toIdx];
      if (!from || !to) continue;
      const route = await getLegRoute(
        { lng: from.lng, lat: from.lat },
        { lng: to.lng, lat: to.lat },
        leg.mode,
        { refDepartMin: Math.round(leg.departMin), dateStr: plan.date },
      );
      if (gen !== this.generation) return; // 已有更新的渲染请求，丢弃本次
      this.drawLeg(leg, route, legIndex);
    }
  }

  private drawLeg(leg: LegResult, route: LegRouteResult, legIndex: number): void {
    const estimated = Boolean(leg.estimated || route.estimated);
    const opacity = estimated ? 0.6 : 0.85;
    const color = legColor(legIndex);
    const hasSegPaths =
      leg.mode === 'transit' && (route.transitSegments ?? []).some((s) => (s.path?.length ?? 0) > 1);

    if (hasSegPaths) {
      // 公交段：先画接驳步行（虚线，低层），再画车辆段（实线，最高层）；各段统一右侧偏移
      for (const seg of route.transitSegments ?? []) {
        if (!seg.path || seg.path.length < 2 || seg.kind !== 'walk') continue;
        this.drawPolyline(
          offsetPathRight(seg.path, LEG_OFFSET_METERS),
          {
            strokeColor: color,
            strokeWeight: TRANSIT_WALK_STYLE.weight,
            strokeStyle: TRANSIT_WALK_STYLE.style,
            strokeOpacity: 0.9,
          },
          Z_TRANSIT_WALK,
          legIndex,
        );
      }
      for (const seg of route.transitSegments ?? []) {
        if (!seg.path || seg.path.length < 2 || seg.kind === 'walk') continue;
        this.drawPolyline(
          offsetPathRight(seg.path, LEG_OFFSET_METERS),
          {
            strokeColor: color,
            strokeWeight: transitVehicleWeight(seg.kind),
            strokeStyle: 'solid',
            strokeOpacity: 0.9,
          },
          Z_TRANSIT_VEHICLE,
          legIndex,
        );
      }
    } else {
      // 单模式路段（或公交明细缺失时的兜底）：也遵循「步行虚线、其余实线」；右侧偏移分离来回路线
      const base = SINGLE_LEG_STYLE[leg.mode] ?? SINGLE_LEG_STYLE.walking;
      this.drawPolyline(
        offsetPathRight(route.path, LEG_OFFSET_METERS),
        {
          strokeColor: color,
          strokeWeight: base.weight,
          strokeStyle: base.style,
          strokeOpacity: opacity,
        },
        Z_SINGLE_LEG,
        legIndex,
      );
    }

    this.drawLegLabel(leg, route, estimated, color, legIndex);
  }

  private drawPolyline(
    path: Array<[number, number]>,
    style: Record<string, unknown>,
    zIndex: number,
    legIndex: number,
  ): void {
    const line = new this.AMap.Polyline({
      path,
      ...style,
      lineJoin: 'round',
      lineCap: 'round',
      zIndex,
      showDir: true,
    });
    line.setMap(this.map);
    this.overlays.push(line);
    this.overlayMeta.push({
      overlay: line,
      legIndex,
      weight: Number(style.strokeWeight) || 5,
      opacity: style.strokeOpacity !== undefined ? Number(style.strokeOpacity) : 1,
      zIndex,
    });
  }

  private drawLegLabel(
    leg: LegResult,
    route: LegRouteResult,
    estimated: boolean,
    color: string,
    legIndex: number,
  ): void {
    const path = route.path;
    if (path.length === 0) return;
    const mid = path[Math.floor(path.length / 2)];

    const parts: string[] = [];
    if (leg.mode === 'transit' && route.transitSegments && route.transitSegments.length > 0) {
      // 公交：显示换乘摘要，如「步行 → 地铁10号线 → 步行」（详细步骤见时间轴与导出）
      const summary = route.transitSegments
        .slice(0, 4)
        .map((s) => (s.kind === 'walk' ? '步行' : (s.lineName ?? '公交').slice(0, 10)))
        .join(' → ');
      parts.push(summary);
    } else {
      parts.push(TRAVEL_MODE_LABEL[leg.mode]);
    }
    parts.push(`${formatDistance(route.distanceM)} · ${formatDuration(route.durationMin)}`);
    if (estimated) parts.push('（估算）');

    const label = new this.AMap.Marker({
      position: mid,
      content: `<div class="leg-label" style="border-left:3px solid ${color}">${parts.map(escapeHtml).join(' ')}</div>`,
      anchor: 'center',
      clickable: false,
      zIndex: Z_LEG_LABEL,
    });
    label.setMap(this.map);
    this.overlays.push(label);
    this.overlayMeta.push({ overlay: label, legIndex, isMarker: true });
  }

  destroy(): void {
    this.generation++;
    this.clear();
  }
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
