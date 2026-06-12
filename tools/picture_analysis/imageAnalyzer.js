/**
 * 图片颜色分析工具 — K-means 聚类 + RGB 直方图 + ECharts 可视化
 * 依赖：ECharts
 */

// 检查 ECharts 是否已加载
if (typeof echarts === 'undefined') {
  console.error('ECharts 未加载，请检查网络或 CDN 链接');
}

/* ================================================================
   K-means 颜色聚类算法类
   支持 RGB / LAB 两种颜色空间
   ================================================================ */
class KMeansColor {
  constructor(maxIterations) {
    if (maxIterations === undefined) maxIterations = 10;
    this.maxIterations = maxIterations;
  }

  // 计算两点间欧氏距离
  distance(point1, point2) {
    var dist = 0;
    for (var i = 0; i < point1.length; i++) {
      dist += Math.pow(point1[i] - point2[i], 2);
    }
    return Math.sqrt(dist);
  }

  // RGB 转 LAB 色彩空间（标准 D65 白点）
  rgbToLab(r, g, b) {
    // 归一化到 0-1
    var r1 = r / 255, g1 = g / 255, b1 = b / 255;

    // 伽马校正（sRGB → 线性）
    r1 = r1 > 0.04045 ? Math.pow((r1 + 0.055) / 1.055, 2.4) : r1 / 12.92;
    g1 = g1 > 0.04045 ? Math.pow((g1 + 0.055) / 1.055, 2.4) : g1 / 12.92;
    b1 = b1 > 0.04045 ? Math.pow((b1 + 0.055) / 1.055, 2.4) : b1 / 12.92;

    // RGB → XYZ
    var x = r1 * 0.4124564 + g1 * 0.3575761 + b1 * 0.1804375;
    var y = r1 * 0.2126729 + g1 * 0.7151522 + b1 * 0.0721750;
    var z = r1 * 0.0193339 + g1 * 0.1191920 + b1 * 0.9503041;

    // XYZ 归一化
    x = x / 0.95047;
    y = y / 1.0;
    z = z / 1.08883;

    // XYZ → LAB
    var fx = x > 0.008856 ? Math.pow(x, 1 / 3) : (7.787 * x) + 16 / 116;
    var fy = y > 0.008856 ? Math.pow(y, 1 / 3) : (7.787 * y) + 16 / 116;
    var fz = z > 0.008856 ? Math.pow(z, 1 / 3) : (7.787 * z) + 16 / 116;

    var L = 116 * fy - 16;
    var a = 500 * (fx - fy);
    var bVal = 200 * (fy - fz);

    // 映射到 0-255 范围
    return [
      Math.round((L / 100) * 255),
      Math.round(((a + 86.185) / 184.444) * 255),
      Math.round(((bVal + 107.863) / 202.345) * 255)
    ];
  }

  // LAB 转回 RGB
  labToRgb(l, a, bVal) {
    l = (l / 255) * 100;
    a = (a / 255) * 184.444 - 86.185;
    bVal = (bVal / 255) * 202.345 - 107.863;

    var fy = (l + 16) / 116;
    var fx = a / 500 + fy;
    var fz = fy - bVal / 200;

    var x = Math.pow(fx, 3) > 0.008856 ? Math.pow(fx, 3) : (fx - 16 / 116) / 7.787;
    var y = l > 7.9996 ? Math.pow(fy, 3) : (l / 903.3);
    var z = Math.pow(fz, 3) > 0.008856 ? Math.pow(fz, 3) : (fz - 16 / 116) / 7.787;

    x *= 0.95047;
    y *= 1.0;
    z *= 1.08883;

    // XYZ → RGB
    var r = x * 3.2404542 - y * 1.5371385 - z * 0.4985314;
    var g = -x * 0.9692660 + y * 1.8760108 + z * 0.0415560;
    var b1 = x * 0.0556434 - y * 0.2040259 + z * 1.0572252;

    // 伽马校正（线性 → sRGB）
    r = r <= 0.0031308 ? r * 12.92 : 1.055 * Math.pow(r, 1 / 2.4) - 0.055;
    g = g <= 0.0031308 ? g * 12.92 : 1.055 * Math.pow(g, 1 / 2.4) - 0.055;
    b1 = b1 <= 0.0031308 ? b1 * 12.92 : 1.055 * Math.pow(b1, 1 / 2.4) - 0.055;

    return [
      Math.max(0, Math.min(255, Math.round(r * 255))),
      Math.max(0, Math.min(255, Math.round(g * 255))),
      Math.max(0, Math.min(255, Math.round(b1 * 255)))
    ];
  }

