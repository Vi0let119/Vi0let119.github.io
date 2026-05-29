/* ============================================
   picture_index.js — Gallery Logic
   ============================================ */

(function () {
    'use strict';

    const thumbnailGrid = document.getElementById('thumbnailGrid');
    const mainImage = document.getElementById('mainImage');
    const mainImageWrap = document.getElementById('mainImageWrap');
    const mainPlaceholder = document.getElementById('mainPlaceholder');
    const imageCaption = document.getElementById('imageCaption');
    const captionFilename = document.getElementById('captionFilename');
    const captionDate = document.getElementById('captionDate');
    const imageCountEl = document.getElementById('imageCount');
    const scrollIndicator = document.getElementById('scrollIndicator');
    const gallerySection = document.getElementById('gallery');

    let images = [];
    let activeThumb = null;
    let thumbItems = [];
    let observer = null;
    let loadedCount = 0;

    scrollIndicator.addEventListener('click', () => {
        gallerySection.scrollIntoView({ behavior: 'smooth' });
    });

    // --- Fetch & build ---
    fetch('./picture_info.json')
        .then(res => res.ok ? res.json() : Promise.reject('Failed to load'))
        .then(data => {
            images = data.images || [];
            imageCountEl.textContent = images.length + ' frames';
            buildThumbnails(images);
            startLazyLoad();
        })
        .catch(err => {
            console.error('Could not load image data:', err);
            thumbnailGrid.innerHTML =
                '<p style="color:var(--text-muted);padding:2rem;font-family:var(--font-ui);font-size:0.7rem;text-align:center;">'
                + 'Failed to load archive.</p>';
        });

    // --- Build DOM, only data-src, no src ---
    function buildThumbnails(imageList) {
        const fragment = document.createDocumentFragment();
        thumbItems = [];

        imageList.forEach((img, index) => {
            const item = document.createElement('div');
            item.className = 'thumb-item loading';
            item.setAttribute('data-index', index);
            item.title = img.filename;

            const thumb = document.createElement('img');
            thumb.setAttribute('data-src', img.path);
            thumb.alt = img.filename;
            thumb.setAttribute('decoding', 'async');

            item.appendChild(thumb);
            item.addEventListener('click', () => selectImage(index, item));
            fragment.appendChild(item);
            thumbItems.push({ el: item, imgEl: thumb, index, loaded: false });
        });

        thumbnailGrid.appendChild(fragment);
    }

    // --- Lazy load via IntersectionObserver (viewport root) ---
    function startLazyLoad() {
        // IntersectionObserver with NO root option defaults to the viewport.
        // This is the most reliable config — it accounts for ALL ancestor
        // overflow clipping, so only genuinely visible elements fire.
        observer = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;

                const item = thumbItems.find(t => t.el === entry.target);
                if (!item || item.loaded) continue;

                loadThumb(item);
            }
        }, {
            // No explicit root — use viewport
            rootMargin: '80px',   // preload ~1 row ahead
            threshold: 0
        });

        for (const item of thumbItems) {
            observer.observe(item.el);
        }
    }

    function loadThumb(item) {
        if (item.loaded) return;
        const src = item.imgEl.getAttribute('data-src');
        if (!src) return;

        item.imgEl.src = src;
        item.loaded = true;
        loadedCount++;

        item.imgEl.addEventListener('load', () => {
            item.el.classList.remove('loading');
        }, { once: true });
        item.imgEl.addEventListener('error', () => {
            item.el.classList.remove('loading');
        }, { once: true });

        // Stop watching this one
        observer.unobserve(item.el);
    }

    // --- Select & display image ---
    function selectImage(index, thumbEl) {
        if (activeThumb === thumbEl) return;

        if (activeThumb) activeThumb.classList.remove('active');
        thumbEl.classList.add('active');
        activeThumb = thumbEl;

        const img = images[index];
        if (!img) return;

        mainPlaceholder.style.display = 'none';
        mainImageWrap.style.display = 'flex';
        imageCaption.style.display = 'flex';

        mainImage.src = img.path;
        mainImage.alt = img.filename;
        mainImage.style.animation = 'none';
        void mainImage.offsetWidth;
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
