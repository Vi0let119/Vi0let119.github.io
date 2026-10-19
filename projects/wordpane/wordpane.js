/**
 * wordpane.js — 写作提词器产品简介页交互
 * 与 projects/qingjian/qingjian.js 同一套交互骨架(裁剪版):
 * 1. 滚动 reveal(IntersectionObserver,只触发一次)
 * 2. Hero / 区块视差(rAF + scroll,≤767px 与 reduced-motion 禁用)
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
            heroImg.style.transform = 'translateY(' + (y * -0.06).toFixed(1) + 'px)';
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
})();
