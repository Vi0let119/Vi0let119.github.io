/**
 * 健康数据图表模块 — N E O N · T E R M I N A L
 * 功能：体重趋势 / 睡眠时长 / 入睡时间 的 2D 图表 + 3D 散点图 + 统计面板
 * 依赖：d3.js v3（加载 JSON）、ECharts 5（图表渲染）、sidebar.js
 */

(function () {
  // ── 全局状态 ──────────────────────────────────
  var healthData = null;          // Hdata.json 的全部数据
  var currentChart = null;        // 当前 2D ECharts 实例
  var current3DChart = null;      // 当前 3D ECharts 实例
  var lastDataDate = null;        // 上次加载的最新日期（用于检测新数据）
  var autoUpdateInterval = null;  // 自动更新定时器
  var weightNotes = {};           // 体重备注数据

  // 霓虹终端配色方案
  var N = {
    cyan: '#00e5ff',
    cyanGlow: 'rgba(0,229,255,0.15)',
    magenta: '#ff4088',
    magentaGlow: 'rgba(255,64,136,0.15)',
    green: '#39ff14',
    greenGlow: 'rgba(57,255,20,0.12)',
    amber: '#ffb74d',
    bgDark: '#080c18',
    gridLine: 'rgba(0,229,255,0.06)',
    textMuted: '#4a5568',
    textSecondary: '#7a8a9e'
  };


  // ================================================================
  //  入口：加载数据 → 初始化 → 渲染
  // ================================================================
  window.initHealthChart = function () {
    d3.json('Hdata.json', function (error, data) {
      if (error) {
        console.error('加载健康数据失败:', error);
        return;
      }
      healthData = data;

      // 记录最新日期
      if (data.records && data.records.length > 0) {
        lastDataDate = data.records[data.records.length - 1].date;
      }

      initYearSelect();
      renderChart('weight', 'all');
      updateStats('weight', 'all');
      render3DChart('all');

      // 更新按钮：切换图表类型或时间范围
      document.getElementById('updateChart').addEventListener('click', function () {
        var chartType = document.getElementById('chartType').value;
        var timeRange = document.getElementById('timeRange').value;
        renderChart(chartType, timeRange);
        updateStats(chartType, timeRange);
        render3DChart(timeRange);
      });

      initNoteViewer();
      loadRandomQuote('../quotes.json');
      startAutoUpdate();
    });
  };


  // ================================================================
  //  自动更新：每 5 分钟 + 页面可见时检查新数据
  // ================================================================
  function startAutoUpdate() {
    autoUpdateInterval = setInterval(checkForNewData, 300000);

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) {
        checkForNewData();
      }
    });
  }

  function checkForNewData() {
    d3.json('Hdata.json', function (error, data) {
      if (error || !data || !data.records || data.records.length === 0) return;

      var newLastDate = data.records[data.records.length - 1].date;

      if (newLastDate !== lastDataDate) {
        console.log('检测到新数据: ' + newLastDate);
        lastDataDate = newLastDate;
        healthData = data;

        // 重建年份/月份选择器
        var yearSelect = document.getElementById('yearSelect');
        var monthSelect = document.getElementById('monthSelect');
        yearSelect.innerHTML = '<option value="all">全部年份</option>';
        monthSelect.innerHTML = '<option value="all">全部月份</option>';
        initYearSelect();

        // 重新渲染当前视图
        var chartType = document.getElementById('chartType').value;
        var timeRange = document.getElementById('timeRange').value;
        renderChart(chartType, timeRange);
        updateStats(chartType, timeRange);
        render3DChart(timeRange);

        showUpdateNotification('数据已更新至: ' + newLastDate);
      }
    });
  }

  // 右上角浮动通知
  function showUpdateNotification(message) {
    var notification = document.createElement('div');
    notification.style.cssText = [
      'position: fixed; top: 20px; right: 20px;',
      'background: linear-gradient(135deg, #0a1628, #0c1a30);',
      'color: #00e5ff; border: 1px solid rgba(0,229,255,0.4);',
      'padding: 14px 24px; border-radius: 4px;',
      'box-shadow: 0 0 24px rgba(0,229,255,0.15);',
      'z-index: 10000; animation: slideIn 0.3s ease;',
      'font-family: "Share Tech Mono", monospace; font-size: 15px;',
      'letter-spacing: 0.04em; text-shadow: 0 0 8px rgba(0,229,255,0.3);'
    ].join('');
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(function () {
      notification.style.animation = 'slideOut 0.3s ease';
      setTimeout(function () {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }


  // ================================================================
  //  年份 / 月份选择器
  // ================================================================
  function initYearSelect() {
    if (!healthData) return;

    var yearSelect = document.getElementById('yearSelect');
    var monthSelect = document.getElementById('monthSelect');
    var years = new Set();

    healthData.records.forEach(function (item) {
      years.add(item.date.split('-')[0]);
    });

    var sortedYears = Array.from(years).sort();
    sortedYears.forEach(function (year) {
      var option = document.createElement('option');
      option.value = year;
      option.textContent = year + '年';
      yearSelect.appendChild(option);
    });

    // 预设所有月份（后续根据年份过滤）
    var allMonths = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
    allMonths.forEach(function (month) {
      var option = document.createElement('option');
      option.value = month;
      option.textContent = month + '月';
      monthSelect.appendChild(option);
    });

    yearSelect.addEventListener('change', updateMonthSelect);
  }

  // 根据选中年份更新月份列表
  function updateMonthSelect() {
    if (!healthData) return;

    var yearSelect = document.getElementById('yearSelect');
    var monthSelect = document.getElementById('monthSelect');
    var selectedYear = yearSelect.value;

    // 清除除"全部月份"外的选项
    while (monthSelect.options.length > 1) {
      monthSelect.remove(1);
    }

    if (selectedYear === 'all') {
      var allMonths = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
      allMonths.forEach(function (month) {
        var option = document.createElement('option');
        option.value = month;
        option.textContent = month + '月';
        monthSelect.appendChild(option);
      });
    } else {
      var months = new Set();
      healthData.records.forEach(function (item) {
        if (item.date.startsWith(selectedYear)) {
          months.add(item.date.split('-')[1]);
        }
      });

      Array.from(months).sort().forEach(function (month) {
        var option = document.createElement('option');
        option.value = month;
        option.textContent = parseInt(month) + '月';
        monthSelect.appendChild(option);
      });
    }
  }


  // ================================================================
  //  数据过滤：根据年份/月份/时间范围筛选记录
  // ================================================================
  function getFilteredData(timeRange) {
    if (!healthData) return [];

    var records = healthData.records.slice();
    var yearSelect = document.getElementById('yearSelect').value;
    var monthSelect = document.getElementById('monthSelect').value;

    // 按年份过滤
    if (yearSelect !== 'all') {
      records = records.filter(function (item) {
        return item.date.startsWith(yearSelect);
      });
    }

    // 按月过滤
    if (monthSelect !== 'all') {
      records = records.filter(function (item) {
        return item.date.split('-')[1] === monthSelect;
      });
    }

    // 按时间范围（天数）过滤
    if (timeRange !== 'all') {
      var days = parseInt(timeRange);
      var cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      records = records.filter(function (item) {
        return new Date(item.date) >= cutoffDate;
      });
    }

    return records;
  }


  // ================================================================
  //  2D 趋势图表（ECharts 霓虹暗色主题）
  // ================================================================
  function renderChart(chartType, timeRange) {
    var records = getFilteredData(timeRange);

    if (records.length === 0) {
      alert('所选时间段内没有数据');
      return;
    }

    // 销毁旧图表实例
    var chartDom = document.getElementById('chartContainer');
    if (currentChart) {
      currentChart.dispose();
    }

    var chart = echarts.init(chartDom, null, { backgroundColor: 'transparent' });
    var option = {};
    var dates = records.map(function (item) { return item.date; });

    // ── 体重趋势 ────────────────────────────────
    if (chartType === 'weight') {
      var weightData = records.map(function (item) {
        return item.weight_kg === -1 ? null : item.weight_kg;  // -1 表示未测量
      });

      option = {
        tooltip: {
          trigger: 'axis',
          backgroundColor: 'rgba(8,12,24,0.94)',
          borderColor: 'rgba(0,229,255,0.3)',
          textStyle: { color: '#d8e0ec', fontFamily: 'Share Tech Mono, monospace', fontSize: 14 },
          axisPointer: { lineStyle: { color: 'rgba(0,229,255,0.2)' } }
        },
        grid: { left: '3%', right: '4%', top: '8%', bottom: '8%', containLabel: true },
        xAxis: {
          type: 'category', data: dates, boundaryGap: false,
          axisLine: { lineStyle: { color: N.gridLine } },
          axisTick: { show: false },
          axisLabel: { color: N.textMuted, fontSize: 14, fontFamily: 'Share Tech Mono, monospace', rotate: 30 },
          splitLine: { show: false }
        },
        yAxis: {
          type: 'value', min: 73, max: 78, name: 'kg',
          nameTextStyle: { color: N.textMuted, fontSize: 14, fontFamily: 'Share Tech Mono, monospace' },
          axisLine: { show: false }, axisTick: { show: false },
          axisLabel: { color: N.textMuted, fontSize: 14, fontFamily: 'Share Tech Mono, monospace' },
          splitLine: { lineStyle: { color: N.gridLine, type: 'dashed' } }
        },
        series: [{
          name: '体重 (kg)', type: 'line', data: weightData,
          connectNulls: false, smooth: true,
          symbol: 'circle', symbolSize: 5,
          lineStyle: { color: N.cyan, width: 2, shadowBlur: 10, shadowColor: 'rgba(0,229,255,0.5)' },
          itemStyle: { color: N.cyan, borderColor: 'rgba(0,229,255,0.6)', borderWidth: 1 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(0,229,255,0.12)' },
              { offset: 1, color: 'rgba(0,229,255,0.01)' }
            ])
          },
          markLine: {
            silent: true, symbol: 'none',
            lineStyle: { color: 'rgba(0,229,255,0.2)', type: 'dashed', width: 1 },
            data: [{ type: 'average', name: '均值' }],
            label: { color: N.textMuted, fontSize: 14, fontFamily: 'Share Tech Mono, monospace' }
          }
        }]
      };

    // ── 睡眠时长 ────────────────────────────────
    } else if (chartType === 'sleep') {
      var sleepData = records.map(function (item) {
        return item.sleep_last;
      });

      option = {
        tooltip: {
          trigger: 'axis',
          backgroundColor: 'rgba(8,12,24,0.94)',
          borderColor: 'rgba(57,255,20,0.3)',
          textStyle: { color: '#d8e0ec', fontFamily: 'Share Tech Mono, monospace', fontSize: 14 },
          axisPointer: { lineStyle: { color: 'rgba(57,255,20,0.2)' } }
        },
        grid: { left: '3%', right: '4%', top: '8%', bottom: '8%', containLabel: true },
        xAxis: {
          type: 'category', data: dates, boundaryGap: false,
          axisLine: { lineStyle: { color: N.gridLine } },
          axisTick: { show: false },
          axisLabel: { color: N.textMuted, fontSize: 14, fontFamily: 'Share Tech Mono, monospace', rotate: 30 },
          splitLine: { show: false }
        },
        yAxis: {
          type: 'value', min: 2, max: 10, name: '小时',
          nameTextStyle: { color: N.textMuted, fontSize: 14, fontFamily: 'Share Tech Mono, monospace' },
          axisLine: { show: false }, axisTick: { show: false },
          axisLabel: { color: N.textMuted, fontSize: 14, fontFamily: 'Share Tech Mono, monospace' },
          splitLine: { lineStyle: { color: N.gridLine, type: 'dashed' } }
        },
        series: [{
          name: '睡眠 (小时)', type: 'line', data: sleepData,
          connectNulls: false, smooth: true,
          symbol: 'circle', symbolSize: 5,
          lineStyle: { color: N.green, width: 2, shadowBlur: 10, shadowColor: 'rgba(57,255,20,0.4)' },
          itemStyle: { color: N.green, borderColor: 'rgba(57,255,20,0.6)', borderWidth: 1 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(57,255,20,0.1)' },
              { offset: 1, color: 'rgba(57,255,20,0.01)' }
            ])
          },
          markLine: {
            silent: true, symbol: 'none',
            lineStyle: { color: 'rgba(57,255,20,0.2)', type: 'dashed', width: 1 },
            data: [{ type: 'average', name: '均值' }],
            label: { color: N.textMuted, fontSize: 14, fontFamily: 'Share Tech Mono, monospace' }
          }
        }]
      };

    // ── 入睡时间（跨越午夜连续映射）─────────────
    // 映射规则：18:00→-6, 23:00→-1, 0:00→0, 5:00→5
    } else if (chartType === 'sleepTime') {
      var sleepTimeData = records.map(function (item) {
        var time = new Date(item.sleep_st);
        var hours = time.getHours() + time.getMinutes() / 60;
        return hours >= 18 ? hours - 24 : hours;
      });

      option = {
        tooltip: {
          trigger: 'axis',
          backgroundColor: 'rgba(8,12,24,0.94)',
          borderColor: 'rgba(255,64,136,0.3)',
          textStyle: { color: '#d8e0ec', fontFamily: 'Share Tech Mono, monospace', fontSize: 14 },
          formatter: function (params) {
            var v = params[0].value;
            var displayHour = v < 0 ? v + 24 : v;
            var hour = Math.floor(displayHour);
            var min = Math.round((displayHour - hour) * 60);
            return params[0].name + '<br/>入睡: ' + hour + ':' + (min < 10 ? '0' + min : min);
          },
          axisPointer: { lineStyle: { color: 'rgba(255,64,136,0.2)' } }
        },
        grid: { left: '3%', right: '4%', top: '8%', bottom: '8%', containLabel: true },
        xAxis: {
          type: 'category', data: dates, boundaryGap: false,
          axisLine: { lineStyle: { color: N.gridLine } },
          axisTick: { show: false },
          axisLabel: { color: N.textMuted, fontSize: 14, fontFamily: 'Share Tech Mono, monospace', rotate: 30 },
          splitLine: { show: false }
        },
        yAxis: {
          type: 'value', min: -1, max: 5, name: '时间', inverse: true,
          nameTextStyle: { color: N.textMuted, fontSize: 14, fontFamily: 'Share Tech Mono, monospace' },
          axisLine: { show: false }, axisTick: { show: false },
          axisLabel: {
            color: N.textMuted, fontSize: 14, fontFamily: 'Share Tech Mono, monospace',
            formatter: function (v) {
              var h = v < 0 ? v + 24 : v;
              return h + ':00';
            }
          },
          splitLine: { lineStyle: { color: N.gridLine, type: 'dashed' } }
        },
        series: [{
          name: '入睡时间', type: 'line', data: sleepTimeData,
          connectNulls: false, smooth: true,
          symbol: 'circle', symbolSize: 5,
          lineStyle: { color: N.magenta, width: 2, shadowBlur: 10, shadowColor: 'rgba(255,64,136,0.4)' },
          itemStyle: { color: N.magenta, borderColor: 'rgba(255,64,136,0.6)', borderWidth: 1 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(255,64,136,0.1)' },
              { offset: 1, color: 'rgba(255,64,136,0.01)' }
            ])
          }
        }]
      };
    }

    chart.setOption(option);

    // 体重图表点击事件：显示备注弹窗
    if (chartType === 'weight') {
      chart.on('click', function (params) {
        if (params.seriesName === '体重 (kg)' && params.name) {
          showNoteModal(params.name);
        }
      });
    }

    currentChart = chart;

    window.addEventListener('resize', function () {
      if (currentChart) currentChart.resize();
      if (current3DChart) current3DChart.resize();
    });
  }


  // ================================================================
  //  3D 散点图 — 体重 × 睡眠时长 × 入睡时间
  // ================================================================
  function render3DChart(timeRange) {
    var records = getFilteredData(timeRange);

    if (current3DChart) {
      current3DChart.dispose();
      current3DChart = null;
    }

    // 仅保留有体重数据的记录
    var validRecords = records.filter(function (r) {
      return r.weight_kg > 0;
    });

    if (validRecords.length < 3) {
      var container = document.getElementById('chart3dContainer');
      if (container) {
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#4a5568;font-family:\'Share Tech Mono\',monospace;font-size:15px;letter-spacing:0.05em;">数据不足 — 需要至少3条有效体重记录</div>';
      }
      return;
    }

    // 构建 3D 数据：[体重, 睡眠时长, 入睡时间映射值, 记录索引]
    var data3D = validRecords.map(function (r, i) {
      var time = new Date(r.sleep_st);
      var hours = time.getHours() + time.getMinutes() / 60;
      var sleepOnset = hours >= 18 ? hours - 24 : hours;
      return [r.weight_kg, r.sleep_last, sleepOnset, i];
    });

    var chartDom = document.getElementById('chart3dContainer');
    if (!chartDom) return;

    var chart = echarts.init(chartDom, null, { backgroundColor: 'transparent' });

    var option = {
      tooltip: {
        backgroundColor: 'rgba(8,12,24,0.94)',
        borderColor: 'rgba(255,64,136,0.3)',
        textStyle: { color: '#d8e0ec', fontFamily: 'Share Tech Mono, monospace', fontSize: 14 },
        formatter: function (params) {
          if (!params || !params.value) return '';
          var w = params.value[0], s = params.value[1], t = params.value[2];
          var displayHour = t < 0 ? t + 24 : t;
          var h = Math.floor(displayHour), m = Math.round((displayHour - h) * 60);
          var idx = Math.round(params.value[3] || 0);
          var date = validRecords[idx] ? validRecords[idx].date : '';
          return [
            '<span style="color:#7a8a9e;">' + date + '</span><br/>',
            '<span style="color:#00e5ff;">体重:</span> ' + w.toFixed(1) + ' kg<br/>',
            '<span style="color:#39ff14;">睡眠:</span> ' + s.toFixed(1) + ' h<br/>',
            '<span style="color:#ff4088;">入睡:</span> ' + h + ':' + (m < 10 ? '0' + m : m)
          ].join('');
        }
      },
      grid3D: {
        show: true,
        boxWidth: 130, boxHeight: 110, boxDepth: 130,
        viewControl: {
          autoRotate: true, autoRotateSpeed: 0.6,
          distance: 200, alpha: 25, beta: 45,
          center: [0, 0, 0], animation: true,
          panMouseButton: 'right', rotateMouseButton: 'left'
        },
        light: {
          main: { intensity: 1.2, shadow: true, shadowQuality: 'high', alpha: 35, beta: 40 },
          ambient: { intensity: 0.6 },
          ambientCubemap: {
            texture: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8/+F9PQAI8wNPvd7POQAAAABJRU5ErkJggg==',
            exposure: 0.3
          }
        },
        axisLine: { lineStyle: { color: 'rgba(0,229,255,0.2)' } },
        axisPointer: { lineStyle: { color: 'rgba(0,229,255,0.25)' } },
        splitLine: { lineStyle: { color: 'rgba(0,229,255,0.05)' } },
        splitArea: { areaStyle: { color: ['rgba(0,229,255,0.01)', 'rgba(0,0,0,0)'] } },
        environment: 'rgba(8,12,24,0)',
        postEffect: {
          enable: true,
          bloom: { enable: true, bloomIntensity: 0.3 },
          SSAO: { enable: true, radius: 2, intensity: 0.5 },
          depthOfField: { enable: false }
        },
        temporalSuperSampling: { enable: true }
      },
      xAxis3D: {
        name: '体重 (kg)', type: 'value', min: 70, max: 78,
        nameTextStyle: { color: N.cyan, fontSize: 13, fontFamily: 'Share Tech Mono, monospace', letterSpacing: 1 },
        axisLabel: { color: N.textMuted, fontSize: 11, fontFamily: 'Share Tech Mono, monospace', formatter: function (v) { return v.toFixed(1); } },
        axisLine: { lineStyle: { color: 'rgba(0,229,255,0.35)' } },
        splitLine: { lineStyle: { color: 'rgba(0,229,255,0.06)' } }
      },
      yAxis3D: {
        name: '睡眠 (h)', type: 'value', min: 2, max: 10,
        nameTextStyle: { color: N.green, fontSize: 13, fontFamily: 'Share Tech Mono, monospace', letterSpacing: 1 },
        axisLabel: { color: N.textMuted, fontSize: 11, fontFamily: 'Share Tech Mono, monospace' },
        axisLine: { lineStyle: { color: 'rgba(57,255,20,0.35)' } },
        splitLine: { lineStyle: { color: 'rgba(57,255,20,0.04)' } }
      },
      zAxis3D: {
        name: '入睡 (时)', type: 'value', min: -1, max: 5,
        nameTextStyle: { color: N.magenta, fontSize: 13, fontFamily: 'Share Tech Mono, monospace', letterSpacing: 1 },
        axisLabel: {
          color: N.textMuted, fontSize: 11, fontFamily: 'Share Tech Mono, monospace',
          formatter: function (v) { var h = v < 0 ? v + 24 : v; return Math.floor(h) + ':00'; }
        },
        axisLine: { lineStyle: { color: 'rgba(255,64,136,0.35)' } },
        splitLine: { lineStyle: { color: 'rgba(255,64,136,0.04)' } }
      },
      // 按入睡时间着色（渐变：青色→品红）
      visualMap: {
        show: true, dimension: 2, min: -1, max: 5,
        inRange: {
          color: ['#003545', '#005566', '#007888', '#009aaa', '#00b8cc', '#00d5ee',
                  '#00e5ff', '#33e0ff', '#66ccf0', '#99b0e0', '#cc88c0', '#e860a0',
                  '#ff4088', '#ff2060']
        },
        orient: 'vertical', left: 8, top: 'center',
        text: ['晚', '早'],
        textStyle: { color: N.textMuted, fontSize: 11, fontFamily: 'Share Tech Mono, monospace' },
        itemWidth: 6, itemHeight: 120,
        borderColor: 'rgba(255,64,136,0.2)', backgroundColor: 'rgba(8,12,24,0.6)',
        padding: [8, 6],
        handleStyle: { color: N.magenta }
      },
      series: [{
        type: 'scatter3D', name: '健康数据点', data: data3D,
        symbolSize: 6,
        itemStyle: {
          borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.3)',
          opacity: 0.9, shadowBlur: 4, shadowColor: 'rgba(0,229,255,0.3)'
        },
        emphasis: {
          itemStyle: {
            symbolSize: 12, borderWidth: 1, borderColor: '#fff',
            shadowBlur: 16, shadowColor: 'rgba(0,229,255,0.6)'
          },
          label: {
            show: true,
            formatter: function (p) {
              if (!p || !p.value) return '';
              var idx = Math.round(p.value[3] || 0);
              return validRecords[idx] ? validRecords[idx].date : '';
            },
            distance: 8,
            textStyle: {
              color: '#fff', fontSize: 14, fontFamily: 'Share Tech Mono, monospace',
              backgroundColor: 'rgba(8,12,24,0.85)', padding: [3, 6], borderRadius: 2,
              borderColor: 'rgba(0,229,255,0.4)', borderWidth: 1
            }
          }
        }
      }]
    };

    chart.setOption(option);

    // 用户交互时暂停自动旋转，4 秒后恢复
    var autoRotateTimer = null;
    chart.on('mousedown', function () {
      if (autoRotateTimer) clearTimeout(autoRotateTimer);
      chart.setOption({ grid3D: { viewControl: { autoRotate: false } } });
    });
    chart.on('mouseup', function () {
      autoRotateTimer = setTimeout(function () {
        chart.setOption({ grid3D: { viewControl: { autoRotate: true } } });
      }, 4000);
    });
    chart.on('touchstart', function () {
      if (autoRotateTimer) clearTimeout(autoRotateTimer);
      chart.setOption({ grid3D: { viewControl: { autoRotate: false } } });
    });
    chart.on('touchend', function () {
      autoRotateTimer = setTimeout(function () {
        chart.setOption({ grid3D: { viewControl: { autoRotate: true } } });
      }, 4000);
    });

    current3DChart = chart;
  }


  // ================================================================
  //  体重备注弹窗
  // ================================================================
  function showNoteModal(date) {
    var noteText = weightNotes[date] || '该日期暂无备注。';
    document.getElementById('noteModalTitle').textContent = '体重备注 — ' + date;
    document.getElementById('noteModalContent').textContent = noteText;
    document.getElementById('noteModal').classList.remove('hidden');
  }

  function hideNoteModal() {
    document.getElementById('noteModal').classList.add('hidden');
  }

  function initNoteViewer() {
    d3.json('weight_notes.json', function (error, data) {
      if (!error && data) {
        weightNotes = data;
      }
    });

    var closeBtn = document.getElementById('noteModalClose');
    if (closeBtn) {
      closeBtn.addEventListener('click', hideNoteModal);
    }
  }


  // ================================================================
  //  统计信息面板（平均入睡使用循环均值算法避免午夜跨天问题）
  // ================================================================
  function updateStats(chartType, timeRange) {
    var records = getFilteredData(timeRange);
    var statsDiv = document.getElementById('statsInfo');

    // ── 体重统计 ──
    var validWeights = records.filter(function (r) { return r.weight_kg > 0; })
                              .map(function (r) { return r.weight_kg; });
    var avgWeight = validWeights.length > 0
      ? (validWeights.reduce(function (a, b) { return a + b; }, 0) / validWeights.length).toFixed(2)
      : 'N/A';
    var maxWeight = validWeights.length > 0 ? Math.max.apply(null, validWeights) : 0;
    var minWeight = validWeights.length > 0 ? Math.min.apply(null, validWeights) : 0;

    // ── 睡眠时长统计 ──
    var validSleep = records.filter(function (r) { return r.sleep_last > 0; })
                            .map(function (r) { return r.sleep_last; });
    var avgSleep = validSleep.length > 0
      ? (validSleep.reduce(function (a, b) { return a + b; }, 0) / validSleep.length).toFixed(1)
      : 'N/A';

    // ── 平均入睡时间（循环均值）──
    // 将时间映射到圆上计算平均角度，再转回时间，自动处理午夜跨天问题
    var avgSleepTimeStr = 'N/A';
    var validSleepSt = records.filter(function (r) {
      var t = new Date(r.sleep_st);
      return !isNaN(t.getTime());  // 过滤掉无效时间（如 "01:64"）
    });
    if (validSleepSt.length > 0) {
      var sumSin = 0, sumCos = 0;
      validSleepSt.forEach(function (r) {
        var time = new Date(r.sleep_st);
        var hours = time.getHours() + time.getMinutes() / 60;
        var angle = hours / 24 * 2 * Math.PI;  // 映射到 0–2π
        sumSin += Math.sin(angle);
        sumCos += Math.cos(angle);
      });
      var meanAngle = Math.atan2(sumSin, sumCos);
      if (meanAngle < 0) meanAngle += 2 * Math.PI;
      var avgSleepTime = meanAngle / (2 * Math.PI) * 24;  // 转回 0–24 小时
      var avgHour = Math.floor(avgSleepTime);
      var avgMin = Math.round((avgSleepTime - avgHour) * 60);
      if (avgMin === 60) { avgHour++; avgMin = 0; }
      avgSleepTimeStr = avgHour + ':' + (avgMin < 10 ? '0' + avgMin : avgMin);
    }

    // 渲染统计面板
    statsDiv.innerHTML =
      '<div class="stat-item">' +
        '<span class="stat-label">数据天数</span>' +
        '<span class="stat-value">' + records.length + ' 天</span>' +
      '</div>' +
      '<div class="stat-item">' +
        '<span class="stat-label">平均入睡</span>' +
        '<span class="stat-value">' + avgSleepTimeStr + '</span>' +
      '</div>' +
      '<div class="stat-item">' +
        '<span class="stat-label">体重范围</span>' +
        '<span class="stat-value">' + minWeight + ' — ' + maxWeight + ' kg</span>' +
      '</div>' +
      '<div class="stat-item">' +
        '<span class="stat-label">平均睡眠</span>' +
        '<span class="stat-value">' + avgSleep + ' h</span>' +
      '</div>';
  }


  // ================================================================
  //  自动初始化 + 响应式
  // ================================================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.initHealthChart);
  } else {
    window.initHealthChart();
  }

  window.addEventListener('resize', function () {
    if (currentChart) currentChart.resize();
    if (current3DChart) current3DChart.resize();
  });
})();
