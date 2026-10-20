#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_manifest.py — 扫描 ai_report/reports/ 生成 manifest.json

用法：
    python build_manifest.py           # 重新生成清单
    python build_manifest.py --check   # 检查清单是否过期（过期 exit 1）

契约（详见 README.md）：
    reports/
      <期号>/
        report.md        ← 正文（可选 YAML front-matter）
        report.html      ← 或 HTML 报告（二选一）
        assets/…         ← 正文引用的图片，相对路径 assets/xxx.png

只用标准库，不依赖第三方包。
"""

import argparse
import json
import re
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPORTS_DIR = ROOT / "reports"
MANIFEST_PATH = ROOT / "manifest.json"
TZ = timezone(timedelta(hours=8))
WEEK_RE = re.compile(r"^(\d{4})-W(\d{1,2})(?:[-_].+)?$", re.IGNORECASE)

FRONT_MATTER_KEYS = (
    "title", "summary", "date", "model", "updated", "week", "type", "tags",
)


def parse_front_matter(text: str):
    """解析开头 --- ... --- 之间的简单 key: value（不做嵌套 / 列表）。"""
    meta = {}
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return meta, text
    end = None
    for i in range(1, len(lines)):
        if lines[i].strip() in ("---", "..."):
            end = i
            break
    if end is None:
        return meta, text
    for raw in lines[1:end]:
        line = raw.strip()
        if not line or line.startswith("#") or ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = key.strip().lower()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        if key in FRONT_MATTER_KEYS:
            meta[key] = value
    body = "\n".join(lines[end + 1:]).lstrip("\n")
    return meta, body


def strip_markdown(text: str) -> str:
    text = re.sub(r"```.*?```", " ", text, flags=re.S)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", text)
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"[#>*_`~\-|]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def strip_html(text: str) -> str:
    text = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", text, flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def count_words(text: str) -> int:
    cjk = len(re.findall(r"[\u3400-\u4dbf\u4e00-\u9fff]", text))
    latin = len(re.findall(r"[A-Za-z0-9_]+", text))
    return cjk + latin


def first_h1(text: str) -> str:
    for line in text.splitlines():
        m = re.match(r"^#\s+(.+?)\s*$", line)
        if m:
            return m.group(1).strip()
    return ""


def first_paragraph(text: str) -> str:
    for block in re.split(r"\n\s*\n", text):
        b = block.strip()
        if not b or b.startswith(("#", "```", "|", ">", "-", "*", "!")):
            continue
        return strip_markdown(b)
    return ""


def iso_week_range(year: int, week: int):
    try:
        start = date.fromisocalendar(year, week, 1)
    except ValueError:
        return None, None
    return start, start + timedelta(days=6)


def pick_source(folder: Path):
    for name, kind in (("report.md", "md"), ("report.html", "html")):
        p = folder / name
        if p.is_file():
            return p, kind
    mds = sorted(folder.glob("*.md"))
    if mds:
        return mds[0], "md"
    htmls = sorted(folder.glob("*.html"))
    if htmls:
        return htmls[0], "html"
    return None, None


def describe_html(text: str):
    title = ""
    summary = ""
    m = re.search(r"<title[^>]*>(.*?)</title>", text, flags=re.S | re.I)
    if m:
        title = re.sub(r"\s+", " ", m.group(1)).strip()
    m = re.search(
        r"<meta[^>]+name=[\"']description[\"'][^>]+content=[\"'](.*?)[\"']",
        text, flags=re.S | re.I,
    )
    if m:
        summary = m.group(1).strip()
    return title, summary


def collect():
    entries = []
    if not REPORTS_DIR.is_dir():
        return entries
    for folder in sorted(REPORTS_DIR.iterdir()):
        if not folder.is_dir() or folder.name.startswith((".", "_")):
            continue
        source, kind = pick_source(folder)
        if source is None:
            print(f"  ! {folder.name}: 没有 report.md / report.html，已跳过")
            continue

        raw = source.read_text(encoding="utf-8", errors="replace")
        meta = {}
        body_text = raw
        if kind == "md":
            meta, body = parse_front_matter(raw)
            body_text = strip_markdown(body)
            title = meta.get("title") or first_h1(body) or folder.name
            summary = meta.get("summary") or first_paragraph(body)
        else:
            title, html_summary = describe_html(raw)
            body_text = strip_html(raw)
            title = title or folder.name
            summary = html_summary
        if len(summary) > 120:
            summary = summary[:120].rstrip() + "…"

        mtime = datetime.fromtimestamp(source.stat().st_mtime, TZ)
        stat = source.stat()
        updated = meta.get("updated") or mtime.isoformat(timespec="seconds")

        doc_date = meta.get("date", "").strip()
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", doc_date):
            doc_date = mtime.date().isoformat()

        week_label = ""
        week_start = week_end = ""
        m = WEEK_RE.match(folder.name)
        if m:
            year, week = int(m.group(1)), int(m.group(2))
            start, end = iso_week_range(year, week)
            if start and end:
                week_label = f"{year}-W{week:02d}"
                week_start = start.isoformat()
                week_end = end.isoformat()

        images = (
            len(re.findall(r"!\[[^\]]*\]\(", raw))
            if kind == "md"
            else len(re.findall(r"<img\b", raw, flags=re.I))
        )

        entries.append({
            "id": folder.name,
            "type": kind,
            "path": source.relative_to(ROOT).as_posix(),
            "title": title,
            "summary": summary,
            "date": doc_date,
            "week": week_label,
            "weekStart": week_start,
            "weekEnd": week_end,
            "model": meta.get("model", ""),
            "updated": updated,
            "words": count_words(body_text),
            "images": images,
            "bytes": stat.st_size,
        })

    entries.sort(key=lambda e: (e.get("weekStart") or e.get("date") or "", e["id"]), reverse=True)
    return entries


def build_manifest():
    entries = collect()
    return {
        "version": 1,
        "generated": datetime.now(TZ).isoformat(timespec="seconds"),
        "count": len(entries),
        "reports": entries,
    }


def main():
    parser = argparse.ArgumentParser(description="扫描 reports/ 生成 manifest.json")
    parser.add_argument("--check", action="store_true", help="只检查清单是否过期")
    args = parser.parse_args()

    manifest = build_manifest()
    if args.check:
        if not MANIFEST_PATH.exists():
            print("manifest.json 不存在，请先运行 python build_manifest.py")
            return 1
        try:
            old = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            print("manifest.json 不是合法 JSON")
            return 1
        if old.get("reports") != manifest["reports"]:
            print("manifest.json 已过期，请重新运行 python build_manifest.py")
            return 1
        print(f"manifest.json 是最新的（{manifest['count']} 期）")
        return 0

    MANIFEST_PATH.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"已写入 {MANIFEST_PATH.name}：{manifest['count']} 期")
    for e in manifest["reports"]:
        flag = "" if e["week"] else "  (期号不是 ISO 周格式)"
        print(f"  - {e['id']:<18} {e['type']:<4} {e['title'][:36]}{flag}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
