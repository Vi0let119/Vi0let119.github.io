/** POI 搜索加点 */

import { useState } from 'react';
import { createStop, useAppStore } from '../model/store';
import { searchPoi, type PoiItem } from '../services/amapPoi';

export function SearchBox() {
  const addStop = useAppStore((s) => s.addStop);
  const [kw, setKw] = useState('');
  const [items, setItems] = useState<PoiItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    const q = kw.trim();
    if (!q || busy) return;
    setBusy(true);
    setErr(null);
    try {
      setItems(await searchPoi(q));
    } catch (e) {
      setErr(`搜索失败：${e instanceof Error ? e.message : String(e)}`);
      setItems([]);
    } finally {
      setBusy(false);
    }
  };

  const pick = (item: PoiItem) => {
    addStop(createStop({ name: item.name || '未命名点', lng: item.lng, lat: item.lat }));
    setItems([]);
    setKw('');
  };

  return (
    <div className="searchbox">
      <div className="search-row">
        <input
          value={kw}
          placeholder="搜索地点（如：武康路、外滩）"
          onChange={(e) => setKw(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit();
          }}
        />
        <button className="btn" disabled={busy} onClick={() => void submit()}>
          {busy ? '…' : '搜索'}
        </button>
      </div>
      {err && <div className="form-err">{err}</div>}
      {items.length > 0 && (
        <ul className="poi-list">
          {items.map((p) => (
            <li key={`${p.id}-${p.lng}-${p.lat}`}>
              <button className="poi-item" onClick={() => pick(p)}>
                <span className="poi-name">{p.name}</span>
                <span className="poi-addr">{p.address}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
