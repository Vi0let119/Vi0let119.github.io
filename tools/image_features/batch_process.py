"""
批量处理 + Flask API + SSE 进度推送
启动方式:
    python batch_process.py
    python batch_process.py --cli   # 纯命令行模式（不启动 API）
"""

import os
import sys
import json
import time
import threading
from datetime import datetime

from flask import Flask, Response, jsonify, request, send_from_directory
from flask_cors import CORS

import numpy as np
import config
from extract_features import (
    extract_all_features,
    get_yolo_model,
    get_clip_model,
)


class NumpyEncoder(json.JSONEncoder):
    """处理 numpy 类型的 JSON 编码器"""
    def default(self, obj):
        if isinstance(obj, (np.integer,)):
            return int(obj)
        if isinstance(obj, (np.floating,)):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        if isinstance(obj, np.bool_):
            return bool(obj)
        return super().default(obj)

# ============================================================
# Flask 应用
# ============================================================
app = Flask(__name__, static_folder=None)
CORS(app)

# 全局进度状态（线程安全通过 GIL 保证基本安全）
_progress = {
    "running": False,
    "current": 0,
    "total": 0,
    "current_file": "",
    "message": "就绪",
    "error": None,
    "started_at": None,
    "finished_at": None,
}
_lock = threading.Lock()


def set_progress(**kwargs):
    with _lock:
        _progress.update(kwargs)


def get_progress():
    with _lock:
        return dict(_progress)


# ============================================================
# 图片列表获取
# ============================================================
def get_image_list():
    """扫描图库目录，返回所有支持的图片路径列表"""
    images = []
    if not os.path.isdir(config.IMG_DIR):
        print(f"[警告] 图库目录不存在: {config.IMG_DIR}")
        return images

    for fname in sorted(os.listdir(config.IMG_DIR)):
        ext = os.path.splitext(fname)[1].lower()
        if ext in config.SUPPORTED_EXTS:
            images.append(os.path.join(config.IMG_DIR, fname))
    return images


