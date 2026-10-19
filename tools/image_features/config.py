"""
图片特征提取系统 — 配置文件
修改此文件即可调整模型、标签池、路径等参数
"""
import os

# ============================================================
# 路径配置
# ============================================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(os.path.dirname(BASE_DIR))  # 项目根目录
IMG_DIR = os.path.join(PROJECT_DIR, "图库")

FEATURES_JSON = os.path.join(BASE_DIR, "picture_features.json")
UMAP_JSON = os.path.join(BASE_DIR, "umap_2d.json")
LAST_PROCESSED = os.path.join(BASE_DIR, "last_processed.json")
THUMBNAILS_DIR = os.path.join(BASE_DIR, "thumbnails")
VISUALIZE_DIR = os.path.join(BASE_DIR, "visualize")

# ============================================================
# 模型配置
# ============================================================
YOLO_MODEL = "yolo11x.pt"       # YOLO11x，57M 参数，最高精度
CLIP_MODEL = "ViT-L/14@336px"    # CLIP Large，768 维嵌入，336px 输入
DEVICE = "cuda"                  # "cuda" 或 "cpu"

# ============================================================
# 处理参数
# ============================================================
THUMBNAIL_SIZE = (200, 200)       # 缩略图尺寸
KMEANS_K = 5                      # 提取的主色调数量
YOLO_CONF_THRESHOLD = 0.50       # YOLO 检测置信度阈值
SCENE_CONFIDENCE_THRESHOLD = 0.30 # 场景标签最低置信度（英文标签+ViT-L后置信度大幅提升）
MAX_IMAGE_DIM = 1024              # 处理时最大尺寸（加速）

# ============================================================
# 支持的图片格式
# ============================================================
SUPPORTED_EXTS = {'.jpg', '.jpeg', '.png', '.webp', '.bmp'}

# ============================================================
# 场景分类候选标签池（可自由扩展）
# ============================================================
SCENE_LABELS = [
    # ── Nature & Landscape ──
    "sunset / golden hour",
    "blue hour / twilight",
    "flowers and plants",
    "mountains and peaks",
    "ocean and water",
    "forest and woods",
    "snow and winter",
    "fog and misty clouds",
    "grassland and fields",
    "desert and dunes",
    "starry night sky",
    "rainbow",
    "river and waterfall",
    "lake with reflection",
    "autumn foliage",
    "sky and clouds",
    "water ripples",

    # ── Urban & Human ──
    "city buildings and streets",
    "portrait of a person",
    "night lights and neon",
    "indoor room interior",
    "food and drinks",
    "market and street stalls",
    "bridges and architecture",
    "street view and road",
    "railway and train station",
    "city skyline at night",

    # ── Animals ──
    "wild animals",
    "pet cats and dogs",
    "birds",
    "insects and butterflies",
    "aquatic animals underwater",

    # ── Close-up & Macro ──
    "flower petals closeup",
    "green leaves closeup",
    "food plated closeup",
    "still life objects",
    "architectural texture detail",
    "abstract texture and pattern",

    # ── Photography Style ──
    "black and white photography",
    "long exposure light trails",
    "silhouette backlit",
    "macro close-up photography",
    "reflection and symmetry",
    "minimalist composition",
    "bokeh light spots",
]

# ============================================================
# UMAP 降维参数
# ============================================================
UMAP_N_NEIGHBORS = 15
UMAP_MIN_DIST = 0.1
UMAP_RANDOM_STATE = 42
