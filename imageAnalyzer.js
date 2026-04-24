if (typeof echarts === 'undefined') {
    console.error('ECharts 未加载，请检查网络或 CDN 链接');
}

/* K-means 颜色聚类算法类 */
class KMeansColor {
    constructor(maxIterations = 10) {
        this.maxIterations = maxIterations;
    }

    // 计算两点间欧式距离
    distance(point1, point2) {
        let dist = 0;
        for (let i = 0; i < point1.length; i++) {
            dist += Math.pow(point1[i] - point2[i], 2);
        }
        return Math.sqrt(dist);
    }

    // RGB转LAB核心转换（标准公式）
    rgbToLab(r, g, b) {
        // RGB归一化到0-1
        let r1 = r / 255;
        let g1 = g / 255;
        let b1 = b / 255;

        // 伽马校正
        r1 = r1 > 0.04045 ? Math.pow((r1 + 0.055) / 1.055, 2.4) : r1 / 12.92;
        g1 = g1 > 0.04045 ? Math.pow((g1 + 0.055) / 1.055, 2.4) : g1 / 12.92;
        b1 = b1 > 0.04045 ? Math.pow((b1 + 0.055) / 1.055, 2.4) : b1 / 12.92;

        // RGB转XYZ
        let x = r1 * 0.4124564 + g1 * 0.3575761 + b1 * 0.1804375;
        let y = r1 * 0.2126729 + g1 * 0.7151522 + b1 * 0.0721750;
        let z = r1 * 0.0193339 + g1 * 0.1191920 + b1 * 0.9503041;

        // XYZ归一化
        x = x / 0.95047;
        y = y / 1.0;
        z = z / 1.08883;

        // XYZ转LAB
        const fx = x > 0.008856 ? Math.pow(x, 1/3) : (7.787 * x) + 16/116;
        const fy = y > 0.008856 ? Math.pow(y, 1/3) : (7.787 * y) + 16/116;
        const fz = z > 0.008856 ? Math.pow(z, 1/3) : (7.787 * z) + 16/116;

        const L = 116 * fy - 16;
        const a = 500 * (fx - fy);
        const bVal = 200 * (fy - fz);

        return [
            Math.round((L / 100) * 255),
            Math.round(((a + 86.185) / 184.444) * 255),
            Math.round(((bVal + 107.863) / 202.345) * 255)
        ];
    }

    // LAB转RGB
    labToRgb(l, a, bVal) {
        // 反归一化
        l = (l / 255) * 100;
        a = (a / 255) * 184.444 - 86.185;
        bVal = (bVal / 255) * 202.345 - 107.863;

        const fy = (l + 16) / 116;
        const fx = a / 500 + fy;
        const fz = fy - bVal / 200;

        let x = Math.pow(fx, 3) > 0.008856 ? Math.pow(fx, 3) : (fx - 16/116) / 7.787;
        let y = l > 7.9996 ? Math.pow(fy, 3) : (l / 903.3);
        let z = Math.pow(fz, 3) > 0.008856 ? Math.pow(fz, 3) : (fz - 16/116) / 7.787;

        x *= 0.95047;
        y *= 1.0;
        z *= 1.08883;

        let r = x * 3.2404542 - y * 1.5371385 - z * 0.4985314;
        let g = -x * 0.9692660 + y * 1.8760108 + z * 0.0415560;
        let b1 = x * 0.0556434 - y * 0.2040259 + z * 1.0572252;

        r = r <= 0.0031308 ? r * 12.92 : 1.055 * Math.pow(r, 1/2.4) - 0.055;
        g = g <= 0.0031308 ? g * 12.92 : 1.055 * Math.pow(g, 1/2.4) - 0.055;
        b1 = b1 <= 0.0031308 ? b1 * 12.92 : 1.055 * Math.pow(b1, 1/2.4) - 0.055;

        return [
            Math.max(0, Math.min(255, Math.round(r * 255))),
            Math.max(0, Math.min(255, Math.round(g * 255))),
            Math.max(0, Math.min(255, Math.round(b1 * 255)))
        ];
    }

    // 预处理：根据颜色空间转换像素数据
    preprocess(pixels, space) {
        const data = [];
        for (let i = 0; i < pixels.length; i += 4) {
            const r = pixels[i];
            const g = pixels[i + 1];
            const b = pixels[i + 2];
            // 按选择的颜色空间转换
            if (space === 'lab') {
                data.push(this.rgbToLab(r, g, b));
            } else {
                data.push([r, g, b]);
            }
        }
        return data;
    }

    // 初始化质心（随机选择）
    initializeCentroids(data, k) {
        const centroids = [];
        const usedIndices = new Set();
        while (centroids.length < k) {
            const randomIndex = Math.floor(Math.random() * data.length);
            if (!usedIndices.has(randomIndex)) {
                usedIndices.add(randomIndex);
                centroids.push([...data[randomIndex]]);
            }
        }
        return centroids;
    }