  // 按颜色空间预处理像素数据（每 4 个值取 RGB，跳过 Alpha）
  preprocess(pixels, space) {
    var data = [];
    for (var i = 0; i < pixels.length; i += 4) {
      var r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      if (space === 'lab') {
        data.push(this.rgbToLab(r, g, b));
      } else {
        data.push([r, g, b]);
      }
    }
    return data;
  }

  // 随机初始化 K 个质心
  initializeCentroids(data, k) {
    var centroids = [];
    var usedIndices = new Set();
    while (centroids.length < k) {
      var randomIndex = Math.floor(Math.random() * data.length);
      if (!usedIndices.has(randomIndex)) {
        usedIndices.add(randomIndex);
        centroids.push(data[randomIndex].slice());
      }
    }
    return centroids;
  }

  // 核心 K-means 聚类
  cluster(pixels, k, space) {
    if (space === undefined) space = 'rgb';
    console.log('[K-means] 开始聚类: K=' + k + ', 色彩空间=' + space);

    var data = this.preprocess(pixels, space);
    var centroids = this.initializeCentroids(data, k);
    var labels = new Uint8Array(data.length);

    // 迭代至收敛或达到最大次数
    for (var iter = 0; iter < this.maxIterations; iter++) {
      var converged = true;

      // 分配每个像素到最近的质心
      for (var i = 0; i < data.length; i++) {
        var minDist = Infinity;
        var clusterIdx = 0;
        for (var j = 0; j < k; j++) {
          var dist = this.distance(data[i], centroids[j]);
          if (dist < minDist) {
            minDist = dist;
            clusterIdx = j;
          }
        }
        if (labels[i] !== clusterIdx) {
          converged = false;
          labels[i] = clusterIdx;
        }
      }
      if (converged) break;

      // 更新质心：取每个聚类的均值
      var counts = new Array(k).fill(0);
      var newCentroids = Array.from({ length: k }, function () { return [0, 0, 0]; });
      for (var m = 0; m < data.length; m++) {
        var cluster = labels[m];
        counts[cluster]++;
        for (var n = 0; n < 3; n++) {
          newCentroids[cluster][n] += data[m][n];
        }
      }
      for (var p = 0; p < k; p++) {
        if (counts[p] > 0) {
          for (var q = 0; q < 3; q++) {
            centroids[p][q] = newCentroids[p][q] / counts[p];
          }
        }
      }
    }

    // 整理结果：每个聚类包含像素数和平均颜色
    var clusters = Array.from({ length: k }, function () {
      return { count: 0, color: [0, 0, 0] };
    });
    for (var t = 0; t < data.length; t++) {
      var c = labels[t];
      clusters[c].count++;
      for (var u = 0; u < 3; u++) {
        clusters[c].color[u] += data[t][u];
      }
    }

    // 计算平均颜色，LAB 需转回 RGB
    for (var v = 0; v < k; v++) {
      if (clusters[v].count > 0) {
        var avgColor = clusters[v].color.map(function (c) { return c / clusters[v].count; });
        if (space === 'lab') {
          avgColor = this.labToRgb(avgColor[0], avgColor[1], avgColor[2]);
        }
        clusters[v].color = avgColor.map(function (c) { return Math.round(c); });
      }
    }
    return clusters;
  }
}


/* ================================================================
   图片处理器类
   管理图片上传、K-means 分析、ECharts 渲染、RGB 直方图绘制
   ================================================================ */
class ImageProcessor {
  constructor() {
    this.image = null;
    this.kmeans = new KMeansColor();
    this.myChart = null;
    this.currentChartType = 'pie';   // 'pie' | 'bar'
    this.histogramCanvas = null;
    this.histogramCtx = null;
  }

