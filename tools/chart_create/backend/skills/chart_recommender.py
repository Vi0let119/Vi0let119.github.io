"""
图表类型推荐模块
根据数据结构自动推荐最合适的图表类型
"""

def recommend_chart_type(columns: list) -> dict:
    """
    根据列数据特征推荐图表类型

    参数:
    columns: [{'name': str, 'type': 'numeric'|'category', 'values': [...]}, ...]

    返回:
    {'recommended': 'bar', 'reason': '...', 'alternatives': ['line', 'pie'], 'confidence': 0.8}
    """
    if not columns or len(columns) < 2:
        return {
            'recommended': 'bar',
            'reason': '数据列不足，默认使用柱状图',
            'alternatives': [],
            'confidence': 0.3,
        }

    # 统计列类型
    numeric_cols = [c for c in columns if c['type'] == 'numeric']
    category_cols = [c for c in columns if c['type'] == 'category']

    col_count = len(columns)
    numeric_count = len(numeric_cols)
    category_count = len(category_cols)

    # ── 决策逻辑 ──
    row_count = len(columns[0]['values']) if columns else 0

    # 场景 1：一个分类列 + 一个数值列（最常见）
    if category_count == 1 and numeric_count == 1:
        if row_count <= 8:
            return {
                'recommended': 'bar',
                'reason': f'1个分类维度 + 1个数值指标，共{row_count}项，使用柱状图对比清晰',
                'alternatives': ['pie', 'line'],
                'confidence': 0.85,
            }
        else:
            return {
                'recommended': 'bar',
                'reason': f'1个分类维度 + 1个数值指标，共{row_count}项，柱状图适合较多类别的对比',
                'alternatives': ['line'],
                'confidence': 0.75,
            }

    # 场景 2：两个数值列（可能是散点图）
    if numeric_count >= 2 and category_count == 0:
        return {
            'recommended': 'scatter',
            'reason': '两列数值型数据，可能存在相关关系，使用散点图展示分布',
            'alternatives': ['line', 'bar'],
            'confidence': 0.7,
        }

    # 场景 3：一个分类列 + 多个数值列
    if category_count >= 1 and numeric_count >= 2:
        return {
            'recommended': 'line',
            'reason': f'1个维度 + {numeric_count}个指标，使用多系列折线图对比趋势',
            'alternatives': ['bar', 'scatter'],
            'confidence': 0.75,
        }

    # 场景 4：全是分类列
    if category_count >= 2 and numeric_count == 0:
        return {
            'recommended': 'bar',
            'reason': '检测到多个分类维度，建议确认数值列后使用柱状图',
            'alternatives': [],
            'confidence': 0.4,
        }

    # 场景 5：只有 1 个数值列，系列数 ≤ 8 → 饼图也可以
    if numeric_count == 1 and category_count == 1 and row_count <= 6:
        return {
            'recommended': 'bar',
            'reason': f'共{row_count}项数据，柱状图效果最佳（饼图也可以展示占比）',
            'alternatives': ['pie', 'line'],
            'confidence': 0.8,
        }

    # 默认
    return {
        'recommended': 'bar',
        'reason': '使用柱状图展示数据对比',
        'alternatives': ['line', 'pie', 'scatter'],
        'confidence': 0.5,
    }


def chart_type_chinese(chart_type: str) -> str:
    """图表类型英文转中文"""
    mapping = {
        'bar': '柱状图',
        'line': '折线图',
        'pie': '饼图',
        'scatter': '散点图',
    }
    return mapping.get(chart_type, chart_type)
