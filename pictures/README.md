# 图片库说明（pictures 目录）

本项目有两套围绕 `图库/` 目录运转的图片数据系统，新增图片后**两套都要更新**：

> **⚠️ 图库目录是一个 Windows 目录联接（junction）**：`图库` → `C:\Users\violet\Pictures\watermark`。
> 实际图片存放在 watermark 文件夹（264 张，带水印版，与网站全部元数据/特征数据吻合）。
> **该目标文件夹不可移动、改名或删除**，否则 `图库` 失效、网站图片全部 404。
> 新增图片直接放进 watermark 文件夹（或 `图库` 路径，效果相同），再跑下方两个脚本即可。
> 如需解除联接恢复实体目录：`rmdir 图库`（只删联接不伤目标），再从 watermark 把文件复制回来。

| 系统 | 脚本位置 | 输出 | 服务的页面 |
|------|---------|------|-----------|
| 图片元数据索引（EXIF） | `.claude/skills/picture-info-sorter/scripts/update_picture_info.py` | `pictures/picture_info.json` | 图片档案馆 `picture_index/`、地图 `picture_map/` |
| 视觉特征 / 星图（CLIP + YOLO + UMAP） | `tools/image_features/batch_process.py` | `tools/image_features/picture_features.json`、`umap_2d.json` → 自动生成 `pictures/picture_features/umap_data.js` | 视觉星图 `picture_features/features_visual.html` |

数据流向：

```
图库/（放新图）
  │
  ├─① update_picture_info.py ──► pictures/picture_info.json（EXIF：拍摄时间、GPS、相机…）
  │
  └─② batch_process.py --cli
        ├─ CLIP/YOLO 特征提取（增量，只处理新图）──► tools/image_features/picture_features.json
        ├─ UMAP 降维（每次全量重算）────────────► tools/image_features/umap_2d.json
        └─ 生成前端数据文件 ──────────────────► pictures/picture_features/umap_data.js
```

---

## 新增图片的标准流程

### 第 0 步：把图片放进图库

把新图片（`.jpg` / `.jpeg`，特征系统还支持 `.png` / `.webp` / `.bmp`）放入项目根目录的 `图库/` 文件夹（实际即 `C:\Users\violet\Pictures\watermark`，见顶部说明）。

注意：**中文或其他非 ASCII 文件名**的图片在索引时会被脚本自动"逐张补查"处理（exiftool 在 Windows 下会弄坏非 ASCII 文件名，脚本已内置兜底），无需手动干预；但如果文件名无法用系统码页（GBK）表示，exiftool 逐文件调用也会失败，这类极端情况需要先把文件改名为 ASCII。

### 第 1 步：更新元数据索引 picture_info.json

```bash
# 在项目根目录执行
python .claude/skills/picture-info-sorter/scripts/update_picture_info.py
```

- 依赖 `图库/exiftool.exe`（已随库提供），缺失会直接报错退出。
- **全量重新生成** `picture_info.json`：读取所有 JPEG 的 EXIF（尺寸、相机、拍摄时间），按 `shooting_date` 升序排序（无拍摄时间的按文件名排在最后），并重新分配 `sort_order`、更新 `image_count` 和 `last_updated`。
- **经纬度会从旧的 `picture_info.json` 按文件名继承**。水印导出流程剥掉了 GPS EXIF，所以文件里已有的 `latitude` / `longitude` 是唯一副本，重建时脚本会保留它们；确实要清空坐标时才加 `--reset-gps`：
  ```bash
  python .claude/skills/picture-info-sorter/scripts/update_picture_info.py --reset-gps
  ```
- 新增图片如果 EXIF 里没有 GPS，坐标为 `null`，地图页会自动跳过（不显示该点）。
- 只处理 `.jpg` / `.jpeg`；不存在的文件自动跳过。
- ⚠️ `pictures/update_picture_info.py` 是一份旧版脚本（PIL 实现、硬编码路径），**会清空经纬度**且不再维护，请勿使用；运行时会直接拒绝执行。

### 第 2 步：特征提取 + UMAP 训练（生成星图数据）

```bat
:: 在项目根目录执行（cmd / PowerShell）
tools\image_features\run.bat --cli
```

⚠️ **不要直接敲 `python tools/image_features/batch_process.py`**：默认 PATH 里的 `python` 是 Anaconda base（3.9），缺少 `flask-cors` / `torch` / `ultralytics`，会报 `ModuleNotFoundError`。`run.bat` 会固定调用装好依赖的 Python 3.12：`C:\Users\violet\AppData\Local\Programs\Python\Python312\python.exe`。