  // 初始化：绑定 DOM 和事件
  init() {
    this.fileInput = document.getElementById('imageInput');
    this.imageElement = document.getElementById('displayImage');
    this.startBtn = document.getElementById('startAnalysisBtn');
    this.kSlider = document.getElementById('kValueSlider');
    this.kDisplay = document.getElementById('kValueDisplay');
    this.colorSpaceSelect = document.getElementById('spaceSelect');
    this.chartContainer = document.getElementById('chartContainer');
    this.chartTypeButtons = document.querySelectorAll('.chart-type-btn');

    // 创建 RGB 直方图画布
    this.histogramCanvas = document.createElement('canvas');
    this.histogramCanvas.width = 400;
    this.histogramCanvas.height = 300;
    this.histogramCtx = this.histogramCanvas.getContext('2d');

    var histogramContainer = document.getElementById('rgbHistogram');
    if (histogramContainer) {
      histogramContainer.appendChild(this.histogramCanvas);
    }

    // 绑定事件
    if (this.fileInput) {
      this.fileInput.addEventListener('change', this.handleImageUpload.bind(this));
    }
    if (this.kSlider) {
      this.kSlider.addEventListener('input', (function (e) {
        this.kDisplay.textContent = e.target.value;
      }).bind(this));
    }
    if (this.startBtn) {
      this.startBtn.addEventListener('click', this.performAnalysis.bind(this));
    }

    // 图表类型切换按钮
    var self = this;
    this.chartTypeButtons.forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        self.chartTypeButtons.forEach(function (b) { b.classList.remove('active'); });
        e.target.classList.add('active');
        self.currentChartType = e.target.dataset.type;
        if (self.lastClusters) {
          self.renderChart(self.lastClusters);
        }
      });
    });

    // 初始化 ECharts 实例
    if (this.chartContainer) {
      this.myChart = echarts.init(this.chartContainer);
    }
  }

  // 处理图片上传：读取文件 → 预览 → 计算直方图
  handleImageUpload(event) {
    var file = event.target.files[0];
    if (!file) return;
    var self = this;
    var reader = new FileReader();
    reader.onload = function (e) {
      self.image = new Image();
      self.image.onload = function () {
        self.imageElement.src = self.image.src;

        // 上传后自动绘制 RGB 直方图
        var tempCanvas = document.createElement('canvas');
        var ctx = tempCanvas.getContext('2d');
        tempCanvas.width = self.image.width;
        tempCanvas.height = self.image.height;
        ctx.drawImage(self.image, 0, 0);

        try {
          var imageData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
          self.computeAndDrawHistogram(imageData.data);
        } catch (err) {
          console.error('无法获取图片像素数据', err);
        }
      };
      self.image.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // 执行完整分析：K-means + 直方图 + 渲染图表
  performAnalysis() {
    if (!this.image) {
      alert('请先上传图片！');
      return;
    }

    var k = parseInt(this.kSlider.value);
    var space = this.colorSpaceSelect.value;

    // 将图片绘制到临时 canvas 以获取像素数据
    var tempCanvas = document.createElement('canvas');
    var ctx = tempCanvas.getContext('2d');
    tempCanvas.width = this.image.width;
    tempCanvas.height = this.image.height;
    ctx.drawImage(this.image, 0, 0);

    var imageData;
    try {
      imageData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    } catch (e) {
      console.error('无法获取图片像素数据', e);
      alert('图片分析失败');
      return;
    }

    // K-means 聚类 + 渲染
    var clusters = this.kmeans.cluster(imageData.data, k, space);
    this.lastClusters = clusters;
    this.renderChart(clusters);

    // 同时更新 RGB 直方图
    this.computeAndDrawHistogram(imageData.data);
  }

  // 使用 ECharts 渲染颜色聚类结果（饼图/柱状图）
  renderChart(clusters) {
    if (!this.myChart) return;

    // 构建 ECharts 数据
    var colorData = clusters.map(function (cluster, index) {
      var r = cluster.color[0], g = cluster.color[1], b = cluster.color[2];
      var colorHex = '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
      return {
        name: '颜色 ' + (index + 1),
        value: cluster.count,
        itemStyle: { color: colorHex }
      };
    });

    var option;
    var spaceLabel = this.colorSpaceSelect.value.toUpperCase();

    if (this.currentChartType === 'pie') {
      // 饼图配置
      option = {
        title: { text: '颜色分布 (饼图 / ' + spaceLabel + ')', left: 'center' },
        tooltip: { trigger: 'item' },
        legend: { orient: 'vertical', left: 'left' },
        series: [{
          name: '颜色',
          type: 'pie',
          radius: '60%',
          data: colorData,
          emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.5)' } }
        }]
      };
    } else {
      // 柱状图配置
      option = {
        title: { text: '颜色分布 (柱状图 / ' + spaceLabel + ')', left: 'center' },
        tooltip: {},
        xAxis: { type: 'category', data: colorData.map(function (d) { return d.name; }) },
        yAxis: { type: 'value' },
        series: [{
          name: '像素数量',
          type: 'bar',
          data: colorData.map(function (d) { return d.value; }),
          itemStyle: {
            color: function (params) { return colorData[params.dataIndex].itemStyle.color; }
          }
        }]
      };
    }

    this.myChart.setOption(option, { notMerge: true });
  }

  // 计算 RGB 三通道直方图
  computeAndDrawHistogram(pixels) {
    var rHist = new Array(256).fill(0);
    var gHist = new Array(256).fill(0);
    var bHist = new Array(256).fill(0);

    for (var i = 0; i < pixels.length; i += 4) {
      rHist[pixels[i]]++;       // R
      gHist[pixels[i + 1]]++;   // G
      bHist[pixels[i + 2]]++;   // B
    }

    this.drawHistogram(rHist, gHist, bHist);
  }

  // 在 Canvas 上绘制 RGB 三通道平滑直方图（叠加显示）
  drawHistogram(rHist, gHist, bHist) {
    if (!this.histogramCtx) return;

    var canvas = this.histogramCanvas;
    var width = canvas.clientWidth;
    var height = canvas.clientHeight;

    // 适配 devicePixelRatio
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      this.histogramCtx = canvas.getContext('2d');
    }

    var ctx = this.histogramCtx;
    ctx.imageSmoothingEnabled = false;

    // 暗色背景
    ctx.fillStyle = '#1a1d28';
    ctx.fillRect(0, 0, width, height);

    // 找到最大值用于归一化
    var maxR = Math.max.apply(null, rHist);
    var maxG = Math.max.apply(null, gHist);
    var maxB = Math.max.apply(null, bHist);
    var maxVal = Math.max(maxR, maxG, maxB);

    // 背景网格线
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (var i = 0; i <= 10; i++) {
      var yGrid = (height / 10) * i;
      ctx.beginPath();
      ctx.moveTo(0, yGrid);
      ctx.lineTo(width, yGrid);
      ctx.stroke();
    }

    var barWidth = width / 256;

    // 平滑函数：用滑动窗口减少噪点
    function smoothHist(hist, radius) {
      if (radius === undefined) radius = 2;
      var result = new Array(256).fill(0);
      for (var i = 0; i < 256; i++) {
        var sum = 0, count = 0;
        for (var j = i - radius; j <= i + radius; j++) {
          if (j >= 0 && j < 256) {
            sum += hist[j];
            count++;
          }
        }
        result[i] = count ? sum / count : 0;
      }
      return result;
    }

    var rHistSm = smoothHist(rHist, 2);
    var gHistSm = smoothHist(gHist, 2);
    var bHistSm = smoothHist(bHist, 2);

    // 绘制通道填充（使用 additive 混合）
    function drawChannel(hist, color) {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (var i = 0; i < 256; i++) {
        var x = i * barWidth;
        var y = height - (hist[i] / maxVal) * height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.closePath();
      ctx.fill();
    }

    ctx.globalCompositeOperation = 'lighter';
    drawChannel(rHistSm, 'rgba(255, 0, 0, 0.24)');
    drawChannel(gHistSm, 'rgba(0, 255, 0, 0.24)');
    drawChannel(bHistSm, 'rgba(0, 0, 255, 0.24)');
    ctx.globalCompositeOperation = 'source-over';

    // 绘制轮廓线
    function drawOutline(hist, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (var i = 0; i < 256; i++) {
        var x = i * barWidth + barWidth / 2;
        var y = height - (hist[i] / maxVal) * height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    drawOutline(rHistSm, 'rgba(255, 80, 80, 0.95)');
    drawOutline(gHistSm, 'rgba(80, 255, 80, 0.95)');
    drawOutline(bHistSm, 'rgba(120, 140, 255, 0.95)');

    // 三色重叠区域显示为白色
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.beginPath();
    for (var k = 0; k < 256; k++) {
      var x = k * barWidth;
      var rH = (rHistSm[k] / maxVal) * height;
      var gH = (gHistSm[k] / maxVal) * height;
      var bH = (bHistSm[k] / maxVal) * height;
      var y = height - Math.min(rH, gH, bH);
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();

    // 标题
    ctx.fillStyle = '#ccc';
    ctx.font = '13px Arial';
    ctx.fillText('RGB Histogram', 12, 22);
  }
}


// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function () {
  var processor = new ImageProcessor();
  processor.init();
});
