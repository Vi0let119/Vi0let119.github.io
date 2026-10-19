"""
Flask 后端 — 图表生成工具
AI 代理 + 图表 HTML 生成
"""
import os
import json
import re
import secrets
from io import BytesIO
from typing import Optional

from dotenv import load_dotenv
load_dotenv()

from flask import Flask, request, jsonify, session, send_file
from openai import OpenAI
from openpyxl import load_workbook

from skills.data_parser import parse_text_data, parse_excel_data, parse_json_data, json_to_text_table, detect_data_format, parse_auto
from skills.chart_recommender import recommend_chart_type
from skills.color_themes import MINIMAL_PALETTE, get_palette
from skills.html_builder import build_chart_html

app = Flask(__name__)
app.secret_key = secrets.token_hex(32)

# ── CORS ──────────────────────────────────
@app.after_request
def add_cors_headers(resp):
    resp.headers['Access-Control-Allow-Origin'] = '*'
    resp.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    resp.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    return resp

@app.before_request
def handle_options():
    if request.method == 'OPTIONS':
        return '', 204

# ═══════════════════════════════════════════
# AI Provider 配置
# ═══════════════════════════════════════════

PROVIDERS = {
    'deepseek': {
        'name': 'DeepSeek',
        'base_url': 'https://api.deepseek.com/v1',
        'default_model': 'deepseek-chat',
        'api_key_env': 'DEEPSEEK_API_KEY',
        'type': 'openai',  # OpenAI 兼容
    },
    'qwen': {
        'name': '通义千问',
        'base_url': 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        'default_model': 'qwen-plus',
        'api_key_env': 'QWEN_API_KEY',
        'type': 'openai',
    },
    'openai': {
        'name': 'OpenAI',
        'base_url': 'https://api.openai.com/v1',
        'default_model': 'gpt-4o-mini',
        'api_key_env': 'OPENAI_API_KEY',
        'type': 'openai',
    },
    'gemini': {
        'name': 'Gemini',
        'base_url': 'https://generativelanguage.googleapis.com/v1beta',
        'default_model': 'gemini-1.5-flash',
        'api_key_env': 'GEMINI_API_KEY',
        'type': 'gemini',
    },
}

# 从环境变量读取站点默认 API key
SITE_API_KEYS = {}
for key, cfg in PROVIDERS.items():
    env_val = os.getenv(cfg['api_key_env'], '')
    if env_val:
        SITE_API_KEYS[key] = env_val

# ═══════════════════════════════════════════
# AI System Prompt
# ═══════════════════════════════════════════

SYSTEM_PROMPT = """你是一个图表生成专家助手。你的任务是根据用户提供的数据和需求，生成高质量的可视化图表。

## 工作流程

### 第一步：理解数据
- 分析用户发送的数据：列数、每列类型（数值/分类/时间）、数据范围、缺失情况
- 如果数据不明确，**先追问**再继续。例如：
  - "检测到数据有3列，请问哪一列作为X轴？"
  - "第2列是数值数据，我推断它作为Y轴数据，是否正确？"

### 第二步：推荐图表类型
根据数据特征推荐最合适的图表：
- 分类对比 → 柱状图 (bar)
- 时间/序列趋势 → 折线图 (line)
- 占比/比例 → 饼图 (pie)
- 两个数值变量关系 → 散点图 (scatter)
- 网络/关系/层级 → 力导向图、树图
- 地理空间 → 地图

### 第三步：选择图表库并生成

**默认使用 ECharts**（标准图表：柱状图、折线图、饼图、散点图），配置简单，交互丰富。

**使用 D3.js 的场景**（包裹在 ```html 代码块中输出完整 HTML 页面）：
- 高度自定义的视觉效果（自定义动画、特殊形状、艺术化表达）
- 力导向图、树图、打包图、弦图等关系类图表
- 地图类可视化
- 用户明确要求 D3 或高度定制时

## 设计规范（深色界面）
- 图表在深色界面中预览：D3 页面的 html/body 背景用 #0e0e11（不要写白色背景），文字用 #f0ece4，辅助文字用 #b0aca6
- ECharts option 不要写死 backgroundColor；标题文字用 #f0ece4，轴标签/图例用 #b0aca6，轴线和网格线用低透明度白色（如 rgba(228,224,216,0.15)）
- 数据系列使用柔和的低饱和度配色，字体清晰，标注简洁
- 配色参考：["#c9a86a", "#8fb5a8", "#a48a9e", "#7e9ab5", "#c78a6a", "#9db38a"]

## 输出格式
分析完成后，必须输出：
1. 简要的分析结论
2. 图表推荐的依据

**ECharts 输出**：
```echarts
{完整的 ECharts option JSON}
```

**D3.js 输出**（输出完整可独立运行的 HTML 页面，使用 D3 v3）：
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <script src="https://d3js.org/d3.v3.min.js"></script>
  <style>/* 简约风样式 */</style>
</head>
<body>
  <div id="chart"></div>
  <script>
  // ⚠️ D3 v3 重要规则：
  // 1. link 的 source/target 必须用节点数组的**数字索引**，不能直接写字符串 id
  //    正确做法：先用 nodeMap 将 id 转为索引
  //    var nodeMap = {};
  //    nodes.forEach(function(d,i) { nodeMap[d.id] = i; });
  //    links.forEach(function(d) { d.source = nodeMap[d.source]; d.target = nodeMap[d.target]; });
  // 2. 力导向图 API: d3.layout.force().nodes(nodes).links(links).size([w,h]).start()
  //    tick 事件中更新 link 和 node 的位置
  // 3. d3.select("#chart") 选取容器，append("svg") 创建画布
  </script>
</body>
</html>
```

如果数据不足以生成图表，只输出追问问题，不要编造数据。"""

