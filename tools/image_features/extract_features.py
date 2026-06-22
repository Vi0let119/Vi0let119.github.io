"""
图片特征提取核心模块
- 色彩特征：K-means 主色调 + HSV 统计 + 色彩和谐度
- 物体检测：YOLOv8n
- 场景分类：CLIP 零样本（开放式标签池）
- 嵌入向量：CLIP 512 维
"""

import os
import json
import numpy as np
import cv2
from sklearn.cluster import KMeans
from PIL import Image, ImageOps
import config

# ============================================================
# 模型懒加载（全局单例）
# ============================================================
_yolo_model = None
_clip_model = None
_clip_preprocess = None


def get_yolo_model():
    """懒加载 YOLOv8 模型"""
    global _yolo_model
    if _yolo_model is None:
        from ultralytics import YOLO
        print(f"[模型] 加载 YOLOv8n ({config.DEVICE})...")
        _yolo_model = YOLO(config.YOLO_MODEL)
        if config.DEVICE == "cuda":
            _yolo_model.to("cuda")
        print("[模型] YOLOv8n 就绪")
    return _yolo_model


def get_clip_model():
    """懒加载 CLIP 模型"""
    global _clip_model, _clip_preprocess
    if _clip_model is None:
        import clip
        print(f"[模型] 加载 CLIP {config.CLIP_MODEL} ({config.DEVICE})...")
        _clip_model, _clip_preprocess = clip.load(
            config.CLIP_MODEL, device=config.DEVICE
        )
        print("[模型] CLIP 就绪")
    return _clip_model, _clip_preprocess


# ============================================================
# 工具函数
# ============================================================
def _load_image_rgb(path):
    """读取图片并转为 RGB，自动处理 EXIF 旋转"""
    pil_img = Image.open(path)
    pil_img = ImageOps.exif_transpose(pil_img)  # 修正旋转
    if pil_img.mode != "RGB":
        pil_img = pil_img.convert("RGB")

    # 缩放到最大尺寸（加速后续处理）
    w, h = pil_img.size
    if max(w, h) > config.MAX_IMAGE_DIM:
        ratio = config.MAX_IMAGE_DIM / max(w, h)
        pil_img = pil_img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)

    return pil_img


def _pil_to_cv2(pil_img):
    """PIL RGB → OpenCV BGR"""
    arr = np.array(pil_img)
    return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)


def _rgb_to_hex(r, g, b):
    return "#{:02x}{:02x}{:02x}".format(
        int(np.clip(r, 0, 255)),
        int(np.clip(g, 0, 255)),
        int(np.clip(b, 0, 255)),
    )


# ============================================================
# 1. 色彩特征提取
# ============================================================
def extract_colors(pil_img):
    """
    提取主色调、HSV 统计、色彩和谐度
    返回 colors 字典
    """
    # PIL → OpenCV
    cv_img = _pil_to_cv2(pil_img)
    h, w = cv_img.shape[:2]

    # 降采样（提高 K-means 速度）
    max_pixels = 20000
    if h * w > max_pixels:
        scale = np.sqrt(max_pixels / (h * w))
        small = cv2.resize(cv_img, (int(w * scale), int(h * scale)))
    else:
        small = cv_img

    # RGB 像素数组
    rgb_pixels = cv2.cvtColor(small, cv2.COLOR_BGR2RGB).reshape(-1, 3)

    # K-means 聚类
    kmeans = KMeans(n_clusters=config.KMEANS_K, random_state=42, n_init=10)
    labels = kmeans.fit_predict(rgb_pixels)

    # 统计每个聚类的颜色和占比
    clusters = []
    for i in range(config.KMEANS_K):
        mask = labels == i
        count = np.sum(mask)
        pct = round(count / len(labels) * 100, 1)
        color = kmeans.cluster_centers_[i].astype(int)
        clusters.append({
            "count": int(count),
            "percentage": pct,
            "rgb": color.tolist(),
            "hex": _rgb_to_hex(*color),
        })

    # 按占比降序
    clusters.sort(key=lambda c: c["percentage"], reverse=True)
    dominant_colors = [
        {"hex": c["hex"], "rgb": c["rgb"], "percentage": c["percentage"]}
        for c in clusters
    ]

    # HSV 统计
    hsv = cv2.cvtColor(cv_img, cv2.COLOR_BGR2HSV)
    h_channel = hsv[:, :, 0].flatten()
    s_channel = hsv[:, :, 1].flatten() / 255.0
    v_channel = hsv[:, :, 2].flatten() / 255.0

    # 色相峰值（用直方图找）
    hue_hist = cv2.calcHist([hsv], [0], None, [180], [0, 180])
    hue_peak = int(np.argmax(hue_hist))

    saturation_mean = round(float(np.mean(s_channel)), 3)
    brightness_mean = round(float(np.mean(v_channel)), 3)

    # 色温判断（基于平均色相）
    # 暖色：0-60（红/橙/黄）冷色：90-150（绿/青/蓝）紫色：150-180
    # 用加权平均色相，权重为饱和度（有色彩的区域影响更大）
    weights = s_channel * v_channel + 1e-6
    avg_hue = np.average(h_channel.astype(float), weights=weights)
    if avg_hue < 30 or avg_hue > 150:
        temperature = "warm" if avg_hue < 30 else "cool"
    elif 60 < avg_hue < 120:
        temperature = "cool"
    else:
        temperature = "neutral"

    hsv_stats = {
        "hue_peak": hue_peak,
        "saturation_mean": saturation_mean,
        "brightness_mean": brightness_mean,
        "color_temperature": temperature,
    }

    # 色彩和谐度（基于主色调色相分布）
    harmony = _detect_harmony(dominant_colors)

    return {
        "dominant_colors": dominant_colors,
        "hsv_stats": hsv_stats,
        "color_harmony": harmony,
    }


