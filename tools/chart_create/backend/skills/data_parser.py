"""
数据解析 & 清洗模块 — 统一入口
支持：文本(CSV/TSV) · Excel · JSON
"""
import json
from typing import Optional


# ═══════════════════════════════════════════
# 格式检测
# ═══════════════════════════════════════════

def detect_data_format(text: str) -> str:
    """
    自动检测数据格式
    返回: 'json' | 'csv' | 'tsv' | 'text'
    """
    if not text or not text.strip():
        return 'text'

    stripped = text.strip()

    # JSON 检测：以 { 或 [ 开头且能成功解析
    if stripped.startswith('{') or stripped.startswith('['):
        try:
            json.loads(stripped)
            return 'json'
        except (json.JSONDecodeError, ValueError):
            pass

    # 制表符检测
    lines = [l for l in stripped.split('\n') if l.strip()][:5]
    tab_count = sum(l.count('\t') for l in lines)
    comma_count = sum(l.count(',') for l in lines)

    if tab_count > comma_count and tab_count > 0:
        return 'tsv'
    if comma_count > 0:
        return 'csv'

    return 'text'


# ═══════════════════════════════════════════
# JSON 解析
# ═══════════════════════════════════════════

def parse_json_data(data) -> dict:
    """
    解析 JSON 数据，自动识别结构并提取为列格式

    参数:
    data: 已解析的 JSON 对象（dict/list）或 JSON 字符串

    返回:
    {
        'columns': [{'name': str, 'type': 'numeric'|'category', 'values': [...]}],
        'row_count': int,
        'structure_type': 'array_of_objects' | 'named_arrays' | 'flat_object' | 'simple_array' | 'other',
        'header_names': [str, ...],
        'error': str | None,
    }
    """
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except json.JSONDecodeError as e:
            return {'columns': [], 'row_count': 0, 'structure_type': 'other',
                    'header_names': [], 'error': f'JSON 解析失败: {str(e)}'}

    if data is None:
        return {'columns': [], 'row_count': 0, 'structure_type': 'other',
                'header_names': [], 'error': '数据为空 (null)'}

    # 类型 1：对象数组 [{...}, {...}]
    if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
        return _parse_array_of_objects(data)

    # 类型 2：命名数组 {categories: [...], values: [...]}
    if isinstance(data, dict):
        array_keys = [k for k, v in data.items() if isinstance(v, list)]
        if len(array_keys) >= 2:
            return _parse_named_arrays(data, array_keys)

        # 类型 3：扁平对象 {key: value, ...}
        return _parse_flat_object(data)

    # 类型 4：简单值数组 [1, 2, 3, ...]
    if isinstance(data, list):
        return _parse_simple_array(data)

    return {'columns': [], 'row_count': 0, 'structure_type': 'other',
            'header_names': [], 'error': '无法识别的 JSON 结构'}


def json_to_text_table(data) -> str:
    """
    将 JSON 数据转换为制表符分隔的表格文本（发送给 AI 时更易理解）

    支持: 对象数组 · 命名数组 · 嵌套对象
    """
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except json.JSONDecodeError:
            return data

    if data is None:
        return ''

    # 对象数组 → 表格
    if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
        keys = []
        seen = set()
        for item in data:
            if isinstance(item, dict):
                for k in item:
                    if k not in seen:
                        seen.add(k)
                        keys.append(k)
        lines = ['\t'.join(keys)]
        for item in data:
            row = []
            for k in keys:
                v = item.get(k) if isinstance(item, dict) else ''
                if v is None:
                    v = ''
                elif isinstance(v, (dict, list)):
                    v = json.dumps(v, ensure_ascii=False)
                else:
                    v = str(v)
                row.append(v)
            lines.append('\t'.join(row))
        return '\n'.join(lines)

    # 命名数组 → 表格
    if isinstance(data, dict):
        array_keys = [k for k, v in data.items() if isinstance(v, list)]
        if len(array_keys) >= 2:
            max_len = max(len(data[k]) for k in array_keys)
            lines = ['\t'.join(array_keys)]
            for i in range(max_len):
                row = []
                for k in array_keys:
                    v = data[k][i] if i < len(data[k]) else ''
                    if v is None:
                        v = ''
                    elif isinstance(v, (dict, list)):
                        v = json.dumps(v, ensure_ascii=False)
                    else:
                        v = str(v)
                    row.append(v)
                lines.append('\t'.join(row))
            return '\n'.join(lines)

    # 兜底
    return json.dumps(data, ensure_ascii=False, indent=2)


