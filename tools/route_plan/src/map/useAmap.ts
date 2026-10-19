/** 高德地图实例生命周期管理 */

import { useEffect, useState, type RefObject } from 'react';
import { hasAmapKey, loadAmap } from '../services/amapLoader';
import { DEFAULT_START } from '../model/defaults';

export interface AmapMapHandle {
  map: unknown;
  ready: boolean;
  error: string | null;
}

export function useAmap(containerRef: RefObject<HTMLDivElement>): AmapMapHandle {
  const [map, setMap] = useState<unknown>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasAmapKey()) {
      setError('NO_AMAP_KEY');
      return;
    }
    let disposed = false;
    let instance: any = null;

    loadAmap()
      .then((AMap: any) => {
        if (disposed || !containerRef.current) return;
        instance = new AMap.Map(containerRef.current, {
          zoom: 14,
          center: [DEFAULT_START.lng, DEFAULT_START.lat],
          viewMode: '2D',
          // 暗色底图，与站点「墨色 × 铜金」主题一致（改回 'amap://styles/normal' 即恢复默认）
          mapStyle: 'amap://styles/dark',
        });
        setMap(instance);
        setReady(true);
      })
      .catch((e: unknown) => {
        if (!disposed) setError(e instanceof Error ? e.message : String(e));
      });

    return () => {
      disposed = true;
      try {
        instance?.destroy();
      } catch {
        // 忽略销毁异常
      }
    };
  }, [containerRef]);

  return { map, ready, error };
}
