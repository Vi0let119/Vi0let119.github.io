/* ========================================
   极速图表 — Quick Chart
   数据处理 + 图表渲染 + 文件解析 + 下载
   ======================================== */

(function () {
  'use strict';

  // ── DOM 引用 ──────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const chartTypeEl    = $('#chartType');
  const dataInputEl    = $('#dataInput');
  const hasHeaderEl    = $('#hasHeader');
  const xAxisNameEl    = $('#xAxisName');
  const yAxisNameEl    = $('#yAxisName');
  const chartTitleEl   = $('#chartTitle');
  const downloadBtn    = $('#downloadBtn');
  const chartContainer = $('#chartContainer');
  const emptyState     = $('#emptyState');
  const dataStatus     = $('#dataStatus');
  const dataSummary    = $('#dataSummary');
  const rowCount       = $('#rowCount');
  const fileInput      = $('#fileInput');
  const fileUploadArea = $('#fileUploadArea');
  const fileInfo       = $('#fileInfo');
  const fileName       = $('#fileName');
  const fileClear      = $('#fileClear');
  const textInputPanel = $('#textInputPanel');
  const fileInputPanel = $('#fileInputPanel');
  const inputTabs      = document.querySelectorAll('.input-tab');

  // ── 状态 ──────────────────────────────────
  let chartInstance = null;
  let currentFileData = null;   // 从文件解析出的原始文本
  let activeInputMode = 'text'; // 'text' | 'file'

  // ── 简约风调色板 ──────────────────────────
  const MINIMAL_PALETTE = [
    '#8aa4b0', '#b8a9a0', '#9bb5a0', '#c4a882',
    '#8b9a9e', '#b0a098', '#a0b0a8', '#c8b8a8'
  ];

  // ── 初始化 ────────────────────────────────
  function init() {
    bindEvents();
    initChart();
    // 默认填入示例数据
    insertSampleData();
    updatePreview();
  }

  function initChart() {
    if (chartInstance) {
      chartInstance.dispose();
      chartInstance = null;
    }
    chartInstance = echarts.init(chartContainer);
    window.addEventListener('resize', () => {
      if (chartInstance && !chartInstance.isDisposed()) {
        chartInstance.resize();
      }
    });
  }

  function insertSampleData() {
    dataInputEl.value = '1月 120\n2月 200\n3月 150\n4月 300\n5月 280\n6月 350';
    xAxisNameEl.value = '月份';
    yAxisNameEl.value = '销售额（万元）';
    chartTitleEl.value = '月度销售数据';
  }

  // ── 事件绑定 ──────────────────────────────
  function bindEvents() {
    // 表单变化 → 实时预览（防抖）
    const debouncedUpdate = debounce(updatePreview, 250);
    dataInputEl.addEventListener('input', debouncedUpdate);
    chartTypeEl.addEventListener('change', updatePreview);
    hasHeaderEl.addEventListener('change', updatePreview);
    xAxisNameEl.addEventListener('input', debouncedUpdate);
    yAxisNameEl.addEventListener('input', debouncedUpdate);
    chartTitleEl.addEventListener('input', debouncedUpdate);

    // 下载
    downloadBtn.addEventListener('click', downloadHTML);

    // 输入方式切换
    inputTabs.forEach(tab => {
      tab.addEventListener('click', () => switchInputMode(tab.dataset.tab));
    });

    // 文件上传
    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
      }
    });

    // 拖拽上传
    fileUploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      fileUploadArea.classList.add('drag-over');
    });
    fileUploadArea.addEventListener('dragleave', () => {
      fileUploadArea.classList.remove('drag-over');
    });
    fileUploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      fileUploadArea.classList.remove('drag-over');
      if (e.dataTransfer.files.length > 0) {
        handleFile(e.dataTransfer.files[0]);
      }
    });

    // 清除文件
    fileClear.addEventListener('click', clearFile);
  }

  // ── 输入模式切换 ──────────────────────────
  function switchInputMode(mode) {
    activeInputMode = mode;
    inputTabs.forEach(t => t.classList.toggle('active', t.dataset.tab === mode));
    textInputPanel.classList.toggle('hidden', mode !== 'text');
    fileInputPanel.classList.toggle('hidden', mode !== 'file');
    updatePreview();
  }

  // ── 数据解析 ──────────────────────────────
  function detectDelimiter(text) {
    const lines = text.split('\n').filter(l => l.trim()).slice(0, 10);
    if (lines.length === 0) return ',';

    const counts = { ',': 0, '\t': 0, ' ': 0 };
    let total = 0;

    lines.forEach(line => {
      // 分别统计各分隔符
      const commaCount  = (line.match(/,/g) || []).length;
      const tabCount    = (line.match(/\t/g) || []).length;
      // 空格：连续的多个空格算一个分隔符
      const spaceParts  = line.trim().split(/\s+/);
      const spaceCount  = spaceParts.length - 1;

      counts[','] += commaCount;
      counts['\t'] += tabCount;
      counts[' '] += spaceCount;
      total += commaCount + tabCount + spaceCount;
    });

    if (total === 0) return ',';
    if (counts['\t'] > counts[','] && counts['\t'] > counts[' ']) return '\t';
    if (counts[','] > counts['\t'] && counts[','] > counts[' ']) return ',';
    if (counts[' '] > 0) return ' ';
    return ',';
  }

  // ── 线性回归计算（最小二乘法）─────────────
  function linearRegression(points) {
    // points: [[x1, y1], [x2, y2], ...]
    const n = points.length;
    if (n < 2) return null;

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
      const x = points[i][0];
      const y = points[i][1];
      if (isNaN(x) || isNaN(y)) continue;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    }

    // 避免除零（所有 X 值相同）
    const denominator = n * sumX2 - sumX * sumX;
    if (denominator === 0) return null;

    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;

    // 计算决定系数 R²
    const meanY = sumY / n;
    let ssRes = 0, ssTot = 0;
    for (let i = 0; i < n; i++) {
      const x = points[i][0];
      const y = points[i][1];
      if (isNaN(x) || isNaN(y)) continue;
      const yPred = slope * x + intercept;
      ssRes += (y - yPred) ** 2;
      ssTot += (y - meanY) ** 2;
    }
    const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

    return { slope, intercept, r2 };
  }

  function parseData(text, hasHeader) {
    if (!text || !text.trim()) {
      return { labels: [], values: [], xHeader: '', yHeader: '', error: null };
    }

    const delimiter = detectDelimiter(text);
    let lines = text.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    if (lines.length === 0) {
      return { labels: [], values: [], xHeader: '', yHeader: '', error: null };
    }

    // 分割每行为列
    const splitLine = (line) => {
      if (delimiter === ' ') {
        return line.split(/\s+/);
      }
      return line.split(delimiter).map(s => s.trim());
    };

    let rows = lines.map(splitLine).filter(cols => cols.length >= 2);

    if (rows.length === 0) {
      return {
        labels: [], values: [],
        xHeader: '', yHeader: '',
        error: '未检测到有效数据。请确保数据为两列（X轴 + Y轴），用空格、逗号或Tab分隔。'
      };
    }

    let xHeader = '';
    let yHeader = '';
    let dataRows = rows;

    if (hasHeader && rows.length >= 1) {
      xHeader = rows[0][0] || '';
      // 如果有第三列，用第三列作为Y轴表头
      yHeader = rows[0][1] || '';
      dataRows = rows.slice(1);
    }

    // 过滤空值和无效行
    dataRows = dataRows.filter(cols => {
      if (!cols[0] || cols[0].trim() === '') return false;
      return true;
    });

    if (dataRows.length === 0) {
      return {
        labels: [], values: [],
        xHeader, yHeader,
        error: '表头之后无有效数据行。'
      };
    }

    const labels = dataRows.map(cols => cols[0].trim());
    const rawValues = dataRows.map(cols => parseFloat(String(cols[1]).trim()));

    // 检查是否有非数值的 Y 数据
    const nonNumeric = rawValues.filter(v => isNaN(v));
    if (nonNumeric.length > 0) {
      return {
        labels, values: rawValues,
        xHeader, yHeader,
        error: `第2列包含 ${nonNumeric.length} 个非数值数据，已保留为NaN。请检查数据格式。`
      };
    }

    return { labels, values: rawValues, xHeader, yHeader, error: null };
  }

  // ── 生成 ECharts Option ───────────────────
  function getEChartsOption(chartType, data, config) {
    const { labels, values, xHeader, yHeader } = data;
    const { xAxisName, yAxisName, chartTitle } = config;
    const hasData = labels.length > 0 && values.length > 0;

    const baseOption = {
      title: {
        text: chartTitle || '',
        left: 'center',
        top: 20,
        textStyle: {
          fontSize: 17,
          fontWeight: 500,
          color: '#2c2c2c',
          fontFamily: '"PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", sans-serif'
        },
        subtextStyle: { color: '#999', fontSize: 12 }
      },
      tooltip: {
        backgroundColor: 'rgba(255,255,255,0.95)',
        borderColor: '#e8e4e0',
        borderWidth: 1,
        textStyle: { color: '#2c2c2c', fontSize: 13 },
        extraCssText: 'box-shadow: 0 2px 12px rgba(0,0,0,0.06); border-radius: 8px; padding: 10px 14px;'
      }
    };

    if (!hasData) {
      return {
        ...baseOption,
        graphic: {
          type: 'text',
          left: 'center',
          top: 'center',
          style: { text: '请在左侧输入数据', fill: '#ccc', fontSize: 16 }
        }
      };
    }

    switch (chartType) {
      case 'bar':
        return {
          ...baseOption,
          tooltip: { ...baseOption.tooltip, trigger: 'axis', axisPointer: { type: 'shadow' } },
          grid: { left: '3%', right: '4%', bottom: '3%', top: 75, containLabel: true },
          xAxis: {
            type: 'category',
            data: labels,
            name: xAxisName || xHeader || '',
            nameTextStyle: { color: '#999', fontSize: 12 },
            axisLine: { lineStyle: { color: '#e8e4e0' } },
            axisTick: { show: false },
            axisLabel: { color: '#666', fontSize: 12, rotate: labels.length > 8 ? 30 : 0 }
          },
          yAxis: {
            type: 'value',
            name: yAxisName || yHeader || '',
            nameTextStyle: { color: '#999', fontSize: 12 },
            splitLine: { lineStyle: { color: '#f0ede8', type: 'dashed' } },
            axisLabel: { color: '#666', fontSize: 12 }
          },
          series: [{
            type: 'bar',
            data: values,
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: '#9bbac8' },
                { offset: 1, color: '#8aa4b0' }
              ]),
              borderRadius: [4, 4, 0, 0]
            },
            emphasis: {
              itemStyle: { color: '#6b8b9a' }
            },
            barWidth: Math.max(12, Math.min(40, 400 / labels.length))
          }]
        };

      case 'line':
        return {
          ...baseOption,
          tooltip: { ...baseOption.tooltip, trigger: 'axis' },
          grid: { left: '3%', right: '4%', bottom: '3%', top: 75, containLabel: true },
          xAxis: {
            type: 'category',
            data: labels,
            name: xAxisName || xHeader || '',
            nameTextStyle: { color: '#999', fontSize: 12 },
            boundaryGap: false,
            axisLine: { lineStyle: { color: '#e8e4e0' } },
            axisTick: { show: false },
            axisLabel: { color: '#666', fontSize: 12, rotate: labels.length > 8 ? 30 : 0 }
          },
          yAxis: {
            type: 'value',
            name: yAxisName || yHeader || '',
            nameTextStyle: { color: '#999', fontSize: 12 },
            splitLine: { lineStyle: { color: '#f0ede8', type: 'dashed' } },
            axisLabel: { color: '#666', fontSize: 12 }
          },
          series: [{
            type: 'line',
            data: values,
            smooth: true,
            symbol: 'circle',
            symbolSize: 6,
            lineStyle: { color: '#8aa4b0', width: 2.5 },
            itemStyle: { color: '#8aa4b0' },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: 'rgba(138,164,176,0.22)' },
                { offset: 1, color: 'rgba(138,164,176,0.02)' }
              ])
            }
          }]
        };

      case 'pie':
        // 饼图需要 name-value 对
        const pieData = labels.map((label, i) => ({
          name: label,
          value: isNaN(values[i]) ? 0 : values[i]
        }));
        return {
          ...baseOption,
          tooltip: { ...baseOption.tooltip, trigger: 'item', formatter: '{b}: {c} ({d}%)' },
          series: [{
            type: 'pie',
            radius: ['42%', '68%'],
            center: ['50%', '55%'],
            avoidLabelOverlap: true,
            itemStyle: {
              borderRadius: 6,
              borderColor: '#fff',
              borderWidth: 2
            },
            label: {
              show: true,
              position: 'outside',
              formatter: '{b}\n{d}%',
              color: '#666',
              fontSize: 12,
              distanceToLabelLine: 4
            },
            labelLine: {
              length: 20,
              length2: 30,
              lineStyle: { color: '#ccc' }
            },
            emphasis: {
              label: { fontSize: 15, fontWeight: 'bold' },
              scaleSize: 8
            },
            data: pieData,
            color: MINIMAL_PALETTE
          }]
        };

      case 'scatter':
        // 散点图：labels 作为 X 轴类别标签，values 作为 Y
        const scatterData = labels.map((label, i) => {
          const y = isNaN(values[i]) ? 0 : values[i];
          return [label, y];
        });
        // 尝试将 labels 转为数值（用于数值型 X 轴）
        const numericLabels = labels.map(Number);
        const allNumeric = numericLabels.every(n => !isNaN(n));

        if (allNumeric) {
          const numData = numericLabels.map((x, i) => [x, isNaN(values[i]) ? 0 : values[i]]);
          return {
            ...baseOption,
            tooltip: {
              ...baseOption.tooltip,
              trigger: 'item',
              formatter: (params) => {
                const d = params.data;
                return `${d[0]}, ${d[1]}`;
              }
            },
            grid: { left: '3%', right: '4%', bottom: '3%', top: 75, containLabel: true },
            xAxis: {
              type: 'value',
              name: xAxisName || xHeader || '',
              nameTextStyle: { color: '#999', fontSize: 12 },
              splitLine: { lineStyle: { color: '#f0ede8', type: 'dashed' } },
              axisLabel: { color: '#666', fontSize: 12 }
            },
            yAxis: {
              type: 'value',
              name: yAxisName || yHeader || '',
              nameTextStyle: { color: '#999', fontSize: 12 },
              splitLine: { lineStyle: { color: '#f0ede8', type: 'dashed' } },
              axisLabel: { color: '#666', fontSize: 12 }
            },
            series: [{
              type: 'scatter',
              data: numData,
              symbolSize: 12,
              itemStyle: {
                color: '#8aa4b0',
                borderColor: '#fff',
                borderWidth: 2,
                shadowBlur: 6,
                shadowColor: 'rgba(0,0,0,0.08)'
              },
              emphasis: {
                scale: 1.4,
                itemStyle: { color: '#6b8b9a' }
              }
            }]
          };
        } else {
          // X 轴为分类数据时，直接用索引
          const indexedData = values.map((v, i) => [i, isNaN(v) ? 0 : v]);
          return {
            ...baseOption,
            tooltip: {
              ...baseOption.tooltip,
              trigger: 'item',
              formatter: (params) => {
                const d = params.data;
                const label = labels[d[0]] || d[0];
                return `${label}: ${d[1]}`;
              }
            },
            grid: { left: '3%', right: '4%', bottom: '3%', top: 75, containLabel: true },
            xAxis: {
              type: 'value',
              name: xAxisName || xHeader || '',
              nameTextStyle: { color: '#999', fontSize: 12 },
              splitLine: { lineStyle: { color: '#f0ede8', type: 'dashed' } },
              axisLabel: {
                color: '#666', fontSize: 12,
                formatter: (val) => labels[val] || val
              },
              minInterval: 1
            },
            yAxis: {
              type: 'value',
              name: yAxisName || yHeader || '',
              nameTextStyle: { color: '#999', fontSize: 12 },
              splitLine: { lineStyle: { color: '#f0ede8', type: 'dashed' } },
              axisLabel: { color: '#666', fontSize: 12 }
            },
            series: [{
              type: 'scatter',
              data: indexedData,
              symbolSize: 12,
              itemStyle: {
                color: '#8aa4b0',
                borderColor: '#fff',
                borderWidth: 2,
                shadowBlur: 6,
                shadowColor: 'rgba(0,0,0,0.08)'
              },
              emphasis: {
                scale: 1.4,
                itemStyle: { color: '#6b8b9a' }
              }
            }]
          };
        }

      case 'scatter_fit': {
        // 散点图 + 拟合线：需要数值型 X 轴
        const fitLabels = labels.map(Number);
        const fitAllNumeric = fitLabels.every(n => !isNaN(n));

        // X 轴非数值 → 退回普通散点图 + 提示
        if (!fitAllNumeric) {
          const fitIndexedData = values.map((v, i) => [i, isNaN(v) ? 0 : v]);
          return {
            ...baseOption,
            title: {
              ...baseOption.title,
              subtext: '⚠ X 轴数据非数值，无法拟合直线。请使用数值型数据（如 1.2  3.5）。',
              subtextStyle: { color: '#c06050', fontSize: 11 }
            },
            tooltip: {
              ...baseOption.tooltip,
              trigger: 'item',
              formatter: (params) => {
                const d = params.data;
                const label = labels[d[0]] || d[0];
                return label + ': ' + d[1];
              }
            },
            grid: { left: '3%', right: '4%', bottom: '3%', top: 85, containLabel: true },
            xAxis: {
              type: 'value',
              name: xAxisName || xHeader || '',
              nameTextStyle: { color: '#999', fontSize: 12 },
              splitLine: { lineStyle: { color: '#f0ede8', type: 'dashed' } },
              axisLabel: {
                color: '#666', fontSize: 12,
                formatter: (val) => labels[val] || val
              },
              minInterval: 1
            },
            yAxis: {
              type: 'value',
              name: yAxisName || yHeader || '',
              nameTextStyle: { color: '#999', fontSize: 12 },
              splitLine: { lineStyle: { color: '#f0ede8', type: 'dashed' } },
              axisLabel: { color: '#666', fontSize: 12 }
            },
            series: [{
              type: 'scatter',
              data: fitIndexedData,
              name: '数据点',
              symbolSize: 12,
              itemStyle: {
                color: '#8aa4b0',
                borderColor: '#fff',
                borderWidth: 2,
                shadowBlur: 6,
                shadowColor: 'rgba(0,0,0,0.08)'
              },
              emphasis: {
                scale: 1.4,
                itemStyle: { color: '#6b8b9a' }
              }
            }]
          };
        }

        // 构建数值型数据点
        const fitNumData = fitLabels.map((x, i) => [x, isNaN(values[i]) ? 0 : values[i]]);

        // 最小二乘线性回归
        const regResult = linearRegression(fitNumData);

        const xMin = Math.min(...fitLabels);
        const xMax = Math.max(...fitLabels);

        const fitScatterOption = {
          ...baseOption,
          tooltip: {
            ...baseOption.tooltip,
            trigger: 'item',
            formatter: (params) => {
              if (params.seriesName === '拟合线') {
                if (regResult) {
                  const s = regResult.slope;
                  const it = regResult.intercept;
                  const sign = s >= 0 ? '+' : '';
                  return '拟合线<br>y = ' + it.toFixed(4) + ' ' + sign + s.toFixed(4) + 'x';
                }
                return '拟合线';
              }
              const d = params.data;
              let tip = d[0] + ', ' + d[1];
              if (regResult) {
                const yPred = regResult.slope * d[0] + regResult.intercept;
                tip += '<br>拟合值: ' + yPred.toFixed(4);
              }
              return tip;
            }
          },
          legend: {
            data: ['数据点', '拟合线'],
            bottom: 10,
            textStyle: { color: '#666', fontSize: 12 }
          },
          grid: { left: '3%', right: '4%', bottom: '12%', top: 85, containLabel: true },
          xAxis: {
            type: 'value',
            name: xAxisName || xHeader || '',
            nameTextStyle: { color: '#999', fontSize: 12 },
            splitLine: { lineStyle: { color: '#f0ede8', type: 'dashed' } },
            axisLabel: { color: '#666', fontSize: 12 }
          },
          yAxis: {
            type: 'value',
            name: yAxisName || yHeader || '',
            nameTextStyle: { color: '#999', fontSize: 12 },
            splitLine: { lineStyle: { color: '#f0ede8', type: 'dashed' } },
            axisLabel: { color: '#666', fontSize: 12 }
          },
          series: [{
            type: 'scatter',
            data: fitNumData,
            name: '数据点',
            symbolSize: 12,
            itemStyle: {
              color: '#8aa4b0',
              borderColor: '#fff',
              borderWidth: 2,
              shadowBlur: 6,
              shadowColor: 'rgba(0,0,0,0.08)'
            },
            emphasis: {
              scale: 1.4,
              itemStyle: { color: '#6b8b9a' }
            },
            z: 2
          }]
        };

        // 添加拟合线系列
        if (regResult) {
          const { slope, intercept, r2 } = regResult;

          fitScatterOption.series.push({
            type: 'line',
            name: '拟合线',
            data: [[xMin, slope * xMin + intercept], [xMax, slope * xMax + intercept]],
            symbol: 'none',
            lineStyle: {
              color: '#c4a882',
              width: 2,
              type: 'dashed'
            },
            z: 1
          });

          // 副标题显示回归方程和 R²
          const sign = slope >= 0 ? '+' : '';
          fitScatterOption.title = {
            ...fitScatterOption.title,
            subtext: '拟合线: y = ' + intercept.toFixed(4) + ' ' + sign + slope.toFixed(4) + 'x    R² = ' + r2.toFixed(4),
            subtextStyle: { color: '#999', fontSize: 11 }
          };
        }

        return fitScatterOption;
      }

      default:
        return baseOption;
    }
  }

  // ── 更新预览 ──────────────────────────────
  function updatePreview() {
    // 获取当前数据源
    let rawText = '';
    if (activeInputMode === 'text') {
      rawText = dataInputEl.value;
    } else {
      rawText = currentFileData || '';
    }

    const hasHeader = hasHeaderEl.checked;
    const parseResult = parseData(rawText, hasHeader);

    // 如果勾选了表头且解析出了表头，自动填入坐标轴名称（但不覆盖用户手动输入）
    if (hasHeader && parseResult.xHeader && !xAxisNameEl.dataset.userEdited) {
      xAxisNameEl.value = parseResult.xHeader;
    }
    if (hasHeader && parseResult.yHeader && !yAxisNameEl.dataset.userEdited) {
      yAxisNameEl.value = parseResult.yHeader;
    }

    const chartType = chartTypeEl.value;
    const config = {
      xAxisName: xAxisNameEl.value,
      yAxisName: yAxisNameEl.value,
      chartTitle: chartTitleEl.value
    };

    const option = getEChartsOption(chartType, parseResult, config);

    if (chartInstance && !chartInstance.isDisposed()) {
      chartInstance.setOption(option, true);
    }

    // 更新 UI 状态
    const hasData = parseResult.labels.length > 0 && parseResult.values.length > 0;
    updateUIState(hasData, parseResult);

    // 存储当前数据供下载使用
    chartInstance._currentOption = option;
    chartInstance._currentData = parseResult;
    chartInstance._currentConfig = config;
  }

  function updateUIState(hasData, parseResult) {
    // 下载按钮
    downloadBtn.disabled = !hasData;

    // 状态标签
    if (hasData) {
      dataStatus.textContent = `${parseResult.labels.length} 条数据`;
      dataStatus.classList.add('has-data');
    } else {
      dataStatus.textContent = parseResult.error || '等待数据';
      dataStatus.classList.remove('has-data');
    }

    // 数据摘要
    if (hasData) {
      dataSummary.classList.remove('hidden');
      rowCount.textContent = `${parseResult.labels.length} 行数据`;
    } else {
      dataSummary.classList.add('hidden');
    }

    // 空状态
    if (hasData) {
      emptyState.style.display = 'none';
    } else {
      emptyState.style.display = '';
    }
  }

  // ── 文件处理 ──────────────────────────────
  function handleFile(file) {
    const name = file.name.toLowerCase();

    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      readExcelFile(file);
    } else if (name.endsWith('.txt') || name.endsWith('.csv')) {
      readTextFile(file);
    } else {
      showError('不支持的文件格式，请上传 .txt / .csv / .xlsx 文件。');
      return;
    }

    fileName.textContent = file.name;
    fileInfo.classList.remove('hidden');
    fileUploadArea.querySelector('.file-upload-content').style.display = 'none';
  }

  function readTextFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      currentFileData = e.target.result;
      // 自动将文件内容填入 textarea 以便查看
      dataInputEl.value = currentFileData;
      updatePreview();
    };
    reader.onerror = () => {
      showError('文件读取失败，请重试。');
    };
    reader.readAsText(file, 'UTF-8');
  }

  function readExcelFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        // 转为 CSV 文本（使用制表符作为分隔符，避免与数据中的逗号冲突）
        const csv = XLSX.utils.sheet_to_csv(firstSheet, { FS: '\t' });
        currentFileData = csv;
        dataInputEl.value = csv;
        updatePreview();
      } catch (err) {
        showError('Excel 文件解析失败，请检查文件格式。');
        console.error('Excel parse error:', err);
      }
    };
    reader.onerror = () => {
      showError('文件读取失败，请重试。');
    };
    reader.readAsArrayBuffer(file);
  }

  function clearFile() {
    currentFileData = null;
    fileInput.value = '';
    fileInfo.classList.add('hidden');
    fileName.textContent = '';
    fileUploadArea.querySelector('.file-upload-content').style.display = '';
    // 切回文本模式查看
    dataInputEl.value = '';
    updatePreview();
  }

  // ── 下载 HTML 文件 ────────────────────────
  function downloadHTML() {
    if (!chartInstance || chartInstance.isDisposed()) return;
    if (downloadBtn.disabled) return;

    const option = chartInstance._currentOption;
    if (!option) return;

    const chartTitle = chartTitleEl.value || '图表';
    const optionJSON = JSON.stringify(option, null, 2);

    // 使用简单的 HTML 模板
    const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHTML(chartTitle)}</title>
  <script src="https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js"><\\/script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      display: flex; justify-content: center; align-items: center;
      min-height: 100vh; background: #f7f6f3;
      font-family: "PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", sans-serif;
    }
    .chart-wrapper {
      width: 960px; max-width: 96vw; height: 580px;
      background: #fff; border-radius: 14px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 8px 32px rgba(0,0,0,0.05);
      padding: 24px; border: 1px solid #e6e4e0;
    }
    #chart { width: 100%; height: 100%; }
  </style>
