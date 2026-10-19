/** 顶部工具栏：方案参数、自动规划 / 按当前顺序生成、导出菜单 */

import { useAppStore } from '../model/store';
import { TRAVEL_MODE_LABEL, type TravelMode } from '../model/types';
import { formatMin, tryParseTimeToMin } from '../utils/time';
import { buildMarkdown } from '../export/markdown';
import { buildPlaintext } from '../export/plaintext';
import { copyText, downloadText, safeFileName } from '../export/download';
import { buildArchive, parseArchive } from '../model/persist';

const MODES: TravelMode[] = ['mixed', 'walking', 'transit', 'riding', 'driving'];

export function Toolbar({ onOpenKeySetup }: { onOpenKeySetup: () => void }) {
  const plan = useAppStore((s) => s.plan);
  const result = useAppStore((s) => s.result);
  const stale = useAppStore((s) => s.stale);
  const running = useAppStore((s) => s.running);
  const progress = useAppStore((s) => s.progress);
  const warnings = useAppStore((s) => s.warnings);
  const setName = useAppStore((s) => s.setName);
  const setDate = useAppStore((s) => s.setDate);
  const setDepartMin = useAppStore((s) => s.setDepartMin);
  const setMode = useAppStore((s) => s.setMode);
  const setReturnToStart = useAppStore((s) => s.setReturnToStart);
  const run = useAppStore((s) => s.run);
  const replaceAll = useAppStore((s) => s.replaceAll);

  const baseName = () => safeFileName(`${plan.name}_${plan.date}`);

  const exportMd = () => {
    if (result) downloadText(`${baseName()}.md`, buildMarkdown(plan, result), 'text/markdown;charset=utf-8');
  };
  const exportTxt = () => {
    if (result) downloadText(`${baseName()}.txt`, buildPlaintext(plan, result));
  };
  const copyTxt = async () => {
    if (result) await copyText(buildPlaintext(plan, result));
  };
  const exportJson = () => {
    downloadText(`${baseName()}.json`, buildArchive(plan, result), 'application/json;charset=utf-8');
  };
  const importJson = async (file: File) => {
    try {
      const archive = parseArchive(await file.text());
      replaceAll(archive.plan, archive.result ?? null);
    } catch (e) {
      useAppStore.setState({ error: `导入失败：${e instanceof Error ? e.message : String(e)}` });
    }
  };

  const noStops = plan.stops.length === 0;

  return (
    <header className="toolbar">
      <div className="toolbar-row">
        <input
          className="plan-name"
          value={plan.name}
          onChange={(e) => setName(e.target.value)}
          title="方案名称"
        />
        <input
          type="date"
          value={plan.date}
          onChange={(e) => setDate(e.target.value)}
          title="日期（影响日出日落与公交参考时刻）"
        />
        <label className="field">
          出发
          <input
            type="time"
            value={formatMin(plan.departMin)}
            onChange={(e) => {
              const m = tryParseTimeToMin(e.target.value);
              if (m !== null) setDepartMin(m);
            }}
          />
        </label>
        <select value={plan.mode} onChange={(e) => setMode(e.target.value as TravelMode)} title="交通方式">
          {MODES.map((m) => (
            <option key={m} value={m}>
              {TRAVEL_MODE_LABEL[m]}
            </option>
          ))}
        </select>
        <label className="check" title="行程末尾回到起点">
          <input type="checkbox" checked={plan.returnToStart} onChange={(e) => setReturnToStart(e.target.checked)} />
          回起点
        </label>

        <div className="spacer" />

        <button className="btn primary" disabled={running || noStops} onClick={() => void run('auto')}>
          ⚡ 自动规划
        </button>
        <button className="btn" disabled={running || noStops} onClick={() => void run('manual')}>
          按当前顺序生成
        </button>

        <details className="dropdown">
          <summary className="btn">导出 ▾</summary>
          <div className="menu">
            <button className="menu-item" disabled={!result} onClick={exportMd}>
              下载 Markdown（完整版）
            </button>
            <button className="menu-item" disabled={!result} onClick={exportTxt}>
              下载 TXT（纯文本）
            </button>
            <button className="menu-item" disabled={!result} onClick={() => void copyTxt()}>
              复制 TXT 到剪贴板
            </button>
            <div className="menu-sep" />
            <button className="menu-item" onClick={exportJson}>
              导出 JSON 存档（含计划+结果）
            </button>
            <label className="menu-item">
              导入 JSON 存档
              <input
                type="file"
                accept=".json,application/json"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importJson(f);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        </details>

        <button className="btn icon" onClick={onOpenKeySetup} title="设置高德 Key">
          ⚙
        </button>
      </div>

      {(running || stale || warnings.length > 0) && (
        <div className="toolbar-status">
          {running && (
            <span className="status running">
              正在请求高德路径数据…
              {progress ? ` ${progress.done}/${progress.total}` : ''}
            </span>
          )}
          {!running && stale && <span className="status stale">计划已修改，结果待重算（点击「自动规划」或「按当前顺序生成」）</span>}
          {!running &&
            warnings.map((w) => (
              <span key={w} className="status warn">
                ⚠ {w}
              </span>
            ))}
        </div>
      )}
    </header>
  );
}
