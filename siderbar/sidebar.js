/**
 * 可复用侧边栏组件 + 随机名言加载
 * 使用方式：页面中放一个空 div id="sidebar-container"，调用 initSidebar('sidebar-container')
 * @param {string} containerId - 挂载容器 ID
 * @param {boolean} defaultCollapsed - 默认是否折叠（小屏自动折叠）
 */
function initSidebar(containerId, defaultCollapsed) {
  if (defaultCollapsed === undefined) defaultCollapsed = false;

  var container = document.getElementById(containerId);
  if (!container) return;

  // 侧边栏 HTML 模板
  // 父级行（.submenu-parent）只负责展开/折叠子菜单，不承载链接；▼ 是展开状态箭头
  var sidebarHTML =
    '<nav class="right-sidebar" id="rightSidebar" aria-label="快速到达">' +
      '<button class="toggle-btn" id="toggleBtn" type="button" aria-label="收起菜单" aria-expanded="true" aria-controls="rightSidebar">☰</button>' +
      '<p class="sidebar-title">快速到达</p>' +
      '<ul class="sidebar-menu">' +
        '<li><a href="/index.html">首页</a></li>' +
        '<li class="has-submenu">' +
          '<div class="submenu-parent">' +
            '<span class="submenu-label">项目</span>' +
            '<span class="submenu-arrow" aria-hidden="true">▼</span>' +
          '</div>' +
          '<ul class="submenu">' +
            '<li><a href="/projects/project_index.html">分页到达</a></li>' +
          '</ul>' +
        '</li>' +
        '<li class="has-submenu">' +
          '<div class="submenu-parent">' +
            '<span class="submenu-label">图片</span>' +
            '<span class="submenu-arrow" aria-hidden="true">▼</span>' +
          '</div>' +
          '<ul class="submenu">' +
            '<li><a href="/pictures/picture_index/picture_index.html">分页到达</a></li>' +
            '<li><a href="/pictures/picture_map/picture_map.html">地图浏览</a></li>' +
            '<li><a href="/pictures/picture_features/features_visual.html">视觉星图</a></li>' +
          '</ul>' +
        '</li>' +
        '<li class="has-submenu">' +
          '<div class="submenu-parent">' +
            '<span class="submenu-label">健康数据</span>' +
            '<span class="submenu-arrow" aria-hidden="true">▼</span>' +
          '</div>' +
          '<ul class="submenu">' +
            '<li><a href="/health/health_data.html">分页到达</a></li>' +
          '</ul>' +
        '</li>' +
        '<li class="has-submenu">' +
          '<div class="submenu-parent">' +
            '<span class="submenu-label">AI周报告</span>' +
            '<span class="submenu-arrow" aria-hidden="true">▼</span>' +
          '</div>' +
          '<ul class="submenu">' +
            '<li><a href="/ai_report/ai_report.html">分页到达</a></li>' +
          '</ul>' +
        '</li>' +
        '<li class="has-submenu">' +
          '<div class="submenu-parent">' +
            '<span class="submenu-label">作品分享</span>' +
            '<span class="submenu-arrow" aria-hidden="true">▼</span>' +
          '</div>' +
          '<ul class="submenu">' +
            '<li><a href="/sharing/sharing.html">分页到达</a></li>' +
          '</ul>' +
        '</li>' +
        '<li class="has-submenu">' +
          '<div class="submenu-parent">' +
            '<span class="submenu-label">工具箱</span>' +
            '<span class="submenu-arrow" aria-hidden="true">▼</span>' +
          '</div>' +
          '<ul class="submenu">' +
            '<li><a href="/tools/picture_analysis/picture_analysis.html">图片分析</a></li>' +
            '<li><a href="/tools/gps_helper/gps_helper.html">GPS标记</a></li>' +
            '<li><a href="/tools/chart_create/chart_landing.html">图表生成</a></li>' +
            '<li><a href="/tools/route_plan/dist/index.html">路线规划</a></li>' +
          '</ul>' +
        '</li>' +
      '</ul>' +
    '</nav>';

  container.innerHTML = sidebarHTML;

  // 获取 DOM 元素
  var sidebar = container.querySelector('.right-sidebar');
  var toggleBtn = container.querySelector('.toggle-btn');
  var submenuParents = container.querySelectorAll('.submenu-parent');

  // 无障碍：子菜单父级可聚焦、可键盘操作，并暴露展开状态
  submenuParents.forEach(function (parent, i) {
    var parentLi = parent.closest('.has-submenu');
    var submenu = parentLi ? parentLi.querySelector('.submenu') : null;
    if (!submenu) return;
    var submenuId = 'sidebar-submenu-' + i;
    submenu.id = submenuId;
    parent.setAttribute('role', 'button');
    parent.setAttribute('tabindex', '0');
    parent.setAttribute('aria-expanded', 'false');
    parent.setAttribute('aria-controls', submenuId);
    var label = parent.querySelector('.submenu-label');
    if (label) parent.setAttribute('aria-label', label.textContent + '（展开子菜单）');
  });

  // 标出当前页面对应的链接
  var herePath = location.pathname.replace(/\/index\.html$/, '/');
  container.querySelectorAll('.sidebar-menu a[href]').forEach(function (link) {
    var linkPath;
    try {
      linkPath = new URL(link.href, location.href).pathname.replace(/\/index\.html$/, '/');
    } catch (err) {
      return;
    }
    if (linkPath === herePath) link.setAttribute('aria-current', 'page');
  });

  // 同步 body 上的折叠状态类：供需要为侧栏让位的全屏页面（如路线规划器）用 CSS 让出空间
  function syncBodyCollapsedClass() {
    document.body.classList.toggle('sidebar-collapsed', sidebar.classList.contains('collapsed'));
  }

  // 按钮文字、aria 状态与折叠类保持一致
  function syncToggleState() {
    var collapsed = sidebar.classList.contains('collapsed');
    toggleBtn.innerText = collapsed ? '☰' : '✕';
    toggleBtn.setAttribute('aria-expanded', String(!collapsed));
    toggleBtn.setAttribute('aria-label', collapsed ? '展开菜单' : '收起菜单');
    syncBodyCollapsedClass();
  }

  // 主开关：折叠/展开侧边栏
  toggleBtn.addEventListener('click', function () {
    sidebar.classList.toggle('collapsed');
    syncToggleState();
  });

  // 响应式：只在跨过 768px 断点时自动切换，避免用户手动收起后被一次 resize 顶开
  var wasNarrow = null;
  function handleResize() {
    var narrow = window.innerWidth < 768;
    if (narrow !== wasNarrow) {
      wasNarrow = narrow;
      if (narrow || defaultCollapsed) {
        sidebar.classList.add('collapsed');
      } else {
        sidebar.classList.remove('collapsed');
      }
    }
    syncToggleState();
  }
  window.addEventListener('resize', handleResize);
  handleResize();

  // 子菜单：点击或键盘（Enter / 空格）父级区域展开/折叠
  function setSubmenuState(parent, open) {
    var parentLi = parent.closest('.has-submenu');
    var submenu = parentLi ? parentLi.querySelector('.submenu') : null;
    if (!submenu) return;
    submenu.classList.toggle('open', open);
    parent.setAttribute('aria-expanded', String(open));
    var label = parent.querySelector('.submenu-label');
    if (label) parent.setAttribute('aria-label', label.textContent + (open ? '（收起子菜单）' : '（展开子菜单）'));
    var arrow = parent.querySelector('.submenu-arrow');
    if (arrow) arrow.innerText = open ? '▲' : '▼';
  }

  submenuParents.forEach(function (parent) {
    parent.addEventListener('click', function (e) {
      // 如果点击的是子菜单里的链接，不拦截，让它正常跳转
      if (e.target.tagName === 'A') return;
      setSubmenuState(parent, parent.getAttribute('aria-expanded') !== 'true');
    });

    parent.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
      e.preventDefault();
      setSubmenuState(parent, parent.getAttribute('aria-expanded') !== 'true');
    });
  });
}

/**
 * 从 JSON 文件加载随机名言并显示在页面上
 * @param {string} jsonPath - 名言 JSON 文件路径，默认为 'quotes.json'
 */
function loadRandomQuote(jsonPath) {
  var path = jsonPath || 'quotes.json';

  function render(data) {
    if (data && data.length > 0) {
      var randomIndex = Math.floor(Math.random() * data.length);
      var quote = data[randomIndex];
      document.getElementById('quoteText').textContent = quote.text;
      document.getElementById('quoteAuthor').textContent = '—' + quote.author;
    } else {
      document.getElementById('quoteText').textContent = '暂无名言数据';
      document.getElementById('quoteAuthor').textContent = '—';
    }
  }

  function fail(error) {
    console.error('加载名言失败:', error);
    document.getElementById('quoteText').textContent = '加载名言失败';
    document.getElementById('quoteAuthor').textContent = '—';
  }

  // 优先用 fetch：不再为了读一份 JSON 而加载 143 KB 的 d3 v3
  if (window.fetch) {
    fetch(path)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(render)
      .catch(fail);
  } else if (window.d3) {
    d3.json(path, function (error, data) {
      if (error) fail(error);
      else render(data);
    });
  } else {
    fail(new Error('没有可用的请求方式'));
  }
}
