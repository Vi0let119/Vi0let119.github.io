---
name: chart-generator
description: Use when generating D3/ECharts-based charts — producing chart configurations, chart HTML files, or embedding charts in pages. Covers chart type selection, ECharts option patterns, D3 patterns, styling/theming, data mapping, and output templates. Use whenever the user asks to create, modify, or style a chart with D3 or ECharts.
---

# Chart Generator

## Overview

Guide for generating production-quality charts using **ECharts** (primary) and **D3.js** (secondary, for custom/unusual chart types). This skill ensures chart output is visually refined, correctly mapped from data, and follows the project's 简约风 (minimalist) design language.

## When to Use

- Generating chart HTML files (standalone or embedded)
- Creating ECharts `option` configurations from user data
- Choosing the right chart type based on data characteristics
- Styling charts to match the minimalist aesthetic
- Converting user requirements into chart specifications
- Any task involving "生成图表", "画个图", "chart", "ECharts", "D3"

## Chart Type Selection

| Data Pattern | Recommended Chart | ECharts Series Type |
|-------------|-------------------|---------------------|
| Comparing categories | 柱状图 (Bar) | `bar` |
| Showing trend over time/sequence | 折线图 (Line) | `line` |
| Showing proportions of a whole | 饼图 (Pie) | `pie` |
| Showing relationship between two numeric variables | 散点图 (Scatter) | `scatter` |
| Showing relationship + linear trend (regression) | 散点图+拟合线 (Scatter Fit) | `scatter` + `line` overlay |
| Comparing parts of a whole across categories | 堆叠柱状图 (Stacked Bar) | `bar` + `stack` |
| Distribution of a single variable | 直方图 (Histogram) | `bar` (binned) |
| Multiple series comparison | 多系列折线/柱状 | `line`/`bar` with multiple series |

**Decision rules:**
- X is categorical + Y is numeric → Bar or Line (Bar if <12 items, Line if sequential)
- X is numeric + Y is numeric → Scatter (with optional linear fit line, showing regression equation + R²)
- Single series of labeled values, showing proportions → Pie (only if ≤8 items)
- Time-series X → Line (preferred over Bar)

## ECharts Option Template (简约风)

### Minimalist Bar Chart

```javascript
const option = {
  title: {
    text: '图表标题',
    subtext: '',
    left: 'center',
    top: 20,
    textStyle: {
      fontSize: 18,
      fontWeight: 500,
      color: '#2c2c2c',
      fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif'
    },
    subtextStyle: { color: '#999', fontSize: 13 }
  },
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderColor: '#e8e4e0',
    borderWidth: 1,
    textStyle: { color: '#2c2c2c', fontSize: 13 },
    extraCssText: 'box-shadow: 0 2px 12px rgba(0,0,0,0.06); border-radius: 8px; padding: 12px 16px;'
  },
  grid: {
    left: '3%',
    right: '4%',
    bottom: '3%',
    top: 80,
    containLabel: true
  },
  xAxis: {
    type: 'category',
    data: [],
    axisLine: { lineStyle: { color: '#e8e4e0' } },
    axisTick: { show: false },
    axisLabel: { color: '#666', fontSize: 12 }
  },
  yAxis: {
    type: 'value',
    name: '',
    nameTextStyle: { color: '#999', fontSize: 12 },
    splitLine: { lineStyle: { color: '#f0ede8', type: 'dashed' } },
    axisLabel: { color: '#666', fontSize: 12 }
  },
  series: [{
    type: 'bar',
    data: [],
    itemStyle: {
      color: '#8aa4b0',
      borderRadius: [4, 4, 0, 0]
    },
    emphasis: {
      itemStyle: { color: '#6b8b9a' }
    },
    barWidth: '50%'
  }]
};
```

### Minimalist Line Chart

