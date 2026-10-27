/**
 * theme.js — 全站日/夜双主题控制器
 * 页面接入方式:
 *   1. <html data-theme="light">,并在 <head> 里尽早内联:
 *      <script>var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);</script>
 *   2. 页面放切换按钮(含两个 .theme-icon)与 .theme-grain
 *   3. 引入本文件(可 defer);它会绑定 #themeToggle 并广播 themechange 事件
 * 图表类页面监听 document 上的 themechange 事件重绘:
 *   document.addEventListener('themechange', function (e) { render(e.detail.theme); });
 */
(function () {
    'use strict';

    var root = document.documentElement;

    function current() {
        return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    }

    function apply(theme) {
        root.setAttribute('data-theme', theme);
        try { localStorage.setItem('theme', theme); } catch (e) { /* 隐私模式等忽略 */ }
        document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: theme } }));
    }

    function bind() {
        var btn = document.getElementById('themeToggle');
        if (!btn || btn.dataset.themeBound) return;
        btn.dataset.themeBound = '1';
        btn.addEventListener('click', function () {
            apply(current() === 'dark' ? 'light' : 'dark');
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    /* 供页面脚本按需读取/设置 */
    window.SiteTheme = { get: current, set: apply };
})();
