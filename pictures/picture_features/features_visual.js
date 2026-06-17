/**
 * 视觉特征星图 — 纯前端（无 API 依赖）
 * 数据来自 umap_data.js，图片使用相对路径
 */

// ============================================================
// 场景颜色映射
// ============================================================
const SCENE_COLORS = {
    '日落/夕阳':      '#e07030', '蓝调时刻':      '#4a7eb5',
    '花卉植物':       '#e05080', '花瓣/花蕊特写':   '#d4607a',
    '高山/山峰':      '#7a9a8a', '海洋/水面':      '#3080b0',
    '森林/树林':      '#3a6a3a', '雪景':          '#c0d0e0',
    '云雾':          '#a0a8b8', '草原/田野':      '#6a9a40',
    '沙漠/戈壁':      '#c09050', '星空/夜空':      '#6070c0',
    '彩虹':          '#e08080', '河流/瀑布':      '#3a80a0',
    '湖泊/倒影':      '#4088a8', '秋叶/红叶':      '#c04020',
    '天空/云彩':      '#6888b0', '水面波纹':       '#3a7098',
    '城市建筑/街道':   '#888890', '人物肖像':       '#c08070',
    '夜景/灯饰':      '#e0b030', '室内空间':       '#b09880',
    '美食/饮品':      '#d09050', '市集/摊位':      '#d08050',
    '桥梁/建筑结构':   '#908070', '街景/道路':      '#787880',
    '铁路/车站':      '#885830', '城市夜景':       '#c0a040',
    '野生动物':       '#907050', '宠物猫狗':       '#b87850',
    '鸟类':          '#6080a0', '昆虫/蝴蝶':      '#c060a0',
    '水生动物':       '#4080a0', '绿叶/植被特写':   '#4a8a3a',
    '食物摆盘近摄':    '#c88050', '静物/摆件':      '#a09080',
    '建筑纹理/细节':   '#988878', '抽象/纹理':      '#888090',
    '黑白摄影':       '#a0a0a0', '长曝光/光轨':     '#e0c030',
    '剪影/逆光':      '#c08030', '微距/特写':      '#b060a0',
    '倒影/对称':      '#6090a0', '极简/留白':      '#c0c0c8',
    '光斑/散景':      '#e8d060', '其他/未分类':     '#606060',
};
function sceneColor(label) {
    if (SCENE_COLORS[label]) return SCENE_COLORS[label];
    let h = 0;
    for (let i = 0; i < label.length; i++) h = ((h << 5) - h) + label.charCodeAt(i);
    return `hsl(${Math.abs(h) % 360}, 45%, 55%)`;
}

// ============================================================
// 数据 & 图片路径
// ============================================================
const IMG_DIR = '../../图库/';
const rawData = typeof UMAP_DATA !== 'undefined' ? UMAP_DATA : [];
// 补充索引
rawData.forEach((d, i) => { d._idx = i; });

// ============================================================
// DOM refs
// ============================================================
function $(s) { return document.querySelector(s); }
const dom = {
    topbarInfo: $('#topbarInfo'),
    chartStage: $('#chartStage'),
    tooltipCard: $('#tooltipCard'),
    tooltipThumb: $('#tooltipThumb'),
    tooltipName: $('#tooltipName'),
    tooltipScene: $('#tooltipScene'),
    tooltipColors: $('#tooltipColors'),
    brushBar: $('#brushBar'),
    brushCount: $('#brushCount'),
    brushViewBtn: $('#brushViewBtn'),
    brushClearBtn: $('#brushClearBtn'),
    galleryPanel: $('#galleryPanel'),
    galleryCount: $('#galleryCount'),
    galleryGrid: $('#galleryGrid'),
    galleryPrev: $('#galleryPrev'),
    galleryNext: $('#galleryNext'),
    galleryPage: $('#galleryPage'),
    galleryClose: $('#galleryClose'),
    lightbox: $('#lightbox'),
    lightboxImg: $('#lightboxImg'),
    lightboxCaption: $('#lightboxCaption'),
    lightboxClose: $('#lightboxClose'),
    lightboxPrev: $('#lightboxPrev'),
    lightboxNext: $('#lightboxNext'),
    legendList: $('#legendList'),
    starMap: $('#starMap'),
};

