import { useState } from 'react';
import { Toolbar } from './ui/Toolbar';
import { Sidebar } from './ui/Sidebar';
import { MapView } from './map/MapView';
import { KeySetup } from './ui/KeySetup';
import { hasAmapKey } from './services/amapLoader';
import { useAppStore } from './model/store';

export default function App() {
  const [showKeySetup, setShowKeySetup] = useState(!hasAmapKey());
  const error = useAppStore((s) => s.error);
  const dismissError = useAppStore((s) => s.dismissError);

  if (showKeySetup) {
    return <KeySetup onCancel={hasAmapKey() ? () => setShowKeySetup(false) : undefined} />;
  }

  return (
    <div className="app">
      <Toolbar onOpenKeySetup={() => setShowKeySetup(true)} />
      <div className="app-body">
        <Sidebar />
        <main className="map-wrap">
          <MapView />
        </main>
      </div>
      {error && (
        <div className="toast">
          <span>{error === 'NO_AMAP_KEY' ? '需要先配置高德 Key 才能规划' : error}</span>
          {error === 'NO_AMAP_KEY' && (
            <button
              className="btn small"
              onClick={() => {
                dismissError();
                setShowKeySetup(true);
              }}
            >
              去配置
            </button>
          )}
          <button className="btn small ghost" onClick={dismissError}>
            关闭
          </button>
        </div>
      )}
    </div>
  );
}