# ============================================================
# 增量处理记录
# ============================================================
def load_last_processed():
    """加载上次处理记录 {filename: mtime}"""
    if os.path.exists(config.LAST_PROCESSED):
        with open(config.LAST_PROCESSED, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_last_processed(record):
    # 确保值是原生 Python 类型
    clean = {k: (float(v) if isinstance(v, (np.floating,)) else v) for k, v in record.items()}
    with open(config.LAST_PROCESSED, "w", encoding="utf-8") as f:
        json.dump(clean, f, ensure_ascii=False, indent=2)


def load_existing_features():
    """加载已有的特征数据"""
    if os.path.exists(config.FEATURES_JSON):
        with open(config.FEATURES_JSON, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("features", [])
    return []


def save_features(features):
    """保存特征数据到 JSON"""
    output = {
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "total_images": len(features),
        "features": features,
    }
    with open(config.FEATURES_JSON, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2, cls=NumpyEncoder)


def _generate_umap_js():
    """生成前端嵌入数据文件 umap_data.js（独立于 Flask）"""
    import os as _os
    features_path = config.FEATURES_JSON
    umap_path = config.UMAP_JSON
    if not _os.path.exists(features_path) or not _os.path.exists(umap_path):
        return

    with open(features_path, "r", encoding="utf-8") as f:
        features = json.load(f)
    with open(umap_path, "r", encoding="utf-8") as f:
        umap = json.load(f)

    data = []
    for u in umap:
        fname = u["filename"]
        feat = next((f for f in features["features"] if f["filename"] == fname), None)
        colors = feat["colors"]["dominant_colors"][:3] if feat else []
        data.append({
            "fn": fname,
            "x": u["x"],
            "y": u["y"],
            "sc": u["scene_label"],
            "cf": u["scene_confidence"],
            "cl": [{"h": c["hex"], "p": c["percentage"]} for c in colors],
        })

    js_path = _os.path.join(config.PROJECT_DIR, "pictures", "picture_features", "umap_data.js")
    _os.makedirs(_os.path.dirname(js_path), exist_ok=True)
    with open(js_path, "w", encoding="utf-8") as f:
        f.write("const UMAP_DATA = ")
        json.dump(data, f, ensure_ascii=False)
        f.write(";")
    print(f"[数据] 前端数据已生成: {js_path}")


# ============================================================
# 批量处理核心
# ============================================================
def batch_process():
    """批量处理所有图片（在后台线程中运行）"""
    set_progress(running=True, current=0, total=0, current_file="",
                 message="初始化中...", error=None,
                 started_at=datetime.now().isoformat(), finished_at=None)

    try:
        # 1. 加载模型
        set_progress(message="加载模型中...")
        yolo = get_yolo_model()
        clip_model, clip_preprocess = get_clip_model()

        # 2. 扫描图片
        all_images = get_image_list()
        if not all_images:
            set_progress(message="未找到图片", running=False,
                         finished_at=datetime.now().isoformat())
            return

        # 3. 判断增量
        last_processed = load_last_processed()
        to_process = []
        skipped = 0
        for img_path in all_images:
            fname = os.path.basename(img_path)
            try:
                mtime = os.path.getmtime(img_path)
            except OSError:
                continue
            if fname in last_processed and last_processed[fname] >= mtime:
                skipped += 1
            else:
                to_process.append(img_path)

        total = len(to_process)
        set_progress(
            total=total, current=0,
            message=f"发现 {total} 张待处理" + (f"（跳过 {skipped} 张已处理）" if skipped else "")
        )

        if total == 0:
            set_progress(message="所有图片已是最新，无需处理",
                         running=False, finished_at=datetime.now().isoformat())
            return

        # 4. 加载已有特征（用于合并增量）
        existing_features = load_existing_features()
        features_map = {f["filename"]: f for f in existing_features}

        # 5. 逐张处理
        new_count = 0
        error_count = 0
        for i, img_path in enumerate(to_process):
            fname = os.path.basename(img_path)
            set_progress(current=i + 1, current_file=fname,
                         message=f"处理中 ({i + 1}/{total})")

            try:
                feat = extract_all_features(img_path)
                features_map[fname] = feat
                last_processed[fname] = os.path.getmtime(img_path)
                new_count += 1
            except Exception as e:
                print(f"[错误] {fname}: {e}")
                error_count += 1
                # 失败的图片也记录 mtime，避免反复重试
                last_processed[fname] = os.path.getmtime(img_path)

        # 6. 保存
        all_features = list(features_map.values())
        # 按文件名排序保证输出稳定
        all_features.sort(key=lambda f: f["filename"])
        save_features(all_features)
        save_last_processed(last_processed)

        msg = f"完成！处理 {new_count} 张"
        if skipped:
            msg += f"，跳过 {skipped} 张已处理"
        if error_count:
            msg += f"，{error_count} 张失败"
        set_progress(message=msg, running=False,
                     finished_at=datetime.now().isoformat())

        # 7. 自动运行 UMAP 降维
        set_progress(message="运行 UMAP 降维...")
        from umap_reduce import run_umap
        run_umap()
        set_progress(message=msg + "，UMAP 降维完成")

        # 生成前端嵌入数据文件
        try:
            _generate_umap_js()
            set_progress(message=msg + "，UMAP 降维完成，前端数据已生成")
        except Exception as e2:
            print(f"[警告] 生成前端数据文件失败: {e2}")

    except Exception as e:
        import traceback
        traceback.print_exc()
        set_progress(error=str(e), message=f"错误: {e}",
                     running=False, finished_at=datetime.now().isoformat())


# ============================================================
# Flask 路由
# ============================================================

@app.route("/api/extract/start", methods=["POST"])
def api_start():
    """启动批量处理（后台线程）"""
    p = get_progress()
    if p["running"]:
        return jsonify({"status": "error", "message": "已有处理任务在运行"}), 409

    thread = threading.Thread(target=batch_process, daemon=True)
    thread.start()
    return jsonify({"status": "ok", "message": "处理已启动"})


@app.route("/api/extract/progress")
def api_progress():
    """SSE 实时进度推送"""
    def generate():
        last_state = None
        while True:
            p = get_progress()
            # 只在状态变化时推送
            current_state = (p["current"], p["total"], p["message"], p["running"])
            if current_state != last_state:
                last_state = current_state
                yield f"data: {json.dumps(p, ensure_ascii=False)}\n\n"
            if not p["running"]:
                break
            time.sleep(0.3)
        # 最后再推一次确保完成状态送达
        yield f"data: {json.dumps(get_progress(), ensure_ascii=False)}\n\n"

    return Response(generate(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache",
                             "X-Accel-Buffering": "no"})


@app.route("/api/extract/status")
def api_status():
    """查询当前状态"""
    return jsonify(get_progress())


@app.route("/api/features")
def api_features():
    """返回全部特征数据"""
    if not os.path.exists(config.FEATURES_JSON):
        return jsonify({"error": "特征数据尚未生成"}), 404
    with open(config.FEATURES_JSON, "r", encoding="utf-8") as f:
        return jsonify(json.load(f))


@app.route("/api/umap")
def api_umap():
    """返回 UMAP 2D 坐标"""
    if not os.path.exists(config.UMAP_JSON):
        return jsonify({"error": "UMAP 数据尚未生成"}), 404
    with open(config.UMAP_JSON, "r", encoding="utf-8") as f:
        return jsonify(json.load(f))


@app.route("/api/image/<filename>")
def api_image(filename):
    """返回原图（用于预览）"""
    return send_from_directory(config.IMG_DIR, filename)


@app.route("/api/thumbnail/<filename>")
def api_thumbnail(filename):
    """返回缩略图"""
    return send_from_directory(config.THUMBNAILS_DIR, filename)


# ============================================================
# 可视化页面（静态文件）
# ============================================================
@app.route("/")
@app.route("/visualize")
def serve_visualize():
    return send_from_directory(config.VISUALIZE_DIR, "features_visual.html")


@app.route("/<path:subpath>")
def serve_static(subpath):
    """JS/CSS 等静态资源"""
    return send_from_directory(config.VISUALIZE_DIR, subpath)


# ============================================================
# 启动入口
# ============================================================
if __name__ == "__main__":
    if "--cli" in sys.argv:
        # 命令行模式：直接运行批量处理
        print("=" * 50)
        print("图片特征提取 — 命令行模式")
        print(f"图库目录: {config.IMG_DIR}")
        print(f"输出文件: {config.FEATURES_JSON}")
        print("=" * 50)
        batch_process()
        p = get_progress()
        print(f"\n结果: {p['message']}")
        if p["error"]:
            print(f"错误: {p['error']}")
    else:
        # Flask API 模式
        import socket

        def find_free_port(start=5000):
            for port in range(start, 5100):
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    if s.connect_ex(("127.0.0.1", port)) != 0:
                        return port
            return 5000

        port = find_free_port()
        print("=" * 50)
        print(f"图片特征提取 API 服务")
        print(f"地址: http://127.0.0.1:{port}")
        print(f"可视化: http://127.0.0.1:{port}/visualize")
        print(f"图库目录: {config.IMG_DIR}")
        print("=" * 50)
        app.run(host="127.0.0.1", port=port, debug=False, threaded=True)
