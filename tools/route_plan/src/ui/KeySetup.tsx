/** 高德 Key 配置引导页 */

import { useState } from 'react';
import { getAmapKey, getAmapSecurityCode, saveAmapConfig } from '../services/amapLoader';

export function KeySetup({ onCancel }: { onCancel?: () => void }) {
  const [key, setKey] = useState(getAmapKey());
  const [code, setCode] = useState(getAmapSecurityCode());
  const [err, setErr] = useState<string | null>(null);

  const save = () => {
    if (!key.trim()) {
      setErr('请填写 Key');
      return;
    }
    saveAmapConfig(key, code);
    // 重新加载页面以应用新的 Key 与地图实例
    window.location.reload();
  };

  return (
    <div className="keysetup">
      <div className="keysetup-card">
        <h1>配置高德地图 Key</h1>
        <p className="hint">本项目使用高德 JS API 2.0（免费申请，约 5 分钟）。Key 仅保存在你的浏览器本地（localStorage），不会上传。</p>
        <ol className="steps">
          <li>
            打开 <a href="https://console.amap.com/dev/key/app" target="_blank" rel="noreferrer">高德开放平台控制台</a> →
            应用管理 → 我的应用 → 创建新应用
          </li>
          <li>
            添加 Key，服务平台选 <b>Web端(JS API)</b>；创建后会同时得到 <b>Key</b> 和 <b>安全密钥(jscode)</b>
          </li>
          <li>把两者填入下方并保存（本地开发也可写入 .env.local）</li>
        </ol>
        <label className="field-block">
          Key（Web端 JS API）
          <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="例如 a1b2c3..." spellCheck={false} />
        </label>
        <label className="field-block">
          安全密钥 jscode
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="例如 d4e5f6..." spellCheck={false} />
        </label>
        {err && <div className="form-err">{err}</div>}
        <div className="row">
          <button className="btn primary" onClick={save}>
            保存并进入
          </button>
          {onCancel && (
            <button className="btn" onClick={onCancel}>
              取消
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
