/**
 * 图片地图浏览 — ECharts 中国地图 + 核密度热力 + 照片散点 + 灯箱
 * 数据来源：../picture_info.json（需要 GPS 坐标）
 * 依赖：ECharts 5 + china.geojson
 */
(function () {
  'use strict';

  // ── DOM 引用 ──────────────────────────────────
  var mapChartEl    = document.getElementById('map-chart');
  var mapLoading    = document.getElementById('mapLoading');
  var mapEmptyHint  = document.getElementById('mapEmptyHint');
  var mapStats      = document.getElementById('mapStats');
  var lightbox      = document.getElementById('lightbox');
  var lightboxImage = document.getElementById('lightboxImage');
  var lightboxFilename = document.getElementById('lightboxFilename');
  var lightboxCoords   = document.getElementById('lightboxCoords');
  var lightboxBackdrop = document.getElementById('lightboxBackdrop');
  var lightboxClose   = document.getElementById('lightboxClose');
  var lightboxPrev    = document.getElementById('lightboxPrev');
  var lightboxNext    = document.getElementById('lightboxNext');

  // ── 状态 ─────────────────────────────────────
  var images      = [];       // picture_info.json 中的全部图片
  var geoImages   = [];       // 有 GPS 坐标的图片子集
  var chart       = null;
  var currentIndex   = -1;    // 灯箱中当前图片在 geoImages 中的索引
  var sameLocImages  = [];    // 同一经纬度的所有图片（同一地点多张）
  var locIndex       = -1;    // 在 sameLocImages 中的索引

  // ── 工具函数 ──────────────────────────────────
  function formatCoord(lat, lng) {
    var latDir = lat >= 0 ? 'N' : 'S';
    var lngDir = lng >= 0 ? 'E' : 'W';
    return Math.abs(lat).toFixed(4) + '°' + latDir + ' '
         + Math.abs(lng).toFixed(4) + '°' + lngDir;
  }

  // ── ECharts 地图配置构建 ──────────────────────
  function buildChartOption(geoImages) {
    var scatterData = geoImages.map(function (img) {
      return {
        name: img.filename,
        value: [img.longitude, img.latitude],
        _img: img  // 保存原始图片引用用于点击和提示
      };
    });

    var hasData = geoImages.length > 0;

    var option = {
      backgroundColor: '#0b0b0d',

      tooltip: {
        trigger: 'item',
        formatter: function (params) {
          if (params.data && params.data._img) {
            var img = params.data._img;
            var html = '<div style="font-family:\'DM Mono\',monospace;font-size:12px;color:#e4e0d8;">';
            html += '<p style="margin:0 0 4px;font-weight:500;">' + img.filename + '</p>';
            if (img.shooting_date) {
              html += '<p style="margin:0;color:#8a8780;font-size:11px;">' + img.shooting_date + '</p>';
            }
            html += '<p style="margin:4px 0 0;color:#4a4742;font-size:10px;">'
                 + formatCoord(img.latitude, img.longitude) + '</p>';
            html += '</div>';
            return html;
          }
          return '';
        }
      },

      // 中国地图底图
      geo: {
        map: 'china',
        roam: true,
        zoom: 1.15,
        center: [104.5, 36],
        scaleLimit: { min: 0.8, max: 12 },
        silent: true,  // 地图本身不响应点击
        itemStyle: {
          areaColor: '#0e0e12',
          borderColor: 'rgba(184, 146, 78, 0.10)',
          borderWidth: 0.5
        },
        emphasis: { disabled: true },
        label: { show: false },
        regions: []
      },

      series: [
        // 第1层：涟漪效果（effectScatter）—— 呼吸光晕
        (hasData ? [{
          type: 'effectScatter',
          coordinateSystem: 'geo',
          data: scatterData,
          symbolSize: 8,
          showEffectOn: 'render',
          rippleEffect: {
            brushType: 'stroke', scale: 7, period: 5,
            color: 'rgba(184, 146, 78, 0.35)'
          },
          itemStyle: { color: 'rgba(184, 146, 78, 0.6)' },
          emphasis: { scale: 2, itemStyle: { color: 'rgba(255, 255, 255, 0.9)' } },
          zlevel: 1, z: 1
        }] : []),

        // 第2层：散点节点（可点击打开灯箱）
        {
          type: 'scatter',
          coordinateSystem: 'geo',
          data: scatterData,
          symbolSize: 7,
          itemStyle: {
            color: '#e4e0d8',
            borderColor: 'rgba(184, 146, 78, 0.6)',
            borderWidth: 1.2,
            opacity: 0.9
          },
          emphasis: {
            scale: 2.5,
            itemStyle: {
              color: '#ffffff',
              borderColor: '#b8924e',
              borderWidth: 2,
              shadowColor: 'rgba(184, 146, 78, 0.6)',
              shadowBlur: 10,
              opacity: 1
            }
          },
          zlevel: 2, z: 2,
          animation: true,
          animationDuration: 600,
          animationEasing: 'cubicOut'
        }
      ]
    };

    // 无数据时移除涟漪层（series[0] 为空数组时需清理）
    if (!hasData) {
      option.series = option.series.filter(function (s) { return Array.isArray(s) ? s.length > 0 : true; });
    }

    return option;
  }

  // ── 初始化地图图表 ────────────────────────────
  function initChart() {
    chart = echarts.init(mapChartEl, null, {
      devicePixelRatio: window.devicePixelRatio || 1
    });

    var option = buildChartOption(geoImages);
    chart.setOption(option);

    // 点击散点 → 打开灯箱
    chart.on('click', function (params) {
      var data = params.data;
      if (!data || !data._img) return;

      var img = data._img;
      // 通过文件名匹配索引（避免 ECharts 内部克隆导致引用不同）
      var idx = -1;
      for (var i = 0; i < geoImages.length; i++) {
        if (geoImages[i].filename === img.filename) {
          idx = i;
          break;
        }
      }
      if (idx >= 0) openLightbox(idx);
    });

    window.addEventListener('resize', function () {
      chart && chart.resize();
    });
  }

  // ── 灯箱逻辑 ──────────────────────────────────
  function openLightbox(index) {
    currentIndex = index;
    var anchor = geoImages[index];
    if (!anchor) return;

    // 搜集同一经纬度的所有照片
    sameLocImages = [];
    for (var i = 0; i < geoImages.length; i++) {
      if (geoImages[i].latitude === anchor.latitude &&
          geoImages[i].longitude === anchor.longitude) {
        sameLocImages.push(geoImages[i]);
        if (i === index) locIndex = sameLocImages.length - 1;
      }
    }

    renderLightbox();
    lightbox.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // 多于1张时显示前后翻页按钮
    var multi = sameLocImages.length > 1;
    lightboxPrev.style.display = multi ? '' : 'none';
    lightboxNext.style.display = multi ? '' : 'none';
  }

  function closeLightbox() {
    lightbox.style.display = 'none';
    document.body.style.overflow = '';
    currentIndex = -1;
    locIndex = -1;
    sameLocImages = [];
  }

  function navigateLightbox(delta) {
    if (sameLocImages.length === 0) return;
    locIndex = (locIndex + delta + sameLocImages.length) % sameLocImages.length;
    // 同步 geoImages 级别索引
    var img = sameLocImages[locIndex];
    for (var i = 0; i < geoImages.length; i++) {
      if (geoImages[i].filename === img.filename) {
        currentIndex = i;
        break;
      }
    }
    renderLightbox();
  }

  function renderLightbox() {
    var img = sameLocImages[locIndex];
    if (!img) return;

    // 触发淡入动画
    lightboxImage.style.animation = 'none';
    lightboxImage.src = img.path;
    lightboxImage.alt = img.filename;
    void lightboxImage.offsetWidth;
    lightboxImage.style.animation = '';

    lightboxFilename.textContent = img.filename;
    if (sameLocImages.length > 1) {
      lightboxFilename.textContent += '  (' + (locIndex + 1) + '/' + sameLocImages.length + ')';
    }
    lightboxCoords.textContent = formatCoord(img.latitude, img.longitude);
  }

  // 灯箱事件绑定
  lightboxClose.addEventListener('click', closeLightbox);
  lightboxBackdrop.addEventListener('click', closeLightbox);
  lightboxPrev.addEventListener('click', function (e) { e.stopPropagation(); navigateLightbox(-1); });
  lightboxNext.addEventListener('click', function (e) { e.stopPropagation(); navigateLightbox(1); });

  // 键盘导航
  document.addEventListener('keydown', function (e) {
    if (currentIndex < 0) return;
    switch (e.key) {
      case 'Escape':     closeLightbox(); break;
      case 'ArrowLeft':  navigateLightbox(-1); break;
      case 'ArrowRight': navigateLightbox(1); break;
    }
  });

  // ── 启动流程 ──────────────────────────────────
  async function bootstrap() {
    try {
      // 1. 加载图片数据
      var imgResp = await fetch('../picture_info.json');
      if (!imgResp.ok) throw new Error('加载 picture_info.json 失败');
      var imgData = await imgResp.json();
      images = imgData.images || [];
      geoImages = images.filter(function (img) {
        return img.latitude != null && img.longitude != null;
      });

      // 2. 加载中国地图 GeoJSON
      var geoResp = await fetch('./china.geojson');
      if (!geoResp.ok) throw new Error('加载 GeoJSON 失败');
      var geoJSON = await geoResp.json();

      // 3. 注册地图
      echarts.registerMap('china', geoJSON);

      // 4. 初始化图表
      initChart();

      // 5. 更新统计信息
      mapStats.textContent = geoImages.length + ' geotagged / ' + images.length + ' total';

      // 6. 无 GPS 数据时显示提示
      if (geoImages.length === 0) {
        mapEmptyHint.style.display = 'block';
      }

      // 7. 隐藏加载动画
      mapLoading.classList.add('hidden');
      setTimeout(function () {
        mapLoading.style.display = 'none';
      }, 600);

    } catch (err) {
      console.error('地图启动失败:', err);
      mapLoading.classList.add('hidden');
      mapLoading.querySelector('.loading-text').textContent =
        '地图数据加载失败，请刷新页面。';
      mapLoading.classList.remove('hidden');
    }
  }

  bootstrap();
})();
