/** 单点编辑卡片：名称 / 停留时长 / 时间窗（绝对 or 日落相对）/ 备注 */

import { useState } from 'react';
import { useAppStore } from '../model/store';
import type { Stop, TimeWindow } from '../model/types';
import { formatMin, tryParseTimeToMin } from '../utils/time';
import { getSunTimes } from '../constraints/sunTimes';

interface Props {
  stop: Stop;
  index: number;
  /** 访问顺序（与地图徽标/时间轴一致）；无新鲜结果时为 null，显示列表位置 */
  visitIndex: number | null;
  onDragStart(): void;
  onDragOver(e: React.DragEvent): void;
  onDrop(): void;
}

function newWindow(partial: Partial<TimeWindow>): TimeWindow {
  return {
    id: `w-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    kind: 'absolute',
    startMin: 9 * 60,
    endMin: 18 * 60,
    hardness: 'hard',
    penaltyPerMin: 3,
    ...partial,
  };
}

export function StopCard({ stop, index, visitIndex, onDragStart, onDragOver, onDrop }: Props) {
  const updateStop = useAppStore((s) => s.updateStop);
  const removeStop = useAppStore((s) => s.removeStop);
  const setStopWindow = useAppStore((s) => s.setStopWindow);
  const selectStop = useAppStore((s) => s.selectStop);
  const selectedStopId = useAppStore((s) => s.selectedStopId);
  const planDate = useAppStore((s) => s.plan.date);

  const [expanded, setExpanded] = useState(false);
  const selected = selectedStopId === stop.id;
  const w = stop.windows[0];
  const kind = w?.kind ?? 'none';

  const setKind = (k: 'none' | 'absolute' | 'sunset-relative') => {
    if (k === 'none') setStopWindow(stop.id, null);
    else if (k === 'absolute')
      setStopWindow(stop.id, newWindow(w?.kind === 'absolute' ? { ...w } : {}));
    else
      setStopWindow(
        stop.id,
        newWindow({
          kind: 'sunset-relative',
          offsetStartMin: w?.kind === 'sunset-relative' ? w.offsetStartMin : -30,
          offsetEndMin: w?.kind === 'sunset-relative' ? w.offsetEndMin : 30,
        }),
      );
  };

  const patchWindow = (patch: Partial<TimeWindow>) => {
    if (w) setStopWindow(stop.id, { ...w, ...patch, id: w.id });
  };

  const sunPreview = (() => {
    if (kind !== 'sunset-relative') return null;
    const sun = getSunTimes(stop.lat, stop.lng, planDate);
    if (!sun) return null;
    const start = sun.sunsetMin + (w?.offsetStartMin ?? -30);
    const end = sun.sunsetMin + (w?.offsetEndMin ?? 30);
    return `日落 ${formatMin(sun.sunsetMin)} → 窗口 ${formatMin(Math.min(start, end))}–${formatMin(Math.max(start, end))}（蓝调 ${formatMin(sun.sunsetMin)}–${formatMin(sun.duskMin)}）`;
  })();

  const windowSummary = (() => {
    if (!w) return '无窗口限制';
    const hard = w.hardness === 'hard' ? '硬窗' : '软窗';
    if (w.kind === 'absolute') return `${formatMin(w.startMin)}–${formatMin(w.endMin)} ${hard}`;
    return `日落${(w.offsetStartMin ?? -30) >= 0 ? '+' : ''}${w.offsetStartMin ?? -30} ~ ${(w.offsetEndMin ?? 30) >= 0 ? '+' : ''}${w.offsetEndMin ?? 30}min ${hard}`;
  })();

  return (
    <div
      className={`stop-card${selected ? ' selected' : ''}`}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={() => {
        selectStop(stop.id);
      }}
    >
      <div className="stop-head">
        <span className="drag-handle" draggable onDragStart={onDragStart} title="拖拽排序（手动生成路线的顺序）">
          ⠿
        </span>
        <span className="stop-idx">{index}</span>
        <input
          className="stop-name"
          value={stop.name}
          onChange={(e) => updateStop(stop.id, { name: e.target.value })}
          onClick={(e) => e.stopPropagation()}
        />
        <button
          className="btn tiny ghost"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
        >
          {expanded ? '收起' : '编辑'}
        </button>
        <button
          className="btn tiny ghost danger"
          onClick={(e) => {
            e.stopPropagation();
            removeStop(stop.id);
          }}
          title="删除点位"
        >
          ✕
        </button>
      </div>

      <div className="stop-summary">
        {visitIndex !== null && <span className="visit-tag">第{visitIndex}站</span>}
        {windowSummary} · 停留 {stop.dwellMin}min
      </div>

      {expanded && (
        <div className="stop-body" onClick={(e) => e.stopPropagation()}>
          <label className="field-inline">
            停留
            <input
              type="number"
              min={0}
              max={480}
              value={stop.dwellMin}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v) && v >= 0) updateStop(stop.id, { dwellMin: Math.round(v) });
              }}
            />
            分钟
          </label>

          <label className="field-inline">
            打卡窗口
            <select value={kind} onChange={(e) => setKind(e.target.value as 'none' | 'absolute' | 'sunset-relative')}>
              <option value="none">无限制</option>
              <option value="absolute">绝对时间窗</option>
              <option value="sunset-relative">日落相对窗</option>
            </select>
          </label>

          {w && w.kind === 'absolute' && (
            <label className="field-inline">
              起止
              <input
                type="time"
                value={formatMin(w.startMin)}
                onChange={(e) => {
                  const m = tryParseTimeToMin(e.target.value);
                  if (m !== null) patchWindow({ startMin: m });
                }}
              />
              ~
              <input
                type="time"
                value={formatMin(w.endMin)}
                onChange={(e) => {
                  const m = tryParseTimeToMin(e.target.value);
                  if (m !== null) patchWindow({ endMin: m });
                }}
              />
            </label>
          )}

          {w && w.kind === 'sunset-relative' && (
            <label className="field-inline">
              相对日落
              <input
                type="number"
                className="num-sm"
                value={w.offsetStartMin ?? -30}
                onChange={(e) => patchWindow({ offsetStartMin: Math.round(Number(e.target.value)) || 0 })}
              />
              ~
              <input
                type="number"
                className="num-sm"
                value={w.offsetEndMin ?? 30}
                onChange={(e) => patchWindow({ offsetEndMin: Math.round(Number(e.target.value)) || 0 })}
              />
              分钟
            </label>
          )}

          {w && (
            <label className="field-inline">
              约束
              <select
                value={w.hardness}
                onChange={(e) => patchWindow({ hardness: e.target.value as 'hard' | 'soft' })}
              >
                <option value="hard">硬窗（晚到不可行）</option>
                <option value="soft">软窗（晚到仅提示）</option>
              </select>
            </label>
          )}

          {sunPreview && <div className="sun-preview">{sunPreview}</div>}

          <label className="field-inline">
            备注
            <input
              value={stop.note ?? ''}
              placeholder="机位/参考图/注意事项"
              onChange={(e) => updateStop(stop.id, { note: e.target.value })}
            />
          </label>
        </div>
      )}
    </div>
  );
}
