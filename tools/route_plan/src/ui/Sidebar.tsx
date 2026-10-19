/** 左侧面板：搜索加点、起点卡片、点位列表（拖拽排序）、冲突与时间轴 */

import { useMemo, useState } from 'react';
import { useAppStore } from '../model/store';
import { visitIndexByStopId } from '../model/visitOrder';
import { SearchBox } from './SearchBox';
import { StopCard } from './StopCard';
import { Timeline } from './Timeline';
import { ConflictPanel } from './ConflictPanel';

export function Sidebar() {
  const plan = useAppStore((s) => s.plan);
  const result = useAppStore((s) => s.result);
  const stale = useAppStore((s) => s.stale);
  const setPickTarget = useAppStore((s) => s.setPickTarget);
  const pickTarget = useAppStore((s) => s.pickTarget);
  const reorderStops = useAppStore((s) => s.reorderStops);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // 有新鲜结果时：卡片小标与地图徽标、时间轴统一为「访问顺序」
  const visitIdx = useMemo(() => (!stale ? visitIndexByStopId(result) : null), [result, stale]);

  return (
    <aside className="sidebar">
      <SearchBox />

      <div className="start-card">
        <div className="start-row">
          <span className="badge-start">起</span>
          <span className="start-name" title={plan.start.name ?? ''}>
            {plan.start.name ?? '未命名起点'}
          </span>
          <button
            className={`btn tiny${pickTarget === 'start' ? ' active' : ''}`}
            onClick={() => setPickTarget(pickTarget === 'start' ? null : 'start')}
          >
            地图点选
          </button>
        </div>
        <div className="start-coords">
          {plan.start.lng.toFixed(5)}, {plan.start.lat.toFixed(5)}
        </div>
      </div>

      <div className="stops-head">
        <span>点位（{plan.stops.length}）</span>
        <button
          className={`btn tiny${pickTarget === 'stop' ? ' active' : ''}`}
          onClick={() => setPickTarget(pickTarget === 'stop' ? null : 'stop')}
        >
          + 地图选点
        </button>
      </div>
      {plan.stops.length > 1 && <div className="stops-hint">拖拽卡片可调整顺序；「按当前顺序生成」即为手动路线</div>}

      <div className="stops-list">
        {plan.stops.length === 0 && (
          <p className="empty-hint">用上方搜索或「地图选点」添加机位；也可在点位卡片里设置打卡时间窗（支持日落相对窗）</p>
        )}
        {plan.stops.map((stop, i) => (
          <StopCard
            key={stop.id}
            stop={stop}
            index={i + 1}
            visitIndex={visitIdx?.get(stop.id) ?? null}
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragIndex !== null) reorderStops(dragIndex, i);
              setDragIndex(null);
            }}
          />
        ))}
      </div>

      <ResultSection />
    </aside>
  );
}

function ResultSection() {
  const result = useAppStore((s) => s.result);
  const plan = useAppStore((s) => s.plan);
  if (!result) return null;
  return (
    <div className="result-section">
      {result.conflicts.length > 0 && <ConflictPanel conflicts={result.conflicts} />}
      <Timeline plan={plan} result={result} />
    </div>
  );
}
