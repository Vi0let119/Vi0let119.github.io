/**
 * 健康数据图表模块
 * Health Data Chart Module
 */

(function() {
    // 全局变量存储数据
    var healthData = null;
    var currentChart = null;
    var lastDataDate = null; // 记录最后一条数据的日期
    var autoUpdateInterval = null; // 自动更新定时器
    var weightNotes = {}; // 体重备注数据

    // 暴露给全局的初始化函数
    window.initHealthChart = function() {
        // 初始化
        d3.json("Hdata.json", function(error, data) {
            if (error) {
                console.error("加载数据失败:", error);
                return;
            }
            healthData = data;
            
            // 记录最新数据的日期
            if (data.records && data.records.length > 0) {
                lastDataDate = data.records[data.records.length - 1].date;
            }
            
            // 初始化年份下拉框
            initYearSelect();
            
            renderChart('weight', 'all');
            updateStats('weight', 'all');
            
            // 绑定事件
            document.getElementById('updateChart').addEventListener('click', function() {
                var chartType = document.getElementById('chartType').value;
                var timeRange = document.getElementById('timeRange').value;
                renderChart(chartType, timeRange);
                updateStats(chartType, timeRange);
            });

            initNoteViewer();
            
            // 加载并显示随机名言
            loadRandomQuote();
            
            // 启动自动更新检查（每5分钟检查一次）
            startAutoUpdate();
        });
    };

    // 自动更新函数
    function startAutoUpdate() {
        // 每5分钟（300000毫秒）检查一次新数据
        autoUpdateInterval = setInterval(checkForNewData, 300000);
        
        // 页面可见时立即检查
        document.addEventListener('visibilitychange', function() {
            if (!document.hidden) {
                checkForNewData();
            }
        });
    }

    // 检查是否有新数据
    function checkForNewData() {
        d3.json("Hdata.json", function(error, data) {
            if (error) {
                console.error("检查新数据失败:", error);
                return;
            }
            
            if (!data || !data.records || data.records.length === 0) return;
            
            var newLastDate = data.records[data.records.length - 1].date;
            
            // 如果发现新数据
            if (newLastDate !== lastDataDate) {
                console.log('检测到新数据: ' + newLastDate);
                lastDataDate = newLastDate;
                healthData = data;
                
                // 重新初始化年份下拉框
                var yearSelect = document.getElementById('yearSelect');
                var monthSelect = document.getElementById('monthSelect');
                yearSelect.innerHTML = '<option value="all">全部年份</option>';
                monthSelect.innerHTML = '<option value="all">全部月份</option>';
                initYearSelect();
                
                // 重新渲染图表
                var chartType = document.getElementById('chartType').value;
                var timeRange = document.getElementById('timeRange').value;
                renderChart(chartType, timeRange);
                updateStats(chartType, timeRange);
                
                // 显示提示
                showUpdateNotification('数据已更新至: ' + newLastDate);
            }
        });
    }

    // 显示更新提示
    function showUpdateNotification(message) {
        var notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #4CAF50;
            color: white;
            padding: 15px 25px;
            border-radius: 5px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            z-index: 10000;
            animation: slideIn 0.3s ease;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        // 3秒后自动消失
        setTimeout(function() {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(function() {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }

    // 初始化年份下拉框
    function initYearSelect() {
        if (!healthData) return;
        
        var yearSelect = document.getElementById('yearSelect');
        var monthSelect = document.getElementById('monthSelect');
        var years = new Set();
        
        healthData.records.forEach(function(item) {
            var year = item.date.split('-')[0];
            years.add(year);
        });
        
        // 按年份排序
        var sortedYears = Array.from(years).sort();
        
        // 添加到年份下拉框
        sortedYears.forEach(function(year) {
            var option = document.createElement('option');
            option.value = year;
            option.textContent = year + '年';
            yearSelect.appendChild(option);
        });
        
        // 初始化月份下拉框（包含所有月份）
        var allMonths = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
        allMonths.forEach(function(month) {
            var option = document.createElement('option');
            option.value = month;
            option.textContent = month + '月';
            monthSelect.appendChild(option);
        });
        
        // 绑定年份选择变化事件
        yearSelect.addEventListener('change', function() {
            updateMonthSelect();
        });
    }

    // 根据选择的年份更新月份下拉框
    function updateMonthSelect() {
        if (!healthData) return;
        
        var yearSelect = document.getElementById('yearSelect');
        var monthSelect = document.getElementById('monthSelect');
        var selectedYear = yearSelect.value;
        
        // 清除现有月份选项（保留"全部月份"）
        while (monthSelect.options.length > 1) {
            monthSelect.remove(1);
        }
        
        if (selectedYear === 'all') {
            // 恢复所有月份
            var allMonths = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
            allMonths.forEach(function(month) {
                var option = document.createElement('option');
                option.value = month;
                option.textContent = month + '月';
                monthSelect.appendChild(option);
            });
        } else {
            // 获取该年份有的月份
            var months = new Set();
            healthData.records.forEach(function(item) {
                if (item.date.startsWith(selectedYear)) {
                    var month = item.date.split('-')[1];
                    months.add(month);
                }
            });
            
            // 按月份排序
            var sortedMonths = Array.from(months).sort();
            
            sortedMonths.forEach(function(month) {
                var option = document.createElement('option');
                option.value = month;
                option.textContent = parseInt(month) + '月';
                monthSelect.appendChild(option);
            });
        }
    }

    // 获取筛选后的数据
    function getFilteredData(timeRange) {
        if (!healthData) return [];
        
        var records = healthData.records.slice();
        var yearSelect = document.getElementById('yearSelect').value;
        var monthSelect = document.getElementById('monthSelect').value;
        
        // 年份筛选
        if (yearSelect !== 'all') {
            records = records.filter(function(item) {
                return item.date.startsWith(yearSelect);
            });
        }
        
        // 月份筛选
        if (monthSelect !== 'all') {
            records = records.filter(function(item) {
                var month = item.date.split('-')[1];
                return month === monthSelect;
            });
        }
        
        // 时间范围筛选（最近X天）
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

    // 渲染图表函数
    function renderChart(chartType, timeRange) {
        var records = getFilteredData(timeRange);
        
        if (records.length === 0) {
            alert('所选时间段内没有数据');
            return;
        }
        
        var chartDom = document.getElementById('chartContainer');
        
        // 如果已存在图表实例，先销毁
        if (currentChart) {
            currentChart.dispose();
        }
        
        var chart = echarts.init(chartDom);
        var option = {};
        var dates = records.map(function(item) {
            return item.date;
        });
        
        if (chartType === 'weight') {
            // 体重趋势图
            var weightData = records.map(function(item) {
                return item.weight_kg === -1 ? null : item.weight_kg;
            });
            
            option = {
                title: { text: '体重变化趋势' },
                tooltip: { trigger: 'axis' },
                xAxis: { 
                    type: 'category', 
                    data: dates, 
                    boundaryGap: false 
                },
                yAxis: { 
                    type: 'value',
                    min: 74,
                    max: 76,
                    name: 'kg'
                },
                series: [{
                    name: '体重(kg)',
                    type: 'line',
                    data: weightData,
                    connectNulls: false,
                    smooth: true,
                    lineStyle: { color: '#4CAF50' },
                    itemStyle: { color: '#4CAF50' },
                    areaStyle: { color: 'rgba(76, 175, 80, 0.1)' }
                }]
            };
        } else if (chartType === 'sleep') {
            // 睡眠时长图
            var sleepData = records.map(function(item) {
                return item.sleep_last;
            });
            var dates = records.map(function(item) {
                return item.date;
            });
            
            option = {
                title: { text: '睡眠时长趋势' },
                tooltip: { trigger: 'axis' },
                xAxis: { 
                    type: 'category', 
                    data: dates, 
                    boundaryGap: false 
                },
                yAxis: { 
                    type: 'value',
                    min: 4,
                    max: 10,
                    name: '小时'
                },
                series: [{
                    name: '睡眠(小时)',
                    type: 'line',
                    data: sleepData,
                    connectNulls: false,
                    smooth: true,
                    lineStyle: { color: '#2196F3' },
                    itemStyle: { color: '#2196F3' },
                    areaStyle: { color: 'rgba(33, 150, 243, 0.1)' }
                }]
            };
        } else if (chartType === 'sleepTime') {
            // 入睡时间图（转换为小时小数）
            var sleepTimeData = records.map(function(item) {
                var time = new Date(item.sleep_st);
                return time.getHours() + time.getMinutes() / 60;
            });
            var dates = records.map(function(item) {
                return item.date;
            });
            
            option = {
                title: { text: '入睡时间趋势' },
                tooltip: { 
                    trigger: 'axis',
                    formatter: function(params) {
                        var hour = Math.floor(params[0].value);
                        var min = Math.round((params[0].value - hour) * 60);
                        return params[0].name + '<br/>入睡时间: ' + hour + ':' + (min < 10 ? '0' + min : min);
                    }
                },
                xAxis: { 
                    type: 'category', 
                    data: dates, 
                    boundaryGap: false 
                },
                yAxis: { 
                    type: 'value',
                    min: 0,
                    max: 6,
                    name: '小时',
                    inverse: true  // 越小表示越早入睡
                },
                series: [{
                    name: '入睡时间',
                    type: 'line',
                    data: sleepTimeData,
                    connectNulls: false,
                    smooth: true,
                    lineStyle: { color: '#9C27B0' },
                    itemStyle: { color: '#9C27B0' },
                    areaStyle: { color: 'rgba(156, 39, 176, 0.1)' }
                }]
            };
        }
        
        chart.setOption(option);

        if (chartType === 'weight') {
            chart.on('click', function(params) {
                if (params.seriesName === '体重(kg)' && params.name) {
                    showNoteModal(params.name);
                }
            });
        }

        currentChart = chart;
    }

    // 显示备注弹窗
    function showNoteModal(date) {
        var noteText = weightNotes[date] || '该日期暂无备注。';
        document.getElementById('noteModalTitle').textContent = '体重备注 - ' + date;
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

    // 加载并显示随机名言
    

    // 更新统计信息
    function updateStats(chartType, timeRange) {
        var records = getFilteredData(timeRange);
        
        var statsDiv = document.getElementById('statsInfo');
        
        // 计算体重统计
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
        
        // 计算睡眠统计
        var sleepTotal = records.reduce(function(a, b) { return a + b.sleep_last; }, 0);
        var avgSleep = (sleepTotal / records.length).toFixed(1);
        
        // 计算平均入睡时间
        var sleepTimeTotal = records.reduce(function(a, b) {
            var time = new Date(b.sleep_st);
            return a + time.getHours() + time.getMinutes() / 60;
        }, 0);
        var avgSleepTime = sleepTimeTotal / records.length;
        var avgHour = Math.floor(avgSleepTime);
        var avgMin = Math.round((avgSleepTime - avgHour) * 60);
        var avgSleepTimeStr = avgHour + ':' + (avgMin < 10 ? '0' + avgMin : avgMin);
        
        statsDiv.innerHTML = 
            '<div class="stat-item">' +
                '<span class="stat-label">数据天数:</span>' +
                '<span class="stat-value">' + records.length + '天</span>' +
            '</div>' +
            '<div class="stat-item">' +
                '<span class="stat-label">平均入睡时间:</span>' +
                '<span class="stat-value">' + avgSleepTimeStr + '</span>' +
            '</div>' +
            '<div class="stat-item">' +
                '<span class="stat-label">体重范围:</span>' +
                '<span class="stat-value">' + minWeight + ' - ' + maxWeight + ' kg</span>' +
            '</div>' +
            '<div class="stat-item">' +
                '<span class="stat-label">平均睡眠:</span>' +
                '<span class="stat-value">' + avgSleep + ' 小时</span>' +
            '</div>';
    }

    // 页面加载完成后自动初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', window.initHealthChart);
    } else {
        window.initHealthChart();
    }
})();