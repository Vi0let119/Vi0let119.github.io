"""
UMAP 降维：将 512 维 CLIP 嵌入向量降维到 2D 平面
用于前端散点图可视化 — 相似图片在平面上自然聚集
"""

import json
import os
import numpy as np
import umap
import config


def run_umap():
    """
    读取 picture_features.json，对 embedding 做 UMAP 降维
    输出 umap_2d.json
    """
    features_path = config.FEATURES_JSON
    if not os.path.exists(features_path):
        print("[UMAP] 特征文件不存在，跳过")
        return

    with open(features_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    features = data.get("features", [])
    if not features:
        print("[UMAP] 没有特征数据，跳过")
        return

    # 提取所有 embedding
    embeddings = np.array([f["embedding"] for f in features], dtype=np.float32)
    n = len(embeddings)
    print(f"[UMAP] 输入: {n} 个 {embeddings.shape[1]} 维向量")

    # 调整 UMAP 参数（样本少时降低 n_neighbors）
    n_neighbors = min(config.UMAP_N_NEIGHBORS, max(2, n - 1))

    reducer = umap.UMAP(
        n_components=2,
        n_neighbors=n_neighbors,
        min_dist=config.UMAP_MIN_DIST,
        random_state=config.UMAP_RANDOM_STATE,
        metric="cosine",  # 余弦距离，和 CLIP 相似度一致
        verbose=False,
    )
    coords_2d = reducer.fit_transform(embeddings)

    # 归一化到 [0, 1] 区间（方便前端渲染）
    x_min, x_max = coords_2d[:, 0].min(), coords_2d[:, 0].max()
    y_min, y_max = coords_2d[:, 1].min(), coords_2d[:, 1].max()
    x_range = x_max - x_min or 1
    y_range = y_max - y_min or 1
    coords_2d[:, 0] = (coords_2d[:, 0] - x_min) / x_range
    coords_2d[:, 1] = (coords_2d[:, 1] - y_min) / y_range

    # 构建输出
    result = []
    for i, feat in enumerate(features):
        result.append({
            "filename": feat["filename"],
            "x": round(float(coords_2d[i][0]), 6),
            "y": round(float(coords_2d[i][1]), 6),
            "scene_label": feat["scene"]["primary_label"],
            "scene_confidence": feat["scene"]["confidence"],
            "dominant_colors": feat["colors"]["dominant_colors"][:3],
            "objects_summary": feat["objects"]["summary"]["categories"][:5],
        })

    with open(config.UMAP_JSON, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"[UMAP] 完成: {len(result)} 个点 → {config.UMAP_JSON}")


if __name__ == "__main__":
    run_umap()
