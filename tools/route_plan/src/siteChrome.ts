/**
 * 站点公共外壳：把 route_plan 挂进个人站点的工具区。
 *
 * 发布构建（dist/ 由站点以子目录静态托管）时注入：
 *   - 站点侧边栏样式与脚本（/siderbar/*）、工具区暗色主题（/tools/tools_theme.css）
 *   - 挂载「快速到达」侧栏
 * dev（vite 服务）下站点资源不在其服务根内，跳过注入。
 *
 * 说明：用运行时注入而非在 index.html 写死 <link>/<script>——
 * 那些是站点根下的绝对路径，Vite 构建无法解析。
 */
const SITE_HEAD_LINKS = ['/siderbar/siderbar.css', '/tools/tools_theme.css'];

export function mountSiteChrome(): void {
  if (import.meta.env.DEV) return;

  // 标记「页面带站点侧栏」：CSS 据此为侧栏让位（工具栏右侧控件、折叠状态由 sidebar.js 同步）
  document.body.classList.add('has-site-sidebar');

  for (const href of SITE_HEAD_LINKS) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  const script = document.createElement('script');
  script.src = '/siderbar/sidebar.js';
  script.onload = () => {
    const init = (window as unknown as { initSidebar?: (id: string) => void }).initSidebar;
    init?.('sidebar-container');
  };
  document.head.appendChild(script);
}
