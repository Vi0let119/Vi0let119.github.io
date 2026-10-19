/**
 * AI 图表助手 — DeepSeek 驱动的智能图表生成
 * 支持：多轮对话 / 文件上传 / API Key 配置 / HTML 下载
 */

(function () {
  'use strict';

  // ── 配置 ────────────────────────────────────
  const API_BASE = 'http://localhost:5000';

  // ── DOM ───────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const chatMessages   = $('#chatMessages');
  const chatInput      = $('#chatInput');
  const sendBtn        = $('#sendBtn');
  const chatLoading    = $('#chatLoading');
  const fileUpload      = $('#fileUpload');
  const filePreviewBar  = $('#filePreviewBar');
  const filePreviewCount = $('#filePreviewCount');
  const filePreviewList = $('#filePreviewList');
  const filePreviewToggle = $('#filePreviewToggle');
  const filePreviewClear = $('#filePreviewClear');
  const settingsBtn    = $('#settingsBtn');
  const settingsPanel  = $('#settingsPanel');
  const apiSource      = $('#apiSource');
  const providerSelect = $('#providerSelect');
  const apiKeyInput    = $('#apiKeyInput');
  const customApiRow   = $('#customApiRow');
  const customKeyRow   = $('#customKeyRow');
  const settingsSave   = $('#settingsSave');
  const chartContainer = $('#chartContainer');
  const chartStatus    = $('#chartStatus');
  const downloadBtn    = $('#downloadBtn');
  const emptyState     = $('#emptyState');

  // ── State ─────────────────────────────────
  let chartInstance = null;      // ECharts 实例
  let d3Iframe = null;           // D3 iframe 元素
  let currentChartType = null;   // 'echarts' | 'd3'
  let currentOption = null;      // ECharts option（深色预览用）
  let currentOptionLight = null; // ECharts option（浅色下载成品用）
  let currentD3HTML = null;      // D3 完整 HTML
  let isProcessing = false;
  let uploadedFiles = [];        // [{name, content, size}, ...]

  const state = {
    apiSource: 'site',        // 'site' | 'custom'
    provider: 'deepseek',
    apiKey: '',
    history: [],              // [{role, content}, ...]
  };

  // ── Init ──────────────────────────────────
  function init() {
    loadSettings();
    initChart();
    bindEvents();
  }

  function initChart() {
    // 懒初始化：不在启动时创建 ECharts 实例，等有图表数据时再创建
    window.addEventListener('resize', () => {
      if (chartInstance && !chartInstance.isDisposed()) chartInstance.resize();
      // D3 iframe 自行处理 resize
    });
  }

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem('chart_ai_settings'));
      if (saved) {
        state.apiSource = saved.apiSource || 'site';
        state.provider = saved.provider || 'deepseek';
        state.apiKey = saved.apiKey || '';
        apiSource.value = state.apiSource;
        providerSelect.value = state.provider;
        apiKeyInput.value = state.apiKey;
      }
    } catch (e) { /* ignore */ }
    updateSettingsUI();
  }

  function saveSettings() {
    state.apiSource = apiSource.value;
    state.provider = providerSelect.value;
    state.apiKey = apiKeyInput.value;
    localStorage.setItem('chart_ai_settings', JSON.stringify({
      apiSource: state.apiSource,
      provider: state.provider,
      apiKey: state.apiKey,
    }));
    updateSettingsUI();
  }

  function updateSettingsUI() {
    const isCustom = apiSource.value === 'custom';
    customApiRow.classList.toggle('hidden', !isCustom);
    customKeyRow.classList.toggle('hidden', !isCustom);
  }

  // ── Events ────────────────────────────────
  function bindEvents() {
    // Send
    sendBtn.addEventListener('click', handleSend);
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });

    // 输入框高度自适应
    chatInput.addEventListener('input', autoResize);

    // Settings
    settingsBtn.addEventListener('click', () => {
      settingsPanel.classList.toggle('hidden');
    });
    apiSource.addEventListener('change', updateSettingsUI);
    settingsSave.addEventListener('click', () => {
      saveSettings();
      settingsPanel.classList.add('hidden');
    });

    // File upload
    fileUpload.addEventListener('change', (e) => {
      if (e.target.files.length > 0) handleFilesUpload(e.target.files);
    });
    filePreviewClear.addEventListener('click', clearAllFiles);
    filePreviewToggle.addEventListener('click', toggleFileList);

    // Download
    downloadBtn.addEventListener('click', downloadHTML);
  }

  function autoResize() {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
  }

  // ── File Handling ─────────────────────────
  /**
   * 批量处理用户选择的文件
   * 跳过不支持的格式，异步读取每个文件
   */
  async function handleFilesUpload(fileList) {
    const supported = ['.txt', '.csv', '.xlsx', '.xls', '.json'];
    let skipped = 0;

    for (const file of fileList) {
      const name = file.name.toLowerCase();
      const ext = supported.find(e => name.endsWith(e));
      if (!ext) {
        skipped++;
        continue;
      }

      // 跳过重复文件（按 name + size 判断）
      if (uploadedFiles.some(f => f.name === file.name && f.size === file.size)) {
        continue;
      }

      try {
        const content = await readFileContent(file, ext);
        uploadedFiles.push({ name: file.name, content, size: file.size });
      } catch (err) {
        addSystemMessage(`读取失败：${file.name} — ${err.message}`);
      }
    }

    fileUpload.value = '';
    refreshFilePreview();

    const total = uploadedFiles.length;
    if (total > 0) {
      const totalRows = uploadedFiles.reduce((sum, f) => sum + f.content.split('\n').filter(l => l.trim()).length, 0);
      addSystemMessage(`已加载 ${total} 个文件，共 ${totalRows} 行数据`);
    }
    if (skipped > 0) {
      addSystemMessage(`${skipped} 个文件格式不支持，已跳过（支持：${supported.join(' / ')}）`);
    }
  }

  function readFileContent(file, ext) {
    return new Promise((resolve, reject) => {
      if (ext === '.xlsx' || ext === '.xls') {
        // Excel: 用 ArrayBuffer 读取
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            resolve(XLSX.utils.sheet_to_csv(firstSheet, { FS: '\t' }));
          } catch (err) { reject(err); }
        };
        reader.onerror = () => reject(new Error('读取失败'));
        reader.readAsArrayBuffer(file);
      } else if (ext === '.json') {
        // JSON: 读取并转为表格文本
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const parsed = JSON.parse(e.target.result);
            resolve(jsonToTextTable(parsed));
          } catch (err) { reject(err); }
        };
        reader.onerror = () => reject(new Error('读取失败'));
        reader.readAsText(file, 'UTF-8');
      } else {
        // 文本: 直接读取
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(new Error('读取失败'));
        reader.readAsText(file, 'UTF-8');
      }
    });
  }

  /**
   * 将 JSON 数据转换为可读的表格文本
   * 支持：对象数组、命名数组、嵌套对象、简单值
   */
  function jsonToTextTable(data) {
    if (data === null || data === undefined) return '';

    // Case 1: Array of objects
    if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && data[0] !== null) {
      const keys = [];
      const seen = new Set();
      for (const item of data) {
        if (item && typeof item === 'object') {
          for (const k of Object.keys(item)) {
            if (!seen.has(k)) { seen.add(k); keys.push(k); }
          }
        }
      }
      const lines = [keys.join('\t')];
      for (const item of data) {
        const row = keys.map(k => {
          const v = item[k];
          if (v === null || v === undefined) return '';
          if (typeof v === 'object') return JSON.stringify(v);
          return String(v);
        });
        lines.push(row.join('\t'));
      }
      return lines.join('\n');
    }

    // Case 2: Object with named arrays
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const arrayKeys = Object.keys(data).filter(k => Array.isArray(data[k]));
      if (arrayKeys.length >= 2) {
        const maxLen = Math.max(...arrayKeys.map(k => data[k].length));
        const lines = [arrayKeys.join('\t')];
        for (let i = 0; i < maxLen; i++) {
          const row = arrayKeys.map(k => {
            const v = data[k][i];
            if (v === null || v === undefined) return '';
            if (typeof v === 'object') return JSON.stringify(v);
            return String(v);
          });
          lines.push(row.join('\t'));
        }
        return lines.join('\n');
      }
    }

    // Case 3: Fallback — pretty-print
    return JSON.stringify(data, null, 2);
  }

  // ── File preview UI ──
  function refreshFilePreview() {
    if (uploadedFiles.length === 0) {
      filePreviewBar.classList.add('hidden');
      return;
    }
    filePreviewBar.classList.remove('hidden');
    filePreviewCount.textContent = `${uploadedFiles.length} 个文件`;

    // 重建文件列表
    filePreviewList.innerHTML = '';
    uploadedFiles.forEach((f, i) => {
      const li = document.createElement('li');
      li.className = 'file-preview-item';
      li.innerHTML = `
        <span class="file-preview-item-name" title="${escapeHTML(f.name)}">${escapeHTML(f.name)}</span>
        <button class="file-preview-item-remove" data-index="${i}" title="移除">✕</button>
      `;
      li.querySelector('.file-preview-item-remove').addEventListener('click', () => removeFile(i));
      filePreviewList.appendChild(li);
    });
  }

  function removeFile(index) {
    uploadedFiles.splice(index, 1);
    refreshFilePreview();
    if (uploadedFiles.length === 0) {
      addSystemMessage('所有文件已移除');
    }
  }

  function toggleFileList() {
    filePreviewList.classList.toggle('collapsed');
    filePreviewToggle.textContent = filePreviewList.classList.contains('collapsed') ? '▸' : '▾';
  }

  function clearAllFiles() {
    uploadedFiles = [];
    fileUpload.value = '';
    refreshFilePreview();
  }

  // ── Chat ──────────────────────────────────
  async function handleSend() {
    if (isProcessing) return;

    const message = chatInput.value.trim();
    const hasFiles = uploadedFiles.length > 0;

    if (!message && !hasFiles) return;

    // Build display message for chat UI
    let displayMsg = message;
    if (!displayMsg && hasFiles) {
      const names = uploadedFiles.map(f => f.name).join('、');
      displayMsg = `请分析我上传的文件：${names}`;
    }
    if (hasFiles && message) {
      const names = uploadedFiles.map(f => f.name).join('、');
      displayMsg = message + `\n\n[附${uploadedFiles.length}个文件：${names}]`;
    }
    addMessage('user', displayMsg);

    // 检测用户手动粘贴的 JSON 数据，自动转为表格
    let processedMessage = message;
    const stripped = message.trim();
    if ((stripped.startsWith('{') || stripped.startsWith('[')) && stripped.length > 20) {
      try {
        const parsed = JSON.parse(stripped);
        if (parsed && typeof parsed === 'object') {
          const table = jsonToTextTable(parsed);
          if (table && table !== stripped) {
            processedMessage = `请分析以下 JSON 数据并生成图表：\n` + table;
          }
        }
      } catch (e) { /* not JSON, keep as-is */ }
    }

    // Save to history
    state.history.push({ role: 'user', content: processedMessage || `请分析以下数据` });

    // Clear input
    chatInput.value = '';
    autoResize();
    sendBtn.disabled = true;

    // Show loading
    isProcessing = true;
    chatLoading.classList.remove('hidden');
    scrollToBottom();

    // Snapshot files before clearing
    const filesSnapshot = [...uploadedFiles];

    try {
      const payload = {
        message: message || '请分析我上传的数据并生成图表',
        provider: state.apiSource === 'site' ? 'deepseek' : state.provider,
        api_key: state.apiSource === 'custom' ? state.apiKey : '',
        history: state.history.slice(0, -1),
        file_contents: filesSnapshot,  // 多文件数组 [{name, content}, ...]
      };

      // Clear files after sending
      if (hasFiles) {
        const dataSummary = filesSnapshot.map(f =>
          `[文件：${f.name}]\n${f.content.substring(0, 3000)}`
        ).join('\n\n');
        clearAllFiles();
        // Add data info to history
        state.history.push({
          role: 'user',
          content: `[上传的数据]\n${dataSummary}`
        });
      }

      const resp = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await resp.json();

      if (!resp.ok || data.error) {
        throw new Error(data.error || `请求失败 (${resp.status})`);
      }

      // Add bot reply
      addMessage('bot', data.reply);
      state.history.push({ role: 'assistant', content: data.reply });

      // Update chart — 后端提取 + 前端兜底
      let chartType = data.chart_type || null;
      let option = data.option || null;
      let d3HTML = data.d3_html || null;

      // 后端没提取到，前端兜底
      if (!chartType) {
        const fallback = extractChartContent(data.reply);
        if (fallback.chart_type) {
          chartType = fallback.chart_type;
          option = fallback.option;
          d3HTML = fallback.d3_html;
        }
      }

      if (chartType === 'echarts' && option) {
        currentChartType = 'echarts';
        currentOption = option;
        currentOptionLight = null;
        currentD3HTML = null;
        renderECharts(option);
      } else if (chartType === 'd3' && d3HTML) {
        currentChartType = 'd3';
        currentOption = null;
        currentOptionLight = null;
        currentD3HTML = d3HTML;
        renderD3(d3HTML);
      } else {
        console.warn('⚠ 未从 AI 回复中提取到图表内容');
        currentChartType = null;
        currentOption = null;
        currentOptionLight = null;
        currentD3HTML = null;
        clearChartPreview();
        chartStatus.textContent = '未检测到图表配置';
        chartStatus.classList.remove('has-chart');
        downloadBtn.classList.add('hidden');
      }
    } catch (err) {
      addMessage('bot', `出错了：${err.message}\n\n请检查 API 设置或网络连接。`);
    } finally {
      isProcessing = false;
      chatLoading.classList.add('hidden');
      sendBtn.disabled = false;
      chatInput.focus();
    }
  }

  // ── Message Rendering ─────────────────────
  function addMessage(role, text) {
    const div = document.createElement('div');
    div.className = `message ${role}`;

    const avatarSVG = role === 'user'
      ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
      : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>';

    div.innerHTML = `
      <div class="message-avatar">${avatarSVG}</div>
      <div class="message-body">
        <div class="message-text">${formatMessage(text)}</div>
      </div>
    `;

    chatMessages.appendChild(div);
    scrollToBottom();
  }

  function addSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'message bot';
    div.innerHTML = `
      <div class="message-avatar">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
      </div>
      <div class="message-body">
        <div class="message-text" style="font-size:12px;color:#78746e;">${escapeHTML(text)}</div>
      </div>
    `;
    chatMessages.appendChild(div);
    scrollToBottom();
  }

  function formatMessage(text) {
    // 简易 markdown 风格排版
    let html = escapeHTML(text);

    // 代码块：```lang ... ``` → <pre><code> 包裹（无语法高亮）
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g,
      '<pre><code>$2</code></pre>');

    // 行内代码：`text`
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Line breaks → paragraphs
    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');

    return '<p>' + html + '</p>';
  }

  function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // ── Chart Rendering ───────────────────────
  // AI 返回的 option 带默认浅色文字，深色预览前先披一层皮肤；
  // 下载成品保持浅色，用浅色皮肤版本。
  const CHART_SKIN_DARK = {
    text: '#b0aca6', title: '#f0ece4', name: '#78746e',
    axisLine: 'rgba(228,224,216,0.16)', splitLine: 'rgba(228,224,216,0.08)',
    tooltipBg: 'rgba(17,17,20,0.96)', tooltipBorder: 'rgba(228,224,216,0.16)', tooltipText: '#f0ece4'
  };
  const CHART_SKIN_LIGHT = {
    text: '#666', title: '#2c2c2c', name: '#999',
    axisLine: '#e8e4e0', splitLine: '#f0ede8',
    tooltipBg: 'rgba(255,255,255,0.95)', tooltipBorder: '#e8e4e0', tooltipText: '#2c2c2c'
  };

  function skinChartOption(option, s) {
    if (!option || typeof option !== 'object') return option;
    const ensureArr = (v) => (Array.isArray(v) ? v : (v ? [v] : []));

    option.textStyle = Object.assign({ color: s.text }, option.textStyle);

    ensureArr(option.title).forEach(t => {
      t.textStyle = Object.assign({ color: s.title }, t.textStyle);
      if (t.subtext) t.subtextStyle = Object.assign({ color: s.name }, t.subtextStyle);
    });

    ensureArr(option.legend).forEach(l => {
      l.textStyle = Object.assign({ color: s.text }, l.textStyle);
    });

    option.tooltip = Object.assign({}, option.tooltip, {
      backgroundColor: option.tooltip?.backgroundColor ?? s.tooltipBg,
      borderColor: option.tooltip?.borderColor ?? s.tooltipBorder,
      textStyle: Object.assign({ color: s.tooltipText }, option.tooltip?.textStyle),
    });

    ['xAxis', 'yAxis'].forEach(k => {
      ensureArr(option[k]).forEach(ax => {
        ax.axisLabel = Object.assign({ color: s.text }, ax.axisLabel);
        ax.axisLine = Object.assign({}, ax.axisLine, {
          lineStyle: Object.assign({ color: s.axisLine }, ax.axisLine?.lineStyle),
        });
        ax.splitLine = Object.assign({}, ax.splitLine, {
          lineStyle: Object.assign({ color: s.splitLine }, ax.splitLine?.lineStyle),
        });
        if (ax.name) ax.nameTextStyle = Object.assign({ color: s.name }, ax.nameTextStyle);
      });
    });

    return option;
  }

  function cloneOption(option) {
    return JSON.parse(JSON.stringify(option));
  }

  function clearChartPreview() {
    // 清除旧图表
    if (chartInstance && !chartInstance.isDisposed()) {
      chartInstance.dispose();
      chartInstance = null;
    }
    if (d3Iframe) {
      d3Iframe.remove();
      d3Iframe = null;
    }
    emptyState.style.display = 'none';
  }

  function renderECharts(option) {
    clearChartPreview();
    chartInstance = echarts.init(chartContainer);

    // 深色预览 + 保留一份浅色皮肤配置供下载
    currentOption = option;
    currentOptionLight = skinChartOption(cloneOption(option), CHART_SKIN_LIGHT);

    try {
      chartInstance.setOption(skinChartOption(option, CHART_SKIN_DARK), true);
      chartStatus.textContent = 'ECharts 图表已生成';
      chartStatus.classList.add('has-chart');
      downloadBtn.classList.remove('hidden');
      downloadBtn.disabled = false;
    } catch (err) {
      console.error('ECharts render error:', err);
      chartStatus.textContent = '渲染失败';
      chartStatus.classList.remove('has-chart');
    }
  }

  function renderD3(htmlContent) {
    clearChartPreview();

    // 通过 sandboxed iframe 渲染 D3 图表（只允许脚本，不加 allow-same-origin）
    d3Iframe = document.createElement('iframe');
    d3Iframe.className = 'chart-iframe';
    d3Iframe.setAttribute('sandbox', 'allow-scripts');
    d3Iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;';
    chartContainer.appendChild(d3Iframe);
    chartContainer.style.position = 'relative';

    d3Iframe.srcdoc = htmlContent;

    d3Iframe.onload = () => {
      chartStatus.textContent = 'D3 图表已生成';
      chartStatus.classList.add('has-chart');
      downloadBtn.classList.remove('hidden');
      downloadBtn.disabled = false;
    };

    d3Iframe.onerror = () => {
      chartStatus.textContent = 'D3 渲染失败';
      chartStatus.classList.remove('has-chart');
    };
  }

  // ── Download ──────────────────────────────
  async function downloadHTML() {
    if (downloadBtn.disabled) return;

    if (currentChartType === 'd3' && currentD3HTML) {
      // D3：直接下载 AI 生成的完整 HTML
      triggerDownload(currentD3HTML, 'd3-chart');
      return;
    }

    if (currentChartType === 'echarts' && currentOptionLight) {
      const title = currentOptionLight.title?.text || currentOption?.title?.text || '图表';
      try {
        const resp = await fetch(`${API_BASE}/api/generate-html`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ option: currentOptionLight, title }),
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data.html) { triggerDownload(data.html, title); return; }
        }
      } catch (err) { /* fallback below */ }
      // 客户端生成 ECharts HTML
      downloadEChartsClient(currentOptionLight, title);
    }
  }

  function downloadEChartsClient(option, title) {
    const optionJSON = JSON.stringify(option, null, 2);
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${escapeHTML(title)}</title>
  <script src="https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js"><\\/script>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{display:flex;justify-content:center;align-items:center;min-height:100vh;background:#f7f6f3;font-family:"PingFang SC","Microsoft YaHei",sans-serif;padding:20px}
    .chart-wrapper{width:960px;max-width:96vw;height:580px;background:#fff;border-radius:14px;box-shadow:0 1px 3px rgba(0,0,0,.04),0 8px 32px rgba(0,0,0,.05);padding:24px;border:1px solid #e6e4e0}
    #chart{width:100%;height:100%}
  </style>
</head>
<body>
  <div class="chart-wrapper"><div id="chart"></div></div>
  <script>
    (function(){
      var c=echarts.init(document.getElementById('chart'));
      c.setOption(${optionJSON});
      window.addEventListener('resize',function(){c.resize()});
    })();
  <\\/script>
</body>
</html>`;
    triggerDownload(html, title);
  }

  function triggerDownload(html, title) {
    html = '﻿' + html;
    const blob = new Blob([html], { type: 'text/html;charset=UTF-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[<>:"/\\|?*]/g, '_')}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Client-side extraction (ECharts + D3) ──
  function tryParseJSON(str) {
    try { return JSON.parse(str); } catch (e) { /* ignore */ }
    const fixed = str.replace(/,(\s*[}\]])/g, '$1');
    try { return JSON.parse(fixed); } catch (e) { /* ignore */ }
    return null;
  }

  function extractEChartsOption(text) {
    if (!text) return null;
    // 1) ```echarts ... ```
    let re = /```echarts\s*\n([\s\S]*?)```/g;
    for (let m; (m = re.exec(text)) !== null;) {
      const obj = tryParseJSON(m[1].trim());
      if (obj && typeof obj === 'object') return obj;
    }
    // 2) ```json ... ```
    re = /```json\s*\n([\s\S]*?)```/g;
    for (let m; (m = re.exec(text)) !== null;) {
      const obj = tryParseJSON(m[1].trim());
      if (obj && (obj.series || obj.title || obj.xAxis)) return obj;
    }
    // 3) 任意 ``` ... ``` 代码块中含 series 的 JSON
    re = /```\s*\n([\s\S]*?)```/g;
    for (let m; (m = re.exec(text)) !== null;) {
      const obj = tryParseJSON(m[1].trim());
      if (obj && (obj.series || obj.title || obj.xAxis)) return obj;
    }
    // 4) 全文搜 { ... "series" ... }
    const braceRe = /\{[^{}]*"(?:series|title|xAxis)"[^{}]*\}/g;
    for (let m; (m = braceRe.exec(text)) !== null;) {
      const start = text.lastIndexOf('{', m.index);
      if (start === -1) continue;
      let depth = 0, end = start;
      for (let i = start; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
      }
      if (end > start) {
        const obj = tryParseJSON(text.substring(start, end));
        if (obj && obj.series) return obj;
      }
    }
    return null;
  }

  function extractD3HTML(text) {
    if (!text) return null;
    // 匹配 ```html 或 ```d3 代码块
    const re = /```(?:html|d3)\s*\n([\s\S]*?)```/gi;
    for (let m; (m = re.exec(text)) !== null;) {
      let candidate = m[1].trim();
      // 判断是否包含 D3/可视化内容
      const hasD3 = /\bd3\b/i.test(candidate);
      const hasSVG = /<svg/i.test(candidate) || /createElementNS/i.test(candidate);
      const hasChart = /chart|viz|visual/i.test(candidate);
      const isHTML = /<!DOCTYPE|<html|<script/i.test(candidate);

      if (hasD3 || hasSVG || (isHTML && hasChart)) {
        // 如果是不完整的 HTML 片段，包装成完整页面
        if (!/<!DOCTYPE/i.test(candidate) && !/<html/i.test(candidate)) {
          candidate = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <script src="https://d3js.org/d3.v3.min.js"><\\/script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { background: #0e0e11; color: #f0ece4; }
    body { font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
           display: flex; justify-content: center; align-items: center;
           min-height: 100vh; }
    svg { max-width: 100%; height: auto; }
  </style>
</head>
<body>
${candidate}
</body>
</html>`;
        }
        // 注入 D3 v3 兼容垫片：自动将 link 的字符串 source/target 转为节点索引
        candidate = injectD3CompatShim(candidate);
        return candidate;
      }
    }
    return null;
  }

  function injectD3CompatShim(html) {
    // 在 </body> 之前注入兼容代码，自动修复 D3 v3 的 links 字符串 ID 问题
    const shim = `
<script>
// [自动注入] D3 v3 链接兼容垫片 — 将字符串 source/target 转为节点索引
(function() {
  if (typeof d3 === 'undefined') return;
  var origForce = d3.layout.force;
  d3.layout.force = function() {
    var force = origForce();
    var origLinks = force.links;
    force.links = function(links) {
      if (links && links.length > 0 && typeof links[0].source === 'string') {
        var nodes = force.nodes();
        var idMap = {};
        nodes.forEach(function(d, i) { if (d.id != null) idMap[d.id] = i; });
        links.forEach(function(d) {
          if (typeof d.source === 'string' && idMap[d.source] != null) d.source = idMap[d.source];
          if (typeof d.target === 'string' && idMap[d.target] != null) d.target = idMap[d.target];
        });
      }
      return origLinks.call(this, links);
    };
    return force;
  };
})();
<\\/script>`;
    if (html.includes('</body>')) {
      return html.replace('</body>', shim + '\n</body>');
    }
    return html + shim;
  }

  function extractChartContent(text) {
    // 优先 ECharts，其次 D3
    const option = extractEChartsOption(text);
    if (option) return { chart_type: 'echarts', option, d3_html: null };

    const d3HTML = extractD3HTML(text);
    if (d3HTML) return { chart_type: 'd3', option: null, d3_html: d3HTML };

    return { chart_type: null, option: null, d3_html: null };
  }

  // ── Utilities ─────────────────────────────
  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Start ─────────────────────────────────
  // Load SheetJS dynamically
  const sheetJsScript = document.createElement('script');
  sheetJsScript.src = 'https://cdn.sheetjs.com/xlsx-0.20.0/package/dist/xlsx.full.min.js';
  sheetJsScript.onload = init;
  sheetJsScript.onerror = () => {
    console.warn('SheetJS 加载失败，Excel 解析将不可用');
    init();
  };
  document.head.appendChild(sheetJsScript);

})();