</head>
<body>
  <div class="chart-wrapper">
    <div id="chart"></div>
  </div>
  <script>
    (function() {
      var chart = echarts.init(document.getElementById('chart'));
      var option = ${optionJSON};
      // 重新应用渐变色（JSON.stringify 会丢失 echarts graphic 对象）
      try {
        if (option.series && option.series[0]) {
          var s = option.series[0];
          if (s.type === 'bar' && s.itemStyle && s.itemStyle.color) {
            // 简单颜色回退已足够
          }
          if (s.type === 'line' && s.areaStyle && s.areaStyle.color) {
            s.areaStyle.color = new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(138,164,176,0.22)' },
              { offset: 1, color: 'rgba(138,164,176,0.02)' }
            ]);
          }
        }
      } catch(e) {}
      chart.setOption(option);
      window.addEventListener('resize', function() { chart.resize(); });
    })();
  <\\/script>
</body>
</html>`;

    const blob = new Blob(['﻿' + htmlContent], { type: 'text/html;charset=UTF-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeFileName = chartTitle.replace(/[<>:"/\\|?*]/g, '_') || 'chart';
    a.download = `${safeFileName}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── 工具函数 ──────────────────────────────
  function debounce(fn, delay) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function showError(msg) {
    // 简单的错误提示：在状态标签显示
    dataStatus.textContent = msg;
    dataStatus.classList.remove('has-data');
    dataStatus.style.color = '#c06050';
    setTimeout(() => {
      dataStatus.style.color = '';
      updatePreview();
    }, 3000);
  }

  // ── 标记用户手动编辑坐标轴名称 ────────────
  xAxisNameEl.addEventListener('input', () => {
    xAxisNameEl.dataset.userEdited = 'true';
  });
  yAxisNameEl.addEventListener('input', () => {
    yAxisNameEl.dataset.userEdited = 'true';
  });

  // ── 启动 ──────────────────────────────────
  init();

})();