// ============================================================
// State
// ============================================================
let chart = null;
let hoveredIdx = -1;
let selectedIndices = [];
let lightboxIdx = -1;
let lightboxList = [];
let galleryPageNum = 1;
const PAGE_SIZE = 24;

// ============================================================
// Init
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    // 初始化侧边栏
    if (typeof initSidebar === 'function') {
        initSidebar('sidebar-container');
    }

    if (!rawData.length) {
        dom.topbarInfo.textContent = '无数据 — 请先运行 python batch_process.py --cli';
        return;
    }
    dom.topbarInfo.textContent = rawData.length + ' frames mapped';
    buildLegend();
    initChart();
    bindEvents();
});

// ============================================================
// Build scene → count for legend
// ============================================================
function buildLegend() {
    const map = new Map();
    rawData.forEach(d => {
        const k = d.sc;
        if (!map.has(k)) map.set(k, 0);
        map.set(k, map.get(k) + 1);
    });
    const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]);

    dom.legendList.innerHTML = sorted.map(([label, cnt]) => {
        const c = sceneColor(label);
        return `<div class="legend-item" data-scene="${label}">
            <span class="legend-dot" style="background:${c};color:${c};"></span>
            <span class="legend-label" title="${label}">${label}</span>
            <span class="legend-count">${cnt}</span>
        </div>`;
    }).join('');

    dom.legendList.querySelectorAll('.legend-item').forEach(item => {
        item.addEventListener('click', () => {
            highlightScene(item.dataset.scene);
        });
    });
}

// ============================================================
// Init ECharts
// ============================================================
function initChart() {
    chart = echarts.init(dom.chartStage, null, { backgroundColor: '#08080b' });

    // 单 series：每点独立颜色，dataIndex 直接映射 rawData
    const allData = rawData.map(d => ({
        value: [d.x, d.y],
        _idx: d._idx,
        _scene: d.sc,
        itemStyle: {
            color: sceneColor(d.sc),
            borderColor: 'rgba(255,255,255,0.05)',
            borderWidth: 0.5,
            shadowBlur: 4,
            shadowColor: sceneColor(d.sc) + '88',
        },
    }));

    chart.setOption({
        tooltip: { show: false },
        toolbox: {
            show: true,
            orient: 'horizontal',
            itemSize: 20,
            itemGap: 14,
            top: 10,
            left: 10,
            iconStyle: {
                borderColor: 'rgba(184,146,78,0.5)',
                borderWidth: 1.5,
            },
            emphasis: {
                iconStyle: {
                    borderColor: '#b8924e',
                    borderWidth: 2,
                    shadowBlur: 10,
                    shadowColor: 'rgba(184,146,78,0.35)',
                },
            },
            feature: {
                brush: {
                    type: ['rect', 'polygon', 'clear'],
                    title: {
                        rect: '矩形框选',
                        polygon: '多边形圈选',
                        clear: '清除选择',
                    },
                },
            },
        },
        brush: {
            brushLink: 'all',
            throttleType: 'debounce',
            throttleDelay: 200,
            outOfBrush: { colorAlpha: 0.12 },
            brushStyle: {
                borderWidth: 2,
                color: 'rgba(184,146,78,0.08)',
                borderColor: 'rgba(184,146,78,0.7)',
            },
        },
        grid: { left: 10, right: 10, top: 50, bottom: 10 },
        xAxis: { type: 'value', show: false, min: 0, max: 1 },
        yAxis: { type: 'value', show: false, min: 0, max: 1 },
        series: [{
            type: 'scatter',
            symbolSize: 7,
            cursor: 'crosshair',
            emphasis: {
                scale: 1.8,
                itemStyle: {
                    shadowBlur: 16,
                    borderWidth: 1.5,
                    borderColor: 'rgba(255,255,255,0.4)',
                },
            },
            data: allData,
        }],
    });

    chart.on('mouseover', onHover);
    chart.on('mouseout', onHoverOut);
    chart.on('mousemove', onMouseMove);
    chart.on('click', onClick);
    chart.on('brushSelected', onBrushSelected);
}