# ═══════════════════════════════════════════
# 辅助函数
# ═══════════════════════════════════════════

def get_client(provider: str, api_key: str = None):
    """获取 AI 客户端"""
    cfg = PROVIDERS.get(provider)
    if not cfg:
        raise ValueError(f"不支持的 AI 平台: {provider}")

    key = api_key or SITE_API_KEYS.get(provider)
    if not key:
        raise ValueError(f"未配置 {cfg['name']} 的 API Key")

    if cfg['type'] == 'openai':
        return OpenAI(api_key=key, base_url=cfg['base_url']), cfg['default_model']
    elif cfg['type'] == 'gemini':
        return _GeminiClient(key), cfg['default_model']
    raise ValueError(f"未知的 provider 类型: {cfg['type']}")


class _GeminiClient:
    """Gemini API 简易封装（兼容 OpenAI chat.completions 接口）"""
    def __init__(self, api_key):
        self.api_key = api_key
        self.base = 'https://generativelanguage.googleapis.com/v1beta'

    @property
    def chat(self):
        return self

    @property
    def completions(self):
        return self

    def create(self, model, messages, **kwargs):
        import requests
        # 转换 OpenAI 消息格式到 Gemini 格式
        contents = []
        system_text = ""
        for msg in messages:
            if msg['role'] == 'system':
                system_text = msg['content']
            else:
                role = 'user' if msg['role'] == 'user' else 'model'
                contents.append({'role': role, 'parts': [{'text': msg['content']}]})

        body = {
            'contents': contents,
            'generationConfig': {
                'temperature': kwargs.get('temperature', 0.7),
                'maxOutputTokens': kwargs.get('max_tokens', 4096),
            }
        }
        if system_text:
            body['systemInstruction'] = {'parts': [{'text': system_text}]}

        resp = requests.post(
            f"{self.base}/models/{model}:generateContent?key={self.api_key}",
            json=body
        )
        resp.raise_for_status()
        data = resp.json()

        class Response:
            class Choice:
                class Message:
                    def __init__(self, content):
                        self.content = content
                def __init__(self, msg):
                    self.message = self.Message(msg)
            def __init__(self, text):
                self.choices = [self.Choice(text)]

        text = data['candidates'][0]['content']['parts'][0]['text']
        return Response(text)


def _try_parse_json(json_str: str) -> Optional[dict]:
    """尝试解析 JSON，失败时做简单修复后重试"""
    try:
        return json.loads(json_str)
    except json.JSONDecodeError:
        pass

    # 修复常见 AI 输出问题：尾随逗号
    import re as _re
    fixed = _re.sub(r',\s*([}\]])', r'\1', json_str)
    try:
        return json.loads(fixed)
    except json.JSONDecodeError:
        pass

    return None


