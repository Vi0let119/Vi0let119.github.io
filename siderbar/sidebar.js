/**
 * 可复用侧边栏组件
 * @param {string} containerId - 挂载容器 ID（页面中放一个空 div 即可）
 * @param {boolean} defaultCollapsed - 默认是否折叠（小屏自动折叠）
 */
function initSidebar(containerId, defaultCollapsed = false) {
  const container = document.getElementById(containerId);
  
  if (!container) return;

  const sidebarHTML = `
    <div class="right-sidebar" id="rightSidebar">
      <button class="toggle-btn" id="toggleBtn">☰</button>
      <h3 class="sidebar-title">快速到达</h3>
      <ul class="sidebar-menu">
        <li><a href="/index.html">首页</a></li>
        <li class="has-submenu">
          <a href="javascript:void(0)" class="submenu-toggle">项目 ▼</a>
          <ul class="submenu">
            <li><a href="/projects/project_index.html">分页到达</a></li>
          </ul>
        </li>
        <li class="has-submenu">
          <a href="javascript:void(0)" class="submenu-toggle">图片 ▼</a>
          <ul class="submenu">
            <li><a href="/pictures/picture_index/picture_index.html">分页到达</a></li>
            <li><a href="/pictures/picture_map/picture_map.html">地图浏览</a></li>
          </ul>
        </li>
        <li class="has-submenu">
          <a href="javascript:void(0)" class="submenu-toggle">健康数据 ▼</a>
          <ul class="submenu">
            <li><a href="/health/health_data.html">分页到达</a></li>
          </ul>
        </li>
        <li class="has-submenu">
          <a href="javascript:void(0)" class="submenu-toggle">作品分享 ▼</a>
          <ul class="submenu">
            <li><a href="/sharing/sharing.html">分页到达</a></li>
          </ul>
        </li>
        <li class="has-submenu">
          <a href="javascript:void(0)" class="submenu-toggle">工具箱 ▼</a>
          <ul class="submenu">
            <li><a href="/tools/picture_analysis/picture_analysis.html">图片分析</a></li>
            <li><a href="/tools/gps_helper/gps_helper.html">GPS标记</a></li>
            <li><a href="/tools/chart_create/chart_landing.html">图表生成</a></li>
          </ul>
        </li>
      </ul>
    </div>
  `;

  // 插入到页面
  container.innerHTML = sidebarHTML;

  // 2. 自动绑定所有交互逻辑（折叠、子菜单、响应式）
  const sidebar = container.querySelector('.right-sidebar');
  const toggleBtn = container.querySelector('.toggle-btn');
  const submenuToggles = container.querySelectorAll('.submenu-toggle');

  // 主开关折叠
  toggleBtn.addEventListener('click', () => {
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
  handleResize(); // 初始化执行一次

  // 子菜单展开/折叠
  submenuToggles.forEach(toggle => {
    toggle.addEventListener('click', () => {
      const parentLi = toggle.closest('.has-submenu');
      const submenu = parentLi?.querySelector('.submenu');
      if (!submenu) return;

      submenu.classList.toggle('open');
      toggle.innerText = submenu.classList.contains('open')
        ? toggle.innerText.replace('▼', '▲')
        : toggle.innerText.replace('▲', '▼');
    });
  });

  
}
function loadRandomQuote(jsonPath) {
    var path = jsonPath || 'quotes.json';
    d3.json(path, function(error, data) {
        if (error) {
            console.error("加载名言失败:", error);
            document.getElementById('quoteText').textContent = "加载名言失败";
            document.getElementById('quoteAuthor').textContent = "—";
            return;
        }
        
        if (data && data.length > 0) {
            var randomIndex = Math.floor(Math.random() * data.length);
            var quote = data[randomIndex];
            document.getElementById('quoteText').textContent = quote.text;
            document.getElementById('quoteAuthor').textContent = "—" + quote.author;
        } else {
            document.getElementById('quoteText').textContent = "暂无名言数据";
            document.getElementById('quoteAuthor').textContent = "—";
        }
    });
}
