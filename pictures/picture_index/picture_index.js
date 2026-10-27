/**
 * 图片画廊逻辑 — 缩略图懒加载 + 主图展示 + 排序
 * 数据来源：../picture_info.json
 */
(function () {
  'use strict';

  // ── DOM 元素 ──────────────────────────────
  var thumbnailGrid = document.getElementById('thumbnailGrid');
  var mainImage = document.getElementById('mainImage');
  var mainImageWrap = document.getElementById('mainImageWrap');
  var mainPlaceholder = document.getElementById('mainPlaceholder');
  var imageCaption = document.getElementById('imageCaption');
  var captionFilename = document.getElementById('captionFilename');
  var captionDate = document.getElementById('captionDate');
  var imageCountEl = document.getElementById('imageCount');
  var scrollIndicator = document.getElementById('scrollIndicator');
  var gallerySection = document.getElementById('gallery');

  var images = [];
  var activeThumb = null;
  var thumbItems = [];
  var observer = null;
  var sortOrder = 'desc';  // 'desc'=最新优先, 'asc'=最早优先

  // 点击滚动指示器 → 滚动到画廊区域
  scrollIndicator.addEventListener('click', function () {
    gallerySection.scrollIntoView({ behavior: 'smooth' });
  });

  // ── 排序切换按钮 ──────────────────────────
  var sortBtn = document.createElement('button');
  sortBtn.id = 'sortBtn';
  sortBtn.className = 'sort-btn';
  sortBtn.textContent = '↓';
  sortBtn.title = '最新优先 · 点击切换';
  sortBtn.setAttribute('aria-label', '切换排序');
  imageCountEl.parentNode.insertBefore(sortBtn, imageCountEl);

  sortBtn.addEventListener('click', function () {
    sortOrder = sortOrder === 'desc' ? 'asc' : 'desc';
    sortBtn.textContent = sortOrder === 'desc' ? '↓' : '↑';
    sortBtn.title = sortOrder === 'desc' ? '最新优先 · 点击切换' : '最早优先 · 点击切换';

    // 记住当前选中的图片
    var selectedFilename = null;
    if (activeThumb) {
      var si = parseInt(activeThumb.getAttribute('data-index'), 10);
      if (!isNaN(si) && images[si]) selectedFilename = images[si].filename;
    }

    // 重新排序
    images = sortByDate(images, sortOrder);

    // 清理旧的懒加载观察器和缩略图
    if (observer) observer.disconnect();
    observer = null;
    thumbItems = [];
    thumbnailGrid.innerHTML = '';
    buildThumbnails(images);
    startLazyLoad();

    // 恢复选中状态
    if (selectedFilename) {
      for (var i = 0; i < images.length; i++) {
        if (images[i].filename === selectedFilename) {
          var thumb = thumbnailGrid.querySelector('[data-index="' + i + '"]');
          if (thumb) selectImage(i, thumb);
          break;
        }
      }
    }

    // 未找到则清空主图
    if (!activeThumb) {
      mainPlaceholder.classList.remove('hidden');
      mainImageWrap.classList.remove('shown');
      imageCaption.classList.remove('shown');
    }

    // 印样条重建后重测长卷与帧中心；总览按新顺序重建
    driverSetup();
    measureCenters();
    overviewBuilt = false;
    updateFrameReadout(lastIndex >= 0 ? lastIndex : 0);
  });

  // ── 按拍摄日期排序 ────────────────────────
  function sortByDate(list, order) {
    return list.slice().sort(function (a, b) {
      var da = a.shooting_date || '';
      var db = b.shooting_date || '';
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return order === 'desc' ? db.localeCompare(da) : da.localeCompare(db);
    });
  }

  // ── 加载数据并构建缩略图 ──────────────────
  fetch('../picture_info.json')
    .then(function (res) { return res.ok ? res.json() : Promise.reject('加载失败'); })
    .then(function (data) {
      images = sortByDate(data.images || [], sortOrder);
      imageCountEl.textContent = images.length + ' frames';
      buildThumbnails(images);
      startLazyLoad();
      driverSetup();
      updateFrameReadout(0);
    })
    .catch(function (err) {
      console.error('加载图片数据失败:', err);
      thumbnailGrid.innerHTML =
        '<p style="color:var(--text-muted);padding:2rem;font-family:var(--font-ui);font-size:0.7rem;text-align:center;">'
        + '加载存档失败。</p>';
    });

  // ── 缩略图路径：与原图同名，放在 thumbs/ 下 ──
  function thumbPath(img) {
    var stem = img.filename.replace(/\.[^.]+$/, '');
    return 'thumbs/' + encodeURIComponent(stem) + '.webp';
  }

  // ── 主图路径：1280 宽的 medium/，点开时才加载 ──
  function mediumPath(img) {
    var stem = img.filename.replace(/\.[^.]+$/, '');
    return 'medium/' + encodeURIComponent(stem) + '.webp';
  }

  // ── 构建缩略图 DOM（仅设置 data-src，不立即加载）──
  function buildThumbnails(imageList) {
    var fragment = document.createDocumentFragment();
    thumbItems = [];

    imageList.forEach(function (img, index) {
      var item = document.createElement('div');
      item.className = 'thumb-item loading';
      item.setAttribute('data-index', index);
      item.setAttribute('role', 'button');
      // 一组缩略图只占一个 Tab 停靠点，左右方向键在组内移动
      item.tabIndex = index === 0 ? 0 : -1;
      item.setAttribute('aria-label', img.filename + (img.shooting_date ? ' · ' + img.shooting_date : ''));
      item.title = img.filename;

      var thumb = document.createElement('img');
      thumb.setAttribute('data-src', thumbPath(img));
      thumb.setAttribute('data-full', img.path);
      thumb.alt = img.filename;
      thumb.setAttribute('decoding', 'async');

      item.appendChild(thumb);
      item.addEventListener('click', function () { selectImage(index, item); });
      item.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          selectImage(index, item);
          return;
        }
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        var target = thumbItems[index + (e.key === 'ArrowRight' ? 1 : -1)];
        if (!target) return;
        item.tabIndex = -1;
        target.el.tabIndex = 0;
        target.el.focus();
      });
      fragment.appendChild(item);
      thumbItems.push({ el: item, imgEl: thumb, index: index, loaded: false });
    });

    thumbnailGrid.appendChild(fragment);
  }

  // ── IntersectionObserver 懒加载 ────────────
  function startLazyLoad() {
    observer = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        if (!entry.isIntersecting) continue;

        var item = null;
        for (var j = 0; j < thumbItems.length; j++) {
          if (thumbItems[j].el === entry.target) { item = thumbItems[j]; break; }
        }
        if (!item || item.loaded) continue;
        loadThumb(item);
      }
    }, {
      rootMargin: '500px 500px',
      threshold: 0
    });

    thumbItems.forEach(function (item) { observer.observe(item.el); });
  }

  // 加载单张缩略图
  function loadThumb(item) {
    if (item.loaded) return;
    var src = item.imgEl.getAttribute('data-src');
    if (!src) return;

    item.imgEl.src = src;
    item.loaded = true;

    item.imgEl.addEventListener('load', function () {
      item.el.classList.remove('loading');
    }, { once: true });
    item.imgEl.addEventListener('error', function () {
      // 缩略图缺失时退回原图，至少不让格子空着
      var full = item.imgEl.getAttribute('data-full');
      if (full && !item.imgEl.getAttribute('data-fallback')) {
        item.imgEl.setAttribute('data-fallback', '1');
        item.imgEl.src = full;
      } else {
        item.el.classList.remove('loading');
      }
    });

    observer.unobserve(item.el);
  }

  // ── 选中并展示大图 ────────────────────────
  function selectImage(index, thumbEl) {
    if (activeThumb === thumbEl) return;

    if (activeThumb) {
      activeThumb.classList.remove('active');
      activeThumb.removeAttribute('aria-current');
    }
    thumbEl.classList.add('active');
    thumbEl.setAttribute('aria-current', 'true');
    activeThumb = thumbEl;

    var img = images[index];
    if (!img) return;

    mainPlaceholder.classList.add('hidden');
    mainImageWrap.classList.add('shown');
    imageCaption.classList.add('shown');

    // 设置图片源并触发淡入动画（先取 1280 宽的中间图，缺失时退回原图）
    mainImage.onerror = function () {
      if (mainImage.getAttribute('data-fallback') !== '1') {
        mainImage.setAttribute('data-fallback', '1');
        mainImage.src = img.path;
      }
    };
    mainImage.removeAttribute('data-fallback');
    mainImage.src = mediumPath(img);
    mainImage.alt = img.filename;
    mainImage.style.animation = 'none';
    void mainImage.offsetWidth;  // 强制回流以重置动画
    mainImage.style.animation = '';

    captionFilename.textContent = img.filename;
    if (img.shooting_date) {
      captionDate.textContent = img.shooting_date;
      captionDate.style.display = '';
    } else {
      captionDate.style.display = 'none';
    }

    // 印样长卷：点击选片时把长卷滚动同步到该帧（驱动自身选片时不回写）
    if (driverOn && !driverSelecting) syncScrollToIndex(index);
  }

  // ================================================================
  //  印样长卷驱动：滚动进度 → 印样条横移，居中帧即选中
  //  仅在 宽屏 + 允许动效 时开启；否则印样条为原生横向滚动
  // ================================================================
  var REDUCE_MOTION_MQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  var NARROW_MQ = window.matchMedia('(max-width: 1023px)');
  var trackEl = document.getElementById('gallery');
  var stageEl = document.getElementById('scrollStage');
  var driverOn = false;
  var stripShift = 0;
  var driverTicking = false;
  var lastIndex = -1;
  var driverSelecting = false;

  function driverAllowed() {
    return !REDUCE_MOTION_MQ.matches && !NARROW_MQ.matches && trackEl && stageEl && thumbnailGrid;
  }

  var anchorX = 0;      // 看片台准线（视口坐标）
  var gridLeft = 0;     // 印样条原点（grid 左缘）在视口中的 x
  var centers = [];     // 各帧中心（相对 grid 原点，清 transform 后实测）

  function driverMeasure() {
    var railEl = stageEl.querySelector('.rail-panel');
    var railWidth = railEl ? railEl.getBoundingClientRect().width : 0;
    anchorX = railWidth + (stageEl.clientWidth - railWidth) / 2;
    stripShift = Math.max(0, gridLeft + thumbnailGrid.scrollWidth - stageEl.clientWidth);
    trackEl.style.height = (stripShift + window.innerHeight) + 'px';
    measureCenters();
  }

  // 实测各帧中心：临时清掉 transform，用矩形差值取 grid 相对坐标，
  // 避免 offsetLeft 在 transform 父级下的基准漂移
  function measureCenters() {
    var prev = thumbnailGrid.style.transform;
    thumbnailGrid.style.transform = 'none';
    var gr = thumbnailGrid.getBoundingClientRect();
    gridLeft = gr.left; // transform 清零后的原点位置（filmstrip 左内边距之后）
    centers = thumbItems.map(function (it) {
      var r = it.el.getBoundingClientRect();
      return r.left - gr.left + r.width / 2;
    });
    thumbnailGrid.style.transform = prev;
  }

  // 浮动帧中心（可落在两帧之间），保证准线连续无跳动
  function frameCenterAt(f) {
    var n = centers.length;
    if (n === 0) return 0;
    var i0 = Math.max(0, Math.min(n - 1, Math.floor(f)));
    var i1 = Math.min(n - 1, i0 + 1);
    var k = f - i0;
    return centers[i0] + (centers[i1] - centers[i0]) * k;
  }

  function driverUpdate() {
    driverTicking = false;
    if (!driverOn || thumbItems.length === 0) return;
    var rect = trackEl.getBoundingClientRect();
    var total = trackEl.offsetHeight - window.innerHeight;
    if (total <= 0) return;
    var p = Math.min(1, Math.max(0, -rect.top / total));
    // 逐帧锚定：把"第 p*(N-1) 帧"的中心精确压在准线上（替代线性平移，消除准线漂移）
    var fIdx = p * (thumbItems.length - 1);
    // 准线换算到 grid 原点坐标系：视口准线 anchorX 对应 grid 内 (anchorX - gridLeft)
    var tx = (anchorX - gridLeft) - frameCenterAt(fIdx);
    tx = Math.max(-stripShift, Math.min(0, tx));
    thumbnailGrid.style.transform = 'translateX(' + tx.toFixed(1) + 'px)';

    var idx = Math.round(fIdx);
    if (idx !== lastIndex) {
      lastIndex = idx;
      var item = thumbItems[idx];
      if (item) {
        driverSelecting = true;
        selectImage(item.index, item.el);
        driverSelecting = false;
      }
      updateFrameReadout(idx);
    }
    var bar = document.getElementById('frameProgressBar');
    if (bar) bar.style.width = (p * 100).toFixed(1) + '%';

    // 卷尾提示语：到末帧后替换为收束语
    var note = document.querySelector('.rail-note');
    if (note && !note.dataset.atEnd && p > 0.995) {
      note.dataset.atEnd = '1';
      note.innerHTML = '长卷至此 · 已到末帧<em>END OF STRIP</em>';
    } else if (note && note.dataset.atEnd && p <= 0.99) {
      note.dataset.atEnd = '';
      note.innerHTML = '滚动页面 · 展开印样长卷<em>SCROLL THE STRIP</em>';
    }
  }

  // 题签读数：第 N / 共 M 帧
  function updateFrameReadout(idx) {
    var now = document.getElementById('frameNow');
    var total = document.getElementById('frameTotal');
    if (!now || !total) return;
    now.textContent = String(idx + 1).padStart(3, '0');
    total.textContent = '/ ' + thumbItems.length;
  }

  function syncScrollToIndex(index) {
    if (thumbItems.length < 2) return;
    var total = trackEl.offsetHeight - window.innerHeight;
    if (total <= 0) return;
    var y = trackEl.offsetTop + (index / (thumbItems.length - 1)) * total;
    window.scrollTo({ top: y, behavior: 'smooth' });
  }

  window.addEventListener('scroll', function () {
    if (!driverOn || driverTicking) return;
    driverTicking = true;
    requestAnimationFrame(driverUpdate);
  }, { passive: true });

  window.addEventListener('resize', function () { driverSetup(); });
  if (NARROW_MQ.addEventListener) NARROW_MQ.addEventListener('change', function () { driverSetup(); });
  if (REDUCE_MOTION_MQ.addEventListener) REDUCE_MOTION_MQ.addEventListener('change', function () { driverSetup(); });

  function driverSetup() {
    if (driverAllowed() && thumbItems.length > 0) {
      driverOn = true;
      document.body.classList.add('longform-on');
      driverMeasure();
      driverUpdate();
    } else {
      driverOn = false;
      document.body.classList.remove('longform-on');
      thumbnailGrid.style.transform = '';
      trackEl.style.height = '';
      lastIndex = -1;
    }
  }

  // ================================================================
  //  总览覆盖层：按月分组的全部帧网格，点帧跳回长卷
  // ================================================================
  var overviewOverlay = document.getElementById('overviewOverlay');
  var overviewScroll = document.getElementById('overviewScroll');
  var overviewBuilt = false;
  var overviewOpen = false;
  var overviewIO = null;

  function buildOverview() {
    overviewScroll.innerHTML = '';
    var groups = {};
    var order = [];
    images.forEach(function (img, i) {
      var key = (img.shooting_date || '').slice(0, 7) || 'undated';
      if (!groups[key]) { groups[key] = []; order.push(key); }
      groups[key].push({ index: i, img: img });
    });
    order.sort(function (a, b) {
      if (a === 'undated') return 1;
      if (b === 'undated') return -1;
      return b.localeCompare(a); // 最新月在前
    });

    if (overviewIO) overviewIO.disconnect();
    overviewIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var img = en.target.querySelector('img');
        if (img && img.getAttribute('data-src') && !img.src) {
          img.onerror = function () {
            var full = img.getAttribute('data-full');
            if (full && img.getAttribute('data-fallback') !== '1') {
              img.setAttribute('data-fallback', '1');
              img.src = full;
            }
          };
          img.addEventListener('load', function () { img.classList.add('ld'); }, { once: true });
          img.src = img.getAttribute('data-src');
          overviewIO.unobserve(en.target);
        }
      });
    }, { root: overviewScroll, rootMargin: '400px' });

    order.forEach(function (key) {
      var list = groups[key];
      var sec = document.createElement('section');
      sec.className = 'ov-group';
      var label = key === 'undated' ? '未注明日期' : key.replace('-', ' / ');
      sec.innerHTML = '<h3 class="ov-month">' + label + '<span>' + list.length + ' 帧</span></h3>';
      var gridEl = document.createElement('div');
      gridEl.className = 'ov-grid';
      list.forEach(function (it) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ov-cell' + (thumbItems[it.index] && thumbItems[it.index].el.classList.contains('active') ? ' current' : '');
        btn.setAttribute('data-index', it.index);
        btn.title = it.img.filename;
        btn.setAttribute('aria-label', it.img.filename + (it.img.shooting_date ? ' · ' + it.img.shooting_date : ''));
        var im = document.createElement('img');
        im.setAttribute('data-src', thumbPath(it.img));
        im.setAttribute('data-full', it.img.path); // 缩略图缺失时回退原图
        im.alt = '';
        im.setAttribute('decoding', 'async');
        btn.appendChild(im);
        btn.addEventListener('click', function () { closeOverview(); jumpToIndex(it.index); });
        gridEl.appendChild(btn);
        overviewIO.observe(btn);
      });
      sec.appendChild(gridEl);
      overviewScroll.appendChild(sec);
    });
    overviewBuilt = true;
  }

  function markOverviewCurrent() {
    overviewScroll.querySelectorAll('.ov-cell.current').forEach(function (c) { c.classList.remove('current'); });
    if (lastIndex >= 0) {
      var cur = overviewScroll.querySelector('.ov-cell[data-index="' + lastIndex + '"]');
      if (cur) { cur.classList.add('current'); cur.scrollIntoView({ block: 'center' }); }
    }
  }

  function openOverview() {
    if (!images.length) return;
    if (!overviewBuilt) buildOverview();
    else markOverviewCurrent();
    overviewOverlay.hidden = false;
    requestAnimationFrame(function () { overviewOverlay.classList.add('open'); });
    overviewOpen = true;
    document.body.style.overflow = 'hidden';
    overviewScroll.scrollTop = 0;
  }

  function closeOverview() {
    if (!overviewOpen) return;
    overviewOverlay.classList.remove('open');
    overviewOpen = false;
    document.body.style.overflow = '';
    setTimeout(function () { overviewOverlay.hidden = true; }, 280);
  }

  function jumpToIndex(idx) {
    var it = thumbItems[idx];
    if (!it) return;
    if (driverOn) {
      driverSelecting = true;
      selectImage(it.index, it.el);
      driverSelecting = false;
      var total = trackEl.offsetHeight - window.innerHeight;
      if (total > 0) {
        var p = thumbItems.length > 1 ? idx / (thumbItems.length - 1) : 0;
        window.scrollTo({ top: trackEl.offsetTop + p * total, behavior: 'smooth' });
      }
    } else {
      selectImage(it.index, it.el);
      if (it.el.offsetLeft && thumbnailGrid.parentElement.scrollTo) {
        thumbnailGrid.parentElement.scrollTo({ left: it.el.offsetLeft - 80, behavior: 'smooth' });
      }
    }
  }

  var overviewBtnEl = document.getElementById('overviewBtn');
  if (overviewBtnEl) overviewBtnEl.addEventListener('click', openOverview);
  var overviewCloseEl = document.getElementById('overviewClose');
  if (overviewCloseEl) overviewCloseEl.addEventListener('click', closeOverview);

  document.addEventListener('keydown', function (e) {
    if (!overviewOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); closeOverview(); }
  });

  driverSetup();
})();