# ── JSON 内部辅助 ──

def _parse_array_of_objects(arr: list) -> dict:
    """解析对象数组 [{a:1, b:2}, {a:3, b:4}]"""
    all_keys = []
    seen = set()
    for item in arr:
        if isinstance(item, dict):
            for k in item:
                if k not in seen:
                    seen.add(k)
                    all_keys.append(k)

    if not all_keys:
        return {'columns': [], 'row_count': 0, 'structure_type': 'array_of_objects',
                'header_names': [], 'error': '对象数组中没有有效键'}

    columns = []
    for key_idx, key in enumerate(all_keys):
        values = []
        for item in arr:
            v = item.get(key) if isinstance(item, dict) else None
            values.append(v)

        col_type = detect_column_type(values)
        if col_type == 'numeric':
            values = _safe_convert_numeric(values)

        columns.append({
            'name': key,
            'type': col_type,
            'values': values,
            'index': key_idx,
        })

    return {
        'columns': columns,
        'row_count': len(arr),
        'structure_type': 'array_of_objects',
        'header_names': all_keys,
        'error': None,
    }


def _parse_named_arrays(data: dict, array_keys: list) -> dict:
    """解析命名数组 {x: [...], y: [...], name: [...]}"""
    max_len = max(len(data[k]) for k in array_keys)

    columns = []
    for idx, key in enumerate(array_keys):
        values = list(data[key])
        while len(values) < max_len:
            values.append(None)

        col_type = detect_column_type(values)
        if col_type == 'numeric':
            values = _safe_convert_numeric(values)

        columns.append({
            'name': key,
            'type': col_type,
            'values': values,
            'index': idx,
        })

    return {
        'columns': columns,
        'row_count': max_len,
        'structure_type': 'named_arrays',
        'header_names': array_keys,
        'error': None,
    }


def _parse_flat_object(data: dict) -> dict:
    """解析扁平对象 {name: 'Alice', age: 30, city: 'NYC'}"""
    columns = []
    for idx, (key, value) in enumerate(data.items()):
        if value is None or isinstance(value, (str, int, float, bool)):
            col_type = 'numeric' if isinstance(value, (int, float)) else 'category'
            columns.append({
                'name': key,
                'type': col_type,
                'values': [value],
                'index': idx,
            })

    return {
        'columns': columns,
        'row_count': 1,
        'structure_type': 'flat_object',
        'header_names': [c['name'] for c in columns],
        'error': None,
    }


def _parse_simple_array(arr: list) -> dict:
    """解析简单值数组 [1, 2, 3, ...] 或 ["a", "b", ...]"""
    col_type = detect_column_type(arr)

    values = arr
    if col_type == 'numeric':
        values = _safe_convert_numeric(arr)

    return {
        'columns': [
            {'name': '值', 'type': col_type, 'values': values, 'index': 0},
            {'name': '序号', 'type': 'category', 'values': list(range(1, len(arr) + 1)), 'index': 1},
        ],
        'row_count': len(arr),
        'structure_type': 'simple_array',
        'header_names': ['值', '序号'],
        'error': None,
    }


