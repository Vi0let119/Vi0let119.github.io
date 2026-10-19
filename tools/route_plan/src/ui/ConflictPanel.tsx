/** 冲突面板：硬窗晚到点位的说明与建议 */

import type { Conflict } from '../model/types';

export function ConflictPanel({ conflicts }: { conflicts: Conflict[] }) {
  return (
    <section className="conflicts">
      <h3>⚠ 时间窗冲突（{conflicts.length}）</h3>
      {conflicts.map((c) => (
        <div key={c.stopId} className="conflict-item">
          <strong>{c.stopName}</strong>
          <p>{c.suggestion}</p>
        </div>
      ))}
    </section>
  );
}