def extract_chart_content(text: str) -> dict:
    """
    从 AI 回复中提取图表内容，支持 ECharts 和 D3。
    Returns: {'chart_type': 'echarts'|'d3'|None, 'option': dict|None, 'd3_html': str|None}
    """
    import re as _re

    result = {'chart_type': None, 'option': None, 'd3_html': None}

    # ── 1) 优先尝试 ```echarts ... ``` ECharts JSON ──
    for tag in ['echarts', 'json']:
        pattern = rf'```{tag}\s*\n(.*?)```'
        for m in _re.finditer(pattern, text, _re.DOTALL):
            candidate = m.group(1).strip()
            obj = _try_parse_json(candidate)
            if obj and isinstance(obj, dict):
                if tag == 'echarts':
                    result['chart_type'] = 'echarts'
                    result['option'] = obj
                    return result
                if 'series' in obj or any(k in obj for k in ('title', 'xAxis', 'yAxis', 'tooltip', 'legend')):
                    result['chart_type'] = 'echarts'
                    result['option'] = obj
                    return result

    # ── 2) 尝试 ```html ... ``` D3 HTML ──
    for tag in ['html', 'd3']:
        pattern = rf'```{tag}\s*\n(.*?)```'
        for m in _re.finditer(pattern, text, _re.DOTALL):
            candidate = m.group(1).strip()
            # 判断是否包含 D3 相关内容
            is_d3 = bool(_re.search(r'\bd3\b', candidate, _re.IGNORECASE))
            has_svg = '<svg' in candidate or 'createElementNS' in candidate
            has_chart_div = '<div' in candidate and ('chart' in candidate.lower() or 'viz' in candidate.lower())
            is_html_doc = candidate.startswith('<!DOCTYPE') or candidate.startswith('<html') or '<script' in candidate

            if is_d3 or has_svg or (is_html_doc and has_chart_div):
                result['chart_type'] = 'd3'
                # 如果是不完整的 HTML 片段，包装成完整页面
                if not candidate.startswith('<!DOCTYPE') and not candidate.startswith('<html'):
                    candidate = f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <script src="https://d3js.org/d3.v3.min.js"><\\/script>
  <style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    body {{ font-family: "PingFang SC", "Microsoft YaHei", sans-serif; }}
  </style>