// ============================================================
// Tooltip
// ============================================================
function onHover(params) {
    if (!params.data || params.data._idx === undefined) return;
    hoveredIdx = params.data._idx;
    const d = rawData[hoveredIdx];
    if (!d) return;

    dom.tooltipThumb.src = IMG_DIR + d.fn;
    dom.tooltipThumb.onerror = function() { this.style.display = 'none'; };
    dom.tooltipThumb.style.display = '';
    dom.tooltipName.textContent = d.fn.replace(/\.[^.]+$/, '');
    dom.tooltipScene.textContent = d.sc + ' · ' + (d.cf * 100).toFixed(0) + '%';
    dom.tooltipScene.style.color = sceneColor(d.sc);
    dom.tooltipColors.innerHTML = (d.cl || []).map(c =>
        `<span class="tooltip-swatch" style="background:${c.h}" title="${c.h}"></span>`
    ).join('');
    dom.tooltipCard.style.display = '';
}

function onMouseMove(params) {
    if (dom.tooltipCard.style.display === 'none') return;
    const e = params.event;
    if (!e) return;
    const rect = dom.starMap.getBoundingClientRect();
    let left = (e.offsetX || e.clientX - rect.left) + 16;
    let top = (e.offsetY || e.clientY - rect.top) - 80;
    if (left + 230 > rect.width) left = (e.offsetX || e.clientX - rect.left) - 240;
    if (top < 8) top = 8;
    if (top + 230 > rect.height) top = rect.height - 240;
    dom.tooltipCard.style.left = left + 'px';
    dom.tooltipCard.style.top = top + 'px';
}

function onHoverOut() {
    hoveredIdx = -1;
    dom.tooltipCard.style.display = 'none';
}

// ============================================================
// Click → Lightbox
// ============================================================
function onClick(params) {
    if (!params.data || params.data._idx === undefined) return;
    lightboxList = rawData.map((d, i) => i);
    openLightbox(params.data._idx);
}

function openLightbox(idx) {
    lightboxIdx = idx;
    const d = rawData[idx];
    dom.lightboxImg.src = IMG_DIR + d.fn;
    dom.lightboxCaption.textContent = d.fn + '  ·  ' + d.sc + '  ·  ' + (d.cf * 100).toFixed(0) + '%';
    // 圈选多张浏览时显示进度
    if (lightboxList.length > 1) {
        const pos = lightboxList.indexOf(idx);
        dom.lightboxCaption.textContent += '  ·  ' + (pos + 1) + ' / ' + lightboxList.length;
    }
    dom.lightbox.style.display = 'flex';
    updateLightboxNav();
}

function closeLightbox() {
    dom.lightbox.style.display = 'none';
    lightboxIdx = -1;
}

function navLightbox(dir) {
    const next = lightboxIdx + dir;
    if (next >= 0 && next < lightboxList.length) openLightbox(next);
}

function updateLightboxNav() {
    dom.lightboxPrev.style.display = lightboxIdx > 0 ? '' : 'none';
    dom.lightboxNext.style.display = lightboxIdx < lightboxList.length - 1 ? '' : 'none';
}

// ============================================================
// Brush Selection
// ============================================================
function onBrushSelected(params) {
    if (!params.batch || !params.batch.length) {
        clearSelection();
        return;
    }

    const idxSet = new Set();
    params.batch.forEach(b => {
        if (b.selected && b.selected.length) {
            b.selected.forEach(item => {
                // dataIndex 是数组（同一 series 内的所有选中索引）
                const indices = Array.isArray(item.dataIndex) ? item.dataIndex : [item.dataIndex];
                indices.forEach(di => {
                    if (di >= 0 && di < rawData.length) {
                        idxSet.add(rawData[di]._idx);
                    }
                });
            });
        }
    });

    selectedIndices = [...idxSet];
    if (!selectedIndices.length) {
        clearSelection();
        return;
    }

    // 自动弹出大图浏览
    lightboxList = [...selectedIndices];
    openLightbox(selectedIndices[0]);

    dom.brushCount.textContent = selectedIndices.length + ' 张已选中';
    dom.brushBar.style.display = 'flex';
}

function clearSelection() {
    selectedIndices = [];
    dom.brushBar.style.display = 'none';
    dom.galleryPanel.style.display = 'none';
}

// ============================================================
// Gallery (selected images, paginated)
// ============================================================
function openGallery() {
    if (!selectedIndices.length) return;
    galleryPageNum = 1;
    dom.galleryPanel.style.display = 'flex';
    renderGallery();
}

function closeGallery() {
    dom.galleryPanel.style.display = 'none';
    chart.dispatchAction({ type: 'brush', areas: [] });
    selectedIndices = [];
    dom.brushBar.style.display = 'none';
}