```javascript
const option = {
  // ... same title/tooltip/grid as bar ...
  xAxis: {
    type: 'category',
    data: [],
    boundaryGap: false,
    axisLine: { lineStyle: { color: '#e8e4e0' } },
    axisTick: { show: false },
    axisLabel: { color: '#666', fontSize: 12 }
  },
  yAxis: {
    type: 'value',
    name: '',
    nameTextStyle: { color: '#999', fontSize: 12 },
    splitLine: { lineStyle: { color: '#f0ede8', type: 'dashed' } },
    axisLabel: { color: '#666', fontSize: 12 }
  },
  series: [{
    type: 'line',
    data: [],
    smooth: true,
    symbol: 'circle',
    symbolSize: 6,
    lineStyle: { color: '#8aa4b0', width: 2 },
    itemStyle: { color: '#8aa4b0' },
    areaStyle: {
      color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: 'rgba(138,164,176,0.25)' },
        { offset: 1, color: 'rgba(138,164,176,0.02)' }
      ])
    }
  }]
};
```

### Minimalist Pie Chart

```javascript
const option = {
  // ... same title/tooltip as bar (tooltip trigger: 'item') ...
  tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
  series: [{
    type: 'pie',
    radius: ['45%', '70%'],
    center: ['50%', '55%'],
    avoidLabelOverlap: true,
    itemStyle: {
      borderRadius: 6,
      borderColor: '#fff',
      borderWidth: 2
    },
    label: {
      show: true,
      position: 'outside',
      formatter: '{b}\n{d}%',
      color: '#666',
      fontSize: 12
    },
    emphasis: {
      label: { fontSize: 16, fontWeight: 'bold' },
      scaleSize: 10
    },
    data: []
  }]
};
```

### Minimalist Scatter Chart

```javascript
const option = {
  // ... same title/tooltip/grid as bar (tooltip trigger: 'item') ...
  xAxis: {
    type: 'value',
    name: '',
    nameTextStyle: { color: '#999', fontSize: 12 },
    splitLine: { lineStyle: { color: '#f0ede8', type: 'dashed' } },
    axisLabel: { color: '#666', fontSize: 12 }
  },
  yAxis: {
    type: 'value',
    name: '',
    nameTextStyle: { color: '#999', fontSize: 12 },
    splitLine: { lineStyle: { color: '#f0ede8', type: 'dashed' } },
    axisLabel: { color: '#666', fontSize: 12 }
  },
  series: [{
    type: 'scatter',
    data: [],
    symbolSize: 10,
    itemStyle: {
      color: '#8aa4b0',
      borderColor: '#fff',
      borderWidth: 1,
      shadowBlur: 4,
      shadowColor: 'rgba(0,0,0,0.1)'
    },
    emphasis: {
      scale: 1.3,
      itemStyle: { color: '#6b8b9a' }
    }
  }]
};
```

### Minimalist Scatter + Fit Line (散点图+拟合线)

When both X and Y are numeric and the user wants to see the linear trend, overlay a regression line on the scatter plot. Always include the regression equation and R² in the subtitle.

**Linear Regression Formula (Least Squares):**

```
slope     = (n·Σxy − Σx·Σy) / (n·Σx² − (Σx)²)
intercept = (Σy − slope·Σx) / n
R²        = 1 − SS_res / SS_tot
```

**ECharts Implementation — JavaScript:**

