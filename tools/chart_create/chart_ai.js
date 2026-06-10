/* ========================================
   AI 图表 — AI Chart
   聊天逻辑 + API 调用 + 图表预览
   ======================================== */

(function () {
  'use strict';

  // ── Config ────────────────────────────────
  const API_BASE = 'http://localhost:5000';

  // ── DOM ───────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const chatMessages   = $('#chatMessages');
  const chatInput      = $('#chatInput');
  const sendBtn        = $('#sendBtn');
  const chatLoading    = $('#chatLoading');
  const fileUpload     = $('#fileUpload');
  const filePreviewBar = $('#filePreviewBar');
  const filePreviewName = $('#filePreviewName');
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
  let chartInstance = null;
  let currentOption = null;
  let isProcessing = false;
  let uploadedFileContent = null;
  let uploadedFileName = null;

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
    if (chartInstance) { chartInstance.dispose(); }
    chartInstance = echarts.init(chartContainer);
    window.addEventListener('resize', () => {
      if (chartInstance && !chartInstance.isDisposed()) chartInstance.resize();
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

    // Auto-resize textarea
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
      if (e.target.files.length > 0) handleFileUpload(e.target.files[0]);
    });
    filePreviewClear.addEventListener('click', clearFile);

    // Download
    downloadBtn.addEventListener('click', downloadHTML);
  }

  function autoResize() {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
  }

  // ── File Handling ─────────────────────────
  function handleFileUpload(file) {
    const name = file.name.toLowerCase();
    if (!name.endsWith('.txt') && !name.endsWith('.csv') &&
        !name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      addSystemMessage('不支持的文件格式。请上传 .txt / .csv / .xlsx 文件。');
      return;
    }

    uploadedFileName = file.name;
    filePreviewName.textContent = file.name;
    filePreviewBar.classList.remove('hidden');

    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      readExcel(file);
    } else {
      readTextFile(file);
    }
  }

  function readTextFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      uploadedFileContent = e.target.result;
      addSystemMessage(`已加载文件：${file.name}（${uploadedFileContent.split('\n').filter(l => l.trim()).length} 行数据）`);
    };
    reader.onerror = () => addSystemMessage('文件读取失败，请重试。');
    reader.readAsText(file, 'UTF-8');
  }

  function readExcel(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        uploadedFileContent = XLSX.utils.sheet_to_csv(firstSheet, { FS: '\t' });
        addSystemMessage(`已加载文件：${file.name}（${uploadedFileContent.split('\n').filter(l => l.trim()).length} 行数据）`);
      } catch (err) {
        addSystemMessage('Excel 文件解析失败，请检查文件格式。');
        console.error(err);
      }
    };
    reader.onerror = () => addSystemMessage('文件读取失败，请重试。');
    reader.readAsArrayBuffer(file);
  }

  function clearFile() {
    uploadedFileContent = null;
    uploadedFileName = null;
    fileUpload.value = '';
    filePreviewBar.classList.add('hidden');
    filePreviewName.textContent = '';
  }

  // ── Chat ──────────────────────────────────
  async function handleSend() {
    if (isProcessing) return;

    const message = chatInput.value.trim();
    const hasFile = !!uploadedFileContent;

    if (!message && !hasFile) return;

    // Add user message to chat
    let displayMsg = message;
    if (!displayMsg && hasFile) {
      displayMsg = `请分析我上传的文件：${uploadedFileName}`;
    }
    if (hasFile && message) {
      displayMsg = message + `\n\n[附文件：${uploadedFileName}]`;
    }
    addMessage('user', displayMsg);

    // Save to history
    state.history.push({ role: 'user', content: message || `请分析以下数据` });

    // Clear input
    chatInput.value = '';
    autoResize();
    sendBtn.disabled = true;

    // Show loading
    isProcessing = true;
    chatLoading.classList.remove('hidden');
    scrollToBottom();

    try {
      const payload = {
        message: message || '请分析我上传的数据并生成图表',
        provider: state.apiSource === 'site' ? 'deepseek' : state.provider,
        api_key: state.apiSource === 'custom' ? state.apiKey : '',
        history: state.history.slice(0, -1), // exclude the just-added message
        file_content: uploadedFileContent || '',
      };

      // Clear file after sending
      const hadFile = !!uploadedFileContent;
      if (hadFile) {
        const fileContentSent = uploadedFileContent;
        clearFile();
        // Add data info to history
        state.history.push({
          role: 'user',
          content: `[上传的数据]\n${fileContentSent.substring(0, 3000)}`
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

      // Update chart if option present
      if (data.option) {
        currentOption = data.option;
        renderChart(data.option);
      }
    } catch (err) {
      addMessage('bot', `❌ 出错了：${err.message}\n\n请检查 API 设置或网络连接。`);
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
        <div class="message-text" style="font-size:12px;color:#8c8c8c;">${escapeHTML(text)}</div>
      </div>
    `;
    chatMessages.appendChild(div);
    scrollToBottom();
  }

  function formatMessage(text) {
    // Simple markdown-like formatting
    let html = escapeHTML(text);

    // Code blocks: ```echarts ... ``` → highlighted
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g,
      '<pre><code>$2</code></pre>');

    // Inline code: `text`
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
  function renderChart(option) {
    if (!chartInstance || chartInstance.isDisposed()) {
      initChart();
    }

    try {
      chartInstance.setOption(option, true);
      emptyState.style.display = 'none';
      chartStatus.textContent = '图表已生成';
      chartStatus.classList.add('has-chart');
      downloadBtn.classList.remove('hidden');
      downloadBtn.disabled = false;
    } catch (err) {
      console.error('Render error:', err);
      chartStatus.textContent = '渲染失败';
    }
  }

  // ── Download ──────────────────────────────
  async function downloadHTML() {
    if (!currentOption || downloadBtn.disabled) return;

    try {
      const title = currentOption.title?.text || '图表';
      const resp = await fetch(`${API_BASE}/api/generate-html`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ option: currentOption, title }),
      });

      if (!resp.ok) {
        // Fallback: generate client-side
        downloadClientSide(currentOption, title);
        return;
      }

      const data = await resp.json();
      if (data.html) {
        triggerDownload(data.html, title);
      }
    } catch (err) {
      // Fallback: generate client-side
      downloadClientSide(currentOption, title);
    }
  }

  function downloadClientSide(option, title) {
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