function renderGallery() {
    const total = selectedIndices.length;
    const totalPages = Math.ceil(total / PAGE_SIZE);
    const start = (galleryPageNum - 1) * PAGE_SIZE;
    const page = selectedIndices.slice(start, start + PAGE_SIZE);

    dom.galleryCount.textContent = total;
    dom.galleryPage.textContent = galleryPageNum + ' / ' + totalPages;
    dom.galleryPrev.disabled = galleryPageNum <= 1;
    dom.galleryNext.disabled = galleryPageNum >= totalPages;

    dom.galleryGrid.innerHTML = page.map(idx => {
        const d = rawData[idx];
        const c = sceneColor(d.sc);
        return `<div class="gallery-item" data-idx="${idx}" style="border:1px solid ${c}22;">
            <img src="${IMG_DIR + d.fn}" loading="lazy"
                 onerror="this.style.display='none';this.parentElement.style.background='${c}11';">
            <div class="gallery-item-label" style="border-top:1px solid ${c}33;">
                ${d.fn.replace(/\.[^.]+$/, '')}
            </div>
        </div>`;
    }).join('');

    dom.galleryGrid.querySelectorAll('.gallery-item').forEach(el => {
        el.addEventListener('click', () => {
            lightboxList = selectedIndices;
            openLightbox(parseInt(el.dataset.idx));
        });
    });
}

// ============================================================
// Legend highlight
// ============================================================
function highlightScene(scene) {
    const updated = rawData.map(d => {
        const match = d.sc === scene;
        return {
            value: [d.x, d.y],
            _idx: d._idx,
            _scene: d.sc,
            itemStyle: {
                color: sceneColor(d.sc),
                borderColor: 'rgba(255,255,255,0.05)',
                borderWidth: 0.5,
                shadowBlur: match ? 10 : 1,
                shadowColor: sceneColor(d.sc) + (match ? 'cc' : '22'),
                opacity: match ? 1 : 0.12,
            },
        };
    });
    // 将匹配点排序到数组末尾，确保它们渲染在最上层
    const matchPoints = updated.filter(d => d._scene === scene);
    const otherPoints = updated.filter(d => d._scene !== scene);
    chart.setOption({ series: [{ data: [...otherPoints, ...matchPoints] }] });

    setTimeout(() => {
        const restored = rawData.map(d => ({
            value: [d.x, d.y],
            _idx: d._idx,
            _scene: d.sc,
            itemStyle: {
                color: sceneColor(d.sc),
                borderColor: 'rgba(255,255,255,0.05)',
                borderWidth: 0.5,
                shadowBlur: 4,
                shadowColor: sceneColor(d.sc) + '88',
                opacity: 1,
            },
        }));
        chart.setOption({ series: [{ data: restored }] });
    }, 2500);
}

// ============================================================
// Keyboard & window
// ============================================================
function bindEvents() {
    dom.brushViewBtn.addEventListener('click', openGallery);
    dom.brushClearBtn.addEventListener('click', closeGallery);
    dom.galleryClose.addEventListener('click', closeGallery);
    dom.galleryPrev.addEventListener('click', () => {
        if (galleryPageNum > 1) { galleryPageNum--; renderGallery(); }
    });
    dom.galleryNext.addEventListener('click', () => {
        const tp = Math.ceil(selectedIndices.length / PAGE_SIZE);
        if (galleryPageNum < tp) { galleryPageNum++; renderGallery(); }
    });
    dom.lightboxClose.addEventListener('click', closeLightbox);
    dom.lightboxPrev.addEventListener('click', () => navLightbox(-1));
    dom.lightboxNext.addEventListener('click', () => navLightbox(1));
    dom.lightbox.addEventListener('click', e => {
        if (e.target === dom.lightbox) closeLightbox();
    });

    document.addEventListener('keydown', e => {
        if (dom.lightbox.style.display === 'flex') {
            if (e.key === 'Escape') closeLightbox();
            if (e.key === 'ArrowLeft') navLightbox(-1);
            if (e.key === 'ArrowRight') navLightbox(1);
            return;
        }
        if (e.key === 'Escape' && dom.galleryPanel.style.display === 'flex') {
            closeGallery();
        }
    });

    window.addEventListener('resize', () => chart?.resize());
}