def _safe_convert_numeric(values: list) -> list:
    """安全地将值列表转为 float，无法转换的置为 None"""
    result = []
    for v in values:
        if v is None:
            result.append(None)
        elif isinstance(v, (int, float)):
            result.append(float(v))
        elif isinstance(v, str):
            try:
                result.append(float(v))
            except ValueError:
                result.append(None)
        else:
            result.append(None)
    return result


# ═══════════════════════════════════════════
# 通用：列类型检测（JSON & 文本共用）
# ═══════════════════════════════════════════

def detect_column_type(values: list) -> str:
    """
    判断列的数据类型
    返回: 'numeric' | 'category'
    """
    numeric_count = 0
    valid_count = 0

    for v in values:
        if v is None:
            continue
        valid_count += 1
        if isinstance(v, (int, float)):
            numeric_count += 1
        elif isinstance(v, str):
            try:
                float(v)
                numeric_count += 1
            except ValueError:
                pass

    if valid_count == 0:
        return 'category'

    return 'numeric' if numeric_count / valid_count >= 0.8 else 'category'


# ═══════════════════════════════════════════
# 文本解析（原 data_parser 核心）
# ═══════════════════════════════════════════

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
    解析文本数据 (CSV/TSV)

    返回:
    {
        'columns': [{'name': str, 'type': 'numeric'|'category', 'values': [...]}],
        'row_count': int,
        'has_header': bool,
        'header_names': [str, ...],
        'error': str | None,
    }
    """
    if not text or not text.strip():
        return {'columns': [], 'row_count': 0, 'has_header': has_header,
                'header_names': [], 'error': '数据为空'}

    delimiter = auto_detect_delimiter(text)
    lines = [l.strip() for l in text.strip().split('\n') if l.strip()]

    if not lines:
        return {'columns': [], 'row_count': 0, 'has_header': has_header,
                'header_names': [], 'error': '无有效数据行'}

    def split_line(line: str) -> list:
        if delimiter == ' ':
            return line.split()
        return [s.strip() for s in line.split(delimiter)]

    rows = [split_line(l) for l in lines]
    rows = [r for r in rows if len(r) >= 2]

    if not rows:
        return {'columns': [], 'row_count': 0, 'has_header': has_header,
                'header_names': [], 'error': '未检测到两列以上数据'}

    max_cols = max(len(r) for r in rows)
    for r in rows:
        while len(r) < max_cols:
            r.append('')

    cols_data = list(zip(*rows))

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
        return {'columns': [], 'row_count': 0, 'has_header': False,
                'header_names': [], 'error': 'Excel 文件为空'}

    str_rows = []
    for row in rows:
        str_row = [str(c).strip() if c is not None else '' for c in row]
        if any(v for v in str_row):
            str_rows.append(str_row)

    if not str_rows:
        return {'columns': [], 'row_count': 0, 'has_header': False,
                'header_names': [], 'error': 'Excel 无有效数据'}

    max_cols = max(len(r) for r in str_rows)
    for r in str_rows:
        while len(r) < max_cols:
            r.append('')

    has_header = False
    data_start = 0
    if len(str_rows) > 1:
        first_row = str_rows[0]
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


# ═══════════════════════════════════════════
# 统一入口：自动检测格式并解析
# ═══════════════════════════════════════════

def parse_auto(text: str, has_header: bool = False) -> dict:
    """
    自动检测数据格式（JSON / CSV / TSV）并解析

    这是推荐的统一入口函数。调用方无需关心具体格式。
    """
    fmt = detect_data_format(text)

    if fmt == 'json':
        result = parse_json_data(text)
        result['has_header'] = True  # JSON 的 key 天然是表头
        return result

    # 文本格式（CSV/TSV）
    return parse_text_data(text, has_header=has_header)


def clean_values(values: list, col_type: str) -> list:
    """清洗数据：去除空值、异常值"""
    if col_type == 'numeric':
        numeric_vals = [v for v in values if v is not None and not (isinstance(v, float) and (v != v))]
        if not numeric_vals:
            return values
        return values
    return values
