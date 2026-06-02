/* ============================================
   picture_map.js — ECharts China Map
   Kernel Density Heatmap + Photo Scatter + Lightbox
   ============================================ */

(function () {
    'use strict';

    // ── DOM refs ────────────────────────────────────
    const mapChartEl    = document.getElementById('map-chart');
    const mapLoading    = document.getElementById('mapLoading');
    const mapEmptyHint  = document.getElementById('mapEmptyHint');
    const mapStats      = document.getElementById('mapStats');
    const lightbox      = document.getElementById('lightbox');
    const lightboxImage = document.getElementById('lightboxImage');
    const lightboxFilename = document.getElementById('lightboxFilename');
    const lightboxCoords   = document.getElementById('lightboxCoords');
    const lightboxBackdrop = document.getElementById('lightboxBackdrop');
    const lightboxClose   = document.getElementById('lightboxClose');
    const lightboxPrev    = document.getElementById('lightboxPrev');
    const lightboxNext    = document.getElementById('lightboxNext');

    // ── State ───────────────────────────────────────
    let images      = [];       // full image list from picture_info.json
    let geoImages   = [];       // images WITH GPS coordinates
    let chart       = null;
    let currentIndex   = -1;    // index into geoImages for lightbox (master)
    let sameLocImages  = [];    // subset of geoImages at the same lat/lng
    let locIndex       = -1;    // index into sameLocImages

    // ── Utility ────────────────────────────────────
    function formatCoord(lat, lng) {
        var latDir = lat >= 0 ? 'N' : 'S';
        var lngDir = lng >= 0 ? 'E' : 'W';
        return Math.abs(lat).toFixed(4) + '°' + latDir + ' '
             + Math.abs(lng).toFixed(4) + '°' + lngDir;
    }

    // ── ECharts option builder ─────────────────────
    function buildChartOption(geoImages) {
        var scatterData = geoImages.map(function (img) {
            return {
                name: img.filename,
                value: [img.longitude, img.latitude],
                _img: img,
            };
        });

        var hasData = geoImages.length > 0;

        var option = {
            backgroundColor: '#0b0b0d',

            tooltip: {
                trigger: 'item',
                formatter: function (params) {
                    if (params.data && params.data._img) {
                        var img = params.data._img;
                        var html = '<div style="font-family:\'DM Mono\',monospace;font-size:12px;color:#e4e0d8;">';
                        html += '<p style="margin:0 0 4px;font-weight:500;">' + img.filename + '</p>';
                        if (img.shooting_date) {
                            html += '<p style="margin:0;color:#8a8780;font-size:11px;">' + img.shooting_date + '</p>';
                        }
                        html += '<p style="margin:4px 0 0;color:#4a4742;font-size:10px;">'
                             + formatCoord(img.latitude, img.longitude) + '</p>';
                        html += '</div>';
                        return html;
                    }
                    return '';
                },
            },

            geo: {
                map: 'china',
                roam: true,
                zoom: 1.15,
                center: [104.5, 36],
                scaleLimit: { min: 0.8, max: 12 },
                silent: true,
                itemStyle: {
                    areaColor: '#0e0e12',
                    borderColor: 'rgba(184, 146, 78, 0.10)',
                    borderWidth: 0.5,
                },
                emphasis: {
                    disabled: true,
                },
                label: { show: false },
                regions: [],
            },

            series: [
                // Layer 1: Radiation ripple — effectScatter
                ...(hasData ? [{
                    type: 'effectScatter',
                    coordinateSystem: 'geo',
                    data: scatterData,
                    symbolSize: 8,
                    showEffectOn: 'render',
                    rippleEffect: {
                        brushType: 'stroke',
                        scale: 7,
                        period: 5,
                        color: 'rgba(184, 146, 78, 0.35)',
                    },
                    itemStyle: {
                        color: 'rgba(184, 146, 78, 0.6)',
                    },
                    emphasis: {
                        scale: 2,
                        itemStyle: {
                            color: 'rgba(255, 255, 255, 0.9)',
                        },
                    },
                    zlevel: 1,
                    z: 1,
                }] : []),

                // Layer 2: Photo scatter nodes (clickable)
                {
                    type: 'scatter',
                    coordinateSystem: 'geo',
                    data: scatterData,
                    symbolSize: 7,
                    itemStyle: {
                        color: '#e4e0d8',
                        borderColor: 'rgba(184, 146, 78, 0.6)',
                        borderWidth: 1.2,
                        opacity: 0.9,
                    },
                    emphasis: {
                        scale: 2.5,
                        itemStyle: {
                            color: '#ffffff',
                            borderColor: '#b8924e',
                            borderWidth: 2,
                            shadowColor: 'rgba(184, 146, 78, 0.6)',
                            shadowBlur: 10,
                            opacity: 1,
                        },
                    },
                    zlevel: 2,
                    z: 2,
                    animation: true,
                    animationDuration: 600,
                    animationEasing: 'cubicOut',
                },
            ],
        };

        return option;
    }

    // ── Initialize chart ───────────────────────────
    function initChart() {
        chart = echarts.init(mapChartEl, null, {
            devicePixelRatio: window.devicePixelRatio || 1,
        });

        var option = buildChartOption(geoImages);
        chart.setOption(option);

        // Click on scatter / effectScatter node → open lightbox
        chart.on('click', function (params) {
            // In ECharts 4.x, click params can come from either scatter or effectScatter series.
            // Use _img to identify the image regardless of which series captured the event.
            var data = params.data;
            if (!data || !data._img) return;

            var img = data._img;
            // Use filename-based lookup: ECharts may clone data objects internally,
            // so reference equality (indexOf) is unreliable.
            var idx = -1;
            for (var i = 0; i < geoImages.length; i++) {
                if (geoImages[i].filename === img.filename) {
                    idx = i;
                    break;
                }
            }
            if (idx >= 0) openLightbox(idx);
        });

        // Resize handler
        window.addEventListener('resize', function () {
            chart && chart.resize();
        });
    }

    // ── Lightbox ────────────────────────────────────
    function openLightbox(index) {
        currentIndex = index;
        var anchor = geoImages[index];
        if (!anchor) return;

        // Build subset: all images sharing the exact same lat/lng
        sameLocImages = [];
        for (var i = 0; i < geoImages.length; i++) {
            if (geoImages[i].latitude === anchor.latitude &&
                geoImages[i].longitude === anchor.longitude) {
                sameLocImages.push(geoImages[i]);
                if (i === index) locIndex = sameLocImages.length - 1;
            }
        }

        renderLightbox();
        lightbox.style.display = 'flex';
        document.body.style.overflow = 'hidden';

        var multi = sameLocImages.length > 1;
        lightboxPrev.style.display = multi ? '' : 'none';
        lightboxNext.style.display = multi ? '' : 'none';
    }

    function closeLightbox() {
        lightbox.style.display = 'none';
        document.body.style.overflow = '';
        currentIndex = -1;
        locIndex = -1;
        sameLocImages = [];
    }

    function navigateLightbox(delta) {
        if (sameLocImages.length === 0) return;
        locIndex = (locIndex + delta + sameLocImages.length) % sameLocImages.length;
        // Keep currentIndex in sync (for the geoImages-level reference)
        var img = sameLocImages[locIndex];
        for (var i = 0; i < geoImages.length; i++) {
            if (geoImages[i].filename === img.filename) {
                currentIndex = i;
                break;
            }
        }
        renderLightbox();
    }

    function renderLightbox() {
        const img = sameLocImages[locIndex];
        if (!img) return;

        // Trigger re-animation
        lightboxImage.style.animation = 'none';
        lightboxImage.src = img.path;
        lightboxImage.alt = img.filename;
        void lightboxImage.offsetWidth;
        lightboxImage.style.animation = '';

        lightboxFilename.textContent = img.filename;
        if (sameLocImages.length > 1) {
            lightboxFilename.textContent += '  (' + (locIndex + 1) + '/' + sameLocImages.length + ')';
        }
        lightboxCoords.textContent = formatCoord(img.latitude, img.longitude);
    }

    // Lightbox events
    lightboxClose.addEventListener('click', closeLightbox);
    lightboxBackdrop.addEventListener('click', closeLightbox);
    lightboxPrev.addEventListener('click', function (e) { e.stopPropagation(); navigateLightbox(-1); });
    lightboxNext.addEventListener('click', function (e) { e.stopPropagation(); navigateLightbox(1); });

    document.addEventListener('keydown', function (e) {
        if (currentIndex < 0) return;
        switch (e.key) {
            case 'Escape':    closeLightbox(); break;
            case 'ArrowLeft': navigateLightbox(-1); break;
            case 'ArrowRight':navigateLightbox(1); break;
        }
    });

    // ── Bootstrap ──────────────────────────────────
    async function bootstrap() {
        try {
            // 1. Load image data
            const imgResp = await fetch('./picture_info.json');
            if (!imgResp.ok) throw new Error('Failed to load picture_info.json');
            const imgData = await imgResp.json();
            images = imgData.images || [];
            geoImages = images.filter(img =>
                img.latitude != null && img.longitude != null
            );

            // 2. Load GeoJSON
            const geoResp = await fetch('./china.geojson');
            if (!geoResp.ok) throw new Error('Failed to load GeoJSON');
            const geoJSON = await geoResp.json();

            // 3. Register map
            echarts.registerMap('china', geoJSON);

            // 4. Init chart
            initChart();

            // 5. Update stats
            mapStats.textContent = geoImages.length + ' geotagged / ' + images.length + ' total';

            // 6. Show empty hint if no GPS data
            if (geoImages.length === 0) {
                mapEmptyHint.style.display = 'block';
            }

            // 7. Hide loading
            mapLoading.classList.add('hidden');
            setTimeout(function () {
                mapLoading.style.display = 'none';
            }, 600);

        } catch (err) {
            console.error('Map bootstrap failed:', err);
            mapLoading.classList.add('hidden');
            mapLoading.querySelector('.loading-text').textContent =
                'Failed to load map data. Please refresh.';
            mapLoading.classList.remove('hidden');
        }
    }

    // ── Start ──────────────────────────────────────
    bootstrap();
})();
