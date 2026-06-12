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
  var loadedCount = 0;
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
    loadedCount = 0;
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
      mainPlaceholder.style.display = '';
      mainImageWrap.style.display = 'none';
      imageCaption.style.display = 'none';
    }
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
    })
    .catch(function (err) {
      console.error('加载图片数据失败:', err);
      thumbnailGrid.innerHTML =
        '<p style="color:var(--text-muted);padding:2rem;font-family:var(--font-ui);font-size:0.7rem;text-align:center;">'
        + '加载存档失败。</p>';
    });

  // ── 构建缩略图 DOM（仅设置 data-src，不立即加载）──
  function buildThumbnails(imageList) {
    var fragment = document.createDocumentFragment();
    thumbItems = [];

    imageList.forEach(function (img, index) {
      var item = document.createElement('div');
      item.className = 'thumb-item loading';
      item.setAttribute('data-index', index);
      item.title = img.filename;

      var thumb = document.createElement('img');
      thumb.setAttribute('data-src', img.path);
      thumb.alt = img.filename;
      thumb.setAttribute('decoding', 'async');

      item.appendChild(thumb);
      item.addEventListener('click', function () { selectImage(index, item); });
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
      rootMargin: '80px',
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
    loadedCount++;

    item.imgEl.addEventListener('load', function () {
      item.el.classList.remove('loading');
    }, { once: true });
    item.imgEl.addEventListener('error', function () {
      item.el.classList.remove('loading');
    }, { once: true });

    observer.unobserve(item.el);
  }

  // ── 选中并展示大图 ────────────────────────
  function selectImage(index, thumbEl) {
    if (activeThumb === thumbEl) return;

    if (activeThumb) activeThumb.classList.remove('active');
    thumbEl.classList.add('active');
    activeThumb = thumbEl;

    var img = images[index];
    if (!img) return;

    mainPlaceholder.style.display = 'none';
    mainImageWrap.style.display = 'flex';
    imageCaption.style.display = 'flex';

    // 设置图片源并触发淡入动画
    mainImage.src = img.path;
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

    thumbEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
})();
