"""
简约风配色方案模块
为图表生成提供柔和、低饱和度的调色板
"""

# 主色调色板（最多 8 个颜色）
MINIMAL_PALETTE = [
    '#8aa4b0',  # 柔和石板蓝
    '#b8a9a0',  # 暖灰褐
    '#9bb5a0',  # 鼠尾草绿
    '#c4a882',  # 暖沙色
    '#8b9a9e',  # 钢灰
    '#b0a098',  # 鸽灰
    '#a0b0a8',  # 薄雾绿
    '#c8b8a8',  # 麦色
]

# 扩展调色板（用于超过 8 个系列）
EXTENDED_PALETTE = [
    '#d4c4b0',  # 浅驼
    '#a8b8c0',  # 雾蓝
    '#c0b0a0',  # 灰褐
    '#b0c0b0',  # 灰绿
    '#c8c0b8',  # 暖灰
    '#a0a8b0',  # 蓝灰
    '#d0c8c0',  # 浅灰褐
    '#b8b0a8',  # 米灰
]

# 单系列渐变
GRADIENT_PAIRS = {
    'bar': ('#9bbac8', '#8aa4b0'),       # 柱状图渐变（上→下）
    'line': ('rgba(138,164,176,0.22)', 'rgba(138,164,176,0.02)'),  # 折线面积渐变
    'pie': None,                          # 饼图不用渐变，用调色板
    'scatter': None,                      # 散点不用渐变
}

# 背景色
BG_COLOR = '#f7f6f3'
SURFACE_COLOR = '#ffffff'
BORDER_COLOR = '#e6e4e0'
TEXT_COLOR = '#2c2c2c'
TEXT_SECONDARY = '#8c8c8c'


def get_palette(count: int) -> list:
    """根据系列数量获取合适的颜色列表"""
    if count <= 8:
        return MINIMAL_PALETTE[:count]
    return MINIMAL_PALETTE + EXTENDED_PALETTE[:count - 8]


from typing import Optional

def get_gradient(chart_type: str) -> Optional[tuple]:
    """获取图表类型的渐变色对"""
    return GRADIENT_PAIRS.get(chart_type)