def _detect_harmony(dominant_colors):
    """根据主色调的色相分布判断和谐类型"""
    if len(dominant_colors) < 2:
        return {"type": "monochromatic", "description": "单色"}

    # 取前 3 个主色的色相
    hues = []
    for c in dominant_colors[:3]:
        r, g, b = c["rgb"]
        # RGB → Hue (0-360)
        max_c = max(r, g, b)
        min_c = min(r, g, b)
        delta = max_c - min_c
        if delta == 0:
            h = 0
        elif max_c == r:
            h = 60 * (((g - b) / delta) % 6)
        elif max_c == g:
            h = 60 * (((b - r) / delta) + 2)
        else:
            h = 60 * (((r - g) / delta) + 4)
        hues.append(h)

    # 计算色相差
    diffs = []
    for i in range(len(hues)):
        for j in range(i + 1, len(hues)):
            diff = abs(hues[i] - hues[j])
            if diff > 180:
                diff = 360 - diff
            diffs.append(diff)

    if not diffs:
        return {"type": "unknown", "description": "未知"}

    avg_diff = np.mean(diffs)

    if avg_diff < 30:
        return {"type": "monochromatic", "description": "单色/临近色"}
    elif 120 < avg_diff < 180:
        return {"type": "complementary", "description": "互补色/对比色"}
    elif 30 <= avg_diff <= 90:
        return {"type": "analogous", "description": "类似色/邻近色"}
    elif 90 <= avg_diff <= 120:
        return {"type": "triadic", "description": "三角色/均衡色"}
    else:
        return {"type": "complex", "description": "复合色彩"}


# ============================================================
# 2. 物体检测（YOLOv8）
# ============================================================
def detect_objects(pil_img):
    """
    YOLOv8 物体检测
    返回 objects 字典
    """
    model = get_yolo_model()
    cv_img = _pil_to_cv2(pil_img)
    h, w = cv_img.shape[:2]
    total_area = w * h

    results = model(cv_img, conf=config.YOLO_CONF_THRESHOLD, verbose=False)

    items = []
    class_counts = {}

    if results and len(results) > 0:
        result = results[0]
        boxes = result.boxes

        if boxes is not None:
            for box in boxes:
                cls_id = int(box.cls[0])
                cls_name = result.names[cls_id]
                conf = float(box.conf[0])
                xyxy = box.xyxy[0].cpu().numpy()

                # bbox 面积占比
                box_w = xyxy[2] - xyxy[0]
                box_h = xyxy[3] - xyxy[1]
                area_pct = round((box_w * box_h) / total_area * 100, 2)

                items.append({
                    "class": cls_name,
                    "confidence": round(conf, 3),
                    "bbox": [int(x) for x in xyxy],
                    "area_pct": area_pct,
                })

                if cls_name not in class_counts:
                    class_counts[cls_name] = {"count": 0, "total_area_pct": 0}
                class_counts[cls_name]["count"] += 1
                class_counts[cls_name]["total_area_pct"] += area_pct

    # 构建 summary
    categories = []
    for cls_name, stats in class_counts.items():
        categories.append({
            "class": cls_name,
            "count": stats["count"],
            "total_area_pct": round(stats["total_area_pct"], 2),
        })
    categories.sort(key=lambda c: c["total_area_pct"], reverse=True)

    return {
        "items": items,
        "summary": {
            "total_objects": len(items),
            "unique_classes": len(categories),
            "categories": categories,
        },
    }


# ============================================================
# 3+4. CLIP 共享编码（场景分类 + 嵌入向量一次完成）
# ============================================================
# 缓存文本特征（标签池不变，只需编码一次）
_text_features_cache = None


