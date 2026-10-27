/**
 * 健康数据图表模块 — 身体星图（Star Atlas）
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

  // 星图配色 — 与 health_data.css 的 --sa-* 变量保持一致
  // 三色系统：金=体重、青灰=睡眠、雾玫瑰=入睡时间
  function buildTheme() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (dark) {
      return {
        sky: '#0d1322',
        star: '#e8e6df',
        starDim: '#8b93a6',
        starFaint: '#565e72',
        gold: '#c9a86a',
        goldBright: '#dfc084',
        astro: '#7e93a8',
        rose: '#c49aa6',
        gridLine: 'rgba(232, 230, 223, 0.07)',
        rule: 'rgba(232, 230, 223, 0.15)',
        fontSerif: "'Noto Serif SC', 'Microsoft YaHei', serif",
        fontNum: "'Cormorant Garamond', 'Noto Serif SC', Georgia, serif",
        tooltipBg: 'rgba(13, 19, 34, 0.95)',
        tooltipBorder: 'rgba(201, 168, 106, 0.35)',
        tooltipText: '#e8e6df',
        axisGold: 'rgba(201, 168, 106, 0.35)',
        axisAstro: 'rgba(126, 147, 168, 0.4)',
        axisRose: 'rgba(196, 154, 166, 0.4)',
        dashGold: 'rgba(201, 168, 106, 0.30)',
        dashAstro: 'rgba(232, 230, 223, 0.25)',
        shadowGold: 'rgba(201, 168, 106, 0.35)',
        shadowAstro: 'rgba(126, 147, 168, 0.3)',
        shadowRose: 'rgba(196, 154, 166, 0.3)',
        areaGoldTop: 'rgba(201, 168, 106, 0.10)',
        areaGoldBot: 'rgba(201, 168, 106, 0.01)',
        areaAstroTop: 'rgba(126, 147, 168, 0.10)',
        areaAstroBot: 'rgba(126, 147, 168, 0.01)',
        areaRoseTop: 'rgba(196, 154, 166, 0.10)',
        areaRoseBot: 'rgba(196, 154, 166, 0.01)',
        axisLine: 'rgba(232, 230, 223, 0.18)',
        axisPointerStar: 'rgba(232, 230, 223, 0.15)',
        toastBg: 'rgba(13, 19, 34, 0.94)',
        toastText: '#dfc084',
        toastBorder: 'rgba(201, 168, 106, 0.4)',
        toastAccent: '#c9a86a',
        toastGlow: 'rgba(201, 168, 106, 0.12)',
        // 3D 散点按入睡时间着色:深夜蓝 → 星光金(晚→早)
        nightToDawn: [
          '#3a4468', '#46517a', '#56619a', '#6b74ad', '#8288bd', '#9b9cc9',
          '#b5aed1', '#cfc0d1', '#e3cfae', '#e9c890', '#e5bd74', '#dcae58',
          '#d2a043', '#c9a86a'
        ]
      };
    }
    // 日间 — 观测日志:纸面 + 墨字 + 深金强调(与全站日间统一)
    return {
      sky: '#f4f1e8',
      star: '#2c2c2c',
      starDim: '#6b6b6b',
      starFaint: '#a49d90',
      gold: '#8a6b2c',
      goldBright: '#a8823f',
      astro: '#4f6d84',
      rose: '#a55a68',
      gridLine: 'rgba(0, 0, 0, 0.07)',
      rule: 'rgba(0, 0, 0, 0.15)',
      fontSerif: "'Noto Serif SC', 'Microsoft YaHei', serif",
      fontNum: "'Cormorant Garamond', 'Noto Serif SC', Georgia, serif",
      tooltipBg: 'rgba(253, 251, 246, 0.97)',
      tooltipBorder: 'rgba(138, 107, 44, 0.4)',
      tooltipText: '#2c2c2c',
      axisGold: 'rgba(138, 107, 44, 0.4)',
      axisAstro: 'rgba(79, 109, 132, 0.45)',
      axisRose: 'rgba(165, 90, 104, 0.45)',
      dashGold: 'rgba(138, 107, 44, 0.35)',
      dashAstro: 'rgba(0, 0, 0, 0.2)',
      shadowGold: 'rgba(138, 107, 44, 0.25)',
      shadowAstro: 'rgba(79, 109, 132, 0.25)',
      shadowRose: 'rgba(165, 90, 104, 0.25)',
      areaGoldTop: 'rgba(138, 107, 44, 0.12)',
      areaGoldBot: 'rgba(138, 107, 44, 0.01)',
      areaAstroTop: 'rgba(79, 109, 132, 0.12)',
      areaAstroBot: 'rgba(79, 109, 132, 0.01)',
      areaRoseTop: 'rgba(165, 90, 104, 0.1)',
      areaRoseBot: 'rgba(165, 90, 104, 0.01)',
      axisLine: 'rgba(0, 0, 0, 0.2)',
      axisPointerStar: 'rgba(0, 0, 0, 0.15)',
      toastBg: 'rgba(253, 251, 246, 0.97)',
      toastText: '#8a6b2c',
      toastBorder: 'rgba(138, 107, 44, 0.45)',
      toastAccent: '#8a6b2c',
      toastGlow: 'rgba(138, 107, 44, 0.1)',
      env3d: '#0d1322', /* 观测井恒为夜井:黑是「井」的意象 */
      grid3DSplit: 'rgba(232, 230, 223, 0.06)',
      grid3DSplitArea: ['rgba(232, 230, 223, 0.02)', 'rgba(0, 0, 0, 0)'],
      visualMapBg: 'rgba(13, 19, 34, 0.6)',
      visualMapBorder: 'rgba(232, 230, 223, 0.2)',
      dotBorder: 'rgba(232, 230, 223, 0.5)',
      labelBg: 'rgba(13, 19, 34, 0.92)',
      labelBorder: 'rgba(201, 168, 106, 0.4)',
      nightToDawn: [
        '#3a4468', '#46517a', '#56619a', '#6b74ad', '#8288bd', '#9b9cc9',
        '#b5aed1', '#cfc0d1', '#e3cfae', '#e9c890', '#e5bd74', '#dcae58',
        '#d2a043', '#c9a86a'
      ]
    };
  }
  var THEME = buildTheme();
  var REDUCE_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var last2DOption = null;
  var last2DDates = [];    // 当前趋势图的日期轴，供手帐定位高亮
  var calState = { y: null, m: null };  // 手帐当前年月（m: 1-12）
  var calSelectedDate = null;

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

      // 月份选择器与手帐默认定位到最新观测月
      var lastParts = lastDataDate ? lastDataDate.split('-') : null;
      if (lastParts) {
        calState.y = +lastParts[0];
        calState.m = +lastParts[1];
        document.getElementById('yearSelect').value = lastParts[0];
        updateMonthSelect();
        document.getElementById('monthSelect').value = String(calState.m);
      }
      initCalendar();

      // 更新按钮：切换图表类型或时间范围
      document.getElementById('updateChart').addEventListener('click', rerenderCurrentView);

      // 主题切换:按新色板重绘(与全站 theme.js 联动)
      document.addEventListener('themechange', function () {
        THEME = buildTheme();
        rerenderCurrentView();
      });

      // 三维观测井：展开时懒渲染
      var wellDetails = document.getElementById('wellDetails');
      if (wellDetails) {
        wellDetails.addEventListener('toggle', function () {
          if (wellDetails.open && wellStale && healthData) {
            render3DChart(currentTimeRange());
            wellStale = false;
          }
        });
      }

      initNoteViewer();
      startAutoUpdate();
    });
  };


  function wellOpen() {
    var d = document.getElementById('wellDetails');
    return !!(d && d.open);
  }

  // 按当前控件选择重绘图与统计（更新按钮/主题切换/月导航共用）
  function rerenderCurrentView() {
    if (!healthData) return;
    var chartType = document.getElementById('chartType').value;
    var timeRange = document.getElementById('timeRange').value;
    renderChart(chartType, timeRange);
    updateStats(chartType, timeRange);
    if (wellOpen()) {
      render3DChart(timeRange);
      wellStale = false;
    } else {
      wellStale = true; // 井收起时不渲染，展开时再补
    }
    renderCalendar();
  }

  function currentTimeRange() {
    var el = document.getElementById('timeRange');
    return el ? el.value : 'all';
  }

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
        lastDataDate = newLastDate;
        healthData = data;

        // 重建年份/月份选择器
        var yearSelect = document.getElementById('yearSelect');
        var monthSelect = document.getElementById('monthSelect');
        yearSelect.innerHTML = '<option value="all">全部年份</option>';
        monthSelect.innerHTML = '<option value="all">全部月份</option>';
        initYearSelect();

        // 重新渲染当前视图
        rerenderCurrentView();

        showUpdateNotification('数据已更新至: ' + newLastDate);
      }
    });
  }

  // 右上角浮动通知（星图快讯样式，配色细节由 CSS 的 .update-toast 补充）
  function showUpdateNotification(message) {
    var notification = document.createElement('div');
    notification.className = 'update-toast';
    notification.style.cssText = [
      'position: fixed; top: 20px; right: 20px;',
      'background: ' + THEME.toastBg + ';',
      'color: ' + THEME.toastText + '; border: 1px solid ' + THEME.toastBorder + '; border-left: 3px solid ' + THEME.toastAccent + ';',
      'padding: 12px 22px; border-radius: 4px;',
      'box-shadow: 0 0 20px ' + THEME.toastGlow + ';',
      'z-index: 10000; animation: slideIn 0.3s ease;',
      'font-family: "Noto Serif SC","Microsoft YaHei",serif; font-size: 15px;',
      'letter-spacing: 0.08em;'
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
  //  2D 趋势图表（ECharts 星图主题 — 星轨 + 淡银雾）
  // ================================================================
  function renderChart(chartType, timeRange) {
    var records = getFilteredData(timeRange);

    if (records.length === 0) {
      var emptyDom = document.getElementById('chartContainer');
      if (emptyDom) {
        emptyDom.innerHTML = '<p class="chart-empty">所选时间段内没有数据 — 放宽筛选后再观测。</p>';
      }
      if (currentChart) { currentChart.dispose(); currentChart = null; }
      last2DOption = null;
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
      // 7 日移动平均（忽略未测日，≥3 个有效点才出线）
      var maData = (function () {
        var out = [], win = [];
        for (var i = 0; i < weightData.length; i++) {
          var v = weightData[i];
          if (v == null) { out.push(null); continue; }
          win.push(v);
          if (win.length > 7) win.shift();
          if (win.length < 3) { out.push(null); continue; }
          var sum = 0;
          for (var j = 0; j < win.length; j++) sum += win[j];
          out.push(+(sum / win.length).toFixed(2));
        }
        return out;
      })();


      option = {
        tooltip: {
          trigger: 'axis',
          backgroundColor: THEME.tooltipBg,
          borderColor: THEME.tooltipBorder,
          textStyle: { color: THEME.tooltipText, fontFamily: THEME.fontSerif, fontSize: 13 },
          axisPointer: { lineStyle: { color: THEME.axisGold, type: 'dashed' } }
        },
        grid: { left: '3%', right: '4%', top: '8%', bottom: '8%', containLabel: true },
        xAxis: {
          type: 'category', data: dates, boundaryGap: false,
          axisLine: { lineStyle: { color: THEME.rule } },
          axisTick: { show: false },
          axisLabel: { color: THEME.starDim, fontSize: 12, fontFamily: THEME.fontNum, rotate: 30 },
          splitLine: { show: false }
        },
        yAxis: {
          type: 'value', min: 73, max: 78, name: 'kg',
          nameTextStyle: { color: THEME.starDim, fontSize: 12, fontFamily: THEME.fontSerif },
          axisLine: { show: false }, axisTick: { show: false },
          axisLabel: { color: THEME.starDim, fontSize: 12, fontFamily: THEME.fontNum },
          splitLine: { lineStyle: { color: THEME.gridLine, type: 'dashed' } }
        },
        series: [{
          name: '体重 (kg)', type: 'line', data: weightData,
          connectNulls: false, smooth: true,
          symbol: 'circle', symbolSize: 5,
          lineStyle: { color: THEME.gold, width: 1.5, shadowBlur: 6, shadowColor: THEME.shadowGold },
          itemStyle: { color: THEME.sky, borderColor: THEME.gold, borderWidth: 1.2 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: THEME.areaGoldTop },
              { offset: 1, color: THEME.areaGoldBot }
            ])
          },
          markLine: {
            silent: true, symbol: 'none',
            lineStyle: { color: THEME.dashGold, type: 'dashed', width: 1 },
            data: [{ type: 'average', name: '均值' }],
            label: { color: THEME.starDim, fontSize: 11, fontFamily: THEME.fontSerif }
          }
        }, {
          name: '7日均线', type: 'line', data: maData,
          smooth: true, symbol: 'none',
          lineStyle: { color: THEME.starDim, width: 1.2, opacity: 0.85 },
          itemStyle: { color: THEME.starDim },
          emphasis: { scale: 0 },
          z: 1
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
          backgroundColor: THEME.tooltipBg,
          borderColor: THEME.tooltipBorder,
          textStyle: { color: THEME.tooltipText, fontFamily: THEME.fontSerif, fontSize: 13 },
          axisPointer: { lineStyle: { color: THEME.axisAstro, type: 'dashed' } }
        },
        grid: { left: '3%', right: '4%', top: '8%', bottom: '8%', containLabel: true },
        xAxis: {
          type: 'category', data: dates, boundaryGap: false,
          axisLine: { lineStyle: { color: THEME.rule } },
          axisTick: { show: false },
          axisLabel: { color: THEME.starDim, fontSize: 12, fontFamily: THEME.fontNum, rotate: 30 },
          splitLine: { show: false }
        },
        yAxis: {
          type: 'value', min: 2, max: 10, name: '小时',
          nameTextStyle: { color: THEME.starDim, fontSize: 12, fontFamily: THEME.fontSerif },
          axisLine: { show: false }, axisTick: { show: false },
          axisLabel: { color: THEME.starDim, fontSize: 12, fontFamily: THEME.fontNum },
          splitLine: { lineStyle: { color: THEME.gridLine, type: 'dashed' } }
        },
        series: [{
          name: '睡眠 (小时)', type: 'line', data: sleepData,
          connectNulls: false, smooth: true,
          symbol: 'circle', symbolSize: 5,
          lineStyle: { color: THEME.astro, width: 1.5, shadowBlur: 6, shadowColor: THEME.shadowAstro },
          itemStyle: { color: THEME.sky, borderColor: THEME.astro, borderWidth: 1.2 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: THEME.areaAstroTop },
              { offset: 1, color: THEME.areaAstroBot }
            ])
          },
          markLine: {
            silent: true, symbol: 'none',
            lineStyle: { color: THEME.dashAstro, type: 'dashed', width: 1 },
            data: [{ type: 'average', name: '均值' }],
            label: { color: THEME.starDim, fontSize: 11, fontFamily: THEME.fontSerif }
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
          backgroundColor: THEME.tooltipBg,
          borderColor: THEME.tooltipBorder,
          textStyle: { color: THEME.tooltipText, fontFamily: THEME.fontSerif, fontSize: 13 },
          formatter: function (params) {
            var v = params[0].value;
            var displayHour = v < 0 ? v + 24 : v;
            var hour = Math.floor(displayHour);
            var min = Math.round((displayHour - hour) * 60);
            return params[0].name + '<br/>入睡: ' + hour + ':' + (min < 10 ? '0' + min : min);
          },
          axisPointer: { lineStyle: { color: THEME.axisRose, type: 'dashed' } }
        },
        grid: { left: '3%', right: '4%', top: '8%', bottom: '8%', containLabel: true },
        xAxis: {
          type: 'category', data: dates, boundaryGap: false,
          axisLine: { lineStyle: { color: THEME.rule } },
          axisTick: { show: false },
          axisLabel: { color: THEME.starDim, fontSize: 12, fontFamily: THEME.fontNum, rotate: 30 },
          splitLine: { show: false }
        },
        yAxis: {
          type: 'value', min: -1, max: 5, name: '时间', inverse: true,
          nameTextStyle: { color: THEME.starDim, fontSize: 12, fontFamily: THEME.fontSerif },
          axisLine: { show: false }, axisTick: { show: false },
          axisLabel: {
            color: THEME.starDim, fontSize: 12, fontFamily: THEME.fontNum,
            formatter: function (v) {
              var h = v < 0 ? v + 24 : v;
              return h + ':00';
            }
          },
          splitLine: { lineStyle: { color: THEME.gridLine, type: 'dashed' } }
        },
        series: [{
          name: '入睡时间', type: 'line', data: sleepTimeData,
          connectNulls: false, smooth: true,
          symbol: 'circle', symbolSize: 5,
          lineStyle: { color: THEME.rose, width: 1.5, shadowBlur: 6, shadowColor: THEME.shadowRose },
          itemStyle: { color: THEME.sky, borderColor: THEME.rose, borderWidth: 1.2 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: THEME.areaRoseTop },
              { offset: 1, color: THEME.areaRoseBot }
            ])
          }
        }]
      };
    }

    chart.setOption(option);
    last2DOption = option;
    last2DDates = dates || [];

    // 体重图表点击事件：显示备注弹窗
    if (chartType === 'weight') {
      chart.on('click', function (params) {
        if (params.seriesName === '体重 (kg)' && params.name) {
          showNoteModal(params.name);
        }
      });
    }

    currentChart = chart;
    // 窗口缩放的自适应监听统一注册在文件末尾，这里不要重复注册
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
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:' + THEME.starDim + ';font-family:\'Noto Serif SC\',\'Microsoft YaHei\',serif;font-size:15px;letter-spacing:0.1em;">数据不足 — 需要至少3条有效体重记录</div>';
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
        backgroundColor: THEME.tooltipBg,
        borderColor: THEME.tooltipBorder,
        textStyle: { color: THEME.tooltipText, fontFamily: THEME.fontSerif, fontSize: 13 },
        formatter: function (params) {
          if (!params || !params.value) return '';
          var w = params.value[0], s = params.value[1], t = params.value[2];
          var displayHour = t < 0 ? t + 24 : t;
          var h = Math.floor(displayHour), m = Math.round((displayHour - h) * 60);
          var idx = Math.round(params.value[3] || 0);
          var date = validRecords[idx] ? validRecords[idx].date : '';
          return [
            '<span style="color:' + THEME.starDim + ';">' + date + '</span><br/>',
            '<span style="color:' + THEME.goldBright + ';">体重:</span> ' + w.toFixed(1) + ' kg<br/>',
            '<span style="color:' + THEME.astro + ';">睡眠:</span> ' + s.toFixed(1) + ' h<br/>',
            '<span style="color:' + THEME.rose + ';">入睡:</span> ' + h + ':' + (m < 10 ? '0' + m : m)
          ].join('');
        }
      },
      grid3D: {
        show: true,
        boxWidth: 130, boxHeight: 110, boxDepth: 130,
        viewControl: {
          autoRotate: !REDUCE_MOTION, autoRotateSpeed: 0.6,
          distance: 200, alpha: 25, beta: 45,
          center: [0, 0, 0], animation: true,
          panMouseButton: 'right', rotateMouseButton: 'left'
        },
        light: {
          main: { intensity: 1.0, shadow: true, shadowQuality: 'high', alpha: 35, beta: 40 },
          ambient: { intensity: 0.7 },
          ambientCubemap: {
            texture: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8/+F9PQAI8wNPvd7POQAAAABJRU5ErkJggg==',
            exposure: 0.25
          }
        },
        axisLine: { lineStyle: { color: THEME.axisLine } },
        axisPointer: { lineStyle: { color: THEME.axisPointerStar } },
        splitLine: { lineStyle: { color: THEME.grid3DSplit } },
        splitArea: { areaStyle: { color: THEME.grid3DSplitArea } },
        environment: THEME.env3d,
        postEffect: {
          enable: true,
          bloom: { enable: false },
          SSAO: { enable: false },
          depthOfField: { enable: false }
        },
        temporalSuperSampling: { enable: true }
      },
      xAxis3D: {
        name: '体重 (kg)', type: 'value', min: 70, max: 78,
        nameTextStyle: { color: THEME.gold, fontSize: 13, fontFamily: THEME.fontSerif, letterSpacing: 1 },
        axisLabel: { color: THEME.starDim, fontSize: 11, fontFamily: THEME.fontNum, formatter: function (v) { return v.toFixed(1); } },
        axisLine: { lineStyle: { color: 'rgba(201,168,106,0.45)' } },
        splitLine: { lineStyle: { color: 'rgba(201,168,106,0.10)' } }
      },
      yAxis3D: {
        name: '睡眠 (h)', type: 'value', min: 2, max: 10,
        nameTextStyle: { color: THEME.astro, fontSize: 13, fontFamily: THEME.fontSerif, letterSpacing: 1 },
        axisLabel: { color: THEME.starDim, fontSize: 11, fontFamily: THEME.fontNum },
        axisLine: { lineStyle: { color: 'rgba(126,147,168,0.45)' } },
        splitLine: { lineStyle: { color: 'rgba(126,147,168,0.10)' } }
      },
      zAxis3D: {
        name: '入睡 (时)', type: 'value', min: -1, max: 5,
        nameTextStyle: { color: THEME.rose, fontSize: 13, fontFamily: THEME.fontSerif, letterSpacing: 1 },
        axisLabel: {
          color: THEME.starDim, fontSize: 11, fontFamily: THEME.fontNum,
          formatter: function (v) { var h = v < 0 ? v + 24 : v; return Math.floor(h) + ':00'; }
        },
        axisLine: { lineStyle: { color: 'rgba(196,154,166,0.45)' } },
        splitLine: { lineStyle: { color: 'rgba(196,154,166,0.10)' } }
      },
      // 按入睡时间着色（渐变：深夜蓝 → 星光金）
      visualMap: {
        show: true, dimension: 2, min: -1, max: 5,
        inRange: {
          color: THEME.nightToDawn
        },
        orient: 'vertical', left: 8, top: 'center',
        text: ['晚', '早'],
        textStyle: { color: THEME.starDim, fontSize: 11, fontFamily: THEME.fontSerif },
        itemWidth: 6, itemHeight: 120,
        borderColor: THEME.visualMapBorder, backgroundColor: THEME.visualMapBg,
        padding: [8, 6],
        handleStyle: { color: THEME.goldBright }
      },
      series: [{
        type: 'scatter3D', name: '健康数据点', data: data3D,
        symbolSize: 6,
        itemStyle: {
          borderWidth: 0.6, borderColor: THEME.dotBorder,
          opacity: 0.95, shadowBlur: 5, shadowColor: 'rgba(201,168,106,0.35)'
        },
        emphasis: {
          itemStyle: {
            symbolSize: 12, borderWidth: 1, borderColor: '#fff',
            shadowBlur: 14, shadowColor: 'rgba(223,192,132,0.6)'
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
              color: THEME.star, fontSize: 13, fontFamily: THEME.fontSerif,
              backgroundColor: THEME.labelBg, padding: [3, 8], borderRadius: 2,
              borderColor: THEME.labelBorder, borderWidth: 1
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

    animateStats(statsDiv);
  }

  // 统计数字滚动计数（纯数字前缀才动画；减动效直接显示终值）
  function animateStats(container) {
    if (REDUCE_MOTION || !container) return;
    var values = container.querySelectorAll('.stat-value');
    Array.prototype.forEach.call(values, function (el, i) {
      var text = el.textContent;
      var m = text.match(/^(\d+)(?!\.?\d)(.*)$/);
      if (!m) return;
      var target = parseInt(m[1], 10);
      var rest = m[2] || '';
      if (isNaN(target) || target <= 0 || target > 99999) return;
      var start = null;
      var dur = 900 + i * 140;
      function step(ts) {
        if (!start) start = ts;
        var k = Math.min(1, (ts - start) / dur);
        var eased = 1 - Math.pow(1 - k, 3);
        el.textContent = Math.round(target * eased) + rest;
        if (k < 1) requestAnimationFrame(step);
      }
      el.textContent = '0' + rest;
      requestAnimationFrame(step);
    });
  }


  // ================================================================
  //  逐日手帐：月历方格 + 详情卡 + 月导航
  // ================================================================
  var wellStale = true;
  var WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];

  function initCalendar() {
    var prev = document.getElementById('calPrev');
    var next = document.getElementById('calNext');
    if (prev) prev.addEventListener('click', function () { stepMonth(-1); });
    if (next) next.addEventListener('click', function () { stepMonth(1); });
    renderCalendar();
  }

  function stepMonth(delta) {
    var probe = new Date(calState.y, calState.m - 1 + delta, 1);
    calState.y = probe.getFullYear();
    calState.m = probe.getMonth() + 1;

    // 有数据的月份才联动趋势选择器（选项只含数据月份）
    var yOk = false, mOk = false;
    var ys = document.getElementById('yearSelect');
    var ms = document.getElementById('monthSelect');
    Array.prototype.forEach.call(ys.options, function (o) { if (o.value === String(calState.y)) yOk = true; });
    if (yOk) {
      ys.value = String(calState.y);
      updateMonthSelect();
      Array.prototype.forEach.call(ms.options, function (o) { if (o.value === String(calState.m)) mOk = true; });
      if (mOk) ms.value = String(calState.m);
    }

    // 趋势与统计跟随有数据的月份；空月只刷新手帐
    if (yOk && mOk) {
      rerenderCurrentView();
    } else {
      renderCalendar();
    }
  }

  // 渲染某月的手帐方格
  function renderCalendar() {
    var grid = document.getElementById('calendarGrid');
    var label = document.getElementById('monthLabel');
    if (!grid || !healthData) return;

    if (calState.y === null || calState.m === null) {
      // 数据为空时的兜底：定位到今天
      var now = new Date();
      calState.y = now.getFullYear();
      calState.m = now.getMonth() + 1;
    }

    label.textContent = calState.y + ' 年 ' + calState.m + ' 月';

    // 该月记录索引（按日期）
    var prefix = calState.y + '-' + (calState.m < 10 ? '0' + calState.m : calState.m);
    var byDate = {};
    healthData.records.forEach(function (r) {
      if (r.date && r.date.indexOf(prefix) === 0) byDate[r.date] = r;
    });

    var first = new Date(calState.y, calState.m - 1, 1);
    var daysInMonth = new Date(calState.y, calState.m, 0).getDate();
    var lead = (first.getDay() + 6) % 7; // 周一起始

    // 睡眠条按当月范围归一（5–10h 映射 12%–100%），并记录极值供 title 提示
    var monthSleeps = [];
    Object.keys(byDate).forEach(function (d) {
      if (byDate[d].sleep_last > 0) monthSleeps.push(byDate[d].sleep_last);
    });
    var slMin = monthSleeps.length ? Math.min.apply(null, monthSleeps) : 5;
    var slMax = monthSleeps.length ? Math.max.apply(null, monthSleeps) : 10;
    if (slMax - slMin < 1) { slMin = slMax - 1; }

    var todayStr = (function () {
      var d = new Date();
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    })();

    var html = '';
    var i;
    for (i = 0; i < lead; i++) html += '<span class="cal-cell is-outside" aria-hidden="true"></span>';

    var hasAny = false;
    for (i = 1; i <= daysInMonth; i++) {
      var dateStr = prefix + '-' + String(i).padStart(2, '0');
      var rec = byDate[dateStr];
      var isFuture = dateStr > todayStr;
      var measured = rec && rec.weight_kg > 0;
      var slept = rec && rec.sleep_last > 0;
      var hasNote = !!(weightNotes && weightNotes[dateStr]);
      if (rec) hasAny = true;

      var cls = 'cal-cell';
      if (dateStr === todayStr) cls += ' is-today';
      if (!rec) cls += isFuture ? ' is-future' : ' is-empty';
      if (measured) cls += ' measured';
      else if (rec) cls += ' unmeasured';
      if (dateStr === calSelectedDate) cls += ' selected';

      var inner = '<span class="cal-day">' + String(i).padStart(2, '0') + '</span>';
      if (rec) {
        if (measured) {
          inner += '<span class="cal-weight">' + rec.weight_kg.toFixed(1) + '</span>';
        } else {
          inner += '<span class="cal-weight">未测</span>';
        }
        var sleepW = slept ? Math.round(12 + 88 * Math.min(1, Math.max(0, (rec.sleep_last - slMin) / Math.max(0.5, slMax - slMin)))) : 0;
        inner += '<span class="cal-sleep" aria-hidden="true">' +
                 (slept ? '<i style="width:' + sleepW + '%"></i>' : '') +
                 '</span>';
        var sleepTitle = slept ? '，睡眠 ' + rec.sleep_last.toFixed(1) + ' 小时' : '';
        if (hasNote) inner += '<span class="cal-notemark" title="有备注">✦</span>';
      }

      var aria = rec
        ? 'aria-label="' + dateStr + ' 体重 ' + (measured ? rec.weight_kg + '公斤' : '未测') + sleepTitle + (hasNote ? '，有备注' : '') + '"'
        : '';
      html += '<button type="button" class="' + cls + '" data-date="' + dateStr + '" ' + aria + '>' + inner + '</button>';
    }

    grid.innerHTML = html;

    if (!hasAny) {
      var tip = document.createElement('p');
      tip.className = 'chart-empty';
      tip.textContent = '该月没有观测记录 — 用 ‹ › 翻到有数据的日子。';
      grid.appendChild(tip);
    }

    // 事件委托：点格子 → 详情卡 + 趋势定位
    grid.onclick = function (e) {
      var cell = e.target.closest('.cal-cell[data-date]');
      if (!cell || cell.classList.contains('is-empty') || cell.classList.contains('is-future')) return;
      showDayDetail(cell.getAttribute('data-date'), cell);
    };
  }

  // 详情卡 + 趋势图定位高亮
  function showDayDetail(dateStr, cell) {
    calSelectedDate = dateStr;

    // 选中态
    var grid = document.getElementById('calendarGrid');
    Array.prototype.forEach.call(grid.querySelectorAll('.cal-cell.selected'), function (c) {
      c.classList.remove('selected');
    });
    if (cell) cell.classList.add('selected');

    var rec = null;
    healthData.records.forEach(function (r) { if (r.date === dateStr) rec = r; });

    var card = document.getElementById('dayCard');
    if (!card) return;

    if (!rec) {
      card.innerHTML = '<span class="day-card-date">' + dateStr + '</span>' +
        '<span class="day-card-week">' + weekCn(dateStr) + '</span>' +
        '<p class="day-card-empty">该日无观测记录。</p>';
      return;
    }

    var w = rec.weight_kg > 0
      ? '<dd class="pos">' + rec.weight_kg.toFixed(1) + ' kg</dd>'
      : '<dd class="na">未测</dd>';
    var sH = rec.sleep_last > 0
      ? '<dd class="slp">' + rec.sleep_last.toFixed(1) + ' h</dd>'
      : '<dd class="na">未测</dd>';
    var onset = 'na';
    var onsetText = '—';
    if (rec.sleep_st) {
      var t = new Date(rec.sleep_st);
      if (!isNaN(t.getTime())) {
        onsetText = t.getHours() + ':' + (t.getMinutes() < 10 ? '0' + t.getMinutes() : t.getMinutes());
        onset = 'ons';
      }
    }

    var noteText = weightNotes && weightNotes[dateStr];
    var noteHtml = noteText
      ? '<div class="day-card-note"><span class="note-kicker">当日备注 · NOTE</span><p>' + noteText + '</p></div>'
      : '<div class="day-card-note"><span class="note-kicker">当日备注 · NOTE</span><p class="no-note">该日暂无备注。</p></div>';

    card.innerHTML =
      '<span class="day-card-date">' + dateStr + '</span>' +
      '<span class="day-card-week">' + weekCn(dateStr) + '</span>' +
      '<dl>' +
        '<dt>体重</dt>' + w +
        '<dt>睡眠时长</dt>' + sH +
        '<dt>入睡</dt><dd class="' + onset + '">' + onsetText + '</dd>' +
      '</dl>' +
      noteHtml;

    // 趋势图定位：高亮 + 提示框指到那天
    if (currentChart && last2DDates.length) {
      var idx = last2DDates.indexOf(dateStr);
      if (idx >= 0) {
        try {
          currentChart.dispatchAction({ type: 'downplay' });
          currentChart.dispatchAction({ type: 'highlight', seriesIndex: 0, dataIndex: idx });
          currentChart.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: idx });
        } catch (err) { /* 图表未就绪时忽略 */ }
      }
    }
  }

  function weekCn(dateStr) {
    var d = new Date(dateStr + 'T00:00:00');
    return isNaN(d.getTime()) ? '' : '星期' + WEEK_CN[d.getDay()];
  }

  // ================================================================
  //  工具条：移动端折叠 + 选项即改即生效
  // ================================================================
  (function () {
    var toggle = document.getElementById('toolbarToggle');
    var panel = document.querySelector('.control-panel');
    if (toggle && panel) {
      toggle.addEventListener('click', function () {
        var open = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', String(!open));
        panel.classList.toggle('toolbar-open', !open);
        toggle.textContent = (open ? '观测设置 ▼' : '收起设置 ▲');
      });
    }
    ['chartType', 'timeRange', 'yearSelect', 'monthSelect'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', rerenderCurrentView);
    });
  })();

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