    // 核心聚类逻辑
    cluster(pixels, k, space = 'rgb') {
        console.log(`[算法] 开始 K-means 聚类: K=${k}, 空间=${space}`);
        const data = this.preprocess(pixels, space);
        let centroids = this.initializeCentroids(data, k);
        let labels = new Uint8Array(data.length);

        // 迭代聚类
        for (let iter = 0; iter < this.maxIterations; iter++) {
            let converged = true;
            // 分配标签
            for (let i = 0; i < data.length; i++) {
                let minDist = Infinity;
                let clusterIdx = 0;
                for (let j = 0; j < k; j++) {
                    const dist = this.distance(data[i], centroids[j]);
                    if (dist < minDist) {
                        minDist = dist;
                        clusterIdx = j;
                    }
                }
                if (labels[i] !== clusterIdx) {
                    converged = false;
                    labels[i] = clusterIdx;
                }
            }
            if (converged) break;

            // 更新质心
            const counts = new Array(k).fill(0);
            const newCentroids = Array.from({ length: k }, () => [0, 0, 0]);
            for (let i = 0; i < data.length; i++) {
                const cluster = labels[i];
                counts[cluster]++;
                for (let j = 0; j < 3; j++) {
                    newCentroids[cluster][j] += data[i][j];
                }
            }
            for (let i = 0; i < k; i++) {
                if (counts[i] > 0) {
                    for (let j = 0; j < 3; j++) {
                        centroids[i][j] = newCentroids[i][j] / counts[i];
                    }
                }
            }
        }

        // 整理结果（LAB需转回RGB）
        const clusters = Array.from({ length: k }, () => ({ count: 0, color: [0, 0, 0] }));
        for (let i = 0; i < data.length; i++) {
            const cluster = labels[i];
            clusters[cluster].count++;
            for (let j = 0; j < 3; j++) {
                clusters[cluster].color[j] += data[i][j];
            }
        }

        // 计算平均颜色并转换回RGB
        for (let i = 0; i < k; i++) {
            if (clusters[i].count > 0) {
                // 计算平均值
                let avgColor = clusters[i].color.map(c => c / clusters[i].count);
                // LAB空间需转回RGB
                if (space === 'lab') {
                    avgColor = this.labToRgb(...avgColor);
                }
                clusters[i].color = avgColor.map(c => Math.round(c));
            }
        }
        return clusters;
    }
}

/*图片处理器类*/
class ImageProcessor {
    constructor() {
        this.image = null; // 存储原始 Image 对象用于算法
        this.kmeans = new KMeansColor();
        this.myChart = null; // 存储 ECharts 实例
        this.currentChartType = 'pie'; // 默认图表类型
    }

    init() {
        // 获取 DOM 元素
        this.fileInput = document.getElementById('imageInput');
        this.imageElement = document.getElementById('displayImage'); 
        this.startBtn = document.getElementById('startAnalysisBtn');
        this.kSlider = document.getElementById('kValueSlider');
        this.kDisplay = document.getElementById('kValueDisplay');
        this.colorSpaceSelect = document.getElementById('spaceSelect');
        this.chartContainer = document.getElementById('chartContainer');

        // 图表类型切换按钮
        this.chartTypeButtons = document.querySelectorAll('.chart-type-btn');

        // 绑定事件
        if (this.fileInput) {
            this.fileInput.addEventListener('change', (e) => this.handleImageUpload(e));
        }
        if (this.kSlider) {
            this.kSlider.addEventListener('input', (e) => {
                this.kDisplay.textContent = e.target.value;
            });
        }
        if (this.startBtn) {
            this.startBtn.addEventListener('click', () => this.performAnalysis());
        }
        
        // 绑定图表类型切换
        this.chartTypeButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.chartTypeButtons.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentChartType = e.target.dataset.type;
                // 如果已有数据，重新渲染
                if (this.lastClusters) {
                    this.renderChart(this.lastClusters);
                }
            });
        });

        // 初始化 ECharts
        if (this.chartContainer) {
            this.myChart = echarts.init(this.chartContainer);
        }
    }

    handleImageUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            this.image = new Image();
            this.image.onload = () => {
                this.imageElement.src = this.image.src;
                console.log("图片预览已更新");
            };
            this.image.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    performAnalysis() {
        if (!this.image) {
            alert("请先上传图片！");
            return;
        }

        const k = parseInt(this.kSlider.value);
        const space = this.colorSpaceSelect.value;

        const tempCanvas = document.createElement('canvas');
        const ctx = tempCanvas.getContext('2d');
        tempCanvas.width = this.image.width;
        tempCanvas.height = this.image.height;
        ctx.drawImage(this.image, 0, 0);

        let imageData;
        try {
            imageData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        } catch (e) {
            console.error("无法获取图片像素数据", e);
            alert("图片分析失败");
            return;
        }

        const clusters = this.kmeans.cluster(imageData.data, k, space);
        this.lastClusters = clusters; 
        this.renderChart(clusters);
    }

    renderChart(clusters) {
        if (!this.myChart) return;

        // 准备 ECharts 数据
        const colorData = clusters.map((cluster, index) => {
            const [r, g, b] = cluster.color;
            const colorHex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
            return {
                name: `颜色 ${index + 1}`,
                value: cluster.count,
                itemStyle: { color: colorHex }
            };
        });

        let option;
        if (this.currentChartType === 'pie') {
            option = {
                title: { text: `颜色分布 (饼图 / ${this.colorSpaceSelect.value.toUpperCase()})`, left: 'center' },
                tooltip: { trigger: 'item' },
                legend: { orient: 'vertical', left: 'left' },
                series: [{
                    name: '颜色',
                    type: 'pie',
                    radius: '60%',
                    data: colorData,
                    emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.5)' } }
                }]
            };
        } else {
            option = {
                title: { text: `颜色分布 (柱状图 / ${this.colorSpaceSelect.value.toUpperCase()})`, left: 'center' },
                tooltip: {},
                xAxis: { type: 'category', data: colorData.map(d => d.name) },
                yAxis: { type: 'value' },
                series: [{
                    name: '像素数量',
                    type: 'bar',
                    data: colorData.map(d => d.value),
                    itemStyle: { 
                        color: (params) => colorData[params.dataIndex].itemStyle.color 
                    }
                }]
            };
        }

        this.myChart.setOption(option);
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    const processor = new ImageProcessor();
    processor.init();
});