def _get_text_features():
    """缓存文本特征（多模板 ensemble），避免每张图重新编码标签"""
    global _text_features_cache
    if _text_features_cache is not None:
        return _text_features_cache

    import torch
    import clip as clip_module

    model, _ = get_clip_model()
    device = config.DEVICE

    # 中英文混合模板 ensemble（CLIP 对英文更敏感，中文用于补充）
    templates = [
        "一张{label}的摄影照片",
        "{label}场景的图片",
        "a photo of {label}",
        "an image showing {label}",
    ]
    all_texts = []
    for label in config.SCENE_LABELS:
        for tmpl in templates:
            all_texts.append(tmpl.format(label=label))
    text_tokens = clip_module.tokenize(all_texts).to(device)

    with torch.no_grad():
        text_features = model.encode_text(text_tokens)
        text_features = text_features / text_features.norm(dim=-1, keepdim=True)

    _text_features_cache = (text_features, len(templates))
    return _text_features_cache


def _encode_clip(pil_img):
    """
    CLIP 编码图片一次，返回归一化后的图像特征向量
    同时完成场景分类和嵌入提取
    """
    import torch

    model, preprocess = get_clip_model()
    device = config.DEVICE

    image_input = preprocess(pil_img).unsqueeze(0).to(device)

    with torch.no_grad():
        image_features = model.encode_image(image_input)
        image_features = image_features / image_features.norm(dim=-1, keepdim=True)

    return image_features


def classify_scene(image_features=None):
    """
    用 CLIP 对所有候选标签做零样本分类（多模板 ensemble）
    参数:
        image_features: 预计算的 CLIP 图像特征（Tensor）
    返回 scene 字典
    """
    import torch

    if image_features is None:
        raise ValueError("classify_scene 需要预计算的 image_features")

    text_features, num_templates = _get_text_features()
    model, _ = get_clip_model()
    n_labels = len(config.SCENE_LABELS)

    with torch.no_grad():
        logit_scale = model.logit_scale.exp()
        logits = logit_scale * image_features @ text_features.t()  # [1, 99]
        # 多模板 ensemble：先按标签分组平均 logits，再 softmax
        logits_r = logits.reshape(1, n_labels, num_templates)  # [1, 33, 3]
        logits_avg = logits_r.mean(dim=-1)  # [1, 33]
        probs = logits_avg.softmax(dim=-1).cpu().numpy()[0]

    # 排序取 top-5
    scored = sorted(
        zip(config.SCENE_LABELS, probs),
        key=lambda x: x[1],
        reverse=True,
    )
    top5 = [{"label": label, "confidence": round(float(conf), 4)} for label, conf in scored[:5]]

    # 主标签
    primary = top5[0]
    if primary["confidence"] < config.SCENE_CONFIDENCE_THRESHOLD:
        primary_label = "其他/未分类"
        primary_conf = primary["confidence"]
    else:
        primary_label = primary["label"]
        primary_conf = primary["confidence"]

    return {
        "primary_label": primary_label,
        "confidence": round(primary_conf, 4),
        "top5": top5,
    }


def extract_embedding(image_features=None):
    """
    提取 CLIP 512 维嵌入向量（L2 归一化）
    参数:
        image_features: 预计算的 CLIP 图像特征（Tensor），可选
    """
    if image_features is None:
        raise ValueError("extract_embedding 需要预计算的 image_features")

    vec = image_features.cpu().numpy()[0].tolist()
    return [round(float(v), 6) for v in vec]


# ============================================================
# 5. 生成缩略图
# ============================================================
def generate_thumbnail(pil_img, filename):
    """生成缩略图并保存到 thumbnails/ 目录"""
    os.makedirs(config.THUMBNAILS_DIR, exist_ok=True)

    thumb = pil_img.copy()
    thumb.thumbnail(config.THUMBNAIL_SIZE, Image.LANCZOS)

    # 用原文件名（保留扩展名）
    out_path = os.path.join(config.THUMBNAILS_DIR, filename)
    thumb.save(out_path, quality=85)
    return out_path


# ============================================================
# 6. 汇总：提取单张图片的全部特征
# ============================================================
def extract_all_features(image_path):
    """
    对一张图片提取全部特征
    参数:
        image_path: 图片绝对路径
    返回:
        dict: 包含 colors, objects, scene, embedding
    """
    filename = os.path.basename(image_path)

    # 读取图片（含 EXIF 旋转修正 + 缩放）
    pil_img = _load_image_rgb(image_path)

    # CLIP 编码一次，复用（大幅提速）
    clip_features = _encode_clip(pil_img)

    # 提取各项特征（CLIP 相关用预计算的特征）
    colors = extract_colors(pil_img)
    objects = detect_objects(pil_img)
    scene = classify_scene(image_features=clip_features)
    embedding = extract_embedding(image_features=clip_features)

    # 生成缩略图
    generate_thumbnail(pil_img, filename)

    return {
        "filename": filename,
        "colors": colors,
        "objects": objects,
        "scene": scene,
        "embedding": embedding,
    }
