/**
 * perch.js — Perch 产品简介页交互
 * 1. 滚动 reveal(IntersectionObserver,只触发一次)
 * 2. Hero / 区块视差(rAF + scroll,≤767px 与 reduced-motion 禁用)
 * 3. 管理面板页签画廊(点击 / ←→ Home End 切换,roving tabindex)
 */
(function () {
    'use strict';

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var docEl = document.documentElement;

    /* JS 可用时才隐藏 reveal 元素,无 JS 时内容完全可见 */
    docEl.classList.add('js-anim');

    /* ============ 1. 滚动 reveal ============ */
    var revealEls = Array.prototype.slice.call(document.querySelectorAll('.reveal'));

    if (!reduceMotion && 'IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    io.unobserve(entry.target);
                }
            });
        }, { threshold: 0.15 });

        revealEls.forEach(function (el) { io.observe(el); });
    } else {
        revealEls.forEach(function (el) { el.classList.add('is-visible'); });
    }

    /* ============ 2. 视差 ============ */
    var heroImg = document.querySelector('.hero-img, .hero-ph');
    var heroGlows = Array.prototype.slice.call(document.querySelectorAll('.hero-glow'));
    var paraEls = Array.prototype.slice.call(document.querySelectorAll('[data-parallax]'));

    function isMobile() { return window.innerWidth <= 767; }
    var parallaxOn = !reduceMotion && !isMobile();

    /* 记录元素初始文档位置(transform 不影响 getBoundingClientRect 初值,视差后不再重读,避免反馈漂移) */
    function measure() {
        paraEls.forEach(function (el) {
            el._baseTop = el.getBoundingClientRect().top + window.pageYOffset;
        });
    }
    measure();

    var ticking = false;

    function tick() {
        ticking = false;
        if (!parallaxOn) return;

        var y = window.pageYOffset;
        var vh = window.innerHeight;

        if (heroImg) {
            heroImg.style.transform = 'translateY(' + (y * -0.04).toFixed(1) + 'px)';
        }
        heroGlows.forEach(function (g) {
            g.style.transform = 'translateY(' + (y * -0.03).toFixed(1) + 'px)';
        });
        paraEls.forEach(function (el) {
            var speed = parseFloat(el.getAttribute('data-parallax')) || 0.05;
            var center = el._baseTop + el.offsetHeight / 2;
            var offset = (center - (y + vh / 2)) * speed;
            el.style.transform = 'translateY(' + (-offset).toFixed(1) + 'px)';
        });
    }

    function resetParallax() {
        if (heroImg) heroImg.style.transform = '';
        heroGlows.forEach(function (g) { g.style.transform = ''; });
        paraEls.forEach(function (el) { el.style.transform = ''; });
    }

    window.addEventListener('scroll', function () {
        if (!ticking) {
            ticking = true;
            requestAnimationFrame(tick);
        }
    }, { passive: true });

    var resizeTimer;
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
            parallaxOn = !reduceMotion && !isMobile();
            if (parallaxOn) {
                measure();
                tick();
            } else {
                resetParallax();
            }
        }, 150);
    });

    tick(); /* 初始同步一次 */

    /* ============ 3. 管理面板页签画廊 ============ */
    var gallery = document.getElementById('panelGallery');
    if (!gallery) return;

    var tabs = Array.prototype.slice.call(gallery.querySelectorAll('.gallery-tab'));
    var stages = tabs.map(function (tab) {
        return document.getElementById(tab.getAttribute('aria-controls'));
    });

    function select(idx, moveFocus) {
        tabs.forEach(function (tab, i) {
            var on = i === idx;
            tab.setAttribute('aria-selected', on ? 'true' : 'false');
            tab.tabIndex = on ? 0 : -1; /* roving tabindex:整组只留一个可 Tab 停靠 */
            if (stages[i]) stages[i].hidden = !on;
        });
        if (moveFocus) tabs[idx].focus();
    }

    tabs.forEach(function (tab, i) {
        tab.addEventListener('click', function () { select(i, false); });

        tab.addEventListener('keydown', function (e) {
            var next = null;
            if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
            else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
            else if (e.key === 'Home') next = 0;
            else if (e.key === 'End') next = tabs.length - 1;
            if (next !== null) {
                e.preventDefault();
                select(next, true);
            }
        });
    });

    select(0, false); /* 与 HTML 的初始 aria-selected 对齐 */
})();
