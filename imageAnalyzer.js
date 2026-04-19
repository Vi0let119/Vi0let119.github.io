
if (typeof echarts === 'undefined') {
    console.error('ECharts 未加载，请检查网络或 CDN 链接');
}

/* K-means 颜色聚类算法类 */
class KMeansColor {
    constructor(maxIterations = 10) {
        this.maxIterations = maxIterations;
    }

    distance(point1, point2) {
        let dist = 0;
        for (let i = 0; i < point1.length; i++) {
            dist += Math.pow(point1[i] - point2[i], 2);
        }
        return Math.sqrt(dist);
    }

    preprocess(pixels, space) {
        const data = [];
        for (let i = 0; i < pixels.length; i += 4) {
            const r = pixels[i];
            const g = pixels[i + 1];
            const b = pixels[i + 2];
            data.push([r, g, b]);
        }
        return data;
    }

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

    cluster(pixels, k, space = 'rgb') {
        console.log(`[算法] 开始 K-means 聚类: K=${k}, 空间=${space}`);
        const data = this.preprocess(pixels, space);
        let centroids = this.initializeCentroids(data, k);
        let labels = new Uint8Array(data.length);

        for (let iter = 0; iter < this.maxIterations; iter++) {
            let converged = true;
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

        // 整理结果
        const clusters = Array.from({ length: k }, () => ({ count: 0, color: [0, 0, 0] }));
        for (let i = 0; i < data.length; i++) {
            const cluster = labels[i];
            clusters[cluster].count++;
            for (let j = 0; j < 3; j++) {
                clusters[cluster].color[j] += data[i][j];
            }
        }
        for (let i = 0; i < k; i++) {
            if (clusters[i].count > 0) {
                for (let j = 0; j < 3; j++) {
                    clusters[i].color[j] = Math.round(clusters[i].color[j] / clusters[i].count);
                }
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

        // 2. 绑定事件
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

        // 3. 初始化 ECharts
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
                // 仅更新 img 标签显示
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

        // 创建一个临时 Canvas 供算法读取像素 (不显示在页面上)
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
        // 保存结果以便切换图表类型时使用
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
                title: { text: '颜色分布 (饼图)', left: 'center' },
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
                title: { text: '颜色分布 (柱状图)', left: 'center' },
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
