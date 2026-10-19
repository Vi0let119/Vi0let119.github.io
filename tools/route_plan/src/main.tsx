import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { mountSiteChrome } from './siteChrome';
import './styles.css';

// 发布版把页面接入站点外壳（侧栏 + 主题）；dev 下为空操作
mountSiteChrome();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