```javascript
// 1. Compute linear regression
function linearRegression(points) {
  const n = points.length;
  if (n < 2) return null;

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    const x = points[i][0], y = points[i][1];
    if (isNaN(x) || isNaN(y)) continue;
    sumX += x; sumY += y; sumXY += x * y; sumX2 += x * x;
  }

  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) return null;

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  const meanY = sumY / n;
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) {
    const x = points[i][0], y = points[i][1];
    if (isNaN(x) || isNaN(y)) continue;
    const yPred = slope * x + intercept;
    ssRes += (y - yPred) ** 2;
    ssTot += (y - meanY) ** 2;
  }
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
  return { slope, intercept, r2 };
}

// 2. ECharts option with dual series (scatter + line)
const data = [[1, 2.1], [2, 4.0], [3, 5.9], [4, 8.2], [5, 10.1]];
const reg = linearRegression(data);
const xMin = Math.min(...data.map(d => d[0]));
const xMax = Math.max(...data.map(d => d[0]));

const option = {
  title: {
    text: '散点图 + 拟合线',
    subtext: reg
      ? `拟合线: y = ${reg.intercept.toFixed(4)} + ${reg.slope.toFixed(4)}x    R² = ${reg.r2.toFixed(4)}`
      : '',
    left: 'center', top: 20,
    textStyle: { fontSize: 17, fontWeight: 500, color: '#2c2c2c',
      fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif' },
    subtextStyle: { color: '#999', fontSize: 11 }
  },
  tooltip: {
    trigger: 'item',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderColor: '#e8e4e0', borderWidth: 1,
    textStyle: { color: '#2c2c2c', fontSize: 13 },
    extraCssText: 'box-shadow: 0 2px 12px rgba(0,0,0,0.06); border-radius: 8px;',
    formatter: (params) => {
      if (params.seriesName === '拟合线') return '拟合线';
      const [x, y] = params.data;
      if (reg) {
        const yPred = reg.slope * x + reg.intercept;
        return `${x}, ${y}<br>拟合值: ${yPred.toFixed(4)}`;
      }
      return `${x}, ${y}`;
    }
  },
  legend: {
    data: ['数据点', '拟合线'], bottom: 10,
    textStyle: { color: '#666', fontSize: 12 }
  },
  grid: { left: '3%', right: '4%', bottom: '12%', top: 85, containLabel: true },
  xAxis: {
    type: 'value', name: 'X 轴',
    nameTextStyle: { color: '#999', fontSize: 12 },
    splitLine: { lineStyle: { color: '#f0ede8', type: 'dashed' } },
    axisLabel: { color: '#666', fontSize: 12 }
  },
  yAxis: {
    type: 'value', name: 'Y 轴',
    nameTextStyle: { color: '#999', fontSize: 12 },
    splitLine: { lineStyle: { color: '#f0ede8', type: 'dashed' } },
    axisLabel: { color: '#666', fontSize: 12 }
  },
  series: [
    {
      type: 'scatter', name: '数据点',
      data: data,
      symbolSize: 12,
      itemStyle: {
        color: '#8aa4b0', borderColor: '#fff',
        borderWidth: 2, shadowBlur: 6,
        shadowColor: 'rgba(0,0,0,0.08)'
      },
      emphasis: { scale: 1.4, itemStyle: { color: '#6b8b9a' } },
      z: 2
    },
    {
      type: 'line', name: '拟合线',
      data: reg
        ? [[xMin, reg.slope * xMin + reg.intercept], [xMax, reg.slope * xMax + reg.intercept]]
        : [],
      symbol: 'none',
      lineStyle: { color: '#c4a882', width: 2, type: 'dashed' },
      z: 1
    }
  ]
};
```

**Key design decisions for scatter + fit line:**
1. **Fit line color**: Use `#c4a882` (sand) — warm and distinct from the `#8aa4b0` scatter points
2. **Fit line style**: Dashed (`type: 'dashed'`) to distinguish from a regular data line
3. **Legend**: Always include "数据点" and "拟合线" so users can toggle visibility
4. **R² threshold**: If R² < 0.3, consider noting "弱相关" in the subtitle or tooltip
5. **Z-order**: Data points (`z: 2`) always above the fit line (`z: 1`)
6. **Non-numeric X fallback**: If X values are categorical (text), show a warning — linear regression requires numeric X

**Python implementation (for backend use):**

