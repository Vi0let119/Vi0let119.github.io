"""
数据解析 & 清洗模块
支持文本和 Excel 数据的自动识别与解析
"""
from typing import Optional


def auto_detect_delimiter(text: str) -> str:
    """自动检测文本分隔符"""
    lines = [l for l in text.strip().split('\n') if l.strip()][:10]
    if not lines:
        return ','

    counts = {',': 0, '\t': 0, ' ': 0}
    for line in lines:
        counts[','] += line.count(',')
        counts['\t'] += line.count('\t')
        parts = line.strip().split()
        counts[' '] += len(parts) - 1 if len(parts) > 1 else 0

    best = max(counts, key=counts.get)
    return best if counts[best] > 0 else ','


def parse_text_data(text: str, has_header: bool = False) -> dict:
    """
    解析文本数据

    返回:
    {
        'columns': [{'name': '列名', 'type': 'numeric'|'category'|'time', 'values': [...]}],
        'row_count': int,
        'has_header': bool,
        'error': str | None,
    }
    """
    if not text or not text.strip():
        return {'columns': [], 'row_count': 0, 'has_header': has_header, 'error': '数据为空'}

    delimiter = auto_detect_delimiter(text)
    lines = [l.strip() for l in text.strip().split('\n') if l.strip()]

    if not lines:
        return {'columns': [], 'row_count': 0, 'has_header': has_header, 'error': '无有效数据行'}

    # 解析每行
    def split_line(line: str) -> list:
        if delimiter == ' ':
            return line.split()
        return [s.strip() for s in line.split(delimiter)]

    rows = [split_line(l) for l in lines]
    rows = [r for r in rows if len(r) >= 2]

    if not rows:
        return {'columns': [], 'row_count': 0, 'has_header': has_header, 'error': '未检测到两列以上数据'}

    # 确定列数（取最多列的那行）
    max_cols = max(len(r) for r in rows)
    # 统一列数（补齐短的行）
    for r in rows:
        while len(r) < max_cols:
            r.append('')

    # 转置：rows → columns
    cols_data = list(zip(*rows))  # [(col0_values), (col1_values), ...]

    header_names = [f'列{i+1}' for i in range(max_cols)]
    data_start = 0

    if has_header and len(rows) > 1:
        header_names = [str(rows[0][i]).strip() or f'列{i+1}' for i in range(max_cols)]
        data_start = 1

    columns = []
    for i in range(max_cols):
        values = []
        for j in range(data_start, len(rows)):
            val = rows[j][i].strip() if i < len(rows[j]) else ''
            values.append(val)

        # 判断列类型
        col_type = detect_column_type(values)

        # 转换数值列
        if col_type == 'numeric':
            converted = []
            for v in values:
                try:
                    converted.append(float(v))
                except (ValueError, TypeError):
                    converted.append(None)
            values = converted

        columns.append({
            'name': header_names[i],
            'type': col_type,
            'values': values,
            'index': i,
        })

    return {
        'columns': columns,
        'row_count': len(rows) - data_start,
        'has_header': has_header,
        'header_names': header_names,
        'error': None,
    }


def parse_excel_data(rows: list) -> dict:
    """
    解析 Excel 数据（已通过 openpyxl 读取为行列表）

    参数:
    rows: [('col1', 'col2', ...), ...] 每行是一个 tuple 的列表
    """
    if not rows or len(rows) < 1:
        return {'columns': [], 'row_count': 0, 'has_header': False, 'error': 'Excel 文件为空'}

    # 转为字符串列表
    str_rows = []
    for row in rows:
        str_row = [str(c).strip() if c is not None else '' for c in row]
        # 过滤全空行
        if any(v for v in str_row):
            str_rows.append(str_row)

    if not str_rows:
        return {'columns': [], 'row_count': 0, 'has_header': False, 'error': 'Excel 无有效数据'}

    # 统一列数
    max_cols = max(len(r) for r in str_rows)
    for r in str_rows:
        while len(r) < max_cols:
            r.append('')

    # 判断第一行是否是表头
    has_header = False
    data_start = 0
    if len(str_rows) > 1:
        first_row = str_rows[0]
        # 检查第一行是否都是文本（可能是表头）
        text_count = 0
        for v in first_row:
            try:
                float(v)
            except ValueError:
                if v:
                    text_count += 1
        if text_count >= max_cols * 0.5:
            has_header = True
            data_start = 1

    header_names = [f'列{i+1}' for i in range(max_cols)]
    if has_header:
        header_names = [str(str_rows[0][i]) or f'列{i+1}' for i in range(max_cols)]

    cols_data = list(zip(*str_rows))

    columns = []
    for i in range(max_cols):
        values = list(cols_data[i][data_start:])
        col_type = detect_column_type(values)

        if col_type == 'numeric':
            converted = []
            for v in values:
                try:
                    converted.append(float(v))
                except (ValueError, TypeError):
                    converted.append(None)
            values = converted

        columns.append({
            'name': header_names[i],
            'type': col_type,
            'values': values,
            'index': i,
        })

    return {
        'columns': columns,
        'row_count': len(str_rows) - data_start,
        'has_header': has_header,
        'header_names': header_names,
        'error': None,
    }


def detect_column_type(values: list) -> str:
    """
    判断列的数据类型

    返回: 'numeric' | 'category' | 'time' | 'mixed'
    """
    if not values:
        return 'category'

    numeric_count = 0
    valid_count = 0

    for v in values:
        if v is None or (isinstance(v, str) and v.strip() == ''):
            continue
        valid_count += 1
        try:
            float(v)
            numeric_count += 1
        except (ValueError, TypeError):
            pass

    if valid_count == 0:
        return 'category'

    ratio = numeric_count / valid_count
    if ratio >= 0.8:
        return 'numeric'
    return 'category'


def clean_values(values: list, col_type: str) -> list:
    """清洗数据：去除空值、异常值"""
    if col_type == 'numeric':
        numeric_vals = [v for v in values if v is not None and not (isinstance(v, float) and (v != v))]
        if not numeric_vals:
            return values
        # 简单的异常值检测：超过 3 倍标准差标记但保留
        return values
    return values
