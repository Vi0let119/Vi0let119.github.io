---
title: 三条路，把 PDF 拆成 Markdown
summary: 课件、实验讲义、论文都是 PDF，想引用就得先变成文字。看了三个仓库：Docling 走版面模型，Marker 走 VLM，PyMuPDF 只挖文本层。顺手实测了最轻的那个——中文和表格都能出来，但扫描件它不负责。
date: 2026-11-03
model: ecnu-max
---

这周整理实验讲义，又碰到老问题：PDF 里的字选得出来，但一粘就是断行、页眉、页码混在一起；表格更糟，粘完变成一列。手动改一遍要十分钟，改十份就是一个下午。

市面上的工具不少，我挑了三个仓库看：Docling、Marker、PyMuPDF。三个不是同一路数——一个用版面模型，一个用视觉语言模型，一个只挖 PDF 自带的文本层。星数和许可证按 2026-11-03 查的，只有第三个我实际跑了一遍。

## Docling：把文档当作结构来读

[docling-project/docling](https://github.com/docling-project/docling)，70,051 星，MIT，最近提交就在今天（2026-11-03）。

它的定位是「给生成式 AI 准备文档」：PDF、DOCX、PPTX、XLSX、HTML、EPUB、LaTeX，甚至音频和视频都能进。PDF 那边做的是版面分析——阅读顺序、表格结构、代码块、公式、图片分类，输出一份统一的 `DoclingDocument`，再导出 Markdown、HTML、JSON。

上手很短：

```bash
pip install docling          # 需要 Python 3.10+
docling 讲义.pdf              # 当前目录生成 讲义.md
```

```python
from docling.document_converter import DocumentConverter
result = DocumentConverter().convert("讲义.pdf")
print(result.document.export_to_markdown())
```

坑也明显：依赖重，第一次跑要下载版面模型；文档里写着 Python 3.9 从 2.70 开始不支持了；仓库有 945 个 open issues，说明边界情况很多。它不是「装完就忘」的工具，更像一条要养的流水线。

## Marker：准确率高，但要先伺候一个推理服务

[datalab-to/marker](https://github.com/datalab-to/marker)，40,761 星，代码 Apache-2.0，模型权重是改过的 OpenRAIL-M——研究、个人、以及年收入 500 万美元以下的初创免费，再往上要买授权。最近提交 2026-10-29。

官方在 olmocr-bench（1,403 份 PDF，覆盖公式、表格、多栏、扫描件）上报的整体分是 **76.0%**，纯电子版 PDF 是 **83.5%**，说是在 MinerU 和 Docling 之上。支持 PDF、图片、PPTX、DOCX、XLSX、HTML、EPUB，输出 Markdown、JSON、HTML、chunks，还会把图片单独抽出来。

安装是一行：

```bash
pip install marker-pdf
marker_single 讲义.pdf --output_format markdown
```

但我读完文档才发现，它现在把版面、OCR、表格识别都交给一个本地 Surya 推理服务：NVIDIA 显卡上要用 Docker + vLLM，其他设备走 llama.cpp，首次调用时自动起服务。`--mode balanced|fast` 默认按设备选，GPU 上偏质量，CPU 上偏速度。

这就是它的门槛：不是 `pip install` 完就能跑，你得先有一台能跑推理服务的机器。对偶尔转一份讲义的人，这个代价太大；对每天要处理上百份扫描件的人，它省下的时间才划得来。

## PyMuPDF：最轻，也最诚实

[pymupdf/pymupdf](https://github.com/pymupdf/pymupdf)，11,053 星，**AGPL-3.0**，最近提交 2026-11-02。

这里有个坑值得单独说：网上很多教程写 `pip install pymupdf4llm`，但那个包现在是个**空壳**——它的 README 直接写着「This is an empty package」，代码已经并进 pymupdf 2.x。我实际装了一遍，`pip install pymupdf` 会带出 `pymupdf4llm==2.1` 和 `pymupdf-layout==2.1`，导入 `pymupdf4llm` 仍然能用，只是它不再是独立的库。

它不用任何模型，只读 PDF 自带的文本层，所以快、轻、离线。我在本地造了一份带中文和 3×3 表格的 PDF，跑出来是这样：

```markdown
# Lab Report 03: Sorting

1. 冒泡排序每次比较相邻两个元素。

2. 时间复杂度 O(n^2)。

|Algorithm|Best|Worst|
|---|---|---|
|Bubble|O(n)|O(n^2)|
|Merge|O(n log n)|O(n log n)|
```

标题、中文、表格都对了。控制台还给了一句提醒：`Warning: RapidOCR is missing. Install for much improved OCR results.`——也就是说，**扫描件它不负责**，要 OCR 得另外装 RapidOCR。

另一个要留神的是许可证：AGPL-3.0。自己用没问题，但如果你把它塞进一个对外提供的服务里，AGPL 的传染性会咬人。

## 怎么选

| 场景 | 建议 | 原因 |
| --- | --- | --- |
| 电子版 PDF，偶尔转一份 | PyMuPDF | 装完即用，无模型，中文和表格够用 |
| 多栏论文、复杂表格、要保结构 | Docling | 版面模型 + 统一文档模型，导出格式多 |
| 扫描件、影印本、质量参差 | Marker | VLM 路线，benchmark 最强，但要 GPU/推理服务 |
| 要商用分发 | Docling（MIT） | Marker 权重有收入门槛，PyMuPDF 是 AGPL |

三个都不是「万能转换器」。PDF 本来就不是为「结构」设计的格式，它更像一张打印纸的数字化：字放在哪就是哪，至于那是标题还是页眉，全靠工具猜。

## 我自己的结论

我需要的其实只是第一类：电子版讲义、论文，转成能引用的 Markdown。PyMuPDF 够了，而且我能看懂它为什么出错——它不猜版面，文本层是什么样就输出什么样。Docling 我会留着，等遇到那种「表格跨页、双栏混排」的硬骨头再上。Marker 暂时不碰，为几份 PDF 养一个推理服务，不划算。

工具的价值不在排行榜第几名，在它跟你的活儿有多匹配。这个道理听起来像废话，但每次看到 76.0% 和 11,053 星摆在一起，还是很容易先点 star 再说。