```python
def linear_regression(points: list) -> dict | None:
    """points: [(x1, y1), (x2, y2), ...]"""
    n = len(points)
    if n < 2:
        return None
    
    xs, ys = zip(*points)
    sum_x = sum(xs)
    sum_y = sum(ys)
    sum_xy = sum(x * y for x, y in points)
    sum_x2 = sum(x * x for x in xs)
    
    denom = n * sum_x2 - sum_x * sum_x
    if denom == 0:
        return None
    
    slope = (n * sum_xy - sum_x * sum_y) / denom
    intercept = (sum_y - slope * sum_x) / n
    
    mean_y = sum_y / n
    ss_res = sum((y - (slope * x + intercept)) ** 2 for x, y in points)
    ss_tot = sum((y - mean_y) ** 2 for x, y in points)
    r2 = 1 - ss_res / ss_tot if ss_tot != 0 else 1
    
    return {'slope': slope, 'intercept': intercept, 'r2': r2}
```

## 简约风 Color Palette

**Primary (single series):** `#8aa4b0` (muted slate blue)

**Multi-series palette (max 8):**
```javascript
const MINIMAL_PALETTE = [
  '#8aa4b0',  // muted slate
  '#b8a9a0',  // warm taupe
  '#9bb5a0',  // sage green
  '#c4a882',  // sand
  '#8b9a9e',  // steel gray
  '#b0a098',  // dove gray
  '#a0b0a8',  // mist green
  '#c8b8a8'   // wheat
];
```

## D3 Usage Notes

Use D3 **only when**:
- The chart type is NOT supported by ECharts (sankey, chord, force-directed graph, custom glyphs)
- Fine-grained control over animation/transition is required
- The chart needs custom SVG shapes or interactions ECharts can't provide

When using D3:
- Always include `d3.v3.min.js` (already in project) or CDN-link D3 v7
- Wrap in an SVG with proper viewBox
- Follow the same minimalist color palette
- Use `transition().duration(600).ease(d3.easeCubicInOut)` for smooth animations

## HTML Output Template

For standalone chart HTML files (what users download):

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><!--CHART_TITLE--></title>
  <script src="https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js"><\/script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      display: flex; justify-content: center; align-items: center;
      min-height: 100vh; background: #fafaf8;
      font-family: "PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", sans-serif;
    }
    .chart-wrapper {
      width: 900px; max-width: 95vw; height: 550px;
      background: #fff; border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 8px 32px rgba(0,0,0,0.04);
      padding: 24px;
    }
    #chart { width: 100%; height: 100%; }
  </style>
</head>
<body>
  <div class="chart-wrapper">
    <div id="chart"></div>
  </div>
  <script>
    var chart = echarts.init(document.getElementById('chart'));
    chart.setOption(/*ECHARTS_OPTION*/);
    window.addEventListener('resize', function() { chart.resize(); });
  <\/script>
</body>
</html>
```

## Common Mistakes to Avoid

| Mistake | Fix |
|---------|-----|
| Using generic purple/blue colors | Use the MINIMAL_PALETTE defined above |
| Forgetting `containLabel: true` in grid | Always include — prevents label clipping |
| Pie chart with >8 slices | Recommend grouping small slices into "其他" |
| `barWidth` too wide/narrow | Use percentage (`'50%'`) not fixed px |
| Tooltip text hard to read | Use white background + shadow, not dark/transparent |
| No `boundaryGap: false` on line charts | Line charts should touch Y-axis for time-series feel |
| Forgetting `chart.resize()` on window resize | Always include for responsive behavior |
| D3 used when ECharts can do it | ECharts preferred — more consistent, less code |

## Integration with AI Chat Version

When the AI (DeepSeek/Qwen/etc.) generates chart responses, it should:
1. Analyze the data structure first
2. Recommend chart type with reasoning
3. Output a complete ECharts `option` as a JSON block
4. Include brief design notes (why this chart type, key visual choices)

The backend `html_builder.py` will inject this option into the HTML template above.
