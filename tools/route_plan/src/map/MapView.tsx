/** 地图视图：组合地图生命周期 + 标记管理 + 路线渲染 + 点击加点 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAmap } from './useAmap';
import { MarkerManager } from './markers';
import { RouteRenderer } from './polylines';
import { fitView, panTo, setupClickToAdd } from './interactions';
import { createStop, useAppStore } from '../model/store';
import { loadAmap } from '../services/amapLoader';
import { regeo } from '../services/amapPoi';

/** 拖拽后自动重算：防抖时长 + 若重算仍在进行中的重试间隔 */
const REPLAN_DEBOUNCE_MS = 700;
const REPLAN_RETRY_MS = 900;

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { map, ready, error } = useAmap(containerRef);
  const [amapNs, setAmapNs] = useState<any>(null);
  const markersRef = useRef<MarkerManager | null>(null);
  const rendererRef = useRef<RouteRenderer | null>(null);

  const plan = useAppStore((s) => s.plan);
  const result = useAppStore((s) => s.result);
  const stale = useAppStore((s) => s.stale);
  const pickTarget = useAppStore((s) => s.pickTarget);
  const focusedLegIndex = useAppStore((s) => s.focusedLegIndex);
  const selectedStopId = useAppStore((s) => s.selectedStopId);
  const setPickTarget = useAppStore((s) => s.setPickTarget);
  const addStop = useAppStore((s) => s.addStop);
  const setStart = useAppStore((s) => s.setStart);
  const selectStop = useAppStore((s) => s.selectStop);
  const updateStop = useAppStore((s) => s.updateStop);

  const stopsRef = useRef(plan.stops);
  stopsRef.current = plan.stops;

  // 拖拽点位后的自动重算（防抖）：仅在已有结果时触发，沿用上次的规划方式；
  // 若上一次重算仍在进行（如连续拖动多个点），稍后重试而不是丢弃。
  const replanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleReplan = useCallback(() => {
    const fire = () => {
      replanTimerRef.current = null;
      const { result, running, run } = useAppStore.getState();
      if (!result) return;
      if (running) {
        replanTimerRef.current = setTimeout(fire, REPLAN_RETRY_MS);
        return;
      }
      void run(result.solver === 'manual' ? 'manual' : 'auto');
    };
    if (replanTimerRef.current) clearTimeout(replanTimerRef.current);
    replanTimerRef.current = setTimeout(fire, REPLAN_DEBOUNCE_MS);
  }, []);
  useEffect(
    () => () => {
      if (replanTimerRef.current) clearTimeout(replanTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!map) return;
    let cancelled = false;
    void loadAmap().then((AMap) => {
      if (!cancelled) setAmapNs(AMap);
    });
    return () => {
      cancelled = true;
    };
  }, [map]);

  // 管理器实例生命周期
  useEffect(() => {
    if (!map || !amapNs) return;
    const markers = new MarkerManager(amapNs, map);
    const renderer = new RouteRenderer(amapNs, map);
    markersRef.current = markers;
    rendererRef.current = renderer;
    return () => {
      markers.destroy();
      renderer.destroy();
      markersRef.current = null;
      rendererRef.current = null;
    };
  }, [map, amapNs]);

  // 标记同步（计划 / 结果 / 选中态变化时）
  useEffect(() => {
    const markers = markersRef.current;
    if (!markers) return;
    markers.sync(
      plan,
      result,
      {
        onDragEnd: (id, lng, lat) => {
          updateStop(id, { lng, lat });
          scheduleReplan();
        },
        onClick: (id) => selectStop(id),
      },
      selectedStopId,
      !stale,
    );
  }, [plan, result, stale, selectedStopId, amapNs, updateStop, selectStop, scheduleReplan]);

  // 路线渲染 + 聚焦高亮 + 全景适配（仅在求解结果变化时重置视野，避免编辑途中地图跳动）
  const lastFitKeyRef = useRef<string>('');
  useEffect(() => {
    const renderer = rendererRef.current;
    const markers = markersRef.current;
    if (!renderer) return;
    let cancelled = false;
    const fitKey = `${result?.generatedAt ?? 'none'}|${plan.stops.length}|${plan.start.lng},${plan.start.lat}`;
    void renderer.render(plan, result).then(() => {
      if (cancelled) return;
      // 重新渲染后恢复聚焦高亮（新结果产生时聚焦已被清空）
      const focus = useAppStore.getState().focusedLegIndex;
      renderer.highlightLeg(focus);
      if (fitKey !== lastFitKeyRef.current) {
        lastFitKeyRef.current = fitKey;
        const targets =
          focus !== null
            ? renderer.getLegOverlays(focus)
            : [...(markers?.getOverlays() ?? []), ...renderer.getOverlays()];
        if (targets.length > 0) fitView(map, targets, focus !== null ? [90, 90, 90, 90] : [100, 100, 100, 100]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [plan, result, amapNs, map]);

  // 时间轴点击路段 → 聚焦该段：缩放视野 + 高亮（其余段变暗）
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !map) return;
    renderer.highlightLeg(focusedLegIndex);
    if (focusedLegIndex !== null) {
      const overlays = renderer.getLegOverlays(focusedLegIndex);
      if (overlays.length > 0) fitView(map, overlays, [90, 90, 90, 90]);
    }
  }, [focusedLegIndex, amapNs, map, result]);

  // 点击地图空白处取消聚焦
  useEffect(() => {
    if (!map) return;
    const m = map as any;
    const onMapClick = () => useAppStore.getState().focusLeg(null);
    m.on('click', onMapClick);
    return () => {
      try {
        m.off('click', onMapClick);
      } catch {
        // 忽略
      }
    };
  }, [map]);

  // 点击地图加点 / 设起点
  useEffect(() => {
    if (!map || !amapNs || !pickTarget) return;
    const destroy = setupClickToAdd(map, (lng, lat) => {
      const target = pickTarget;
      setPickTarget(null);
      void (async () => {
        let name = target === 'start' ? '起点' : `点位 ${stopsRef.current.length + 1}`;
        try {
          const r = await regeo(lng, lat);
          if (r.name) name = r.name.slice(0, 30);
        } catch {
          // 逆地理失败时使用默认名
        }
        if (target === 'start') setStart({ name, lng, lat });
        else addStop(createStop({ name, lng, lat }));
      })();
    });
    return destroy;
  }, [map, amapNs, pickTarget, setPickTarget, setStart, addStop]);

  // Esc 取消点选模式
  useEffect(() => {
    if (!pickTarget) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPickTarget(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pickTarget, setPickTarget]);

  // 选中点位时定位
  useEffect(() => {
    if (!map || !selectedStopId) return;
    const stop = stopsRef.current.find((s) => s.id === selectedStopId);
    if (stop) panTo(map, stop.lng, stop.lat);
  }, [map, selectedStopId]);

  if (error === 'NO_AMAP_KEY') {
    return <div className="map-placeholder">尚未配置高德 Key —— 请点击右上角「⚙ 设置」完成配置</div>;
  }
  if (error) {
    return <div className="map-placeholder">地图加载失败：{error}</div>;
  }

  return (
    <div className={`map-root${pickTarget ? ' map-picking' : ''}`}>
      <div ref={containerRef} className="map-container" />
      {pickTarget && (
        <div className="map-pick-hint">
          {pickTarget === 'start' ? '点击地图设置起点' : '点击地图添加点位'} · 按 Esc 取消
        </div>
      )}
      {!ready && <div className="map-placeholder">地图加载中…</div>}
    </div>
  );
}
