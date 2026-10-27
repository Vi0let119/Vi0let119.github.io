/**
 * ai_report.js — AI 周报告阅读器
 * 流程：读 manifest.json → 左侧索引 → 取当期 md/html → 渲染 + 目录 + 灯箱
 * 依赖：marked（vendor/marked.min.js）、DOMPurify（vendor/purify.min.js）、sidebar.js
 */
(function () {
  'use strict';

  var state = {
    reports: [],
    currentId: null,
    renderToken: 0,
    observer: null,
    tocLock: 0
  };

  var els = {};
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function $(id) { return document.getElementById(id); }

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  function fmtDate(value) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '');
    return m ? m[1] + '.' + m[2] + '.' + m[3] : (value || '');
  }

  function shortDate(value) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '');
    return m ? m[2] + '.' + m[3] : (value || '');
  }

  function rangeText(report) {
    if (report.weekStart && report.weekEnd) {
      if (report.weekStart.slice(0, 4) !== report.weekEnd.slice(0, 4)) {
        return fmtDate(report.weekStart) + ' — ' + fmtDate(report.weekEnd);
      }
      return shortDate(report.weekStart) + ' — ' + shortDate(report.weekEnd);
    }
    return fmtDate(report.date || report.updated || '');
  }

  // 本地日期 → ISO 周编号（2026-W43），用于标记「本周」
  function isoWeekKey(date) {
    var d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    var day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    var week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return d.getUTCFullYear() + '-W' + pad2(week);
  }

  function weekOf(report) {
    var w = String(report.week || '');
    var m = /^(\d{4})-W(\d{1,2})$/.exec(w);
    if (m) return m[1] + '-W' + pad2(parseInt(m[2], 10));
    var dm = /^(\d{4})-(\d{2})-(\d{2})/.exec(report.weekStart || report.date || '');
    if (dm) return isoWeekKey(new Date(+dm[1], +dm[2] - 1, +dm[3]));
    return '';
  }

  function weekName(key) {
    var m = /^(\d{4})-W(\d{2})$/.exec(key);
    return m ? m[1] + ' · W' + m[2] : '未编周';
  }

  function findReport(id) {
    for (var i = 0; i < state.reports.length; i++) {
      if (state.reports[i].id === id) return state.reports[i];
    }
    return null;
  }

  // 同一周内按报告序号从新到旧排；纯字典序会把 -9 排到 -19 前面
  function reportSeq(id) {
    var m = /-dispatch(?:-(\d+))?$/.exec(String(id || ''));
    if (!m) return 0;
    return m[1] ? parseInt(m[1], 10) : 1;
  }

  function sortReports(list) {
    return list.slice().sort(function (a, b) {
      var ka = a.weekStart || a.date || '';
      var kb = b.weekStart || b.date || '';
      if (ka === kb) {
        var sa = reportSeq(a.id);
        var sb = reportSeq(b.id);
        if (sa !== sb) return sb - sa;
        return a.id < b.id ? 1 : -1;
      }
      return ka < kb ? 1 : -1;
    });
  }

  /* ---------------- 数据 ---------------- */

  function loadManifest() {
    var url = 'manifest.json?v=' + Date.now();
    return fetch(url, { cache: 'no-store' }).then(function (res) {
      if (!res.ok) {
        var err = new Error('manifest.json 返回 HTTP ' + res.status);
        err.code = res.status;
        throw err;
      }
      return res.json();
    }).then(function (data) {
      var list = (data && data.reports) || [];
      state.reports = sortReports(list.filter(function (r) {
        return r && r.id && r.path;
      }));
      return state.reports;
    });
  }

  /* ---------------- 索引：按周分组 ---------------- */

  // 以周为单位分组：同一周的多期报告挂在同一个周标题下
  function groupReports(list) {
    var groups = [];
    var byKey = {};
    list.forEach(function (report) {
      var key = weekOf(report) || 'undated';
      var group = byKey[key];
      if (!group) {
        group = byKey[key] = {
          key: key,
          name: weekName(key),
          range: rangeText(report),
          items: []
        };
        groups.push(group);
      }
      group.items.push(report);
    });
    return groups;
  }

  function setWeekOpen(section, open) {
    var head = section.querySelector('.ap-week-head');
    var list = section.querySelector('.ap-week-list');
    if (!head || !list) return;
    section.classList.toggle('is-open', open);
    head.setAttribute('aria-expanded', open ? 'true' : 'false');
    list.hidden = !open;
  }

  function renderIndex() {
    els.indexList.innerHTML = '';
    els.indexCount.textContent = state.reports.length + ' ISSUE' + (state.reports.length === 1 ? '' : 'S');
    els.issueCount.textContent = pad2(state.reports.length);
    els.footCount.textContent = state.reports.length;

    var groups = groupReports(state.reports);
    var currentKey = isoWeekKey(new Date());
    var hasCurrent = groups.some(function (g) { return g.key === currentKey; });
    var index = 0;

    groups.forEach(function (group, gi) {
      var isCurrent = group.key === currentKey;
      // 当前周默认展开；若档案里没有当前周，则展开最新一周
      var expanded = isCurrent || (!hasCurrent && gi === 0);

      var section = document.createElement('section');
      section.className = 'ap-week' + (expanded ? ' is-open' : '') + (isCurrent ? ' is-current' : '');
      section.setAttribute('data-week', group.key);

      var bodyId = 'ap-week-' + (gi + 1);

      var head = document.createElement('button');
      head.type = 'button';
      head.className = 'ap-week-head';
      head.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      head.setAttribute('aria-controls', bodyId);
      head.title = group.range ? group.name + ' · ' + group.range : group.name;

      var name = document.createElement('span');
      name.className = 'ap-week-name';
      name.textContent = group.name;
      head.appendChild(name);

      if (isCurrent) {
        var now = document.createElement('span');
        now.className = 'ap-week-now';
        now.textContent = '本周';
        head.appendChild(now);
      }

      var count = document.createElement('span');
      count.className = 'ap-week-count';
      count.textContent = group.items.length + ' 期';
      head.appendChild(count);

      var caret = document.createElement('span');
      caret.className = 'ap-week-caret';
      caret.setAttribute('aria-hidden', 'true');
      caret.textContent = '▾';
      head.appendChild(caret);

      var list = document.createElement('ul');
      list.className = 'ap-week-list';
      list.id = bodyId;
      list.hidden = !expanded;

      group.items.forEach(function (report, n) {
        var li = document.createElement('li');
        li.className = 'ap-week-item';

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ap-entry';
        btn.setAttribute('data-id', report.id);
        btn.title = report.title || report.id;
        btn.style.setProperty('--i', index++);

        var num = document.createElement('span');
        num.className = 'ap-entry-num';
        num.textContent = pad2(n + 1);

        var main = document.createElement('span');
        main.className = 'ap-entry-main';

        var title = document.createElement('span');
        title.className = 'ap-entry-title';
        title.textContent = report.title || report.id;

        var date = document.createElement('span');
        date.className = 'ap-entry-date';
        date.textContent = shortDate(report.date || report.weekStart || '');

        main.appendChild(title);
        main.appendChild(date);
        btn.appendChild(num);
        btn.appendChild(main);

        if (report.type === 'html') {
          var badge = document.createElement('span');
          badge.className = 'ap-entry-type';
          badge.textContent = 'HTML';
          btn.appendChild(badge);
        }

        btn.addEventListener('click', function () {
          select(report.id, 'push');
        });

        li.appendChild(btn);
        list.appendChild(li);
      });

      head.addEventListener('click', function () {
        setWeekOpen(section, head.getAttribute('aria-expanded') !== 'true');
      });

      section.appendChild(head);
      section.appendChild(list);
      els.indexList.appendChild(section);
    });
  }

  // 让当前期所在的周自动展开，并把它带进索引的可视区域
  function keepEntryVisible(entry) {
    var box = els.indexList;
    if (!box || box.scrollHeight <= box.clientHeight + 1) return;
    var b = box.getBoundingClientRect();
    var r = entry.getBoundingClientRect();
    var pad = 10;
    if (r.top < b.top + pad) box.scrollTop -= (b.top + pad - r.top);
    else if (r.bottom > b.bottom - pad) box.scrollTop += (r.bottom - b.bottom + pad);
  }

  function markActive(id) {
    var items = els.indexList.querySelectorAll('.ap-entry');
    var active = null;
    for (var i = 0; i < items.length; i++) {
      var isActive = items[i].getAttribute('data-id') === id;
      items[i].classList.toggle('is-active', isActive);
      if (isActive) {
        items[i].setAttribute('aria-current', 'true');
        active = items[i];
      } else {
        items[i].removeAttribute('aria-current');
      }
    }
    if (!active) return;

    var week = active.closest ? active.closest('.ap-week') : null;
    if (week) setWeekOpen(week, true);
    keepEntryVisible(active);
  }

  /* ---------------- 路由 ---------------- */

  function hashId() {
    var raw = location.hash.replace(/^#/, '');
    if (!raw) return '';
    try { return decodeURIComponent(raw); } catch (e) { return raw; }
  }

  function setHash(id, mode) {
    var hash = '#' + encodeURIComponent(id);
    if (location.hash === hash) return;
    try {
      if (mode === 'push') history.pushState(null, '', hash);
      else history.replaceState(null, '', hash);
    } catch (e) {
      location.hash = hash;
    }
  }

  function select(id, mode) {
    var report = findReport(id);
    if (!report) {
      report = state.reports[0];
      if (!report) return;
      id = report.id;
    }
    var isInitial = state.currentId === null;
    state.currentId = id;
    if (mode === 'push' || mode === 'replace') setHash(id, mode);
    markActive(id);
    renderReport(report, isInitial);
  }

  /* ---------------- 渲染 ---------------- */

  function setLoading() {
    els.sheet.hidden = false;
    els.loading.hidden = false;
    els.doc.hidden = true;
    els.empty.hidden = true;
    els.error.hidden = true;
  }

  function showError(message) {
    els.sheet.hidden = true;
    els.empty.hidden = true;
    els.error.hidden = false;
    els.errorDetail.textContent = message || '请检查 manifest.json 与报告文件是否存在。';
  }

  function showEmpty() {
    els.sheet.hidden = true;
    els.error.hidden = true;
    els.empty.hidden = false;
  }

  function fillDocHead(report) {
    els.docIssue.textContent = 'ISSUE ' + (report.week || report.id);
    els.docRange.textContent = rangeText(report);
    els.docTitle.textContent = report.title || report.id;

    if (report.summary) {
      els.docSummary.hidden = false;
      els.docSummary.textContent = report.summary;
    } else {
      els.docSummary.hidden = true;
      els.docSummary.textContent = '';
    }

    els.docChips.innerHTML = '';
    var chips = [];
    if (report.date) chips.push('DATE ' + fmtDate(report.date));
    if (report.model) chips.push('MODEL ' + report.model);
    if (report.words) chips.push(report.words + ' 字');
    if (report.images) chips.push(report.images + ' 图');
    chips.push(report.type === 'html' ? 'HTML' : 'MARKDOWN');
    chips.forEach(function (text) {
      var chip = document.createElement('span');
      chip.className = 'ap-chip';
      chip.textContent = text;
      els.docChips.appendChild(chip);
    });

    document.title = (report.title || report.id) + ' — AI 周报告';
  }

  function renderReport(report, isInitial) {
    var token = ++state.renderToken;
    setLoading();
    setPager(report);
    fillDocHead(report);

    if (report.type === 'html') {
      renderHtml(report, token);
      revealDoc(report, isInitial);
      return;
    }

    var url = new URL(report.path, location.href);
    if (report.updated) url.searchParams.set('v', report.updated.replace(/[^\dT:+-]/g, ''));

    fetch(url.toString(), { cache: 'no-cache' }).then(function (res) {
      if (!res.ok) throw new Error('报告文件返回 HTTP ' + res.status);
      return res.text();
    }).then(function (raw) {
      if (token !== state.renderToken) return;
      renderMarkdown(report, raw);
      revealDoc(report, isInitial);
    }).catch(function (err) {
      if (token !== state.renderToken) return;
      showError('「' + (report.title || report.id) + '」读取失败：' + err.message);
    });
  }

  function renderHtml(report, token) {
    if (token !== state.renderToken) return;
    var src = new URL(report.path, location.href);
    if (report.updated) src.searchParams.set('v', report.updated.replace(/[^\dT:+-]/g, ''));

    els.docBody.innerHTML = '';
    var note = document.createElement('p');
    note.className = 'ap-html-note';
    note.textContent = 'HTML 报告 · 独立页面嵌入 · 不参与目录';
    var frame = document.createElement('iframe');
    frame.className = 'ap-html-frame';
    frame.src = src.toString();
    frame.title = report.title || report.id;
    frame.loading = 'lazy';
    // 同源 iframe：按内容高度撑开，短报告不出现内层滚动条；长报告封顶后内部滚动
    frame.addEventListener('load', function () {
      try {
        var doc = frame.contentDocument;
        if (!doc) return;
        var h = Math.max(
          doc.documentElement ? doc.documentElement.scrollHeight : 0,
          doc.body ? doc.body.scrollHeight : 0
        );
        if (h > 0) frame.style.height = Math.min(Math.max(h + 16, 520), 2400) + 'px';
      } catch (e) { /* 跨域时保持默认高度 */ }
    });
    els.docBody.appendChild(note);
    els.docBody.appendChild(frame);
    buildToc([]);
  }

  function revealDoc(report, isInitial) {
    els.loading.hidden = true;
    els.doc.hidden = false;
    els.sheet.classList.remove('is-entering');
    void els.sheet.offsetWidth;
    els.sheet.classList.add('is-entering');
    maybeScroll(report, isInitial);
  }

  function maybeScroll(report, isInitial) {
    if (isInitial) return;
    var narrow = window.matchMedia('(max-width: 900px)').matches;
    var top = els.sheet.getBoundingClientRect().top;
    if (narrow || top < 0) {
      scrollWindowTo(top + window.scrollY - 14, !reduceMotion.matches);
    }
  }

  /* ---------------- Markdown ---------------- */

  function normalize(text) {
    return (text || '').replace(/[\s\u3000:：·・,，.。!！?？'"“”‘’\-—_]/g, '');
  }

  // 去掉 md 顶部的 YAML front-matter（元数据已由 build_manifest.py 写进清单）
  function stripFrontMatter(text) {
    var lines = String(text || '').split(/\r?\n/);
    if (!lines.length || lines[0].trim() !== '---') return text;
    for (var i = 1; i < lines.length; i++) {
      var line = lines[i].trim();
      if (line === '---' || line === '...') {
        return lines.slice(i + 1).join('\n').replace(/^\s*\n/, '');
      }
    }
    return text;
  }

  function renderMarkdown(report, raw) {
    var html = marked.parse(stripFrontMatter(raw), { gfm: true, breaks: false });
    html = DOMPurify.sanitize(html, {
      FORBID_TAGS: ['script', 'style', 'iframe', 'form', 'object', 'embed', 'link', 'meta'],
      FORBID_ATTR: ['style'],
      ADD_ATTR: ['target', 'rel', 'loading', 'decoding', 'checked', 'disabled', 'type', 'align']
    });

    var frag = document.createElement('div');
    // 下面的 html 已经过 DOMPurify 消毒（剥掉 script/style/iframe 与内联样式），
    // 再插入 DOM 是安全的；这是唯一一处使用 innerHTML 承载报告内容的位置。
    frag.innerHTML = html;

    // 标题与 front-matter 重复时，去掉正文里的 H1
    var first = frag.firstElementChild;
    if (first && first.tagName === 'H1' && report.title &&
        normalize(first.textContent) === normalize(report.title)) {
      frag.removeChild(first);
    }

    var base = new URL(report.path, location.href);

    // 图片：解析相对路径 + 包 figure + 灯箱
    Array.prototype.forEach.call(frag.querySelectorAll('img'), function (img) {
      var src = img.getAttribute('src') || '';
      if (src && !/^(?:[a-z]+:|\/\/|\/)/i.test(src)) {
        try { img.src = new URL(src, base).toString(); } catch (e) { /* 保持原样 */ }
      }
      img.setAttribute('loading', 'lazy');
      img.setAttribute('decoding', 'async');

      var alt = img.getAttribute('alt') || '';
      var fig = document.createElement('figure');
      img.parentNode.insertBefore(fig, img);
      fig.appendChild(img);
      if (alt) {
        var cap = document.createElement('figcaption');
        cap.textContent = alt;
        fig.appendChild(cap);
      }
      img.addEventListener('click', function () {
        openLightbox(img.getAttribute('src'), alt);
      });
    });

    // 表格横向滚动容器
    Array.prototype.forEach.call(frag.querySelectorAll('table'), function (table) {
      var wrap = document.createElement('div');
      wrap.className = 'ap-table-wrap';
      table.parentNode.insertBefore(wrap, table);
      wrap.appendChild(table);
    });

    // 链接：外链新窗口；相对链接按报告所在目录解析
    Array.prototype.forEach.call(frag.querySelectorAll('a'), function (a) {
      var href = a.getAttribute('href') || '';
      if (/^https?:/i.test(href)) {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
      } else if (href && href.charAt(0) !== '#' && !/^mailto:/i.test(href)) {
        try { a.href = new URL(href, base).toString(); } catch (e) { /* 保持原样 */ }
      }
    });

    // 代码块语言标签
    Array.prototype.forEach.call(frag.querySelectorAll('pre > code'), function (code) {
      var m = /language-([\w+#-]+)/.exec(code.className || '');
      if (m) code.parentNode.setAttribute('data-lang', m[1]);
    });

    // 任务列表：给带 checkbox 的 li 去掉默认圆点
    Array.prototype.forEach.call(frag.querySelectorAll('li > input[type="checkbox"]'), function (box) {
      box.parentNode.classList.add('ap-task-item');
    });

    // 标题 id + 目录
    var toc = [];
    var h2n = 0;
    Array.prototype.forEach.call(frag.querySelectorAll('h2, h3'), function (head, i) {
      var id = 'sec-' + (i + 1);
      head.id = id;
      if (head.tagName === 'H2') h2n++;
      toc.push({
        id: id,
        level: head.tagName === 'H2' ? 2 : 3,
        num: head.tagName === 'H2' ? pad2(h2n) : '·',
        text: head.textContent.trim()
      });
    });

    els.docBody.innerHTML = '';
    while (frag.firstChild) els.docBody.appendChild(frag.firstChild);

    buildToc(toc);
    observeHeadings();
  }

  function buildToc(toc) {
    els.tocList.innerHTML = '';
    state.tocLock = 0;
    if (!toc.length) {
      els.tocPanel.classList.add('is-hidden');
      return;
    }
    els.tocPanel.classList.remove('is-hidden');

    toc.forEach(function (item) {
      var a = document.createElement('a');
      a.className = 'ap-toc-link' + (item.level === 3 ? ' is-sub' : '');
      a.href = '#' + item.id;
      a.setAttribute('data-target', item.id);

      var num = document.createElement('span');
      num.className = 'ap-toc-num';
      num.textContent = item.num;

      var text = document.createElement('span');
      text.className = 'ap-toc-text';
      text.textContent = item.text;

      var dots = document.createElement('span');
      dots.className = 'ap-toc-dots';

      a.appendChild(num);
      a.appendChild(text);
      a.appendChild(dots);
      a.addEventListener('click', function (e) {
        e.preventDefault();
        scrollToHeading(item.id);
        setActiveToc(item.id);
      });
      els.tocList.appendChild(a);
    });
  }

  // 统一的窗口滚动：一次到位，不让第二次调用打断平滑动画
  function scrollWindowTo(top, smooth) {
    top = Math.max(0, Math.round(top));
    var before = window.scrollY;
    try {
      window.scrollTo({ top: top, behavior: smooth ? 'smooth' : 'auto' });
    } catch (e) {
      window.scrollTo(0, top);
      return;
    }
    // 后台标签页 / 不支持平滑滚动的内核不会启动动画，退化为直接定位
    if (!smooth || Math.abs(top - before) < 2) return;
    window.setTimeout(function () {
      if (Math.abs(window.scrollY - before) < 2) window.scrollTo(0, top);
    }, 200);
  }

  function scrollToHeading(id) {
    var head = document.getElementById(id);
    if (!head) return;

    // 焦点先落到标题上（preventScroll 避免二次跳动），再一次性滚到目标位置
    if (!head.hasAttribute('tabindex')) head.setAttribute('tabindex', '-1');
    try { head.focus({ preventScroll: true }); } catch (e) { /* 旧内核忽略 */ }

    // 目录在上、纸页在下：把标题停在视口上方留白处，同时落在观察器的命中带里
    var offset = window.matchMedia('(max-width: 900px)').matches ? 22 : 34;
    var max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    var top = Math.min(head.getBoundingClientRect().top + window.scrollY - offset, max);

    // 平滑滚动期间先锁住观察器，避免途经的标题把高亮抢走
    state.tocLock = Date.now() + 900;
    scrollWindowTo(top, !reduceMotion.matches);
  }

  function setActiveToc(id) {
    var links = els.tocList.querySelectorAll('.ap-toc-link');
    for (var i = 0; i < links.length; i++) {
      var on = links[i].getAttribute('data-target') === id;
      links[i].classList.toggle('is-active', on);
      if (on) links[i].setAttribute('aria-current', 'location');
      else links[i].removeAttribute('aria-current');
    }
  }

  function observeHeadings() {
    if (state.observer) state.observer.disconnect();
    if (!('IntersectionObserver' in window)) return;

    var heads = els.docBody.querySelectorAll('h2, h3');
    if (!heads.length) return;

    state.observer = new IntersectionObserver(function (entries) {
      if (Date.now() < state.tocLock) return;
      entries.forEach(function (entry) {
        if (entry.isIntersecting) setActiveToc(entry.target.id);
      });
    }, { rootMargin: '-20px 0px -68% 0px', threshold: 0 });

    Array.prototype.forEach.call(heads, function (h) { state.observer.observe(h); });
  }

  /* ---------------- 翻页 ---------------- */

  function setPager(report) {
    var index = state.reports.indexOf(report);
    var older = index + 1 < state.reports.length ? state.reports[index + 1] : null;
    var newer = index > 0 ? state.reports[index - 1] : null;

    els.prev.disabled = !older;
    els.next.disabled = !newer;
    els.prev.onclick = older ? function () { select(older.id, 'push'); } : null;
    els.next.onclick = newer ? function () { select(newer.id, 'push'); } : null;
  }

  /* ---------------- 灯箱 ---------------- */

  function openLightbox(src, caption) {
    if (!src) return;
    els.lightboxImg.src = src;
    els.lightboxImg.alt = caption || '';
    els.lightboxCap.textContent = caption || '';
    els.lightbox.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    els.lightbox.hidden = true;
    els.lightboxImg.src = '';
    document.body.style.overflow = '';
  }

  function bindLightbox() {
    els.lightboxClose.addEventListener('click', closeLightbox);
    els.lightbox.addEventListener('click', function (e) {
      if (e.target === els.lightbox) closeLightbox();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !els.lightbox.hidden) closeLightbox();
    });
  }

  /* ---------------- 主题 / 名言 ----------------
     主题切换交给全站 theme.js(读 localStorage、广播 themechange);
     名言交由 sidebar.js 的 loadRandomQuote() 统一处理。
     本文件不再重复实现，避免两套逻辑各自演化。 */

  /* ---------------- 启动 ---------------- */

  function init() {
    [
      'indexList', 'indexCount', 'issueCount', 'footCount', 'footYear',
      'sheet', 'sheetLoading', 'docContent', 'docIssue', 'docRange',
      'docTitle', 'docSummary', 'docChips', 'docBody', 'tocPanel', 'tocList',
      'prevIssue', 'nextIssue', 'stateEmpty', 'stateError', 'errorDetail',
      'lightbox', 'lightboxImg', 'lightboxCap', 'lightboxClose'
    ].forEach(function (id) { els[id] = $(id); });

    // 别名：源码里用短名，DOM id 保持语义化
    els.loading = els.sheetLoading;
    els.doc = els.docContent;
    els.empty = els.stateEmpty;
    els.error = els.stateError;
    els.prev = els.prevIssue;
    els.next = els.nextIssue;

    els.footYear.textContent = new Date().getFullYear();

    if (window.initSidebar) initSidebar('sidebar-container');
    bindLightbox();
    // 名言用侧边栏组件的统一实现；主题按钮由 theme.js 绑定
    if (window.loadRandomQuote) loadRandomQuote('../quotes.json');

    loadManifest().then(function (list) {
      renderIndex();
      if (!list.length) { showEmpty(); return; }
      var initial = hashId();
      if (!findReport(initial)) initial = list[0].id;
      select(initial, 'replace');
    }).catch(function (err) {
      if (err && err.code === 404) {
        renderIndex();
        showEmpty();
      } else {
        showError('manifest.json 读取失败：' + err.message);
      }
    });

    window.addEventListener('popstate', function () {
      var id = hashId();
      if (id && id !== state.currentId) select(id, 'none');
    });

    window.addEventListener('hashchange', function () {
      var id = hashId();
      if (id && id !== state.currentId) select(id, 'none');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
