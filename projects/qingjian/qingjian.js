/**
 * qingjian.js — 轻笺产品简介页交互
 * 1. 滚动 reveal(IntersectionObserver,只触发一次)
 * 2. Hero / 区块视差(rAF + scroll,≤767px 与 reduced-motion 禁用)
 * 3. deck 多图滑动组件(箭头 / 键盘 / 拖拽 / 圆点)
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
    var heroImg = document.querySelector('.hero-img');
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

    /* ============ 3. deck 多图滑动组件 ============ */
    var deck = document.getElementById('themeDeck');
    if (!deck) return;

    var slides = Array.prototype.slice.call(deck.querySelectorAll('.deck-slide'));
    var prevBtn = deck.querySelector('.deck-arrow--prev');
    var nextBtn = deck.querySelector('.deck-arrow--next');
    var dots = Array.prototype.slice.call(deck.querySelectorAll('.deck-dot'));
    var cur = 0; /* 两端夹紧,不循环 */

    /* 单变量 cur + 纯函数 layout:一次重排即"滑动" */
    function layout() {
        slides.forEach(function (el, i) {
            var rel = i - cur;
            var a = Math.abs(rel);
            var t = 'translate(-50%, -50%)';
            var s = 1;
            var o = 1;

            if (rel < 0) {
                /* 已浏览:后撤上浮,缩小淡出 */
                t = 'translate(-50%, calc(-50% - ' + (a * 14) + 'px))';
                s = 0.96 - a * 0.03;
                o = a > 2 ? 0 : 0.4;
                el.style.zIndex = 10 - a;
            } else if (rel > 0) {
                /* 待浏览:下方错位露出,渐隐 */
                t = 'translate(-50%, calc(-50% + ' + (rel * 10) + 'px))';
                s = 1 - rel * 0.025;
                o = rel > 2 ? 0 : 1 - rel * 0.2;
                el.style.zIndex = 20 - rel;
            } else {
                el.style.zIndex = 20;
            }

            el.style.transform = t + ' scale(' + s + ')';
            el.style.opacity = o;
            el.style.filter = rel === 0 ? 'none' : 'saturate(0.85)';
        });

        prevBtn.classList.toggle('is-disabled', cur === 0);
        nextBtn.classList.toggle('is-disabled', cur === slides.length - 1);
        dots.forEach(function (d, i) {
            d.setAttribute('aria-current', i === cur ? 'true' : 'false');
        });
    }

    function go(n) {
        cur = Math.max(0, Math.min(slides.length - 1, n));
        layout();
    }

    prevBtn.addEventListener('click', function () { go(cur - 1); });
    nextBtn.addEventListener('click', function () { go(cur + 1); });
    dots.forEach(function (d, i) {
        d.addEventListener('click', function () { go(i); });
    });

    /* 键盘:← → 切换 */
    deck.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowLeft') {
            go(cur - 1);
            e.preventDefault();
        } else if (e.key === 'ArrowRight') {
            go(cur + 1);
            e.preventDefault();
        }
    });

    /* 拖拽:左拖 = 下一张 */
    var dragging = false;
    var startX = 0;
    var dx = 0;
    var activeSlide = null;

    deck.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        if (e.target.closest('.deck-arrow') || e.target.closest('.deck-dot')) return;
        dragging = true;
        startX = e.clientX;
        dx = 0;
        activeSlide = slides[cur];
        activeSlide.classList.add('is-dragging');
        try { deck.setPointerCapture(e.pointerId); } catch (err) { /* 忽略不支持的环境 */ }
    });

    deck.addEventListener('pointermove', function (e) {
        if (!dragging || !activeSlide) return;
        dx = e.clientX - startX;
        activeSlide.style.transform =
            'translate(-50%, -50%) scale(1) translateX(' + dx + 'px) rotate(' +
            (dx * 0.04).toFixed(1) + 'deg)';
    });

    function endDrag() {
        if (!dragging) return;
        dragging = false;

        if (activeSlide) {
            activeSlide.classList.remove('is-dragging');
            activeSlide = null;
        }

        if (Math.abs(dx) > 60) {
            if (dx < 0 && cur < slides.length - 1) go(cur + 1);
            else if (dx > 0 && cur > 0) go(cur - 1);
            else layout(); /* 边界:回弹 */
        } else {
            layout(); /* 未过阈值:回弹 */
        }
        dx = 0;
    }

    deck.addEventListener('pointerup', endDrag);
    deck.addEventListener('pointercancel', endDrag);

    layout();
})();
