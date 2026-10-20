/** 结果时间轴：起点 → 第 1 站 → … （到达/离开/等待 + 逐段交通与换乘明细），与地图双向联动 */

import { useAppStore } from '../model/store';
import type { LegResult, Plan, RouteResult } from '../model/types';
import { TRAVEL_MODE_LABEL } from '../model/types';
import { transitSegmentsDetailed, transitSplitSums, transitSplitText } from '../model/transitText';
import { formatDistance, formatDuration, formatMin } from '../utils/time';
import { legColor } from '../map/legStyles';

function legLabel(leg: LegResult): string {
  const est = leg.estimated ? '（估算）' : '';
  let base = `${TRAVEL_MODE_LABEL[leg.mode]} ${formatDistance(leg.distanceM)} · ${formatDuration(leg.durationMin)}`;
  if (leg.transitSegments && leg.transitSegments.length > 0) {
    // 把步行与乘车的时间/距离分开：如「步行 3.5km · 57m ｜ 乘车 3.2km · 20m」
    const split = transitSplitText(transitSplitSums(leg.transitSegments));
    if (split) base += `（${split}）`;
  }
  return base + est;
}

/**
 * 路段行：颜色圆点与地图线条同色（legStyles.legColor）。
 * 点击（含下方换乘子步骤）= 在地图上聚焦该段路线（缩放 + 高亮）。
 */
function LegLine({
  leg,
  legIndex,
  prefix = '',
  onFocus,
  focused,
}: {
  leg: LegResult;
  legIndex: number;
  prefix?: string;
  onFocus: (index: number) => void;
  focused: boolean;
}) {
  return (
    <>
      <button
        type="button"
        className={`tl-leg tl-leg-btn${focused ? ' focused' : ''}`}
        onClick={() => onFocus(legIndex)}
        title="在地图上聚焦该段路线"
      >
        <span className="leg-dot" style={{ background: legColor(legIndex) }} />
        {prefix}
        {legLabel(leg)}
      </button>
      {leg.transitSegments && leg.transitSegments.length > 0 && (
        <div className="tl-segs">
          {transitSegmentsDetailed(leg.transitSegments).map((d, si) => (
            <button
              type="button"
              key={si}
              className="tl-seg tl-seg-btn"
              title={`${d.instruction ?? ''}（点击在地图上聚焦该段路线）`}
              onClick={() => onFocus(legIndex)}
            >
              <span className="seg-icon">{d.icon}</span>
              <span>{d.text}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

const SOLVER_LABEL: Record<RouteResult['solver'], string> = {
  'exact-dp': '自动 · 精确最优',
  heuristic: '自动 · 启发式',
  manual: '手动顺序',
};

export function Timeline({ plan, result }: { plan: Plan; result: RouteResult }) {
  const selectStop = useAppStore((s) => s.selectStop);
  const selectedStopId = useAppStore((s) => s.selectedStopId);
  const focusedLegIndex = useAppStore((s) => s.focusedLegIndex);
  const focusLeg = useAppStore((s) => s.focusLeg);

  return (
    <section className="timeline">
      <h2>
        时刻表 <span className="solver-tag">{SOLVER_LABEL[result.solver]}</span>
      </h2>
      <div className="tl-overview">
        出发 {formatMin(result.departMin)} · 收工 {formatMin(result.stats.finishMin)} · 总里程{' '}
        {formatDistance(result.stats.totalDistanceM)} · 总耗时 {formatDuration(result.stats.totalElapsedMin)}
        {result.stats.totalWaitMin > 0 ? `（含等待 ${formatDuration(result.stats.totalWaitMin)}）` : ''}
      </div>

      {/* 起点（出发）与其后的第一段路程 */}
      <div className="tl-entry tl-start">
        <span className="tl-idx tl-idx-start">起</span>
        <span className="tl-name">{plan.start.name ?? '起点'}</span>
        <span className="tl-time">{formatMin(result.departMin)} 出发</span>
      </div>
      {result.legs[0] && (
        <LegLine
          leg={result.legs[0]}
          legIndex={0}
          onFocus={focusLeg}
          focused={focusedLegIndex === 0}
        />
      )}

      {result.schedule.map((e, i) => {
        const conflict = result.conflicts.some((c) => c.stopId === e.stopId);
        const selected = selectedStopId === e.stopId;
        return (
          <div key={e.stopId}>
            {i > 0 && result.legs[i] && (
              <LegLine
                leg={result.legs[i]}
                legIndex={i}
                onFocus={focusLeg}
                focused={focusedLegIndex === i}
              />
            )}
            <button
              className={`tl-entry${selected ? ' selected' : ''}${conflict ? ' conflict' : ''}`}
              onClick={() => selectStop(e.stopId)}
            >
              <span className="tl-idx">{i + 1}</span>
              <span className="tl-name">{e.name}</span>
              <span className="tl-time">
                {formatMin(e.arriveMin)} → {formatMin(e.departMin)}
              </span>
              {e.waitMin > 0 && (
                <span className="tl-wait" title="早到等待">
                  ⏳{formatDuration(e.waitMin)}
                </span>
              )}
              {e.penaltyMin > 0 && (
                <span className="tl-pen" title="软窗迟到罚分">
                  罚{Math.round(e.penaltyMin)}
                </span>
              )}
              {conflict && (
                <span className="tl-warn" title="硬窗晚到">
                  ⚠
                </span>
              )}
            </button>
          </div>
        );
      })}

      {result.returnLeg && (
        <>
          <LegLine
            leg={result.returnLeg}
            legIndex={result.legs.length}
            prefix="回起点 "
            onFocus={focusLeg}
            focused={focusedLegIndex === result.legs.length}
          />
          <button
            type="button"
            className={`tl-leg tl-return tl-leg-btn${focusedLegIndex === result.legs.length ? ' focused' : ''}`}
            onClick={() => focusLeg(result.legs.length)}
            title="在地图上聚焦回程路线"
          >
            回到起点 {formatMin(result.returnLeg.arriveMin)}
          </button>
        </>
      )}
    </section>
  );
}