这一步就是星图的"训练"，实际是**增量特征提取 + 全量 UMAP 降维**，不需要训练模型（用的都是预训练模型）：

1. 加载预训练模型：YOLO11x（`yolo11x.pt`，物体检测）+ CLIP ViT-L/14@336px（场景分类 + 768 维嵌入）。
2. **增量处理**：对比 `tools/image_features/last_processed.json` 里记录的文件修改时间，只提取**新增或被修改过**的图片，已有特征直接复用合并。
3. 提取内容：K-means 主色调（5 色）、YOLO 物体检测、CLIP 零样本场景分类（置信度 ≥ 0.30）、CLIP 嵌入向量。
4. **UMAP 每次全量重算**：把所有图片的嵌入向量降维到 2D 并归一化到 [0,1]（`random_state=42`，参数在 `tools/image_features/config.py`）。所以每次加图后，所有点的坐标都会略微变化，这是正常的。
5. 自动把结果写回 `picture_features.json`、`umap_2d.json`，并生成前端文件 `pictures/picture_features/umap_data.js`。

首次运行会下载 CLIP 模型（约 1GB）；默认 `DEVICE = "cuda"`，没有 NVIDIA 显卡时把 `tools/image_features/config.py` 里的 `DEVICE` 改成 `"cpu"`（会慢很多）。

也可以启动带进度条的 API 模式（浏览器打开输出的地址，点开始即可）：

```bat
tools\image_features\run.bat        :: 不加 --cli
# 可视化入口 http://127.0.0.1:5000/visualize（端口 5000-5100 自动找空闲）
```

### 第 3 步：验证前端

- 档案馆 / 地图：打开 `picture_index/picture_index.html`、`picture_map/picture_map.html`，确认新图出现且排序正确。
- 星图：打开 `picture_features/features_visual.html`，顶栏显示的帧数应与图库一致，新图出现在对应场景的聚类区域。

---

## 依赖安装（特征系统首次使用时）

```bash
pip install -r tools/image_features/requirements.txt
# 包含：ultralytics, openai-clip, torch, torchvision, opencv-python,
#       scikit-learn, umap-learn, flask, flask-cors, pillow, numpy
```

---

## 常用维护操作

| 需求 | 操作 |
|------|------|
| 新增/替换图片后正常更新 | 依次跑第 1 步 + 第 2 步 |
| 某几张图重新提取特征 | 删除 `tools/image_features/last_processed.json` 里对应文件名的条目，再跑 `batch_process.py --cli` |
| 全部图片重新提取特征（彻底重训） | 删除 `tools/image_features/last_processed.json` 和 `picture_features.json`，再跑 `batch_process.py --cli` |
| 只重算 UMAP 坐标 | `python tools/image_features/umap_reduce.py`（注意：它只更新 `umap_2d.json`，**不会**重新生成 `umap_data.js`；要让前端生效请直接跑 `batch_process.py --cli`） |
| 扩充场景标签池 | 在 `tools/image_features/config.py` 的 `SCENE_LABELS` 里加英文标签；同时在 `pictures/picture_features/features_visual.js` 的 `SCENE_COLORS` 里给它配个颜色（不配也能显示，会按标签名哈希自动生成颜色） |
| 调整星图聚类形态 | 改 `config.py` 里的 `UMAP_N_NEIGHBORS`（默认 15）、`UMAP_MIN_DIST`（默认 0.1），改完跑 `batch_process.py --cli` |

---

## 注意事项

- 两套系统支持的格式不同：`picture_info.json` 只收 `.jpg/.jpeg`，星图另收 `.png/.webp/.bmp`。加非 JPG 图片时，星图里会有、档案馆里没有，属正常现象。
- `umap_data.js` 只在 `batch_process.py`（CLI 或 API 模式）处理完时自动重新生成；单独跑 `umap_reduce.py` 不会同步前端数据。
- 失败的图片也会被记录进 `last_processed.json`（避免反复重试）；如果某张图之前失败过、修好原图后需按"某几张图重新提取特征"的方式手动重跑。
- 本文件所在目录下的 `picture_index/`（档案馆）、`picture_map/`（地图）、`picture_features/`（星图）都是纯前端页面，直接从 `图库/` 相对路径读图，无需额外构建。