</head>
<body>
{candidate}
</body>
</html>'''
                result['d3_html'] = candidate
                return result

    # ── 3) 兜底：全文搜 JSON 对象（ECharts） ──
    brace_pattern = r'\{[^{}]*"(?:title|series|xAxis|yAxis|tooltip)"[^{}]*\}'
    for m in _re.finditer(brace_pattern, text, _re.DOTALL):
        start = m.start()
        brace_start = text.rfind('{', 0, start + 1)
        if brace_start == -1:
            brace_start = start
        depth = 0
        end = brace_start
        for i in range(brace_start, len(text)):
            if text[i] == '{':
                depth += 1
            elif text[i] == '}':
                depth -= 1
                if depth == 0:
                    end = i + 1
                    break
        if end > brace_start:
            obj = _try_parse_json(text[brace_start:end])
            if obj and isinstance(obj, dict) and 'series' in obj:
                result['chart_type'] = 'echarts'
                result['option'] = obj
                return result

    return result


# ═══════════════════════════════════════════
# API 路由
# ═══════════════════════════════════════════

@app.route('/api/providers', methods=['GET'])
def list_providers():
    """列出可用 AI 平台"""
    result = []
    for key, cfg in PROVIDERS.items():
        result.append({
            'key': key,
            'name': cfg['name'],
            'has_site_key': key in SITE_API_KEYS,
        })
    return jsonify({'providers': result})


@app.route('/api/chat', methods=['POST'])
def chat():
    """AI 聊天接口 — 支持单文件(file_content)和多文件(file_contents)"""
    data = request.get_json()
    if not data:
        return jsonify({'error': '请求体不能为空'}), 400

    message = data.get('message', '').strip()
    provider = data.get('provider', 'deepseek')
    user_api_key = data.get('api_key', '')
    conversation_history = data.get('history', [])

    # 兼容两种格式：单文件 file_content (str) 和多文件 file_contents (list)
    file_content = data.get('file_content', '')       # 旧版单文件
    file_contents = data.get('file_contents', [])      # 新版多文件 [{name, content}, ...]

    if not message and not file_content and not file_contents:
        return jsonify({'error': '消息不能为空'}), 400

    # ── 组装数据块 ──
    data_blocks = []

    # 新版多文件
    for f in file_contents:
        if not isinstance(f, dict):
            continue
        fname = f.get('name', 'unknown')
        fdata = f.get('content', '')
        if not fdata:
            continue
        # JSON → 表格转换
        processed = fdata
        fmt = detect_data_format(fdata)
        if fmt == 'json':
            try:
                json_obj = json.loads(fdata.strip())
                table = json_to_text_table(json_obj)
                if table and table != fdata.strip():
                    processed = table
                    print(f'[data_parser] {fname}: JSON → 表格 ({len(table.splitlines())} 行)')
            except Exception:
                pass
        data_blocks.append(f'[文件：{fname}]\n{processed}')

    # 旧版单文件（向后兼容）
    if file_content and not file_contents:
        processed = file_content
        fmt = detect_data_format(file_content)
        if fmt == 'json':
            try:
                json_obj = json.loads(file_content.strip())
                table = json_to_text_table(json_obj)
                if table and table != file_content.strip():
                    processed = table
                    print(f'[data_parser] JSON → 表格 ({len(table.splitlines())} 行)')
            except Exception:
                pass
        data_blocks.append(f'[用户上传的数据]\n{processed}')

    # 构建消息
    user_message = message
    if data_blocks:
        data_section = '\n\n---\n\n'.join(data_blocks)
        hint = f'（共{len(data_blocks)}个数据源）' if len(data_blocks) > 1 else ''
        user_message = message + f'\n\n{hint}\n{data_section}' if message else f'请分析以下数据{hint}：\n\n{data_section}'

    messages = [{'role': 'system', 'content': SYSTEM_PROMPT}]
    for h in conversation_history[-20:]:  # 保留最近 20 条
        messages.append({'role': h.get('role', 'user'), 'content': h.get('content', '')})
    messages.append({'role': 'user', 'content': user_message})

    try:
        client, model = get_client(provider, user_api_key or None)
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.7,
            max_tokens=4096,
        )
        reply = response.choices[0].message.content

        # 提取图表内容（ECharts option / D3 HTML）
        chart = extract_chart_content(reply)

        return jsonify({
            'reply': reply,
            'chart_type': chart['chart_type'],
            'option': chart['option'],
            'd3_html': chart['d3_html'],
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/generate-html', methods=['POST'])
def generate_html():
    """根据 ECharts option 生成完整 HTML 文件"""
    data = request.get_json()
    if not data or 'option' not in data:
        return jsonify({'error': '缺少 option 参数'}), 400

    option = data['option']
    title = data.get('title', '图表')
    html = build_chart_html(option, title)

    return jsonify({'html': html})


@app.route('/api/download-html', methods=['POST'])
def download_html():
    """生成并下载 HTML 文件"""
    data = request.get_json()
    if not data or 'option' not in data:
        return jsonify({'error': '缺少 option 参数'}), 400

    option = data['option']
    title = data.get('title', '图表')

    html = build_chart_html(option, title)
    html_bytes = ('﻿' + html).encode('utf-8')

    safe_name = re.sub(r'[<>:"/\\|?*]', '_', title)
    return send_file(
        BytesIO(html_bytes),
        mimetype='text/html;charset=UTF-8',
        as_attachment=True,
        download_name=f'{safe_name}.html',
    )


@app.route('/api/parse-file', methods=['POST'])
def parse_file():
    """解析上传的文件（txt/csv/xlsx/json）"""
    if 'file' not in request.files:
        return jsonify({'error': '未上传文件'}), 400

    file = request.files['file']
    filename = file.filename.lower() if file.filename else ''

    try:
        if filename.endswith(('.xlsx', '.xls')):
            wb = load_workbook(file, read_only=True)
            ws = wb.active
            rows = []
            for row in ws.iter_rows(values_only=True):
                rows.append('\t'.join(str(c) if c is not None else '' for c in row))
            content = '\n'.join(rows)
            parsed = parse_excel_data(rows)
        elif filename.endswith('.json'):
            content = file.read().decode('utf-8')
            json_obj = json.loads(content)
            # 转为表格文本 + 结构化解析
            text_table = json_to_text_table(json_obj)
            parsed = parse_json_data(json_obj)
            content = text_table  # 返回表格文本便于前端展示
        else:
            content = file.read().decode('utf-8')
            parsed = parse_text_data(content)

        return jsonify({
            'content': content,
            'parsed': parsed,
        })
    except Exception as e:
        return jsonify({'error': f'文件解析失败: {str(e)}'}), 400


@app.route('/api/parse-json', methods=['POST'])
def parse_json():
    """解析 JSON 数据并返回结构化列数据"""
    data = request.get_json()
    if not data:
        return jsonify({'error': '请求体不能为空'}), 400

    json_content = data.get('content', '')
    if not json_content:
        return jsonify({'error': '缺少 content 参数'}), 400

    # 如果 content 是字符串，先解析为 JSON 对象
    if isinstance(json_content, str):
        try:
            json_obj = json.loads(json_content)
        except json.JSONDecodeError as e:
            return jsonify({'error': f'JSON 格式无效: {str(e)}'}), 400
    else:
        json_obj = json_content

    try:
        parsed = parse_json_data(json_obj)
        text_table = json_to_text_table(json_obj)

        return jsonify({
            'parsed': parsed,
            'text_table': text_table,
        })
    except Exception as e:
        return jsonify({'error': f'解析失败: {str(e)}'}), 400


@app.route('/api/recommend-chart', methods=['POST'])
def recommend_chart():
    """根据数据推荐图表类型"""
    data = request.get_json()
    if not data or 'columns' not in data:
        return jsonify({'error': '缺少 columns 参数'}), 400

    recommendation = recommend_chart_type(data['columns'])
    return jsonify(recommendation)


# ═══════════════════════════════════════════
# 启动
# ═══════════════════════════════════════════

if __name__ == '__main__':
    print("图表生成后端启动中...")
    print(f"已配置站点 API: {list(SITE_API_KEYS.keys())}")
    print("访问 http://localhost:5000")
    app.run(debug=True, port=5000)
