/**
 * 健康数据图表模块 — N E O N · T E R M I N A L
 * Health Data Chart Module
 */

(function() {
    // 全局变量
    var healthData = null;
    var currentChart = null;
    var current3DChart = null;
    var lastDataDate = null;
    var autoUpdateInterval = null;
    var weightNotes = {};

    // ECharts 霓虹主题色
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

    // ECharts 通用暗色主题配置
    function neonAxisStyle(name) {
        return {
            type: 'category',
            data: [],
            boundaryGap: false,
            name: name,
            nameTextStyle: {
                color: N.textMuted,
                fontSize: 14,
                fontFamily: 'Share Tech Mono, monospace',
                letterSpacing: 1
            },
            axisLine: { lineStyle: { color: N.gridLine } },
            axisTick: { lineStyle: { color: N.gridLine } },
            axisLabel: {
                color: N.textMuted,
                fontSize: 14,
                fontFamily: 'Share Tech Mono, monospace'
            },
            splitLine: { show: false }
        };
    }

    // 暴露给全局的初始化函数
    window.initHealthChart = function() {
        d3.json("Hdata.json", function(error, data) {
            if (error) {
                console.error("加载数据失败:", error);
                return;
            }
            healthData = data;

            if (data.records && data.records.length > 0) {
                lastDataDate = data.records[data.records.length - 1].date;
            }

            initYearSelect();
            renderChart('weight', 'all');
            updateStats('weight', 'all');
            render3DChart('all');

            document.getElementById('updateChart').addEventListener('click', function() {
                var chartType = document.getElementById('chartType').value;
                var timeRange = document.getElementById('timeRange').value;
                renderChart(chartType, timeRange);
                updateStats(chartType, timeRange);
                render3DChart(timeRange);
            });

            initNoteViewer();
            loadRandomQuote();
            startAutoUpdate();
        });
    };

    function startAutoUpdate() {
        autoUpdateInterval = setInterval(checkForNewData, 300000);

        document.addEventListener('visibilitychange', function() {
            if (!document.hidden) {
                checkForNewData();
            }
        });
    }

    function checkForNewData() {
        d3.json("Hdata.json", function(error, data) {
            if (error) {
                console.error("检查新数据失败:", error);
                return;
            }

            if (!data || !data.records || data.records.length === 0) return;

            var newLastDate = data.records[data.records.length - 1].date;

            if (newLastDate !== lastDataDate) {
                console.log('检测到新数据: ' + newLastDate);
                lastDataDate = newLastDate;
                healthData = data;

                var yearSelect = document.getElementById('yearSelect');
                var monthSelect = document.getElementById('monthSelect');
                yearSelect.innerHTML = '<option value="all">全部年份</option>';
                monthSelect.innerHTML = '<option value="all">全部月份</option>';
                initYearSelect();

                var chartType = document.getElementById('chartType').value;
                var timeRange = document.getElementById('timeRange').value;
                renderChart(chartType, timeRange);
                updateStats(chartType, timeRange);
                render3DChart(timeRange);

                showUpdateNotification('数据已更新至: ' + newLastDate);
            }
        });
    }

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

        setTimeout(function() {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(function() {
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    function initYearSelect() {
        if (!healthData) return;

        var yearSelect = document.getElementById('yearSelect');
        var monthSelect = document.getElementById('monthSelect');
        var years = new Set();

        healthData.records.forEach(function(item) {
            var year = item.date.split('-')[0];
            years.add(year);
        });

        var sortedYears = Array.from(years).sort();

        sortedYears.forEach(function(year) {
            var option = document.createElement('option');
            option.value = year;
            option.textContent = year + '年';
            yearSelect.appendChild(option);
        });

        var allMonths = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
        allMonths.forEach(function(month) {
            var option = document.createElement('option');
            option.value = month;
            option.textContent = month + '月';
            monthSelect.appendChild(option);
        });

        yearSelect.addEventListener('change', function() {
            updateMonthSelect();
        });
    }

    function updateMonthSelect() {
        if (!healthData) return;

        var yearSelect = document.getElementById('yearSelect');
        var monthSelect = document.getElementById('monthSelect');
        var selectedYear = yearSelect.value;

        while (monthSelect.options.length > 1) {
            monthSelect.remove(1);
        }

        if (selectedYear === 'all') {
            var allMonths = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
            allMonths.forEach(function(month) {
                var option = document.createElement('option');
                option.value = month;
                option.textContent = month + '月';
                monthSelect.appendChild(option);
            });
        } else {
            var months = new Set();
            healthData.records.forEach(function(item) {
                if (item.date.startsWith(selectedYear)) {
                    var month = item.date.split('-')[1];
                    months.add(month);
                }
            });

            var sortedMonths = Array.from(months).sort();

            sortedMonths.forEach(function(month) {
                var option = document.createElement('option');
                option.value = month;
                option.textContent = parseInt(month) + '月';
                monthSelect.appendChild(option);
            });
        }
    }

    function getFilteredData(timeRange) {
        if (!healthData) return [];

        var records = healthData.records.slice();
        var yearSelect = document.getElementById('yearSelect').value;
        var monthSelect = document.getElementById('monthSelect').value;

        if (yearSelect !== 'all') {
            records = records.filter(function(item) {
                return item.date.startsWith(yearSelect);
            });
        }

        if (monthSelect !== 'all') {
            records = records.filter(function(item) {
                var month = item.date.split('-')[1];
                return month === monthSelect;
            });
        }

        if (timeRange !== 'all') {
            var days = parseInt(timeRange);
            var cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);
            records = records.filter(function(item) {
                return new Date(item.date) >= cutoffDate;
            });
        }

        return records;
    }

    // ============================================================
    //  2D 趋势图表 (霓虹暗色主题)
    // ============================================================
    function renderChart(chartType, timeRange) {
        var records = getFilteredData(timeRange);

        if (records.length === 0) {
            alert('所选时间段内没有数据');
            return;
        }

        var chartDom = document.getElementById('chartContainer');

        if (currentChart) {
            currentChart.dispose();
        }

        var chart = echarts.init(chartDom, null, {
            backgroundColor: 'transparent'
        });
        var option = {};
        var dates = records.map(function(item) { return item.date; });

        if (chartType === 'weight') {
            var weightData = records.map(function(item) {
                return item.weight_kg === -1 ? null : item.weight_kg;
            });

            option = {
                tooltip: {
                    trigger: 'axis',
                    backgroundColor: 'rgba(8,12,24,0.94)',
                    borderColor: 'rgba(0,229,255,0.3)',
                    textStyle: {
                        color: '#d8e0ec',
                        fontFamily: 'Share Tech Mono, monospace',
                        fontSize: 14
                    },
                    axisPointer: {
                        lineStyle: { color: 'rgba(0,229,255,0.2)' }
                    }
                },
                grid: {
                    left: '3%', right: '4%', top: '8%', bottom: '8%',
                    containLabel: true
                },
                xAxis: {
                    type: 'category',
                    data: dates,
                    boundaryGap: false,
                    axisLine: { lineStyle: { color: N.gridLine } },
                    axisTick: { show: false },
                    axisLabel: {
                        color: N.textMuted,
                        fontSize: 14,
                        fontFamily: 'Share Tech Mono, monospace',
                        rotate: 30
                    },
                    splitLine: { show: false }
                },
                yAxis: {
                    type: 'value',
                    min: 73,
                    max: 78,
                    name: 'kg',
                    nameTextStyle: {
                        color: N.textMuted,
                        fontSize: 14,
                        fontFamily: 'Share Tech Mono, monospace'
                    },
                    axisLine: { show: false },
                    axisTick: { show: false },
                    axisLabel: {
                        color: N.textMuted,
                        fontSize: 14,
                        fontFamily: 'Share Tech Mono, monospace'
                    },
                    splitLine: { lineStyle: { color: N.gridLine, type: 'dashed' } }
                },
                series: [{
                    name: '体重 (kg)',
                    type: 'line',
                    data: weightData,
                    connectNulls: false,
                    smooth: true,
                    symbol: 'circle',
                    symbolSize: 5,
                    lineStyle: {
                        color: N.cyan,
                        width: 2,
                        shadowBlur: 10,
                        shadowColor: 'rgba(0,229,255,0.5)'
                    },
                    itemStyle: {
                        color: N.cyan,
                        borderColor: 'rgba(0,229,255,0.6)',
                        borderWidth: 1
                    },
                    areaStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(0,229,255,0.12)' },
                            { offset: 1, color: 'rgba(0,229,255,0.01)' }
                        ])
                    },
                    markLine: {
                        silent: true,
                        symbol: 'none',
                        lineStyle: { color: 'rgba(0,229,255,0.2)', type: 'dashed', width: 1 },
                        data: [{ type: 'average', name: '均值' }],
                        label: {
                            color: N.textMuted,
                            fontSize: 14,
                            fontFamily: 'Share Tech Mono, monospace'
                        }
                    }
                }]
            };
        } else if (chartType === 'sleep') {
            var sleepData = records.map(function(item) {
                return item.sleep_last;
            });

            option = {
                tooltip: {
                    trigger: 'axis',
                    backgroundColor: 'rgba(8,12,24,0.94)',
                    borderColor: 'rgba(57,255,20,0.3)',
                    textStyle: {
                        color: '#d8e0ec',
                        fontFamily: 'Share Tech Mono, monospace',
                        fontSize: 14
                    },
                    axisPointer: {
                        lineStyle: { color: 'rgba(57,255,20,0.2)' }
                    }
                },
                grid: {
                    left: '3%', right: '4%', top: '8%', bottom: '8%',
                    containLabel: true
                },
                xAxis: {
                    type: 'category',
                    data: dates,
                    boundaryGap: false,
                    axisLine: { lineStyle: { color: N.gridLine } },
                    axisTick: { show: false },
                    axisLabel: {
                        color: N.textMuted,
                        fontSize: 14,
                        fontFamily: 'Share Tech Mono, monospace',
                        rotate: 30
                    },
                    splitLine: { show: false }
                },
                yAxis: {
                    type: 'value',
                    min: 2,
                    max: 10,
                    name: '小时',
                    nameTextStyle: {
                        color: N.textMuted,
                        fontSize: 14,
                        fontFamily: 'Share Tech Mono, monospace'
                    },
                    axisLine: { show: false },
                    axisTick: { show: false },
                    axisLabel: {
                        color: N.textMuted,
                        fontSize: 14,
                        fontFamily: 'Share Tech Mono, monospace'
                    },
                    splitLine: { lineStyle: { color: N.gridLine, type: 'dashed' } }
                },
                series: [{
                    name: '睡眠 (小时)',
                    type: 'line',
                    data: sleepData,
                    connectNulls: false,
                    smooth: true,
                    symbol: 'circle',
                    symbolSize: 5,
                    lineStyle: {
                        color: N.green,
                        width: 2,
                        shadowBlur: 10,
                        shadowColor: 'rgba(57,255,20,0.4)'
                    },
                    itemStyle: {
                        color: N.green,
                        borderColor: 'rgba(57,255,20,0.6)',
                        borderWidth: 1
                    },
                    areaStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(57,255,20,0.1)' },
                            { offset: 1, color: 'rgba(57,255,20,0.01)' }
                        ])
                    },
                    markLine: {
                        silent: true,
                        symbol: 'none',
                        lineStyle: { color: 'rgba(57,255,20,0.2)', type: 'dashed', width: 1 },
                        data: [{ type: 'average', name: '均值' }],
                        label: {
                            color: N.textMuted,
                            fontSize: 14,
                            fontFamily: 'Share Tech Mono, monospace'
                        }
                    }
                }]
            };
        } else if (chartType === 'sleepTime') {
            // 入睡时间: 23:00→-1, 0:00→0, 5:00→5 (跨越午夜连续映射)
            var sleepTimeData = records.map(function(item) {
                var time = new Date(item.sleep_st);
                var hours = time.getHours() + time.getMinutes() / 60;
                return hours >= 18 ? hours - 24 : hours;
            });

            option = {
                tooltip: {
                    trigger: 'axis',
                    backgroundColor: 'rgba(8,12,24,0.94)',
                    borderColor: 'rgba(255,64,136,0.3)',
                    textStyle: {
                        color: '#d8e0ec',
                        fontFamily: 'Share Tech Mono, monospace',
                        fontSize: 14
                    },
                    formatter: function(params) {
                        var v = params[0].value;
                        var displayHour = v < 0 ? v + 24 : v;
                        var hour = Math.floor(displayHour);
                        var min = Math.round((displayHour - hour) * 60);
                        return params[0].name + '<br/>入睡: ' + hour + ':' + (min < 10 ? '0' + min : min);
                    },
                    axisPointer: {
                        lineStyle: { color: 'rgba(255,64,136,0.2)' }
                    }
                },
                grid: {
                    left: '3%', right: '4%', top: '8%', bottom: '8%',
                    containLabel: true
                },
                xAxis: {
                    type: 'category',
                    data: dates,
                    boundaryGap: false,
                    axisLine: { lineStyle: { color: N.gridLine } },
                    axisTick: { show: false },
                    axisLabel: {
                        color: N.textMuted,
                        fontSize: 14,
                        fontFamily: 'Share Tech Mono, monospace',
                        rotate: 30
                    },
                    splitLine: { show: false }
                },
                yAxis: {
                    type: 'value',
                    min: -1,
                    max: 5,
                    name: '时间',
                    inverse: true,
                    nameTextStyle: {
                        color: N.textMuted,
                        fontSize: 14,
                        fontFamily: 'Share Tech Mono, monospace'
                    },
                    axisLine: { show: false },
                    axisTick: { show: false },
                    axisLabel: {
                        color: N.textMuted,
                        fontSize: 14,
                        fontFamily: 'Share Tech Mono, monospace',
                        formatter: function(v) {
                            var h = v < 0 ? v + 24 : v;
                            return h + ':00';
                        }
                    },
                    splitLine: { lineStyle: { color: N.gridLine, type: 'dashed' } }
                },
                series: [{
                    name: '入睡时间',
                    type: 'line',
                    data: sleepTimeData,
                    connectNulls: false,
                    smooth: true,
                    symbol: 'circle',
                    symbolSize: 5,
                    lineStyle: {
                        color: N.magenta,
                        width: 2,
                        shadowBlur: 10,
                        shadowColor: 'rgba(255,64,136,0.4)'
                    },
                    itemStyle: {
                        color: N.magenta,
                        borderColor: 'rgba(255,64,136,0.6)',
                        borderWidth: 1
                    },
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

        if (chartType === 'weight') {
            chart.on('click', function(params) {
                if (params.seriesName === '体重 (kg)' && params.name) {
                    showNoteModal(params.name);
                }
            });
        }

        currentChart = chart;

        // 响应式 resize
        window.addEventListener('resize', function() {
            if (currentChart) currentChart.resize();
            if (current3DChart) current3DChart.resize();
        });
    }

    // ============================================================
    //  3D 散点图 — 体重 / 睡眠时长 / 入睡时间
    // ============================================================
    function render3DChart(timeRange) {
        var records = getFilteredData(timeRange);

        if (current3DChart) {
            current3DChart.dispose();
            current3DChart = null;
        }

        // 只保留有效体重的记录
        var validRecords = records.filter(function(r) {
            return r.weight_kg > 0;
        });

        if (validRecords.length < 3) {
            var container = document.getElementById('chart3dContainer');
            if (container) {
                container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#4a5568;font-family:\'Share Tech Mono\',monospace;font-size:15px;letter-spacing:0.05em;">数据不足 — 需要至少3条有效体重记录</div>';
            }
            return;
        }

        // 构建3D数据: [weight, sleep_hours, sleep_onset_decimal, record_index]
        // 入睡时间映射: 23:00→-1, 0:00→0, 5:00→5 (跨越午夜)
        var data3D = validRecords.map(function(r, i) {
            var time = new Date(r.sleep_st);
            var hours = time.getHours() + time.getMinutes() / 60;
            var sleepOnset = hours >= 18 ? hours - 24 : hours;
            return [r.weight_kg, r.sleep_last, sleepOnset, i];
        });

        var chartDom = document.getElementById('chart3dContainer');
        if (!chartDom) return;

        var chart = echarts.init(chartDom, null, {
            backgroundColor: 'transparent'
        });

        var option = {
            tooltip: {
                backgroundColor: 'rgba(8,12,24,0.94)',
                borderColor: 'rgba(255,64,136,0.3)',
                textStyle: {
                    color: '#d8e0ec',
                    fontFamily: 'Share Tech Mono, monospace',
                    fontSize: 14
                },
                formatter: function(params) {
                    if (!params || !params.value) return '';
                    var w = params.value[0];
                    var s = params.value[1];
                    var t = params.value[2];
                    var displayHour = t < 0 ? t + 24 : t;
                    var h = Math.floor(displayHour);
                    var m = Math.round((displayHour - h) * 60);
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
                boxWidth: 130,
                boxHeight: 110,
                boxDepth: 130,
                viewControl: {
                    autoRotate: true,
                    autoRotateSpeed: 0.6,
                    distance: 200,
                    alpha: 25,
                    beta: 45,
                    center: [0, 0, 0],
                    animation: true,
                    panMouseButton: 'right',
                    rotateMouseButton: 'left'
                },
                light: {
                    main: {
                        intensity: 1.2,
                        shadow: true,
                        shadowQuality: 'high',
                        alpha: 35,
                        beta: 40
                    },
                    ambient: {
                        intensity: 0.6
                    },
                    ambientCubemap: {
                        texture: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8/+F9PQAI8wNPvd7POQAAAABJRU5ErkJggg==',
                        exposure: 0.3
                    }
                },
                axisLine: {
                    lineStyle: { color: 'rgba(0,229,255,0.2)' }
                },
                axisPointer: {
                    lineStyle: { color: 'rgba(0,229,255,0.25)' }
                },
                splitLine: {
                    lineStyle: { color: 'rgba(0,229,255,0.05)' }
                },
                splitArea: {
                    areaStyle: { color: ['rgba(0,229,255,0.01)', 'rgba(0,0,0,0)'] }
                },
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
                name: '体重 (kg)',
                type: 'value',
                min: 70,
                max: 78,
                nameTextStyle: {
                    color: N.cyan,
                    fontSize: 13,
                    fontFamily: 'Share Tech Mono, monospace',
                    letterSpacing: 1
                },
                axisLabel: {
                    color: N.textMuted,
                    fontSize: 11,
                    fontFamily: 'Share Tech Mono, monospace',
                    formatter: function(v) { return v.toFixed(1); }
                },
                axisLine: { lineStyle: { color: 'rgba(0,229,255,0.35)' } },
                splitLine: { lineStyle: { color: 'rgba(0,229,255,0.06)' } }
            },
            yAxis3D: {
                name: '睡眠 (h)',
                type: 'value',
                min: 2,
                max: 10,
                nameTextStyle: {
                    color: N.green,
                    fontSize: 13,
                    fontFamily: 'Share Tech Mono, monospace',
                    letterSpacing: 1
                },
                axisLabel: {
                    color: N.textMuted,
                    fontSize: 11,
                    fontFamily: 'Share Tech Mono, monospace'
                },
                axisLine: { lineStyle: { color: 'rgba(57,255,20,0.35)' } },
                splitLine: { lineStyle: { color: 'rgba(57,255,20,0.04)' } }
            },
            zAxis3D: {
                name: '入睡 (时)',
                type: 'value',
                min: -1,
                max: 5,
                nameTextStyle: {
                    color: N.magenta,
                    fontSize: 13,
                    fontFamily: 'Share Tech Mono, monospace',
                    letterSpacing: 1
                },
                axisLabel: {
                    color: N.textMuted,
                    fontSize: 11,
                    fontFamily: 'Share Tech Mono, monospace',
                    formatter: function(v) {
                        var h = v < 0 ? v + 24 : v;
                        return Math.floor(h) + ':00';
                    }
                },
                axisLine: { lineStyle: { color: 'rgba(255,64,136,0.35)' } },
                splitLine: { lineStyle: { color: 'rgba(255,64,136,0.04)' } }
            },
            visualMap: {
                show: true,
                dimension: 2,  // 按入睡时间着色
                min: -1,
                max: 5,
                inRange: {
                    color: [
                        '#003545',
                        '#005566',
                        '#007888',
                        '#009aaa',
                        '#00b8cc',
                        '#00d5ee',
                        '#00e5ff',
                        '#33e0ff',
                        '#66ccf0',
                        '#99b0e0',
                        '#cc88c0',
                        '#e860a0',
                        '#ff4088',
                        '#ff2060'
                    ]
                },
                orient: 'vertical',
                left: 8,
                top: 'center',
                text: ['晚', '早'],
                textStyle: {
                    color: N.textMuted,
                    fontSize: 11,
                    fontFamily: 'Share Tech Mono, monospace'
                },
                itemWidth: 6,
                itemHeight: 120,
                borderColor: 'rgba(255,64,136,0.2)',
                backgroundColor: 'rgba(8,12,24,0.6)',
                padding: [8, 6],
                handleStyle: {
                    color: N.magenta
                }
            },
            series: [{
                type: 'scatter3D',
                name: '健康数据点',
                data: data3D,
                symbolSize: 6,
                itemStyle: {
                    borderWidth: 0.5,
                    borderColor: 'rgba(255,255,255,0.3)',
                    opacity: 0.9,
                    shadowBlur: 4,
                    shadowColor: 'rgba(0,229,255,0.3)'
                },
                emphasis: {
                    itemStyle: {
                        symbolSize: 12,
                        borderWidth: 1,
                        borderColor: '#fff',
                        shadowBlur: 16,
                        shadowColor: 'rgba(0,229,255,0.6)'
                    },
                    label: {
                        show: true,
                        formatter: function(p) {
                            if (!p || !p.value) return '';
                            var idx = Math.round(p.value[3] || 0);
                            return validRecords[idx] ? validRecords[idx].date : '';
                        },
                        distance: 8,
                        textStyle: {
                            color: '#fff',
                            fontSize: 14,
                            fontFamily: 'Share Tech Mono, monospace',
                            backgroundColor: 'rgba(8,12,24,0.85)',
                            padding: [3, 6],
                            borderRadius: 2,
                            borderColor: 'rgba(0,229,255,0.4)',
                            borderWidth: 1
                        }
                    }
                }
            }]
        };

        chart.setOption(option);

        // 停止自动旋转当用户交互时
        var autoRotateTimer = null;
        chart.on('mousedown', function() {
            if (autoRotateTimer) clearTimeout(autoRotateTimer);
            chart.setOption({
                grid3D: { viewControl: { autoRotate: false } }
            });
        });
        chart.on('mouseup', function() {
            autoRotateTimer = setTimeout(function() {
                chart.setOption({
                    grid3D: { viewControl: { autoRotate: true } }
                });
            }, 4000);
        });
        // touch 事件
        chart.on('touchstart', function() {
            if (autoRotateTimer) clearTimeout(autoRotateTimer);
            chart.setOption({
                grid3D: { viewControl: { autoRotate: false } }
            });
        });
        chart.on('touchend', function() {
            autoRotateTimer = setTimeout(function() {
                chart.setOption({
                    grid3D: { viewControl: { autoRotate: true } }
                });
            }, 4000);
        });

        current3DChart = chart;
    }

    // ============================================================
    //  备注弹窗
    // ============================================================
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
        d3.json('weight_notes.json', function(error, data) {
            if (!error && data) {
                weightNotes = data;
            }
        });

        var closeBtn = document.getElementById('noteModalClose');
        if (closeBtn) {
            closeBtn.addEventListener('click', hideNoteModal);
        }
    }

    // ============================================================
    //  统计信息
    // ============================================================
    function updateStats(chartType, timeRange) {
        var records = getFilteredData(timeRange);

        var statsDiv = document.getElementById('statsInfo');

        var validWeights = records.filter(function(r) {
            return r.weight_kg > 0;
        }).map(function(r) {
            return r.weight_kg;
        });
        var avgWeight = validWeights.length > 0
            ? (validWeights.reduce(function(a, b) { return a + b; }, 0) / validWeights.length).toFixed(2)
            : 'N/A';
        var maxWeight = validWeights.length > 0 ? Math.max.apply(null, validWeights) : 0;
        var minWeight = validWeights.length > 0 ? Math.min.apply(null, validWeights) : 0;

        var validSleep = records.filter(function(r) {
            return r.sleep_last > 0;
        }).map(function(r) {
            return r.sleep_last;
        });
        var avgSleep = validSleep.length > 0
            ? (validSleep.reduce(function(a, b) { return a + b; }, 0) / validSleep.length).toFixed(1)
            : 'N/A';

        var avgSleepTimeStr = 'N/A';
        if (records.length > 0) {
            var sumSin = 0, sumCos = 0;
            records.forEach(function(r) {
                var time = new Date(r.sleep_st);
                var hours = time.getHours() + time.getMinutes() / 60;
                var angle = hours / 24 * 2 * Math.PI;
                sumSin += Math.sin(angle);
                sumCos += Math.cos(angle);
            });
            var meanAngle = Math.atan2(sumSin, sumCos);
            if (meanAngle < 0) meanAngle += 2 * Math.PI;
            var avgSleepTime = meanAngle / (2 * Math.PI) * 24;
            var avgHour = Math.floor(avgSleepTime);
            var avgMin = Math.round((avgSleepTime - avgHour) * 60);
            if (avgMin === 60) { avgHour++; avgMin = 0; }
            avgSleepTimeStr = avgHour + ':' + (avgMin < 10 ? '0' + avgMin : avgMin);
        }

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

    // ============================================================
    //  自动初始化
    // ============================================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', window.initHealthChart);
    } else {
        window.initHealthChart();
    }

    // 窗口 resize 时同时调整两个图表
    window.addEventListener('resize', function() {
        if (currentChart) currentChart.resize();
        if (current3DChart) current3DChart.resize();
    });
})();
