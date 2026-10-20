# AI 周报告 · 归档说明

每周一份的 AI 报告归档页。页面只做三件事：读清单、取正文、渲染。

- 页面：`ai_report/ai_report.html`
- 清单：`ai_report/manifest.json`（由脚本生成，不要手改）
- 报告：`ai_report/reports/<期号>/`

## 新增一期

1. 在 `reports/` 下新建文件夹，名字就是期号（推荐 ISO 周：`2026-W44`；同一周多份可写 `2026-W44-补充`）。
2. 放入 `report.md`（或 `report.html`），图片放同目录的 `assets/`。
3. 运行：

   ```bash
   cd ai_report
   python build_manifest.py
   ```

4. 刷新页面。清单里多了这一期，索引会自动分组、排序。

> 静态站列不出目录，所以第 3 步不能省：页面只认 `manifest.json`。
> 上线时把 `reports/`、`manifest.json` 一起提交即可（本仓库根目录的 `.nojekyll` 保证 `.md` 不会被 Jekyll 转成 HTML）。

## 目录契约

```
ai_report/
  ai_report.html
  ai_report.css
  ai_report.js
  build_manifest.py
  manifest.json
  reports/
    2026-W43/
      report.md          ← 正文（二选一）
      report.html        ← 或 HTML 报告
      assets/
        week-bars.svg    ← 正文里用相对路径引用
```

`report.md` 与 `report.html` 都存在时，优先用 `report.md`。都没有时，取目录里第一个 `.md`，再退到第一个 `.html`。

## front-matter（可选）

写在 `report.md` 开头，`key: value` 单行即可：

```markdown
---
title: 第 43 周：把周报装订成册
summary: 一句话摘要，显示在标题下方，也会用作索引的说明。
date: 2026-10-19
model: ecnu-max
---
```

| 字段 | 说明 | 缺省行为 |
| --- | --- | --- |
| `title` | 期标题 | 取正文第一个 `# H1`，再退到文件夹名 |
| `summary` | 摘要 | 取正文第一段，截到 120 字 |
| `date` | 日期（`YYYY-MM-DD`） | 文件修改日期 |
| `model` | 生成模型，显示在页头信息条 | 不显示 |
| `updated` | 更新时间 | 文件修改日期 |
| `week` | 期号（一般不用写） | 从文件夹名推断 |

正文里如果第一个 `# H1` 与 `title` 完全相同，页面会自动去掉它，避免标题重复。

## 支持的格式

- **Markdown**：GFM（表格、任务列表、删除线、代码块）。链接与图片支持相对路径。
- **HTML**：以 iframe 嵌入正文区域，独立滚动；不参与目录与深链。
- **图片**：`![说明](assets/xxx.png)`；点击图片可放大，`说明` 会成为图注。

页面用 marked + DOMPurify 在浏览器端渲染，脚本与库都在本地（`vendor/`），断网也能打开。HTML 报告里的 `<script>` 会被消毒掉；需要交互脚本时请用 `report.html`（iframe 内正常执行）。

## 清单字段

`build_manifest.py` 生成的结构：

```json
{
  "version": 1,
  "generated": "2026-10-19T20:10:55+08:00",
  "count": 1,
  "reports": [
    {
      "id": "2026-W43",
      "type": "md",
      "path": "reports/2026-W43/report.md",
      "title": "第 43 周：把周报装订成册",
      "summary": "……",
      "date": "2026-10-19",
      "week": "2026-W43",
      "weekStart": "2026-10-19",
      "weekEnd": "2026-10-25",
      "model": "ecnu-max",
      "updated": "2026-10-19T20:09:48+08:00",
      "words": 618,
      "images": 2,
      "bytes": 2757
    }
  ]
}
```

- 排序：按 `weekStart`（没有则 `date`）倒序，同一周按 `id` 倒序。
- `weekStart` / `weekEnd` 只对 `YYYY-Www` 形式的期号计算（ISO 周，周一到周日）。
- 非 ISO 周的期号（如 `2026-10-19-临时`）也能用，只是没有周范围，按日期排序。

## 页面能力

- 左侧索引按年份分组；`#2026-W43` 这样的深链可以直接打开某一期，浏览器前进/后退可用。
- 右侧自动目录（宽屏 ≥1200px 显示），滚动时高亮当前小节。
- 页头显示日期、模型、字数、图片数；文末可翻上一期 / 下一期。
- 浅色（档案纸）与深色（夜读档案馆）跟随全站主题开关。
- 空档案、清单缺失、单篇读取失败都有对应提示。

## 检查清单是否过期

```bash
python build_manifest.py --check
```

有新增 / 删除 / 改名的报告而清单没更新时，退出码为 1。
