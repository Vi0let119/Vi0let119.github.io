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
  // 父级文字是真实链接（可点击跳转），右侧 ▼ 按钮控制子菜单展开
  var sidebarHTML =
    '<div class="right-sidebar" id="rightSidebar">' +
      '<button class="toggle-btn" id="toggleBtn">☰</button>' +
      '<h3 class="sidebar-title">快速到达</h3>' +
      '<ul class="sidebar-menu">' +
        '<li><a href="/index.html">首页</a></li>' +
        '<li class="has-submenu">' +
          '<div class="submenu-parent">' +
            '<span class="submenu-label">项目</span>' +
            '<span class="submenu-arrow">▼</span>' +
          '</div>' +
          '<ul class="submenu">' +
            '<li><a href="/projects/project_index.html">分页到达</a></li>' +
          '</ul>' +
        '</li>' +
        '<li class="has-submenu">' +
          '<div class="submenu-parent">' +
            '<span class="submenu-label">图片</span>' +
            '<span class="submenu-arrow">▼</span>' +
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
            '<span class="submenu-arrow">▼</span>' +
          '</div>' +
          '<ul class="submenu">' +
            '<li><a href="/health/health_data.html">分页到达</a></li>' +
          '</ul>' +
        '</li>' +
        '<li class="has-submenu">' +
          '<div class="submenu-parent">' +
            '<span class="submenu-label">作品分享</span>' +
            '<span class="submenu-arrow">▼</span>' +
          '</div>' +
          '<ul class="submenu">' +
            '<li><a href="/sharing/sharing.html">分页到达</a></li>' +
          '</ul>' +
        '</li>' +
        '<li class="has-submenu">' +
          '<div class="submenu-parent">' +
            '<span class="submenu-label">工具箱</span>' +
            '<span class="submenu-arrow">▼</span>' +
          '</div>' +
          '<ul class="submenu">' +
            '<li><a href="/tools/picture_analysis/picture_analysis.html">图片分析</a></li>' +
            '<li><a href="/tools/gps_helper/gps_helper.html">GPS标记</a></li>' +
            '<li><a href="/tools/chart_create/chart_landing.html">图表生成</a></li>' +
          '</ul>' +
        '</li>' +
      '</ul>' +
    '</div>';

  container.innerHTML = sidebarHTML;

  // 获取 DOM 元素
  var sidebar = container.querySelector('.right-sidebar');
  var toggleBtn = container.querySelector('.toggle-btn');
  var submenuParents = container.querySelectorAll('.submenu-parent');

  // 主开关：折叠/展开侧边栏
  toggleBtn.addEventListener('click', function () {
    sidebar.classList.toggle('collapsed');
    toggleBtn.innerText = sidebar.classList.contains('collapsed') ? '☰' : '✕';
  });

  // 响应式：小屏自动折叠
  function handleResize() {
    if (window.innerWidth < 768) {
      sidebar.classList.add('collapsed');
      toggleBtn.innerText = '☰';
    } else if (!defaultCollapsed) {
      sidebar.classList.remove('collapsed');
      toggleBtn.innerText = '✕';
    }
  }
  window.addEventListener('resize', handleResize);
  handleResize();

  // 子菜单：点击父级区域展开/折叠（父级文字不再是链接）
  submenuParents.forEach(function (parent) {
    parent.addEventListener('click', function (e) {
      // 如果点击的是子菜单里的链接，不拦截，让它正常跳转
      if (e.target.tagName === 'A') return;

      var parentLi = parent.closest('.has-submenu');
      var submenu = parentLi ? parentLi.querySelector('.submenu') : null;
      if (!submenu) return;

      submenu.classList.toggle('open');
      var arrow = parent.querySelector('.submenu-arrow');
      if (arrow) {
        arrow.innerText = submenu.classList.contains('open') ? '▲' : '▼';
      }
    });
  });
}

/**
 * 从 JSON 文件加载随机名言并显示在页面上
 * @param {string} jsonPath - 名言 JSON 文件路径，默认为 'quotes.json'
 */
function loadRandomQuote(jsonPath) {
  var path = jsonPath || 'quotes.json';
  d3.json(path, function (error, data) {
    if (error) {
      console.error('加载名言失败:', error);
      document.getElementById('quoteText').textContent = '加载名言失败';
      document.getElementById('quoteAuthor').textContent = '—';
      return;
    }

    if (data && data.length > 0) {
      var randomIndex = Math.floor(Math.random() * data.length);
      var quote = data[randomIndex];
      document.getElementById('quoteText').textContent = quote.text;
      document.getElementById('quoteAuthor').textContent = '—' + quote.author;
    } else {
      document.getElementById('quoteText').textContent = '暂无名言数据';
      document.getElementById('quoteAuthor').textContent = '—';
    }
  });
}
